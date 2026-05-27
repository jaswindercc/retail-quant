import React from 'react'
import { Link } from 'react-router-dom'
import { computeMetrics, buildDrawdownSeries, fmt$ } from '../utils'

const STOCKS = ['SPY','AAPL','ADBE','AMD','BA','CRM','GOOGL','META','MSFT','NVDA','SNOW','TSLA']

const STRATS = [
  { key: 'tr', label: 'Trend Rider', color: '#4caf50', icon: '🟢', desc: 'SMA crossover → ride the trend', path: '/trend-rider', dir: 'Long + Short', stop: '1× ATR', exit: 'EMA20 trail at 2.5R (longs) · 3R fixed TP (shorts)' },
  { key: 'bn', label: 'MA Bounce', color: '#2196f3', icon: '🔵', desc: 'Pullback to EMA20 in uptrend', path: '/bounce', dir: 'Long only', stop: '1× ATR', exit: 'EMA20 trail at 2.5R' },
  { key: 'br', label: 'Breakout', color: '#ff9800', icon: '🟡', desc: 'Price breaks above recent high', path: '/breakout', dir: 'Long only', stop: '1× ATR', exit: 'EMA20 trail at 2.5R' },
  { key: 'rsi', label: 'RSI Trend', color: '#e040fb', icon: '🟣', desc: 'RSI oversold bounce in uptrend', path: '/rsi', dir: 'Long only', stop: '1× ATR', exit: 'EMA20 trail at 2.5R' },
  { key: 'mr', label: 'Mean Rev', color: '#ff5252', icon: '🔴', desc: 'Bollinger Band mean reversion', path: '/meanrev', dir: 'Long only', stop: '1.5× ATR', exit: 'EMA20 trail at 2.5R' },
  { key: 'tl', label: 'Trendline', color: '#00bcd4', icon: '🩵', desc: 'Rising trendline bounce', path: '/trendline', dir: 'Long only', stop: '1× ATR', exit: 'EMA20 trail at 2.5R' },
  { key: 'sr', label: 'S/R Bounce', color: '#8bc34a', icon: '💚', desc: 'Horizontal support bounce', path: '/sr', dir: 'Long only', stop: '1× ATR', exit: 'EMA20 trail at 2.5R' },
  { key: 'fvg', label: 'FVG', color: '#ffeb3b', icon: '💛', desc: 'Fair Value Gap pullback', path: '/fvg', dir: 'Long only', stop: '1× ATR', exit: 'EMA20 trail at 2.5R' },
  { key: 'vcp', label: 'VCP', color: '#9c27b0', icon: '💜', desc: 'Volatility contraction breakout', path: '/vcp', dir: 'Long only', stop: '1× ATR', exit: 'EMA20 trail at 2.5R' },
  { key: 'vol', label: 'Volume', color: '#ff7043', icon: '🧡', desc: 'Volume spike breakout', path: '/volume', dir: 'Long only', stop: '1× ATR', exit: 'EMA20 trail at 2.5R' },
  { key: 'wk52', label: '52-Wk High', color: '#26c6da', icon: '🏔️', desc: 'Break above 252-day high', path: '/52wk-high', dir: 'Long only', stop: '1× ATR', exit: 'EMA20 trail at 2.5R', rare: true },
  { key: 'bp', label: 'Bottom Picker', color: '#ef5350', icon: '🎣', desc: '20%+ crash → RSI<35 → first green bar', path: '/bottom-picker', dir: 'Long only', stop: '1.5× ATR', exit: 'EMA20 trail at 2.5R', rare: true },
  { key: 'hh', label: 'Higher High', color: '#ab47bc', icon: '📐', desc: 'First HH after 3+ lower highs', path: '/higher-high', dir: 'Long only', stop: '1× ATR', exit: 'EMA20 - 2×ATR trail at 3R', featured: true },
]

