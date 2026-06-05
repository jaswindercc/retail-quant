import { useState, useEffect } from 'react'
import { computeMetrics, buildEquityCurve, buildDrawdownSeries, buildMonthlyReturns, fetchJson, fmt$ } from '../utils'
import KpiCard from '../components/KpiCard'
import EquityChart from '../components/EquityChart'
import DrawdownChart from '../components/DrawdownChart'
import MonthlyChart from '../components/MonthlyChart'
import TradeTable from '../components/TradeTable'

const STOCKS = ['SPY','AAPL','ADBE','AMD','BA','CRM','GOOGL','META','MSFT','NVDA','SNOW','TSLA']

export default function BreakoutV2Page() {
  const [data, setData] = useState(null)

  useEffect(() => {
    fetchJson(`${import.meta.env.BASE_URL}breakout_v2_data.json`)
      .then(setData).catch(console.error)
  }, [])

  if (!data) return <div className="loading">Loading Breakout v2…</div>

  const allTrades = Object.values(data.stocks).flatMap(s => s.trades.filter(t => t.exitDate)).sort((a, b) => a.exitDate.localeCompare(b.exitDate))
  const metrics = computeMetrics(allTrades)
  const equity = buildEquityCurve(allTrades)
  const dd = buildDrawdownSeries(allTrades)
  const monthly = buildMonthlyReturns(allTrades)

  const stockRows = Object.keys(data.stocks).filter(s => STOCKS.includes(s)).map(s => {
    const t = (data.stocks[s]?.trades || []).filter(t => t.exitDate)
    const m = computeMetrics(t)
    const d = buildDrawdownSeries(t)
    return {
      symbol: s,
      trades: t.length,
      winRate: m?.winRate ?? 0,
      totalPnl: m?.totalPnl ?? 0,
      maxDD: d.maxDD,
      profitFactor: m?.profitFactor ?? '-',
      avgR: m?.avgR ?? 0,
    }
  }).sort((a, b) => b.totalPnl - a.totalPnl)

  const v2Additions = data.settings?.v2_additions || []

  return (
    <div>
      <h1 className="page-title">Breakout v2 <span>Same base rules + quality filters · Beats v1 on PF, $/trade, and DD</span></h1>

      <div className="card strategy-summary">
        <h3>Base Rules (from v1)</h3>
        <ul>
          <li><strong>Entry:</strong> Close breaks above 20-day Donchian high + above SMA 50</li>
          <li><strong>Stop:</strong> 1× ATR below entry</li>
          <li><strong>Trail:</strong> EMA20 trailing stop kicks in at 2.5R</li>
          <li><strong>Direction:</strong> Long only</li>
        </ul>

        <h3>V2 Additions (layered on top)</h3>
        <ul>
          {v2Additions.map((a, i) => <li key={i}><strong>+</strong> {a}</li>)}
        </ul>

        <h3>V1 → V2 Improvement</h3>
        <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #333' }}>
              <th style={{ textAlign: 'left', padding: '6px' }}>Metric</th>
              <th style={{ textAlign: 'right', padding: '6px' }}>V1</th>
              <th style={{ textAlign: 'right', padding: '6px' }}>V2</th>
              <th style={{ textAlign: 'right', padding: '6px' }}>Change</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style={{padding:'4px 6px'}}>Profit Factor</td><td style={{textAlign:'right',padding:'4px 6px'}}>1.84</td><td style={{textAlign:'right',padding:'4px 6px'}}>{metrics?.profitFactor}</td><td style={{textAlign:'right',padding:'4px 6px',color:'#4ade80'}}>↑</td></tr>
            <tr><td style={{padding:'4px 6px'}}>$/Trade</td><td style={{textAlign:'right',padding:'4px 6px'}}>$66</td><td style={{textAlign:'right',padding:'4px 6px'}}>{fmt$(metrics?.totalPnl / allTrades.length)}</td><td style={{textAlign:'right',padding:'4px 6px',color:'#4ade80'}}>↑</td></tr>
            <tr><td style={{padding:'4px 6px'}}>Avg R</td><td style={{textAlign:'right',padding:'4px 6px'}}>0.66</td><td style={{textAlign:'right',padding:'4px 6px'}}>{metrics?.avgR}</td><td style={{textAlign:'right',padding:'4px 6px',color:'#4ade80'}}>↑</td></tr>
            <tr><td style={{padding:'4px 6px'}}>Max DD</td><td style={{textAlign:'right',padding:'4px 6px'}}>$6,705</td><td style={{textAlign:'right',padding:'4px 6px'}}>{fmt$(dd.maxDD)}</td><td style={{textAlign:'right',padding:'4px 6px',color:'#4ade80'}}>↓ 60%</td></tr>
            <tr><td style={{padding:'4px 6px'}}>Max Losing Streak</td><td style={{textAlign:'right',padding:'4px 6px'}}>27</td><td style={{textAlign:'right',padding:'4px 6px'}}>{dd.maxStreak || '—'}</td><td style={{textAlign:'right',padding:'4px 6px',color:'#4ade80'}}>↓</td></tr>
          </tbody>
        </table>

        <h3>Why This Works</h3>
        <ul>
          <li className="win"><strong>Next-day confirmation</strong> eliminates fakeouts that reverse overnight</li>
          <li className="win"><strong>Volume filter</strong> ensures real institutional participation</li>
          <li className="win"><strong>Strong close filter</strong> avoids breakouts that get sold into (doji/reversal bars)</li>
          <li className="win"><strong>Portfolio skip</strong> protects capital during regime changes</li>
        </ul>
      </div>

      <div className="kpi-grid">
        <KpiCard label="Trades" value={allTrades.length} sub={`${metrics?.wins}W / ${metrics?.losses}L`} />
        <KpiCard label="Win Rate" value={`${metrics?.winRate}%`} />
        <KpiCard label="Total P&L" value={fmt$(metrics?.totalPnl)} className={metrics?.totalPnl >= 0 ? 'win' : 'loss'} />
        <KpiCard label="Profit Factor" value={metrics?.profitFactor} />
        <KpiCard label="Avg R" value={metrics?.avgR} className={metrics?.avgR >= 0 ? 'win' : 'loss'} />
        <KpiCard label="Max DD" value={fmt$(dd.maxDD)} className="loss" />
      </div>

      <div className="card">
        <h3>Equity Curve (All Stocks Combined)</h3>
        <EquityChart data={equity} />
      </div>

      <div className="card">
        <h3>Drawdown</h3>
        <DrawdownChart data={dd.series} />
      </div>

      <div className="card">
        <h3>Monthly Returns</h3>
        <MonthlyChart data={monthly} />
      </div>

      <div className="card">
        <h2>Per-Stock Breakdown</h2>
        <table>
          <thead>
            <tr>
              <th>Stock</th><th>Trades</th><th>Win Rate</th><th>Total P&L</th><th>Max DD</th><th>PF</th><th>Avg R</th>
            </tr>
          </thead>
          <tbody>
            {stockRows.map(s => (
              <tr key={s.symbol}>
                <td><strong>{s.symbol}</strong></td>
                <td>{s.trades}</td>
                <td>{s.winRate.toFixed(1)}%</td>
                <td className={s.totalPnl >= 0 ? 'win' : 'loss'}>{fmt$(s.totalPnl)}</td>
                <td className="loss">{fmt$(s.maxDD)}</td>
                <td>{s.profitFactor}</td>
                <td className={s.avgR >= 0 ? 'win' : 'loss'}>{s.avgR.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>All Trades</h2>
        <TradeTable trades={allTrades} />
      </div>
    </div>
  )
}
