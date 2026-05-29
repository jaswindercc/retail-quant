"""
Dynamic Risk Study — Test what happens when you adjust risk based on recent performance.

Approaches tested:
1. BASELINE: $200/trade fixed (current system)
2. SKIP AFTER N: Skip next trade after N consecutive losses
3. HALF RISK: Drop to $100/trade after N losses, back to $200 after a win
4. PROGRESSIVE: $200 → $150 → $100 → $50 as losses accumulate, reset on win
5. ANTI-MARTINGALE: Increase to $300 after 2 consecutive wins, back to $200 after a loss
6. COOL-OFF: After N consecutive losses, skip next 2 trades, then resume at $200

Each approach is tested across BT1, BT3, BT5, BT6.
(BT4 excluded due to survivorship bias in fixed mega-cap list)
"""

import json
import math

# ─── Load all trade data ───────────────────────────────────────────────────────

def load_trades():
    """Load trades from all backtests, normalize to common format."""
    backtests = {}

    # BT1
    with open('dashboard/public/sim_backtest_data.json') as f:
        d = json.load(f)
    backtests['BT1'] = [{
        'pnl': t['pnl'],
        'r': t['r_multiple'],
        'risk_dollars': 200.0,  # fixed $200 risk
    } for t in d['trades']]

    # BT3
    with open('dashboard/public/sim_backtest3_data.json') as f:
        d = json.load(f)
    backtests['BT3'] = [{
        'pnl': t['pnl'],
        'r': t['r_multiple'],
        'risk_dollars': 200.0,
    } for t in d['trades']]

    # BT5
    with open('dashboard/public/sim_backtest5_data.json') as f:
        d = json.load(f)
    backtests['BT5'] = [{
        'pnl': t['pnlDollar'],
        'r': t['pnlR'],
        'risk_dollars': 200.0,
    } for t in d['trades']]

    # BT6
    with open('dashboard/public/sim_backtest6_data.json') as f:
        d = json.load(f)
    backtests['BT6'] = [{
        'pnl': t['pnlDollar'],
        'r': t['pnlR'],
        'risk_dollars': 200.0,
    } for t in d['trades']]

    return backtests


# ─── Simulation engine ─────────────────────────────────────────────────────────

def simulate_dynamic_risk(trades, strategy_fn):
    """
    Replay trades with dynamic risk sizing.
    
    strategy_fn(state) returns:
      - risk_multiplier (0 = skip, 0.5 = half, 1.0 = full, 1.5 = 150%, etc.)
    
    state = {
        'consecutive_losses': int,
        'consecutive_wins': int,
        'last_results': list of last N r-multiples,
        'trade_index': int,
        'skip_count': int (remaining trades to skip),
    }
    """
    results = []
    state = {
        'consecutive_losses': 0,
        'consecutive_wins': 0,
        'last_results': [],
        'trade_index': 0,
        'skip_count': 0,
    }

    total_pnl = 0
    peak_pnl = 0
    max_dd = 0
    max_streak = 0
    current_streak = 0
    wins = 0
    losses = 0
    trades_taken = 0
    trades_skipped = 0

    for i, trade in enumerate(trades):
        state['trade_index'] = i

        # Get risk multiplier from strategy
        risk_mult = strategy_fn(state)

        if risk_mult <= 0:
            # Skip this trade
            trades_skipped += 1
            # Still update state as if we saw the result (for skip-based strategies)
            r = trade['r']
            if r > 0:
                state['consecutive_losses'] = 0
                state['consecutive_wins'] += 1
            else:
                state['consecutive_wins'] = 0
                state['consecutive_losses'] += 1
            state['last_results'].append(r)
            if len(state['last_results']) > 10:
                state['last_results'] = state['last_results'][-10:]
            if state.get('skip_count', 0) > 0:
                state['skip_count'] -= 1
            continue

        # Take the trade with adjusted risk
        base_risk = trade['risk_dollars']
        adjusted_risk = base_risk * risk_mult
        # PnL scales with risk multiplier
        adjusted_pnl = trade['pnl'] * risk_mult

        trades_taken += 1
        total_pnl += adjusted_pnl

        if adjusted_pnl > 0:
            wins += 1
            current_streak = 0
        else:
            losses += 1
            current_streak += 1
            max_streak = max(max_streak, current_streak)

        peak_pnl = max(peak_pnl, total_pnl)
        dd = peak_pnl - total_pnl
        max_dd = max(max_dd, dd)

        results.append({
            'trade_num': i + 1,
            'risk_mult': risk_mult,
            'pnl': round(adjusted_pnl, 2),
            'cum_pnl': round(total_pnl, 2),
        })

        # Update state
        r = trade['r']
        if r > 0:
            state['consecutive_losses'] = 0
            state['consecutive_wins'] += 1
        else:
            state['consecutive_wins'] = 0
            state['consecutive_losses'] += 1
        state['last_results'].append(r)
        if len(state['last_results']) > 10:
            state['last_results'] = state['last_results'][-10:]
        if state.get('skip_count', 0) > 0:
            state['skip_count'] -= 1

    wr = (wins / trades_taken * 100) if trades_taken > 0 else 0
    avg_win = total_pnl / wins if wins > 0 else 0
    total_loss = sum(r['pnl'] for r in results if r['pnl'] < 0)
    total_win = sum(r['pnl'] for r in results if r['pnl'] > 0)
    pf = abs(total_win / total_loss) if total_loss != 0 else 999

    return {
        'trades_taken': trades_taken,
        'trades_skipped': trades_skipped,
        'total_trades': len(trades),
        'wins': wins,
        'losses': losses,
        'win_rate': round(wr, 1),
        'total_pnl': round(total_pnl, 2),
        'profit_factor': round(pf, 2),
        'max_losing_streak': max_streak,
        'max_drawdown': round(max_dd, 2),
        'equity_curve': results,
    }


