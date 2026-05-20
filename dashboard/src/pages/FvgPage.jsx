import { computeMetrics, buildEquityCurve, buildDrawdownSeries, buildConsecutive, buildMonthlyReturns, fmt$ } from '../utils'
import KpiCard from '../components/KpiCard'
import EquityChart from '../components/EquityChart'
import DrawdownChart from '../components/DrawdownChart'
import MonthlyChart from '../components/MonthlyChart'
import { NavLink } from 'react-router-dom'

const STOCKS = ['SPY','AAPL','ADBE','AMD','BA','CRM','GOOGL','META','MSFT','NVDA','SNOW','TSLA']

export default function FvgPage({ data, strategyName }) {
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
      longs: t.length,
      shorts: 0,
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
      <h1 className="page-title">{strategyName} <span>Fair Value Gap Pullback · Trail EMA stop at 2.5R · Longs only</span></h1>

      <div className="card strategy-summary">
        <h3>The System</h3>
        <ul>
          <li><strong>Long only.</strong> Detect bullish Fair Value Gaps (imbalance candles)</li>
          <li><strong>FVG:</strong> bar[i-2].high &lt; bar[i].low with strong impulse candle (body &gt; 0.5×ATR)</li>
          <li><strong>Entry:</strong> Price pulls back INTO the gap zone and closes above the midpoint</li>
          <li><strong>Max FVG age:</strong> 30 bars (stale gaps ignored)</li>
          <li><strong>Trend filter:</strong> price above SMA(50)</li>
          <li><strong>Exit:</strong> EMA(20) trailing stop at 2.5R</li>
          <li><strong>Risk:</strong> $100 per trade, 1× ATR stop</li>
        </ul>

        <h3>Why This Exists</h3>
        <ul>
          <li>FVGs represent <strong>institutional imbalance</strong> — price moved too fast, leaving a gap</li>
          <li>Smart Money Concept: price tends to "fill" these gaps before continuing</li>
          <li>Provides high-probability entries at discount levels within the trend</li>
        </ul>

        <h3>Know This</h3>
        <ul>
          <li>Only bullish FVGs are tracked (buying into filled demand zones)</li>
          <li>In strong trends, FVGs may not fill (missed entries)</li>
          <li>In weak trends, FVGs fill but price keeps falling (whipsaw)</li>
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
                <td><NavLink to={`/fvg/stock/${s.symbol}`}><strong>{s.symbol}</strong></NavLink></td>
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
