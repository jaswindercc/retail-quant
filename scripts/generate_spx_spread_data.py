#!/usr/bin/env python3
"""SPX Options Income Backtest — Delta-based, liquid strikes only.

RULES:
- Only trade strikes with delta >= 0.20 (liquid, tight bid-ask)
- Strategies: Put Spreads (20Δ, 30Δ, 40Δ), Iron Condor (20Δ, 30Δ), Iron Fly (50Δ)
- SPX = European-style, cash-settled, NO assignment risk
- Management: 50% profit take / 2× credit stop loss
- Position size: 1 contract per trade

Usage:
    python3 scripts/generate_spx_spread_data.py
"""
import argparse
import json
import math
from datetime import timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

OUT_DIR = Path(__file__).resolve().parent.parent / "dashboard" / "public"


# ─── Black-Scholes ───

def norm_cdf(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))

def bs_put_price(S, K, T, r, sigma):
    if T <= 0 or sigma <= 0:
        return max(K - S, 0)
    d1 = (math.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)
    return K * math.exp(-r * T) * norm_cdf(-d2) - S * norm_cdf(-d1)

def bs_call_price(S, K, T, r, sigma):
    if T <= 0 or sigma <= 0:
        return max(S - K, 0)
    d1 = (math.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)
    return S * norm_cdf(d1) - K * math.exp(-r * T) * norm_cdf(d2)

def put_delta(S, K, T, r, sigma):
    """Delta of put option (returns negative value)."""
    if T <= 0 or sigma <= 0:
        return -1.0 if K > S else 0.0
    d1 = (math.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * math.sqrt(T))
    return norm_cdf(d1) - 1

def call_delta(S, K, T, r, sigma):
    """Delta of call option (returns positive value)."""
    if T <= 0 or sigma <= 0:
        return 1.0 if S > K else 0.0
    d1 = (math.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * math.sqrt(T))
    return norm_cdf(d1)

def find_strike_by_put_delta(S, target_delta, T, r, sigma):
    """Find strike K where put has given |delta|. Returns strike rounded to $5."""
    low_K = S * 0.70
    high_K = S * 1.0
    target = -target_delta
    
    for _ in range(100):
        mid_K = (low_K + high_K) / 2
        d = put_delta(S, mid_K, T, r, sigma)
        if d < target:
            high_K = mid_K
        else:
            low_K = mid_K
        if abs(high_K - low_K) < 0.5:
            break
    
    return round(mid_K / 5) * 5

def find_strike_by_call_delta(S, target_delta, T, r, sigma):
    """Find strike K where call has given delta. Returns strike rounded to $5."""
    low_K = S * 1.0
    high_K = S * 1.30
    
    for _ in range(100):
        mid_K = (low_K + high_K) / 2
        d = call_delta(S, mid_K, T, r, sigma)
        if d > target_delta:
            low_K = mid_K
        else:
            high_K = mid_K
        if abs(high_K - low_K) < 0.5:
            break
    
    return round(mid_K / 5) * 5

def compute_realized_vol(prices, window=30):
    returns = np.log(prices / prices.shift(1))
    return returns.rolling(window).std() * np.sqrt(252)


# ─── Strategy configurations ───

STRATEGIES = {
    'put_spread_20d': {
        'label': 'Put Spread 20Δ',
        'desc': '45 DTE, sell 20-delta put, buy $5 lower. Bread-and-butter income trade.',
        'type': 'put_spread',
        'dte': 45, 'sell_delta': 0.20, 'width': 5, 'freq': 7,
        'take_profit': 0.50, 'stop_loss': 2.0,
    },
    'put_spread_30d': {
        'label': 'Put Spread 30Δ',
        'desc': '45 DTE, sell 30-delta put, buy $5 lower. More premium, more directional risk.',
        'type': 'put_spread',
        'dte': 45, 'sell_delta': 0.30, 'width': 5, 'freq': 7,
        'take_profit': 0.50, 'stop_loss': 2.0,
    },
    'put_spread_40d': {
        'label': 'Put Spread 40Δ',
        'desc': '45 DTE, sell 40-delta put, buy $5 lower. Near ATM, high premium.',
        'type': 'put_spread',
        'dte': 45, 'sell_delta': 0.40, 'width': 5, 'freq': 7,
        'take_profit': 0.50, 'stop_loss': 2.0,
    },
    'iron_condor_20d': {
        'label': 'Iron Condor 20Δ',
        'desc': '45 DTE, sell 20Δ put + 20Δ call, $5 wings. Neutral income.',
        'type': 'iron_condor',
        'dte': 45, 'sell_delta': 0.20, 'width': 5, 'freq': 7,
        'take_profit': 0.50, 'stop_loss': 2.0,
    },
    'iron_condor_30d': {
        'label': 'Iron Condor 30Δ',
        'desc': '45 DTE, sell 30Δ put + 30Δ call, $5 wings. More premium, tighter range.',
        'type': 'iron_condor',
        'dte': 45, 'sell_delta': 0.30, 'width': 5, 'freq': 7,
        'take_profit': 0.50, 'stop_loss': 2.0,
    },
    'iron_fly': {
        'label': 'Iron Fly 50Δ (ATM)',
        'desc': '45 DTE, sell ATM put + ATM call (50Δ), $5 wings. Maximum premium.',
        'type': 'iron_fly',
        'dte': 45, 'sell_delta': 0.50, 'width': 5, 'freq': 7,
        'take_profit': 0.25, 'stop_loss': 1.5,
    },
}


