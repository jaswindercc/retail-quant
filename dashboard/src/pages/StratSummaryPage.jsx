import React, { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { fetchJson, buildEquityCurve, buildMonthlyReturns, fmt$ } from '../utils'
import EquityChart from '../components/EquityChart'
import MonthlyChart from '../components/MonthlyChart'

const COMBO_INFO = {
  '2D-1-2U': { name: '2D-1-2U Reversal', type: 'Reversal', dir: 'LONG', desc: 'Down → inside → break up' },
  '2U-1-2D': { name: '2U-1-2D Reversal', type: 'Reversal', dir: 'SHORT', desc: 'Up → inside → break down' },
  '2U-1-2U': { name: '2U-1-2U Continuation', type: 'Continuation', dir: 'LONG', desc: 'Up → inside → break up again' },
  '2D-1-2D': { name: '2D-1-2D Continuation', type: 'Continuation', dir: 'SHORT', desc: 'Down → inside → break down again' },
  '3-1-2U': { name: '3-1-2U Outside Squeeze', type: 'Squeeze', dir: 'LONG', desc: 'Outside bar → inside → break up' },
  '3-1-2D': { name: '3-1-2D Outside Squeeze', type: 'Squeeze', dir: 'SHORT', desc: 'Outside bar → inside → break down' },
  '2D-1-1-2U': { name: '2D-1-1-2U Compound', type: 'Compound', dir: 'LONG', desc: 'Down → double inside → break up' },
  '2U-1-1-2D': { name: '2U-1-1-2D Compound', type: 'Compound', dir: 'SHORT', desc: 'Up → double inside → break down' },
  '1-1-2U': { name: '1-1-2U Double Inside', type: 'Compression', dir: 'LONG', desc: 'Two inside bars → breakout up' },
  '1-1-2D': { name: '1-1-2D Double Inside', type: 'Compression', dir: 'SHORT', desc: 'Two inside bars → breakout down' },
  '1-1-1-2U': { name: '1-1-1-2U Triple Inside', type: 'Mega Comp.', dir: 'LONG', desc: 'Three inside bars → break up' },
  '1-1-1-2D': { name: '1-1-1-2D Triple Inside', type: 'Mega Comp.', dir: 'SHORT', desc: 'Three inside bars → break down' },
  '3-2D-1-2U': { name: '3-2D-1-2U Complex', type: 'Complex', dir: 'LONG', desc: 'Outside → fake down → inside → break up' },
  '3-2U-1-2D': { name: '3-2U-1-2D Complex', type: 'Complex', dir: 'SHORT', desc: 'Outside → fake up → inside → break down' },
  '1-2D-2U': { name: '1-2D-2U Rev Strat', type: 'RevStrat', dir: 'LONG', desc: 'Inside → failed break down → reversal up' },
  '1-2U-2D': { name: '1-2U-2D Rev Strat', type: 'RevStrat', dir: 'SHORT', desc: 'Inside → failed break up → reversal down' },
}

const VAR_INFO = {
  'fixed_2R': { name: 'Fixed 2R', desc: 'TP at 2× risk', icon: '🎯' },
  'fixed_3R': { name: 'Fixed 3R', desc: 'TP at 3× risk', icon: '🎯' },
  'partial_1R_2R': { name: 'Partial 1R→2R', desc: 'Half off at 1R, rest at 2R', icon: '✂️' },
  'swing_target': { name: 'Prior Swing High', desc: 'Target = prior swing high/low', icon: '📐' },
  'tfc_fixed_2R': { name: 'TFC + 2R', desc: 'Weekly TFC filter + 2R', icon: '📅' },
  'tfc_swing': { name: 'TFC + Prior Swing', desc: 'Weekly TFC + prior swing high/low', icon: '📅' },
  'narrowing_2R': { name: 'Narrowing + 2R', desc: 'Converging ranges only + 2R', icon: '🔽' },
  'magnitude_filter': { name: 'Magnitude + 2R', desc: 'Prior move > 1.5 ATR + 2R', icon: '📏' },
  'volume_confirm': { name: 'Volume Confirm', desc: 'Volume > 1.2× avg + 2R', icon: '📊' },
  'full_strat': { name: 'Full System', desc: 'All filters combined', icon: '⚡' },
}

// Minimum trades to be considered statistically real
const MIN_TRADES_REAL = 500  // "real" sample — can trust the result
const MIN_TRADES_MAYBE = 100 // "maybe" sample — directionally useful but uncertain

function calcPF(trades) {
  const gross = trades.filter(t => t.pnlDollar > 0).reduce((s, t) => s + t.pnlDollar, 0)
  const loss = Math.abs(trades.filter(t => t.pnlDollar < 0).reduce((s, t) => s + t.pnlDollar, 0))
  return loss === 0 ? 99 : gross / loss
}

export default function StratSummaryPage() {
  const [data, setData] = useState(null)

  useEffect(() => {
    fetchJson(`${import.meta.env.BASE_URL}strat_data.json`)
      .then(setData)
  }, [])

  if (!data) return <div className="main"><p>Loading STRAT summary...</p></div>

  const EXCLUDE = ['TLT', 'IEF', 'BND', 'USTTENT', 'VIX']
  const stocks = Object.keys(data.stocks || {}).filter(s => !EXCLUDE.includes(s))
  const comboDetails = data.comboDetails || {}

  // ─── Aggregate ALL trades by combo (ignoring variation entirely) ───
  const byCombo = {}
  for (const [key, stocksObj] of Object.entries(comboDetails)) {
    const [variation, ...comboParts] = key.split('__')
    const combo = comboParts.join('__')
    if (!byCombo[combo]) byCombo[combo] = []
    for (const stock of stocks) {
      const trades = stocksObj[stock]
      if (!trades || !trades.length) continue
      byCombo[combo].push(...trades.map(t => ({ ...t, variation, stock })))
    }
  }

  // Split into tiers by sample size
  const allCombos = Object.entries(byCombo).map(([combo, trades]) => {
    const pnl = trades.reduce((s, t) => s + t.pnlDollar, 0)
    const wins = trades.filter(t => t.pnlDollar > 0).length
    const pf = calcPF(trades)
    const avgR = trades.reduce((s, t) => s + t.pnlR, 0) / trades.length
    return { combo, trades: trades.length, pnl, wins, winRate: (wins / trades.length * 100), profitFactor: pf, avgPnl: pnl / trades.length, avgR }
  }).sort((a, b) => b.pnl - a.pnl)

  const realEdge = allCombos.filter(c => c.trades >= MIN_TRADES_REAL)
  const maybeSomething = allCombos.filter(c => c.trades >= MIN_TRADES_MAYBE && c.trades < MIN_TRADES_REAL)
  const noise = allCombos.filter(c => c.trades < MIN_TRADES_MAYBE)

  // Build equity for THE winner
  const winner = realEdge.find(c => c.pnl > 0)
  let winnerEquity = []
  let winnerMonthly = []
  let winnerByYear = {}
  if (winner) {
    const sorted = byCombo[winner.combo].sort((a, b) => a.exitDate.localeCompare(b.exitDate))
    winnerEquity = buildEquityCurve(sorted)
    winnerMonthly = buildMonthlyReturns(sorted)
    sorted.forEach(t => {
      const y = t.entryDate.slice(0, 4)
      if (!winnerByYear[y]) winnerByYear[y] = { trades: 0, wins: 0, pnl: 0 }
      winnerByYear[y].trades++
      if (t.pnlDollar > 0) winnerByYear[y].wins++
      winnerByYear[y].pnl += t.pnlDollar
    })
  }
  const yearlyData = Object.entries(winnerByYear).sort().map(([year, d]) => ({ year, ...d, winRate: (d.wins / d.trades * 100), avgPnl: d.pnl / d.trades }))
  const profitableYears = yearlyData.filter(y => y.pnl > 0).length

  // Total stats
  const allTrades = Object.values(byCombo).flat()
  const totalPnl = allTrades.reduce((s, t) => s + t.pnlDollar, 0)
  const totalTrades = allTrades.length
  const variations = [...new Set(Object.keys(comboDetails).map(k => k.split('__')[0]))]

  return (
    <div>
      <h1 className="page-title">The STRAT — Honest Assessment <span>Cutting through the noise</span></h1>

      {/* THE HONEST TRUTH */}
      <div className="card" style={{ background: '#1a1a2e', border: '2px solid #ffd54f', padding: '2rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#ffd54f', margin: '0 0 1rem 0' }}>⚡ The Honest Truth</h2>
        <div style={{ fontSize: '0.95rem', lineHeight: 2, color: '#e0e0e0' }}>
          <p style={{ margin: '0 0 0.75rem' }}>
            We tested <strong>{allCombos.length} candle combos</strong> × <strong>{variations.length} exit variations</strong> across <strong>{stocks.length} stocks</strong> = <strong>{totalTrades.toLocaleString()} total trades</strong>.
          </p>
          <p style={{ margin: '0 0 0.75rem' }}>
            Net result across everything: <strong style={{ color: totalPnl >= 0 ? '#00e676' : '#ff5252' }}>{fmt$(totalPnl)}</strong>.
            {totalPnl > 0 ? ' Positive but spread thin across too many combos.' : ' Net negative when you trade all of them.'}
          </p>
          <p style={{ margin: '0 0 0.75rem', color: '#ffd54f' }}>
            <strong>The problem:</strong> {noise.length} out of {allCombos.length} combos have &lt;100 trades — not enough to conclude anything. 
            Only <strong>{realEdge.length} combos</strong> have 500+ trades (real statistical confidence).
          </p>
        </div>
      </div>

      {/* TIER 1: REAL EDGE (500+ trades) */}
      <div className="card" style={{ border: '2px solid #00e676', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#00e676', margin: '0 0 0.5rem' }}>✅ Real Edge — 500+ trades (trust these results)</h2>
        <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1rem' }}>These have enough trades to be statistically meaningful.</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr><th>Combo</th><th>What It Is</th><th>Dir</th><th>Trades</th><th>Win%</th><th>PF</th><th>Total P&L</th><th>Verdict</th></tr>
            </thead>
            <tbody>
              {realEdge.map(c => (
                <tr key={c.combo} style={c.pnl < 0 ? { opacity: 0.6 } : {}}>
                  <td style={{ fontWeight: 700 }}>{COMBO_INFO[c.combo]?.name || c.combo}</td>
                  <td style={{ fontSize: '0.8rem', color: '#aaa' }}>{COMBO_INFO[c.combo]?.desc}</td>
                  <td style={{ color: COMBO_INFO[c.combo]?.dir === 'LONG' ? '#4caf50' : '#ef5350', fontWeight: 600 }}>{COMBO_INFO[c.combo]?.dir}</td>
                  <td>{c.trades}</td>
                  <td>{c.winRate.toFixed(0)}%</td>
                  <td>{c.profitFactor >= 99 ? '∞' : c.profitFactor.toFixed(2)}</td>
                  <td style={{ color: c.pnl >= 0 ? '#00e676' : '#ff5252', fontWeight: 700 }}>{fmt$(c.pnl)}</td>
                  <td style={{ fontSize: '0.8rem' }}>
                    {c.pnl > 5000 ? <span style={{ color: '#00e676' }}>✅ Trade this</span>
                      : c.pnl > 0 ? <span style={{ color: '#ffd54f' }}>⚠️ Marginal</span>
                      : <span style={{ color: '#ff5252' }}>❌ Avoid</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* THE ONE THAT WORKS */}
      {winner && (
        <>
          <div className="card" style={{ background: 'linear-gradient(135deg, #0d1b2a 0%, #1b2838 100%)', border: '2px solid #00e676', padding: '2rem', marginBottom: '1.5rem' }}>
            <h2 style={{ color: '#00e676', margin: '0 0 1rem 0' }}>🏆 The One Combo That Clearly Works</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <div style={{ color: '#888', fontSize: '0.8rem' }}>Pattern</div>
                <div style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 700 }}>{COMBO_INFO[winner.combo]?.name}</div>
                <div style={{ color: '#aaa', fontSize: '0.85rem' }}>{COMBO_INFO[winner.combo]?.desc}</div>
              </div>
              <div>
                <div style={{ color: '#888', fontSize: '0.8rem' }}>Total P&L</div>
                <div style={{ color: '#00e676', fontSize: '1.2rem', fontWeight: 700 }}>{fmt$(winner.pnl)}</div>
              </div>
              <div>
                <div style={{ color: '#888', fontSize: '0.8rem' }}>Trades / Win Rate</div>
                <div style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 700 }}>{winner.trades} / {winner.winRate.toFixed(0)}%</div>
              </div>
              <div>
                <div style={{ color: '#888', fontSize: '0.8rem' }}>Profit Factor</div>
                <div style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 700 }}>{winner.profitFactor.toFixed(2)}</div>
              </div>
            </div>

            <div style={{ padding: '1rem', background: '#0d1b2a', borderRadius: '8px', border: '1px solid #333', marginBottom: '1rem' }}>
              <strong style={{ color: '#fff' }}>How to trade it:</strong>
              <span style={{ color: '#ccc', fontSize: '0.9rem' }}>
                {' '}Wait for a Down bar (bar 1) → Inside bar (bar 2) → Buy on break above the inside bar high (bar 3). 
                Stop below inside bar low. Win rate is only {winner.winRate.toFixed(0)}% — you'll lose more often than win — but winners are much bigger than losers (PF {winner.profitFactor.toFixed(2)}).
              </span>
            </div>

            {/* Year-by-year */}
            <h4 style={{ color: '#fff', margin: '0 0 0.5rem' }}>Year-by-Year (is it consistent?)</h4>
            <p style={{ color: '#aaa', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
              Profitable <strong style={{ color: profitableYears >= yearlyData.length * 0.7 ? '#00e676' : '#ffd54f' }}>{profitableYears}/{yearlyData.length} years</strong>
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ fontSize: '0.85rem' }}>
                <thead><tr><th>Year</th><th>Trades</th><th>Win%</th><th>P&L</th><th></th></tr></thead>
                <tbody>
                  {yearlyData.map(y => (
                    <tr key={y.year}>
                      <td style={{ fontWeight: 600 }}>{y.year}</td>
                      <td>{y.trades}</td>
                      <td>{y.winRate.toFixed(0)}%</td>
                      <td style={{ color: y.pnl >= 0 ? '#00e676' : '#ff5252', fontWeight: 700 }}>{fmt$(y.pnl)}</td>
                      <td>{y.pnl > 0 ? '✅' : '❌'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3>Equity Curve — {COMBO_INFO[winner.combo]?.name} (all stocks, all variations)</h3>
            <EquityChart data={winnerEquity} />
          </div>

          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3>Monthly Returns — {COMBO_INFO[winner.combo]?.name}</h3>
            <MonthlyChart data={winnerMonthly} />
          </div>
        </>
      )}

      {/* TIER 2: MAYBE (100-500 trades) */}
      {maybeSomething.length > 0 && (
        <div className="card" style={{ border: '1px solid #ffd54f', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#ffd54f', margin: '0 0 0.5rem' }}>⚠️ Maybe Something — 100–500 trades (directionally useful, not conclusive)</h2>
          <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1rem' }}>Enough trades to notice a pattern, but not enough to bet your account on.</p>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr><th>Combo</th><th>What It Is</th><th>Dir</th><th>Trades</th><th>Win%</th><th>PF</th><th>Total P&L</th><th>Verdict</th></tr>
              </thead>
              <tbody>
                {maybeSomething.map(c => (
                  <tr key={c.combo} style={c.pnl < 0 ? { opacity: 0.5 } : {}}>
                    <td style={{ fontWeight: 600 }}>{COMBO_INFO[c.combo]?.name || c.combo}</td>
                    <td style={{ fontSize: '0.8rem', color: '#aaa' }}>{COMBO_INFO[c.combo]?.desc}</td>
                    <td style={{ color: COMBO_INFO[c.combo]?.dir === 'LONG' ? '#4caf50' : '#ef5350', fontWeight: 600 }}>{COMBO_INFO[c.combo]?.dir}</td>
                    <td>{c.trades}</td>
                    <td>{c.winRate.toFixed(0)}%</td>
                    <td>{c.profitFactor >= 99 ? '∞' : c.profitFactor.toFixed(2)}</td>
                    <td style={{ color: c.pnl >= 0 ? '#00e676' : '#ff5252', fontWeight: 700 }}>{fmt$(c.pnl)}</td>
                    <td style={{ fontSize: '0.8rem' }}>
                      {c.pnl > 2000 && c.profitFactor > 1.3 ? <span style={{ color: '#ffd54f' }}>Worth watching</span>
                        : <span style={{ color: '#888' }}>Inconclusive</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TIER 3: NOISE */}
      {noise.length > 0 && (
        <div className="card" style={{ border: '1px solid #555', marginBottom: '1.5rem', opacity: 0.7 }}>
          <h2 style={{ color: '#888', margin: '0 0 0.5rem' }}>🗑️ Noise — &lt;100 trades (ignore these)</h2>
          <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1rem' }}>Not enough data to mean anything. Could be luck either way.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {noise.map(c => (
              <span key={c.combo} style={{ padding: '0.3rem 0.6rem', background: '#222', borderRadius: '4px', fontSize: '0.75rem', color: '#666' }}>
                {COMBO_INFO[c.combo]?.name || c.combo} ({c.trades} trades)
              </span>
            ))}
          </div>
        </div>
      )}

      {/* FINAL TAKE */}
      <div className="card" style={{ background: '#1a1a2e', padding: '2rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#fff', margin: '0 0 1rem' }}>📋 What to Do</h2>
        <ol style={{ color: '#e0e0e0', fontSize: '0.95rem', lineHeight: 2, margin: 0, paddingLeft: '1.5rem' }}>
          {winner && <li><strong style={{ color: '#00e676' }}>Trade {COMBO_INFO[winner.combo]?.name}</strong> — it's the only combo with 1000+ trades and clearly positive P&L. Accept the low win rate; the math works.</li>}
          <li><strong style={{ color: '#ff5252' }}>Avoid RevStrat (1-2D-2U / 1-2U-2D)</strong> — 1200+ trades, clearly negative. The "reversal of a reversal" doesn't work.</li>
          <li><strong style={{ color: '#ffd54f' }}>Ignore everything else</strong> — not enough trades to trust. If you want to explore, use the detail pages, but don't trade based on &lt;100 trades of backtested data.</li>
          <li><strong style={{ color: '#64b5f6' }}>Variation doesn't matter much</strong> — the pattern (which combo) matters 10× more than the exit method (which variation). Pick any variation with PF &gt; 1.3 and stick with it.</li>
        </ol>
      </div>
    </div>
  )
}
