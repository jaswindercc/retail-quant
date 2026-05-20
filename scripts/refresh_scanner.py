#!/usr/bin/env python3
"""
REFRESH SCANNER — Fetch Google Sheets + Generate Scanner Data
==============================================================
Fetches live data from Google Sheets (SPX, VIX, SPY, QQQ),
merges with historical CSVs, runs overnight scanner on all 3 instruments,
outputs scanner_data.json for the dashboard.

Run manually or via GitHub Actions cron (Mon-Fri 3:20 PM ET).
"""

import pandas as pd, numpy as np, json, sys
from pathlib import Path
from datetime import datetime, timezone
from io import StringIO

try:
    import requests
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'requests', '-q'])
    import requests

# ══════════════════════════════════════════════════════════════
# GOOGLE SHEETS CONFIG
# Format: edit URL → auto-converted to CSV export URL
# ══════════════════════════════════════════════════════════════
SHEETS = {
    'SPX': {
        'url': 'https://docs.google.com/spreadsheets/d/12aqb5iM7Yazwwj0sxUExs5YWqkbfk0YSpTXnENGVUPc/export?format=csv',
        'csv': 'SPX_daily_data_right - Sheet1.csv',
    },
    'VIX': {
        'url': 'https://docs.google.com/spreadsheets/d/1h6Q8MujuihbVMg0u5AjbJ4gD89IHlxCl0jKtP4DQZpM/export?format=csv',
        'csv': 'VIX_daily_data_right - Sheet1.csv',
    },
    'SPY': {
        'url': 'https://docs.google.com/spreadsheets/d/1N2bl9AQi3kBu9PqcFtrE943m9KfhqWqveF7op3o33VA/export?format=csv',
        'csv': 'spy_data.csv',
    },
    'QQQ': {
        'url': 'https://docs.google.com/spreadsheets/d/117U3w3KnfDrsRWklaa560hP6QrTfh90DE-bvzE5mYyg/export?format=csv',
        'csv': 'qqq_daily_data_right - Sheet1.csv',
    },
}

# Instruments to scan (each uses VIX for signals)
INSTRUMENTS = {
    'SPX': {'price_csv': 'SPX_daily_data_right - Sheet1.csv', 'label': 'S&P 500 (SPX)'},
    'SPY': {'price_csv': 'spy_data.csv', 'label': 'SPY ETF'},
    'QQQ': {'price_csv': 'qqq_daily_data_right - Sheet1.csv', 'label': 'QQQ ETF'},
}

DATA_DIR = Path(__file__).parent.parent / "data"
OUT = Path(__file__).parent.parent / "dashboard" / "public" / "scanner_data.json"
RISK = 100.0

# Strategy params
RISK_ATR_MULT = 0.5
MIN_SCORE_LONG = 3
SPY_SMA50_LEN = 50
SPY_SMA200_LEN = 200
VIX_SMA_LEN = 20
VOL_SMA_LEN = 20
TRAIL_ACTIVATION_R = 1.5
TRAIL_DIST_ATR = 1.5


# ══════════════════════════════════════════════════════════════
# DATA FETCHING
# ══════════════════════════════════════════════════════════════

def fetch_google_sheet(url, name):
    """Download CSV from published Google Sheet."""
    print(f"  Fetching {name}...")
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    text = resp.text
    # Skip empty lines at top sometimes from Google
    lines = [l for l in text.strip().split('\n') if l.strip()]
    df = pd.read_csv(StringIO('\n'.join(lines)))
    print(f"  → {len(df)} rows for {name}")
    return df


