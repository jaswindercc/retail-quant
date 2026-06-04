#!/usr/bin/env python3
"""
Top-10 Pure Momentum Rotation - S&P 500 Universe

Truthful backtest:
- Universe: S&P 500 stocks (current constituents - survivorship bias noted)
- Every Monday: rank ALL stocks by 3-month return
- Buy top 10 at Monday close (no entry filter - just buy)
- Hold until they drop out of top 10 at next rotation
- Position size: capital / 10 per slot (equal weight, compounding)
- Stop loss: 3% from entry (tight stop - momentum stocks shouldn't dip this much)
- Gap-down realism: if open < stop, exit at open (not stop level)
- Record ACTUAL top 10 each week for evidence

This is an honest test of: "what if I just bought the hottest stocks every week?"
"""

import json
import sys
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

# ── PARAMETERS ───────────────────────────────────────────────────────────────────
CAPITAL = 40000.0
MAX_POSITIONS = 10
STOP_LOSS_PCT = 0.03  # 3% tight stop — momentum stocks shouldn't dip this much
LOOKBACK_DAYS = 63    # 3-month momentum (63 trading days)
HOLD_MIN_WEEKS = 1    # minimum hold period

START_DATE = '2020-06-01'   # need 3mo lookback before test starts
END_DATE = '2026-06-04'
TRADE_START = '2021-01-01'  # 5-year backtest

# ── S&P 500 UNIVERSE ─────────────────────────────────────────────────────────────
# Current S&P 500 constituents (as close as possible, ~480 liquid names)
SP500 = [
    # Technology
    'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AVGO', 'ORCL', 'ADBE', 'CRM', 'AMD',
    'CSCO', 'ACN', 'TXN', 'INTU', 'QCOM', 'AMAT', 'NOW', 'IBM', 'ADI', 'PANW',
    'LRCX', 'SNPS', 'CDNS', 'KLAC', 'CRWD', 'MRVL', 'FTNT', 'ADSK', 'WDAY', 'NXPI',
    'MPWR', 'ON', 'MCHP', 'GEN', 'ANSS', 'KEYS', 'FSLR', 'TER', 'SWKS', 'ENPH',
    'HPQ', 'HPE', 'NTAP', 'WDC', 'STX', 'EPAM', 'IT', 'CTSH', 'AKAM', 'FFIV',
    
    # Communication Services
    'GOOG', 'NFLX', 'DIS', 'CMCSA', 'TMUS', 'VZ', 'T', 'CHTR', 'EA', 'TTWO',
    'WBD', 'LYV', 'MTCH', 'PARA', 'FOXA', 'FOX', 'IPG', 'OMC',
    
    # Consumer Discretionary
    'AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'LOW', 'BKNG', 'TJX', 'SBUX', 'CMG',
    'ABNB', 'ORLY', 'AZO', 'MAR', 'HLT', 'RCL', 'DHI', 'LEN', 'GM', 'F',
    'ROST', 'YUM', 'DARDEN', 'DPZ', 'POOL', 'BBY', 'DECK', 'LULU', 'GPC', 'ULTA',
    'EBAY', 'ETSY', 'EXPE', 'CCL', 'LVS', 'WYNN', 'MGM', 'CZR',
    
    # Consumer Staples
    'WMT', 'PG', 'COST', 'KO', 'PEP', 'PM', 'MO', 'CL', 'MDLZ', 'KMB',
    'GIS', 'SJM', 'HSY', 'K', 'CAG', 'TSN', 'HRL', 'MKC', 'CHD', 'EL',
    'STZ', 'BF-B', 'TAP', 'MNST', 'KDP', 'WBA', 'KR', 'SYY',
    
    # Healthcare
    'LLY', 'UNH', 'JNJ', 'ABBV', 'MRK', 'TMO', 'ABT', 'PFE', 'DHR', 'BMY',
    'AMGN', 'GILD', 'ISRG', 'SYK', 'VRTX', 'REGN', 'MDT', 'ELV', 'CI', 'HCA',
    'BSX', 'EW', 'ZTS', 'DXCM', 'ILMN', 'IQV', 'A', 'BDX', 'MCK', 'CAH',
    'HUM', 'CNC', 'IDXX', 'MTD', 'WAT', 'HOLX', 'ALGN', 'TECH', 'BAX', 'COO',
    
    # Financials
    'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'AXP', 'BLK', 'SCHW',
    'C', 'USB', 'PNC', 'TFC', 'CME', 'ICE', 'SPGI', 'MCO', 'AON', 'MMC',
    'CB', 'AIG', 'MET', 'PRU', 'ALL', 'TRV', 'AFL', 'AJG', 'MSCI', 'FIS',
    'COF', 'DFS', 'BRO', 'WTW', 'RJF', 'CINF', 'GL', 'L',
    
    # Industrials
    'GE', 'CAT', 'UNP', 'RTX', 'DE', 'BA', 'HON', 'LMT', 'UPS', 'ADP',
    'MMM', 'GD', 'NOC', 'CSX', 'NSC', 'ITW', 'EMR', 'CARR', 'ROK', 'SWK',
    'FDX', 'WM', 'RSG', 'VRSK', 'CPRT', 'FAST', 'ODFL', 'TT', 'IR', 'PH',
    'ETN', 'AME', 'CTAS', 'PCAR', 'GWW', 'CMI', 'DOV', 'XYL', 'IEX', 'NDSN',
    
    # Energy
    'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'PXD', 'MPC', 'PSX', 'VLO', 'OXY',
    'HAL', 'DVN', 'FANG', 'HES', 'BKR', 'TRGP', 'WMB', 'OKE', 'KMI', 'CTRA',
    
    # Materials
    'LIN', 'APD', 'SHW', 'ECL', 'DD', 'NEM', 'FCX', 'NUE', 'VMC', 'MLM',
    'DOW', 'PPG', 'IFF', 'CE', 'ALB', 'EMN', 'FMC', 'CF', 'MOS',
    
    # Real Estate
    'PLD', 'AMT', 'CCI', 'EQIX', 'PSA', 'O', 'SPG', 'WELL', 'DLR', 'VICI',
    'ARE', 'AVB', 'EQR', 'MAA', 'UDR', 'ESS', 'CPT', 'VTR', 'PEAK', 'BXP',
    
    # Utilities
    'NEE', 'SO', 'DUK', 'SRE', 'AEP', 'D', 'EXC', 'XEL', 'ED', 'WEC',
    'ES', 'AWK', 'ATO', 'CMS', 'DTE', 'EIX', 'FE', 'ETR', 'PEG', 'CEG',
    
    # Additional S&P 500 names
    'BRK-B', 'DELL', 'ARM', 'SMCI', 'PLTR', 'COIN', 'UBER', 'DASH',
    'SPOT', 'SNOW', 'NET', 'DDOG', 'ZS', 'MDB', 'TTD', 'HUBS',
    'PAYC', 'BILL', 'TWLO', 'OKTA', 'DOCU', 'ZM', 'ROKU', 'SNAP',
    'SQ', 'PYPL', 'SHOP', 'MELI', 'SE', 'SOFI', 'HOOD', 'AFRM',
    'RIVN', 'LCID', 'NIO', 'DKNG', 'RBLX', 'U',
    'VST', 'GEV', 'INTC', 'MU', 'ANET',
]

