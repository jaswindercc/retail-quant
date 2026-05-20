#!/usr/bin/env python3
"""
OVERNIGHT SCANNER — Dashboard Signal Generator
================================================
Reads existing SPX/VIX CSV data, calculates daily scores and signals,
outputs scanner_data.json for the dashboard scanner page.

Shows for each day:
  - Score + signal breakdown
  - Whether each config (vanilla/trail3d/forever) would have entered
  - Open position tracking (trail levels, current R, etc.)

Run once after data update. Dashboard reads the JSON.
"""

import pandas as pd, numpy as np, json
from pathlib import Path

DATA_DIR = Path("/workspaces/jas/data")
OUT = Path("/workspaces/jas/dashboard/public/scanner_data.json")
RISK = 100.0

# Strategy params
RISK_ATR_MULT = 0.5
MIN_SCORE_LONG = 3
RSI_SHORT_LEN = 5
RSI_LONG_LEN = 14
VIX_SMA_LEN = 20
SPY_SMA50_LEN = 50
SPY_SMA200_LEN = 200
VOL_SMA_LEN = 20

# Trail params
TRAIL_ACTIVATION_R = 1.5
TRAIL_DIST_ATR = 1.5


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
    tr = np.maximum(df['High'] - df['Low'],
        np.maximum(abs(df['High'] - df['Close'].shift(1)),
                   abs(df['Low'] - df['Close'].shift(1))))
    df['atr'] = tr.rolling(14).mean()
    df['rsi5'] = compute_rsi(df['Close'], RSI_SHORT_LEN)
    df['rsi14'] = compute_rsi(df['Close'], RSI_LONG_LEN)
    df['daily_ret'] = df['Close'].pct_change()
    df['vol_sma'] = df['Volume'].rolling(VOL_SMA_LEN).mean()
    rng = df['High'] - df['Low']
    df['range_pos'] = np.where(rng > 0, (df['Close'] - df['Low']) / rng, 0.5)
    return df


def prepare_vix(df):
    df = df.copy()
    df['vix_sma20'] = df['Close'].rolling(VIX_SMA_LEN).mean()
    df['vix_change'] = df['Close'].pct_change()
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


