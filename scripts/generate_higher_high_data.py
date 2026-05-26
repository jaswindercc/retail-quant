#!/usr/bin/env python3
"""Generate Higher High Break backtest JSON for the React dashboard.
Strategy: After a series of lower highs (downtrend), buy the first swing higher high breakout.
This catches trend reversals — the first sign that sellers have lost control.

Logic:
1. Track swing highs (local maxima over 10-bar window).
2. Need at least 3 consecutive lower swing highs (confirmed downtrend).
3. When a new swing high breaks above the previous swing high = first higher high.
4. Enter on close above that higher high level.

Stop: 1× ATR. Exit: EMA20 trailing stop at 2.5R.
Long only. Excludes bonds/rates."""
import pandas as pd, numpy as np, json
from pathlib import Path

DATA_DIR = Path("/workspaces/jas/data")
OUT = Path(__file__).resolve().parent.parent / "data" / "higher_high_data.json"
RISK = 100.0
EXCLUDE = ['TLT', 'IEF', 'BND', 'USTTENT', 'VIX']

def load(fp):
    df = pd.read_csv(fp)
    df['Date'] = pd.to_datetime(df['Date'])
    df = df.sort_values('Date').reset_index(drop=True)
    for c in ['Open','High','Low','Close','Volume']:
        df[c] = pd.to_numeric(df[c], errors='coerce')
    return df.dropna(subset=['Open','High','Low','Close'])

def find_swing_highs(df, window=10):
    """Find swing highs: bars where High is the max in a window of 'window' bars on each side."""
    highs = []
    for i in range(window, len(df) - window):
        local_max = df['High'].iloc[i-window:i+window+1].max()
        if df['High'].iloc[i] == local_max:
            highs.append((i, df['High'].iloc[i]))
    # Remove duplicates within close proximity
    filtered = []
    for h in highs:
        if not filtered or h[0] - filtered[-1][0] >= window:
            filtered.append(h)
    return filtered

def add_indicators(df):
    df = df.copy()
    df['sma50'] = df['Close'].rolling(50).mean()
    df['sma200'] = df['Close'].rolling(200).mean()
    tr = np.maximum(df['High'] - df['Low'],
        np.maximum(abs(df['High'] - df['Close'].shift(1)), abs(df['Low'] - df['Close'].shift(1))))
    df['atr'] = tr.rolling(14).mean()
    df['ema_trail'] = df['Close'].ewm(span=20, adjust=False).mean()
    df['ema20'] = df['Close'].ewm(span=20, adjust=False).mean()
    df['fSma'] = df['ema20']
    df['sSma'] = df['sma50']
    return df

