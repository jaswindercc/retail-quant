import { useState, useEffect } from 'react'
import { fetchJson } from '../utils'

export default function BreakoutV3Page() {
  const [data, setData] = useState(null)
  const [capital, setCapital] = useState(40000)
  const [riskPct, setRiskPct] = useState(1)
  const [sortCol, setSortCol] = useState('pnl')
  const [sortDir, setSortDir] = useState('desc')
  const [tradeFilter, setTradeFilter] = useState('')

  useEffect(() => {
    fetchJson(`${import.meta.env.BASE_URL}breakout_v2_sp100_data.json`)
      .then(setData).catch(console.error)
  }, [])

  if (!data) return <div className="loading">Loading Breakout v3…</div>

  const allTrades = data.allTrades || []
  const settings = data.settings || {}
  const buyHold = data.buyHold || {}
  const universe = data.universe || {}
  const categories = universe.categories || {}
  const marketCaps = data.marketCaps || {}

  // Compounding + Skip after 3L (Breakout v3 — compounding)
  function runStrategy(trades, startCapital, riskPctVal) {
    let currentCapital = startCapital
    let peakCapital = startCapital
    let maxDD = 0, maxDDPct = 0
    let consecutiveLosses = 0, skipNext = false
    const results = []
    const equityCurve = [{ capital: startCapital, date: trades[0]?.entryDate || '' }]
    const maxPositions = 5
    const maxPositionPct = 0.2 // never hold more than 20% in one stock (cap based on current capital for compounding)
    let activePositions = [] // track open positions by exitDate

    for (const t of trades) {
      if (t.exitReason === 'Open') continue
      activePositions = activePositions.filter(p => p.exitDate > t.entryDate)
      if (activePositions.length >= maxPositions) {
        results.push({ ...t, status: 'skipped', shares: 0, pnlScaled: 0, capitalAtEntry: currentCapital, riskDollars: 0, positionValue: 0 })
        continue
      }
      const riskDollars = currentCapital * (riskPctVal / 100)
      let shares = Math.floor(riskDollars / t.risk)
      const maxSharesByCapital = Math.floor(currentCapital / t.entryPrice)
      if (shares > maxSharesByCapital) shares = maxSharesByCapital
      const capSharesByPct = Math.floor((currentCapital * maxPositionPct) / t.entryPrice)
      if (shares > capSharesByPct) shares = capSharesByPct
      const positionValue = shares * t.entryPrice
      const pnlScaled = shares > 0 ? shares * t.risk * t.pnlR : 0

      if (skipNext) {
        results.push({ ...t, status: 'skipped', shares: 0, pnlScaled: 0, capitalAtEntry: currentCapital, riskDollars, positionValue: 0 })
        skipNext = false
        consecutiveLosses = 0
        equityCurve.push({ capital: currentCapital, date: t.exitDate })
        continue
      }

      results.push({ ...t, status: 'taken', shares, pnlScaled, capitalAtEntry: currentCapital, riskDollars, positionValue, exitDate: t.exitDate })
      if (shares > 0) {
        currentCapital += pnlScaled
        activePositions.push({ stock: t.stock, exitDate: t.exitDate })
      }
      if (currentCapital > peakCapital) peakCapital = currentCapital
      const dd = peakCapital - currentCapital
      if (dd > maxDD) maxDD = dd
      const ddPct = peakCapital > 0 ? (dd / peakCapital) * 100 : 0
      if (ddPct > maxDDPct) maxDDPct = ddPct
      if (t.pnlR < 0) { consecutiveLosses++; if (consecutiveLosses >= 3) skipNext = true }
      else { consecutiveLosses = 0 }
      equityCurve.push({ capital: currentCapital, date: t.exitDate })
    }

    const taken = results.filter(r => r.status === 'taken')
    const skipped = results.filter(r => r.status === 'skipped')
    const wins = taken.filter(r => r.pnlScaled > 0).length
    const totalPnl = currentCapital - startCapital
    const grossWin = taken.filter(r => r.pnlScaled > 0).reduce((s, r) => s + r.pnlScaled, 0)
    const grossLoss = Math.abs(taken.filter(r => r.pnlScaled < 0).reduce((s, r) => s + r.pnlScaled, 0))
    const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0
    let streak = 0, maxStreak = 0
    for (const r of taken) { if (r.pnlScaled < 0) { streak++; if (streak > maxStreak) maxStreak = streak } else { streak = 0 } }
    return { results, taken, skipped, equityCurve, finalCapital: currentCapital, totalPnl, wins, wr: taken.length > 0 ? (wins / taken.length * 100) : 0, pf, maxDD, maxDDPct, maxStreak }
  }

  // Per-stock (FLAT — we still report per-trade fixed-risk P/L for table comparison)
  function runStrategyFlatForTable(trades, startCapital, riskPctVal) {
    const results = []
    const fixedRisk = startCapital * (riskPctVal / 100)
    const maxPositions = 5
    const maxPositionPct = 0.2
    let activePositions = []
    for (const t of trades) {
      if (t.exitReason === 'Open') continue
      activePositions = activePositions.filter(p => p.exitDate > t.entryDate)
      if (activePositions.length >= maxPositions) {
        results.push({ ...t, status: 'skipped', shares: 0, pnlScaled: 0, capitalAtEntry: startCapital, riskDollars: 0, positionValue: 0 })
        continue
      }
      const shares = Math.floor(fixedRisk / t.risk)
      const capSharesByPct = Math.floor((startCapital * maxPositionPct) / t.entryPrice)
      const actualShares = Math.min(shares, capSharesByPct)
      const positionValue = actualShares * t.entryPrice
      const pnlScaled = actualShares > 0 ? actualShares * t.risk * t.pnlR : 0
      results.push({ ...t, status: 'taken', shares: actualShares, pnlScaled, capitalAtEntry: startCapital, riskDollars: fixedRisk, positionValue, exitDate: t.exitDate })
      if (actualShares > 0) activePositions.push({ stock: t.stock, exitDate: t.exitDate })
    }
    return results
  }

  const strat = allTrades.length > 0 ? runStrategy(allTrades, capital, riskPct) : null
  const flatForTable = allTrades.length > 0 ? runStrategyFlatForTable(allTrades, capital, riskPct) : null
  const openPositions = allTrades.filter(t => t.exitReason === 'Open')
  const riskDollars = capital * riskPct / 100

  // Per-stock (FLAT — no compounding, fixed risk for fair comparison)
  const fixedRisk = capital * riskPct / 100  // e.g. $400 at 1% of $40k
  const stockMap = {}
  if (flatForTable) {
    for (const t of flatForTable.filter(r => r.status === 'taken')) {
      if (!stockMap[t.stock]) stockMap[t.stock] = { wins: 0, losses: 0, pnlFlat: 0, trades: 0 }
      stockMap[t.stock].trades++
      const flatPnl = t.pnlR * fixedRisk  // fixed risk per trade, no compounding
      if (flatPnl > 0) stockMap[t.stock].wins++
      else stockMap[t.stock].losses++
      stockMap[t.stock].pnlFlat += flatPnl
    }
  }
  // Compute peak concurrent invested amount per stock (max exposure at any time), capped at 20% of portfolio
  const investedMap = {}
  const maxPositionPct = 0.2
  if (flatForTable) {
    const taken = flatForTable.filter(r => r.status === 'taken')
    const byStock = {}
    for (const r of taken) {
      if (!byStock[r.stock]) byStock[r.stock] = []
      byStock[r.stock].push(r)
    }
    for (const [stock, trs] of Object.entries(byStock)) {
      trs.sort((a, b) => (a.entryDate || '').localeCompare(b.entryDate || ''))
      let active = []
      let peak = 0
      for (const t of trs) {
        active = active.filter(p => p.exitDate > t.entryDate)
        active.push(t)
        const current = active.reduce((s, p) => s + (p.positionValue || 0), 0)
        if (current > peak) peak = current
      }
      investedMap[stock] = Math.min(peak, capital * maxPositionPct)
    }
  }

  const stockRows = Object.entries(stockMap).map(([s, v]) => {
    const bh = buyHold[s] || {}
    const mcap = marketCaps[s] || bh.marketCap || 0
    const invested = investedMap[s] || 0
    const bhDollar = bh.returnPct ? invested * (bh.returnPct / 100) : 0
    return {
      symbol: s, trades: v.trades, wins: v.wins,
      wr: Math.round((v.wins / v.trades) * 100),
      pnl: v.pnlFlat,
      bhDollar,
      bhRetPct: bh.returnPct || 0,
      mcap,
      category: categories[s] || 'unknown',
    }
  })
  // Sort + helpers
  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }
  const sortedStockRows = [...stockRows].sort((a, b) => {
    let av = a[sortCol], bv = b[sortCol]
    if (typeof av === 'string') av = av.toLowerCase()
    if (typeof bv === 'string') bv = bv.toLowerCase()
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const catColors = { bull: '#4ade80', sideways: '#fbbf24', crashed: '#f87171' }

  return (
    <div className="page-container" style={{ padding: '2rem', maxWidth: 1200 }}>
      <h1 style={{ marginBottom: '0.5rem', fontSize: '1.8rem' }}>🚀 Breakout v3 — Compounding Enabled</h1>
      <p style={{ color: '#a1a1aa', fontSize: 15, marginBottom: '1.5rem' }}>{universe.total || 99} stocks · {settings.period}</p>

      {strat && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <Stat label="Final Capital" value={`$${strat.finalCapital.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`${strat.totalPnl >= 0 ? '+' : ''}${(strat.totalPnl / capital * 100).toFixed(0)}%`} color="#4ade80" />
          <Stat label="Total P/L" value={`${strat.totalPnl >= 0 ? '+' : ''}$${Math.abs(strat.totalPnl).toLocaleString(undefined, {maximumFractionDigits: 0})}`} color={strat.totalPnl >= 0 ? '#4ade80' : '#f87171'} />
          <Stat label="Profit Factor" value={strat.pf.toFixed(2)} color={strat.pf >= 1.5 ? '#4ade80' : '#fbbf24'} />
          <Stat label="Win Rate" value={`${strat.wr.toFixed(0)}%`} sub={`${strat.wins}W / ${strat.taken.length - strat.wins}L`} color="#60a5fa" />
          <Stat label="Max Drawdown" value={`$${strat.maxDD.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`${strat.maxDDPct.toFixed(1)}%`} color="#f87171" />
          <Stat label="Trades" value={strat.taken.length} sub={`${strat.skipped.length} skipped`} color="#a1a1aa" />
        </div>
      )}

      {strat && strat.equityCurve.length > 1 && (
        <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#e4e4e7', fontSize: 16, marginBottom: '1rem' }}>📈 Equity Curve (compounding)</h2>
          <div style={{ height: 220 }}><EquityMini data={strat.equityCurve} startCapital={capital} /></div>
        </div>
      )}

      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#e4e4e7', fontSize: 16, marginBottom: '0.5rem' }}>All Stocks — Strategy vs Buy & Hold</h2>
        <p style={{ color: '#71717a', fontSize: 12, marginBottom: '1rem' }}>This page uses compounding position sizing; the per-stock table shows fixed-risk P/L for fair comparison alongside a B&H computed from peak exposure capped at 20%.</p>
        <div style={{ overflowX: 'auto', maxHeight: 500, overflowY: 'auto' }}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#1e1e2e', zIndex: 1 }}>
              <tr style={{ color: '#a1a1aa', borderBottom: '2px solid #444' }}>
                {[{ key: 'symbol', label: 'Stock', align: 'left' },{ key: 'mcap', label: 'Mkt Cap', align: 'right' },{ key: 'category', label: 'Type', align: 'center' },{ key: 'trades', label: 'Trades', align: 'right' },{ key: 'wr', label: 'Win%', align: 'right' },{ key: 'pnl', label: 'Strat $', align: 'right' },{ key: 'bhDollar', label: 'B&H $', align: 'right' },{ key: 'bhRetPct', label: 'B&H %', align: 'right' }].map(col => (
                  <th key={col.key} onClick={() => toggleSort(col.key)} style={{ textAlign: col.align, padding: '8px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>{col.label} {sortCol === col.key ? (sortDir === 'asc' ? '▲' : '▼') : ''}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedStockRows.map(s => (
                <tr key={s.symbol} style={{ borderBottom: '1px solid #2a2a3e' }}>
                  <td style={{ padding: '6px 8px', color: '#60a5fa', fontWeight: 600 }}>{s.symbol}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#a1a1aa', fontSize: 11 }}>{s.mcap > 0 ? `$${(s.mcap / 1e9).toFixed(0)}B` : '—'}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'center', fontSize: 11, color: catColors[s.category] }}>{s.category}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#e4e4e7' }}>{s.trades}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#e4e4e7' }}>{s.wr}%</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: s.pnl >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>{s.pnl >= 0 ? '+' : ''}${Math.round(s.pnl).toLocaleString()}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: s.bhDollar >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>{s.bhDollar >= 0 ? '+' : ''}${Math.round(s.bhDollar).toLocaleString()}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: s.bhRetPct >= 0 ? '#4ade80' : '#f87171' }}>{s.bhRetPct > 0 ? '+' : ''}{s.bhRetPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {strat && (
        <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 10, padding: '1.25rem' }}>
          <h2 style={{ color: '#e4e4e7', fontSize: 16, marginBottom: '1rem' }}>📝 Trade Log — newest first ({strat.taken.length} taken, {strat.skipped.length} skipped)</h2>
          <div style={{ marginBottom: '0.75rem', display: 'flex', gap: 8, alignItems: 'center' }}>
            <input placeholder="Filter by stock (e.g. AAPL)" value={tradeFilter} onChange={e => setTradeFilter(e.target.value)} style={{ background: '#0f0f1a', border: '1px solid #333', borderRadius: 6, padding: '8px 10px', color: '#e4e4e7', fontSize: 13, width: 180 }} />
            <button onClick={() => setTradeFilter('')} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #555', background: '#0f2a1a', color: '#e4e4e7', cursor: 'pointer' }}>Clear</button>
            <div style={{ color: '#71717a', fontSize: 13 }}>Filtering trades by symbol (case-insensitive)</div>
          </div>
          <div style={{ overflowX: 'auto', maxHeight: 500, overflowY: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#1e1e2e' }}>
                <tr style={{ color: '#a1a1aa', borderBottom: '2px solid #444' }}>
                  <th style={{ textAlign: 'center', padding: '6px 4px' }}>#</th>
                  <th style={{ textAlign: 'left', padding: '6px' }}>Entry</th>
                  <th style={{ textAlign: 'left', padding: '6px' }}>Exit</th>
                  <th style={{ textAlign: 'left', padding: '6px' }}>Stock</th>
                  <th style={{ textAlign: 'right', padding: '6px' }}>Entry $</th>
                  <th style={{ textAlign: 'right', padding: '6px' }}>Initial Stop $</th>
                  <th style={{ textAlign: 'right', padding: '6px' }}>Shares</th>
                  <th style={{ textAlign: 'right', padding: '6px' }}>Pos $</th>
                  <th style={{ textAlign: 'right', padding: '6px' }}>R</th>
                  <th style={{ textAlign: 'right', padding: '6px' }}>P/L</th>
                  <th style={{ textAlign: 'left', padding: '6px' }}>Why</th>
                  <th style={{ textAlign: 'right', padding: '6px' }}>Days</th>
                </tr>
              </thead>
              <tbody>
                {([...strat.results].filter(t => !tradeFilter || t.stock.toLowerCase().includes(tradeFilter.trim().toLowerCase()))).reverse().map((t, i) => {
                  const tradeNum = strat.results.length - i
                  const win = t.pnlScaled > 0
                  const isSkipped = t.status === 'skipped'
                  const capped = t.positionValue >= t.capitalAtEntry * 0.99
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #2a2a3e', opacity: isSkipped ? 0.4 : 1, background: win ? '#071a0f' : 'transparent' }}>
                      <td style={{ padding: '5px 4px', textAlign: 'center', color: '#71717a', fontSize: 11 }}>{tradeNum}</td>
                      <td style={{ padding: '5px 6px', color: '#e4e4e7', fontFamily: 'monospace', fontSize: 11 }}>{t.entryDate}</td>
                      <td style={{ padding: '5px 6px', color: '#d4d4d8', fontFamily: 'monospace', fontSize: 11 }}>{t.exitDate}</td>
                      <td style={{ padding: '5px 6px', color: '#60a5fa', fontWeight: 600 }}>{t.stock}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: '#e4e4e7' }}>${t.entryPrice.toFixed(2)}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: '#f87171' }}>${t.sl.toFixed(2)}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: '#e4e4e7', fontSize: 11 }}>{isSkipped ? '—' : t.shares}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: capped ? '#fbbf24' : '#a1a1aa', fontSize: 11 }}>{isSkipped ? '—' : `$${Math.round(t.positionValue).toLocaleString()}`}{capped && ' ⚠️'}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: win ? '#4ade80' : '#f87171', fontWeight: 700 }}>{t.pnlR > 0 ? '+' : ''}{t.pnlR.toFixed(1)}R</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: win ? '#4ade80' : '#f87171', fontWeight: 600 }}>{isSkipped ? '—' : `${t.pnlScaled >= 0 ? '+' : ''}$${Math.round(t.pnlScaled).toLocaleString()}`}</td>
                      <td style={{ padding: '5px 6px', color: t.exitReason === 'Trail' ? '#4ade80' : '#f87171', fontSize: 11 }}>{isSkipped ? 'SKIP' : t.exitReason}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: '#71717a', fontSize: 11 }}>{t.durationDays}d</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )

}

function Stat({ label, value, sub, color }) {
  return (
    <div style={{ background: '#1e1e2e', border: '1px solid #444', borderRadius: 8, padding: '1rem', textAlign: 'center' }}>
      <div style={{ color: '#a1a1aa', fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ color: color || '#e4e4e7', fontSize: 22, fontWeight: 800 }}>{value}</div>
      {sub && <div style={{ color: '#71717a', fontSize: 12, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function EquityMini({ data, startCapital }) {
  if (!data || data.length < 2) return null
  const values = data.map(d => d.capital)
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const w = 100
  const h = 100
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((d.capital - min) / range) * h
    return `${x},${y}`
  }).join(' ')
  const lastVal = values[values.length - 1]
  const pnl = lastVal - startCapital
  const color = pnl >= 0 ? '#4ade80' : '#f87171'
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: '100%' }} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth="0.5" />
    </svg>
  )
}