def backtest_strategy(df, config, iv_mult=1.3, max_positions=1):
    """Backtest a delta-based strategy on SPX."""
    dte = config['dte']
    sell_delta = config['sell_delta']
    spread_width = config['width']
    strategy_type = config['type']
    take_profit_pct = config.get('take_profit')
    stop_loss_mult = config.get('stop_loss')
    
    trades = []
    df = df.copy().reset_index(drop=True)
    df['rvol'] = compute_realized_vol(df['Close'], window=30)
    
    # Find first Monday after warmup period
    i = 60
    while i < len(df) - 5 and df.iloc[i]['Date'].weekday() != 0:
        i += 1
    
    def next_monday(idx):
        """Advance to next Monday in the dataframe."""
        idx += 1
        while idx < len(df) and df.iloc[idx]['Date'].weekday() != 0:
            idx += 1
        return idx
    
    while i < len(df) - 5:
        entry_row = df.iloc[i]
        entry_date = entry_row['Date']
        entry_price = entry_row['Close']
        rvol = entry_row['rvol']
        
        # Check how many positions are still open at this entry date
        open_count = sum(1 for t in trades if pd.Timestamp(t['exitDate']) > pd.Timestamp(entry_date))
        if open_count >= max_positions:
            i = next_monday(i)
            continue
        
        if pd.isna(rvol) or rvol <= 0:
            i = next_monday(i)
            continue
        
        iv = rvol * iv_mult
        T = dte / 365
        r = 0.05
        
        # === FIND STRIKES BY DELTA ===
        if strategy_type == 'put_spread':
            short_put_K = find_strike_by_put_delta(entry_price, sell_delta, T, r, iv)
            long_put_K = short_put_K - spread_width
            short_call_K = None
            long_call_K = None
            
            actual_delta = abs(put_delta(entry_price, short_put_K, T, r, iv))
            credit = bs_put_price(entry_price, short_put_K, T, r, iv) - bs_put_price(entry_price, long_put_K, T, r, iv)
            credit = round(max(credit, 0.10), 2)
            max_loss = round(spread_width - credit, 2)
            
        elif strategy_type == 'iron_condor':
            short_put_K = find_strike_by_put_delta(entry_price, sell_delta, T, r, iv)
            long_put_K = short_put_K - spread_width
            short_call_K = find_strike_by_call_delta(entry_price, sell_delta, T, r, iv)
            long_call_K = short_call_K + spread_width
            
            actual_delta = abs(put_delta(entry_price, short_put_K, T, r, iv))
            put_credit = bs_put_price(entry_price, short_put_K, T, r, iv) - bs_put_price(entry_price, long_put_K, T, r, iv)
            call_credit = bs_call_price(entry_price, short_call_K, T, r, iv) - bs_call_price(entry_price, long_call_K, T, r, iv)
            credit = round(max(put_credit + call_credit, 0.10), 2)
            max_loss = round(spread_width - credit, 2)
            
        elif strategy_type == 'iron_fly':
            atm_K = round(entry_price / 5) * 5
            short_put_K = atm_K
            short_call_K = atm_K
            long_put_K = atm_K - spread_width
            long_call_K = atm_K + spread_width
            
            actual_delta = abs(put_delta(entry_price, short_put_K, T, r, iv))
            put_credit = bs_put_price(entry_price, short_put_K, T, r, iv) - bs_put_price(entry_price, long_put_K, T, r, iv)
            call_credit = bs_call_price(entry_price, short_call_K, T, r, iv) - bs_call_price(entry_price, long_call_K, T, r, iv)
            credit = round(max(put_credit + call_credit, 0.10), 2)
            max_loss = round(spread_width - credit, 2)
        
        # Skip tiny credits (unrealistic to trade)
        if credit < 0.50:
            i = next_monday(i)
            continue
        
        # Find expiry index
        expiry_idx = None
        target_date = entry_date + timedelta(days=dte)
        for j in range(i + 1, min(i + dte + 15, len(df))):
            if df.iloc[j]['Date'] >= target_date:
                expiry_idx = j
                break
        
        if expiry_idx is None:
            i = next_monday(i)
            continue
        
        # === DAILY MANAGEMENT ===
        exit_date = None
        exit_price = None
        exit_reason = None
        pnl = None
        
        for day_idx in range(i + 1, expiry_idx + 1):
            day_price = df.iloc[day_idx]['Close']
            day_date = df.iloc[day_idx]['Date']
            
            remaining_dte = max((target_date - day_date).days, 0)
            T_rem = max(remaining_dte / 365, 1/365)
            
            if strategy_type == 'put_spread':
                current_value = bs_put_price(day_price, short_put_K, T_rem, r, iv) - bs_put_price(day_price, long_put_K, T_rem, r, iv)
            else:
                put_val = bs_put_price(day_price, short_put_K, T_rem, r, iv) - bs_put_price(day_price, long_put_K, T_rem, r, iv)
                call_val = bs_call_price(day_price, short_call_K, T_rem, r, iv) - bs_call_price(day_price, long_call_K, T_rem, r, iv)
                current_value = put_val + call_val
            
            current_pnl = credit - current_value
            
            if take_profit_pct and current_pnl >= credit * take_profit_pct:
                exit_date = day_date
                exit_price = day_price
                exit_reason = 'TAKE_PROFIT'
                pnl = round(current_pnl, 2)
                break
            
            if stop_loss_mult and current_pnl <= -(credit * stop_loss_mult):
                exit_date = day_date
                exit_price = day_price
                exit_reason = 'STOP_LOSS'
                pnl = round(current_pnl, 2)
                break
        
        # Expiration settlement
        if exit_reason is None:
            exit_date = df.iloc[expiry_idx]['Date']
            exit_price = df.iloc[expiry_idx]['Close']
            
            if strategy_type == 'put_spread':
                if exit_price >= short_put_K:
                    pnl = credit
                    exit_reason = 'EXPIRED_OTM'
                elif exit_price <= long_put_K:
                    pnl = -max_loss
                    exit_reason = 'MAX_LOSS'
                else:
                    intrinsic = short_put_K - exit_price
                    pnl = round(credit - intrinsic, 2)
                    exit_reason = 'PARTIAL' if pnl < 0 else 'EXPIRED_OTM'
            else:
                put_intr = max(short_put_K - exit_price, 0) - max(long_put_K - exit_price, 0)
                call_intr = max(exit_price - short_call_K, 0) - max(exit_price - long_call_K, 0)
                total_intr = put_intr + call_intr
                pnl = round(credit - total_intr, 2)
                pnl = max(pnl, -max_loss)
                if pnl >= credit * 0.9:
                    exit_reason = 'EXPIRED_OTM'
                elif pnl <= -max_loss * 0.9:
                    exit_reason = 'MAX_LOSS'
                else:
                    exit_reason = 'PARTIAL'
        
        outcome = 'WIN' if pnl > 0 else 'LOSS'
        
        try:
            days_held = (pd.Timestamp(exit_date) - pd.Timestamp(entry_date)).days
        except:
            days_held = dte
        
        trades.append({
            'entryDate': entry_date.strftime('%Y-%m-%d') if hasattr(entry_date, 'strftime') else str(entry_date)[:10],
            'exitDate': exit_date.strftime('%Y-%m-%d') if hasattr(exit_date, 'strftime') else str(exit_date)[:10],
            'entryPrice': round(entry_price, 2),
            'exitPrice': round(exit_price, 2),
            'shortPutK': short_put_K,
            'longPutK': long_put_K,
            'shortCallK': short_call_K,
            'longCallK': long_call_K,
            'delta': round(actual_delta * 100, 1),
            'credit': credit,
            'creditDollars': round(credit * 100, 0),
            'maxLoss': max_loss,
            'maxLossDollars': round(max_loss * 100, 0),
            'pnl': round(pnl, 2),
            'pnlDollars': round(pnl * 100, 0),
            'outcome': outcome,
            'exitReason': exit_reason,
            'iv': round(iv * 100, 1),
            'daysHeld': days_held,
        })
        
        # Advance to next Monday (position limit checked at top of loop)
        i = next_monday(i)
    
    return trades


