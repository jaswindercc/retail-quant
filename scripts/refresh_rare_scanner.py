#!/usr/bin/env python3
"""Scan current stock data for rare pattern signals.
Checks: 52-week high break, bottom picker setup, higher high break.
Outputs JSON for the dashboard scanner page."""
import pandas as pd, numpy as np, json
from pathlib import Path
from datetime import datetime

DATA_DIR = Path("/workspaces/jas/data")
OUT = Path("/workspaces/jas/dashboard/public/rare_scanner_data.json")
EXCLUDE = ['TLT', 'IEF', 'BND', 'USTTENT', 'VIX']

def load(fp):
    df = pd.read_csv(fp)
    df['Date'] = pd.to_datetime(df['Date'])
    df = df.sort_values('Date').reset_index(drop=True)
    for c in ['Open','High','Low','Close','Volume']:
        df[c] = pd.to_numeric(df[c], errors='coerce')
    return df.dropna(subset=['Open','High','Low','Close'])

def find_swing_highs(df, window=10):
    highs = []
    for i in range(window, len(df) - window):
        local_max = df['High'].iloc[i-window:i+window+1].max()
        if df['High'].iloc[i] == local_max:
            highs.append((i, df['High'].iloc[i]))
    filtered = []
    for h in highs:
        if not filtered or h[0] - filtered[-1][0] >= window:
            filtered.append(h)
    return filtered

def scan_stock(df, name):
    signals = []
    
    # Add indicators
    df = df.copy()
    df['sma50'] = df['Close'].rolling(50).mean()
    df['high_252'] = df['High'].rolling(252).max().shift(1)
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
    
    # Look at last 5 bars for signals
    lookback = 5
    n = len(df)
    
    for i in range(max(0, n - lookback), n):
        r = df.iloc[i]
        date_str = r['Date'].strftime('%Y-%m-%d')
        atr = r['atr']
        
        if pd.isna(atr) or atr <= 0:
            continue
        
        # ─── 52-WEEK HIGH BREAK ───
        if pd.notna(r['high_252']) and pd.notna(r['sma50']):
            if r['Close'] > r['high_252'] and r['Close'] > r['sma50']:
                bar_range = r['High'] - r['Low']
                if bar_range <= 3.0 * atr:
                    sl = r['Close'] - atr
                    risk = r['Close'] - sl
                    signals.append({
                        'stock': name,
                        'pattern': '52-Week High Break',
                        'date': date_str,
                        'price': round(r['Close'], 2),
                        'trigger': f"Close ${r['Close']:.2f} > 252d high ${r['high_252']:.2f}",
                        'sl': round(sl, 2),
                        'risk': round(risk, 2),
                        'strength': 'Strong' if r['Close'] > r['sma50'] * 1.05 else 'Normal',
                        'notes': f"SMA50=${r['sma50']:.2f}, ATR=${atr:.2f}"
                    })
        
        # ─── BOTTOM PICKER ───
        if pd.notna(r['drawdown_pct']) and pd.notna(r['rsi']):
            dd = r['drawdown_pct']
            if dd <= -20 and r['rsi'] <= 35:
                if r['Close'] > r['Open']:  # green bar
                    if i > 0 and df.iloc[i-1]['Close'] <= df.iloc[i-1]['Open']:  # prev was red
                        sl = r['Low'] - 0.5 * atr
                        alt_sl = r['Close'] - 1.5 * atr
                        sl = max(sl, alt_sl)
                        risk = r['Close'] - sl
                        signals.append({
                            'stock': name,
                            'pattern': 'Bottom Picker',
                            'date': date_str,
                            'price': round(r['Close'], 2),
                            'trigger': f"DD={dd:.0f}%, RSI={r['rsi']:.0f}, First green bar",
                            'sl': round(sl, 2),
                            'risk': round(risk, 2),
                            'strength': 'Strong' if dd <= -30 else 'Normal',
                            'notes': f"60d high=${r['high_60']:.2f}, Crash={dd:.1f}%"
                        })
            # Also flag "approaching setup" (within 1-2 bars of signal)
            elif dd <= -18 and r['rsi'] <= 40:
                signals.append({
                    'stock': name,
                    'pattern': 'Bottom Picker (Approaching)',
                    'date': date_str,
                    'price': round(r['Close'], 2),
                    'trigger': f"DD={dd:.0f}%, RSI={r['rsi']:.0f} — waiting for green bar",
                    'sl': 0,
                    'risk': 0,
                    'strength': 'Watch',
                    'notes': f"Need: DD<-20%, RSI<35, first green bar after red"
                })
    
    # ─── HIGHER HIGH BREAK ───
    # Check if there's a recent swing high that's the first higher high after 3+ lower highs
    swing_highs = find_swing_highs(df, window=10)
    if len(swing_highs) >= 4:
        # Check last few swing highs
        for sh_idx in range(3, len(swing_highs)):
            recent = swing_highs[sh_idx - 3:sh_idx]
            all_lower = all(recent[j][1] > recent[j+1][1] for j in range(len(recent)-1))
            
            if not all_lower:
                continue
            
            curr_sh = swing_highs[sh_idx]
            prev_sh = swing_highs[sh_idx - 1]
            
            if curr_sh[1] > prev_sh[1]:
                # This is a higher high - check if it's recent (within last 20 bars)
                if curr_sh[0] >= n - 20:
                    bar = df.iloc[curr_sh[0]]
                    atr_val = bar['atr'] if pd.notna(bar['atr']) else 0
                    entry_level = prev_sh[1]
                    sl = bar['Close'] - atr_val if atr_val > 0 else bar['Low']
                    signals.append({
                        'stock': name,
                        'pattern': 'Higher High Break',
                        'date': bar['Date'].strftime('%Y-%m-%d'),
                        'price': round(bar['Close'], 2),
                        'trigger': f"First HH ${curr_sh[1]:.2f} > prev SH ${prev_sh[1]:.2f} after 3 lower highs",
                        'sl': round(sl, 2),
                        'risk': round(bar['Close'] - sl, 2) if atr_val > 0 else 0,
                        'strength': 'Strong' if curr_sh[1] > prev_sh[1] * 1.03 else 'Normal',
                        'notes': f"Lower highs: {', '.join(f'${h[1]:.0f}' for h in recent)}"
                    })
    
    return signals


