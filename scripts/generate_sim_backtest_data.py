#!/usr/bin/env python3
"""
SIM Backtest 1: Confluence Trading Simulation

Rules:
- Universe: S&P 500 + NASDAQ 100, price > $10
- Entry: Pick ONE random confluence trade per day (stock with 2+ strategy signals)
- Position sizing: $200 max risk per trade (shares = $200 / SL distance)
- Max capital: $40,000
- Exit: Trail SL (2.5R activate, EMA20 - 1×ATR, ratchets up only)
- Period: 5 years
"""

import argparse
import json
import random
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
import yfinance as yf

NY_TZ = ZoneInfo("America/New_York")
UNIVERSE_FILE = Path(__file__).resolve().parent.parent / "data" / "stock_universe.json"

# Trail parameters
TRAIL_START_R = 2.5
TRAIL_ATR_BUF = 1.0

# Position sizing
MAX_RISK_PER_TRADE = 200.0
MAX_CAPITAL = 40000.0


def get_universe():
    """Load the stock universe."""
    if UNIVERSE_FILE.exists():
        data = json.load(open(UNIVERSE_FILE))
        return data['tickers']
    else:
        print("  ❌ Universe file not found. Run build_universe.py first.")
        sys.exit(1)


def download_data(tickers, period='5y'):
    """Bulk download daily OHLCV data."""
    print(f"  📥 Downloading {len(tickers)} stocks ({period})...")
    batch_size = 50
    all_data = {}

    for i in range(0, len(tickers), batch_size):
        batch = tickers[i:i+batch_size]
        try:
            df = yf.download(batch, period=period, interval='1d',
                             group_by='ticker', progress=False, threads=True,
                             auto_adjust=True)
            if df.empty:
                continue

            for ticker in batch:
                try:
                    if isinstance(df.columns, pd.MultiIndex):
                        tdf = df[ticker].dropna(how='all').reset_index()
                    else:
                        tdf = df.reset_index()

                    # Normalize column names (handle 'index' for Date)
                    col_map = {}
                    for c in tdf.columns:
                        cl = str(c).lower().strip()
                        if cl in ('date', 'index'): col_map[c] = 'Date'
                        elif cl == 'open': col_map[c] = 'Open'
                        elif cl == 'high': col_map[c] = 'High'
                        elif cl == 'low': col_map[c] = 'Low'
                        elif cl in ('close', 'adj close'): col_map[c] = 'Close'
                        elif cl == 'volume': col_map[c] = 'Volume'
                    tdf = tdf.rename(columns=col_map)

                    if len(tdf) > 60 and 'Close' in tdf.columns and 'Date' in tdf.columns:
                        all_data[ticker] = tdf
                except (KeyError, TypeError, ValueError):
                    pass
        except Exception as e:
            print(f"    ⚠ Batch {i//batch_size + 1} error: {e}")

        if (i + batch_size) % 100 == 0:
            print(f"    ... {min(i+batch_size, len(tickers))}/{len(tickers)}")

    print(f"  ✅ Got data for {len(all_data)}/{len(tickers)} stocks")
    return all_data


