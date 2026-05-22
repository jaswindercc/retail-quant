import { computeMetrics, buildEquityCurve, buildDrawdownSeries, buildConsecutive, buildMonthlyReturns, fmt$ } from '../utils'
import KpiCard from '../components/KpiCard'
import EquityChart from '../components/EquityChart'
import DrawdownChart from '../components/DrawdownChart'
import MonthlyChart from '../components/MonthlyChart'
import { NavLink } from 'react-router-dom'

const STOCKS = ['SPY','AAPL','ADBE','AMD','BA','CRM','GOOGL','META','MSFT','NVDA','SNOW','TSLA']

export default function FiftyTwoWeekHighPage({ data, strategyName }) {
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
      <h1 className="page-title">{strategyName} <span>Break above 252-day high · Trail EMA stop at 2.5R · Longs only</span></h1>

      <div className="card" style={{ background: '#2d1f00', border: '1px solid #ff9800', padding: '1rem', marginBottom: '1.5rem' }}>
        <strong style={{ color: '#ff9800' }}>⚠️ Low Sample Size</strong>
        <p style={{ color: '#ccc', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>
          This strategy averages only ~8 trades per stock over 4.5 years. That's not enough to draw statistically reliable conclusions.
          Treat these results as directional exploration, not a proven edge. Not included in the Swing Summary ranking.
        </p>
      </div>

      <div className="card strategy-summary">
        <h3>The System</h3>
        <ul>
          <li><strong>Long only.</strong> Price closes above its 52-week (252-day) high → enter</li>
          <li><strong>Trend filter:</strong> Must be above SMA(50) (already in uptrend)</li>
          <li><strong>Stop:</strong> 1× ATR below entry</li>
          <li><strong>Exit:</strong> EMA(20) trailing stop at 2.5R</li>
          <li><strong>Risk:</strong> $100 per trade</li>
          <li><strong>Cooldown:</strong> 5 bars after exit before next entry</li>
        </ul>

        <h3>Why This Exists</h3>
        <ul>
          <li>Stocks making new 52-week highs tend to continue higher — momentum persists</li>
          <li>Most people are afraid to buy at highs — this exploits that fear</li>
          <li>Catches the start of major breakout moves (NVDA 2023, META 2023)</li>
        </ul>

        <h3>Know This</h3>
        <ul>
          <li>Fewer trades than other strategies — only triggers after extended moves</li>
          <li>Needs 252 days of history before first signal (first year is warm-up)</li>
          <li>Big gap bars are filtered out to avoid chasing</li>
          <li>Works best on high-momentum growth stocks</li>
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
                <td><NavLink to={`/52wk-high/stock/${s.symbol}`}><strong>{s.symbol}</strong></NavLink></td>
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
