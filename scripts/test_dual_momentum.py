#!/usr/bin/env python3
"""
Dual Momentum Test - Top-10 Rotation with Risk On/Off Filter

Rule: Only hold stocks when SPY's 3-month return > 0%.
When SPY 3mo return < 0% -> go to cash (hold nothing).

This one filter should avoid bear markets entirely.
"""

import json
import sys
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

sys.path.insert(0, str(Path(__file__).parent))
from generate_rotation_top3 import SP500, download_data, rank_by_momentum

CAPITAL = 40000.0
MAX_POSITIONS = 10
LOOKBACK_DAYS = 63
START_DATE = '2020-06-01'
END_DATE = '2026-06-04'
TRADE_START = '2021-01-01'


def get_spy_momentum(stock_data, date, lookback_days):
    """Check if SPY 3-month return is positive."""
    if 'SPY' not in stock_data:
        return True  # default to risk-on if no data
    spy = stock_data['SPY']
    mask = spy.index <= date
    subset = spy[mask]
    if len(subset) < lookback_days:
        return True
    price_now = float(subset['Close'].iloc[-1])
    price_then = float(subset['Close'].iloc[-lookback_days])
    if price_then <= 0:
        return True
    return (price_now / price_then - 1) > 0  # positive = risk on


def simulate_dual_momentum(stock_data, use_filter=True):
    """
    use_filter=True: Dual momentum (skip when SPY 3mo < 0)
    use_filter=False: Always in market (baseline)
    """
    trade_start = pd.Timestamp(TRADE_START)
    
    all_dates = set()
    for df in stock_data.values():
        all_dates.update(df.index)
    trading_dates = sorted([d for d in all_dates if d >= trade_start])
    
    trades = []
    open_positions = {}
    running_pnl = 0
    last_rotation_week = None
    equity_curve = []
    weekly_log = []
    risk_on_weeks = 0
    risk_off_weeks = 0

    for date in trading_dates:
        week_key = date.isocalendar()[:2]
        is_rotation_day = (week_key != last_rotation_week and date.weekday() == 0)
        
        # -- Weekly rotation --
        if is_rotation_day:
            last_rotation_week = week_key
            ranking = rank_by_momentum(stock_data, date, LOOKBACK_DAYS)
            top_n_tickers = [s['ticker'] for s in ranking[:MAX_POSITIONS]]
            
            # DUAL MOMENTUM FILTER
            risk_on = True
            if use_filter:
                risk_on = get_spy_momentum(stock_data, date, LOOKBACK_DAYS)
            
            if risk_on:
                risk_on_weeks += 1
            else:
                risk_off_weeks += 1
                # Risk off: sell everything
                top_n_tickers = []
            
            # Log
            weekly_log.append({
                'week': date.strftime('%Y-%m-%d'),
                'risk_on': risk_on,
                'top_10': [{'ticker': s['ticker'], 'return_pct': s['return_pct'], 'price': s['price']} for s in ranking[:10]],
            })
            
            # Sell positions not in target list
            sell_list = []
            for ticker, pos in open_positions.items():
                if ticker not in top_n_tickers:
                    if ticker in stock_data and date in stock_data[ticker].index:
                        exit_price = float(stock_data[ticker].loc[date]['Close'])
                        if pd.isna(exit_price):
                            continue
                        pnl = (exit_price - pos['entry_price']) * pos['shares']
                        trades.append({
                            'stock': ticker,
                            'entryDate': pos['entry_date'].strftime('%Y-%m-%d'),
                            'exitDate': date.strftime('%Y-%m-%d'),
                            'entryPrice': round(pos['entry_price'], 2),
                            'exitPrice': round(float(exit_price), 2),
                            'pnlDollar': round(pnl, 2),
                            'pnlPct': round((float(exit_price) / pos['entry_price'] - 1) * 100, 2),
                            'exitReason': 'Risk Off' if not risk_on else 'Rotated Out',
                            'durationDays': (date - pos['entry_date']).days,
                            'rank_at_entry': pos['rank'],
                        })
                        running_pnl += pnl
                        sell_list.append(ticker)
            
            for t in sell_list:
                del open_positions[t]
            
            # Buy new (only if risk on)
            if risk_on:
                position_size = CAPITAL / MAX_POSITIONS
                for i, ticker in enumerate(top_n_tickers):
                    if ticker in open_positions:
                        continue
                    if len(open_positions) >= MAX_POSITIONS:
                        break
                    if ticker not in stock_data or date not in stock_data[ticker].index:
                        continue
                    
                    entry_price = float(stock_data[ticker].loc[date]['Close'])
                    if pd.isna(entry_price) or entry_price <= 0:
                        continue
                    
                    shares = int(position_size / entry_price)
                    if shares <= 0:
                        continue
                    
                    open_positions[ticker] = {
                        'entry_price': entry_price,
                        'entry_date': date,
                        'shares': shares,
                        'stop_price': 0,
                        'rank': i + 1,
                    }
        
        # Track equity
        unrealized = 0
        for ticker, pos in open_positions.items():
            if ticker in stock_data and date in stock_data[ticker].index:
                cp = stock_data[ticker].loc[date]['Close']
                if not pd.isna(cp):
                    unrealized += (float(cp) - pos['entry_price']) * pos['shares']
        equity_curve.append({
            'date': date.strftime('%Y-%m-%d'),
            'total_pnl': round(running_pnl + unrealized, 2),
        })
    
    # Close remaining
    last_date = trading_dates[-1]
    for ticker, pos in list(open_positions.items()):
        if ticker in stock_data:
            exit_price = float(stock_data[ticker].iloc[-1]['Close'])
            pnl = (exit_price - pos['entry_price']) * pos['shares']
            trades.append({
                'stock': ticker,
                'entryDate': pos['entry_date'].strftime('%Y-%m-%d'),
                'exitDate': last_date.strftime('%Y-%m-%d'),
                'entryPrice': round(pos['entry_price'], 2),
                'exitPrice': round(exit_price, 2),
                'pnlDollar': round(pnl, 2),
                'pnlPct': round((exit_price / pos['entry_price'] - 1) * 100, 2),
                'exitReason': 'Open',
                'durationDays': (last_date - pos['entry_date']).days,
                'rank_at_entry': pos['rank'],
            })
    
    return trades, equity_curve, weekly_log, risk_on_weeks, risk_off_weeks


