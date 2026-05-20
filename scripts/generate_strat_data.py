#!/usr/bin/env python3
"""
Generate STRAT backtest data for the React dashboard.
The STRAT (by Rob Smith) classifies bars as 1 (inside), 2U (up), 2D (down), 3 (outside).
Combinations like 2-1-2 reversal, 3-1-2, etc. form trade setups.

Risk = $100 per trade. Stop = inside bar range. Target = prior magnitude high/low.
"""
import pandas as pd, numpy as np, json
from pathlib import Path

DATA_DIR = Path("/workspaces/jas/data")
OUT = Path("/workspaces/jas/dashboard/public/strat_data.json")

RISK = 100.0

# ── STRAT Combinations to backtest ──
# Each combo: (name, pattern_sequence, direction)
# Pattern is read left-to-right chronologically (oldest → newest setup bar)
# The TRIGGER bar is the NEXT bar after the pattern completes
COMBOS = [
    # Reversals (highest probability)
    ('2D-1-2U', ['2D', '1'], 'LONG'),      # Classic reversal bullish
    ('2U-1-2D', ['2U', '1'], 'SHORT'),     # Classic reversal bearish
    # Continuations
    ('2U-1-2U', ['2U', '1'], 'LONG'),      # Continuation bullish
    ('2D-1-2D', ['2D', '1'], 'SHORT'),     # Continuation bearish
    # 3-1-2 (outside → inside → directional)
    ('3-1-2U', ['3', '1'], 'LONG'),        # Outside squeeze bullish
    ('3-1-2D', ['3', '1'], 'SHORT'),       # Outside squeeze bearish
    # 2-1-1-2 (compound inside — tighter compression)
    ('2D-1-1-2U', ['2D', '1', '1'], 'LONG'),
    ('2U-1-1-2D', ['2U', '1', '1'], 'SHORT'),
    # 3-2-1-2 (outside → directional → inside → breakout)
    ('3-2D-1-2U', ['3', '2D', '1'], 'LONG'),
    ('3-2U-1-2D', ['3', '2U', '1'], 'SHORT'),
    # Rev Strat 1-2-2
    ('1-2D-2U', ['1', '2D'], 'LONG'),      # Failed bearish → bullish
    ('1-2U-2D', ['1', '2U'], 'SHORT'),     # Failed bullish → bearish
]


def load(fp):
    df = pd.read_csv(fp)
    df['Date'] = pd.to_datetime(df['Date'])
    df = df.sort_values('Date').reset_index(drop=True)
    for c in ['Open', 'High', 'Low', 'Close', 'Volume']:
        df[c] = pd.to_numeric(df[c], errors='coerce')
    return df.dropna(subset=['Open', 'High', 'Low', 'Close'])


def classify_bars(df):
    """Classify each bar as 1, 2U, 2D, or 3 relative to previous bar."""
    labels = ['']  # First bar has no classification
    for i in range(1, len(df)):
        curr = df.iloc[i]
        prev = df.iloc[i - 1]
        hh = curr['High'] > prev['High']
        ll = curr['Low'] < prev['Low']
        if hh and ll:
            labels.append('3')
        elif hh and not ll:
            labels.append('2U')
        elif ll and not hh:
            labels.append('2D')
        else:
            labels.append('1')
    df = df.copy()
    df['strat'] = labels
    df['sma50'] = df['Close'].rolling(50).mean()
    df['ema20'] = df['Close'].ewm(span=20, adjust=False).mean()
    df['atr'] = (np.maximum(df['High'] - df['Low'],
        np.maximum(abs(df['High'] - df['Close'].shift(1)),
                   abs(df['Low'] - df['Close'].shift(1))))).rolling(14).mean()
    return df


def match_pattern(df, idx, setup_bars):
    """Check if bars ending at idx match the setup pattern."""
    n = len(setup_bars)
    if idx < n:
        return False
    for j in range(n):
        bar_label = df.iloc[idx - n + 1 + j]['strat']
        required = setup_bars[j]
        if required == '2D' or required == '2U':
            if bar_label != required:
                return False
        elif required == '3':
            if bar_label != '3':
                return False
        elif required == '1':
            if bar_label != '1':
                return False
    return True


def get_inside_bar_idx(df, idx, setup_bars):
    """Find the inside bar (last '1' in pattern) for stop calculation."""
    n = len(setup_bars)
    for j in range(n - 1, -1, -1):
        if setup_bars[j] == '1':
            return idx - n + 1 + j
    return idx  # fallback to last setup bar


