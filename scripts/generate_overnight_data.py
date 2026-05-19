#!/usr/bin/env python3
"""
SPX OVERNIGHT Strategy — Predictive Model Backtest Generator
==============================================================
Uses SPY as SPX proxy + VIX data to predict next-day close direction.

Concept:
  - Enter at today's close (~3:30pm), exit at tomorrow's close
  - Multi-factor scoring model predicts UP or DOWN
  - Only trade when score exceeds confidence threshold

Predictive Factors (research-backed overnight edge):
  ┌─────────────────────────────────────────────────────────────────┐
  │ BULLISH FACTORS (each +1 to score):                             │
  │  1. VIX elevated: VIX > VIX_SMA(20)  (fear = buying opp)       │
  │  2. VIX spike: VIX rose >10% today   (panic → mean revert)     │
  │  3. SPY oversold: RSI(5) < 30        (short-term bounce)        │
  │  4. Consec down: 2+ down closes      (mean reversion)           │
  │  5. Uptrend: SPY > SMA(50)           (regime bullish bias)      │
  │  6. Selling exhaustion: close in bottom 25% of range            │
  │  7. Dip in trend: SPY down >1% today but > SMA(200)            │
  │  8. Breadth: VIX > 25 absolute       (high fear = bounce)       │
  ├─────────────────────────────────────────────────────────────────┤
  │ BEARISH FACTORS (each -1 to score):                             │
  │  1. Complacency: VIX < VIX_SMA(20)*0.85 (too calm)             │
  │  2. Overbought: RSI(5) > 80          (short-term stretched)     │
  │  3. Extended up: 4+ up closes AND RSI(14)>70                    │
  │  4. Downtrend: SPY < SMA(200)        (bear regime)              │
  │  5. VIX crush: VIX dropped >15% today (relief rally exhausted)  │
  │  6. Big up day: SPY up >2% today     (overextended)             │
  │  7. Distribution: close top 20% + volume > 1.5× avg             │
  └─────────────────────────────────────────────────────────────────┘

Trade Rules:
  - Score >= +2 → LONG (buy at close, sell tomorrow close)
  - Score <= -2 → SHORT (sell at close, cover tomorrow close)
  - |Score| < 2 → NO TRADE (insufficient conviction)
  
Risk Management:
  - $100 risk per trade
  - Risk distance = 0.5 × ATR(14)  (expected overnight range)
  - Position size: qty = $100 / risk_distance
  - P&L = qty × (exit - entry) for longs, qty × (entry - exit) for shorts
  - No intraday stop (hold to next close), but cap loss at 2R for risk calcs
"""

import pandas as pd, numpy as np, json
from pathlib import Path

DATA_DIR = Path("/workspaces/jas/data")
OUT = Path("/workspaces/jas/dashboard/public/overnight_data.json")
RISK = 100.0

# Parameters
RISK_ATR_MULT = 0.5     # Risk distance = 0.5 × ATR
MIN_SCORE_LONG = 3      # Minimum score to go long (higher = more selective)
MIN_SCORE_SHORT = -3    # Maximum score to go short
RSI_SHORT_LEN = 5       # Short-term RSI for mean-reversion signals
RSI_LONG_LEN = 14       # Longer RSI for regime detection
VIX_SMA_LEN = 20        # VIX moving average length
SPY_SMA50_LEN = 50
SPY_SMA200_LEN = 200
VOL_SMA_LEN = 20


def load(fp):
    df = pd.read_csv(fp)
    df['Date'] = pd.to_datetime(df['Date'])
    df = df.sort_values('Date').reset_index(drop=True)
    for c in ['Open', 'High', 'Low', 'Close', 'Volume']:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors='coerce')
    return df.dropna(subset=['Open', 'High', 'Low', 'Close'])