def normalize_sheet_data(df):
    """Normalize Google Finance output to standard OHLCV format."""
    df = df.copy()
    col_map = {}
    for col in df.columns:
        cl = col.strip().lower()
        if cl == 'date': col_map[col] = 'Date'
        elif cl == 'open': col_map[col] = 'Open'
        elif cl == 'high': col_map[col] = 'High'
        elif cl == 'low': col_map[col] = 'Low'
        elif cl == 'close': col_map[col] = 'Close'
        elif cl == 'volume': col_map[col] = 'Volume'
    df = df.rename(columns=col_map)

    # Keep only known columns
    keep_cols = [c for c in ['Date', 'Open', 'High', 'Low', 'Close', 'Volume'] if c in df.columns]
    df = df[keep_cols]

    for c in ['Date', 'Open', 'High', 'Low', 'Close']:
        if c not in df.columns:
            raise ValueError(f"Missing column '{c}'. Got: {list(df.columns)}")

    if 'Volume' not in df.columns:
        df['Volume'] = 0

    df['Date'] = pd.to_datetime(df['Date'], format='mixed')
    df = df.sort_values('Date').reset_index(drop=True)
    for c in ['Open', 'High', 'Low', 'Close', 'Volume']:
        df[c] = pd.to_numeric(df[c], errors='coerce')
    return df.dropna(subset=['Open', 'High', 'Low', 'Close'])


def merge_with_existing(new_df, existing_path):
    """Merge new data with existing CSV, appending only new dates."""
    new_df = new_df.copy()
    # Only keep OHLCV columns
    new_df = new_df[['Date', 'Open', 'High', 'Low', 'Close', 'Volume']]
    new_df['DateOnly'] = new_df['Date'].dt.normalize()

    if existing_path.exists():
        existing = pd.read_csv(existing_path)
        # Keep only known columns
        existing = existing[[c for c in existing.columns if c in ['Date', 'Open', 'High', 'Low', 'Close', 'Volume']]]
        existing['Date'] = pd.to_datetime(existing['Date'], format='mixed')
        existing['DateOnly'] = existing['Date'].dt.normalize()

        existing_dates = set(existing['DateOnly'].dt.strftime('%Y-%m-%d'))
        new_rows = new_df[~new_df['DateOnly'].dt.strftime('%Y-%m-%d').isin(existing_dates)]

        if len(new_rows) > 0:
            print(f"  → Adding {len(new_rows)} new rows to {existing_path.name}")
            new_rows = new_rows.drop(columns=['DateOnly'])
            new_rows['Date'] = new_rows['Date'].dt.strftime('%-m/%-d/%Y 16:00:00')
            existing = existing.drop(columns=['DateOnly'])
            existing['Date'] = existing['Date'].dt.strftime('%-m/%-d/%Y 16:00:00')
            combined = pd.concat([existing, new_rows], ignore_index=True)
        else:
            print(f"  → No new rows for {existing_path.name}")
            combined = existing.drop(columns=['DateOnly'])
            combined['Date'] = combined['Date'].dt.strftime('%-m/%-d/%Y 16:00:00')
    else:
        print(f"  → Creating {existing_path.name}")
        combined = new_df.drop(columns=['DateOnly'])
        combined['Date'] = combined['Date'].dt.strftime('%-m/%-d/%Y 16:00:00')

    return combined


# ══════════════════════════════════════════════════════════════
# INDICATORS
# ══════════════════════════════════════════════════════════════

def load(fp):
    df = pd.read_csv(fp)
    df['Date'] = pd.to_datetime(df['Date'], format='mixed')
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


def prepare_price(df):
    df = df.copy()
    df['sma50'] = df['Close'].rolling(SPY_SMA50_LEN).mean()
    df['sma200'] = df['Close'].rolling(SPY_SMA200_LEN).mean()
    tr = np.maximum(df['High'] - df['Low'],
        np.maximum(abs(df['High'] - df['Close'].shift(1)),
                   abs(df['Low'] - df['Close'].shift(1))))
    df['atr'] = tr.rolling(14).mean()
    df['rsi5'] = compute_rsi(df['Close'], 5)
    df['rsi14'] = compute_rsi(df['Close'], 14)
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
            counts.iloc[i] = counts.iloc[i-1] + 1 if series.iloc[i] < series.iloc[i-1] else 0
        else:
            counts.iloc[i] = counts.iloc[i-1] + 1 if series.iloc[i] > series.iloc[i-1] else 0
    return counts


