#!/usr/bin/env python3
"""Daily Higher High Break Scanner — scans 100+ stocks for the pattern.

Usage:
    python3 scripts/scan_higher_high.py                     # Scan S&P 500
    python3 scripts/scan_higher_high.py --universe nasdaq100  # Scan Nasdaq 100
    python3 scripts/scan_higher_high.py --tickers AAPL NVDA TSLA  # Specific tickers
    python3 scripts/scan_higher_high.py --file watchlist.txt   # From file (one ticker per line)

What it detects:
    - Stocks with 3+ consecutive lower swing highs (confirmed downtrend)
    - First higher swing high = breakout signal
    - Shows entry price, stop loss, and risk per share

Output:
    - Prints results to terminal (sorted by signal recency)
    - Saves JSON to dashboard/public/hh_scanner_results.json
"""
import argparse
import sys
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

OUT = Path(__file__).resolve().parent.parent / "data" / "hh_scanner_results.json"

# ── Stock Universes ──
SP500_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
NASDAQ100_URL = "https://en.wikipedia.org/wiki/Nasdaq-100#Components"

# Fallback lists if Wikipedia fails
SP500_FALLBACK = [
    'AAPL','ABBV','ABT','ACN','ADBE','ADI','ADP','ADSK','AEP','AFL','AIG','AMAT','AMD','AMGN',
    'AMZN','ANET','ANSS','APD','APH','AVGO','AXP','BA','BAC','BDX','BK','BKNG','BLK','BMY',
    'BRK-B','BSX','C','CAT','CB','CCI','CDNS','CDW','CEG','CHTR','CI','CL','CMCSA','CME',
    'CMG','COP','COST','CRM','CRWD','CSCO','CTAS','CTSH','CVX','D','DASH','DD','DE','DHR',
    'DIS','DLR','DOW','DUK','DVN','DXCM','EA','EBAY','ECL','EL','EMR','ENPH','EOG','EQIX',
    'EW','EXC','F','FAST','FCX','FDX','FI','FICO','FTNT','GD','GE','GEHC','GEV','GILD',
    'GM','GOOG','GOOGL','GS','HD','HON','HPQ','HUM','IBM','ICE','IDXX','ILMN','INTC','INTU',
    'ISRG','IT','JCI','JNJ','JPM','KDP','KEY','KHC','KKR','KLAC','KMI','KO','LHX','LIN',
    'LLY','LMT','LOW','LRCX','LULU','LVS','MA','MAR','MCD','MCHP','MCK','MCO','MDLZ','MDT',
    'MET','META','MMC','MMM','MNST','MO','MOH','MPC','MRK','MRNA','MS','MSFT','MSI','MU',
    'NDAQ','NFLX','NKE','NOC','NOW','NSC','NTAP','NVDA','NVO','ORCL','ORLY','OXY','PANW',
    'PAYX','PCAR','PEP','PFE','PG','PGR','PH','PLTR','PM','PNC','PODD','PSA','PSX','PXD',
    'PYPL','QCOM','REGN','ROP','ROST','RTX','SBUX','SCHW','SHW','SLB','SMH','SMCI','SNPS',
    'SO','SPG','SPGI','SQ','SRE','SYK','SYY','T','TDG','TFC','TGT','TJX','TMO','TMUS',
    'TSLA','TSN','TT','TTD','TXN','TYL','UNH','UNP','UPS','URI','USB','V','VICI','VLO',
    'VRSK','VRTX','VZ','WBA','WDAY','WEC','WELL','WFC','WM','WMT','XEL','XOM','ZTS'
]

