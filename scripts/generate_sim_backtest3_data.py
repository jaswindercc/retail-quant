#!/usr/bin/env python3
"""
SIM Backtest 3: Confluence + Regime Filter (SPY > 200 SMA)

THE WINNING STRATEGY:
- Only trade when SPY is above its 200-day SMA (bull market)
- Require 2+ strategies to fire on the same stock same day
- Pick the stock with lowest ATR% (tightest stop)
- 1 trade per day max

This produced: 30.5% WR, $29,902 PnL, Streak=11, PF=1.83
"""

import argparse
import json
import random
import sys
from collections import Counter
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


def get_spy_regime(period='5y'):
    """Download SPY and compute bull/bear regime (SPY > 200 SMA = bull)."""
    print("  📥 Downloading SPY for regime filter...")
    spy_raw = yf.download('SPY', start='2019-06-01', progress=False)
    if isinstance(spy_raw.columns, pd.MultiIndex):
        spy_df = spy_raw.xs('SPY', level='Ticker', axis=1).reset_index()
    else:
        spy_df = spy_raw.reset_index()

    # Normalize columns
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

    print(f"  ✅ SPY bull regime: {len(bull_dates)} / {len(spy_df)} days ({len(bull_dates)/len(spy_df)*100:.0f}%)")
    return bull_dates


