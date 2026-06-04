#!/usr/bin/env python3
"""
Dynamic Universe Scanner: Pull current stocks by market cap, rank by 3mo momentum.

This generates the LIVE watchlist for the rotation scanner.
Unlike the backtest (which uses a fixed pool for honesty), this pulls
the ACTUAL current universe by market cap threshold.

Outputs: rotation_live_data.json with current top-10 per universe.
"""

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

# ── Market cap thresholds ──
UNIVERSES = {
    'mega': {'min_cap': 200e9, 'label': 'Mega-Cap ($200B+)'},
    'large': {'min_cap': 50e9, 'max_cap': 200e9, 'label': 'Large-Cap ($50B–$200B)'},
    'mid': {'min_cap': 10e9, 'max_cap': 50e9, 'label': 'Mid-Cap ($10B–$50B)'},
}

TOP_N = 10

# Broad screen: all US stocks that COULD be in these universes
# We use a wide net of ~300 liquid US stocks and filter by actual market cap
SCREEN_POOL = [
    # Mega-cap likely (top ~50 US by market cap)
    'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'BRK-B', 'AVGO', 'JPM',
    'LLY', 'V', 'UNH', 'MA', 'XOM', 'JNJ', 'COST', 'HD', 'PG', 'ABBV',
    'WMT', 'NFLX', 'CRM', 'BAC', 'ORCL', 'CVX', 'MRK', 'KO', 'PEP', 'AMD',
    'TMO', 'LIN', 'ADBE', 'MCD', 'CSCO', 'ACN', 'ABT', 'WFC', 'TXN', 'PM',
    'GE', 'IBM', 'INTU', 'ISRG', 'CAT', 'QCOM', 'VZ', 'AMGN', 'NOW', 'AXP',
    'MS', 'GS', 'RTX', 'NEE', 'LOW', 'BKNG', 'T', 'BLK', 'PFE', 'UNP',
    'SPGI', 'DE', 'AMAT', 'SCHW', 'SYK', 'BA', 'COP', 'LMT', 'CB', 'MDLZ',
    'GILD', 'ADI', 'MMC', 'VRTX', 'ADP', 'TJX', 'MO', 'CI', 'BMY', 'SO',
    'DUK', 'CME', 'REGN', 'PLD', 'CL', 'PYPL', 'SNPS', 'CDNS', 'ICE', 'FI',
    'EOG', 'SLB', 'PANW', 'CRWD', 'ABNB', 'KLAC', 'LRCX', 'MRVL', 'MU',
    
    # Large-cap / upper-mid (likely $50B-$200B)
    'INTC', 'DELL', 'ARM', 'ON', 'ANET', 'FTNT', 'WDAY', 'ADSK', 'TEAM',
    'DDOG', 'ZS', 'SNOW', 'NET', 'HUBS', 'TTD', 'COIN', 'UBER', 'SHOP', 'SQ',
    'MELI', 'SE', 'PLTR', 'DASH', 'RBLX', 'U', 'SNAP', 'ROKU', 'PINS',
    'WDC', 'STX', 'SMCI', 'NXPI', 'SWKS', 'MCHP', 'TER', 'MPWR',
    'EA', 'TTWO', 'RBLX', 'SPOT', 'LYV', 'MAR', 'HLT', 'RCL', 'CCL',
    'GM', 'F', 'RIVN', 'LCID', 'NIO', 'LI', 'XPEV',
    'ENPH', 'SEDG', 'FSLR', 'RUN', 'TAN',
    'GEV', 'VST', 'CEG', 'OKLO', 'SMR', 'NNE',
    'SOFI', 'AFRM', 'HOOD', 'FOUR',
    'DKNG', 'PENN', 'CHWY', 'ETSY', 'W', 'PTON',
    'ZM', 'DOCU', 'TWLO', 'OKTA', 'MDB', 'ESTC', 'BILL', 'PAYC',
    'PLUG', 'FCEL', 'BE', 'BLNK', 'SPCE', 'BYND', 'FSLY',
    'CRSP', 'NTLA', 'BEAM', 'EDIT', 'DXCM', 'ILMN',
    'CAT', 'HON', 'MMM', 'ITW', 'EMR', 'ROK',
    'NKE', 'LULU', 'DECK', 'BIRD',
    
    # Additional tickers that might be mega now
    'SNDK', 'WBD', 'PARA', 'DIS', 'CMCSA', 'TMUS', 'CHTR',
    'USB', 'PNC', 'TFC', 'C', 'SCHW',
    'AMT', 'CCI', 'EQIX', 'PSA', 'O',
    'APD', 'ECL', 'SHW', 'DD',
    'UPS', 'FDX', 'CSX', 'NSC',
    'DHR', 'A', 'IQV', 'ZTS', 'EW',
    'MCK', 'HCA', 'ELV', 'CVS', 'HUM',
    'AIG', 'MET', 'PRU', 'ALL', 'TRV',
    'CARR', 'OC', 'JCI', 'TRANE',
]

