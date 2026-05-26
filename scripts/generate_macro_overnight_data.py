#!/usr/bin/env python3
"""
SPX OVERNIGHT — MACRO STUDY
============================
Tests whether adding macro indicators (bonds, rates) as entry filters
can improve the vanilla overnight strategy.

Key finding from research:
  - "SPX > SMA50 OR IEF > SMA20" beats vanilla in every metric
  - It catches trades during bear pullbacks when bonds are still healthy
  - Avoids trading when BOTH stocks and bonds are in downtrends

Configs tested:
  1. Vanilla (score >= 3, no filter)
  2. SPX > SMA(50) only
  3. SPX > SMA(50) OR IEF > SMA(20)
  4. SPX > SMA(50) OR TLT > SMA(20)
  5. Vanilla + avoid yields rising fast (10Y 5d < -0.5%)
"""

import pandas as pd, numpy as np, json
from pathlib import Path
from backtest_execution import (
    gap_stop_fill_long,
    calc_pnl_with_costs,
    apply_portfolio_constraints,
)

DATA_DIR = Path("/workspaces/jas/data")
OUT = Path("/workspaces/jas/dashboard/public/macro_overnight_data.json")
RISK = 100.0
RISK_ATR_MULT = 0.5
MIN_SCORE = 3
RSI_SHORT_LEN = 5
RSI_LONG_LEN = 14
VIX_SMA_LEN = 20
SPY_SMA50_LEN = 50
SPY_SMA200_LEN = 200
VOL_SMA_LEN = 20

# Execution-cost controls (configurable)
SLIPPAGE_BPS = 0.0
COMMISSION_PER_SHARE = 0.0
MIN_COMMISSION_PER_ORDER = 0.0

# Portfolio-level constraints (configurable)
PORTFOLIO_START_EQUITY = 100000.0
PORTFOLIO_MAX_POSITIONS = 5
PORTFOLIO_MAX_RISK_PCT = 0.02
PORTFOLIO_MAX_GROSS_EXPOSURE_PCT = 1.5


def load(fp):
    df = pd.read_csv(fp)
    df['Date'] = pd.to_datetime(df['Date'])
    df = df.sort_values('Date').reset_index(drop=True)
    for c in ['Open', 'High', 'Low', 'Close', 'Volume']:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors='coerce')
    return df.dropna(subset=['Close'])


def compute_rsi(series, length):
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1/length, min_periods=length, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/length, min_periods=length, adjust=False).mean()
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def count_consecutive(series, direction='down'):
    counts = pd.Series(0, index=series.index)
    for i in range(1, len(series)):
        if direction == 'down':
            if series.iloc[i] < series.iloc[i-1]:
                counts.iloc[i] = counts.iloc[i-1] + 1
            else:
                counts.iloc[i] = 0
        else:
            if series.iloc[i] > series.iloc[i-1]:
                counts.iloc[i] = counts.iloc[i-1] + 1
            else:
                counts.iloc[i] = 0
    return counts


def compute_score(spy_row, vix_close, vix_sma20, vix_change, consec_dn, consec_up):
    score = 0
    reasons = []
    # Strong bullish
    if not pd.isna(vix_change) and vix_change > 0.12:
        score += 2; reasons.append('VIX_panic(+2)')
    if not pd.isna(spy_row['rsi5']) and spy_row['rsi5'] < 20:
        score += 2; reasons.append('RSI5<20(+2)')
    if (not pd.isna(spy_row['daily_ret']) and spy_row['daily_ret'] < -0.02
            and not pd.isna(spy_row['sma200']) and spy_row['Close'] > spy_row['sma200']):
        score += 2; reasons.append('crash_dip(+2)')
    # Standard bullish
    if not pd.isna(vix_sma20) and vix_close > vix_sma20:
        score += 1; reasons.append('VIX>SMA20')
    if not pd.isna(spy_row['rsi5']) and 20 <= spy_row['rsi5'] < 35:
        score += 1; reasons.append('RSI5<35')
    if consec_dn >= 3:
        score += 1; reasons.append(f'{consec_dn}dn_days')
    if spy_row['range_pos'] < 0.20:
        score += 1; reasons.append('close_near_low')
    if (not pd.isna(spy_row['daily_ret']) and -0.02 <= spy_row['daily_ret'] < -0.01
            and not pd.isna(spy_row['sma200']) and spy_row['Close'] > spy_row['sma200']):
        score += 1; reasons.append('dip_in_uptrend')
    if vix_close > 25:
        score += 1; reasons.append('VIX>25')
    if not pd.isna(spy_row['sma200']) and spy_row['Close'] > spy_row['sma200']:
        score += 1; reasons.append('above_SMA200')
    # Strong bearish
    if not pd.isna(spy_row['rsi5']) and spy_row['rsi5'] > 90:
        score -= 2
    if not pd.isna(spy_row['daily_ret']) and spy_row['daily_ret'] > 0.03:
        score -= 2
    if not pd.isna(vix_change) and vix_change < -0.20:
        score -= 2
    # Standard bearish
    if not pd.isna(vix_sma20) and vix_close < vix_sma20 * 0.85:
        score -= 1
    if not pd.isna(spy_row['rsi5']) and 75 <= spy_row['rsi5'] < 90:
        score -= 1
    if consec_up >= 4 and not pd.isna(spy_row['rsi14']) and spy_row['rsi14'] > 65:
        score -= 1
    if not pd.isna(spy_row['sma200']) and spy_row['Close'] < spy_row['sma200']:
        score -= 1
    if not pd.isna(vix_change) and -0.20 <= vix_change < -0.10:
        score -= 1
    if not pd.isna(spy_row['daily_ret']) and 0.015 < spy_row['daily_ret'] <= 0.03:
        score -= 1
    if (spy_row['range_pos'] > 0.85
            and not pd.isna(spy_row['vol_sma'])
            and spy_row['vol_sma'] > 0
            and spy_row['Volume'] > 1.5 * spy_row['vol_sma']):
        score -= 1
    return score, reasons


