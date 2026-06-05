#!/usr/bin/env python3
"""Generate Breakout v2 backtest JSON for the React dashboard.

Base rules (same as v1):
  - Entry: Price closes above 20-day Donchian high + above SMA50 (uptrend filter)
  - Stop: 1x ATR below entry
  - Exit: EMA20 trailing stop starting at 2.5R
  - Long only

V2 additions (layered on top of v1):
  1. Volume confirmation: breakout bar volume > 1.2x 20-day avg
  2. Strong close: bar closes in upper 60% of range (conviction)
  3. Next-day confirmation: enter next day only if open >= breakout level
  4. SPY regime filter: SPY must be > 200 SMA (otherwise 100% cash)
  5. Max 3 simultaneous positions
  6. Skip after 3 consecutive portfolio-wide losses
  7. Compounding-ready: trades store risk (ATR) so frontend can scale

Static universe: stocks from data/ folder (no rotation bias).
Frontend handles compounding math with configurable risk %.
"""
import pandas as pd, numpy as np, json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
OUT = Path(__file__).resolve().parent.parent / "dashboard" / "public" / "breakout_v2_data.json"

VOL_MULT = 1.2
SKIP_AFTER_LOSSES = 3
MAX_POSITIONS = 3
SL_ATR = 1.0
TRAIL_START_R = 2.5
TRAIL_ATR_BUF = 1.0
EXCLUDE = {'BND', 'IEF', 'TLT', 'USTTENT', 'VIX'}


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
    df['sma200'] = df['Close'].rolling(200).mean()
    df['donchian_high'] = df['High'].rolling(20).max().shift(1)
    tr = np.maximum(df['High'] - df['Low'],
                    np.maximum(abs(df['High'] - df['Close'].shift(1)),
                               abs(df['Low'] - df['Close'].shift(1))))
    df['atr'] = tr.rolling(14).mean()
    df['ema20'] = df['Close'].ewm(span=20, adjust=False).mean()
    df['vol_avg'] = df['Volume'].rolling(20).mean()
    return df


def load_spy_regime():
    spy_file = DATA_DIR / "spy_data.csv"
    if not spy_file.exists():
        print("  Warning: No spy_data.csv - skipping regime filter")
        return None
    spy = load(spy_file)
    spy = add_indicators(spy)
    bull_mask = spy['Close'] > spy['sma200']
    bull_dates = set(spy.loc[bull_mask, 'Date'].dt.strftime('%Y-%m-%d'))
    total = len(spy.dropna(subset=['sma200']))
    print(f"  SPY regime: {len(bull_dates)}/{total} bull days ({100*len(bull_dates)/max(total,1):.0f}%)")
    return bull_dates