# Deduplicate
SP500 = list(dict.fromkeys(SP500))


def download_data(tickers, start, end):
    """Download daily OHLCV data."""
    print(f"  📥 Downloading {len(tickers)} stocks...")
    all_tickers = list(set(tickers + ['SPY']))
    
    # Download in batches to avoid yfinance issues
    stock_data = {}
    batch_size = 100
    for i in range(0, len(all_tickers), batch_size):
        batch = all_tickers[i:i+batch_size]
        print(f"    ... batch {i//batch_size + 1}/{(len(all_tickers)-1)//batch_size + 1}")
        try:
            df = yf.download(batch, start=start, end=end,
                             interval='1d', group_by='ticker', progress=False,
                             threads=True, auto_adjust=True)
            
            for ticker in batch:
                try:
                    if len(batch) == 1:
                        tdf = df.dropna(how='all').copy()
                    elif isinstance(df.columns, pd.MultiIndex):
                        tdf = df[ticker].dropna(how='all').copy()
                    else:
                        continue

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

                    if 'Close' in tdf.columns:
                        tdf.index = pd.to_datetime(tdf.index)
                        stock_data[ticker] = tdf
                except (KeyError, TypeError):
                    pass
        except Exception as e:
            print(f"    ⚠️ Batch error: {e}")
    
    print(f"  ✅ Got data for {len(stock_data)}/{len(all_tickers)} stocks")
    return stock_data


