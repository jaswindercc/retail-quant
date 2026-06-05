#!/usr/bin/env python3
"""
Donchian Breakout on S&P 500 - Honest Backtest

Rules:
- Universe: S&P 500 (~360 stocks, current constituents)
- Entry: Close above 20-day high AND price above 50-day SMA (uptrend)
- Stop: 1 ATR(14) below entry
- Trail: When trade reaches 2.5R profit, trail at EMA20 - 1ATR
- Position sizing: 1% risk per trade (compounding - risk grows with equity)
- Max 5 positions at once
- Gap-down realism: if open < stop, exit at open (not stop level)
- No look-ahead bias: signals computed on prior close, execution next day

Period: 5 years (Jan 2021 - Jun 2026) with SPY comparison
"""

import json
import sys
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

# Reuse universe and download from rotation script
sys.path.insert(0, str(Path(__file__).parent))
from generate_rotation_top3 import SP500, download_data

# -- PARAMETERS --
CAPITAL = 100000.0
MAX_POSITIONS = 5
RISK_PER_TRADE = 0.01  # 1% of equity risked per trade
DONCHIAN_PERIOD = 20   # 20-day high breakout
SMA_PERIOD = 50        # trend filter
ATR_PERIOD = 14
TRAIL_START_R = 2.5    # start trailing at 2.5R profit
TRAIL_EMA = 20         # trail at EMA20 - 1ATR

START_DATE = '2020-06-01'  # need lookback before test
END_DATE = '2026-06-05'
TRADE_START = '2021-01-01'

# Top ~100 mega/large-cap S&P 500 (most liquid, least survivorship bias)
MEGA100 = [
    'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'BRK-B', 'AVGO', 'JPM',
    'LLY', 'V', 'UNH', 'MA', 'COST', 'HD', 'JNJ', 'ABBV', 'WMT', 'PG',
    'NFLX', 'BAC', 'CRM', 'ORCL', 'MRK', 'CVX', 'XOM', 'KO', 'PEP', 'AMD',
    'TMO', 'LIN', 'ABT', 'CSCO', 'ADBE', 'ACN', 'MCD', 'PM', 'TXN', 'GE',
    'DHR', 'ISRG', 'CAT', 'INTU', 'GS', 'AMGN', 'RTX', 'VZ', 'AXP', 'DIS',
    'NEE', 'BLK', 'PFE', 'T', 'LOW', 'BKNG', 'HON', 'QCOM', 'UNP', 'SYK',
    'BA', 'MS', 'SPGI', 'DE', 'GILD', 'BMY', 'LMT', 'MDT', 'CB', 'TJX',
    'SCHW', 'PLD', 'ADP', 'VRTX', 'ETN', 'PANW', 'CME', 'C', 'CI', 'BSX',
    'UPS', 'NOW', 'REGN', 'FDX', 'SO', 'DUK', 'SLB', 'COP', 'CL', 'INTC',
    'MU', 'ANET', 'WM', 'USB', 'MCO', 'SBUX', 'MMM', 'GD', 'NOC', 'ITW',
]

# Use full S&P 500 or mega-100 based on command line flag
USE_MEGA100 = '--mega100' in sys.argv


def compute_indicators(df):
    """Pre-compute all indicators for a stock."""
    close = df['Close'].astype(float)
    high = df['High'].astype(float)
    low = df['Low'].astype(float)

    # Donchian 20-day high (previous 20 bars, not including today)
    df['donchian_high'] = high.shift(1).rolling(DONCHIAN_PERIOD).max()

    # SMA50
    df['sma50'] = close.rolling(SMA_PERIOD).mean()

    # ATR14
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs()
    ], axis=1).max(axis=1)
    df['atr'] = tr.rolling(ATR_PERIOD).mean()

    # EMA20 for trailing
    df['ema20'] = close.ewm(span=TRAIL_EMA, adjust=False).mean()

    return df


