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

      {/* ── TOP STRATEGIES ── */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #0d1b2a 0%, #1b2838 100%)', border: '2px solid #ffd700', padding: '1.5rem' }}>
        <h2 style={{ color: '#ffd700', margin: '0 0 0.5rem 0', fontSize: 'clamp(1.1rem, 4vw, 1.5rem)' }}>🏆 Top Strategies — Live Metrics</h2>
        <p style={{ color: '#aaa', fontSize: '0.85rem', margin: '0 0 1.5rem' }}>Selected based on: profit factor, consistency across stocks, avg R per trade, and total P&L.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '1.25rem' }}>
          {/* Best PF */}
          <div style={{ padding: '1.25rem', background: '#1a1a2e', borderRadius: '12px', border: '2px solid #ff9800' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.5rem' }}>{byPF.icon}</span>
              <span style={{ background: '#ff980022', color: '#ffb74d', padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>BEST EDGE</span>
            </div>
            <h3 style={{ margin: '0 0 0.5rem', color: '#ff9800' }}><Link to={byPF.path} style={{color:'inherit',textDecoration:'none'}}>{byPF.label}</Link></h3>
            <p style={{ color: '#ccc', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>{byPF.desc}. Highest profit factor in core strategies.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
              <div><span style={{ color: '#888' }}>Win Rate:</span> <strong style={{ color: '#00e676' }}>{byPF.wr}%</strong></div>
              <div><span style={{ color: '#888' }}>Avg R:</span> <strong style={{ color: '#00e676' }}>{byPF.avgR}R</strong></div>
              <div><span style={{ color: '#888' }}>PF:</span> <strong style={{ color: '#00e676' }}>{byPF.pf}</strong></div>
              <div><span style={{ color: '#888' }}>Total:</span> <strong style={{ color: '#00e676' }}>{fmt$(byPF.totalPnl)}</strong></div>
            </div>
            <p style={{ color: '#ffb74d', fontSize: '0.75rem', margin: '0.75rem 0 0', fontStyle: 'italic' }}>🎯 {byPF.trades} trades · Highest PF in live data.</p>
          </div>

          {/* Highest Total PnL */}
          <div style={{ padding: '1.25rem', background: '#1a1a2e', borderRadius: '12px', border: '2px solid #2196f3' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.5rem' }}>{byTotal.icon}</span>
              <span style={{ background: '#2196f322', color: '#64b5f6', padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>WORKHORSE</span>
            </div>
            <h3 style={{ margin: '0 0 0.5rem', color: '#2196f3' }}><Link to={byTotal.path} style={{color:'inherit',textDecoration:'none'}}>{byTotal.label}</Link></h3>
            <p style={{ color: '#ccc', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>{byTotal.desc}. Highest total P&L in core strategies.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
              <div><span style={{ color: '#888' }}>Win Rate:</span> <strong>{byTotal.wr}%</strong></div>
              <div><span style={{ color: '#888' }}>Avg R:</span> <strong>{byTotal.avgR}R</strong></div>
              <div><span style={{ color: '#888' }}>PF:</span> <strong>{byTotal.pf}</strong></div>
              <div><span style={{ color: '#888' }}>Total:</span> <strong style={{ color: '#00e676' }}>{fmt$(byTotal.totalPnl)}</strong></div>
            </div>
            <p style={{ color: '#64b5f6', fontSize: '0.75rem', margin: '0.75rem 0 0', fontStyle: 'italic' }}>📈 {byTotal.trades} trades · Highest total P&L in live data.</p>
          </div>

          {/* Lowest Drawdown */}
          <div style={{ padding: '1.25rem', background: '#1a1a2e', borderRadius: '12px', border: '2px solid #4caf50' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.5rem' }}>{byDD.icon}</span>
              <span style={{ background: '#4caf5022', color: '#81c784', padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>LOWEST DD</span>
            </div>
            <h3 style={{ margin: '0 0 0.5rem', color: '#4caf50' }}><Link to={byDD.path} style={{color:'inherit',textDecoration:'none'}}>{byDD.label}</Link></h3>
            <p style={{ color: '#ccc', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>{byDD.desc}. Lowest average drawdown across tracked stocks.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
              <div><span style={{ color: '#888' }}>Win Rate:</span> <strong>{byDD.wr}%</strong></div>
              <div><span style={{ color: '#888' }}>Avg R:</span> <strong>{byDD.avgR}R</strong></div>
              <div><span style={{ color: '#888' }}>PF:</span> <strong style={{ color: '#00e676' }}>{byDD.pf}</strong></div>
              <div><span style={{ color: '#888' }}>Total:</span> <strong style={{ color: '#00e676' }}>{fmt$(byDD.totalPnl)}</strong></div>
            </div>
            <p style={{ color: '#81c784', fontSize: '0.75rem', margin: '0.75rem 0 0', fontStyle: 'italic' }}>🛡️ {byDD.trades} trades · Avg DD {fmt$(byDD.avgDD)}.</p>
          </div>
        </div>

        <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'rgba(255,215,0,0.06)', borderRadius: '8px', borderLeft: '3px solid #ffd700' }}>
          <strong style={{ color: '#ffd700' }}>The Playbook:</strong>
          <span style={{ color: '#ccc', fontSize: '0.9rem' }}> Trade {byTotal.label} for throughput, {byPF.label} for edge quality, and {byDD.label} for lower drawdown diversification. Scanner at 3:15 PM, orders by close.</span>
        </div>
      </div>

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
              <th>Rank</th><th>Strategy</th><th>Total P&amp;L</th><th>PF</th><th>Avg R</th><th>Avg DD</th><th>Tie Group</th>
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
                  <td>{fmt$(st.avgDD)}</td>
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