def run_backtest(stock_dfs, bull_dates):
    indexed = {}
    all_dates = set()
    for name, df in stock_dfs.items():
        df = add_indicators(df)
        df['date_str'] = df['Date'].dt.strftime('%Y-%m-%d')
        indexed[name] = df.set_index('date_str')
        all_dates.update(df['date_str'].tolist())

    all_dates = sorted(all_dates)
    trades = []
    open_positions = []
    pending_signals = {}
    consecutive_losses = 0
    total_skipped = 0
    last_breakout_high = {}

    for date_str in all_dates:
        # Regime check
        if bull_dates is not None and date_str not in bull_dates:
            pending_signals = {}
            continue

        # Update open positions
        closed_today = []
        for pos in open_positions:
            name = pos['stock']
            if name not in indexed or date_str not in indexed[name].index:
                continue
            row = indexed[name].loc[date_str]
            if pd.isna(row['Close']):
                continue
            atr = row['atr'] if not pd.isna(row['atr']) else pos['entry_atr']

            # Check stop hit
            if row['Low'] <= pos['stop']:
                exit_price = min(row['Open'], pos['stop'])
                pnl_r = (exit_price - pos['entry_price']) / pos['risk']
                reason = 'Trail' if pos['trail_active'] else 'SL'
                duration = (pd.Timestamp(date_str) - pd.Timestamp(pos['entry_date'])).days
                trades.append({
                    'stock': name, 'dir': 'LONG',
                    'entryDate': pos['entry_date'],
                    'entryPrice': round(pos['entry_price'], 2),
                    'sl': round(pos['original_sl'], 2),
                    'risk': round(pos['risk'], 2),
                    'qty': 1,
                    'exitDate': date_str,
                    'exitPrice': round(exit_price, 2),
                    'pnlR': round(pnl_r, 2),
                    'pnlDollar': round(pnl_r * 100, 2),
                    'exitReason': reason,
                    'durationDays': duration,
                })
                if pnl_r <= 0:
                    consecutive_losses += 1
                else:
                    consecutive_losses = 0
                closed_today.append(pos)
                continue

            # Update trail
            curr_r = (row['Close'] - pos['entry_price']) / pos['risk']
            if curr_r >= TRAIL_START_R:
                pos['trail_active'] = True
            if pos['trail_active'] and not pd.isna(row['ema20']):
                new_trail = row['ema20'] - TRAIL_ATR_BUF * atr
                if new_trail > pos['stop']:
                    pos['stop'] = new_trail

        for p in closed_today:
            open_positions.remove(p)

        # Process pending signals (next-day confirmation)
        confirmed = []
        for name, sig in list(pending_signals.items()):
            if name not in indexed or date_str not in indexed[name].index:
                continue
            row = indexed[name].loc[date_str]
            if pd.isna(row['Open']):
                continue
            if row['Open'] >= sig['level']:
                confirmed.append((name, sig, row))
        pending_signals = {}

        # Enter confirmed (respect max positions + skip rule)
        for name, sig, row in confirmed:
            if len(open_positions) >= MAX_POSITIONS:
                break
            if any(p['stock'] == name for p in open_positions):
                continue
            if consecutive_losses >= SKIP_AFTER_LOSSES:
                total_skipped += 1
                consecutive_losses = 0
                continue

            entry_price = row['Open']
            risk = sig['atr'] * SL_ATR
            sl = entry_price - risk
            open_positions.append({
                'stock': name,
                'entry_price': entry_price,
                'entry_date': date_str,
                'original_sl': sl,
                'stop': sl,
                'risk': risk,
                'entry_atr': sig['atr'],
                'trail_active': False,
            })
            last_breakout_high[name] = sig['dh']

        # Scan for new breakout signals
        if len(open_positions) < MAX_POSITIONS:
            for name, df in indexed.items():
                if date_str not in df.index:
                    continue
                row = df.loc[date_str]
                if pd.isna(row['atr']) or row['atr'] <= 0:
                    continue
                if pd.isna(row['sma50']) or pd.isna(row['donchian_high']):
                    continue

                atr = row['atr']
                dh = row['donchian_high']

                # Base v1 rules
                if row['Close'] <= row['sma50']:
                    continue
                if row['Close'] <= dh:
                    continue
                if name in last_breakout_high and abs(dh - last_breakout_high[name]) < 0.01:
                    continue
                if (row['High'] - row['Low']) > 2.5 * atr:
                    continue
                if row['Close'] - row['sma50'] > 4.0 * atr:
                    continue
                if any(p['stock'] == name for p in open_positions):
                    continue
                if name in pending_signals:
                    continue

                # V2 filters
                if pd.isna(row['vol_avg']) or row['vol_avg'] <= 0:
                    continue
                if row['Volume'] <= VOL_MULT * row['vol_avg']:
                    continue
                bar_range = row['High'] - row['Low']
                if bar_range > 0:
                    close_pos = (row['Close'] - row['Low']) / bar_range
                    if close_pos < 0.4:
                        continue

                pending_signals[name] = {'level': dh, 'atr': atr, 'dh': dh}

    # Close remaining open positions
    for pos in open_positions:
        name = pos['stock']
        df = indexed[name]
        last_date = df.index[-1]
        last_row = df.iloc[-1]
        pnl_r = (last_row['Close'] - pos['entry_price']) / pos['risk']
        duration = (pd.Timestamp(last_date) - pd.Timestamp(pos['entry_date'])).days
        trades.append({
            'stock': name, 'dir': 'LONG',
            'entryDate': pos['entry_date'],
            'entryPrice': round(pos['entry_price'], 2),
            'sl': round(pos['original_sl'], 2),
            'risk': round(pos['risk'], 2),
            'qty': 1,
            'exitDate': last_date,
            'exitPrice': round(last_row['Close'], 2),
            'pnlR': round(pnl_r, 2),
            'pnlDollar': round(pnl_r * 100, 2),
            'exitReason': 'Open',
            'durationDays': duration,
        })

    trades.sort(key=lambda t: t['entryDate'])

    # Per-stock price series
    stock_prices = {}
    for name, df in indexed.items():
        prices = []
        for d, row in df.iterrows():
            if pd.notna(row.get('donchian_high')) and pd.notna(row.get('sma50')):
                prices.append({'date': d, 'close': round(row['Close'], 2),
                               'fSma': round(row['donchian_high'], 2),
                               'sSma': round(row['sma50'], 2)})
        stock_prices[name] = prices

    return trades, stock_prices, total_skipped