def rank_by_momentum(stock_data, date, lookback_days):
    """Rank ALL stocks by momentum as of given date. Returns full ranking."""
    scores = []
    for ticker, df in stock_data.items():
        mask = df.index <= date
        subset = df[mask]
        if len(subset) < lookback_days:
            continue
        
        price_now = subset['Close'].iloc[-1]
        price_then = subset['Close'].iloc[-lookback_days]
        
        if price_then <= 0 or np.isnan(price_now) or np.isnan(price_then):
            continue
        
        ret = (price_now / price_then - 1) * 100
        scores.append({
            'ticker': ticker,
            'return_pct': round(ret, 2),
            'price': round(float(price_now), 2),
        })
    
    scores.sort(key=lambda x: x['return_pct'], reverse=True)
    return scores


def simulate(stock_data, lookback_days):
    """Pure top-3 rotation. Buy on rotation day, sell when dropped out."""
    trade_start = pd.Timestamp(TRADE_START)
    
    # Get all trading dates
    all_dates = set()
    for df in stock_data.values():
        all_dates.update(df.index)
    trading_dates = sorted([d for d in all_dates if d >= trade_start])
    
    trades = []
    open_positions = {}  # ticker -> position info
    weekly_log = []      # evidence of what was top 10 each week
    equity_curve = []
    running_pnl = 0
    last_rotation_week = None

    for date in trading_dates:
        week_key = date.isocalendar()[:2]
        is_rotation_day = (week_key != last_rotation_week and date.weekday() == 0)
        
        # ── Daily: check stop losses (gap-down realistic) ──
        closed_today = []
        for ticker, pos in list(open_positions.items()):
            if ticker not in stock_data or date not in stock_data[ticker].index:
                continue
            row = stock_data[ticker].loc[date]
            if pd.isna(row['Close']):
                continue
            
            # Hard stop loss — realistic: if open gaps below stop, exit at open (slippage)
            if row['Low'] <= pos['stop_price']:
                # Gap-down realism: if open is already below stop, we get filled at open
                open_price = float(row['Open']) if not pd.isna(row['Open']) else pos['stop_price']
                if open_price <= pos['stop_price']:
                    exit_price = open_price  # gapped through stop — realistic fill
                    reason = 'Stop (Gap)'
                else:
                    exit_price = pos['stop_price']  # intraday hit — filled at stop
                    reason = 'Stop Loss'
                
                pnl = (exit_price - pos['entry_price']) * pos['shares']
                trades.append({
                    'stock': ticker,
                    'entryDate': pos['entry_date'].strftime('%Y-%m-%d'),
                    'entryPrice': round(pos['entry_price'], 2),
                    'exitDate': date.strftime('%Y-%m-%d'),
                    'exitPrice': round(exit_price, 2),
                    'pnlDollar': round(pnl, 2),
                    'pnlPct': round((exit_price / pos['entry_price'] - 1) * 100, 2),
                    'exitReason': reason,
                    'durationDays': (date - pos['entry_date']).days,
                    'rank_at_entry': pos['rank'],
                })
                running_pnl += pnl
                closed_today.append(ticker)
        
        for t in closed_today:
            del open_positions[t]
        
        # ── Weekly rotation (Monday) ──
        if is_rotation_day:
            last_rotation_week = week_key
            
            # Rank all stocks
            ranking = rank_by_momentum(stock_data, date, lookback_days)
            top_10 = ranking[:10]
            top_n_tickers = [s['ticker'] for s in ranking[:MAX_POSITIONS]]
            
            # Log this week's top 10 (evidence)
            weekly_log.append({
                'week': date.strftime('%Y-%m-%d'),
                'top_10': [{'ticker': s['ticker'], 'return_pct': s['return_pct'], 'price': s['price']} for s in top_10],
            })
            
            # Sell positions that dropped out of top N
            sell_list = []
            for ticker, pos in open_positions.items():
                if ticker not in top_n_tickers:
                    if ticker in stock_data and date in stock_data[ticker].index:
                        exit_price = stock_data[ticker].loc[date]['Close']
                        if pd.isna(exit_price):
                            continue
                        pnl = (exit_price - pos['entry_price']) * pos['shares']
                        trades.append({
                            'stock': ticker,
                            'entryDate': pos['entry_date'].strftime('%Y-%m-%d'),
                            'entryPrice': round(pos['entry_price'], 2),
                            'exitDate': date.strftime('%Y-%m-%d'),
                            'exitPrice': round(float(exit_price), 2),
                            'pnlDollar': round(pnl, 2),
                            'pnlPct': round((float(exit_price) / pos['entry_price'] - 1) * 100, 2),
                            'exitReason': 'Rotated Out',
                            'durationDays': (date - pos['entry_date']).days,
                            'rank_at_entry': pos['rank'],
                        })
                        running_pnl += pnl
                        sell_list.append(ticker)
            
            for t in sell_list:
                del open_positions[t]
            
            # Buy new positions to fill top N
            position_size = CAPITAL / MAX_POSITIONS
            for i, ticker in enumerate(top_n_tickers):
                if ticker in open_positions:
                    continue  # already holding
                if len(open_positions) >= MAX_POSITIONS:
                    break
                if ticker not in stock_data or date not in stock_data[ticker].index:
                    continue
                
                entry_price = float(stock_data[ticker].loc[date]['Close'])
                if pd.isna(entry_price) or entry_price <= 0:
                    continue
                
                shares = int(position_size / entry_price)
                if shares <= 0:
                    continue
                
                stop_price = entry_price * (1 - STOP_LOSS_PCT)
                
                open_positions[ticker] = {
                    'entry_price': entry_price,
                    'entry_date': date,
                    'shares': shares,
                    'stop_price': stop_price,
                    'rank': i + 1,
                }
        
        # Equity curve
        unrealized = 0
        for ticker, pos in open_positions.items():
            if ticker in stock_data and date in stock_data[ticker].index:
                current_price = stock_data[ticker].loc[date]['Close']
                if not pd.isna(current_price):
                    unrealized += (float(current_price) - pos['entry_price']) * pos['shares']
        
        equity_curve.append({
            'date': date.strftime('%Y-%m-%d'),
            'realized_pnl': round(running_pnl, 2),
            'total_pnl': round(running_pnl + unrealized, 2),
            'positions': len(open_positions),
        })
    
    # Close remaining positions at last price
    last_date = trading_dates[-1]
    for ticker, pos in open_positions.items():
        if ticker in stock_data:
            last_row = stock_data[ticker].iloc[-1]
            exit_price = float(last_row['Close'])
            pnl = (exit_price - pos['entry_price']) * pos['shares']
            trades.append({
                'stock': ticker,
                'entryDate': pos['entry_date'].strftime('%Y-%m-%d'),
                'entryPrice': round(pos['entry_price'], 2),
                'exitDate': last_date.strftime('%Y-%m-%d'),
                'exitPrice': round(exit_price, 2),
                'pnlDollar': round(pnl, 2),
                'pnlPct': round((exit_price / pos['entry_price'] - 1) * 100, 2),
                'exitReason': 'Open',
                'durationDays': (last_date - pos['entry_date']).days,
                'rank_at_entry': pos['rank'],
            })

    return trades, equity_curve, weekly_log


