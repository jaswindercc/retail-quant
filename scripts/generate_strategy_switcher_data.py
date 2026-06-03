#!/usr/bin/env python3
"""
Strategy Switcher Backtest
- 5 different strategies on S&P 500 liquid stocks (5 years)
- 6th "Switcher" strategy: picks signals from whichever strategy just had a losing streak

Strategies:
1. Breakout — Close > 20-day high + volume ≥ 1.5× avg
2. Mean Reversion — RSI(2) < 10 + price > 200 SMA (Connors-style)
3. Trend Pullback — Price touches 21 EMA in uptrend (ADX > 25, price > 50 SMA)
4. MACD Crossover — MACD crosses above signal + price > 50 SMA
5. Bollinger Squeeze — BB width at 120-day low, then close > upper band

All use:
- 2% risk per trade (compounding)
- 1×ATR(14) stop loss
- Trail: activate at 2R → EMA10 - 1×ATR (ratchets up)
- Max 20% of capital in one stock
- 1 signal per day max
- Reduce risk on losing streaks: risk_mult = max(0.5, 1.0 - consecutive_losses * 0.1)
"""

import json
import os
import sys
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import yfinance as yf

# ─── CONFIG ───────────────────────────────────────────────────────────────────
START_DATE = '2021-06-01'
END_DATE = '2026-05-30'
STARTING_CAPITAL = 50000
RISK_PCT = 2.0  # 2% per trade
MAX_POSITION_PCT = 20.0  # never more than 20% in one stock
TRAIL_ACTIVATE_R = 2.0
TRAIL_ATR_BUF = 1.0

# Highly liquid S&P 500 stocks from different sectors
UNIVERSE = [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK-B',
    'JPM', 'V', 'UNH', 'JNJ', 'WMT', 'PG', 'MA', 'HD', 'XOM', 'CVX',
    'BAC', 'ABBV', 'PFE', 'KO', 'COST', 'MRK', 'PEP', 'TMO', 'AVGO',
    'LLY', 'ORCL', 'MCD', 'CSCO', 'ACN', 'ABT', 'CRM', 'AMD', 'NFLX',
    'INTC', 'DIS', 'CMCSA', 'NKE', 'VZ', 'T', 'HON', 'LOW', 'UPS',
    'CAT', 'GS', 'MS', 'AMGN', 'BA'
]

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), '..', 'dashboard', 'public', 'strategy_switcher_data.json')


def download_data():
    """Download 5+ years of daily data for all stocks."""
    # Need extra history for indicators
    start = (pd.Timestamp(START_DATE) - pd.DateOffset(years=1)).strftime('%Y-%m-%d')
    print(f"Downloading {len(UNIVERSE)} stocks from {start} to {END_DATE}...")
    data = {}
    for sym in UNIVERSE:
        try:
            df = yf.download(sym, start=start, end=END_DATE, progress=False, auto_adjust=True)
            if df is not None and len(df) > 200:
                # Handle MultiIndex columns from yfinance
                if isinstance(df.columns, pd.MultiIndex):
                    df.columns = df.columns.get_level_values(0)
                df = df.reset_index()
                if 'Date' not in df.columns:
                    df = df.rename(columns={df.columns[0]: 'Date'})
                df['Date'] = pd.to_datetime(df['Date'])
                data[sym] = df
                print(f"  {sym}: {len(df)} bars")
        except Exception as e:
            print(f"  {sym}: FAILED ({e})")
    return data