# ─── Dynamic Risk Strategies ──────────────────────────────────────────────────

def baseline(state):
    """Always take trade at full risk."""
    return 1.0


def skip_after_3(state):
    """Skip 1 trade after 3 consecutive losses."""
    if state['consecutive_losses'] >= 3:
        state['skip_count'] = 1
        state['consecutive_losses'] = 0  # reset after skip decision
        return 0
    if state.get('skip_count', 0) > 0:
        return 0
    return 1.0


def skip_after_4(state):
    """Skip 1 trade after 4 consecutive losses."""
    if state['consecutive_losses'] >= 4:
        state['skip_count'] = 1
        state['consecutive_losses'] = 0
        return 0
    if state.get('skip_count', 0) > 0:
        return 0
    return 1.0


def skip_after_5(state):
    """Skip 1 trade after 5 consecutive losses."""
    if state['consecutive_losses'] >= 5:
        state['skip_count'] = 1
        state['consecutive_losses'] = 0
        return 0
    if state.get('skip_count', 0) > 0:
        return 0
    return 1.0


def half_after_3(state):
    """Half risk ($100) after 3 consecutive losses, back to $200 after a win."""
    if state['consecutive_losses'] >= 3:
        return 0.5
    return 1.0


def half_after_4(state):
    """Half risk after 4 consecutive losses."""
    if state['consecutive_losses'] >= 4:
        return 0.5
    return 1.0


def progressive(state):
    """Progressive reduction: $200 → $150 → $100 → $50 based on consecutive losses."""
    cl = state['consecutive_losses']
    if cl >= 6:
        return 0.25  # $50
    elif cl >= 4:
        return 0.5   # $100
    elif cl >= 2:
        return 0.75  # $150
    return 1.0       # $200


def anti_martingale(state):
    """Increase risk after wins, decrease after losses.
    - 2+ wins in a row: risk = $300 (1.5x)
    - 3+ losses in a row: risk = $100 (0.5x)
    - otherwise: $200 (1.0x)
    """
    if state['consecutive_wins'] >= 2:
        return 1.5
    elif state['consecutive_losses'] >= 3:
        return 0.5
    return 1.0


def cooloff_3(state):
    """After 3 consecutive losses, skip next 2 trades then resume."""
    if state['consecutive_losses'] >= 3 and state.get('skip_count', 0) == 0:
        state['skip_count'] = 2
        state['consecutive_losses'] = 0
        return 0
    if state.get('skip_count', 0) > 0:
        return 0
    return 1.0


def cooloff_5(state):
    """After 5 consecutive losses, skip next 3 trades then resume."""
    if state['consecutive_losses'] >= 5 and state.get('skip_count', 0) == 0:
        state['skip_count'] = 3
        state['consecutive_losses'] = 0
        return 0
    if state.get('skip_count', 0) > 0:
        return 0
    return 1.0


def half_then_skip(state):
    """After 3 losses: half risk. After 5 losses: skip next trade."""
    cl = state['consecutive_losses']
    if cl >= 5:
        state['skip_count'] = 1
        state['consecutive_losses'] = 0
        return 0
    if state.get('skip_count', 0) > 0:
        return 0
    if cl >= 3:
        return 0.5
    return 1.0


# ─── Run all combinations ─────────────────────────────────────────────────────

STRATEGIES = {
    'Baseline ($200 fixed)': baseline,
    'Skip after 3 losses': skip_after_3,
    'Skip after 4 losses': skip_after_4,
    'Skip after 5 losses': skip_after_5,
    'Half risk after 3 losses': half_after_3,
    'Half risk after 4 losses': half_after_4,
    'Progressive (200→150→100→50)': progressive,
    'Anti-Martingale (↑wins ↓losses)': anti_martingale,
    'Cool-off: 3L → skip 2': cooloff_3,
    'Cool-off: 5L → skip 3': cooloff_5,
    'Half@3L + Skip@5L': half_then_skip,
}


