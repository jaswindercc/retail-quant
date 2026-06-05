import { useState, useEffect } from 'react'
import { fetchJson } from '../utils'

export default function SimBacktest3Page() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [view, setView] = useState('overview')

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    fetchJson(`${base}sim_backtest3_data.json`)
      .then(setData)
      .catch(e => setError(e.message))
  }, [])

  if (error) return (
    <div style={{ padding: 40, color: '#f87171' }}>
      <h2>⚠️ No backtest data yet</h2>
      <p style={{ color: '#a1a1aa' }}>Run <code>python scripts/generate_sim_backtest3_data.py</code></p>
    </div>
  )
  if (!data) return <div className="loading">Loading…</div>

  const { summary, params, trades, equity_curve, combo_breakdown, stock_breakdown, monthly_pnl, lastUpdated } = data

  return (
    <div className="page-container" style={{ padding: '1.5rem' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>⭐ SIM Backtest 3 — Confluence + Regime Filter</h1>
      <p style={{ color: '#4ade80', fontSize: 13, marginBottom: '1rem' }}>
        The winning variant: Streak=11, PF={summary.profit_factor}, 30%+ win rate
      </p>

      {/* Rules Box */}
      <div style={{ background: '#1e1e2e', border: '1px solid #4ade80', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem', fontSize: 13, lineHeight: 1.9 }}>
        <div style={{ fontWeight: 700, color: '#fbbf24', marginBottom: '0.5rem' }}>📋 TRADING RULES</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 2rem' }}>
          <div>
            <div><span style={{ color: '#4ade80', fontWeight: 700 }}>🚦 Regime:</span> Only trade when SPY &gt; 200-day SMA</div>
            <div><span style={{ color: '#71717a' }}>Signal:</span> 2+ strategies fire on same stock same day</div>
            <div><span style={{ color: '#71717a' }}>Strategies:</span> MA Bounce, Breakout, RSI Trend, Higher High</div>
            <div><span style={{ color: '#71717a' }}>Pick:</span> Lowest ATR% = tightest stop = least gap risk</div>
            <div><span style={{ color: '#71717a' }}>Frequency:</span> 1 trade per day max</div>
          </div>
          <div>
            <div><span style={{ color: '#71717a' }}>Risk:</span> ${params.max_risk_per_trade} per trade (shares = $200 ÷ ATR)</div>
            <div><span style={{ color: '#71717a' }}>Stop:</span> Entry − 1×ATR</div>
            <div><span style={{ color: '#71717a' }}>Trail:</span> Activates at 2.5R → EMA20 − 1×ATR (ratchets up)</div>
            <div><span style={{ color: '#71717a' }}>Capital:</span> ${params.max_capital.toLocaleString()} max deployed</div>
            <div><span style={{ color: '#71717a' }}>Universe:</span> {params.universe_size} stocks (S&P500 + NASDAQ100)</div>
          </div>
        </div>
        <div style={{ color: '#52525b', marginTop: '0.5rem', fontSize: 11 }}>
          Period: {params.period} · Rank: {params.rank_mode} · Seed: {params.seed} · Bull days: {summary.bull_days} · Bear days skipped: {summary.bear_days_skipped} · Updated: {lastUpdated}
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <StatCard label="Total PnL" value={`$${summary.total_pnl.toLocaleString()}`} color="#4ade80" />
        <StatCard label="Win Rate" value={`${summary.win_rate}%`} color="#4ade80" />
        <StatCard label="Trades" value={summary.total_trades} />
        <StatCard label="Avg R" value={`${summary.avg_r}R`} color={summary.avg_r > 0 ? '#4ade80' : '#f87171'} />
        <StatCard label="Profit Factor" value={summary.profit_factor} color="#4ade80" />
        <StatCard label="Max Drawdown" value={`$${summary.max_drawdown.toLocaleString()}`} color="#f87171" />
        <StatCard label="Max Losing Streak" value={summary.max_losing_streak} color="#4ade80" />
        <StatCard label="Avg Days Held" value={summary.avg_days_held} />
        <StatCard label="Avg Candidates/Day" value={summary.avg_candidates_per_day} color="#a1a1aa" />
      </div>

      {/* Tab Switcher */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {[
          ['overview', '📋 Combo Breakdown'],
          ['stocks', '🏆 Stock Analysis'],
          ['monthly', '📅 Monthly PnL'],
          ['trades', '📜 All Trades'],
          ['curve', '📈 Equity Curve'],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setView(key)}
            style={{ padding: '0.4rem 0.75rem', borderRadius: 6, border: 'none',
              background: view === key ? '#6366f1' : '#27272a', color: '#fff', cursor: 'pointer', fontSize: 12 }}>
            {label}
          </button>
        ))}
      </div>

      {view === 'overview' && <ComboBreakdown combos={combo_breakdown} />}
      {view === 'stocks' && <StockAnalysis breakdown={stock_breakdown} />}
      {view === 'monthly' && <MonthlyPnl data={monthly_pnl} />}
      {view === 'trades' && <TradesTable trades={trades} />}
      {view === 'curve' && <EquityCurve curve={equity_curve} />}
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

function ComboBreakdown({ combos }) {
  const sorted = Object.entries(combos).sort((a, b) => b[1].count - a[1].count)

  return (
    <div>
      <h3 style={{ color: '#e4e4e7', marginBottom: '0.75rem' }}>🎯 Which Strategy Combos Work Best?</h3>
      <p style={{ color: '#71717a', fontSize: 12, marginBottom: '1rem' }}>
        Shows which combinations of 2+ strategies fired together and their performance.
        The "pick" is always the stock with the lowest ATR% on that day.
      </p>
      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: '#71717a', borderBottom: '1px solid #333' }}>
            <th style={{ textAlign: 'left', padding: '8px' }}>Combo</th>
            <th style={{ textAlign: 'right', padding: '8px' }}>Trades</th>
            <th style={{ textAlign: 'right', padding: '8px' }}>Win Rate</th>
            <th style={{ textAlign: 'right', padding: '8px' }}>Total PnL</th>
            <th style={{ textAlign: 'right', padding: '8px' }}>Avg PnL/Trade</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(([combo, stats]) => (
            <tr key={combo} style={{ borderBottom: '1px solid #222' }}>
              <td style={{ padding: '8px', fontWeight: 600 }}>
                {combo.split(' + ').map((s, i) => (
                  <span key={i} style={{ display: 'inline-block', background: '#374151', borderRadius: 4, padding: '2px 6px', margin: '2px 3px 2px 0', fontSize: 11 }}>
                    {s}
                  </span>
                ))}
              </td>
              <td style={{ padding: '8px', textAlign: 'right' }}>{stats.count}</td>
              <td style={{ padding: '8px', textAlign: 'right', color: stats.win_rate >= 30 ? '#4ade80' : '#fbbf24' }}>{stats.win_rate}%</td>
              <td style={{ padding: '8px', textAlign: 'right', color: stats.total_pnl >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                ${stats.total_pnl.toLocaleString()}
              </td>
              <td style={{ padding: '8px', textAlign: 'right', color: stats.total_pnl / stats.count >= 0 ? '#4ade80' : '#f87171' }}>
                ${(stats.total_pnl / stats.count).toFixed(0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StockAnalysis({ breakdown }) {
  return (
    <div>
      <h3 style={{ color: '#e4e4e7', marginBottom: '0.75rem' }}>🏆 Stock Analysis</h3>
      <p style={{ color: '#71717a', fontSize: 12, marginBottom: '1rem' }}>
        Which stocks appear most often in confluence signals? (Picked by lowest ATR%)
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Most Traded */}
        <div>
          <h4 style={{ color: '#a1a1aa', marginBottom: '0.5rem' }}>📊 Most Traded (by frequency)</h4>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#71717a', borderBottom: '1px solid #333' }}>
                <th style={{ textAlign: 'left', padding: 4 }}>Ticker</th>
                <th style={{ textAlign: 'right', padding: 4 }}>Trades</th>
                <th style={{ textAlign: 'right', padding: 4 }}>WR</th>
                <th style={{ textAlign: 'right', padding: 4 }}>PnL</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.top_by_frequency.map(s => (
                <tr key={s.ticker} style={{ borderBottom: '1px solid #222' }}>
                  <td style={{ padding: 4, fontWeight: 600 }}>{s.ticker}</td>
                  <td style={{ padding: 4, textAlign: 'right' }}>{s.count}</td>
                  <td style={{ padding: 4, textAlign: 'right', color: s.win_rate >= 30 ? '#4ade80' : '#fbbf24' }}>{s.win_rate}%</td>
                  <td style={{ padding: 4, textAlign: 'right', color: s.pnl >= 0 ? '#4ade80' : '#f87171' }}>${s.pnl.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Best/Worst by PnL */}
        <div>
          <h4 style={{ color: '#4ade80', marginBottom: '0.5rem' }}>💰 Best Stocks (by PnL)</h4>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginBottom: '1.5rem' }}>
            <thead>
              <tr style={{ color: '#71717a', borderBottom: '1px solid #333' }}>
                <th style={{ textAlign: 'left', padding: 4 }}>Ticker</th>
                <th style={{ textAlign: 'right', padding: 4 }}>Trades</th>
                <th style={{ textAlign: 'right', padding: 4 }}>WR</th>
                <th style={{ textAlign: 'right', padding: 4 }}>PnL</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.best_by_pnl.map(s => (
                <tr key={s.ticker} style={{ borderBottom: '1px solid #222' }}>
                  <td style={{ padding: 4, fontWeight: 600 }}>{s.ticker}</td>
                  <td style={{ padding: 4, textAlign: 'right' }}>{s.count}</td>
                  <td style={{ padding: 4, textAlign: 'right', color: '#4ade80' }}>{s.win_rate}%</td>
                  <td style={{ padding: 4, textAlign: 'right', color: '#4ade80', fontWeight: 600 }}>${s.pnl.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h4 style={{ color: '#f87171', marginBottom: '0.5rem' }}>💀 Worst Stocks (by PnL)</h4>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#71717a', borderBottom: '1px solid #333' }}>
                <th style={{ textAlign: 'left', padding: 4 }}>Ticker</th>
                <th style={{ textAlign: 'right', padding: 4 }}>Trades</th>
                <th style={{ textAlign: 'right', padding: 4 }}>WR</th>
                <th style={{ textAlign: 'right', padding: 4 }}>PnL</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.worst_by_pnl.map(s => (
                <tr key={s.ticker} style={{ borderBottom: '1px solid #222' }}>
                  <td style={{ padding: 4, fontWeight: 600 }}>{s.ticker}</td>
                  <td style={{ padding: 4, textAlign: 'right' }}>{s.count}</td>
                  <td style={{ padding: 4, textAlign: 'right', color: '#fbbf24' }}>{s.win_rate}%</td>
                  <td style={{ padding: 4, textAlign: 'right', color: '#f87171', fontWeight: 600 }}>${s.pnl.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function MonthlyPnl({ data }) {
  const months = Object.entries(data)
  const maxPnl = Math.max(...months.map(([, v]) => Math.abs(v)), 1)

  return (
    <div>
      <h3 style={{ color: '#e4e4e7', marginBottom: '0.75rem' }}>📅 Monthly PnL</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '0.5rem' }}>
        {months.map(([month, pnl]) => (
          <div key={month} style={{ background: '#1e1e2e', borderRadius: 6, padding: '0.5rem', textAlign: 'center',
            borderLeft: `3px solid ${pnl >= 0 ? '#4ade80' : '#f87171'}` }}>
            <div style={{ fontSize: 10, color: '#71717a' }}>{month}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: pnl >= 0 ? '#4ade80' : '#f87171' }}>
              ${pnl >= 0 ? '+' : ''}{pnl.toLocaleString()}
            </div>
          </div>
        ))}
      </div>
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
    <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead style={{ position: 'sticky', top: 0, background: '#18181b' }}>
          <tr style={{ color: '#71717a', borderBottom: '1px solid #333' }}>
            {['ticker','entry_date','exit_date','combo','entry','exit_price','shares','capital_used','pnl','r_multiple','days_held','atr_pct','reason'].map(col => (
              <th key={col} onClick={() => handleSort(col)}
                style={{ textAlign: ['ticker','combo','reason'].includes(col) ? 'left' : 'right', padding: '6px 4px', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 11 }}>
                {col === 'capital_used' ? 'capital' : col === 'atr_pct' ? 'ATR%' : col.replace(/_/g, ' ')}
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
              <td style={{ padding: 4, textAlign: 'right' }}>{t.exit_price ? `$${t.exit_price}` : '—'}</td>
              <td style={{ padding: 4, textAlign: 'right' }}>{t.shares}</td>
              <td style={{ padding: 4, textAlign: 'right', color: '#a1a1aa' }}>${t.capital_used?.toLocaleString()}</td>
              <td style={{ padding: 4, textAlign: 'right', color: t.pnl >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>${t.pnl}</td>
              <td style={{ padding: 4, textAlign: 'right', color: t.r_multiple >= 0 ? '#4ade80' : '#f87171' }}>{t.r_multiple}R</td>
              <td style={{ padding: 4, textAlign: 'right' }}>{t.days_held}</td>
              <td style={{ padding: 4, textAlign: 'right', color: t.atr_pct <= 3 ? '#4ade80' : t.atr_pct <= 5 ? '#fbbf24' : '#f87171' }}>{t.atr_pct}%</td>
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
  const padding = 50

  const points = curve.map((c, i) => {
    const x = padding + (i / (curve.length - 1)) * (width - 2 * padding)
    const y = height - padding - ((c.total_pnl - minPnl) / range) * (height - 2 * padding)
    return `${x},${y}`
  }).join(' ')

  const zeroY = height - padding - ((0 - minPnl) / range) * (height - 2 * padding)

  return (
    <div>
      <h3 style={{ color: '#e4e4e7', marginBottom: '0.5rem' }}>📈 Equity Curve (Confluence + Regime Filter)</h3>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', maxWidth: 900, background: '#1e1e2e', borderRadius: 8 }}>
        <line x1={padding} y1={zeroY} x2={width - padding} y2={zeroY} stroke="#444" strokeDasharray="4 2" />
        <text x={padding - 5} y={zeroY + 4} textAnchor="end" fill="#666" fontSize="10">$0</text>
        <text x={padding - 5} y={padding + 4} textAnchor="end" fill="#4ade80" fontSize="10">${maxPnl.toFixed(0)}</text>
        {minPnl < 0 && <text x={padding - 5} y={height - padding + 4} textAnchor="end" fill="#f87171" fontSize="10">${minPnl.toFixed(0)}</text>}
        <polyline points={points} fill="none" stroke="#4ade80" strokeWidth="2" />
        {[0, Math.floor(curve.length / 4), Math.floor(curve.length / 2), Math.floor(3 * curve.length / 4), curve.length - 1].map(idx => {
          const x = padding + (idx / (curve.length - 1)) * (width - 2 * padding)
          return <text key={idx} x={x} y={height - 10} textAnchor="middle" fill="#666" fontSize="9">{curve[idx]?.date?.slice(0, 7)}</text>
        })}
      </svg>
    </div>
  )
}