def backtest_combo(df, combo_name, setup_bars, direction, stock_name):
    """Backtest a single STRAT combination on one stock.
    Uses fixed 2R target (or magnitude bar target if > 2R).
    Trailing stop: after +1R, trail at entry. After +1.5R, trail at +0.5R.
    """
    df = classify_bars(df)
    trades = []
    pos = False
    n_setup = len(setup_bars)

    for i in range(n_setup, len(df) - 1):
        # Manage open trade
        if pos:
            bar = df.iloc[i]
            bar_atr = bar['atr'] if not pd.isna(bar['atr']) else risk_per_share
            if direction == 'LONG':
                # EMA20 trailing stop after +2.5R (like our other strategies)
                curr_r = (bar['High'] - entry_price) / risk_per_share if risk_per_share > 0 else 0
                if curr_r >= 2.5:
                    ema_trail = bar['ema20'] - 1.0 * bar_atr if not pd.isna(bar['ema20']) else trailing_stop
                    if ema_trail > trailing_stop:
                        trailing_stop = ema_trail
                elif curr_r >= 1.0 and trailing_stop < entry_price:
                    trailing_stop = entry_price  # Breakeven at +1R

                if bar['Low'] <= trailing_stop:
                    exit_price = trailing_stop
                    reason = 'Trail' if trailing_stop > stop else 'SL'
                else:
                    continue
            else:  # SHORT
                curr_r = (entry_price - bar['Low']) / risk_per_share if risk_per_share > 0 else 0
                if curr_r >= 2.5:
                    ema_trail = bar['ema20'] + 1.0 * bar_atr if not pd.isna(bar['ema20']) else trailing_stop
                    if ema_trail < trailing_stop:
                        trailing_stop = ema_trail
                elif curr_r >= 1.0 and trailing_stop > entry_price:
                    trailing_stop = entry_price

                if bar['High'] >= trailing_stop:
                    exit_price = trailing_stop
                    reason = 'Trail' if trailing_stop < stop else 'SL'
                else:
                    continue

            # Close trade
            t = trades[-1]
            t['exitDate'] = bar['Date'].strftime('%Y-%m-%d')
            t['exitPrice'] = round(exit_price, 2)
            if direction == 'LONG':
                pnl_r = (exit_price - entry_price) / risk_per_share if risk_per_share > 0 else 0
            else:
                pnl_r = (entry_price - exit_price) / risk_per_share if risk_per_share > 0 else 0
            t['pnlR'] = round(pnl_r, 2)
            t['pnlDollar'] = round(pnl_r * RISK, 2)
            t['exitReason'] = reason
            ed = pd.to_datetime(t['entryDate'])
            t['durationDays'] = int((bar['Date'] - ed).days)
            pos = False
            continue

        # Look for pattern match ending at bar i
        if not match_pattern(df, i, setup_bars):
            continue

        # Pattern matched! The trigger is bar i+1
        trigger_idx = i + 1
        if trigger_idx >= len(df):
            break

        # Get the inside bar (defines risk)
        ib_idx = get_inside_bar_idx(df, i, setup_bars)
        ib = df.iloc[ib_idx]
        ib_high = ib['High']
        ib_low = ib['Low']
        ib_range = ib_high - ib_low

        if ib_range <= 0:
            continue

        # Get magnitude bar (first bar in pattern) for target calc
        mag_idx = i - n_setup + 1
        mag_bar = df.iloc[mag_idx]

        trigger = df.iloc[trigger_idx]

        # TREND FILTER: only take longs above SMA50, shorts below SMA50
        sma50 = trigger['sma50']
        atr = trigger['atr']
        if pd.isna(sma50) or pd.isna(atr) or atr <= 0:
            continue
        if direction == 'LONG' and trigger['Close'] < sma50:
            continue
        if direction == 'SHORT' and trigger['Close'] > sma50:
            continue

        if direction == 'LONG':
            # Entry: break above inside bar's high
            if trigger['High'] <= ib_high:
                continue  # Didn't trigger
            entry_price = ib_high
            stop = ib_low
            risk_per_share = entry_price - stop
            # Ensure minimum stop of 0.5 ATR
            if risk_per_share < 0.5 * atr:
                risk_per_share = 0.5 * atr
                stop = entry_price - risk_per_share
            if risk_per_share <= 0:
                continue
            # Target: magnitude bar's high OR 2R, whichever is greater
            mag_target = mag_bar['High']
            min_target = entry_price + 2 * risk_per_share
            target = max(mag_target, min_target)
            trailing_stop = stop
        else:  # SHORT
            if trigger['Low'] >= ib_low:
                continue
            entry_price = ib_low
            stop = ib_high
            risk_per_share = stop - entry_price
            if risk_per_share < 0.5 * atr:
                risk_per_share = 0.5 * atr
                stop = entry_price + risk_per_share
            if risk_per_share <= 0:
                continue
            mag_target = mag_bar['Low']
            min_target = entry_price - 2 * risk_per_share
            target = min(mag_target, min_target)
            trailing_stop = stop

        qty = max(1, round(RISK / risk_per_share))
        pos = True
        trades.append({
            'stock': stock_name,
            'combo': combo_name,
            'dir': direction,
            'entryDate': trigger['Date'].strftime('%Y-%m-%d'),
            'entryPrice': round(entry_price, 2),
            'sl': round(stop, 2),
            'target': round(target, 2),
            'risk': round(risk_per_share, 2),
            'qty': qty,
            'exitDate': '',
            'exitPrice': 0,
            'pnlR': 0,
            'pnlDollar': 0,
            'exitReason': '',
            'durationDays': 0,
        })

    # Close any open trade at last bar
    if pos and trades:
        t = trades[-1]
        last = df.iloc[-1]
        t['exitDate'] = last['Date'].strftime('%Y-%m-%d')
        t['exitPrice'] = round(last['Close'], 2)
        if direction == 'LONG':
            pnl_r = (last['Close'] - entry_price) / risk_per_share if risk_per_share > 0 else 0
        else:
            pnl_r = (entry_price - last['Close']) / risk_per_share if risk_per_share > 0 else 0
        t['pnlR'] = round(pnl_r, 2)
        t['pnlDollar'] = round(pnl_r * RISK, 2)
        t['exitReason'] = 'Open'
        ed = pd.to_datetime(t['entryDate'])
        t['durationDays'] = int((last['Date'] - ed).days)

    return trades


