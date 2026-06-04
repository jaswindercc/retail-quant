import { useState, useEffect } from 'react'

const TABS = [
  { key: 'mega', label: '🏛️ Mega-Cap', file: 'rotation_mega_data.json', color: '#4ade80' },
  { key: 'large', label: '📊 Large-Cap', file: 'rotation_large_data.json', color: '#60a5fa' },
  { key: 'mid', label: '🚀 Mid-Cap', file: 'rotation_mid_data.json', color: '#f59e0b' },
]

export default function RotationPage() {
  const [activeTab, setActiveTab] = useState('mega')
  const [dataMap, setDataMap] = useState({})
  const [liveData, setLiveData] = useState(null)
  const [showTrades, setShowTrades] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [showBacktest, setShowBacktest] = useState(false)
  const [showRotation, setShowRotation] = useState(false)
  const [capital, setCapital] = useState(40000)
  const [riskPct, setRiskPct] = useState(1)

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    TABS.forEach(tab => {
      fetch(`${base}${tab.file}`).then(r => r.ok ? r.json() : null).then(d => {
        if (d) setDataMap(prev => ({ ...prev, [tab.key]: d }))
      }).catch(() => {})
    })
    // Load live scanner data
    fetch(`${base}rotation_live_data.json`).then(r => r.ok ? r.json() : null).then(setLiveData).catch(() => {})
  }, [])

  const data = dataMap[activeTab]
  const tabConfig = TABS.find(t => t.key === activeTab)
  const accentColor = tabConfig?.color || '#4ade80'

  if (!data) return <div style={{ padding: '2rem', color: '#71717a' }}>Loading {tabConfig?.label}...</div>

  const trades = data.trades || []
  const params = data.params || {}
  const summary = data.summary || {}

  // Live watchlist from dynamic scanner
  const liveUniverse = liveData?.universes?.[activeTab]
  const liveTop10 = liveUniverse?.top_10 || []
  const liveAllRanked = liveUniverse?.all_ranked || []

  // Backtest rotation log (weekly evidence)
  const rotationLog = summary.rotation_log || []
  const currentWatchlist = rotationLog.length > 0 ? rotationLog[rotationLog.length - 1] : null

  // Open positions
  const openPositions = trades.filter(t => t.exitReason === 'Open')

  // Recent closed trades (reverse chrono, last 15)
  const recentTrades = [...trades].filter(t => t.exitReason !== 'Open').reverse().slice(0, 15)

  // Consecutive loss counter
  const closedTrades = trades.filter(t => t.exitReason !== 'Open')
  let consecutiveLossCount = 0
  for (let i = closedTrades.length - 1; i >= 0; i--) {
    if (closedTrades[i].pnlR < 0) consecutiveLossCount++
    else break
  }
  const skipActive = consecutiveLossCount >= 3

  // Stock breakdown
  const stockBreakdown = summary.stock_breakdown || {}

  // ── Backtest computation (compounding + skip after 3L) ──
  function runStrategy(trades, startCapital, riskPctVal) {
    const closedOnly = trades.filter(t => t.exitReason !== 'Open')
    let currentCapital = startCapital, peakCapital = startCapital, maxDD = 0, maxDDPct = 0
    let consecutiveLosses = 0, skipNext = false
    const results = []
    const equityCurve = [{ capital: startCapital, date: closedOnly[0]?.entryDate }]

    for (const t of closedOnly) {
      const riskDollars = currentCapital * (riskPctVal / 100)
      const shares = Math.floor(riskDollars / t.risk)
      const pnlScaled = shares > 0 ? t.pnlR * riskDollars : 0

      if (skipNext) {
        results.push({ ...t, status: 'skipped', shares, pnlScaled: 0, capitalAtEntry: currentCapital, riskDollars })
        skipNext = false
        consecutiveLosses = 0
        equityCurve.push({ capital: currentCapital, date: t.exitDate })
        continue
      }

      results.push({ ...t, status: 'taken', shares, pnlScaled, capitalAtEntry: currentCapital, riskDollars })
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

  const strat = closedTrades.length > 0 ? runStrategy(trades, capital, riskPct) : null
  const ec = strat?.equityCurve || []
  const capitals = ec.map(e => e.capital)
  const maxCap = Math.max(...capitals, capital + 1)
  const minCap = Math.min(...capitals, capital)

  return (
    <div className="page-container" style={{ padding: '1.5rem', maxWidth: 1100 }}>
      {/* ═══ TABS ═══ */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '10px 20px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer',
              border: activeTab === tab.key ? `2px solid ${tab.color}` : '2px solid #333',
              background: activeTab === tab.key ? `${tab.color}15` : '#1e1e2e',
              color: activeTab === tab.key ? tab.color : '#71717a',
            }}>
            {tab.label}
            {dataMap[tab.key] && <span style={{ fontSize: 10, marginLeft: 6, opacity: 0.7 }}>
              ${Math.round(dataMap[tab.key].summary?.total_pnl || 0).toLocaleString()}
            </span>}
          </button>
        ))}
      </div>

      <h1 style={{ marginBottom: '0.25rem' }}>🎯 {data.label} — Weekly Rotation Scanner</h1>
      <p style={{ color: '#71717a', fontSize: 12, marginBottom: '1rem' }}>
        Dynamic universe by market cap · Top {params.top_n} by 6mo momentum · Weekly rebalance (Monday) · Backtest: {params.period}
      </p>

      {/* ═══ STATUS BAR ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <div style={{ background: '#0f2a1a', border: `1px solid ${accentColor}`, borderRadius: 6, padding: '0.6rem', textAlign: 'center' }}>
          <div style={{ color: '#71717a', fontSize: 10 }}>Open Positions</div>
          <div style={{ color: accentColor, fontSize: 22, fontWeight: 800 }}>{openPositions.length}/{params.max_positions || 3}</div>
        </div>
        <div style={{ background: skipActive ? '#1f0a0a' : '#1e1e2e', border: `1px solid ${skipActive ? '#f87171' : '#333'}`, borderRadius: 6, padding: '0.6rem', textAlign: 'center' }}>
          <div style={{ color: '#71717a', fontSize: 10 }}>Skip Rule</div>
          <div style={{ color: skipActive ? '#f87171' : '#4ade80', fontSize: 14, fontWeight: 700 }}>{skipActive ? `⚠️ SKIP NEXT (${consecutiveLossCount}L)` : `✅ Active (${consecutiveLossCount}L)`}</div>
        </div>
        <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 6, padding: '0.6rem', textAlign: 'center' }}>
          <div style={{ color: '#71717a', fontSize: 10 }}>Last Rotation</div>
          <div style={{ color: '#60a5fa', fontSize: 14, fontWeight: 700 }}>{currentWatchlist?.week || '—'}</div>
        </div>
        <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 6, padding: '0.6rem', textAlign: 'center' }}>
          <div style={{ color: '#71717a', fontSize: 10 }}>Slots Available</div>
          <div style={{ color: openPositions.length < (params.max_positions || 3) ? '#4ade80' : '#f87171', fontSize: 22, fontWeight: 800 }}>{(params.max_positions || 3) - openPositions.length}</div>
        </div>
      </div>

      {/* ═══ LIVE WATCHLIST (from dynamic scanner) ═══ */}
      {liveTop10.length > 0 && (
        <div style={{ background: '#0a1628', border: `2px solid ${accentColor}`, borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 style={{ color: accentColor, fontSize: 14, margin: 0 }}>📡 LIVE Watchlist — Top 10 by 6mo Momentum (Dynamic Market Cap)</h2>
            <span style={{ color: '#71717a', fontSize: 11 }}>Updated: {liveData?.lastUpdated} · {liveUniverse?.total_stocks} stocks in universe</span>
          </div>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginBottom: 8 }}>
            <thead>
              <tr style={{ color: '#71717a', borderBottom: '1px solid #333' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>#</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Ticker</th>
                <th style={{ textAlign: 'right', padding: '4px 8px' }}>6mo Return</th>
                <th style={{ textAlign: 'right', padding: '4px 8px' }}>Price</th>
                <th style={{ textAlign: 'right', padding: '4px 8px' }}>6mo Ago</th>
                <th style={{ textAlign: 'right', padding: '4px 8px' }}>Mkt Cap</th>
              </tr>
            </thead>
            <tbody>
              {liveTop10.map((stock, i) => (
                <tr key={stock.ticker} style={{ borderBottom: '1px solid #1a1a2e', background: i < 3 ? '#0f2a1a' : 'transparent' }}>
                  <td style={{ padding: '6px 8px', color: '#71717a', fontWeight: 700 }}>{i + 1}</td>
                  <td style={{ padding: '6px 8px', color: accentColor, fontWeight: 700, fontSize: 14 }}>{stock.ticker}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#4ade80', fontWeight: 700 }}>+{stock.return_6m.toFixed(1)}%</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>${stock.price.toFixed(2)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#71717a' }}>${stock.price_6m_ago.toFixed(2)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#71717a' }}>${(stock.market_cap_B).toFixed(0)}B</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ color: '#71717a', fontSize: 10 }}>
            🔍 Scan these daily for: Close {'>'} 20d high + Vol ≥ 1.2× avg + Price {'>'} 50 SMA + SPY {'>'} 200 SMA
          </div>
        </div>
      )}

      {/* ═══ BACKTEST WATCHLIST (fallback if no live data) ═══ */}
      {!liveTop10.length && currentWatchlist && (
        <div style={{ background: '#0a1628', border: `1px solid ${accentColor}`, borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 style={{ color: accentColor, fontSize: 14, margin: 0 }}>📡 Watchlist (from backtest) — Top 10 by 6mo Momentum</h2>
            <span style={{ color: '#71717a', fontSize: 11 }}>Week of: {currentWatchlist.week}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '0.5rem' }}>
            {currentWatchlist.watchlist.map((ticker, i) => {
              const stats = stockBreakdown[ticker]
              return (
                <div key={ticker} style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 6, padding: '0.5rem', textAlign: 'center', position: 'relative' }}>
                  <div style={{ color: '#71717a', fontSize: 9, position: 'absolute', top: 3, left: 6 }}>#{i + 1}</div>
                  <div style={{ color: '#e4e4e7', fontSize: 14, fontWeight: 700, marginTop: 4 }}>{ticker}</div>
                  {stats && <div style={{ color: '#71717a', fontSize: 9, marginTop: 2 }}>{stats.wins}/{stats.trades} wins</div>}
                </div>
              )
            })}
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
                <th style={{ textAlign: 'right', padding: '4px 8px' }}>Days</th>
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

      {/* ═══ RECENT TRADES ═══ */}
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
                  <td style={{ padding: '5px 6px', textAlign: 'right', color: win ? '#4ade80' : '#f87171', fontWeight: 700 }}>{t.pnlDollar >= 0 ? '+' : ''}${Math.round(t.pnlDollar).toLocaleString()}</td>
                  <td style={{ padding: '5px 6px', color: '#71717a', fontSize: 10 }}>{t.exitReason}</td>
                  <td style={{ padding: '5px 6px', textAlign: 'right', color: '#71717a' }}>{t.durationDays}d</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ═══ DAILY CHECKLIST ═══ */}
      <div style={{ background: '#1e1e2e', border: `1px solid ${accentColor}`, borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: accentColor, fontSize: 14, marginBottom: '0.75rem' }}>📅 Daily Checklist</h2>
        <div style={{ fontSize: 12, color: '#d4d4d8', lineHeight: 2.2 }}>
          <div>☐ <strong>1.</strong> SPY {'>'} 200 SMA? → If NO, do nothing today.</div>
          <div>☐ <strong>2.</strong> Check open positions — any hit stop? Update trailing stops (EMA20 − ATR, ratchet UP only).</div>
          <div>☐ <strong>3.</strong> Scan top-10 watchlist above — any closing {'>'} 20d high with volume ≥ 1.2×?</div>
          <div>☐ <strong>4.</strong> If signal + under {params.max_positions || 3} positions{skipActive ? ' + ⚠️ SKIP RULE ACTIVE — skip this one' : ''} → Enter at close. Stop = entry − 1×ATR.</div>
          <div>☐ <strong>5.</strong> Log trade. Update loss counter (currently: {consecutiveLossCount} consecutive losses).</div>
          <div style={{ color: '#f59e0b', marginTop: 4 }}>☐ <strong>Monday:</strong> Rebalance watchlist — rank all {params.pool?.length} stocks by 6-month return, new top 10.</div>
        </div>
      </div>

      {/* ═══ ROTATION HISTORY (last 25 weeks) ═══ */}
      {rotationLog.length > 0 && (
        <div style={{ background: '#1e1e2e', border: '1px solid #f59e0b', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#f59e0b', fontSize: 14, marginBottom: '0.75rem' }}>📅 Weekly Rotation History (last 25 weeks)</h2>
          <div style={{ fontSize: 10, color: '#71717a', marginBottom: 8 }}>Evidence of weekly rebalance — {rotationLog.length} total rotations since Jan 2021</div>
          <div style={{ overflowX: 'auto', maxHeight: 400 }}>
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: '#71717a', borderBottom: '1px solid #333', position: 'sticky', top: 0, background: '#1e1e2e' }}>
                  <th style={{ textAlign: 'left', padding: '4px 8px', whiteSpace: 'nowrap' }}>Week</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px' }}>Top 10 Watchlist (ranked by 6mo momentum)</th>
                </tr>
              </thead>
              <tbody>
                {[...rotationLog].reverse().slice(0, 25).map((r, i) => {
                  const isLatest = i === 0
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #1a1a2e', background: isLatest ? `${accentColor}10` : 'transparent' }}>
                      <td style={{ padding: '5px 8px', color: isLatest ? accentColor : '#a1a1aa', fontWeight: isLatest ? 700 : 400, whiteSpace: 'nowrap' }}>{r.week}{isLatest ? ' ← current' : ''}</td>
                      <td style={{ padding: '5px 8px' }}>
                        {r.watchlist.map((ticker, j) => (
                          <span key={ticker} style={{ display: 'inline-block', padding: '1px 5px', borderRadius: 3, marginRight: 4, marginBottom: 2, fontSize: 10, background: j < 3 ? '#0f2a1a' : '#18181b', color: j < 3 ? '#4ade80' : '#a1a1aa', border: `1px solid ${j < 3 ? '#4ade8040' : '#333'}` }}>
                            {j + 1}. {ticker}
                          </span>
                        ))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ color: '#52525b', fontSize: 10, marginTop: 8 }}>Top 3 each week highlighted green — these get the strongest momentum signals</div>
        </div>
      )}

      {/* ═══ FULL UNIVERSE (dynamic, ranked) ═══ */}
      {liveAllRanked.length > 0 ? (
        <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h2 style={{ color: '#71717a', fontSize: 13, margin: 0 }}>🌐 Full Universe — {liveUniverse?.total_stocks} stocks by current market cap</h2>
            <span style={{ color: '#52525b', fontSize: 10 }}>Top 10 = watchlist · Ranked by 6mo return</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {liveAllRanked.map((stock, i) => (
              <span key={stock.ticker} style={{
                padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: i < 10 ? 700 : 400,
                background: i < 10 ? '#1a1a3e' : '#18181b',
                color: i < 10 ? accentColor : '#52525b',
                border: `1px solid ${i < 10 ? accentColor + '60' : '#333'}`
              }}>{i < 10 ? `${i+1}.` : ''} {stock.ticker} {i < 20 ? `(${stock.return_6m > 0 ? '+' : ''}${stock.return_6m.toFixed(0)}%)` : ''}</span>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h2 style={{ color: '#71717a', fontSize: 13, margin: 0 }}>🌐 Backtest Universe ({params.pool?.length} stocks)</h2>
            <span style={{ color: '#52525b', fontSize: 10 }}>Run scan_rotation_live.py for dynamic universe</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {(params.pool || []).map(ticker => {
              const inWatchlist = currentWatchlist?.watchlist?.includes(ticker)
              return (
                <span key={ticker} style={{
                  padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: inWatchlist ? 700 : 400,
                  background: inWatchlist ? '#1a1a3e' : '#18181b',
                  color: inWatchlist ? '#60a5fa' : '#52525b',
                  border: `1px solid ${inWatchlist ? '#6366f1' : '#333'}`
                }}>{ticker}</span>
              )
            })}
          </div>
        </div>
      )}

      {/* ═══ COLLAPSIBLE: RULES ═══ */}
      <div style={{ marginBottom: '1.5rem' }}>
        <button onClick={() => setShowRules(!showRules)}
          style={{ background: '#0f2a1a', border: `1px solid ${accentColor}`, borderRadius: 6, padding: '8px 16px', color: accentColor, fontSize: 12, fontWeight: 600, cursor: 'pointer', width: '100%', textAlign: 'left' }}>
          {showRules ? '▼' : '▶'} Rules, Weekly Routine & What Not To Do
        </button>
        {showRules && (
          <div style={{ marginTop: '0.75rem' }}>
            <div style={{ background: '#0f2a1a', border: `1px solid ${accentColor}`, borderRadius: 8, padding: '1.25rem', marginBottom: '1rem' }}>
              <h2 style={{ color: accentColor, fontSize: 14, marginBottom: '0.75rem' }}>📋 Rules of the Game</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: 12, lineHeight: 1.9, color: '#d4d4d8' }}>
                <div>
                  <div><strong style={{ color: accentColor }}>Universe:</strong> {params.pool?.length} stocks ({data.label})</div>
                  <div><strong style={{ color: accentColor }}>Watchlist:</strong> Top 10 by 6mo return (weekly rebalance on Monday)</div>
                  <div><strong style={{ color: accentColor }}>Regime:</strong> SPY &gt; 200 SMA = ON. Below = 100% cash, close all.</div>
                  <div><strong style={{ color: accentColor }}>Entry:</strong> Close &gt; 20d high + volume ≥ 1.2× avg + price &gt; 50 SMA</div>
                  <div><strong style={{ color: accentColor }}>Max positions:</strong> 3 at a time</div>
                </div>
                <div>
                  <div><strong style={{ color: accentColor }}>Stop:</strong> 1×ATR(14) below entry. Never move stop down.</div>
                  <div><strong style={{ color: accentColor }}>Risk:</strong> {riskPct}% of capital per trade (${(capital * riskPct / 100).toFixed(0)})</div>
                  <div><strong style={{ color: accentColor }}>Shares:</strong> floor(risk$ ÷ ATR)</div>
                  <div><strong style={{ color: accentColor }}>Trail:</strong> Activate at 2.5R → EMA20 − 1×ATR (ratchets up only)</div>
                  <div><strong style={{ color: accentColor }}>Skip rule:</strong> After 3 consecutive losses → skip 1 signal, then resume</div>
                </div>
              </div>
            </div>

            <div style={{ background: '#1e1e2e', border: '1px solid #f59e0b', borderRadius: 8, padding: '1.25rem', marginBottom: '1rem' }}>
              <h2 style={{ color: '#f59e0b', fontSize: 14, marginBottom: '0.75rem' }}>📆 Weekly Routine (Every Monday)</h2>
              <div style={{ fontSize: 12, color: '#d4d4d8', lineHeight: 2 }}>
                <div>1. <strong>Rebalance watchlist:</strong> Rank all {params.pool?.length} stocks by 6-month return. New top 10 = your watchlist for the week.</div>
                <div>2. <strong>Do NOT close open positions</strong> just because a stock left the top 10. Ride the trail.</div>
                <div>3. <strong>Review regime:</strong> If SPY crossed below 200 SMA, close all at next open. Go cash.</div>
                <div>4. <strong>New entries only from current top 10.</strong> Existing positions stay regardless.</div>
              </div>
            </div>

            <div style={{ background: '#1f0a0a', border: '1px solid #f87171', borderRadius: 8, padding: '1.25rem' }}>
              <h2 style={{ color: '#f87171', fontSize: 14, marginBottom: '0.75rem' }}>🚫 What NOT To Do</h2>
              <div style={{ fontSize: 12, color: '#d4d4d8', lineHeight: 2 }}>
                <div>• Do NOT trade when SPY is below 200 SMA. No exceptions.</div>
                <div>• Do NOT move your stop loss down. Ever.</div>
                <div>• Do NOT take more than 3 positions simultaneously.</div>
                <div>• Do NOT override the skip rule. If 3L says skip, you skip.</div>
                <div>• Do NOT average down or add to losers.</div>
                <div>• Do NOT trade stocks outside the current top-10 watchlist.</div>
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
          {showBacktest ? '▼' : '▶'} Backtest Performance ({params.period})
        </button>
        {showBacktest && strat && (
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
                  <polyline fill="none" stroke={accentColor} strokeWidth="1.5"
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
                  <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', minWidth: 700 }}>
                    <thead>
                      <tr style={{ color: '#71717a', borderBottom: '1px solid #333', position: 'sticky', top: 0, background: '#1e1e2e' }}>
                        <th style={{ textAlign: 'left', padding: '4px 5px' }}>#</th>
                        <th style={{ textAlign: 'left', padding: '4px 5px' }}>Date</th>
                        <th style={{ textAlign: 'left', padding: '4px 5px' }}>Stock</th>
                        <th style={{ textAlign: 'right', padding: '4px 5px' }}>Entry</th>
                        <th style={{ textAlign: 'right', padding: '4px 5px' }}>R</th>
                        <th style={{ textAlign: 'right', padding: '4px 5px' }}>P/L</th>
                        <th style={{ textAlign: 'left', padding: '4px 5px' }}>Exit</th>
                        <th style={{ textAlign: 'right', padding: '4px 5px' }}>Days</th>
                        <th style={{ textAlign: 'center', padding: '4px 5px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...strat.results].reverse().map((t, i) => {
                        const skipped = t.status === 'skipped'
                        const win = t.pnlScaled > 0
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid #1a1a2e', background: skipped ? '#18181b' : win ? '#0a1f14' : 'transparent', opacity: skipped ? 0.5 : 1 }}>
                            <td style={{ padding: '4px 5px', color: '#71717a' }}>{i + 1}</td>
                            <td style={{ padding: '4px 5px', color: '#a1a1aa' }}>{t.entryDate}</td>
                            <td style={{ padding: '4px 5px', color: '#60a5fa', fontWeight: 600 }}>{t.stock}</td>
                            <td style={{ padding: '4px 5px', textAlign: 'right' }}>${t.entryPrice.toFixed(2)}</td>
                            <td style={{ padding: '4px 5px', textAlign: 'right', color: skipped ? '#71717a' : win ? '#4ade80' : '#f87171', fontWeight: 700 }}>{t.pnlR > 0 ? '+' : ''}{t.pnlR.toFixed(1)}R</td>
                            <td style={{ padding: '4px 5px', textAlign: 'right', color: skipped ? '#71717a' : win ? '#4ade80' : '#f87171', fontWeight: 700 }}>{skipped ? '—' : `${t.pnlScaled > 0 ? '+' : ''}$${Math.round(t.pnlScaled).toLocaleString()}`}</td>
                            <td style={{ padding: '4px 5px', color: '#71717a', fontSize: 10 }}>{t.exitReason}</td>
                            <td style={{ padding: '4px 5px', textAlign: 'right', color: '#71717a' }}>{t.durationDays}d</td>
                            <td style={{ padding: '4px 5px', textAlign: 'center', fontSize: 10 }}>{skipped ? '⏭️' : win ? '✅' : '❌'}</td>
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

      {/* ═══ COMPARISON (when all loaded) ═══ */}
      {Object.keys(dataMap).length === 3 && (
        <div style={{ background: '#1e1e2e', border: '1px solid #6366f1', borderRadius: 8, padding: '1rem' }}>
          <h2 style={{ color: '#6366f1', fontSize: 14, marginBottom: '0.75rem' }}>📊 Universe Comparison</h2>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#71717a', borderBottom: '1px solid #333' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Universe</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Total P/L</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>PF</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Win Rate</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Max DD</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Trades</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Ret/DD</th>
              </tr>
            </thead>
            <tbody>
              {TABS.map(tab => {
                const d = dataMap[tab.key]
                if (!d) return null
                const s = d.summary
                const retDD = s.max_drawdown > 0 ? (s.total_pnl / s.max_drawdown).toFixed(1) : '—'
                return (
                  <tr key={tab.key} style={{ borderBottom: '1px solid #1a1a2e', background: tab.key === activeTab ? `${tab.color}10` : 'transparent' }}>
                    <td style={{ padding: '6px 8px', color: tab.color, fontWeight: 700 }}>{tab.label}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: s.total_pnl >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>${Math.round(s.total_pnl).toLocaleString()}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: s.profit_factor >= 1.5 ? '#4ade80' : '#fbbf24' }}>{s.profit_factor.toFixed(2)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{s.win_rate.toFixed(1)}%</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#f87171' }}>${Math.round(s.max_drawdown).toLocaleString()}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{s.total_trades}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#60a5fa' }}>{retDD}×</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
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