def add_indicators(df):
    """Add indicators needed for signal detection."""
    df = df.copy()
    df['ema20'] = df['Close'].ewm(span=20, adjust=False).mean()
    df['sma50'] = df['Close'].rolling(50).mean()

    # ATR
    tr = np.maximum(df['High'] - df['Low'],
                    np.maximum(np.abs(df['High'] - df['Close'].shift(1)),
                               np.abs(df['Low'] - df['Close'].shift(1))))
    df['atr'] = tr.rolling(14).mean()

    # 20-day high (for breakout)
    df['high_20'] = df['High'].rolling(20).max().shift(1)

    # RSI(14)
    delta = df['Close'].diff()
    gain = delta.where(delta > 0, 0.0)
    loss = (-delta).where(delta < 0, 0.0)
    avg_gain = gain.ewm(alpha=1/14, min_periods=14, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/14, min_periods=14, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    df['rsi'] = 100 - (100 / (1 + rs))

    return df


def check_ma_bounce(row, prev, atr):
    """Check MA Bounce signal."""
    if row['Close'] <= row['sma50']:
        return False
    if prev['Low'] > prev['ema20'] + 0.5 * atr:
        return False
    if row['Close'] <= row['ema20']:
        return False
    if row['Close'] > row['ema20'] + 3 * atr:
        return False
    bar_range = row['High'] - row['Low']
    if bar_range > 2 * atr:
        return False
    return True


def check_breakout(row, prev, atr):
    """Check Breakout signal."""
    if pd.isna(row['high_20']):
        return False
    if row['Close'] <= row['high_20']:
        return False
    if row['Close'] <= row['sma50']:
        return False
    bar_range = row['High'] - row['Low']
    if bar_range > 3 * atr:
        return False
    return True


def check_rsi_trend(row, prev, atr):
    """Check RSI Trend signal."""
    if pd.isna(row['rsi']) or pd.isna(prev['rsi']):
        return False
    if not (prev['rsi'] < 50 and row['rsi'] >= 50):
        return False
    if row['Close'] <= row['sma50']:
        return False
    if row['Close'] - row['sma50'] > 4.0 * atr:
        return False
    return True


def check_higher_high(df, i, atr):
    """Check Higher High Break signal (simplified)."""
    if i < 30:
        return False
    # Find two swing highs in last 30 bars
    window = 5
    highs = []
    high_col = df['High'].values
    for j in range(max(0, i-30), i):
        start = max(0, j - window)
        end = min(len(df), j + window + 1)
        if high_col[j] == high_col[start:end].max():
            highs.append((j, high_col[j]))

    # Deduplicate close highs
    filtered = []
    for h in highs:
        if not filtered or h[0] - filtered[-1][0] >= window:
            filtered.append(h)

    if len(filtered) < 2:
        return False

    # Last two swing highs must be ascending
    h1, h2 = filtered[-2], filtered[-1]
    if h2[1] <= h1[1]:
        return False

    # Current close must break above the last swing high
    row = df.iloc[i]
    if row['Close'] <= h2[1]:
        return False

    return True


def find_daily_signals(all_data):
    """
    Scan all stocks for all days, find confluence signals (2+ strategies).
    Returns: (daily_signals dict, all_data_ind dict with indicators pre-computed)
    """
    print("  🔍 Scanning for confluence signals...")
    daily_signals = {}
    all_data_ind = {}

    for ticker, df in all_data.items():
        df = add_indicators(df)
        if 'Date' not in df.columns:
            if df.index.name == 'Date' or pd.api.types.is_datetime64_any_dtype(df.index):
                df = df.reset_index()
            else:
                continue

        for i in range(60, len(df)):
            row = df.iloc[i]
            prev = df.iloc[i - 1]

            if pd.isna(row['atr']) or row['atr'] <= 0:
                continue
            if pd.isna(row['sma50']) or pd.isna(row['ema20']):
                continue

            atr = float(row['atr'])
            strategies = []

            if check_ma_bounce(row, prev, atr):
                strategies.append('MA Bounce')
            if check_breakout(row, prev, atr):
                strategies.append('Breakout')
            if check_rsi_trend(row, prev, atr):
                strategies.append('RSI Trend')
            if check_higher_high(df, i, atr):
                strategies.append('Higher High')

            # Confluence = 2+ strategies
            if len(strategies) >= 2:
                date_val = row['Date']
                if hasattr(date_val, 'strftime'):
                    date_str = date_val.strftime('%Y-%m-%d')
                else:
                    date_str = str(date_val)[:10]

                entry = float(row['Close'])
                if entry < 15:
                    continue
                stop = entry - atr
                risk = entry - stop

                if date_str not in daily_signals:
                    daily_signals[date_str] = []

                daily_signals[date_str].append({
                    'ticker': ticker,
                    'strategies': strategies,
                    'entry': entry,
                    'stop': stop,
                    'risk_per_share': risk,
                    'atr': atr,
                    'ema20': float(row['ema20']),
                })

        all_data_ind[ticker] = df

    print(f"  ✅ Found confluence signals on {len(daily_signals)} trading days")
    return daily_signals, all_data_ind


def simulate_trades(daily_signals, all_data_ind, rank_mode='random', start_date='2021-01-01'):
    """
    Simulate: pick 1 confluence trade per day, manage with trailing SL.
    all_data_ind: dict of ticker -> DataFrame with indicators already computed.
    rank_mode: 'random' | 'most_strategies' | 'tightest_atr' | 'combo'
    start_date: only open new trades on/after this date (manage existing positions regardless)
    """
    print("  📊 Simulating trades...")

    sorted_dates = sorted(daily_signals.keys())
    trades = []
    open_positions = []
    capital_used = 0.0
    equity_curve = []

    for date_str in sorted_dates:
        date = pd.Timestamp(date_str)

        # First, check open positions for this date
        still_open = []
        for pos in open_positions:
            ticker = pos['ticker']
            if ticker not in all_data_ind:
                still_open.append(pos)
                continue

            df = all_data_ind[ticker]
            if 'Date' not in df.columns:
                still_open.append(pos)
                continue

            # Find this date's bar
            day_mask = df['Date'].dt.strftime('%Y-%m-%d') == date_str
            if not day_mask.any():
                still_open.append(pos)
                continue

            idx = day_mask.idxmax()
            bar = df.iloc[idx]
            day_open = float(bar['Open'])
            day_low = float(bar['Low'])
            day_high = float(bar['High'])
            day_close = float(bar['Close'])

            # Get EMA/ATR for trail (already computed)
            ema20 = float(bar['ema20']) if pd.notna(bar['ema20']) else None
            atr14 = float(bar['atr']) if pd.notna(bar['atr']) else None

            # Check gap below SL
            if day_open <= pos['current_sl']:
                exit_price = day_open
                pnl = (exit_price - pos['entry']) * pos['shares']
                pos['exit_date'] = date_str
                pos['exit_price'] = exit_price
                pos['pnl'] = pnl
                pos['reason'] = 'Trail SL (gap)' if pos['trail_active'] else 'Initial SL (gap)'
                pos['status'] = 'CLOSED'
                trades.append(pos)
                capital_used -= pos['capital_at_risk']
                continue

            # Check low touches SL
            if day_low <= pos['current_sl']:
                exit_price = pos['current_sl']
                pnl = (exit_price - pos['entry']) * pos['shares']
                pos['exit_date'] = date_str
                pos['exit_price'] = exit_price
                pos['pnl'] = pnl
                pos['reason'] = 'Trail SL' if pos['trail_active'] else 'Initial SL'
                pos['status'] = 'CLOSED'
                trades.append(pos)
                capital_used -= pos['capital_at_risk']
                continue

            # Update trailing SL
            if ema20 and atr14:
                unrealized_r = (day_close - pos['entry']) / pos['risk_per_share']
                if unrealized_r >= TRAIL_START_R:
                    pos['trail_active'] = True
                    new_tsl = ema20 - TRAIL_ATR_BUF * atr14
                    if new_tsl > pos['current_sl']:
                        pos['current_sl'] = new_tsl

            pos['max_price'] = max(pos['max_price'], day_high)
            pos['last_price'] = day_close
            pos['days_held'] += 1
            still_open.append(pos)

        open_positions = still_open

        # Skip new entries before start_date (still manage open positions above)
        if date_str < start_date:
            # Record equity curve
            open_pnl = sum((p['last_price'] - p['entry']) * p['shares'] for p in open_positions)
            closed_pnl = sum(t['pnl'] for t in trades)
            equity_curve.append({
                'date': date_str,
                'total_pnl': closed_pnl + open_pnl,
                'closed_pnl': closed_pnl,
                'open_positions': len(open_positions),
            })
            continue

        # Try to enter a new trade
        candidates = daily_signals[date_str]

        # Rank candidates based on ranking mode
        if rank_mode == 'random':
            random.shuffle(candidates)
        elif rank_mode == 'most_strategies':
            # More strategies = stronger confluence
            candidates = sorted(candidates, key=lambda s: len(s['strategies']), reverse=True)
        elif rank_mode == 'tightest_atr':
            # Lowest ATR% = tighter stop, less gap risk
            candidates = sorted(candidates, key=lambda s: s['atr'] / s['entry'] if s['entry'] > 0 else 999)
        elif rank_mode == 'combo':
            # Score = num_strategies * 2 + (1 / ATR%)  → more strategies + tighter stop
            candidates = sorted(candidates, key=lambda s: len(s['strategies']) * 2 + (s['entry'] / s['atr'] if s['atr'] > 0 else 0), reverse=True)

        entered = False
        for signal in candidates:
            risk = signal['risk_per_share']
            if risk <= 0:
                continue

            shares = int(MAX_RISK_PER_TRADE / risk)
            if shares <= 0:
                continue

            position_cost = signal['entry'] * shares
            if capital_used + position_cost > MAX_CAPITAL:
                continue

            # Enter the trade
            pos = {
                'ticker': signal['ticker'],
                'entry_date': date_str,
                'entry': signal['entry'],
                'initial_sl': signal['stop'],
                'current_sl': signal['stop'],
                'risk_per_share': risk,
                'shares': shares,
                'capital_at_risk': position_cost,
                'strategies': signal['strategies'],
                'trail_active': False,
                'max_price': signal['entry'],
                'last_price': signal['entry'],
                'days_held': 0,
                'status': 'OPEN',
                'exit_date': None,
                'exit_price': None,
                'pnl': None,
                'reason': None,
            }
            open_positions.append(pos)
            capital_used += position_cost
            entered = True
            break  # Only 1 trade per day

        # Record equity curve
        open_pnl = sum((p['last_price'] - p['entry']) * p['shares'] for p in open_positions)
        closed_pnl = sum(t['pnl'] for t in trades)
        equity_curve.append({
            'date': date_str,
            'total_pnl': round(closed_pnl + open_pnl, 2),
            'closed_pnl': round(closed_pnl, 2),
            'open_positions': len(open_positions),
            'capital_used': round(capital_used, 2),
            'entered': entered,
        })

    # Close remaining open positions at last price
    for pos in open_positions:
        pnl = (pos['last_price'] - pos['entry']) * pos['shares']
        pos['pnl'] = pnl
        pos['exit_price'] = pos['last_price']
        pos['reason'] = 'End of backtest'
        pos['status'] = 'CLOSED'
        trades.append(pos)

    return trades, equity_curve


def main():
    parser = argparse.ArgumentParser(description="SIM Backtest 1: Confluence Trading")
    parser.add_argument("--output", default="dashboard/public/sim_backtest_data.json")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility")
    parser.add_argument("--rank", default="tightest_atr", choices=['random', 'most_strategies', 'tightest_atr', 'combo'],
                        help="How to pick the best trade each day")
    args = parser.parse_args()

    random.seed(args.seed)

    print("=" * 60)
    print("  📊 SIM BACKTEST 1: Confluence Trading")
    print("=" * 60)
    print(f"  Rules:")
    print(f"    • Universe: S&P500 + NASDAQ100 (> $10)")
    print(f"    • Entry: 1 confluence (2+ strategies) per day")
    print(f"    • Ranking: {args.rank}")
    print(f"    • Risk: ${MAX_RISK_PER_TRADE} max per trade")
    print(f"    • Capital: ${MAX_CAPITAL:,.0f} max")
    print(f"    • Exit: Trail SL (2.5R → EMA20 - 1×ATR)")
    print(f"    • Period: 5 years")
    print(f"    • Seed: {args.seed}")
    print()

    # Load universe
    tickers = get_universe()
    print(f"  Universe: {len(tickers)} stocks")

    # Download data (6y for indicator warmup — trading starts ~Jan 2021)
    all_data = download_data(tickers, period='6y')

    # Find confluence signals
    daily_signals, all_data_ind = find_daily_signals(all_data)

    # Simulate
    trades, equity_curve = simulate_trades(daily_signals, all_data_ind, rank_mode=args.rank)

    # Stats
    winners = [t for t in trades if t['pnl'] and t['pnl'] > 0]
    losers = [t for t in trades if t['pnl'] and t['pnl'] <= 0]
    total_pnl = sum(t['pnl'] for t in trades if t['pnl'])
    win_rate = len(winners) / len(trades) * 100 if trades else 0
    avg_win = sum(t['pnl'] for t in winners) / len(winners) if winners else 0
    avg_loss = sum(t['pnl'] for t in losers) / len(losers) if losers else 0
    avg_r = sum((t['pnl'] / (t['risk_per_share'] * t['shares'])) for t in trades if t['pnl'] and t['risk_per_share'] > 0) / len(trades) if trades else 0
    max_drawdown = 0
    peak = 0
    for pt in equity_curve:
        peak = max(peak, pt['total_pnl'])
        dd = peak - pt['total_pnl']
        max_drawdown = max(max_drawdown, dd)

    avg_days = sum(t['days_held'] for t in trades) / len(trades) if trades else 0

    print()
    print("=" * 60)
    print(f"  📊 RESULTS")
    print(f"  Total trades: {len(trades)}")
    print(f"  Winners: {len(winners)} | Losers: {len(losers)}")
    print(f"  Win Rate: {win_rate:.1f}%")
    print(f"  Total PnL: ${total_pnl:,.2f}")
    print(f"  Avg Win: ${avg_win:.2f} | Avg Loss: ${avg_loss:.2f}")
    print(f"  Avg R: {avg_r:.2f}")
    print(f"  Max Drawdown: ${max_drawdown:,.2f}")
    print(f"  Avg Days Held: {avg_days:.1f}")
    print("=" * 60)

    # Exit reason breakdown
    reasons = {}
    for t in trades:
        r = t['reason'] or 'Unknown'
        reasons[r] = reasons.get(r, 0) + 1

    # Build output
    output = {
        'lastUpdated': datetime.now(NY_TZ).strftime('%Y-%m-%d %I:%M %p %Z'),
        'params': {
            'max_risk_per_trade': MAX_RISK_PER_TRADE,
            'max_capital': MAX_CAPITAL,
            'trail_start_r': TRAIL_START_R,
            'trail_atr_buf': TRAIL_ATR_BUF,
            'period': '5y',
            'seed': args.seed,
            'rank_mode': args.rank,
            'universe_size': len(tickers),
            'confluence_min': 2,
        },
        'summary': {
            'total_trades': len(trades),
            'winners': len(winners),
            'losers': len(losers),
            'win_rate': round(win_rate, 1),
            'total_pnl': round(total_pnl, 2),
            'avg_win': round(avg_win, 2),
            'avg_loss': round(avg_loss, 2),
            'avg_r': round(avg_r, 2),
            'max_drawdown': round(max_drawdown, 2),
            'avg_days_held': round(avg_days, 1),
            'profit_factor': round(abs(sum(t['pnl'] for t in winners)) / abs(sum(t['pnl'] for t in losers)), 2) if losers and sum(t['pnl'] for t in losers) != 0 else 0,
            'exit_reasons': reasons,
        },
        'trades': [{
            'ticker': t['ticker'],
            'entry_date': t['entry_date'],
            'exit_date': t['exit_date'],
            'entry': round(t['entry'], 2),
            'exit_price': round(t['exit_price'], 2) if t['exit_price'] else None,
            'shares': t['shares'],
            'capital_used': round(t['capital_at_risk'], 2),
            'pnl': round(t['pnl'], 2) if t['pnl'] else 0,
            'r_multiple': round(t['pnl'] / (t['risk_per_share'] * t['shares']), 2) if t['pnl'] and t['risk_per_share'] > 0 else 0,
            'days_held': t['days_held'],
            'reason': t['reason'],
            'strategies': t['strategies'],
            'trail_active': t['trail_active'],
        } for t in trades],
        'equity_curve': equity_curve[::5],  # Sample every 5th point to reduce size
    }

    # Save
    out_path = Path(args.output)
    out_path.parent.mkdir(exist_ok=True)
    out_path.write_text(json.dumps(output, indent=2))
    print(f"\n  ✅ Saved to {out_path}")


if __name__ == "__main__":
    main()