def add_indicators(df):
    """Add all technical indicators needed for all strategies."""
    df = df.copy()
    df['SMA200'] = df['Close'].rolling(200).mean()
    df['SMA50'] = df['Close'].rolling(50).mean()
    df['EMA21'] = df['Close'].ewm(span=21).mean()
    df['EMA10'] = df['Close'].ewm(span=10).mean()
    df['ATR'] = compute_atr(df, 14)
    df['High20'] = df['High'].rolling(20).max().shift(1)
    df['VolAvg20'] = df['Volume'].rolling(20).mean()

    # RSI(2)
    delta = df['Close'].diff()
    gain = delta.where(delta > 0, 0).rolling(2).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(2).mean()
    rs = gain / loss.replace(0, np.nan)
    df['RSI2'] = 100 - (100 / (1 + rs))

    # ADX
    df['ADX'] = compute_adx(df, 14)

    # MACD
    ema12 = df['Close'].ewm(span=12).mean()
    ema26 = df['Close'].ewm(span=26).mean()
    df['MACD'] = ema12 - ema26
    df['MACD_signal'] = df['MACD'].ewm(span=9).mean()
    df['MACD_prev'] = df['MACD'].shift(1)
    df['MACD_signal_prev'] = df['MACD_signal'].shift(1)

    # Bollinger Bands
    sma20 = df['Close'].rolling(20).mean()
    std20 = df['Close'].rolling(20).std()
    df['BB_upper'] = sma20 + 2 * std20
    df['BB_lower'] = sma20 - 2 * std20
    df['BB_width'] = (df['BB_upper'] - df['BB_lower']) / sma20
    df['BB_width_min120'] = df['BB_width'].rolling(120).min()

    return df


def compute_atr(df, period=14):
    high = df['High']
    low = df['Low']
    close = df['Close'].shift(1)
    tr = pd.concat([high - low, (high - close).abs(), (low - close).abs()], axis=1).max(axis=1)
    return tr.rolling(period).mean()


def compute_adx(df, period=14):
    high = df['High']
    low = df['Low']
    close = df['Close']

    plus_dm = high.diff()
    minus_dm = -low.diff()
    plus_dm = plus_dm.where((plus_dm > minus_dm) & (plus_dm > 0), 0)
    minus_dm = minus_dm.where((minus_dm > plus_dm) & (minus_dm > 0), 0)

    tr = pd.concat([high - low, (high - close.shift(1)).abs(), (low - close.shift(1)).abs()], axis=1).max(axis=1)
    atr = tr.rolling(period).mean()

    plus_di = 100 * (plus_dm.rolling(period).mean() / atr)
    minus_di = 100 * (minus_dm.rolling(period).mean() / atr)

    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
    adx = dx.rolling(period).mean()
    return adx


# ─── SIGNAL GENERATORS ────────────────────────────────────────────────────────

def signals_breakout(df, date_idx):
    """Strategy 1: Breakout — Close > 20d high + volume ≥ 1.5× avg."""
    row = df.iloc[date_idx]
    if pd.isna(row.get('High20')) or pd.isna(row.get('ATR')) or pd.isna(row.get('SMA50')):
        return False
    if row['Close'] <= row['SMA50']:
        return False
    if row['Close'] > row['High20'] and row['Volume'] >= 1.5 * row['VolAvg20']:
        return True
    return False


def signals_mean_reversion(df, date_idx):
    """Strategy 2: Mean Reversion — RSI(2) < 10 + price > 200 SMA."""
    row = df.iloc[date_idx]
    if pd.isna(row.get('RSI2')) or pd.isna(row.get('SMA200')) or pd.isna(row.get('ATR')):
        return False
    if row['Close'] > row['SMA200'] and row['RSI2'] < 10:
        return True
    return False


def signals_trend_pullback(df, date_idx):
    """Strategy 3: Trend Pullback — Price touches 21 EMA, ADX > 25, price > 50 SMA."""
    row = df.iloc[date_idx]
    prev = df.iloc[date_idx - 1] if date_idx > 0 else None
    if pd.isna(row.get('EMA21')) or pd.isna(row.get('ADX')) or pd.isna(row.get('SMA50')):
        return False
    if row['Close'] > row['SMA50'] and row['ADX'] > 25:
        # Price touched or crossed EMA21 from above (pullback)
        if row['Low'] <= row['EMA21'] * 1.01 and row['Close'] > row['EMA21']:
            return True
    return False


