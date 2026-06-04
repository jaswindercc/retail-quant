import { useState, useEffect, useMemo } from 'react'

export default function RotationTop3Page() {
  const [data, setData] = useState(null)
  const [showAllTrades, setShowAllTrades] = useState(false)

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + 'rotation_top3_data.json')
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
  }, [])

  if (!data) return <div style={{ padding: 40, color: '#a1a1aa' }}>Loading...</div>

  const stats = data.stats || {}
  const trades = data.trades || []
  const weeklyLog = data.weekly_log || []
  const equityCurve = data.equity_curve || []
  const params = data.params || {}

  const closedTrades = trades.filter(t => t.exitReason !== 'Open')
  const openTrades = trades.filter(t => t.exitReason === 'Open')
  const recentTrades = [...closedTrades].reverse().slice(0, 20)

  // Monthly PnL
  const monthlyPnl = stats.monthly_pnl || {}
  const months = Object.keys(monthlyPnl).sort()

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>
        🔄 Top-3 Pure Momentum Rotation
      </h1>
      <p style={{ color: '#71717a', fontSize: 12, marginBottom: 4 }}>
        Universe: S&P 500 ({data.universe_size} stocks) · Buy top 3 by 3mo return every Monday · Sell when dropped out · 10% hard stop
      </p>
      <p style={{ color: '#52525b', fontSize: 11, marginBottom: 20 }}>
        Period: {params.period} · Updated: {data.lastUpdated} · No entry filter — pure rotation
      </p>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 24 }}>
        <StatCard label="Total Return" value={`$${Math.round(stats.total_pnl).toLocaleString()}`} sub={`${stats.total_return_pct}%`} color={stats.total_pnl > 0 ? '#4ade80' : '#ef4444'} />
        <StatCard label="Profit Factor" value={stats.profit_factor} color={stats.profit_factor >= 1.5 ? '#4ade80' : '#fbbf24'} />
        <StatCard label="Win Rate" value={`${stats.win_rate}%`} sub={`${stats.wins}W / ${stats.losses}L`} />
        <StatCard label="Max Drawdown" value={`-$${Math.round(stats.max_drawdown).toLocaleString()}`} color="#ef4444" />
        <StatCard label="Avg Winner" value={`+${stats.avg_winner_pct}%`} sub={`$${Math.round(stats.avg_winner).toLocaleString()}`} color="#4ade80" />
        <StatCard label="Avg Loser" value={`-${stats.avg_loser_pct}%`} sub={`-$${Math.round(stats.avg_loser).toLocaleString()}`} color="#ef4444" />
        <StatCard label="Avg Hold" value={`${stats.avg_duration}d`} />
        <StatCard label="Lose Streak" value={stats.max_lose_streak} />
      </div>

      {/* Open Positions */}
      {openTrades.length > 0 && (
        <div style={{ background: '#0a1628', border: '2px solid #4ade80', borderRadius: 8, padding: 16, marginBottom: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#4ade80', marginBottom: 8 }}>📍 Current Positions (as of last date)</h2>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {openTrades.map(t => (
              <div key={t.stock} style={{ background: '#1a1a2e', borderRadius: 6, padding: '8px 14px', border: '1px solid #333' }}>
                <div style={{ fontWeight: 700, color: '#4ade80', fontSize: 14 }}>{t.stock}</div>
                <div style={{ fontSize: 10, color: '#71717a' }}>Entry: ${t.entryPrice} · #{t.rank_at_entry}</div>
                <div style={{ fontSize: 12, color: t.pnlDollar > 0 ? '#4ade80' : '#ef4444', fontWeight: 600 }}>
                  {t.pnlPct > 0 ? '+' : ''}{t.pnlPct}% (${Math.round(t.pnlDollar).toLocaleString()})
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Equity Curve */}
      <div style={{ background: '#0a0a1a', borderRadius: 12, padding: 16, marginBottom: 20, border: '1px solid #1a1a2e' }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>📈 Equity Curve (Realized + Unrealized)</h2>
        <EquityChart data={equityCurve} />
      </div>

      {/* Weekly Top 10 Log — THE EVIDENCE */}
      <div style={{ background: '#0a0a1a', borderRadius: 12, padding: 16, marginBottom: 20, border: '1px solid #1a1a2e' }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>📋 Weekly Top 10 (Evidence — what was ACTUALLY top 10 each week)</h2>
        <p style={{ fontSize: 10, color: '#52525b', marginBottom: 10 }}>
          Showing last 15 weeks. Green = we held it. These are the real rankings at each Monday.
        </p>
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
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
              {weeklyLog.slice(-15).reverse().map(wk => (
                <tr key={wk.week} style={{ borderBottom: '1px solid #1a1a2e' }}>
                  <td style={{ padding: '4px 6px', color: '#71717a', fontWeight: 600 }}>{wk.week.slice(5)}</td>
                  {wk.top_10.slice(0, 5).map((s, i) => (
                    <td key={i} style={{ padding: '4px 6px' }}>
                      <span style={{ color: i < 3 ? '#4ade80' : '#a1a1aa', fontWeight: i < 3 ? 700 : 400 }}>
                        {s.ticker}
                      </span>
                      <span style={{ color: '#52525b', fontSize: 9, marginLeft: 3 }}>+{s.return_pct.toFixed(0)}%</span>
                    </td>
                  ))}
                  <td style={{ padding: '4px 6px', color: '#52525b', fontSize: 9 }}>
                    {wk.top_10.slice(5, 10).map(s => s.ticker).join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly PnL */}
      <div style={{ background: '#0a0a1a', borderRadius: 12, padding: 16, marginBottom: 20, border: '1px solid #1a1a2e' }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>📅 Monthly P/L</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {months.map(m => {
            const val = monthlyPnl[m]
            return (
              <div key={m} style={{ background: val > 0 ? '#0f2a1a' : '#2a0f0f', border: `1px solid ${val > 0 ? '#4ade8040' : '#ef444440'}`, borderRadius: 6, padding: '6px 10px', minWidth: 90 }}>
                <div style={{ fontSize: 10, color: '#71717a' }}>{m}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: val > 0 ? '#4ade80' : '#ef4444' }}>
                  {val > 0 ? '+' : ''}${Math.round(val).toLocaleString()}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Recent Trades */}
      <div style={{ background: '#0a0a1a', borderRadius: 12, padding: 16, border: '1px solid #1a1a2e' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700 }}>📋 Trades ({closedTrades.length} total)</h2>
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
          <p><strong>Strategy:</strong> Every Monday, rank all ~{data.universe_size} S&P 500 stocks by 3-month (63-day) return. Buy top 3. Sell when they drop out of top 3.</p>
          <p><strong>Position sizing:</strong> Equal weight — ${(CAPITAL / MAX_POSITIONS).toLocaleString()} per slot ({MAX_POSITIONS} slots)</p>
          <p><strong>Stop loss:</strong> 10% hard stop from entry, checked daily</p>
          <p><strong>No entry filter:</strong> No breakout requirement. Just buy at close on rotation day.</p>
          <p><strong>Exit:</strong> Either dropped out of top 3 at next Monday, or hit 10% stop loss</p>
          <p style={{ marginTop: 8, color: '#f59e0b' }}><strong>⚠️ Caveats:</strong></p>
          <ul style={{ paddingLeft: 20 }}>
            <li>Survivorship bias: uses today's S&P 500 list, not historical constituents</li>
            <li>No slippage or commissions modeled</li>
            <li>Assumes you can buy at Monday close (realistic for liquid S&P 500 stocks)</li>
            <li>18 months is a short test period — results may not persist</li>
          </ul>
        </div>
      </details>
    </div>
  )
}

const CAPITAL = 40000
const MAX_POSITIONS = 3

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: '#0a0a1a', border: '1px solid #1a1a2e', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: '#71717a', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || '#e4e4e7' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#52525b' }}>{sub}</div>}
    </div>
  )
}

function EquityChart({ data }) {
  if (!data || data.length === 0) return null
  
  const pnls = data.map(d => d.total_pnl)
  const minPnl = Math.min(0, ...pnls)
  const maxPnl = Math.max(1, ...pnls)
  
  const W = 900, H = 180, PAD = 35
  const scaleX = (i) => PAD + (i / (data.length - 1)) * (W - 2 * PAD)
  const scaleY = (v) => H - PAD - ((v - minPnl) / (maxPnl - minPnl)) * (H - 2 * PAD)
  
  const points = data.map((d, i) => `${scaleX(i)},${scaleY(d.total_pnl)}`).join(' ')
  
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ background: '#050510', borderRadius: 8 }}>
      <line x1={PAD} x2={W-PAD} y1={scaleY(0)} y2={scaleY(0)} stroke="#333" strokeDasharray="4" />
      <text x={PAD-4} y={scaleY(0)+3} fill="#52525b" fontSize="9" textAnchor="end">$0</text>
      <text x={PAD-4} y={scaleY(maxPnl)+3} fill="#52525b" fontSize="9" textAnchor="end">${Math.round(maxPnl/1000)}K</text>
      {minPnl < 0 && <text x={PAD-4} y={scaleY(minPnl)+3} fill="#52525b" fontSize="9" textAnchor="end">-${Math.round(Math.abs(minPnl)/1000)}K</text>}
      <polyline points={points} fill="none" stroke="#4ade80" strokeWidth="1.5" />
    </svg>
  )
}
