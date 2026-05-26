#!/usr/bin/env python3
"""Generate Mean Reversion backtest JSON for the React dashboard.
Entry: RSI(14) drops below 30 (oversold) while price is above SMA50 (uptrend) → buy the dip.
Stop: 1.5× ATR (wider stop — mean reversion needs room to breathe).
Exit: EMA20 trailing stop at 2.5R. Long only."""
import pandas as pd, numpy as np, json
from pathlib import Path
from backtest_execution import (
    gap_stop_fill_long,
    calc_pnl_with_costs,
    apply_portfolio_constraints,
)

DATA_DIR = Path("/workspaces/jas/data")
OUT = Path("/workspaces/jas/dashboard/public/meanrev_data.json")
RISK = 100.0

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
    for c in ['Open','High','Low','Close','Volume']:
        df[c] = pd.to_numeric(df[c], errors='coerce')
    return df.dropna(subset=['Open','High','Low','Close'])

def add_indicators(df):
    df = df.copy()
    df['sma50'] = df['Close'].rolling(50).mean()
    df['sma200'] = df['Close'].rolling(200).mean()
    # RSI 14
    delta = df['Close'].diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1/14, min_periods=14, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/14, min_periods=14, adjust=False).mean()
    rs = avg_gain / avg_loss
    df['rsi'] = 100 - (100 / (1 + rs))
    # Bollinger Bands (for reference / additional filter)
    df['bb_mid'] = df['Close'].rolling(20).mean()
    df['bb_std'] = df['Close'].rolling(20).std()
    df['bb_lower'] = df['bb_mid'] - 2 * df['bb_std']
    tr = np.maximum(df['High']-df['Low'],
        np.maximum(abs(df['High']-df['Close'].shift(1)), abs(df['Low']-df['Close'].shift(1))))
    df['atr'] = tr.rolling(14).mean()
    df['ema_trail'] = df['Close'].ewm(span=20, adjust=False).mean()
    df['fSma'] = df['bb_lower']  # show lower BB as "fast" line
    df['sSma'] = df['sma50']
    return df

def backtest_meanrev(df, name):
    """Mean Reversion: buy when RSI < 30 AND price near/below lower Bollinger Band, in uptrend."""
    SL_ATR = 1.5  # wider stop for mean reversion
    TRAIL_ATR_BUF = 1.0
    TRAIL_START_R = 2.5

    df = add_indicators(df)
    trades = []
    pos = 0
    ep = er = tsl = 0.0
    qty = 1
    cooldown = 0  # bars since last exit, avoid rapid re-entry

    for i in range(1, len(df)):
        r = df.iloc[i]
        prev = df.iloc[i-1]
        atr = r['atr']

        if pd.isna(atr) or atr <= 0 or pd.isna(r['sma50']) or pd.isna(r['rsi']) or pd.isna(r['bb_lower']):
            continue

        if cooldown > 0:
            cooldown -= 1

        # ── In a trade: check stop / trail ──
        if pos == 1:
            hit_sl = False
            xp = 0.0
            reason = ''

            if r['Low'] <= tsl:
                xp = gap_stop_fill_long(r['Open'], tsl); hit_sl = True; reason = 'SL'

            if not hit_sl:
                curr_r = (r['Close'] - ep) / er if er > 0 else 0
                if curr_r >= TRAIL_START_R:
                    ema_trail = r['ema_trail'] - TRAIL_ATR_BUF * atr
                    if ema_trail > tsl:
                        tsl = ema_trail

            if hit_sl:
                t = trades[-1]
                t['exitDate'] = r['Date'].strftime('%Y-%m-%d')
                t['exitPrice'] = round(xp, 2)
                pnl = calc_pnl_with_costs(
                    direction='LONG',
                    entry_price=ep,
                    exit_price=xp,
                    qty=t['qty'],
                    slippage_bps=SLIPPAGE_BPS,
                    commission_per_share=COMMISSION_PER_SHARE,
                    min_commission_per_order=MIN_COMMISSION_PER_ORDER,
                )
                pnl_r = (pnl['netPnl'] / RISK) if er > 0 else 0
                t['pnlR'] = round(pnl_r, 2)
                t['pnlDollar'] = round(pnl['netPnl'], 2)
                t['grossPnlDollar'] = round(pnl['grossPnl'], 2)
                t['costsDollar'] = round(pnl['costs'], 2)
                t['entryFill'] = round(pnl['entryFill'], 4)
                t['exitFill'] = round(pnl['exitFill'], 4)
                t['exitReason'] = reason
                ed = pd.to_datetime(t['entryDate'])
                t['durationDays'] = int((r['Date'] - ed).days)
                pos = 0
                cooldown = 3  # wait 3 bars before re-entering
            continue

        if cooldown > 0:
            continue

        # ── Flat: mean reversion — consecutive down days in uptrend ──
        # Larry Connors style: 3+ down closes in a row while in uptrend = buy the dip
        if i < 3:
            continue
        down1 = df.iloc[i]['Close'] < df.iloc[i-1]['Close']
        down2 = df.iloc[i-1]['Close'] < df.iloc[i-2]['Close']
        down3 = df.iloc[i-2]['Close'] < df.iloc[i-3]['Close']
        three_down = down1 and down2 and down3
        uptrend = r['Close'] > r['sma50']
        small_bar = (r['High'] - r['Low']) <= 3.0 * atr

        if three_down and uptrend and small_bar:
            sl = r['Close'] - SL_ATR * atr
            rk = r['Close'] - sl
            qty = max(1, round(RISK / rk)) if rk > 0 else 1
            pos = 1
            ep = r['Close']
            er = rk
            tsl = sl
            trades.append({
                'stock': name, 'dir': 'LONG',
                'entryDate': r['Date'].strftime('%Y-%m-%d'),
                'entryPrice': round(r['Close'], 2),
                'sl': round(sl, 2), 'risk': round(rk, 2), 'qty': qty,
                'exitDate': '', 'exitPrice': 0, 'pnlR': 0, 'pnlDollar': 0,
                'exitReason': '', 'durationDays': 0
            })

    # Close open trade
    if pos != 0 and trades:
        t = trades[-1]
        l = df.iloc[-1]
        t['exitDate'] = l['Date'].strftime('%Y-%m-%d')
        t['exitPrice'] = round(l['Close'], 2)
        pnl = calc_pnl_with_costs(
            direction='LONG',
            entry_price=ep,
            exit_price=l['Close'],
            qty=t['qty'],
            slippage_bps=SLIPPAGE_BPS,
            commission_per_share=COMMISSION_PER_SHARE,
            min_commission_per_order=MIN_COMMISSION_PER_ORDER,
        )
        pnl_r = (pnl['netPnl'] / RISK) if er > 0 else 0
        t['pnlR'] = round(pnl_r, 2)
        t['pnlDollar'] = round(pnl['netPnl'], 2)
        t['grossPnlDollar'] = round(pnl['grossPnl'], 2)
        t['costsDollar'] = round(pnl['costs'], 2)
        t['entryFill'] = round(pnl['entryFill'], 4)
        t['exitFill'] = round(pnl['exitFill'], 4)
        t['exitReason'] = 'Open'
        ed = pd.to_datetime(t['entryDate'])
        t['durationDays'] = int((l['Date'] - ed).days)

    prices = []
    for _, row in df.iterrows():
        if pd.notna(row['rsi']) and pd.notna(row['sma50']) and pd.notna(row['bb_lower']):
            prices.append({
                'date': row['Date'].strftime('%Y-%m-%d'),
                'close': round(row['Close'], 2),
                'fSma': round(row['bb_lower'], 2),
                'sSma': round(row['sSma'], 2)
            })
    return trades, prices