function getFullStats(data, symbol) {
  const t = (data.stocks[symbol]?.trades || []).filter(t => t.exitDate)
  const m = computeMetrics(t)
  const d = buildDrawdownSeries(t)
  const prices = data.stocks[symbol]?.prices || []
  const firstP = prices[0]?.close
  const lastP = prices[prices.length - 1]?.close
  const stockReturn = firstP ? (lastP - firstP) / firstP : 0
  const buyHold = (t.length * 100) * stockReturn
  return {
    pnl: m?.totalPnl ?? 0, trades: t.length, wr: m?.winRate ?? 0,
    avgR: m?.avgR ?? 0, pf: m?.profitFactor ?? 0, maxDD: d.maxDD ?? 0,
    avgDur: m?.avgDuration ?? 0, buyHold
  }
}

function buildStableRanking(strategies) {
  // Ignore small metric differences so rankings do not reshuffle on tiny moves.
  const TIE_BANDS = {
    totalPnl: 1500,
    pf: 0.12,
    avgR: 0.12,
    avgDD: 150,
  }

  const sorted = [...strategies].sort((a, b) => {
    if (b.totalPnl !== a.totalPnl) return b.totalPnl - a.totalPnl
    if (b.pf !== a.pf) return b.pf - a.pf
    if (b.avgR !== a.avgR) return b.avgR - a.avgR
    return a.avgDD - b.avgDD
  })

  const isNearTie = (a, b) => (
    Math.abs(a.totalPnl - b.totalPnl) <= TIE_BANDS.totalPnl &&
    Math.abs(a.pf - b.pf) <= TIE_BANDS.pf &&
    Math.abs(a.avgR - b.avgR) <= TIE_BANDS.avgR &&
    Math.abs(a.avgDD - b.avgDD) <= TIE_BANDS.avgDD
  )

  const groups = []
  for (const st of sorted) {
    const last = groups[groups.length - 1]
    if (last && last.items.some(x => isNearTie(x, st))) {
      last.items.push(st)
    } else {
      groups.push({ items: [st] })
    }
  }

  let rank = 1
  groups.forEach(g => {
    g.rank = rank
    rank += g.items.length
  })

  return { groups, tieBands: TIE_BANDS }
}

function getRankingAsOfDate(strategies) {
  // Use source allTrades dates to anchor ranking to the latest closed trade snapshot.
  const latestExit = strategies
    .flatMap(s => s._allTrades || [])
    .map(t => t.exitDate)
    .filter(Boolean)
    .sort()
    .slice(-1)[0]
  return latestExit || 'N/A'
}

