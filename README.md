# 📈 retail-quant

**Open-source quantitative trading system built by a retail trader, for retail traders.**

No black boxes. No $500/month subscriptions. Just data, backtests, and a live scanner you can run yourself.

---

## What is this?

A complete trading research platform:

- **10 backtested strategies** across 12 stocks (2021–2026)
- **Overnight scanner** — live signals for SPX, SPY, QQQ with auto-refresh
- **Trailing stop research** — Trail Forever beats everything (19× return/DD ratio)
- **Interactive dashboard** — equity curves, drawdowns, monthly returns, trade logs
- **GitHub Actions** — auto-fetches market data daily at 3:20 PM ET

---

## 🚀 The Overnight Edge

Our best discovery: **buying overnight dips with a trailing stop and never selling** until the trail is hit.

| Config | Trades | Win% | P&L | Max DD | Return/DD |
|--------|--------|------|-----|--------|-----------|
| Vanilla (1d hold) | 264 | 56% | $7,894 | $1,151 | 6.9× |
| Trail 3d | 94 | 69% | $10,084 | $1,087 | 9.3× |
| **Trail Forever** | **90** | **67%** | **$20,193** | **$1,045** | **19.3×** |

> Trail Forever: Let winners run. $20K profit on $100 risk per trade. Max drawdown under $1,100.

---

## 📡 Live Scanner

The scanner tells you **one thing**: should I buy at today's close?

- Scores each day using 10+ signals (VIX panic, RSI oversold, dip-in-uptrend, etc.)
- Score ≥ 3 + SPX > SMA(50) = **BUY**
- Runs on **SPX, SPY, and QQQ** simultaneously
- Auto-refreshes daily via GitHub Actions (fetches from Google Sheets)

```
3:20 PM ET → Data auto-refreshes
3:25 PM ET → Check scanner page
3:50 PM ET → Place MOC order if signal is green
```

---

## 📊 Strategies Included

| # | Strategy | Type | Edge |
|---|----------|------|------|
| 1 | Trend Rider | SMA crossover + trailing stop | Ride trends, cut losers fast |
| 2 | MA Bounce | Mean reversion at moving averages | Buy dips in uptrends |
| 3 | Breakout | Range breakout + volume confirm | Momentum entries |
| 4 | RSI Trend | RSI + trend alignment | Oversold in uptrend |
| 5 | Mean Reversion | Statistical mean reversion | Rubber band snaps back |
| 6 | Trendline | Trendline bounce detection | Support holds |
| 7 | S/R Bounce | Support/resistance levels | Key levels matter |
| 8 | FVG | Fair value gap fills | Imbalance trading |
| 9 | VCP | Volatility contraction pattern | Breakout setup |
| 10 | Volume | Volume profile analysis | Smart money footprint |

---

## 🏗 Project Structure

```
├── dashboard/                 # React + Vite + Recharts
│   ├── src/pages/             # Strategy pages, scanner, trail study
│   ├── src/components/        # Charts, tables, KPI cards
│   └── public/                # Generated JSON data
├── scripts/
│   ├── refresh_scanner.py     # Fetches Google Sheets → runs scanner
│   ├── generate_*.py          # Backtest data generators
│   └── research/              # Exploratory / one-off research scripts
├── data/                      # OHLCV CSVs (SPX, VIX, SPY, QQQ, 12 stocks)
├── .github/workflows/         # Auto-refresh cron job
├── scripts/pinescript/        # TradingView PineScript strategies
└── requirements.txt           # Python dependencies
```

---

## ⚡ Quick Start

```bash
# 1. Generate backtest data
python scripts/generate_data.py

# 2. Run dashboard
cd dashboard && npm install && npm run dev

# 3. Run scanner (fetches live data from Google Sheets)
python scripts/refresh_scanner.py
```

---

## 🔧 Scanner Setup (Google Sheets → Auto-refresh)

1. Create Google Sheets with `=GOOGLEFINANCE()` formulas for SPX, VIX, SPY, QQQ
2. Share sheets as "Anyone with the link"
3. URLs are already configured in `scripts/refresh_scanner.py`
4. GitHub Action runs Mon-Fri at 3:20 PM ET automatically
5. Or trigger manually: Actions tab → Run workflow

---

## 🧠 Key Research Findings

- **Trail Forever is king** — letting winners run indefinitely with a trailing stop beats every fixed holding period
- **SMA(50) filter is non-negotiable** — without regime filtering, trailing stops amplify bear market losses
- **Pause after 2 losses** — stops bleeding during hostile regimes
- **Bonds don't help** — macro indicators (TLT, IEF, BND) add nothing beyond SPX > SMA(50)
- **The only regime to avoid** — when BOTH stocks AND bonds fall simultaneously (SPX < SMA50 catches this)

---

## 📝 Philosophy

1. **Backtest everything** — no hunches, no guru calls
2. **Keep it simple** — if you need a PhD to understand it, it's overfit
3. **Risk first** — return/drawdown ratio matters more than total return
4. **Open source** — share what works, learn from the community
5. **Retail edge is real** — small size, patience, and discipline beat institutions

---

## ⚠️ Disclaimer

For **educational and research purposes only**. Past backtest results do not guarantee future performance. Trading involves substantial risk of loss. This is not financial advice.

---

## Contributing

Found a bug? Have a strategy idea? Open an issue or PR. This is a community project.

## License

MIT
