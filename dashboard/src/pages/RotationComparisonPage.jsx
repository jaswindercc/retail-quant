import { useState, useEffect, useMemo } from 'react'

export default function RotationComparisonPage() {
  const [data, setData] = useState(null)
  const [activeUniverse, setActiveUniverse] = useState('mega')

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + 'rotation_comparison_data.json')
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
  }, [])

  const universeData = data?.universes?.[activeUniverse]
  const methods = universeData?.methods || {}

  const tabs = [
    { key: 'mega', label: 'Mega-Cap' },
    { key: 'large', label: 'Large-Cap' },
    { key: 'mid', label: 'Mid-Cap' },
  ]

  const methodOrder = ['6mo', '3mo', 'composite']
  const methodColors = { '6mo': '#60a5fa', '3mo': '#fbbf24', 'composite': '#4ade80' }

  // Find best method per universe
  const bestMethod = useMemo(() => {
    if (!methods || Object.keys(methods).length === 0) return ''
    let best = ''
    let bestPnl = -Infinity
    for (const [k, v] of Object.entries(methods)) {
      if (v.stats.total_pnl > bestPnl) {
        bestPnl = v.stats.total_pnl
        best = k
      }
    }
    return best
  }, [methods])

  // Summary table across all universes
  const summaryRows = useMemo(() => {
    if (!data?.universes) return []
    return Object.entries(data.universes).map(([uniKey, uniData]) => {
      const row = { universe: uniData.label, key: uniKey }
      let bestPnl = -Infinity
      let bestM = ''
      for (const [mKey, mData] of Object.entries(uniData.methods)) {
        row[mKey] = mData.stats
        if (mData.stats.total_pnl > bestPnl) {
          bestPnl = mData.stats.total_pnl
          bestM = mKey
        }
      }
      row.winner = bestM
      return row
    })
  }, [data])

  if (!data) return <div style={{ padding: 40, color: '#a1a1aa' }}>Loading comparison data...</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>
        🔬 Scoring Method Comparison
      </h1>
      <p style={{ color: '#71717a', fontSize: 13, marginBottom: 24 }}>
        12-month backtest: Pure 6-month vs Pure 3-month vs Composite (0.4×1m + 0.35×3m + 0.25×6m) — same breakout rules, weekly rotation
      </p>
      <p style={{ color: '#52525b', fontSize: 12, marginBottom: 16 }}>
        Period: {data.period?.start} → {data.period?.end} | Updated: {data.lastUpdated}
      </p>

      {/* Overall Summary Table */}
      <div style={{ background: '#0a0a1a', borderRadius: 12, padding: 20, marginBottom: 24, border: '1px solid #1a1a2e' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>📊 Overall Comparison</h2>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: '#71717a', borderBottom: '1px solid #333' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Universe</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', color: methodColors['6mo'] }}>6-Month PnL</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', color: methodColors['6mo'] }}>PF</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', color: methodColors['3mo'] }}>3-Month PnL</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', color: methodColors['3mo'] }}>PF</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', color: methodColors['composite'] }}>Composite PnL</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', color: methodColors['composite'] }}>PF</th>
              <th style={{ textAlign: 'center', padding: '6px 8px' }}>Winner</th>
            </tr>
          </thead>
          <tbody>
            {summaryRows.map(row => (
              <tr key={row.key} style={{ borderBottom: '1px solid #1a1a2e' }}>
                <td style={{ padding: '8px', fontWeight: 600 }}>{row.universe}</td>
                {methodOrder.flatMap(m => [
                  <td key={m+'pnl'} style={{ padding: '8px', textAlign: 'right', color: row[m]?.total_pnl > 0 ? '#4ade80' : '#ef4444', fontWeight: row.winner === m ? 800 : 400 }}>
                    ${row[m]?.total_pnl?.toLocaleString() || 0}
                  </td>,
                  <td key={m+'pf'} style={{ padding: '8px', textAlign: 'right', color: '#a1a1aa' }}>
                    {row[m]?.profit_factor || 0}
                  </td>
                ])}
                <td style={{ padding: '8px', textAlign: 'center', fontWeight: 700, color: methodColors[row.winner] }}>
                  {row.winner === 'composite' ? '🏆 Composite' : row.winner === '3mo' ? '3-Month' : '6-Month'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Universe Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveUniverse(tab.key)}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: activeUniverse === tab.key ? '#4ade80' : '#1a1a2e',
              color: activeUniverse === tab.key ? '#000' : '#a1a1aa',
              fontWeight: activeUniverse === tab.key ? 700 : 400, fontSize: 13,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Detailed Stats per Method */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {methodOrder.map(mKey => {
          const m = methods[mKey]
          if (!m) return null
          const s = m.stats
          const isBest = mKey === bestMethod
          return (
            <div key={mKey} style={{
              background: '#0a0a1a', borderRadius: 12, padding: 16,
              border: isBest ? '2px solid #4ade80' : '1px solid #1a1a2e',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: methodColors[mKey] }}>{m.label}</h3>
                {isBest && <span style={{ fontSize: 10, background: '#4ade80', color: '#000', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>BEST</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                <div>
                  <div style={{ color: '#71717a' }}>Total PnL</div>
                  <div style={{ fontWeight: 700, color: s.total_pnl > 0 ? '#4ade80' : '#ef4444', fontSize: 16 }}>
                    ${s.total_pnl?.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#71717a' }}>Profit Factor</div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{s.profit_factor}</div>
                </div>
                <div>
                  <div style={{ color: '#71717a' }}>Win Rate</div>
                  <div style={{ fontWeight: 600 }}>{s.win_rate}%</div>
                </div>
                <div>
                  <div style={{ color: '#71717a' }}>Trades</div>
                  <div style={{ fontWeight: 600 }}>{s.closed_trades}</div>
                </div>
                <div>
                  <div style={{ color: '#71717a' }}>Avg Winner</div>
                  <div style={{ color: '#4ade80' }}>${s.avg_winner?.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ color: '#71717a' }}>Avg Loser</div>
                  <div style={{ color: '#ef4444' }}>-${s.avg_loser?.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ color: '#71717a' }}>Max DD</div>
                  <div style={{ color: '#ef4444' }}>-${s.max_drawdown?.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ color: '#71717a' }}>Max Lose Streak</div>
                  <div>{s.max_losing_streak}</div>
                </div>
                <div>
                  <div style={{ color: '#71717a' }}>Avg Duration</div>
                  <div>{s.avg_duration_days} days</div>
                </div>
                <div>
                  <div style={{ color: '#71717a' }}>Best Trade</div>
                  <div style={{ color: '#4ade80' }}>${s.best_trade?.toLocaleString()}</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Equity Curves */}
      <div style={{ background: '#0a0a1a', borderRadius: 12, padding: 20, marginBottom: 24, border: '1px solid #1a1a2e' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>📈 Equity Curves — {universeData?.label}</h2>
        <EquityCurveChart methods={methods} methodOrder={methodOrder} methodColors={methodColors} />
      </div>

      {/* Monthly PnL Comparison */}
      <div style={{ background: '#0a0a1a', borderRadius: 12, padding: 20, marginBottom: 24, border: '1px solid #1a1a2e' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>📅 Monthly PnL Breakdown</h2>
        <MonthlyTable methods={methods} methodOrder={methodOrder} methodColors={methodColors} />
      </div>

      {/* Recent Trades */}
      <div style={{ background: '#0a0a1a', borderRadius: 12, padding: 20, border: '1px solid #1a1a2e' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>📋 Recent Trades (Last 10 per method)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {methodOrder.map(mKey => {
            const m = methods[mKey]
            if (!m) return null
            const recentTrades = [...(m.trades || [])].filter(t => t.exitReason !== 'Open').slice(-10).reverse()
            return (
              <div key={mKey}>
                <h4 style={{ fontSize: 12, color: methodColors[mKey], marginBottom: 8, fontWeight: 700 }}>{m.label}</h4>
                <div style={{ fontSize: 10 }}>
                  {recentTrades.map((t, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #1a1a2e' }}>
                      <span style={{ color: '#a1a1aa' }}>{t.stock}</span>
                      <span style={{ color: '#71717a' }}>{t.exitDate?.slice(5)}</span>
                      <span style={{ color: t.pnlDollar > 0 ? '#4ade80' : '#ef4444', fontWeight: 600 }}>
                        {t.pnlDollar > 0 ? '+' : ''}${t.pnlDollar?.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Methodology */}
      <details style={{ marginTop: 24, color: '#71717a', fontSize: 12 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: 8 }}>📖 Methodology</summary>
        <div style={{ padding: 12, background: '#0a0a1a', borderRadius: 8 }}>
          <p><strong>Test Period:</strong> Last 12 months ({data.period?.start} to {data.period?.end})</p>
          <p><strong>Scoring Methods:</strong></p>
          <ul style={{ paddingLeft: 20, marginTop: 4 }}>
            <li><span style={{ color: methodColors['6mo'] }}>Pure 6-Month:</span> Rank by 126-day return</li>
            <li><span style={{ color: methodColors['3mo'] }}>Pure 3-Month:</span> Rank by 63-day return</li>
            <li><span style={{ color: methodColors['composite'] }}>Composite:</span> 0.40 × 1mo + 0.35 × 3mo + 0.25 × 6mo (favors acceleration)</li>
          </ul>
          <p style={{ marginTop: 8 }}><strong>Rules (identical for all):</strong> Weekly rotation (Monday), Top 10, max 3 positions, $400 risk (1% of $40K), breakout entry (close above 20-day high + volume ≥ 1.2× avg + above 50 SMA), 1×ATR stop, trail at 2.5R, regime filter (SPY &gt; 200 SMA)</p>
          <p style={{ marginTop: 8 }}><strong>Caveat:</strong> Uses today's stock list (survivorship bias minimal for mega/large caps over 12 months)</p>
        </div>
      </details>
    </div>
  )
}


function EquityCurveChart({ methods, methodOrder, methodColors }) {
  // Simple SVG equity curve
  const allCurves = methodOrder.map(mKey => {
    const eq = methods[mKey]?.equity_curve || []
    return { key: mKey, data: eq }
  }).filter(c => c.data.length > 0)

  if (allCurves.length === 0) return <div style={{ color: '#52525b' }}>No data</div>

  const maxLen = Math.max(...allCurves.map(c => c.data.length))
  const allPnls = allCurves.flatMap(c => c.data.map(d => d.pnl))
  const minPnl = Math.min(0, ...allPnls)
  const maxPnl = Math.max(1, ...allPnls)

  const W = 900, H = 200, PAD = 30

  const scaleX = (i) => PAD + (i / (maxLen - 1)) * (W - 2 * PAD)
  const scaleY = (v) => H - PAD - ((v - minPnl) / (maxPnl - minPnl)) * (H - 2 * PAD)

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ background: '#050510', borderRadius: 8 }}>
      {/* Zero line */}
      <line x1={PAD} x2={W - PAD} y1={scaleY(0)} y2={scaleY(0)} stroke="#333" strokeDasharray="4" />
      <text x={PAD - 4} y={scaleY(0) + 3} fill="#52525b" fontSize="9" textAnchor="end">$0</text>
      <text x={PAD - 4} y={scaleY(maxPnl) + 3} fill="#52525b" fontSize="9" textAnchor="end">${Math.round(maxPnl / 1000)}K</text>
      <text x={PAD - 4} y={scaleY(minPnl) + 3} fill="#52525b" fontSize="9" textAnchor="end">${Math.round(minPnl / 1000)}K</text>

      {allCurves.map(curve => {
        const points = curve.data.map((d, i) => `${scaleX(i)},${scaleY(d.pnl)}`).join(' ')
        return (
          <polyline
            key={curve.key}
            points={points}
            fill="none"
            stroke={methodColors[curve.key]}
            strokeWidth="1.5"
            opacity="0.85"
          />
        )
      })}

      {/* Legend */}
      {allCurves.map((curve, i) => (
        <g key={curve.key}>
          <rect x={W - 140} y={10 + i * 16} width={12} height={3} fill={methodColors[curve.key]} />
          <text x={W - 124} y={14 + i * 16} fill={methodColors[curve.key]} fontSize="9">
            {methods[curve.key]?.label}
          </text>
        </g>
      ))}
    </svg>
  )
}


function MonthlyTable({ methods, methodOrder, methodColors }) {
  // Get all months
  const allMonths = new Set()
  methodOrder.forEach(mKey => {
    const m = methods[mKey]
    if (m?.stats?.monthly_pnl) {
      Object.keys(m.stats.monthly_pnl).forEach(k => allMonths.add(k))
    }
  })
  const months = [...allMonths].sort()

  if (months.length === 0) return <div style={{ color: '#52525b', fontSize: 12 }}>No monthly data</div>

  return (
    <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ color: '#71717a', borderBottom: '1px solid #333' }}>
          <th style={{ textAlign: 'left', padding: '4px 6px' }}>Month</th>
          {methodOrder.map(mKey => (
            <th key={mKey} style={{ textAlign: 'right', padding: '4px 6px', color: methodColors[mKey] }}>
              {methods[mKey]?.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {months.map(month => (
          <tr key={month} style={{ borderBottom: '1px solid #1a1a2e' }}>
            <td style={{ padding: '4px 6px', color: '#a1a1aa' }}>{month}</td>
            {methodOrder.map(mKey => {
              const val = methods[mKey]?.stats?.monthly_pnl?.[month] || 0
              return (
                <td key={mKey} style={{ padding: '4px 6px', textAlign: 'right', color: val > 0 ? '#4ade80' : val < 0 ? '#ef4444' : '#52525b', fontWeight: 600 }}>
                  {val > 0 ? '+' : ''}{val !== 0 ? `$${Math.round(val).toLocaleString()}` : '—'}
                </td>
              )
            })}
          </tr>
        ))}
        <tr style={{ borderTop: '2px solid #333', fontWeight: 700 }}>
          <td style={{ padding: '6px' }}>TOTAL</td>
          {methodOrder.map(mKey => {
            const total = methods[mKey]?.stats?.total_pnl || 0
            return (
              <td key={mKey} style={{ padding: '6px', textAlign: 'right', color: total > 0 ? '#4ade80' : '#ef4444' }}>
                ${Math.round(total).toLocaleString()}
              </td>
            )
          })}
        </tr>
      </tbody>
    </table>
  )
}