def compute_signals(spy_row, vix_row, consec_dn, consec_up):
    """Compute score and return individual signal breakdown."""
    signals = []
    score = 0

    # Strong bullish (+2)
    if not pd.isna(vix_row['vix_change']) and vix_row['vix_change'] > 0.12:
        score += 2; signals.append({'name': 'VIX Panic', 'points': 2, 'type': 'bull'})
    if not pd.isna(spy_row['rsi5']) and spy_row['rsi5'] < 20:
        score += 2; signals.append({'name': 'RSI(5) < 20', 'points': 2, 'type': 'bull'})
    if (not pd.isna(spy_row['daily_ret']) and spy_row['daily_ret'] < -0.02
            and not pd.isna(spy_row['sma200']) and spy_row['Close'] > spy_row['sma200']):
        score += 2; signals.append({'name': 'Crash Dip', 'points': 2, 'type': 'bull'})

    # Standard bullish (+1)
    if not pd.isna(vix_row['vix_sma20']) and vix_row['Close'] > vix_row['vix_sma20']:
        score += 1; signals.append({'name': 'VIX > SMA20', 'points': 1, 'type': 'bull'})
    if not pd.isna(spy_row['rsi5']) and 20 <= spy_row['rsi5'] < 35:
        score += 1; signals.append({'name': 'RSI(5) < 35', 'points': 1, 'type': 'bull'})
    if consec_dn >= 3:
        score += 1; signals.append({'name': f'{consec_dn} Down Days', 'points': 1, 'type': 'bull'})
    if spy_row['range_pos'] < 0.20:
        score += 1; signals.append({'name': 'Close Near Low', 'points': 1, 'type': 'bull'})
    if (not pd.isna(spy_row['daily_ret']) and -0.02 <= spy_row['daily_ret'] < -0.01
            and not pd.isna(spy_row['sma200']) and spy_row['Close'] > spy_row['sma200']):
        score += 1; signals.append({'name': 'Dip in Uptrend', 'points': 1, 'type': 'bull'})
    if vix_row['Close'] > 25:
        score += 1; signals.append({'name': 'VIX > 25', 'points': 1, 'type': 'bull'})
    if not pd.isna(spy_row['sma200']) and spy_row['Close'] > spy_row['sma200']:
        score += 1; signals.append({'name': 'Above SMA200', 'points': 1, 'type': 'bull'})

    # Strong bearish (-2)
    if not pd.isna(spy_row['rsi5']) and spy_row['rsi5'] > 90:
        score -= 2; signals.append({'name': 'RSI(5) > 90', 'points': -2, 'type': 'bear'})
    if not pd.isna(spy_row['daily_ret']) and spy_row['daily_ret'] > 0.03:
        score -= 2; signals.append({'name': 'Huge Rally', 'points': -2, 'type': 'bear'})
    if not pd.isna(vix_row['vix_change']) and vix_row['vix_change'] < -0.20:
        score -= 2; signals.append({'name': 'VIX Crushed', 'points': -2, 'type': 'bear'})

    # Standard bearish (-1)
    if not pd.isna(vix_row['vix_sma20']) and vix_row['Close'] < vix_row['vix_sma20'] * 0.85:
        score -= 1; signals.append({'name': 'VIX Complacent', 'points': -1, 'type': 'bear'})
    if not pd.isna(spy_row['rsi5']) and 75 <= spy_row['rsi5'] < 90:
        score -= 1; signals.append({'name': 'RSI(5) > 75', 'points': -1, 'type': 'bear'})
    if consec_up >= 4 and not pd.isna(spy_row['rsi14']) and spy_row['rsi14'] > 65:
        score -= 1; signals.append({'name': 'Extended Up', 'points': -1, 'type': 'bear'})
    if not pd.isna(spy_row['sma200']) and spy_row['Close'] < spy_row['sma200']:
        score -= 1; signals.append({'name': 'Below SMA200', 'points': -1, 'type': 'bear'})
    if not pd.isna(vix_row['vix_change']) and -0.20 <= vix_row['vix_change'] < -0.10:
        score -= 1; signals.append({'name': 'VIX Drop', 'points': -1, 'type': 'bear'})
    if not pd.isna(spy_row['daily_ret']) and 0.015 < spy_row['daily_ret'] <= 0.03:
        score -= 1; signals.append({'name': 'Big Up Day', 'points': -1, 'type': 'bear'})
    if (spy_row['range_pos'] > 0.85
            and not pd.isna(spy_row['vol_sma'])
            and spy_row['vol_sma'] > 0
            and spy_row['Volume'] > 1.5 * spy_row['vol_sma']):
        score -= 1; signals.append({'name': 'Distribution', 'points': -1, 'type': 'bear'})

    return score, signals


