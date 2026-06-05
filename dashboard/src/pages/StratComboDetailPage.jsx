import React, { useState, useEffect } from 'react'
import { useParams, NavLink } from 'react-router-dom'
import { fetchJson, computeMetrics, buildEquityCurve, buildDrawdownSeries, buildConsecutive, buildMonthlyReturns, fmt$ } from '../utils'
import KpiCard from '../components/KpiCard'
import EquityChart from '../components/EquityChart'
import DrawdownChart from '../components/DrawdownChart'
import MonthlyChart from '../components/MonthlyChart'
import TradeTable from '../components/TradeTable'
import DrawdownPhases from '../components/DrawdownPhases'

const COMBO_INFO = {
  '2D-1-2U': { name: '2D-1-2U Reversal', type: 'Reversal', dir: 'LONG' },
  '2U-1-2D': { name: '2U-1-2D Reversal', type: 'Reversal', dir: 'SHORT' },
  '2U-1-2U': { name: '2U-1-2U Continuation', type: 'Continuation', dir: 'LONG' },
  '2D-1-2D': { name: '2D-1-2D Continuation', type: 'Continuation', dir: 'SHORT' },
  '3-1-2U': { name: '3-1-2U Outside Squeeze', type: 'Squeeze', dir: 'LONG' },
  '3-1-2D': { name: '3-1-2D Outside Squeeze', type: 'Squeeze', dir: 'SHORT' },
  '2D-1-1-2U': { name: '2D-1-1-2U Compound', type: 'Compound', dir: 'LONG' },
  '2U-1-1-2D': { name: '2U-1-1-2D Compound', type: 'Compound', dir: 'SHORT' },
  '1-1-2U': { name: '1-1-2U Double Inside', type: 'Compression', dir: 'LONG' },
  '1-1-2D': { name: '1-1-2D Double Inside', type: 'Compression', dir: 'SHORT' },
  '1-1-1-2U': { name: '1-1-1-2U Triple Inside', type: 'Mega Comp.', dir: 'LONG' },
  '1-1-1-2D': { name: '1-1-1-2D Triple Inside', type: 'Mega Comp.', dir: 'SHORT' },
  '3-2D-1-2U': { name: '3-2D-1-2U Complex', type: 'Complex', dir: 'LONG' },
  '3-2U-1-2D': { name: '3-2U-1-2D Complex', type: 'Complex', dir: 'SHORT' },
  '1-2D-2U': { name: '1-2D-2U Rev Strat', type: 'RevStrat', dir: 'LONG' },
  '1-2U-2D': { name: '1-2U-2D Rev Strat', type: 'RevStrat', dir: 'SHORT' },
}

const VAR_INFO = {
  'fixed_2R': { name: 'Fixed 2R', icon: '🎯' },
  'fixed_3R': { name: 'Fixed 3R', icon: '🎯' },
  'partial_1R_2R': { name: 'Partial 1R→2R', icon: '✂️' },
  'swing_target': { name: 'Swing Target', icon: '📐' },
  'tfc_fixed_2R': { name: 'TFC + 2R', icon: '📅' },
  'tfc_swing': { name: 'TFC + Swing', icon: '📅' },
  'narrowing_2R': { name: 'Narrowing + 2R', icon: '🔽' },
  'magnitude_filter': { name: 'Magnitude + 2R', icon: '📏' },
  'volume_confirm': { name: 'Volume Confirm', icon: '📊' },
  'full_strat': { name: 'Full System', icon: '⚡' },
}

