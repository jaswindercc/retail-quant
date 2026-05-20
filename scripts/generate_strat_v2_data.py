#!/usr/bin/env python3
"""
STRAT v2 — Faithful to how the STRAT community actually trades.

Key differences from v1:
1. FIXED R:R targets (2R and 3R tested separately) — no trailing stop
2. WEEKLY Timeframe Continuity (TFC) as trend filter instead of SMA50
3. Broadening/Narrowing context — patterns in narrowing (1s) are better
4. Magnitude filter — only take setups where prior move had meaningful range
5. Compound insides (1-1, 1-1-1) as separate high-probability setups
6. Volume confirmation on trigger bar
7. Prior swing high/low as alternate target (go for "the level above")
8. Time stop — exit at close after 10 days if neither target nor stop hit
9. Partial profits — take half at 1R, rest at 2R or 3R (STRAT community standard)

The STRAT community's core belief: The pattern gives you DEFINED risk.
You know your stop (opposite side of inside bar), you know your target
(prior swing or fixed R:R). No ambiguity. That's why they're confident.
"""
import pandas as pd, numpy as np, json
from pathlib import Path

DATA_DIR = Path("/workspaces/jas/data")
OUT = Path("/workspaces/jas/dashboard/public/strat_data.json")

RISK = 100.0  # Dollar risk per trade

# ── Strategy Variations to test ──
# We test each combo under different regimes to find what ACTUALLY works
VARIATIONS = [
    # Core approach: Fixed R:R with time stop
    'fixed_2R',           # Take profit at exactly 2R, SL at 1R, time stop 10 days
    'fixed_3R',           # Take profit at exactly 3R, SL at 1R, time stop 15 days
    'partial_1R_2R',      # Half off at 1R (move SL to BE), rest targets 2R
    'swing_target',       # Target = prior swing high/low (actual levels)
    'tfc_fixed_2R',       # Weekly TFC filter + fixed 2R
    'tfc_swing',          # Weekly TFC + swing target
    'narrowing_2R',       # Only take patterns inside narrowing (convergent) ranges + 2R
    'compound_inside',    # Only compound insides (1-1 or 1-1-1) + 2R target
    'magnitude_filter',   # Only when prior move (magnitude bar) was > 1.5 ATR + 2R
    'volume_confirm',     # Volume on trigger > 1.2× avg volume + 2R
    'full_strat',         # TFC + narrowing + magnitude + volume + partial (the full system)
]

# ── STRAT Combos ──
COMBOS = [
    ('2D-1-2U', ['2D', '1'], 'LONG'),
    ('2U-1-2D', ['2U', '1'], 'SHORT'),
    ('2U-1-2U', ['2U', '1'], 'LONG'),
    ('2D-1-2D', ['2D', '1'], 'SHORT'),
    ('3-1-2U', ['3', '1'], 'LONG'),
    ('3-1-2D', ['3', '1'], 'SHORT'),
    ('2D-1-1-2U', ['2D', '1', '1'], 'LONG'),
    ('2U-1-1-2D', ['2U', '1', '1'], 'SHORT'),
    ('1-1-2U', ['1', '1'], 'LONG'),          # Double inside breakout up
    ('1-1-2D', ['1', '1'], 'SHORT'),         # Double inside breakout down
    ('1-1-1-2U', ['1', '1', '1'], 'LONG'),   # Triple inside (mega compression)
    ('1-1-1-2D', ['1', '1', '1'], 'SHORT'),  # Triple inside down
    ('3-2D-1-2U', ['3', '2D', '1'], 'LONG'),
    ('3-2U-1-2D', ['3', '2U', '1'], 'SHORT'),
    ('1-2D-2U', ['1', '2D'], 'LONG'),        # Rev Strat (failed 2D → 2U)
    ('1-2U-2D', ['1', '2U'], 'SHORT'),       # Rev Strat (failed 2U → 2D)
]


def load(fp):
    df = pd.read_csv(fp)
    df['Date'] = pd.to_datetime(df['Date'])
    df = df.sort_values('Date').reset_index(drop=True)
    for c in ['Open', 'High', 'Low', 'Close', 'Volume']:
        df[c] = pd.to_numeric(df[c], errors='coerce')
    return df.dropna(subset=['Open', 'High', 'Low', 'Close'])


