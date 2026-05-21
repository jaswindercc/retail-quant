# 📈 retail-quant

**Open-source quantitative trading system built by a retail trader, for retail traders.**

No black boxes. No $500/month subscriptions. Just data, backtests, and a live scanner you can run yourself.

### 🔗 [Live Dashboard →](https://jaswindercc.github.io/retail-quant/)

---

## Highlights

- 🎯 **Live overnight scanner** — daily signals for SPX, SPY, QQQ
- 🔬 **10 backtested strategies** — fully transparent, 12 stocks, 5 years of data
- 📊 **Trail stop research** — one config dominates all others
- ⚡ **Auto-refreshes daily** — GitHub Actions fetches market data Mon–Fri

---

## Quick Start

```bash
# Generate backtest data
python scripts/generate_data.py

# Run dashboard locally
cd dashboard && npm install && npm run dev

# Run scanner (fetches live data)
python scripts/refresh_scanner.py
```

---

## Structure

```
├── dashboard/          # React + Vite + Recharts (deployed to GitHub Pages)
├── scripts/            # Python backtests & scanner
├── data/               # OHLCV CSVs
├── .github/workflows/  # CI/CD workflows
└── requirements.txt    # Python deps
```

---

## CI / Automation

| Workflow | Trigger | What it does |
|----------|---------|-------------|
| **Market Data Fetcher** | Mon–Fri 3:20 PM ET | Runs `refresh_scanner.py`, commits updated `scanner_data.json` + market data to `main` |
| **Sync codespaces → main** | Push to `codespaces` | Auto-syncs dev branch to `main` so live site always matches latest code |

---

## Contributing

Found a bug? Have a strategy idea? Open an issue or PR.

## License

MIT

---

Built by [@jaswinder_cc](https://x.com/jaswinder_cc)
