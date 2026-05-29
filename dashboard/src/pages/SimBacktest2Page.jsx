import { useState, useEffect } from 'react'

export default function SimBacktest2Page() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [activeStrat, setActiveStrat] = useState(null)
  const [view, setView] = useState('summary')

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    fetch(`${base}sim_backtest2_data.json`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(d => {
        setData(d)
        setActiveStrat(Object.keys(d.strategies)[0])
      })
      .catch(e => setError(e.message))
  }, [])

  if (error) return (
    <div style={{ padding: 40, color: '#f87171' }}>
      <h2>⚠️ No backtest data yet</h2>
      <p style={{ color: '#a1a1aa' }}>Run <code>python scripts/generate_sim_backtest2_data.py</code> to generate results.</p>
      <p style={{ color: '#666', fontSize: 13 }}>Error: {error}</p>
    </div>
  )
  if (!data) return <div className="loading">Loading…</div>

  const { params, strategies, lastUpdated } = data
  const stratNames = Object.keys(strategies)

  return (
    <div className="page-container" style={{ padding: '1.5rem' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>📊 SIM Backtest 2 — Top 3 Strategies</h1>

      {/* Rules Box */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem', fontSize: 13, lineHeight: 1.8 }}>
        <div style={{ fontWeight: 700, color: '#fbbf24', marginBottom: '0.5rem' }}>📋 TRADING RULES (same for each strategy)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 2rem' }}>
          <div>
            <div><span style={{ color: '#71717a' }}>Universe:</span> S&P 500 + NASDAQ 100, price &gt; $10</div>
            <div><span style={{ color: '#71717a' }}>Entry:</span> Single strategy signal (tested individually)</div>
            <div><span style={{ color: '#71717a' }}>Pick:</span> Lowest ATR% (tightest stop = least gap risk)</div>
            <div><span style={{ color: '#71717a' }}>Frequency:</span> 1 trade per day max</div>
          </div>
          <div>
            <div><span style={{ color: '#71717a' }}>Risk:</span> ${params.max_risk_per_trade} per trade (shares = $200 ÷ ATR)</div>
            <div><span style={{ color: '#71717a' }}>Stop:</span> Entry − 1×ATR</div>
            <div><span style={{ color: '#71717a' }}>Trail:</span> Activates at 2.5R → EMA20 − 1×ATR (ratchets up)</div>
            <div><span style={{ color: '#71717a' }}>Capital:</span> ${params.max_capital.toLocaleString()} max deployed</div>
          </div>
        </div>
        <div style={{ color: '#52525b', marginTop: '0.5rem', fontSize: 11 }}>
          Lookback: {params.period} · Rank: {params.rank_mode} · Seed: {params.seed} · Last run: {lastUpdated}
        </div>
      </div>

      {/* Comparison Table */}
      <div style={{ background: '#1e1e2e', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem', overflow: 'auto' }}>
        <div style={{ fontWeight: 700, color: '#e4e4e7', marginBottom: '0.75rem' }}>🏆 Side-by-Side Comparison</div>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: '#71717a', borderBottom: '1px solid #333' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Strategy</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>Trades</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>Win Rate</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>Total PnL</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>Avg R</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>PF</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>Max Streak</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>Max DD</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>Avg Days</th>
            </tr>
          </thead>
          <tbody>
            {stratNames.map(name => {
              const s = strategies[name].summary
              const isBest = s.total_pnl === Math.max(...stratNames.map(n => strategies[n].summary.total_pnl))
              return (
                <tr key={name} style={{ borderBottom: '1px solid #222', background: name === activeStrat ? '#27272a' : 'transparent', cursor: 'pointer' }}
                    onClick={() => setActiveStrat(name)}>
                  <td style={{ padding: '6px 8px', fontWeight: 700, color: isBest ? '#4ade80' : '#e4e4e7' }}>
                    {isBest ? '👑 ' : ''}{name}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{s.total_trades}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: s.win_rate >= 30 ? '#4ade80' : '#fbbf24' }}>{s.win_rate}%</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: s.total_pnl >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>${s.total_pnl.toLocaleString()}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: s.avg_r > 0 ? '#4ade80' : '#f87171' }}>{s.avg_r}R</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: s.profit_factor >= 1.5 ? '#4ade80' : s.profit_factor >= 1 ? '#fbbf24' : '#f87171' }}>{s.profit_factor}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: s.max_losing_streak <= 15 ? '#4ade80' : s.max_losing_streak <= 20 ? '#fbbf24' : '#f87171' }}>{s.max_losing_streak}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#f87171' }}>${s.max_drawdown.toLocaleString()}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#a1a1aa' }}>{s.avg_days_held}</td>
                </tr>
              )
            })}
            {/* Backtest 1 reference row */}
            <tr style={{ borderTop: '2px solid #444', color: '#71717a', fontStyle: 'italic' }}>
              <td style={{ padding: '6px 8px' }}>📌 Backtest 1 (Confluence)</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>379</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>23.5%</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>$24,864</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>—</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>1.40</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>18</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>—</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>—</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Strategy Detail */}
      {activeStrat && (
        <>
          <h2 style={{ color: '#e4e4e7', marginBottom: '0.5rem', fontSize: 16 }}>
            📈 {activeStrat} — Detail
          </h2>

          {/* Strategy Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {stratNames.map(name => (
              <button key={name} onClick={() => setActiveStrat(name)}
                style={{ padding: '0.4rem 0.75rem', borderRadius: 6, border: 'none',
                  background: activeStrat === name ? '#6366f1' : '#27272a', color: '#fff', cursor: 'pointer', fontSize: 12 }}>
                {name}
              </button>
            ))}
            <span style={{ borderLeft: '1px solid #444', margin: '0 0.25rem' }} />
            {['summary', 'trades', 'curve'].map(tab => (
              <button key={tab} onClick={() => setView(tab)}
                style={{ padding: '0.4rem 0.75rem', borderRadius: 6, border: 'none',
                  background: view === tab ? '#374151' : '#27272a', color: '#fff', cursor: 'pointer', fontSize: 12 }}>
                {tab === 'summary' ? '📋 Top/Bottom' : tab === 'trades' ? '📜 All Trades' : '📈 Curve'}
              </button>
            ))}
          </div>

          {/* Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {(() => {
              const s = strategies[activeStrat].summary
              return <>
                <StatCard label="Total PnL" value={`$${s.total_pnl.toLocaleString()}`} color={s.total_pnl >= 0 ? '#4ade80' : '#f87171'} />
                <StatCard label="Win Rate" value={`${s.win_rate}%`} color={s.win_rate >= 30 ? '#4ade80' : '#fbbf24'} />
                <StatCard label="Trades" value={s.total_trades} />
                <StatCard label="Avg R" value={`${s.avg_r}R`} color={s.avg_r > 0 ? '#4ade80' : '#f87171'} />
                <StatCard label="Profit Factor" value={s.profit_factor} color={s.profit_factor >= 1.5 ? '#4ade80' : '#fbbf24'} />
                <StatCard label="Max Drawdown" value={`$${s.max_drawdown.toLocaleString()}`} color="#f87171" />
                <StatCard label="Max Losing Streak" value={s.max_losing_streak} color={s.max_losing_streak <= 15 ? '#4ade80' : '#f87171'} />
                <StatCard label="Avg Days" value={s.avg_days_held} />
              </>
            })()}
          </div>

          {/* Exit Reasons */}
          {strategies[activeStrat].summary.exit_reasons && (
            <div style={{ marginBottom: '1.5rem', padding: '0.75rem', background: '#1e1e2e', borderRadius: 8, fontSize: 13 }}>
              <strong>Exit Reasons:</strong>{' '}
              {Object.entries(strategies[activeStrat].summary.exit_reasons).map(([reason, count]) => (
                <span key={reason} style={{ marginRight: '1rem', color: '#a1a1aa' }}>{reason}: {count}</span>
              ))}
            </div>
          )}

          {view === 'trades' && <TradesTable trades={strategies[activeStrat].trades} />}
          {view === 'curve' && <EquityCurve curve={strategies[activeStrat].equity_curve} />}
          {view === 'summary' && <TopTrades trades={strategies[activeStrat].trades} />}
        </>
      )}
    </div>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: '#1e1e2e', borderRadius: 8, padding: '0.75rem', textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: '#71717a', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || '#e4e4e7' }}>{value}</div>
    </div>
  )
}

