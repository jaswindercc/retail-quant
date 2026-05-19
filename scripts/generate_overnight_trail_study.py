#!/usr/bin/env python3
"""
SPX OVERNIGHT — Trailing Stop Study
======================================
Tests whether adding a trailing stop (holding beyond 1 day) adds value
vs the baseline 1-day-hold strategy.

Combinations tested:
  - Trail activation: profit must exceed X before trail activates
    (0R = immediate, 0.5R, 1R, 1.5R)
  - Trail distance: trailing stop distance from highest close
    (0.5×ATR, 0.75×ATR, 1×ATR, 1.5×ATR)
  - Max hold days: maximum days to hold if trail not hit
    (1, 2, 3, 5, 7 days)

Baseline: Current strategy exits at next day's close (1-day hold, no trail).
"""

import pandas as pd, numpy as np, json
from pathlib import Path
from itertools import product

DATA_DIR = Path("/workspaces/jas/data")
OUT = Path("/workspaces/jas/dashboard/public/overnight_trail_study.json")
RISK = 100.0

# Strategy params (same as main script)
RISK_ATR_MULT = 0.5
MIN_SCORE_LONG = 3
RSI_SHORT_LEN = 5
RSI_LONG_LEN = 14
VIX_SMA_LEN = 20
SPY_SMA50_LEN = 50
SPY_SMA200_LEN = 200
VOL_SMA_LEN = 20

# Trail study parameters
TRAIL_ACTIVATIONS = [0, 0.5, 1.0, 1.5]       # Activate trail after X×R profit
TRAIL_DISTANCES = [0.5, 0.75, 1.0, 1.5]      # Trail = X × ATR from high
MAX_HOLD_DAYS = [1, 2, 3, 5, 7]              # Max days to hold


def load(fp):
    df = pd.read_csv(fp)
    df['Date'] = pd.to_datetime(df['Date'])
    df = df.sort_values('Date').reset_index(drop=True)
    for c in ['Open', 'High', 'Low', 'Close', 'Volume']:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors='coerce')
    return df.dropna(subset=['Open', 'High', 'Low', 'Close'])


def compute_rsi(series, length):
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1/length, min_periods=length, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/length, min_periods=length, adjust=False).mean()
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def prepare_spy(df):
    df = df.copy()
    df['sma50'] = df['Close'].rolling(SPY_SMA50_LEN).mean()
    df['sma200'] = df['Close'].rolling(SPY_SMA200_LEN).mean()
    df['ema20'] = df['Close'].ewm(span=20, adjust=False).mean()
    tr = np.maximum(df['High'] - df['Low'],
        np.maximum(abs(df['High'] - df['Close'].shift(1)),
                   abs(df['Low'] - df['Close'].shift(1))))
    df['atr'] = tr.rolling(14).mean()
    df['rsi5'] = compute_rsi(df['Close'], RSI_SHORT_LEN)
    df['rsi14'] = compute_rsi(df['Close'], RSI_LONG_LEN)
    df['daily_ret'] = df['Close'].pct_change()
    df['up_day'] = (df['Close'] > df['Close'].shift(1)).astype(int)
    df['dn_day'] = (df['Close'] < df['Close'].shift(1)).astype(int)
    df['vol_sma'] = df['Volume'].rolling(VOL_SMA_LEN).mean()
    rng = df['High'] - df['Low']
    df['range_pos'] = np.where(rng > 0, (df['Close'] - df['Low']) / rng, 0.5)
    return df


def prepare_vix(df):
    df = df.copy()
    df['vix_sma20'] = df['Close'].rolling(VIX_SMA_LEN).mean()
    df['vix_change'] = df['Close'].pct_change()
    df['vix_sma50'] = df['Close'].rolling(50).mean()
    return df


def count_consecutive(series, direction='down'):
    counts = pd.Series(0, index=series.index)
    for i in range(1, len(series)):
        if direction == 'down':
            if series.iloc[i] < series.iloc[i-1]:
                counts.iloc[i] = counts.iloc[i-1] + 1
            else:
                counts.iloc[i] = 0
        else:
            if series.iloc[i] > series.iloc[i-1]:
                counts.iloc[i] = counts.iloc[i-1] + 1
            else:
                counts.iloc[i] = 0
    return counts


