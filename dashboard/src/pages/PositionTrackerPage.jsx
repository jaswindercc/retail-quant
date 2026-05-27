import { useState, useEffect, useMemo, useCallback } from 'react'

const STRATEGIES = ['MA Bounce', 'Breakout', 'RSI Trend', 'Higher High', 'Other']
const STRAT_COLORS = {
  'MA Bounce': '#2196f3', 'Breakout': '#ff9800', 'RSI Trend': '#e040fb',
  'Higher High': '#ab47bc', 'Other': '#78909c'
}
const STRAT_ICONS = {
  'MA Bounce': '🔵', 'Breakout': '🟡', 'RSI Trend': '🟣',
  'Higher High': '📐', 'Other': '⚪'
}
const RISK_PER_TRADE = 200
const REPO_OWNER = 'jaswindercc'
const REPO_NAME = 'retail-quant'
const FILE_PATH = 'data/positions.json'
const TOKEN_KEY = 'rq_gh_token'

function today() { return new Date().toISOString().slice(0, 10) }

function daysBetween(d1, d2) {
  const a = new Date(d1), b = new Date(d2)
  return Math.max(0, Math.round((b - a) / 86400000))
}

function fmtMoney(v) {
  if (!Number.isFinite(v)) return '$0'
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ─── GitHub API helpers ───

async function ghRead(token) {
  const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' }
  })
  if (!res.ok) throw new Error(`GitHub read failed: ${res.status}`)
  const data = await res.json()
  const content = JSON.parse(atob(data.content))
  return { content, sha: data.sha }
}