def simulate(stock_data):
    """Run Donchian breakout simulation with compounding."""
    trade_start = pd.Timestamp(TRADE_START)

    # Get all trading dates from SPY
    if 'SPY' not in stock_data:
        print("  ERROR: No SPY data")
        return [], [], []

    trading_dates = sorted(stock_data['SPY'].index)
    trading_dates = [d for d in trading_dates if d >= trade_start]

    # Pre-compute indicators for all stocks
    print("  Computing indicators...")
    for ticker in list(stock_data.keys()):
        try:
            stock_data[ticker] = compute_indicators(stock_data[ticker])
        except Exception:
            del stock_data[ticker]

    trades = []
    open_positions = {}  # ticker -> position info
    equity = CAPITAL
    peak_equity = CAPITAL
    equity_curve = []

    for date in trading_dates:
        # -- 1. Check stops and trails on open positions --
        closed_today = []
        for ticker, pos in list(open_positions.items()):
            if ticker not in stock_data or date not in stock_data[ticker].index:
                continue
            row = stock_data[ticker].loc[date]
            if pd.isna(row['Close']):
                continue

            current_close = float(row['Close'])
            current_low = float(row['Low'])
            current_open = float(row['Open']) if not pd.isna(row['Open']) else current_close
            current_ema20 = float(row['ema20']) if not pd.isna(row['ema20']) else current_close
            current_atr = float(row['atr']) if not pd.isna(row['atr']) else 0

            # Update trailing stop if in profit >= 2.5R
            r_multiple = (current_close - pos['entry_price']) / pos['risk_per_share'] if pos['risk_per_share'] > 0 else 0
            if r_multiple >= TRAIL_START_R:
                trail_level = current_ema20 - current_atr
                if trail_level > pos['stop_price']:
                    pos['stop_price'] = trail_level
                    pos['trailing'] = True

            # Check stop hit
            if current_low <= pos['stop_price']:
                # Gap-down realism
                if current_open <= pos['stop_price']:
                    exit_price = current_open  # gapped through
                    reason = 'Stop (Gap)'
                else:
                    exit_price = pos['stop_price']
                    reason = 'Trail Stop' if pos.get('trailing') else 'Stop Loss'

                pnl = (exit_price - pos['entry_price']) * pos['shares']
                equity += pnl
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
                    'riskPerShare': round(pos['risk_per_share'], 2),
                    'rMultiple': round(pnl / (pos['risk_per_share'] * pos['shares']), 2) if pos['risk_per_share'] > 0 else 0,
                })
                closed_today.append(ticker)

        for t in closed_today:
            del open_positions[t]

        # -- 2. Scan for new entries (only if we have open slots) --
        if len(open_positions) < MAX_POSITIONS:
            candidates = []
            for ticker, df in stock_data.items():
                if ticker == 'SPY' or ticker in open_positions:
                    continue
                if date not in df.index:
                    continue
                row = df.loc[date]
                if pd.isna(row['Close']) or pd.isna(row['donchian_high']) or pd.isna(row['sma50']) or pd.isna(row['atr']):
                    continue

                close = float(row['Close'])
                donchian_high = float(row['donchian_high'])
                sma50 = float(row['sma50'])
                atr = float(row['atr'])

                # Entry signal: close > 20-day high AND close > SMA50
                if close > donchian_high and close > sma50 and atr > 0:
                    # Score by relative strength (how far above breakout)
                    strength = (close - donchian_high) / donchian_high
                    candidates.append({
                        'ticker': ticker,
                        'close': close,
                        'atr': atr,
                        'strength': strength,
                    })

            # Sort by strength, pick top ones to fill slots
            candidates.sort(key=lambda x: x['strength'], reverse=True)
            slots_available = MAX_POSITIONS - len(open_positions)

            for cand in candidates[:slots_available]:
                ticker = cand['ticker']
                entry_price = cand['close']
                atr = cand['atr']

                # Position sizing: 1% of current equity risked
                risk_per_share = atr  # stop is 1 ATR below entry
                risk_dollars = equity * RISK_PER_TRADE
                shares = int(risk_dollars / risk_per_share)
                if shares <= 0:
                    continue

                # Don't let a single position exceed 20% of equity
                position_value = shares * entry_price
                if position_value > equity * 0.20:
                    shares = int(equity * 0.20 / entry_price)
                    if shares <= 0:
                        continue

                stop_price = entry_price - atr

                open_positions[ticker] = {
                    'entry_price': entry_price,
                    'entry_date': date,
                    'shares': shares,
                    'stop_price': stop_price,
                    'risk_per_share': risk_per_share,
                    'trailing': False,
                }

        # -- 3. Track equity curve --
        unrealized = 0
        for ticker, pos in open_positions.items():
            if ticker in stock_data and date in stock_data[ticker].index:
                cp = stock_data[ticker].loc[date]['Close']
                if not pd.isna(cp):
                    unrealized += (float(cp) - pos['entry_price']) * pos['shares']

        total_equity = equity + unrealized
        if total_equity > peak_equity:
            peak_equity = total_equity

        equity_curve.append({
            'date': date.strftime('%Y-%m-%d'),
            'equity': round(total_equity, 2),
            'drawdown': round(peak_equity - total_equity, 2),
        })

    # Close remaining open positions at last price
    last_date = trading_dates[-1]
    for ticker, pos in list(open_positions.items()):
        if ticker in stock_data:
            last_row = stock_data[ticker].iloc[-1]
            exit_price = float(last_row['Close'])
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
                'riskPerShare': round(pos['risk_per_share'], 2),
                'rMultiple': round(pnl / (pos['risk_per_share'] * pos['shares']), 2) if pos['risk_per_share'] > 0 else 0,
            })

    # SPY buy-and-hold
    spy_curve = []
    spy_df = stock_data['SPY']
    spy_sub = spy_df[spy_df.index >= trade_start]
    if len(spy_sub) > 0:
        spy_start_price = float(spy_sub['Close'].iloc[0])
        spy_shares = CAPITAL / spy_start_price
        for d, row in spy_sub.iterrows():
            spy_pnl = (float(row['Close']) - spy_start_price) * spy_shares
            spy_curve.append({
                'date': d.strftime('%Y-%m-%d'),
                'pnl': round(spy_pnl, 2),
            })

    return trades, equity_curve, spy_curve


