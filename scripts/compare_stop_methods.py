#!/usr/bin/env python3
"""
Compare stop-loss methods for Top-10 rotation:
  A) No stop - pure rotation only (sell when dropped out of top 10)
  B) ATR-based stop - 2x ATR(14) below entry (adapts to volatility)
"""

import json
import sys
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

# Import universe from main script
sys.path.insert(0, str(Path(__file__).parent))
from generate_rotation_top3 import SP500, download_data, rank_by_momentum

CAPITAL = 40000.0
MAX_POSITIONS = 10
LOOKBACK_DAYS = 63
START_DATE = '2020-06-01'
END_DATE = '2026-06-04'
TRADE_START = '2021-01-01'


def calc_atr(df, period=14):
    """Calculate ATR for a dataframe."""
    high = df['High']
    low = df['Low']
    close = df['Close']
    prev_close = close.shift(1)
    
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs()
    ], axis=1).max(axis=1)
    
    return tr.rolling(period).mean()


def simulate_variant(stock_data, stop_mode='none', atr_mult=2.0):
    """
    stop_mode: 'none' = pure rotation, 'atr' = ATR-based stop
    """
    trade_start = pd.Timestamp(TRADE_START)
    
    all_dates = set()
    for df in stock_data.values():
        all_dates.update(df.index)
    trading_dates = sorted([d for d in all_dates if d >= trade_start])
    
    # Pre-compute ATR for all stocks
    atr_data = {}
    if stop_mode == 'atr':
        for ticker, df in stock_data.items():
            atr_data[ticker] = calc_atr(df, 14)
    
    trades = []
    open_positions = {}
    running_pnl = 0
    last_rotation_week = None
    
    # Track equity for drawdown
    equity_curve = []

    for date in trading_dates:
        week_key = date.isocalendar()[:2]
        is_rotation_day = (week_key != last_rotation_week and date.weekday() == 0)
        
        # -- Daily: check stops (only if ATR mode) --
        closed_today = []
        if stop_mode == 'atr':
            for ticker, pos in list(open_positions.items()):
                if ticker not in stock_data or date not in stock_data[ticker].index:
                    continue
                row = stock_data[ticker].loc[date]
                if pd.isna(row['Close']):
                    continue
                
                stop_price = pos['stop_price']
                if row['Low'] <= stop_price:
                    # Gap-down realism
                    open_price = float(row['Open']) if not pd.isna(row['Open']) else stop_price
                    if open_price <= stop_price:
                        exit_price = open_price
                        reason = 'Stop (Gap)'
                    else:
                        exit_price = stop_price
                        reason = 'ATR Stop'
                    
                    pnl = (exit_price - pos['entry_price']) * pos['shares']
                    trades.append({
                        'stock': ticker,
                        'entryDate': pos['entry_date'].strftime('%Y-%m-%d'),
                        'exitDate': date.strftime('%Y-%m-%d'),
                        'entryPrice': round(pos['entry_price'], 2),
                        'exitPrice': round(exit_price, 2),
                        'pnlDollar': round(pnl, 2),
                        'pnlPct': round((exit_price / pos['entry_price'] - 1) * 100, 2),
                        'exitReason': reason,
                        'durationDays': (date - pos['entry_date']).days,
                    })
                    running_pnl += pnl
                    closed_today.append(ticker)
        
        for t in closed_today:
            del open_positions[t]
        
        # -- Weekly rotation --
        if is_rotation_day:
            last_rotation_week = week_key
            ranking = rank_by_momentum(stock_data, date, LOOKBACK_DAYS)
            top_n_tickers = [s['ticker'] for s in ranking[:MAX_POSITIONS]]
            
            # Sell positions dropped out
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
                            'exitReason': 'Rotated Out',
                            'durationDays': (date - pos['entry_date']).days,
                        })
                        running_pnl += pnl
                        sell_list.append(ticker)
            
            for t in sell_list:
                del open_positions[t]
            
            # Buy new
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
                
                # Calculate stop
                stop_price = 0
                if stop_mode == 'atr' and ticker in atr_data:
                    atr_val = atr_data[ticker].get(date, None)
                    if atr_val is not None and not pd.isna(atr_val):
                        stop_price = entry_price - (atr_mult * float(atr_val))
                    else:
                        stop_price = entry_price * 0.90  # fallback
                
                open_positions[ticker] = {
                    'entry_price': entry_price,
                    'entry_date': date,
                    'shares': shares,
                    'stop_price': stop_price,
                    'rank': i + 1,
                }
        
        # Track equity
        unrealized = 0
        for ticker, pos in open_positions.items():
            if ticker in stock_data and date in stock_data[ticker].index:
                cp = stock_data[ticker].loc[date]['Close']
                if not pd.isna(cp):
                    unrealized += (float(cp) - pos['entry_price']) * pos['shares']
        equity_curve.append(running_pnl + unrealized)
    
    # Close remaining
    last_date = trading_dates[-1]
    for ticker, pos in open_positions.items():
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
            })
    
    return trades, equity_curve


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
    for eq in equity_curve:
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
    print("  STOP-LOSS COMPARISON: No Stop vs ATR-Based Stop")
    print("  Top-10 Momentum Rotation | S&P 500 | 5 Years (2021-2026)")
    print("=" * 70)
    
    stock_data = download_data(SP500, START_DATE, END_DATE)
    
    # --- Variant A: No stop (pure rotation) ---
    print("\n  [A] Running: NO STOP (pure rotation only)...")
    trades_a, eq_a = simulate_variant(stock_data, stop_mode='none')
    stats_a = compute_stats(trades_a, eq_a)
    
    # --- Variant B: ATR stop (2x ATR) ---
    print("  [B] Running: ATR STOP (2x ATR(14) below entry)...")
    trades_b, eq_b = simulate_variant(stock_data, stop_mode='atr', atr_mult=2.0)
    stats_b = compute_stats(trades_b, eq_b)
    
    # --- SPY benchmark ---
    spy_pnl = 0
    if 'SPY' in stock_data:
        spy_df = stock_data['SPY']
        spy_sub = spy_df[spy_df.index >= pd.Timestamp(TRADE_START)]
        if len(spy_sub) > 0:
            sp = float(spy_sub['Close'].iloc[0])
            ep = float(spy_sub['Close'].iloc[-1])
            spy_pnl = (ep - sp) / sp * CAPITAL
    
    # --- Print comparison ---
    print(f"\n{'='*70}")
    print(f"  {'METRIC':<22} {'A: NO STOP':<20} {'B: 2x ATR STOP':<20} {'SPY B&H':<15}")
    print(f"  {'-'*70}")
    print(f"  {'Total P/L':<22} ${stats_a['total_pnl']:>12,.0f}     ${stats_b['total_pnl']:>12,.0f}     ${spy_pnl:>10,.0f}")
    print(f"  {'Total %':<22} {stats_a['total_pct']:>12.1f}%    {stats_b['total_pct']:>12.1f}%    {spy_pnl/CAPITAL*100:>10.1f}%")
    print(f"  {'Trades':<22} {stats_a['trades']:>12}     {stats_b['trades']:>12}")
    print(f"  {'Win Rate':<22} {stats_a['wr']:>12.1f}%    {stats_b['wr']:>12.1f}%")
    print(f"  {'Profit Factor':<22} {stats_a['pf']:>12.2f}     {stats_b['pf']:>12.2f}")
    print(f"  {'Max Drawdown $':<22} ${stats_a['max_dd']:>11,.0f}     ${stats_b['max_dd']:>11,.0f}")
    print(f"  {'Max Drawdown %':<22} {stats_a['max_dd_pct']:>12.1f}%    {stats_b['max_dd_pct']:>12.1f}%")
    print(f"  {'Avg Winner %':<22} +{stats_a['avg_winner_pct']:>11.1f}%    +{stats_b['avg_winner_pct']:>11.1f}%")
    print(f"  {'Avg Loser %':<22} -{stats_a['avg_loser_pct']:>11.1f}%    -{stats_b['avg_loser_pct']:>11.1f}%")
    print(f"  {'Avg Duration':<22} {stats_a['avg_duration']:>12.1f}d    {stats_b['avg_duration']:>12.1f}d")
    print(f"  {'Max Lose Streak':<22} {stats_a['max_lose_streak']:>12}     {stats_b['max_lose_streak']:>12}")
    print(f"  {'-'*70}")
    
    # Determine winner
    score_a = 0
    score_b = 0
    if stats_a['total_pnl'] > stats_b['total_pnl']: score_a += 2
    else: score_b += 2
    if stats_a['pf'] > stats_b['pf']: score_a += 1
    else: score_b += 1
    if stats_a['max_dd'] < stats_b['max_dd']: score_a += 2
    else: score_b += 2
    if stats_a['max_dd_pct'] < stats_b['max_dd_pct']: score_a += 1
    else: score_b += 1
    
    # Risk-adjusted: return / max_dd
    ra_a = stats_a['total_pnl'] / max(stats_a['max_dd'], 1)
    ra_b = stats_b['total_pnl'] / max(stats_b['max_dd'], 1)
    print(f"\n  {'Return/MaxDD ratio':<22} {ra_a:>12.2f}     {ra_b:>12.2f}")
    if ra_a > ra_b: score_a += 2
    else: score_b += 2
    
    # vs SPY
    beats_spy_a = stats_a['total_pnl'] > spy_pnl
    beats_spy_b = stats_b['total_pnl'] > spy_pnl
    print(f"  {'Beats SPY?':<22} {'YES' if beats_spy_a else 'NO':>12}     {'YES' if beats_spy_b else 'NO':>12}")
    
    print(f"\n  SCORE: A={score_a} vs B={score_b}")
    winner = 'A (No Stop - Pure Rotation)' if score_a > score_b else 'B (2x ATR Stop)'
    print(f"  WINNER: {winner}")
    print(f"{'='*70}")


if __name__ == '__main__':
    main()