def run():
    all_results = {
        'combos': {},
        'stocks': {},
        'allTrades': [],
        'settings': {
            'riskPerTrade': RISK,
            'stopMethod': 'Inside bar range',
            'targetMethod': 'Magnitude bar high/low (or 2R)',
            'strategy': 'The STRAT (Rob Smith)',
            'combos_tested': [c[0] for c in COMBOS],
        }
    }

    # Initialize combo stats
    for combo_name, _, _ in COMBOS:
        all_results['combos'][combo_name] = {'trades': [], 'stocks': {}}

    files = sorted(DATA_DIR.glob("*.csv"))
    for f in files:
        name = f.stem.replace("_daily_data - Sheet1", "").replace("_data", "").upper()
        df = load(f)

        # Price series for charts
        prices = []
        for _, row in df.iterrows():
            prices.append({
                'date': row['Date'].strftime('%Y-%m-%d'),
                'close': round(row['Close'], 2),
                'high': round(row['High'], 2),
                'low': round(row['Low'], 2),
            })

        if name not in all_results['stocks']:
            all_results['stocks'][name] = {'prices': prices, 'trades': []}

        for combo_name, setup_bars, direction in COMBOS:
            trades = backtest_combo(df, combo_name, setup_bars, direction, name)
            all_results['combos'][combo_name]['trades'].extend(trades)
            all_results['combos'][combo_name]['stocks'][name] = trades
            all_results['stocks'][name]['trades'].extend(trades)
            all_results['allTrades'].extend(trades)

    # Sort trades
    all_results['allTrades'].sort(key=lambda t: t['entryDate'])
    for name in all_results['stocks']:
        all_results['stocks'][name]['trades'].sort(key=lambda t: t['entryDate'])

    # Print summary
    print("=" * 70)
    print("THE STRAT BACKTEST RESULTS")
    print("=" * 70)
    print(f"{'Combo':<15} {'Trades':>7} {'Win%':>6} {'Avg R':>7} {'Total P&L':>10} {'PF':>6}")
    print("-" * 70)

    combo_summary = []
    for combo_name, _, direction in COMBOS:
        trades = all_results['combos'][combo_name]['trades']
        closed = [t for t in trades if t['exitDate']]
        if not closed:
            combo_summary.append((combo_name, direction, 0, 0, 0, 0, 0))
            continue
        wins = [t for t in closed if t['pnlR'] > 0]
        wr = len(wins) / len(closed) * 100 if closed else 0
        avg_r = sum(t['pnlR'] for t in closed) / len(closed) if closed else 0
        total_pnl = sum(t['pnlDollar'] for t in closed)
        gross_win = sum(t['pnlDollar'] for t in closed if t['pnlDollar'] > 0)
        gross_loss = abs(sum(t['pnlDollar'] for t in closed if t['pnlDollar'] < 0))
        pf = gross_win / gross_loss if gross_loss > 0 else 99.0
        combo_summary.append((combo_name, direction, len(closed), wr, avg_r, total_pnl, pf))
        print(f"{combo_name:<15} {len(closed):>7} {wr:>5.1f}% {avg_r:>6.2f}R  ${total_pnl:>9,.0f} {pf:>5.2f}")

    print("-" * 70)
    total_trades = len([t for t in all_results['allTrades'] if t['exitDate']])
    total_pnl = sum(t['pnlDollar'] for t in all_results['allTrades'] if t['exitDate'])
    print(f"{'TOTAL':<15} {total_trades:>7} {'':>6} {'':>7}  ${total_pnl:>9,.0f}")
    print("=" * 70)

    # Add summary to JSON
    all_results['comboSummary'] = []
    for combo_name, direction, n_trades, wr, avg_r, total_pnl, pf in combo_summary:
        all_results['comboSummary'].append({
            'combo': combo_name,
            'direction': direction,
            'trades': n_trades,
            'winRate': round(wr, 1),
            'avgR': round(avg_r, 2),
            'totalPnl': round(total_pnl, 2),
            'profitFactor': round(pf, 2),
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(all_results))
    print(f"\nWritten {OUT} ({OUT.stat().st_size // 1024}KB)")


if __name__ == '__main__':
    run()