def compute_stats(trades, equity_curve):
    closed = [t for t in trades if t['exitReason'] != 'Open']
    if not closed:
        return {}
    
    pnls = [t['pnlDollar'] for t in closed]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]
    
    gross_win = sum(wins) if wins else 0
    gross_loss = abs(sum(losses)) if losses else 1
    
    # Max drawdown from equity curve
    peak = -float('inf')
    max_dd = 0
    for pt in equity_curve:
        eq = pt['total_pnl']
        if eq > peak:
            peak = eq
        dd = peak - eq
        if dd > max_dd:
            max_dd = dd
    
    # Max lose streak
    max_streak = 0
    curr = 0
    for p in pnls:
        if p <= 0:
            curr += 1
            max_streak = max(max_streak, curr)
        else:
            curr = 0
    
    total_pnl = sum(pnls)
    
    return {
        'total_pnl': round(total_pnl, 0),
        'total_pct': round(total_pnl / CAPITAL * 100, 1),
        'trades': len(closed),
        'wins': len(wins),
        'losses': len(losses),
        'wr': round(len(wins) / len(closed) * 100, 1),
        'pf': round(gross_win / gross_loss, 2) if gross_loss > 0 else 99,
        'max_dd': round(max_dd, 0),
        'max_dd_pct': round(max_dd / CAPITAL * 100, 1),
        'avg_winner_pct': round(sum(t['pnlPct'] for t in closed if t['pnlDollar'] > 0) / max(len(wins), 1), 1),
        'avg_loser_pct': round(abs(sum(t['pnlPct'] for t in closed if t['pnlDollar'] <= 0)) / max(len(losses), 1), 1),
        'avg_duration': round(sum(t['durationDays'] for t in closed) / len(closed), 1),
        'max_lose_streak': max_streak,
    }


