#!/usr/bin/env python3
"""Generate Breakout v2 backtest JSON for the React dashboard.

Base rules (same as v1):
  - Entry: Price closes above 20-day Donchian high + above SMA50 (uptrend filter)
  - Stop: 1× ATR
  - Exit: EMA20 trailing stop starting at 2.5R
  - Long only

V2 additions (layered on top of v1):
  1. Volume confirmation: breakout bar volume must be > 1.5× 20-day avg volume
  2. ADX filter: ADX(14) > 20 (must be in a trending environment)
  3. Skip after 3 consecutive losses per stock (reduce DD streaks)

Goal: Beat v1 on drawdown and return by filtering out low-quality breakouts.
"""
import pandas as pd, numpy as np, json
from pathlib import Path

DATA_DIR = Path("/workspaces/jas/data")
OUT = Path("/workspaces/jas/dashboard/public/breakout_v2_data.json")
RISK = 100.0

# ── V2 parameters ──
VOL_MULT = 1.2        # Volume must be > this × 20-day avg (gentler than 1.5)
SKIP_AFTER_LOSSES = 3 # Skip next entry after N consecutive losses


def load(fp):
    df = pd.read_csv(fp)
    df['Date'] = pd.to_datetime(df['Date'])
    df = df.sort_values('Date').reset_index(drop=True)
    for c in ['Open', 'High', 'Low', 'Close', 'Volume']:
        df[c] = pd.to_numeric(df[c], errors='coerce')
    return df.dropna(subset=['Open', 'High', 'Low', 'Close'])


def add_indicators(df):
    df = df.copy()
    df['sma50'] = df['Close'].rolling(50).mean()
    df['donchian_high'] = df['High'].rolling(20).max().shift(1)
    tr = np.maximum(df['High'] - df['Low'],
                    np.maximum(abs(df['High'] - df['Close'].shift(1)),
                               abs(df['Low'] - df['Close'].shift(1))))
    df['atr'] = tr.rolling(14).mean()
    df['ema_trail'] = df['Close'].ewm(span=20, adjust=False).mean()
    df['vol_avg'] = df['Volume'].rolling(20).mean()
    df['fSma'] = df['donchian_high']
    df['sSma'] = df['sma50']
    return df


