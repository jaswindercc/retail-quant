import { useState, useEffect } from 'react'
import { fetchJson } from '../utils'

export default function SimBacktest4Page() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [activeUni, setActiveUni] = useState(null)
  const [view, setView] = useState('trades')

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    fetchJson(`${base}sim_backtest4_data.json`)
      .then(d => {
        setData(d)
        // Default to the universe with lowest streak
        const names = Object.keys(d.universes)
        const best = names.reduce((a, b) =>
          d.universes[a].summary.max_losing_streak <= d.universes[b].summary.max_losing_streak ? a : b
        )
        setActiveUni(best)
      })
      .catch(e => setError(e.message))
  }, [])

  if (error) return (
    <div style={{ padding: 40, color: '#f87171' }}>
      <h2>⚠️ No backtest data yet</h2>
      <p style={{ color: '#a1a1aa' }}>Run <code>python scripts/generate_sim_backtest4_data.py</code></p>
    </div>
  )
  if (!data) return <div className="loading">Loading…</div>

  const { params, universes, lastUpdated } = data
  const uniNames = Object.keys(universes)
  const bestUni = uniNames.reduce((a, b) =>
    universes[a].summary.max_losing_streak <= universes[b].summary.max_losing_streak ? a : b
  )

  return (
    <div className="page-container" style={{ padding: '1.5rem' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>🎯 SIM Backtest 4 — Universe Comparison</h1>
      <p style={{ color: '#a1a1aa', fontSize: 13, marginBottom: '1rem' }}>
        Same Confluence + Regime rules — testing which stock universe gives the smoothest equity curve (least DD & streak)
      </p>

      {/* SURVIVORSHIP BIAS WARNING */}
      <div style={{ background: '#1f0a0a', border: '2px solid #f87171', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: 14, color: '#f87171', fontWeight: 700, marginBottom: '0.5rem' }}>🚨 SURVIVORSHIP BIAS WARNING</div>
        <div style={{ fontSize: 12, color: '#d4d4d8', lineHeight: 1.8 }}>
          This backtest uses a <strong>fixed, hand-picked stock list</strong> based on today's top mega-caps (NVDA, META, AVGO, etc.). In 2021, the actual mega-cap list included Intel, PayPal, Disney, and Netflix pre-crash — all underperformers. The $64K PnL for "Mega Caps" is inflated because we're backtesting on stocks we already know became winners. <strong style={{ color: '#f87171' }}>Do NOT treat this as expected performance.</strong> See BT5/BT6 for honest rotation-based results.
        </div>
      </div>

      {/* Rules Box */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem', fontSize: 13, lineHeight: 1.8 }}>
        <div style={{ fontWeight: 700, color: '#fbbf24', marginBottom: '0.5rem' }}>📋 RULES (same across all universes)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 2rem' }}>
          <div>
            <div><span style={{ color: '#4ade80' }}>🚦 Regime:</span> SPY &gt; 200-day SMA only</div>
            <div><span style={{ color: '#71717a' }}>Signal:</span> 2+ strategies confluence</div>
            <div><span style={{ color: '#71717a' }}>Pick:</span> Lowest ATR% each day</div>
          </div>
          <div>
            <div><span style={{ color: '#71717a' }}>Risk:</span> $200/trade, $40k max capital</div>
            <div><span style={{ color: '#71717a' }}>Trail:</span> 2.5R → EMA20 − 1×ATR</div>
            <div><span style={{ color: '#71717a' }}>Focus:</span> <span style={{ color: '#f87171', fontWeight: 700 }}>Minimize streak & drawdown</span></div>
          </div>
        </div>
        <div style={{ color: '#52525b', marginTop: '0.5rem', fontSize: 11 }}>
          Seed: {params.seed} · Rank: {params.rank_mode} · Period: {params.period} · Updated: {lastUpdated}
        </div>
      </div>

      {/* Comparison Table */}
      <div style={{ background: '#1e1e2e', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem', overflow: 'auto' }}>
        <div style={{ fontWeight: 700, color: '#e4e4e7', marginBottom: '0.75rem' }}>
          📊 Universe Comparison <span style={{ color: '#71717a', fontWeight: 400, fontSize: 12 }}>(sorted by streak, lower = better)</span>
        </div>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: '#71717a', borderBottom: '1px solid #333' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Universe</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>Stocks</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>Trades</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>Win Rate</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>Total PnL</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>PF</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', color: '#f87171' }}>Max Streak</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', color: '#f87171' }}>Max DD</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>Avg R</th>
            </tr>
          </thead>
          <tbody>
            {[...uniNames].sort((a, b) => universes[a].summary.max_losing_streak - universes[b].summary.max_losing_streak).map(name => {
              const s = universes[name].summary
              const isBest = name === bestUni
              return (
                <tr key={name}
                    style={{ borderBottom: '1px solid #222', background: name === activeUni ? '#27272a' : 'transparent', cursor: 'pointer' }}
                    onClick={() => setActiveUni(name)}>
                  <td style={{ padding: '6px 8px', fontWeight: 700, color: isBest ? '#4ade80' : '#e4e4e7' }}>
                    {isBest ? '⭐ ' : ''}{name}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#a1a1aa' }}>{universes[name].ticker_count}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{s.total_trades}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: s.win_rate >= 30 ? '#4ade80' : '#fbbf24' }}>{s.win_rate}%</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: s.total_pnl >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                    ${s.total_pnl.toLocaleString()}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: s.profit_factor >= 1.5 ? '#4ade80' : s.profit_factor >= 1 ? '#fbbf24' : '#f87171' }}>
                    {s.profit_factor}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700,
                    color: s.max_losing_streak <= 8 ? '#4ade80' : s.max_losing_streak <= 12 ? '#fbbf24' : '#f87171' }}>
                    {s.max_losing_streak}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#f87171' }}>
                    ${s.max_drawdown.toLocaleString()}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: s.avg_r > 0 ? '#4ade80' : '#f87171' }}>{s.avg_r}R</td>
                </tr>
              )
            })}
            {/* Backtest 3 reference */}
            <tr style={{ borderTop: '2px solid #444', color: '#71717a', fontStyle: 'italic' }}>
              <td style={{ padding: '6px 8px' }}>📌 Backtest 3 (Full+Regime)</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>275</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>238</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>30.3%</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>$30,254</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>1.84</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>11</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>$7,992</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>—</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Active Universe Detail */}
      {activeUni && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <h2 style={{ color: '#e4e4e7', fontSize: 16, margin: 0 }}>📈 {activeUni}</h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {uniNames.map(name => (
                <button key={name} onClick={() => setActiveUni(name)}
                  style={{ padding: '0.3rem 0.6rem', borderRadius: 5, border: 'none', fontSize: 11,
                    background: activeUni === name ? '#6366f1' : '#27272a', color: '#fff', cursor: 'pointer' }}>
                  {name.split(' (')[0]}
                </button>
              ))}
              <span style={{ borderLeft: '1px solid #444', margin: '0 0.25rem' }} />
              {['trades', 'curve'].map(tab => (
                <button key={tab} onClick={() => setView(tab)}
                  style={{ padding: '0.3rem 0.6rem', borderRadius: 5, border: 'none', fontSize: 11,
                    background: view === tab ? '#374151' : '#27272a', color: '#fff', cursor: 'pointer' }}>
                  {tab === 'trades' ? '📜 Trades' : '📈 Curve'}
                </button>
              ))}
            </div>
          </div>

          {/* Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.6rem', marginBottom: '1.25rem' }}>
            {(() => {
              const s = universes[activeUni].summary
              return <>
                <StatCard label="PnL" value={`$${s.total_pnl.toLocaleString()}`} color={s.total_pnl >= 0 ? '#4ade80' : '#f87171'} />
                <StatCard label="Win Rate" value={`${s.win_rate}%`} color={s.win_rate >= 30 ? '#4ade80' : '#fbbf24'} />
                <StatCard label="Trades" value={s.total_trades} />
                <StatCard label="PF" value={s.profit_factor} color={s.profit_factor >= 1.5 ? '#4ade80' : '#fbbf24'} />
                <StatCard label="Max Streak" value={s.max_losing_streak} color={s.max_losing_streak <= 8 ? '#4ade80' : '#f87171'} />
                <StatCard label="Max DD" value={`$${s.max_drawdown.toLocaleString()}`} color="#f87171" />
                <StatCard label="Avg R" value={`${s.avg_r}R`} color={s.avg_r > 0 ? '#4ade80' : '#f87171'} />
                <StatCard label="Avg Days" value={s.avg_days_held} />
              </>
            })()}
          </div>

          {/* Stocks in this universe */}
          <div style={{ marginBottom: '1rem', fontSize: 12, color: '#71717a' }}>
            <strong>Stocks:</strong>{' '}
            {universes[activeUni].tickers.map((t, i) => (
              <span key={t} style={{ marginRight: 6 }}>{t}{i < universes[activeUni].tickers.length - 1 ? ',' : ''}</span>
            ))}
            {universes[activeUni].ticker_count > 50 && <span>... ({universes[activeUni].ticker_count} total)</span>}
          </div>

          {view === 'trades' && <TradesTable trades={universes[activeUni].trades} />}
          {view === 'curve' && <EquityCurve curve={universes[activeUni].equity_curve} />}
        </>
      )}
    </div>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: '#1e1e2e', borderRadius: 8, padding: '0.6rem', textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: '#71717a', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color || '#e4e4e7' }}>{value}</div>
    </div>
  )
}