NASDAQ100_FALLBACK = [
    'AAPL','ABNB','ADBE','ADI','ADP','ADSK','AEP','AMAT','AMD','AMGN','AMZN','ANSS','ARM',
    'ASML','AVGO','AZN','BIIB','BKNG','BKR','CCEP','CDNS','CDW','CEG','CHTR','CMCSA','COST',
    'CPRT','CRWD','CSCO','CSGP','CTAS','CTSH','DASH','DDOG','DLTR','DXCM','EA','EXC','FANG',
    'FAST','FTNT','GEHC','GFS','GILD','GOOG','GOOGL','HON','IDXX','ILMN','INTC','INTU','ISRG',
    'KDP','KHC','KLAC','LIN','LRCX','LULU','MAR','MCHP','MDB','MDLZ','MELI','META','MNST',
    'MRVL','MSFT','MU','NFLX','NVDA','NXPI','ODFL','ON','ORLY','PANW','PAYX','PCAR','PDD',
    'PEP','PYPL','QCOM','REGN','ROP','ROST','SBUX','SMCI','SNPS','SPLK','TEAM','TMUS','TSLA',
    'TTD','TTWO','TXN','VRSK','VRTX','WBD','WDAY','XEL','ZS'
]

SWING_STOCKS = [
    'SPY','QQQ','AAPL','ADBE','AMD','AMZN','BA','CRM','GOOGL','META','MSFT','NVDA',
    'SNOW','TSLA','NFLX','SHOP','SQ','PLTR','COIN','SOFI','RIVN','NIO','MARA','RIOT',
    'SMCI','ARM','MRVL','AVGO','MU','ANET','CRWD','PANW','NET','DDOG','SNOW','TTD',
    'RBLX','U','SE','PINS','SNAP','UBER','LYFT','ABNB','DASH','ROKU','ZM','DOCU',
    'ENPH','SEDG','FSLR','RUN','PLUG','LCID','FSR',
]


def get_universe(name):
    """Get list of tickers for a universe."""
    if name == 'sp500':
        try:
            table = pd.read_html(SP500_URL, header=0)[0]
            return sorted(table['Symbol'].str.replace('.', '-', regex=False).tolist())
        except Exception:
            print("  ⚠ Wikipedia fetch failed, using fallback S&P 500 list")
            return SP500_FALLBACK
    elif name == 'nasdaq100':
        try:
            tables = pd.read_html(NASDAQ100_URL, header=0)
            for t in tables:
                if 'Ticker' in t.columns:
                    return sorted(t['Ticker'].tolist())
                if 'Symbol' in t.columns:
                    return sorted(t['Symbol'].tolist())
            return NASDAQ100_FALLBACK
        except Exception:
            print("  ⚠ Wikipedia fetch failed, using fallback Nasdaq 100 list")
            return NASDAQ100_FALLBACK
    elif name == 'swing':
        return SWING_STOCKS
    else:
        return SP500_FALLBACK


def download_data(tickers, period='2y'):
    """Bulk download daily OHLCV data using yfinance."""
    print(f"  📥 Downloading {len(tickers)} stocks ({period} of daily data)...")
    # Download in batches to avoid timeouts
    batch_size = 50
    all_data = {}
    
    for i in range(0, len(tickers), batch_size):
        batch = tickers[i:i+batch_size]
        try:
            df = yf.download(batch, period=period, interval='1d', 
                           group_by='ticker', progress=False, threads=True)
            
            if len(batch) == 1:
                # Single ticker returns flat DataFrame
                ticker = batch[0]
                if not df.empty:
                    all_data[ticker] = df.reset_index()
            else:
                # Multi-ticker returns multi-level columns
                for ticker in batch:
                    try:
                        tdf = df[ticker].dropna(how='all').reset_index()
                        if len(tdf) > 50:  # Need enough data for swing detection
                            all_data[ticker] = tdf
                    except (KeyError, TypeError):
                        pass
        except Exception as e:
            print(f"    ⚠ Batch {i//batch_size + 1} error: {e}")
    
    print(f"  ✅ Got data for {len(all_data)}/{len(tickers)} stocks")
    return all_data