def compute_stats(trades, config):
    if not trades:
        return {}
    
    spread_width = config['width']
    pnls = [t['pnl'] for t in trades]
    wins = [t for t in trades if t['outcome'] == 'WIN']
    losses = [t for t in trades if t['outcome'] == 'LOSS']
    
    take_profits = [t for t in trades if t['exitReason'] == 'TAKE_PROFIT']
    stop_losses = [t for t in trades if t['exitReason'] == 'STOP_LOSS']
    expired_otm = [t for t in trades if t['exitReason'] == 'EXPIRED_OTM']
    max_loss_exits = [t for t in trades if t['exitReason'] == 'MAX_LOSS']
    
    equity = 0
    peak = 0
    max_dd = 0
    eq_curve = []
    for t in trades:
        equity += t['pnl']
        eq_curve.append(equity)
        if equity > peak:
            peak = equity
        dd = peak - equity
        if dd > max_dd:
            max_dd = dd
    
    max_win_streak = 0
    max_loss_streak = 0
    curr = 0
    for t in trades:
        if t['outcome'] == 'WIN':
            curr = curr + 1 if curr > 0 else 1
            max_win_streak = max(max_win_streak, curr)
        else:
            curr = curr - 1 if curr < 0 else -1
            max_loss_streak = max(max_loss_streak, abs(curr))
    
    total_pnl = sum(pnls)
    avg_credit = np.mean([t['credit'] for t in trades])
    avg_days_held = np.mean([t['daysHeld'] for t in trades])
    avg_delta = np.mean([t['delta'] for t in trades])
    
    total_days = sum(t['daysHeld'] for t in trades)
    years = total_days / 365 if total_days > 0 else 1
    capital_at_risk = spread_width * 100
    annual_return_pct = (total_pnl * 100) / capital_at_risk / max(years, 0.5) * 100
    
    gross_wins = sum(t['pnl'] for t in wins) if wins else 0
    gross_losses = abs(sum(t['pnl'] for t in losses)) if losses else 0.01
    
    return {
        'totalTrades': len(trades),
        'wins': len(wins),
        'losses': len(losses),
        'winRate': round(len(wins) / len(trades) * 100, 1),
        'totalPnl': round(total_pnl, 2),
        'totalPnlPerContract': round(total_pnl * 100, 0),
        'avgPnl': round(np.mean(pnls), 2),
        'avgPnlPerContract': round(np.mean(pnls) * 100, 0),
        'avgCredit': round(avg_credit, 2),
        'avgCreditPerContract': round(avg_credit * 100, 0),
        'avgWin': round(np.mean([t['pnl'] for t in wins]), 2) if wins else 0,
        'avgWinPerContract': round(np.mean([t['pnl'] for t in wins]) * 100, 0) if wins else 0,
        'avgLoss': round(np.mean([t['pnl'] for t in losses]), 2) if losses else 0,
        'avgLossPerContract': round(np.mean([t['pnl'] for t in losses]) * 100, 0) if losses else 0,
        'maxDD': round(max_dd, 2),
        'maxDDPerContract': round(max_dd * 100, 0),
        'maxRiskPerContract': round(spread_width * 100, 0),
        'profitFactor': round(gross_wins / gross_losses, 2) if gross_losses > 0 else 999,
        'maxWinStreak': max_win_streak,
        'maxLossStreak': max_loss_streak,
        'avgDelta': round(avg_delta, 1),
        'avgDaysHeld': round(avg_days_held, 1),
        'avgIV': round(np.mean([t['iv'] for t in trades]), 1),
        'annualReturnPct': round(annual_return_pct, 1),
        'equityCurve': [round(e, 2) for e in eq_curve],
        'takeProfitCount': len(take_profits),
        'stopLossCount': len(stop_losses),
        'expiredOtmCount': len(expired_otm),
        'maxLossCount': len(max_loss_exits),
    }