# Remove duplicates
SCREEN_POOL = list(dict.fromkeys(SCREEN_POOL))


def get_market_caps(tickers):
    """Get current market caps for all tickers."""
    print(f"  📥 Fetching market caps for {len(tickers)} stocks...")
    caps = {}
    # Process in batches
    batch_size = 50
    for i in range(0, len(tickers), batch_size):
        batch = tickers[i:i+batch_size]
        try:
            tickers_str = ' '.join(batch)
            data = yf.Tickers(tickers_str)
            for ticker in batch:
                try:
                    info = data.tickers[ticker].info
                    cap = info.get('marketCap', 0)
                    if cap and cap > 0:
                        caps[ticker] = cap
                except Exception:
                    pass
        except Exception:
            pass
        print(f"    ... processed {min(i+batch_size, len(tickers))}/{len(tickers)}")
    
    print(f"  ✅ Got market caps for {len(caps)} stocks")
    return caps


def get_momentum(tickers, lookback_days=63):
    """Get 3-month return for each ticker."""
    print(f"  📊 Computing 3-month momentum for {len(tickers)} stocks...")
    end = datetime.now()
    start = end - timedelta(days=120)  # ~4 months calendar to get 63 trading days
    
    df = yf.download(tickers, start=start.strftime('%Y-%m-%d'),
                     end=end.strftime('%Y-%m-%d'),
                     interval='1d', group_by='ticker', progress=False,
                     threads=True, auto_adjust=True)
    
    momentum = {}
    for ticker in tickers:
        try:
            if isinstance(df.columns, pd.MultiIndex):
                tdf = df[ticker].dropna(how='all')
            else:
                tdf = df.dropna(how='all')
            
            # Find Close column (handles various capitalizations)
            close_col = None
            for c in tdf.columns:
                if c.lower().strip() in ('close', 'adj close'):
                    close_col = c
                    break
            if close_col is None:
                continue
                
            closes = tdf[close_col].dropna()
            if len(closes) < lookback_days:
                continue
            
            ret_3m = closes.iloc[-1] / closes.iloc[-lookback_days] - 1
            if not np.isnan(ret_3m):
                momentum[ticker] = {
                    'return_3m': round(ret_3m * 100, 2),
                    'price': round(float(closes.iloc[-1]), 2),
                    'price_3m_ago': round(float(closes.iloc[-lookback_days]), 2),
                }
        except (KeyError, TypeError, IndexError):
            pass
    
    print(f"  ✅ Got momentum for {len(momentum)} stocks")
    return momentum


