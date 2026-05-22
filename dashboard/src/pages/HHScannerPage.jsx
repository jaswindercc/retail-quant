import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

const STRENGTH_COLORS = { STRONG: '#00e676', NORMAL: '#64b5f6' }

export default function HHScannerPage() {
  const [data, setData] = useState(null)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}hh_scanner_results.json`)
      .then(r => r.json()).then(setData).catch(console.error)
  }, [])

  if (!data) return <div><p className="loading">Loading scanner…</p></div>

  const { scanDate, universe, stocksScanned, signals, watchlist, pattern } = data

  return (
    <div>
      <h1 className="page-title">Higher High Scanner <span>Live scan · {stocksScanned} stocks · {scanDate}</span></h1>

      {/* Info banner */}
      <div className="card" style={{ background: '#1a0d2e', border: '2px solid #ab47bc', padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ margin: '0 0 0.5rem', color: '#ab47bc', textTransform: 'none', letterSpacing: 0 }}>📐 {pattern.name}</h3>
            <p style={{ color: '#ccc', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>{pattern.description}</p>
            <p style={{ color: '#888', fontSize: '0.8rem', margin: 0 }}>Backtest: {pattern.backtest_stats}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: '#888' }}>Universe</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ab47bc' }}>{universe}</div>
            <div style={{ fontSize: '0.75rem', color: '#888', marginTop: 4 }}>{stocksScanned} stocks scanned</div>
          </div>
        </div>
        <p style={{ color: '#aaa', fontSize: '0.8rem', margin: '0.75rem 0 0', padding: '0.5rem 0.75rem', background: 'rgba(171,71,188,0.1)', borderRadius: 6 }}>
          <strong>How to use:</strong> Run <code style={{ color: '#ce93d8' }}>python3 scripts/scan_higher_high.py --universe swing</code> daily before market open. Signals = entries with defined stop. Watchlist = approaching but not yet triggered.
        </p>
      </div>

      {/* KPI row */}
      <div className="kpi-grid">
        <div className="kpi">
          <div className="label">Signals</div>
          <div className={`value ${signals.length > 0 ? 'green' : ''}`}>{signals.length}</div>
        </div>
        <div className="kpi">
          <div className="label">Watchlist</div>
          <div className="value">{watchlist.length}</div>
        </div>
        <div className="kpi">
          <div className="label">Stocks Scanned</div>
          <div className="value">{stocksScanned}</div>
        </div>
        <div className="kpi">
          <div className="label">Last Scan</div>
          <div className="value" style={{ fontSize: '1rem' }}>{scanDate}</div>
        </div>
      </div>

      {/* Signals table */}
      {signals.length > 0 ? (
        <div className="card">
          <h3 style={{ color: '#00e676' }}>🚨 Active Signals ({signals.length})</h3>
          <p style={{ color: '#aaa', fontSize: '0.8rem', marginBottom: '1rem' }}>
            These stocks broke above their previous swing high after 3+ consecutive lower highs. Entry defined.
          </p>
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Date</th>
                <th>Entry</th>
                <th>Stop</th>
                <th>Risk/sh</th>
                <th>Lower Highs</th>
                <th>Break %</th>
                <th>Strength</th>
                <th>Bars Ago</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((s, i) => (
                <tr key={i} style={i === 0 ? { background: 'rgba(0,230,118,0.06)' } : {}}>
                  <td><strong>{s.ticker}</strong></td>
                  <td style={{ whiteSpace: 'nowrap' }}>{s.date}</td>
                  <td><strong>${s.entry}</strong></td>
                  <td style={{ color: '#ef5350' }}>${s.stop}</td>
                  <td>${s.risk_per_share}</td>
                  <td style={{ fontSize: '0.8rem', color: '#aaa' }}>{s.lower_highs.map(h => `$${h}`).join(' → ')}</td>
                  <td style={{ color: s.break_pct > 5 ? '#00e676' : '#ccc' }}>{s.break_pct}%</td>
                  <td>
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600,
                      background: `${STRENGTH_COLORS[s.strength] || '#666'}22`,
                      color: STRENGTH_COLORS[s.strength] || '#ccc'
                    }}>{s.strength}</span>
                  </td>
                  <td>{s.bars_ago}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Detail cards for each signal */}
          <div style={{ marginTop: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '1rem' }}>
            {signals.slice(0, 6).map((s, i) => (
              <div key={i} style={{ padding: '1rem', background: '#1a1a2e', borderRadius: 8, border: `1px solid ${s.strength === 'STRONG' ? '#00e676' : '#444'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <strong style={{ color: '#ab47bc', fontSize: '1.1rem' }}>{s.ticker}</strong>
                  <span style={{ color: '#888', fontSize: '0.8rem' }}>{s.date}</span>
                </div>
                <div style={{ fontSize: '0.85rem', color: '#ccc', marginBottom: '0.5rem' }}>
                  Broke above <strong style={{ color: '#00e676' }}>${s.break_level}</strong> after {s.lower_high_count} lower highs
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem', fontSize: '0.85rem' }}>
                  <div><span style={{ color: '#888' }}>Entry:</span> <strong>${s.entry}</strong></div>
                  <div><span style={{ color: '#888' }}>Stop:</span> <strong style={{ color: '#ef5350' }}>${s.stop}</strong></div>
                  <div><span style={{ color: '#888' }}>Risk/sh:</span> ${s.risk_per_share}</div>
                  <div><span style={{ color: '#888' }}>Break:</span> +{s.break_pct}%</div>
                </div>
                <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#888' }}>
                  LHs: {s.lower_highs.map(h => `$${h}`).join(' → ')}
                </div>
                {s.above_ema20 && <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#00e676' }}>✅ Above EMA20</div>}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ fontSize: '1.2rem', color: '#888' }}>No Higher High Break signals in the last {30} bars.</p>
          <p style={{ color: '#666', fontSize: '0.9rem' }}>This pattern fires rarely. Check the watchlist below for stocks approaching a breakout.</p>
        </div>
      )}

      {/* Watchlist */}
      {watchlist.length > 0 && (
        <div className="card" style={{ marginTop: '1.5rem', border: '1px solid #ff9800' }}>
          <h3 style={{ color: '#ff9800' }}>⏳ Watchlist — Approaching Breakout ({watchlist.length})</h3>
          <p style={{ color: '#aaa', fontSize: '0.8rem', marginBottom: '1rem' }}>
            These stocks have 3+ lower swing highs but haven't broken yet. When price closes above the break level → signal fires.
          </p>
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Current Price</th>
                <th>Break Level</th>
                <th>Distance</th>
                <th>Lower Highs</th>
              </tr>
            </thead>
            <tbody>
              {watchlist.map((w, i) => (
                <tr key={i}>
                  <td><strong>{w.ticker}</strong></td>
                  <td>${w.current_price}</td>
                  <td style={{ color: '#ff9800' }}><strong>${w.break_level}</strong></td>
                  <td style={{ color: w.distance_pct < 5 ? '#00e676' : '#ccc' }}>{w.distance_pct}%</td>
                  <td style={{ fontSize: '0.8rem', color: '#aaa' }}>{w.last_lower_highs.map(h => `$${h}`).join(' → ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* How to run */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3>Run the Scanner</h3>
        <div style={{ fontSize: '0.9rem', color: '#ccc', lineHeight: 1.8 }}>
          <p style={{ margin: '0 0 0.75rem' }}>Run daily before market open from the repo root:</p>
          <pre style={{ background: '#0d1117', padding: '1rem', borderRadius: 8, overflowX: 'auto', fontSize: '0.85rem', color: '#e6edf3' }}>
{`# Scan ~50 popular swing stocks (fast, ~5 sec)
python3 scripts/scan_higher_high.py --universe swing

# Scan S&P 500 (~500 stocks, ~30 sec)
python3 scripts/scan_higher_high.py --universe sp500

# Scan Nasdaq 100
python3 scripts/scan_higher_high.py --universe nasdaq100

# Custom tickers
python3 scripts/scan_higher_high.py --tickers AAPL NVDA TSLA META

# From watchlist file (one ticker per line)
python3 scripts/scan_higher_high.py --file my_watchlist.txt`}
          </pre>
          <p style={{ margin: '0.75rem 0 0', color: '#888', fontSize: '0.8rem' }}>
            Results auto-save to this page. Refresh after running the script to see updated data.
          </p>
        </div>
      </div>
    </div>
  )
}
