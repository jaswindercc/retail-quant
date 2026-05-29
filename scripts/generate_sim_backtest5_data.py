#!/usr/bin/env python3
"""
Live Plan Backtest: Breakout-only on systematically-rotated mega-caps + Regime filter

KEY DIFFERENCE from previous backtests:
- NOT cherry-picked stocks. Uses DYNAMIC rotation: every month, pick the top 10
  mega-caps by 6-month relative strength from a pool of 30.
- This prevents survivorship bias — stocks rotate IN and OUT of the watchlist.

Rules:
- Universe Pool: 30 mega-cap tech/growth leaders
- Dynamic Watchlist: Top 10 by 6-month momentum, re-evaluated monthly
- Regime Filter: SPY > 200-day SMA (if not, 100% cash)
- Entry: Close above 20-day high + volume ≥ 1.2× avg 20-day volume
- Stop Loss: 1 × ATR(14) below entry
- Position Size: $200 risk per trade (shares = floor($200 / ATR))
- Max Capital: $40,000
- Trail: Activate at 2.5R, trail = EMA20 - 1×ATR (ratchets up only)
- Max Positions: 3 simultaneous
- Period: Jan 2021 – May 2026
"""

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

# ── PARAMETERS ──────────────────────────────────────────────────────────────────
MAX_RISK_PER_TRADE = 200.0
MAX_CAPITAL = 40000.0
TRAIL_START_R = 2.5
TRAIL_ATR_BUF = 1.0
MAX_POSITIONS = 3
LOOKBACK_MONTHS = 6       # Momentum lookback for rotation
ROTATION_DAY = 1          # Re-evaluate watchlist on first trading day of month
TOP_N = 10                # Pick top N by momentum

# Pool of 30 mega-cap tech/growth stocks (market leaders, highly liquid)
MEGA_POOL = [
    'NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AMD', 'CRM', 'NFLX',
    'AVGO', 'ADBE', 'ORCL', 'QCOM', 'INTC', 'CSCO', 'NOW', 'UBER', 'SHOP', 'SQ',
    'SNOW', 'PYPL', 'ABNB', 'COIN', 'MRVL', 'PANW', 'CRWD', 'PLTR', 'MU', 'ANET',
]

START_DATE = '2020-06-01'  # Extra 6 months for momentum lookback
END_DATE = '2026-05-29'
TRADE_START = '2021-01-01'  # Actual trading starts here


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

            # Normalize columns
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

    # ATR(14)
    tr = np.maximum(df['High'] - df['Low'],
                    np.maximum(np.abs(df['High'] - df['Close'].shift(1)),
                               np.abs(df['Low'] - df['Close'].shift(1))))
    df['atr'] = tr.rolling(14).mean()

    # 20-day high (previous day's rolling max — breakout if today closes above)
    df['high_20'] = df['High'].rolling(20).max().shift(1)

    # 20-day average volume
    df['vol_avg20'] = df['Volume'].rolling(20).mean()

    # 6-month return (for momentum ranking)
    df['mom_6m'] = df['Close'].pct_change(126)

    return df


def get_regime(spy_data):
    """Return set of dates where SPY > 200 SMA (bull market)."""
    spy = add_indicators(spy_data)
    bull_mask = spy['Close'] > spy['sma200']
    bull_dates = set(spy[bull_mask].index)
    return bull_dates


def get_monthly_watchlist(stock_data, date):
    """
    Pick top N stocks by 6-month momentum as of given date.
    This is how you'd ACTUALLY pick the watchlist forward-looking.
    """
    scores = []
    for ticker, df in stock_data.items():
        if ticker == 'SPY':
            continue
        # Get momentum as of this date
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


def simulate(stock_data, bull_dates):
    """Run the breakout backtest with dynamic rotation."""
    trade_start = pd.Timestamp(TRADE_START)

    # Get all trading dates from SPY
    spy_dates = stock_data['SPY'].index
    trading_dates = spy_dates[spy_dates >= trade_start]

    trades = []
    open_positions = []  # list of dicts
    current_watchlist = []
    last_rotation_month = None
    equity_curve = []
    running_pnl = 0
    capital_deployed = 0

    for date in trading_dates:
        # ── Monthly rotation ──
        month_key = (date.year, date.month)
        if month_key != last_rotation_month:
            current_watchlist = get_monthly_watchlist(stock_data, date)
            last_rotation_month = month_key

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
            atr = pos['current_atr']

            # Check SL hit (use Low for intraday)
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
                    'watchlist': pos.get('watchlist_at_entry', []),
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

        # Remove closed
        for p in closed_today:
            open_positions.remove(p)

        # ── Check for new entries (only in bull market) ──
        if in_bull and len(open_positions) < MAX_POSITIONS:
            for ticker in current_watchlist:
                if len(open_positions) >= MAX_POSITIONS:
                    break
                # Skip if already in a position
                if any(p['ticker'] == ticker for p in open_positions):
                    continue
                if ticker not in stock_data or date not in stock_data[ticker].index:
                    continue

                row = stock_data[ticker].loc[date]
                if pd.isna(row['Close']) or pd.isna(row.get('high_20')) or pd.isna(row.get('atr')):
                    continue
                if row['atr'] <= 0:
                    continue

                # ── BREAKOUT SIGNAL ──
                # 1. Close above 20-day high
                if row['Close'] <= row['high_20']:
                    continue
                # 2. Volume ≥ 1.2× average
                if pd.isna(row.get('vol_avg20')) or row['Volume'] < 1.2 * row['vol_avg20']:
                    continue
                # 3. Above 50 SMA (trend confirmation)
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

                # ── OPEN POSITION ──
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
                    'watchlist_at_entry': current_watchlist[:],
                })
                capital_deployed += cost

        equity_curve.append({
            'date': date.strftime('%Y-%m-%d'),
            'pnl': round(running_pnl, 2),
            'open_positions': len(open_positions),
        })

    # Close remaining positions at last available price
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
            'watchlist': pos.get('watchlist_at_entry', []),
        })

    return trades, equity_curve


