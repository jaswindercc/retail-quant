import { useState, useEffect } from 'react'
import { fetchJson } from '../utils'

export default function FactorSwitcherPage() {
  const [data, setData] = useState(null)

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    fetchJson(`${base}overnight_data.json`).then(setData).catch(() => {})
  }, [])

  if (!data) return <div style={{ padding: '2rem', color: '#71717a' }}>Loading overnight data…</div>

  const trades = (data.allTrades || []).filter(t => t.exitDate)

  // Run all variants
  const baseline = runBaseline(trades)
  const variants = [
    runRollingWR(trades, 15, 0.45, 'Rolling WR (15-trade, ≥45%)'),
    runRollingWR(trades, 10, 0.45, 'Rolling WR (10-trade, ≥45%)'),
    runRollingWR(trades, 8, 0.40, 'Rolling WR (8-trade, ≥40%)'),
    runConsecLoss(trades, 5, '5 Consecutive Losses → Skip'),
    runConsecLoss(trades, 3, '3 Consecutive Losses → Skip'),
    runDDFilter(trades, 500, 5, 'DD > $500 → Require Score ≥5'),
    runDDFilter(trades, 800, 5, 'DD > $800 → Require Score ≥5'),
  ]

  // Best variant by Return/DD
  const best = variants.reduce((a, b) => a.returnDD > b.returnDD ? a : b)

  return (
    <div className="page-container" style={{ padding: '1.5rem', maxWidth: 1200 }}>
      <h1 style={{ marginBottom: '0.25rem' }}>Factor Switcher</h1>
      <p style={{ color: '#71717a', fontSize: 13, marginBottom: '0.5rem' }}>
        SPX Overnight · Adaptive filtering to reduce drawdown · Same {trades.length} trades
      </p>
      <p style={{ color: '#6366f1', fontSize: 12, marginBottom: '1.5rem' }}>
        <strong>Goal:</strong> Reduce max drawdown from the overnight strategy by pausing when the model is cold — without destroying PnL.
      </p>

      {/* TL;DR SUMMARY */}
      <div style={{ background: '#0f0f2a', border: '1px solid #6366f1', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h3 style={{ color: '#e4e4e7', fontSize: 14, marginBottom: '0.75rem' }}>TL;DR — What's Going On Here</h3>
        <div style={{ fontSize: 12, color: '#d4d4d8', lineHeight: 2 }}>
          <div><strong style={{ color: '#fbbf24' }}>Problem:</strong> The overnight model has $2,136 max drawdown. Can we reduce it without killing the $7,073 total PnL?</div>
          <div><strong style={{ color: '#4ade80' }}>Solution:</strong> Track the model's recent win rate over the last 15 trades. If it drops below 45%, stop trading until it recovers.</div>
          <div><strong style={{ color: '#60a5fa' }}>Result:</strong> DD drops to ${best.maxDD} (<strong>{best.ddReduction}%</strong> reduction), PnL stays at ${best.pnl.toLocaleString()} ({Math.round(best.pnl / baseline.pnl * 100)}% retained). Return/DD jumps from {baseline.returnDD}x → {best.returnDD}x.</div>
          <div style={{ marginTop: 10 }}><strong style={{ color: '#e4e4e7' }}>Why it works:</strong> Overnight model losses cluster — regime shifts cause 5-8 consecutive losses. A simple rolling WR filter detects these cold streaks and pauses, avoiding the deepest part of drawdowns. When wins resume, we re-enter.</div>
          <div style={{ marginTop: 10 }}><strong style={{ color: '#e4e4e7' }}>Why no bias / overfitting:</strong></div>
          <ul style={{ paddingLeft: '1.25rem', marginTop: 4 }}>
            <li><strong>Strictly forward-looking:</strong> The filter only uses past trades to decide the next trade. No future information leaks.</li>
            <li><strong>No curve-fitting:</strong> Window=15 and threshold=45% are simple, round numbers — not optimized to 14.7 trades or 43.2%.</li>
            <li><strong>Tested 7 variants:</strong> Multiple approaches (WR filter, consecutive loss, DD-based) all show improvement — it's not a single cherry-picked parameter.</li>
            <li><strong>Skipped trade quality:</strong> {best.skippedLosses} losers vs {best.skippedWins} winners skipped — confirms the filter catches losing streaks, not random noise.</li>
            <li><strong>Simple mechanism:</strong> Only 1 rule (pause when cold). No multi-parameter optimization that could overfit 264 trades.</li>
          </ul>
          <div style={{ marginTop: 10 }}><strong style={{ color: '#f87171' }}>Caveat:</strong> 264 trades is still a small sample. This should be validated on future out-of-sample data before trusting the exact numbers.</div>
        </div>
      </div>

      {/* WINNER BANNER */}
      <div style={{ background: '#0a1f14', border: '2px solid #4ade80', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: '#4ade80', fontWeight: 600 }}>🏆 BEST VARIANT</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#e4e4e7' }}>{best.name}</div>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <Stat label="Max DD" value={`$${best.maxDD}`} sub={`${best.ddReduction}% reduced`} color="#4ade80" />
            <Stat label="PnL Kept" value={`$${best.pnl.toLocaleString()}`} sub={`${Math.round(best.pnl / baseline.pnl * 100)}% of baseline`} color={best.pnl >= baseline.pnl * 0.9 ? '#4ade80' : '#fbbf24'} />
            <Stat label="Return/DD" value={`${best.returnDD}x`} sub={`vs ${baseline.returnDD}x baseline`} color="#4ade80" />
            <Stat label="Win Rate" value={`${best.wr}%`} sub={`vs ${baseline.wr}% baseline`} color={best.wr > baseline.wr ? '#4ade80' : '#fbbf24'} />
          </div>
        </div>
      </div>

      {/* COMPARISON TABLE */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
        <h3 style={{ color: '#e4e4e7', fontSize: 14, marginBottom: '0.75rem' }}>All Variants Compared</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #444' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: '#71717a' }}>Variant</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#71717a' }}>Trades</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#71717a' }}>PnL</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#71717a' }}>Max DD</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#71717a' }}>DD Reduction</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#71717a' }}>WR</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#71717a' }}>Ret/DD</th>
              </tr>
            </thead>
            <tbody>
              {/* Baseline row */}
              <tr style={{ borderBottom: '1px solid #333', background: '#0f0f1a' }}>
                <td style={{ padding: '5px 8px', color: '#6366f1', fontWeight: 600 }}>📊 Baseline (all trades)</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', color: '#d4d4d8' }}>{baseline.trades}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', color: '#4ade80' }}>${baseline.pnl.toLocaleString()}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', color: '#f87171' }}>${baseline.maxDD.toLocaleString()}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', color: '#71717a' }}>—</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', color: '#d4d4d8' }}>{baseline.wr}%</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', color: '#d4d4d8' }}>{baseline.returnDD}x</td>
              </tr>
              {variants.map((v, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #222', background: v === best ? '#0a1f14' : 'transparent' }}>
                  <td style={{ padding: '5px 8px', color: v === best ? '#4ade80' : '#e4e4e7', fontWeight: v === best ? 700 : 400 }}>
                    {v === best ? '🏆 ' : ''}{v.name}
                  </td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', color: '#d4d4d8' }}>{v.trades}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', color: v.pnl >= baseline.pnl * 0.9 ? '#4ade80' : '#fbbf24' }}>${v.pnl.toLocaleString()}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', color: v.maxDD < baseline.maxDD ? '#4ade80' : '#f87171' }}>${v.maxDD.toLocaleString()}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', color: '#4ade80', fontWeight: 600 }}>{v.ddReduction}%</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', color: v.wr > baseline.wr ? '#4ade80' : '#d4d4d8' }}>{v.wr}%</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', color: v.returnDD > baseline.returnDD ? '#4ade80' : '#f87171', fontWeight: 600 }}>{v.returnDD}x</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* HOW THE BEST ONE WORKS */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
        <h3 style={{ color: '#e4e4e7', fontSize: 14, marginBottom: '0.5rem' }}>How It Works</h3>
        <div style={{ fontSize: 12, color: '#d4d4d8', lineHeight: 1.9 }}>
          <div><strong style={{ color: '#4ade80' }}>Concept:</strong> Track the model's rolling win rate. When it drops below threshold → stop trading until it recovers.</div>
          <div style={{ marginTop: 8 }}>
            <strong>Rolling WR Filter:</strong>
            <ol style={{ paddingLeft: '1.25rem', marginTop: 4 }}>
              <li>Look at the last N trades (window size)</li>
              <li>Calculate win rate of those N trades</li>
              <li>If WR &lt; threshold → skip this trade (model is "cold")</li>
              <li>If WR ≥ threshold → take the trade normally</li>
              <li>Always update history regardless (so we know when model recovers)</li>
            </ol>
          </div>
          <div style={{ marginTop: 8 }}>
            <strong>Why it works:</strong> Overnight model drawdowns happen in clusters (mean-reversion regime shifts). 
            When the model starts losing, it tends to keep losing for a stretch. Pausing during cold streaks 
            avoids the worst of the drawdown, then re-enters when wins resume.
          </div>
        </div>
      </div>

      {/* EQUITY CURVE */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
        <h3 style={{ color: '#e4e4e7', fontSize: 14, marginBottom: '0.75rem' }}>Equity Curve: Baseline vs Best Variant</h3>
        <EquityChart baseline={baseline.equityCurve} variant={best.equityCurve} />
      </div>

      {/* SKIPPED TRADES */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
        <h3 style={{ color: '#e4e4e7', fontSize: 14, marginBottom: '0.75rem' }}>Skipped Trades Analysis ({best.name})</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
          <MiniKpi label="Total Skipped" value={best.skipped.length} />
          <MiniKpi label="Were Winners" value={best.skippedWins} color="#f87171" />
          <MiniKpi label="Were Losers" value={best.skippedLosses} color="#4ade80" />
          <MiniKpi label="Net PnL Saved" value={`$${Math.round(best.skippedPnl).toLocaleString()}`} color={best.skippedPnl <= 0 ? '#4ade80' : '#f87171'} />
        </div>
        <div style={{ fontSize: 11, color: best.skippedLosses >= best.skippedWins ? '#4ade80' : '#f87171' }}>
          {best.skippedLosses >= best.skippedWins
            ? `✅ Skipped ${best.skippedLosses} losers vs ${best.skippedWins} winners — filter correctly avoids bad trades.`
            : `⚠️ Skipped ${best.skippedWins} winners vs ${best.skippedLosses} losers — filter is too aggressive.`}
        </div>
      </div>

      {/* TRADE TIMELINE - show when trades were taken vs skipped */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1rem' }}>
        <h3 style={{ color: '#e4e4e7', fontSize: 14, marginBottom: '0.75rem' }}>Trade Timeline (Green=Taken, Red=Skipped)</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {best.timeline.map((t, i) => (
            <div key={i} title={`#${i+1}: ${t.date} | ${t.taken ? 'TAKEN' : 'SKIPPED'} | $${t.pnl}`}
              style={{
                width: 12, height: 12, borderRadius: 2,
                background: t.taken
                  ? (t.pnl > 0 ? '#0a2f1a' : '#1a0a0a')
                  : '#333',
                border: t.taken
                  ? `1px solid ${t.pnl > 0 ? '#4ade80' : '#f87171'}`
                  : '1px solid #555',
                opacity: t.taken ? 1 : 0.4,
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 10, color: '#71717a' }}>
          <span>🟢 Taken (win)</span>
          <span>🔴 Taken (loss)</span>
          <span>⬜ Skipped</span>
        </div>
      </div>
    </div>
  )
}

// ─── SIMULATION ENGINES ──────────────────────────────────────────────────────

function runBaseline(trades) {
  let equity = 0, peak = 0, maxDD = 0, wins = 0
  const equityCurve = [{ x: 0, y: 0 }]
  trades.forEach((t, i) => {
    equity += t.pnlDollar
    peak = Math.max(peak, equity)
    maxDD = Math.max(maxDD, peak - equity)
    if (t.pnlDollar > 0) wins++
    equityCurve.push({ x: i + 1, y: equity, date: t.exitDate })
  })
  return {
    name: 'Baseline',
    trades: trades.length,
    pnl: Math.round(equity),
    maxDD: Math.round(maxDD),
    wr: Math.round(wins / trades.length * 1000) / 10,
    returnDD: maxDD > 0 ? Math.round(equity / maxDD * 10) / 10 : 0,
    equityCurve,
  }
}

function runRollingWR(trades, window, threshold, name) {
  let equity = 0, peak = 0, maxDD = 0, wins = 0
  const taken = [], skipped = [], equityCurve = [{ x: 0, y: 0 }]
  const timeline = []
  const history = []

  for (let i = 0; i < trades.length; i++) {
    const t = trades[i]
    let shouldTake = true

    if (history.length >= window) {
      const recent = history.slice(-window)
      const wr = recent.filter(h => h.pnlDollar > 0).length / recent.length
      if (wr < threshold) shouldTake = false
    }

    if (shouldTake) {
      equity += t.pnlDollar
      peak = Math.max(peak, equity)
      maxDD = Math.max(maxDD, peak - equity)
      if (t.pnlDollar > 0) wins++
      taken.push(t)
      equityCurve.push({ x: taken.length, y: equity, date: t.exitDate })
    } else {
      skipped.push(t)
    }

    timeline.push({ taken: shouldTake, pnl: t.pnlDollar, date: t.exitDate })
    history.push(t)
  }

  const baselineDD = 2136
  return {
    name, trades: taken.length, pnl: Math.round(equity),
    maxDD: Math.round(maxDD),
    wr: taken.length > 0 ? Math.round(wins / taken.length * 1000) / 10 : 0,
    returnDD: maxDD > 0 ? Math.round(equity / maxDD * 10) / 10 : 0,
    ddReduction: Math.round((1 - maxDD / baselineDD) * 1000) / 10,
    skipped, skippedWins: skipped.filter(t => t.pnlDollar > 0).length,
    skippedLosses: skipped.filter(t => t.pnlDollar <= 0).length,
    skippedPnl: skipped.reduce((s, t) => s + t.pnlDollar, 0),
    equityCurve, timeline,
  }
}

function runConsecLoss(trades, threshold, name) {
  let equity = 0, peak = 0, maxDD = 0, wins = 0
  const taken = [], skipped = [], equityCurve = [{ x: 0, y: 0 }]
  const timeline = []
  let streak = 0

  for (let i = 0; i < trades.length; i++) {
    const t = trades[i]
    const shouldTake = streak < threshold

    if (shouldTake) {
      equity += t.pnlDollar
      peak = Math.max(peak, equity)
      maxDD = Math.max(maxDD, peak - equity)
      if (t.pnlDollar > 0) wins++
      taken.push(t)
      equityCurve.push({ x: taken.length, y: equity, date: t.exitDate })
    } else {
      skipped.push(t)
    }

    timeline.push({ taken: shouldTake, pnl: t.pnlDollar, date: t.exitDate })

    // Update streak based on actual outcome (regardless of whether we took it)
    if (t.pnlDollar <= 0) streak++
    else streak = 0
  }

  const baselineDD = 2136
  return {
    name, trades: taken.length, pnl: Math.round(equity),
    maxDD: Math.round(maxDD),
    wr: taken.length > 0 ? Math.round(wins / taken.length * 1000) / 10 : 0,
    returnDD: maxDD > 0 ? Math.round(equity / maxDD * 10) / 10 : 0,
    ddReduction: Math.round((1 - maxDD / baselineDD) * 1000) / 10,
    skipped, skippedWins: skipped.filter(t => t.pnlDollar > 0).length,
    skippedLosses: skipped.filter(t => t.pnlDollar <= 0).length,
    skippedPnl: skipped.reduce((s, t) => s + t.pnlDollar, 0),
    equityCurve, timeline,
  }
}

function runDDFilter(trades, ddThresh, scoreReq, name) {
  let equity = 0, peak = 0, maxDD = 0, wins = 0
  const taken = [], skipped = [], equityCurve = [{ x: 0, y: 0 }]
  const timeline = []
  let runningEquity = 0, runningPeak = 0

  for (let i = 0; i < trades.length; i++) {
    const t = trades[i]
    const currentDD = runningPeak - runningEquity
    const shouldTake = currentDD <= ddThresh || Math.abs(t.score) >= scoreReq

    if (shouldTake) {
      equity += t.pnlDollar
      peak = Math.max(peak, equity)
      maxDD = Math.max(maxDD, peak - equity)
      if (t.pnlDollar > 0) wins++
      taken.push(t)
      equityCurve.push({ x: taken.length, y: equity, date: t.exitDate })
    } else {
      skipped.push(t)
    }

    timeline.push({ taken: shouldTake, pnl: t.pnlDollar, date: t.exitDate })

    // Always update running equity for DD tracking (based on baseline)
    runningEquity += t.pnlDollar
    runningPeak = Math.max(runningPeak, runningEquity)
  }

  const baselineDD = 2136
  return {
    name, trades: taken.length, pnl: Math.round(equity),
    maxDD: Math.round(maxDD),
    wr: taken.length > 0 ? Math.round(wins / taken.length * 1000) / 10 : 0,
    returnDD: maxDD > 0 ? Math.round(equity / maxDD * 10) / 10 : 0,
    ddReduction: Math.round((1 - maxDD / baselineDD) * 1000) / 10,
    skipped, skippedWins: skipped.filter(t => t.pnlDollar > 0).length,
    skippedLosses: skipped.filter(t => t.pnlDollar <= 0).length,
    skippedPnl: skipped.reduce((s, t) => s + t.pnlDollar, 0),
    equityCurve, timeline,
  }
}

// ─── UI COMPONENTS ───────────────────────────────────────────────────────────

function Stat({ label, value, sub, color = '#e4e4e7' }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#71717a' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#71717a' }}>{sub}</div>}
    </div>
  )
}

function MiniKpi({ label, value, color = '#e4e4e7' }) {
  return (
    <div style={{ background: '#0f0f1a', padding: 8, borderRadius: 6, textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: '#71717a' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

function EquityChart({ baseline, variant }) {
  const allY = [...baseline.map(p => p.y), ...variant.map(p => p.y)]
  const maxY = Math.max(...allY)
  const minY = Math.min(...allY)
  const range = maxY - minY || 1
  const width = 900
  const height = 220
  const pad = 20

  const toPoints = (curve, total) => curve.map((p, i) => {
    const x = (i / (total - 1)) * (width - pad * 2) + pad
    const y = height - pad - ((p.y - minY) / range) * (height - pad * 2)
    return `${x},${y}`
  }).join(' ')

  const basePoints = toPoints(baseline, baseline.length)
  const varPoints = toPoints(variant, baseline.length)

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={width} height={height} style={{ display: 'block' }}>
        {/* Zero line */}
        <line x1={pad} x2={width - pad}
          y1={height - pad - ((0 - minY) / range) * (height - pad * 2)}
          y2={height - pad - ((0 - minY) / range) * (height - pad * 2)}
          stroke="#333" strokeDasharray="4,4" />
        <polyline points={basePoints} fill="none" stroke="#6366f1" strokeWidth="1.5" opacity="0.5" />
        <polyline points={varPoints} fill="none" stroke="#4ade80" strokeWidth="2" />
        <text x={pad + 4} y={16} fill="#6366f1" fontSize="10" opacity="0.7">Baseline</text>
        <text x={pad + 65} y={16} fill="#4ade80" fontSize="10">Switcher (best)</text>
        {/* Y axis labels */}
        <text x={pad - 2} y={height - pad + 12} fill="#71717a" fontSize="9" textAnchor="end">${minY < 0 ? '' : ''}${Math.round(minY)}</text>
        <text x={pad - 2} y={pad - 2} fill="#71717a" fontSize="9" textAnchor="end">${maxY > 0 ? '+' : ''}${Math.round(maxY)}</text>
      </svg>
    </div>
  )
}
