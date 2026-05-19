#!/usr/bin/env python3
"""
QQQ OVERNIGHT Strategy — Same scoring model applied to QQQ (Nasdaq 100 ETF).
Uses QQQ price data + VIX for fear/greed signals.
QQQ is more volatile than SPY so the overnight mean-reversion edge can be stronger.
"""

import pandas as pd, numpy as np, json
from pathlib import Path

DATA_DIR = Path("/workspaces/jas/data")
OUT = Path("/workspaces/jas/dashboard/public/qqq_overnight_data.json")
RISK = 100.0

# Parameters
RISK_ATR_MULT = 0.5
MIN_SCORE_LONG = 3
MIN_SCORE_SHORT = -3
RSI_SHORT_LEN = 5
RSI_LONG_LEN = 14
VIX_SMA_LEN = 20
SMA50_LEN = 50
SMA200_LEN = 200
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
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1/length, min_periods=length, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/length, min_periods=length, adjust=False).mean()
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def prepare_qqq(df):
    df = df.copy()
    df['sma50'] = df['Close'].rolling(SMA50_LEN).mean()
    df['sma200'] = df['Close'].rolling(SMA200_LEN).mean()
    df['ema20'] = df['Close'].ewm(span=20, adjust=False).mean()
    tr = np.maximum(df['High'] - df['Low'],
        np.maximum(abs(df['High'] - df['Close'].shift(1)),
                   abs(df['Low'] - df['Close'].shift(1))))
    df['atr'] = tr.rolling(14).mean()
    df['rsi5'] = compute_rsi(df['Close'], RSI_SHORT_LEN)
    df['rsi14'] = compute_rsi(df['Close'], RSI_LONG_LEN)
    df['daily_ret'] = df['Close'].pct_change()
    df['up_day'] = (df['Close'] > df['Close'].shift(1)).astype(int)
    df['dn_day'] = (df['Close'] < df['Close'].shift(1)).astype(int)
    df['vol_sma'] = df['Volume'].rolling(VOL_SMA_LEN).mean()
    rng = df['High'] - df['Low']
    df['range_pos'] = np.where(rng > 0, (df['Close'] - df['Low']) / rng, 0.5)
    df['fSma'] = df['ema20']
    df['sSma'] = df['sma50']
    return df


def prepare_vix(df):
    df = df.copy()
    df['vix_sma20'] = df['Close'].rolling(VIX_SMA_LEN).mean()
    df['vix_change'] = df['Close'].pct_change()
    df['vix_sma50'] = df['Close'].rolling(50).mean()
    return df


def count_consecutive(series, direction='down'):
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


def compute_signal_score(qqq_row, vix_row, consec_dn, consec_up):
    score = 0
    reasons_bull = []
    reasons_bear = []

    # STRONG BULLISH (+2)
    if not pd.isna(vix_row['vix_change']) and vix_row['vix_change'] > 0.12:
        score += 2
        reasons_bull.append('VIX_panic(+2)')
    if not pd.isna(qqq_row['rsi5']) and qqq_row['rsi5'] < 20:
        score += 2
        reasons_bull.append('RSI5<20(+2)')
    if (not pd.isna(qqq_row['daily_ret']) and qqq_row['daily_ret'] < -0.025
            and not pd.isna(qqq_row['sma200']) and qqq_row['Close'] > qqq_row['sma200']):
        score += 2
        reasons_bull.append('crash_dip(+2)')

    # STANDARD BULLISH (+1)
    if not pd.isna(vix_row['vix_sma20']) and vix_row['Close'] > vix_row['vix_sma20']:
        score += 1
        reasons_bull.append('VIX>SMA20')
    if not pd.isna(qqq_row['rsi5']) and 20 <= qqq_row['rsi5'] < 35:
        score += 1
        reasons_bull.append('RSI5<35')
    if consec_dn >= 3:
        score += 1
        reasons_bull.append(f'{consec_dn}dn_days')
    if qqq_row['range_pos'] < 0.20:
        score += 1
        reasons_bull.append('close_near_low')
    if (not pd.isna(qqq_row['daily_ret']) and -0.025 <= qqq_row['daily_ret'] < -0.012
            and not pd.isna(qqq_row['sma200']) and qqq_row['Close'] > qqq_row['sma200']):
        score += 1
        reasons_bull.append('dip_in_uptrend')
    if vix_row['Close'] > 25:
        score += 1
        reasons_bull.append('VIX>25')
    if not pd.isna(qqq_row['sma200']) and qqq_row['Close'] > qqq_row['sma200']:
        score += 1
        reasons_bull.append('above_SMA200')

    # STRONG BEARISH (-2)
    if not pd.isna(qqq_row['rsi5']) and qqq_row['rsi5'] > 90:
        score -= 2
        reasons_bear.append('RSI5>90(-2)')
    if not pd.isna(qqq_row['daily_ret']) and qqq_row['daily_ret'] > 0.035:
        score -= 2
        reasons_bear.append('huge_rally(-2)')
    if not pd.isna(vix_row['vix_change']) and vix_row['vix_change'] < -0.20:
        score -= 2
        reasons_bear.append('VIX_crushed(-2)')

    # STANDARD BEARISH (-1)
    if not pd.isna(vix_row['vix_sma20']) and vix_row['Close'] < vix_row['vix_sma20'] * 0.85:
        score -= 1
        reasons_bear.append('VIX_complacent')
    if not pd.isna(qqq_row['rsi5']) and 75 <= qqq_row['rsi5'] < 90:
        score -= 1
        reasons_bear.append('RSI5>75')
    if consec_up >= 4 and not pd.isna(qqq_row['rsi14']) and qqq_row['rsi14'] > 65:
        score -= 1
        reasons_bear.append('extended_up')
    if not pd.isna(qqq_row['sma200']) and qqq_row['Close'] < qqq_row['sma200']:
        score -= 1
        reasons_bear.append('below_SMA200')
    if (not pd.isna(vix_row['vix_change']) and -0.20 <= vix_row['vix_change'] < -0.10):
        score -= 1
        reasons_bear.append('VIX_drop')
    if not pd.isna(qqq_row['daily_ret']) and 0.018 < qqq_row['daily_ret'] <= 0.035:
        score -= 1
        reasons_bear.append('big_up_day')
    if (qqq_row['range_pos'] > 0.85
            and not pd.isna(qqq_row['vol_sma'])
            and qqq_row['vol_sma'] > 0
            and qqq_row['Volume'] > 1.5 * qqq_row['vol_sma']):
        score -= 1
        reasons_bear.append('distribution')

    return score, reasons_bull, reasons_bear


