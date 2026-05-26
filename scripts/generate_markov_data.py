#!/usr/bin/env python3
"""Generate Markov chain analysis data for SPX overnight trades."""

import json
import numpy as np
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
PUBLIC_DIR = Path(__file__).resolve().parent.parent / "dashboard" / "public"

def load_trades():
    with open(PUBLIC_DIR / "overnight_trail_study.json") as f:
        d = json.load(f)
    return d["configs"][0]["trades"]  # Vanilla 1-day hold, 264 trades


def compute_transition_matrix(outcomes):
    n = len(outcomes)
    ww = sum(1 for i in range(1, n) if outcomes[i] == 1 and outcomes[i-1] == 1)
    wl = sum(1 for i in range(1, n) if outcomes[i] == 0 and outcomes[i-1] == 1)
    lw = sum(1 for i in range(1, n) if outcomes[i] == 1 and outcomes[i-1] == 0)
    ll = sum(1 for i in range(1, n) if outcomes[i] == 0 and outcomes[i-1] == 0)
    return {
        "W_to_W": ww, "W_to_L": wl, "L_to_W": lw, "L_to_L": ll,
        "pWinAfterWin": round(ww / (ww + wl) * 100, 1) if (ww + wl) > 0 else 0,
        "pWinAfterLoss": round(lw / (lw + ll) * 100, 1) if (lw + ll) > 0 else 0,
        "nAfterWin": ww + wl,
        "nAfterLoss": lw + ll,
    }


def compute_streak_table(outcomes, trades):
    n = len(outcomes)
    loss_streaks = []
    for streak_len in range(1, 8):
        next_outcomes = []
        next_pnl = []
        for i in range(streak_len, n):
            if all(outcomes[i-j-1] == 0 for j in range(streak_len)):
                if i - streak_len - 1 >= 0 and outcomes[i-streak_len-1] == 0:
                    continue
                next_outcomes.append(outcomes[i])
                next_pnl.append(trades[i]["pnlR"])
        if next_outcomes:
            loss_streaks.append({
                "streak": streak_len,
                "nextWin": sum(next_outcomes),
                "nextLoss": len(next_outcomes) - sum(next_outcomes),
                "pWin": round(sum(next_outcomes) / len(next_outcomes) * 100, 1),
                "avgR": round(np.mean(next_pnl), 3),
                "sample": len(next_outcomes),
            })

    win_streaks = []
    for streak_len in range(1, 8):
        next_outcomes = []
        next_pnl = []
        for i in range(streak_len, n):
            if all(outcomes[i-j-1] == 1 for j in range(streak_len)):
                if i - streak_len - 1 >= 0 and outcomes[i-streak_len-1] == 1:
                    continue
                next_outcomes.append(outcomes[i])
                next_pnl.append(trades[i]["pnlR"])
        if next_outcomes:
            win_streaks.append({
                "streak": streak_len,
                "nextWin": sum(next_outcomes),
                "nextLoss": len(next_outcomes) - sum(next_outcomes),
                "pWin": round(sum(next_outcomes) / len(next_outcomes) * 100, 1),
                "avgR": round(np.mean(next_pnl), 3),
                "sample": len(next_outcomes),
            })

    return {"afterLosses": loss_streaks, "afterWins": win_streaks}


