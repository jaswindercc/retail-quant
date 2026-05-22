import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { fmt$ } from '../utils'

const PATTERN_COLORS = {
  '52-Week High Break': '#26c6da',
  'Bottom Picker': '#ef5350',
  'Bottom Picker (Approaching)': '#ff9800',
  'Higher High Break': '#ab47bc',
}

const PATTERN_ICONS = {
  '52-Week High Break': '🏔️',
  'Bottom Picker': '🎣',
  'Bottom Picker (Approaching)': '👀',
  'Higher High Break': '📐',
}

const STRENGTH_COLORS = {
  'Strong': '#00e676',
  'Normal': '#64b5f6',
  'Watch': '#ff9800',
}

export default function RareScannerPage() {
  const [data, setData] = useState(null)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}rare_scanner_data.json`)
      .then(r => r.json()).then(setData).catch(console.error)
  }, [])

  if (!data) return <div className="main"><p>Loading scanner…</p></div>

  const { scanDate, signals, summary } = data
  const actionable = signals.filter(s => s.risk > 0)
  const watching = signals.filter(s => s.risk === 0)

  return (
    <div>
      <h1 className="page-title">Rare Pattern Scanner <span>Last scan: {scanDate} · {signals.length} signals found</span></h1>

      {/* Summary cards */}
      <div className="kpi-grid">
        {Object.entries(summary.byPattern).map(([pattern, count]) => (
          <div key={pattern} className="kpi-card" style={{ borderTop: `3px solid ${PATTERN_COLORS[pattern] || '#666'}` }}>
            <div className="kpi-value" style={{ color: PATTERN_COLORS[pattern] || '#fff' }}>{count}</div>
            <div className="kpi-label">{PATTERN_ICONS[pattern] || ''} {pattern}</div>
          </div>
        ))}
      </div>

      {/* Info card */}
      <div className="card" style={{ marginBottom: '1.5rem', background: '#1a1a2e', border: '1px solid #444' }}>
        <h3 style={{ margin: '0 0 0.5rem', color: '#fff' }}>How This Scanner Works</h3>
        <p style={{ color: '#ccc', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>
          Checks the last 5 bars of each stock for rare pattern signals. These fire infrequently but can catch big moves.
        </p>
        <ul style={{ color: '#aaa', fontSize: '0.85rem', margin: 0, paddingLeft: '1.5rem', lineHeight: 1.8 }}>
          <li><strong style={{ color: '#26c6da' }}>52-Week High Break</strong> — Close above 252-day high, above SMA50. Momentum continuation.</li>
          <li><strong style={{ color: '#ef5350' }}>Bottom Picker</strong> — 20%+ crash, RSI&lt;35, first green bar. Catching the knife.</li>
          <li><strong style={{ color: '#ff9800' }}>Approaching</strong> — Near setup conditions but not triggered yet. Watch list.</li>
          <li><strong style={{ color: '#ab47bc' }}>Higher High Break</strong> — First higher swing high after 3+ lower highs. Trend reversal.</li>
        </ul>
      </div>

      {/* Actionable signals */}
      {actionable.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ color: '#00e676' }}>🎯 Actionable Signals ({actionable.length})</h3>
          <p style={{ color: '#aaa', fontSize: '0.8rem', marginBottom: '1rem' }}>These have triggered — entry, stop, and risk defined.</p>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr><th>Date</th><th>Stock</th><th>Pattern</th><th>Price</th><th>Stop</th><th>Risk</th><th>Strength</th><th>Details</th></tr>
              </thead>
              <tbody>
                {actionable.map((s, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{s.date}</td>
                    <td><strong>{s.stock}</strong></td>
                    <td style={{ color: PATTERN_COLORS[s.pattern] || '#fff', fontSize: '0.85rem' }}>
                      {PATTERN_ICONS[s.pattern]} {s.pattern}
                    </td>
                    <td>${s.price}</td>
                    <td style={{ color: '#ef5350' }}>${s.sl}</td>
                    <td>${s.risk}</td>
                    <td><span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600,
                      background: `${STRENGTH_COLORS[s.strength]}22`,
                      color: STRENGTH_COLORS[s.strength]
                    }}>{s.strength}</span></td>
                    <td style={{ fontSize: '0.8rem', color: '#aaa', maxWidth: 250 }}>{s.trigger}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Watch list */}
      {watching.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem', border: '1px solid #ff9800' }}>
          <h3 style={{ color: '#ff9800' }}>👀 Watch List ({watching.length})</h3>
          <p style={{ color: '#aaa', fontSize: '0.8rem', marginBottom: '1rem' }}>Approaching setup conditions but not yet triggered.</p>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr><th>Date</th><th>Stock</th><th>Pattern</th><th>Price</th><th>What's Needed</th></tr>
              </thead>
              <tbody>
                {watching.map((s, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{s.date}</td>
                    <td><strong>{s.stock}</strong></td>
                    <td style={{ color: PATTERN_COLORS[s.pattern] || '#fff', fontSize: '0.85rem' }}>
                      {PATTERN_ICONS[s.pattern]} {s.pattern}
                    </td>
                    <td>${s.price}</td>
                    <td style={{ fontSize: '0.8rem', color: '#ccc' }}>{s.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No signals */}
      {signals.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ fontSize: '1.2rem', color: '#888' }}>No rare pattern signals found in the last 5 bars.</p>
          <p style={{ color: '#666', fontSize: '0.9rem' }}>These patterns are rare by nature. Check back after significant market moves.</p>
        </div>
      )}

      {/* Per-stock summary */}
      {Object.keys(summary.byStock).length > 0 && (
        <div className="card">
          <h3>Signals by Stock</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
            {Object.entries(summary.byStock).sort((a, b) => b[1] - a[1]).map(([stock, count]) => (
              <div key={stock} style={{
                padding: '0.5rem 1rem', background: '#1a1a2e', borderRadius: '8px',
                border: '1px solid #333', fontSize: '0.85rem'
              }}>
                <strong style={{ color: '#fff' }}>{stock}</strong>
                <span style={{ color: '#888', marginLeft: '0.5rem' }}>{count} signal{count > 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