# ══════════════════════════════════════════════════════════════
# SIGNAL SCORING
# ══════════════════════════════════════════════════════════════

def compute_signals(price_row, vix_row, consec_dn, consec_up):
    signals = []
    score = 0

    # Strong bullish (+2)
    if not pd.isna(vix_row['vix_change']) and vix_row['vix_change'] > 0.12:
        score += 2; signals.append({'name': 'VIX Panic', 'points': 2, 'type': 'bull'})
    if not pd.isna(price_row['rsi5']) and price_row['rsi5'] < 20:
        score += 2; signals.append({'name': 'RSI(5) < 20', 'points': 2, 'type': 'bull'})
    if (not pd.isna(price_row['daily_ret']) and price_row['daily_ret'] < -0.02
            and not pd.isna(price_row['sma200']) and price_row['Close'] > price_row['sma200']):
        score += 2; signals.append({'name': 'Crash Dip', 'points': 2, 'type': 'bull'})

    # Standard bullish (+1)
    if not pd.isna(vix_row['vix_sma20']) and vix_row['Close'] > vix_row['vix_sma20']:
        score += 1; signals.append({'name': 'VIX > SMA20', 'points': 1, 'type': 'bull'})
    if not pd.isna(price_row['rsi5']) and 20 <= price_row['rsi5'] < 35:
        score += 1; signals.append({'name': 'RSI(5) < 35', 'points': 1, 'type': 'bull'})
    if consec_dn >= 3:
        score += 1; signals.append({'name': f'{consec_dn} Down Days', 'points': 1, 'type': 'bull'})
    if price_row['range_pos'] < 0.20:
        score += 1; signals.append({'name': 'Close Near Low', 'points': 1, 'type': 'bull'})
    if (not pd.isna(price_row['daily_ret']) and -0.02 <= price_row['daily_ret'] < -0.01
            and not pd.isna(price_row['sma200']) and price_row['Close'] > price_row['sma200']):
        score += 1; signals.append({'name': 'Dip in Uptrend', 'points': 1, 'type': 'bull'})
    if vix_row['Close'] > 25:
        score += 1; signals.append({'name': 'VIX > 25', 'points': 1, 'type': 'bull'})
    if not pd.isna(price_row['sma200']) and price_row['Close'] > price_row['sma200']:
        score += 1; signals.append({'name': 'Above SMA200', 'points': 1, 'type': 'bull'})

    # Strong bearish (-2)
    if not pd.isna(price_row['rsi5']) and price_row['rsi5'] > 90:
        score -= 2; signals.append({'name': 'RSI(5) > 90', 'points': -2, 'type': 'bear'})
    if not pd.isna(price_row['daily_ret']) and price_row['daily_ret'] > 0.03:
        score -= 2; signals.append({'name': 'Huge Rally', 'points': -2, 'type': 'bear'})
    if not pd.isna(vix_row['vix_change']) and vix_row['vix_change'] < -0.20:
        score -= 2; signals.append({'name': 'VIX Crushed', 'points': -2, 'type': 'bear'})

    # Standard bearish (-1)
    if not pd.isna(vix_row['vix_sma20']) and vix_row['Close'] < vix_row['vix_sma20'] * 0.85:
        score -= 1; signals.append({'name': 'VIX Complacent', 'points': -1, 'type': 'bear'})
    if not pd.isna(price_row['rsi5']) and 75 <= price_row['rsi5'] < 90:
        score -= 1; signals.append({'name': 'RSI(5) > 75', 'points': -1, 'type': 'bear'})
    if consec_up >= 4 and not pd.isna(price_row['rsi14']) and price_row['rsi14'] > 65:
        score -= 1; signals.append({'name': 'Extended Up', 'points': -1, 'type': 'bear'})
    if not pd.isna(price_row['sma200']) and price_row['Close'] < price_row['sma200']:
        score -= 1; signals.append({'name': 'Below SMA200', 'points': -1, 'type': 'bear'})
    if not pd.isna(vix_row['vix_change']) and -0.20 <= vix_row['vix_change'] < -0.10:
        score -= 1; signals.append({'name': 'VIX Drop', 'points': -1, 'type': 'bear'})
    if not pd.isna(price_row['daily_ret']) and 0.015 < price_row['daily_ret'] <= 0.03:
        score -= 1; signals.append({'name': 'Big Up Day', 'points': -1, 'type': 'bear'})
    if (price_row['range_pos'] > 0.85
            and not pd.isna(price_row['vol_sma']) and price_row['vol_sma'] > 0
            and price_row['Volume'] > 1.5 * price_row['vol_sma']):
        score -= 1; signals.append({'name': 'Distribution', 'points': -1, 'type': 'bear'})

    return score, signals


