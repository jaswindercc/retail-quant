#!/usr/bin/env python3
"""
Unified Rotation Backtest: Three universes (Mega-cap, Large-cap, Mid-cap)

Generates backtest data for three separate breakout + momentum rotation strategies,
each with WEEKLY rotation of the top 10 watchlist.

All three use identical rules:
- Dynamic Watchlist: Top 10 by 6-month momentum, re-evaluated WEEKLY (every Monday)
- Regime Filter: SPY > 200-day SMA (if not, 100% cash)
- Entry: Close above 20-day high + volume ≥ 1.2× avg 20-day volume + above 50 SMA
- Stop Loss: 1 × ATR(14) below entry
- Position Size: $400 risk per trade (1% of $40K)
- Max Capital: $40,000
- Trail: Activate at 2.5R, trail = EMA20 - 1×ATR (ratchets up only)
- Max Positions: 3 simultaneous
- Period: Jan 2021 – Jun 2026

Universes (all liquid by Jan 2020 for survivorship-bias honesty):
- MEGA-CAP: 30 stocks, $200B+ market cap (cross-sector)
- LARGE-CAP: 35 stocks, $50B–$200B (tech-heavy but diversified)
- MID-CAP: 45 stocks, $10B–$50B growth (includes bubble losers)
"""

import json
import sys
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

# ── PARAMETERS (same for all three) ─────────────────────────────────────────────
MAX_RISK_PER_TRADE = 400.0   # 1% of $40K
MAX_CAPITAL = 40000.0
TRAIL_START_R = 2.5
TRAIL_ATR_BUF = 1.0
MAX_POSITIONS = 3
LOOKBACK_MONTHS = 6
TOP_N = 10
ROTATION_FREQ = 'weekly'   # 'weekly' = every Monday

START_DATE = '2019-06-01'
END_DATE = '2026-06-03'
TRADE_START = '2021-01-01'

# ── UNIVERSES ────────────────────────────────────────────────────────────────────

# MEGA-CAP: $200B+ market cap, cross-sector blue chips (all liquid by Jan 2020)
MEGA_POOL = [
    # Tech
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA',
    # Finance
    'JPM', 'V', 'MA', 'BAC',
    # Healthcare
    'UNH', 'JNJ', 'LLY', 'ABBV', 'MRK',
    # Consumer
    'WMT', 'PG', 'KO', 'PEP', 'COST', 'HD',
    # Energy / Industrial
    'XOM', 'CVX',
    # Tech 2nd tier (still mega)
    'AVGO', 'ORCL', 'CRM', 'NFLX', 'ADBE', 'AMD',
]

# LARGE-CAP: $50B–$200B range, diversified (all liquid by Jan 2020)
LARGE_POOL = [
    # Semis / Hardware
    'QCOM', 'INTC', 'MU', 'ANET', 'MRVL', 'LRCX', 'KLAC', 'ON',
    # Software / SaaS
    'NOW', 'PANW', 'CRWD', 'ADSK', 'WDAY', 'INTU', 'SNPS', 'CDNS', 'FTNT',
    # Internet / Consumer
    'UBER', 'PYPL', 'SHOP', 'EA', 'ABNB',
    # Biotech / MedTech
    'REGN', 'GILD', 'ISRG', 'DXCM', 'ILMN',
    # Industrial / Energy
    'CAT', 'DE', 'GE', 'LMT', 'RTX',
    # Financials
    'GS', 'MS',
]

# MID-CAP: $10B–$50B growth (includes 2020 bubble stocks for honesty)
MID_POOL = [
    # Growth SaaS
    'NET', 'DDOG', 'ZS', 'BILL', 'HUBS', 'TTD', 'OKTA', 'MDB',
    'DOCU', 'ESTC', 'PAYC', 'TWLO',
    # Consumer / Social
    'SNAP', 'ROKU', 'PINS', 'ETSY', 'CHWY', 'MTCH', 'W',
    # Clean energy / EV (bubble stocks — honest inclusion)
    'ENPH', 'SEDG', 'RUN', 'PLUG', 'FCEL', 'NIO', 'BLNK',
    'TAN', 'SPCE',
    # E-commerce
    'SE', 'MELI', 'PAGS',
    # Growth that crashed (would show up in any 2020 screen)
    'PTON', 'BYND', 'FSLY', 'ZM',
    # Fintech / Payments
    'FOUR', 'SOFI', 'AFRM',
    # Sports / Gaming
    'DKNG', 'PENN',
    # Others
    'FVRR', 'FUBO', 'U',
]