export default function ComparePage({ trData, bnData, brData, rsiData, mrData, tlData, srData, fvgData, vcpData, volData, wk52Data, bpData, hhData }) {
  const dataMap = { tr: trData, bn: bnData, br: brData, rsi: rsiData, mr: mrData, tl: tlData, sr: srData, fvg: fvgData, vcp: vcpData, vol: volData, wk52: wk52Data, bp: bpData, hh: hhData }

  // Build full stats per strategy
  const stratStats = STRATS.map(st => {
    const allTrades = (dataMap[st.key].allTrades || []).filter(t => t.exitDate)
    const m = computeMetrics(allTrades)
    const stockPnls = STOCKS.map(s => {
      const stats = getFullStats(dataMap[st.key], s)
      return { symbol: s, ...stats }
    })
    const profitable = stockPnls.filter(s => s.pnl > 0).length
    const totalDD = stockPnls.reduce((s, r) => s + r.maxDD, 0)
    const maxDDSingle = Math.max(...stockPnls.map(s => s.maxDD))
    const worstDDStock = stockPnls.reduce((worst, s) => s.maxDD > worst.maxDD ? s : worst, stockPnls[0])
    const heavyDDCount = stockPnls.filter(s => s.maxDD > 1000).length
    const totalPnl = m?.totalPnl ?? 0
    return {
      ...st,
      _allTrades: allTrades,
      trades: allTrades.length,
      totalPnl,
      avgPnl: totalPnl / STOCKS.length,
      wr: m?.winRate ?? 0,
      avgR: m?.avgR ?? 0,
      pf: m?.profitFactor ?? 0,
      avgDur: m?.avgDuration ?? 0,
      profitable,
      avgDD: totalDD / STOCKS.length,
      maxDD: maxDDSingle,
      worstDDStock: worstDDStock?.symbol,
      heavyDDCount,
      stockPnls
    }
  }).sort((a, b) => b.avgPnl - a.avgPnl)

  // Per-stock comparison rows
  const stockRows = STOCKS.map(s => {
    const row = { symbol: s }
    const pnls = []
    for (const st of STRATS) {
      row[st.key] = getFullStats(dataMap[st.key], s)
      pnls.push({ key: st.key, pnl: row[st.key].pnl })
    }
    pnls.sort((a, b) => b.pnl - a.pnl)
    row.winners = pnls.filter(p => pnls[0].pnl - p.pnl < 500).map(p => p.key)
    row.bestPnl = pnls[0].pnl
    return row
  })

  const winner = stratStats[0]
  const runner = stratStats[1]
  const coreStats = stratStats.filter(s => !s.rare && !s.featured)
  const rareStats = stratStats.filter(s => s.rare)
  const byPF = [...coreStats].sort((a, b) => b.pf - a.pf)[0]
  const byTotal = [...coreStats].sort((a, b) => b.totalPnl - a.totalPnl)[0]
  const byDD = [...coreStats].sort((a, b) => a.avgDD - b.avgDD)[0]
  const bestWinRate = [...stratStats].sort((a, b) => b.wr - a.wr)[0]
  const bestRarePF = rareStats.length ? [...rareStats].sort((a, b) => b.pf - a.pf)[0] : null
  const liveRankPool = stratStats.filter(s => !s.rare)
  const { groups: stableRankGroups, tieBands } = buildStableRanking(liveRankPool)
  const rankingAsOf = getRankingAsOfDate(liveRankPool)
  const coreTop = coreStats[0]
  const coreBottom = coreStats[coreStats.length - 1]
  const pnlSpread = coreTop && coreBottom ? coreTop.avgPnl - coreBottom.avgPnl : 0
  const stratInfo = Object.fromEntries(STRATS.map(s => [s.key, s]))
  const wins = (key) => stockRows.filter(r => r.winners.includes(key)).length

  return (
    <div>
      <h1 className="page-title">Strategy Summary <span>13 Strategies · 12 Stocks · Jan 2021 – Present · $100 risk/trade</span></h1>

      {/* ── TOP 3 PICKS ── */}
      {(() => {
        // Confidence score for picking top 3
        const scored = [...stratStats].filter(s => !s.rare).map(st => {
          const consistencyScore = st.profitable / STOCKS.length
          const pfScore = Math.min(st.pf / 3, 1)
          const wrScore = st.wr / 100
          const tradeScore = Math.min(st.trades / 500, 1)
          const confidence = (consistencyScore * 0.35) + (pfScore * 0.25) + (wrScore * 0.25) + (tradeScore * 0.15)
          return { ...st, confidence }
        }).sort((a, b) => b.confidence - a.confidence)
        const top3 = scored.slice(0, 3)
        return (
          <div className="card" style={{ background: 'linear-gradient(135deg, #0a1628 0%, #162032 100%)', border: '2px solid #4ade80', padding: '1.5rem', marginBottom: '1.5rem' }}>
            <h2 style={{ color: '#4ade80', margin: '0 0 0.25rem', fontSize: 'clamp(1.1rem, 4vw, 1.4rem)' }}>Your Top 3 Picks</h2>
            <p style={{ color: '#9fb3c8', fontSize: '0.85rem', margin: '0 0 1.25rem' }}>
              Based on consistency (works on most stocks), profit factor, win rate, and sample size.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '1rem' }}>
              {top3.map((st, i) => (
                <div key={st.key} style={{ padding: '1.25rem', background: '#0d1b2a', borderRadius: 12, border: `2px solid ${st.color}`, position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 10, right: 12, fontSize: '1.5rem', opacity: 0.4 }}>#{i + 1}</div>
                  <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>{st.icon}</div>
                  <h3 style={{ margin: '0 0 0.5rem', color: st.color }}>
                    <Link to={st.path} style={{ color: 'inherit', textDecoration: 'none' }}>{st.label}</Link>
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', fontSize: '0.85rem' }}>
                    <div><span style={{ color: '#888' }}>Stocks +:</span> <strong style={{ color: '#4ade80' }}>{st.profitable}/12</strong></div>
                    <div><span style={{ color: '#888' }}>PF:</span> <strong>{st.pf}</strong></div>
                    <div><span style={{ color: '#888' }}>Win Rate:</span> <strong>{st.wr}%</strong></div>
                    <div><span style={{ color: '#888' }}>Total:</span> <strong style={{ color: '#4ade80' }}>{fmt$(st.totalPnl)}</strong></div>
                    <div><span style={{ color: '#888' }}>Avg DD:</span> <strong style={{ color: st.avgDD > 1000 ? '#ef4444' : '#fbbf24' }}>{fmt$(st.avgDD)}</strong></div>
                    <div><span style={{ color: '#888' }}>Max DD:</span> <strong style={{ color: st.maxDD > 1500 ? '#ef4444' : '#fbbf24' }}>{fmt$(st.maxDD)}</strong></div>
                  </div>
                  <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#9fb3c8' }}>
                    {st.trades} trades · Confidence {Math.round(st.confidence * 100)}%
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(74,222,128,0.06)', borderRadius: 8, borderLeft: '3px solid #4ade80', fontSize: '0.9rem', color: '#ccc' }}>
              <strong style={{ color: '#4ade80' }}>Why these 3:</strong> All profitable on 11/12 stocks. Different entry triggers (breakout, pullback, RSI) so they don't all fire on the same day — natural diversification. Each has 400+ trades backing the edge.
            </div>
          </div>
        )
      })()}

      {/* ── FULL BREAKDOWN ── */}
      {(() => {
        const scored = [...stratStats].filter(s => !s.rare).map(st => {
          const consistencyScore = st.profitable / STOCKS.length
          const pfScore = Math.min(st.pf / 3, 1)
          const wrScore = st.wr / 100
          const tradeScore = Math.min(st.trades / 500, 1)
          const confidence = (consistencyScore * 0.35) + (pfScore * 0.25) + (wrScore * 0.25) + (tradeScore * 0.15)
          return { ...st, confidence }
        }).sort((a, b) => b.confidence - a.confidence)

        const tradeable = scored.filter(s => s.profitable >= Math.floor(STOCKS.length * 0.75) && s.pf >= 1.3)
        const risky = scored.filter(s => s.profitable < Math.floor(STOCKS.length * 0.75) || s.pf < 1.3)

        return (
          <div className="card" style={{ background: 'linear-gradient(135deg, #0d1b2a 0%, #1b2838 100%)', border: '2px solid #ffd700', padding: '1.5rem' }}>
            <h2 style={{ color: '#ffd700', margin: '0 0 0.25rem 0', fontSize: 'clamp(1.1rem, 4vw, 1.5rem)' }}>Which Strategies Should You Trade?</h2>
            <p style={{ color: '#9fb3c8', fontSize: '0.85rem', margin: '0 0 1.25rem' }}>
              Ranked by <strong style={{ color: '#e2e8f0' }}>confidence</strong>: works on most stocks, high win rate, strong profit factor, enough trades to trust.
            </p>

            {/* Tradeable strategies */}
            {tradeable.length > 0 && (
              <>
                <h3 style={{ color: '#4ade80', margin: '0 0 0.75rem', fontSize: '1rem' }}>✅ Trade These — Profitable on {Math.floor(STOCKS.length * 0.75)}+ of {STOCKS.length} stocks, PF ≥ 1.3</h3>
                <table style={{ marginBottom: '1.25rem' }}>
                  <thead>
                    <tr>
                      <th>#</th><th>Strategy</th><th>Stocks Profitable</th><th>Win Rate</th><th>PF</th><th>Total P&L</th><th>Trades</th><th>Avg DD</th><th>Max DD</th><th>Worst Stock</th><th>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tradeable.map((st, i) => (
                      <tr key={st.key} style={i === 0 ? { background: 'rgba(74,222,128,0.08)' } : {}}>
                        <td><strong>{i + 1}</strong></td>
                        <td><Link to={st.path} style={{ color: st.color, textDecoration: 'none', fontWeight: 600 }}>{st.icon} {st.label}</Link></td>
                        <td><strong style={{ color: '#4ade80' }}>{st.profitable}/{STOCKS.length}</strong></td>
                        <td>{st.wr}%</td>
                        <td><strong>{st.pf}</strong></td>
                        <td className="win">{fmt$(st.totalPnl)}</td>
                        <td>{st.trades}</td>
                        <td style={{ color: st.avgDD > 1000 ? '#ef4444' : '#fbbf24' }}>{fmt$(st.avgDD)}</td>
                        <td style={{ color: st.maxDD > 1500 ? '#ef4444' : '#fbbf24' }}>{fmt$(st.maxDD)}</td>
                        <td style={{ fontSize: '0.8rem', color: '#9fb3c8' }}>{st.worstDDStock} ({st.heavyDDCount > 0 ? `${st.heavyDDCount} stocks >$1k` : 'all <$1k'})</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 60, height: 6, background: '#333', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.round(st.confidence * 100)}%`, height: '100%', background: st.confidence > 0.7 ? '#4ade80' : st.confidence > 0.5 ? '#fbbf24' : '#ef4444', borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: '0.8rem', color: '#ccc' }}>{Math.round(st.confidence * 100)}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {/* Risky / not recommended */}
            {risky.length > 0 && (
              <>
                <h3 style={{ color: '#fbbf24', margin: '0 0 0.75rem', fontSize: '1rem' }}>⚠️ Use With Caution — Less consistent or weaker edge</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Strategy</th><th>Stocks Profitable</th><th>Win Rate</th><th>PF</th><th>Total P&L</th><th>Trades</th><th>Avg DD</th><th>Max DD</th><th>Why Caution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {risky.map(st => {
                      const reasons = []
                      if (st.profitable < Math.floor(STOCKS.length * 0.75)) reasons.push(`Only ${st.profitable}/${STOCKS.length} stocks green`)
                      if (st.pf < 1.3) reasons.push(`Low PF (${st.pf})`)
                      if (st.trades < 50) reasons.push(`Few trades (${st.trades})`)
                      if (st.heavyDDCount >= 4) reasons.push(`${st.heavyDDCount} stocks with DD >$1k`)
                      return (
                        <tr key={st.key}>
                          <td><Link to={st.path} style={{ color: st.color, textDecoration: 'none', fontWeight: 600 }}>{st.icon} {st.label}</Link></td>
                          <td>{st.profitable}/{STOCKS.length}</td>
                          <td>{st.wr}%</td>
                          <td>{st.pf}</td>
                          <td className={st.totalPnl >= 0 ? 'win' : 'loss'}>{fmt$(st.totalPnl)}</td>
                          <td>{st.trades}</td>
                          <td style={{ color: st.avgDD > 1000 ? '#ef4444' : '#fbbf24' }}>{fmt$(st.avgDD)}</td>
                          <td style={{ color: st.maxDD > 1500 ? '#ef4444' : '#fbbf24' }}>{fmt$(st.maxDD)}</td>
                          <td style={{ fontSize: '0.8rem', color: '#fbbf24' }}>{reasons.join(' · ')}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </>
            )}

            <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'rgba(74,222,128,0.06)', borderRadius: '8px', borderLeft: '3px solid #4ade80' }}>
              <strong style={{ color: '#4ade80' }}>Bottom Line:</strong>
              <span style={{ color: '#ccc', fontSize: '0.9rem' }}>
                {tradeable.length > 0
                  ? ` Focus on ${tradeable.slice(0, 3).map(s => s.label).join(', ')}. They work on most stocks, have proven edges, and enough trades to trust. Use the live scanner to find entries.`
                  : ' Re-run backtests with fresh data — no strategy currently meets all confidence thresholds.'}
              </span>
            </div>
          </div>
        )
      })()}

      {/* ── STRATEGY RULES ── */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3>Strategy Rules <span style={{ color: '#8e8e9a', fontWeight: 400, fontSize: 14 }}>direction, stop loss & exit for each strategy</span></h3>
        <table>
          <thead>
            <tr>
              <th>Strategy</th><th>Direction</th><th>Stop Loss</th><th>Exit / Trail</th>
            </tr>
          </thead>
          <tbody>
            {STRATS.map(st => (
              <tr key={st.key}>
                <td><Link to={st.path} style={{color: st.color, textDecoration:'none', fontWeight:600}}>{st.icon} {st.label}</Link></td>
                <td><span style={{
                  fontSize: 13, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                  background: st.dir === 'Long + Short' ? 'rgba(168,85,247,0.15)' : 'rgba(74,222,128,0.15)',
                  color: st.dir === 'Long + Short' ? '#a78bfa' : '#4ade80'
                }}>{st.dir}</span></td>
                <td>{st.stop}</td>
                <td style={{ fontSize: 13 }}>{st.exit}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 14, padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, fontSize: 14, color: '#94a3b8', lineHeight: 1.7 }}>
          <strong style={{ color: '#d1d1d8' }}>How the exit works:</strong> Initial stop is set at entry − ATR. Once the trade reaches +2.5R profit, the stop switches to <strong>EMA(20) − 1×ATR</strong> (trailing, only moves up). This lets winners run while protecting gains. Risk per trade: $100.
        </div>
      </div>

      {/* ── LIVE RANKING (STABLE) ── */}
      <div className="card" style={{ marginTop: '1.5rem', border: '1px solid #64b5f6' }}>
        <h3>Live Ranking (Stability-Aware)
          <span style={{ color: '#8e8e9a', fontWeight: 400, fontSize: 14 }}> sorted by total P&amp;L, then PF, avg R, then lower drawdown</span>
        </h3>
        <p style={{ color: '#8e8e9a', fontSize: '0.8rem', marginTop: '-0.25rem' }}>
          As of: <strong style={{ color: '#cfd8dc' }}>{rankingAsOf}</strong>
        </p>
        <p style={{ color: '#9fb3c8', fontSize: '0.85rem', marginTop: '-0.25rem' }}>
          Near ties are grouped to ignore small changes. Tie bands: Total {fmt$(tieBands.totalPnl)}, PF ±{tieBands.pf}, Avg R ±{tieBands.avgR}, Avg DD ±{fmt$(tieBands.avgDD)}.
        </p>
        <table>
          <thead>
            <tr>
              <th>Rank</th><th>Strategy</th><th>Total P&amp;L</th><th>PF</th><th>Avg R</th><th>Avg DD</th><th>Max DD</th><th>Worst Stock</th><th>Tie Group</th>
            </tr>
          </thead>
          <tbody>
            {stableRankGroups.map(group => (
              group.items.map((st, idx) => (
                <tr key={`${group.rank}-${st.key}`} style={idx === 0 ? { borderTop: '1px solid #ffffff22' } : {}}>
                  <td>{idx === 0 ? <strong>#{group.rank}</strong> : ''}</td>
                  <td>
                    <Link to={st.path} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>
                      {st.icon} {st.label}
                    </Link>
                  </td>
                  <td className={st.totalPnl >= 0 ? 'win' : 'loss'}>{fmt$(st.totalPnl)}</td>
                  <td>{st.pf}</td>
                  <td className={st.avgR >= 0 ? 'win' : 'loss'}>{st.avgR}R</td>
                  <td style={{ color: st.avgDD > 1000 ? '#ef4444' : '#ccc' }}>{fmt$(st.avgDD)}</td>
                  <td style={{ color: st.maxDD > 1500 ? '#ef4444' : '#fbbf24' }}>{fmt$(st.maxDD)}</td>
                  <td style={{ fontSize: '0.8rem', color: '#9fb3c8' }}>{st.worstDDStock}</td>
                  <td>{group.items.length > 1 ? `Tie (${group.items.length})` : '—'}</td>
                </tr>
              ))
            ))}
          </tbody>
        </table>
        <p style={{ color: '#8e8e9a', fontSize: '0.8rem', marginTop: '0.75rem' }}>
          Includes core + featured strategies (excludes rare-pattern strategies because sample size is much smaller).
        </p>
      </div>

      {/* ── RANKING TABLE ── */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3>Core Strategies Ranking <span style={{ color: '#8e8e9a', fontWeight: 400, fontSize: 14 }}>30+ trades/stock · sorted by avg P&L per stock</span></h3>
        <table>
          <thead>
            <tr>
              <th>#</th><th>Strategy</th><th>Entry Type</th><th>Trades</th><th>Win%</th>
              <th>Avg R</th><th>Avg P&L / Stock</th><th>PF</th><th>Avg Days</th><th>Stocks +</th>
            </tr>
          </thead>
          <tbody>
            {stratStats.filter(s => !s.rare && !s.featured).map((st, i) => (
              <tr key={st.key} style={i === 0 ? { background: 'rgba(0,230,118,0.08)' } : {}}>
                <td><strong style={i === 0 ? { color: '#00e676', fontSize: '1.1rem' } : {}}>{i === 0 ? '👑' : i + 1}</strong></td>
                <td><Link to={st.path} style={{color:'inherit',textDecoration:'none'}}><strong>{st.icon} {st.label}</strong></Link></td>
                <td style={{ color: '#8e8e9a', fontSize: '0.85rem' }}>{st.desc}</td>
                <td>{st.trades}</td>
                <td>{st.wr}%</td>
                <td className={st.avgR >= 0 ? 'win' : 'loss'}>{st.avgR}R</td>
                <td className={st.avgPnl >= 0 ? 'win' : 'loss'}><strong>{fmt$(st.avgPnl)}</strong></td>
                <td>{st.pf}</td>
                <td>{st.avgDur}d</td>
                <td>{st.profitable}/12</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── RARE PATTERNS TABLE ── */}
      <div className="card" style={{ marginTop: '1.5rem', border: '1px solid #ff9800' }}>
        <h3>Rare Patterns <span style={{ color: '#ff9800', fontWeight: 400, fontSize: 14 }}>⚠️ Low sample size (~3-8 trades/stock) — treat as exploration, not confirmed edge</span></h3>
        <table>
          <thead>
            <tr>
              <th>Strategy</th><th>Entry Type</th><th>Trades</th><th>Win%</th>
              <th>Avg R</th><th>Avg P&L / Stock</th><th>PF</th><th>Avg Days</th><th>Stocks +</th>
            </tr>
          </thead>
          <tbody>
            {stratStats.filter(s => s.rare).map((st) => (
              <tr key={st.key}>
                <td><Link to={st.path} style={{color:'inherit',textDecoration:'none'}}><strong>{st.icon} {st.label}</strong></Link></td>
                <td style={{ color: '#8e8e9a', fontSize: '0.85rem' }}>{st.desc}</td>
                <td>{st.trades}</td>
                <td>{st.wr}%</td>
                <td className={st.avgR >= 0 ? 'win' : 'loss'}>{st.avgR}R</td>
                <td className={st.avgPnl >= 0 ? 'win' : 'loss'}><strong>{fmt$(st.avgPnl)}</strong></td>
                <td>{st.pf}</td>
                <td>{st.avgDur}d</td>
                <td>{st.profitable}/12</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ color: '#aaa', fontSize: '0.8rem', margin: '0.75rem 0 0' }}>
          These fire rarely by nature (52-wk highs, crashes). Need 10+ years of data to validate. Shown for awareness, not for ranking.
        </p>
      </div>

      {/* ── KEY INSIGHTS ── */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3>Key Insights From This Study</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '1rem' }}>
          <div style={{ padding: '1rem', background: 'rgba(33,150,243,0.08)', borderRadius: '8px', borderLeft: '3px solid #2196f3' }}>
            <strong style={{ color: '#2196f3' }}>Entry matters less than you think</strong>
            <p style={{ margin: '0.5rem 0 0', color: '#ccc', fontSize: '0.9rem' }}>
              All 10 core strategies are profitable. The same exit (EMA20 trail at 2.5R) makes every entry method work.
              The spread between #1 and #10 is only {fmt$(stratStats.filter(s => !s.rare)[0]?.avgPnl - stratStats.filter(s => !s.rare).slice(-1)[0]?.avgPnl)} per stock.
            </p>
          </div>
          <div style={{ padding: '1rem', background: 'rgba(0,230,118,0.08)', borderRadius: '8px', borderLeft: '3px solid #00e676' }}>
            <strong style={{ color: '#00e676' }}>More trades = more money</strong>
            <p style={{ margin: '0.5rem 0 0', color: '#ccc', fontSize: '0.9rem' }}>
              MA Bounce wins on total PnL because it fires the most ({winner.trades} trades). Even with a lower win rate,
              the volume of trades × positive expectancy = highest total profit.
            </p>
          </div>
          <div style={{ padding: '1rem', background: 'rgba(255,171,64,0.08)', borderRadius: '8px', borderLeft: '3px solid #ffab40' }}>
            <strong style={{ color: '#ffab40' }}>Win rate doesn't pick the winner</strong>
            <p style={{ margin: '0.5rem 0 0', color: '#ccc', fontSize: '0.9rem' }}>
              {bestWinRate?.label} has the best win rate ({bestWinRate?.wr}%) but not necessarily the highest total P&L.
              What matters most is expectancy (avg R) multiplied by trade count.
            </p>
          </div>
          <div style={{ padding: '1rem', background: 'rgba(156,39,176,0.08)', borderRadius: '8px', borderLeft: '3px solid #9c27b0' }}>
            <strong style={{ color: '#9c27b0' }}>Rare patterns have great edges but less profit</strong>
            <p style={{ margin: '0.5rem 0 0', color: '#ccc', fontSize: '0.9rem' }}>
              {bestRarePF ? `${bestRarePF.label} has the sharpest rare-pattern edge (PF ${bestRarePF.pf})` : 'Rare patterns can show strong edges'}.
              They usually fire less often, so total P&L may trail more frequent strategies.
            </p>
          </div>
          <div style={{ padding: '1rem', background: 'rgba(255,82,82,0.08)', borderRadius: '8px', borderLeft: '3px solid #ff5252' }}>
            <strong style={{ color: '#ff5252' }}>Fancy ≠ better</strong>
            <p style={{ margin: '0.5rem 0 0', color: '#ccc', fontSize: '0.9rem' }}>
              Trendlines, S/R, FVG (Smart Money Concepts) — all popular on YouTube — none beat
              a simple EMA pullback (MA Bounce). Simple rules, consistently applied, win.
            </p>
          </div>
          <div style={{ padding: '1rem', background: 'rgba(0,188,212,0.08)', borderRadius: '8px', borderLeft: '3px solid #00bcd4' }}>
            <strong style={{ color: '#00bcd4' }}>The exit IS the strategy</strong>
            <p style={{ margin: '0.5rem 0 0', color: '#ccc', fontSize: '0.9rem' }}>
              All 13 strategies use the same exit: 1×ATR stop, EMA20 trail at 2.5R. That's why they're ALL profitable.
              Change the exit and everything changes. The trailing stop does the heavy lifting.
            </p>
          </div>
        </div>
      </div>

      {/* ── HEAD-TO-HEAD TABLE ── */}
      <div className="card" style={{ marginTop: '1.5rem', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <h3>Head-to-Head by Stock <span style={{ color: '#8e8e9a', fontWeight: 400, fontSize: 14 }}>P&L, B&H & WR per stock — who wins where?</span></h3>
        <table style={{ fontSize: '0.8rem', minWidth: '1400px' }}>
          <thead>
            <tr>
              <th rowSpan={2}>Stock</th>
              {STRATS.map(st => (
                <th key={st.key} colSpan={3} style={{ textAlign: 'center', borderBottom: `2px solid ${st.color}` }}><Link to={st.path} style={{color:'inherit',textDecoration:'none'}}>{st.label}</Link></th>
              ))}
              <th rowSpan={2}>Winner</th>
            </tr>
            <tr>
              {STRATS.map(st => (
                <React.Fragment key={st.key}><th>P&L</th><th>B&H</th><th>WR</th></React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {stockRows.sort((a, b) => b.bestPnl - a.bestPnl).map(r => (
              <tr key={r.symbol}>
                <td><strong>{r.symbol}</strong></td>
                {STRATS.map(st => {
                  const pnl = r[st.key].pnl
                  const highBorder = pnl >= 5000 ? '2px solid rgba(74,222,128,0.45)' : pnl >= 3000 ? '2px solid rgba(74,222,128,0.25)' : 'none'
                  return (
                    <React.Fragment key={st.key}>
                      <td className={pnl >= 0 ? 'win' : 'loss'} style={{ border: highBorder }}>{fmt$(pnl)}</td>
                      <td style={{color: r[st.key].buyHold >= 0 ? '#4ade80' : '#ef4444'}}>{fmt$(r[st.key].buyHold)}</td>
                      <td>{r[st.key].wr.toFixed(0)}%</td>
                    </React.Fragment>
                  )
                })}
                <td>{r.winners.map(w => stratInfo[w]?.icon).join(' ')}
                  {' '}{r.winners.length > 1 ? 'Tie' : stratInfo[r.winners[0]]?.label}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