def backtest(df, name):
    SL_ATR = 1.0
    TRAIL_ATR_BUF = 2.0
    TRAIL_START_R = 3.0
    MIN_LOWER_HIGHS = 3  # need at least 3 consecutive lower highs

    df = add_indicators(df)
    swing_highs = find_swing_highs(df, window=10)

    # Step 1: Identify all valid entry signals (bar index + entry level)
    signals = []  # list of (earliest_bar, entry_level)
    last_signal_idx = -50

    for sh_idx in range(MIN_LOWER_HIGHS, len(swing_highs)):
        recent = swing_highs[sh_idx - MIN_LOWER_HIGHS:sh_idx]
        all_lower = all(recent[j][1] > recent[j+1][1] for j in range(len(recent)-1))
        if not all_lower:
            continue

        prev_sh = swing_highs[sh_idx - 1]
        curr_sh = swing_highs[sh_idx]
        if curr_sh[1] <= prev_sh[1]:
            continue

        entry_level = prev_sh[1]
        # Earliest bar we can enter: after curr_sh is CONFIRMED (need 'window' bars after it)
        earliest_bar = curr_sh[0] + 10  # swing high confirmed after 10 bars
        # Latest bar for this signal: give 20-bar entry window
        latest_bar = earliest_bar + 20

        if earliest_bar - last_signal_idx < 20:
            continue

        signals.append((earliest_bar, latest_bar, entry_level))
        last_signal_idx = earliest_bar

    # Step 2: Bar-by-bar loop managing entries and exits (no gaps)
    trades = []
    pos = 0
    ep = er = tsl = 0.0
    trail_active = False
    initial_sl = 0.0
    signal_idx = 0  # which signal we're looking at

    for i in range(50, len(df)):  # start after indicators warm up
        r = df.iloc[i]
        atr = r['atr']
        if pd.isna(atr) or atr <= 0:
            continue

        # Manage existing position FIRST (every bar)
        if pos == 1:
            hit_sl = False
            xp = 0.0
            reason = ''

            # Check stop against level set from PREVIOUS bars (EOD manual workflow)
            if r['Low'] <= tsl:
                xp = min(r['Open'], tsl)  # gap-adjusted fill
                hit_sl = True
                reason = 'Trail' if trail_active else 'SL'

            # If alive, update trail for NEXT bar using today's close
            if not hit_sl:
                curr_r = (r['Close'] - ep) / er if er > 0 else 0
                if curr_r >= TRAIL_START_R:
                    trail_active = True
                if trail_active:
                    ema_trail = r['ema_trail'] - TRAIL_ATR_BUF * atr
                    if ema_trail > tsl:
                        tsl = ema_trail

            if hit_sl:
                t = trades[-1]
                t['exitDate'] = r['Date'].strftime('%Y-%m-%d')
                t['exitPrice'] = round(xp, 2)
                pnl_r = (xp - ep) / er if er > 0 else 0
                t['pnlR'] = round(pnl_r, 2)
                t['pnlDollar'] = round(pnl_r * RISK, 2)
                t['exitReason'] = reason
                ed = pd.to_datetime(t['entryDate'])
                t['durationDays'] = int((r['Date'] - ed).days)
                pos = 0
                trail_active = False
            continue  # if in position, don't look for new entries

        # Check for entry (not in position)
        if signal_idx >= len(signals):
            continue

        earliest_bar, latest_bar, entry_level = signals[signal_idx]

        # Not yet in signal window
        if i < earliest_bar:
            continue

        # Past this signal's window — move to next signal
        if i > latest_bar:
            signal_idx += 1
            if signal_idx >= len(signals):
                continue
            earliest_bar, latest_bar, entry_level = signals[signal_idx]
            if i < earliest_bar or i > latest_bar:
                continue

        # Entry condition: close above entry level
        if r['Close'] > entry_level:
            # Not a crazy gap bar
            if (r['High'] - r['Low']) > 3.0 * atr:
                continue

            sl = r['Close'] - SL_ATR * atr
            rk = r['Close'] - sl
            if rk <= 0:
                continue
            qty = max(1, round(RISK / rk))
            pos = 1
            ep = r['Close']
            er = rk
            tsl = sl
            initial_sl = sl
            trail_active = False
            signal_idx += 1  # consume this signal
            trades.append({
                'stock': name, 'dir': 'LONG',
                'entryDate': r['Date'].strftime('%Y-%m-%d'),
                'entryPrice': round(r['Close'], 2),
                'sl': round(sl, 2), 'risk': round(rk, 2), 'qty': qty,
                'exitDate': '', 'exitPrice': 0, 'pnlR': 0, 'pnlDollar': 0,
                'exitReason': '', 'durationDays': 0
            })

    # Mark any still-open trade
    if pos == 1 and trades:
        t = trades[-1]
        l = df.iloc[-1]
        t['exitDate'] = l['Date'].strftime('%Y-%m-%d')
        t['exitPrice'] = round(l['Close'], 2)
        pnl_r = (l['Close'] - ep) / er if er > 0 else 0
        t['pnlR'] = round(pnl_r, 2)
        t['pnlDollar'] = round(pnl_r * RISK, 2)
        t['exitReason'] = 'Open'
        ed = pd.to_datetime(t['entryDate'])
        t['durationDays'] = int((l['Date'] - ed).days)

    # Price series
    prices = []
    for _, row in df.iterrows():
        if pd.notna(row.get('fSma')) and pd.notna(row.get('sSma')):
            prices.append({
                'date': row['Date'].strftime('%Y-%m-%d'),
                'close': round(row['Close'], 2),
                'fSma': round(row['fSma'], 2),
                'sSma': round(row['sSma'], 2)
            })
    return trades, prices


all_data = {'stocks': {}, 'allTrades': [], 'settings': {
    'swingWindow': '10 bars', 'minLowerHighs': 3,
    'entry': 'Close above previous swing high after 3+ lower highs',
    'slAtrMult': 1.0,
    'trailEmaLen': 20, 'trailAtrBuf': 2.0, 'trailStartR': 3.0,
    'riskPerTrade': 100,
    'strategy': 'Higher High Break'
}}

for f in sorted(DATA_DIR.glob("*.csv")):
    name = f.stem.replace("_daily_data - Sheet1","").replace("_daily_data_right - Sheet1","").replace("_data","").upper()
    if name in EXCLUDE:
        continue
    trades, prices = backtest(load(f), name)
    all_data['stocks'][name] = {'trades': trades, 'prices': prices}
    all_data['allTrades'].extend(trades)
    print(f"{name}: {len(trades)} trades, PnL=${sum(t['pnlDollar'] for t in trades):,.0f}")

all_data['allTrades'].sort(key=lambda t: t['entryDate'])
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(all_data))
print(f"\nWritten {OUT} ({OUT.stat().st_size//1024}KB)")
print(f"Total trades: {len(all_data['allTrades'])}")
