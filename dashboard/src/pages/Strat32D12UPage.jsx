import React, { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { fmt$ } from '../utils'

const EXCLUDE = ['TLT', 'IEF', 'BND', 'USTTENT', 'VIX']

export default function Strat32D12UPage() {
  const [data, setData] = useState(null)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}strat_data.json`)
      .then(r => r.json()).then(setData).catch(console.error)
  }, [])

  if (!data) return <div className="main"><p>Loading...</p></div>

  const key = 'fixed_3R__3-2D-1-2U'
  const comboDetails = data.comboDetails || {}
  const stocksObj = comboDetails[key] || {}

  // Aggregate stats from tradeable stocks only
  let allTrades = []
  const byStock = {}
  for (const [stock, trades] of Object.entries(stocksObj)) {
    if (EXCLUDE.includes(stock)) continue
    byStock[stock] = trades
    allTrades = allTrades.concat(trades)
  }

  const totalPnl = allTrades.reduce((s, t) => s + t.pnlDollar, 0)
  const wins = allTrades.filter(t => t.pnlDollar > 0)
  const losses = allTrades.filter(t => t.pnlDollar <= 0)
  const winRate = allTrades.length ? (wins.length / allTrades.length * 100) : 0
  const avgWinR = wins.length ? wins.reduce((s, t) => s + t.pnlR, 0) / wins.length : 0
  const avgLossR = losses.length ? losses.reduce((s, t) => s + t.pnlR, 0) / losses.length : 0
  const avgPnl = allTrades.length ? totalPnl / allTrades.length : 0
  const avgDuration = allTrades.length ? allTrades.reduce((s, t) => s + t.durationDays, 0) / allTrades.length : 0
  const profitFactor = losses.length ? (wins.reduce((s, t) => s + t.pnlDollar, 0) / Math.abs(losses.reduce((s, t) => s + t.pnlDollar, 0))) : 999
  const exitReasons = {}
  allTrades.forEach(t => { exitReasons[t.exitReason] = (exitReasons[t.exitReason] || 0) + 1 })

  // Per-stock breakdown sorted by total PnL
  const stockPerf = Object.entries(byStock).map(([stock, trades]) => ({
    stock,
    trades: trades.length,
    pnl: trades.reduce((s, t) => s + t.pnlDollar, 0),
    wins: trades.filter(t => t.pnlDollar > 0).length,
    avgWinR: trades.filter(t => t.pnlDollar > 0).length ? trades.filter(t => t.pnlDollar > 0).reduce((s, t) => s + t.pnlR, 0) / trades.filter(t => t.pnlDollar > 0).length : 0,
  })).sort((a, b) => b.pnl - a.pnl)

  // Compare to other variations of same combo (3-2D-1-2U)
  const otherVariations = Object.entries(comboDetails)
    .filter(([k]) => k.endsWith('__3-2D-1-2U') && k !== key)
    .map(([k, stocksData]) => {
      const variation = k.split('__')[0]
      let trades = []
      for (const [stock, tr] of Object.entries(stocksData)) {
        if (EXCLUDE.includes(stock)) continue
        trades = trades.concat(tr)
      }
      const pnl = trades.reduce((s, t) => s + t.pnlDollar, 0)
      return { variation, trades: trades.length, pnl, avgPnl: trades.length ? pnl / trades.length : 0 }
    }).sort((a, b) => b.avgPnl - a.avgPnl)

  return (
    <div>
      <h1 className="page-title">3-2D-1-2U + Fixed 3R <span>Your Secondary (High Quality) STRAT Strategy</span></h1>

      {/* Hero card */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #0d1b2a 0%, #1b2838 100%)', border: '2px solid #64b5f6', padding: '2rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#64b5f6', margin: '0 0 1rem 0' }}>The "Fake Out → Squeeze" Setup</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ textAlign: 'center', padding: '1rem', background: '#1a2332', borderRadius: '10px' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#00e676' }}>{fmt$(avgPnl)}</div>
            <div style={{ color: '#888', fontSize: '0.8rem' }}>Avg P&L / Trade</div>
          </div>
          <div style={{ textAlign: 'center', padding: '1rem', background: '#1a2332', borderRadius: '10px' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#fff' }}>{allTrades.length}</div>
            <div style={{ color: '#888', fontSize: '0.8rem' }}>Total Trades</div>
          </div>
          <div style={{ textAlign: 'center', padding: '1rem', background: '#1a2332', borderRadius: '10px' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#00e676' }}>{winRate.toFixed(0)}%</div>
            <div style={{ color: '#888', fontSize: '0.8rem' }}>Win Rate</div>
          </div>
          <div style={{ textAlign: 'center', padding: '1rem', background: '#1a2332', borderRadius: '10px' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#00e676' }}>{profitFactor.toFixed(2)}</div>
            <div style={{ color: '#888', fontSize: '0.8rem' }}>Profit Factor</div>
          </div>
        </div>
        <p style={{ color: '#ffd54f', fontSize: '0.85rem', margin: 0, fontStyle: 'italic' }}>
          🏆 Highest avg $/trade of any config with meaningful sample size. 50% win rate means half your trades pay — and they pay 3R each.
        </p>
      </div>

      {/* How it works */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>How This Setup Works</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginTop: '1rem' }}>
          <div style={{ padding: '1.5rem', background: '#1a1a2e', borderRadius: '10px', border: '1px solid #333' }}>
            <h4 style={{ color: '#64b5f6', margin: '0 0 0.75rem' }}>📊 The Pattern: 3 → 2D → 1 → 2U</h4>
            <ol style={{ color: '#ccc', fontSize: '0.85rem', margin: 0, paddingLeft: '1.2rem', lineHeight: 1.8 }}>
              <li><strong style={{ color: '#ffd54f' }}>3 (Outside bar)</strong> — A wide-range candle that engulfs the prior bar both ways. Volatility expansion — "the shakeout."</li>
              <li><strong style={{ color: '#ef5350' }}>2D (Down bar)</strong> — Price follows through to the downside. Trapped bulls panic, shorts pile in.</li>
              <li><strong style={{ color: '#ffd54f' }}>1 (Inside bar)</strong> — The down move stalls. Sellers can't push lower. Compression = spring coiling.</li>
              <li><strong style={{ color: '#00e676' }}>2U (Break up)</strong> — Price explodes above the inside bar. All those trapped shorts now fuel the move up.</li>
            </ol>
          </div>
          <div style={{ padding: '1.5rem', background: '#1a1a2e', borderRadius: '10px', border: '1px solid #333' }}>
            <h4 style={{ color: '#64b5f6', margin: '0 0 0.75rem' }}>🎯 The Variation: Fixed 3R</h4>
            <ul style={{ color: '#ccc', fontSize: '0.85rem', margin: 0, paddingLeft: '1.2rem', lineHeight: 1.8 }}>
              <li><strong>Entry:</strong> Break above inside bar high</li>
              <li><strong>Stop Loss:</strong> Below inside bar low (= 1R)</li>
              <li><strong>Target:</strong> 3× the distance from entry to stop (= 3R)</li>
              <li><strong>Why Fixed 3R:</strong> The outside bar creates such extreme displacement that when it reverses, 3R is easily achievable. The short squeeze provides the fuel.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Why it's the best secondary */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Why This is Your #2 (Quality Over Quantity)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
          <div style={{ padding: '1rem', background: '#1a1a2e', borderRadius: '8px' }}>
            <h4 style={{ color: '#64b5f6', margin: '0 0 0.5rem' }}>50% win rate is psychologically sustainable</h4>
            <p style={{ color: '#ccc', fontSize: '0.85rem', margin: 0 }}>
              Unlike the primary setup (32% WR), this one wins half the time. You can trade this without the emotional drain of long losing streaks.
            </p>
          </div>
          <div style={{ padding: '1rem', background: '#1a1a2e', borderRadius: '8px' }}>
            <h4 style={{ color: '#64b5f6', margin: '0 0 0.5rem' }}>Highest avg P&L per trade: {fmt$(avgPnl)}</h4>
            <p style={{ color: '#ccc', fontSize: '0.85rem', margin: 0 }}>
              Each trade generates {fmt$(avgPnl)} on average. Even with fewer signals, the quality per setup is unmatched across all 80 combo-variation pairs tested.
            </p>
          </div>
          <div style={{ padding: '1rem', background: '#1a1a2e', borderRadius: '8px' }}>
            <h4 style={{ color: '#64b5f6', margin: '0 0 0.5rem' }}>The "trapped trader" edge</h4>
            <p style={{ color: '#ccc', fontSize: '0.85rem', margin: 0 }}>
              The outside bar → fake down sequence traps aggressive shorts. When the inside bar breaks up, they're forced to cover — that buying pressure IS your edge.
            </p>
          </div>
          <div style={{ padding: '1rem', background: '#1a1a2e', borderRadius: '8px' }}>
            <h4 style={{ color: '#64b5f6', margin: '0 0 0.5rem' }}>Complements primary perfectly</h4>
            <p style={{ color: '#ccc', fontSize: '0.85rem', margin: 0 }}>
              2D-1-2U fires often with big R:R. This fires rarely but with high confidence. Together they cover both "volume" and "quality" slots in your playbook.
            </p>
          </div>
        </div>
      </div>

      {/* The math */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>The Math: Coin Flip That Pays 3-to-1</h2>
        <div style={{ padding: '1.5rem', background: '#1a1a2e', borderRadius: '10px', marginTop: '1rem' }}>
          <p style={{ color: '#ccc', fontSize: '0.9rem', lineHeight: 1.6, margin: '0 0 1rem' }}>
            Imagine flipping a coin: heads you win $300, tails you lose $100. That's essentially this setup.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div style={{ background: '#0d1b2a', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ color: '#00e676', fontSize: '1.5rem', fontWeight: 700 }}>+{avgWinR.toFixed(2)}R</div>
              <div style={{ color: '#888', fontSize: '0.8rem' }}>Avg Winner</div>
            </div>
            <div style={{ background: '#0d1b2a', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ color: '#ef5350', fontSize: '1.5rem', fontWeight: 700 }}>{avgLossR.toFixed(2)}R</div>
              <div style={{ color: '#888', fontSize: '0.8rem' }}>Avg Loser</div>
            </div>
            <div style={{ background: '#0d1b2a', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ color: '#ffd54f', fontSize: '1.5rem', fontWeight: 700 }}>{((winRate / 100 * avgWinR) + ((100 - winRate) / 100 * avgLossR)).toFixed(2)}R</div>
              <div style={{ color: '#888', fontSize: '0.8rem' }}>Expectancy / Trade</div>
            </div>
          </div>
          <p style={{ color: '#ffd54f', fontSize: '0.85rem', margin: '1rem 0 0', fontStyle: 'italic' }}>
            Every 10 trades: ~5 winners × {avgWinR.toFixed(1)}R = +{(5 * avgWinR).toFixed(1)}R, ~5 losers × -1R = -5R → Net +{(5 * avgWinR - 5).toFixed(1)}R per 10 trades.
          </p>
        </div>
      </div>

      {/* Exit breakdown */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>How Trades End</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
          <div style={{ padding: '1rem', background: '#1a1a2e', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#ef5350' }}>{exitReasons['SL'] || 0}</div>
            <div style={{ color: '#888', fontSize: '0.8rem' }}>Stopped Out (SL)</div>
            <div style={{ color: '#666', fontSize: '0.75rem' }}>{allTrades.length ? ((exitReasons['SL'] || 0) / allTrades.length * 100).toFixed(0) : 0}% of trades</div>
          </div>
          <div style={{ padding: '1rem', background: '#1a1a2e', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#00e676' }}>{exitReasons['TP'] || 0}</div>
            <div style={{ color: '#888', fontSize: '0.8rem' }}>Hit 3R Target (TP)</div>
            <div style={{ color: '#666', fontSize: '0.75rem' }}>{allTrades.length ? ((exitReasons['TP'] || 0) / allTrades.length * 100).toFixed(0) : 0}% of trades</div>
          </div>
          {(exitReasons['TIME'] || 0) > 0 && (
            <div style={{ padding: '1rem', background: '#1a1a2e', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#ffd54f' }}>{exitReasons['TIME']}</div>
              <div style={{ color: '#888', fontSize: '0.8rem' }}>Time Exit</div>
              <div style={{ color: '#666', fontSize: '0.75rem' }}>{((exitReasons['TIME'] || 0) / allTrades.length * 100).toFixed(0)}% of trades</div>
            </div>
          )}
        </div>
        <p style={{ color: '#aaa', fontSize: '0.8rem', marginTop: '1rem' }}>
          Nearly a perfect 50/50 split between stops and target hits. This is an extremely clean setup — it either works immediately or fails cleanly. No ambiguity.
        </p>
      </div>

      {/* Comparison with other variations */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Why Fixed 3R? (vs Other Exit Methods for 3-2D-1-2U)</h2>
        <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1rem' }}>Same complex combo, different exit strategies. Fixed 3R is the sweet spot.</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr><th>Variation</th><th>Trades</th><th>Avg $/Trade</th><th>vs Fixed 3R</th></tr>
            </thead>
            <tbody>
              <tr style={{ background: '#1a2332', border: '1px solid #64b5f6' }}>
                <td><strong>🎯 Fixed 3R</strong></td>
                <td>{allTrades.length}</td>
                <td style={{ color: '#00e676', fontWeight: 700 }}>{fmt$(avgPnl)}</td>
                <td style={{ color: '#64b5f6' }}>← You're here</td>
              </tr>
              {otherVariations.map(v => (
                <tr key={v.variation}>
                  <td>{v.variation.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</td>
                  <td>{v.trades}</td>
                  <td style={{ color: v.avgPnl >= 0 ? '#00e676' : '#ff5252' }}>{fmt$(v.avgPnl)}</td>
                  <td style={{ color: v.avgPnl > avgPnl ? '#ffd54f' : '#666' }}>
                    {v.avgPnl > avgPnl ? `+${fmt$(v.avgPnl - avgPnl)} better` : `${fmt$(v.avgPnl - avgPnl)} worse`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-stock breakdown */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Per-Stock Breakdown</h2>
        <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1rem' }}>Which stocks respond to the fake-out squeeze (sorted by total P&L)</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr><th>#</th><th>Stock</th><th>Trades</th><th>Win%</th><th>Avg Win</th><th>Total P&L</th><th>Verdict</th></tr>
            </thead>
            <tbody>
              {stockPerf.map((s, i) => (
                <tr key={s.stock} style={s.pnl < 0 ? { opacity: 0.6 } : {}}>
                  <td>{i + 1}</td>
                  <td><NavLink to={`/the-strat/stock/${s.stock}`} style={{ color: '#64b5f6', textDecoration: 'none', fontWeight: 600 }}>{s.stock}</NavLink></td>
                  <td>{s.trades}</td>
                  <td>{s.trades ? (s.wins / s.trades * 100).toFixed(0) : 0}%</td>
                  <td>{s.avgWinR.toFixed(1)}R</td>
                  <td style={{ color: s.pnl >= 0 ? '#00e676' : '#ff5252', fontWeight: 700 }}>{fmt$(s.pnl)}</td>
                  <td>{s.pnl > 200 ? '✅ Trade it' : s.pnl > 0 ? '⚠️ Watch' : '❌ Skip'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Execution rules */}
      <div className="card" style={{ marginBottom: '1.5rem', border: '1px solid #ffd54f' }}>
        <h2 style={{ color: '#ffd54f' }}>⚡ Execution Rules</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
          <div style={{ padding: '1rem', background: '#1a1a2e', borderRadius: '8px' }}>
            <h4 style={{ color: '#00e676', margin: '0 0 0.5rem' }}>✅ DO</h4>
            <ul style={{ color: '#ccc', fontSize: '0.85rem', margin: 0, paddingLeft: '1.2rem', lineHeight: 1.8 }}>
              <li>Wait for the FULL 4-bar pattern (3 → 2D → 1 → break up)</li>
              <li>Enter on break of inside bar high</li>
              <li>Set stop below inside bar low</li>
              <li>Take profit at exactly 3R — no more, no less</li>
              <li>Risk 1% of account per trade</li>
              <li>Focus on GOOGL and SNOW (best performers)</li>
              <li>Be patient — this only triggers ~{allTrades.length > 0 ? Math.round(allTrades.length / 5) : 8} times/year</li>
            </ul>
          </div>
          <div style={{ padding: '1rem', background: '#1a1a2e', borderRadius: '8px' }}>
            <h4 style={{ color: '#ef5350', margin: '0 0 0.5rem' }}>❌ DON'T</h4>
            <ul style={{ color: '#ccc', fontSize: '0.85rem', margin: 0, paddingLeft: '1.2rem', lineHeight: 1.8 }}>
              <li>Take a 2-bar pattern and call it "close enough"</li>
              <li>Hold beyond 3R hoping for a bigger move</li>
              <li>Trade META or CRM with this setup (negative edge)</li>
              <li>Exit early in profit — the 3R target IS the edge</li>
              <li>Size up because the win rate is 50% (stay at 1% risk)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Why not just trade this one? */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Why Not ONLY Trade This One?</h2>
        <div style={{ padding: '1.5rem', background: '#1a1a2e', borderRadius: '10px', marginTop: '1rem' }}>
          <p style={{ color: '#ccc', fontSize: '0.9rem', lineHeight: 1.6 }}>
            With {fmt$(avgPnl)}/trade avg and {profitFactor.toFixed(2)} PF, why not exclusively trade this?
          </p>
          <ul style={{ color: '#ccc', fontSize: '0.85rem', paddingLeft: '1.2rem', lineHeight: 1.8 }}>
            <li><strong style={{ color: '#ffd54f' }}>Only {allTrades.length} trades</strong> over the full backtest period. That's roughly {allTrades.length > 0 ? Math.round(allTrades.length / 5) : 8} trades/year. You'd go weeks without a signal.</li>
            <li><strong style={{ color: '#ffd54f' }}>Small sample size</strong> means the edge is less statistically validated than the primary (which has {'>'}300 trades).</li>
            <li><strong style={{ color: '#ffd54f' }}>Patience is hard</strong> — most traders need action. The primary setup keeps you engaged while you wait for these premium setups.</li>
          </ul>
          <p style={{ color: '#00e676', fontSize: '0.85rem', margin: '1rem 0 0', fontWeight: 600 }}>
            → Use 2D-1-2U + Prior Swing High as your daily bread, and 3-2D-1-2U + Fixed 3R as the cherry-on-top when the stars align.
          </p>
        </div>
      </div>
    </div>
  )
}