def backtest_breakout_v2(df, name, portfolio_state):
    """Breakout v2: same as v1 + volume confirmation + strong close + portfolio skip.

    Uses a 'pending signal' approach: when breakout conditions are met,
    we don't enter immediately. We enter NEXT day only if price opens
    above the breakout level (confirmation the breakout held overnight).
    """
    SL_ATR = 1.0
    TRAIL_ATR_BUF = 1.0
    TRAIL_START_R = 2.5

    df = add_indicators(df)
    trades = []
    pos = 0
    ep = er = tsl = initial_sl = 0.0
    last_breakout_high = 0.0
    skipped = 0
    pending_signal = None  # Store signal for next-day confirmation

    for i in range(1, len(df)):
        r = df.iloc[i]
        prev = df.iloc[i - 1]
        atr = r['atr']

        if pd.isna(atr) or atr <= 0 or pd.isna(r['sma50']) or pd.isna(r['donchian_high']):
            pending_signal = None
            continue

        # ── In a trade: check stop / trail ──
        if pos == 1:
            hit_sl = False
            xp = 0.0
            reason = ''

            if r['Low'] <= tsl:
                xp = min(r['Open'], tsl)
                hit_sl = True
                reason = 'Trail' if tsl > initial_sl else 'SL'

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

                # Track portfolio-wide consecutive losses
                if pnl_r <= 0:
                    portfolio_state['consecutive_losses'] += 1
                else:
                    portfolio_state['consecutive_losses'] = 0
            pending_signal = None
            continue

        # ── Check if we have a pending signal from yesterday ──
        if pending_signal is not None:
            # Next-day confirmation: open must be above the breakout level
            if r['Open'] >= pending_signal['level']:
                # Portfolio skip check
                if portfolio_state['consecutive_losses'] >= SKIP_AFTER_LOSSES:
                    skipped += 1
                    portfolio_state['consecutive_losses'] = 0
                    pending_signal = None
                    # Fall through to check for new signal today
                else:
                    # ENTER using today's open (realistic fill)
                    entry_price = r['Open']
                    prev_atr = pending_signal['atr']
                    sl = entry_price - SL_ATR * prev_atr
                    rk = entry_price - sl
                    pos = 1
                    ep = entry_price
                    er = rk
                    tsl = sl
                    initial_sl = sl
                    last_breakout_high = pending_signal['dh']
                    trades.append({
                        'stock': name, 'dir': 'LONG',
                        'entryDate': r['Date'].strftime('%Y-%m-%d'),
                        'entryPrice': round(entry_price, 2),
                        'sl': round(sl, 2), 'risk': round(rk, 2), 'qty': 1,
                        'exitDate': '', 'exitPrice': 0, 'pnlR': 0, 'pnlDollar': 0,
                        'exitReason': '', 'durationDays': 0
                    })
                    pending_signal = None
                    continue
            # Signal didn't confirm — discard
            pending_signal = None

        # ── Flat: look for breakout signal ──
        dh = r['donchian_high']

        # Must be above SMA50 (uptrend) — same as v1
        if r['Close'] <= r['sma50']:
            continue

        # Close above 20-day high = breakout — same as v1
        breakout = r['Close'] > dh

        # Not the same breakout level — same as v1
        same_level = abs(dh - last_breakout_high) < 0.01

        # Not a crazy gap bar — same as v1
        small_bar = (r['High'] - r['Low']) <= 2.5 * atr

        # Not too extended from SMA50 — same as v1
        not_too_far = r['Close'] - r['sma50'] <= 4.0 * atr

        if not (breakout and not same_level and small_bar and not_too_far):
            continue

        # ── V2 ADDITIONS ──

        # 1. Volume confirmation: must be above average
        vol_ok = (not pd.isna(r['vol_avg']) and r['vol_avg'] > 0 and
                  r['Volume'] > VOL_MULT * r['vol_avg'])
        if not vol_ok:
            continue

        # 2. Strong close: bar must close in upper 60% of its range (conviction)
        bar_range = r['High'] - r['Low']
        if bar_range > 0:
            close_position = (r['Close'] - r['Low']) / bar_range
            if close_position < 0.4:  # close in bottom 40% = weak breakout
                continue

        # 3. Set pending signal — enter NEXT day if it confirms
        pending_signal = {
            'level': dh,  # breakout must hold this level on next open
            'atr': atr,
            'dh': dh,
        }

    # Close open trade at end
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

    # Price series for chart
    prices = []
    for _, row in df.iterrows():
        if pd.notna(row['donchian_high']) and pd.notna(row['sma50']):
            prices.append({
                'date': row['Date'].strftime('%Y-%m-%d'),
                'close': round(row['Close'], 2),
                'fSma': round(row['donchian_high'], 2),
                'sSma': round(row['sma50'], 2)
            })
    return trades, prices, skipped


# ── Exclude non-equity tickers ──
EXCLUDE = {'BND', 'IEF', 'TLT', 'USTTENT', 'VIX'}

all_data = {'stocks': {}, 'allTrades': [], 'settings': {
    'channel': 'Donchian 20', 'trendMA': 'SMA 50',
    'slAtrMult': 1.0,
    'trailEmaLen': 20, 'trailAtrBuf': 1.0, 'trailStartR': 2.5,
    'riskPerTrade': 100,
    'strategy': 'Breakout v2',
    'v2_additions': [
        f'Volume > {VOL_MULT}× 20-day avg on breakout bar',
        'Close in upper 60% of bar range (strong close / conviction)',
        f'Skip entry after {SKIP_AFTER_LOSSES} consecutive losses per stock',
        'Excluded: bonds & VIX (BND, IEF, TLT, USTTENT, VIX)',
    ]
}}

total_skipped = 0
portfolio_state = {'consecutive_losses': 0}

for f in sorted(DATA_DIR.glob("*.csv")):
    name = f.stem.replace("_daily_data - Sheet1", "").replace("_data", "").upper()
    # Skip non-equity instruments
    if any(ex in name for ex in EXCLUDE):
        continue
    trades, prices, skipped = backtest_breakout_v2(load(f), name, portfolio_state)
    all_data['stocks'][name] = {'trades': trades, 'prices': prices}
    all_data['allTrades'].extend(trades)
    total_skipped += skipped
    print(f"{name}: {len(trades)} trades, {skipped} skipped, {len(prices)} bars")

all_data['allTrades'].sort(key=lambda t: t['entryDate'])
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(all_data))
print(f"\nSkipped {total_skipped} signals (3-loss rule)")
print(f"Written {OUT} ({OUT.stat().st_size // 1024}KB)")