def compute_rsi(series, length):
    """Compute RSI using Wilder's smoothing (EWM)."""
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1/length, min_periods=length, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/length, min_periods=length, adjust=False).mean()
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def prepare_spy(df):
    """Add all indicators to SPY data."""
    df = df.copy()
    df['sma50'] = df['Close'].rolling(SPY_SMA50_LEN).mean()
    df['sma200'] = df['Close'].rolling(SPY_SMA200_LEN).mean()
    df['ema20'] = df['Close'].ewm(span=20, adjust=False).mean()
    
    # ATR
    tr = np.maximum(df['High'] - df['Low'],
        np.maximum(abs(df['High'] - df['Close'].shift(1)),
                   abs(df['Low'] - df['Close'].shift(1))))
    df['atr'] = tr.rolling(14).mean()
    
    # RSI
    df['rsi5'] = compute_rsi(df['Close'], RSI_SHORT_LEN)
    df['rsi14'] = compute_rsi(df['Close'], RSI_LONG_LEN)
    
    # Bollinger Bands (for reference)
    df['bb_mid'] = df['Close'].rolling(20).mean()
    df['bb_std'] = df['Close'].rolling(20).std()
    df['bb_upper'] = df['bb_mid'] + 2 * df['bb_std']
    df['bb_lower'] = df['bb_mid'] - 2 * df['bb_std']
    
    # Daily return
    df['daily_ret'] = df['Close'].pct_change()
    
    # Consecutive up/down days
    df['up_day'] = (df['Close'] > df['Close'].shift(1)).astype(int)
    df['dn_day'] = (df['Close'] < df['Close'].shift(1)).astype(int)
    
    # Volume average
    df['vol_sma'] = df['Volume'].rolling(VOL_SMA_LEN).mean()
    
    # Range position: where close sits within today's range (0=low, 1=high)
    rng = df['High'] - df['Low']
    df['range_pos'] = np.where(rng > 0, (df['Close'] - df['Low']) / rng, 0.5)
    
    # For charts
    df['fSma'] = df['ema20']
    df['sSma'] = df['sma50']
    
    return df


def prepare_vix(df):
    """Add indicators to VIX data."""
    df = df.copy()
    df['vix_sma20'] = df['Close'].rolling(VIX_SMA_LEN).mean()
    df['vix_change'] = df['Close'].pct_change()
    df['vix_sma50'] = df['Close'].rolling(50).mean()
    return df


def count_consecutive(series, direction='down'):
    """Count consecutive up or down days ending at each bar."""
    counts = pd.Series(0, index=series.index)
    for i in range(1, len(series)):
        if direction == 'down':
            if series.iloc[i] < series.iloc[i-1]:
                counts.iloc[i] = counts.iloc[i-1] + 1
            else:
                counts.iloc[i] = 0
        else:
            if series.iloc[i] > series.iloc[i-1]:
                counts.iloc[i] = counts.iloc[i-1] + 1
            else:
                counts.iloc[i] = 0
    return counts