def find_swing_highs(df, window=10):
    """Find swing highs: bars where High is the max in a window of N bars on each side."""
    highs = []
    high_col = df['High'].values
    
    for i in range(window, len(df) - window):
        local_max = high_col[i-window:i+window+1].max()
        if high_col[i] == local_max:
            highs.append((i, float(high_col[i])))
    
    # Remove duplicates within close proximity
    filtered = []
    for h in highs:
        if not filtered or h[0] - filtered[-1][0] >= window:
            filtered.append(h)
    return filtered


def scan_higher_high(df, ticker, lookback_bars=30):
    """Scan a single stock for the Higher High Break pattern.
    
    Returns list of signals (usually 0 or 1 for recent signals).
    """
    signals = []
    n = len(df)
    
    if n < 100:  # Need enough history
        return signals
    
    # Compute ATR
    high = df['High'].values
    low = df['Low'].values
    close = df['Close'].values
    
    tr = np.maximum(high[1:] - low[1:],
         np.maximum(np.abs(high[1:] - close[:-1]), np.abs(low[1:] - close[:-1])))
    atr = pd.Series(np.concatenate([[np.nan], tr])).rolling(14).mean().values
    
    # EMA20 for context
    ema20 = pd.Series(close).ewm(span=20, adjust=False).mean().values
    sma50 = pd.Series(close).rolling(50).mean().values
    
    # Find swing highs
    swing_highs = find_swing_highs(df, window=10)
    
    if len(swing_highs) < 4:
        return signals
    
    # Check for Higher High Break pattern in recent swing highs
    for sh_idx in range(3, len(swing_highs)):
        # Check if the last 3+ swing highs before this one are consecutive lower highs
        # Look backwards to find the longest run of lower highs
        lower_count = 0
        for j in range(sh_idx - 1, 0, -1):
            if swing_highs[j][1] < swing_highs[j-1][1]:
                lower_count += 1
            else:
                break
        
        if lower_count < 3:
            continue
        
        curr_sh = swing_highs[sh_idx]
        prev_sh = swing_highs[sh_idx - 1]
        
        # Current swing high must be HIGHER than previous (the break!)
        if curr_sh[1] <= prev_sh[1]:
            continue
        
        # Must be recent (within lookback_bars of the end)
        if curr_sh[0] < n - lookback_bars:
            continue
        
        # Get bar data at signal
        bar_idx = curr_sh[0]
        entry_price = close[bar_idx]
        atr_val = atr[bar_idx] if not np.isnan(atr[bar_idx]) else 0
        stop_loss = entry_price - atr_val if atr_val > 0 else low[bar_idx]
        risk_per_share = entry_price - stop_loss
        
        # Determine signal strength
        break_pct = (curr_sh[1] - prev_sh[1]) / prev_sh[1] * 100
        above_ema = close[bar_idx] > ema20[bar_idx] if not np.isnan(ema20[bar_idx]) else False
        
        # Get the lower highs sequence for display
        start_idx = sh_idx - lower_count
        lower_highs = [swing_highs[j][1] for j in range(start_idx, sh_idx)]
        
        signal_date = df.iloc[bar_idx]['Date']
        if hasattr(signal_date, 'strftime'):
            date_str = signal_date.strftime('%Y-%m-%d')
        else:
            date_str = str(signal_date)[:10]
        
        signals.append({
            'ticker': ticker,
            'date': date_str,
            'entry': round(entry_price, 2),
            'stop': round(stop_loss, 2),
            'risk_per_share': round(risk_per_share, 2),
            'break_level': round(prev_sh[1], 2),
            'new_high': round(curr_sh[1], 2),
            'lower_high_count': lower_count,
            'lower_highs': [round(h, 2) for h in lower_highs[-5:]],  # Show last 5
            'break_pct': round(break_pct, 1),
            'above_ema20': above_ema,
            'strength': 'STRONG' if break_pct > 3 and above_ema else 'NORMAL',
            'bars_ago': n - 1 - bar_idx,
        })
    
    return signals