# ── Run scanner ──
all_signals = []
scan_date = ''

for f in sorted(DATA_DIR.glob("*.csv")):
    name = f.stem.replace("_daily_data - Sheet1","").replace("_daily_data_right - Sheet1","").replace("_data","").upper()
    if name in EXCLUDE:
        continue
    df = load(f)
    if len(df) == 0:
        continue
    scan_date = df.iloc[-1]['Date'].strftime('%Y-%m-%d')
    signals = scan_stock(df, name)
    all_signals.extend(signals)

# Sort by date descending
all_signals.sort(key=lambda s: s['date'], reverse=True)

output = {
    'scanDate': scan_date,
    'signals': all_signals,
    'summary': {
        'total': len(all_signals),
        'byPattern': {},
        'byStock': {}
    }
}

for s in all_signals:
    p = s['pattern']
    output['summary']['byPattern'][p] = output['summary']['byPattern'].get(p, 0) + 1
    st = s['stock']
    output['summary']['byStock'][st] = output['summary']['byStock'].get(st, 0) + 1

OUT.write_text(json.dumps(output, indent=2))
print(f"Scan date: {scan_date}")
print(f"Total signals: {len(all_signals)}")
print(f"\nBy pattern:")
for p, c in sorted(output['summary']['byPattern'].items(), key=lambda x: -x[1]):
    print(f"  {p}: {c}")
print(f"\nBy stock:")
for st, c in sorted(output['summary']['byStock'].items(), key=lambda x: -x[1]):
    print(f"  {st}: {c}")
print(f"\nWritten {OUT}")