def classify_bars(df):
    """Classify each bar as 1, 2U, 2D, or 3."""
    labels = ['']
    for i in range(1, len(df)):
        curr, prev = df.iloc[i], df.iloc[i - 1]
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
    df['atr14'] = (np.maximum(df['High'] - df['Low'],
        np.maximum(abs(df['High'] - df['Close'].shift(1)),
                   abs(df['Low'] - df['Close'].shift(1))))).rolling(14).mean()
    df['sma50'] = df['Close'].rolling(50).mean()
    df['vol_avg'] = df['Volume'].rolling(20).mean()
    return df


def get_weekly_bars(df):
    """Create weekly OHLC for timeframe continuity."""
    df_w = df.copy()
    df_w['week'] = df_w['Date'].dt.isocalendar().week.astype(int)
    df_w['year'] = df_w['Date'].dt.year
    weekly = df_w.groupby(['year', 'week']).agg(
        Date=('Date', 'last'),
        Open=('Open', 'first'),
        High=('High', 'max'),
        Low=('Low', 'min'),
        Close=('Close', 'last')
    ).reset_index()
    # Classify weekly bars
    w_labels = ['']
    for i in range(1, len(weekly)):
        curr, prev = weekly.iloc[i], weekly.iloc[i - 1]
        hh = curr['High'] > prev['High']
        ll = curr['Low'] < prev['Low']
        if hh and ll:
            w_labels.append('3')
        elif hh and not ll:
            w_labels.append('2U')
        elif ll and not hh:
            w_labels.append('2D')
        else:
            w_labels.append('1')
    weekly['strat_w'] = w_labels
    return weekly


def get_tfc(df, weekly, idx):
    """Get weekly timeframe continuity for a given daily bar date.
    Returns 'UP', 'DOWN', or 'NEUTRAL'."""
    bar_date = df.iloc[idx]['Date']
    # Find the most recent completed weekly bar before this date
    prev_weeks = weekly[weekly['Date'] < bar_date]
    if len(prev_weeks) < 2:
        return 'NEUTRAL'
    last_week = prev_weeks.iloc[-1]
    if last_week['strat_w'] == '2U':
        return 'UP'
    elif last_week['strat_w'] == '2D':
        return 'DOWN'
    elif last_week['strat_w'] == '3':
        # Outside bar — last close vs open determines direction
        return 'UP' if last_week['Close'] > last_week['Open'] else 'DOWN'
    else:  # Inside week
        return 'NEUTRAL'


def is_narrowing(df, idx, lookback=5):
    """Check if recent bars show narrowing (converging) ranges.
    Narrowing = the last N bars' ranges are decreasing."""
    if idx < lookback:
        return False
    ranges = []
    for j in range(idx - lookback + 1, idx + 1):
        ranges.append(df.iloc[j]['High'] - df.iloc[j]['Low'])
    # Narrowing if ranges are generally decreasing
    decreasing_count = sum(1 for k in range(1, len(ranges)) if ranges[k] < ranges[k-1])
    return decreasing_count >= (lookback - 2)  # At least 3 of 4 decreasing


def get_prior_swing(df, idx, direction, lookback=20):
    """Find prior swing high (for longs) or swing low (for shorts).
    This is the STRAT community's 'go for the level above/below'."""
    if direction == 'LONG':
        # Look for highest high in past N bars (excluding last 2)
        search_start = max(0, idx - lookback)
        search_end = max(0, idx - 2)
        if search_start >= search_end:
            return None
        segment = df.iloc[search_start:search_end]
        if len(segment) == 0:
            return None
        return segment['High'].max()
    else:
        search_start = max(0, idx - lookback)
        search_end = max(0, idx - 2)
        if search_start >= search_end:
            return None
        segment = df.iloc[search_start:search_end]
        if len(segment) == 0:
            return None
        return segment['Low'].min()