def scan_approaching(df, ticker):
    """Find stocks with 3+ lower highs that HAVEN'T broken yet = approaching setup."""
    n = len(df)
    if n < 100:
        return None
    
    close = df['Close'].values
    swing_highs = find_swing_highs(df, window=10)
    
    if len(swing_highs) < 4:
        return None
    
    # Check from the end: are the last few swing highs consecutive lower highs?
    last_sh = swing_highs[-1]
    lower_count = 0
    for j in range(len(swing_highs) - 1, 0, -1):
        if swing_highs[j][1] < swing_highs[j-1][1]:
            lower_count += 1
        else:
            break
    
    if lower_count >= 3:
        # Stock has 3+ lower highs and hasn't broken yet — it's on the watchlist
        break_level = last_sh[1]
        current_price = close[-1]
        distance_pct = (break_level - current_price) / current_price * 100
        
        if 0 < distance_pct < 15:  # Only show if within 15% of breaking
            return {
                'ticker': ticker,
                'lower_high_count': lower_count,
                'break_level': round(break_level, 2),
                'current_price': round(current_price, 2),
                'distance_pct': round(distance_pct, 1),
                'last_lower_highs': [round(swing_highs[j][1], 2) for j in range(max(0, len(swing_highs)-4), len(swing_highs))],
                'status': 'WATCHING — needs close above break level'
            }
    
    return None


