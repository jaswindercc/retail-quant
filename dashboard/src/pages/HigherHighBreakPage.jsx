import { computeMetrics, buildEquityCurve, buildDrawdownSeries, buildConsecutive, buildMonthlyReturns, fmt$ } from '../utils'
import KpiCard from '../components/KpiCard'
import EquityChart from '../components/EquityChart'
import DrawdownChart from '../components/DrawdownChart'
import MonthlyChart from '../components/MonthlyChart'
import { NavLink } from 'react-router-dom'

const STOCKS = ['SPY','AAPL','ADBE','AMD','BA','CRM','GOOGL','META','MSFT','NVDA','SNOW','TSLA']

export default function HigherHighBreakPage({ data, strategyName }) {
  const stockRows = STOCKS.map(s => {
    const t = (data.stocks[s]?.trades || []).filter(t => t.exitDate)
    const m = computeMetrics(t)
    const d = buildDrawdownSeries(t)
    const prices = data.stocks[s]?.prices || []
    const firstP = prices[0]?.close
    const lastP = prices[prices.length - 1]?.close
    const stockReturn = firstP ? (lastP - firstP) / firstP : 0
    const buyHold = (t.length * 100) * stockReturn
    return {
      symbol: s,
      trades: t.length,
      winRate: m?.winRate ?? 0,
      totalPnl: m?.totalPnl ?? 0,
      maxDD: d.maxDD,
      profitFactor: m?.profitFactor ?? '-',
      avgR: m?.avgR ?? 0,
      buyHold,
    }
  }).sort((a, b) => b.totalPnl - a.totalPnl)

  const profitable = stockRows.filter(s => s.totalPnl > 0).length
  const avgPnl = stockRows.reduce((s, r) => s + r.totalPnl, 0) / stockRows.length
  const avgWR = stockRows.reduce((s, r) => s + r.winRate, 0) / stockRows.length
  const avgDD = stockRows.reduce((s, r) => s + r.maxDD, 0) / stockRows.length
  const bestStock = stockRows[0]
  const worstStock = stockRows[stockRows.length - 1]
  const medianPnl = [...stockRows].sort((a, b) => a.totalPnl - b.totalPnl)
  const mid = Math.floor(medianPnl.length / 2)
  const median = medianPnl.length % 2 ? medianPnl[mid].totalPnl : (medianPnl[mid - 1].totalPnl + medianPnl[mid].totalPnl) / 2

  return (
    <div>
      <h1 className="page-title">{strategyName} <span>First higher high after 3+ lower highs · Trend reversal · Trail EMA at 2.5R</span></h1>

      <div className="card" style={{ background: '#1a0d2e', border: '2px solid #ffd700', padding: '1rem', marginBottom: '1.5rem' }}>
        <strong style={{ color: '#ffd700' }}>🏆 Top Strategy — Best Risk:Reward in Portfolio</strong>
        <p style={{ color: '#ccc', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>
          54% win rate · 25.3R average winner · 12.83 profit factor. This fires rarely (~3 trades/stock over 4.5 years)
          but when it triggers, the R:R is unmatched. Use the Rare Pattern Scanner to catch signals in real-time.
        </p>
      </div>

      <div className="card strategy-summary">
        <h3>The System</h3>
        <ul>
          <li><strong>Long only.</strong> Catches the first sign of trend reversal</li>
          <li><strong>Entry conditions:</strong></li>
          <li style={{paddingLeft: '1rem'}}>1. Identify swing highs (10-bar window local maxima)</li>
          <li style={{paddingLeft: '1rem'}}>2. Need 3+ consecutive LOWER swing highs (confirmed downtrend)</li>
          <li style={{paddingLeft: '1rem'}}>3. Price makes first HIGHER swing high → breakout signal</li>
          <li style={{paddingLeft: '1rem'}}>4. Enter on close above previous swing high level</li>
          <li><strong>Stop:</strong> 1× ATR below entry</li>
          <li><strong>Exit:</strong> EMA(20) trailing stop at 2.5R</li>
          <li><strong>Risk:</strong> $100 per trade</li>
        </ul>

        <h3>Why This Exists</h3>
        <ul>
          <li>After a series of lower highs, the first higher high signals sellers have lost control</li>
          <li>This is the <strong>earliest trend reversal signal</strong> in price structure</li>
          <li>Catches the start of major recoveries (META Q4 2022, AMD 2023)</li>
          <li>Big winners because you're entering at the very start of a new uptrend</li>
        </ul>

        <h3>Know This</h3>
        <ul>
          <li>Very few trades — requires specific market structure to form</li>
          <li>Some signals are false breakouts (bears reassert) — that's what the stop is for</li>
          <li>Works best after extended declines that have genuinely reversed</li>
          <li>Small sample size per stock — evaluate across the full portfolio</li>
        </ul>

        <h3>📡 Live Scanner — TradingView Pine Script</h3>
        <ul>
          <li><strong>Finviz/TradingView built-in screener can't detect this pattern</strong> — it requires swing structure analysis</li>
          <li>Use the custom Pine Script: <code>scripts/pinescript/pine_higher_high_scanner_v1</code></li>
          <li className="win"><strong>Setup:</strong> TradingView → Pine Editor → paste the script → Add to Chart</li>
          <li className="win"><strong>Alert:</strong> Right-click indicator → Add Alert → "Higher High Break Signal" → set to "Once Per Bar Close"</li>
          <li className="win"><strong>Watchlist scan:</strong> Add the indicator to all 12 stocks. Set alerts on each. TradingView notifies you when it fires.</li>
          <li>The indicator shows: swing high markers, lower high count, break level, and entry/stop on signal</li>
          <li style={{color: '#ff9800'}}>⚡ This fires ~3× per stock over 4.5 years — when you get an alert, pay attention</li>
        </ul>
      </div>

      <div className="kpi-grid">
        <KpiCard label="Profitable Stocks" value={`${profitable} / ${stockRows.length}`} cls={profitable >= 8 ? 'green' : 'red'} />
        <KpiCard label="Avg P&L / Stock" value={fmt$(avgPnl)} cls={avgPnl >= 0 ? 'green' : 'red'} />
        <KpiCard label="Median P&L / Stock" value={fmt$(median)} cls={median >= 0 ? 'green' : 'red'} />
        <KpiCard label="Avg Win Rate" value={avgWR.toFixed(1) + '%'} cls={avgWR >= 35 ? 'green' : 'red'} />
        <KpiCard label="Avg Max DD / Stock" value={fmt$(avgDD)} cls="red" />
        <KpiCard label="Best → Worst" value={`${bestStock.symbol} → ${worstStock.symbol}`} />
      </div>

      <div className="card">
        <h3>Equity Curve (All Stocks Combined)</h3>
        <EquityChart data={buildEquityCurve(Object.values(data.stocks).flatMap(s => s.trades.filter(t => t.exitDate)).sort((a,b) => a.exitDate.localeCompare(b.exitDate)))} />
      </div>

      <div className="card">
        <h3>Drawdown (All Stocks Combined)</h3>
        <DrawdownChart data={buildDrawdownSeries(Object.values(data.stocks).flatMap(s => s.trades.filter(t => t.exitDate)).sort((a,b) => a.exitDate.localeCompare(b.exitDate))).series} />
      </div>

      <div className="card">
        <h3>Monthly Returns (All Stocks Combined)</h3>
        <MonthlyChart data={buildMonthlyReturns(Object.values(data.stocks).flatMap(s => s.trades.filter(t => t.exitDate)))} />
      </div>

      <div className="card">
        <h3>Per-Stock Performance <span style={{color:'#8e8e9a', fontWeight:400, fontSize:14, textTransform:'none'}}>(sorted by P&L)</span></h3>
        <table>
          <thead>
            <tr><th>Stock</th><th>Trades</th><th>Win%</th><th>P&L</th><th>B&H</th><th>Max DD</th><th>PF</th><th>Avg R</th></tr>
          </thead>
          <tbody>
            {stockRows.map(s => (
              <tr key={s.symbol}>
                <td><NavLink to={`/higher-high/stock/${s.symbol}`}><strong>{s.symbol}</strong></NavLink></td>
                <td>{s.trades}</td>
                <td>{s.winRate}%</td>
                <td className={s.totalPnl >= 0 ? 'win' : 'loss'}>{fmt$(s.totalPnl)}</td>
                <td style={{color: s.buyHold >= 0 ? '#4ade80' : '#ef4444'}}>{fmt$(s.buyHold)}</td>
                <td className="loss">{fmt$(s.maxDD)}</td>
                <td>{s.profitFactor}</td>
                <td className={s.avgR >= 0 ? 'win' : 'loss'}>{s.avgR}R</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