def compute_signal_score(spy_row, vix_row, consec_dn, consec_up):
    """
    Compute the WEIGHTED composite prediction score for today.
    Positive = predict UP tomorrow, Negative = predict DOWN tomorrow.
    
    Weights: Strong signals = ±2, Standard signals = ±1
    Higher threshold needed = more selective = better quality trades.
    """
    score = 0
    reasons_bull = []
    reasons_bear = []
    
    # ═══════════════════════════════════════════════════════════
    # STRONG BULLISH FACTORS (+2 each)
    # These are high-conviction mean-reversion signals
    # ═══════════════════════════════════════════════════════════
    
    # VIX panic spike >12% today → strong mean reversion signal
    if not pd.isna(vix_row['vix_change']) and vix_row['vix_change'] > 0.12:
        score += 2
        reasons_bull.append('VIX_panic(+2)')
    
    # Extreme oversold: RSI(5) < 20
    if not pd.isna(spy_row['rsi5']) and spy_row['rsi5'] < 20:
        score += 2
        reasons_bull.append('RSI5<20(+2)')
    
    # Crash dip: SPY down >2% today but above SMA200 (extreme dip buy)
    if (not pd.isna(spy_row['daily_ret']) and spy_row['daily_ret'] < -0.02
            and not pd.isna(spy_row['sma200']) and spy_row['Close'] > spy_row['sma200']):
        score += 2
        reasons_bull.append('crash_dip(+2)')
    
    # ═══════════════════════════════════════════════════════════
    # STANDARD BULLISH FACTORS (+1 each)
    # ═══════════════════════════════════════════════════════════
    
    # VIX elevated above its SMA (fear environment)
    if not pd.isna(vix_row['vix_sma20']) and vix_row['Close'] > vix_row['vix_sma20']:
        score += 1
        reasons_bull.append('VIX>SMA20')
    
    # Moderately oversold: RSI(5) 20-35 (only if not already counted above)
    if not pd.isna(spy_row['rsi5']) and 20 <= spy_row['rsi5'] < 35:
        score += 1
        reasons_bull.append('RSI5<35')
    
    # 3+ consecutive down days (strong mean reversion)
    if consec_dn >= 3:
        score += 1
        reasons_bull.append(f'{consec_dn}dn_days')
    
    # Selling exhaustion: close in bottom 20% of today's range
    if spy_row['range_pos'] < 0.20:
        score += 1
        reasons_bull.append('close_near_low')
    
    # Dip in uptrend: SPY fell >1% today but still above SMA200
    if (not pd.isna(spy_row['daily_ret']) and -0.02 <= spy_row['daily_ret'] < -0.01
            and not pd.isna(spy_row['sma200']) and spy_row['Close'] > spy_row['sma200']):
        score += 1
        reasons_bull.append('dip_in_uptrend')
    
    # VIX > 25 absolute (elevated fear regime)
    if vix_row['Close'] > 25:
        score += 1
        reasons_bull.append('VIX>25')
    
    # Bull regime: above SMA200 (structural uptrend — weaker signal)
    if not pd.isna(spy_row['sma200']) and spy_row['Close'] > spy_row['sma200']:
        score += 1
        reasons_bull.append('above_SMA200')
    
    # ═══════════════════════════════════════════════════════════
    # STRONG BEARISH FACTORS (-2 each)
    # ═══════════════════════════════════════════════════════════
    
    # Extreme overbought: RSI(5) > 90
    if not pd.isna(spy_row['rsi5']) and spy_row['rsi5'] > 90:
        score -= 2
        reasons_bear.append('RSI5>90(-2)')
    
    # Massive up day > 3% (extremely overextended)
    if not pd.isna(spy_row['daily_ret']) and spy_row['daily_ret'] > 0.03:
        score -= 2
        reasons_bear.append('huge_rally(-2)')
    
    # VIX crushed > 20% in one day (extreme complacency event)
    if not pd.isna(vix_row['vix_change']) and vix_row['vix_change'] < -0.20:
        score -= 2
        reasons_bear.append('VIX_crushed(-2)')
    
    # ═══════════════════════════════════════════════════════════
    # STANDARD BEARISH FACTORS (-1 each)
    # ═══════════════════════════════════════════════════════════
    
    # Complacency: VIX well below its SMA
    if not pd.isna(vix_row['vix_sma20']) and vix_row['Close'] < vix_row['vix_sma20'] * 0.85:
        score -= 1
        reasons_bear.append('VIX_complacent')
    
    # Overbought: RSI(5) 75-90 (only if not counted above)
    if not pd.isna(spy_row['rsi5']) and 75 <= spy_row['rsi5'] < 90:
        score -= 1
        reasons_bear.append('RSI5>75')
    
    # Extended up: 4+ consecutive up days AND RSI14 > 65
    if consec_up >= 4 and not pd.isna(spy_row['rsi14']) and spy_row['rsi14'] > 65:
        score -= 1
        reasons_bear.append('extended_up')
    
    # Bear regime: SPY below SMA200
    if not pd.isna(spy_row['sma200']) and spy_row['Close'] < spy_row['sma200']:
        score -= 1
        reasons_bear.append('below_SMA200')
    
    # VIX crushed >10% (relief rally may be done) - only if not counted above
    if (not pd.isna(vix_row['vix_change']) and -0.20 <= vix_row['vix_change'] < -0.10):
        score -= 1
        reasons_bear.append('VIX_drop')
    
    # Big up day: SPY rallied >1.5% (overextended)
    if not pd.isna(spy_row['daily_ret']) and 0.015 < spy_row['daily_ret'] <= 0.03:
        score -= 1
        reasons_bear.append('big_up_day')
    
    # Distribution: close in top 15% of range + high volume
    if (spy_row['range_pos'] > 0.85
            and not pd.isna(spy_row['vol_sma'])
            and spy_row['vol_sma'] > 0
            and spy_row['Volume'] > 1.5 * spy_row['vol_sma']):
        score -= 1
        reasons_bear.append('distribution')
    
    return score, reasons_bull, reasons_bear


