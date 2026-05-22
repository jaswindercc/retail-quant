import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

const STRAT_META = {
  'MA Bounce': { icon: '🔵', color: '#2196f3', path: '/bounce', tag: 'WORKHORSE' },
  'Breakout': { icon: '🟡', color: '#ff9800', path: '/breakout', tag: 'BEST EDGE' },
  'Higher High': { icon: '📐', color: '#ab47bc', path: '/higher-high', tag: 'BEST R:R' },
}

const STRENGTH_COLORS = { STRONG: '#00e676', NORMAL: '#64b5f6' }

export default function LiveScannerPage() {
  const [data, setData] = useState(null)
  const [filter, setFilter] = useState('all') // 'all' | 'MA Bounce' | 'Breakout' | 'Higher High'
  const [dateFilter, setDateFilter] = useState('latest') // 'latest' | 'all'

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}live_scanner_data.json`)
      .then(r => r.json()).then(setData).catch(console.error)
  }, [])

  if (!data) return <div><p className="loading">Loading scanner…</p></div>

  const { scanDate, universe, stocksScanned, totalSignals, signals, confluence, summary } = data

  // Get latest date
  const latestDate = signals.length > 0 ? signals[0].date : ''

  // Filter signals
  let filtered = signals
  if (filter !== 'all') filtered = filtered.filter(s => s.strategy === filter)
  if (dateFilter === 'latest') filtered = filtered.filter(s => s.date === latestDate)

  // Group by ticker for confluence view
  const tickerMap = {}
  signals.forEach(s => {
    if (!tickerMap[s.ticker]) tickerMap[s.ticker] = []
    tickerMap[s.ticker].push(s)
  })

  return (
    <div>
      <h1 className="page-title">Live Scanner <span>{stocksScanned} stocks · {scanDate}</span></h1>

      {/* Hero stats */}
      <div className="kpi-grid">
        <div className="kpi" style={{ borderTop: '3px solid #2196f3' }}>
          <div className="label">🔵 MA Bounce</div>
          <div className="value green">{summary['MA Bounce']}</div>
        </div>
        <div className="kpi" style={{ borderTop: '3px solid #ff9800' }}>
          <div className="label">🟡 Breakout</div>
          <div className="value green">{summary['Breakout']}</div>
        </div>
        <div className="kpi" style={{ borderTop: '3px solid #ab47bc' }}>
          <div className="label">📐 Higher High</div>
          <div className="value green">{summary['Higher High']}</div>
        </div>
        <div className="kpi" style={{ borderTop: '3px solid #ffd700' }}>
          <div className="label">⭐ Confluence</div>
          <div className="value green">{confluence.length}</div>
        </div>
      </div>

      {/* Confluence section */}
      {confluence.length > 0 && (
        <div className="card" style={{ border: '2px solid #ffd700', background: 'linear-gradient(135deg, #1a1a2e 0%, #1b2838 100%)' }}>
          <h3 style={{ color: '#ffd700', textTransform: 'none', letterSpacing: 0 }}>⭐ Confluence — Picked by Multiple Strategies</h3>
          <p style={{ color: '#aaa', fontSize: '0.8rem', margin: '-8px 0 1rem' }}>
            These stocks triggered signals from 2+ strategies. Higher conviction.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
            {confluence.map(c => (
              <div key={c.ticker} style={{ padding: '0.75rem', background: '#0d1b2a', borderRadius: 8, border: '1px solid #ffd70044' }}>
                <strong style={{ fontSize: '1.1rem' }}>{c.ticker}</strong>
                <div style={{ marginTop: '0.25rem', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {c.strategies.map(st => (
                    <span key={st} style={{
                      padding: '1px 6px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600,
                      background: `${STRAT_META[st]?.color || '#666'}22`,
                      color: STRAT_META[st]?.color || '#ccc'
                    }}>{STRAT_META[st]?.icon} {st}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="card" style={{ padding: '12px 16px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ color: '#888', fontSize: '0.85rem', marginRight: 8 }}>Filter:</span>
        <div className="tab-bar" style={{ margin: 0 }}>
          {['all', 'MA Bounce', 'Breakout', 'Higher High'].map(f => (
            <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All Strategies' : `${STRAT_META[f]?.icon} ${f}`}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <div className="tab-bar" style={{ margin: 0 }}>
            <button className={dateFilter === 'latest' ? 'active' : ''} onClick={() => setDateFilter('latest')}>
              Latest ({latestDate})
            </button>
            <button className={dateFilter === 'all' ? 'active' : ''} onClick={() => setDateFilter('all')}>
              All Dates
            </button>
          </div>
        </div>
      </div>

      {/* Main signals table */}
      <div className="card">
        <h3 style={{ textTransform: 'none', letterSpacing: 0 }}>
          {filter === 'all' ? 'All Signals' : `${STRAT_META[filter]?.icon} ${filter} Signals`}
          {' '}<span style={{ color: '#888', fontSize: '0.85rem', fontWeight: 400 }}>({filtered.length})</span>
        </h3>
        {filtered.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Strategy</th>
                <th>Date</th>
                <th>Entry</th>
                <th>Stop</th>
                <th>Risk/sh</th>
                <th>Strength</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 50).map((s, i) => {
                const meta = STRAT_META[s.strategy] || {}
                return (
                  <tr key={i}>
                    <td><strong>{s.ticker}</strong>{confluence.some(c => c.ticker === s.ticker) && <span style={{ color: '#ffd700', marginLeft: 4 }}>⭐</span>}</td>
                    <td>
                      <Link to={meta.path || '/'} style={{ textDecoration: 'none', color: meta.color || '#ccc', fontSize: '0.85rem', fontWeight: 600 }}>
                        {meta.icon} {s.strategy}
                      </Link>
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{s.date}</td>
                    <td><strong>${s.entry}</strong></td>
                    <td style={{ color: '#ef5350' }}>${s.stop}</td>
                    <td>${s.risk_per_share}</td>
                    <td>
                      <span style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600,
                        background: `${STRENGTH_COLORS[s.strength] || '#666'}22`,
                        color: STRENGTH_COLORS[s.strength] || '#ccc'
                      }}>{s.strength}</span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#aaa', maxWidth: 300 }}>{s.details}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#888', textAlign: 'center', padding: '2rem' }}>No signals for this filter.</p>
        )}
        {filtered.length > 50 && <p style={{ color: '#888', fontSize: '0.8rem', marginTop: 8 }}>Showing 50 of {filtered.length}. Switch to "All Dates" for full history.</p>}
      </div>

      {/* Strategy breakdown cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '1rem', marginTop: '1rem' }}>
        {Object.entries(STRAT_META).map(([name, meta]) => {
          const stSignals = signals.filter(s => s.strategy === name)
          const todaySignals = stSignals.filter(s => s.date === latestDate)
          return (
            <div key={name} className="card" style={{ border: `1px solid ${meta.color}44` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3 style={{ margin: 0, textTransform: 'none', letterSpacing: 0 }}>
                  <Link to={meta.path} style={{ color: meta.color, textDecoration: 'none' }}>{meta.icon} {name}</Link>
                </h3>
                <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: '0.7rem', fontWeight: 700, background: `${meta.color}22`, color: meta.color }}>{meta.tag}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                <div><span style={{ color: '#888' }}>Today:</span> <strong style={{ color: '#00e676' }}>{todaySignals.length}</strong></div>
                <div><span style={{ color: '#888' }}>Total:</span> <strong>{stSignals.length}</strong></div>
              </div>
              {todaySignals.length > 0 && (
                <div style={{ fontSize: '0.8rem', color: '#ccc' }}>
                  {todaySignals.slice(0, 5).map(s => (
                    <div key={s.ticker} style={{ padding: '3px 0', borderBottom: '1px solid #ffffff08' }}>
                      <strong>{s.ticker}</strong> ${s.entry} <span style={{ color: '#888' }}>stop ${s.stop}</span>
                    </div>
                  ))}
                  {todaySignals.length > 5 && <div style={{ color: '#888', marginTop: 4 }}>+{todaySignals.length - 5} more</div>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* How to run */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <h3 style={{ textTransform: 'none', letterSpacing: 0 }}>How to Run</h3>
        <pre style={{ background: '#0d1117', padding: '1rem', borderRadius: 8, overflowX: 'auto', fontSize: '0.85rem', color: '#e6edf3', margin: '0.5rem 0' }}>
{`# Daily scan (~50 swing stocks, ~10 sec)
python3 scripts/scan_live.py

# Scan S&P 500 (~500 stocks, ~60 sec)
python3 scripts/scan_live.py --universe sp500

# Custom tickers
python3 scripts/scan_live.py --tickers AAPL NVDA TSLA META AMD`}
        </pre>
        <p style={{ color: '#888', fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
          Refresh this page after running the script. Results auto-update from <code>live_scanner_data.json</code>.
        </p>
      </div>
    </div>
  )
}
