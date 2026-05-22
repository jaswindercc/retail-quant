#!/usr/bin/env python3
"""Generate Bottom Picker backtest JSON for the React dashboard.
Strategy: Buy when stock drops >20% from recent high, RSI<30, then first green bar appears.
This is a contrarian "catch the falling knife" with strict rules.
Entry: After 20%+ drawdown from 60-day high, RSI(14) < 35, first close > open (green bar).
Stop: Low of the signal bar (or 1.5× ATR, whichever is tighter). 
Exit: EMA20 trailing stop activated at 2.5R.
Long only. Excludes bonds/rates."""
import pandas as pd, numpy as np, json
from pathlib import Path

DATA_DIR = Path("/workspaces/jas/data")
OUT = Path(__file__).resolve().parent.parent / "data" / "bottom_picker_data.json"
RISK = 100.0
EXCLUDE = ['TLT', 'IEF', 'BND', 'USTTENT', 'VIX']

def load(fp):
    df = pd.read_csv(fp)
    df['Date'] = pd.to_datetime(df['Date'])
    df = df.sort_values('Date').reset_index(drop=True)
    for c in ['Open','High','Low','Close','Volume']:
        df[c] = pd.to_numeric(df[c], errors='coerce')
    return df.dropna(subset=['Open','High','Low','Close'])

def add_indicators(df):
    df = df.copy()
    df['sma50'] = df['Close'].rolling(50).mean()
    df['sma200'] = df['Close'].rolling(200).mean()
    df['high_60'] = df['High'].rolling(60).max()
    df['drawdown_pct'] = (df['Close'] - df['high_60']) / df['high_60'] * 100
    
    # RSI(14)
    delta = df['Close'].diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)
    avg_gain = gain.ewm(com=13, adjust=False).mean()
    avg_loss = loss.ewm(com=13, adjust=False).mean()
    rs = avg_gain / avg_loss
    df['rsi'] = 100 - (100 / (1 + rs))
    
    tr = np.maximum(df['High'] - df['Low'],
        np.maximum(abs(df['High'] - df['Close'].shift(1)), abs(df['Low'] - df['Close'].shift(1))))
    df['atr'] = tr.rolling(14).mean()
    df['ema_trail'] = df['Close'].ewm(span=20, adjust=False).mean()
    df['fSma'] = df['Close'].rolling(20).mean()  # EMA20 for chart
    df['sSma'] = df['sma50']
    return df

def backtest(df, name):
    SL_ATR = 1.5
    TRAIL_ATR_BUF = 1.0
    TRAIL_START_R = 2.5
    DRAWDOWN_THRESHOLD = -20.0  # must be 20% below 60-day high
    RSI_THRESHOLD = 35.0

    df = add_indicators(df)
    trades = []
    pos = 0
    ep = er = tsl = 0.0
    cooldown = 0

    for i in range(1, len(df)):
        r = df.iloc[i]
        prev = df.iloc[i-1]
        atr = r['atr']

        if pd.isna(atr) or atr <= 0 or pd.isna(r['rsi']) or pd.isna(r['high_60']):
            continue

        # ── In a trade ──
        if pos == 1:
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
                cooldown = 10  # wait 10 bars - don't knife-catch repeatedly
            continue

        # ── Flat ──
        if cooldown > 0:
            cooldown -= 1
            continue

        # Conditions for bottom pick:
        # 1. Stock is 20%+ below its 60-day high
        dd = r['drawdown_pct']
        if pd.isna(dd) or dd > DRAWDOWN_THRESHOLD:
            continue

        # 2. RSI < 35 (oversold)
        if r['rsi'] > RSI_THRESHOLD:
            continue

        # 3. First green bar (close > open) = reversal signal
        if r['Close'] <= r['Open']:
            continue

        # 4. Previous bar was red (confirming this is the FIRST green)
        if prev['Close'] > prev['Open']:
            continue

        # Entry
        sl = r['Low'] - 0.5 * atr  # stop below signal bar low
        alt_sl = r['Close'] - SL_ATR * atr
        sl = max(sl, alt_sl)  # use tighter of the two
        rk = r['Close'] - sl
        if rk <= 0:
            continue
        qty = max(1, round(RISK / rk))
        pos = 1
        ep = r['Close']
        er = rk
        tsl = sl
        trades.append({
            'stock': name, 'dir': 'LONG',
            'entryDate': r['Date'].strftime('%Y-%m-%d'),
            'entryPrice': round(r['Close'], 2),
            'sl': round(sl, 2), 'risk': round(rk, 2), 'qty': qty,
            'exitDate': '', 'exitPrice': 0, 'pnlR': 0, 'pnlDollar': 0,
            'exitReason': '', 'durationDays': 0
        })

    # Close open trade
    if pos != 0 and trades:
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
    'drawdownThreshold': '-20%', 'rsiThreshold': 35,
    'signalBar': 'First green bar after red',
    'slAtrMult': 1.5,
    'trailEmaLen': 20, 'trailAtrBuf': 1.0, 'trailStartR': 2.5,
    'riskPerTrade': 100,
    'strategy': 'Bottom Picker'
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