UNIVERSES = {
    'mega': {'pool': MEGA_POOL, 'label': 'Mega-Cap ($200B+)', 'file': 'rotation_mega_data.json'},
    'large': {'pool': LARGE_POOL, 'label': 'Large-Cap ($50B–$200B)', 'file': 'rotation_large_data.json'},
    'mid': {'pool': MID_POOL, 'label': 'Mid-Cap Growth ($10B–$50B)', 'file': 'rotation_mid_data.json'},
}


def download_data(tickers, start, end):
    """Download daily OHLCV data for all tickers."""
    print(f"  📥 Downloading {len(tickers)} stocks...")
    all_tickers = list(set(tickers + ['SPY']))
    df = yf.download(all_tickers, start=start, end=end,
                     interval='1d', group_by='ticker', progress=False,
                     threads=True, auto_adjust=True)

    stock_data = {}
    for ticker in all_tickers:
        try:
            if isinstance(df.columns, pd.MultiIndex):
                tdf = df[ticker].dropna(how='all').copy()
            else:
                tdf = df.dropna(how='all').copy()

            if len(tdf) < 60:
                continue

            tdf.columns = [str(c).strip() for c in tdf.columns]
            col_map = {}
            for c in tdf.columns:
                cl = c.lower()
                if cl == 'open': col_map[c] = 'Open'
                elif cl == 'high': col_map[c] = 'High'
                elif cl == 'low': col_map[c] = 'Low'
                elif cl in ('close', 'adj close'): col_map[c] = 'Close'
                elif cl == 'volume': col_map[c] = 'Volume'
            tdf = tdf.rename(columns=col_map)

            if 'Close' in tdf.columns and 'Volume' in tdf.columns:
                tdf.index = pd.to_datetime(tdf.index)
                stock_data[ticker] = tdf
        except (KeyError, TypeError):
            pass

    print(f"  ✅ Got data for {len(stock_data)}/{len(all_tickers)} stocks")
    return stock_data


def add_indicators(df):
    """Add indicators for breakout detection."""
    df = df.copy()
    df['ema20'] = df['Close'].ewm(span=20, adjust=False).mean()
    df['sma50'] = df['Close'].rolling(50).mean()
    df['sma200'] = df['Close'].rolling(200).mean()

    tr = np.maximum(df['High'] - df['Low'],
                    np.maximum(np.abs(df['High'] - df['Close'].shift(1)),
                               np.abs(df['Low'] - df['Close'].shift(1))))
    df['atr'] = tr.rolling(14).mean()
    df['high_20'] = df['High'].rolling(20).max().shift(1)
    df['vol_avg20'] = df['Volume'].rolling(20).mean()
    df['mom_6m'] = df['Close'].pct_change(126)

    return df


def get_regime(spy_data):
    """Return set of dates where SPY > 200 SMA."""
    spy = add_indicators(spy_data)
    bull_mask = spy['Close'] > spy['sma200']
    return set(spy[bull_mask].index)


def get_weekly_watchlist(stock_data, date, pool):
    """Pick top N stocks by 6-month momentum as of given date."""
    scores = []
    for ticker in pool:
        if ticker not in stock_data or ticker == 'SPY':
            continue
        df = stock_data[ticker]
        mask = df.index <= date
        subset = df[mask]
        if len(subset) < 126:
            continue
        mom = subset['Close'].iloc[-1] / subset['Close'].iloc[-126] - 1
        if np.isnan(mom):
            continue
        scores.append((ticker, mom))

    scores.sort(key=lambda x: x[1], reverse=True)
    return [s[0] for s in scores[:TOP_N]]