def backtest_overnight(spy_df, vix_df):
    """Run the overnight prediction strategy."""
    spy = prepare_spy(spy_df)
    vix = prepare_vix(vix_df)
    
    # Align dates: merge SPY and VIX on date (date only, strip time)
    spy['date_only'] = spy['Date'].dt.date
    vix['date_only'] = vix['Date'].dt.date
    
    # Create merged dataframe
    merged = spy.merge(vix[['date_only', 'Close', 'vix_sma20', 'vix_change', 'vix_sma50']],
                       on='date_only', how='inner', suffixes=('', '_vix'))
    merged = merged.sort_values('Date').reset_index(drop=True)
    
    # Compute consecutive days on merged data
    consec_dn = count_consecutive(merged['Close'], 'down')
    consec_up = count_consecutive(merged['Close'], 'up')
    
    trades = []
    scores_history = []
    
    for i in range(1, len(merged) - 1):  # Need next day for exit
        row = merged.iloc[i]
        atr = row['atr']
        
        # Skip if indicators not ready
        if pd.isna(atr) or atr <= 0 or pd.isna(row['sma50']) or pd.isna(row['rsi5']):
            continue
        if pd.isna(row['vix_sma20']):
            continue
        
        # Build VIX row dict
        vix_row = {
            'Close': row['Close_vix'],
            'vix_sma20': row['vix_sma20'],
            'vix_change': row['vix_change'],
        }
        
        # Compute signal score
        score, reasons_bull, reasons_bear = compute_signal_score(
            row, vix_row, int(consec_dn.iloc[i]), int(consec_up.iloc[i])
        )
        
        # Record score for analysis
        scores_history.append({
            'date': row['Date'].strftime('%Y-%m-%d'),
            'score': score,
            'close': round(row['Close'], 2),
            'vix': round(row['Close_vix'], 2),
        })
        
        # ─── Trade decision ───
        direction = None
        if score >= MIN_SCORE_LONG:
            direction = 'LONG'
        elif score <= MIN_SCORE_SHORT:
            direction = 'SHORT'
        else:
            continue  # No trade — insufficient conviction
        
        # Entry at today's close, exit at tomorrow's close
        entry_price = row['Close']
        next_row = merged.iloc[i + 1]
        exit_price = next_row['Close']
        
        # Risk distance = 0.5 × ATR
        risk_dist = RISK_ATR_MULT * atr
        if risk_dist <= 0:
            continue
        qty = max(1, round(RISK / risk_dist))
        
        # PnL
        if direction == 'LONG':
            pnl_dollar = qty * (exit_price - entry_price)
        else:
            pnl_dollar = qty * (entry_price - exit_price)
        
        pnl_r = pnl_dollar / RISK  # R-multiple (relative to $100 risk)
        
        # Stop level (theoretical — not enforced intraday with daily data)
        if direction == 'LONG':
            sl = entry_price - risk_dist
        else:
            sl = entry_price + risk_dist
        
        trades.append({
            'stock': 'SPY',
            'dir': direction,
            'entryDate': row['Date'].strftime('%Y-%m-%d'),
            'entryPrice': round(entry_price, 2),
            'exitDate': next_row['Date'].strftime('%Y-%m-%d'),
            'exitPrice': round(exit_price, 2),
            'sl': round(sl, 2),
            'risk': round(risk_dist, 2),
            'qty': qty,
            'pnlR': round(pnl_r, 2),
            'pnlDollar': round(pnl_dollar, 2),
            'exitReason': 'Close',
            'durationDays': 1,
            'score': score,
            'reasonsBull': reasons_bull,
            'reasonsBear': reasons_bear,
        })
    
    # Price series for chart
    prices = []
    for _, row in merged.iterrows():
        if pd.notna(row['fSma']) and pd.notna(row['sSma']):
            prices.append({
                'date': row['Date'].strftime('%Y-%m-%d'),
                'close': round(row['Close'], 2),
                'fSma': round(row['fSma'], 2),
                'sSma': round(row['sSma'], 2),
                'vix': round(row['Close_vix'], 2),
            })
    
    return trades, prices, scores_history


# ══════════════════════════════════════════════════════════════
# MAIN EXECUTION
# ══════════════════════════════════════════════════════════════

print("Loading SPX and VIX data...")
spy_df = load(DATA_DIR / "SPX_daily_data_right - Sheet1.csv")
vix_df = load(DATA_DIR / "VIX_daily_data_right - Sheet1.csv")
print(f"  SPX: {len(spy_df)} bars ({spy_df['Date'].min().strftime('%Y-%m-%d')} to {spy_df['Date'].max().strftime('%Y-%m-%d')})")
print(f"  VIX: {len(vix_df)} bars ({vix_df['Date'].min().strftime('%Y-%m-%d')} to {vix_df['Date'].max().strftime('%Y-%m-%d')})")

print("\nRunning overnight prediction backtest...")
trades, prices, scores = backtest_overnight(spy_df, vix_df)