def main():
    print("=" * 70)
    print("  📊 DYNAMIC RISK STUDY")
    print("  Testing 11 risk management approaches across 5 backtests")
    print("=" * 70)

    backtests = load_trades()
    
    all_results = {}

    for bt_name, trades in backtests.items():
        print(f"\n  ▶ {bt_name}: {len(trades)} trades")
        bt_results = {}

        for strat_name, strat_fn in STRATEGIES.items():
            result = simulate_dynamic_risk(trades, strat_fn)
            bt_results[strat_name] = result

            if strat_name == 'Baseline ($200 fixed)':
                print(f"    Baseline: {result['trades_taken']} trades, "
                      f"PnL=${result['total_pnl']:,.0f}, PF={result['profit_factor']:.2f}, "
                      f"Streak={result['max_losing_streak']}, DD=${result['max_drawdown']:,.0f}")

        # Find best strategy for this backtest
        best = None
        best_score = -999
        for name, r in bt_results.items():
            if name == 'Baseline ($200 fixed)':
                continue
            # Score: prioritize lower streak and DD, then PnL/PF
            baseline_r = bt_results['Baseline ($200 fixed)']
            streak_improvement = baseline_r['max_losing_streak'] - r['max_losing_streak']
            dd_improvement = (baseline_r['max_drawdown'] - r['max_drawdown']) / max(baseline_r['max_drawdown'], 1)
            pnl_retention = r['total_pnl'] / max(baseline_r['total_pnl'], 1) if baseline_r['total_pnl'] > 0 else 1
            score = streak_improvement * 2 + dd_improvement * 10 + pnl_retention * 3
            if score > best_score:
                best_score = score
                best = name

        if best:
            r = bt_results[best]
            baseline_r = bt_results['Baseline ($200 fixed)']
            print(f"    ⭐ Best: {best}")
            print(f"       Streak: {baseline_r['max_losing_streak']}→{r['max_losing_streak']}, "
                  f"DD: ${baseline_r['max_drawdown']:,.0f}→${r['max_drawdown']:,.0f}, "
                  f"PnL: ${baseline_r['total_pnl']:,.0f}→${r['total_pnl']:,.0f}")

        all_results[bt_name] = bt_results

    # ─── Build output JSON ─────────────────────────────────────────────────────
    output = {
        'strategy_names': list(STRATEGIES.keys()),
        'backtest_names': list(backtests.keys()),
        'results': {},
    }

    for bt_name, bt_results in all_results.items():
        output['results'][bt_name] = {}
        for strat_name, result in bt_results.items():
            # Don't include full equity curve in comparison (too large)
            output['results'][bt_name][strat_name] = {
                'trades_taken': result['trades_taken'],
                'trades_skipped': result['trades_skipped'],
                'total_trades': result['total_trades'],
                'win_rate': result['win_rate'],
                'total_pnl': result['total_pnl'],
                'profit_factor': result['profit_factor'],
                'max_losing_streak': result['max_losing_streak'],
                'max_drawdown': result['max_drawdown'],
            }

    # ─── Compute cross-backtest summary ────────────────────────────────────────
    summary = {}
    for strat_name in STRATEGIES.keys():
        streak_improvements = []
        dd_improvements = []
        pnl_retentions = []
        for bt_name in backtests.keys():
            baseline_r = all_results[bt_name]['Baseline ($200 fixed)']
            r = all_results[bt_name][strat_name]
            streak_improvements.append(baseline_r['max_losing_streak'] - r['max_losing_streak'])
            dd_imp = (baseline_r['max_drawdown'] - r['max_drawdown']) / max(baseline_r['max_drawdown'], 1) * 100
            dd_improvements.append(dd_imp)
            pnl_ret = r['total_pnl'] / max(baseline_r['total_pnl'], 1) * 100 if baseline_r['total_pnl'] > 0 else 100
            pnl_retentions.append(pnl_ret)

        summary[strat_name] = {
            'avg_streak_reduction': round(sum(streak_improvements) / len(streak_improvements), 1),
            'avg_dd_reduction_pct': round(sum(dd_improvements) / len(dd_improvements), 1),
            'avg_pnl_retention_pct': round(sum(pnl_retentions) / len(pnl_retentions), 1),
        }

    output['summary'] = summary

    # ─── Find overall winner ───────────────────────────────────────────────────
    best_overall = None
    best_score = -999
    for strat_name, s in summary.items():
        if strat_name == 'Baseline ($200 fixed)':
            continue
        # Score: balance streak reduction, DD reduction, and PnL retention
        score = s['avg_streak_reduction'] * 3 + s['avg_dd_reduction_pct'] * 0.5 + (s['avg_pnl_retention_pct'] - 100) * 0.1
        if score > best_score:
            best_score = score
            best_overall = strat_name

    output['best_overall'] = best_overall
    output['best_overall_summary'] = summary.get(best_overall, {})

    # Save
    outpath = 'dashboard/public/dynamic_risk_data.json'
    with open(outpath, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"\n{'=' * 70}")
    print(f"  ⭐ OVERALL BEST: {best_overall}")
    s = summary[best_overall]
    print(f"     Avg streak reduction: {s['avg_streak_reduction']} trades")
    print(f"     Avg DD reduction: {s['avg_dd_reduction_pct']:.1f}%")
    print(f"     Avg PnL retained: {s['avg_pnl_retention_pct']:.1f}%")
    print(f"\n  💾 Saved to {outpath}")
    print(f"{'=' * 70}")


if __name__ == '__main__':
    main()
