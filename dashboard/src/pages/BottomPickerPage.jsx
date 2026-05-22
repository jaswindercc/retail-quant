import { computeMetrics, buildEquityCurve, buildDrawdownSeries, buildConsecutive, buildMonthlyReturns, fmt$ } from '../utils'
import KpiCard from '../components/KpiCard'
import EquityChart from '../components/EquityChart'
import DrawdownChart from '../components/DrawdownChart'
import MonthlyChart from '../components/MonthlyChart'
import { NavLink } from 'react-router-dom'

const STOCKS = ['SPY','AAPL','ADBE','AMD','BA','CRM','GOOGL','META','MSFT','NVDA','SNOW','TSLA']

export default function BottomPickerPage({ data, strategyName }) {
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
      <h1 className="page-title">{strategyName} <span>Buy 20%+ drops · RSI oversold · First green bar reversal · Trail EMA at 2.5R</span></h1>

      <div className="card" style={{ background: '#2d1f00', border: '1px solid #ff9800', padding: '1rem', marginBottom: '1.5rem' }}>
        <strong style={{ color: '#ff9800' }}>⚠️ Low Sample Size</strong>
        <p style={{ color: '#ccc', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>
          This strategy averages only ~7 trades per stock over 4.5 years. Big crashes are rare events.
          Treat these results as directional exploration, not a proven edge. Not included in the Swing Summary ranking.
        </p>
      </div>

      <div className="card strategy-summary">
        <h3>The System</h3>
        <ul>
          <li><strong>Long only.</strong> Contrarian — buy when everyone is panicking</li>
          <li><strong>Entry conditions (ALL must be true):</strong></li>
          <li style={{paddingLeft: '1rem'}}>1. Stock is 20%+ below its 60-day high (crashed)</li>
          <li style={{paddingLeft: '1rem'}}>2. RSI(14) below 35 (oversold)</li>
          <li style={{paddingLeft: '1rem'}}>3. First green bar after a red bar (reversal signal)</li>
          <li><strong>Stop:</strong> Below signal bar low or 1.5× ATR (whichever is tighter)</li>
          <li><strong>Exit:</strong> EMA(20) trailing stop at 2.5R</li>
          <li><strong>Risk:</strong> $100 per trade. 10-bar cooldown after exit</li>
        </ul>

        <h3>Why This Exists</h3>
        <ul>
          <li>Stocks that crash 20%+ often bounce hard — this catches the bottom</li>
          <li>RSI filter ensures we wait for true exhaustion, not just a small dip</li>
          <li>First green bar is the <strong>earliest reversal signal</strong> without waiting for MA crossovers</li>
          <li>Winners here can be 5-10R+ because you're buying at maximum fear</li>
        </ul>

        <h3>Know This</h3>
        <ul>
          <li>This is "catching a falling knife" — most attempts fail (low win rate expected)</li>
          <li>Fewer trades — big crashes don't happen every week</li>
          <li>Works best on volatile stocks that recover (AMD, TSLA, META)</li>
          <li>Dangerous on stocks in structural decline — hence the trail stop to limit damage</li>
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
                <td><NavLink to={`/bottom-picker/stock/${s.symbol}`}><strong>{s.symbol}</strong></NavLink></td>
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