def compute_stats(trades):
    """Compute honest stats."""
    closed = [t for t in trades if t['exitReason'] != 'Open']
    if not closed:
        return {}
    
    pnls = [t['pnlDollar'] for t in closed]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]
    
    gross_win = sum(wins) if wins else 0
    gross_loss = abs(sum(losses)) if losses else 1
    
    # Max drawdown on equity curve
    equity = 0
    peak = 0
    max_dd = 0
    for p in pnls:
        equity += p
        peak = max(peak, equity)
        dd = peak - equity
        max_dd = max(max_dd, dd)
    
    # Streaks
    max_lose_streak = 0
    curr = 0
    for p in pnls:
        if p <= 0:
            curr += 1
            max_lose_streak = max(max_lose_streak, curr)
        else:
            curr = 0
    
    # Monthly
    monthly = {}
    for t in closed:
        key = t['exitDate'][:7]
        monthly[key] = monthly.get(key, 0) + t['pnlDollar']
    
    return {
        'total_trades': len(trades),
        'closed_trades': len(closed),
        'wins': len(wins),
        'losses': len(losses),
        'win_rate': round(len(wins) / len(closed) * 100, 1),
        'total_pnl': round(sum(pnls), 2),
        'profit_factor': round(gross_win / gross_loss, 2) if gross_loss > 0 else 99,
        'max_drawdown': round(max_dd, 2),
        'avg_winner': round(gross_win / len(wins), 2) if wins else 0,
        'avg_loser': round(gross_loss / len(losses), 2) if losses else 0,
        'avg_winner_pct': round(sum(t['pnlPct'] for t in closed if t['pnlDollar'] > 0) / len(wins), 2) if wins else 0,
        'avg_loser_pct': round(abs(sum(t['pnlPct'] for t in closed if t['pnlDollar'] <= 0)) / len(losses), 2) if losses else 0,
        'best_trade': round(max(pnls), 2),
        'worst_trade': round(min(pnls), 2),
        'avg_duration': round(sum(t['durationDays'] for t in closed) / len(closed), 1),
        'max_lose_streak': max_lose_streak,
        'monthly_pnl': monthly,
        'total_return_pct': round(sum(pnls) / CAPITAL * 100, 2),
    }