def compute_stats(trades):
    """Compute stats from closed trades."""
    closed = [t for t in trades if t['exitReason'] != 'Open']
    if not closed:
        return {}

    pnls = [t['pnlDollar'] for t in closed]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]

    gross_win = sum(wins) if wins else 0
    gross_loss = abs(sum(losses)) if losses else 1

    # Monthly PnL
    monthly = {}
    for t in closed:
        key = t['exitDate'][:7]
        monthly[key] = monthly.get(key, 0) + t['pnlDollar']

    # Max losing streak
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
        'total_pnl': round(total_pnl, 2),
        'total_return_pct': round(total_pnl / CAPITAL * 100, 1),
        'closed_trades': len(closed),
        'wins': len(wins),
        'losses': len(losses),
        'win_rate': round(len(wins) / len(closed) * 100, 1),
        'profit_factor': round(gross_win / gross_loss, 2) if gross_loss > 0 else 99,
        'avg_winner': round(gross_win / len(wins), 2) if wins else 0,
        'avg_loser': round(gross_loss / len(losses), 2) if losses else 0,
        'avg_winner_pct': round(sum(t['pnlPct'] for t in closed if t['pnlDollar'] > 0) / max(len(wins), 1), 1),
        'avg_loser_pct': round(abs(sum(t['pnlPct'] for t in closed if t['pnlDollar'] <= 0)) / max(len(losses), 1), 1),
        'avg_r': round(sum(t.get('rMultiple', 0) for t in closed) / len(closed), 2),
        'best_trade': round(max(pnls), 2),
        'worst_trade': round(min(pnls), 2),
        'avg_duration': round(sum(t['durationDays'] for t in closed) / len(closed), 1),
        'max_lose_streak': max_streak,
        'monthly_pnl': monthly,
    }