def simulate(stock_data, bull_dates, pool):
    """Run the breakout backtest with weekly rotation."""
    trade_start = pd.Timestamp(TRADE_START)
    spy_dates = stock_data['SPY'].index
    trading_dates = spy_dates[spy_dates >= trade_start]

    trades = []
    open_positions = []
    current_watchlist = []
    last_rotation_week = None
    rotation_log = []
    equity_curve = []
    running_pnl = 0
    capital_deployed = 0

    for date in trading_dates:
        # ── Weekly rotation (every Monday) ──
        week_key = date.isocalendar()[:2]  # (year, week)
        if week_key != last_rotation_week and date.weekday() == 0:
            current_watchlist = get_weekly_watchlist(stock_data, date, pool)
            last_rotation_week = week_key
            rotation_log.append({'week': date.strftime('%Y-%m-%d'), 'watchlist': current_watchlist[:]})
        elif not current_watchlist:
            # First day might not be Monday
            current_watchlist = get_weekly_watchlist(stock_data, date, pool)
            rotation_log.append({'week': date.strftime('%Y-%m-%d'), 'watchlist': current_watchlist[:]})

        # ── Regime check ──
        in_bull = date in bull_dates

        # ── Update open positions ──
        closed_today = []
        for pos in open_positions:
            ticker = pos['ticker']
            if ticker not in stock_data or date not in stock_data[ticker].index:
                continue
            row = stock_data[ticker].loc[date]
            if pd.isna(row['Close']):
                continue

            entry = pos['entry_price']
            sl = pos['stop_loss']

            # Check SL hit
            if row['Low'] <= sl:
                pnl_dollar = (sl - entry) * pos['shares']
                pnl_r = pnl_dollar / MAX_RISK_PER_TRADE
                trades.append({
                    'stock': ticker,
                    'entryDate': pos['entry_date'].strftime('%Y-%m-%d'),
                    'entryPrice': round(entry, 2),
                    'sl': round(pos['original_sl'], 2),
                    'risk': round(pos['entry_atr'], 2),
                    'qty': pos['shares'],
                    'exitDate': date.strftime('%Y-%m-%d'),
                    'exitPrice': round(sl, 2),
                    'pnlR': round(pnl_r, 2),
                    'pnlDollar': round(pnl_dollar, 2),
                    'exitReason': 'Trail' if pos['trail_active'] else 'SL',
                    'durationDays': (date - pos['entry_date']).days,
                })
                running_pnl += pnl_dollar
                capital_deployed -= entry * pos['shares']
                closed_today.append(pos)
                continue

            # Update ATR and EMA20
            if not pd.isna(row.get('atr', np.nan)):
                pos['current_atr'] = row['atr']
            if not pd.isna(row.get('ema20', np.nan)):
                pos['current_ema20'] = row['ema20']

            # Check trail activation
            current_r = (row['Close'] - entry) / pos['entry_atr']
            if current_r >= TRAIL_START_R and not pos['trail_active']:
                pos['trail_active'] = True

            # Update trailing stop (ratchets up only)
            if pos['trail_active']:
                new_trail = pos['current_ema20'] - TRAIL_ATR_BUF * pos['current_atr']
                if new_trail > sl:
                    pos['stop_loss'] = new_trail

        for p in closed_today:
            open_positions.remove(p)

        # ── Regime off → close all ──
        if not in_bull and open_positions:
            for pos in open_positions:
                ticker = pos['ticker']
                if date in stock_data[ticker].index:
                    row = stock_data[ticker].loc[date]
                    exit_price = row['Close']
                else:
                    exit_price = pos['entry_price']
                pnl_dollar = (exit_price - pos['entry_price']) * pos['shares']
                pnl_r = pnl_dollar / MAX_RISK_PER_TRADE
                trades.append({
                    'stock': ticker,
                    'entryDate': pos['entry_date'].strftime('%Y-%m-%d'),
                    'entryPrice': round(pos['entry_price'], 2),
                    'sl': round(pos['original_sl'], 2),
                    'risk': round(pos['entry_atr'], 2),
                    'qty': pos['shares'],
                    'exitDate': date.strftime('%Y-%m-%d'),
                    'exitPrice': round(exit_price, 2),
                    'pnlR': round(pnl_r, 2),
                    'pnlDollar': round(pnl_dollar, 2),
                    'exitReason': 'Regime',
                    'durationDays': (date - pos['entry_date']).days,
                })
                running_pnl += pnl_dollar
                capital_deployed -= pos['entry_price'] * pos['shares']
            open_positions = []

        # ── Check for new entries (only in bull market) ──
        if in_bull and len(open_positions) < MAX_POSITIONS:
            for ticker in current_watchlist:
                if len(open_positions) >= MAX_POSITIONS:
                    break
                if any(p['ticker'] == ticker for p in open_positions):
                    continue
                if ticker not in stock_data or date not in stock_data[ticker].index:
                    continue

                row = stock_data[ticker].loc[date]
                if pd.isna(row['Close']) or pd.isna(row.get('high_20')) or pd.isna(row.get('atr')):
                    continue
                if row['atr'] <= 0:
                    continue
                if row['Close'] < 5:
                    continue

                # ── BREAKOUT SIGNAL ──
                if row['Close'] <= row['high_20']:
                    continue
                if pd.isna(row.get('vol_avg20')) or row['Volume'] < 1.2 * row['vol_avg20']:
                    continue
                if pd.isna(row.get('sma50')) or row['Close'] <= row['sma50']:
                    continue

                # ── POSITION SIZING ──
                atr = row['atr']
                sl_price = row['Close'] - atr
                shares = int(MAX_RISK_PER_TRADE / atr)
                if shares <= 0:
                    continue
                cost = row['Close'] * shares
                if capital_deployed + cost > MAX_CAPITAL:
                    continue

                open_positions.append({
                    'ticker': ticker,
                    'entry_price': row['Close'],
                    'entry_date': date,
                    'original_sl': sl_price,
                    'stop_loss': sl_price,
                    'entry_atr': atr,
                    'current_atr': atr,
                    'current_ema20': row['ema20'] if not pd.isna(row.get('ema20')) else row['Close'],
                    'shares': shares,
                    'trail_active': False,
                })
                capital_deployed += cost

        equity_curve.append({
            'date': date.strftime('%Y-%m-%d'),
            'pnl': round(running_pnl, 2),
            'open_positions': len(open_positions),
        })

    # Mark remaining positions as Open
    for pos in open_positions:
        ticker = pos['ticker']
        last_row = stock_data[ticker].iloc[-1]
        pnl_dollar = (last_row['Close'] - pos['entry_price']) * pos['shares']
        pnl_r = pnl_dollar / MAX_RISK_PER_TRADE
        trades.append({
            'stock': ticker,
            'entryDate': pos['entry_date'].strftime('%Y-%m-%d'),
            'entryPrice': round(pos['entry_price'], 2),
            'sl': round(pos['original_sl'], 2),
            'risk': round(pos['entry_atr'], 2),
            'qty': pos['shares'],
            'exitDate': trading_dates[-1].strftime('%Y-%m-%d'),
            'exitPrice': round(last_row['Close'], 2),
            'pnlR': round(pnl_r, 2),
            'pnlDollar': round(pnl_dollar, 2),
            'exitReason': 'Open',
            'durationDays': (trading_dates[-1] - pos['entry_date']).days,
        })

    return trades, equity_curve, rotation_log


