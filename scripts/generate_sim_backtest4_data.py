#!/usr/bin/env python3
"""
SIM Backtest 4: Universe Comparison (Confluence + Regime)

Same rules as Backtest 3, but tests different stock universes to find
the one with least drawdown and losing streak:
  1. Mega Caps (top ~30 by market cap)
  2. Large Caps (top ~80)
  3. Mid Caps (ranked 80-275)
  4. High Volume (top 50 by avg daily volume)
  5. Full Universe (275 stocks - baseline)

Focus: minimize max losing streak and max drawdown.
"""

import argparse
import json
import random
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
import yfinance as yf

NY_TZ = ZoneInfo("America/New_York")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_sim_backtest_data import (
    get_universe, download_data, add_indicators,
    check_ma_bounce, check_breakout, check_rsi_trend, check_higher_high,
    find_daily_signals,
    simulate_trades, MAX_RISK_PER_TRADE, MAX_CAPITAL, TRAIL_START_R, TRAIL_ATR_BUF
)

# Mega caps - top 30 US stocks by market cap
MEGA_CAPS = [
    'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'BRK-B',
    'JPM', 'V', 'UNH', 'MA', 'JNJ', 'XOM', 'HD', 'PG', 'COST', 'ABBV',
    'CRM', 'AVGO', 'MRK', 'KO', 'PEP', 'LLY', 'WMT', 'BAC', 'NFLX',
    'AMD', 'ORCL', 'ADBE'
]

# Large caps - top ~80
LARGE_CAPS = MEGA_CAPS + [
    'CSCO', 'ACN', 'TMO', 'MCD', 'ABT', 'DHR', 'TXN', 'PM', 'NEE',
    'INTC', 'CMCSA', 'VZ', 'NKE', 'COP', 'RTX', 'HON', 'INTU', 'AMGN',
    'LOW', 'QCOM', 'UPS', 'GS', 'BLK', 'CAT', 'SPGI', 'AXP', 'SYK',
    'BA', 'MDLZ', 'ISRG', 'DE', 'GILD', 'ADI', 'MMC', 'LMT', 'TJX',
    'VRTX', 'CVS', 'BKNG', 'SBUX', 'PANW', 'ADP', 'LRCX', 'REGN',
    'NOW', 'MU', 'KLAC', 'SNPS', 'CDNS', 'MRVL'
]


def get_spy_regime(period='5y'):
    """Download SPY and compute bull/bear regime."""
    print("  📥 Downloading SPY for regime filter...")
    spy_raw = yf.download('SPY', start='2019-06-01', progress=False)
    if isinstance(spy_raw.columns, pd.MultiIndex):
        spy_df = spy_raw.xs('SPY', level='Ticker', axis=1).reset_index()
    else:
        spy_df = spy_raw.reset_index()
    col_map = {c: c for c in spy_df.columns}
    if 'index' in spy_df.columns:
        col_map['index'] = 'Date'
    spy_df = spy_df.rename(columns=col_map)
    spy_df['sma200'] = spy_df['Close'].rolling(200).mean()

    bull_dates = set()
    for _, row in spy_df.iterrows():
        if pd.notna(row['sma200']) and row['Close'] > row['sma200']:
            d = row['Date']
            if hasattr(d, 'strftime'):
                bull_dates.add(d.strftime('%Y-%m-%d'))
            else:
                bull_dates.add(str(d)[:10])
    return bull_dates


def find_confluence_for_subset(all_data, ticker_subset):
    """Find confluence signals only for a subset of tickers."""
    print(f"    🔍 Scanning {len(ticker_subset)} stocks for confluence...")
    daily_signals = {}
    all_data_ind = {}

    for ticker in ticker_subset:
        if ticker not in all_data:
            continue
        df = all_data[ticker]
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

            if len(strategies) >= 2:
                date_val = row['Date']
                if hasattr(date_val, 'strftime'):
                    date_str = date_val.strftime('%Y-%m-%d')
                else:
                    date_str = str(date_val)[:10]

                entry = float(row['Close'])
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

    print(f"    ✅ Found signals on {len(daily_signals)} days")
    return daily_signals, all_data_ind


def compute_stats(trades, equity_curve):
    """Compute summary stats."""
    if not trades:
        return {
            'total_trades': 0, 'winners': 0, 'losers': 0, 'win_rate': 0,
            'total_pnl': 0, 'avg_win': 0, 'avg_loss': 0, 'avg_r': 0,
            'max_drawdown': 0, 'max_losing_streak': 0, 'avg_days_held': 0,
            'profit_factor': 0, 'exit_reasons': {},
        }

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

    max_streak = 0
    cur = 0
    for t in trades:
        if t['pnl'] and t['pnl'] < 0:
            cur += 1
            max_streak = max(max_streak, cur)
        else:
            cur = 0

    reasons = {}
    for t in trades:
        r = t['reason'] or 'Unknown'
        reasons[r] = reasons.get(r, 0) + 1

    gross_wins = abs(sum(t['pnl'] for t in winners)) if winners else 0
    gross_losses = abs(sum(t['pnl'] for t in losers)) if losers else 1
    profit_factor = round(gross_wins / gross_losses, 2) if gross_losses > 0 else 0

    return {
        'total_trades': len(trades),
        'winners': len(winners),
        'losers': len(losers),
        'win_rate': round(win_rate, 1),
        'total_pnl': round(total_pnl, 2),
        'avg_win': round(avg_win, 2),
        'avg_loss': round(avg_loss, 2),
        'avg_r': round(avg_r, 2),
        'max_drawdown': round(max_drawdown, 2),
        'max_losing_streak': max_streak,
        'avg_days_held': round(avg_days, 1),
        'profit_factor': profit_factor,
        'exit_reasons': reasons,
    }


