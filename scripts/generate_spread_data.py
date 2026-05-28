#!/usr/bin/env python3
"""Bull Put Spread Backtest — Deep backtest on liquid stocks.

Tests selling weekly/monthly put spreads at various distances below current price.
Uses historical realized volatility to estimate option premiums via Black-Scholes.

Usage:
    python3 scripts/generate_spread_data.py                    # Default: TSLA
    python3 scripts/generate_spread_data.py --ticker NVDA
    python3 scripts/generate_spread_data.py --ticker QQQ --otm 3 5 7 10
"""
import argparse
import json
import math
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

OUT_DIR = Path(__file__).resolve().parent.parent / "dashboard" / "public"

# ─── Black-Scholes helpers ───

def norm_cdf(x):
    """Standard normal CDF (no scipy dependency)."""
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))

def bs_put_price(S, K, T, r, sigma):
    """Black-Scholes put price."""
    if T <= 0 or sigma <= 0:
        return max(K - S, 0)
    d1 = (math.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)
    return K * math.exp(-r * T) * norm_cdf(-d2) - S * norm_cdf(-d1)

def estimate_credit(S, short_K, long_K, T, sigma, r=0.05):
    """Estimate bull put spread credit (short put - long put)."""
    short_put = bs_put_price(S, short_K, T, r, sigma)
    long_put = bs_put_price(S, long_K, T, r, sigma)
    return max(short_put - long_put, 0.01)


# ─── Backtest engine ───

def compute_realized_vol(prices, window=30):
    """Rolling realized volatility (annualized)."""
    returns = np.log(prices / prices.shift(1))
    return returns.rolling(window).std() * np.sqrt(252)


def backtest_spread(df, otm_pct=5, spread_width=5, dte=30, entry_freq=7, iv_mult=1.3):
    """
    Backtest bull put spread strategy.
    
    Args:
        df: DataFrame with Date, Close columns
        otm_pct: short strike distance below current price (%)
        spread_width: width of spread in dollars
        dte: days to expiration
        entry_freq: enter a new spread every N calendar days
        iv_mult: IV multiplier over realized vol (IV is usually higher)
    """
    trades = []
    df = df.copy().reset_index(drop=True)
    df['rvol'] = compute_realized_vol(df['Close'], window=30)
    
    i = 60  # start after enough data for vol calc
    while i < len(df) - dte:
        entry_row = df.iloc[i]
        entry_date = entry_row['Date']
        entry_price = entry_row['Close']
        rvol = entry_row['rvol']
        
        if pd.isna(rvol) or rvol <= 0:
            i += entry_freq
            continue
        
        # Estimate IV as multiple of realized vol
        iv = rvol * iv_mult
        
        # Define strikes
        short_strike = round(entry_price * (1 - otm_pct / 100), 2)
        long_strike = short_strike - spread_width
        
        # Estimate credit received (Black-Scholes)
        T = dte / 365
        credit = estimate_credit(entry_price, short_strike, long_strike, T, iv)
        credit = round(credit, 2)
        
        max_profit = credit
        max_loss = round(spread_width - credit, 2)
        
        # Find expiry price (dte calendar days later)
        expiry_idx = None
        target_date = entry_date + timedelta(days=dte)
        for j in range(i + 1, min(i + dte + 15, len(df))):
            if df.iloc[j]['Date'] >= target_date:
                expiry_idx = j
                break
        
        if expiry_idx is None:
            i += entry_freq
            continue
        
        expiry_row = df.iloc[expiry_idx]
        expiry_price = expiry_row['Close']
        expiry_date = expiry_row['Date']
        
        # Find lowest price during the trade (for drawdown/touch analysis)
        period_slice = df.iloc[i:expiry_idx + 1]
        low_during = period_slice['Close'].min()
        
        # Did price touch short strike during the trade?
        touched_short = low_during <= short_strike
        touched_long = low_during <= long_strike
        
        # ASSIGNMENT RISK RULE: If short strike is touched, exit at max loss immediately
        if touched_short:
            pnl = -max_loss
            outcome = 'MAX_LOSS'
            # Find the actual date it was touched for accurate reporting
            touch_idx = period_slice[period_slice['Close'] <= short_strike].index[0]
            expiry_price = df.iloc[touch_idx]['Close']
            expiry_date = df.iloc[touch_idx]['Date']
        elif expiry_price >= short_strike:
            # Both puts expire worthless — full profit
            pnl = credit
            outcome = 'WIN'
        elif expiry_price <= long_strike:
            # Max loss
            pnl = -max_loss
            outcome = 'MAX_LOSS'
        else:
            # Partial loss: short put ITM, long put OTM
            intrinsic = short_strike - expiry_price
            pnl = round(credit - intrinsic, 2)
            outcome = 'PARTIAL_LOSS' if pnl < 0 else 'WIN'
        
        trades.append({
            'entryDate': entry_date.strftime('%Y-%m-%d') if hasattr(entry_date, 'strftime') else str(entry_date)[:10],
            'expiryDate': expiry_date.strftime('%Y-%m-%d') if hasattr(expiry_date, 'strftime') else str(expiry_date)[:10],
            'entryPrice': round(entry_price, 2),
            'expiryPrice': round(expiry_price, 2),
            'shortStrike': short_strike,
            'longStrike': long_strike,
            'credit': credit,
            'maxProfit': max_profit,
            'maxLoss': max_loss,
            'pnl': pnl,
            'pnlPct': round(pnl / max_loss * 100, 1) if max_loss > 0 else 0,
            'outcome': outcome,
            'iv': round(iv * 100, 1),
            'rvol': round(rvol * 100, 1),
            'lowDuring': round(low_during, 2),
            'touchedShort': touched_short,
            'touchedLong': touched_long,
            'move_pct': round((expiry_price - entry_price) / entry_price * 100, 2),
        })
        
        i += entry_freq
    
    return trades


