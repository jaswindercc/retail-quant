import { useState, useEffect } from 'react'
import { fetchJson } from '../utils'

export default function BreakoutV2Page() {
  const [data, setData] = useState(null)
  const [capital, setCapital] = useState(40000)
  const [riskPct, setRiskPct] = useState(1)

  useEffect(() => {
    fetchJson(`${import.meta.env.BASE_URL}breakout_v2_data.json`)
      .then(setData).catch(console.error)
  }, [])

  if (!data) return <div className="loading">Loading Breakout v2…</div>

  const allTrades = data.allTrades || []
  const settings = data.settings || {}
  const v2Additions = settings.v2_additions || []
  const buyHold = data.buyHold || {}

  // ── Compounding + Skip after 3L (same logic as BT5) ──
  function runStrategy(trades, startCapital, riskPctVal) {
    let currentCapital = startCapital
    let peakCapital = startCapital
    let maxDD = 0, maxDDPct = 0
    let consecutiveLosses = 0, skipNext = false
    const results = []
    const equityCurve = [{ capital: startCapital, date: trades[0]?.entryDate || '' }]

    for (const t of trades) {
      if (t.exitReason === 'Open') continue

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

  // Per-stock breakdown with buy & hold
  const stockMap = {}
  if (strat) {
    for (const t of strat.taken) {
      if (!stockMap[t.stock]) stockMap[t.stock] = { wins: 0, losses: 0, pnl: 0 }
      if (t.pnlScaled > 0) stockMap[t.stock].wins++
      else stockMap[t.stock].losses++
      stockMap[t.stock].pnl += t.pnlScaled
    }
  }

  const stockRows = Object.entries(stockMap).map(([s, v]) => {
    const bh = buyHold[s] || {}
    const stratRetPct = capital > 0 ? (v.pnl / capital) * 100 : 0
    return {
      symbol: s, trades: v.wins + v.losses, wins: v.wins,
      wr: ((v.wins / (v.wins + v.losses)) * 100).toFixed(0),
      pnl: v.pnl,
      stratRetPct: stratRetPct.toFixed(1),
      bhRetPct: bh.returnPct || 0,
      bhStart: bh.startPrice,
      bhEnd: bh.endPrice,
    }
  }).sort((a, b) => b.pnl - a.pnl)

  return (
    <div className="page-container" style={{ padding: '2rem', maxWidth: 1200 }}>
      <h1 style={{ marginBottom: '0.5rem', fontSize: '1.8rem' }}>🚀 Breakout v2</h1>
      <p style={{ color: '#a1a1aa', fontSize: 15, marginBottom: '0.5rem' }}>
        Same base as v1 + quality filters + portfolio management · Compounding with configurable risk
      </p>
      <p style={{ color: '#71717a', fontSize: 13, marginBottom: '1.5rem' }}>
        Based on: Breakout v1 · {allTrades.length} trades · {allTrades.length > 0 ? allTrades[0].entryDate : ''} → {allTrades.length > 0 ? allTrades[allTrades.length-1].exitDate : ''}
      </p>

      {/* ═══ V2 ADDITIONS ═══ */}
      <div style={{ background: '#0a1628', border: '1px solid #60a5fa', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#60a5fa', fontSize: 16, marginBottom: '0.75rem' }}>What v2 adds on top of v1</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.5rem', fontSize: 14, color: '#e4e4e7', lineHeight: 1.8 }}>
          {v2Additions.map((a, i) => <div key={i}>✅ {a}</div>)}
        </div>
      </div>

      {/* ═══ RISK CONFIGURATOR ═══ */}
      <div style={{ background: '#1e1e2e', border: '1px solid #6366f1', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: 16, color: '#6366f1', fontWeight: 700, marginBottom: '1rem' }}>⚙️ Configure Your Risk</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', fontSize: 14 }}>
          <div>
            <label style={{ color: '#a1a1aa', fontSize: 13, display: 'block', marginBottom: 6 }}>Account Capital ($)</label>
            <input type="number" value={capital} onChange={e => setCapital(Math.max(1000, +e.target.value || 40000))}
              style={{ background: '#0f0f1a', border: '1px solid #555', borderRadius: 6, padding: '10px 14px', color: '#e4e4e7', width: '100%', fontSize: 16 }} />
          </div>
          <div>
            <label style={{ color: '#a1a1aa', fontSize: 13, display: 'block', marginBottom: 6 }}>Risk per Trade (%)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[0.5, 1, 1.5, 2, 3].map(pct => (
                <button key={pct} onClick={() => setRiskPct(pct)}
                  style={{ padding: '10px 16px', borderRadius: 6, border: riskPct === pct ? '2px solid #4ade80' : '1px solid #555', background: riskPct === pct ? '#0f2a1a' : '#0f0f1a', color: riskPct === pct ? '#4ade80' : '#e4e4e7', fontSize: 15, fontWeight: riskPct === pct ? 700 : 400, cursor: 'pointer' }}>
                  {pct}%
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ background: '#0f0f1a', border: '1px solid #555', borderRadius: 6, padding: '10px 16px', textAlign: 'center', width: '100%' }}>
              <div style={{ color: '#a1a1aa', fontSize: 12 }}>Risk/trade at start</div>
              <div style={{ color: '#4ade80', fontSize: 24, fontWeight: 800 }}>${(capital * riskPct / 100).toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12, fontSize: 13, color: '#a1a1aa' }}>
          💡 Risk compounds with your capital. After a loss, your next trade risks less $ (capital shrinks). After wins, you size up naturally.
        </div>
      </div>

      {/* ═══ PERFORMANCE STATS ═══ */}
      {strat && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
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
        <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#e4e4e7', fontSize: 16, marginBottom: '1rem' }}>📈 Equity Curve (compounding at {riskPct}% risk)</h2>
          <div style={{ height: 220, position: 'relative' }}>
            <EquityMini data={strat.equityCurve} startCapital={capital} />
          </div>
        </div>
      )}

      {/* ═══ PER-STOCK BREAKDOWN ═══ */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#e4e4e7', fontSize: 16, marginBottom: '1rem' }}>📊 Per-Stock Breakdown — Strategy vs Buy & Hold</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#a1a1aa', borderBottom: '2px solid #444' }}>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Stock</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Trades</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Win Rate</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Strategy P/L</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Strategy %</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Buy & Hold %</th>
                <th style={{ textAlign: 'center', padding: '10px 12px' }}>Alpha</th>
              </tr>
            </thead>
            <tbody>
              {stockRows.map(s => {
                const alpha = (parseFloat(s.stratRetPct) - s.bhRetPct).toFixed(1)
                return (
                  <tr key={s.symbol} style={{ borderBottom: '1px solid #2a2a3e' }}>
                    <td style={{ padding: '10px 12px', color: '#60a5fa', fontWeight: 700, fontSize: 15 }}>{s.symbol}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#e4e4e7' }}>{s.trades}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#e4e4e7' }}>{s.wr}%</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: s.pnl >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                      {s.pnl >= 0 ? '+' : ''}${Math.round(s.pnl).toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: parseFloat(s.stratRetPct) >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                      {s.stratRetPct}%
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: s.bhRetPct >= 0 ? '#a78bfa' : '#f87171', fontWeight: 600 }}>
                      {s.bhRetPct > 0 ? '+' : ''}{s.bhRetPct}%
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: parseFloat(alpha) >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                      {parseFloat(alpha) >= 0 ? '+' : ''}{alpha}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: '1rem', fontSize: 12, color: '#71717a' }}>
          Buy & Hold = holding from first to last trade date. Alpha = Strategy return − Buy & Hold. Strategy % is relative to starting capital.
        </div>
      </div>

      {/* ═══ RULES — ALWAYS SHOWN ═══ */}
      <div style={{ background: '#0f2a1a', border: '1px solid #4ade80', borderRadius: 10, padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#4ade80', fontSize: 18, marginBottom: '1.25rem' }}>📋 Strategy Rules</h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', fontSize: 14, lineHeight: 2.2, color: '#e4e4e7', marginBottom: '1.5rem' }}>
          <div>
            <h3 style={{ color: '#60a5fa', fontSize: 15, marginBottom: '0.5rem' }}>Entry Conditions</h3>
            <div>• Close &gt; 20d Donchian high (breakout)</div>
            <div>• Price &gt; SMA50 (uptrend)</div>
            <div>• Volume &gt; 1.2x 20-day average</div>
            <div>• Close in upper 60% of bar (strong close)</div>
            <div>• Next day open ≥ breakout level (confirmation)</div>
          </div>
          <div>
            <h3 style={{ color: '#60a5fa', fontSize: 15, marginBottom: '0.5rem' }}>Risk Management</h3>
            <div>• <strong>Regime:</strong> SPY &gt; 200 SMA (cash otherwise)</div>
            <div>• <strong>Stop:</strong> Entry − 1x ATR(14)</div>
            <div>• <strong>Trail:</strong> EMA20 − 1x ATR (activates at 2.5R)</div>
            <div>• <strong>Max positions:</strong> {settings.maxPositions || 3}</div>
            <div>• <strong>Skip:</strong> After 3 consecutive losses, skip 1</div>
            <div>• <strong>Sizing:</strong> {riskPct}% of current capital / ATR = shares</div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #2a5e3a', paddingTop: '1.25rem', marginBottom: '1.25rem' }}>
          <h3 style={{ color: '#fbbf24', fontSize: 15, marginBottom: '0.75rem' }}>📅 Daily Routine</h3>
          <div style={{ fontSize: 14, lineHeight: 2.2, color: '#e4e4e7' }}>
            <div>1. <strong>Pre-market (8:30 AM):</strong> Check SPY vs 200 SMA — if below, no trades today</div>
            <div>2. <strong>Scan:</strong> Which stocks closed above 20d Donchian high yesterday with volume + strong close?</div>
            <div>3. <strong>Confirm:</strong> If open ≥ breakout level → enter. Calculate stop (entry − ATR) and shares ({riskPct}% capital / ATR)</div>
            <div>4. <strong>Manage:</strong> Check open positions — any stops hit? Any at 2.5R for trail activation?</div>
            <div>5. <strong>Log:</strong> Record entry/exit in journal. Track consecutive losses (3 = skip next)</div>
            <div>6. <strong>EOD:</strong> Update equity curve. Review if any positions need trail adjustment</div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #2a5e3a', paddingTop: '1.25rem' }}>
          <h3 style={{ color: '#f87171', fontSize: 15, marginBottom: '0.75rem' }}>🚫 What NOT to Do</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: 14, lineHeight: 2, color: '#fca5a5' }}>
            <div>
              <div>✗ Don't enter if SPY &lt; 200 SMA (bear market)</div>
              <div>✗ Don't chase — must have next-day confirmation</div>
              <div>✗ Don't buy weak closes (lower 40% of range)</div>
              <div>✗ Don't override the 3-loss skip rule</div>
              <div>✗ Don't add to losers or average down</div>
            </div>
            <div>
              <div>✗ Don't exceed {settings.maxPositions || 3} positions at once</div>
              <div>✗ Don't widen stops after entry</div>
              <div>✗ Don't take profits early — let trail work</div>
              <div>✗ Don't trade low-volume breakouts (&lt;1.2x avg)</div>
              <div>✗ Don't FOMO into extended moves (&gt;4 ATR from SMA50)</div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ TRADE LOG — ALWAYS SHOWN, REVERSE CHRONO ═══ */}
      {strat && (
        <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#e4e4e7', fontSize: 16, marginBottom: '1rem' }}>
            📝 All Trades — {strat.taken.length} taken, {strat.skipped.length} skipped (newest first)
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: '#a1a1aa', borderBottom: '2px solid #444', fontSize: 13 }}>
                  <th style={{ textAlign: 'center', padding: '8px 6px' }}>#</th>
                  <th style={{ textAlign: 'left', padding: '8px 8px' }}>Entry Date</th>
                  <th style={{ textAlign: 'left', padding: '8px 8px' }}>Exit Date</th>
                  <th style={{ textAlign: 'left', padding: '8px 8px' }}>Stock</th>
                  <th style={{ textAlign: 'right', padding: '8px 8px' }}>Entry $</th>
                  <th style={{ textAlign: 'right', padding: '8px 8px' }}>Exit $</th>
                  <th style={{ textAlign: 'right', padding: '8px 8px' }}>R</th>
                  <th style={{ textAlign: 'right', padding: '8px 8px' }}>P/L</th>
                  <th style={{ textAlign: 'right', padding: '8px 8px' }}>Capital</th>
                  <th style={{ textAlign: 'left', padding: '8px 8px' }}>Exit Reason</th>
                  <th style={{ textAlign: 'right', padding: '8px 8px' }}>Days</th>
                  <th style={{ textAlign: 'center', padding: '8px 6px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {[...strat.results].reverse().map((t, i) => {
                  const tradeNum = strat.results.length - i
                  const win = t.pnlScaled > 0
                  const isSkipped = t.status === 'skipped'
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #2a2a3e', opacity: isSkipped ? 0.5 : 1, background: isSkipped ? '#1f0a0a' : win ? '#071a0f' : 'transparent' }}>
                      <td style={{ padding: '8px 6px', textAlign: 'center', color: '#71717a', fontWeight: 600 }}>{tradeNum}</td>
                      <td style={{ padding: '8px 8px', color: '#e4e4e7', fontFamily: 'monospace', fontSize: 12 }}>{t.entryDate}</td>
                      <td style={{ padding: '8px 8px', color: '#d4d4d8', fontFamily: 'monospace', fontSize: 12 }}>{t.exitDate}</td>
                      <td style={{ padding: '8px 8px', color: '#60a5fa', fontWeight: 700 }}>{t.stock}</td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', color: '#d4d4d8' }}>${t.entryPrice?.toFixed(2)}</td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', color: '#d4d4d8' }}>${t.exitPrice?.toFixed(2)}</td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', color: win ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                        {t.pnlR > 0 ? '+' : ''}{t.pnlR.toFixed(1)}R
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', color: win ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                        {isSkipped ? '—' : `${t.pnlScaled >= 0 ? '+' : ''}$${Math.round(t.pnlScaled).toLocaleString()}`}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', color: '#a1a1aa' }}>${Math.round(t.capitalAtEntry).toLocaleString()}</td>
                      <td style={{ padding: '8px 8px', color: t.exitReason === 'Trail' ? '#4ade80' : t.exitReason === 'SL' ? '#f87171' : '#a1a1aa' }}>{t.exitReason}</td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', color: '#a1a1aa' }}>{t.durationDays || '—'}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                        {isSkipped
                          ? <span style={{ color: '#f87171', fontSize: 11, fontWeight: 700 }}>SKIP</span>
                          : win
                            ? <span style={{ color: '#4ade80', fontSize: 14 }}>✓</span>
                            : <span style={{ color: '#f87171', fontSize: 14 }}>✗</span>
                        }
                      </td>
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
