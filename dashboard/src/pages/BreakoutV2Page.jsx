import { useState, useEffect } from 'react'
import { fetchJson } from '../utils'

export default function BreakoutV2Page() {
  const [data, setData] = useState(null)
  const [capital, setCapital] = useState(40000)
  const [riskPct, setRiskPct] = useState(1)
  const [showTrades, setShowTrades] = useState(false)
  const [showRules, setShowRules] = useState(false)

  useEffect(() => {
    fetchJson(`${import.meta.env.BASE_URL}breakout_v2_data.json`)
      .then(setData).catch(console.error)
  }, [])

  if (!data) return <div className="loading">Loading Breakout v2…</div>

  const allTrades = data.allTrades || []
  const settings = data.settings || {}
  const v2Additions = settings.v2_additions || []

  // ── Compounding + Skip after 3L (same logic as BT5) ──
  function runStrategy(trades, startCapital, riskPctVal) {
    let currentCapital = startCapital
    let peakCapital = startCapital
    let maxDD = 0, maxDDPct = 0
    let consecutiveLosses = 0, skipNext = false
    const results = []
    const equityCurve = [{ capital: startCapital, date: trades[0]?.entryDate || '' }]

    for (const t of trades) {
      if (t.exitReason === 'Open') continue // skip open positions

      const riskDollars = currentCapital * (riskPctVal / 100)
      const shares = Math.floor(riskDollars / t.risk)
      const pnlScaled = shares > 0 ? t.pnlR * riskDollars : 0

      if (skipNext) {
        results.push({ ...t, status: 'skipped', shares: 0, pnlScaled: 0, capitalAtEntry: currentCapital, riskDollars })
        skipNext = false
        consecutiveLosses = 0
        equityCurve.push({ capital: currentCapital, date: t.exitDate })
        continue
      }

      results.push({ ...t, status: 'taken', shares, pnlScaled, capitalAtEntry: currentCapital, riskDollars })
      if (shares > 0) currentCapital += pnlScaled
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

  const strat = allTrades.length > 0 ? runStrategy(allTrades, capital, riskPct) : null

  // Per-stock breakdown
  const stockMap = {}
  if (strat) {
    for (const t of strat.taken) {
      if (!stockMap[t.stock]) stockMap[t.stock] = { wins: 0, losses: 0, pnl: 0 }
      if (t.pnlScaled > 0) stockMap[t.stock].wins++
      else stockMap[t.stock].losses++
      stockMap[t.stock].pnl += t.pnlScaled
    }
  }

  const stockRows = Object.entries(stockMap).map(([s, v]) => ({
    symbol: s, trades: v.wins + v.losses, wins: v.wins,
    wr: ((v.wins / (v.wins + v.losses)) * 100).toFixed(0),
    pnl: v.pnl
  })).sort((a, b) => b.pnl - a.pnl)

  return (
    <div className="page-container" style={{ padding: '1.5rem', maxWidth: 1100 }}>
      <h1 style={{ marginBottom: '0.25rem' }}>🚀 Breakout v2</h1>
      <p style={{ color: '#71717a', fontSize: 12, marginBottom: '0.5rem' }}>
        Same base as v1 + quality filters + portfolio management · Compounding with configurable risk
      </p>
      <p style={{ color: '#52525b', fontSize: 11, marginBottom: '1.5rem' }}>
        Based on: Breakout v1 · {allTrades.length} trades · {allTrades.length > 0 ? allTrades[0].entryDate : ''} → {allTrades.length > 0 ? allTrades[allTrades.length-1].exitDate : ''}
      </p>

      {/* ═══ V2 ADDITIONS ═══ */}
      <div style={{ background: '#0a1628', border: '1px solid #60a5fa', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#60a5fa', fontSize: 13, marginBottom: '0.5rem' }}>What v2 adds on top of v1</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.25rem', fontSize: 12, color: '#d4d4d8' }}>
          {v2Additions.map((a, i) => <div key={i}>✅ {a}</div>)}
        </div>
      </div>

      {/* ═══ RISK CONFIGURATOR ═══ */}
      <div style={{ background: '#1e1e2e', border: '1px solid #6366f1', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: 13, color: '#6366f1', fontWeight: 700, marginBottom: '0.75rem' }}>⚙️ Configure Your Risk</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', fontSize: 13 }}>
          <div>
            <label style={{ color: '#71717a', fontSize: 11, display: 'block', marginBottom: 4 }}>Account Capital ($)</label>
            <input type="number" value={capital} onChange={e => setCapital(Math.max(1000, +e.target.value || 40000))}
              style={{ background: '#0f0f1a', border: '1px solid #444', borderRadius: 4, padding: '6px 10px', color: '#e4e4e7', width: '100%', fontSize: 14 }} />
          </div>
          <div>
            <label style={{ color: '#71717a', fontSize: 11, display: 'block', marginBottom: 4 }}>Risk per Trade (%)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[0.5, 1, 1.5, 2, 3].map(pct => (
                <button key={pct} onClick={() => setRiskPct(pct)}
                  style={{ padding: '6px 12px', borderRadius: 4, border: riskPct === pct ? '2px solid #4ade80' : '1px solid #444', background: riskPct === pct ? '#0f2a1a' : '#0f0f1a', color: riskPct === pct ? '#4ade80' : '#e4e4e7', fontSize: 13, fontWeight: riskPct === pct ? 700 : 400, cursor: 'pointer' }}>
                  {pct}%
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ background: '#0f0f1a', border: '1px solid #444', borderRadius: 4, padding: '6px 12px', textAlign: 'center', width: '100%' }}>
              <div style={{ color: '#71717a', fontSize: 10 }}>Risk/trade at start</div>
              <div style={{ color: '#4ade80', fontSize: 20, fontWeight: 800 }}>${(capital * riskPct / 100).toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: '#71717a' }}>
          💡 Risk compounds with your capital. After a loss, your next trade risks less $ (capital shrinks). After wins, you size up naturally.
        </div>
      </div>

      {/* ═══ PERFORMANCE STATS ═══ */}
      {strat && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <Stat label="Final Capital" value={`$${strat.finalCapital.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`${strat.totalPnl >= 0 ? '+' : ''}${(strat.totalPnl / capital * 100).toFixed(0)}%`} color="#4ade80" />
          <Stat label="Total P/L" value={`$${strat.totalPnl >= 0 ? '+' : ''}${strat.totalPnl.toLocaleString(undefined, {maximumFractionDigits: 0})}`} color={strat.totalPnl >= 0 ? '#4ade80' : '#f87171'} />
          <Stat label="Profit Factor" value={strat.pf.toFixed(2)} color={strat.pf >= 1.5 ? '#4ade80' : '#fbbf24'} />
          <Stat label="Win Rate" value={`${strat.wr.toFixed(1)}%`} sub={`${strat.wins}/${strat.taken.length}`} color="#60a5fa" />
          <Stat label="Max DD" value={`$${strat.maxDD.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`${strat.maxDDPct.toFixed(1)}%`} color="#f87171" />
          <Stat label="Return / DD" value={(strat.totalPnl / Math.max(strat.maxDD, 1)).toFixed(2)} color="#60a5fa" />
          <Stat label="Max Streak" value={strat.maxStreak} sub="losses" color={strat.maxStreak > 5 ? '#f87171' : '#fbbf24'} />
          <Stat label="Skipped" value={strat.skipped.length} sub="trades" color="#71717a" />
        </div>
      )}

      {/* ═══ EQUITY CURVE ═══ */}
      {strat && strat.equityCurve.length > 1 && (
        <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#a1a1aa', fontSize: 13, marginBottom: '0.75rem' }}>📈 Equity Curve (compounding at {riskPct}% risk)</h2>
          <div style={{ height: 200, position: 'relative' }}>
            <EquityMini data={strat.equityCurve} startCapital={capital} />
          </div>
        </div>
      )}

      {/* ═══ PER-STOCK BREAKDOWN ═══ */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#a1a1aa', fontSize: 13, marginBottom: '0.75rem' }}>📊 Per-Stock Breakdown</h2>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: '#71717a', borderBottom: '1px solid #333' }}>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>Stock</th>
              <th style={{ textAlign: 'right', padding: '4px 8px' }}>Trades</th>
              <th style={{ textAlign: 'right', padding: '4px 8px' }}>Win Rate</th>
              <th style={{ textAlign: 'right', padding: '4px 8px' }}>P/L</th>
            </tr>
          </thead>
          <tbody>
            {stockRows.map(s => (
              <tr key={s.symbol} style={{ borderBottom: '1px solid #1a1a2e' }}>
                <td style={{ padding: '5px 8px', color: '#60a5fa', fontWeight: 600 }}>{s.symbol}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right' }}>{s.trades}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right' }}>{s.wr}%</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', color: s.pnl >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                  {s.pnl >= 0 ? '+' : ''}${Math.round(s.pnl).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ═══ RULES ═══ */}
      <div style={{ marginBottom: '1.5rem' }}>
        <button onClick={() => setShowRules(!showRules)}
          style={{ background: '#0f2a1a', border: '1px solid #4ade80', borderRadius: 6, padding: '8px 16px', color: '#4ade80', fontSize: 12, fontWeight: 600, cursor: 'pointer', width: '100%', textAlign: 'left' }}>
          {showRules ? '▼' : '▶'} Full Rules
        </button>
        {showRules && (
          <div style={{ background: '#0f2a1a', border: '1px solid #4ade80', borderRadius: 8, padding: '1.25rem', marginTop: '0.75rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: 12, lineHeight: 1.9, color: '#d4d4d8' }}>
              <div>
                <div><strong style={{ color: '#4ade80' }}>Entry:</strong> Close &gt; 20d Donchian high</div>
                <div><strong style={{ color: '#4ade80' }}>Trend:</strong> Price &gt; SMA50</div>
                <div><strong style={{ color: '#4ade80' }}>Volume:</strong> &gt; 1.2x 20-day average</div>
                <div><strong style={{ color: '#4ade80' }}>Close quality:</strong> Upper 60% of bar range</div>
                <div><strong style={{ color: '#4ade80' }}>Confirmation:</strong> Next day open &ge; breakout level</div>
              </div>
              <div>
                <div><strong style={{ color: '#4ade80' }}>Regime:</strong> SPY &gt; 200 SMA (cash otherwise)</div>
                <div><strong style={{ color: '#4ade80' }}>Stop:</strong> Entry - 1x ATR(14)</div>
                <div><strong style={{ color: '#4ade80' }}>Trail:</strong> EMA20 - 1x ATR (activates at 2.5R)</div>
                <div><strong style={{ color: '#4ade80' }}>Max positions:</strong> {settings.maxPositions || 3}</div>
                <div><strong style={{ color: '#4ade80' }}>Skip:</strong> After 3 consecutive losses, skip 1</div>
                <div><strong style={{ color: '#4ade80' }}>Sizing:</strong> {riskPct}% of current capital / ATR = shares</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ TRADE LOG ═══ */}
      <div style={{ marginBottom: '1.5rem' }}>
        <button onClick={() => setShowTrades(!showTrades)}
          style={{ background: '#1e1e2e', border: '1px solid #6366f1', borderRadius: 6, padding: '8px 16px', color: '#6366f1', fontSize: 12, fontWeight: 600, cursor: 'pointer', width: '100%', textAlign: 'left' }}>
          {showTrades ? '▼' : '▶'} All Trades ({strat?.taken.length || 0} taken, {strat?.skipped.length || 0} skipped)
        </button>
        {showTrades && strat && (
          <div style={{ marginTop: '0.75rem', overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: '#71717a', borderBottom: '1px solid #333' }}>
                  <th style={{ textAlign: 'left', padding: '4px 6px' }}>Stock</th>
                  <th style={{ textAlign: 'left', padding: '4px 6px' }}>Entry</th>
                  <th style={{ textAlign: 'left', padding: '4px 6px' }}>Exit</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px' }}>R</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px' }}>P/L</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px' }}>Capital</th>
                  <th style={{ textAlign: 'left', padding: '4px 6px' }}>Reason</th>
                  <th style={{ textAlign: 'center', padding: '4px 6px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {strat.results.map((t, i) => {
                  const win = t.pnlScaled > 0
                  const isSkipped = t.status === 'skipped'
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #1a1a2e', opacity: isSkipped ? 0.5 : 1, background: isSkipped ? '#1f0a0a' : win ? '#0a1f14' : 'transparent' }}>
                      <td style={{ padding: '4px 6px', color: '#60a5fa', fontWeight: 600 }}>{t.stock}</td>
                      <td style={{ padding: '4px 6px', color: '#a1a1aa' }}>{t.entryDate}</td>
                      <td style={{ padding: '4px 6px', color: '#a1a1aa' }}>{t.exitDate}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right', color: win ? '#4ade80' : '#f87171', fontWeight: 700 }}>{t.pnlR > 0 ? '+' : ''}{t.pnlR.toFixed(1)}R</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right', color: win ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                        {isSkipped ? '—' : `${t.pnlScaled >= 0 ? '+' : ''}$${Math.round(t.pnlScaled).toLocaleString()}`}
                      </td>
                      <td style={{ padding: '4px 6px', textAlign: 'right', color: '#71717a', fontSize: 10 }}>${Math.round(t.capitalAtEntry).toLocaleString()}</td>
                      <td style={{ padding: '4px 6px', color: '#71717a', fontSize: 10 }}>{t.exitReason}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'center', fontSize: 10 }}>
                        {isSkipped ? <span style={{ color: '#f87171' }}>SKIPPED</span> : <span style={{ color: '#4ade80' }}>✓</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, sub, color }) {
  return (
    <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 6, padding: '0.6rem', textAlign: 'center' }}>
      <div style={{ color: '#71717a', fontSize: 10 }}>{label}</div>
      <div style={{ color: color || '#e4e4e7', fontSize: 20, fontWeight: 800 }}>{value}</div>
      {sub && <div style={{ color: '#52525b', fontSize: 10 }}>{sub}</div>}
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