async function ghWrite(token, positions, sha) {
  const body = JSON.stringify({ positions, lastUpdated: today() }, null, 2) + '\n'
  const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Update positions (${positions.filter(p => p.status === 'OPEN').length} open)`,
      content: btoa(unescape(encodeURIComponent(body))),
      sha
    })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `GitHub write failed: ${res.status}`)
  }
  const result = await res.json()
  return result.content.sha
}

function computeTrailingStop(pos) {
  const risk = pos.risk_per_share
  if (!risk || risk <= 0) return { trailSL: pos.stop, phase: 'INITIAL', note: 'Holding initial stop' }

  const rMultiple = pos.highest_since_entry
    ? (pos.highest_since_entry - pos.entry) / risk
    : 0

  if (rMultiple >= 2.5) {
    const trailSL = +(pos.highest_since_entry - risk).toFixed(2)
    return {
      trailSL: Math.max(trailSL, pos.entry),
      phase: 'TRAILING',
      note: `Trail active (${rMultiple.toFixed(1)}R). SL = High − ATR`
    }
  }

  return { trailSL: pos.stop, phase: 'INITIAL', note: `Waiting for 2.5R (at ${rMultiple >= 0 ? '+' : ''}${rMultiple.toFixed(1)}R now)` }
}

export default function PositionTrackerPage() {
  const [positions, setPositions] = useState([])
  const [sha, setSha] = useState(null)
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '')
  const [tokenInput, setTokenInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [dirty, setDirty] = useState(false)

  const [scannerData, setScannerData] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ ticker: '', entry: '', quantity: '', strategy: '', stop: '', comment: '', date: today(), highest_since_entry: '' })

  // Load scanner data for auto-fill
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}live_scanner_data.json`)
      .then(r => r.ok ? r.json() : null)
      .then(setScannerData)
      .catch(() => {})
  }, [])

  // Load positions from GitHub when token is set
  const loadPositions = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const { content, sha: fileSha } = await ghRead(token)
      setPositions(content.positions || [])
      setSha(fileSha)
      setDirty(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { loadPositions() }, [loadPositions])

  // Save to GitHub
  const savePositions = async (newPositions) => {
    if (!token || !sha) return
    setSaving(true)
    setError(null)
    try {
      const newSha = await ghWrite(token, newPositions, sha)
      setSha(newSha)
      setDirty(false)
    } catch (e) {
      setError(`Save failed: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  // Connect token
  const handleConnect = (e) => {
    e.preventDefault()
    if (!tokenInput.trim()) return
    sessionStorage.setItem(TOKEN_KEY, tokenInput.trim())
    setToken(tokenInput.trim())
    setTokenInput('')
  }

  const disconnect = () => {
    sessionStorage.removeItem(TOKEN_KEY)
    setToken('')
    setPositions([])
    setSha(null)
  }

  // Auto-fill from scanner
  const handleTickerBlur = () => {
    if (!scannerData || !form.ticker) return
    const ticker = form.ticker.toUpperCase()
    const match = scannerData.signals?.find(s => s.ticker === ticker)
    if (match && !form.entry) {
      setForm(f => ({
        ...f,
        ticker,
        entry: f.entry || String(match.entry),
        stop: f.stop || String(match.stop),
        strategy: f.strategy || match.strategy,
      }))
    } else {
      setForm(f => ({ ...f, ticker }))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const entry = parseFloat(form.entry)
    const qty = parseInt(form.quantity)
    const stop = parseFloat(form.stop)
    if (!form.ticker || !entry || !qty) return

    const risk_per_share = entry - stop
    const position = {
      id: editId || Date.now(),
      ticker: form.ticker.toUpperCase(),
      entry,
      quantity: qty,
      stop: isNaN(stop) ? +(entry - (RISK_PER_TRADE / qty)).toFixed(2) : stop,
      risk_per_share: isNaN(risk_per_share) ? +(RISK_PER_TRADE / qty).toFixed(2) : +risk_per_share.toFixed(2),
      strategy: form.strategy || 'Other',
      comment: form.comment,
      date: form.date || today(),
      highest_since_entry: parseFloat(form.highest_since_entry) || entry,
      status: 'OPEN',
    }

    let updated
    if (editId) {
      updated = positions.map(p => p.id === editId ? position : p)
    } else {
      updated = [position, ...positions]
    }
    setPositions(updated)
    await savePositions(updated)

    setForm({ ticker: '', entry: '', quantity: '', strategy: '', stop: '', comment: '', date: today(), highest_since_entry: '' })
    setShowForm(false)
    setEditId(null)
  }

  const closePosition = async (id) => {
    const updated = positions.map(p => p.id === id ? { ...p, status: 'CLOSED', closeDate: today() } : p)
    setPositions(updated)
    await savePositions(updated)
  }

  const deletePosition = async (id) => {
    if (!confirm('Delete this position?')) return
    const updated = positions.filter(p => p.id !== id)
    setPositions(updated)
    await savePositions(updated)
  }

  const editPosition = (pos) => {
    setEditId(pos.id)
    setForm({
      ticker: pos.ticker,
      entry: String(pos.entry),
      quantity: String(pos.quantity),
      strategy: pos.strategy,
      stop: String(pos.stop),
      comment: pos.comment || '',
      date: pos.date,
      highest_since_entry: String(pos.highest_since_entry || pos.entry),
    })
    setShowForm(true)
  }

  const updateHigh = (id, high) => {
    const val = parseFloat(high)
    if (isNaN(val)) return
    const updated = positions.map(p => p.id === id ? { ...p, highest_since_entry: val } : p)
    setPositions(updated)
    setDirty(true)
  }

  const saveAll = async () => {
    await savePositions(positions)
  }

  const openPositions = positions.filter(p => p.status === 'OPEN')
  const closedPositions = positions.filter(p => p.status === 'CLOSED')

  const summary = useMemo(() => {
    const totalCapital = openPositions.reduce((s, p) => s + p.entry * p.quantity, 0)
    const totalRisk = openPositions.reduce((s, p) => s + (p.risk_per_share * p.quantity), 0)
    const byStrategy = {}
    openPositions.forEach(p => { byStrategy[p.strategy] = (byStrategy[p.strategy] || 0) + 1 })
    return { totalCapital, totalRisk, count: openPositions.length, byStrategy }
  }, [openPositions])

  // ─── No token: show connect screen ───
  if (!token) {
    return (
      <div style={{ padding: 40, maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
        <h2 style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: 8 }}>Position Tracker</h2>
        <p style={{ color: '#a1a1aa', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 24 }}>
          Positions are stored in <code style={{ background: '#1a1a2e', padding: '2px 6px', borderRadius: 4 }}>data/positions.json</code> in your repo.
          Enter your GitHub PAT to connect (stored only in this browser session).
        </p>
        <form onSubmit={handleConnect} style={{ display: 'flex', gap: 8 }}>
          <input
            type="password"
            value={tokenInput}
            onChange={e => setTokenInput(e.target.value)}
            placeholder="ghp_xxxxxxxxxxxxx"
            style={{ flex: 1, padding: '10px 14px', background: '#0d1b2a', border: '1px solid #333', borderRadius: 8, color: '#fff', fontSize: '0.9rem' }}
          />
          <button type="submit" style={{ padding: '10px 20px', background: '#4ade80', color: '#000', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
            Connect
          </button>
        </form>
        <p style={{ color: '#71717a', fontSize: '0.75rem', marginTop: 16 }}>
          Need a token? GitHub → Settings → Developer Settings → Fine-grained tokens → Create with "Contents: Read &amp; Write" on this repo.
        </p>
      </div>
    )
  }

  if (loading) return <div className="loading">Loading positions from GitHub…</div>

  return (
    <div>
      <h1 className="page-title">Position Tracker <span>{summary.count} open · {fmtMoney(summary.totalCapital)} deployed</span></h1>

      {/* Status bar */}
      <div className="card" style={{ padding: '8px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: '0.8rem', color: '#4ade80' }}>
          ✓ Connected to GitHub · <code style={{ fontSize: '0.75rem' }}>{FILE_PATH}</code>
          {saving && <span style={{ color: '#fbbf24', marginLeft: 8 }}>saving…</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {dirty && (
            <button onClick={saveAll} style={{ padding: '4px 12px', background: '#fbbf24', color: '#000', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>
              Save Changes
            </button>
          )}
          <button onClick={loadPositions} style={{ padding: '4px 12px', background: '#1a1a2e', border: '1px solid #333', borderRadius: 6, color: '#ccc', fontSize: '0.8rem', cursor: 'pointer' }}>
            ↻ Refresh
          </button>
          <button onClick={disconnect} style={{ padding: '4px 12px', background: 'rgba(239,68,68,0.15)', border: 'none', borderRadius: 6, color: '#ef4444', fontSize: '0.8rem', cursor: 'pointer' }}>
            Disconnect
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 8, marginBottom: 16, color: '#ef4444', fontSize: '0.85rem' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Summary KPIs */}
      <div className="kpi-grid">
        <div className="kpi" style={{ borderTop: '3px solid #4ade80' }}>
          <div className="label">Capital Deployed</div>
          <div className="value green">{fmtMoney(summary.totalCapital)}</div>
        </div>
        <div className="kpi" style={{ borderTop: '3px solid #ef4444' }}>
          <div className="label">Total Risk</div>
          <div className="value" style={{ color: '#ef4444' }}>{fmtMoney(summary.totalRisk)}</div>
        </div>
        <div className="kpi" style={{ borderTop: '3px solid #fbbf24' }}>
          <div className="label">Open Positions</div>
          <div className="value">{summary.count}</div>
        </div>
        <div className="kpi" style={{ borderTop: '3px solid #64b5f6' }}>
          <div className="label">Risk/Trade</div>
          <div className="value">${RISK_PER_TRADE}</div>
        </div>
      </div>

      {/* Strategy allocation */}
      {Object.keys(summary.byStrategy).length > 0 && (
        <div className="card" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: '#888', fontSize: '0.85rem' }}>Allocation:</span>
          {Object.entries(summary.byStrategy).map(([strat, count]) => (
            <span key={strat} style={{ padding: '3px 10px', borderRadius: 6, fontSize: '0.8rem', fontWeight: 600, background: `${STRAT_COLORS[strat] || '#666'}22`, color: STRAT_COLORS[strat] || '#ccc' }}>
              {STRAT_ICONS[strat]} {strat} × {count}
            </span>
          ))}
        </div>
      )}

      {/* Add Position Button */}
      <div style={{ marginBottom: '1rem' }}>
        <button onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ ticker: '', entry: '', quantity: '', strategy: '', stop: '', comment: '', date: today(), highest_since_entry: '' }) }}
          style={{ padding: '10px 20px', background: '#4ade80', color: '#000', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
          {showForm ? '✕ Cancel' : '+ New Position'}
        </button>
      </div>

      {/* Entry Form */}
      {showForm && (
        <div className="card" style={{ border: '2px solid #4ade80', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', textTransform: 'none', letterSpacing: 0 }}>{editId ? '✏️ Edit Position' : '➕ New Position'}</h3>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Ticker *</label>
              <input style={inputStyle} value={form.ticker} onChange={e => setForm({ ...form, ticker: e.target.value.toUpperCase() })} onBlur={handleTickerBlur} placeholder="AAPL" required />
            </div>
            <div>
              <label style={labelStyle}>Entry Price *</label>
              <input style={inputStyle} type="number" step="0.01" value={form.entry} onChange={e => setForm({ ...form, entry: e.target.value })} placeholder="150.00" required />
            </div>
            <div>
              <label style={labelStyle}>Quantity *</label>
              <input style={inputStyle} type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} placeholder="10" required />
            </div>
            <div>
              <label style={labelStyle}>Stop Loss</label>
              <input style={inputStyle} type="number" step="0.01" value={form.stop} onChange={e => setForm({ ...form, stop: e.target.value })} placeholder="145.00" />
            </div>
            <div>
              <label style={labelStyle}>Strategy</label>
              <select style={inputStyle} value={form.strategy} onChange={e => setForm({ ...form, strategy: e.target.value })}>
                <option value="">— select —</option>
                {STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Entry Date</label>
              <input style={inputStyle} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Highest Since Entry</label>
              <input style={inputStyle} type="number" step="0.01" value={form.highest_since_entry} onChange={e => setForm({ ...form, highest_since_entry: e.target.value })} placeholder="Same as entry" />
            </div>
            <div>
              <label style={labelStyle}>Comment</label>
              <input style={inputStyle} value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} placeholder="Notes..." />
            </div>
            <div style={{ display: 'flex', alignItems: 'end' }}>
              <button type="submit" disabled={saving} style={{ padding: '10px 20px', background: saving ? '#666' : '#4ade80', color: '#000', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', width: '100%' }}>
                {saving ? 'Saving…' : editId ? 'Update' : 'Add Position'}
              </button>
            </div>
          </form>
          <p style={{ color: '#888', fontSize: '0.75rem', marginTop: '0.75rem', marginBottom: 0 }}>
            💡 Enter the ticker first — if it's in today's scanner, strategy &amp; stop auto-fill. Saves instantly to GitHub.
          </p>
        </div>
      )}

      {/* Open Positions Table */}
      {openPositions.length > 0 && (
        <div className="card">
          <h3 style={{ textTransform: 'none', letterSpacing: 0 }}>Open Positions ({openPositions.length})</h3>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Strategy</th>
                  <th>Entry Date</th>
                  <th>Days Held</th>
                  <th>Entry</th>
                  <th>Qty</th>
                  <th>Position Size</th>
                  <th>Initial SL</th>
                  <th>Trailing SL</th>
                  <th>Phase</th>
                  <th>Risk ($)</th>
                  <th>Highest</th>
                  <th>Comment</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {openPositions.map(pos => {
                  const trail = computeTrailingStop(pos)
                  const posSize = pos.entry * pos.quantity
                  const daysHeld = daysBetween(pos.date, today())
                  const totalRisk = pos.risk_per_share * pos.quantity
                  return (
                    <tr key={pos.id}>
                      <td><strong>{pos.ticker}</strong></td>
                      <td>
                        <span style={{ color: STRAT_COLORS[pos.strategy] || '#ccc', fontWeight: 600, fontSize: '0.85rem' }}>
                          {STRAT_ICONS[pos.strategy]} {pos.strategy}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{pos.date}</td>
                      <td><strong>{daysHeld}d</strong></td>
                      <td><strong>${pos.entry}</strong></td>
                      <td>{pos.quantity}</td>
                      <td><strong>{fmtMoney(posSize)}</strong></td>
                      <td style={{ color: '#ef5350' }}>${pos.stop}</td>
                      <td style={{ color: trail.phase === 'TRAILING' ? '#4ade80' : '#fbbf24', fontWeight: 700 }}>
                        ${trail.trailSL}
                      </td>
                      <td>
                        <span style={{
                          padding: '2px 8px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600,
                          background: trail.phase === 'TRAILING' ? 'rgba(74,222,128,0.15)' : 'rgba(251,191,36,0.15)',
                          color: trail.phase === 'TRAILING' ? '#4ade80' : '#fbbf24'
                        }}>{trail.phase}</span>
                        <div style={{ fontSize: '0.7rem', color: '#888', marginTop: 2 }}>{trail.note}</div>
                      </td>
                      <td style={{ color: '#ef4444' }}>{fmtMoney(totalRisk)}</td>
                      <td>
                        <input type="number" step="0.01" value={pos.highest_since_entry || ''} onChange={e => updateHigh(pos.id, e.target.value)}
                          style={{ width: 70, background: '#1a1a2e', border: '1px solid #333', borderRadius: 4, color: '#fff', padding: '2px 4px', fontSize: '0.8rem' }} />
                      </td>
                      <td style={{ fontSize: '0.8rem', color: '#aaa', maxWidth: 150 }}>{pos.comment}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button onClick={() => editPosition(pos)} style={btnStyle}>✏️</button>
                        <button onClick={() => closePosition(pos.id)} style={{ ...btnStyle, background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}>✓</button>
                        <button onClick={() => deletePosition(pos.id)} style={{ ...btnStyle, background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {dirty && (
            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <button onClick={saveAll} disabled={saving} style={{ padding: '8px 16px', background: '#fbbf24', color: '#000', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'Saving…' : '💾 Save Highest Updates'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Closed Positions */}
      {closedPositions.length > 0 && (
        <div className="card" style={{ marginTop: '1.5rem', opacity: 0.8 }}>
          <h3 style={{ textTransform: 'none', letterSpacing: 0 }}>Closed Positions ({closedPositions.length})</h3>
          <table>
            <thead>
              <tr>
                <th>Ticker</th><th>Strategy</th><th>Entry</th><th>Qty</th><th>Position</th><th>SL</th><th>Opened</th><th>Closed</th><th>Days</th><th>Comment</th><th></th>
              </tr>
            </thead>
            <tbody>
              {closedPositions.map(pos => (
                <tr key={pos.id}>
                  <td><strong>{pos.ticker}</strong></td>
                  <td style={{ color: STRAT_COLORS[pos.strategy], fontSize: '0.85rem' }}>{STRAT_ICONS[pos.strategy]} {pos.strategy}</td>
                  <td>${pos.entry}</td>
                  <td>{pos.quantity}</td>
                  <td>{fmtMoney(pos.entry * pos.quantity)}</td>
                  <td style={{ color: '#ef5350' }}>${pos.stop}</td>
                  <td style={{ fontSize: '0.85rem' }}>{pos.date}</td>
                  <td style={{ fontSize: '0.85rem' }}>{pos.closeDate}</td>
                  <td>{daysBetween(pos.date, pos.closeDate || today())}d</td>
                  <td style={{ fontSize: '0.8rem', color: '#aaa' }}>{pos.comment}</td>
                  <td><button onClick={() => deletePosition(pos.id)} style={{ ...btnStyle, background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {positions.length === 0 && !showForm && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
          <h2 style={{ color: '#e2e8f0', fontWeight: 600 }}>No positions yet</h2>
          <p style={{ color: '#a1a1aa', fontSize: '0.9rem' }}>Click "+ New Position" to start tracking your trades.</p>
        </div>
      )}

      {/* How trailing stop works */}
      <div className="card" style={{ marginTop: '1.5rem', borderLeft: '3px solid #64b5f6' }}>
        <h3 style={{ textTransform: 'none', letterSpacing: 0, fontSize: '0.95rem' }}>📘 How Trailing Stop Works</h3>
        <ul style={{ fontSize: '0.85rem', color: '#ccc', lineHeight: 2, paddingLeft: '1.25rem' }}>
          <li><strong>Initial phase:</strong> SL stays at entry – 1×ATR (your risk/share)</li>
          <li><strong>At 2.5R profit:</strong> Trail activates — SL = Highest Price – 1×ATR</li>
          <li><strong>Update "Highest":</strong> Each day, update the highest price since entry to move the trail up</li>
          <li><strong>Never moves down:</strong> Trail only moves up; if price dips, SL stays put</li>
        </ul>
      </div>
    </div>
  )
}

const labelStyle = { display: 'block', fontSize: '0.75rem', color: '#888', marginBottom: 4, fontWeight: 600 }
const inputStyle = { width: '100%', padding: '8px 10px', background: '#0d1b2a', border: '1px solid #333', borderRadius: 6, color: '#fff', fontSize: '0.9rem' }
const btnStyle = { padding: '4px 8px', background: 'rgba(100,181,246,0.15)', border: 'none', borderRadius: 4, color: '#64b5f6', cursor: 'pointer', marginRight: 4, fontSize: '0.8rem' }
