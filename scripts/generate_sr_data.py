#!/usr/bin/env python3
"""
SUPPORT/RESISTANCE BOUNCE Strategy — Backtest Generator
========================================================
Entry Logic:
  - Identify horizontal support levels from recent pivot lows (swing lows)
  - Pivot low = bar where Low is lowest in N bars on each side (lookback=5)
  - Support zone = cluster of pivot lows within 1× ATR of each other
  - Price must be above SMA(50) (trend filter)
  - Previous bar's low dipped into a support zone (within 0.5×ATR of a pivot low)
  - Current bar closes above the support level (bounce)
  - Must not be the SAME pivot low as entry reference (re-test required)
  - Bar not overextended (range ≤ 2×ATR)
  - Cooldown: 5 bars between entries

Exit Logic (same as all strategies):
  - Initial SL: 1× ATR below entry
  - Trail: EMA(20) − 1×ATR, activates at 2.5R
  - No fixed TP

Risk:
  - $100 per trade
"""
import pandas as pd, numpy as np, json
from pathlib import Path
from backtest_execution import (
    gap_stop_fill_long,
    calc_pnl_with_costs,
    apply_portfolio_constraints,
)

DATA_DIR = Path("/workspaces/jas/data")
OUT = Path("/workspaces/jas/dashboard/public/sr_data.json")
RISK = 100.0

# Execution-cost controls (configurable)
SLIPPAGE_BPS = 0.0
COMMISSION_PER_SHARE = 0.0
MIN_COMMISSION_PER_ORDER = 0.0

# Portfolio-level constraints (configurable)
PORTFOLIO_START_EQUITY = 100000.0
PORTFOLIO_MAX_POSITIONS = 5
PORTFOLIO_MAX_RISK_PCT = 0.02
PORTFOLIO_MAX_GROSS_EXPOSURE_PCT = 1.5

# Parameters
PIVOT_LOOKBACK = 5
SUPPORT_WINDOW = 60    # look back N bars for pivot lows to form support
TOUCH_ATR = 0.5        # how close price must get to support level
SL_ATR = 1.0
TRAIL_ATR_BUF = 1.0
TRAIL_START_R = 2.5
COOLDOWN = 5
MIN_BARS_FROM_PIVOT = 5  # must be at least this many bars after the pivot was formed


def load(fp):
    df = pd.read_csv(fp)
    df['Date'] = pd.to_datetime(df['Date'])
    df = df.sort_values('Date').reset_index(drop=True)
    for c in ['Open','High','Low','Close','Volume']:
        df[c] = pd.to_numeric(df[c], errors='coerce')
    return df.dropna(subset=['Open','High','Low','Close'])


def add_indicators(df):
    df = df.copy()
    df['ema20'] = df['Close'].ewm(span=20, adjust=False).mean()
    df['sma50'] = df['Close'].rolling(50).mean()
    tr = np.maximum(df['High'] - df['Low'],
        np.maximum(abs(df['High'] - df['Close'].shift(1)),
                   abs(df['Low'] - df['Close'].shift(1))))
    df['atr'] = tr.rolling(14).mean()
    df['ema_trail'] = df['Close'].ewm(span=20, adjust=False).mean()
    df['fSma'] = df['ema20']
    df['sSma'] = df['sma50']
    return df


def find_pivot_lows(df, lookback=PIVOT_LOOKBACK):
    """Find pivot lows: bar where Low is lowest within lookback bars on each side."""
    pivots = []
    for i in range(lookback, len(df) - lookback):
        low_i = df.iloc[i]['Low']
        is_pivot = True
        for j in range(i - lookback, i + lookback + 1):
            if j == i:
                continue
            if df.iloc[j]['Low'] < low_i:
                is_pivot = False
                break
        if is_pivot:
            pivots.append((i, low_i))
    return pivots