# ══════════════════════════════════════════════════════════════
# POSITION SIMULATION
# ══════════════════════════════════════════════════════════════

def simulate_positions(merged, consec_dn, consec_up):
    """Walk through all days tracking positions for each config."""
    n = len(merged)
    configs = {
        'vanilla': {'max_days': 1, 'use_filter': False, 'trail': False},
        'trail3d': {'max_days': 3, 'use_filter': True, 'trail': True},
        'forever': {'max_days': 999, 'use_filter': True, 'trail': True},
    }

    positions = {k: None for k in configs}
    trade_history = {k: [] for k in configs}
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

        # Advance existing positions
        for cfg_key, cfg in configs.items():
            pos = positions[cfg_key]
            if pos is None:
                continue
            pos['days_held'] += 1
            day_close = close
            day_low = row['Low']

            if cfg['trail'] and pos['trail_active']:
                if day_close > pos['highest_close']:
                    pos['highest_close'] = day_close
                    pos['trail_stop'] = pos['highest_close'] - TRAIL_DIST_ATR * pos['entry_atr']
            elif cfg['trail'] and not pos['trail_active']:
                if day_close >= pos['activation_level']:
                    pos['trail_active'] = True
                    pos['highest_close'] = day_close
                    pos['trail_stop'] = pos['highest_close'] - TRAIL_DIST_ATR * pos['entry_atr']

            exited = False
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
                trade_history[cfg_key].append({
                    'entryDate': pos['entry_date'], 'exitDate': date_str,
                    'entryPrice': round(pos['entry_price'], 2),
                    'exitPrice': round(exit_price, 2),
                    'pnl': round(pnl, 2), 'pnlR': round(pnl / RISK, 2),
                    'daysHeld': pos['days_held'], 'exitReason': exit_reason,
                })
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
                positions[cfg_key] = {
                    'entry_date': date_str, 'entry_price': close,
                    'entry_atr': atr, 'qty': qty, 'days_held': 0,
                    'trail_active': False, 'highest_close': close, 'trail_stop': 0,
                    'activation_level': close + TRAIL_ACTIVATION_R * risk_dist,
                }
                entry_status[cfg_key] = 'entered'
            elif not entry_signal:
                entry_status[cfg_key] = 'no_signal'
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
            'aboveSma50': bool(above_sma50),
            'entrySignal': bool(entry_signal),
            'configs': {}
        }
        for cfg_key in configs:
            pos = positions[cfg_key]
            cfg_status = {
                'status': entry_status[cfg_key],
                'paused': bool(paused[cfg_key]) if configs[cfg_key]['use_filter'] else False,
            }
            if pos is not None:
                cfg_status['position'] = {
                    'entryDate': pos['entry_date'],
                    'entryPrice': round(pos['entry_price'], 2),
                    'daysHeld': pos['days_held'],
                    'trailActive': bool(pos['trail_active']),
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


# ══════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════

def run_scanner_for_instrument(instrument_key, price_csv, vix_df):
    """Run the full scanner for one instrument."""
    price_file = DATA_DIR / price_csv
    if not price_file.exists():
        print(f"  ⚠️ {price_file.name} not found, skipping {instrument_key}")
        return None

    price_df = load(price_file)
    price_df = prepare_price(price_df)

    # Merge with VIX
    price_df['DateOnly'] = price_df['Date'].dt.normalize()
    vix_df_copy = vix_df.copy()
    vix_df_copy['DateOnly'] = vix_df_copy['Date'].dt.normalize()
    merged = price_df.merge(vix_df_copy[['DateOnly', 'Close', 'vix_sma20', 'vix_change']],
                            on='DateOnly', how='left', suffixes=('', '_vix'))
    merged.drop(columns=['DateOnly'], inplace=True)

    consec_dn = count_consecutive(merged['Close'], 'down')
    consec_up = count_consecutive(merged['Close'], 'up')

    daily_rows, trade_history = simulate_positions(merged, consec_dn, consec_up)

    if not daily_rows:
        return None

    last_60 = daily_rows[-60:]
    today = daily_rows[-1]

    config_summaries = {}
    for cfg_key in ['vanilla', 'trail3d', 'forever']:
        trades = trade_history[cfg_key]
        if trades:
            wins = [t for t in trades if t['pnl'] > 0]
            config_summaries[cfg_key] = {
                'totalTrades': len(trades),
                'winRate': round(100 * len(wins) / len(trades), 1),
                'totalPnl': round(sum(t['pnl'] for t in trades), 2),
                'lastTrade': trades[-1],
            }
        else:
            config_summaries[cfg_key] = {'totalTrades': 0, 'winRate': 0, 'totalPnl': 0, 'lastTrade': None}

    return {
        'today': today,
        'history': last_60,
        'configSummaries': config_summaries,
    }


def main():
    now_utc = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    print("=" * 60)
    print(f"OVERNIGHT SCANNER — REFRESH @ {now_utc}")
    print("=" * 60)

    # Step 1: Fetch from Google Sheets
    print("\n[1/3] Fetching Google Sheets data...")
    fetch_success = True
    for key, cfg in SHEETS.items():
        url = cfg['url']
        csv_path = DATA_DIR / cfg['csv']
        try:
            new_df = fetch_google_sheet(url, key)
            new_df = normalize_sheet_data(new_df)
            combined = merge_with_existing(new_df, csv_path)
            combined.to_csv(csv_path, index=False)
        except Exception as e:
            print(f"  ⚠️ {key} fetch failed: {e}")
            fetch_success = False

    # Step 2: Load VIX for all instruments
    print("\n[2/3] Running scanner for all instruments...")
    vix_file = DATA_DIR / SHEETS['VIX']['csv']
    if not vix_file.exists():
        print(f"ERROR: {vix_file} not found")
        return

    vix_df = load(vix_file)
    vix_df = prepare_vix(vix_df)

    # Step 3: Run scanner for each instrument
    results = {}
    for inst_key, inst_cfg in INSTRUMENTS.items():
        print(f"\n  Scanning {inst_key}...")
        result = run_scanner_for_instrument(inst_key, inst_cfg['price_csv'], vix_df)
        if result:
            result['label'] = inst_cfg['label']
            results[inst_key] = result
            today = result['today']
            print(f"    Score: {today['score']} | Entry: {'YES' if today['entrySignal'] else 'NO'} | Last: {today['date']}")

    # Build final output
    print("\n[3/3] Saving scanner data...")
    output = {
        'instruments': results,
        'lastFetched': now_utc,
        'nextRefresh': '3:20 PM ET (Mon-Fri)',
        'fetchSuccess': fetch_success,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(output, indent=2))

    print(f"\n{'=' * 60}")
    print(f"✅ Saved to {OUT}")
    print(f"   Last fetched: {now_utc}")
    for inst_key, r in results.items():
        t = r['today']
        print(f"   {inst_key}: Score={t['score']} | {t['date']} | Forever: {t['configs']['forever']['status']}")
    print(f"{'=' * 60}")


if __name__ == '__main__':
    main()