def compute_stats(trades, spread_width):
    """Compute summary statistics for a set of trades."""
    if not trades:
        return {}
    
    pnls = [t['pnl'] for t in trades]
    wins = [t for t in trades if t['outcome'] == 'WIN']
    losses = [t for t in trades if t['outcome'] in ('PARTIAL_LOSS', 'MAX_LOSS')]
    max_losses = [t for t in trades if t['outcome'] == 'MAX_LOSS']
    
    # Equity curve & drawdown
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
    
    # Win/loss streaks
    max_win_streak = 0
    max_loss_streak = 0
    curr_streak = 0
    for t in trades:
        if t['outcome'] == 'WIN':
            curr_streak = curr_streak + 1 if curr_streak > 0 else 1
            max_win_streak = max(max_win_streak, curr_streak)
        else:
            curr_streak = curr_streak - 1 if curr_streak < 0 else -1
            max_loss_streak = max(max_loss_streak, abs(curr_streak))
    
    total_pnl = sum(pnls)
    avg_credit = np.mean([t['credit'] for t in trades])
    
    return {
        'totalTrades': len(trades),
        'wins': len(wins),
        'losses': len(losses),
        'maxLosses': len(max_losses),
        'winRate': round(len(wins) / len(trades) * 100, 1),
        'totalPnl': round(total_pnl, 2),
        'totalPnlPerContract': round(total_pnl * 100, 0),  # per contract ($)
        'avgPnl': round(np.mean(pnls), 2),
        'avgCredit': round(avg_credit, 2),
        'avgWin': round(np.mean([t['pnl'] for t in wins]), 2) if wins else 0,
        'avgLoss': round(np.mean([t['pnl'] for t in losses]), 2) if losses else 0,
        'maxDD': round(max_dd, 2),
        'maxDDPerContract': round(max_dd * 100, 0),
        'profitFactor': round(sum(t['pnl'] for t in wins) / abs(sum(t['pnl'] for t in losses)), 2) if losses else 999,
        'maxWinStreak': max_win_streak,
        'maxLossStreak': max_loss_streak,
        'touchRate': round(len([t for t in trades if t['touchedShort']]) / len(trades) * 100, 1),
        'avgIV': round(np.mean([t['iv'] for t in trades]), 1),
        'equityCurve': [round(e, 2) for e in eq_curve],
    }