def compute_signal_score(spy_row, vix_row, consec_dn, consec_up):
    score = 0
    # Strong bullish
    if not pd.isna(vix_row['vix_change']) and vix_row['vix_change'] > 0.12:
        score += 2
    if not pd.isna(spy_row['rsi5']) and spy_row['rsi5'] < 20:
        score += 2
    if (not pd.isna(spy_row['daily_ret']) and spy_row['daily_ret'] < -0.02
            and not pd.isna(spy_row['sma200']) and spy_row['Close'] > spy_row['sma200']):
        score += 2
    # Standard bullish
    if not pd.isna(vix_row['vix_sma20']) and vix_row['Close'] > vix_row['vix_sma20']:
        score += 1
    if not pd.isna(spy_row['rsi5']) and 20 <= spy_row['rsi5'] < 35:
        score += 1
    if consec_dn >= 3:
        score += 1
    if spy_row['range_pos'] < 0.20:
        score += 1
    if (not pd.isna(spy_row['daily_ret']) and -0.02 <= spy_row['daily_ret'] < -0.01
            and not pd.isna(spy_row['sma200']) and spy_row['Close'] > spy_row['sma200']):
        score += 1
    if vix_row['Close'] > 25:
        score += 1
    if not pd.isna(spy_row['sma200']) and spy_row['Close'] > spy_row['sma200']:
        score += 1
    # Strong bearish
    if not pd.isna(spy_row['rsi5']) and spy_row['rsi5'] > 90:
        score -= 2
    if not pd.isna(spy_row['daily_ret']) and spy_row['daily_ret'] > 0.03:
        score -= 2
    if not pd.isna(vix_row['vix_change']) and vix_row['vix_change'] < -0.20:
        score -= 2
    # Standard bearish
    if not pd.isna(vix_row['vix_sma20']) and vix_row['Close'] < vix_row['vix_sma20'] * 0.85:
        score -= 1
    if not pd.isna(spy_row['rsi5']) and 75 <= spy_row['rsi5'] < 90:
        score -= 1
    if consec_up >= 4 and not pd.isna(spy_row['rsi14']) and spy_row['rsi14'] > 65:
        score -= 1
    if not pd.isna(spy_row['sma200']) and spy_row['Close'] < spy_row['sma200']:
        score -= 1
    if not pd.isna(vix_row['vix_change']) and -0.20 <= vix_row['vix_change'] < -0.10:
        score -= 1
    if not pd.isna(spy_row['daily_ret']) and 0.015 < spy_row['daily_ret'] <= 0.03:
        score -= 1
    if (spy_row['range_pos'] > 0.85
            and not pd.isna(spy_row['vol_sma'])
            and spy_row['vol_sma'] > 0
            and spy_row['Volume'] > 1.5 * spy_row['vol_sma']):
        score -= 1
    return score


def compute_signal_score_full(spy_row, vix_row, consec_dn, consec_up):
    """Same as compute_signal_score but also returns reason lists."""
    score = 0
    reasons_bull = []
    reasons_bear = []
    # Strong bullish
    if not pd.isna(vix_row['vix_change']) and vix_row['vix_change'] > 0.12:
        score += 2; reasons_bull.append('VIX_panic(+2)')
    if not pd.isna(spy_row['rsi5']) and spy_row['rsi5'] < 20:
        score += 2; reasons_bull.append('RSI5<20(+2)')
    if (not pd.isna(spy_row['daily_ret']) and spy_row['daily_ret'] < -0.02
            and not pd.isna(spy_row['sma200']) and spy_row['Close'] > spy_row['sma200']):
        score += 2; reasons_bull.append('crash_dip(+2)')
    # Standard bullish
    if not pd.isna(vix_row['vix_sma20']) and vix_row['Close'] > vix_row['vix_sma20']:
        score += 1; reasons_bull.append('VIX>SMA20')
    if not pd.isna(spy_row['rsi5']) and 20 <= spy_row['rsi5'] < 35:
        score += 1; reasons_bull.append('RSI5<35')
    if consec_dn >= 3:
        score += 1; reasons_bull.append(f'{consec_dn}dn_days')
    if spy_row['range_pos'] < 0.20:
        score += 1; reasons_bull.append('close_near_low')
    if (not pd.isna(spy_row['daily_ret']) and -0.02 <= spy_row['daily_ret'] < -0.01
            and not pd.isna(spy_row['sma200']) and spy_row['Close'] > spy_row['sma200']):
        score += 1; reasons_bull.append('dip_in_uptrend')
    if vix_row['Close'] > 25:
        score += 1; reasons_bull.append('VIX>25')
    if not pd.isna(spy_row['sma200']) and spy_row['Close'] > spy_row['sma200']:
        score += 1; reasons_bull.append('above_SMA200')
    # Strong bearish
    if not pd.isna(spy_row['rsi5']) and spy_row['rsi5'] > 90:
        score -= 2; reasons_bear.append('RSI5>90(-2)')
    if not pd.isna(spy_row['daily_ret']) and spy_row['daily_ret'] > 0.03:
        score -= 2; reasons_bear.append('huge_rally(-2)')
    if not pd.isna(vix_row['vix_change']) and vix_row['vix_change'] < -0.20:
        score -= 2; reasons_bear.append('VIX_crushed(-2)')
    # Standard bearish
    if not pd.isna(vix_row['vix_sma20']) and vix_row['Close'] < vix_row['vix_sma20'] * 0.85:
        score -= 1; reasons_bear.append('VIX_complacent')
    if not pd.isna(spy_row['rsi5']) and 75 <= spy_row['rsi5'] < 90:
        score -= 1; reasons_bear.append('RSI5>75')
    if consec_up >= 4 and not pd.isna(spy_row['rsi14']) and spy_row['rsi14'] > 65:
        score -= 1; reasons_bear.append('extended_up')
    if not pd.isna(spy_row['sma200']) and spy_row['Close'] < spy_row['sma200']:
        score -= 1; reasons_bear.append('below_SMA200')
    if not pd.isna(vix_row['vix_change']) and -0.20 <= vix_row['vix_change'] < -0.10:
        score -= 1; reasons_bear.append('VIX_drop')
    if not pd.isna(spy_row['daily_ret']) and 0.015 < spy_row['daily_ret'] <= 0.03:
        score -= 1; reasons_bear.append('big_up_day')
    if (spy_row['range_pos'] > 0.85
            and not pd.isna(spy_row['vol_sma'])
            and spy_row['vol_sma'] > 0
            and spy_row['Volume'] > 1.5 * spy_row['vol_sma']):
        score -= 1; reasons_bear.append('distribution')
    return score, reasons_bull, reasons_bear


