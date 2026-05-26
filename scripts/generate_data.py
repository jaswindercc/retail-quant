#!/usr/bin/env python3
"""Generate backtest JSON data for the React dashboard. Risk = $100 per trade."""
import pandas as pd, numpy as np, json
from pathlib import Path
from backtest_execution import (
    gap_stop_fill_long,
    gap_stop_fill_short,
    calc_pnl_with_costs,
    apply_portfolio_constraints,
)

DATA_DIR = Path("/workspaces/jas/data")
OUT = Path("/workspaces/jas/dashboard/public/data.json")

# Execution-cost controls (configurable)
SLIPPAGE_BPS = 0.0
COMMISSION_PER_SHARE = 0.0
MIN_COMMISSION_PER_ORDER = 0.0

# Portfolio-level constraints (configurable)
PORTFOLIO_START_EQUITY = 100000.0
PORTFOLIO_MAX_POSITIONS = 5
PORTFOLIO_MAX_RISK_PCT = 0.02
PORTFOLIO_MAX_GROSS_EXPOSURE_PCT = 1.5

def load(fp):
    df = pd.read_csv(fp)
    df['Date'] = pd.to_datetime(df['Date'])
    df = df.sort_values('Date').reset_index(drop=True)
    for c in ['Open','High','Low','Close','Volume']:
        df[c] = pd.to_numeric(df[c], errors='coerce')
    return df.dropna(subset=['Open','High','Low','Close'])

def add_ind(df, fast=10, slow=50, tl=20, sma200_len=200):
    df = df.copy()
    df['fSma'] = df['Close'].rolling(fast).mean()
    df['sSma'] = df['Close'].rolling(slow).mean()
    df['sma200'] = df['Close'].rolling(sma200_len).mean()
    df['tr'] = np.maximum(df['High']-df['Low'],
        np.maximum(abs(df['High']-df['Close'].shift(1)), abs(df['Low']-df['Close'].shift(1))))
    df['atr'] = df['tr'].rolling(14).mean()
    df['atr_sma20'] = df['atr'].rolling(20).mean()
    df['tEma'] = df['Close'].ewm(span=tl, adjust=False).mean()
    df['bRng'] = df['High'] - df['Low']
    df['fAbv'] = (df['fSma'] > df['sSma']).astype(int)
    df['xUp'] = (df['fAbv']==1) & (df['fAbv'].shift(1)==0)
    df['xDn'] = (df['fAbv']==0) & (df['fAbv'].shift(1)==1)
    return df