def signals_macd_crossover(df, date_idx):
    """Strategy 4: MACD Crossover — MACD crosses above signal + price > 50 SMA."""
    row = df.iloc[date_idx]
    if pd.isna(row.get('MACD')) or pd.isna(row.get('MACD_signal')) or pd.isna(row.get('SMA50')):
        return False
    if pd.isna(row.get('MACD_prev')) or pd.isna(row.get('MACD_signal_prev')):
        return False
    if row['Close'] > row['SMA50']:
        if row['MACD_prev'] < row['MACD_signal_prev'] and row['MACD'] > row['MACD_signal']:
            return True
    return False


def signals_bollinger_squeeze(df, date_idx):
    """Strategy 5: Bollinger Squeeze — BB width at 120d low, close > upper band."""
    row = df.iloc[date_idx]
    prev = df.iloc[date_idx - 1] if date_idx > 0 else None
    if pd.isna(row.get('BB_width')) or pd.isna(row.get('BB_width_min120')) or pd.isna(row.get('BB_upper')):
        return False
    if prev is not None and not pd.isna(prev.get('BB_width')):
        # Width was at/near 120-day min yesterday, and today breaks above upper band
        if prev['BB_width'] <= prev.get('BB_width_min120', 999) * 1.05:
            if row['Close'] > row['BB_upper']:
                return True
    return False


STRATEGIES = {
    'Breakout': signals_breakout,
    'Mean Reversion': signals_mean_reversion,
    'Trend Pullback': signals_trend_pullback,
    'MACD Crossover': signals_macd_crossover,
    'Bollinger Squeeze': signals_bollinger_squeeze,
}


# ─── TRADE EXECUTION ─────────────────────────────────────────────────────────

def simulate_trade(df, entry_idx, entry_price, atr, risk_dollars, capital):
    """Simulate a single trade with ATR stop + trailing exit."""
    stop = entry_price - atr
    risk_per_share = entry_price - stop
    if risk_per_share <= 0:
        return None

    shares = int(risk_dollars / risk_per_share)
    position_value = shares * entry_price
    max_position = capital * (MAX_POSITION_PCT / 100)
    if position_value > max_position:
        shares = int(max_position / entry_price)
    if shares <= 0:
        return None

    position_value = shares * entry_price
    trail_active = False
    trail_stop = stop
    highest_close = entry_price

    for i in range(entry_idx + 1, min(entry_idx + 120, len(df))):  # Max 120 days hold
        row = df.iloc[i]
        # Check stop
        if row['Low'] <= stop:
            exit_price = stop
            pnl = (exit_price - entry_price) * shares
            pnl_r = (exit_price - entry_price) / risk_per_share
            return {
                'exitDate': row['Date'].strftime('%Y-%m-%d'),
                'exitPrice': round(exit_price, 2),
                'pnlDollar': round(pnl, 2),
                'pnlR': round(pnl_r, 2),
                'exitReason': 'SL',
                'durationDays': i - entry_idx,
                'shares': shares,
                'positionValue': round(position_value, 2),
            }

        # Update highest
        if row['Close'] > highest_close:
            highest_close = row['Close']

        # Check trail activation
        current_r = (row['Close'] - entry_price) / risk_per_share
        if current_r >= TRAIL_ACTIVATE_R and not trail_active:
            trail_active = True

        if trail_active:
            ema10 = df.iloc[max(0, i-9):i+1]['Close'].ewm(span=10).mean().iloc[-1]
            current_atr = df.iloc[max(0, i-13):i+1]['Close'].diff().abs().mean()  # simplified
            new_trail = ema10 - TRAIL_ATR_BUF * atr
            if new_trail > trail_stop:
                trail_stop = new_trail
            if row['Low'] <= trail_stop:
                exit_price = trail_stop
                pnl = (exit_price - entry_price) * shares
                pnl_r = (exit_price - entry_price) / risk_per_share
                return {
                    'exitDate': row['Date'].strftime('%Y-%m-%d'),
                    'exitPrice': round(exit_price, 2),
                    'pnlDollar': round(pnl, 2),
                    'pnlR': round(pnl_r, 2),
                    'exitReason': 'Trail',
                    'durationDays': i - entry_idx,
                    'shares': shares,
                    'positionValue': round(position_value, 2),
                }

    # Time exit after 120 days
    last = df.iloc[min(entry_idx + 119, len(df) - 1)]
    exit_price = last['Close']
    pnl = (exit_price - entry_price) * shares
    pnl_r = (exit_price - entry_price) / risk_per_share
    return {
        'exitDate': last['Date'].strftime('%Y-%m-%d'),
        'exitPrice': round(exit_price, 2),
        'pnlDollar': round(pnl, 2),
        'pnlR': round(pnl_r, 2),
        'exitReason': 'Time',
        'durationDays': min(119, len(df) - entry_idx - 1),
        'shares': shares,
        'positionValue': round(position_value, 2),
    }