function TradesTable({ trades }) {
  const [sortCol, setSortCol] = useState('entry_date')
  const [sortDir, setSortDir] = useState(-1)

  const sorted = [...trades].sort((a, b) => {
    const av = a[sortCol], bv = b[sortCol]
    if (typeof av === 'number') return (av - bv) * sortDir
    return String(av || '').localeCompare(String(bv || '')) * sortDir
  })

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(-sortDir)
    else { setSortCol(col); setSortDir(-1) }
  }

  return (
    <div style={{ maxHeight: '55vh', overflow: 'auto' }}>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead style={{ position: 'sticky', top: 0, background: '#18181b' }}>
          <tr style={{ color: '#71717a', borderBottom: '1px solid #333' }}>
            {['ticker','entry_date','exit_date','combo','entry','shares','capital_used','pnl','r_multiple','days_held','reason'].map(col => (
              <th key={col} onClick={() => handleSort(col)}
                style={{ textAlign: ['ticker','combo','reason'].includes(col) ? 'left' : 'right', padding: '5px 4px', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 11 }}>
                {col === 'capital_used' ? 'capital' : col.replace(/_/g, ' ')}
                {sortCol === col ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((t, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #222' }}>
              <td style={{ padding: 4, fontWeight: 600 }}>{t.ticker}</td>
              <td style={{ padding: 4, textAlign: 'right', color: '#a1a1aa' }}>{t.entry_date}</td>
              <td style={{ padding: 4, textAlign: 'right', color: '#a1a1aa' }}>{t.exit_date}</td>
              <td style={{ padding: 4, fontSize: 10 }}>
                {t.combo.split(' + ').map((s, j) => (
                  <span key={j} style={{ background: '#374151', borderRadius: 3, padding: '1px 4px', marginRight: 2 }}>{s}</span>
                ))}
              </td>
              <td style={{ padding: 4, textAlign: 'right' }}>${t.entry}</td>
              <td style={{ padding: 4, textAlign: 'right' }}>{t.shares}</td>
              <td style={{ padding: 4, textAlign: 'right', color: '#a1a1aa' }}>${t.capital_used?.toLocaleString()}</td>
              <td style={{ padding: 4, textAlign: 'right', color: t.pnl >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>${t.pnl}</td>
              <td style={{ padding: 4, textAlign: 'right', color: t.r_multiple >= 0 ? '#4ade80' : '#f87171' }}>{t.r_multiple}R</td>
              <td style={{ padding: 4, textAlign: 'right' }}>{t.days_held}</td>
              <td style={{ padding: 4, color: '#a1a1aa', fontSize: 11 }}>{t.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EquityCurve({ curve }) {
  if (!curve || curve.length === 0) return <p style={{ color: '#a1a1aa' }}>No equity data</p>

  const maxPnl = Math.max(...curve.map(c => c.total_pnl))
  const minPnl = Math.min(...curve.map(c => c.total_pnl))
  const range = maxPnl - minPnl || 1
  const width = 900
  const height = 280
  const padding = 50

  const points = curve.map((c, i) => {
    const x = padding + (i / (curve.length - 1)) * (width - 2 * padding)
    const y = height - padding - ((c.total_pnl - minPnl) / range) * (height - 2 * padding)
    return `${x},${y}`
  }).join(' ')

  const zeroY = height - padding - ((0 - minPnl) / range) * (height - 2 * padding)

  return (
    <div>
      <h3 style={{ color: '#e4e4e7', marginBottom: '0.5rem', fontSize: 14 }}>Equity Curve</h3>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', maxWidth: 900, background: '#1e1e2e', borderRadius: 8 }}>
        <line x1={padding} y1={zeroY} x2={width - padding} y2={zeroY} stroke="#444" strokeDasharray="4 2" />
        <text x={padding - 5} y={zeroY + 4} textAnchor="end" fill="#666" fontSize="10">$0</text>
        <text x={padding - 5} y={padding + 4} textAnchor="end" fill="#4ade80" fontSize="10">${maxPnl.toFixed(0)}</text>
        {minPnl < 0 && <text x={padding - 5} y={height - padding + 4} textAnchor="end" fill="#f87171" fontSize="10">${minPnl.toFixed(0)}</text>}
        <polyline points={points} fill="none" stroke="#6366f1" strokeWidth="1.5" />
        {[0, Math.floor(curve.length / 4), Math.floor(curve.length / 2), Math.floor(3 * curve.length / 4), curve.length - 1].map(idx => {
          if (idx >= curve.length) return null
          const x = padding + (idx / (curve.length - 1)) * (width - 2 * padding)
          return <text key={idx} x={x} y={height - 10} textAnchor="middle" fill="#666" fontSize="9">{curve[idx]?.date?.slice(0, 7)}</text>
        })}
      </svg>
    </div>
  )
}