def backtest(df, name):
    RISK = 100.0
    cfg = dict(mdist=3.0, mbar=2.0, sla=1.0, tb=1.0, tsr=2.5, short_tp_r=3.0)
    df = add_ind(df)
    trades = []; pos=0; ep=er=tsl=0.0; lcd=0; bsc=999

    for i in range(1, len(df)):
        r = df.iloc[i]; atr = r['atr']
        if pd.isna(atr) or atr<=0: continue
        if r['xUp']: lcd=1; bsc=0
        elif r['xDn']: lcd=-1; bsc=0
        else: bsc+=1

        if pos!=0:
            hsl=False; xp=0.0; reason=''
            if pos==1:
                # LONG: trailing stop (same as before)
                if r['Low']<=tsl: xp=gap_stop_fill_long(r['Open'], tsl); hsl=True; reason='SL'
                if not hsl:
                    cr=(r['Close']-ep)/er if er>0 else 0
                    if cr>=cfg['tsr']:
                        et=r['tEma']-cfg['tb']*atr
                        if et>tsl: tsl=et
            else:
                # SHORT: fixed TP at short_tp_r, stop loss only (no trailing)
                tp_price = ep - cfg['short_tp_r'] * er
                if r['High']>=tsl:
                    xp=gap_stop_fill_short(r['Open'], tsl); hsl=True; reason='SL'
                elif r['Low']<=tp_price:
                    xp=tp_price; hsl=True; reason='TP'
            if hsl:
                t=trades[-1]
                t['exitDate']=r['Date'].strftime('%Y-%m-%d')
                t['exitPrice']=round(xp,2)
                pnl = calc_pnl_with_costs(
                    direction='LONG' if pos==1 else 'SHORT',
                    entry_price=ep,
                    exit_price=xp,
                    qty=t['qty'],
                    slippage_bps=SLIPPAGE_BPS,
                    commission_per_share=COMMISSION_PER_SHARE,
                    min_commission_per_order=MIN_COMMISSION_PER_ORDER,
                )
                pnl_r=(pnl['netPnl']/RISK) if er>0 else 0
                t['pnlR']=round(pnl_r,2)
                t['pnlDollar']=round(pnl['netPnl'],2)
                t['grossPnlDollar']=round(pnl['grossPnl'],2)
                t['costsDollar']=round(pnl['costs'],2)
                t['entryFill']=round(pnl['entryFill'],4)
                t['exitFill']=round(pnl['exitFill'],4)
                t['exitReason']=reason if reason else ('SL' if pnl_r<=0 else 'Trail')
                ed=pd.to_datetime(t['entryDate']); xd=r['Date']
                t['durationDays']=int((xd-ed).days)
                pos=0

        if pos==0:
            xl=(lcd==1 and bsc==0); xs=(lcd==-1 and bsc==0)
            dok=abs(r['Close']-r['fSma'])<=cfg['mdist']*atr
            bok=r['bRng']<=cfg['mbar']*atr
            # SHORT: must also be below SMA200 + ATR contracting
            sma200_ok = not pd.isna(r['sma200']) and r['Close'] < r['sma200']
            atr_ok = not pd.isna(r['atr_sma20']) and r['atr'] < r['atr_sma20']
            if dok and bok and xl:
                sl=r['Close']-cfg['sla']*atr; rk=r['Close']-sl
                qty=max(1,round(RISK/rk)) if rk>0 else 1
                pos=1; ep=r['Close']; er=rk; tsl=sl
                trades.append({'stock':name,'dir':'LONG','entryDate':r['Date'].strftime('%Y-%m-%d'),
                    'entryPrice':round(r['Close'],2),'sl':round(sl,2),'risk':round(rk,2),
                    'qty':qty,'exitDate':'','exitPrice':0,'pnlR':0,'pnlDollar':0,
                    'exitReason':'','durationDays':0})
            elif dok and bok and xs and sma200_ok and atr_ok:
                sl=r['Close']+cfg['sla']*atr; rk=sl-r['Close']
                qty=max(1,round(RISK/rk)) if rk>0 else 1
                pos=-1; ep=r['Close']; er=rk; tsl=sl
                trades.append({'stock':name,'dir':'SHORT','entryDate':r['Date'].strftime('%Y-%m-%d'),
                    'entryPrice':round(r['Close'],2),'sl':round(sl,2),'risk':round(rk,2),
                    'qty':qty,'exitDate':'','exitPrice':0,'pnlR':0,'pnlDollar':0,
                    'exitReason':'','durationDays':0})

    if pos!=0 and trades:
        t=trades[-1]; l=df.iloc[-1]
        t['exitDate']=l['Date'].strftime('%Y-%m-%d')
        t['exitPrice']=round(l['Close'],2)
        pnl = calc_pnl_with_costs(
            direction='LONG' if pos==1 else 'SHORT',
            entry_price=ep,
            exit_price=l['Close'],
            qty=t['qty'],
            slippage_bps=SLIPPAGE_BPS,
            commission_per_share=COMMISSION_PER_SHARE,
            min_commission_per_order=MIN_COMMISSION_PER_ORDER,
        )
        pnl_r=(pnl['netPnl']/RISK) if er>0 else 0
        t['pnlR']=round(pnl_r,2); t['pnlDollar']=round(pnl_r*RISK,2)
        t['pnlDollar']=round(pnl['netPnl'],2)
        t['grossPnlDollar']=round(pnl['grossPnl'],2)
        t['costsDollar']=round(pnl['costs'],2)
        t['entryFill']=round(pnl['entryFill'],4)
        t['exitFill']=round(pnl['exitFill'],4)
        t['exitReason']='Open'
        ed=pd.to_datetime(t['entryDate'])
        t['durationDays']=int((l['Date']-ed).days)

    # Price series for charts
    prices = []
    for _, row in df.iterrows():
        if pd.notna(row['fSma']) and pd.notna(row['sSma']):
            prices.append({
                'date': row['Date'].strftime('%Y-%m-%d'),
                'close': round(row['Close'],2),
                'fSma': round(row['fSma'],2),
                'sSma': round(row['sSma'],2)
            })
    return trades, prices

# Run
all_data = {'stocks': {}, 'allTrades': [], 'settings': {
    'fastSma': 10, 'slowSma': 50, 'slAtrMult': 1.0,
    'trailEmaLen': 20, 'trailAtrBuf': 1.0, 'trailStartR': 2.5,
    'maxBarAtr': 2.0, 'maxDistAtr': 3.0, 'riskPerTrade': 100,
    'shortSma200': 200, 'shortTpR': 3.0, 'shortAtrSma': 20,
    'strategy': 'Trend Rider v1'
}}

for f in sorted(DATA_DIR.glob("*.csv")):
    name = f.stem.replace("_daily_data - Sheet1","").replace("_data","").upper()
    trades, prices = backtest(load(f), name)
    all_data['stocks'][name] = {'trades': trades, 'prices': prices}
    all_data['allTrades'].extend(trades)
    print(f"{name}: {len(trades)} trades, {len(prices)} price bars")

# Sort all trades by date
all_data['allTrades'].sort(key=lambda t: t['entryDate'])

# Apply portfolio-level constraints on aggregate trade stream
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
print(f"\nWritten {OUT} ({OUT.stat().st_size//1024}KB)")
