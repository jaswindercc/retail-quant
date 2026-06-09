import { useState, useEffect } from 'react'
import { fetchJson } from '../utils'

export default function BreakoutV4Page() {
  const [data, setData] = useState(null)
  const [capital, setCapital] = useState(40000)
  const [riskPct, setRiskPct] = useState(1)
  const [sortCol, setSortCol] = useState('score')
  const [sortDir, setSortDir] = useState('desc')
  const [tradeFilter, setTradeFilter] = useState('')

  useEffect(() => {
    fetchJson(`${import.meta.env.BASE_URL}breakout_v2_sp100_data.json`).then(setData).catch(console.error)
  }, [])

  if (!data) return <div className="loading">Loading Breakout v4…</div>

  const allTrades = data.allTrades || []
  const settings = data.settings || {}
  const buyHold = data.buyHold || {}
  const universe = data.universe || {}
  const categories = universe.categories || {}
  const marketCaps = data.marketCaps || {}

  // Ranking-based breakout (v4): follows Breakout v2 rules but ranks candidates per date and fills top slots.
  // Important: v4 uses FIXED risk per trade (no compounding) to match Breakout v2 — only selection differs.
  function runStrategyV4(trades, startCapital, riskPctVal) {
    const results = []
    const equityCurve = [{ capital: startCapital, date: trades[0]?.entryDate || '' }]
    const fixedRisk = startCapital * (riskPctVal / 100)
    const maxPositions = 5
    const maxPositionPct = 0.2
    let activePositions = []

    // per-stock rolling stats used for ranking (historical win%, recent momentum, avg R)
    const stockStats = {}
    function updateStats(stock, pnlR) {
      if (!stockStats[stock]) stockStats[stock] = { wins: 0, trades: 0, sumPnlR: 0, recent: [] }
      const s = stockStats[stock]
      s.trades++
      if (pnlR > 0) s.wins++
      s.sumPnlR += pnlR
      s.recent.push(pnlR > 0 ? 1 : 0)
      if (s.recent.length > 8) s.recent.shift()
    }

    // group trades by entryDate
    const grouped = {}
    for (const t of trades) {
      if (t.exitReason === 'Open') continue
      ;(grouped[t.entryDate] = grouped[t.entryDate] || []).push(t)
    }
    const dates = Object.keys(grouped).sort()

    for (const date of dates) {
      const todays = grouped[date]
      // remove positions closed before this date
      activePositions = activePositions.filter(p => p.exitDate > date)

      // score candidates
      const scored = todays.map(t => {
        const s = stockStats[t.stock] || { wins: 0, trades: 0, sumPnlR: 0, recent: [] }
        const winRate = s.trades > 0 ? s.wins / s.trades : 0.5
        const recentRate = s.recent.length > 0 ? (s.recent.reduce((a, b) => a + b, 0) / s.recent.length) : 0.5
        const avgPnlR = s.trades > 0 ? s.sumPnlR / s.trades : 0.5
        const score = (winRate * 0.6) + (recentRate * 0.3) + (Math.tanh(avgPnlR / 2) * 0.1)
        return { ...t, score }
      })

      scored.sort((a, b) => b.score - a.score)
      for (const t of scored) {
        if (activePositions.length >= maxPositions) {
          results.push({ ...t, status: 'skipped', shares: 0, pnlScaled: 0, capitalAtEntry: startCapital, riskDollars: 0, positionValue: 0, score: t.score })
          continue
        }
        const shares = Math.floor(fixedRisk / t.risk)
        const capSharesByPct = Math.floor((startCapital * maxPositionPct) / t.entryPrice)
        const actualShares = Math.min(shares, capSharesByPct)
        const positionValue = actualShares * t.entryPrice
        const pnlScaled = actualShares > 0 ? actualShares * t.risk * t.pnlR : 0
        results.push({ ...t, status: 'taken', shares: actualShares, pnlScaled, capitalAtEntry: startCapital, riskDollars: fixedRisk, positionValue, exitDate: t.exitDate, score: t.score })
        if (actualShares > 0) activePositions.push({ stock: t.stock, exitDate: t.exitDate })
        updateStats(t.stock, t.pnlR)
        equityCurve.push({ capital: startCapital, date: t.exitDate })
      }
    }

    const taken = results.filter(r => r.status === 'taken')
    const skipped = results.filter(r => r.status === 'skipped')
    const wins = taken.filter(r => r.pnlScaled > 0).length
    const totalPnl = taken.reduce((s, r) => s + r.pnlScaled, 0)
    const grossWin = taken.filter(r => r.pnlScaled > 0).reduce((s, r) => s + r.pnlScaled, 0)
    const grossLoss = Math.abs(taken.filter(r => r.pnlScaled < 0).reduce((s, r) => s + r.pnlScaled, 0))
    const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0
    return { results, taken, skipped, equityCurve, finalCapital: startCapital + totalPnl, totalPnl, wins, wr: taken.length > 0 ? (wins / taken.length * 100) : 0, pf, maxDD: 0, maxDDPct: 0 }
  }

  const strat = allTrades.length > 0 ? runStrategyV4(allTrades, capital, riskPct) : null
  // follow Breakout v2 UI layout and outputs, but note the new ranking rules below
  const openPositions = allTrades.filter(t => t.exitReason === 'Open')
  const riskDollars = capital * riskPct / 100

  // Per-stock summary (flat)
  const fixedRisk = capital * riskPct / 100
  const stockMap = {}
  if (strat) {
    for (const t of strat.taken) {
      if (!stockMap[t.stock]) stockMap[t.stock] = { wins: 0, losses: 0, pnlFlat: 0, trades: 0 }
      stockMap[t.stock].trades++
      const flatPnl = t.pnlR * fixedRisk
      if (flatPnl > 0) stockMap[t.stock].wins++
      else stockMap[t.stock].losses++
      stockMap[t.stock].pnlFlat += flatPnl
    }
  }

  // investedMap (peak concurrent exposure per stock), capped at 20% of capital
  const investedMap = {}
  if (strat) {
    const taken = strat.results.filter(r => r.status === 'taken')
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
      investedMap[stock] = Math.min(peak, capital * 0.2)
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

  // Sort stock rows
  const toggleSort = (col) => { if (sortCol === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('desc') } }
  const sortedStockRows = [...stockRows].sort((a, b) => {
    let av = a[sortCol], bv = b[sortCol]
    if (typeof av === 'string') av = av.toLowerCase()
    if (typeof bv === 'string') bv = bv.toLowerCase()
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const catColors = { bull: '#4ade80', sideways: '#fbbf24', crashed: '#f87171' }
  const catSummary = {}
  for (const r of stockRows) {
    if (!catSummary[r.category]) catSummary[r.category] = { trades: 0, wins: 0, pnl: 0, stocks: 0 }
    catSummary[r.category].trades += r.trades
    catSummary[r.category].wins += r.wins
    catSummary[r.category].pnl += r.pnl
    catSummary[r.category].stocks++
  }

  return (
    <div className="page-container" style={{ padding: '2rem', maxWidth: 1200 }}>

      <h1 style={{ marginBottom: '0.5rem', fontSize: '1.8rem' }}>🚀 Breakout v4 — Ranking Switcher</h1>
      <p style={{ color: '#a1a1aa', fontSize: 15, marginBottom: '1.5rem' }}>{universe.total || 99} stocks · {settings.period} · No cherry-picking · Ranking-based selection</p>

      <div style={{ background: '#1a1a2e', border: '1px solid #ec4899', borderRadius: 12, padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#ec4899', fontSize: 18, marginBottom: '1rem' }}>🔁 New Rules — Breakout v4</h2>
        <div style={{ fontSize: 14, color: '#e4e4e7', lineHeight: 2.2 }}>
          <div style={{ marginBottom: '0.75rem' }}>• Everything from Breakout v2 applies (fixed ${fixedRisk.toLocaleString(undefined, {maximumFractionDigits:0})} risk per trade, max 5 positions, 20% per-stock cap, no compounding in table comparisons).</div>
          <div style={{ marginBottom: '0.75rem' }}>• At each signal date, all candidate stocks are scored using a composite ranking (historical win-rate, recent win/momentum, average R).</div>
          <div style={{ marginBottom: '0.75rem' }}>• The top-scoring candidates are taken until the portfolio has at most 5 open positions (ties broken by score).</div>
          <div style={{ marginBottom: '0.75rem' }}>• The ranking is adaptive: it updates after each taken trade using that stock's recent outcomes (rolling 8-trade window).</div>
          <div>• Goal: reduce drawdown and concentrate capital into stocks with stronger recent performance while preserving the original risk & stop rules.</div>
        </div>
      </div>

      {/* RISK CONFIG */}
      <div style={{ background: '#1e1e2e', border: '1px solid #555', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', fontSize: 14 }}>
          <div>
            <label style={{ color: '#a1a1aa', fontSize: 13, display: 'block', marginBottom: 6 }}>Account Size ($)</label>
            <input type="number" value={capital} onChange={e => setCapital(Math.max(1000, +e.target.value || 40000))}
              style={{ background: '#0f0f1a', border: '1px solid #555', borderRadius: 6, padding: '10px 14px', color: '#e4e4e7', width: '100%', fontSize: 16 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ color: '#a1a1aa', fontSize: 13 }}>Mode: <strong style={{ color: '#e4e4e7', marginLeft: 8 }}>No compounding (fixed risk per trade)</strong></div>
          </div>
          <div>
            <label style={{ color: '#a1a1aa', fontSize: 13, display: 'block', marginBottom: 6 }}>Risk per Trade</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[0.5, 1, 1.5, 2].map(pct => (
                <button key={pct} onClick={() => setRiskPct(pct)}
                  style={{ padding: '10px 16px', borderRadius: 6, border: riskPct === pct ? '2px solid #4ade80' : '1px solid #555', background: riskPct === pct ? '#0f2a1a' : '#0f0f1a', color: riskPct === pct ? '#4ade80' : '#e4e4e7', fontSize: 15, fontWeight: riskPct === pct ? 700 : 400, cursor: 'pointer' }}>
                  {pct}%
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ background: '#0f0f1a', border: '1px solid #555', borderRadius: 6, padding: '10px 16px', textAlign: 'center', width: '100%' }}>
              <div style={{ color: '#a1a1aa', fontSize: 12 }}>Risk/trade</div>
              <div style={{ color: '#4ade80', fontSize: 24, fontWeight: 800 }}>${riskDollars.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
            </div>
          </div>
        </div>
      </div>

      {/* STATS */}
      {strat && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <Stat label="Final Capital" value={`$${strat.finalCapital.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`${strat.totalPnl >= 0 ? '+' : ''}${(strat.totalPnl / capital * 100).toFixed(0)}%`} color="#ec4899" />
          <Stat label="Total P/L" value={`${strat.totalPnl >= 0 ? '+' : ''}$${Math.abs(strat.totalPnl).toLocaleString(undefined, {maximumFractionDigits: 0})}`} color={strat.totalPnl >= 0 ? '#4ade80' : '#f87171'} />
          <Stat label="Profit Factor" value={strat.pf.toFixed(2)} color={strat.pf >= 1.5 ? '#4ade80' : '#fbbf24'} />
          <Stat label="Win Rate" value={`${strat.wr.toFixed(0)}%`} sub={`${strat.wins}W / ${strat.taken.length - strat.wins}L`} color="#60a5fa" />
          <Stat label="Trades" value={strat.taken.length} sub={`${strat.skipped.length} skipped`} color="#a1a1aa" />
        </div>
      )}

      {/* EQUITY CURVE */}
      {strat && strat.equityCurve.length > 1 && (
        <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#e4e4e7', fontSize: 16, marginBottom: '1rem' }}>📈 Equity Curve (no compounding)</h2>
          <div style={{ height: 220, position: 'relative' }}>
            <EquityMini data={strat.equityCurve} startCapital={capital} />
          </div>
        </div>
      )}

      {/* CATEGORY BREAKDOWN */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#e4e4e7', fontSize: 16, marginBottom: '1rem' }}>Results by Stock Type</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
          {['bull', 'sideways', 'crashed'].map(cat => {
            const s = catSummary[cat] || { trades: 0, wins: 0, pnl: 0, stocks: 0 }
            const wr = s.trades > 0 ? (s.wins / s.trades * 100).toFixed(0) : 0
            return (
              <div key={cat} style={{ background: '#0f0f1a', border: `1px solid ${catColors[cat]}`, borderRadius: 8, padding: '1rem' }}>
                <div style={{ color: catColors[cat], fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{cat === 'bull' ? '🐂 Bull' : cat === 'sideways' ? '➡️ Sideways' : '💀 Crashed'}</div>
                <div style={{ color: '#e4e4e7', fontSize: 20, fontWeight: 800 }}>{s.pnl >= 0 ? '+' : ''}${Math.round(s.pnl).toLocaleString()}</div>
                <div style={{ color: '#a1a1aa', fontSize: 12, marginTop: 4 }}>{s.trades} trades · {wr}% WR · {s.stocks} stocks</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* OPEN POSITIONS */}
      {openPositions.length > 0 && (
        <div style={{ background: '#0a1628', border: '2px solid #ec4899', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#ec4899', fontSize: 16, marginBottom: '1rem' }}>📍 Open: {openPositions.length} positions</h2>
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#a1a1aa', borderBottom: '1px solid #444' }}>
                <th style={{ textAlign: 'left', padding: '8px' }}>Stock</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>Entry</th>
                <th style={{ textAlign: 'right', padding: '8px' }}>Entry $</th>
                <th style={{ textAlign: 'right', padding: '8px' }}>Stop $</th>
                <th style={{ textAlign: 'right', padding: '8px' }}>Current R</th>
                <th style={{ textAlign: 'center', padding: '8px' }}>Trail?</th>
              </tr>
            </thead>
            <tbody>
              {openPositions.map((t, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #2a2a3e', background: '#071a0f' }}>
                  <td style={{ padding: '8px', color: '#ec4899', fontWeight: 700 }}>{t.stock}</td>
                  <td style={{ padding: '8px', color: '#d4d4d8', fontFamily: 'monospace', fontSize: 12 }}>{t.entryDate}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#e4e4e7' }}>${t.entryPrice.toFixed(2)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#f87171' }}>${t.sl.toFixed(2)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#4ade80', fontWeight: 800 }}>+{t.pnlR.toFixed(1)}R</td>
                  <td style={{ padding: '8px', textAlign: 'center', color: t.pnlR >= 2 ? '#4ade80' : '#71717a' }}>{t.pnlR >= 2 ? '✓ YES' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* PER-STOCK TABLE */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#e4e4e7', fontSize: 16, marginBottom: '0.5rem' }}>All Stocks — Strategy vs Buy & Hold</h2>
        <p style={{ color: '#71717a', fontSize: 12, marginBottom: '1rem' }}>
          Fixed ${fixedRisk.toLocaleString(undefined, {maximumFractionDigits: 0})} risk/trade (no compounding). B&H shown uses the actual amount invested in each stock across taken trades (peak concurrent exposure), capped at 20% of account.
        </p>
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
                  <td style={{ padding: '6px 8px', color: '#ec4899', fontWeight: 600 }}>{s.symbol}</td>
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

      {/* STRATEGY TRADES */}
      {strat && (
        <div style={{ background: '#0f1724', border: '1px solid #333', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#e4e4e7', fontSize: 16, marginBottom: '0.5rem' }}>Strategy Trades (v4) — Taken / Skipped</h2>
          <p style={{ color: '#71717a', fontSize: 12, marginBottom: '0.75rem' }}>This table shows the actual decisions made by the ranking engine: status, score, allocated shares and scaled P/L.</p>
          <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#0b1220', zIndex: 1 }}>
                <tr style={{ color: '#a1a1aa', borderBottom: '2px solid #444' }}>
                  {['Status','Stock','Entry','Entry $','Shares','Score','Strat $'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {strat.results.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #172033', background: r.status === 'taken' ? '#071a0f' : '#0b0b12' }}>
                    <td style={{ padding: '6px 8px', color: r.status === 'taken' ? '#4ade80' : '#fbbf24', fontWeight: 700 }}>{r.status}</td>
                    <td style={{ padding: '6px 8px', color: '#e4e4e7', fontWeight: 600 }}>{r.stock}</td>
                    <td style={{ padding: '6px 8px', color: '#9ca3af', fontFamily: 'monospace' }}>{r.entryDate}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#e4e4e7' }}>${(r.entryPrice || 0).toFixed(2)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#e4e4e7' }}>{r.shares}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#60a5fa' }}>{r.score ? r.score.toFixed(4) : ''}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: r.pnlScaled >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>{r.pnlScaled >= 0 ? '+' : ''}${Math.round(r.pnlScaled)}</td>
                  </tr>
                ))}
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