# Compute summary stats
if trades:
    closed = [t for t in trades if t['exitDate']]
    longs = [t for t in closed if t['dir'] == 'LONG']
    shorts = [t for t in closed if t['dir'] == 'SHORT']
    wins = [t for t in closed if t['pnlDollar'] > 0]
    losses = [t for t in closed if t['pnlDollar'] <= 0]
    
    total_pnl = sum(t['pnlDollar'] for t in closed)
    win_rate = len(wins) / len(closed) * 100 if closed else 0
    avg_r = sum(t['pnlR'] for t in closed) / len(closed) if closed else 0
    
    long_wins = [t for t in longs if t['pnlDollar'] > 0]
    short_wins = [t for t in shorts if t['pnlDollar'] > 0]
    long_wr = len(long_wins) / len(longs) * 100 if longs else 0
    short_wr = len(short_wins) / len(shorts) * 100 if shorts else 0
    
    gross_profit = sum(t['pnlDollar'] for t in wins)
    gross_loss = abs(sum(t['pnlDollar'] for t in losses))
    pf = round(gross_profit / gross_loss, 2) if gross_loss > 0 else float('inf')
    
    # Score distribution analysis
    score_counts = {}
    for t in closed:
        s = t['score']
        score_counts[s] = score_counts.get(s, 0) + 1
    
    # Win rate by score
    score_wr = {}
    for s in sorted(set(t['score'] for t in closed)):
        s_trades = [t for t in closed if t['score'] == s]
        s_wins = [t for t in s_trades if t['pnlDollar'] > 0]
        score_wr[s] = {
            'trades': len(s_trades),
            'winRate': round(len(s_wins) / len(s_trades) * 100, 1) if s_trades else 0,
            'avgR': round(sum(t['pnlR'] for t in s_trades) / len(s_trades), 2),
            'totalPnl': round(sum(t['pnlDollar'] for t in s_trades), 2),
        }
    
    print(f"\n{'='*60}")
    print(f"SPX OVERNIGHT RESULTS")
    print(f"{'='*60}")
    print(f"  Total trades:  {len(closed)}")
    print(f"  Longs:         {len(longs)} (WR={long_wr:.1f}%)")
    print(f"  Shorts:        {len(shorts)} (WR={short_wr:.1f}%)")
    print(f"  Win rate:      {win_rate:.1f}%")
    print(f"  Total PnL:     ${total_pnl:,.0f}")
    print(f"  Profit Factor: {pf}")
    print(f"  Avg R:         {avg_r:.2f}")
    print(f"\n  Score Breakdown:")
    for s in sorted(score_wr.keys()):
        info = score_wr[s]
        print(f"    Score {s:>+2}: {info['trades']:>4} trades  WR={info['winRate']:>5.1f}%  AvgR={info['avgR']:>+6.2f}  PnL=${info['totalPnl']:>8,.0f}")


# Build output JSON
all_data = {
    'stocks': {'SPY': {'trades': trades, 'prices': prices}},
    'allTrades': sorted(trades, key=lambda t: t['entryDate']),
    'scores': scores,
    'scoreAnalysis': score_wr if trades else {},
    'settings': {
        'strategy': 'SPX Overnight v1',
        'instrument': 'SPY (S&P 500 ETF)',
        'entryTime': '~3:30pm (close)',
        'exitTime': 'Next day close',
        'riskPerTrade': RISK,
        'riskAtrMult': RISK_ATR_MULT,
        'minScoreLong': MIN_SCORE_LONG,
        'minScoreShort': MIN_SCORE_SHORT,
        'factors': {
            'bullish_strong': [
                'VIX panic spike >12% (+2)',
                'RSI(5) < 20 extreme oversold (+2)',
                'SPY down >2% but above SMA200 (+2)',
            ],
            'bullish': [
                'VIX > VIX_SMA(20) (+1)',
                'RSI(5) 20-35 moderately oversold (+1)',
                '3+ consecutive down days (+1)',
                'Close in bottom 20% of range (+1)',
                'Dip 1-2% above SMA200 (+1)',
                'VIX > 25 absolute (+1)',
                'Above SMA(200) regime (+1)',
            ],
            'bearish_strong': [
                'RSI(5) > 90 extreme overbought (-2)',
                'SPY up >3% today (-2)',
                'VIX crushed >20% (-2)',
            ],
            'bearish': [
                'VIX < 85% of VIX_SMA(20) (-1)',
                'RSI(5) 75-90 overbought (-1)',
                '4+ up days + RSI(14) > 65 (-1)',
                'SPY < SMA(200) bear regime (-1)',
                'VIX dropped 10-20% (-1)',
                'SPY up 1.5-3% today (-1)',
                'Close top 15% + volume spike (-1)',
            ],
        }
    }
}

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(all_data))
print(f"\nWritten {OUT} ({OUT.stat().st_size // 1024}KB)")
