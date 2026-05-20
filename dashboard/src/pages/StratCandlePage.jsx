import React, { useState, useEffect } from 'react'
import { fmt$ } from '../utils'

const COMBO_INFO = {
  '2D-1-2U': { name: '2D-1-2U Reversal', type: 'Reversal', dir: 'LONG', desc: 'Down move → inside bar → break up (classic bullish reversal)' },
  '2U-1-2D': { name: '2U-1-2D Reversal', type: 'Reversal', dir: 'SHORT', desc: 'Up move → inside bar → break down (classic bearish reversal)' },
  '2U-1-2U': { name: '2U-1-2U Continuation', type: 'Continuation', dir: 'LONG', desc: 'Up move → inside bar → break up again (trend continuation)' },
  '2D-1-2D': { name: '2D-1-2D Continuation', type: 'Continuation', dir: 'SHORT', desc: 'Down move → inside bar → break down again (trend continuation)' },
  '3-1-2U': { name: '3-1-2U Outside Squeeze', type: 'Squeeze', dir: 'LONG', desc: 'Outside bar → inside compression → break up' },
  '3-1-2D': { name: '3-1-2D Outside Squeeze', type: 'Squeeze', dir: 'SHORT', desc: 'Outside bar → inside compression → break down' },
  '2D-1-1-2U': { name: '2D-1-1-2U Compound', type: 'Compound', dir: 'LONG', desc: 'Down → double inside (tight coil) → explosive break up' },
  '2U-1-1-2D': { name: '2U-1-1-2D Compound', type: 'Compound', dir: 'SHORT', desc: 'Up → double inside → explosive break down' },
  '1-1-2U': { name: '1-1-2U Double Inside', type: 'Compression', dir: 'LONG', desc: 'Two inside bars (compression) → breakout up' },
  '1-1-2D': { name: '1-1-2D Double Inside', type: 'Compression', dir: 'SHORT', desc: 'Two inside bars (compression) → breakout down' },
  '1-1-1-2U': { name: '1-1-1-2U Triple Inside', type: 'Mega Comp.', dir: 'LONG', desc: 'Three inside bars (extreme coil) → explosive break up' },
  '1-1-1-2D': { name: '1-1-1-2D Triple Inside', type: 'Mega Comp.', dir: 'SHORT', desc: 'Three inside bars (extreme coil) → explosive break down' },
  '3-2D-1-2U': { name: '3-2D-1-2U Complex', type: 'Complex', dir: 'LONG', desc: 'Outside → fake down → inside → break up' },
  '3-2U-1-2D': { name: '3-2U-1-2D Complex', type: 'Complex', dir: 'SHORT', desc: 'Outside → fake up → inside → break down' },
  '1-2D-2U': { name: '1-2D-2U Rev Strat', type: 'RevStrat', dir: 'LONG', desc: 'Inside → failed break down → reversal up' },
  '1-2U-2D': { name: '1-2U-2D Rev Strat', type: 'RevStrat', dir: 'SHORT', desc: 'Inside → failed break up → reversal down' },
}

const VAR_INFO = {
  'fixed_2R': { name: 'Fixed 2R', desc: 'TP at 2× risk, time stop 10 days', icon: '🎯' },
  'fixed_3R': { name: 'Fixed 3R', desc: 'TP at 3× risk, time stop 15 days', icon: '🎯' },
  'partial_1R_2R': { name: 'Partial 1R→2R', desc: 'Half off at 1R (BE stop), rest at 2R', icon: '✂️' },
  'swing_target': { name: 'Swing Target', desc: 'Target = prior swing high/low (the real level)', icon: '📐' },
  'tfc_fixed_2R': { name: 'TFC + 2R', desc: 'Weekly timeframe continuity filter + 2R target', icon: '📅' },
  'tfc_swing': { name: 'TFC + Swing', desc: 'Weekly TFC + swing level target', icon: '📅' },
  'narrowing_2R': { name: 'Narrowing + 2R', desc: 'Only in converging/narrowing ranges + 2R', icon: '🔽' },
  'magnitude_filter': { name: 'Magnitude + 2R', desc: 'Prior move > 1.5 ATR required + 2R', icon: '📏' },
  'volume_confirm': { name: 'Volume Confirm', desc: 'Trigger bar volume > 1.2× average + 2R', icon: '📊' },
  'full_strat': { name: 'Full System', desc: 'TFC + narrowing + magnitude + volume + partial', icon: '⚡' },
}