def main():
    parser = argparse.ArgumentParser(description='SPX Options Income — Delta-based')
    parser.add_argument('--period', default='5y', help='Data period (default: 5y)')
    parser.add_argument('--iv-mult', type=float, default=1.3, help='IV/RV multiplier (default: 1.3)')
    parser.add_argument('--max-positions', type=int, default=1, help='Max concurrent positions (default: 1, max: 4)')
    args = parser.parse_args()
    args.max_positions = min(max(args.max_positions, 1), 4)

    print("=" * 70)
    print("  🔻 SPX OPTIONS INCOME — DELTA-BASED (LIQUID STRIKES ONLY)")
    print("=" * 70)
    print("  European-style, cash-settled → NO assignment risk")
    print("  Minimum delta: 20Δ (no illiquid deep OTM)")
    print("  Strategies: Put Spreads (20/30/40Δ), Iron Condors (20/30Δ), Iron Fly (50Δ)")
    print(f"  IV multiplier: {args.iv_mult}× realized vol")
    print(f"  Max positions: {args.max_positions} concurrent")
    print()

    print(f"  📥 Downloading ^GSPC ({args.period})...")
    df = yf.download('^GSPC', period=args.period, interval='1d', progress=False)
    
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0] for c in df.columns]
    df = df.reset_index()
    
    col_map = {}
    for c in df.columns:
        cl = str(c).lower().strip()
        if cl in ('date', 'index'): col_map[c] = 'Date'
        elif cl == 'close': col_map[c] = 'Close'
    df = df.rename(columns=col_map)
    
    if 'Date' not in df.columns or 'Close' not in df.columns:
        print("  ❌ Could not find Date/Close columns:", df.columns.tolist())
        return
    
    df['Date'] = pd.to_datetime(df['Date'])
    df = df.sort_values('Date').reset_index(drop=True)
    df = df.dropna(subset=['Close'])
    
    print(f"  ✅ {len(df)} bars ({df['Date'].iloc[0].strftime('%Y-%m-%d')} → {df['Date'].iloc[-1].strftime('%Y-%m-%d')})")
    print()

    all_results = {}
    print(f"  {'Strategy':<22s} | {'#':>3s} | {'WR':>6s} | {'PF':>5s} | {'Δ':>5s} | {'Avg Credit':>10s} | {'Risk':>7s} | {'R:R':>5s} | {'Total P&L':>10s} | {'Annual':>7s}")
    print("  " + "─" * 110)
    
    for key, config in STRATEGIES.items():
        trades = backtest_strategy(df, config, iv_mult=args.iv_mult, max_positions=args.max_positions)
        stats = compute_stats(trades, config)
        all_results[key] = {'config': config, 'trades': trades, 'stats': stats}
        
        n = stats.get('totalTrades', 0)
        wr = stats.get('winRate', 0)
        pf = stats.get('profitFactor', 0)
        total = stats.get('totalPnlPerContract', 0)
        avg_credit = stats.get('avgCreditPerContract', 0)
        avg_delta = stats.get('avgDelta', 0)
        risk = stats.get('maxRiskPerContract', 0)
        ratio = f"{risk/avg_credit:.0f}:1" if avg_credit > 0 else "N/A"
        annual = stats.get('annualReturnPct', 0)
        print(f"  {config['label']:<22s} | {n:>3d} | {wr:>5.1f}% | {pf:>5.2f} | {avg_delta:>4.1f}Δ | ${avg_credit:>8,.0f} | ${risk:>5,.0f} | {ratio:>5s} | ${total:>9,.0f} | {annual:>5.1f}%")

    output = {
        'ticker': 'SPX',
        'generatedAt': str(pd.Timestamp.now()),
        'params': {
            'dataRange': args.period,
            'ivMultiplier': args.iv_mult,
            'maxPositions': args.max_positions,
            'totalBars': len(df),
            'entryDay': 'Monday',
            'note': 'Delta-based. Only liquid strikes (≥20Δ). European-style, cash-settled.',
            'management': '50% profit take / 2× credit stop (Iron Fly: 25% take / 1.5× stop)',
        },
        'strategies': all_results,
        'priceData': {
            'dates': [d.strftime('%Y-%m-%d') for d in df['Date'].iloc[::5]],
            'prices': [round(p, 2) for p in df['Close'].iloc[::5]],
        }
    }
    
    out_file = OUT_DIR / "spread_data_spx.json"
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(out_file, 'w') as f:
        json.dump(output, f, indent=2, default=str)
    
    print(f"\n  💾 Saved to: {out_file}")
    print()
    print("  💡 All strikes are ≥ 20Δ = LIQUID (tight bid-ask, easy fills)")
    print("  💡 SPX European-style = NO early assignment risk")
    print("  💡 Credits are REAL $ per contract (×100 multiplier)")


if __name__ == '__main__':
    main()