def main():
    parser = argparse.ArgumentParser(description='Bull Put Spread Backtest')
    parser.add_argument('--ticker', default='TSLA', help='Stock ticker (default: TSLA)')
    parser.add_argument('--period', default='5y', help='Data period (default: 5y)')
    parser.add_argument('--otm', nargs='+', type=float, default=[3, 5, 7, 10],
                       help='OTM distances to test (default: 3 5 7 10)')
    parser.add_argument('--width', type=float, default=5, help='Spread width in $ (default: 5)')
    parser.add_argument('--dte', type=int, default=30, help='Days to expiration (default: 30)')
    parser.add_argument('--freq', type=int, default=7, help='Entry frequency in days (default: 7 = weekly)')
    parser.add_argument('--iv-mult', type=float, default=1.3, help='IV/RV multiplier (default: 1.3)')
    args = parser.parse_args()

    print("=" * 60)
    print(f"  🔻 BULL PUT SPREAD BACKTEST — {args.ticker}")
    print("=" * 60)
    print(f"  Spread width: ${args.width} | DTE: {args.dte}d | Entry: every {args.freq}d")
    print(f"  OTM levels: {args.otm}%")
    print(f"  IV multiplier: {args.iv_mult}x realized vol")
    print()

    # Download data
    print(f"  📥 Downloading {args.ticker} ({args.period})...")
    df = yf.download(args.ticker, period=args.period, interval='1d', progress=False)
    
    # Flatten MultiIndex columns if present
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0] if c[1] == '' or c[1] == args.ticker else c[0] for c in df.columns]
    
    df = df.reset_index()
    
    # Normalize columns
    col_map = {}
    for c in df.columns:
        cl = str(c).lower().strip()
        if cl == 'date' or cl == 'datetime': col_map[c] = 'Date'
        elif cl in ('close', 'adj close'): col_map[c] = 'Close'
        elif cl == 'high': col_map[c] = 'High'
        elif cl == 'low': col_map[c] = 'Low'
    df = df.rename(columns=col_map)
    
    if 'Date' not in df.columns:
        # Find any datetime column
        for c in df.columns:
            if pd.api.types.is_datetime64_any_dtype(df[c]):
                df = df.rename(columns={c: 'Date'})
                break
        else:
            df = df.reset_index().rename(columns={'index': 'Date'})
    
    df['Date'] = pd.to_datetime(df['Date'])
    df = df.sort_values('Date').reset_index(drop=True)
    
    print(f"  ✅ {len(df)} bars ({df['Date'].iloc[0].strftime('%Y-%m-%d')} → {df['Date'].iloc[-1].strftime('%Y-%m-%d')})")
    print()

    # Run backtests for each OTM level
    all_results = {}
    
    for otm in args.otm:
        trades = backtest_spread(
            df, otm_pct=otm, spread_width=args.width,
            dte=args.dte, entry_freq=args.freq, iv_mult=args.iv_mult
        )
        stats = compute_stats(trades, args.width)
        
        key = f"{otm}pct"
        all_results[key] = {
            'otm_pct': otm,
            'trades': trades,
            'stats': stats,
        }
        
        print(f"  {otm}% OTM: {stats['totalTrades']} trades | WR {stats['winRate']}% | PF {stats['profitFactor']} | Total ${stats['totalPnlPerContract']:.0f}/contract | MaxDD ${stats['maxDDPerContract']:.0f}")
    
    # Build output
    output = {
        'ticker': args.ticker,
        'generatedAt': datetime.now().strftime('%Y-%m-%d %H:%M'),
        'params': {
            'spreadWidth': args.width,
            'dte': args.dte,
            'entryFreq': args.freq,
            'ivMultiplier': args.iv_mult,
            'period': args.period,
            'dataRange': f"{df['Date'].iloc[0].strftime('%Y-%m-%d')} → {df['Date'].iloc[-1].strftime('%Y-%m-%d')}",
            'totalBars': len(df),
        },
        'strategies': all_results,
        'priceData': {
            'dates': [d.strftime('%Y-%m-%d') for d in df['Date'].iloc[::5]],
            'prices': [round(p, 2) for p in df['Close'].iloc[::5]],
        }
    }
    
    out_file = OUT_DIR / f"spread_data_{args.ticker.lower()}.json"
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(out_file, 'w') as f:
        json.dump(output, f, indent=2, default=str)
    
    print(f"\n  💾 Saved to: {out_file}")
    print()
    
    # Summary
    print("  ── SUMMARY ──")
    print(f"  {'OTM%':<6} {'Trades':<8} {'WR':<7} {'PF':<6} {'AvgCredit':<10} {'Total/Contract':<16} {'MaxDD/Contract':<16} {'Touch%':<8}")
    print(f"  {'─'*75}")
    for otm in args.otm:
        s = all_results[f"{otm}pct"]['stats']
        print(f"  {otm:<6} {s['totalTrades']:<8} {s['winRate']:<6}% {s['profitFactor']:<6} ${s['avgCredit']:<9.2f} ${s['totalPnlPerContract']:<15,.0f} ${s['maxDDPerContract']:<15,.0f} {s['touchRate']:<7}%")
    
    print(f"\n  💡 Best risk-adjusted: Usually 5-7% OTM balances premium vs safety")
    print()


if __name__ == '__main__':
    main()