def match_pattern(df, idx, setup_bars):
    """Check if bars ending at idx match the setup pattern."""
    n = len(setup_bars)
    if idx < n:
        return False
    for j in range(n):
        bar_label = df.iloc[idx - n + 1 + j]['strat']
        required = setup_bars[j]
        if bar_label != required:
            return False
    return True


def get_inside_bar_idx(df, idx, setup_bars):
    """Find the last inside bar in the pattern for stop calculation."""
    n = len(setup_bars)
    for j in range(n - 1, -1, -1):
        if setup_bars[j] == '1':
            return idx - n + 1 + j
    return idx


def backtest_variation(df, weekly, combo_name, setup_bars, direction, variation, stock_name):
    """Backtest a single STRAT combination under a specific variation."""
    df = classify_bars(df)
    trades = []
    in_trade = False
    n_setup = len(setup_bars)

    for i in range(max(n_setup, 50), len(df) - 1):
        # ── Manage open trade ──
        if in_trade:
            bar = df.iloc[i]
            days_in = (bar['Date'] - pd.to_datetime(entry_date)).days

            if direction == 'LONG':
                # Check stop
                if bar['Low'] <= stop:
                    exit_price = stop
                    reason = 'SL'
                # Check partial (if variation supports it)
                elif partial_mode and not partial_taken and bar['High'] >= partial_target:
                    # Take partial profit (we model as: half at 1R, track rest)
                    partial_taken = True
                    stop = entry_price  # Move stop to breakeven
                    continue
                # Check target
                elif bar['High'] >= target:
                    exit_price = target
                    reason = 'TP'
                # Time stop
                elif time_stop_days and days_in >= time_stop_days:
                    exit_price = bar['Close']
                    reason = 'TIME'
                else:
                    continue
            else:  # SHORT
                if bar['High'] >= stop:
                    exit_price = stop
                    reason = 'SL'
                elif partial_mode and not partial_taken and bar['Low'] <= partial_target:
                    partial_taken = True
                    stop = entry_price
                    continue
                elif bar['Low'] <= target:
                    exit_price = target
                    reason = 'TP'
                elif time_stop_days and days_in >= time_stop_days:
                    exit_price = bar['Close']
                    reason = 'TIME'
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

            # Adjust for partial profits
            if partial_mode and partial_taken:
                # Half was already taken at 1R, rest at this exit
                pnl_r = 0.5 * 1.0 + 0.5 * pnl_r  # Half at 1R + half at whatever we got
            elif partial_mode and not partial_taken:
                pass  # Full position hit stop

            t['pnlR'] = round(pnl_r, 2)
            t['pnlDollar'] = round(pnl_r * RISK, 2)
            t['exitReason'] = reason
            t['durationDays'] = days_in
            in_trade = False
            continue

        # ── Look for pattern match ──
        if not match_pattern(df, i, setup_bars):
            continue

        trigger_idx = i + 1
        if trigger_idx >= len(df):
            break

        # Get inside bar (defines risk)
        ib_idx = get_inside_bar_idx(df, i, setup_bars)
        ib = df.iloc[ib_idx]
        ib_high, ib_low = ib['High'], ib['Low']
        ib_range = ib_high - ib_low
        if ib_range <= 0:
            continue

        trigger = df.iloc[trigger_idx]
        atr = trigger['atr14']
        if pd.isna(atr) or atr <= 0:
            continue

        # ── VARIATION FILTERS ──

        # TFC filter (for variations that use it)
        use_tfc = variation in ('tfc_fixed_2R', 'tfc_swing', 'full_strat')
        if use_tfc:
            tfc = get_tfc(df, weekly, trigger_idx)
            if direction == 'LONG' and tfc == 'DOWN':
                continue
            if direction == 'SHORT' and tfc == 'UP':
                continue

        # Narrowing filter
        use_narrowing = variation in ('narrowing_2R', 'full_strat')
        if use_narrowing:
            if not is_narrowing(df, i):
                continue

        # Magnitude filter: prior directional move was > 1.5 ATR
        use_magnitude = variation in ('magnitude_filter', 'full_strat')
        if use_magnitude:
            mag_idx = i - n_setup + 1
            mag_bar = df.iloc[mag_idx]
            mag_range = abs(mag_bar['High'] - mag_bar['Low'])
            if mag_range < 1.5 * atr:
                continue

        # Volume confirmation: trigger bar volume > 1.2× average
        use_volume = variation in ('volume_confirm', 'full_strat')
        if use_volume:
            vol_avg = trigger['vol_avg']
            if pd.isna(vol_avg) or vol_avg <= 0:
                continue
            if trigger['Volume'] < 1.2 * vol_avg:
                continue

        # Compound inside filter: only if all setup bars are '1'
        if variation == 'compound_inside':
            if not all(b == '1' for b in setup_bars):
                continue

        # ── ENTRY LOGIC ──
        if direction == 'LONG':
            if trigger['High'] <= ib_high:
                continue  # Didn't trigger
            entry_price = ib_high
            stop = ib_low
            risk_per_share = entry_price - stop
            # Minimum stop: 0.3 ATR (tighter for STRAT — they trust the inside bar level)
            if risk_per_share < 0.3 * atr:
                risk_per_share = 0.3 * atr
                stop = entry_price - risk_per_share
        else:
            if trigger['Low'] >= ib_low:
                continue
            entry_price = ib_low
            stop = ib_high
            risk_per_share = stop - entry_price
            if risk_per_share < 0.3 * atr:
                risk_per_share = 0.3 * atr
                stop = entry_price + risk_per_share

        if risk_per_share <= 0:
            continue

        # ── TARGET LOGIC based on variation ──
        partial_mode = False
        partial_taken = False
        partial_target = None
        time_stop_days = None

        if variation == 'fixed_2R':
            if direction == 'LONG':
                target = entry_price + 2 * risk_per_share
            else:
                target = entry_price - 2 * risk_per_share
            time_stop_days = 10

        elif variation == 'fixed_3R':
            if direction == 'LONG':
                target = entry_price + 3 * risk_per_share
            else:
                target = entry_price - 3 * risk_per_share
            time_stop_days = 15

        elif variation == 'partial_1R_2R':
            partial_mode = True
            if direction == 'LONG':
                partial_target = entry_price + 1 * risk_per_share
                target = entry_price + 2 * risk_per_share
            else:
                partial_target = entry_price - 1 * risk_per_share
                target = entry_price - 2 * risk_per_share
            time_stop_days = 10

        elif variation in ('swing_target', 'tfc_swing'):
            swing_level = get_prior_swing(df, i, direction)
            if swing_level is None:
                continue
            if direction == 'LONG':
                target = swing_level
                # Must be at least 1.5R away to be worth it
                if (target - entry_price) < 1.5 * risk_per_share:
                    continue
            else:
                target = swing_level
                if (entry_price - target) < 1.5 * risk_per_share:
                    continue
            time_stop_days = 15

        elif variation in ('tfc_fixed_2R', 'narrowing_2R', 'magnitude_filter',
                          'volume_confirm', 'compound_inside'):
            if direction == 'LONG':
                target = entry_price + 2 * risk_per_share
            else:
                target = entry_price - 2 * risk_per_share
            time_stop_days = 10

        elif variation == 'full_strat':
            # The full system: partial at 1R, target at 3R
            partial_mode = True
            if direction == 'LONG':
                partial_target = entry_price + 1 * risk_per_share
                target = entry_price + 3 * risk_per_share
            else:
                partial_target = entry_price - 1 * risk_per_share
                target = entry_price - 3 * risk_per_share
            time_stop_days = 20

        entry_date = trigger['Date'].strftime('%Y-%m-%d')
        in_trade = True
        trades.append({
            'stock': stock_name,
            'combo': combo_name,
            'variation': variation,
            'dir': direction,
            'entryDate': entry_date,
            'entryPrice': round(entry_price, 2),
            'sl': round(stop, 2),
            'target': round(target, 2),
            'risk': round(risk_per_share, 2),
            'exitDate': '',
            'exitPrice': 0,
            'pnlR': 0,
            'pnlDollar': 0,
            'exitReason': '',
            'durationDays': 0,
        })

    # Close open trade at last bar
    if in_trade and trades:
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
        t['durationDays'] = (last['Date'] - pd.to_datetime(entry_date)).days

    return trades