def simulate_positions(merged, consec_dn, consec_up):
    """
    Walk through all days, tracking open positions for each config.
    Returns daily scanner rows + position history for each config.
    """
    n = len(merged)
    sma50_map = {}
    for _, row in merged.iterrows():
        d = row['Date'].strftime('%Y-%m-%d')
        sma50_map[d] = row['sma50'] if not pd.isna(row['sma50']) else None

    # Position state for each config
    configs = {
        'vanilla': {'max_days': 1, 'use_filter': False, 'trail': False},
        'trail3d': {'max_days': 3, 'use_filter': True, 'trail': True},
        'forever': {'max_days': 999, 'use_filter': True, 'trail': True},
    }

    positions = {k: None for k in configs}  # Current open position
    trade_history = {k: [] for k in configs}  # Closed trades
    consec_losses = {k: 0 for k in configs}
    paused = {k: False for k in configs}

    daily_rows = []

    for i in range(1, n - 1):
        row = merged.iloc[i]
        date_str = row['Date'].strftime('%Y-%m-%d')
        close = row['Close']
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

        score, signals = compute_signals(row, vix_row, int(consec_dn.iloc[i]), int(consec_up.iloc[i]))
        above_sma50 = close > row['sma50']
        entry_signal = score >= MIN_SCORE_LONG

        # Check existing positions — advance/exit
        for cfg_key, cfg in configs.items():
            pos = positions[cfg_key]
            if pos is not None:
                pos['days_held'] += 1
                day_close = close
                day_low = row['Low']

                # Update trail
                if cfg['trail'] and pos['trail_active']:
                    if day_close > pos['highest_close']:
                        pos['highest_close'] = day_close
                        pos['trail_stop'] = pos['highest_close'] - TRAIL_DIST_ATR * pos['entry_atr']
                elif cfg['trail'] and not pos['trail_active']:
                    if day_close >= pos['activation_level']:
                        pos['trail_active'] = True
                        pos['highest_close'] = day_close
                        pos['trail_stop'] = pos['highest_close'] - TRAIL_DIST_ATR * pos['entry_atr']

                # Check exit conditions
                exited = False
                exit_reason = None

                if cfg['trail'] and pos['trail_active'] and day_low <= pos['trail_stop']:
                    exit_price = min(day_close, pos['trail_stop'])
                    exit_reason = 'trail_stop'
                    exited = True
                elif pos['days_held'] >= cfg['max_days']:
                    exit_price = day_close
                    exit_reason = f"max_{cfg['max_days']}d"
                    exited = True

                if exited:
                    pnl = pos['qty'] * (exit_price - pos['entry_price'])
                    pnl_r = pnl / RISK
                    trade_history[cfg_key].append({
                        'entryDate': pos['entry_date'],
                        'exitDate': date_str,
                        'entryPrice': round(pos['entry_price'], 2),
                        'exitPrice': round(exit_price, 2),
                        'pnl': round(pnl, 2),
                        'pnlR': round(pnl_r, 2),
                        'daysHeld': pos['days_held'],
                        'exitReason': exit_reason,
                        'trailActive': pos.get('trail_active', False),
                    })
                    # Update pause logic
                    if pnl < 0:
                        consec_losses[cfg_key] += 1
                        if consec_losses[cfg_key] >= 2 and cfg['use_filter']:
                            paused[cfg_key] = True
                    else:
                        consec_losses[cfg_key] = 0
                        paused[cfg_key] = False
                    positions[cfg_key] = None

        # Check new entries
        entry_status = {}
        for cfg_key, cfg in configs.items():
            if positions[cfg_key] is not None:
                entry_status[cfg_key] = 'in_position'
                continue

            can_enter = entry_signal
            blocked_reason = None

            if cfg['use_filter']:
                if not above_sma50:
                    can_enter = False
                    blocked_reason = 'SPX < SMA50'
                elif paused[cfg_key]:
                    can_enter = False
                    blocked_reason = 'Paused (2 losses)'

            if can_enter:
                risk_dist = RISK_ATR_MULT * atr
                qty = max(1, round(RISK / risk_dist))
                activation_level = close + TRAIL_ACTIVATION_R * risk_dist

                positions[cfg_key] = {
                    'entry_date': date_str,
                    'entry_price': close,
                    'entry_atr': atr,
                    'qty': qty,
                    'days_held': 0,
                    'trail_active': False,
                    'highest_close': close,
                    'trail_stop': 0,
                    'activation_level': activation_level,
                }
                entry_status[cfg_key] = 'entered'
            elif not entry_signal:
                entry_status[cfg_key] = 'no_signal'
                # Check if this would have been a win (for pause reset)
                if paused[cfg_key] and entry_signal:
                    pass  # would check hypothetical
            else:
                entry_status[cfg_key] = f'blocked: {blocked_reason}'

        # Build daily row
        daily_row = {
            'date': date_str,
            'close': round(close, 2),
            'sma50': round(row['sma50'], 2),
            'atr': round(atr, 2),
            'rsi5': round(row['rsi5'], 1) if not pd.isna(row['rsi5']) else None,
            'vix': round(row['Close_vix'], 2) if not pd.isna(row['Close_vix']) else None,
            'score': score,
            'signals': signals,
            'aboveSma50': above_sma50,
            'entrySignal': entry_signal,
            'configs': {}
        }

        for cfg_key in configs:
            pos = positions[cfg_key]
            cfg_status = {
                'status': entry_status[cfg_key],
                'paused': paused[cfg_key] if configs[cfg_key]['use_filter'] else False,
            }
            if pos is not None:
                cfg_status['position'] = {
                    'entryDate': pos['entry_date'],
                    'entryPrice': round(pos['entry_price'], 2),
                    'daysHeld': pos['days_held'],
                    'trailActive': pos['trail_active'],
                    'highestClose': round(pos['highest_close'], 2),
                    'trailStop': round(pos['trail_stop'], 2) if pos['trail_active'] else None,
                    'currentR': round(pos['qty'] * (close - pos['entry_price']) / RISK, 2),
                    'activationLevel': round(pos['activation_level'], 2),
                }
            cfg_status['totalTrades'] = len(trade_history[cfg_key])
            wins = [t for t in trade_history[cfg_key] if t['pnl'] > 0]
            cfg_status['totalPnl'] = round(sum(t['pnl'] for t in trade_history[cfg_key]), 2)
            cfg_status['winRate'] = round(100 * len(wins) / len(trade_history[cfg_key]), 1) if trade_history[cfg_key] else 0
            daily_row['configs'][cfg_key] = cfg_status

        daily_rows.append(daily_row)

    return daily_rows, trade_history


