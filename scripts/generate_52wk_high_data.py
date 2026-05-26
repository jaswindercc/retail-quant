#!/usr/bin/env python3
"""Generate 52-Week High Breakout backtest JSON for the React dashboard.
Entry: Price closes above 252-day high + above SMA50 (uptrend filter).
Stop: 1× ATR below entry. Exit: EMA20 trailing stop activated at 2.5R.
Long only. Excludes bonds/rates (TLT, IEF, BND, USTTENT, VIX)."""
import pandas as pd, numpy as np, json
from pathlib import Path

DATA_DIR = Path("/workspaces/jas/data")
OUT = Path(__file__).resolve().parent.parent / "data" / "52wk_high_data.json"
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
    df['high_252'] = df['High'].rolling(252).max().shift(1)  # prev 252-bar high
    tr = np.maximum(df['High'] - df['Low'],
        np.maximum(abs(df['High'] - df['Close'].shift(1)), abs(df['Low'] - df['Close'].shift(1))))
    df['atr'] = tr.rolling(14).mean()
    df['ema_trail'] = df['Close'].ewm(span=20, adjust=False).mean()
    df['fSma'] = df['high_252']  # 52-wk high as fast line on chart
    df['sSma'] = df['sma50']
    return df

def backtest(df, name):
    SL_ATR = 1.0
    TRAIL_ATR_BUF = 1.0
    TRAIL_START_R = 2.5

    df = add_indicators(df)
    trades = []
    pos = 0
    ep = er = tsl = initial_sl = 0.0
    cooldown = 0  # prevent immediate re-entry

    for i in range(1, len(df)):
        r = df.iloc[i]
        atr = r['atr']

        if pd.isna(atr) or atr <= 0 or pd.isna(r['sma50']) or pd.isna(r['high_252']):
            continue

        # ── In a trade ──
        if pos == 1:
            hit_sl = False
            xp = 0.0
            reason = ''

            # Check stop against level set from PREVIOUS bars (EOD manual workflow)
            if r['Low'] <= tsl:
                xp = min(r['Open'], tsl)  # gap-adjusted fill
                hit_sl = True
                reason = 'Trail' if tsl > initial_sl else 'SL'

            # If alive, update trail for NEXT bar using today's close
            if not hit_sl:
                curr_r = (r['Close'] - ep) / er if er > 0 else 0
                if curr_r >= TRAIL_START_R:
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
                cooldown = 5  # wait 5 bars before next entry
            continue

        # ── Flat ──
        if cooldown > 0:
            cooldown -= 1
            continue

        # Must be above SMA50
        if r['Close'] <= r['sma50']:
            continue

        # Close above 52-week high = breakout
        if r['Close'] > r['high_252']:
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
        if pd.notna(row['high_252']) and pd.notna(row['sma50']):
            prices.append({
                'date': row['Date'].strftime('%Y-%m-%d'),
                'close': round(row['Close'], 2),
                'fSma': round(row['high_252'], 2),
                'sSma': round(row['sma50'], 2)
            })
    return trades, prices


all_data = {'stocks': {}, 'allTrades': [], 'settings': {
    'channel': '252-day High', 'trendMA': 'SMA 50',
    'slAtrMult': 1.0,
    'trailEmaLen': 20, 'trailAtrBuf': 1.0, 'trailStartR': 2.5,
    'riskPerTrade': 100,
    'strategy': '52-Week High Break'
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