def run():
    stocks = {}
    files = sorted(DATA_DIR.glob("*_daily_data*")) + [DATA_DIR / "spy_data.csv"]
    file_map = {}
    for fp in files:
        name = fp.stem.split('_')[0].upper()
        if name == 'SPY':
            name = 'SPY'
        file_map[name] = fp

    # Load all stock data
    stock_dfs = {}
    for name, fp in file_map.items():
        df = load(fp)
        if len(df) < 100:
            continue
        stock_dfs[name] = df
        stocks[name] = {
            'dates': df['Date'].dt.strftime('%Y-%m-%d').tolist(),
            'close': df['Close'].round(2).tolist(),
        }

    print(f"Loaded {len(stock_dfs)} stocks")

    # Get weekly bars for each stock (for TFC)
    weekly_map = {}
    for name, df in stock_dfs.items():
        weekly_map[name] = get_weekly_bars(df)

    # ── Run ALL variations for ALL combos on ALL stocks ──
    # This is the comprehensive test
    variation_results = {}  # variation -> {combo -> [trades]}
    combo_variation_summary = []  # For the rankings

    # Test a focused set of key variations
    key_variations = ['fixed_2R', 'fixed_3R', 'partial_1R_2R', 'swing_target',
                      'tfc_fixed_2R', 'tfc_swing', 'narrowing_2R',
                      'magnitude_filter', 'volume_confirm', 'full_strat']

    for var in key_variations:
        variation_results[var] = {}
        print(f"\n{'='*60}")
        print(f"Variation: {var}")
        print(f"{'='*60}")

        var_total_pnl = 0
        var_total_trades = 0

        for combo_name, setup_bars, direction in COMBOS:
            all_trades_for_combo = []

            for stock_name, df in stock_dfs.items():
                weekly = weekly_map[stock_name]
                trades = backtest_variation(df, weekly, combo_name, setup_bars,
                                          direction, var, stock_name)
                all_trades_for_combo.extend(trades)

            # Summary for this combo under this variation
            closed = [t for t in all_trades_for_combo if t['exitDate']]
            n_trades = len(closed)
            if n_trades > 0:
                wins = sum(1 for t in closed if t['pnlR'] > 0)
                total_pnl = sum(t['pnlDollar'] for t in closed)
                avg_r = np.mean([t['pnlR'] for t in closed])
                gross_profit = sum(t['pnlDollar'] for t in closed if t['pnlDollar'] > 0)
                gross_loss = abs(sum(t['pnlDollar'] for t in closed if t['pnlDollar'] < 0))
                pf = round(gross_profit / gross_loss, 2) if gross_loss > 0 else 99.0
                wr = round(wins / n_trades * 100, 1)

                var_total_pnl += total_pnl
                var_total_trades += n_trades

                combo_variation_summary.append({
                    'variation': var,
                    'combo': combo_name,
                    'direction': direction,
                    'trades': n_trades,
                    'winRate': wr,
                    'avgR': round(avg_r, 2),
                    'totalPnl': round(total_pnl, 0),
                    'profitFactor': pf,
                })

                if total_pnl > 500:
                    print(f"  {combo_name:15s} | {n_trades:4d} trades | WR {wr:5.1f}% | "
                          f"PF {pf:5.2f} | PnL {fmt(total_pnl)}")

            variation_results[var][combo_name] = all_trades_for_combo

        print(f"\n  TOTAL: {var_total_trades} trades, P&L: {fmt(var_total_pnl)}")

    # ── Find the BEST variations ──
    print(f"\n\n{'='*80}")
    print("VARIATION RANKING (by total P&L across all combos)")
    print(f"{'='*80}")

    var_totals = {}
    for entry in combo_variation_summary:
        var = entry['variation']
        if var not in var_totals:
            var_totals[var] = {'pnl': 0, 'trades': 0, 'wins': 0}
        var_totals[var]['pnl'] += entry['totalPnl']
        var_totals[var]['trades'] += entry['trades']

    for var, stats in sorted(var_totals.items(), key=lambda x: -x[1]['pnl']):
        print(f"  {var:20s} | {stats['trades']:5d} trades | P&L: {fmt(stats['pnl'])}")

    # ── Find best COMBO across all variations ──
    print(f"\n\n{'='*80}")
    print("BEST COMBOS (across all variations)")
    print(f"{'='*80}")

    combo_totals = {}
    for entry in combo_variation_summary:
        combo = entry['combo']
        if combo not in combo_totals:
            combo_totals[combo] = []
        combo_totals[combo].append(entry)

    # For each combo, find its best variation
    best_combos = []
    for combo, entries in combo_totals.items():
        best = max(entries, key=lambda x: x['totalPnl'])
        best_combos.append(best)
        if best['totalPnl'] > 0:
            print(f"  {combo:15s} best with {best['variation']:20s} | "
                  f"{best['trades']:4d} trades | WR {best['winRate']}% | "
                  f"PF {best['profitFactor']} | P&L: {fmt(best['totalPnl'])}")

    # ── Build output JSON ──
    # Structure: focus on the TOP performing variation+combo combinations
    # Also include the variation comparison for the dashboard

    # Top combos sorted by best P&L
    best_combos_sorted = sorted(best_combos, key=lambda x: -x['totalPnl'])

    # Per-variation summary
    var_summary = []
    for var in key_variations:
        entries = [e for e in combo_variation_summary if e['variation'] == var]
        total_pnl = sum(e['totalPnl'] for e in entries)
        total_trades = sum(e['trades'] for e in entries)
        profitable_combos = sum(1 for e in entries if e['totalPnl'] > 0)
        losing_combos = sum(1 for e in entries if e['totalPnl'] <= 0)
        if total_trades > 0:
            gross_p = sum(e['totalPnl'] for e in entries if e['totalPnl'] > 0)
            gross_l = abs(sum(e['totalPnl'] for e in entries if e['totalPnl'] < 0))
            var_pf = round(gross_p / gross_l, 2) if gross_l > 0 else 99.0
        else:
            var_pf = 0
        var_summary.append({
            'variation': var,
            'totalPnl': round(total_pnl, 0),
            'totalTrades': total_trades,
            'profitableCombos': profitable_combos,
            'losingCombos': losing_combos,
            'profitFactor': var_pf,
        })

    var_summary.sort(key=lambda x: -x['totalPnl'])

    # All individual combo results for detail views
    # Include trades for top 5 variations
    top_vars = [v['variation'] for v in var_summary[:5]]

    # Build per-combo detail with trades grouped by stock
    combo_details = {}
    for var in top_vars:
        for combo_name, _, _ in COMBOS:
            key = f"{var}__{combo_name}"
            trades_list = variation_results.get(var, {}).get(combo_name, [])
            closed = [t for t in trades_list if t['exitDate']]
            if closed:
                by_stock = {}
                for t in closed:
                    s = t['stock']
                    if s not in by_stock:
                        by_stock[s] = []
                    by_stock[s].append(t)
                combo_details[key] = by_stock

    # Compute overall stats
    all_combo_var = combo_variation_summary

    output = {
        'variationSummary': var_summary,
        'comboVariationDetail': all_combo_var,
        'bestCombos': best_combos_sorted,
        'comboDetails': combo_details,
        'stocks': stocks,
        'settings': {
            'risk': RISK,
            'numStocks': len(stock_dfs),
            'variations': key_variations,
            'combos': [c[0] for c in COMBOS],
            'description': 'STRAT v2: Faithful to community methods with fixed R:R, TFC, narrowing, magnitude, volume, and partial profits.',
        }
    }

    OUT.write_text(json.dumps(output, default=str))
    size_mb = OUT.stat().st_size / 1024 / 1024
    print(f"\n\nWrote {OUT} ({size_mb:.1f} MB)")
    print(f"Total entries in comboVariationDetail: {len(all_combo_var)}")
    print(f"Total combo details (with trades): {len(combo_details)}")


def fmt(x):
    return f"${x:,.0f}" if x >= 0 else f"-${abs(x):,.0f}"


if __name__ == '__main__':
    run()
