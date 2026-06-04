import { useState, useEffect, useMemo } from 'react'

export default function RotationTop3Page() {
  const [data, setData] = useState(null)
  const [showAllTrades, setShowAllTrades] = useState(false)
  const [capital, setCapital] = useState(40000)
  const [riskPct, setRiskPct] = useState(100) // % of capital per position (equal weight = 33% each)

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + 'rotation_top3_data.json')
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
  }, [])

  // Compounding calculation
  const compounded = useMemo(() => {
    if (!data) return null
    const trades = (data.trades || []).filter(t => t.exitReason !== 'Open')
    const maxPos = data.params?.max_positions || 3

    let currentCapital = capital
    let peakCapital = capital
    let maxDD = 0, maxDDPct = 0
    const results = []
    const equityCurve = [{ capital, date: trades[0]?.entryDate }]

    for (const t of trades) {
      const slotSize = currentCapital / maxPos
      const shares = Math.floor(slotSize / t.entryPrice)
      if (shares <= 0) { results.push({ ...t, pnlScaled: 0, capitalAtEntry: currentCapital }); continue }
      const pnlScaled = (t.exitPrice - t.entryPrice) * shares

      results.push({ ...t, pnlScaled: Math.round(pnlScaled), shares, capitalAtEntry: Math.round(currentCapital) })
      currentCapital += pnlScaled
      if (currentCapital > peakCapital) peakCapital = currentCapital
      const dd = peakCapital - currentCapital
      if (dd > maxDD) maxDD = dd
      const ddPct = peakCapital > 0 ? (dd / peakCapital) * 100 : 0
      if (ddPct > maxDDPct) maxDDPct = ddPct
      equityCurve.push({ capital: Math.round(currentCapital), date: t.exitDate })
    }

    const wins = results.filter(r => r.pnlScaled > 0)
    const losses = results.filter(r => r.pnlScaled < 0)
    const grossWin = wins.reduce((s, r) => s + r.pnlScaled, 0)
    const grossLoss = Math.abs(losses.reduce((s, r) => s + r.pnlScaled, 0))
    const pf = grossLoss > 0 ? grossWin / grossLoss : 99
    const totalPnl = currentCapital - capital

    // Monthly PnL
    const monthly = {}
    for (const r of results) {
      const key = r.exitDate.slice(0, 7)
      monthly[key] = (monthly[key] || 0) + r.pnlScaled
    }

    return {
      results, equityCurve, finalCapital: Math.round(currentCapital),
      totalPnl: Math.round(totalPnl), totalPct: ((currentCapital / capital - 1) * 100).toFixed(1),
      wins: wins.length, losses: losses.length,
      wr: results.length > 0 ? (wins.length / results.length * 100).toFixed(1) : 0,
      pf: pf.toFixed(2), maxDD: Math.round(maxDD), maxDDPct: maxDDPct.toFixed(1),
      monthly,
    }
  }, [data, capital])

  if (!data) return <div style={{ padding: 40, color: '#a1a1aa' }}>Loading...</div>

  const trades = data.trades || []
  const weeklyLog = data.weekly_log || []
  const spyCurve = data.spy_curve || []
  const params = data.params || {}
  const closedTrades = trades.filter(t => t.exitReason !== 'Open')
  const openTrades = trades.filter(t => t.exitReason === 'Open')
  const recentTrades = [...closedTrades].reverse().slice(0, 20)

  const months = compounded ? Object.keys(compounded.monthly).sort() : []
  const spyFinal = spyCurve.length > 0 ? spyCurve[spyCurve.length - 1].pnl : 0
  const spyPct = ((spyFinal / capital) * 100).toFixed(1)

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>
        🔄 Top-10 Pure Momentum Rotation
      </h1>
      <p style={{ color: '#71717a', fontSize: 12, marginBottom: 4 }}>
        Universe: S&P 500 ({data.universe_size} stocks) &middot; Buy top 10 by 3mo return every Monday &middot; Sell when dropped out &middot; 3% stop (gap-down realistic)
      </p>
      <p style={{ color: '#52525b', fontSize: 11, marginBottom: 20 }}>
        Period: {params.period} · Updated: {data.lastUpdated}
      </p>

      {/* ═══ CONFIGURE YOUR RISK ═══ */}
      <div style={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: '#a78bfa' }}>⚙️ Configure Your Risk</h2>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: 11, color: '#71717a', display: 'block', marginBottom: 4 }}>Starting Capital</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[10000, 25000, 40000, 100000].map(v => (
                <button key={v} onClick={() => setCapital(v)} style={{
                  padding: '4px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                  background: capital === v ? '#a78bfa' : '#0a0a1a', color: capital === v ? '#000' : '#71717a',
                  border: `1px solid ${capital === v ? '#a78bfa' : '#333'}`, fontWeight: capital === v ? 700 : 400,
                }}>${(v/1000)}K</button>
              ))}
            </div>
          </div>
          {compounded && (
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: '#71717a' }}>Final Capital (compounded)</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: compounded.totalPnl > 0 ? '#4ade80' : '#ef4444' }}>
                ${compounded.finalCapital.toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: '#52525b' }}>+{compounded.totalPct}% return</div>
            </div>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      {compounded && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 24 }}>
          <StatCard label="Total P/L" value={`$${compounded.totalPnl.toLocaleString()}`} sub={`+${compounded.totalPct}%`} color={compounded.totalPnl > 0 ? '#4ade80' : '#ef4444'} />
          <StatCard label="Profit Factor" value={compounded.pf} color={parseFloat(compounded.pf) >= 1.5 ? '#4ade80' : '#fbbf24'} />
          <StatCard label="Win Rate" value={`${compounded.wr}%`} sub={`${compounded.wins}W / ${compounded.losses}L`} />
          <StatCard label="Max Drawdown" value={`-$${compounded.maxDD.toLocaleString()}`} sub={`-${compounded.maxDDPct}%`} color="#ef4444" />
          <StatCard label="SPY B&H" value={`$${Math.round(spyFinal).toLocaleString()}`} sub={`+${spyPct}%`} color="#60a5fa" />
          <StatCard label="vs SPY" value={`+${(parseFloat(compounded.totalPct) - parseFloat(spyPct)).toFixed(0)}%`} color="#a78bfa" />
        </div>
      )}

      {/* Open Positions */}
      {openTrades.length > 0 && (
        <div style={{ background: '#0a1628', border: '2px solid #4ade80', borderRadius: 8, padding: 16, marginBottom: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#4ade80', marginBottom: 8 }}>📍 Current Positions</h2>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {openTrades.map(t => (
              <div key={t.stock} style={{ background: '#1a1a2e', borderRadius: 6, padding: '8px 14px', border: '1px solid #333' }}>
                <div style={{ fontWeight: 700, color: '#4ade80', fontSize: 14 }}>{t.stock}</div>
                <div style={{ fontSize: 10, color: '#71717a' }}>Entry: ${t.entryPrice} · #{t.rank_at_entry}</div>
                <div style={{ fontSize: 12, color: t.pnlDollar > 0 ? '#4ade80' : '#ef4444', fontWeight: 600 }}>
                  {t.pnlPct > 0 ? '+' : ''}{t.pnlPct}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Equity Curve vs SPY */}
      <div style={{ background: '#0a0a1a', borderRadius: 12, padding: 16, marginBottom: 20, border: '1px solid #1a1a2e' }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>📈 Equity Curve vs SPY Buy & Hold</h2>
        <EquityChart equityCurve={compounded?.equityCurve || []} spyCurve={spyCurve} startCapital={capital} />
      </div>

      {/* Monthly Bar Chart */}
      <div style={{ background: '#0a0a1a', borderRadius: 12, padding: 16, marginBottom: 20, border: '1px solid #1a1a2e' }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>📊 Monthly Returns (Bar Chart)</h2>
        <MonthlyBarChart monthly={compounded?.monthly || {}} />
      </div>

      {/* Weekly Top 10 Log */}
      <div style={{ background: '#0a0a1a', borderRadius: 12, padding: 16, marginBottom: 20, border: '1px solid #1a1a2e' }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>📋 Weekly Top 10 (Evidence)</h2>
        <p style={{ fontSize: 10, color: '#52525b', marginBottom: 10 }}>
          Green = we held it. Real rankings at each Monday close.
        </p>
        <div style={{ maxHeight: 350, overflowY: 'auto' }}>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#71717a', borderBottom: '1px solid #333', position: 'sticky', top: 0, background: '#0a0a1a' }}>
                <th style={{ textAlign: 'left', padding: '4px 6px', width: 80 }}>Week</th>
                <th style={{ textAlign: 'left', padding: '4px 6px' }}>#1</th>
                <th style={{ textAlign: 'left', padding: '4px 6px' }}>#2</th>
                <th style={{ textAlign: 'left', padding: '4px 6px' }}>#3</th>
                <th style={{ textAlign: 'left', padding: '4px 6px' }}>#4</th>
                <th style={{ textAlign: 'left', padding: '4px 6px' }}>#5</th>
                <th style={{ textAlign: 'left', padding: '4px 6px', color: '#52525b' }}>#6-10</th>
              </tr>
            </thead>
            <tbody>
              {weeklyLog.slice(-25).reverse().map(wk => (
                <tr key={wk.week} style={{ borderBottom: '1px solid #1a1a2e' }}>
                  <td style={{ padding: '4px 6px', color: '#71717a', fontWeight: 600 }}>{wk.week.slice(5)}</td>
                  {wk.top_10.slice(0, 5).map((s, i) => (
                    <td key={i} style={{ padding: '4px 6px' }}>
                      <span style={{ color: '#4ade80', fontWeight: 700 }}>
                        {s.ticker}
                      </span>
                      <span style={{ color: '#52525b', fontSize: 9, marginLeft: 3 }}>+{s.return_pct.toFixed(0)}%</span>
                    </td>
                  ))}
                  <td style={{ padding: '4px 6px', color: '#4ade80', fontSize: 9 }}>
                    {wk.top_10.slice(5, 10).map(s => s.ticker).join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Trades */}
      <div style={{ background: '#0a0a1a', borderRadius: 12, padding: 16, marginBottom: 20, border: '1px solid #1a1a2e' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700 }}>📋 Trades ({closedTrades.length} closed)</h2>
          <button onClick={() => setShowAllTrades(!showAllTrades)} style={{ fontSize: 11, color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer' }}>
            {showAllTrades ? 'Show recent' : 'Show all'}
          </button>
        </div>
        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: '#71717a', borderBottom: '1px solid #333' }}>
              <th style={{ textAlign: 'left', padding: '4px 6px' }}>Stock</th>
              <th style={{ textAlign: 'left', padding: '4px 6px' }}>Entry</th>
              <th style={{ textAlign: 'left', padding: '4px 6px' }}>Exit</th>
              <th style={{ textAlign: 'right', padding: '4px 6px' }}>P/L</th>
              <th style={{ textAlign: 'right', padding: '4px 6px' }}>%</th>
              <th style={{ textAlign: 'center', padding: '4px 6px' }}>Reason</th>
              <th style={{ textAlign: 'right', padding: '4px 6px' }}>Days</th>
              <th style={{ textAlign: 'center', padding: '4px 6px' }}>Rank</th>
            </tr>
          </thead>
          <tbody>
            {(showAllTrades ? [...closedTrades].reverse() : recentTrades).map((t, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #1a1a2e' }}>
                <td style={{ padding: '4px 6px', fontWeight: 600, color: '#e4e4e7' }}>{t.stock}</td>
                <td style={{ padding: '4px 6px', color: '#71717a' }}>{t.entryDate.slice(5)} @ ${t.entryPrice}</td>
                <td style={{ padding: '4px 6px', color: '#71717a' }}>{t.exitDate.slice(5)} @ ${t.exitPrice}</td>
                <td style={{ padding: '4px 6px', textAlign: 'right', color: t.pnlDollar > 0 ? '#4ade80' : '#ef4444', fontWeight: 600 }}>
                  {t.pnlDollar > 0 ? '+' : ''}${Math.round(t.pnlDollar).toLocaleString()}
                </td>
                <td style={{ padding: '4px 6px', textAlign: 'right', color: t.pnlPct > 0 ? '#4ade80' : '#ef4444' }}>
                  {t.pnlPct > 0 ? '+' : ''}{t.pnlPct}%
                </td>
                <td style={{ padding: '4px 6px', textAlign: 'center', color: t.exitReason === 'Stop Loss' ? '#ef4444' : '#fbbf24', fontSize: 10 }}>
                  {t.exitReason}
                </td>
                <td style={{ padding: '4px 6px', textAlign: 'right', color: '#71717a' }}>{t.durationDays}d</td>
                <td style={{ padding: '4px 6px', textAlign: 'center', color: '#60a5fa' }}>#{t.rank_at_entry}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Methodology */}
      <details style={{ marginTop: 20, color: '#71717a', fontSize: 12 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>📖 Methodology & Caveats</summary>
        <div style={{ padding: 12, background: '#0a0a1a', borderRadius: 8, marginTop: 8, lineHeight: 1.8 }}>
          <p><strong>Strategy:</strong> Every Monday, rank all ~{data.universe_size} S&P 500 stocks by 3-month (63-day) return. Buy top 10. Sell when they drop out of top 10.</p>
          <p><strong>Position sizing:</strong> Equal weight &mdash; capital/10 per slot, compounding (sizes grow with equity)</p>
          <p><strong>Stop loss:</strong> 3% from entry &mdash; if stock gaps below stop at open, exit at the open (realistic slippage)</p>
          <p><strong>No entry filter:</strong> No breakout requirement. Just buy at close on rotation day.</p>
          <p><strong>Exit:</strong> Either dropped out of top 10 at next Monday, or hit 3% stop loss</p>
          <p style={{ marginTop: 8, color: '#f59e0b' }}><strong>⚠️ Caveats:</strong></p>
          <ul style={{ paddingLeft: 20 }}>
            <li>Survivorship bias: uses today's S&P 500 list, not historical constituents (~10-15 stocks may have been removed)</li>
            <li>No commissions modeled (slippage on gap-downs IS modeled)</li>
            <li>Assumes you can buy at Monday close (realistic for liquid S&P 500 stocks)</li>
          </ul>
        </div>
      </details>
    </div>
  )
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: '#0a0a1a', border: '1px solid #1a1a2e', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: '#71717a', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || '#e4e4e7' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#52525b' }}>{sub}</div>}
    </div>
  )
}

function EquityChart({ equityCurve, spyCurve, startCapital }) {
  if (!equityCurve || equityCurve.length === 0) return null

  // Map equity curve by date for alignment
  const eqByDate = {}
  equityCurve.forEach(e => { eqByDate[e.date] = e.capital })
  const spyByDate = {}
  spyCurve.forEach(s => { spyByDate[s.date] = startCapital + s.pnl })

  // Use spy dates as x-axis (it has every trading day)
  const dates = spyCurve.map(s => s.date)
  if (dates.length === 0) return null

  // Interpolate equity curve
  let lastEq = startCapital
  const eqValues = dates.map(d => { if (eqByDate[d] !== undefined) lastEq = eqByDate[d]; return lastEq })
  const spyValues = dates.map(d => spyByDate[d] || startCapital)

  const allVals = [...eqValues, ...spyValues]
  const minVal = Math.min(...allVals) * 0.95
  const maxVal = Math.max(...allVals) * 1.02

  const W = 900, H = 200, PAD = 45
  const scaleX = (i) => PAD + (i / (dates.length - 1)) * (W - 2 * PAD)
  const scaleY = (v) => H - PAD - ((v - minVal) / (maxVal - minVal)) * (H - 2 * PAD)

  const eqPoints = eqValues.map((v, i) => `${scaleX(i)},${scaleY(v)}`).join(' ')
  const spyPoints = spyValues.map((v, i) => `${scaleX(i)},${scaleY(v)}`).join(' ')

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ background: '#050510', borderRadius: 8 }}>
      {/* Grid */}
      <line x1={PAD} x2={W-PAD} y1={scaleY(startCapital)} y2={scaleY(startCapital)} stroke="#333" strokeDasharray="4" />
      <text x={PAD-4} y={scaleY(startCapital)+3} fill="#52525b" fontSize="9" textAnchor="end">${(startCapital/1000).toFixed(0)}K</text>
      <text x={PAD-4} y={scaleY(maxVal)+3} fill="#52525b" fontSize="9" textAnchor="end">${(maxVal/1000).toFixed(0)}K</text>
      <text x={PAD-4} y={scaleY(minVal)+3} fill="#52525b" fontSize="9" textAnchor="end">${(minVal/1000).toFixed(0)}K</text>

      {/* SPY line */}
      <polyline points={spyPoints} fill="none" stroke="#60a5fa" strokeWidth="1.2" opacity="0.7" />
      {/* Strategy line */}
      <polyline points={eqPoints} fill="none" stroke="#4ade80" strokeWidth="2" />

      {/* Legend */}
      <rect x={W-160} y={10} width={12} height={3} fill="#4ade80" />
      <text x={W-144} y={14} fill="#4ade80" fontSize="9">Top-3 Rotation</text>
      <rect x={W-160} y={24} width={12} height={3} fill="#60a5fa" />
      <text x={W-144} y={28} fill="#60a5fa" fontSize="9">SPY Buy & Hold</text>

      {/* Final values */}
      <text x={W-PAD+4} y={scaleY(eqValues[eqValues.length-1])+3} fill="#4ade80" fontSize="9">${(eqValues[eqValues.length-1]/1000).toFixed(0)}K</text>
      <text x={W-PAD+4} y={scaleY(spyValues[spyValues.length-1])+3} fill="#60a5fa" fontSize="9">${(spyValues[spyValues.length-1]/1000).toFixed(0)}K</text>
    </svg>
  )
}

function MonthlyBarChart({ monthly }) {
  const months = Object.keys(monthly).sort()
  if (months.length === 0) return <div style={{ color: '#52525b', fontSize: 11 }}>No data</div>

  const values = months.map(m => monthly[m])
  const maxVal = Math.max(...values.map(Math.abs), 1)
  
  const W = 900, H = 160, PAD = 40
  const barW = Math.min(20, (W - 2 * PAD) / months.length - 2)

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ background: '#050510', borderRadius: 8 }}>
      {/* Zero line */}
      <line x1={PAD} x2={W-PAD} y1={H/2} y2={H/2} stroke="#333" strokeWidth="1" />
      <text x={PAD-4} y={H/2+3} fill="#52525b" fontSize="8" textAnchor="end">$0</text>
      <text x={PAD-4} y={20} fill="#52525b" fontSize="8" textAnchor="end">+${(maxVal/1000).toFixed(0)}K</text>
      <text x={PAD-4} y={H-10} fill="#52525b" fontSize="8" textAnchor="end">-${(maxVal/1000).toFixed(0)}K</text>

      {months.map((m, i) => {
        const val = monthly[m]
        const x = PAD + (i / months.length) * (W - 2 * PAD) + barW / 2
        const barH = Math.abs(val) / maxVal * (H / 2 - 20)
        const y = val >= 0 ? H / 2 - barH : H / 2
        const color = val >= 0 ? '#4ade80' : '#ef4444'
        return (
          <g key={m}>
            <rect x={x} y={y} width={barW} height={barH} fill={color} opacity="0.8" rx="2" />
            {i % 3 === 0 && (
              <text x={x + barW/2} y={H - 2} fill="#52525b" fontSize="7" textAnchor="middle">{m.slice(2)}</text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
