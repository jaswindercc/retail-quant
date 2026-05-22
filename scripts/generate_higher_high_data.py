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
    TRAIL_ATR_BUF = 1.0
    TRAIL_START_R = 2.5
    MIN_LOWER_HIGHS = 3  # need at least 3 consecutive lower highs

    df = add_indicators(df)
    swing_highs = find_swing_highs(df, window=10)

    trades = []
    pos = 0
    ep = er = tsl = 0.0
    cooldown = 0
    last_signal_idx = -50  # prevent multiple signals near same point

    for sh_idx in range(MIN_LOWER_HIGHS, len(swing_highs)):
        # Check if previous MIN_LOWER_HIGHS swing highs were all lower
        recent = swing_highs[sh_idx - MIN_LOWER_HIGHS:sh_idx]
        all_lower = all(recent[j][1] > recent[j+1][1] for j in range(len(recent)-1))

        if not all_lower:
            continue

        # Current swing high is HIGHER than the previous one = first HH
        prev_sh = swing_highs[sh_idx - 1]
        curr_sh = swing_highs[sh_idx]

        if curr_sh[1] <= prev_sh[1]:
            continue  # not a higher high

        # Find the bar where price first closed above the previous swing high level
        # (this is our entry signal)
        entry_level = prev_sh[1]
        signal_bar_idx = curr_sh[0]  # the swing high bar itself

        if signal_bar_idx - last_signal_idx < 20:
            continue  # too close to last signal

        # Look for entry: first close above entry_level after the last lower high
        entry_found = False
        for i in range(prev_sh[0] + 5, min(curr_sh[0] + 5, len(df))):
            r = df.iloc[i]
            atr = r['atr']

            if pd.isna(atr) or atr <= 0:
                continue

            if pos == 1:
                # Manage existing trade
                hit_sl = False
                xp = 0.0
                reason = ''

                if r['Low'] <= tsl:
                    xp = tsl; hit_sl = True; reason = 'SL'

                if not hit_sl:
                    curr_r = (r['Close'] - ep) / er if er > 0 else 0
                    if curr_r >= TRAIL_START_R:
                        ema_trail = r['ema_trail'] - TRAIL_ATR_BUF * atr
                        if ema_trail > tsl:
                            tsl = ema_trail
                    if r['Low'] <= tsl:
                        xp = tsl; hit_sl = True; reason = 'Trail'

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
                continue

            if cooldown > 0:
                cooldown -= 1
                continue

            # Entry condition: close above previous swing high
            if r['Close'] > entry_level and not entry_found:
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
                entry_found = True
                last_signal_idx = i
                trades.append({
                    'stock': name, 'dir': 'LONG',
                    'entryDate': r['Date'].strftime('%Y-%m-%d'),
                    'entryPrice': round(r['Close'], 2),
                    'sl': round(sl, 2), 'risk': round(rk, 2), 'qty': qty,
                    'exitDate': '', 'exitPrice': 0, 'pnlR': 0, 'pnlDollar': 0,
                    'exitReason': '', 'durationDays': 0
                })
                break

    # Now run remaining bars to close any open trade
    if pos == 1 and trades:
        start_idx = df.index[df['Date'] == pd.to_datetime(trades[-1]['entryDate'])].tolist()
        if start_idx:
            for i in range(start_idx[0] + 1, len(df)):
                r = df.iloc[i]
                atr = r['atr']
                if pd.isna(atr) or atr <= 0:
                    continue

                hit_sl = False
                xp = 0.0
                reason = ''

                if r['Low'] <= tsl:
                    xp = tsl; hit_sl = True; reason = 'SL'

                if not hit_sl:
                    curr_r = (r['Close'] - ep) / er if er > 0 else 0
                    if curr_r >= TRAIL_START_R:
                        ema_trail = r['ema_trail'] - TRAIL_ATR_BUF * atr
                        if ema_trail > tsl:
                            tsl = ema_trail
                    if r['Low'] <= tsl:
                        xp = tsl; hit_sl = True; reason = 'Trail'

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
                    break

        # Still open
        if pos == 1:
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
    'trailEmaLen': 20, 'trailAtrBuf': 1.0, 'trailStartR': 2.5,
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
