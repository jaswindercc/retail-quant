#!/usr/bin/env python3
"""
SIM Backtest 2: Top 3 Strategies (Individual) + Regime-Filtered Confluence

Runs separate backtests for each of the top 3 strategies:
  1. Breakout
  2. MA Bounce
  3. RSI Trend
  4. Confluence 2+ WITH SPY > SMA200 regime filter (skip bear markets)

Same rules as Backtest 1 but tests each strategy in isolation,
plus a regime-filtered version to reduce losing streaks.
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

# Import shared functions from backtest 1
sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_sim_backtest_data import (
    get_universe, download_data, add_indicators,
    check_ma_bounce, check_breakout, check_rsi_trend, check_higher_high,
    find_daily_signals,
    simulate_trades, MAX_RISK_PER_TRADE, MAX_CAPITAL, TRAIL_START_R, TRAIL_ATR_BUF
)

STRATEGY_CHECKS = {
    'Breakout': ('row_prev', check_breakout),
    'MA Bounce': ('row_prev', check_ma_bounce),
    'RSI Trend': ('row_prev', check_rsi_trend),
}


def find_single_strategy_signals(all_data, strategy_name, check_type, check_fn):
    """
    Scan all stocks for a single strategy's signals.
    check_type: 'row_prev' for (row, prev, atr) or 'df_i' for (df, i, atr)
    Returns: (daily_signals dict, all_data_ind dict)
    """
    print(f"  🔍 Scanning for {strategy_name} signals...")
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

            # Call check function with appropriate signature
            if check_type == 'row_prev':
                triggered = check_fn(row, prev, atr)
            else:
                triggered = check_fn(df, i, atr)

            if triggered:
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
                    'strategies': [strategy_name],
                    'entry': entry,
                    'stop': stop,
                    'risk_per_share': risk,
                    'atr': atr,
                    'ema20': float(row['ema20']),
                })

        all_data_ind[ticker] = df

    print(f"  ✅ Found {strategy_name} signals on {len(daily_signals)} trading days")
    return daily_signals, all_data_ind


def compute_stats(trades, equity_curve):
    """Compute summary stats from trades list."""
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
    """Format trades for JSON output."""
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
        'trail_active': t['trail_active'],
    } for t in trades]


def main():
    parser = argparse.ArgumentParser(description="SIM Backtest 2: Top 3 Strategies")
    parser.add_argument("--output", default="dashboard/public/sim_backtest2_data.json")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility")
    parser.add_argument("--rank", default="tightest_atr", choices=['random', 'most_strategies', 'tightest_atr', 'combo'],
                        help="How to pick the best trade each day")
    args = parser.parse_args()

    random.seed(args.seed)

    print("=" * 60)
    print("  📊 SIM BACKTEST 2: Top 3 + Regime-Filtered Confluence")
    print("=" * 60)
    print(f"  Strategies: Breakout, MA Bounce, RSI Trend + Confluence w/ Regime")
    print(f"  Rules:")
    print(f"    • Universe: S&P500 + NASDAQ100 (> $10)")
    print(f"    • Entry: 1 signal per day per strategy")
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

    # Download data once
    all_data = download_data(tickers, period='5y')

    # Download SPY for regime filter
    print("  📥 Downloading SPY for regime filter...")
    spy_raw = yf.download('SPY', period='5y', progress=False)
    if isinstance(spy_raw.columns, pd.MultiIndex):
        spy_df = spy_raw.xs('SPY', level='Ticker', axis=1).reset_index()
    else:
        spy_df = spy_raw.reset_index()
    # Normalize column names
    col_map = {c: c for c in spy_df.columns}
    if 'index' in spy_df.columns:
        col_map['index'] = 'Date'
    spy_df = spy_df.rename(columns=col_map)
    spy_df['sma200'] = spy_df['Close'].rolling(200).mean()
    # Build a set of dates when SPY > SMA200 (bull regime)
    bull_dates = set()
    for _, row in spy_df.iterrows():
        if pd.notna(row['sma200']) and row['Close'] > row['sma200']:
            d = row['Date']
            if hasattr(d, 'strftime'):
                bull_dates.add(d.strftime('%Y-%m-%d'))
            else:
                bull_dates.add(str(d)[:10])
    print(f"  ✅ SPY bull regime days: {len(bull_dates)} / {len(spy_df)}")

    # Run each individual strategy
    results = {}
    for strat_name, (check_type, check_fn) in STRATEGY_CHECKS.items():
        random.seed(args.seed)
        print(f"\n{'─' * 50}")
        print(f"  ▶ Running: {strat_name}")
        print(f"{'─' * 50}")

        daily_signals, all_data_ind = find_single_strategy_signals(all_data, strat_name, check_type, check_fn)
        trades, equity_curve = simulate_trades(daily_signals, all_data_ind, rank_mode=args.rank)
        summary = compute_stats(trades, equity_curve)

        print(f"  Trades: {summary['total_trades']} | WR: {summary['win_rate']}% | PnL: ${summary['total_pnl']:,.2f} | Streak: {summary['max_losing_streak']} | PF: {summary['profit_factor']}")

        results[strat_name] = {
            'summary': summary,
            'trades': format_trades(trades),
            'equity_curve': equity_curve[::5],
        }

    # Run Confluence 2+ WITH regime filter (the star of the show)
    random.seed(args.seed)
    print(f"\n{'─' * 50}")
    print(f"  ▶ Running: Confluence + Regime (SPY > 200 SMA)")
    print(f"{'─' * 50}")

    daily_signals, all_data_ind = find_daily_signals(all_data)
    # Filter: only keep signals on bull regime days
    filtered_signals = {d: sigs for d, sigs in daily_signals.items() if d in bull_dates}
    print(f"  📉 Filtered: {len(daily_signals)} → {len(filtered_signals)} days (removed {len(daily_signals) - len(filtered_signals)} bear days)")

    trades, equity_curve = simulate_trades(filtered_signals, all_data_ind, rank_mode=args.rank)
    summary = compute_stats(trades, equity_curve)

    print(f"  Trades: {summary['total_trades']} | WR: {summary['win_rate']}% | PnL: ${summary['total_pnl']:,.2f} | Streak: {summary['max_losing_streak']} | PF: {summary['profit_factor']}")

    results['Confluence + Regime'] = {
        'summary': summary,
        'trades': format_trades(trades),
        'equity_curve': equity_curve[::5],
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
            'universe_size': len(tickers),
            'strategies': list(STRATEGY_CHECKS.keys()) + ['Confluence + Regime'],
        },
        'strategies': results,
    }

    # Save
    out_path = Path(args.output)
    out_path.parent.mkdir(exist_ok=True)
    out_path.write_text(json.dumps(output, indent=2))

    # Print comparison
    print(f"\n{'=' * 60}")
    print(f"  📊 COMPARISON")
    print(f"  {'Strategy':<22} {'Trades':>6} {'WR%':>6} {'PnL':>10} {'Streak':>7} {'PF':>5}")
    print(f"  {'─' * 55}")
    for name, r in results.items():
        s = r['summary']
        marker = ' ⭐' if name == 'Confluence + Regime' else ''
        print(f"  {name:<22} {s['total_trades']:>6} {s['win_rate']:>5.1f}% ${s['total_pnl']:>9,.0f} {s['max_losing_streak']:>7} {s['profit_factor']:>5}{marker}")
    print(f"  {'─' * 55}")
    print(f"  {'Backtest 1 (ref)':<22} {'379':>6} {'23.5':>5}% ${'24,864':>9} {'18':>7} {'1.40':>5}")
    print(f"{'=' * 60}")
    print(f"\n  ✅ Saved to {out_path}")


if __name__ == "__main__":
    main()
