#!/usr/bin/env python3
"""
Rotation Scoring Comparison Backtest

Compares 3 momentum scoring methods over the last 12 months:
1. Pure 6-month return
2. Pure 3-month return
3. Composite (0.4×1mo + 0.35×3mo + 0.25×6mo)

For each scoring method, simulates weekly rotation with the same breakout rules
as generate_rotation_data.py. Outputs results for all 3 universes (mega/large/mid).
"""

import json
import sys
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

# ── PARAMETERS ───────────────────────────────────────────────────────────────────
MAX_RISK_PER_TRADE = 400.0
MAX_CAPITAL = 40000.0
TRAIL_START_R = 2.5
TRAIL_ATR_BUF = 1.0
MAX_POSITIONS = 3
TOP_N = 10

# Need 18 months of data: 6mo lookback + 12mo test
START_DATE = '2024-06-01'
END_DATE = '2026-06-04'
TRADE_START = '2025-06-04'  # last 12 months

SCORING_METHODS = {
    '6mo': {'label': 'Pure 6-Month', 'lookback_days': 126},
    '3mo': {'label': 'Pure 3-Month', 'lookback_days': 63},
    'composite': {'label': 'Composite (1m+3m+6m)', 'weights': [0.40, 0.35, 0.25], 'lookbacks': [21, 63, 126]},
}

# ── UNIVERSES (same as generate_rotation_data.py) ────────────────────────────────
MEGA_POOL = [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA',
    'JPM', 'V', 'MA', 'BAC',
    'UNH', 'JNJ', 'LLY', 'ABBV', 'MRK',
    'WMT', 'PG', 'KO', 'PEP', 'COST', 'HD',
    'XOM', 'CVX',
    'AVGO', 'ORCL', 'CRM', 'NFLX', 'ADBE', 'AMD',
]

LARGE_POOL = [
    'QCOM', 'INTC', 'MU', 'ANET', 'MRVL', 'LRCX', 'KLAC', 'ON',
    'NOW', 'PANW', 'CRWD', 'ADSK', 'WDAY', 'INTU', 'SNPS', 'CDNS', 'FTNT',
    'UBER', 'PYPL', 'SHOP', 'EA', 'ABNB',
    'REGN', 'GILD', 'ISRG', 'DXCM', 'ILMN',
    'CAT', 'DE', 'GE', 'LMT', 'RTX',
    'GS', 'MS',
]

MID_POOL = [
    'NET', 'DDOG', 'ZS', 'BILL', 'HUBS', 'TTD', 'OKTA', 'MDB',
    'DOCU', 'ESTC', 'PAYC', 'TWLO',
    'SNAP', 'ROKU', 'PINS', 'ETSY', 'CHWY', 'MTCH', 'W',
    'ENPH', 'SEDG', 'RUN', 'PLUG', 'FCEL', 'NIO', 'BLNK', 'TAN', 'SPCE',
    'SE', 'MELI', 'PAGS',
    'PTON', 'BYND', 'FSLY', 'ZM',
    'FOUR', 'SOFI', 'AFRM',
    'DKNG', 'PENN',
    'FVRR', 'FUBO', 'U',
]

UNIVERSES = {
    'mega': {'pool': MEGA_POOL, 'label': 'Mega-Cap ($200B+)'},
    'large': {'pool': LARGE_POOL, 'label': 'Large-Cap ($50B–$200B)'},
    'mid': {'pool': MID_POOL, 'label': 'Mid-Cap ($10B–$50B)'},
}