def run_strategy(strategy_name, signal_fn, all_data, start_date, end_date):
    """Run a single strategy across all stocks."""
    print(f"\n  Running {strategy_name}...")
    capital = STARTING_CAPITAL
    peak_capital = capital
    max_dd = 0
    consecutive_losses = 0
    trades = []
    equity_curve = [{'date': start_date, 'capital': capital}]

    # Get all trading dates
    sample_sym = list(all_data.keys())[0]
    sample_df = all_data[sample_sym]
    all_dates = sample_df[sample_df['Date'] >= start_date]['Date'].tolist()

    open_trades = []  # Track open positions to avoid overlapping

    for date in all_dates:
        if date > pd.Timestamp(end_date):
            break

        # Collect signals from all stocks for this date
        signals = []
        for sym, df in all_data.items():
            date_mask = df['Date'] == date
            if not date_mask.any():
                continue
            idx = df.index[date_mask][0]
            if idx < 200:  # Need enough history
                continue
            if signal_fn(df, idx):
                row = df.iloc[idx]
                signals.append({
                    'stock': sym,
                    'idx': idx,
                    'price': row['Close'],
                    'atr': row['ATR'],
                    'date': date,
                    'df': df,
                })

        if not signals:
            continue

        # Pick 1 signal per day (highest ATR-normalized move = strongest signal)
        signals.sort(key=lambda s: s['price'] / s['atr'] if s['atr'] > 0 else 0, reverse=True)
        sig = signals[0]

        # Risk management
        risk_mult = max(0.5, 1.0 - consecutive_losses * 0.1)
        risk_dollars = capital * (RISK_PCT / 100) * risk_mult

        # Execute trade
        result = simulate_trade(sig['df'], sig['idx'], sig['price'], sig['atr'], risk_dollars, capital)
        if result is None:
            continue

        trade = {
            'stock': sig['stock'],
            'entryDate': date.strftime('%Y-%m-%d'),
            'entryPrice': round(sig['price'], 2),
            'sl': round(sig['price'] - sig['atr'], 2),
            'risk': round(sig['atr'], 2),
            'riskDollars': round(risk_dollars, 2),
            'riskMult': round(risk_mult, 2),
            'capitalAtEntry': round(capital, 2),
            **result,
        }
        trades.append(trade)

        # Update capital
        capital += result['pnlDollar']
        if capital > peak_capital:
            peak_capital = capital
        dd = peak_capital - capital
        if dd > max_dd:
            max_dd = dd

        # Track streaks
        if result['pnlR'] < 0:
            consecutive_losses += 1
        else:
            consecutive_losses = 0

        equity_curve.append({'date': trade['exitDate'], 'capital': round(capital, 2)})

    # Summary
    if not trades:
        return {'name': strategy_name, 'trades': [], 'summary': {}, 'equity_curve': []}

    wins = [t for t in trades if t['pnlR'] > 0]
    losses = [t for t in trades if t['pnlR'] <= 0]
    gross_win = sum(t['pnlDollar'] for t in wins)
    gross_loss = abs(sum(t['pnlDollar'] for t in losses))
    pf = gross_win / gross_loss if gross_loss > 0 else 99

    # Max losing streak
    streak = 0
    max_streak = 0
    for t in trades:
        if t['pnlR'] < 0:
            streak += 1
            max_streak = max(max_streak, streak)
        else:
            streak = 0

    summary = {
        'total_trades': len(trades),
        'wins': len(wins),
        'losses': len(losses),
        'win_rate': round(len(wins) / len(trades) * 100, 1),
        'total_pnl': round(capital - STARTING_CAPITAL, 2),
        'final_capital': round(capital, 2),
        'profit_factor': round(pf, 2),
        'max_drawdown': round(max_dd, 2),
        'max_drawdown_pct': round(max_dd / peak_capital * 100, 1) if peak_capital > 0 else 0,
        'max_losing_streak': max_streak,
        'avg_winner_r': round(np.mean([t['pnlR'] for t in wins]), 2) if wins else 0,
        'avg_loser_r': round(np.mean([t['pnlR'] for t in losses]), 2) if losses else 0,
        'return_pct': round((capital - STARTING_CAPITAL) / STARTING_CAPITAL * 100, 1),
    }

    print(f"    {strategy_name}: {len(trades)} trades, WR={summary['win_rate']}%, PF={summary['profit_factor']}, PnL=${summary['total_pnl']:,.0f}, MaxDD=${summary['max_drawdown']:,.0f}")

    return {
        'name': strategy_name,
        'trades': trades,
        'summary': summary,
        'equity_curve': equity_curve,
    }