def compute_stats(trades):
    if not trades:
        return None
    n = len(trades)
    wins = [t for t in trades if t['pnlDollar'] > 0]
    losses = [t for t in trades if t['pnlDollar'] <= 0]
    pnl = sum(t['pnlDollar'] for t in trades)
    wr = len(wins) / n * 100
    gp = sum(t['pnlDollar'] for t in wins)
    gl = abs(sum(t['pnlDollar'] for t in losses))
    pf = gp / gl if gl > 0 else 99.99
    avg_r = sum(t['pnlR'] for t in trades) / n
    eq = 0; peak = 0; maxdd = 0
    for t in trades:
        eq += t['pnlDollar']
        peak = max(peak, eq)
        maxdd = max(maxdd, peak - eq)
    rtd = round(pnl / maxdd, 1) if maxdd > 0 else 99.9
    return {
        'trades': n,
        'winRate': round(wr, 1),
        'profitFactor': round(pf, 2),
        'totalPnl': round(pnl, 0),
        'maxDrawdown': round(maxdd, 0),
        'avgR': round(avg_r, 3),
        'returnToDD': rtd,
    }


def main():
    print("Loading data...")
    spx = load(DATA_DIR / "SPX_daily_data_right - Sheet1.csv")
    vix = load(DATA_DIR / "VIX_daily_data_right - Sheet1.csv")
    tlt = load(DATA_DIR / "TLT_daily_data - Sheet1.csv")
    ief = load(DATA_DIR / "IEF_daily_data - Sheet1.csv")
    ust = load(DATA_DIR / "USTTENT_daily_data - Sheet1.csv")

    print(f"  SPX: {len(spx)} bars ({spx['Date'].min().date()} to {spx['Date'].max().date()})")
    print(f"  TLT: {len(tlt)} bars, IEF: {len(ief)} bars, UST10Y: {len(ust)} bars")

    # Prepare SPX
    spx['sma50'] = spx['Close'].rolling(SPY_SMA50_LEN).mean()
    spx['sma200'] = spx['Close'].rolling(SPY_SMA200_LEN).mean()
    tr = np.maximum(spx['High'] - spx['Low'],
        np.maximum(abs(spx['High'] - spx['Close'].shift(1)),
                   abs(spx['Low'] - spx['Close'].shift(1))))
    spx['atr'] = tr.rolling(14).mean()
    spx['rsi5'] = compute_rsi(spx['Close'], RSI_SHORT_LEN)
    spx['rsi14'] = compute_rsi(spx['Close'], RSI_LONG_LEN)
    spx['daily_ret'] = spx['Close'].pct_change()
    rng = spx['High'] - spx['Low']
    spx['range_pos'] = np.where(rng > 0, (spx['Close'] - spx['Low']) / rng, 0.5)
    spx['vol_sma'] = spx['Volume'].rolling(VOL_SMA_LEN).mean()
    spx['date_only'] = spx['Date'].dt.date

    # Prepare VIX
    vix['vix_sma20'] = vix['Close'].rolling(VIX_SMA_LEN).mean()
    vix['vix_change'] = vix['Close'].pct_change()
    vix['date_only'] = vix['Date'].dt.date

    # Prepare bonds
    tlt['tlt_sma20'] = tlt['Close'].rolling(20).mean()
    tlt['date_only'] = tlt['Date'].dt.date

    ief['ief_sma20'] = ief['Close'].rolling(20).mean()
    ief['date_only'] = ief['Date'].dt.date

    ust['ust_ret5'] = ust['Close'].pct_change(5) * 100
    ust['date_only'] = ust['Date'].dt.date

    # Merge all
    m = spx.merge(vix[['date_only', 'Close', 'vix_sma20', 'vix_change']].rename(columns={'Close': 'vix_close'}),
                  on='date_only', how='inner')
    m = m.merge(tlt[['date_only', 'Close', 'tlt_sma20']].rename(columns={'Close': 'tlt_close'}),
                on='date_only', how='inner')
    m = m.merge(ief[['date_only', 'Close', 'ief_sma20']].rename(columns={'Close': 'ief_close'}),
                on='date_only', how='inner')
    m = m.merge(ust[['date_only', 'ust_ret5']], on='date_only', how='inner')
    m = m.sort_values('Date').reset_index(drop=True)

    consec_dn = count_consecutive(m['Close'], 'down')
    consec_up = count_consecutive(m['Close'], 'up')

    print(f"  Merged: {len(m)} bars")

    # ══════════════════════════════════════════════════════════
    # Generate all signal trades
    # ══════════════════════════════════════════════════════════
    all_trades = []
    for i in range(SPY_SMA200_LEN, len(m) - 1):
        row = m.iloc[i]
        if pd.isna(row['atr']) or row['atr'] <= 0 or pd.isna(row['rsi5']):
            continue
        if pd.isna(row['vix_sma20']):
            continue

        score, reasons = compute_score(row, row['vix_close'], row['vix_sma20'],
                                       row['vix_change'], int(consec_dn.iloc[i]), int(consec_up.iloc[i]))

        if score < MIN_SCORE:
            continue

        entry_price = row['Close']
        next_row = m.iloc[i + 1]

        risk_dist = RISK_ATR_MULT * row['atr']
        if risk_dist <= 0:
            continue
        qty = max(1, round(RISK / risk_dist))

        sl = entry_price - risk_dist
        if next_row['Low'] <= sl:
            exit_price = gap_stop_fill_long(next_row['Open'], sl)
            exit_reason = 'SL'
        else:
            exit_price = next_row['Close']
            exit_reason = 'Close'

        pnl = calc_pnl_with_costs(
            direction='LONG',
            entry_price=entry_price,
            exit_price=exit_price,
            qty=qty,
            slippage_bps=SLIPPAGE_BPS,
            commission_per_share=COMMISSION_PER_SHARE,
            min_commission_per_order=MIN_COMMISSION_PER_ORDER,
        )
        pnl_dollar = pnl['netPnl']
        pnl_r = pnl_dollar / RISK

        # Macro conditions for this trade
        spx_above_sma50 = bool(row['Close'] > row['sma50']) if not pd.isna(row['sma50']) else False
        tlt_above_sma20 = bool(row['tlt_close'] > row['tlt_sma20']) if not pd.isna(row['tlt_sma20']) else False
        ief_above_sma20 = bool(row['ief_close'] > row['ief_sma20']) if not pd.isna(row['ief_sma20']) else False
        ust_5d = row['ust_ret5'] if not pd.isna(row['ust_ret5']) else 0

        all_trades.append({
            'entryDate': row['Date'].strftime('%Y-%m-%d'),
            'exitDate': next_row['Date'].strftime('%Y-%m-%d'),
            'entryPrice': round(entry_price, 2),
            'exitPrice': round(exit_price, 2),
            'sl': round(sl, 2),
            'risk': round(risk_dist, 2),
            'qty': qty,
            'pnlDollar': round(pnl_dollar, 2),
            'grossPnlDollar': round(pnl['grossPnl'], 2),
            'costsDollar': round(pnl['costs'], 2),
            'entryFill': round(pnl['entryFill'], 4),
            'exitFill': round(pnl['exitFill'], 4),
            'pnlR': round(pnl_r, 2),
            'exitReason': exit_reason,
            'score': score,
            'reasons': reasons,
            'spx_above_sma50': spx_above_sma50,
            'tlt_above_sma20': tlt_above_sma20,
            'ief_above_sma20': ief_above_sma20,
            'ust_5d': round(ust_5d, 2),
        })

    print(f"\n  Total signal trades (score >= {MIN_SCORE}): {len(all_trades)}")

    # ══════════════════════════════════════════════════════════
    # Apply filters — build configs
    # ══════════════════════════════════════════════════════════
    configs = {}

    # 1. Vanilla (no filter)
    configs['vanilla'] = {
        'name': 'Vanilla (score ≥ 3, no filter)',
        'key': 'vanilla',
        'rule': 'Entry when signal score ≥ 3. No macro filter.',
        'trades': all_trades,
    }

    # 2. SPX > SMA50 only
    f_sma50 = [t for t in all_trades if t['spx_above_sma50']]
    configs['sma50'] = {
        'name': 'SPX > SMA(50)',
        'key': 'sma50',
        'rule': 'Only trade when SPX is above its 50-day moving average.',
        'trades': f_sma50,
    }

    # 3. SPX > SMA50 OR IEF > SMA20 (WINNER)
    f_or_ief = [t for t in all_trades if t['spx_above_sma50'] or t['ief_above_sma20']]
    configs['or_ief'] = {
        'name': 'SPX > SMA(50) OR IEF > SMA(20)',
        'key': 'or_ief',
        'rule': 'Trade when EITHER stocks are trending up OR intermediate bonds are healthy.',
        'trades': f_or_ief,
    }

    # 4. SPX > SMA50 OR TLT > SMA20
    f_or_tlt = [t for t in all_trades if t['spx_above_sma50'] or t['tlt_above_sma20']]
    configs['or_tlt'] = {
        'name': 'SPX > SMA(50) OR TLT > SMA(20)',
        'key': 'or_tlt',
        'rule': 'Trade when EITHER stocks are trending up OR long-term bonds are healthy.',
        'trades': f_or_tlt,
    }

    # 5. Avoid yields rising fast
    f_no_yield = [t for t in all_trades if t['ust_5d'] > -0.5]
    configs['no_yield_spike'] = {
        'name': 'Avoid yields rising fast',
        'key': 'no_yield_spike',
        'rule': 'Skip trades when 10Y total return dropped > 0.5% in 5 days (yields spiking).',
        'trades': f_no_yield,
    }

    # ══════════════════════════════════════════════════════════
    # Compute stats and print comparison
    # ══════════════════════════════════════════════════════════
    print(f"\n{'='*95}")
    print("MACRO OVERNIGHT STUDY — ENTRY FILTER COMPARISON")
    print(f"{'='*95}")
    print(f"\n{'Config':<40} {'N':<5} {'WR%':<7} {'PF':<6} {'P&L':<10} {'MaxDD':<9} {'AvgR':<7} {'P&L/DD':<7}")
    print(f"{'-'*95}")

    output_configs = []
    for key, cfg in configs.items():
        constrained_trades, portfolio_meta = apply_portfolio_constraints(
            cfg['trades'],
            max_positions=PORTFOLIO_MAX_POSITIONS,
            max_risk_pct=PORTFOLIO_MAX_RISK_PCT,
            max_gross_exposure_pct=PORTFOLIO_MAX_GROSS_EXPOSURE_PCT,
            starting_equity=PORTFOLIO_START_EQUITY,
        )
        s = compute_stats(constrained_trades)
        cfg['stats'] = s
        print(f"{cfg['name']:<40} {s['trades']:<5} {s['winRate']:<7.1f} {s['profitFactor']:<6.2f} ${s['totalPnl']:>7,.0f}  ${s['maxDrawdown']:>6,.0f}  {s['avgR']:<7.3f} {s['returnToDD']:.1f}x")

        output_configs.append({
            'name': cfg['name'],
            'key': cfg['key'],
            'rule': cfg['rule'],
            'stats': s,
            'portfolioMeta': portfolio_meta,
            'trades': sorted(constrained_trades, key=lambda t: t['entryDate']),
        })

    # SPX prices for chart overlay
    spx_prices = []
    for _, row in m.iterrows():
        if not pd.isna(row['sma50']):
            spx_prices.append({
                'date': row['Date'].strftime('%Y-%m-%d'),
                'close': round(row['Close'], 2),
            })

    # IEF prices for reference
    ief_prices = []
    for _, row in ief.iterrows():
        if not pd.isna(row['ief_sma20']):
            ief_prices.append({
                'date': row['Date'].strftime('%Y-%m-%d'),
                'close': round(row['Close'], 2),
                'sma20': round(row['ief_sma20'], 2),
            })

    # ══════════════════════════════════════════════════════════
    # Output JSON
    # ══════════════════════════════════════════════════════════
    output = {
        'configs': output_configs,
        'spxPrices': spx_prices,
        'iefPrices': ief_prices,
        'settings': {
            'slippageBps': SLIPPAGE_BPS,
            'commissionPerShare': COMMISSION_PER_SHARE,
            'minCommissionPerOrder': MIN_COMMISSION_PER_ORDER,
            'portfolioStartEquity': PORTFOLIO_START_EQUITY,
            'portfolioMaxPositions': PORTFOLIO_MAX_POSITIONS,
            'portfolioMaxRiskPct': PORTFOLIO_MAX_RISK_PCT,
            'portfolioMaxGrossExposurePct': PORTFOLIO_MAX_GROSS_EXPOSURE_PCT,
        },
    }

    with open(OUT, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"\n\nSaved to {OUT}")
    print(f"  {len(output_configs)} configs with trade lists")


if __name__ == '__main__':
    main()