def download_data(tickers, start, end):
    """Download daily OHLCV data for all tickers."""
    print(f"  📥 Downloading {len(tickers)} stocks...")
    all_tickers = list(set(tickers + ['SPY']))
    df = yf.download(all_tickers, start=start, end=end,
                     interval='1d', group_by='ticker', progress=False,
                     threads=True, auto_adjust=True)

    stock_data = {}
    for ticker in all_tickers:
        try:
            if isinstance(df.columns, pd.MultiIndex):
                tdf = df[ticker].dropna(how='all').copy()
            else:
                tdf = df.dropna(how='all').copy()

            if len(tdf) < 60:
                continue

            tdf.columns = [str(c).strip() for c in tdf.columns]
            col_map = {}
            for c in tdf.columns:
                cl = c.lower()
                if cl == 'open': col_map[c] = 'Open'
                elif cl == 'high': col_map[c] = 'High'
                elif cl == 'low': col_map[c] = 'Low'
                elif cl in ('close', 'adj close'): col_map[c] = 'Close'
                elif cl == 'volume': col_map[c] = 'Volume'
            tdf = tdf.rename(columns=col_map)

            if 'Close' in tdf.columns and 'Volume' in tdf.columns:
                tdf.index = pd.to_datetime(tdf.index)
                stock_data[ticker] = tdf
        except (KeyError, TypeError):
            pass

    print(f"  ✅ Got data for {len(stock_data)}/{len(all_tickers)} stocks")
    return stock_data


def add_indicators(df):
    """Add indicators for breakout detection."""
    df = df.copy()
    df['ema20'] = df['Close'].ewm(span=20, adjust=False).mean()
    df['sma50'] = df['Close'].rolling(50).mean()
    df['sma200'] = df['Close'].rolling(200).mean()

    tr = np.maximum(df['High'] - df['Low'],
                    np.maximum(np.abs(df['High'] - df['Close'].shift(1)),
                               np.abs(df['Low'] - df['Close'].shift(1))))
    df['atr'] = tr.rolling(14).mean()
    df['high_20'] = df['High'].rolling(20).max().shift(1)
    df['vol_avg20'] = df['Volume'].rolling(20).mean()

    return df


def get_regime(spy_data):
    """Return set of dates where SPY > 200 SMA."""
    spy = add_indicators(spy_data)
    bull_mask = spy['Close'] > spy['sma200']
    return set(spy[bull_mask].index)


def get_weekly_watchlist(stock_data, date, pool, method):
    """Pick top N stocks by given scoring method as of given date."""
    scores = []
    for ticker in pool:
        if ticker not in stock_data or ticker == 'SPY':
            continue
        df = stock_data[ticker]
        mask = df.index <= date
        subset = df[mask]

        if method == 'composite':
            # Need at least 126 days
            if len(subset) < 126:
                continue
            weights = SCORING_METHODS['composite']['weights']
            lookbacks = SCORING_METHODS['composite']['lookbacks']
            score = 0
            valid = True
            for w, lb in zip(weights, lookbacks):
                if len(subset) < lb:
                    valid = False
                    break
                ret = subset['Close'].iloc[-1] / subset['Close'].iloc[-lb] - 1
                if np.isnan(ret):
                    valid = False
                    break
                score += w * ret
            if not valid:
                continue
            scores.append((ticker, score))
        else:
            lb = SCORING_METHODS[method]['lookback_days']
            if len(subset) < lb:
                continue
            ret = subset['Close'].iloc[-1] / subset['Close'].iloc[-lb] - 1
            if np.isnan(ret):
                continue
            scores.append((ticker, ret))

    scores.sort(key=lambda x: x[1], reverse=True)
    return [s[0] for s in scores[:TOP_N]]


