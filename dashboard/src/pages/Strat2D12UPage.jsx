import React, { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { fetchJson, buildEquityCurve, buildMonthlyReturns, buildDrawdownSeries, buildConsecutive, computeMetrics, fmt$ } from '../utils'
import KpiCard from '../components/KpiCard'
import EquityChart from '../components/EquityChart'
import DrawdownChart from '../components/DrawdownChart'
import MonthlyChart from '../components/MonthlyChart'
import TradeTable from '../components/TradeTable'

const EXCLUDE = ['TLT', 'IEF', 'BND', 'USTTENT', 'VIX']

export default function Strat2D12UPage() {
  const [data, setData] = useState(null)

  useEffect(() => {
    fetchJson(`${import.meta.env.BASE_URL}strat_data.json`)
      .then(setData).catch(console.error)
  }, [])

  if (!data) return <div className="main"><p>Loading...</p></div>

  const comboDetails = data.comboDetails || {}

  // Aggregate ALL trades for 2D-1-2U across ALL variations
  let allTrades = []
  const byStock = {}
  const byVariation = {}
  for (const [key, stocksObj] of Object.entries(comboDetails)) {
    const [variation, ...comboParts] = key.split('__')
    const combo = comboParts.join('__')
    if (combo !== '2D-1-2U') continue
    
    if (!byVariation[variation]) byVariation[variation] = []
    for (const [stock, trades] of Object.entries(stocksObj)) {
      if (EXCLUDE.includes(stock)) continue
      const enriched = trades.map(t => ({ ...t, variation, stock }))
      allTrades.push(...enriched)
      byVariation[variation].push(...enriched)
      if (!byStock[stock]) byStock[stock] = []
      byStock[stock].push(...enriched)
    }
  }

  // Sort by entry date
  allTrades.sort((a, b) => a.entryDate.localeCompare(b.entryDate))

  if (!allTrades.length) return <div className="main"><p>No 2D-1-2U trades found.</p></div>

  const metrics = computeMetrics(allTrades)
  const equity = buildEquityCurve(allTrades)
  const dd = buildDrawdownSeries(allTrades)
  const consec = buildConsecutive(allTrades)
  const monthly = buildMonthlyReturns(allTrades)

  // Per-stock breakdown
  const stockPerf = Object.entries(byStock).map(([stock, trades]) => {
    const pnl = trades.reduce((s, t) => s + t.pnlDollar, 0)
    const wins = trades.filter(t => t.pnlDollar > 0).length
    return { stock, trades: trades.length, pnl, wins, winRate: (wins / trades.length * 100), avgPnl: pnl / trades.length }
  }).sort((a, b) => b.pnl - a.pnl)

  // Per-variation breakdown
  const varPerf = Object.entries(byVariation).map(([v, trades]) => {
    const pnl = trades.reduce((s, t) => s + t.pnlDollar, 0)
    const wins = trades.filter(t => t.pnlDollar > 0).length
    const gross = trades.filter(t => t.pnlDollar > 0).reduce((s, t) => s + t.pnlDollar, 0)
    const loss = Math.abs(trades.filter(t => t.pnlDollar < 0).reduce((s, t) => s + t.pnlDollar, 0))
    return { variation: v, trades: trades.length, pnl, wins, winRate: (wins / trades.length * 100), avgPnl: pnl / trades.length, pf: loss === 0 ? 99 : gross / loss }
  }).sort((a, b) => b.pnl - a.pnl)

  // Year-by-year
  const byYear = {}
  allTrades.forEach(t => {
    const y = t.entryDate.slice(0, 4)
    if (!byYear[y]) byYear[y] = { trades: 0, wins: 0, pnl: 0 }
    byYear[y].trades++
    if (t.pnlDollar > 0) byYear[y].wins++
    byYear[y].pnl += t.pnlDollar
  })
  const yearlyData = Object.entries(byYear).sort().map(([year, d]) => ({ year, ...d, winRate: (d.wins / d.trades * 100) }))
  const profitableYears = yearlyData.filter(y => y.pnl > 0).length

  return (
    <div>
      <h1 className="page-title">2D-1-2U — Full Analysis <span>Down → Inside → Break Up · All {allTrades.length} trades across {varPerf.length} variations</span></h1>

      {/* KPIs */}
      <div className="kpi-grid">
        <KpiCard label="Total P&L" value={fmt$(metrics.totalPnl)} cls={metrics.totalPnl >= 0 ? 'green' : 'red'} />
        <KpiCard label="Trades" value={metrics.totalTrades} />
        <KpiCard label="Win Rate" value={metrics.winRate + '%'} cls={metrics.winRate >= 40 ? 'green' : 'red'} />
        <KpiCard label="Profit Factor" value={metrics.profitFactor} cls={parseFloat(metrics.profitFactor) >= 1.5 ? 'green' : 'red'} />
        <KpiCard label="Max DD" value={fmt$(dd.maxDD)} cls="red" />
        <KpiCard label="Avg R" value={metrics.avgR + 'R'} cls={metrics.avgR >= 0 ? 'green' : 'red'} />
        <KpiCard label="Max Consec Losses" value={consec.maxConsecLoss} cls="red" />
        <KpiCard label="Avg Win" value={fmt$(metrics.avgWin)} cls="green" />
      </div>

      {/* What it is */}
      <div className="card" style={{ marginBottom: '1.5rem', background: '#1a1a2e', border: '1px solid #444' }}>
        <h3 style={{ margin: '0 0 0.5rem', color: '#fff' }}>What is 2D-1-2U?</h3>
        <ol style={{ color: '#ccc', fontSize: '0.9rem', margin: 0, paddingLeft: '1.5rem', lineHeight: 2 }}>
          <li><strong style={{ color: '#ef5350' }}>2D (Down bar)</strong> — Red candle takes out the prior bar's low. Sellers in control.</li>
          <li><strong style={{ color: '#ffd54f' }}>1 (Inside bar)</strong> — Price contracts inside the 2D bar. Sellers exhausted, compression building.</li>
          <li><strong style={{ color: '#00e676' }}>2U (Break up)</strong> — Price breaks above the inside bar's high → Entry trigger.</li>
        </ol>
        <p style={{ color: '#888', fontSize: '0.85rem', margin: '0.75rem 0 0' }}>Stop below inside bar low. Target depends on variation (see below).</p>
      </div>

      {/* Equity */}
      <div className="card">
        <h3>Equity Curve (all stocks, all variations combined)</h3>
        <EquityChart data={equity} />
      </div>

      {/* Drawdown */}
      <div className="card">
        <h3>Drawdown</h3>
        <DrawdownChart data={dd.series} />
      </div>

      {/* Monthly */}
      <div className="card">
        <h3>Monthly Returns</h3>
        <MonthlyChart data={monthly} />
      </div>

      {/* Year-by-year */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3>Year-by-Year Consistency</h3>
        <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          Profitable <strong style={{ color: profitableYears >= yearlyData.length * 0.7 ? '#00e676' : '#ffd54f' }}>{profitableYears}/{yearlyData.length} years</strong>
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ fontSize: '0.85rem' }}>
            <thead><tr><th>Year</th><th>Trades</th><th>Win%</th><th>P&L</th><th></th></tr></thead>
            <tbody>
              {yearlyData.map(y => (
                <tr key={y.year}>
                  <td style={{ fontWeight: 600 }}>{y.year}</td>
                  <td>{y.trades}</td>
                  <td>{y.winRate.toFixed(0)}%</td>
                  <td style={{ color: y.pnl >= 0 ? '#00e676' : '#ff5252', fontWeight: 700 }}>{fmt$(y.pnl)}</td>
                  <td>{y.pnl > 0 ? '✅' : '❌'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Variation breakdown */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3>Which Exit Method (Variation) Works Best?</h3>
        <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1rem' }}>Same 2D-1-2U pattern, different ways to take profit/manage the trade.</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr><th>#</th><th>Variation</th><th>Trades</th><th>Win%</th><th>PF</th><th>$/Trade</th><th>Total P&L</th></tr>
            </thead>
            <tbody>
              {varPerf.map((v, i) => (
                <tr key={v.variation} style={v.pnl < 0 ? { opacity: 0.5 } : {}}>
                  <td>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{v.variation.replace(/_/g, ' ')}</td>
                  <td>{v.trades}</td>
                  <td>{v.winRate.toFixed(0)}%</td>
                  <td>{v.pf >= 99 ? '∞' : v.pf.toFixed(2)}</td>
                  <td style={{ color: v.avgPnl >= 0 ? '#00e676' : '#ff5252' }}>{fmt$(v.avgPnl)}</td>
                  <td style={{ color: v.pnl >= 0 ? '#00e676' : '#ff5252', fontWeight: 700 }}>{fmt$(v.pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-stock breakdown */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3>Per-Stock Breakdown</h3>
        <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1rem' }}>Where does 2D-1-2U work best? (all variations combined)</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr><th>#</th><th>Stock</th><th>Trades</th><th>Win%</th><th>$/Trade</th><th>Total P&L</th><th></th></tr>
            </thead>
            <tbody>
              {stockPerf.map((s, i) => (
                <tr key={s.stock} style={s.pnl < 0 ? { opacity: 0.5 } : {}}>
                  <td>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{s.stock}</td>
                  <td>{s.trades}</td>
                  <td>{s.winRate.toFixed(0)}%</td>
                  <td style={{ color: s.avgPnl >= 0 ? '#00e676' : '#ff5252' }}>{fmt$(s.avgPnl)}</td>
                  <td style={{ color: s.pnl >= 0 ? '#00e676' : '#ff5252', fontWeight: 700 }}>{fmt$(s.pnl)}</td>
                  <td><NavLink to={`/the-strat/combo/2D-1-2U/${s.stock}`} style={{ color: '#64b5f6', fontSize: '0.75rem' }}>Detail →</NavLink></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* All trades */}
      <div className="card">
        <h3>All Trades ({allTrades.length})</h3>
        <TradeTable trades={allTrades} showStock showVariation />
      </div>
    </div>
  )
}