def compute_stats(trades, rotation_log):
    """Compute summary statistics."""
    if not trades:
        return {}

    closed_trades = [t for t in trades if t['exitReason'] != 'Open']
    pnls = [t['pnlDollar'] for t in closed_trades]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]

    max_streak = 0
    curr_streak = 0
    for p in pnls:
        if p <= 0:
            curr_streak += 1
            max_streak = max(max_streak, curr_streak)
        else:
            curr_streak = 0

    # Max drawdown
    equity = 0
    peak = 0
    max_dd = 0
    for p in pnls:
        equity += p
        peak = max(peak, equity)
        dd = peak - equity
        max_dd = max(max_dd, dd)

    gross_win = sum(wins) if wins else 0
    gross_loss = abs(sum(losses)) if losses else 0
    pf = gross_win / gross_loss if gross_loss > 0 else 0

    # Monthly PnL
    monthly = {}
    for t in closed_trades:
        key = t['exitDate'][:7]
        monthly[key] = monthly.get(key, 0) + t['pnlDollar']

    # Per-stock breakdown
    stock_stats = {}
    for t in trades:
        s = t['stock']
        if s not in stock_stats:
            stock_stats[s] = {'trades': 0, 'pnl': 0, 'wins': 0}
        stock_stats[s]['trades'] += 1
        stock_stats[s]['pnl'] += t['pnlDollar']
        if t['pnlDollar'] > 0:
            stock_stats[s]['wins'] += 1

    return {
        'total_trades': len(trades),
        'closed_trades': len(closed_trades),
        'win_rate': len(wins) / len(closed_trades) * 100 if closed_trades else 0,
        'total_pnl': round(sum(pnls), 2),
        'profit_factor': round(pf, 2),
        'max_losing_streak': max_streak,
        'max_drawdown': round(max_dd, 2),
        'avg_winner': round(gross_win / len(wins), 2) if wins else 0,
        'avg_loser': round(gross_loss / len(losses), 2) if losses else 0,
        'avg_r_winner': round(sum(t['pnlR'] for t in closed_trades if t['pnlDollar'] > 0) / len(wins), 2) if wins else 0,
        'best_trade': round(max(pnls), 2) if pnls else 0,
        'worst_trade': round(min(pnls), 2) if pnls else 0,
        'avg_duration_days': round(sum(t['durationDays'] for t in closed_trades) / len(closed_trades), 1) if closed_trades else 0,
        'monthly_pnl': monthly,
        'stock_breakdown': stock_stats,
        'rotation_log': rotation_log,
        'total_wins': len(wins),
        'total_losses': len(losses),
    }