def simulate(stock_data, bull_dates, pool, method):
    """Run the breakout backtest with weekly rotation using given scoring method."""
    trade_start = pd.Timestamp(TRADE_START)
    spy_dates = stock_data['SPY'].index
    trading_dates = spy_dates[spy_dates >= trade_start]

    trades = []
    open_positions = []
    current_watchlist = []
    last_rotation_week = None
    rotation_log = []
    equity_curve = []
    running_pnl = 0
    capital_deployed = 0

    for date in trading_dates:
        # Weekly rotation (every Monday)
        week_key = date.isocalendar()[:2]
        if week_key != last_rotation_week and date.weekday() == 0:
            current_watchlist = get_weekly_watchlist(stock_data, date, pool, method)
            last_rotation_week = week_key
            rotation_log.append({'week': date.strftime('%Y-%m-%d'), 'watchlist': current_watchlist[:]})
        elif not current_watchlist:
            current_watchlist = get_weekly_watchlist(stock_data, date, pool, method)
            rotation_log.append({'week': date.strftime('%Y-%m-%d'), 'watchlist': current_watchlist[:]})

        # Regime check
        in_bull = date in bull_dates

        # Update open positions
        closed_today = []
        for pos in open_positions:
            ticker = pos['ticker']
            if ticker not in stock_data or date not in stock_data[ticker].index:
                continue
            row = stock_data[ticker].loc[date]
            if pd.isna(row['Close']):
                continue

            entry = pos['entry_price']
            sl = pos['stop_loss']

            # Check SL hit
            if row['Low'] <= sl:
                pnl_dollar = (sl - entry) * pos['shares']
                pnl_r = pnl_dollar / MAX_RISK_PER_TRADE
                trades.append({
                    'stock': ticker,
                    'entryDate': pos['entry_date'].strftime('%Y-%m-%d'),
                    'entryPrice': round(entry, 2),
                    'exitDate': date.strftime('%Y-%m-%d'),
                    'exitPrice': round(sl, 2),
                    'pnlR': round(pnl_r, 2),
                    'pnlDollar': round(pnl_dollar, 2),
                    'exitReason': 'Trail' if pos['trail_active'] else 'SL',
                    'durationDays': (date - pos['entry_date']).days,
                })
                running_pnl += pnl_dollar
                capital_deployed -= entry * pos['shares']
                closed_today.append(pos)
                continue

            # Update ATR and EMA20
            if not pd.isna(row.get('atr', np.nan)):
                pos['current_atr'] = row['atr']
            if not pd.isna(row.get('ema20', np.nan)):
                pos['current_ema20'] = row['ema20']

            # Check trail activation
            current_r = (row['Close'] - entry) / pos['entry_atr']
            if current_r >= TRAIL_START_R and not pos['trail_active']:
                pos['trail_active'] = True

            # Update trailing stop
            if pos['trail_active']:
                new_trail = pos['current_ema20'] - TRAIL_ATR_BUF * pos['current_atr']
                if new_trail > sl:
                    pos['stop_loss'] = new_trail

        for p in closed_today:
            open_positions.remove(p)

        # Regime off → close all
        if not in_bull and open_positions:
            for pos in open_positions:
                ticker = pos['ticker']
                if date in stock_data[ticker].index:
                    exit_price = stock_data[ticker].loc[date]['Close']
                else:
                    exit_price = pos['entry_price']
                pnl_dollar = (exit_price - pos['entry_price']) * pos['shares']
                pnl_r = pnl_dollar / MAX_RISK_PER_TRADE
                trades.append({
                    'stock': ticker,
                    'entryDate': pos['entry_date'].strftime('%Y-%m-%d'),
                    'entryPrice': round(pos['entry_price'], 2),
                    'exitDate': date.strftime('%Y-%m-%d'),
                    'exitPrice': round(exit_price, 2),
                    'pnlR': round(pnl_r, 2),
                    'pnlDollar': round(pnl_dollar, 2),
                    'exitReason': 'Regime',
                    'durationDays': (date - pos['entry_date']).days,
                })
                running_pnl += pnl_dollar
                capital_deployed -= pos['entry_price'] * pos['shares']
            open_positions = []

        # Check for new entries (only in bull market)
        if in_bull and len(open_positions) < MAX_POSITIONS:
            for ticker in current_watchlist:
                if len(open_positions) >= MAX_POSITIONS:
                    break
                if any(p['ticker'] == ticker for p in open_positions):
                    continue
                if ticker not in stock_data or date not in stock_data[ticker].index:
                    continue

                row = stock_data[ticker].loc[date]
                if pd.isna(row['Close']) or pd.isna(row.get('high_20')) or pd.isna(row.get('atr')):
                    continue
                if row['atr'] <= 0:
                    continue
                if row['Close'] < 5:
                    continue

                # Breakout signal
                if row['Close'] <= row['high_20']:
                    continue
                if pd.isna(row.get('vol_avg20')) or row['Volume'] < 1.2 * row['vol_avg20']:
                    continue
                if pd.isna(row.get('sma50')) or row['Close'] <= row['sma50']:
                    continue

                # Position sizing
                atr = row['atr']
                sl_price = row['Close'] - atr
                shares = int(MAX_RISK_PER_TRADE / atr)
                if shares <= 0:
                    continue
                cost = row['Close'] * shares
                if capital_deployed + cost > MAX_CAPITAL:
                    continue

                open_positions.append({
                    'ticker': ticker,
                    'entry_price': row['Close'],
                    'entry_date': date,
                    'original_sl': sl_price,
                    'stop_loss': sl_price,
                    'entry_atr': atr,
                    'current_atr': atr,
                    'current_ema20': row['ema20'] if not pd.isna(row.get('ema20')) else row['Close'],
                    'shares': shares,
                    'trail_active': False,
                })
                capital_deployed += cost

        equity_curve.append({
            'date': date.strftime('%Y-%m-%d'),
            'pnl': round(running_pnl, 2),
        })

    # Mark remaining positions as open
    for pos in open_positions:
        ticker = pos['ticker']
        last_row = stock_data[ticker].iloc[-1]
        pnl_dollar = (last_row['Close'] - pos['entry_price']) * pos['shares']
        pnl_r = pnl_dollar / MAX_RISK_PER_TRADE
        trades.append({
            'stock': ticker,
            'entryDate': pos['entry_date'].strftime('%Y-%m-%d'),
            'entryPrice': round(pos['entry_price'], 2),
            'exitDate': trading_dates[-1].strftime('%Y-%m-%d'),
            'exitPrice': round(last_row['Close'], 2),
            'pnlR': round(pnl_r, 2),
            'pnlDollar': round(pnl_dollar, 2),
            'exitReason': 'Open',
            'durationDays': (trading_dates[-1] - pos['entry_date']).days,
        })

    return trades, equity_curve, rotation_log