def classify_by_cap(caps, momentum):
    """Classify stocks into universes and rank by momentum."""
    results = {}
    
    for universe_name, config in UNIVERSES.items():
        min_cap = config['min_cap']
        max_cap = config.get('max_cap', float('inf'))
        
        # Filter by market cap
        eligible = []
        for ticker, cap in caps.items():
            if min_cap <= cap < max_cap and ticker in momentum:
                eligible.append({
                    'ticker': ticker,
                    'market_cap': cap,
                    'market_cap_B': round(cap / 1e9, 1),
                    **momentum[ticker],
                })
        
        # Sort by 3-month return (descending)
        eligible.sort(key=lambda x: x['return_3m'], reverse=True)
        
        results[universe_name] = {
            'label': config['label'],
            'total_stocks': len(eligible),
            'all_ranked': eligible,
            'top_10': eligible[:TOP_N],
        }
    
    return results


def get_news_for_top_stocks(results):
    """Fetch recent news headlines for top 10 stocks in each universe."""
    all_top_tickers = set()
    for data in results.values():
        for stock in data['top_10']:
            all_top_tickers.add(stock['ticker'])
    
    print(f"  📰 Fetching news for {len(all_top_tickers)} top stocks...")
    news_map = {}
    
    for ticker in all_top_tickers:
        try:
            t = yf.Ticker(ticker)
            articles = t.news or []
            headlines = []
            for article in articles[:3]:
                content = article.get('content', {})
                title = content.get('title', '')
                summary = content.get('summary', '')
                pub_date = content.get('pubDate', '')[:10]
                if title:
                    headlines.append({
                        'title': title,
                        'summary': summary[:150] if summary else '',
                        'date': pub_date,
                    })
            if headlines:
                news_map[ticker] = headlines
        except Exception:
            pass
    
    print(f"  ✅ Got news for {len(news_map)} stocks")
    return news_map


def main():
    print("🚀 Dynamic Universe Scanner — Live Market Cap + 3-Month Momentum Ranking")
    print(f"   Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print()
    
    # Step 1: Get market caps
    caps = get_market_caps(SCREEN_POOL)
    
    # Step 2: Get momentum for stocks with valid market caps
    valid_tickers = list(caps.keys())
    momentum = get_momentum(valid_tickers)
    
    # Step 3: Classify and rank
    results = classify_by_cap(caps, momentum)
    
    # Step 4: Fetch news for top stocks
    news_map = get_news_for_top_stocks(results)
    
    # Attach news to top 10 stocks
    for data in results.values():
        for stock in data['top_10']:
            stock['news'] = news_map.get(stock['ticker'], [])
    
    # Print results
    for name, data in results.items():
        print(f"\n{'='*60}")
        print(f"  {data['label']} — {data['total_stocks']} qualifying stocks")
        print(f"{'='*60}")
        print(f"  {'Rank':<5} {'Ticker':<8} {'3mo Return':<12} {'Price':<10} {'Mkt Cap':<10}")
        print(f"  {'-'*50}")
        for i, stock in enumerate(data['top_10'], 1):
            print(f"  {i:<5} {stock['ticker']:<8} {stock['return_3m']:>+7.1f}%    ${stock['price']:<8.2f} ${stock['market_cap_B']:.0f}B")
        
        if len(data['all_ranked']) > 10:
            print(f"\n  ... and {len(data['all_ranked']) - 10} more stocks in this universe")
    
    # Save output
    output = {
        'lastUpdated': datetime.now().strftime('%Y-%m-%d %H:%M'),
        'rotation_freq': 'weekly',
        'lookback': '3 months',
        'universes': {}
    }
    
    for name, data in results.items():
        output['universes'][name] = {
            'label': data['label'],
            'total_stocks': data['total_stocks'],
            'top_10': data['top_10'],
            'all_ranked': data['all_ranked'],
        }
    
    out_path = Path(__file__).resolve().parent.parent / 'dashboard' / 'public' / 'rotation_live_data.json'
    with open(out_path, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"\n  💾 Saved to {out_path}")
    print("\n✅ Done!")


if __name__ == '__main__':
    main()