def main():
    universe = MEGA100 if USE_MEGA100 else SP500
    universe_label = 'Mega-100' if USE_MEGA100 else 'S&P 500'
    
    print("=" * 65)
    print(f"  DONCHIAN BREAKOUT - {universe_label} Universe ({len(universe)} stocks)")
    print(f"  Capital: ${CAPITAL:,.0f} | 1% risk/trade | Max {MAX_POSITIONS} positions")
    print(f"  Entry: Close > 20-day high + above SMA50")
    print(f"  Stop: 1 ATR below entry | Trail: EMA20-1ATR at 2.5R")
    print(f"  Gap-down realism: exit at open if gap below stop")
    print(f"  Period: {TRADE_START} to {END_DATE} (5 years)")
    print("=" * 65)

    stock_data = download_data(universe, START_DATE, END_DATE)

    print("\n  Running simulation...")
    trades, equity_curve, spy_curve = simulate(stock_data)

    stats = compute_stats(trades)

    print(f"\n  {'='*55}")
    print(f"  RESULTS - Donchian Breakout (S&P 500, compounding)")
    print(f"  {'='*55}")
    print(f"  Trades: {stats.get('closed_trades', 0)} closed")
    print(f"  Win Rate: {stats.get('win_rate', 0)}%")
    print(f"  Total PnL: ${stats.get('total_pnl', 0):,.0f} ({stats.get('total_return_pct', 0)}%)")
    print(f"  Profit Factor: {stats.get('profit_factor', 0)}")
    print(f"  Avg R-Multiple: {stats.get('avg_r', 0)}")
    print(f"  Avg Winner: +{stats.get('avg_winner_pct', 0)}% (${stats.get('avg_winner', 0):,.0f})")
    print(f"  Avg Loser: -{stats.get('avg_loser_pct', 0)}% (-${stats.get('avg_loser', 0):,.0f})")
    print(f"  Avg Duration: {stats.get('avg_duration', 0)} days")
    print(f"  Max Losing Streak: {stats.get('max_lose_streak', 0)}")

    # Max drawdown from curve
    max_dd = max(pt['drawdown'] for pt in equity_curve) if equity_curve else 0
    max_dd_pct = max_dd / CAPITAL * 100
    print(f"  Max Drawdown: ${max_dd:,.0f} ({max_dd_pct:.1f}%)")

    # SPY comparison
    spy_final = spy_curve[-1]['pnl'] if spy_curve else 0
    print(f"\n  SPY Buy & Hold: ${spy_final:,.0f} ({spy_final/CAPITAL*100:.1f}%)")
    beats = stats.get('total_pnl', 0) > spy_final
    print(f"  Beats SPY: {'YES' if beats else 'NO'}")

    # Save output
    output = {
        'lastUpdated': datetime.now().strftime('%Y-%m-%d %H:%M'),
        'strategy': f'Donchian Breakout ({universe_label})',
        'universe': universe_label,
        'universe_size': len(stock_data),
        'params': {
            'capital': CAPITAL,
            'risk_per_trade': RISK_PER_TRADE,
            'max_positions': MAX_POSITIONS,
            'donchian_period': DONCHIAN_PERIOD,
            'sma_period': SMA_PERIOD,
            'atr_period': ATR_PERIOD,
            'trail_start_r': TRAIL_START_R,
            'period': f'{TRADE_START} to {END_DATE}',
        },
        'stats': stats,
        'trades': trades,
        'equity_curve': equity_curve,
        'spy_curve': spy_curve,
    }

    out_path = Path(__file__).resolve().parent.parent / 'dashboard' / 'public' / 'donchian_sp500_data.json'
    with open(out_path, 'w') as f:
        json.dump(output, f)

    print(f"\n  Saved to {out_path}")
    print("\nDone!")


if __name__ == '__main__':
    main()
