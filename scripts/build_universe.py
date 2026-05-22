#!/usr/bin/env python3
"""Generate a filtered stock universe: NYSE + NASDAQ + CBOE, price > $2.
Saves to /data/stock_universe.json for use by scanners.

This runs as part of the GitHub Action before scanners execute.
"""
import json
from datetime import datetime
from pathlib import Path

import yfinance as yf
import pandas as pd

OUT = Path(__file__).resolve().parent.parent / "data" / "stock_universe.json"

# Major exchange tickers via yfinance screener
# We'll use a curated approach: download S&P 500 + Nasdaq 100 + Russell 1000 components
# plus popular mid/small caps that are on major exchanges

SP500_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
NASDAQ100_URL = "https://en.wikipedia.org/wiki/Nasdaq-100#Components"
RUSSELL1000_URL = "https://en.wikipedia.org/wiki/Russell_1000_Index"


def get_sp500():
    """Get S&P 500 tickers from Wikipedia."""
    try:
        table = pd.read_html(SP500_URL, header=0)[0]
        tickers = table['Symbol'].str.replace('.', '-', regex=False).tolist()
        exchanges = dict(zip(
            table['Symbol'].str.replace('.', '-', regex=False),
            table.get('Exchange', [''] * len(table))
        ))
        return tickers, exchanges
    except Exception as e:
        print(f"  ⚠ S&P 500 fetch failed: {e}, using hardcoded fallback")
        fallback = [
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
            'PAYX','PCAR','PEP','PFE','PG','PGR','PH','PLTR','PM','PNC','PODD','PSA','PSX',
            'PYPL','QCOM','REGN','ROP','ROST','RTX','SBUX','SCHW','SHW','SLB','SMCI','SNPS',
            'SO','SPG','SPGI','SRE','SYK','SYY','T','TDG','TFC','TGT','TJX','TMO','TMUS',
            'TSLA','TSN','TT','TTD','TXN','TYL','UNH','UNP','UPS','URI','USB','V','VICI','VLO',
            'VRSK','VRTX','VZ','WBA','WDAY','WEC','WELL','WFC','WM','WMT','XEL','XOM','ZTS'
        ]
        return fallback, {}


def get_nasdaq100():
    """Get Nasdaq 100 tickers."""
    try:
        tables = pd.read_html(NASDAQ100_URL, header=0)
        for t in tables:
            if 'Ticker' in t.columns:
                return t['Ticker'].tolist()
            if 'Symbol' in t.columns:
                return t['Symbol'].tolist()
        return []
    except Exception as e:
        print(f"  ⚠ Nasdaq 100 fetch failed: {e}, using fallback")
        return [
            'AAPL','ABNB','ADBE','ADI','ADP','ADSK','AEP','AMAT','AMD','AMGN','AMZN','ANSS','ARM',
            'ASML','AVGO','AZN','BIIB','BKNG','BKR','CCEP','CDNS','CDW','CEG','CHTR','CMCSA','COST',
            'CPRT','CRWD','CSCO','CSGP','CTAS','CTSH','DASH','DDOG','DLTR','DXCM','EA','EXC','FANG',
            'FAST','FTNT','GEHC','GFS','GILD','GOOG','GOOGL','HON','IDXX','ILMN','INTC','INTU','ISRG',
            'KDP','KHC','KLAC','LIN','LRCX','LULU','MAR','MCHP','MDB','MDLZ','MELI','META','MNST',
            'MRVL','MSFT','MU','NFLX','NVDA','NXPI','ODFL','ON','ORLY','PANW','PAYX','PCAR','PDD',
            'PEP','PYPL','QCOM','REGN','ROP','ROST','SBUX','SMCI','SNPS','TEAM','TMUS','TSLA',
            'TTD','TTWO','TXN','VRSK','VRTX','WBD','WDAY','XEL','ZS'
        ]


def get_additional_popular():
    """Additional popular stocks that might not be in S&P500/Nasdaq100 but are actively traded."""
    return [
        # Popular growth/tech mid-caps
        'PLTR','SOFI','HOOD','COIN','MARA','RIOT','RBLX','U','SE','GRAB',
        'SHOP','SNOW','NET','DDOG','MDB','CRWD','ZS','OKTA','TWLO',
        'ROKU','PINS','SNAP','TTD','DOCU','ZM','BILL','HUBS',
        # Popular meme/retail
        'GME','AMC','BB','BBBY','WISH','CLOV','SPCE',
        # EVs & clean energy
        'RIVN','LCID','NIO','XPEV','LI','FSR','QS','CHPT','BLNK',
        'ENPH','FSLR','RUN','PLUG','SEDG',
        # Biotech popular
        'MRNA','BNTX','NVAX',
        # Crypto-adjacent
        'MSTR','COIN','MARA','RIOT','HUT','BITF',
        # Semis
        'SMCI','ARM','MRVL','ON','GFS','WOLF',
        # AI plays
        'AI','BBAI','SOUN','UPST',
        # ETFs we track
        'SPY','QQQ','IWM','DIA','ARKK',
    ]


