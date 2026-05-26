#!/usr/bin/env python3
"""Shared execution helpers for backtests.

These helpers enforce broker-realistic assumptions used across strategy scripts:
- If a stop is breached through a gap, fill at the open (worse than stop).
- Keep stop fill logic consistent across all strategy engines.
"""

from datetime import datetime


def gap_stop_fill_long(day_open, stop_price):
    """Return realistic long stop fill for daily bars with possible gaps."""
    return min(day_open, stop_price)


def gap_stop_fill_short(day_open, stop_price):
    """Return realistic short stop fill for daily bars with possible gaps."""
    return max(day_open, stop_price)


def _commission_for_order(qty, commission_per_share=0.0, min_commission_per_order=0.0):
    """Commission for one side of a trade."""
    return max(min_commission_per_order, qty * commission_per_share)


def calc_pnl_with_costs(
    direction,
    entry_price,
    exit_price,
    qty,
    slippage_bps=0.0,
    commission_per_share=0.0,
    min_commission_per_order=0.0,
):
    """Calculate gross/net PnL with configurable slippage and commissions.

    Slippage is applied per side in basis points.
    """
    slip = slippage_bps / 10000.0
    if direction == 'LONG':
        entry_fill = entry_price * (1.0 + slip)
        exit_fill = exit_price * (1.0 - slip)
        gross_pnl = qty * (exit_fill - entry_fill)
    else:
        entry_fill = entry_price * (1.0 - slip)
        exit_fill = exit_price * (1.0 + slip)
        gross_pnl = qty * (entry_fill - exit_fill)

    commission = _commission_for_order(qty, commission_per_share, min_commission_per_order)
    commission += _commission_for_order(qty, commission_per_share, min_commission_per_order)
    net_pnl = gross_pnl - commission

    return {
        'entryFill': entry_fill,
        'exitFill': exit_fill,
        'grossPnl': gross_pnl,
        'netPnl': net_pnl,
        'costs': commission,
        'commission': commission,
    }


def apply_portfolio_constraints(
    trades,
    max_positions=5,
    max_risk_pct=0.02,
    max_gross_exposure_pct=1.0,
    starting_equity=100000.0,
):
    """Filter trades by simple portfolio-level constraints.

    Constraints are enforced at entry time using overlapping open positions.
    """
    if not trades:
        return trades, {'accepted': 0, 'rejected': 0}

    max_risk_dollars = starting_equity * max_risk_pct
    max_gross_exposure = starting_equity * max_gross_exposure_pct

    def _parse_date(d):
        return datetime.strptime(d, '%Y-%m-%d').date()

    ordered = sorted(trades, key=lambda t: (t.get('entryDate', ''), t.get('stock', '')))
    accepted = []
    active = []
    rejected = 0

    for t in ordered:
        if not t.get('entryDate') or not t.get('exitDate'):
            continue

        entry_d = _parse_date(t['entryDate'])

        # Remove positions closed before this entry date.
        active = [a for a in active if _parse_date(a['exitDate']) >= entry_d]

        current_risk = sum(float(a.get('risk', 0.0)) * float(a.get('qty', 0.0)) for a in active)
        current_gross = sum(float(a.get('entryPrice', 0.0)) * float(a.get('qty', 0.0)) for a in active)

        trade_risk = float(t.get('risk', 0.0)) * float(t.get('qty', 0.0))
        trade_gross = float(t.get('entryPrice', 0.0)) * float(t.get('qty', 0.0))

        if len(active) >= max_positions:
            rejected += 1
            continue
        if current_risk + trade_risk > max_risk_dollars:
            rejected += 1
            continue
        if current_gross + trade_gross > max_gross_exposure:
            rejected += 1
            continue

        accepted.append(t)
        active.append(t)

    return accepted, {'accepted': len(accepted), 'rejected': rejected}