def run_universe(name, config, shared_spy_data=None):
    """Run backtest for one universe."""
    pool = config['pool']
    label = config['label']
    filename = config['file']

    print(f"\n{'='*60}")
    print(f"  🎯 {label} — {len(pool)} stocks, Weekly Rotation")
    print(f"{'='*60}")

    # Download data
    stock_data = download_data(pool, START_DATE, END_DATE)

    # Use shared SPY if available
    if shared_spy_data is not None and 'SPY' not in stock_data:
        stock_data['SPY'] = shared_spy_data
    elif shared_spy_data is not None:
        pass  # already have it

    # Add indicators
    print("  📊 Adding indicators...")
    for ticker in list(stock_data.keys()):
        stock_data[ticker] = add_indicators(stock_data[ticker])

    if 'SPY' not in stock_data:
        print("  ❌ SPY data missing!")
        return None

    bull_dates = get_regime(stock_data['SPY'])
    total_days = len(stock_data['SPY'][stock_data['SPY'].index >= TRADE_START])
    bull_pct = len([d for d in bull_dates if d >= pd.Timestamp(TRADE_START)]) / total_days * 100
    print(f"  🐂 Bull market: {bull_pct:.0f}% of trading days")

    # Run simulation
    print("  🎲 Running simulation...")
    trades, equity_curve, rotation_log = simulate(stock_data, bull_dates, pool)

    # Compute stats
    stats = compute_stats(trades, rotation_log)

    print(f"\n  === {label} RESULTS ===")
    print(f"  Trades: {stats['total_trades']} ({stats['closed_trades']} closed)")
    print(f"  Win Rate: {stats['win_rate']:.1f}%")
    print(f"  Total PnL: ${stats['total_pnl']:,.0f}")
    print(f"  Profit Factor: {stats['profit_factor']}")
    print(f"  Max Losing Streak: {stats['max_losing_streak']}")
    print(f"  Max Drawdown: ${stats['max_drawdown']:,.0f}")
    if stats.get('avg_winner'):
        print(f"  Avg Winner: ${stats['avg_winner']:,.0f} ({stats['avg_r_winner']:.1f}R)")
        print(f"  Avg Loser: ${stats['avg_loser']:,.0f}")
    print(f"  Avg Duration: {stats['avg_duration_days']:.0f} days")

    # Output JSON
    output = {
        'lastUpdated': datetime.now().strftime('%Y-%m-%d %H:%M'),
        'universe': name,
        'label': label,
        'params': {
            'pool': pool,
            'top_n': TOP_N,
            'lookback_months': LOOKBACK_MONTHS,
            'rotation_freq': ROTATION_FREQ,
            'max_risk': MAX_RISK_PER_TRADE,
            'max_capital': MAX_CAPITAL,
            'max_positions': MAX_POSITIONS,
            'trail_start_r': TRAIL_START_R,
            'trail_atr_buf': TRAIL_ATR_BUF,
            'period': f'{TRADE_START} to {END_DATE}',
        },
        'summary': stats,
        'trades': trades,
        'equity_curve': equity_curve,
    }

    out_path = Path(__file__).resolve().parent.parent / 'dashboard' / 'public' / filename
    with open(out_path, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"  💾 Saved to {out_path}")
    return output


def main():
    print("🚀 Rotation Strategy Backtest — 3 Universes, Weekly Rotation")
    print(f"   Risk: ${MAX_RISK_PER_TRADE}/trade (1% of ${MAX_CAPITAL:,.0f})")
    print(f"   Rotation: Weekly (every Monday), Top {TOP_N} by {LOOKBACK_MONTHS}mo momentum")
    print(f"   Max {MAX_POSITIONS} positions, Trail at {TRAIL_START_R}R")

    # Run specific universe or all
    target = sys.argv[1] if len(sys.argv) > 1 else 'all'

    if target == 'all':
        for name, config in UNIVERSES.items():
            run_universe(name, config)
    elif target in UNIVERSES:
        run_universe(target, UNIVERSES[target])
    else:
        print(f"  ❌ Unknown universe: {target}")
        print(f"     Options: {', '.join(UNIVERSES.keys())} or 'all'")
        sys.exit(1)

    print("\n✅ Done!")


if __name__ == '__main__':
    main()