def filter_by_price_and_exchange(tickers, min_price=2.0):
    """Download current prices and filter: price > $2, major exchange only."""
    print(f"  📥 Checking prices for {len(tickers)} tickers...")
    
    valid = []
    batch_size = 100
    
    for i in range(0, len(tickers), batch_size):
        batch = tickers[i:i+batch_size]
        try:
            df = yf.download(batch, period='1d', interval='1d',
                           group_by='ticker', progress=False, threads=True)
            
            if len(batch) == 1:
                ticker = batch[0]
                if not df.empty:
                    price = df['Close'].iloc[-1] if 'Close' in df.columns else None
                    if price and price > min_price:
                        valid.append({'ticker': ticker, 'price': round(float(price), 2)})
            else:
                for ticker in batch:
                    try:
                        tdf = df[ticker]
                        if tdf is not None and not tdf.empty:
                            close_col = tdf['Close'].dropna()
                            if len(close_col) > 0:
                                price = float(close_col.iloc[-1])
                                if price > min_price:
                                    valid.append({'ticker': ticker, 'price': round(price, 2)})
                    except (KeyError, TypeError, IndexError):
                        pass
        except Exception as e:
            print(f"    ⚠ Batch {i//batch_size + 1} error: {e}")
    
    return valid


def verify_exchange(tickers_with_price):
    """Verify tickers are on major exchanges (NYSE, NASDAQ, CBOE).
    yfinance .info is slow, so we use a heuristic: if it downloaded 
    successfully and has a price > $2, it's almost certainly on a major exchange.
    OTC/pink sheets generally don't appear in yfinance bulk downloads.
    
    For extra safety, we exclude known OTC patterns."""
    
    # Exclude patterns that suggest OTC/foreign
    exclude_suffixes = ['.L', '.TO', '.AX', '.HK', '.T', '.DE', '.F', '.PA']
    exclude_patterns = ['OTCM', 'OTC']
    
    filtered = []
    for item in tickers_with_price:
        ticker = item['ticker']
        if any(ticker.endswith(s) for s in exclude_suffixes):
            continue
        if any(p in ticker for p in exclude_patterns):
            continue
        # Skip very long tickers (often warrants/units)
        if len(ticker) > 5 and not ticker.endswith('-B'):
            continue
        filtered.append(item)
    
    return filtered


def main():
    print("=" * 60)
    print("  📋 BUILDING STOCK UNIVERSE")
    print("=" * 60)
    print(f"  Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"  Filters: NYSE + NASDAQ + CBOE | Price > $2")
    print()
    
    # Collect tickers from all sources
    all_tickers = set()
    
    sp500, _ = get_sp500()
    print(f"  S&P 500: {len(sp500)} tickers")
    all_tickers.update(sp500)
    
    nq100 = get_nasdaq100()
    print(f"  Nasdaq 100: {len(nq100)} tickers")
    all_tickers.update(nq100)
    
    popular = get_additional_popular()
    print(f"  Additional popular: {len(popular)} tickers")
    all_tickers.update(popular)
    
    # Remove duplicates and sort
    all_tickers = sorted(all_tickers)
    print(f"\n  Total unique tickers to check: {len(all_tickers)}")
    
    # Filter by price
    valid = filter_by_price_and_exchange(all_tickers, min_price=2.0)
    print(f"  After price filter (> $2): {len(valid)}")
    
    # Verify exchange
    final = verify_exchange(valid)
    print(f"  After exchange filter: {len(final)}")
    
    # Sort by ticker
    final.sort(key=lambda x: x['ticker'])
    
    # Save
    output = {
        'generatedAt': datetime.now().strftime('%Y-%m-%d %H:%M'),
        'filters': {
            'exchanges': ['NYSE', 'NASDAQ', 'CBOE'],
            'minPrice': 2.0,
            'sources': ['S&P 500', 'Nasdaq 100', 'Popular Mid/Small Caps']
        },
        'count': len(final),
        'tickers': [item['ticker'] for item in final],
        'details': final,
    }
    
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"\n  ✅ Saved {len(final)} stocks to: {OUT}")
    print(f"  📁 File: data/stock_universe.json")
    print()
    
    return final


if __name__ == '__main__':
    main()