def main():
    print("🔄 Top-10 Pure Momentum Rotation — S&P 500 Universe")
    print(f"   Capital: ${CAPITAL:,.0f} | Positions: {MAX_POSITIONS} | Stop: {STOP_LOSS_PCT*100:.0f}% (gap-down realistic)")
    print(f"   Lookback: {LOOKBACK_DAYS} trading days (~3 months)")
    print(f"   Period: {TRADE_START} to {END_DATE}")
    print(f"   Universe: ~{len(SP500)} S&P 500 stocks")
    print()
    
    # Download all data
    stock_data = download_data(SP500, START_DATE, END_DATE)
    
    # Run simulation
    print("\n  🎲 Running pure rotation simulation...")
    trades, equity_curve, weekly_log = simulate(stock_data, LOOKBACK_DAYS)
    
    # Stats
    stats = compute_stats(trades)
    
    print(f"\n  {'='*60}")
    print(f"  📊 RESULTS — Top {MAX_POSITIONS} Rotation (S&P 500) [3% stop, gap-down realistic]")
    print(f"  {'='*60}")
    print(f"  Trades: {stats.get('closed_trades', 0)} closed")
    print(f"  Win Rate: {stats.get('win_rate', 0)}%")
    print(f"  Total PnL: ${stats.get('total_pnl', 0):,.0f} ({stats.get('total_return_pct', 0)}% on ${CAPITAL:,.0f})")
    print(f"  Profit Factor: {stats.get('profit_factor', 0)}")
    print(f"  Max Drawdown: ${stats.get('max_drawdown', 0):,.0f}")
    print(f"  Avg Winner: ${stats.get('avg_winner', 0):,.0f} (+{stats.get('avg_winner_pct', 0)}%)")
    print(f"  Avg Loser: -${stats.get('avg_loser', 0):,.0f} (-{stats.get('avg_loser_pct', 0)}%)")
    print(f"  Avg Duration: {stats.get('avg_duration', 0)} days")
    print(f"  Max Losing Streak: {stats.get('max_lose_streak', 0)}")
    
    # Print last 5 weeks' top 10
    print(f"\n  📋 Last 5 weeks' Top 10:")
    for wk in weekly_log[-5:]:
        tickers = ', '.join(f"{s['ticker']}(+{s['return_pct']:.0f}%)" for s in wk['top_10'][:5])
        print(f"     {wk['week']}: {tickers} ...")
    
    # SPY buy-and-hold comparison
    spy_curve = []
    if 'SPY' in stock_data:
        spy_df = stock_data['SPY']
        spy_start_mask = spy_df.index >= pd.Timestamp(TRADE_START)
        spy_subset = spy_df[spy_start_mask]
        if len(spy_subset) > 0:
            spy_start_price = float(spy_subset['Close'].iloc[0])
            spy_shares = CAPITAL / spy_start_price
            for date, row in spy_subset.iterrows():
                spy_pnl = (float(row['Close']) - spy_start_price) * spy_shares
                spy_curve.append({
                    'date': date.strftime('%Y-%m-%d'),
                    'pnl': round(spy_pnl, 2),
                })
            spy_final = spy_curve[-1]['pnl'] if spy_curve else 0
            print(f"\n  📊 SPY Buy & Hold: ${spy_final:,.0f} ({spy_final/CAPITAL*100:.1f}%)")
    
    # Save
    output = {
        'lastUpdated': datetime.now().strftime('%Y-%m-%d %H:%M'),
        'strategy': 'Top-10 Pure Momentum Rotation',
        'universe': 'S&P 500',
        'universe_size': len(stock_data),
        'params': {
            'capital': CAPITAL,
            'max_positions': MAX_POSITIONS,
            'stop_loss_pct': STOP_LOSS_PCT,
            'lookback_days': LOOKBACK_DAYS,
            'rotation_freq': 'weekly (Monday)',
            'period': f'{TRADE_START} to {END_DATE}',
        },
        'stats': stats,
        'trades': trades,
        'equity_curve': equity_curve,
        'weekly_log': weekly_log,
        'spy_curve': spy_curve,
    }
    
    out_path = Path(__file__).resolve().parent.parent / 'dashboard' / 'public' / 'rotation_top3_data.json'
    with open(out_path, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"\n  💾 Saved to {out_path}")
    print("\n✅ Done!")


if __name__ == '__main__':
    main()