def backtest_sr(df, name):
    df = add_indicators(df)
    all_pivots = find_pivot_lows(df)
    trades = []
    pos = 0
    ep = er = tsl = 0.0
    last_entry_bar = -100

    for i in range(1, len(df)):
        r = df.iloc[i]
        prev = df.iloc[i - 1]
        atr = r['atr']

        if pd.isna(atr) or atr <= 0 or pd.isna(r['sma50']) or pd.isna(r['ema20']):
            continue

        # ── In a trade: check stop / trail ──
        if pos == 1:
            hit_sl = False
            xp = 0.0
            reason = ''

            if r['Low'] <= tsl:
                xp = gap_stop_fill_long(r['Open'], tsl); hit_sl = True; reason = 'SL'

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
                pnl = calc_pnl_with_costs(
                    direction='LONG',
                    entry_price=ep,
                    exit_price=xp,
                    qty=t['qty'],
                    slippage_bps=SLIPPAGE_BPS,
                    commission_per_share=COMMISSION_PER_SHARE,
                    min_commission_per_order=MIN_COMMISSION_PER_ORDER,
                )
                pnl_r = (pnl['netPnl'] / RISK) if er > 0 else 0
                t['pnlR'] = round(pnl_r, 2)
                t['pnlDollar'] = round(pnl['netPnl'], 2)
                t['grossPnlDollar'] = round(pnl['grossPnl'], 2)
                t['costsDollar'] = round(pnl['costs'], 2)
                t['entryFill'] = round(pnl['entryFill'], 4)
                t['exitFill'] = round(pnl['exitFill'], 4)
                t['exitReason'] = reason
                ed = pd.to_datetime(t['entryDate'])
                t['durationDays'] = int((r['Date'] - ed).days)
                pos = 0
            continue

        # ── Flat: look for S/R bounce entry ──
        if i - last_entry_bar < COOLDOWN:
            continue

        # Trend filter
        if r['Close'] <= r['sma50']:
            continue

        # Find support levels: pivot lows within lookback window, at least MIN_BARS after pivot
        support_levels = [(idx, low) for idx, low in all_pivots
                          if idx < i - MIN_BARS_FROM_PIVOT and idx >= i - SUPPORT_WINDOW]

        if not support_levels:
            continue

        # Check if previous bar dipped near any support level
        best_support = None
        for pidx, plow in support_levels:
            # Support must be below current price (not broken)
            if plow > r['Close']:
                continue
            # Previous bar's low came within TOUCH_ATR of support
            if prev['Low'] <= plow + TOUCH_ATR * atr and prev['Low'] >= plow - TOUCH_ATR * atr:
                # Take the nearest support
                if best_support is None or abs(prev['Low'] - plow) < abs(prev['Low'] - best_support[1]):
                    best_support = (pidx, plow)

        if best_support is None:
            continue

        # Bounce: current bar closes above support level
        if r['Close'] <= best_support[1]:
            continue

        # Not overextended
        if (r['High'] - r['Low']) > 2.0 * atr:
            continue

        # Not too far above support (within 3×ATR)
        if r['Close'] - best_support[1] > 3.0 * atr:
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
        last_entry_bar = i
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
        pnl = calc_pnl_with_costs(
            direction='LONG',
            entry_price=ep,
            exit_price=l['Close'],
            qty=t['qty'],
            slippage_bps=SLIPPAGE_BPS,
            commission_per_share=COMMISSION_PER_SHARE,
            min_commission_per_order=MIN_COMMISSION_PER_ORDER,
        )
        pnl_r = (pnl['netPnl'] / RISK) if er > 0 else 0
        t['pnlR'] = round(pnl_r, 2)
        t['pnlDollar'] = round(pnl['netPnl'], 2)
        t['grossPnlDollar'] = round(pnl['grossPnl'], 2)
        t['costsDollar'] = round(pnl['costs'], 2)
        t['entryFill'] = round(pnl['entryFill'], 4)
        t['exitFill'] = round(pnl['exitFill'], 4)
        t['exitReason'] = 'Open'
        ed = pd.to_datetime(t['entryDate'])
        t['durationDays'] = int((l['Date'] - ed).days)

    # Price series
    prices = []
    for _, row in df.iterrows():
        if pd.notna(row['ema20']) and pd.notna(row['sma50']):
            prices.append({
                'date': row['Date'].strftime('%Y-%m-%d'),
                'close': round(row['Close'], 2),
                'fSma': round(row['ema20'], 2),
                'sSma': round(row['sma50'], 2)
            })
    return trades, prices


all_data = {'stocks': {}, 'allTrades': [], 'settings': {
    'strategy': 'S/R Bounce v1',
    'entry': 'Bounce off horizontal pivot-low support in uptrend',
    'pivotLookback': PIVOT_LOOKBACK,
    'supportWindow': SUPPORT_WINDOW,
    'touchATR': TOUCH_ATR,
    'slAtrMult': SL_ATR,
    'trailEmaLen': 20, 'trailAtrBuf': TRAIL_ATR_BUF,
    'trailStartR': TRAIL_START_R,
    'riskPerTrade': RISK
}}

for f in sorted(DATA_DIR.glob("*.csv")):
    name = f.stem.replace("_daily_data - Sheet1", "").replace("_data", "").upper()
    trades, prices = backtest_sr(load(f), name)
    all_data['stocks'][name] = {'trades': trades, 'prices': prices}
    all_data['allTrades'].extend(trades)
    print(f"{name}: {len(trades)} trades, {len(prices)} price bars")

all_data['allTrades'].sort(key=lambda t: t['entryDate'])
all_data['allTrades'], portfolio_meta = apply_portfolio_constraints(
    all_data['allTrades'],
    max_positions=PORTFOLIO_MAX_POSITIONS,
    max_risk_pct=PORTFOLIO_MAX_RISK_PCT,
    max_gross_exposure_pct=PORTFOLIO_MAX_GROSS_EXPOSURE_PCT,
    starting_equity=PORTFOLIO_START_EQUITY,
)
all_data['settings'].update({
    'slippageBps': SLIPPAGE_BPS,
    'commissionPerShare': COMMISSION_PER_SHARE,
    'minCommissionPerOrder': MIN_COMMISSION_PER_ORDER,
    'portfolioStartEquity': PORTFOLIO_START_EQUITY,
    'portfolioMaxPositions': PORTFOLIO_MAX_POSITIONS,
    'portfolioMaxRiskPct': PORTFOLIO_MAX_RISK_PCT,
    'portfolioMaxGrossExposurePct': PORTFOLIO_MAX_GROSS_EXPOSURE_PCT,
    'portfolioAcceptedTrades': portfolio_meta['accepted'],
    'portfolioRejectedTrades': portfolio_meta['rejected'],
})
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(all_data))
print(f"\nWritten {OUT} ({OUT.stat().st_size // 1024}KB)")