def format_trades(trades):
    """Format trades for JSON."""
    return [{
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
        'combo': ' + '.join(sorted(t['strategies'])),
        'trail_active': t['trail_active'],
    } for t in trades]


def main():
    parser = argparse.ArgumentParser(description="SIM Backtest 4: Universe Comparison")
    parser.add_argument("--output", default="dashboard/public/sim_backtest4_data.json")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--rank", default="tightest_atr")
    args = parser.parse_args()

    random.seed(args.seed)

    print("=" * 60)
    print("  📊 SIM BACKTEST 4: Universe Comparison")
    print("  Focus: LEAST drawdown & losing streak")
    print("=" * 60)
    print(f"  Same rules as Backtest 3 (Confluence + Regime)")
    print(f"  Testing: Mega Caps, Large Caps, Mid Caps, High Volume, Full")
    print()

    # Full universe
    all_tickers = get_universe()
    print(f"  Full universe: {len(all_tickers)} stocks")

    # Download all data (6y for indicator warmup)
    all_data = download_data(all_tickers, period='6y')

    # SPY regime
    bull_dates = get_spy_regime()

    # Determine high-volume stocks (top 50 by avg volume)
    print("  📊 Computing average volumes...")
    avg_volumes = {}
    for ticker, df in all_data.items():
        if 'Volume' in df.columns:
            avg_vol = df['Volume'].mean()
            if pd.notna(avg_vol):
                avg_volumes[ticker] = avg_vol
    high_vol_tickers = sorted(avg_volumes.keys(), key=lambda t: avg_volumes[t], reverse=True)[:50]
    print(f"  ✅ High volume top 50: {high_vol_tickers[:10]}...")

    # Mid caps = full universe minus large caps
    mid_cap_tickers = [t for t in all_tickers if t not in LARGE_CAPS]

    # Define universes to test
    universes = {
        'Mega Caps (30)': [t for t in MEGA_CAPS if t in all_data],
        'Large Caps (80)': [t for t in LARGE_CAPS if t in all_data],
        'Mid Caps (~195)': mid_cap_tickers,
        'High Volume (50)': high_vol_tickers,
        'Full Universe (275)': list(all_data.keys()),
    }

    # Run each universe
    results = {}
    for uni_name, ticker_list in universes.items():
        random.seed(args.seed)
        print(f"\n{'─' * 55}")
        print(f"  ▶ {uni_name}: {len(ticker_list)} stocks")
        print(f"{'─' * 55}")

        daily_signals, all_data_ind = find_confluence_for_subset(all_data, ticker_list)

        # Apply regime filter
        filtered = {d: sigs for d, sigs in daily_signals.items() if d in bull_dates}
        print(f"    📉 Regime filter: {len(daily_signals)} → {len(filtered)} days")

        trades, equity_curve = simulate_trades(filtered, all_data_ind, rank_mode=args.rank)
        summary = compute_stats(trades, equity_curve)

        print(f"    📊 Trades={summary['total_trades']} WR={summary['win_rate']}% PnL=${summary['total_pnl']:,.0f} Streak={summary['max_losing_streak']} DD=${summary['max_drawdown']:,.0f} PF={summary['profit_factor']}")

        results[uni_name] = {
            'summary': summary,
            'trades': format_trades(trades),
            'equity_curve': equity_curve[::3],
            'tickers': ticker_list[:50],  # Store first 50 for display
            'ticker_count': len(ticker_list),
        }

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
            'regime': 'SPY > 200 SMA',
            'confluence_min': 2,
        },
        'universes': results,
    }

    out_path = Path(args.output)
    out_path.parent.mkdir(exist_ok=True)
    out_path.write_text(json.dumps(output, indent=2))

    # Print comparison sorted by streak (our focus)
    print(f"\n{'=' * 70}")
    print(f"  📊 COMPARISON (sorted by Max Losing Streak)")
    print(f"  {'Universe':<22} {'Trades':>6} {'WR%':>6} {'PnL':>10} {'Streak':>7} {'MaxDD':>9} {'PF':>5}")
    print(f"  {'─' * 63}")
    for name, r in sorted(results.items(), key=lambda x: x[1]['summary']['max_losing_streak']):
        s = r['summary']
        best = '⭐' if s['max_losing_streak'] == min(r2['summary']['max_losing_streak'] for r2 in results.values()) else '  '
        print(f"  {name:<22} {s['total_trades']:>6} {s['win_rate']:>5.1f}% ${s['total_pnl']:>9,.0f} {s['max_losing_streak']:>7} ${s['max_drawdown']:>8,.0f} {s['profit_factor']:>5} {best}")
    print(f"{'=' * 70}")
    print(f"\n  ✅ Saved to {out_path}")


if __name__ == "__main__":
    main()
