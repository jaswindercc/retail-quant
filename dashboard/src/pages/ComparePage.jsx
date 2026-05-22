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
  { key: 'hh', label: 'Higher High', color: '#ab47bc', icon: '📐', desc: 'First HH after 3+ lower highs', path: '/higher-high', dir: 'Long only', stop: '1× ATR', exit: 'EMA20 trail at 2.5R', featured: true },
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
  const stratInfo = Object.fromEntries(STRATS.map(s => [s.key, s]))
  const wins = (key) => stockRows.filter(r => r.winners.includes(key)).length

  return (
    <div>
      <h1 className="page-title">Strategy Summary <span>13 Strategies · 12 Stocks · Jan 2021 – Present · $100 risk/trade</span></h1>

      {/* ── TOP STRATEGIES ── */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #0d1b2a 0%, #1b2838 100%)', border: '2px solid #ffd700', padding: '1.5rem' }}>
        <h2 style={{ color: '#ffd700', margin: '0 0 0.5rem 0', fontSize: 'clamp(1.1rem, 4vw, 1.5rem)' }}>🏆 Top Strategies — The Only Ones You Need</h2>
        <p style={{ color: '#aaa', fontSize: '0.85rem', margin: '0 0 1.5rem' }}>Selected based on: profit factor, consistency across stocks, avg R per trade, and total P&L.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '1.25rem' }}>
          {/* Higher High */}
          <div style={{ padding: '1.25rem', background: '#1a1a2e', borderRadius: '12px', border: '2px solid #ab47bc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.5rem' }}>📐</span>
              <span style={{ background: '#ffd70022', color: '#ffd700', padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>BEST R:R</span>
            </div>
            <h3 style={{ margin: '0 0 0.5rem', color: '#ab47bc' }}><Link to="/higher-high" style={{color:'inherit',textDecoration:'none'}}>Higher High Break</Link></h3>
            <p style={{ color: '#ccc', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>First higher high after 3+ lower highs. Catches trend reversals at the start.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
              <div><span style={{ color: '#888' }}>Win Rate:</span> <strong style={{ color: '#00e676' }}>54%</strong></div>
              <div><span style={{ color: '#888' }}>Avg Win:</span> <strong style={{ color: '#00e676' }}>25.3R</strong></div>
              <div><span style={{ color: '#888' }}>PF:</span> <strong style={{ color: '#00e676' }}>12.83</strong></div>
              <div><span style={{ color: '#888' }}>$/Stock:</span> <strong style={{ color: '#00e676' }}>$4,280</strong></div>
            </div>
            <p style={{ color: '#ff9800', fontSize: '0.75rem', margin: '0.75rem 0 0', fontStyle: 'italic' }}>⚡ Rare (41 trades) but when it fires → massive. Use the scanner to catch signals.</p>
          </div>

          {/* MA Bounce */}
          <div style={{ padding: '1.25rem', background: '#1a1a2e', borderRadius: '12px', border: '2px solid #2196f3' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.5rem' }}>🔵</span>
              <span style={{ background: '#2196f322', color: '#64b5f6', padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>WORKHORSE</span>
            </div>
            <h3 style={{ margin: '0 0 0.5rem', color: '#2196f3' }}><Link to="/bounce" style={{color:'inherit',textDecoration:'none'}}>MA Bounce</Link></h3>
            <p style={{ color: '#ccc', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>Pullback to EMA20 in uptrend. Most frequent setup — fires constantly in trending markets.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
              <div><span style={{ color: '#888' }}>Win Rate:</span> <strong>29%</strong></div>
              <div><span style={{ color: '#888' }}>Avg Win:</span> <strong>5.1R</strong></div>
              <div><span style={{ color: '#888' }}>PF:</span> <strong>2.11</strong></div>
              <div><span style={{ color: '#888' }}>$/Stock:</span> <strong style={{ color: '#00e676' }}>$3,290</strong></div>
            </div>
            <p style={{ color: '#64b5f6', fontSize: '0.75rem', margin: '0.75rem 0 0', fontStyle: 'italic' }}>📈 512 trades · 11/12 stocks profitable. Your bread and butter — trade this every day.</p>
          </div>

          {/* Breakout */}
          <div style={{ padding: '1.25rem', background: '#1a1a2e', borderRadius: '12px', border: '2px solid #ff9800' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.5rem' }}>🟡</span>
              <span style={{ background: '#ff980022', color: '#ffb74d', padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>BEST EDGE</span>
            </div>
            <h3 style={{ margin: '0 0 0.5rem', color: '#ff9800' }}><Link to="/breakout" style={{color:'inherit',textDecoration:'none'}}>Breakout</Link></h3>
            <p style={{ color: '#ccc', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>Price breaks above 20-day high. Best profit factor of all core strategies.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
              <div><span style={{ color: '#888' }}>Win Rate:</span> <strong>34%</strong></div>
              <div><span style={{ color: '#888' }}>Avg Win:</span> <strong>5.5R</strong></div>
              <div><span style={{ color: '#888' }}>PF:</span> <strong style={{ color: '#00e676' }}>2.80</strong></div>
              <div><span style={{ color: '#888' }}>$/Stock:</span> <strong style={{ color: '#00e676' }}>$2,922</strong></div>
            </div>
            <p style={{ color: '#ffb74d', fontSize: '0.75rem', margin: '0.75rem 0 0', fontStyle: 'italic' }}>🎯 297 trades · 11/12 profitable. Highest win rate + PF of core. Quality over quantity.</p>
          </div>
        </div>

        <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'rgba(255,215,0,0.06)', borderRadius: '8px', borderLeft: '3px solid #ffd700' }}>
          <strong style={{ color: '#ffd700' }}>The Playbook:</strong>
          <span style={{ color: '#ccc', fontSize: '0.9rem' }}> Trade MA Bounce + Breakout daily (high frequency). Watch the scanner for Higher High Break signals (rare but life-changing R:R). That's it.</span>
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
              MA Bounce wins because it fires the most ({winner.trades} trades). Even with a lower win rate,
              the volume of trades × positive expectancy = highest total profit.
            </p>
          </div>
          <div style={{ padding: '1rem', background: 'rgba(255,171,64,0.08)', borderRadius: '8px', borderLeft: '3px solid #ffab40' }}>
            <strong style={{ color: '#ffab40' }}>Win rate doesn't pick the winner</strong>
            <p style={{ margin: '0.5rem 0 0', color: '#ccc', fontSize: '0.9rem' }}>
              Breakout has the best win rate (33.7%) but finishes #2. Mean Rev has 32.8% win rate but finishes last.
              What matters: avg R × trade count × win rate.
            </p>
          </div>
          <div style={{ padding: '1rem', background: 'rgba(156,39,176,0.08)', borderRadius: '8px', borderLeft: '3px solid #9c27b0' }}>
            <strong style={{ color: '#9c27b0' }}>Rare patterns have great edges but less profit</strong>
            <p style={{ margin: '0.5rem 0 0', color: '#ccc', fontSize: '0.9rem' }}>
              VCP and Volume have the highest profit factors (2.6 and 2.53) but rank #9 and #8.
              Fewer trades = less total P&L even with a sharper edge per trade.
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