def compute_stats(trades):
    """Compute summary statistics."""
    if not trades:
        return {'total_trades': 0, 'closed_trades': 0, 'win_rate': 0,
                'total_pnl': 0, 'profit_factor': 0, 'max_drawdown': 0,
                'avg_winner': 0, 'avg_loser': 0, 'max_losing_streak': 0,
                'avg_duration_days': 0}

    closed_trades = [t for t in trades if t['exitReason'] != 'Open']
    pnls = [t['pnlDollar'] for t in closed_trades]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]

    max_streak = 0
    curr_streak = 0
    for p in pnls:
        if p <= 0:
            curr_streak += 1
            max_streak = max(max_streak, curr_streak)
        else:
            curr_streak = 0

    # Max drawdown
    equity = 0
    peak = 0
    max_dd = 0
    for p in pnls:
        equity += p
        peak = max(peak, equity)
        dd = peak - equity
        max_dd = max(max_dd, dd)

    gross_win = sum(wins) if wins else 0
    gross_loss = abs(sum(losses)) if losses else 0
    pf = gross_win / gross_loss if gross_loss > 0 else 0

    # Monthly PnL
    monthly = {}
    for t in closed_trades:
        key = t['exitDate'][:7]
        monthly[key] = monthly.get(key, 0) + t['pnlDollar']

    return {
        'total_trades': len(trades),
        'closed_trades': len(closed_trades),
        'win_rate': round(len(wins) / len(closed_trades) * 100, 1) if closed_trades else 0,
        'total_pnl': round(sum(pnls), 2),
        'profit_factor': round(pf, 2),
        'max_losing_streak': max_streak,
        'max_drawdown': round(max_dd, 2),
        'avg_winner': round(gross_win / len(wins), 2) if wins else 0,
        'avg_loser': round(gross_loss / len(losses), 2) if losses else 0,
        'best_trade': round(max(pnls), 2) if pnls else 0,
        'worst_trade': round(min(pnls), 2) if pnls else 0,
        'avg_duration_days': round(sum(t['durationDays'] for t in closed_trades) / len(closed_trades), 1) if closed_trades else 0,
        'monthly_pnl': monthly,
        'total_wins': len(wins),
        'total_losses': len(losses),
    }