export default function StratCandlePage() {
  const [data, setData] = useState(null)
  const [activeVar, setActiveVar] = useState(null)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}strat_data.json`)
      .then(r => r.json())
      .then(d => {
        setData(d)
        if (d.variationSummary?.length) setActiveVar(d.variationSummary[0].variation)
      })
  }, [])

  if (!data) return <div className="main"><p>Loading STRAT data...</p></div>

  const N = data.settings?.numStocks || 19  // avg per stock
  const varSummary = data.variationSummary || []
  const comboVarDetail = data.comboVariationDetail || []
  const bestCombos = data.bestCombos || []

  const bestVar = varSummary[0]
  const topByEfficiency = [...varSummary].filter(v => v.totalTrades > 20)
    .map(v => ({ ...v, perTrade: v.totalPnl / v.totalTrades }))
    .sort((a, b) => b.perTrade - a.perTrade)

  // Get combos for active variation
  const activeVarCombos = activeVar
    ? comboVarDetail.filter(c => c.variation === activeVar).sort((a, b) => b.totalPnl - a.totalPnl)
    : []

  return (
    <div>
      <h1 className="page-title">The STRAT v2 <span>Rob Smith method · STRAT community approach · 16 combos × 10 variations × 19 stocks</span></h1>

      {/* THE ANSWER */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', border: '2px solid #00e676', padding: '1.5rem' }}>
        <h2 style={{ color: '#00e676', margin: '0 0 1rem 0' }}>The Bottom Line — STRAT Community Was Right</h2>
        <div style={{ fontSize: 'clamp(0.9rem, 2.5vw, 1.05rem)', lineHeight: 1.8, color: '#e0e0e0' }}>
          <p style={{ margin: '0 0 1rem' }}>
            Tested 10 variations of how the STRAT community actually trades: fixed R:R, swing targets, weekly TFC, volume confirmation, narrowing patterns, and partial profits.
          </p>
          <p style={{ margin: '0 0 1rem' }}>
            <strong style={{ color: '#fff' }}>Best approach:</strong> <strong style={{ color: '#00e676' }}>
            {VAR_INFO[bestVar?.variation]?.name}</strong> — {fmt$(bestVar?.totalPnl / N)} avg/stock from {bestVar?.totalTrades} trades
            (PF {bestVar?.profitFactor}).
            {topByEfficiency[0] && <> Most efficient: <strong style={{ color: '#4ade80' }}>{VAR_INFO[topByEfficiency[0].variation]?.name}</strong> at ${topByEfficiency[0].perTrade.toFixed(0)}/trade.</>}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: '0.75rem', margin: '1rem 0' }}>
            <div style={{ padding: '0.75rem', background: 'rgba(0,230,118,0.1)', borderRadius: 8, borderLeft: '3px solid #00e676' }}>
              <strong style={{ color: '#00e676' }}>Volume confirmation = best $/trade</strong>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#bbb' }}>Fewest trades, highest avg P&L per stock. Best efficiency by far.</p>
            </div>
            <div style={{ padding: '0.75rem', background: 'rgba(74,222,128,0.1)', borderRadius: 8, borderLeft: '3px solid #4ade80' }}>
              <strong style={{ color: '#4ade80' }}>Swing targets = best avg P&L</strong>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#bbb' }}>Target prior swing high/low (real levels) beats arbitrary R:R.</p>
            </div>
            <div style={{ padding: '0.75rem', background: 'rgba(168,85,247,0.1)', borderRadius: 8, borderLeft: '3px solid #a78bfa' }}>
              <strong style={{ color: '#a78bfa' }}>SHORTS WORK with defined targets</strong>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#bbb' }}>2D-1-2D + swing target = profitable per stock. With real levels, shorts work.</p>
            </div>
            <div style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.1)', borderRadius: 8, borderLeft: '3px solid #ef4444' }}>
              <strong style={{ color: '#ef4444' }}>Partials KILL the system</strong>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#bbb' }}>Taking half at 1R → negative avg P&L. Let winners run to target.</p>
            </div>
          </div>
          <p style={{ margin: 0, padding: '0.75rem', background: 'rgba(0,230,118,0.1)', borderRadius: 8, borderLeft: '3px solid #00e676' }}>
            <strong>Key insight:</strong> The STRAT community's confidence is justified. Fixed R:R + defined levels + volume = edge. The patterns give you precise risk — you just need to target real levels, not trail.
          </p>
        </div>
      </div>

      {/* HOW TO READ THIS PAGE */}
      <div className="card" style={{ marginTop: '1.5rem', background: 'rgba(255,255,255,0.02)' }}>
        <h3>How to Read This Page</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '1.5rem', fontSize: 14, color: '#ccc', lineHeight: 1.8 }}>
          <div>
            <strong style={{ color: '#fff' }}>What is a "Combo"?</strong>
            <p style={{ margin: '4px 0 0' }}>A combo is a specific sequence of STRAT bar types that forms a trade setup. For example, <strong>2D-1-2U</strong> means: a Down bar → an Inside bar → then an Up bar triggers entry. Each combo is a different pattern the market can make. We test 16 combos.</p>
          </div>
          <div>
            <strong style={{ color: '#fff' }}>What is a "Variation"?</strong>
            <p style={{ margin: '4px 0 0' }}>A variation is HOW you manage the trade once you enter. Same pattern, different exit rules. For example: "Fixed 2R" = always take profit at 2× your risk. "Swing Target" = target the prior swing high/low. We test 10 variations to find what works best.</p>
          </div>
          <div>
            <strong style={{ color: '#fff' }}>What is "Win Combos"?</strong>
            <p style={{ margin: '4px 0 0' }}>Out of the 16 combos tested under a given variation, how many finished with positive P&L. E.g. "6/16" means 6 combos were profitable, 10 lost money. Higher = the variation works across more pattern types.</p>
          </div>
          <div>
            <strong style={{ color: '#fff' }}>What is "$/Trade"?</strong>
            <p style={{ margin: '4px 0 0' }}>Average dollar profit per trade taken. Calculated as total P&L ÷ total trades. Higher = more efficient. A variation with fewer trades but high $/Trade is better than one with many trades and low $/Trade.</p>
          </div>
          <div>
            <strong style={{ color: '#fff' }}>What is "Avg P&L"?</strong>
            <p style={{ margin: '4px 0 0' }}>Average P&L per stock. We tested across {N} stocks — this is the total divided by {N}. This represents what you'd expect trading ONE stock with this approach. $100 risk per trade.</p>
          </div>
          <div>
            <strong style={{ color: '#fff' }}>How are results grouped?</strong>
            <p style={{ margin: '4px 0 0' }}>The Variation Ranking table shows each approach's avg performance across ALL combos and ALL stocks. Click a variation to see its per-combo breakdown. The "Best Setup" table shows each combo's single best variation.</p>
          </div>
        </div>
      </div>

      {/* CANDLE CLASSIFICATION */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3>STRAT Bar Classification</h3>
        <table>
          <thead><tr><th>Label</th><th>Name</th><th>Rule</th><th>Meaning</th></tr></thead>
          <tbody>
            <tr><td><strong style={{fontSize:18}}>1</strong></td><td>Inside Bar</td><td>High &lt; Prev High AND Low &gt; Prev Low</td><td>Contraction — indecision, coiling energy</td></tr>
            <tr><td><strong style={{fontSize:18, color:'#4ade80'}}>2U</strong></td><td>Up Directional</td><td>High &gt; Prev High AND Low ≥ Prev Low</td><td>Bullish expansion — higher high, no lower low</td></tr>
            <tr><td><strong style={{fontSize:18, color:'#ef4444'}}>2D</strong></td><td>Down Directional</td><td>Low &lt; Prev Low AND High ≤ Prev High</td><td>Bearish expansion — lower low, no higher high</td></tr>
            <tr><td><strong style={{fontSize:18, color:'#a78bfa'}}>3</strong></td><td>Outside Bar</td><td>High &gt; Prev High AND Low &lt; Prev Low</td><td>Full expansion — engulfs prior bar (battle)</td></tr>
          </tbody>
        </table>
      </div>

      {/* VARIATION RANKING */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3>Variation Ranking <span style={{ color: '#8e8e9a', fontWeight: 400, fontSize: 14 }}>10 approaches tested · sorted by avg P&L per stock</span></h3>
        <table>
          <thead>
            <tr><th>#</th><th>Variation</th><th>Description</th><th>Trades</th><th>Win Combos</th><th>Avg P&L</th><th>$/Trade</th><th>PF</th></tr>
          </thead>
          <tbody>
            {varSummary.map((v, i) => {
              const info = VAR_INFO[v.variation] || {}
              const avgPnl = v.totalPnl / N
              const perTrade = v.totalTrades > 0 ? (v.totalPnl / v.totalTrades) : 0
              return (
                <tr key={v.variation}
                  style={v.totalPnl > 0 ? { background: 'rgba(0,230,118,0.05)' } : {}}
                  onClick={() => setActiveVar(v.variation)}
                  className="clickable-row">
                  <td>{i + 1}</td>
                  <td><strong style={{ cursor: 'pointer', color: v.totalPnl > 0 ? '#4ade80' : '#ef4444' }}>
                    {info.icon} {info.name || v.variation}
                  </strong></td>
                  <td style={{ fontSize: 13, color: '#8e8e9a' }}>{info.desc}</td>
                  <td>{v.totalTrades.toLocaleString()}</td>
                  <td>{v.profitableCombos}/{v.profitableCombos + v.losingCombos}</td>
                  <td className={v.totalPnl >= 0 ? 'win' : 'loss'}><strong>{fmt$(avgPnl)}</strong></td>
                  <td style={{ color: perTrade >= 0 ? '#4ade80' : '#ef4444' }}>${perTrade.toFixed(0)}</td>
                  <td>{v.profitFactor}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p style={{ marginTop: 12, fontSize: 13, color: 'var(--muted)' }}>Click any row to see combo breakdown below.</p>
      </div>

      {/* ACTIVE VARIATION DETAIL */}
      {activeVar && activeVarCombos.length > 0 && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h3>{VAR_INFO[activeVar]?.icon} {VAR_INFO[activeVar]?.name || activeVar}
            <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 400, marginLeft: 12 }}>{VAR_INFO[activeVar]?.desc}</span>
          </h3>
          <table>
            <thead>
              <tr><th>#</th><th>Combo</th><th>Type</th><th>Dir</th><th>Trades</th><th>Win%</th><th>Avg R</th><th>Avg P&L</th><th>PF</th></tr>
            </thead>
            <tbody>
              {activeVarCombos.map((c, i) => {
                const info = COMBO_INFO[c.combo]
                const avgPnl = c.totalPnl / N
                return (
                  <tr key={c.combo} style={c.totalPnl > 0 ? { background: 'rgba(0,230,118,0.04)' } : {}}>
                    <td>{i + 1}</td>
                    <td><strong style={{ color: c.totalPnl > 0 ? '#4ade80' : c.totalPnl < -500 ? '#ef4444' : '#8e8e9a' }}>{c.combo}</strong></td>
                    <td style={{ fontSize: 12, color: '#8e8e9a' }}>{info?.type}</td>
                    <td><span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 5px', borderRadius: 4,
                      background: c.direction === 'LONG' ? 'rgba(74,222,128,0.15)' : 'rgba(239,68,68,0.15)',
                      color: c.direction === 'LONG' ? '#4ade80' : '#ef4444'
                    }}>{c.direction}</span></td>
                    <td>{c.trades}</td>
                    <td>{c.winRate}%</td>
                    <td className={c.avgR >= 0 ? 'win' : 'loss'}>{c.avgR}R</td>
                    <td className={c.totalPnl >= 0 ? 'win' : 'loss'}><strong>{fmt$(avgPnl)}</strong></td>
                    <td>{c.profitFactor}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* BEST COMBOS ACROSS ALL VARIATIONS */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3>Best Setup for Each Combo <span style={{ color: '#8e8e9a', fontWeight: 400, fontSize: 14 }}>each combo's highest avg P&L variation</span></h3>
        <table>
          <thead>
            <tr><th>Combo</th><th>Best Variation</th><th>Dir</th><th>Trades</th><th>WR%</th><th>PF</th><th>Avg P&L</th></tr>
          </thead>
          <tbody>
            {bestCombos.filter(c => c.totalPnl > 0).map(c => {
              const info = COMBO_INFO[c.combo]
              const varInfo = VAR_INFO[c.variation]
              const avgPnl = c.totalPnl / N
              return (
                <tr key={c.combo} style={{ background: 'rgba(0,230,118,0.04)' }}>
                  <td><strong style={{ color: '#4ade80' }}>{c.combo}</strong>
                    <span style={{ fontSize: 11, color: '#8e8e9a', marginLeft: 6 }}>{info?.type}</span>
                  </td>
                  <td>{varInfo?.icon} {varInfo?.name || c.variation}</td>
                  <td><span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 5px', borderRadius: 4,
                    background: c.direction === 'LONG' ? 'rgba(74,222,128,0.15)' : 'rgba(239,68,68,0.15)',
                    color: c.direction === 'LONG' ? '#4ade80' : '#ef4444'
                  }}>{c.direction}</span></td>
                  <td>{c.trades}</td>
                  <td>{c.winRate}%</td>
                  <td>{c.profitFactor}</td>
                  <td className="win"><strong>{fmt$(avgPnl)}</strong></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* TRADING RULES */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3>How The STRAT Community Trades (What We Tested)</h3>
        <table>
          <thead><tr><th>Element</th><th>STRAT Community</th><th>What Works Best (Data)</th></tr></thead>
          <tbody>
            <tr><td><strong>Entry</strong></td><td>Break above/below inside bar on trigger bar</td><td>Same — defined by the pattern</td></tr>
            <tr><td><strong>Stop</strong></td><td>Opposite side of inside bar (defined risk)</td><td>Same — min 0.3× ATR floor</td></tr>
            <tr><td><strong>Target</strong></td><td>Prior swing high/low OR fixed R:R</td><td><strong style={{color:'#4ade80'}}>Swing target = best avg P&L</strong> · Fixed 3R = runner-up</td></tr>
            <tr><td><strong>Volume</strong></td><td>Trigger bar should have above-avg volume</td><td><strong style={{color:'#4ade80'}}>Best $/trade efficiency</strong> — best filter by far</td></tr>
            <tr><td><strong>TFC</strong></td><td>Trade in direction of weekly bar</td><td>Helps (positive avg), but not as good as volume alone</td></tr>
            <tr><td><strong>Partials</strong></td><td>Half at 1R, rest at target</td><td><strong style={{color:'#ef4444'}}>KILLS the system (negative avg)</strong> — don't do it</td></tr>
            <tr><td><strong>Time Stop</strong></td><td>Exit if target not hit in N days</td><td>10-15 days — prevents dead money</td></tr>
            <tr><td><strong>Narrowing</strong></td><td>Prefer patterns in converging ranges</td><td>Small positive edge — adds but not critical</td></tr>
          </tbody>
        </table>
      </div>

      {/* KEY LEARNINGS */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3>Key Learnings — v2 vs v1</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '1rem' }}>
          <div style={{ padding: '1rem', background: 'rgba(0,230,118,0.08)', borderRadius: 8, borderLeft: '3px solid #00e676' }}>
            <strong style={{ color: '#00e676' }}>Defined targets &gt; trailing stops</strong>
            <p style={{ margin: '0.5rem 0 0', color: '#ccc', fontSize: '0.9rem' }}>
              v1 used EMA20 trailing. v2 with swing targets = ~70% more avg P&L per stock. Know where you're going BEFORE you enter. The community is right.
            </p>
          </div>
          <div style={{ padding: '1rem', background: 'rgba(33,150,243,0.08)', borderRadius: 8, borderLeft: '3px solid #2196f3' }}>
            <strong style={{ color: '#2196f3' }}>Volume is the cheat code</strong>
            <p style={{ margin: '0.5rem 0 0', color: '#ccc', fontSize: '0.9rem' }}>
              Trigger bar with 1.2× avg volume = highest $/trade efficiency. This single filter turns mediocre combos into winners. If it breaks out on volume, it's real.
            </p>
          </div>
          <div style={{ padding: '1rem', background: 'rgba(168,85,247,0.08)', borderRadius: 8, borderLeft: '3px solid #a78bfa' }}>
            <strong style={{ color: '#a78bfa' }}>Shorts work with real targets</strong>
            <p style={{ margin: '0.5rem 0 0', color: '#ccc', fontSize: '0.9rem' }}>
              v1 said "all shorts lose." v2 shows 2D-1-2D with swing target is profitable per stock. The key: target a real level below, don't trail.
            </p>
          </div>
          <div style={{ padding: '1rem', background: 'rgba(255,171,64,0.08)', borderRadius: 8, borderLeft: '3px solid #ffab40' }}>
            <strong style={{ color: '#ffab40' }}>3R &gt; 2R — let it run</strong>
            <p style={{ margin: '0.5rem 0 0', color: '#ccc', fontSize: '0.9rem' }}>
              Fixed 3R beats Fixed 2R by ~35% avg P&L. Lower win rate but bigger winners. The STRAT gives you tight risk — use it for wider targets.
            </p>
          </div>
          <div style={{ padding: '1rem', background: 'rgba(239,68,68,0.08)', borderRadius: 8, borderLeft: '3px solid #ef4444' }}>
            <strong style={{ color: '#ef4444' }}>Never take partials</strong>
            <p style={{ margin: '0.5rem 0 0', color: '#ccc', fontSize: '0.9rem' }}>
              Taking half at 1R = negative avg P&L. The math: you cap your winners at 1.5R average while still taking full 1R losses. Just let it go to target or stop.
            </p>
          </div>
          <div style={{ padding: '1rem', background: 'rgba(0,188,212,0.08)', borderRadius: 8, borderLeft: '3px solid #00bcd4' }}>
            <strong style={{ color: '#00bcd4' }}>Don't over-filter</strong>
            <p style={{ margin: '0.5rem 0 0', color: '#ccc', fontSize: '0.9rem' }}>
              "Full system" (all filters) = 8 trades, +$400. Too restrictive. Pick 1-2 filters max. Volume alone or swing target alone is enough.
            </p>
          </div>
        </div>
      </div>

      {/* ACTIONABLE PLAYBOOK */}
      <div className="card" style={{ marginTop: '1.5rem', border: '1px solid rgba(0,230,118,0.3)' }}>
        <h3 style={{ color: '#00e676' }}>Actionable Playbook</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '1.5rem' }}>
          <div>
            <h4 style={{ color: '#4ade80', margin: '0 0 0.5rem' }}>Setup A: Volume Breakout (Best efficiency)</h4>
            <ol style={{ margin: 0, paddingLeft: '1.2rem', color: '#ccc', fontSize: 14, lineHeight: 2 }}>
              <li>Identify any STRAT combo (2-1-2, 3-1-2, etc.)</li>
              <li>Wait for trigger bar to break inside bar high/low</li>
              <li><strong>Trigger volume must be &gt; 1.2× 20-day average</strong></li>
              <li>Stop = opposite side of inside bar</li>
              <li>Target = entry + 2× risk (fixed 2R)</li>
              <li>Time stop = 10 days</li>
            </ol>
          </div>
          <div>
            <h4 style={{ color: '#4ade80', margin: '0 0 0.5rem' }}>Setup B: Swing Level (Best total P&L)</h4>
            <ol style={{ margin: 0, paddingLeft: '1.2rem', color: '#ccc', fontSize: 14, lineHeight: 2 }}>
              <li>Identify STRAT combo near a prior swing level</li>
              <li>Trigger bar breaks inside bar high/low</li>
              <li>Target = prior swing high (longs) or low (shorts)</li>
              <li><strong>Target must be ≥ 1.5R away</strong> (skip if too close)</li>
              <li>Stop = opposite side of inside bar</li>
              <li>Time stop = 15 days</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