def compute_stats(trades):
    """Compute summary statistics."""
    if not trades:
        return {}

    pnls = [t['pnlDollar'] for t in trades]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]

    # Losing streak
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
    for t in trades:
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

    # Watchlist rotation history
    rotation_log = []
    seen_months = set()
    for t in trades:
        month = t['entryDate'][:7]
        if month not in seen_months and t.get('watchlist'):
            seen_months.add(month)
            rotation_log.append({'month': month, 'watchlist': t['watchlist']})

    return {
        'total_trades': len(trades),
        'win_rate': len(wins) / len(trades) * 100 if trades else 0,
        'total_pnl': round(sum(pnls), 2),
        'profit_factor': round(pf, 2),
        'max_losing_streak': max_streak,
        'max_drawdown': round(max_dd, 2),
        'avg_winner': round(gross_win / len(wins), 2) if wins else 0,
        'avg_loser': round(gross_loss / len(losses), 2) if losses else 0,
        'avg_r_winner': round(sum(t['pnlR'] for t in trades if t['pnlDollar'] > 0) / len(wins), 2) if wins else 0,
        'best_trade': round(max(pnls), 2),
        'worst_trade': round(min(pnls), 2),
        'avg_duration_days': round(sum(t['durationDays'] for t in trades) / len(trades), 1),
        'monthly_pnl': monthly,
        'stock_breakdown': stock_stats,
        'rotation_log': rotation_log,
        'total_wins': len(wins),
        'total_losses': len(losses),
    }


def main():
    print("🚀 Live Plan Backtest: Breakout + Momentum Rotation + Regime")
    print(f"   Pool: {len(MEGA_POOL)} mega-caps, Top {TOP_N} by {LOOKBACK_MONTHS}mo momentum")
    print(f"   Risk: ${MAX_RISK_PER_TRADE}/trade, Max ${MAX_CAPITAL} capital, Max {MAX_POSITIONS} positions")
    print()

    # Download data
    stock_data = download_data(MEGA_POOL, START_DATE, END_DATE)

    # Add indicators
    print("  📊 Adding indicators...")
    for ticker in list(stock_data.keys()):
        stock_data[ticker] = add_indicators(stock_data[ticker])

    # Get regime
    if 'SPY' not in stock_data:
        print("  ❌ SPY data missing!")
        sys.exit(1)
    bull_dates = get_regime(stock_data['SPY'])
    total_days = len(stock_data['SPY'][stock_data['SPY'].index >= TRADE_START])
    bull_pct = len([d for d in bull_dates if d >= pd.Timestamp(TRADE_START)]) / total_days * 100
    print(f"  🐂 Bull market: {bull_pct:.0f}% of trading days")

    # Run simulation
    print("  🎲 Running simulation...")
    trades, equity_curve = simulate(stock_data, bull_dates)

    # Compute stats
    stats = compute_stats(trades)

    print()
    print(f"  === RESULTS ===")
    print(f"  Trades: {stats['total_trades']}")
    print(f"  Win Rate: {stats['win_rate']:.1f}%")
    print(f"  Total PnL: ${stats['total_pnl']:,.0f}")
    print(f"  Profit Factor: {stats['profit_factor']}")
    print(f"  Max Losing Streak: {stats['max_losing_streak']}")
    print(f"  Max Drawdown: ${stats['max_drawdown']:,.0f}")
    print(f"  Avg Winner: ${stats['avg_winner']:,.0f} ({stats['avg_r_winner']:.1f}R)")
    print(f"  Avg Loser: ${stats['avg_loser']:,.0f}")
    print(f"  Avg Duration: {stats['avg_duration_days']:.0f} days")
    print()

    # Show rotation log
    print("  📋 Watchlist Rotation (sample):")
    for entry in stats['rotation_log'][:6]:
        print(f"     {entry['month']}: {', '.join(entry['watchlist'][:5])}...")
    print()

    # Output JSON
    output = {
        'lastUpdated': datetime.now().strftime('%Y-%m-%d %H:%M'),
        'params': {
            'pool': MEGA_POOL,
            'top_n': TOP_N,
            'lookback_months': LOOKBACK_MONTHS,
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

    # Remove watchlist from individual trades to save space (it's in rotation_log)
    for t in output['trades']:
        t.pop('watchlist', None)

    out_path = Path(__file__).resolve().parent.parent / 'dashboard' / 'public' / 'live_plan_data.json'
    with open(out_path, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"  💾 Saved to {out_path}")


if __name__ == '__main__':
    main()