def main():
    print("🔬 Rotation Scoring Comparison — 12-Month Backtest")
    print(f"   Period: {TRADE_START} to {END_DATE}")
    print(f"   Methods: {', '.join(m['label'] for m in SCORING_METHODS.values())}")
    print()

    results = {}

    for uni_name, uni_config in UNIVERSES.items():
        pool = uni_config['pool']
        label = uni_config['label']

        print(f"\n{'='*60}")
        print(f"  🎯 {label} — {len(pool)} stocks")
        print(f"{'='*60}")

        # Download data once per universe
        stock_data = download_data(pool, START_DATE, END_DATE)

        # Add indicators
        print("  📊 Adding indicators...")
        for ticker in list(stock_data.keys()):
            stock_data[ticker] = add_indicators(stock_data[ticker])

        if 'SPY' not in stock_data:
            print("  ❌ SPY data missing!")
            continue

        bull_dates = get_regime(stock_data['SPY'])

        uni_results = {}
        for method_name, method_config in SCORING_METHODS.items():
            print(f"\n  ── Testing: {method_config['label']} ──")
            trades, equity_curve, rotation_log = simulate(stock_data, bull_dates, pool, method_name)
            stats = compute_stats(trades)

            print(f"     Trades: {stats['closed_trades']} | WR: {stats['win_rate']}% | "
                  f"PnL: ${stats['total_pnl']:,.0f} | PF: {stats['profit_factor']}")

            uni_results[method_name] = {
                'label': method_config['label'],
                'stats': stats,
                'trades': trades,
                'equity_curve': equity_curve,
                'rotation_log': rotation_log[-10:],  # last 10 weeks only
            }

        results[uni_name] = {
            'label': label,
            'methods': uni_results,
        }

    # Find winner for each universe
    print(f"\n\n{'='*60}")
    print("  📊 FINAL COMPARISON")
    print(f"{'='*60}")
    print(f"\n  {'Universe':<25} {'6-Month':<18} {'3-Month':<18} {'Composite':<18}")
    print(f"  {'-'*79}")

    for uni_name, uni_data in results.items():
        methods = uni_data['methods']
        row = f"  {uni_data['label']:<25}"
        best_pnl = -999999
        best_method = ''
        for m_name, m_data in methods.items():
            pnl = m_data['stats']['total_pnl']
            pf = m_data['stats']['profit_factor']
            row += f" ${pnl:>8,.0f} PF{pf:<5}"
            if pnl > best_pnl:
                best_pnl = pnl
                best_method = m_name
        row += f"  ← {best_method}"
        print(row)

    # Save output
    output = {
        'lastUpdated': datetime.now().strftime('%Y-%m-%d %H:%M'),
        'period': {'start': TRADE_START, 'end': END_DATE},
        'scoring_methods': {k: v['label'] for k, v in SCORING_METHODS.items()},
        'universes': {}
    }

    for uni_name, uni_data in results.items():
        uni_out = {'label': uni_data['label'], 'methods': {}}
        for m_name, m_data in uni_data['methods'].items():
            uni_out['methods'][m_name] = {
                'label': m_data['label'],
                'stats': m_data['stats'],
                'trades': m_data['trades'],
                'equity_curve': m_data['equity_curve'],
            }
        output['universes'][uni_name] = uni_out

    out_path = Path(__file__).parent.parent / 'dashboard' / 'public' / 'rotation_comparison_data.json'
    with open(out_path, 'w') as f:
        json.dump(output, f, indent=2)
    print(f"\n  💾 Saved to {out_path}")
    print("\n✅ Done!")


if __name__ == '__main__':
    main()