export default function StratComboDetailPage() {
  const { combo, stock } = useParams()
  const [data, setData] = useState(null)
  const [selectedVar, setSelectedVar] = useState('all')

  useEffect(() => {
    fetchJson(`${import.meta.env.BASE_URL}strat_data.json`)
      .then(setData)
  }, [])

  if (!data) return <div className="loading">Loading STRAT data...</div>

  const comboLabel = COMBO_INFO[combo]?.name || combo
  const comboDir = COMBO_INFO[combo]?.dir || ''
  const comboType = COMBO_INFO[combo]?.type || ''

  // Gather all trades for this combo on the given stock across all variations
  const allTrades = []
  const byVariation = {}

  for (const [key, stocksObj] of Object.entries(data.comboDetails || {})) {
    const [variation, ...comboParts] = key.split('__')
    const comboKey = comboParts.join('__')
    if (comboKey !== combo) continue

    const trades = stocksObj[stock]
    if (!trades || !trades.length) continue

    trades.forEach(t => {
      allTrades.push({ ...t, variation })
    })

    if (!byVariation[variation]) byVariation[variation] = []
    byVariation[variation].push(...trades)
  }

  // Sort all trades by entry date
  allTrades.sort((a, b) => a.entryDate.localeCompare(b.entryDate))

  // Filter by selected variation
  const filteredTrades = selectedVar === 'all'
    ? allTrades
    : allTrades.filter(t => t.variation === selectedVar)

  if (!filteredTrades.length) {
    return (
      <div>
        <h1 className="page-title">{comboLabel} — {stock} <span>No trades found for this combo/stock</span></h1>
        <NavLink to="/the-strat/summary" style={{ color: '#64b5f6' }}>← Back to Summary</NavLink>
      </div>
    )
  }

  const metrics = computeMetrics(filteredTrades)
  const equity = buildEquityCurve(filteredTrades)
  const dd = buildDrawdownSeries(filteredTrades)
  const consec = buildConsecutive(filteredTrades)
  const monthly = buildMonthlyReturns(filteredTrades)

  // Per-variation breakdown
  const varBreakdown = Object.entries(byVariation)
    .map(([v, trades]) => {
      const wins = trades.filter(t => t.pnlDollar > 0).length
      const pnl = trades.reduce((s, t) => s + t.pnlDollar, 0)
      const grossProfit = trades.filter(t => t.pnlDollar > 0).reduce((s, t) => s + t.pnlDollar, 0)
      const grossLoss = Math.abs(trades.filter(t => t.pnlDollar < 0).reduce((s, t) => s + t.pnlDollar, 0))
      return {
        variation: v,
        name: VAR_INFO[v]?.name || v,
        icon: VAR_INFO[v]?.icon || '',
        trades: trades.length,
        wins,
        winRate: (wins / trades.length * 100).toFixed(1),
        pnl,
        perTrade: pnl / trades.length,
        profitFactor: grossLoss === 0 ? '∞' : (grossProfit / grossLoss).toFixed(2),
      }
    })
    .sort((a, b) => b.pnl - a.pnl)

  // ─── CONSISTENCY ANALYSIS ───
  // Year-by-year breakdown
  const byYear = {}
  filteredTrades.forEach(t => {
    const year = t.entryDate.slice(0, 4)
    if (!byYear[year]) byYear[year] = { trades: 0, wins: 0, pnl: 0 }
    byYear[year].trades++
    if (t.pnlDollar > 0) byYear[year].wins++
    byYear[year].pnl += t.pnlDollar
  })
  const yearlyData = Object.entries(byYear).sort().map(([year, d]) => ({
    year, ...d, winRate: (d.wins / d.trades * 100).toFixed(0), avgPnl: d.pnl / d.trades
  }))
  const profitableYears = yearlyData.filter(y => y.pnl > 0).length
  const totalYears = yearlyData.length

  // Cross-stock comparison for same combo
  const EXCLUDE_STOCKS = ['TLT', 'IEF', 'BND', 'USTTENT', 'VIX']
  const crossStockComparison = []
  for (const [key, stocksObj] of Object.entries(data.comboDetails || {})) {
    const [, ...comboParts] = key.split('__')
    if (comboParts.join('__') !== combo) continue
    for (const [s, trades] of Object.entries(stocksObj)) {
      if (EXCLUDE_STOCKS.includes(s)) continue
      const existing = crossStockComparison.find(x => x.stock === s)
      if (existing) {
        existing.trades += trades.length
        existing.pnl += trades.reduce((sum, t) => sum + t.pnlDollar, 0)
        existing.wins += trades.filter(t => t.pnlDollar > 0).length
      } else {
        crossStockComparison.push({
          stock: s,
          trades: trades.length,
          pnl: trades.reduce((sum, t) => sum + t.pnlDollar, 0),
          wins: trades.filter(t => t.pnlDollar > 0).length,
        })
      }
    }
  }
  crossStockComparison.forEach(s => { s.winRate = (s.wins / s.trades * 100); s.avgPnl = s.pnl / s.trades })
  crossStockComparison.sort((a, b) => b.pnl - a.pnl)
  const stockRank = crossStockComparison.findIndex(s => s.stock === stock) + 1
  const profitableStockCount = crossStockComparison.filter(s => s.pnl > 0).length

  // Available stocks for this combo
  const availableStocks = new Set()
  for (const [key, stocksObj] of Object.entries(data.comboDetails || {})) {
    const [, ...comboParts] = key.split('__')
    if (comboParts.join('__') === combo) {
      Object.keys(stocksObj).forEach(s => availableStocks.add(s))
    }
  }

  return (
    <div>
      <h1 className="page-title">
        {comboLabel} — {stock}
        <span>{comboType} · {comboDir} · Detailed Analysis</span>
      </h1>

      {/* Stock selector */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '1rem' }}>
        {[...availableStocks].sort().map(s => (
          <NavLink key={s} to={`/the-strat/combo/${combo}/${s}`}
            className={({isActive}) => `pill ${isActive ? 'pill-active' : ''}`}
            style={({isActive}) => ({
              padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600,
              background: isActive ? '#00e676' : '#2a2a3e', color: isActive ? '#000' : '#ccc',
              textDecoration: 'none', border: '1px solid ' + (isActive ? '#00e676' : '#444')
            })}
          >{s}</NavLink>
        ))}
      </div>

      {/* Variation filter */}
      <div style={{ marginBottom: '1.5rem' }}>
        <span style={{ color: '#aaa', fontSize: '0.85rem', marginRight: '0.5rem' }}>Filter by variation:</span>
        <select
          value={selectedVar}
          onChange={e => setSelectedVar(e.target.value)}
          style={{ background: '#2a2a3e', color: '#fff', border: '1px solid #444', borderRadius: '4px', padding: '0.3rem 0.6rem', fontSize: '0.85rem' }}
        >
          <option value="all">All Variations ({allTrades.length} trades)</option>
          {varBreakdown.map(v => (
            <option key={v.variation} value={v.variation}>{v.icon} {v.name} ({v.trades} trades)</option>
          ))}
        </select>
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        <KpiCard label="Total P&L" value={fmt$(metrics.totalPnl)} cls={metrics.totalPnl >= 0 ? 'green' : 'red'} />
        <KpiCard label="Trades" value={metrics.totalTrades} />
        <KpiCard label="Win Rate" value={metrics.winRate + '%'} cls={metrics.winRate >= 50 ? 'green' : 'red'} />
        <KpiCard label="Profit Factor" value={metrics.profitFactor} cls={parseFloat(metrics.profitFactor) >= 1.5 ? 'green' : 'red'} />
        <KpiCard label="Max DD" value={fmt$(dd.maxDD)} cls="red" />
        <KpiCard label="Avg R" value={metrics.avgR + 'R'} cls={metrics.avgR >= 0 ? 'green' : 'red'} />
        <KpiCard label="Max Consec Losses" value={consec.maxConsecLoss} cls="red" />
        <KpiCard label="Avg Win" value={fmt$(metrics.avgWin)} cls="green" />
      </div>

      {/* Equity Curve */}
      <div className="card">
        <h3>Equity Curve</h3>
        <EquityChart data={equity} />
      </div>

      {/* Drawdown */}
      <div className="card">
        <h3>Drawdown</h3>
        <DrawdownChart data={dd.series} />
      </div>

      {/* Drawdown Phases */}
      {dd.phases.length > 0 && (
        <div className="card">
          <h3>Drawdown Phases</h3>
          <DrawdownPhases phases={dd.phases} />
        </div>
      )}

      {/* Monthly Returns */}
      <div className="card">
        <h3>Monthly Returns</h3>
        <MonthlyChart data={monthly} />
      </div>

      {/* CONSISTENCY ANALYSIS — answers "why here?" and "will it continue?" */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', border: '1px solid #ffd54f', marginBottom: '0' }}>
        <h3 style={{ color: '#ffd54f', margin: '0 0 1rem' }}>🔍 Should You Trust This Edge?</h3>
        
        {/* Year-by-year */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ color: '#fff', margin: '0 0 0.5rem' }}>Year-by-Year Consistency</h4>
          <p style={{ color: '#aaa', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
            Profitable in <strong style={{ color: profitableYears === totalYears ? '#00e676' : profitableYears >= totalYears * 0.6 ? '#ffd54f' : '#ff5252' }}>{profitableYears}/{totalYears} years</strong>
            {profitableYears === totalYears && ' — consistent across all years ✅'}
            {profitableYears >= totalYears * 0.6 && profitableYears < totalYears && ' — mostly consistent, some losing years ⚠️'}
            {profitableYears < totalYears * 0.6 && ' — inconsistent, likely noise ❌'}
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ fontSize: '0.85rem' }}>
              <thead><tr><th>Year</th><th>Trades</th><th>Win%</th><th>P&L</th><th>$/Trade</th><th></th></tr></thead>
              <tbody>
                {yearlyData.map(y => (
                  <tr key={y.year} style={y.pnl < 0 ? { opacity: 0.6 } : {}}>
                    <td style={{ fontWeight: 600 }}>{y.year}</td>
                    <td>{y.trades}</td>
                    <td>{y.winRate}%</td>
                    <td style={{ color: y.pnl >= 0 ? '#00e676' : '#ff5252', fontWeight: 700 }}>{fmt$(y.pnl)}</td>
                    <td style={{ color: y.avgPnl >= 0 ? '#00e676' : '#ff5252' }}>{fmt$(y.avgPnl)}</td>
                    <td>{y.pnl > 0 ? '✅' : '❌'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cross-stock comparison */}
        <div style={{ marginBottom: '1rem' }}>
          <h4 style={{ color: '#fff', margin: '0 0 0.5rem' }}>How {stock} Compares to Other Stocks (same combo)</h4>
          <p style={{ color: '#aaa', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
            {stock} ranks <strong style={{ color: stockRank <= 3 ? '#00e676' : '#ffd54f' }}>#{stockRank}</strong> out of {crossStockComparison.length} stocks.{' '}
            This combo is profitable on <strong>{profitableStockCount}/{crossStockComparison.length}</strong> stocks.
            {profitableStockCount >= crossStockComparison.length * 0.7 && <span style={{ color: '#00e676' }}> The pattern works broadly — not just one stock. Good sign.</span>}
            {profitableStockCount < crossStockComparison.length * 0.5 && <span style={{ color: '#ff5252' }}> Only works on select stocks — may be overfitting.</span>}
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ fontSize: '0.85rem' }}>
              <thead><tr><th>#</th><th>Stock</th><th>Trades</th><th>Win%</th><th>Total P&L</th><th>$/Trade</th></tr></thead>
              <tbody>
                {crossStockComparison.map((s, i) => (
                  <tr key={s.stock} style={{ opacity: s.pnl < 0 ? 0.5 : 1, background: s.stock === stock ? 'rgba(100,181,246,0.1)' : 'transparent' }}>
                    <td>{i + 1}</td>
                    <td style={{ fontWeight: s.stock === stock ? 700 : 400, color: s.stock === stock ? '#64b5f6' : '#ccc' }}>
                      {s.stock === stock ? `→ ${s.stock}` : s.stock}
                    </td>
                    <td>{s.trades}</td>
                    <td>{s.winRate.toFixed(0)}%</td>
                    <td style={{ color: s.pnl >= 0 ? '#00e676' : '#ff5252', fontWeight: 700 }}>{fmt$(s.pnl)}</td>
                    <td style={{ color: s.avgPnl >= 0 ? '#00e676' : '#ff5252' }}>{fmt$(s.avgPnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Verdict */}
        <div style={{ padding: '1rem', background: '#0d1b2a', borderRadius: '8px', border: '1px solid #333' }}>
          <strong style={{ color: '#fff' }}>Verdict:</strong>{' '}
          <span style={{ color: '#ccc', fontSize: '0.9rem' }}>
            {profitableYears >= totalYears * 0.7 && stockRank <= 3 && profitableStockCount >= crossStockComparison.length * 0.5
              ? `Strong evidence. ${stock} has been consistently profitable year-over-year AND the pattern works on multiple stocks. This isn't just luck — the pattern has a structural edge on ${stock}.`
              : profitableYears >= totalYears * 0.6 && profitableStockCount >= crossStockComparison.length * 0.5
              ? `Moderate evidence. The pattern works on multiple stocks and is mostly consistent on ${stock}. Tradeable, but size conservatively.`
              : profitableYears < totalYears * 0.5
              ? `Weak evidence. Results are inconsistent year-to-year — this may be a few lucky trades inflating the total. Don't rely on this edge persisting.`
              : `Mixed evidence. ${stock} performs well but the pattern doesn't work broadly across stocks. Could be specific to ${stock}'s price behavior, or could be overfitting.`
            }
          </span>
        </div>
      </div>

      {/* Variation Breakdown */}
      <div className="card">
        <h3>Performance by Variation</h3>
        <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1rem' }}>How each exit/filter method performs for {comboLabel} on {stock}</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Variation</th>
                <th>Trades</th>
                <th>Win%</th>
                <th>PF</th>
                <th>$/Trade</th>
                <th>Total P&L</th>
              </tr>
            </thead>
            <tbody>
              {varBreakdown.map((v, i) => (
                <tr key={v.variation} style={v.pnl < 0 ? { opacity: 0.6 } : {}}>
                  <td>{i + 1}</td>
                  <td>{v.icon} {v.name}</td>
                  <td>{v.trades}</td>
                  <td>{v.winRate}%</td>
                  <td>{v.profitFactor}</td>
                  <td style={{ color: v.perTrade >= 0 ? '#00e676' : '#ff5252' }}>{fmt$(v.perTrade)}</td>
                  <td style={{ color: v.pnl >= 0 ? '#00e676' : '#ff5252', fontWeight: 700 }}>{fmt$(v.pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* All Trades */}
      <div className="card">
        <h3>All Trades ({filteredTrades.length})</h3>
        <TradeTable trades={filteredTrades} showStock showVariation />
      </div>
    </div>
  )
}