def main():
    parser = argparse.ArgumentParser(description='Daily Higher High Break Scanner')
    parser.add_argument('--universe', choices=['sp500', 'nasdaq100', 'swing'], default='swing',
                       help='Stock universe to scan (default: swing = ~50 popular stocks)')
    parser.add_argument('--tickers', nargs='+', help='Specific tickers to scan')
    parser.add_argument('--file', type=str, help='File with tickers (one per line)')
    parser.add_argument('--period', default='2y', help='Data period (default: 2y)')
    parser.add_argument('--lookback', type=int, default=30, help='How many bars back to look for signals (default: 30)')
    parser.add_argument('--json', action='store_true', help='Save results to dashboard JSON')
    args = parser.parse_args()
    
    print("=" * 60)
    print("  📐 HIGHER HIGH BREAK — Daily Scanner")
    print("=" * 60)
    print(f"  Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"  Pattern: First higher swing high after 3+ lower swing highs")
    print(f"  Lookback: {args.lookback} bars")
    print()
    
    # Get tickers
    if args.tickers:
        tickers = [t.upper() for t in args.tickers]
    elif args.file:
        tickers = [l.strip().upper() for l in open(args.file) if l.strip()]
    else:
        tickers = get_universe(args.universe)
        print(f"  Universe: {args.universe} ({len(tickers)} stocks)")
    
    print()
    
    # Download data
    data = download_data(tickers, period=args.period)
    
    if not data:
        print("  ❌ No data downloaded. Check internet connection.")
        sys.exit(1)
    
    # Scan all stocks
    print(f"\n  🔍 Scanning for Higher High Break pattern...")
    all_signals = []
    watchlist = []
    
    for ticker, df in data.items():
        # Normalize column names (yfinance sometimes returns multi-level)
        if 'Date' not in df.columns and df.index.name == 'Date':
            df = df.reset_index()
        
        # Ensure proper column names
        col_map = {}
        for c in df.columns:
            cl = str(c).lower()
            if cl == 'date': col_map[c] = 'Date'
            elif cl == 'open': col_map[c] = 'Open'
            elif cl == 'high': col_map[c] = 'High'
            elif cl == 'low': col_map[c] = 'Low'
            elif cl in ('close', 'adj close'): col_map[c] = 'Close'
            elif cl == 'volume': col_map[c] = 'Volume'
        df = df.rename(columns=col_map)
        
        if 'High' not in df.columns or 'Close' not in df.columns:
            continue
        
        # Scan for active signals
        signals = scan_higher_high(df, ticker, lookback_bars=args.lookback)
        all_signals.extend(signals)
        
        # Scan for approaching setups
        approaching = scan_approaching(df, ticker)
        if approaching:
            watchlist.append(approaching)
    
    # Sort signals by date (most recent first)
    all_signals.sort(key=lambda s: s['date'], reverse=True)
    watchlist.sort(key=lambda w: w['distance_pct'])
    
    # ── Print Results ──
    print("\n" + "=" * 60)
    if all_signals:
        print(f"  🚨 SIGNALS FOUND: {len(all_signals)}")
        print("=" * 60)
        print()
        print(f"  {'Ticker':<8} {'Date':<12} {'Entry':>8} {'Stop':>8} {'Risk/sh':>8} {'LHs':>4} {'Break%':>7} {'Strength':<8} {'Bars Ago':<8}")
        print(f"  {'─'*8} {'─'*12} {'─'*8} {'─'*8} {'─'*8} {'─'*4} {'─'*7} {'─'*8} {'─'*8}")
        
        for s in all_signals:
            print(f"  {s['ticker']:<8} {s['date']:<12} ${s['entry']:>6.2f} ${s['stop']:>6.2f} ${s['risk_per_share']:>5.2f}  {s['lower_high_count']:>3}  {s['break_pct']:>5.1f}%  {s['strength']:<8} {s['bars_ago']}")
        
        print()
        for s in all_signals:
            print(f"  📐 {s['ticker']}: Broke above ${s['break_level']} (prev swing high) after {s['lower_high_count']} lower highs")
            print(f"     Lower highs: {' → '.join(f'${h}' for h in s['lower_highs'])}")
            print(f"     Entry ${s['entry']} | Stop ${s['stop']} | Risk/share ${s['risk_per_share']}")
            if s['above_ema20']:
                print(f"     ✅ Above EMA20 (stronger)")
            print()
    else:
        print("  ✅ No active Higher High Break signals today.")
        print("=" * 60)
    
    # Watchlist
    if watchlist:
        print(f"\n  ⏳ WATCHLIST — Approaching setups ({len(watchlist)} stocks with 3+ lower highs):")
        print(f"  {'─' * 56}")
        print(f"  {'Ticker':<8} {'Price':>8} {'Break Lvl':>10} {'Dist':>6} {'LHs':>4}")
        print(f"  {'─'*8} {'─'*8} {'─'*10} {'─'*6} {'─'*4}")
        
        for w in watchlist[:20]:  # Top 20 closest to breaking
            print(f"  {w['ticker']:<8} ${w['current_price']:>6.2f} ${w['break_level']:>8.2f} {w['distance_pct']:>5.1f}%  {w['lower_high_count']:>3}")
        
        if len(watchlist) > 20:
            print(f"  ... and {len(watchlist) - 20} more")
    
    # Summary
    print(f"\n  📊 Summary: {len(all_signals)} signals | {len(watchlist)} on watchlist | {len(data)} stocks scanned")
    
    # Save JSON
    if args.json or True:  # Always save
        import json
        output = {
            'scanDate': datetime.now().strftime('%Y-%m-%d %H:%M'),
            'universe': args.universe if not args.tickers else 'custom',
            'stocksScanned': len(data),
            'signals': all_signals,
            'watchlist': watchlist[:30],
            'pattern': {
                'name': 'Higher High Break',
                'description': 'First higher swing high after 3+ consecutive lower swing highs',
                'backtest_stats': '54% WR | 25.3R avg win | PF 12.83 | $4,280/stock avg',
            }
        }
        OUT.parent.mkdir(parents=True, exist_ok=True)
        with open(OUT, 'w') as f:
            json.dump(output, f, indent=2, default=str)
        print(f"\n  💾 Saved to: {OUT}")
    
    print()


if __name__ == '__main__':
    main()