def main():
    print("=" * 70)
    print("  DUAL MOMENTUM TEST")
    print("  Filter: Only hold stocks when SPY 3-month return > 0%")
    print("  Top-10 Rotation | S&P 500 | 5 Years (2021-2026)")
    print("=" * 70)
    
    stock_data = download_data(SP500, START_DATE, END_DATE)
    
    # --- A: Always in market (no filter) ---
    print("\n  [A] Running: ALWAYS IN (no filter)...")
    trades_a, eq_a, log_a, _, _ = simulate_dual_momentum(stock_data, use_filter=False)
    stats_a = compute_stats(trades_a, eq_a)
    
    # --- B: Dual momentum (SPY filter) ---
    print("  [B] Running: DUAL MOMENTUM (risk off when SPY 3mo < 0)...")
    trades_b, eq_b, log_b, on_wks, off_wks = simulate_dual_momentum(stock_data, use_filter=True)
    stats_b = compute_stats(trades_b, eq_b)
    
    # --- SPY ---
    spy_pnl = 0
    if 'SPY' in stock_data:
        spy_df = stock_data['SPY']
        spy_sub = spy_df[spy_df.index >= pd.Timestamp(TRADE_START)]
        if len(spy_sub) > 0:
            sp = float(spy_sub['Close'].iloc[0])
            ep = float(spy_sub['Close'].iloc[-1])
            spy_pnl = (ep - sp) / sp * CAPITAL
    
    # --- Results ---
    print(f"\n{'='*70}")
    print(f"  {'METRIC':<22} {'A: ALWAYS IN':<20} {'B: DUAL MOM':<20} {'SPY B&H':<15}")
    print(f"  {'-'*68}")
    print(f"  {'Total P/L':<22} ${stats_a['total_pnl']:>11,.0f}     ${stats_b['total_pnl']:>11,.0f}     ${spy_pnl:>10,.0f}")
    print(f"  {'Total %':<22} {stats_a['total_pct']:>11.1f}%    {stats_b['total_pct']:>11.1f}%    {spy_pnl/CAPITAL*100:>10.1f}%")
    print(f"  {'Trades':<22} {stats_a['trades']:>11}     {stats_b['trades']:>11}")
    print(f"  {'Win Rate':<22} {stats_a['wr']:>11.1f}%    {stats_b['wr']:>11.1f}%")
    print(f"  {'Profit Factor':<22} {stats_a['pf']:>11.2f}     {stats_b['pf']:>11.2f}")
    print(f"  {'Max Drawdown $':<22} ${stats_a['max_dd']:>10,.0f}     ${stats_b['max_dd']:>10,.0f}")
    print(f"  {'Max Drawdown %':<22} {stats_a['max_dd_pct']:>11.1f}%    {stats_b['max_dd_pct']:>11.1f}%")
    print(f"  {'Avg Winner %':<22} +{stats_a['avg_winner_pct']:>10.1f}%    +{stats_b['avg_winner_pct']:>10.1f}%")
    print(f"  {'Avg Loser %':<22} -{stats_a['avg_loser_pct']:>10.1f}%    -{stats_b['avg_loser_pct']:>10.1f}%")
    print(f"  {'Avg Duration':<22} {stats_a['avg_duration']:>11.1f}d    {stats_b['avg_duration']:>11.1f}d")
    print(f"  {'Max Lose Streak':<22} {stats_a['max_lose_streak']:>11}     {stats_b['max_lose_streak']:>11}")
    print(f"  {'-'*68}")
    
    # Risk-adjusted
    ra_a = stats_a['total_pnl'] / max(stats_a['max_dd'], 1)
    ra_b = stats_b['total_pnl'] / max(stats_b['max_dd'], 1)
    print(f"  {'Return/MaxDD':<22} {ra_a:>11.2f}     {ra_b:>11.2f}")
    print(f"  {'Beats SPY?':<22} {'YES' if stats_a['total_pnl'] > spy_pnl else 'NO':>11}     {'YES' if stats_b['total_pnl'] > spy_pnl else 'NO':>11}")
    
    print(f"\n  Risk On weeks: {on_wks} | Risk Off weeks: {off_wks} ({off_wks/(on_wks+off_wks)*100:.0f}% out of market)")
    
    # Show risk-off periods
    print(f"\n  Risk-OFF periods (cash):")
    in_off = False
    off_start = None
    for wk in log_b:
        if not wk['risk_on'] and not in_off:
            off_start = wk['week']
            in_off = True
        elif wk['risk_on'] and in_off:
            print(f"    {off_start} to {wk['week']}")
            in_off = False
    if in_off:
        print(f"    {off_start} to present")
    
    print(f"\n{'='*70}")
    winner = 'B (Dual Momentum)' if ra_b > ra_a else 'A (Always In)'
    print(f"  WINNER (risk-adjusted): {winner}")
    print(f"{'='*70}")


if __name__ == '__main__':
    main()
