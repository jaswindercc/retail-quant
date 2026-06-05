import { useState, useEffect } from 'react'
import { fetchJson } from '../utils'

export default function SimBacktest5Page() {
  const [data, setData] = useState(null)
  const [showTrades, setShowTrades] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [showBacktest, setShowBacktest] = useState(false)
  const [capital, setCapital] = useState(40000)
  const [riskPct, setRiskPct] = useState(1)

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    fetchJson(`${base}sim_backtest5_data.json`).then(setData).catch(() => {})
  }, [])

  const trades = data?.trades || []
  const params = data?.params || {}
  const summary = data?.summary || {}

  // Get current watchlist (latest rotation)
  const rotationLog = summary.rotation_log || []
  const currentWatchlist = rotationLog.length > 0 ? rotationLog[rotationLog.length - 1] : null

  // Open positions (exitReason === 'Open')
  const openPositions = trades.filter(t => t.exitReason === 'Open')

  // Recent closed trades (reverse chrono, last 15)
  const recentTrades = [...trades].filter(t => t.exitReason !== 'Open').reverse().slice(0, 15)

  // Consecutive loss counter (for skip rule status)
  const closedTrades = trades.filter(t => t.exitReason !== 'Open')
  let consecutiveLossCount = 0
  for (let i = closedTrades.length - 1; i >= 0; i--) {
    if (closedTrades[i].pnlR < 0) consecutiveLossCount++
    else break
  }
  const skipActive = consecutiveLossCount >= 3

  // Stock breakdown for watchlist enrichment
  const stockBreakdown = summary.stock_breakdown || {}

  // Compounding + Skip after 3 consecutive losses
  function runStrategy(trades, startCapital, riskPctVal) {
    let currentCapital = startCapital, peakCapital = startCapital, maxDD = 0, maxDDPct = 0
    let consecutiveLosses = 0, skipNext = false
    const results = []
    const equityCurve = [{ capital: startCapital, date: trades[0]?.entryDate }]

    for (const t of trades) {
      const riskDollars = currentCapital * (riskPctVal / 100)
      const shares = Math.floor(riskDollars / t.risk)
      const positionSize = shares * t.entryPrice
      const positionPct = (positionSize / currentCapital) * 100
      const pnlScaled = shares > 0 ? t.pnlR * riskDollars : 0

      if (skipNext) {
        results.push({ ...t, status: 'skipped', shares, positionSize, positionPct, pnlScaled: 0, capitalAtEntry: currentCapital, riskDollars })
        skipNext = false
        consecutiveLosses = 0
        equityCurve.push({ capital: currentCapital, date: t.exitDate })
        continue
      }

      results.push({ ...t, status: 'taken', shares, positionSize, positionPct, pnlScaled, capitalAtEntry: currentCapital, riskDollars })
      if (shares > 0) currentCapital += pnlScaled
      if (currentCapital > peakCapital) peakCapital = currentCapital
      const dd = peakCapital - currentCapital
      if (dd > maxDD) maxDD = dd
      const ddPct = peakCapital > 0 ? (dd / peakCapital) * 100 : 0
      if (ddPct > maxDDPct) maxDDPct = ddPct

      if (t.pnlR < 0) { consecutiveLosses++; if (consecutiveLosses >= 3) skipNext = true }
      else { consecutiveLosses = 0 }

      equityCurve.push({ capital: currentCapital, date: t.exitDate })
    }

    const taken = results.filter(r => r.status === 'taken')
    const skipped = results.filter(r => r.status === 'skipped')
    const wins = taken.filter(r => r.pnlScaled > 0).length
    const totalPnl = currentCapital - startCapital
    const grossWin = taken.filter(r => r.pnlScaled > 0).reduce((s, r) => s + r.pnlScaled, 0)
    const grossLoss = Math.abs(taken.filter(r => r.pnlScaled < 0).reduce((s, r) => s + r.pnlScaled, 0))
    const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0
    let streak = 0, maxStreak = 0
    for (const r of taken) { if (r.pnlScaled < 0) { streak++; if (streak > maxStreak) maxStreak = streak } else { streak = 0 } }
    return { results, taken, skipped, equityCurve, finalCapital: currentCapital, totalPnl, wins, wr: taken.length > 0 ? (wins / taken.length * 100) : 0, pf, maxDD, maxDDPct, maxStreak }
  }

  const strat = trades.length > 0 ? runStrategy(trades, capital, riskPct) : null
  const ec = strat?.equityCurve || []
  const capitals = ec.map(e => e.capital)
  const maxCap = Math.max(...capitals, capital + 1)
  const minCap = Math.min(...capitals, capital)

  if (!data) return <div style={{ padding: '2rem', color: '#71717a' }}>Loading...</div>

  return (
    <div className="page-container" style={{ padding: '1.5rem', maxWidth: 1100 }}>
      <h1 style={{ marginBottom: '0.25rem' }}>🎯 BT5 Daily Scanner</h1>
      <p style={{ color: '#71717a', fontSize: 12, marginBottom: '1rem' }}>
        Mega-cap rotation · Top 10 by 6mo momentum · Breakout entry · Updated {data.lastUpdated}
      </p>

      {/* ═══ STATUS BAR ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <div style={{ background: '#0f2a1a', border: '1px solid #4ade80', borderRadius: 6, padding: '0.6rem', textAlign: 'center' }}>
          <div style={{ color: '#71717a', fontSize: 10 }}>Open Positions</div>
          <div style={{ color: '#4ade80', fontSize: 22, fontWeight: 800 }}>{openPositions.length}/{params.max_positions || 3}</div>
        </div>
        <div style={{ background: skipActive ? '#1f0a0a' : '#1e1e2e', border: `1px solid ${skipActive ? '#f87171' : '#333'}`, borderRadius: 6, padding: '0.6rem', textAlign: 'center' }}>
          <div style={{ color: '#71717a', fontSize: 10 }}>Skip Rule</div>
          <div style={{ color: skipActive ? '#f87171' : '#4ade80', fontSize: 14, fontWeight: 700 }}>{skipActive ? `⚠️ SKIP NEXT (${consecutiveLossCount}L)` : `✅ Active (${consecutiveLossCount}L)`}</div>
        </div>
        <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 6, padding: '0.6rem', textAlign: 'center' }}>
          <div style={{ color: '#71717a', fontSize: 10 }}>Watchlist Month</div>
          <div style={{ color: '#60a5fa', fontSize: 14, fontWeight: 700 }}>{currentWatchlist?.month || '—'}</div>
        </div>
        <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 6, padding: '0.6rem', textAlign: 'center' }}>
          <div style={{ color: '#71717a', fontSize: 10 }}>Slots Available</div>
          <div style={{ color: openPositions.length < (params.max_positions || 3) ? '#4ade80' : '#f87171', fontSize: 22, fontWeight: 800 }}>{(params.max_positions || 3) - openPositions.length}</div>
        </div>
      </div>

      {/* ═══ CURRENT WATCHLIST (TOP 10) ═══ */}
      {currentWatchlist && (
        <div style={{ background: '#0a1628', border: '1px solid #60a5fa', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 style={{ color: '#60a5fa', fontSize: 14, margin: 0 }}>📡 Current Watchlist — Top 10 by 6mo Momentum</h2>
            <span style={{ color: '#71717a', fontSize: 11 }}>Rebalanced: {currentWatchlist.month}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '0.5rem' }}>
            {currentWatchlist.watchlist.map((ticker, i) => {
              const inPosition = openPositions.some(p => p.stock === ticker)
              const stats = stockBreakdown[ticker]
              return (
                <div key={ticker} style={{
                  background: inPosition ? '#0f2a1a' : '#1e1e2e',
                  border: `1px solid ${inPosition ? '#4ade80' : '#333'}`,
                  borderRadius: 6, padding: '0.5rem', textAlign: 'center',
                  position: 'relative'
                }}>
                  <div style={{ color: '#71717a', fontSize: 9, position: 'absolute', top: 3, left: 6 }}>#{i + 1}</div>
                  {inPosition && <div style={{ color: '#4ade80', fontSize: 8, position: 'absolute', top: 3, right: 6 }}>OPEN</div>}
                  <div style={{ color: inPosition ? '#4ade80' : '#e4e4e7', fontSize: 14, fontWeight: 700, marginTop: 4 }}>{ticker}</div>
                  {stats && <div style={{ color: '#71717a', fontSize: 9, marginTop: 2 }}>{stats.wins}/{stats.trades} wins · ${stats.pnl > 0 ? '+' : ''}{Math.round(stats.pnl)}</div>}
                </div>
              )
            })}
          </div>
          <div style={{ color: '#71717a', fontSize: 10, marginTop: 8 }}>
            🔍 Scan these daily for: Close {'>'} 20d high + Vol ≥ 1.2× avg + Price {'>'} 50 SMA + SPY {'>'} 200 SMA
          </div>
        </div>
      )}

      {/* ═══ OPEN POSITIONS ═══ */}
      {openPositions.length > 0 && (
        <div style={{ background: '#0f2a1a', border: '1px solid #4ade80', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#4ade80', fontSize: 14, marginBottom: '0.75rem' }}>📈 Open Positions — Manage Daily</h2>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#71717a', borderBottom: '1px solid #333' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Stock</th>
                <th style={{ textAlign: 'right', padding: '4px 8px' }}>Entry</th>
                <th style={{ textAlign: 'right', padding: '4px 8px' }}>Stop</th>
                <th style={{ textAlign: 'right', padding: '4px 8px' }}>Qty</th>
                <th style={{ textAlign: 'right', padding: '4px 8px' }}>Current R</th>
                <th style={{ textAlign: 'right', padding: '4px 8px' }}>P/L</th>
                <th style={{ textAlign: 'center', padding: '4px 8px' }}>Trail</th>
                <th style={{ textAlign: 'right', padding: '4px 8px' }}>Days Held</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {openPositions.map((t, i) => {
                const trailActive = t.pnlR >= 2.5
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #1a2e1a' }}>
                    <td style={{ padding: '6px 8px', color: '#4ade80', fontWeight: 700 }}>{t.stock}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>${t.entryPrice.toFixed(2)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#f87171' }}>${t.sl.toFixed(2)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{t.qty}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: t.pnlR >= 2.5 ? '#4ade80' : t.pnlR >= 0 ? '#fbbf24' : '#f87171', fontWeight: 700 }}>
                      {t.pnlR > 0 ? '+' : ''}{t.pnlR.toFixed(1)}R
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: t.pnlDollar >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                      {t.pnlDollar >= 0 ? '+' : ''}${Math.round(t.pnlDollar).toLocaleString()}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      {trailActive ? '🟢 Active' : '⏳ < 2.5R'}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#71717a' }}>{t.durationDays}d</td>
                    <td style={{ padding: '6px 8px', fontSize: 11, color: '#a1a1aa' }}>
                      {trailActive ? 'Update trail: EMA20 − ATR ↑ only' : 'Hold. Check stop.'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ RECENT TRADES (reverse chrono) ═══ */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#a1a1aa', fontSize: 14, marginBottom: '0.75rem' }}>🕐 Recent Trades</h2>
        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: '#71717a', borderBottom: '1px solid #333' }}>
              <th style={{ textAlign: 'left', padding: '4px 6px' }}>Stock</th>
              <th style={{ textAlign: 'left', padding: '4px 6px' }}>Entry</th>
              <th style={{ textAlign: 'left', padding: '4px 6px' }}>Exit</th>
              <th style={{ textAlign: 'right', padding: '4px 6px' }}>R</th>
              <th style={{ textAlign: 'right', padding: '4px 6px' }}>P/L</th>
              <th style={{ textAlign: 'left', padding: '4px 6px' }}>Reason</th>
              <th style={{ textAlign: 'right', padding: '4px 6px' }}>Days</th>
            </tr>
          </thead>
          <tbody>
            {recentTrades.map((t, i) => {
              const win = t.pnlR > 0
              return (
                <tr key={i} style={{ borderBottom: '1px solid #1a1a2e', background: win ? '#0a1f14' : 'transparent' }}>
                  <td style={{ padding: '5px 6px', color: '#60a5fa', fontWeight: 600 }}>{t.stock}</td>
                  <td style={{ padding: '5px 6px', color: '#a1a1aa' }}>{t.entryDate}</td>
                  <td style={{ padding: '5px 6px', color: '#a1a1aa' }}>{t.exitDate}</td>
                  <td style={{ padding: '5px 6px', textAlign: 'right', color: win ? '#4ade80' : '#f87171', fontWeight: 700 }}>{t.pnlR > 0 ? '+' : ''}{t.pnlR.toFixed(1)}R</td>
                  <td style={{ padding: '5px 6px', textAlign: 'right', color: win ? '#4ade80' : '#f87171', fontWeight: 700 }}>${t.pnlDollar > 0 ? '+' : ''}{Math.round(t.pnlDollar)}</td>
                  <td style={{ padding: '5px 6px', color: '#71717a', fontSize: 10 }}>{t.exitReason}</td>
                  <td style={{ padding: '5px 6px', textAlign: 'right', color: '#71717a' }}>{t.durationDays}d</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ═══ DAILY CHECKLIST ═══ */}
      <div style={{ background: '#1e1e2e', border: '1px solid #6366f1', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#6366f1', fontSize: 14, marginBottom: '0.75rem' }}>📅 Daily Checklist</h2>
        <div style={{ fontSize: 12, color: '#d4d4d8', lineHeight: 2.2 }}>
          <div>☐ <strong>1.</strong> SPY {'>'} 200 SMA? → If NO, do nothing today.</div>
          <div>☐ <strong>2.</strong> Check open positions — any hit stop? Update trailing stops (EMA20 − ATR, ratchet UP only).</div>
          <div>☐ <strong>3.</strong> Scan top-10 watchlist above — any closing {'>'} 20d high with volume ≥ 1.2×?</div>
          <div>☐ <strong>4.</strong> If signal + under {params.max_positions || 3} positions{skipActive ? ' + ⚠️ SKIP RULE ACTIVE — skip this one' : ''} → Enter at close. Stop = entry − 1×ATR.</div>
          <div>☐ <strong>5.</strong> Log trade. Update loss counter (currently: {consecutiveLossCount} consecutive losses).</div>
        </div>
      </div>

      {/* ═══ UNIVERSE (all 30) ═══ */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h2 style={{ color: '#71717a', fontSize: 13, margin: 0 }}>🌐 Full Universe (30 stocks)</h2>
          <span style={{ color: '#52525b', fontSize: 10 }}>Top 10 highlighted = current watchlist</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {(params.pool || []).map(ticker => {
            const inWatchlist = currentWatchlist?.watchlist?.includes(ticker)
            const inPosition = openPositions.some(p => p.stock === ticker)
            return (
              <span key={ticker} style={{
                padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: inWatchlist ? 700 : 400,
                background: inPosition ? '#0f2a1a' : inWatchlist ? '#1a1a3e' : '#18181b',
                color: inPosition ? '#4ade80' : inWatchlist ? '#60a5fa' : '#52525b',
                border: `1px solid ${inPosition ? '#4ade80' : inWatchlist ? '#6366f1' : '#333'}`
              }}>{ticker}</span>
            )
          })}
        </div>
      </div>

      {/* ═══ COLLAPSIBLE: RULES & ROUTINES ═══ */}
      <div style={{ marginBottom: '1.5rem' }}>
        <button onClick={() => setShowRules(!showRules)}
          style={{ background: '#0f2a1a', border: '1px solid #4ade80', borderRadius: 6, padding: '8px 16px', color: '#4ade80', fontSize: 12, fontWeight: 600, cursor: 'pointer', width: '100%', textAlign: 'left' }}>
          {showRules ? '▼' : '▶'} Rules, Monthly Routine & What Not To Do
        </button>
        {showRules && (
          <div style={{ marginTop: '0.75rem' }}>
            {/* RULES OF THE GAME */}
            <div style={{ background: '#0f2a1a', border: '1px solid #4ade80', borderRadius: 8, padding: '1.25rem', marginBottom: '1rem' }}>
              <h2 style={{ color: '#4ade80', fontSize: 14, marginBottom: '0.75rem' }}>📋 Rules of the Game</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: 12, lineHeight: 1.9, color: '#d4d4d8' }}>
                <div>
                  <div><strong style={{ color: '#4ade80' }}>Universe:</strong> 30 mega/large-cap tech (all liquid by Jan 2020)</div>
                  <div><strong style={{ color: '#4ade80' }}>Watchlist:</strong> Top 10 by 6mo return (monthly rebalance on 1st)</div>
                  <div><strong style={{ color: '#4ade80' }}>Regime:</strong> SPY &gt; 200 SMA = ON. Below = 100% cash, no trades.</div>
                  <div><strong style={{ color: '#4ade80' }}>Entry:</strong> Close &gt; 20d high + volume ≥ 1.2× avg + price &gt; 50 SMA</div>
                  <div><strong style={{ color: '#4ade80' }}>Max positions:</strong> 3 at a time</div>
                </div>
                <div>
                  <div><strong style={{ color: '#4ade80' }}>Stop:</strong> 1×ATR(14) below entry. Never move stop down.</div>
                  <div><strong style={{ color: '#4ade80' }}>Risk:</strong> {riskPct}% of current capital per trade</div>
                  <div><strong style={{ color: '#4ade80' }}>Shares:</strong> floor(risk$ ÷ ATR)</div>
                  <div><strong style={{ color: '#4ade80' }}>Trail:</strong> Activate at 2.5R → EMA20 − 1×ATR (ratchets up only)</div>
                  <div><strong style={{ color: '#4ade80' }}>Skip rule:</strong> After 3 consecutive losses → skip 1 signal, then resume</div>
                </div>
              </div>
            </div>

            {/* MONTHLY ROUTINE */}
            <div style={{ background: '#1e1e2e', border: '1px solid #f59e0b', borderRadius: 8, padding: '1.25rem', marginBottom: '1rem' }}>
              <h2 style={{ color: '#f59e0b', fontSize: 14, marginBottom: '0.75rem' }}>📆 Monthly Routine (1st of each month)</h2>
              <div style={{ fontSize: 12, color: '#d4d4d8', lineHeight: 2 }}>
                <div>1. <strong>Rebalance watchlist:</strong> Rank all 30 stocks by 6-month return. New top 10 = your watchlist.</div>
                <div>2. <strong>Do NOT close open positions</strong> just because a stock left the top 10. Ride the trail.</div>
                <div>3. <strong>Review regime:</strong> If SPY crossed below 200 SMA mid-month, close all at next open. Go cash.</div>
                <div>4. <strong>Update capital:</strong> Your current capital is your new base for risk calculations.</div>
              </div>
            </div>

            {/* WHAT NOT TO DO */}
            <div style={{ background: '#1f0a0a', border: '1px solid #f87171', borderRadius: 8, padding: '1.25rem' }}>
              <h2 style={{ color: '#f87171', fontSize: 14, marginBottom: '0.75rem' }}>🚫 What NOT To Do</h2>
              <div style={{ fontSize: 12, color: '#d4d4d8', lineHeight: 2 }}>
                <div>• Do NOT trade when SPY is below 200 SMA. No exceptions.</div>
                <div>• Do NOT move your stop loss down. Ever.</div>
                <div>• Do NOT take more than 3 positions simultaneously.</div>
                <div>• Do NOT override the skip rule. If 3L says skip, you skip.</div>
                <div>• Do NOT average down or add to losers.</div>
                <div>• Do NOT increase risk % after a big win (stay mechanical).</div>
                <div>• Do NOT trade stocks outside the top-10 watchlist.</div>
                <div>• Do NOT chase entries if you missed the breakout day.</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ COLLAPSIBLE: BACKTEST STATS ═══ */}
      <div style={{ marginBottom: '1.5rem' }}>
        <button onClick={() => setShowBacktest(!showBacktest)}
          style={{ background: '#1e1e2e', border: '1px solid #6366f1', borderRadius: 6, padding: '8px 16px', color: '#6366f1', fontSize: 12, fontWeight: 600, cursor: 'pointer', width: '100%', textAlign: 'left' }}>
          {showBacktest ? '▼' : '▶'} Backtest Performance & Equity Curve ({params.period})
        </button>
        {showBacktest && (
          <div style={{ marginTop: '0.75rem' }}>
            {/* RISK CONFIGURATOR */}
            <div style={{ background: '#1e1e2e', border: '1px solid #6366f1', borderRadius: 8, padding: '1rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: 13, color: '#6366f1', fontWeight: 700, marginBottom: '0.75rem' }}>⚙️ Configure Your Risk</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', fontSize: 13 }}>
                <div>
                  <label style={{ color: '#71717a', fontSize: 11, display: 'block', marginBottom: 4 }}>Account Capital ($)</label>
                  <input type="number" value={capital} onChange={e => setCapital(Math.max(1000, +e.target.value || 40000))}
                    style={{ background: '#0f0f1a', border: '1px solid #444', borderRadius: 4, padding: '6px 10px', color: '#e4e4e7', width: '100%', fontSize: 14 }} />
                </div>
                <div>
                  <label style={{ color: '#71717a', fontSize: 11, display: 'block', marginBottom: 4 }}>Risk per Trade (%)</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[0.5, 1, 2, 3, 5].map(pct => (
                      <button key={pct} onClick={() => setRiskPct(pct)}
                        style={{ padding: '6px 12px', borderRadius: 4, border: riskPct === pct ? '2px solid #4ade80' : '1px solid #444', background: riskPct === pct ? '#0f2a1a' : '#0f0f1a', color: riskPct === pct ? '#4ade80' : '#e4e4e7', fontSize: 13, fontWeight: riskPct === pct ? 700 : 400, cursor: 'pointer' }}>
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ background: '#0f0f1a', border: '1px solid #444', borderRadius: 4, padding: '6px 12px', textAlign: 'center', width: '100%' }}>
                    <div style={{ color: '#71717a', fontSize: 10 }}>Risk/trade</div>
                    <div style={{ color: '#4ade80', fontSize: 20, fontWeight: 800 }}>${(capital * riskPct / 100).toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* SUMMARY STATS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
              <Stat label="Final Capital" value={`$${strat.finalCapital.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`+${(strat.totalPnl / capital * 100).toFixed(0)}%`} color="#4ade80" />
              <Stat label="Total P/L" value={`$${strat.totalPnl.toLocaleString(undefined, {maximumFractionDigits: 0})}`} color={strat.totalPnl >= 0 ? '#4ade80' : '#f87171'} />
              <Stat label="Profit Factor" value={strat.pf.toFixed(2)} color={strat.pf >= 1.5 ? '#4ade80' : '#fbbf24'} />
              <Stat label="Win Rate" value={`${strat.wr.toFixed(1)}%`} sub={`${strat.wins}/${strat.taken.length}`} color="#60a5fa" />
              <Stat label="Max DD" value={`$${strat.maxDD.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`${strat.maxDDPct.toFixed(1)}%`} color="#f87171" />
              <Stat label="Return/DD" value={(strat.totalPnl / strat.maxDD).toFixed(2)} color="#60a5fa" />
              <Stat label="Max Streak" value={strat.maxStreak} sub="losses" color={strat.maxStreak > 10 ? '#f87171' : '#fbbf24'} />
              <Stat label="Skipped" value={strat.skipped.length} sub="trades" color="#71717a" />
            </div>

            {/* EQUITY CURVE */}
            {ec.length > 1 && (
              <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1rem', marginBottom: '1rem' }}>
                <div style={{ fontSize: 11, color: '#71717a', marginBottom: 6 }}>Equity Curve (compounding + skip after 3L)</div>
                <svg width="100%" height="120" viewBox={`0 0 ${ec.length} 120`} preserveAspectRatio="none" style={{ display: 'block' }}>
                  <line x1="0" y1={((capital - minCap) / (maxCap - minCap)) * -120 + 120} x2={ec.length} y2={((capital - minCap) / (maxCap - minCap)) * -120 + 120} stroke="#333" strokeWidth="0.5" />
                  <polyline fill="none" stroke="#4ade80" strokeWidth="1.5"
                    points={ec.map((e, i) => `${i},${((e.capital - minCap) / (maxCap - minCap)) * -120 + 120}`).join(' ')} />
                </svg>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#71717a', marginTop: 4 }}>
                  <span>{ec[0]?.date}</span><span>{ec[ec.length - 1]?.date}</span>
                </div>
              </div>
            )}

            {/* ALL TRADES TABLE */}
            <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ color: '#71717a', fontSize: 12 }}>{strat.taken.length} taken + {strat.skipped.length} skipped = {strat.results.length} signals</span>
                <button onClick={() => setShowTrades(!showTrades)}
                  style={{ background: '#333', color: '#e4e4e7', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 11 }}>
                  {showTrades ? 'Hide' : 'Show All Trades'}
                </button>
              </div>
              {showTrades && (
                <div style={{ overflowX: 'auto', maxHeight: 400 }}>
                  <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', minWidth: 800 }}>
                    <thead>
                      <tr style={{ color: '#71717a', borderBottom: '1px solid #333', position: 'sticky', top: 0, background: '#1e1e2e' }}>
                        <th style={{ textAlign: 'left', padding: '4px 5px' }}>#</th>
                        <th style={{ textAlign: 'left', padding: '4px 5px' }}>Date</th>
                        <th style={{ textAlign: 'left', padding: '4px 5px' }}>Stock</th>
                        <th style={{ textAlign: 'right', padding: '4px 5px' }}>Entry</th>
                        <th style={{ textAlign: 'right', padding: '4px 5px' }}>SL</th>
                        <th style={{ textAlign: 'right', padding: '4px 5px' }}>Shares</th>
                        <th style={{ textAlign: 'right', padding: '4px 5px' }}>Capital</th>
                        <th style={{ textAlign: 'right', padding: '4px 5px' }}>Risk$</th>
                        <th style={{ textAlign: 'right', padding: '4px 5px' }}>R</th>
                        <th style={{ textAlign: 'right', padding: '4px 5px' }}>P/L</th>
                        <th style={{ textAlign: 'left', padding: '4px 5px' }}>Exit</th>
                        <th style={{ textAlign: 'right', padding: '4px 5px' }}>Days</th>
                        <th style={{ textAlign: 'center', padding: '4px 5px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {strat.results.map((t, i) => {
                        const skipped = t.status === 'skipped'
                        const win = t.pnlScaled > 0
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid #1a1a2e', background: skipped ? '#18181b' : win ? '#0a1f14' : 'transparent', opacity: skipped ? 0.5 : 1, textDecoration: skipped ? 'line-through' : 'none' }}>
                            <td style={{ padding: '4px 5px', color: '#71717a' }}>{i + 1}</td>
                            <td style={{ padding: '4px 5px', color: '#a1a1aa' }}>{t.entryDate}</td>
                            <td style={{ padding: '4px 5px', color: '#60a5fa', fontWeight: 600 }}>{t.stock}</td>
                            <td style={{ padding: '4px 5px', textAlign: 'right' }}>${t.entryPrice.toFixed(2)}</td>
                            <td style={{ padding: '4px 5px', textAlign: 'right', color: '#71717a' }}>${t.sl.toFixed(2)}</td>
                            <td style={{ padding: '4px 5px', textAlign: 'right' }}>{t.shares}</td>
                            <td style={{ padding: '4px 5px', textAlign: 'right', color: '#71717a' }}>${t.capitalAtEntry.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                            <td style={{ padding: '4px 5px', textAlign: 'right', color: '#6366f1' }}>${t.riskDollars.toFixed(0)}</td>
                            <td style={{ padding: '4px 5px', textAlign: 'right', color: skipped ? '#71717a' : win ? '#4ade80' : '#f87171', fontWeight: 700 }}>{t.pnlR > 0 ? '+' : ''}{t.pnlR.toFixed(1)}R</td>
                            <td style={{ padding: '4px 5px', textAlign: 'right', color: skipped ? '#71717a' : win ? '#4ade80' : '#f87171', fontWeight: 700 }}>{skipped ? '—' : `${t.pnlScaled > 0 ? '+' : ''}$${t.pnlScaled.toFixed(0)}`}</td>
                            <td style={{ padding: '4px 5px', color: '#71717a', fontSize: 10 }}>{t.exitReason}</td>
                            <td style={{ padding: '4px 5px', textAlign: 'right', color: '#71717a' }}>{t.durationDays}d</td>
                            <td style={{ padding: '4px 5px', textAlign: 'center', fontSize: 10 }}>{skipped ? '⏭️ SKIP' : win ? '✅' : '❌'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, sub, color }) {
  return (
    <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '0.75rem', textAlign: 'center' }}>
      <div style={{ color: '#71717a', fontSize: 10 }}>{label}</div>
      <div style={{ color, fontSize: 18, fontWeight: 800 }}>{value}</div>
      {sub && <div style={{ color: '#52525b', fontSize: 10 }}>{sub}</div>}
    </div>
  )
}