def evaluate_strategy(trades, outcomes, rule_fn):
    n = len(outcomes)
    selected_idx = [i for i in range(n) if rule_fn(i, outcomes, trades)]
    selected = [trades[i] for i in selected_idx]
    if not selected:
        return None

    t_count = len(selected)
    wins = [t for t in selected if t["pnlDollar"] > 0]
    losses = [t for t in selected if t["pnlDollar"] <= 0]
    total_pnl = sum(t["pnlDollar"] for t in selected)
    avg_r = sum(t["pnlR"] for t in selected) / t_count
    wr = len(wins) / t_count * 100
    gross_w = sum(t["pnlDollar"] for t in wins)
    gross_l = abs(sum(t["pnlDollar"] for t in losses))
    pf = gross_w / gross_l if gross_l > 0 else 999

    equity = np.cumsum([t["pnlDollar"] for t in selected])
    peak = np.maximum.accumulate(equity)
    dd = peak - equity
    max_dd = float(dd.max())

    # Build equity curve for charting
    equity_curve = []
    running = 0.0
    for t in selected:
        running += t["pnlDollar"]
        equity_curve.append({"date": t["exitDate"], "equity": round(running, 2)})

    return {
        "trades": t_count,
        "wins": len(wins),
        "winRate": round(wr, 1),
        "avgR": round(avg_r, 3),
        "totalPnl": round(total_pnl, 0),
        "profitFactor": round(pf, 2),
        "maxDD": round(max_dd, 0),
        "avgWinR": round(np.mean([t["pnlR"] for t in wins]), 2) if wins else 0,
        "avgLossR": round(np.mean([t["pnlR"] for t in losses]), 2) if losses else 0,
        "equityCurve": equity_curve,
    }


def compute_sizing(trades, outcomes):
    """Variable position sizing strategies based on Markov streaks."""
    n = len(outcomes)

    def get_multiplier_conservative(i, outcomes):
        """After loss: 1.25x, after 2 wins: 0.75x, else 1x"""
        if i == 0:
            return 1.0
        if outcomes[i-1] == 0:
            return 1.25  # after loss: size up modestly
        if i >= 2 and outcomes[i-1] == 1 and outcomes[i-2] == 1:
            return 0.75  # after 2 wins: reduce
        return 1.0

    sizing_defs = [
        ("Flat $100", lambda i, o: 1.0, "Same risk every trade"),
        ("Markov sizing ($75–$100–$125)", get_multiplier_conservative, "After loss→$125, after 2 wins→$75, else $100"),
    ]

    results = []
    for name, mult_fn, desc in sizing_defs:
        pnls = []
        for i in range(n):
            m = mult_fn(i, outcomes)
            pnls.append(trades[i]["pnlR"] * 100 * m)

        total = sum(pnls)
        equity = np.cumsum(pnls)
        peak = np.maximum.accumulate(equity)
        max_dd = float((peak - equity).max())

        # Equity curve
        curve = []
        running = 0.0
        for idx, t in enumerate(trades):
            running += pnls[idx]
            curve.append({"date": t["exitDate"], "equity": round(running, 2)})

        results.append({
            "name": name,
            "description": desc,
            "totalPnl": round(total, 0),
            "maxDD": round(max_dd, 0),
            "trades": n,
            "equityCurve": curve,
        })

    # Build trade-by-trade comparison table
    trade_table = []
    running_flat = 0.0
    running_markov = 0.0
    for i in range(n):
        mult = get_multiplier_conservative(i, outcomes)
        flat_pnl = trades[i]["pnlR"] * 100
        markov_pnl = trades[i]["pnlR"] * 100 * mult
        running_flat += flat_pnl
        running_markov += markov_pnl

        # Determine reason for sizing
        if i == 0:
            reason = "First trade"
        elif outcomes[i-1] == 0:
            reason = "Prev was LOSS → $125"
        elif i >= 2 and outcomes[i-1] == 1 and outcomes[i-2] == 1:
            reason = "2 wins in row → $75"
        else:
            reason = "Normal → $100"

        trade_table.append({
            "date": trades[i]["entryDate"],
            "exitDate": trades[i]["exitDate"],
            "pnlR": trades[i]["pnlR"],
            "score": trades[i].get("score", 0),
            "outcome": "W" if trades[i]["pnlDollar"] > 0 else "L",
            "flatRisk": 100,
            "flatPnl": round(flat_pnl, 2),
            "flatEquity": round(running_flat, 2),
            "markovRisk": round(100 * mult),
            "markovPnl": round(markov_pnl, 2),
            "markovEquity": round(running_markov, 2),
            "reason": reason,
        })

    results.append({"tradeTable": trade_table})
    return results


