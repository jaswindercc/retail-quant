#!/usr/bin/env python3
"""
Swing Trade Simulator
Reads positions from Google Sheet, checks daily price action,
applies trailing SL logic from backtests, records outcomes.

Trailing SL rules (from backtests):
- MA Bounce / Breakout: trail activates at 2.5R, trail = EMA20 - 1×ATR
- Higher High: trail activates at 3.0R, trail = EMA20 - 2×ATR
- Default: trail activates at 2.5R, trail = EMA20 - 1×ATR
"""

import argparse
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import yfinance as yf

NY_TZ = ZoneInfo("America/New_York")

# Google Sheet — must be shared as "Anyone with the link" (viewer)
SHEET_ID = "1-Y1lz2LRYb_NpLBDdhWDOJF6xS4MYjQ8IeNHOKyx-O0"
SHEET_CSV_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv"

# Trail parameters — single rule for all strategies
TRAIL_PARAMS = {
    "default": {"trail_start_r": 2.5, "trail_atr_buf": 1.0},
}


def read_sheet():
    """Read the Google Sheet as CSV."""
    try:
        df = pd.read_csv(SHEET_CSV_URL)
    except Exception as e:
        print(f"  ❌ Failed to read Google Sheet: {e}")
        sys.exit(1)

    # Normalize column names
    df.columns = df.columns.str.strip()

    # Expected columns: Date, Time, Ticket, Buy, INITIALSL, Qty, Strategy, Why Opened, Why Closed
    required = ["Date", "Ticket", "Buy", "INITIALSL"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        print(f"  ❌ Missing columns: {missing}")
        print(f"  Found: {list(df.columns)}")
        sys.exit(1)

    # Parse dates
    df["Date"] = pd.to_datetime(df["Date"], format="mixed", dayfirst=False)
    df["Buy"] = pd.to_numeric(df["Buy"], errors="coerce")
    df["INITIALSL"] = pd.to_numeric(df["INITIALSL"], errors="coerce")
    df["Qty"] = pd.to_numeric(df.get("Qty", 1), errors="coerce").fillna(1).astype(int)
    df["Strategy"] = df.get("Strategy", "default").fillna("default").astype(str).str.strip()

    # Optional manual exit columns
    if "Stop Price" in df.columns:
        df["Stop Price"] = pd.to_numeric(df["Stop Price"], errors="coerce")
    else:
        df["Stop Price"] = float("nan")
    if "Stop Date" in df.columns:
        df["Stop Date"] = pd.to_datetime(df["Stop Date"], format="mixed", dayfirst=False, errors="coerce")
    else:
        df["Stop Date"] = pd.NaT

    # Drop rows with missing critical data
    df = df.dropna(subset=["Date", "Buy", "INITIALSL", "Ticket"])
    df["Ticket"] = df["Ticket"].str.strip().str.upper()

    return df


def get_trail_params(strategy):
    """Get trailing stop parameters — single rule for all."""
    return TRAIL_PARAMS["default"]


def fetch_price_data(ticker, start_date):
    """Fetch daily OHLC from entry date to today."""
    try:
        end = datetime.now(NY_TZ).strftime("%Y-%m-%d")
        df = yf.download(ticker, start=start_date.strftime("%Y-%m-%d"), end=end,
                         progress=False, auto_adjust=True)
        if df.empty:
            return None
        # Flatten MultiIndex columns if present
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        df.index = pd.to_datetime(df.index).tz_localize(None)
        return df
    except Exception as e:
        print(f"    ⚠️ Failed to fetch {ticker}: {e}")
        return None


def compute_ema(series, period=20):
    """Compute EMA."""
    return series.ewm(span=period, adjust=False).mean()


def compute_atr(df, period=14):
    """Compute ATR."""
    high = df["High"]
    low = df["Low"]
    close = df["Close"].shift(1)
    tr = pd.concat([high - low, (high - close).abs(), (low - close).abs()], axis=1).max(axis=1)
    return tr.rolling(period).mean()


def simulate_position(entry_date, ticker, entry_price, initial_sl, strategy, qty):
    """
    Simulate a single position day by day.
    Returns dict with outcome details.
    """
    params = get_trail_params(strategy)
    trail_start_r = params["trail_start_r"]
    trail_atr_buf = params["trail_atr_buf"]

    # Risk per share
    risk = entry_price - initial_sl
    if risk <= 0:
        return {
            "ticker": ticker, "entry_date": entry_date.strftime("%Y-%m-%d"),
            "entry_price": entry_price, "initial_sl": initial_sl,
            "status": "ERROR", "reason": "SL >= Entry (invalid)",
            "exit_date": None, "exit_price": None, "pnl": 0, "r_multiple": 0,
            "max_r": 0, "days_held": 0, "trail_activated": False,
            "strategy": strategy, "qty": qty, "daily_log": []
        }

    # Fetch data from 50 bars before entry (for EMA/ATR warmup)
    fetch_start = entry_date - timedelta(days=80)
    df = fetch_price_data(ticker, fetch_start)
    if df is None or len(df) < 20:
        return {
            "ticker": ticker, "entry_date": entry_date.strftime("%Y-%m-%d"),
            "entry_price": entry_price, "initial_sl": initial_sl,
            "status": "ERROR", "reason": "No price data available",
            "exit_date": None, "exit_price": None, "pnl": 0, "r_multiple": 0,
            "max_r": 0, "days_held": 0, "trail_activated": False,
            "strategy": strategy, "qty": qty, "daily_log": []
        }

    # Compute indicators on full data
    df["EMA20"] = compute_ema(df["Close"], 20)
    df["ATR14"] = compute_atr(df, 14)

    # Only process bars from entry date onward
    trade_bars = df[df.index >= pd.Timestamp(entry_date)]
    if trade_bars.empty:
        return {
            "ticker": ticker, "entry_date": entry_date.strftime("%Y-%m-%d"),
            "entry_price": entry_price, "initial_sl": initial_sl,
            "status": "OPEN", "reason": "No bars since entry (market closed?)",
            "exit_date": None, "exit_price": None, "pnl": 0, "r_multiple": 0,
            "max_r": 0, "days_held": 0, "trail_activated": False,
            "strategy": strategy, "qty": qty, "daily_log": []
        }

    # Simulate day by day
    current_sl = initial_sl
    trail_active = False
    max_price = entry_price
    daily_log = []
    status = "OPEN"
    exit_date = None
    exit_price = None
    reason = "Still holding"

    for i, (date, bar) in enumerate(trade_bars.iterrows()):
        if i == 0:
            # Skip entry day (we entered at open/close, just record)
            daily_log.append({
                "date": date.strftime("%Y-%m-%d"),
                "close": round(float(bar["Close"]), 2),
                "sl": round(current_sl, 2),
                "trail_active": trail_active,
                "note": "Entry day"
            })
            continue

        day_open = float(bar["Open"])
        day_low = float(bar["Low"])
        day_high = float(bar["High"])
        day_close = float(bar["Close"])
        ema20 = float(bar["EMA20"]) if pd.notna(bar["EMA20"]) else None
        atr14 = float(bar["ATR14"]) if pd.notna(bar["ATR14"]) else None

        # Update max price
        max_price = max(max_price, day_high)
        unrealized_r = (day_high - entry_price) / risk

        # Check if gap down below SL (open < SL)
        if day_open <= current_sl:
            exit_price = day_open  # Gap fill at open
            exit_date = date
            status = "CLOSED"
            reason = "Trail SL (gap)" if trail_active else "Initial SL (gap)"
            daily_log.append({
                "date": date.strftime("%Y-%m-%d"),
                "close": round(day_close, 2),
                "sl": round(current_sl, 2),
                "trail_active": trail_active,
                "note": f"EXIT: {reason} @ ${exit_price:.2f}"
            })
            break

        # Check if low touches SL
        if day_low <= current_sl:
            exit_price = current_sl  # Assume fill at SL
            exit_date = date
            status = "CLOSED"
            reason = "Trail SL" if trail_active else "Initial SL"
            daily_log.append({
                "date": date.strftime("%Y-%m-%d"),
                "close": round(day_close, 2),
                "sl": round(current_sl, 2),
                "trail_active": trail_active,
                "note": f"EXIT: {reason} @ ${exit_price:.2f}"
            })
            break

        # Update trailing SL
        if ema20 and atr14:
            current_unrealized_r = (day_close - entry_price) / risk
            if current_unrealized_r >= trail_start_r:
                trail_active = True
                new_tsl = ema20 - trail_atr_buf * atr14
                if new_tsl > current_sl:
                    current_sl = new_tsl

        daily_log.append({
            "date": date.strftime("%Y-%m-%d"),
            "close": round(day_close, 2),
            "sl": round(current_sl, 2),
            "trail_active": trail_active,
            "note": f"R={current_unrealized_r:.1f}" if ema20 else ""
        })

    # Calculate P&L
    if exit_price is not None:
        pnl_per_share = exit_price - entry_price
    else:
        # Still open — use last close
        last_close = float(trade_bars.iloc[-1]["Close"])
        pnl_per_share = last_close - entry_price
        exit_price = last_close

    pnl = pnl_per_share * qty
    r_multiple = pnl_per_share / risk if risk > 0 else 0
    max_r = (max_price - entry_price) / risk if risk > 0 else 0
    days_held = len(trade_bars) - 1  # Exclude entry day

    # Last known price and its date
    last_bar_date = trade_bars.index[-1]
    last_price = float(trade_bars.iloc[-1]["Close"])
    price_age_days = (pd.Timestamp(datetime.now(NY_TZ).date()) - last_bar_date).days

    return {
        "ticker": ticker,
        "entry_date": entry_date.strftime("%Y-%m-%d"),
        "entry_price": round(entry_price, 2),
        "initial_sl": round(initial_sl, 2),
        "current_sl": round(current_sl, 2),
        "last_price": round(last_price, 2),
        "last_price_date": last_bar_date.strftime("%Y-%m-%d"),
        "price_age_days": price_age_days,
        "status": status,
        "reason": reason,
        "exit_date": exit_date.strftime("%Y-%m-%d") if exit_date else None,
        "exit_price": round(exit_price, 2) if exit_price else None,
        "pnl": round(pnl, 2),
        "pnl_per_share": round(pnl_per_share, 2),
        "r_multiple": round(r_multiple, 2),
        "max_r": round(max_r, 2),
        "risk_per_share": round(risk, 2),
        "days_held": days_held,
        "trail_activated": trail_active,
        "strategy": strategy,
        "qty": qty,
        "trail_params": params,
        "daily_log": daily_log
    }


def main():
    parser = argparse.ArgumentParser(description="Swing Trade Simulator")
    parser.add_argument("--output", default="data/sim_data.json")
    args = parser.parse_args()

    print("=" * 60)
    print("  📊 SWING TRADE SIMULATOR")
    print("=" * 60)
    now_ny = datetime.now(NY_TZ)
    print(f"  Date: {now_ny.strftime('%Y-%m-%d %I:%M %p %Z')}")
    print()

    # Read positions from Google Sheet
    print("  📋 Reading positions from Google Sheet...")
    positions = read_sheet()
    print(f"  Found {len(positions)} positions")
    print()

    # Simulate each position
    results = []
    for _, row in positions.iterrows():
        ticker = row["Ticket"]
        entry_date = row["Date"]
        entry_price = row["Buy"]
        initial_sl = row["INITIALSL"]
        strategy = row["Strategy"]
        qty = int(row["Qty"])
        manual_stop_price = row["Stop Price"] if pd.notna(row["Stop Price"]) else None
        manual_stop_date = row["Stop Date"] if pd.notna(row["Stop Date"]) else None

        print(f"  🔄 {ticker} | Entry ${entry_price:.2f} | SL ${initial_sl:.2f} | {strategy}")

        # If manually closed (Stop Price + Stop Date filled), skip simulation
        if manual_stop_price is not None and manual_stop_date is not None:
            risk = entry_price - initial_sl
            pnl_per_share = manual_stop_price - entry_price
            result = {
                "ticker": ticker,
                "entry_date": entry_date.strftime("%Y-%m-%d"),
                "entry_price": round(entry_price, 2),
                "initial_sl": round(initial_sl, 2),
                "current_sl": round(initial_sl, 2),
                "last_price": round(manual_stop_price, 2),
                "last_price_date": manual_stop_date.strftime("%Y-%m-%d"),
                "price_age_days": (pd.Timestamp(datetime.now(NY_TZ).date()) - pd.Timestamp(manual_stop_date)).days,
                "status": "CLOSED",
                "reason": "Manual exit",
                "exit_date": manual_stop_date.strftime("%Y-%m-%d"),
                "exit_price": round(manual_stop_price, 2),
                "pnl": round(pnl_per_share * qty, 2),
                "pnl_per_share": round(pnl_per_share, 2),
                "r_multiple": round(pnl_per_share / risk, 2) if risk > 0 else 0,
                "max_r": 0,
                "risk_per_share": round(risk, 2),
                "days_held": (pd.Timestamp(manual_stop_date) - pd.Timestamp(entry_date)).days,
                "trail_activated": False,
                "strategy": strategy,
                "qty": qty,
                "trail_params": get_trail_params(strategy),
                "daily_log": []
            }
            print(f"     📝 MANUAL EXIT: ${manual_stop_price:.2f} on {manual_stop_date.strftime('%Y-%m-%d')} | R={result['r_multiple']:.1f} | PnL ${result['pnl']:.2f}")
        else:
            result = simulate_position(entry_date, ticker, entry_price, initial_sl, strategy, qty)
            status_icon = {"OPEN": "🟢", "CLOSED": "🔴", "ERROR": "⚠️"}[result["status"]]
            print(f"     {status_icon} {result['status']}: {result['reason']} | R={result['r_multiple']:.1f} | PnL ${result['pnl']:.2f}")

        results.append(result)

    # Summary stats
    closed = [r for r in results if r["status"] == "CLOSED"]
    open_pos = [r for r in results if r["status"] == "OPEN"]
    winners = [r for r in closed if r["pnl"] > 0]
    losers = [r for r in closed if r["pnl"] <= 0]

    total_pnl = sum(r["pnl"] for r in closed)
    avg_r = sum(r["r_multiple"] for r in closed) / len(closed) if closed else 0
    win_rate = len(winners) / len(closed) * 100 if closed else 0

    print()
    print("=" * 60)
    print(f"  📊 SUMMARY")
    print(f"  Total positions: {len(results)}")
    print(f"  Open: {len(open_pos)} | Closed: {len(closed)}")
    print(f"  Winners: {len(winners)} | Losers: {len(losers)}")
    print(f"  Win Rate: {win_rate:.0f}%")
    print(f"  Total PnL: ${total_pnl:.2f}")
    print(f"  Avg R: {avg_r:.2f}")
    print("=" * 60)

    # Build output JSON
    output = {
        "lastUpdated": now_ny.strftime("%Y-%m-%d %I:%M %p %Z"),
        "summary": {
            "total_positions": len(results),
            "open": len(open_pos),
            "closed": len(closed),
            "winners": len(winners),
            "losers": len(losers),
            "win_rate": round(win_rate, 1),
            "total_pnl": round(total_pnl, 2),
            "avg_r": round(avg_r, 2),
            "best_trade": max((r["r_multiple"] for r in closed), default=0),
            "worst_trade": min((r["r_multiple"] for r in closed), default=0),
            "avg_days_held": round(sum(r["days_held"] for r in closed) / len(closed), 1) if closed else 0,
        },
        "positions": results,
        "trailRules": {
            "All strategies": "Trail activates at 2.5R, trail = EMA20 - 1×ATR (ratchets up only)",
        }
    }

    # Save
    out_path = Path(args.output)
    out_path.parent.mkdir(exist_ok=True)
    out_path.write_text(json.dumps(output, indent=2))
    print(f"\n  ✅ Saved to {out_path}")

    # Also copy to dashboard
    dash_path = Path("dashboard/public/sim_data.json")
    dash_path.write_text(json.dumps(output, indent=2))
    print(f"  ✅ Copied to {dash_path}")


if __name__ == "__main__":
    main()
