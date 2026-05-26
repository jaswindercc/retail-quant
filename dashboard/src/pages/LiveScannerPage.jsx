import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'

const STRAT_META = {
  'MA Bounce': { icon: '🔵', color: '#2196f3', path: '/bounce', tag: 'WORKHORSE' },
  'Breakout': { icon: '🟡', color: '#ff9800', path: '/breakout', tag: 'BEST EDGE' },
  'Higher High': { icon: '📐', color: '#ab47bc', path: '/higher-high', tag: 'BEST R:R' },
}

const STRENGTH_COLORS = { STRONG: '#00e676', NORMAL: '#64b5f6' }

function utcToNY(utcStr) {
  try {
    const d = new Date(utcStr + ' UTC')
    return d.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch { return utcStr }
}

function fmtCap(val) {
  if (!val) return '—'
  if (val >= 1e12) return `$${(val / 1e12).toFixed(1)}T`
  if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`
  if (val >= 1e6) return `$${(val / 1e6).toFixed(0)}M`
  return `$${val.toLocaleString()}`
}

export default function LiveScannerPage() {
  const [data, setData] = useState(null)
  const [filter, setFilter] = useState('all') // 'all' | 'MA Bounce' | 'Breakout' | 'Higher High' | 'Confluence'
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}live_scanner_data.json`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setData)
      .catch(e => setData({ error: e.message }))
  }, [])

  const handleSort = (col) => {
    if (sortCol === col) { setSortDir(d => d === 'asc' ? 'desc' : 'asc') }
    else { setSortCol(col); setSortDir('asc') }
  }

  const sorted = useMemo(() => {
    if (!data || data.error) return []
    const signals = data.signals || []
    const latestDate = signals.length > 0 ? signals[0].date : ''
    const todaySignals = signals.filter(s => s.date === latestDate)

    const tMap = {}
    todaySignals.forEach(s => { if (!tMap[s.ticker]) tMap[s.ticker] = []; tMap[s.ticker].push(s.strategy) })
    const confluenceTickers = new Set(Object.entries(tMap).filter(([, strats]) => strats.length > 1).map(([t]) => t))

    let filtered = todaySignals
    if (filter === 'Confluence') {
      // One row per ticker — merge strategies into first signal
      const seen = {}
      filtered = filtered.filter(s => {
        if (!confluenceTickers.has(s.ticker)) return false
        if (seen[s.ticker]) {
          seen[s.ticker].mergedStrategies.push(s.strategy)
          return false
        }
        const clone = { ...s, mergedStrategies: [s.strategy] }
        seen[s.ticker] = clone
        return true
      }).map(s => seen[s.ticker] || s)
    } else if (filter !== 'all') {
      filtered = filtered.filter(s => s.strategy === filter)
    }

    if (!sortCol) return filtered
    return [...filtered].sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol]
      if (va == null) va = ''
      if (vb == null) vb = ''
      if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va
      return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va))
    })
  }, [data, filter, sortCol, sortDir])

  if (!data) return <div><p className="loading">Loading scanner…</p></div>
  if (data.error) return (
    <div style={{padding: 40, maxWidth: 520, margin: '60px auto', textAlign: 'center'}}>
      <div style={{fontSize: 48, marginBottom: 16}}>📡</div>
      <h2 style={{color: '#e2e8f0', fontWeight: 600, marginBottom: 8}}>Scanner data not available yet</h2>
      <p style={{color: '#a1a1aa', fontSize: 14, lineHeight: 1.6}}>
        The live scanner runs automatically every weekday at <strong style={{color: '#4ade80'}}>10:00 AM ET</strong> via GitHub Actions.
        If this is a fresh deploy, the first scan hasn't completed yet.
      </p>
      <p style={{color: '#71717a', fontSize: 12, marginTop: 16}}>
        File: live_scanner_data.json · Next run: Mon–Fri 10 AM ET
      </p>
    </div>
  )

  const { scanDate, universe, stocksScanned, totalSignals, signals } = data

  // Get latest date
  const latestDate = signals.length > 0 ? signals[0].date : ''

  // Today's signals only
  const todaySignals = signals.filter(s => s.date === latestDate)
  const todaySummary = {
    'MA Bounce': todaySignals.filter(s => s.strategy === 'MA Bounce').length,
    'Breakout': todaySignals.filter(s => s.strategy === 'Breakout').length,
    'Higher High': todaySignals.filter(s => s.strategy === 'Higher High').length,
  }
  const todayConfluence = []
  const tMap = {}
  todaySignals.forEach(s => { if (!tMap[s.ticker]) tMap[s.ticker] = []; tMap[s.ticker].push(s.strategy) })
  Object.entries(tMap).forEach(([ticker, strats]) => { if (strats.length > 1) todayConfluence.push({ ticker, strategies: strats }) })

  return (
    <div>
      <h1 className="page-title">Live Scanner <span>{latestDate} · {stocksScanned} stocks scanned</span></h1>

      {/* Data freshness banner */}
      <div className="card" style={{padding: '10px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, borderLeft: '3px solid #4ade80'}}>
        <div style={{fontSize: 13, color: '#a1a1aa'}}>
          <span>📡 Data fetched: </span>
          <strong style={{color: '#4ade80'}}>{utcToNY(scanDate)}</strong>
        </div>
        <div style={{fontSize: 12, color: '#71717a'}}>
          ⏰ Best time to check: <strong style={{color: '#fbbf24'}}>10:05 AM ET</strong> (right after scan completes)
        </div>
      </div>

      {/* Hero stats — today only */}
      <div className="kpi-grid">
        <div className="kpi" style={{ borderTop: '3px solid #2196f3' }}>
          <div className="label">🔵 MA Bounce</div>
          <div className="value green">{todaySummary['MA Bounce']}</div>
        </div>
        <div className="kpi" style={{ borderTop: '3px solid #ff9800' }}>
          <div className="label">🟡 Breakout</div>
          <div className="value green">{todaySummary['Breakout']}</div>
        </div>
        <div className="kpi" style={{ borderTop: '3px solid #ab47bc' }}>
          <div className="label">📐 Higher High</div>
          <div className="value green">{todaySummary['Higher High']}</div>
        </div>
        <div className="kpi" style={{ borderTop: '3px solid #ffd700' }}>
          <div className="label">⭐ Confluence</div>
          <div className="value green">{todayConfluence.length}</div>
        </div>
      </div>

      {/* Confluence section */}
      {todayConfluence.length > 0 && (
        <div className="card" style={{ border: '2px solid #ffd700', background: 'linear-gradient(135deg, #1a1a2e 0%, #1b2838 100%)' }}>
          <h3 style={{ color: '#ffd700', textTransform: 'none', letterSpacing: 0 }}>⭐ Confluence — Picked by Multiple Strategies</h3>
          <p style={{ color: '#aaa', fontSize: '0.8rem', margin: '-8px 0 1rem' }}>
            These stocks triggered signals from 2+ strategies today. Higher conviction.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
            {todayConfluence.map(c => (
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
          {['all', 'MA Bounce', 'Breakout', 'Higher High', 'Confluence'].map(f => (
            <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All Strategies' : f === 'Confluence' ? '⭐ Confluence' : `${STRAT_META[f]?.icon} ${f}`}
            </button>
          ))}
        </div>
      </div>

      {/* Main signals table */}
      <div className="card">
        <h3 style={{ textTransform: 'none', letterSpacing: 0 }}>
          {filter === 'all' ? 'All Signals' : filter === 'Confluence' ? '⭐ Confluence Signals' : `${STRAT_META[filter]?.icon} ${filter} Signals`}
          {' '}<span style={{ color: '#888', fontSize: '0.85rem', fontWeight: 400 }}>({sorted.length})</span>
        </h3>
        {sorted.length > 0 ? (
          <table>
            <thead>
              <tr>
                {[
                  { key: 'ticker', label: 'Ticker' },
                  { key: 'strategy', label: 'Strategy' },
                  { key: 'market_cap', label: 'Mkt Cap' },
                  { key: 'date', label: 'Date' },
                  { key: 'entry', label: 'Entry' },
                  { key: 'stop', label: 'Stop' },
                  { key: 'risk_per_share', label: 'Risk/sh' },
                  { key: 'strength', label: 'Strength' },
                  { key: 'details', label: 'Details' },
                ].map(col => (
                  <th key={col.key} onClick={() => handleSort(col.key)} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    {col.label}{sortCol === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => {
                const meta = STRAT_META[s.strategy] || {}
                const strategies = s.mergedStrategies || [s.strategy]
                return (
                  <tr key={i}>
                    <td><strong>{s.ticker}</strong>{todayConfluence.some(c => c.ticker === s.ticker) && <span style={{ color: '#ffd700', marginLeft: 4 }}>⭐</span>}</td>
                    <td>
                      {strategies.length > 1 ? (
                        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {strategies.map(st => {
                            const m = STRAT_META[st] || {}
                            return <Link key={st} to={m.path || '/'} style={{ textDecoration: 'none', color: m.color || '#ccc', fontSize: '0.8rem', fontWeight: 600 }}>{m.icon} {st}</Link>
                          })}
                        </span>
                      ) : (
                        <Link to={meta.path || '/'} style={{ textDecoration: 'none', color: meta.color || '#ccc', fontSize: '0.85rem', fontWeight: 600 }}>
                          {meta.icon} {s.strategy}
                        </Link>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{fmtCap(s.market_cap)}</td>
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
      </div>

      {/* Strategy breakdown cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '1rem', marginTop: '1rem' }}>
        {Object.entries(STRAT_META).map(([name, meta]) => {
          const stSignals = todaySignals.filter(s => s.strategy === name)
          return (
            <div key={name} className="card" style={{ border: `1px solid ${meta.color}44` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3 style={{ margin: 0, textTransform: 'none', letterSpacing: 0 }}>
                  <Link to={meta.path} style={{ color: meta.color, textDecoration: 'none' }}>{meta.icon} {name}</Link>
                </h3>
                <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: '0.7rem', fontWeight: 700, background: `${meta.color}22`, color: meta.color }}>{meta.tag}</span>
              </div>
              <div style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                <span style={{ color: '#888' }}>Today:</span> <strong style={{ color: '#00e676' }}>{stSignals.length}</strong> signals
              </div>
              {stSignals.length > 0 && (
                <div style={{ fontSize: '0.8rem', color: '#ccc' }}>
                  {stSignals.slice(0, 5).map(s => (
                    <div key={s.ticker} style={{ padding: '3px 0', borderBottom: '1px solid #ffffff08' }}>
                      <strong>{s.ticker}</strong> ${s.entry} <span style={{ color: '#888' }}>stop ${s.stop}</span>
                    </div>
                  ))}
                  {stSignals.length > 5 && <div style={{ color: '#888', marginTop: 4 }}>+{stSignals.length - 5} more</div>}
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
