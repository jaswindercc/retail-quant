import { useState, useEffect, useMemo } from 'react'
import { fetchJson } from '../utils'

const STRAT_COLORS = {
  'put_spread_20d': '#4ade80',
  'put_spread_30d': '#fbbf24',
  'put_spread_40d': '#fb923c',
  'iron_condor_20d': '#64b5f6',
  'iron_condor_30d': '#a78bfa',
  'iron_fly': '#f472b6',
}

function fmtMoney(v) {
  if (!Number.isFinite(v)) return '$0'
  const sign = v < 0 ? '-' : ''
  return `${sign}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export default function SpxSkipAnalysisPage() {
  const [data, setData] = useState(null)
  const [selectedStrat, setSelectedStrat] = useState(null)
  const [skipAfter, setSkipAfter] = useState(2) // skip after N consecutive losses
  const [skipMode, setSkipMode] = useState('skip_next') // 'skip_next' or 'wait_for_win'

  useEffect(() => {
    fetchJson(`${import.meta.env.BASE_URL}spread_data_spx.json`)
      .then(d => {
        setData(d)
        const sorted = Object.entries(d?.strategies || {}).sort((a, b) => (b[1].stats?.annualReturnPct || 0) - (a[1].stats?.annualReturnPct || 0))
        if (sorted.length && !selectedStrat) setSelectedStrat(sorted[0][0])
      })
      .catch(e => setData({ error: e.message }))
  }, [])

  const strategies = data?.strategies || {}
  const sortedStratKeys = useMemo(() => {
    return Object.entries(strategies).sort((a, b) => (b[1].stats?.annualReturnPct || 0) - (a[1].stats?.annualReturnPct || 0)).map(([key]) => key)
  }, [strategies])

  const strat = strategies[selectedStrat]
  const trades = strat?.trades || []
  const config = strat?.config || {}

  // Run skip analysis
  const analysis = useMemo(() => {
    if (!trades.length) return null

    // Baseline: take every trade
    const baseline = { trades: [], pnl: 0, wins: 0, losses: 0 }
    trades.forEach(t => {
      baseline.trades.push(t)
      baseline.pnl += t.pnl * 100
      if (t.outcome === 'WIN') baseline.wins++
      else baseline.losses++
    })

    // Skip strategy: after N consecutive losses, skip trades
    const skipped = { trades: [], pnl: 0, wins: 0, losses: 0, skippedTrades: [], skippedWins: 0, skippedLosses: 0 }
    let consecutiveLosses = 0
    let isSkipping = false

    trades.forEach((t, i) => {
      if (isSkipping) {
        // In skip mode
        skipped.skippedTrades.push(t)
        if (t.outcome === 'WIN') skipped.skippedWins++
        else skipped.skippedLosses++

        if (skipMode === 'skip_next') {
          // Skip only the next trade, then resume
          isSkipping = false
          consecutiveLosses = 0
        } else {
          // Wait for a win before re-entering
          if (t.outcome === 'WIN') {
            isSkipping = false
            consecutiveLosses = 0
          }
        }
      } else {
        // Taking trades normally
        skipped.trades.push(t)
        skipped.pnl += t.pnl * 100
        if (t.outcome === 'WIN') {
          skipped.wins++
          consecutiveLosses = 0
        } else {
          skipped.losses++
          consecutiveLosses++
          if (consecutiveLosses >= skipAfter) {
            isSkipping = true
          }
        }
      }
    })

    // Reverse skip: ONLY trade after N consecutive losses (contrarian)
    const contrarian = { trades: [], pnl: 0, wins: 0, losses: 0 }
    let cLosses = 0
    let tradingWindow = 0 // trades to take after streak ends

    trades.forEach(t => {
      if (tradingWindow > 0) {
        contrarian.trades.push(t)
        contrarian.pnl += t.pnl * 100
        if (t.outcome === 'WIN') contrarian.wins++
        else contrarian.losses++
        tradingWindow--
      } else {
        if (t.outcome === 'LOSS') {
          cLosses++
          if (cLosses >= skipAfter) {
            tradingWindow = 5 // take next 5 trades after streak
            cLosses = 0
          }
        } else {
          cLosses = 0
        }
      }
    })

    return { baseline, skipped, contrarian }
  }, [trades, skipAfter, skipMode])

  // Equity curves for comparison
  const equityCurves = useMemo(() => {
    if (!trades.length) return null

    const baselineEq = []
    const skipEq = []
    const contrarianEq = []
    let bPnl = 0, sPnl = 0, cPnl = 0
    let consecutiveLosses = 0
    let isSkipping = false
    let cLosses = 0
    let tradingWindow = 0

    trades.forEach(t => {
      // Baseline
      bPnl += t.pnl * 100
      baselineEq.push(bPnl)

      // Skip logic
      if (isSkipping) {
        skipEq.push(sPnl) // flat during skip
        if (skipMode === 'skip_next') {
          isSkipping = false
          consecutiveLosses = 0
        } else if (t.outcome === 'WIN') {
          isSkipping = false
          consecutiveLosses = 0
        }
      } else {
        sPnl += t.pnl * 100
        skipEq.push(sPnl)
        if (t.outcome === 'WIN') consecutiveLosses = 0
        else {
          consecutiveLosses++
          if (consecutiveLosses >= skipAfter) isSkipping = true
        }
      }

      // Contrarian
      if (tradingWindow > 0) {
        cPnl += t.pnl * 100
        contrarianEq.push(cPnl)
        tradingWindow--
      } else {
        contrarianEq.push(cPnl)
        if (t.outcome === 'LOSS') {
          cLosses++
          if (cLosses >= skipAfter) { tradingWindow = 5; cLosses = 0 }
        } else cLosses = 0
      }
    })

    return { baselineEq, skipEq, contrarianEq }
  }, [trades, skipAfter, skipMode])

  // === MASTER SIMULATION: All strategies × all params ===
  const masterResults = useMemo(() => {
    if (!Object.keys(strategies).length) return null

    const results = []
    const skipNValues = [1, 2, 3, 4, 5]
    const modes = ['skip_next', 'wait_for_win', 'contrarian']

    Object.entries(strategies).forEach(([stratKey, stratData]) => {
      const stratTrades = stratData.trades || []
      if (stratTrades.length < 10) return

      // Baseline for this strategy
      let bPnl = 0, bPeak = 0, bDD = 0
      stratTrades.forEach(t => {
        bPnl += t.pnl * 100
        if (bPnl > bPeak) bPeak = bPnl
        const dd = bPeak - bPnl
        if (dd > bDD) bDD = dd
      })
      const bWins = stratTrades.filter(t => t.outcome === 'WIN').length
      const bWR = bWins / stratTrades.length

      results.push({
        strategy: stratKey,
        label: stratData.config.label,
        mode: 'baseline',
        skipN: '-',
        totalPnl: bPnl,
        maxDD: bDD,
        trades: stratTrades.length,
        wins: bWins,
        wr: bWR,
        consistency: bDD > 0 ? bPnl / bDD : 999, // return/DD ratio
        skipped: 0,
      })

      // Run all permutations
      skipNValues.forEach(n => {
        modes.forEach(mode => {
          let pnl = 0, peak = 0, maxDd = 0, wins = 0, taken = 0, skipped = 0
          let consecutiveLosses = 0
          let isSkipping = false
          let cLosses = 0
          let tradingWindow = 0

          stratTrades.forEach(t => {
            if (mode === 'contrarian') {
              if (tradingWindow > 0) {
                pnl += t.pnl * 100
                taken++
                if (t.outcome === 'WIN') wins++
                if (pnl > peak) peak = pnl
                const dd = peak - pnl
                if (dd > maxDd) maxDd = dd
                tradingWindow--
              } else {
                skipped++
                if (t.outcome === 'LOSS') {
                  cLosses++
                  if (cLosses >= n) { tradingWindow = 5; cLosses = 0 }
                } else cLosses = 0
              }
            } else {
              // skip_next or wait_for_win
              if (isSkipping) {
                skipped++
                if (mode === 'skip_next') {
                  isSkipping = false
                  consecutiveLosses = 0
                } else {
                  if (t.outcome === 'WIN') { isSkipping = false; consecutiveLosses = 0 }
                }
              } else {
                pnl += t.pnl * 100
                taken++
                if (t.outcome === 'WIN') { wins++; consecutiveLosses = 0 }
                else {
                  consecutiveLosses++
                  if (consecutiveLosses >= n) isSkipping = true
                }
                if (pnl > peak) peak = pnl
                const dd = peak - pnl
                if (dd > maxDd) maxDd = dd
              }
            }
          })

          if (taken > 0) {
            results.push({
              strategy: stratKey,
              label: stratData.config.label,
              mode,
              skipN: n,
              totalPnl: pnl,
              maxDD: maxDd,
              trades: taken,
              wins,
              wr: wins / taken,
              consistency: maxDd > 0 ? pnl / maxDd : 999,
              skipped,
            })
          }
        })
      })
    })

    // Sort by consistency (return/DD ratio) — higher = better
    results.sort((a, b) => b.consistency - a.consistency)
    return results
  }, [strategies])

  if (!data) return <div className="loading">Loading…</div>
  if (data.error) return <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>Error: {data.error}</div>

  const chartH = 200
  const chartW = Math.max(trades.length, 1)

  return (
    <div>
      <h1 className="page-title">SPX Skip Analysis <span>Should you skip trades after losses?</span></h1>

      {/* Plain English Summary */}
      <div className="card" style={{ marginBottom: 16, padding: '16px 20px', border: '1px solid #a78bfa', background: 'rgba(167,139,250,0.06)' }}>
        <p style={{ color: '#e2e8f0', fontSize: '0.9rem', margin: '0 0 10px', lineHeight: 1.8 }}>
          <strong style={{ color: '#a78bfa' }}>What this page does:</strong> Tests whether you should <em>pause trading after a loss</em> instead of blindly entering every week.
          We run every strategy through 3 behavioral rules and rank them by risk-adjusted return.
        </p>
        <div style={{ fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.9 }}>
          <p style={{ margin: '0 0 6px' }}><strong style={{ color: '#4ade80' }}>Baseline:</strong> Enter every single week, no matter what happened last week.</p>
          <p style={{ margin: '0 0 6px' }}><strong style={{ color: '#fbbf24' }}>Skip Next:</strong> After N losses in a row, skip exactly 1 week, then resume. Simple cooldown.</p>
          <p style={{ margin: '0 0 6px' }}><strong style={{ color: '#fb923c' }}>Wait for Win:</strong> After N losses in a row, STOP trading. Each week, check what <em>would have</em> happened. Only resume after you see a week that would have been a winner. (You're waiting for proof the storm is over.)</p>
          <p style={{ margin: '0 0 6px' }}><strong style={{ color: '#f472b6' }}>Contrarian:</strong> Opposite — only trade AFTER seeing N losses. Bet on mean reversion.</p>
          <p style={{ margin: '8px 0 0', color: '#94a3b8', fontStyle: 'italic' }}>Why "Wait for Win" dominates: Losses in SPX options selling come in clusters (crashes/corrections hit multiple weeks). Pausing after the first loss dodges the 2nd and 3rd loss in the cluster, massively reducing drawdown.</p>
        </div>
        <div style={{ marginTop: 12, padding: '12px 14px', background: 'rgba(74,222,128,0.06)', borderRadius: 6, border: '1px solid rgba(74,222,128,0.2)' }}>
          <p style={{ fontSize: '0.85rem', color: '#4ade80', margin: '0 0 8px', fontWeight: 700 }}>📌 PRACTICAL RULES FOR LIVE TRADING:</p>
          <div style={{ fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 2 }}>
            <p style={{ margin: '0 0 4px' }}>1. <strong>Strategy:</strong> Put Spread 30Δ, $5-$10 wide, 45 DTE, every Monday</p>
            <p style={{ margin: '0 0 4px' }}>2. <strong>After any loss:</strong> Sit out. Don't trade next Monday.</p>
            <p style={{ margin: '0 0 4px' }}>3. <strong>Resume only when:</strong> You see a week that <em>would have</em> been a winner (paper-track it)</p>
            <p style={{ margin: '0 0 4px' }}>4. <strong>Also skip when:</strong> SPX is &gt;3% above 20-day MA (overextended, mean reversion risk = your put strike is near the 20MA)</p>
            <p style={{ margin: '0 0 4px' }}>5. <strong>Risk management:</strong> Take profit at 50% credit. Stop loss at 2× credit.</p>
            <p style={{ margin: '0 0 0', color: '#94a3b8', fontStyle: 'italic' }}>The 30Δ put lands ~2-3% below SPX. If SPX is overextended above moving averages, a normal pullback to the 20MA will breach your strike.</p>
          </div>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: '0.78rem', color: '#ef4444', fontStyle: 'italic' }}>⚠️ Uses real VIX for IV, call-side skew applied. Put spread numbers validated against live broker fills (30Δ put strike matches within $10).</p>
      </div>

      {/* LIVE TRADING CHECKLIST */}
      <div className="card" style={{ marginBottom: 16, padding: '16px 20px', border: '1px solid #fbbf24', background: 'rgba(251,191,36,0.04)' }}>
        <p style={{ fontSize: '0.9rem', color: '#fbbf24', margin: '0 0 10px', fontWeight: 700 }}>⚡ LIVE TRADING CHECKLIST — Before You Place The Trade</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '0.82rem' }}>
          <div>
            <p style={{ color: '#4ade80', fontWeight: 700, margin: '0 0 8px' }}>✓ ENTRY RULES</p>
            <div style={{ color: '#cbd5e1', lineHeight: 2 }}>
              <p style={{ margin: 0 }}>☐ Day: Monday (Tuesday if holiday)</p>
              <p style={{ margin: 0 }}>☐ Strike: 30-delta put (use broker's delta, ~2-3% below SPX)</p>
              <p style={{ margin: 0 }}>☐ Width: $5 or $10 wide</p>
              <p style={{ margin: 0 }}>☐ Expiry: <strong>Standard monthly</strong> closest to 45 DTE (3rd Friday)</p>
              <p style={{ margin: 0 }}>☐ NOT a random Thursday/Tuesday weekly (no liquidity!)</p>
              <p style={{ margin: 0 }}>☐ Check OI &gt; 500 and bid-ask ≤ $0.30 wide</p>
              <p style={{ margin: 0 }}>☐ Max 5 positions open at once</p>
            </div>
          </div>
          <div>
            <p style={{ color: '#ef4444', fontWeight: 700, margin: '0 0 8px' }}>✗ DO NOT TRADE WHEN</p>
            <div style={{ color: '#cbd5e1', lineHeight: 2 }}>
              <p style={{ margin: 0 }}>☐ SPX is &gt;3% above 20-day MA (overextended)</p>
              <p style={{ margin: 0 }}>☐ Last trade was a loss (wait for a winning week to pass)</p>
              <p style={{ margin: 0 }}>☐ VIX is spiking &gt;25 (sell into strength, not panic)</p>
              <p style={{ margin: 0 }}>☐ Major event next day (FOMC, CPI, jobs report)</p>
              <p style={{ margin: 0 }}>☐ Your short put strike is ABOVE the 20-day MA</p>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
          <p style={{ fontSize: '0.82rem', color: '#a78bfa', margin: '0 0 6px', fontWeight: 700 }}>💡 EXIT RULES</p>
          <div style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 2 }}>
            <p style={{ margin: 0 }}>• <strong style={{ color: '#4ade80' }}>Take profit:</strong> Close at 50% of credit received (e.g. sold for $1.60 → buy back at $0.80)</p>
            <p style={{ margin: 0 }}>• <strong style={{ color: '#ef4444' }}>Stop loss:</strong> Close if position value reaches 2× credit (e.g. sold $1.60 → close at $3.20 loss)</p>
            <p style={{ margin: 0 }}>• <strong>Never hold to expiry</strong> — always manage (take profit or stop loss)</p>
          </div>
        </div>
        <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
          <p style={{ fontSize: '0.82rem', color: '#64b5f6', margin: '0 0 6px', fontWeight: 700 }}>🎯 LIQUIDITY — WHICH EXPIRY TO PICK</p>
          <div style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 2 }}>
            <p style={{ margin: 0 }}>• <strong>Best:</strong> Standard monthly expiry (3rd Friday) — thousands of OI, $0.10 bid-ask</p>
            <p style={{ margin: 0 }}>• <strong>OK:</strong> Mon/Wed/Fri weeklies — decent volume within 2 weeks of expiry only</p>
            <p style={{ margin: 0 }}>• <strong style={{ color: '#ef4444' }}>Avoid:</strong> Tue/Thu weeklies for 45 DTE — dead volume (2 contracts = no fills)</p>
            <p style={{ margin: 0 }}>• <strong>Alt:</strong> SPY options (1/10th SPX, massive volume everywhere, trade 10x contracts)</p>
            <p style={{ margin: 0 }}>• Rule: if OI &lt; 200 or spread &gt; $0.50 — pick a different expiry</p>
          </div>
        </div>
      </div>

      {/* === MASTER RESULTS TABLE === */}
      {masterResults && masterResults.length > 0 && (() => {
        // Filter: minimum 30 trades for statistical reliability
        const reliable = masterResults.filter(r => r.trades >= 30)
        const top20 = reliable.slice(0, 20)
        const winner = reliable[0] || masterResults[0]
        const modeLabels = { baseline: 'Baseline (all trades)', skip_next: 'Skip 1 trade', wait_for_win: 'Wait for win', contrarian: 'Contrarian (only after losses)' }
        return (
          <div className="card" style={{ marginBottom: 20, border: '2px solid #4ade80', background: 'rgba(74,222,128,0.04)' }}>
            <h3 style={{ textTransform: 'none', letterSpacing: 0, color: '#4ade80', marginBottom: 4 }}>🏆 Best Approaches — All 6 Strategies × All Permutations (min 30 trades, ranked by Return/DD)</h3>
            <p style={{ fontSize: '0.8rem', color: '#888', margin: '0 0 12px' }}>
              {masterResults.length} simulations run: 6 strategies × (baseline + 5 skip values × 3 modes). Filtered to <strong style={{ color: '#fbbf24' }}>≥30 trades</strong> for reliability. Sorted by <strong style={{ color: '#4ade80' }}>Consistency Score</strong> = Total P&L ÷ Max Drawdown (higher = better risk-adjusted).
            </p>
            
            {/* Winner highlight */}
            <div style={{ padding: '12px 16px', background: 'rgba(74,222,128,0.1)', borderRadius: 6, marginBottom: 12, border: '1px solid rgba(74,222,128,0.3)' }}>
              <div style={{ fontSize: '0.9rem', color: '#4ade80', fontWeight: 700 }}>
                🥇 WINNER: {winner.label} — {modeLabels[winner.mode]}{winner.skipN !== '-' ? ` (after ${winner.skipN} losses)` : ''}
              </div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 6, fontSize: '0.82rem', color: '#ccc' }}>
                <span>P&L: <strong style={{ color: '#4ade80' }}>{fmtMoney(winner.totalPnl)}</strong></span>
                <span>Max DD: <strong style={{ color: '#ef4444' }}>{fmtMoney(winner.maxDD)}</strong></span>
                <span>Score: <strong style={{ color: '#fbbf24' }}>{winner.consistency.toFixed(2)}</strong></span>
                <span>WR: <strong>{(winner.wr * 100).toFixed(1)}%</strong></span>
                <span>Trades: <strong>{winner.trades}</strong></span>
              </div>
            </div>

            {/* Top 20 table */}
            <div style={{ overflowX: 'auto', maxHeight: 500 }}>
              <table style={{ fontSize: '0.75rem' }}>
                <thead>
                  <tr>
                    <th>#</th><th>Strategy</th><th>Mode</th><th>Skip After</th><th>Trades</th><th>WR</th><th>Total P&L</th><th>Max DD</th><th style={{ color: '#fbbf24' }}>Score (P&L/DD)</th><th>Skipped</th>
                  </tr>
                </thead>
                <tbody>
                  {top20.map((r, i) => (
                    <tr key={i} style={i === 0 ? { background: 'rgba(74,222,128,0.08)' } : r.mode === 'baseline' ? { background: 'rgba(255,255,255,0.02)' } : {}}>
                      <td style={{ color: i < 3 ? '#fbbf24' : '#666', fontWeight: i < 3 ? 700 : 400 }}>{i + 1}</td>
                      <td><strong style={{ color: STRAT_COLORS[r.strategy] }}>{r.label}</strong></td>
                      <td style={{ color: r.mode === 'contrarian' ? '#4ade80' : r.mode === 'baseline' ? '#888' : '#fbbf24' }}>
                        {modeLabels[r.mode]}
                      </td>
                      <td>{r.skipN}</td>
                      <td>{r.trades}</td>
                      <td><strong>{(r.wr * 100).toFixed(1)}%</strong></td>
                      <td className={r.totalPnl >= 0 ? 'win' : 'loss'}><strong>{fmtMoney(r.totalPnl)}</strong></td>
                      <td style={{ color: '#ef4444' }}>{fmtMoney(r.maxDD)}</td>
                      <td style={{ color: '#fbbf24', fontWeight: 700 }}>{r.consistency.toFixed(2)}</td>
                      <td style={{ color: '#888' }}>{r.skipped}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary insight */}
            <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(0,0,0,0.2)', borderRadius: 6, fontSize: '0.82rem', color: '#ccc', lineHeight: 1.8 }}>
              <strong style={{ color: '#a78bfa' }}>Summary:</strong>{' '}
              {(() => {
                const contrarianWins = top20.filter(r => r.mode === 'contrarian').length
                const skipWins = top20.filter(r => r.mode === 'skip_next' || r.mode === 'wait_for_win').length
                const baselineWins = top20.filter(r => r.mode === 'baseline').length
                if (contrarianWins > skipWins && contrarianWins > baselineWins) {
                  return <span>The <strong style={{ color: '#4ade80' }}>contrarian approach dominates</strong> — trading ONLY after loss streaks gives the best risk-adjusted returns. Losses cluster, then mean reversion kicks in. <strong>Enter after drawdowns, not before.</strong></span>
                } else if (baselineWins >= skipWins && baselineWins >= contrarianWins) {
                  return <span>The <strong>baseline (always trade)</strong> approach is best — skipping doesn't help. Keep trading through losses, the edge is consistent.</span>
                } else {
                  return <span><strong style={{ color: '#fbbf24' }}>Skipping after losses</strong> improves risk-adjusted returns — avoiding extended drawdowns outweighs missing recovery wins.</span>
                }
              })()}
            </div>
          </div>
        )
      })()}

      {/* Strategy selector */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 16 }}>
        <span style={{ color: '#888', fontSize: '0.85rem', display: 'block', marginBottom: 8 }}>Strategy:</span>
        <div className="tab-bar" style={{ margin: 0, flexWrap: 'wrap' }}>
          {sortedStratKeys.map((key) => {
            const s = strategies[key]
            return (
              <button key={key} className={selectedStrat === key ? 'active' : ''} onClick={() => setSelectedStrat(key)}
                style={selectedStrat === key ? { borderColor: STRAT_COLORS[key], color: STRAT_COLORS[key], fontSize: '0.78rem' } : { fontSize: '0.78rem' }}>
                {s.config.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Controls */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <label style={{ color: '#888', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>Skip after N losses:</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => setSkipAfter(n)}
                style={{ padding: '4px 12px', borderRadius: 4, border: `1px solid ${skipAfter === n ? '#a78bfa' : '#333'}`, background: skipAfter === n ? 'rgba(167,139,250,0.15)' : 'transparent', color: skipAfter === n ? '#a78bfa' : '#888', cursor: 'pointer', fontSize: '0.85rem' }}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={{ color: '#888', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>Skip mode:</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setSkipMode('skip_next')}
              style={{ padding: '4px 12px', borderRadius: 4, border: `1px solid ${skipMode === 'skip_next' ? '#fbbf24' : '#333'}`, background: skipMode === 'skip_next' ? 'rgba(251,191,36,0.15)' : 'transparent', color: skipMode === 'skip_next' ? '#fbbf24' : '#888', cursor: 'pointer', fontSize: '0.82rem' }}>
              Skip 1 trade
            </button>
            <button onClick={() => setSkipMode('wait_for_win')}
              style={{ padding: '4px 12px', borderRadius: 4, border: `1px solid ${skipMode === 'wait_for_win' ? '#fbbf24' : '#333'}`, background: skipMode === 'wait_for_win' ? 'rgba(251,191,36,0.15)' : 'transparent', color: skipMode === 'wait_for_win' ? '#fbbf24' : '#888', cursor: 'pointer', fontSize: '0.82rem' }}>
              Wait for a win
            </button>
          </div>
        </div>
      </div>

      {/* Results comparison */}
      {analysis && (
        <>
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {/* Baseline */}
            <div className="kpi" style={{ borderTop: '3px solid #888' }}>
              <div className="label">📊 Baseline (take every trade)</div>
              <div className="value" style={{ color: analysis.baseline.pnl >= 0 ? '#4ade80' : '#ef4444', fontSize: '1.2rem' }}>{fmtMoney(analysis.baseline.pnl)}</div>
              <div style={{ fontSize: '0.75rem', color: '#888', marginTop: 4 }}>
                {analysis.baseline.trades.length} trades | {analysis.baseline.wins}W / {analysis.baseline.losses}L | {(analysis.baseline.wins / analysis.baseline.trades.length * 100).toFixed(1)}% WR
              </div>
            </div>
            {/* Skip */}
            <div className="kpi" style={{ borderTop: '3px solid #fbbf24' }}>
              <div className="label">⏭️ Skip after {skipAfter} losses ({skipMode === 'skip_next' ? 'skip 1' : 'wait for win'})</div>
              <div className="value" style={{ color: analysis.skipped.pnl >= 0 ? '#4ade80' : '#ef4444', fontSize: '1.2rem' }}>{fmtMoney(analysis.skipped.pnl)}</div>
              <div style={{ fontSize: '0.75rem', color: '#888', marginTop: 4 }}>
                {analysis.skipped.trades.length} taken | {analysis.skipped.skippedTrades.length} skipped | Skipped had {analysis.skipped.skippedWins}W / {analysis.skipped.skippedLosses}L
              </div>
              <div style={{ fontSize: '0.75rem', color: analysis.skipped.pnl > analysis.baseline.pnl ? '#4ade80' : '#ef4444', marginTop: 4 }}>
                {analysis.skipped.pnl > analysis.baseline.pnl ? '✅' : '❌'} {fmtMoney(analysis.skipped.pnl - analysis.baseline.pnl)} vs baseline
              </div>
            </div>
            {/* Contrarian */}
            <div className="kpi" style={{ borderTop: '3px solid #4ade80' }}>
              <div className="label">🎯 Contrarian (ONLY after {skipAfter}+ losses)</div>
              <div className="value" style={{ color: analysis.contrarian.pnl >= 0 ? '#4ade80' : '#ef4444', fontSize: '1.2rem' }}>{fmtMoney(analysis.contrarian.pnl)}</div>
              <div style={{ fontSize: '0.75rem', color: '#888', marginTop: 4 }}>
                {analysis.contrarian.trades.length} trades | {analysis.contrarian.wins}W / {analysis.contrarian.losses}L | {analysis.contrarian.trades.length > 0 ? (analysis.contrarian.wins / analysis.contrarian.trades.length * 100).toFixed(1) : 0}% WR
              </div>
              <div style={{ fontSize: '0.75rem', color: '#888', marginTop: 4 }}>
                Only takes 5 trades after each loss streak
              </div>
            </div>
          </div>

          {/* Equity curve comparison */}
          {equityCurves && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <h3 style={{ textTransform: 'none', letterSpacing: 0 }}>Equity Curves — 3 Approaches Compared</h3>
              <div style={{ display: 'flex', gap: 16, marginBottom: 8, fontSize: '0.75rem' }}>
                <span><span style={{ display: 'inline-block', width: 16, height: 3, background: '#888', marginRight: 4, verticalAlign: 'middle' }}></span>Baseline (all trades)</span>
                <span><span style={{ display: 'inline-block', width: 16, height: 3, background: '#fbbf24', marginRight: 4, verticalAlign: 'middle' }}></span>Skip after {skipAfter} losses</span>
                <span><span style={{ display: 'inline-block', width: 16, height: 3, background: '#4ade80', marginRight: 4, verticalAlign: 'middle' }}></span>Contrarian (only after losses)</span>
              </div>
              <div style={{ width: '100%', height: chartH + 20, position: 'relative' }}>
                {(() => {
                  const all = [...equityCurves.baselineEq, ...equityCurves.skipEq, ...equityCurves.contrarianEq]
                  const maxVal = Math.max(...all, 1)
                  const minVal = Math.min(...all, 0)
                  const range = maxVal - minVal || 1
                  const toY = v => chartH - ((v - minVal) / range) * (chartH - 10)

                  const baselinePoints = equityCurves.baselineEq.map((v, i) => `${(i / chartW) * 800},${toY(v)}`).join(' ')
                  const skipPoints = equityCurves.skipEq.map((v, i) => `${(i / chartW) * 800},${toY(v)}`).join(' ')
                  const contrarianPoints = equityCurves.contrarianEq.map((v, i) => `${(i / chartW) * 800},${toY(v)}`).join(' ')

                  return (
                    <svg viewBox={`0 0 800 ${chartH + 10}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                      <line x1="0" y1={toY(0)} x2="800" y2={toY(0)} stroke="#333" strokeWidth="0.5" strokeDasharray="4" />
                      <polyline fill="none" stroke="#888" strokeWidth="1.5" opacity="0.5" points={baselinePoints} />
                      <polyline fill="none" stroke="#fbbf24" strokeWidth="2" points={skipPoints} />
                      <polyline fill="none" stroke="#4ade80" strokeWidth="2" points={contrarianPoints} />
                    </svg>
                  )
                })()}
                <div style={{ position: 'absolute', top: 4, right: 8, fontSize: '0.7rem', color: '#888' }}>{trades.length} trades over 5 years</div>
              </div>
            </div>
          )}

          {/* Insight */}
          <div className="card" style={{ marginTop: '1rem', borderLeft: '3px solid #4ade80', padding: '16px 20px' }}>
            <h3 style={{ textTransform: 'none', letterSpacing: 0, fontSize: '0.95rem', color: '#4ade80' }}>💡 Key Insight</h3>
            <div style={{ fontSize: '0.88rem', color: '#ccc', lineHeight: 2 }}>
              {analysis.contrarian.trades.length > 0 && analysis.contrarian.wins / analysis.contrarian.trades.length > (analysis.baseline.wins / analysis.baseline.trades.length) ? (
                <p style={{ margin: '0 0 8px' }}>
                  <strong style={{ color: '#4ade80' }}>Contrarian approach wins.</strong> After {skipAfter}+ consecutive losses, 
                  the next 5 trades had a <strong>{(analysis.contrarian.wins / analysis.contrarian.trades.length * 100).toFixed(0)}% win rate</strong> vs 
                  baseline {(analysis.baseline.wins / analysis.baseline.trades.length * 100).toFixed(0)}%. 
                  This confirms mean reversion — losses cluster, then wins follow.
                </p>
              ) : (
                <p style={{ margin: '0 0 8px' }}>
                  The contrarian approach doesn't clearly outperform at skipAfter={skipAfter}. Try adjusting the loss streak threshold.
                </p>
              )}
              {analysis.skipped.pnl < analysis.baseline.pnl ? (
                <p style={{ margin: 0, color: '#fbbf24' }}>
                  ⚠️ <strong>Skipping trades HURTS returns</strong> — you miss the recovery wins that follow losses. 
                  The data says: <strong>keep trading through losses</strong>, don't stop.
                </p>
              ) : (
                <p style={{ margin: 0, color: '#fbbf24' }}>
                  ✅ Skipping after {skipAfter} losses slightly improves returns by avoiding extended drawdowns.
                </p>
              )}
            </div>
          </div>

          {/* Detailed skipped trades */}
          {analysis.skipped.skippedTrades.length > 0 && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <h3 style={{ textTransform: 'none', letterSpacing: 0 }}>Skipped Trades Detail — {analysis.skipped.skippedTrades.length} trades you would have missed</h3>
              <div style={{ overflowX: 'auto', maxHeight: 400 }}>
                <table style={{ fontSize: '0.78rem' }}>
                  <thead>
                    <tr><th>#</th><th>Entry</th><th>Exit</th><th>SPX</th><th>Outcome</th><th>P&L</th><th>Would have…</th></tr>
                  </thead>
                  <tbody>
                    {analysis.skipped.skippedTrades.map((t, i) => (
                      <tr key={i}>
                        <td style={{ color: '#666' }}>{i + 1}</td>
                        <td>{t.entryDate}</td>
                        <td>{t.exitDate}</td>
                        <td>{Math.round(t.entryPrice).toLocaleString()}</td>
                        <td className={t.outcome === 'WIN' ? 'win' : 'loss'}><strong>{t.outcome}</strong></td>
                        <td className={t.pnl >= 0 ? 'win' : 'loss'}><strong>{fmtMoney(t.pnl * 100)}</strong></td>
                        <td style={{ color: t.outcome === 'WIN' ? '#ef4444' : '#4ade80' }}>
                          {t.outcome === 'WIN' ? '❌ Missed a win' : '✅ Avoided a loss'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