all_data = {'stocks': {}, 'allTrades': [], 'settings': {
    'rsiLen': 14, 'rsiOversold': 30, 'bbLen': 20, 'bbStd': 2,
    'trendMA': 'SMA 50', 'slAtrMult': 1.5,
    'trailEmaLen': 20, 'trailAtrBuf': 1.0, 'trailStartR': 2.5,
    'riskPerTrade': 100, 'strategy': 'Mean Reversion v1'
}}

for f in sorted(DATA_DIR.glob("*.csv")):
    name = f.stem.replace("_daily_data - Sheet1","").replace("_data","").upper()
    trades, prices = backtest_meanrev(load(f), name)
    all_data['stocks'][name] = {'trades': trades, 'prices': prices}
    all_data['allTrades'].extend(trades)
    print(f"{name}: {len(trades)} trades, {len(prices)} price bars")

all_data['allTrades'].sort(key=lambda t: t['entryDate'])
all_data['allTrades'], portfolio_meta = apply_portfolio_constraints(
    all_data['allTrades'],
    max_positions=PORTFOLIO_MAX_POSITIONS,
    max_risk_pct=PORTFOLIO_MAX_RISK_PCT,
    max_gross_exposure_pct=PORTFOLIO_MAX_GROSS_EXPOSURE_PCT,
    starting_equity=PORTFOLIO_START_EQUITY,
)
all_data['settings'].update({
    'slippageBps': SLIPPAGE_BPS,
    'commissionPerShare': COMMISSION_PER_SHARE,
    'minCommissionPerOrder': MIN_COMMISSION_PER_ORDER,
    'portfolioStartEquity': PORTFOLIO_START_EQUITY,
    'portfolioMaxPositions': PORTFOLIO_MAX_POSITIONS,
    'portfolioMaxRiskPct': PORTFOLIO_MAX_RISK_PCT,
    'portfolioMaxGrossExposurePct': PORTFOLIO_MAX_GROSS_EXPOSURE_PCT,
    'portfolioAcceptedTrades': portfolio_meta['accepted'],
    'portfolioRejectedTrades': portfolio_meta['rejected'],
})
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(all_data))
print(f"\nWritten {OUT} ({OUT.stat().st_size//1024}KB)")
