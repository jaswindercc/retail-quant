import { useState, useEffect, useMemo } from 'react'
import { fetchJson } from '../utils'

const OTM_COLORS = { '3.0pct': '#ef4444', '5.0pct': '#fbbf24', '7.0pct': '#4ade80', '10.0pct': '#64b5f6' }
const OTM_LABELS = { '3.0pct': '3% OTM', '5.0pct': '5% OTM', '7.0pct': '7% OTM', '10.0pct': '10% OTM' }

function fmtMoney(v) {
  if (!Number.isFinite(v)) return '$0'
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export default function SpreadBacktestPage({ dataFile, findings }) {
  const [data, setData] = useState(null)
  const [selectedOtm, setSelectedOtm] = useState('7.0pct')

  useEffect(() => {
    fetchJson(`${import.meta.env.BASE_URL}${dataFile}`)
      .then(setData)
      .catch(e => setData({ error: e.message }))
  }, [dataFile])

  const strategies = data?.strategies || {}
  const strat = strategies[selectedOtm]
  const stats = strat?.stats || {}
  const trades = strat?.trades || []

  // Monthly breakdown
  const monthlyData = useMemo(() => {
    const months = {}
    trades.forEach(t => {
      const m = t.entryDate.slice(0, 7)
      if (!months[m]) months[m] = { wins: 0, losses: 0, pnl: 0, trades: 0 }
      months[m].trades++
      months[m].pnl += t.pnl
      if (t.outcome === 'WIN') months[m].wins++
      else months[m].losses++
    })
    return Object.entries(months).sort().map(([month, d]) => ({ month, ...d }))
  }, [trades])

  // Yearly breakdown
  const yearlyData = useMemo(() => {
    const years = {}
    trades.forEach(t => {
      const y = t.entryDate.slice(0, 4)
      if (!years[y]) years[y] = { wins: 0, losses: 0, pnl: 0, trades: 0 }
      years[y].trades++
      years[y].pnl += t.pnl
      if (t.outcome === 'WIN') years[y].wins++
      else years[y].losses++
    })
    return Object.entries(years).sort().map(([year, d]) => ({ year, ...d, wr: d.trades ? (d.wins / d.trades * 100).toFixed(1) : 0 }))
  }, [trades])

  if (!data) return <div className="loading">Loading spread backtest…</div>
  if (data.error) return (
    <div style={{ padding: 40, maxWidth: 520, margin: '60px auto', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔻</div>
      <h2 style={{ color: '#e2e8f0' }}>Spread data not available</h2>
      <p style={{ color: '#a1a1aa', fontSize: 14 }}>Run: <code>python scripts/generate_spread_data.py --ticker TSLA</code></p>
    </div>
  )

  const { ticker, params } = data

  // Equity curve
  const equityCurve = stats.equityCurve || []
  const maxEquity = Math.max(...equityCurve, 1)
  const minEquity = Math.min(...equityCurve, 0)
  const eqRange = maxEquity - minEquity || 1

  return (
    <div>
      <h1 className="page-title">{ticker} Bull Put Spread Backtest <span>{params.dataRange} · {params.entryFreq}d entries · ${params.spreadWidth} wide</span></h1>

      {/* Findings banner */}
      {findings && (
        <div className="card" style={{ marginBottom: 20, padding: '20px 24px', border: '2px solid #ef4444', background: 'rgba(239,68,68,0.12)', borderRadius: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: '1.5rem' }}>🚨</span>
            <strong style={{ color: '#ef4444', fontSize: '1.1rem', letterSpacing: '0.5px' }}>KEY FINDING: ASSIGNMENT RISK</strong>
          </div>
          <p style={{ color: '#f1f5f9', margin: 0, fontSize: '0.95rem', lineHeight: 1.7 }}>{findings}</p>
        </div>
      )}

      {/* Strategy selector */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ color: '#888', fontSize: '0.85rem', marginRight: 8 }}>OTM Distance:</span>
        <div className="tab-bar" style={{ margin: 0 }}>
          {Object.keys(strategies).map(key => (
            <button key={key} className={selectedOtm === key ? 'active' : ''} onClick={() => setSelectedOtm(key)}
              style={selectedOtm === key ? { borderColor: OTM_COLORS[key], color: OTM_COLORS[key] } : {}}>
              {OTM_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Grid */}
      <div className="kpi-grid">
        <div className="kpi" style={{ borderTop: `3px solid ${OTM_COLORS[selectedOtm]}` }}>
          <div className="label">Win Rate</div>
          <div className="value green">{stats.winRate}%</div>
        </div>
        <div className="kpi" style={{ borderTop: '3px solid #4ade80' }}>
          <div className="label">Total P&L / Contract</div>
          <div className="value green">{fmtMoney(stats.totalPnlPerContract)}</div>
        </div>
        <div className="kpi" style={{ borderTop: '3px solid #fbbf24' }}>
          <div className="label">Profit Factor</div>
          <div className="value">{stats.profitFactor}</div>
        </div>
        <div className="kpi" style={{ borderTop: '3px solid #ef4444' }}>
          <div className="label">Max Drawdown</div>
          <div className="value" style={{ color: '#ef4444' }}>{fmtMoney(stats.maxDDPerContract)}</div>
        </div>
        <div className="kpi">
          <div className="label">Trades</div>
          <div className="value">{stats.totalTrades}</div>
        </div>
        <div className="kpi">
          <div className="label">Avg Credit</div>
          <div className="value">${stats.avgCredit}</div>
        </div>
        <div className="kpi">
          <div className="label">Max Loss Events</div>
          <div className="value" style={{ color: '#ef4444' }}>{stats.maxLosses}</div>
        </div>
        <div className="kpi">
          <div className="label">Touch Rate</div>
          <div className="value" style={{ color: '#fbbf24' }}>{stats.touchRate}%</div>
        </div>
      </div>

      {/* Params */}
      <div className="card" style={{ padding: '10px 16px', marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.8rem', color: '#888' }}>
        <span>Spread: <strong style={{ color: '#ccc' }}>${params.spreadWidth} wide</strong></span>
        <span>DTE: <strong style={{ color: '#ccc' }}>{params.dte}d</strong></span>
        <span>Entry: <strong style={{ color: '#ccc' }}>Every {params.entryFreq}d</strong></span>
        <span>IV model: <strong style={{ color: '#ccc' }}>{params.ivMultiplier}× realized vol</strong></span>
        <span>Data: <strong style={{ color: '#ccc' }}>{params.totalBars} bars</strong></span>
      </div>

      {/* Equity Curve (SVG) */}
      <div className="card">
        <h3 style={{ textTransform: 'none', letterSpacing: 0 }}>Equity Curve (per contract, $)</h3>
        <div style={{ width: '100%', height: 200, position: 'relative' }}>
          <svg viewBox={`0 0 ${equityCurve.length} 200`} preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
            {/* Zero line */}
            <line x1="0" y1={200 - ((0 - minEquity) / eqRange) * 200} x2={equityCurve.length} y2={200 - ((0 - minEquity) / eqRange) * 200} stroke="#333" strokeWidth="0.5" strokeDasharray="2"/>
            {/* Curve */}
            <polyline
              fill="none"
              stroke={OTM_COLORS[selectedOtm]}
              strokeWidth="1.5"
              points={equityCurve.map((v, i) => `${i},${200 - ((v - minEquity) / eqRange) * 200}`).join(' ')}
            />
            {/* Fill below curve */}
            <polygon
              fill={`${OTM_COLORS[selectedOtm]}15`}
              points={`0,200 ${equityCurve.map((v, i) => `${i},${200 - ((v - minEquity) / eqRange) * 200}`).join(' ')} ${equityCurve.length - 1},200`}
            />
          </svg>
          <div style={{ position: 'absolute', top: 4, left: 8, fontSize: '0.75rem', color: '#4ade80' }}>{fmtMoney(maxEquity * 100)}</div>
          <div style={{ position: 'absolute', bottom: 4, left: 8, fontSize: '0.75rem', color: '#ef4444' }}>{fmtMoney(minEquity * 100)}</div>
        </div>
      </div>

      {/* Comparison table across all OTM levels */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <h3 style={{ textTransform: 'none', letterSpacing: 0 }}>All Strategies Compared</h3>
        <table>
          <thead>
            <tr>
              <th>OTM%</th><th>Trades</th><th>Win Rate</th><th>PF</th><th>Total/Contract</th><th>MaxDD/Contract</th><th>Avg Credit</th><th>Avg Win</th><th>Avg Loss</th><th>Touch Rate</th><th>Max Loss Events</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(strategies).map(([key, s]) => (
              <tr key={key} style={key === selectedOtm ? { background: `${OTM_COLORS[key]}11` } : {}}>
                <td><strong style={{ color: OTM_COLORS[key] }}>{OTM_LABELS[key]}</strong></td>
                <td>{s.stats.totalTrades}</td>
                <td><strong>{s.stats.winRate}%</strong></td>
                <td>{s.stats.profitFactor}</td>
                <td className="win">{fmtMoney(s.stats.totalPnlPerContract)}</td>
                <td style={{ color: '#ef4444' }}>{fmtMoney(s.stats.maxDDPerContract)}</td>
                <td>${s.stats.avgCredit}</td>
                <td className="win">${s.stats.avgWin}</td>
                <td className="loss">${s.stats.avgLoss}</td>
                <td>{s.stats.touchRate}%</td>
                <td>{s.stats.maxLosses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Yearly breakdown */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <h3 style={{ textTransform: 'none', letterSpacing: 0 }}>Yearly P&L ({OTM_LABELS[selectedOtm]})</h3>
        <table>
          <thead>
            <tr><th>Year</th><th>Trades</th><th>Wins</th><th>Losses</th><th>Win Rate</th><th>P&L/Contract</th></tr>
          </thead>
          <tbody>
            {yearlyData.map(y => (
              <tr key={y.year}>
                <td><strong>{y.year}</strong></td>
                <td>{y.trades}</td>
                <td style={{ color: '#4ade80' }}>{y.wins}</td>
                <td style={{ color: '#ef4444' }}>{y.losses}</td>
                <td>{y.wr}%</td>
                <td className={y.pnl >= 0 ? 'win' : 'loss'}>{fmtMoney(y.pnl * 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recent trades */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <h3 style={{ textTransform: 'none', letterSpacing: 0 }}>Trade Log — Last 30 ({OTM_LABELS[selectedOtm]})</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ fontSize: '0.8rem' }}>
            <thead>
              <tr>
                <th>Entry</th><th>Expiry</th><th>Stock $</th><th>Short</th><th>Long</th><th>Credit</th><th>Expiry $</th><th>Move</th><th>P&L</th><th>Result</th><th>Touched?</th>
              </tr>
            </thead>
            <tbody>
              {trades.slice(-30).reverse().map((t, i) => (
                <tr key={i}>
                  <td style={{ whiteSpace: 'nowrap' }}>{t.entryDate}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{t.expiryDate}</td>
                  <td>${t.entryPrice}</td>
                  <td>${t.shortStrike}</td>
                  <td>${t.longStrike}</td>
                  <td>${t.credit}</td>
                  <td>${t.expiryPrice}</td>
                  <td style={{ color: t.move_pct >= 0 ? '#4ade80' : '#ef4444' }}>{t.move_pct}%</td>
                  <td className={t.pnl >= 0 ? 'win' : 'loss'}><strong>${t.pnl}</strong></td>
                  <td>
                    <span style={{
                      padding: '2px 6px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600,
                      background: t.outcome === 'WIN' ? 'rgba(74,222,128,0.15)' : t.outcome === 'MAX_LOSS' ? 'rgba(239,68,68,0.2)' : 'rgba(251,191,36,0.15)',
                      color: t.outcome === 'WIN' ? '#4ade80' : t.outcome === 'MAX_LOSS' ? '#ef4444' : '#fbbf24'
                    }}>{t.outcome}</span>
                  </td>
                  <td>{t.touchedShort ? '⚠️' : '✓'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Key takeaways */}
      <div className="card" style={{ marginTop: '1.5rem', borderLeft: '3px solid #4ade80' }}>
        <h3 style={{ textTransform: 'none', letterSpacing: 0, fontSize: '0.95rem' }}>📘 Methodology</h3>
        <ul style={{ fontSize: '0.85rem', color: '#ccc', lineHeight: 2, paddingLeft: '1.25rem' }}>
          <li><strong>Assignment Risk Rule:</strong> If price touches the short strike at ANY point during the trade → exit at max loss immediately</li>
          <li><strong>Touch Rate:</strong> % of trades where the short strike was breached (= automatic loss under this rule)</li>
          <li><strong>IV Model:</strong> Black-Scholes with 1.3× realized vol as IV proxy (no live options chain data)</li>
          <li><strong>DTE 30:</strong> Monthly expiry. Short enough for theta decay, long enough to avoid gamma risk</li>
          <li><strong>No partial wins:</strong> Either you keep full credit (win) or exit at full max loss (touched)</li>
        </ul>
      </div>
    </div>
  )
}