def main():
    parser = argparse.ArgumentParser(description="SIM Backtest 3: Confluence + Regime")
    parser.add_argument("--output", default="dashboard/public/sim_backtest3_data.json")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--rank", default="tightest_atr",
                        choices=['random', 'most_strategies', 'tightest_atr', 'combo'])
    args = parser.parse_args()

    random.seed(args.seed)

    print("=" * 60)
    print("  📊 SIM BACKTEST 3: Confluence + Regime Filter")
    print("=" * 60)
    print(f"  Rules:")
    print(f"    • Regime: SPY > 200 SMA (skip bear markets)")
    print(f"    • Signal: 2+ strategies fire on same stock same day")
    print(f"    • Strategies: MA Bounce, Breakout, RSI Trend, Higher High")
    print(f"    • Pick: Lowest ATR% stock each day")
    print(f"    • Risk: ${MAX_RISK_PER_TRADE} per trade, ${MAX_CAPITAL:,.0f} max capital")
    print(f"    • Exit: Trail SL (2.5R activate → EMA20 - 1×ATR)")
    print(f"    • Seed: {args.seed}")
    print()

    # Universe
    tickers = get_universe()
    print(f"  Universe: {len(tickers)} stocks")

    # Download data
    all_data = download_data(tickers, period='6y')

    # SPY regime
    bull_dates = get_spy_regime()

    # Find confluence signals
    daily_signals, all_data_ind = find_daily_signals(all_data)

    # Apply regime filter
    filtered_signals = {d: sigs for d, sigs in daily_signals.items() if d in bull_dates}
    bear_days_removed = len(daily_signals) - len(filtered_signals)
    print(f"  📉 Regime filter: {len(daily_signals)} → {len(filtered_signals)} signal days (removed {bear_days_removed} bear days)")

    # Simulate
    trades, equity_curve = simulate_trades(filtered_signals, all_data_ind, rank_mode=args.rank)

    # === Detailed Analytics ===

    # 1. Combo breakdown: which strategy combinations appear most?
    combo_stats = {}  # "Breakout + RSI Trend" -> {count, wins, pnl}
    for t in trades:
        combo_key = ' + '.join(sorted(t['strategies']))
        if combo_key not in combo_stats:
            combo_stats[combo_key] = {'count': 0, 'wins': 0, 'total_pnl': 0}
        combo_stats[combo_key]['count'] += 1
        if t['pnl'] and t['pnl'] > 0:
            combo_stats[combo_key]['wins'] += 1
        combo_stats[combo_key]['total_pnl'] += t['pnl'] if t['pnl'] else 0

    # Compute win rate per combo
    for k, v in combo_stats.items():
        v['win_rate'] = round(v['wins'] / v['count'] * 100, 1) if v['count'] > 0 else 0
        v['total_pnl'] = round(v['total_pnl'], 2)

    # 2. Stock frequency: which stocks appear most?
    stock_stats = {}
    for t in trades:
        tk = t['ticker']
        if tk not in stock_stats:
            stock_stats[tk] = {'count': 0, 'wins': 0, 'total_pnl': 0}
        stock_stats[tk]['count'] += 1
        if t['pnl'] and t['pnl'] > 0:
            stock_stats[tk]['wins'] += 1
        stock_stats[tk]['total_pnl'] += t['pnl'] if t['pnl'] else 0

    for k, v in stock_stats.items():
        v['win_rate'] = round(v['wins'] / v['count'] * 100, 1) if v['count'] > 0 else 0
        v['total_pnl'] = round(v['total_pnl'], 2)

    # Top stocks by frequency
    top_stocks = sorted(stock_stats.items(), key=lambda x: x[1]['count'], reverse=True)[:20]
    # Best stocks by PnL
    best_stocks = sorted(stock_stats.items(), key=lambda x: x[1]['total_pnl'], reverse=True)[:10]
    # Worst stocks by PnL
    worst_stocks = sorted(stock_stats.items(), key=lambda x: x[1]['total_pnl'])[:10]

    # 3. Monthly performance
    monthly_pnl = {}
    for t in trades:
        if t['entry_date']:
            month = t['entry_date'][:7]  # YYYY-MM
            monthly_pnl[month] = monthly_pnl.get(month, 0) + (t['pnl'] if t['pnl'] else 0)
    monthly_pnl = {k: round(v, 2) for k, v in sorted(monthly_pnl.items())}

    # 4. Signals per day distribution (how many candidates per day)
    candidates_per_day = [len(sigs) for sigs in filtered_signals.values()]
    avg_candidates = sum(candidates_per_day) / len(candidates_per_day) if candidates_per_day else 0

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

    print()
    print("=" * 60)
    print(f"  📊 RESULTS")
    print(f"  Total trades: {len(trades)}")
    print(f"  Win Rate: {win_rate:.1f}% | PnL: ${total_pnl:,.2f}")
    print(f"  Avg Win: ${avg_win:.2f} | Avg Loss: ${avg_loss:.2f}")
    print(f"  Profit Factor: {profit_factor} | Max Streak: {max_streak}")
    print(f"  Max Drawdown: ${max_drawdown:,.2f}")
    print(f"  Avg Candidates/Day: {avg_candidates:.1f}")
    print()
    print(f"  📋 TOP COMBOS:")
    for k, v in sorted(combo_stats.items(), key=lambda x: x[1]['count'], reverse=True):
        print(f"    {k:<40} trades={v['count']:>3}  WR={v['win_rate']}%  PnL=${v['total_pnl']:>8,.0f}")
    print()
    print(f"  🏆 TOP STOCKS (by frequency):")
    for tk, v in top_stocks[:10]:
        print(f"    {tk:<6} trades={v['count']:>3}  WR={v['win_rate']}%  PnL=${v['total_pnl']:>8,.0f}")
    print("=" * 60)

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
            'regime': 'SPY > 200 SMA',
            'confluence_min': 2,
            'strategies': ['MA Bounce', 'Breakout', 'RSI Trend', 'Higher High'],
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
            'max_losing_streak': max_streak,
            'avg_days_held': round(avg_days, 1),
            'profit_factor': profit_factor,
            'exit_reasons': reasons,
            'avg_candidates_per_day': round(avg_candidates, 1),
            'bull_days': len(bull_dates),
            'bear_days_skipped': bear_days_removed,
        },
        'combo_breakdown': combo_stats,
        'stock_breakdown': {
            'top_by_frequency': [{
                'ticker': tk, 'count': v['count'],
                'win_rate': v['win_rate'], 'pnl': v['total_pnl']
            } for tk, v in top_stocks],
            'best_by_pnl': [{
                'ticker': tk, 'count': v['count'],
                'win_rate': v['win_rate'], 'pnl': v['total_pnl']
            } for tk, v in best_stocks],
            'worst_by_pnl': [{
                'ticker': tk, 'count': v['count'],
                'win_rate': v['win_rate'], 'pnl': v['total_pnl']
            } for tk, v in worst_stocks],
        },
        'monthly_pnl': monthly_pnl,
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
            'combo': ' + '.join(sorted(t['strategies'])),
            'trail_active': t['trail_active'],
            'atr_pct': round(t['risk_per_share'] / t['entry'] * 100, 2) if t['entry'] > 0 else 0,
        } for t in trades],
        'equity_curve': equity_curve[::3],
    }

    out_path = Path(args.output)
    out_path.parent.mkdir(exist_ok=True)
    out_path.write_text(json.dumps(output, indent=2))
    print(f"\n  ✅ Saved to {out_path}")


if __name__ == "__main__":
    main()