function TopTrades({ trades }) {
  const sorted = [...trades].sort((a, b) => b.pnl - a.pnl)
  const best = sorted.slice(0, 10)
  const worst = sorted.slice(-10).reverse()

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
      <div>
        <h3 style={{ color: '#4ade80', marginBottom: '0.5rem' }}>🏆 Top 10 Winners</h3>
        <MiniTable trades={best} />
      </div>
      <div>
        <h3 style={{ color: '#f87171', marginBottom: '0.5rem' }}>💀 Top 10 Losers</h3>
        <MiniTable trades={worst} />
      </div>
    </div>
  )
}

function MiniTable({ trades }) {
  return (
    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ color: '#71717a', borderBottom: '1px solid #333' }}>
          <th style={{ textAlign: 'left', padding: 4 }}>Ticker</th>
          <th style={{ textAlign: 'left', padding: 4 }}>Date</th>
          <th style={{ textAlign: 'right', padding: 4 }}>PnL</th>
          <th style={{ textAlign: 'right', padding: 4 }}>R</th>
          <th style={{ textAlign: 'right', padding: 4 }}>Days</th>
        </tr>
      </thead>
      <tbody>
        {trades.map((t, i) => (
          <tr key={i} style={{ borderBottom: '1px solid #222' }}>
            <td style={{ padding: 4, fontWeight: 600 }}>{t.ticker}</td>
            <td style={{ padding: 4, color: '#a1a1aa' }}>{t.entry_date}</td>
            <td style={{ padding: 4, textAlign: 'right', color: t.pnl >= 0 ? '#4ade80' : '#f87171' }}>${t.pnl.toFixed(0)}</td>
            <td style={{ padding: 4, textAlign: 'right', color: t.r_multiple >= 0 ? '#4ade80' : '#f87171' }}>{t.r_multiple}R</td>
            <td style={{ padding: 4, textAlign: 'right', color: '#a1a1aa' }}>{t.days_held}</td>
          </tr>
        ))}
      </tbody>
    </table>
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
    <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead style={{ position: 'sticky', top: 0, background: '#18181b' }}>
          <tr style={{ color: '#71717a', borderBottom: '1px solid #333' }}>
            {['ticker','entry_date','exit_date','entry','exit_price','shares','capital_used','pnl','r_multiple','days_held','reason'].map(col => (
              <th key={col} onClick={() => handleSort(col)}
                style={{ textAlign: col === 'ticker' || col === 'reason' ? 'left' : 'right', padding: '6px 4px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {col === 'capital_used' ? 'capital' : col.replace(/_/g, ' ')}{sortCol === col ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}
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
              <td style={{ padding: 4, textAlign: 'right' }}>${t.entry}</td>
              <td style={{ padding: 4, textAlign: 'right' }}>{t.exit_price ? `$${t.exit_price}` : '—'}</td>
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
  const height = 300
  const padding = 40

  const points = curve.map((c, i) => {
    const x = padding + (i / (curve.length - 1)) * (width - 2 * padding)
    const y = height - padding - ((c.total_pnl - minPnl) / range) * (height - 2 * padding)
    return `${x},${y}`
  }).join(' ')

  const zeroY = height - padding - ((0 - minPnl) / range) * (height - 2 * padding)

  const maxCap = 40000
  const capPoints = curve.map((c, i) => {
    const x = padding + (i / (curve.length - 1)) * (width - 2 * padding)
    const y = height - padding - ((c.capital_used || 0) / maxCap) * (height - 2 * padding)
    return `${x},${y}`
  }).join(' ')

  return (
    <div>
      <h3 style={{ color: '#e4e4e7', marginBottom: '0.5rem' }}>PnL Curve</h3>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', maxWidth: 900, background: '#1e1e2e', borderRadius: 8, marginBottom: '1rem' }}>
        <line x1={padding} y1={zeroY} x2={width - padding} y2={zeroY} stroke="#444" strokeDasharray="4 2" />
        <text x={padding - 5} y={zeroY + 4} textAnchor="end" fill="#666" fontSize="10">$0</text>
        <text x={padding - 5} y={padding + 4} textAnchor="end" fill="#4ade80" fontSize="10">${maxPnl.toFixed(0)}</text>
        <text x={padding - 5} y={height - padding + 4} textAnchor="end" fill="#f87171" fontSize="10">${minPnl.toFixed(0)}</text>
        <polyline points={points} fill="none" stroke="#6366f1" strokeWidth="1.5" />
        {[0, Math.floor(curve.length / 4), Math.floor(curve.length / 2), Math.floor(3 * curve.length / 4), curve.length - 1].map(idx => {
          const x = padding + (idx / (curve.length - 1)) * (width - 2 * padding)
          return <text key={idx} x={x} y={height - 10} textAnchor="middle" fill="#666" fontSize="9">{curve[idx]?.date?.slice(0, 7)}</text>
        })}
      </svg>

      <h3 style={{ color: '#e4e4e7', marginBottom: '0.5rem' }}>Capital Utilization (max $40k)</h3>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', maxWidth: 900, background: '#1e1e2e', borderRadius: 8 }}>
        <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="#f87171" strokeDasharray="4 2" strokeOpacity="0.5" />
        <text x={padding - 5} y={padding + 4} textAnchor="end" fill="#f87171" fontSize="10">$40k</text>
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#444" strokeDasharray="4 2" />
        <text x={padding - 5} y={height - padding + 4} textAnchor="end" fill="#666" fontSize="10">$0</text>
        <polyline points={capPoints} fill="none" stroke="#fbbf24" strokeWidth="1.5" />
        {[0, Math.floor(curve.length / 4), Math.floor(curve.length / 2), Math.floor(3 * curve.length / 4), curve.length - 1].map(idx => {
          const x = padding + (idx / (curve.length - 1)) * (width - 2 * padding)
          return <text key={idx} x={x} y={height - 10} textAnchor="middle" fill="#666" fontSize="9">{curve[idx]?.date?.slice(0, 7)}</text>
        })}
      </svg>
    </div>
  )
}
