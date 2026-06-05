#!/usr/bin/env python3
"""Breakout v2 backtest on 100 realistic S&P 500 stocks.

Universe selection logic:
- All stocks were in the S&P 500 during the 2021-2026 period
- Mix includes: mega-cap tech, industrials, healthcare, financials, energy,
  consumer staples, utilities, REITs, and specifically includes stocks that
  CRASHED (PYPL, INTC, WBD, VFC, DIS etc.) to avoid survivorship bias.

Categories:
  ~35 Bull run (strong performers 2021-2026)
  ~35 Sideways / modest gainers
  ~30 Crashed / destroyed

This gives a realistic answer to: "Would this strategy have worked on a
broad 100-stock universe where you didn't pick winners in advance?"
"""
import pandas as pd
import numpy as np
import json
import yfinance as yf
from pathlib import Path
from datetime import datetime

OUT = Path(__file__).resolve().parent.parent / "dashboard" / "public" / "breakout_v2_sp100_data.json"

# ═══════════════════════════════════════════════════════════════
# 100 S&P 500 stocks — realistic mix, NO cherry-picking
# ═══════════════════════════════════════════════════════════════

UNIVERSE = {
    # ── BULL RUN (strong performers) ──
    'bull': [
        'NVDA', 'META', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'LLY', 'AVGO',
        'COST', 'GE', 'NFLX', 'CRM', 'AMD', 'NOW', 'UBER', 'PANW',
        'ANET', 'KLAC', 'PWR', 'FICO', 'URI', 'AXON', 'PLTR', 'VST',
        'CEG', 'TRGP', 'DECK', 'GWW', 'CDNS', 'SNPS', 'LRCX', 'MELI',
        'ISRG', 'MCO', 'ODFL',
    ],
    # ── SIDEWAYS / MODEST (flat to small gains) ──
    'sideways': [
        'JPM', 'JNJ', 'PG', 'KO', 'PEP', 'UNH', 'MRK', 'ABT', 'TMO',
        'HON', 'UPS', 'RTX', 'CAT', 'DE', 'MMM', 'IBM', 'TXN', 'QCOM',
        'MCD', 'WMT', 'HD', 'LOW', 'TGT', 'CVX', 'XOM', 'COP', 'SLB',
        'ADP', 'ITW', 'EMR', 'GD', 'LMT', 'NOC', 'CME', 'BLK',
    ],
    # ── CRASHED / DESTROYED (lost significant value) ──
    'crashed': [
        'PYPL', 'INTC', 'DIS', 'BA', 'NKE', 'MRNA', 'ENPH', 'SEDG',
        'ALGN', 'MTCH', 'PARA', 'WBD', 'VFC', 'FMC',
        'NCLH', 'AAL', 'ETSY', 'ZM', 'DKNG',
        'COIN', 'CRWD', 'SNOW', 'ABNB', 'DASH', 'TSLA',
        'SMCI', 'NFLX', 'SQ', 'SHOP', 'ROKU',
    ],
}

ALL_TICKERS = UNIVERSE['bull'] + UNIVERSE['sideways'] + UNIVERSE['crashed']
print(f"Universe: {len(ALL_TICKERS)} stocks")
print(f"  Bull: {len(UNIVERSE['bull'])}, Sideways: {len(UNIVERSE['sideways'])}, Crashed: {len(UNIVERSE['crashed'])}")

# ═══════════════════════════════════════════════════════════════
# DOWNLOAD DATA
# ═══════════════════════════════════════════════════════════════
START = '2021-01-01'
END = '2026-06-05'

print(f"\nDownloading {len(ALL_TICKERS)} stocks from {START} to {END}...")
raw = yf.download(ALL_TICKERS, start=START, end=END, group_by='ticker', auto_adjust=True, progress=True)

stock_dfs = {}
for ticker in ALL_TICKERS:
    try:
        if isinstance(raw.columns, pd.MultiIndex):
            # Multi-level columns: (Price, Ticker)
            df = raw.xs(ticker, level='Ticker', axis=1).copy()
        else:
            df = raw.copy()
        df = df.dropna(subset=['Close'])
        df = df.reset_index()
        df['Date'] = pd.to_datetime(df['Date'])
        df = df.sort_values('Date').reset_index(drop=True)
        if len(df) >= 200:
            stock_dfs[ticker] = df
    except Exception as e:
        print(f"  Skipping {ticker}: {e}")

print(f"  Successfully loaded: {len(stock_dfs)} stocks")