def run_switcher(strategy_results):
    """
    Strategy 6: The Switcher
    - Monitors rolling performance of all 5 strategies
    - Always takes signals from the BEST performing strategy (momentum/hot-hand)
    - Avoids strategies currently in losing streaks
    - Switches to a new strategy when current one starts losing
    
    Logic:
    - Track rolling profit factor over last 10 trades per strategy
    - Each day, pick the strategy with the highest rolling PF (min 1.0)
    - If current best has PF < 1.0, sit out (no trade)
    - If tie, prefer the one with fewer consecutive losses
    """
    print(f"\n  Running Switcher (rotate to best-performing strategy)...")

    # Build chronological trade list per strategy
    strat_histories = {}
    for strat in strategy_results:
        strat_histories[strat['name']] = strat['trades']

    # Merge all signals chronologically
    all_signals = []
    for strat in strategy_results:
        for i, t in enumerate(strat['trades']):
            all_signals.append({
                **t,
                'strategy': strat['name'],
                'trade_idx': i,
            })
    all_signals.sort(key=lambda x: x['entryDate'])

    # Track rolling performance per strategy
    LOOKBACK = 10  # rolling window
    strat_completed = {s['name']: [] for s in strategy_results}  # completed trades
    strat_streak = {s['name']: 0 for s in strategy_results}  # current consecutive losses

    capital = STARTING_CAPITAL
    peak_capital = capital
    max_dd = 0
    consecutive_losses = 0
    trades = []
    equity_curve = [{'date': START_DATE, 'capital': capital}]
    taken_dates = set()
    current_best = None  # which strategy we're currently following
    decision_log = []  # Track ALL decisions for visualization

    for sig in all_signals:
        entry_date = sig['entryDate']
        strat_name = sig['strategy']

        # Calculate rolling PF for each strategy based on completed trades so far
        def get_rolling_pf(name):
            completed = strat_completed[name]
            if len(completed) < 3:
                return 0  # not enough data yet
            recent = completed[-LOOKBACK:]
            wins = sum(t['pnlDollar'] for t in recent if t['pnlR'] > 0)
            losses_amt = abs(sum(t['pnlDollar'] for t in recent if t['pnlR'] <= 0))
            if losses_amt == 0:
                return 10.0
            return wins / losses_amt

        # Determine best strategy RIGHT NOW
        strat_scores = {}
        for name in strat_histories.keys():
            rpf = get_rolling_pf(name)
            streak = strat_streak[name]
            # Penalize strategies in losing streaks
            if streak >= 3:
                rpf *= 0.3  # heavy penalty for cold strategies
            elif streak >= 2:
                rpf *= 0.6
            strat_scores[name] = rpf

        # Pick the best
        best_strat = max(strat_scores, key=strat_scores.get)
        best_pf = strat_scores[best_strat]

        # Only take signals from the current best strategy
        if strat_name != best_strat:
            # Still update tracking for this strategy
            strat_completed[strat_name].append(sig)
            if sig['pnlR'] < 0:
                strat_streak[strat_name] += 1
            else:
                strat_streak[strat_name] = 0
            continue

        # Skip if best strategy has PF < 0.8 (all strategies are cold)
        if best_pf < 0.8 and len(strat_completed[best_strat]) >= 5:
            strat_completed[strat_name].append(sig)
            if sig['pnlR'] < 0:
                strat_streak[strat_name] += 1
            else:
                strat_streak[strat_name] = 0
            continue

        if entry_date in taken_dates:
            strat_completed[strat_name].append(sig)
            if sig['pnlR'] < 0:
                strat_streak[strat_name] += 1
            else:
                strat_streak[strat_name] = 0
            continue

        # Take the trade
        risk_mult = max(0.5, 1.0 - consecutive_losses * 0.1)
        risk_dollars = capital * (RISK_PCT / 100) * risk_mult

        # Log this decision for the timeline
        # Get last 5 R results per strategy for visual display
        last_rs = {}
        for name in strat_histories.keys():
            completed = strat_completed[name]
            recent = completed[-5:] if completed else []
            last_rs[name] = [round(t['pnlR'], 1) for t in recent]

        decision_log.append({
            'date': entry_date,
            'picked': strat_name,
            'stock': sig['stock'],
            'pnlR': sig['pnlR'],
            'scores': {name: round(strat_scores[name], 2) for name in strat_scores},
            'streaks': {name: strat_streak[name] for name in strat_streak},
            'lastRs': last_rs,
        })

        orig_risk = sig['riskDollars']
        if orig_risk > 0:
            scale = risk_dollars / orig_risk
        else:
            scale = 1
        pnl_scaled = sig['pnlDollar'] * scale

        # Max position check
        position_value = sig.get('positionValue', 0) * scale
        max_pos = capital * (MAX_POSITION_PCT / 100)
        if position_value > max_pos and sig.get('positionValue', 0) > 0:
            scale = max_pos / sig.get('positionValue', position_value)
            pnl_scaled = sig['pnlDollar'] * scale
            risk_dollars = orig_risk * scale
            position_value = max_pos

        trade = {
            'stock': sig['stock'],
            'entryDate': sig['entryDate'],
            'entryPrice': sig['entryPrice'],
            'sl': sig['sl'],
            'risk': sig['risk'],
            'riskDollars': round(risk_dollars, 2),
            'riskMult': round(risk_mult, 2),
            'capitalAtEntry': round(capital, 2),
            'exitDate': sig['exitDate'],
            'exitPrice': sig['exitPrice'],
            'pnlDollar': round(pnl_scaled, 2),
            'pnlR': sig['pnlR'],
            'exitReason': sig['exitReason'],
            'durationDays': sig['durationDays'],
            'shares': sig.get('shares', 0),
            'positionValue': round(position_value, 2),
            'sourceStrategy': sig['strategy'],
            'streakAtEntry': strat_streak[strat_name],
            'rollingPF': round(best_pf, 2),
        }
        trades.append(trade)
        taken_dates.add(entry_date)

        # Update capital
        capital += pnl_scaled
        if capital > peak_capital:
            peak_capital = capital
        dd = peak_capital - capital
        if dd > max_dd:
            max_dd = dd

        if sig['pnlR'] < 0:
            consecutive_losses += 1
        else:
            consecutive_losses = 0

        # Update strategy tracking
        strat_completed[strat_name].append(sig)
        if sig['pnlR'] < 0:
            strat_streak[strat_name] += 1
        else:
            strat_streak[strat_name] = 0

        equity_curve.append({'date': trade['exitDate'], 'capital': round(capital, 2)})

    # Summary
    if not trades:
        return {'name': 'Switcher', 'trades': [], 'summary': {}, 'equity_curve': []}

    wins = [t for t in trades if t['pnlR'] > 0]
    losses = [t for t in trades if t['pnlR'] <= 0]
    gross_win = sum(t['pnlDollar'] for t in wins)
    gross_loss = abs(sum(t['pnlDollar'] for t in losses))
    pf = gross_win / gross_loss if gross_loss > 0 else 99

    streak = 0
    max_streak = 0
    for t in trades:
        if t['pnlR'] < 0:
            streak += 1
            max_streak = max(max_streak, streak)
        else:
            streak = 0

    summary = {
        'total_trades': len(trades),
        'wins': len(wins),
        'losses': len(losses),
        'win_rate': round(len(wins) / len(trades) * 100, 1),
        'total_pnl': round(capital - STARTING_CAPITAL, 2),
        'final_capital': round(capital, 2),
        'profit_factor': round(pf, 2),
        'max_drawdown': round(max_dd, 2),
        'max_drawdown_pct': round(max_dd / peak_capital * 100, 1) if peak_capital > 0 else 0,
        'max_losing_streak': max_streak,
        'avg_winner_r': round(np.mean([t['pnlR'] for t in wins]), 2) if wins else 0,
        'avg_loser_r': round(np.mean([t['pnlR'] for t in losses]), 2) if losses else 0,
        'return_pct': round((capital - STARTING_CAPITAL) / STARTING_CAPITAL * 100, 1),
        'signals_per_strategy': {name: len([t for t in trades if t.get('sourceStrategy') == name]) for name in strat_histories.keys()},
    }

    print(f"    Switcher: {len(trades)} trades, WR={summary['win_rate']}%, PF={summary['profit_factor']}, PnL=${summary['total_pnl']:,.0f}")

    return {
        'name': 'Switcher',
        'trades': trades,
        'summary': summary,
        'equity_curve': equity_curve,
        'decision_log': decision_log,
    }