def backtest_overnight(qqq_df, vix_df):
    qqq = prepare_qqq(qqq_df)
    vix = prepare_vix(vix_df)

    qqq['date_only'] = qqq['Date'].dt.date
    vix['date_only'] = vix['Date'].dt.date

    merged = qqq.merge(vix[['date_only', 'Close', 'vix_sma20', 'vix_change', 'vix_sma50']],
                       on='date_only', how='inner', suffixes=('', '_vix'))
    merged = merged.sort_values('Date').reset_index(drop=True)

    consec_dn = count_consecutive(merged['Close'], 'down')
    consec_up = count_consecutive(merged['Close'], 'up')

    trades = []
    scores_history = []

    for i in range(1, len(merged) - 1):
        row = merged.iloc[i]
        atr = row['atr']

        if pd.isna(atr) or atr <= 0 or pd.isna(row['sma50']) or pd.isna(row['rsi5']):
            continue
        if pd.isna(row['vix_sma20']):
            continue

        vix_row = {
            'Close': row['Close_vix'],
            'vix_sma20': row['vix_sma20'],
            'vix_change': row['vix_change'],
        }

        score, reasons_bull, reasons_bear = compute_signal_score(
            row, vix_row, int(consec_dn.iloc[i]), int(consec_up.iloc[i])
        )

        scores_history.append({
            'date': row['Date'].strftime('%Y-%m-%d'),
            'score': score,
            'close': round(row['Close'], 2),
            'vix': round(row['Close_vix'], 2),
        })

        direction = None
        if score >= MIN_SCORE_LONG:
            direction = 'LONG'
        else:
            continue  # Long only — shorts removed (no edge)

        entry_price = row['Close']
        next_row = merged.iloc[i + 1]
        exit_price = next_row['Close']

        risk_dist = RISK_ATR_MULT * atr
        if risk_dist <= 0:
            continue
        qty = max(1, round(RISK / risk_dist))

        if direction == 'LONG':
            pnl_dollar = qty * (exit_price - entry_price)
        else:
            pnl_dollar = qty * (entry_price - exit_price)

        pnl_r = pnl_dollar / RISK

        if direction == 'LONG':
            sl = entry_price - risk_dist
        else:
            sl = entry_price + risk_dist

        trades.append({
            'stock': 'QQQ',
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
# MAIN
# ══════════════════════════════════════════════════════════════

print("Loading QQQ and VIX data...")
qqq_df = load(DATA_DIR / "qqq_daily_data_right - Sheet1.csv")
vix_df = load(DATA_DIR / "VIX_daily_data_right - Sheet1.csv")
print(f"  QQQ: {len(qqq_df)} bars ({qqq_df['Date'].min().strftime('%Y-%m-%d')} to {qqq_df['Date'].max().strftime('%Y-%m-%d')})")
print(f"  VIX: {len(vix_df)} bars ({vix_df['Date'].min().strftime('%Y-%m-%d')} to {vix_df['Date'].max().strftime('%Y-%m-%d')})")

print("\nRunning QQQ overnight prediction backtest...")
trades, prices, scores = backtest_overnight(qqq_df, vix_df)

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
    print(f"QQQ OVERNIGHT RESULTS")
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

all_data = {
    'stocks': {'QQQ': {'trades': trades, 'prices': prices}},
    'allTrades': sorted(trades, key=lambda t: t['entryDate']),
    'scores': scores,
    'scoreAnalysis': score_wr if trades else {},
    'settings': {
        'strategy': 'QQQ Overnight v1',
        'instrument': 'QQQ (Nasdaq 100 ETF)',
        'entryTime': '~3:30pm (close)',
        'exitTime': 'Next day close',
        'riskPerTrade': RISK,
        'riskAtrMult': RISK_ATR_MULT,
        'minScoreLong': MIN_SCORE_LONG,
        'minScoreShort': MIN_SCORE_SHORT,
    }
}

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(all_data))
print(f"\nWritten {OUT} ({OUT.stat().st_size // 1024}KB)")