def main():
    trades = load_trades()
    outcomes = [1 if t["pnlDollar"] > 0 else 0 for t in trades]
    n = len(outcomes)

    # Transition matrix
    transition = compute_transition_matrix(outcomes)

    # Streak tables
    streaks = compute_streak_table(outcomes, trades)

    # Strategies
    def baseline(i, o, t): return True
    def only_after_loss(i, o, t): return i >= 1 and o[i-1] == 0
    def only_after_2plus_losses(i, o, t): return i >= 2 and o[i-1] == 0 and o[i-2] == 0
    def skip_after_2wins(i, o, t):
        if i < 2: return True
        if o[i-1] == 1 and o[i-2] == 1:
            if i >= 3 and o[i-3] == 1: return True
            return False
        return True
    def combined(i, o, t):
        # Always take after 2+ losses
        if i >= 2 and o[i-1] == 0 and o[i-2] == 0:
            return True
        # Skip after exactly 2 wins
        if i >= 2 and o[i-1] == 1 and o[i-2] == 1:
            if i < 3 or o[i-3] != 1:
                return False
        return True
    def only_after_win(i, o, t): return i >= 1 and o[i-1] == 1
    def after_loss_high_score(i, o, t):
        if i < 1: return False
        if o[i-1] != 0: return False
        return t[i].get("score", 0) >= 4

    strategy_defs = [
        ("Baseline (take all)", baseline, "Take every signal. No filter."),
        ("Only after 1+ loss", only_after_loss, "Only trade if previous trade was a loss. Mean-reversion logic."),
        ("Only after 2+ losses", only_after_2plus_losses, "Only trade after 2+ consecutive losses. Strongest mean-reversion signal."),
        ("Skip after 2 wins", skip_after_2wins, "Skip if last 2 trades were wins (exactly 2, not 3+). Avoids exhaustion."),
        ("Combined Markov", combined, "Skip after exactly 2 wins + always take after 2+ losses."),
        ("Only after win (momentum)", only_after_win, "Only trade if previous was a win. Momentum logic."),
        ("After loss + score≥4", after_loss_high_score, "Mean-reversion + require score ≥ 4 for quality filter."),
    ]

    strategies = []
    for name, rule, desc in strategy_defs:
        result = evaluate_strategy(trades, outcomes, rule)
        if result:
            result["name"] = name
            result["description"] = desc
            strategies.append(result)

    # Chi-square significance
    ww = transition["W_to_W"]
    wl = transition["W_to_L"]
    lw = transition["L_to_W"]
    ll = transition["L_to_L"]
    total = ww + wl + lw + ll
    row_w = ww + wl
    row_l = lw + ll
    col_w = ww + lw
    col_l = wl + ll
    e_ww = row_w * col_w / total
    e_wl = row_w * col_l / total
    e_lw = row_l * col_w / total
    e_ll = row_l * col_l / total
    chi2 = (ww-e_ww)**2/e_ww + (wl-e_wl)**2/e_wl + (lw-e_lw)**2/e_lw + (ll-e_ll)**2/e_ll

    output = {
        "metadata": {
            "source": "SPX Overnight Vanilla (1-day hold)",
            "totalTrades": n,
            "baselineWinRate": round(sum(outcomes) / n * 100, 1),
            "baselineTotalPnl": round(sum(t["pnlDollar"] for t in trades), 0),
            "baselineAvgR": round(sum(t["pnlR"] for t in trades) / n, 3),
            "dataRange": f"{trades[0]['entryDate']} to {trades[-1]['entryDate']}",
            "riskPerTrade": 100,
        },
        "transitionMatrix": transition,
        "chiSquare": round(chi2, 2),
        "significant": chi2 > 3.84,
        "streaks": streaks,
        "strategies": strategies,
        "sizing": compute_sizing(trades, outcomes),
    }

    out_path = PUBLIC_DIR / "markov_data.json"
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"Written: {out_path}")
    print(f"  {n} trades, chi2={chi2:.2f}, significant={chi2 > 3.84}")
    print(f"  Best strategy: {max((s for s in strategies if 'Baseline' not in s['name']), key=lambda s: s['totalPnl'])['name']} (total=${max((s for s in strategies if 'Baseline' not in s['name']), key=lambda s: s['totalPnl'])['totalPnl']})")


if __name__ == "__main__":
    main()