def get_entry_signals(merged, consec_dn, consec_up):
    """Get all entry signals (indices where score >= MIN_SCORE_LONG)."""
    entries = []
    for i in range(1, len(merged) - 1):
        row = merged.iloc[i]
        atr = row['atr']
        if pd.isna(atr) or atr <= 0 or pd.isna(row['sma50']) or pd.isna(row['rsi5']):
            continue
        if pd.isna(row['vix_sma20']):
            continue
        vix_row = {
            'Close': row['Close_vix'],
            'vix_sma20': row['vix_sma20'],
            'vix_change': row['vix_change'],
        }
        score, reasons_bull, reasons_bear = compute_signal_score_full(row, vix_row, int(consec_dn.iloc[i]), int(consec_up.iloc[i]))
        if score >= MIN_SCORE_LONG:
            entries.append({'idx': i, 'score': score, 'atr': atr, 'reasonsBull': reasons_bull, 'reasonsBear': reasons_bear})
    return entries


def simulate_trailing_stop(merged, entries, trail_activation_r, trail_dist_atr, max_days):
    """
    Simulate trades with trailing stop logic.
    
    Trail logic:
    1. Enter at close of signal day
    2. Each subsequent day, check if high went above trail activation threshold
    3. Once activated, trail stop = highest_close - trail_distance
    4. Exit when: close < trail_stop OR max_days reached (exit at that day's close)
    5. If trail never activates and max_days reached, exit at close
    
    For max_days=1, this is equivalent to the baseline (exit next day close).
    """
    trades = []
    
    for entry in entries:
        i = entry['idx']
        atr = entry['atr']
        score = entry['score']
        
        entry_price = merged.iloc[i]['Close']
        risk_dist = RISK_ATR_MULT * atr
        if risk_dist <= 0:
            continue
        qty = max(1, round(RISK / risk_dist))
        
        # Trail parameters
        activation_level = entry_price + trail_activation_r * risk_dist  # Price must reach this to activate trail
        trail_distance = trail_dist_atr * atr  # Trail distance from highest close
        
        # Simulate forward
        trail_active = False
        highest_close = entry_price
        trail_stop = 0
        exit_price = None
        exit_idx = None
        exit_reason = None
        
        # If activation is 0, trail is immediately active
        if trail_activation_r == 0:
            trail_active = True
            trail_stop = entry_price - trail_distance
        
        for d in range(1, max_days + 1):
            future_idx = i + d
            if future_idx >= len(merged):
                # Ran out of data — exit at last available close
                future_idx = len(merged) - 1
                exit_price = merged.iloc[future_idx]['Close']
                exit_idx = future_idx
                exit_reason = 'data_end'
                break
            
            day_row = merged.iloc[future_idx]
            day_close = day_row['Close']
            day_low = day_row['Low']
            
            # Check if trail activates (using close price to be conservative with daily data)
            if not trail_active and day_close >= activation_level:
                trail_active = True
                highest_close = day_close
                trail_stop = highest_close - trail_distance
            elif trail_active and day_close > highest_close:
                highest_close = day_close
                trail_stop = highest_close - trail_distance
            
            # Check if trail stop hit (use low for intraday stop-out)
            if trail_active and day_low <= trail_stop:
                # Stopped out — exit at trail stop level (or close if gapped through)
                exit_price = min(day_close, trail_stop)  # Conservative: worse of stop or close
                exit_idx = future_idx
                exit_reason = 'trail_stop'
                break
            
            # If max days reached, exit at close
            if d == max_days:
                exit_price = day_close
                exit_idx = future_idx
                exit_reason = f'max_{max_days}d'
                break
        
        if exit_price is None:
            continue
        
        pnl_dollar = qty * (exit_price - entry_price)
        pnl_r = pnl_dollar / RISK
        duration = exit_idx - i
        
        trades.append({
            'entryDate': merged.iloc[i]['Date'].strftime('%Y-%m-%d'),
            'exitDate': merged.iloc[exit_idx]['Date'].strftime('%Y-%m-%d'),
            'entryPrice': round(entry_price, 2),
            'exitPrice': round(exit_price, 2),
            'pnlDollar': round(pnl_dollar, 2),
            'pnlR': round(pnl_r, 2),
            'score': score,
            'durationDays': duration,
            'exitReason': exit_reason,
            'trailActive': trail_active,
            'reasonsBull': entry.get('reasonsBull', []),
            'reasonsBear': entry.get('reasonsBear', []),
        })
    
    return trades