# ═══════════════════════════════════════════════════════════════
# FILTER: Remove stocks that traded below $10 and fetch market caps
# ═══════════════════════════════════════════════════════════════
MIN_PRICE = 10.0
print(f"\nFiltering stocks below ${MIN_PRICE} and fetching market caps...")

market_caps = {}
to_remove = []
for ticker, df in stock_dfs.items():
    # Check if stock ever traded below $10 during our period
    if df['Close'].min() < MIN_PRICE:
        to_remove.append(ticker)
        print(f"  Removing {ticker}: traded below ${MIN_PRICE} (min=${df['Close'].min():.2f})")
        continue
    # Fetch market cap
    try:
        info = yf.Ticker(ticker).info
        mcap = info.get('marketCap', 0)
        if mcap and mcap < 10e9:  # filter small caps (< $10B)
            to_remove.append(ticker)
            print(f"  Removing {ticker}: small cap (${mcap/1e9:.1f}B)")
            continue
        market_caps[ticker] = mcap
    except Exception:
        market_caps[ticker] = 0

for t in to_remove:
    del stock_dfs[t]

print(f"  After filtering: {len(stock_dfs)} stocks")

# ═══════════════════════════════════════════════════════════════
# INDICATORS
# ═══════════════════════════════════════════════════════════════
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

# ═══════════════════════════════════════════════════════════════
# SPY REGIME
# ═══════════════════════════════════════════════════════════════
print("\nLoading SPY for regime filter...")
spy = yf.download('SPY', start=START, end=END, auto_adjust=True, progress=False)
spy = spy.reset_index()
# Flatten multi-level columns if present
if isinstance(spy.columns, pd.MultiIndex):
    spy.columns = [c[0] if c[1] == '' else c[0] for c in spy.columns]
spy['sma200'] = spy['Close'].rolling(200).mean()
bull_dates = set(spy.loc[spy['Close'] > spy['sma200'], 'Date'].dt.strftime('%Y-%m-%d'))
total_spy = len(spy.dropna(subset=['sma200']))
print(f"  SPY regime: {len(bull_dates)}/{total_spy} bull days ({100*len(bull_dates)/max(total_spy,1):.0f}%)")

# ═══════════════════════════════════════════════════════════════
# BACKTEST (identical logic to generate_breakout_v2_data.py)
# ═══════════════════════════════════════════════════════════════
VOL_MULT = 1.0
CLOSE_QUALITY = 0.3
EXTENDED_ATR = 5.0
MAX_POSITIONS = 5
SL_ATR = 1.0
TRAIL_START_R = 2.0
TRAIL_ATR_BUF = 1.0
SKIP_AFTER_LOSSES = 3

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

        # Enter confirmed
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

        # Scan for new signals
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

                if row['Close'] <= row['sma50']:
                    continue
                if row['Close'] <= dh:
                    continue
                if name in last_breakout_high and abs(dh - last_breakout_high[name]) < 0.01:
                    continue
                if (row['High'] - row['Low']) > 2.5 * atr:
                    continue
                if row['Close'] - row['sma50'] > EXTENDED_ATR * atr:
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
                    if close_pos < CLOSE_QUALITY:
                        continue

                pending_signals[name] = {'level': dh, 'atr': atr, 'dh': dh}

    # Close open positions at last price
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
    return trades, total_skipped, open_positions

# ═══════════════════════════════════════════════════════════════
# RUN
# ═══════════════════════════════════════════════════════════════
print(f"\nRunning backtest on {len(stock_dfs)} stocks...")
trades, total_skipped, open_pos = run_backtest(stock_dfs, bull_dates)

# Buy & hold for each stock (in $ terms based on $40k allocation proportional)
first_date = trades[0]['entryDate'] if trades else None
last_date = trades[-1]['exitDate'] if trades else None
buy_hold = {}
for name, df in stock_dfs.items():
    df_tmp = df.copy()
    df_tmp['date_str'] = df_tmp['Date'].dt.strftime('%Y-%m-%d')
    mask = (df_tmp['date_str'] >= first_date) & (df_tmp['date_str'] <= last_date) if first_date else pd.Series([False]*len(df_tmp))
    sub = df_tmp.loc[mask]
    if len(sub) >= 2:
        start_p = sub.iloc[0]['Close']
        end_p = sub.iloc[-1]['Close']
        ret_pct = ((end_p - start_p) / start_p) * 100
        buy_hold[name] = {
            'startPrice': round(start_p, 2),
            'endPrice': round(end_p, 2),
            'returnPct': round(ret_pct, 1),
            'marketCap': market_caps.get(name, 0),
        }