def main():
    print("=" * 60)
    print("STRATEGY SWITCHER BACKTEST")
    print("=" * 60)

    # Download data
    all_data = download_data()
    if len(all_data) < 20:
        print(f"ERROR: Only got {len(all_data)} stocks, need at least 20")
        sys.exit(1)

    # Add indicators
    print("\nAdding indicators...")
    for sym in list(all_data.keys()):
        all_data[sym] = add_indicators(all_data[sym])

    # Run each strategy
    print("\nRunning strategies...")
    results = []
    for name, fn in STRATEGIES.items():
        result = run_strategy(name, fn, all_data, START_DATE, END_DATE)
        results.append(result)

    # Run switcher
    switcher = run_switcher(results)

    # Output
    output = {
        'lastUpdated': datetime.now().strftime('%Y-%m-%d %H:%M'),
        'params': {
            'universe': UNIVERSE,
            'universe_count': len(UNIVERSE),
            'start_date': START_DATE,
            'end_date': END_DATE,
            'starting_capital': STARTING_CAPITAL,
            'risk_pct': RISK_PCT,
            'max_position_pct': MAX_POSITION_PCT,
            'trail_activate_r': TRAIL_ACTIVATE_R,
        },
        'strategies': results,
        'switcher': switcher,
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, 'w') as f:
        json.dump(output, f, indent=2, default=str)

    print(f"\n✅ Saved to {OUTPUT_PATH}")
    print(f"\nSUMMARY:")
    print(f"{'Strategy':<20} {'Trades':>7} {'WR':>6} {'PF':>6} {'PnL':>12} {'MaxDD':>10}")
    print("-" * 65)
    for r in results:
        s = r['summary']
        if s:
            print(f"{r['name']:<20} {s['total_trades']:>7} {s['win_rate']:>5.1f}% {s['profit_factor']:>5.2f} ${s['total_pnl']:>10,.0f} ${s['max_drawdown']:>8,.0f}")
    s = switcher['summary']
    if s:
        print(f"{'⭐ SWITCHER':<20} {s['total_trades']:>7} {s['win_rate']:>5.1f}% {s['profit_factor']:>5.2f} ${s['total_pnl']:>10,.0f} ${s['max_drawdown']:>8,.0f}")


if __name__ == '__main__':
    main()