# ── MAIN ──
print("Breakout v2 - Portfolio backtest")
print("=" * 60)

bull_dates = load_spy_regime()

stock_dfs = {}
for f in sorted(DATA_DIR.glob("*.csv")):
    name = f.stem.replace("_daily_data - Sheet1", "").replace("_data", "").upper()
    if any(ex in name for ex in EXCLUDE):
        continue
    if name == 'SPY':
        continue
    stock_dfs[name] = load(f)

print(f"  Loaded {len(stock_dfs)} stocks: {', '.join(sorted(stock_dfs.keys()))}")

trades, stock_prices, total_skipped = run_backtest(stock_dfs, bull_dates)

per_stock = {}
for t in trades:
    per_stock.setdefault(t['stock'], []).append(t)

stocks_out = {}
for name in stock_dfs:
    stocks_out[name] = {'trades': per_stock.get(name, []), 'prices': stock_prices.get(name, [])}

all_data = {
    'stocks': stocks_out,
    'allTrades': trades,
    'settings': {
        'channel': 'Donchian 20', 'trendMA': 'SMA 50',
        'slAtrMult': SL_ATR, 'trailEmaLen': 20, 'trailAtrBuf': TRAIL_ATR_BUF,
        'trailStartR': TRAIL_START_R, 'maxPositions': MAX_POSITIONS,
        'strategy': 'Breakout v2',
        'v2_additions': [
            f'Volume > {VOL_MULT}x 20-day avg on breakout bar',
            'Close in upper 60% of bar range (strong close)',
            'Next-day confirmation (open >= breakout level)',
            'SPY > 200 SMA regime filter (cash in bear market)',
            f'Max {MAX_POSITIONS} simultaneous positions',
            f'Skip entry after {SKIP_AFTER_LOSSES} consecutive losses',
            'Compounding: risk % of current capital (configurable)',
        ],
    },
}

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(all_data))

closed = [t for t in trades if t['exitReason'] != 'Open']
wins = [t for t in closed if t['pnlR'] > 0]
losses_list = [t for t in closed if t['pnlR'] <= 0]
total_pnl = sum(t['pnlDollar'] for t in closed)
gross_win = sum(t['pnlDollar'] for t in wins)
gross_loss = abs(sum(t['pnlDollar'] for t in losses_list))
pf = gross_win / gross_loss if gross_loss > 0 else float('inf')

print(f"\n{'=' * 60}")
print(f"  Trades: {len(closed)} closed, {len(trades)-len(closed)} open")
if closed:
    print(f"  Win Rate: {100*len(wins)/len(closed):.1f}% ({len(wins)}/{len(closed)})")
    print(f"  P&L: ${total_pnl:.0f} (at $100 base risk)")
    print(f"  Profit Factor: {pf:.2f}")
print(f"  Skipped: {total_skipped} (3-loss rule)")
print(f"  Written: {OUT} ({OUT.stat().st_size // 1024}KB)")
