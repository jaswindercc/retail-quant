import { useState, useEffect } from 'react'
import { fetchJson } from '../utils'

export default function SimPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [selectedPos, setSelectedPos] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState(null)

  const fetchData = () => {
    const base = import.meta.env.BASE_URL
    fetchJson(`${base}sim_data.json`)
      .then(setData)
      .catch(e => setError(e.message))
  }

  useEffect(() => { fetchData() }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    setRefreshMsg(null)
    try {
      const res = await fetch('/api/refresh-sim')
      const json = await res.json()
      if (json.ok) {
        setRefreshMsg('✅ Updated from Google Sheet')
        setTimeout(() => fetchData(), 500)
      } else {
        setRefreshMsg(`❌ ${json.error}`)
      }
    } catch (e) {
      setRefreshMsg(`❌ ${e.message} (only works in dev)`)
    }
    setRefreshing(false)
  }

  if (error) return (
    <div style={{ padding: 40, color: '#f87171' }}>
      <h2>⚠️ No sim data yet</h2>
      <p style={{ color: '#a1a1aa' }}>Add positions to your Google Sheet and the simulator will run at market close.</p>
      <p style={{ color: '#666', fontSize: 13 }}>Error: {error}</p>
    </div>
  )
  if (!data) return <div className="loading">Loading…</div>

  const { summary, positions, lastUpdated, trailRules } = data
  const open = positions.filter(p => p.status === 'OPEN')
  const closed = positions.filter(p => p.status === 'CLOSED')
  const openPnl = open.reduce((sum, p) => sum + (p.pnl || 0), 0)
  const totalPnl = summary.total_pnl + openPnl

  return (
    <div>
      <h1 className="page-title">Swing Simulator <span>Paper Trading · Real Prices · No Cheating</span></h1>

      {/* Refresh button + last updated */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: refreshing ? 'wait' : 'pointer', fontWeight: 600, fontSize: '0.85rem', opacity: refreshing ? 0.6 : 1 }}
        >
          {refreshing ? '⏳ Syncing...' : '🔄 Sync from Google Sheet'}
        </button>
        <span style={{ fontSize: '0.8rem', color: '#888' }}>Last updated: {lastUpdated}</span>
        {refreshMsg && <span style={{ fontSize: '0.8rem', color: refreshMsg.startsWith('✅') ? '#4ade80' : '#f87171' }}>{refreshMsg}</span>}
      </div>

      {/* KPI Row */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
        <KpiCard label="Total P&L" value={`$${totalPnl.toFixed(2)}`} color={totalPnl >= 0 ? '#4ade80' : '#f87171'} />
        <KpiCard label="Open P&L" value={`$${openPnl.toFixed(2)}`} color={openPnl >= 0 ? '#4ade80' : '#f87171'} />
        <KpiCard label="Closed P&L" value={`$${summary.total_pnl.toFixed(2)}`} color={summary.total_pnl >= 0 ? '#4ade80' : '#f87171'} />
        <KpiCard label="Total Trades" value={summary.total_positions} />
        <KpiCard label="Open" value={summary.open} color="#4ade80" />
        <KpiCard label="Closed" value={summary.closed} />
        <KpiCard label="Win Rate" value={`${summary.win_rate}%`} color={summary.win_rate >= 50 ? '#4ade80' : '#f87171'} />
        <KpiCard label="Avg R" value={`${summary.avg_r}R`} color={summary.avg_r >= 0 ? '#4ade80' : '#f87171'} />
        <KpiCard label="Avg Days Held" value={summary.avg_days_held} />
      </div>

      {/* Open Positions */}
      {open.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ color: '#4ade80', marginBottom: 12 }}>🟢 Open Positions ({open.length})</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Entry Date</th>
                  <th>Entry $</th>
                  <th>Last Price</th>
                  <th>% Gain</th>
                  <th>Current R</th>
                  <th>Trail Progress</th>
                  <th>Current SL</th>
                  <th>PnL</th>
                  <th>Days</th>
                  <th>Strategy</th>
                </tr>
              </thead>
              <tbody>
                {open.map((p, i) => {
                  const pctGain = p.last_price && p.entry_price ? ((p.last_price - p.entry_price) / p.entry_price * 100).toFixed(1) : '0.0'
                  const trailTarget = p.trail_params?.trail_start_r || 2.5
                  const rProgress = Math.min(((p.r_multiple || 0) / trailTarget) * 100, 100).toFixed(0)
                  return (
                    <tr key={i} onClick={() => setSelectedPos(p)} style={{ cursor: 'pointer' }}>
                      <td style={{ fontWeight: 700, color: '#e2e8f0' }}>{p.ticker}</td>
                      <td>{p.entry_date}</td>
                      <td>${p.entry_price}</td>
                      <td>
                        <span style={{ color: '#e2e8f0' }}>${p.last_price}</span>
                        {p.price_age_days > 0 && <span style={{ color: '#888', fontSize: '0.7rem', marginLeft: 4 }}>({p.price_age_days}d ago)</span>}
                      </td>
                      <td style={{ color: pctGain >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>{pctGain > 0 ? '+' : ''}{pctGain}%</td>
                      <td style={{ color: p.r_multiple >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>{p.r_multiple}R <span style={{ color: '#666', fontWeight: 400, fontSize: '0.72rem' }}>/ {trailTarget}R</span></td>
                      <td>
                        {p.trail_activated
                          ? <span style={{ color: '#fbbf24', fontWeight: 600 }}>🟡 TRAILING</span>
                          : <span style={{ fontSize: '0.8rem' }}>
                              <span style={{ color: rProgress >= 80 ? '#fbbf24' : '#94a3b8' }}>{rProgress}%</span>
                              <span style={{ display: 'inline-block', width: 40, height: 4, background: '#334155', borderRadius: 2, marginLeft: 6, verticalAlign: 'middle' }}>
                                <span style={{ display: 'block', width: `${rProgress}%`, height: '100%', background: rProgress >= 80 ? '#fbbf24' : '#64b5f6', borderRadius: 2 }}></span>
                              </span>
                            </span>
                        }
                      </td>
                      <td style={{ color: p.trail_activated ? '#fbbf24' : '#f87171' }}>${p.current_sl}</td>
                      <td style={{ color: p.pnl >= 0 ? '#4ade80' : '#f87171' }}>${p.pnl}</td>
                      <td>{p.days_held}</td>
                      <td style={{ fontSize: '0.8rem', color: '#aaa' }}>{p.strategy}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Closed Positions */}
      {closed.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ color: '#94a3b8', marginBottom: 12 }}>📋 Closed Positions ({closed.length})</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>Exit $</th>
                  <th>Reason</th>
                  <th>R</th>
                  <th>PnL</th>
                  <th>Max R</th>
                  <th>Days</th>
                  <th>Strategy</th>
                </tr>
              </thead>
              <tbody>
                {closed.map((p, i) => (
                  <tr key={i} onClick={() => setSelectedPos(p)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 700, color: '#e2e8f0' }}>{p.ticker}</td>
                    <td>{p.entry_date}</td>
                    <td>{p.exit_date}</td>
                    <td>${p.exit_price}</td>
                    <td style={{ color: p.reason.includes('Trail') ? '#fbbf24' : '#f87171', fontSize: '0.82rem' }}>{p.reason}</td>
                    <td style={{ color: p.r_multiple >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>{p.r_multiple}R</td>
                    <td style={{ color: p.pnl >= 0 ? '#4ade80' : '#f87171' }}>${p.pnl}</td>
                    <td style={{ color: '#64b5f6' }}>{p.max_r}R</td>
                    <td>{p.days_held}</td>
                    <td style={{ fontSize: '0.8rem', color: '#aaa' }}>{p.strategy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Daily Log Modal */}
      {selectedPos && (
        <div className="card" style={{ marginBottom: 20, border: '1px solid #64b5f6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ color: '#64b5f6', margin: 0 }}>
              📈 {selectedPos.ticker} — Daily Log
            </h3>
            <button onClick={() => setSelectedPos(null)} style={{ background: 'none', border: '1px solid #666', color: '#aaa', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: 10 }}>
            Entry: ${selectedPos.entry_price} | SL: ${selectedPos.initial_sl} | Risk: ${selectedPos.risk_per_share}/share | {selectedPos.strategy}
          </div>
          <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
            <table className="data-table" style={{ fontSize: '0.8rem' }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Close</th>
                  <th>Stop Loss</th>
                  <th>Trail?</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {selectedPos.daily_log.map((d, i) => (
                  <tr key={i} style={{ background: d.note?.includes('EXIT') ? 'rgba(248,113,113,0.1)' : undefined }}>
                    <td>{d.date}</td>
                    <td>${d.close}</td>
                    <td style={{ color: d.trail_active ? '#fbbf24' : '#f87171' }}>${d.sl}</td>
                    <td>{d.trail_active ? '🟡' : '—'}</td>
                    <td style={{ color: d.note?.includes('EXIT') ? '#f87171' : '#888' }}>{d.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trail Rules Reference */}
      <div className="card" style={{ marginBottom: 20, padding: '16px 20px', border: '1px solid #334155' }}>
        <h4 style={{ color: '#94a3b8', marginBottom: 8 }}>📐 Trailing Stop Rule</h4>
        <div style={{ fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 2 }}>
          <p style={{ margin: 0 }}><strong style={{ color: '#fbbf24' }}>All strategies:</strong> Trail activates at 2.5R, trail = EMA20 − 1×ATR (ratchets up only)</p>
          <p style={{ margin: '8px 0 0', color: '#888' }}>Trail only ratchets UP — never moves down. Gap fills at open price.</p>
        </div>
      </div>

      {/* How it works */}
      <div className="card" style={{ padding: '16px 20px', border: '1px solid #334155' }}>
        <h4 style={{ color: '#94a3b8', marginBottom: 8 }}>ℹ️ How this works</h4>
        <ol style={{ fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 2.2, paddingLeft: 20, margin: 0 }}>
          <li>You add a position to the <a href="https://docs.google.com/spreadsheets/d/1-Y1lz2LRYb_NpLBDdhWDOJF6xS4MYjQ8IeNHOKyx-O0/edit" target="_blank" rel="noopener" style={{ color: '#64b5f6' }}>Google Sheet</a></li>
          <li>Every day at market close, the simulator fetches real OHLC prices</li>
          <li>Checks if your stop loss was hit (using intraday Low)</li>
          <li>Activates trailing SL when profit reaches threshold (same rules as backtest)</li>
          <li>Records the exit with exact reason — no cheating, no hindsight</li>
        </ol>
      </div>
    </div>
  )
}

function KpiCard({ label, value, color }) {
  return (
    <div style={{ background: 'rgba(30,41,59,0.7)', border: '1px solid #334155', borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '1.3rem', fontWeight: 700, color: color || '#e2e8f0' }}>{value}</div>
    </div>
  )
}