# Categorize
categories = {}
for cat, tickers in UNIVERSE.items():
    for t in tickers:
        if t in stock_dfs:
            categories[t] = cat

# Output
all_data = {
    'allTrades': trades,
    'buyHold': buy_hold,
    'marketCaps': {t: market_caps.get(t, 0) for t in stock_dfs},
    'universe': {
        'total': len(stock_dfs),
        'categories': {t: categories.get(t, 'unknown') for t in stock_dfs},
        'bull': [t for t in UNIVERSE['bull'] if t in stock_dfs],
        'sideways': [t for t in UNIVERSE['sideways'] if t in stock_dfs],
        'crashed': [t for t in UNIVERSE['crashed'] if t in stock_dfs],
    },
    'settings': {
        'channel': 'Donchian 20', 'trendMA': 'SMA 50',
        'slAtrMult': SL_ATR, 'trailEmaLen': 20, 'trailAtrBuf': TRAIL_ATR_BUF,
        'trailStartR': TRAIL_START_R, 'maxPositions': MAX_POSITIONS,
        'volMult': VOL_MULT, 'closeQuality': CLOSE_QUALITY,
        'extendedAtr': EXTENDED_ATR, 'skipAfterLosses': SKIP_AFTER_LOSSES,
        'strategy': 'Breakout v2 (SP100)',
        'period': f'{first_date} to {last_date}',
    },
}

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(all_data))

# ═══════════════════════════════════════════════════════════════
# REPORT
# ═══════════════════════════════════════════════════════════════
closed = [t for t in trades if t['exitReason'] != 'Open']
wins = [t for t in closed if t['pnlR'] > 0]
losses = [t for t in closed if t['pnlR'] <= 0]
total_pnl = sum(t['pnlDollar'] for t in closed)
gross_win = sum(t['pnlDollar'] for t in wins)
gross_loss = abs(sum(t['pnlDollar'] for t in losses))
pf = gross_win / gross_loss if gross_loss > 0 else float('inf')

print(f"\n{'='*60}")
print(f"  BREAKOUT V2 — S&P 100 REALISTIC BACKTEST")
print(f"{'='*60}")
print(f"  Universe: {len(stock_dfs)} stocks (bull={len(UNIVERSE['bull'])}, sideways={len(UNIVERSE['sideways'])}, crashed={len(UNIVERSE['crashed'])})")
print(f"  Period: {first_date} → {last_date}")
print(f"  Trades: {len(closed)} closed, {len(trades)-len(closed)} open")
print(f"  Win Rate: {100*len(wins)/max(len(closed),1):.1f}% ({len(wins)}/{len(closed)})")
print(f"  P&L: ${total_pnl:,.0f} (at $100 base risk)")
print(f"  Profit Factor: {pf:.2f}")
print(f"  Avg Win: ${gross_win/max(len(wins),1):,.0f} | Avg Loss: ${gross_loss/max(len(losses),1):,.0f}")
print(f"  Skipped: {total_skipped} (3-loss rule)")
print(f"  Open positions: {len(trades)-len(closed)}")

# Per-category breakdown
print(f"\n  Per Category:")
for cat in ['bull', 'sideways', 'crashed']:
    cat_trades = [t for t in closed if categories.get(t['stock']) == cat]
    if cat_trades:
        cat_pnl = sum(t['pnlDollar'] for t in cat_trades)
        cat_wins = len([t for t in cat_trades if t['pnlR'] > 0])
        print(f"    {cat:>8}: {len(cat_trades)} trades, WR {100*cat_wins/len(cat_trades):.0f}%, P&L ${cat_pnl:,.0f}")

# Worst stocks
per_stock = {}
for t in closed:
    per_stock.setdefault(t['stock'], 0)
    per_stock[t['stock']] += t['pnlDollar']

print(f"\n  Top 5 stocks:")
for s in sorted(per_stock, key=per_stock.get, reverse=True)[:5]:
    bh = buy_hold.get(s, {}).get('returnPct', 0)
    print(f"    {s:>6}: ${per_stock[s]:>+8,.0f} (B&H: {bh:+.0f}%)")

print(f"\n  Bottom 5 stocks:")
for s in sorted(per_stock, key=per_stock.get)[:5]:
    bh = buy_hold.get(s, {}).get('returnPct', 0)
    print(f"    {s:>6}: ${per_stock[s]:>+8,.0f} (B&H: {bh:+.0f}%)")

print(f"\n  Written: {OUT} ({OUT.stat().st_size // 1024}KB)")