def compute_stats(trades):
    """Compute strategy statistics."""
    if not trades:
        return None
    n = len(trades)
    wins = [t for t in trades if t['pnlDollar'] > 0]
    losses = [t for t in trades if t['pnlDollar'] <= 0]
    total_pnl = sum(t['pnlDollar'] for t in trades)
    win_rate = len(wins) / n * 100
    avg_r = sum(t['pnlR'] for t in trades) / n
    gross_profit = sum(t['pnlDollar'] for t in wins) if wins else 0
    gross_loss = abs(sum(t['pnlDollar'] for t in losses)) if losses else 0
    pf = gross_profit / gross_loss if gross_loss > 0 else float('inf')
    avg_duration = sum(t['durationDays'] for t in trades) / n
    
    # Max drawdown (equity curve based)
    equity = 0
    peak = 0
    max_dd = 0
    for t in sorted(trades, key=lambda x: x['entryDate']):
        equity += t['pnlDollar']
        if equity > peak:
            peak = equity
        dd = peak - equity
        if dd > max_dd:
            max_dd = dd
    
    return {
        'trades': n,
        'winRate': round(win_rate, 1),
        'totalPnl': round(total_pnl, 0),
        'profitFactor': round(pf, 2) if pf != float('inf') else 99.99,
        'avgR': round(avg_r, 3),
        'avgDuration': round(avg_duration, 1),
        'maxDrawdown': round(max_dd, 0),
        'grossProfit': round(gross_profit, 0),
        'grossLoss': round(gross_loss, 0),
    }