def main():
    # Load data
    spy_file = DATA_DIR / "SPX_daily_data_right - Sheet1.csv"
    if not spy_file.exists():
        print(f"ERROR: {spy_file} not found")
        return

    spy = load(spy_file)
    spy = prepare_spy(spy)

    # VIX data
    vix_file = DATA_DIR / "VIX_daily_data_right - Sheet1.csv"

    if not vix_file.exists():
        print(f"ERROR: {vix_file} not found")
        return

    vix = load(vix_file)
    vix = prepare_vix(vix)

    # Merge SPY + VIX (normalize dates to date-only for join)
    spy['DateOnly'] = spy['Date'].dt.normalize()
    vix['DateOnly'] = vix['Date'].dt.normalize()
    merged = spy.merge(vix[['DateOnly', 'Close', 'vix_sma20', 'vix_change']],
                       on='DateOnly', how='left', suffixes=('', '_vix'))
    merged.drop(columns=['DateOnly'], inplace=True)

    # Consecutive days
    consec_dn = count_consecutive(merged['Close'], 'down')
    consec_up = count_consecutive(merged['Close'], 'up')

    # Run simulation
    daily_rows, trade_history = simulate_positions(merged, consec_dn, consec_up)

    # Get last 60 days for the scanner display + full history for context
    last_60 = daily_rows[-60:] if len(daily_rows) > 60 else daily_rows
    today = daily_rows[-1] if daily_rows else None

    # Summary stats for each config
    config_summaries = {}
    for cfg_key in ['vanilla', 'trail3d', 'forever']:
        trades = trade_history[cfg_key]
        if trades:
            wins = [t for t in trades if t['pnl'] > 0]
            total_pnl = sum(t['pnl'] for t in trades)
            config_summaries[cfg_key] = {
                'totalTrades': len(trades),
                'winRate': round(100 * len(wins) / len(trades), 1),
                'totalPnl': round(total_pnl, 2),
                'lastTrade': trades[-1] if trades else None,
            }
        else:
            config_summaries[cfg_key] = {'totalTrades': 0, 'winRate': 0, 'totalPnl': 0, 'lastTrade': None}

    output = {
        'today': today,
        'history': last_60,
        'configSummaries': config_summaries,
        'lastUpdated': daily_rows[-1]['date'] if daily_rows else None,
    }

    OUT.write_text(json.dumps(output, indent=2, default=lambda o: bool(o) if isinstance(o, (np.bool_,)) else int(o) if isinstance(o, (np.integer,)) else float(o) if isinstance(o, (np.floating,)) else None))
    print(f"\nScanner data saved to {OUT}")
    print(f"Last date: {output['lastUpdated']}")
    print(f"Today's score: {today['score'] if today else 'N/A'}")
    print(f"Entry signal: {today['entrySignal'] if today else 'N/A'}")
    print(f"\nConfig status:")
    for cfg_key in ['vanilla', 'trail3d', 'forever']:
        status = today['configs'][cfg_key] if today else {}
        print(f"  {cfg_key}: {status.get('status', 'N/A')} | Total P&L: ${config_summaries[cfg_key]['totalPnl']:,.0f}")


if __name__ == '__main__':
    main()