def main():
    print("Loading SPX and VIX data...")
    spy_df = load(DATA_DIR / "SPX_daily_data_right - Sheet1.csv")
    vix_df = load(DATA_DIR / "VIX_daily_data_right - Sheet1.csv")
    print(f"  SPX: {len(spy_df)} bars")
    print(f"  VIX: {len(vix_df)} bars")
    
    # Prepare data
    spy = prepare_spy(spy_df)
    vix = prepare_vix(vix_df)
    spy['date_only'] = spy['Date'].dt.date
    vix['date_only'] = vix['Date'].dt.date
    merged = spy.merge(vix[['date_only', 'Close', 'vix_sma20', 'vix_change', 'vix_sma50']],
                       on='date_only', how='inner', suffixes=('', '_vix'))
    merged = merged.sort_values('Date').reset_index(drop=True)
    
    consec_dn = count_consecutive(merged['Close'], 'down')
    consec_up = count_consecutive(merged['Close'], 'up')
    
    # Get all entry signals
    entries = get_entry_signals(merged, consec_dn, consec_up)
    print(f"\n  Found {len(entries)} entry signals")
    
    # ══════════════════════════════════════════════════════════
    # Run all combinations
    # ══════════════════════════════════════════════════════════
    results = []
    
    print(f"\n  Testing {len(TRAIL_ACTIVATIONS) * len(TRAIL_DISTANCES) * len(MAX_HOLD_DAYS)} combinations...")
    
    for activation, trail_dist, max_days in product(TRAIL_ACTIVATIONS, TRAIL_DISTANCES, MAX_HOLD_DAYS):
        trades = simulate_trailing_stop(merged, entries, activation, trail_dist, max_days)
        stats = compute_stats(trades)
        if stats:
            results.append({
                'activation': activation,
                'trailDist': trail_dist,
                'maxDays': max_days,
                'label': f"Act={activation}R | Trail={trail_dist}×ATR | Max={max_days}d",
                **stats
            })
    
    # Sort by total PnL descending
    results.sort(key=lambda x: x['totalPnl'], reverse=True)
    
    # ══════════════════════════════════════════════════════════
    # Print results
    # ══════════════════════════════════════════════════════════
    print(f"\n{'='*90}")
    print(f"TRAILING STOP STUDY — SPX OVERNIGHT (LONG ONLY)")
    print(f"{'='*90}")
    print(f"\n{'Rank':<5} {'Config':<35} {'Trades':<7} {'WR%':<7} {'PF':<6} {'AvgR':<7} {'AvgDays':<8} {'PnL':<10} {'MaxDD':<8}")
    print(f"{'-'*90}")
    
    # Baseline first (max_days=1, which is essentially no trail)
    baseline = next((r for r in results if r['maxDays'] == 1 and r['activation'] == 0 and r['trailDist'] == 0.5), None)
    if baseline:
        print(f"{'BASE':<5} {'1-day hold (current)':<35} {baseline['trades']:<7} {baseline['winRate']:<7} {baseline['profitFactor']:<6} {baseline['avgR']:<7} {baseline['avgDuration']:<8} ${baseline['totalPnl']:>7,.0f}  ${baseline['maxDrawdown']:>6,.0f}")
        print(f"{'-'*90}")
    
    for rank, r in enumerate(results[:25], 1):
        print(f"{rank:<5} {r['label']:<35} {r['trades']:<7} {r['winRate']:<7} {r['profitFactor']:<6} {r['avgR']:<7} {r['avgDuration']:<8} ${r['totalPnl']:>7,.0f}  ${r['maxDrawdown']:>6,.0f}")
    
    # ══════════════════════════════════════════════════════════
    # Best by category
    # ══════════════════════════════════════════════════════════
    print(f"\n\n{'='*60}")
    print("BEST BY METRIC:")
    print(f"{'='*60}")
    
    best_pnl = max(results, key=lambda x: x['totalPnl'])
    best_pf = max(results, key=lambda x: x['profitFactor'])
    best_wr = max(results, key=lambda x: x['winRate'])
    best_avgr = max(results, key=lambda x: x['avgR'])
    lowest_dd = min(results, key=lambda x: x['maxDrawdown'])
    
    print(f"  Best P&L:     {best_pnl['label']}  →  ${best_pnl['totalPnl']:,.0f} (PF={best_pnl['profitFactor']}, WR={best_pnl['winRate']}%)")
    print(f"  Best PF:      {best_pf['label']}  →  PF={best_pf['profitFactor']} (${best_pf['totalPnl']:,.0f}, WR={best_pf['winRate']}%)")
    print(f"  Best WR:      {best_wr['label']}  →  WR={best_wr['winRate']}% (${best_wr['totalPnl']:,.0f}, PF={best_wr['profitFactor']})")
    print(f"  Best AvgR:    {best_avgr['label']}  →  AvgR={best_avgr['avgR']} (${best_avgr['totalPnl']:,.0f})")
    print(f"  Lowest DD:    {lowest_dd['label']}  →  MaxDD=${lowest_dd['maxDrawdown']:,.0f} (${lowest_dd['totalPnl']:,.0f})")
    
    # ══════════════════════════════════════════════════════════
    # Dimension analysis: Best max_days
    # ══════════════════════════════════════════════════════════
    print(f"\n\n{'='*60}")
    print("ANALYSIS BY MAX HOLD DAYS (averaged across all trail configs):")
    print(f"{'='*60}")
    for days in MAX_HOLD_DAYS:
        day_results = [r for r in results if r['maxDays'] == days]
        if day_results:
            avg_pnl = sum(r['totalPnl'] for r in day_results) / len(day_results)
            avg_pf = sum(r['profitFactor'] for r in day_results) / len(day_results)
            avg_wr = sum(r['winRate'] for r in day_results) / len(day_results)
            avg_dur = sum(r['avgDuration'] for r in day_results) / len(day_results)
            print(f"  {days} day(s):  Avg PnL=${avg_pnl:>8,.0f}  Avg PF={avg_pf:.2f}  Avg WR={avg_wr:.1f}%  Avg Duration={avg_dur:.1f}d")
    
    print(f"\n{'='*60}")
    print("ANALYSIS BY TRAIL ACTIVATION (averaged):")
    print(f"{'='*60}")
    for act in TRAIL_ACTIVATIONS:
        act_results = [r for r in results if r['activation'] == act]
        if act_results:
            avg_pnl = sum(r['totalPnl'] for r in act_results) / len(act_results)
            avg_pf = sum(r['profitFactor'] for r in act_results) / len(act_results)
            avg_wr = sum(r['winRate'] for r in act_results) / len(act_results)
            print(f"  Activate at {act}R:  Avg PnL=${avg_pnl:>8,.0f}  Avg PF={avg_pf:.2f}  Avg WR={avg_wr:.1f}%")
    
    print(f"\n{'='*60}")
    print("ANALYSIS BY TRAIL DISTANCE (averaged):")
    print(f"{'='*60}")
    for dist in TRAIL_DISTANCES:
        dist_results = [r for r in results if r['trailDist'] == dist]
        if dist_results:
            avg_pnl = sum(r['totalPnl'] for r in dist_results) / len(dist_results)
            avg_pf = sum(r['profitFactor'] for r in dist_results) / len(dist_results)
            avg_wr = sum(r['winRate'] for r in dist_results) / len(dist_results)
            print(f"  Trail {dist}×ATR:  Avg PnL=${avg_pnl:>8,.0f}  Avg PF={avg_pf:.2f}  Avg WR={avg_wr:.1f}%")
    
    # ══════════════════════════════════════════════════════════
    # Also get the best trade list from the top config for the dashboard
    # Use 3-day max (best PF) as the featured config
    # ══════════════════════════════════════════════════════════
    # Best PF config: Act=1.5R, Trail=1.5×ATR, Max=3d
    featured_config = next((r for r in results if r['activation'] == 1.5 and r['trailDist'] == 1.5 and r['maxDays'] == 3), results[0])
    featured_trades = simulate_trailing_stop(
        merged, entries, featured_config['activation'], featured_config['trailDist'], featured_config['maxDays']
    )
    
    # Also get the original 1-day hold trades (no trail, just exit next close)
    original_trades = simulate_trailing_stop(merged, entries, 0, 99.0, 1)  # huge trail = never hit, max 1 day = exit at close
    
    # SPX price series for overlay
    spx_prices = []
    for _, row in merged.iterrows():
        if pd.notna(row['sma50']):
            spx_prices.append({
                'date': row['Date'].strftime('%Y-%m-%d'),
                'close': round(row['Close'], 2),
            })
    
    # ══════════════════════════════════════════════════════════
    # FILTER ANALYSIS — test regime filters to reduce drawdown
    # ══════════════════════════════════════════════════════════
    # Build SMA lookup from merged data
    sma50_map = dict(zip(merged['Date'].dt.strftime('%Y-%m-%d'), merged['sma50']))
    sma200_map = dict(zip(merged['Date'].dt.strftime('%Y-%m-%d'), merged['sma200']))
    close_map = dict(zip(merged['Date'].dt.strftime('%Y-%m-%d'), merged['Close']))
    
    featured_sorted = sorted(featured_trades, key=lambda t: t['entryDate'])
    
    def apply_sma_filter(trades, sma_map):
        return [t for t in trades if sma_map.get(t['entryDate']) and 
                close_map.get(t['entryDate'], 0) > sma_map.get(t['entryDate'], 99999)]
    
    def apply_pause_filter(trades, max_consec_loss):
        filtered = []
        consec_loss = 0
        for t in trades:
            if consec_loss >= max_consec_loss:
                if t['pnlDollar'] > 0:
                    consec_loss = 0
                continue
            filtered.append(t)
            if t['pnlDollar'] <= 0:
                consec_loss += 1
            else:
                consec_loss = 0
        return filtered
    
    def filter_stats(tlist):
        if not tlist:
            return None
        n = len(tlist)
        wins = [t for t in tlist if t['pnlDollar'] > 0]
        losses = [t for t in tlist if t['pnlDollar'] <= 0]
        pnl = sum(t['pnlDollar'] for t in tlist)
        wr = len(wins) / n * 100
        gp = sum(t['pnlDollar'] for t in wins) if wins else 0
        gl = abs(sum(t['pnlDollar'] for t in losses)) if losses else 0
        pf = gp / gl if gl > 0 else 99.99
        eq = 0; peak = 0; maxdd = 0
        for t in tlist:
            eq += t['pnlDollar']
            peak = max(peak, eq)
            maxdd = max(maxdd, peak - eq)
        return {
            'trades': n, 'winRate': round(wr, 1), 'profitFactor': round(pf, 2),
            'totalPnl': round(pnl, 0), 'maxDrawdown': round(maxdd, 0),
            'avgR': round(sum(t['pnlR'] for t in tlist) / n, 3),
        }
    
    filters_results = []
    
    # No filter (baseline)
    filters_results.append({'name': 'No Filter (current)', 'key': 'none', 
                           **filter_stats(featured_sorted), 'trades_list': featured_sorted})
    
    # SMA50 filter
    f_sma50 = apply_sma_filter(featured_sorted, sma50_map)
    filters_results.append({'name': 'SPX > SMA(50)', 'key': 'sma50',
                           **filter_stats(f_sma50), 'trades_list': f_sma50})
    
    # Pause after 2 consecutive losses
    f_pause2 = apply_pause_filter(featured_sorted, 2)
    filters_results.append({'name': 'Pause after 2 consecutive losses', 'key': 'pause2',
                           **filter_stats(f_pause2), 'trades_list': f_pause2})
    
    # SMA50 + SMA200
    f_both = [t for t in featured_sorted if 
              sma50_map.get(t['entryDate']) and sma200_map.get(t['entryDate']) and
              close_map.get(t['entryDate'], 0) > sma50_map.get(t['entryDate'], 99999) and
              close_map.get(t['entryDate'], 0) > sma200_map.get(t['entryDate'], 99999)]
    filters_results.append({'name': 'SPX > SMA(50) + SMA(200)', 'key': 'sma50_200',
                           **filter_stats(f_both), 'trades_list': f_both})
    
    # SMA50 + pause after 2
    f_sma50_pause = apply_pause_filter(f_sma50, 2)
    filters_results.append({'name': 'SPX > SMA(50) + pause after 2 losses', 'key': 'sma50_pause2',
                           **filter_stats(f_sma50_pause), 'trades_list': f_sma50_pause})
    
    # No overlap (1 trade at a time) + SMA50
    f_no_overlap = []
    last_exit = ''
    for t in f_sma50:
        if t['entryDate'] >= last_exit:
            f_no_overlap.append(t)
            last_exit = t['exitDate']
    filters_results.append({'name': 'SPX > SMA(50) + no overlap', 'key': 'sma50_nooverlap',
                           **filter_stats(f_no_overlap), 'trades_list': f_no_overlap})
    
    # Build equity curves for each filter
    filter_equities = {}
    for fr in filters_results:
        eq = 0
        curve = []
        for t in fr['trades_list']:
            eq += t['pnlDollar']
            curve.append({'date': t['exitDate'], 'equity': round(eq, 2)})
        filter_equities[fr['key']] = curve
    
    # Remove trades_list from output (too large)
    filters_output = [{k: v for k, v in fr.items() if k != 'trades_list'} for fr in filters_results]
    
    # ══════════════════════════════════════════════════════════
    # THREE CONFIGS FOR DASHBOARD:
    # 1. Vanilla (1-day hold, SMA50+pause) — baseline
    # 2. Trail 3d (Act=1.5R, Dist=1.5×ATR, Max=3d, SMA50+pause)
    # 3. Trail Forever (Act=1.5R, Dist=1.5×ATR, no time limit, SMA50+pause)
    # ══════════════════════════════════════════════════════════
    
    # Vanilla: 1-day hold (no trail, just exit next close)
    vanilla_trades = simulate_trailing_stop(merged, entries, 0, 99.0, 1)
    vanilla_sorted = sorted(vanilla_trades, key=lambda t: t['entryDate'])
    vanilla_sma = apply_sma_filter(vanilla_sorted, sma50_map)
    vanilla_final = apply_pause_filter(vanilla_sma, 2)
    vanilla_stats = filter_stats(vanilla_final)
    vanilla_stats['avgDuration'] = round(sum(t['durationDays'] for t in vanilla_final) / len(vanilla_final), 1) if vanilla_final else 0
    
    # Trail 3d
    trail3_trades = simulate_trailing_stop(merged, entries, 1.5, 1.5, 3)
    trail3_sorted = sorted(trail3_trades, key=lambda t: t['entryDate'])
    trail3_sma = apply_sma_filter(trail3_sorted, sma50_map)
    trail3_final = apply_pause_filter(trail3_sma, 2)
    trail3_stats = filter_stats(trail3_final)
    trail3_stats['avgDuration'] = round(sum(t['durationDays'] for t in trail3_final) / len(trail3_final), 1) if trail3_final else 0
    
    # Trail Forever
    forever_trades = simulate_trailing_stop(merged, entries, 1.5, 1.5, 999)
    forever_sorted = sorted(forever_trades, key=lambda t: t['entryDate'])
    forever_sma = apply_sma_filter(forever_sorted, sma50_map)
    forever_final = apply_pause_filter(forever_sma, 2)
    forever_stats = filter_stats(forever_final)
    forever_stats['avgDuration'] = round(sum(t['durationDays'] for t in forever_final) / len(forever_final), 1) if forever_final else 0
    
    # Hold duration comparison table (quick summary)
    hold_days_list = [1, 2, 3, 5, 7, 999]
    hold_comparison = []
    for days in hold_days_list:
        h_trades = simulate_trailing_stop(merged, entries, 1.5, 1.5, days)
        h_sorted = sorted(h_trades, key=lambda t: t['entryDate'])
        h_sma = apply_sma_filter(h_sorted, sma50_map)
        h_final = apply_pause_filter(h_sma, 2)
        h_stats = filter_stats(h_final)
        if h_stats:
            h_stats['avgDuration'] = round(sum(t['durationDays'] for t in h_final) / len(h_final), 1) if h_final else 0
            label = f"{days}d" if days < 999 else "Forever"
            hold_comparison.append({'maxDays': days, 'label': label, **h_stats})
    
    print(f"\n{'='*80}")
    print("THREE CONFIGS (all with SMA50 + Pause after 2 losses)")
    print(f"{'='*80}")
    print(f"\n{'Config':<20} {'Trades':<8} {'WR%':<7} {'PF':<6} {'P&L':<10} {'MaxDD':<9} {'AvgR':<7} {'AvgHold':<8}")
    print(f"{'-'*75}")
    print(f"{'Vanilla (1d)':<20} {vanilla_stats['trades']:<8} {vanilla_stats['winRate']:<7.1f} {vanilla_stats['profitFactor']:<6.2f} ${vanilla_stats['totalPnl']:>7,.0f}  ${vanilla_stats['maxDrawdown']:>6,.0f}  {vanilla_stats['avgR']:<7.3f} {vanilla_stats['avgDuration']:.1f}d")
    print(f"{'Trail 3d':<20} {trail3_stats['trades']:<8} {trail3_stats['winRate']:<7.1f} {trail3_stats['profitFactor']:<6.2f} ${trail3_stats['totalPnl']:>7,.0f}  ${trail3_stats['maxDrawdown']:>6,.0f}  {trail3_stats['avgR']:<7.3f} {trail3_stats['avgDuration']:.1f}d")
    print(f"{'Trail Forever':<20} {forever_stats['trades']:<8} {forever_stats['winRate']:<7.1f} {forever_stats['profitFactor']:<6.2f} ${forever_stats['totalPnl']:>7,.0f}  ${forever_stats['maxDrawdown']:>6,.0f}  {forever_stats['avgR']:<7.3f} {forever_stats['avgDuration']:.1f}d")

    # Build output JSON
    output = {
        'configs': [
            {
                'key': 'vanilla',
                'name': 'Vanilla (1-day hold)',
                'description': 'Exit at next day close. No trailing stop.',
                'stats': vanilla_stats,
                'trades': vanilla_final,
            },
            {
                'key': 'trail3d',
                'name': 'Trail Stop (3-day max)',
                'description': 'Trail activates at +1.5R, distance 1.5×ATR. Exit at trail or 3 days.',
                'stats': trail3_stats,
                'trades': trail3_final,
            },
            {
                'key': 'forever',
                'name': 'Trail Stop (Forever)',
                'description': 'Trail activates at +1.5R, distance 1.5×ATR. No time limit — hold until trail hits.',
                'stats': forever_stats,
                'trades': forever_final,
            },
        ],
        'holdComparison': hold_comparison,
        'spxPrices': spx_prices,
    }
    
    # Save
    with open(OUT, 'w') as f:
        json.dump(output, f, indent=2)
    print(f"\n\nSaved results to {OUT}")


if __name__ == '__main__':
    main()
