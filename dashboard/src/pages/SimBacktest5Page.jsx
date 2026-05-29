import { useState, useEffect } from 'react'

export default function LivePlanPage() {
  const [data, setData] = useState(null)
  const [showAllTrades, setShowAllTrades] = useState(false)
  const [showDynamicTrades, setShowDynamicTrades] = useState(false)
  const [showReductionTrades, setShowReductionTrades] = useState(false)
  const [capital, setCapital] = useState(40000)
  const [riskPct, setRiskPct] = useState(0.5)

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    fetch(`${base}sim_backtest5_data.json`).then(r => r.ok ? r.json() : null).then(setData).catch(() => {})
  }, [])

  const ruleStyle = { padding: '8px 12px', borderBottom: '1px solid #333', display: 'flex', gap: 10, alignItems: 'flex-start' }
  const numStyle = { color: '#fbbf24', fontWeight: 700, minWidth: 22 }

  const s = data?.summary
  const trades = data?.trades || []
  const equityCurve = data?.equity_curve || []

  // Compute equity curve min/max for sparkline
  const pnls = equityCurve.map(e => e.pnl)
  const maxPnl = Math.max(...pnls, 1)
  const minPnl = Math.min(...pnls, 0)

  // === DYNAMIC RISK STUDY: % of current portfolio (compounds) ===
  function runDynamicRisk(trades, startCapital, riskPctVal) {
    let currentCapital = startCapital
    let peakCapital = startCapital
    let maxDD = 0
    let maxDDPct = 0
    const results = []
    for (const t of trades) {
      const riskDollars = currentCapital * (riskPctVal / 100)
      const shares = Math.floor(riskDollars / t.risk)
      const positionSize = shares * t.entryPrice
      const positionPct = (positionSize / currentCapital) * 100
      const pnlScaled = shares > 0 ? t.pnlR * riskDollars : 0
      results.push({ ...t, shares, positionSize, positionPct, riskDollars, pnlScaled, capitalAtEntry: currentCapital, riskMult: 1.0 })
      if (shares > 0) currentCapital += pnlScaled
      if (currentCapital > peakCapital) peakCapital = currentCapital
      const dd = peakCapital - currentCapital
      if (dd > maxDD) maxDD = dd
      const ddPct = peakCapital > 0 ? (dd / peakCapital) * 100 : 0
      if (ddPct > maxDDPct) maxDDPct = ddPct
    }
    const wins = results.filter(r => r.pnlScaled > 0).length
    const totalPnl = currentCapital - startCapital
    const grossWin = results.filter(r => r.pnlScaled > 0).reduce((s, r) => s + r.pnlScaled, 0)
    const grossLoss = Math.abs(results.filter(r => r.pnlScaled < 0).reduce((s, r) => s + r.pnlScaled, 0))
    const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0
    return { results, finalCapital: currentCapital, totalPnl, wins, wr: (wins / results.length * 100), pf, maxDD, maxDDPct }
  }

  // === RISK REDUCTION STUDY: reduce risk after each consecutive loss ===
  function runRiskReduction(trades, startCapital, riskPctVal) {
    let currentCapital = startCapital
    let peakCapital = startCapital
    let maxDD = 0
    let maxDDPct = 0
    let consecutiveLosses = 0
    const results = []
    for (const t of trades) {
      // Progressive reduction: each consecutive loss reduces by 10%, floor at 50%
      const riskMult = Math.max(0.5, 1.0 - (consecutiveLosses * 0.1))
      const riskDollars = currentCapital * (riskPctVal / 100) * riskMult
      const shares = Math.floor(riskDollars / t.risk)
      const positionSize = shares * t.entryPrice
      const positionPct = (positionSize / currentCapital) * 100
      const pnlScaled = shares > 0 ? t.pnlR * riskDollars : 0
      results.push({ ...t, shares, positionSize, positionPct, riskDollars, pnlScaled, capitalAtEntry: currentCapital, riskMult })
      if (shares > 0) currentCapital += pnlScaled
      if (currentCapital > peakCapital) peakCapital = currentCapital
      const dd = peakCapital - currentCapital
      if (dd > maxDD) maxDD = dd
      const ddPct = peakCapital > 0 ? (dd / peakCapital) * 100 : 0
      if (ddPct > maxDDPct) maxDDPct = ddPct
      // Update streak
      if (t.pnlR < 0) { consecutiveLosses++ }
      else { consecutiveLosses = 0 }
    }
    const wins = results.filter(r => r.pnlScaled > 0).length
    const totalPnl = currentCapital - startCapital
    const grossWin = results.filter(r => r.pnlScaled > 0).reduce((s, r) => s + r.pnlScaled, 0)
    const grossLoss = Math.abs(results.filter(r => r.pnlScaled < 0).reduce((s, r) => s + r.pnlScaled, 0))
    const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0
    return { results, finalCapital: currentCapital, totalPnl, wins, wr: (wins / results.length * 100), pf, maxDD, maxDDPct }
  }

  const dynamic = trades.length > 0 ? runDynamicRisk(trades, capital, riskPct) : null
  const reduction = trades.length > 0 ? runRiskReduction(trades, capital, riskPct) : null

  return (
    <div className="page-container" style={{ padding: '1.5rem', maxWidth: 1100 }}>
      <h1 style={{ marginBottom: '0.25rem' }}>🚀 Live Trading Plan — Backtested</h1>
      <p style={{ color: '#71717a', fontSize: 13, marginBottom: '1.5rem' }}>
        Breakout on dynamically-rotated mega-caps + regime filter. No cherry-picking — watchlist rotates monthly by 6-month momentum.
      </p>

      {!data && <p style={{ color: '#71717a' }}>Loading backtest data...</p>}

      {s && <>
        {/* KEY STATS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: '1.5rem' }}>
          {[
            { label: 'Total PnL', value: `$${s.total_pnl.toLocaleString()}`, color: s.total_pnl >= 0 ? '#4ade80' : '#f87171' },
            { label: 'Profit Factor', value: s.profit_factor.toFixed(2), color: s.profit_factor >= 1.5 ? '#4ade80' : '#fbbf24' },
            { label: 'Win Rate', value: `${s.win_rate.toFixed(1)}%`, color: '#60a5fa' },
            { label: 'Trades', value: s.total_trades, color: '#e4e4e7' },
            { label: 'Max Streak', value: s.max_losing_streak, color: s.max_losing_streak > 15 ? '#f87171' : '#fbbf24' },
            { label: 'Max Drawdown', value: `$${s.max_drawdown.toLocaleString()}`, color: '#f87171' },
            { label: 'Avg Winner', value: `$${s.avg_winner.toLocaleString()} (${s.avg_r_winner}R)`, color: '#4ade80' },
            { label: 'Avg Loser', value: `$${s.avg_loser.toLocaleString()}`, color: '#f87171' },
          ].map(m => (
            <div key={m.label} style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: '#71717a', marginBottom: 4 }}>{m.label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: m.color }}>{m.value}</div>
            </div>
          ))}
        </div>

        {/* EQUITY CURVE (SVG sparkline) */}
        {equityCurve.length > 0 && (
          <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
            <h2 style={{ color: '#fbbf24', fontSize: 15, marginBottom: '0.75rem' }}>📈 Equity Curve</h2>
            <svg width="100%" height="120" viewBox={`0 0 ${equityCurve.length} 100`} preserveAspectRatio="none" style={{ display: 'block' }}>
              <line x1="0" y1={((0 - minPnl) / (maxPnl - minPnl)) * -100 + 100} x2={equityCurve.length} y2={((0 - minPnl) / (maxPnl - minPnl)) * -100 + 100} stroke="#333" strokeWidth="0.5" />
              <polyline
                fill="none"
                stroke="#4ade80"
                strokeWidth="1.5"
                points={equityCurve.map((e, i) => `${i},${((e.pnl - minPnl) / (maxPnl - minPnl)) * -100 + 100}`).join(' ')}
              />
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#71717a', marginTop: 4 }}>
              <span>{equityCurve[0]?.date}</span>
              <span>{equityCurve[equityCurve.length - 1]?.date}</span>
            </div>
          </div>
        )}

        {/* HONESTY BOX */}
        <div style={{ background: '#0a1f2a', border: '2px solid #38bdf8', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#38bdf8', fontSize: 15, marginBottom: '0.75rem' }}>✅ This Backtest Is Honest</h2>
          <div style={{ fontSize: 13, color: '#d4d4d8', lineHeight: 1.7 }}>
            <p style={{ marginBottom: 8 }}><strong>Pool fixed:</strong> Removed SNOW (IPO Sep 2020), ABNB (IPO Dec 2020), COIN (IPO Apr 2021), PLTR (IPO Sep 2020), SQ (delisted). Added ZM, DOCU, TWLO, WDAY, EA — all were large-cap tech in 2020.</p>
            <p style={{ marginBottom: 8 }}><strong>Disaster stocks included:</strong> ZM ($400→$65, -84%) and DOCU ($310→$50, -84%) are in the pool. The rotation picked ZM in Feb-Mar 2021 (top momentum at the time).</p>
            <p style={{ marginBottom: 8 }}><strong>Result:</strong> PF {s.profit_factor}, streak {s.max_losing_streak} during 2022 bear. Strategy survived real losses.</p>
            <p style={{ marginBottom: 0, color: '#38bdf8' }}><strong>Note:</strong> All 30 stocks in the pool were publicly traded and liquid by January 2020. No look-ahead bias in pool construction.</p>
          </div>
        </div>

        {/* ═══════════════ CONFIGURE YOUR RISK ═══════════════ */}
        <div style={{ background: '#1e1e2e', border: '1px solid #6366f1', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: 13, color: '#6366f1', fontWeight: 700, marginBottom: '0.75rem' }}>⚙️ Configure Your Risk</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', fontSize: 13 }}>
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
                <div style={{ color: '#71717a', fontSize: 10 }}>Risk per trade (start)</div>
                <div style={{ color: '#4ade80', fontSize: 20, fontWeight: 800 }}>${(capital * riskPct / 100).toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
                <div style={{ color: '#52525b', fontSize: 10 }}>{riskPct}% of ${capital.toLocaleString()}</div>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: '#71717a' }}>
            Risk compounds: as portfolio grows, you risk more $ per trade. As it shrinks, you risk less. This is NOT the fixed-$200 backtest above — it's a realistic simulation of how you'd actually trade.
          </div>
        </div>

        {/* ═══════════════ DYNAMIC RISK STUDY ═══════════════ */}
        {dynamic && (
          <div style={{ background: '#1e1e2e', border: '1px solid #4ade80', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
            <h2 style={{ color: '#4ade80', fontSize: 15, marginBottom: '0.75rem' }}>📊 Study 1: Dynamic Risk (Compounding)</h2>
            <p style={{ color: '#a1a1aa', fontSize: 12, marginBottom: '1rem' }}>
              Risk = {riskPct}% of current portfolio each trade. Wins grow your risk naturally. Losses shrink it.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: '1rem' }}>
              <Stat label="Final Capital" value={`$${dynamic.finalCapital.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`started $${capital.toLocaleString()}`} color="#4ade80" />
              <Stat label="Total Return" value={`$${dynamic.totalPnl.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`${(dynamic.totalPnl / capital * 100).toFixed(0)}%`} color={dynamic.totalPnl >= 0 ? '#4ade80' : '#f87171'} />
              <Stat label="Profit Factor" value={dynamic.pf.toFixed(2)} sub="gross W / gross L" color={dynamic.pf >= 1.5 ? '#4ade80' : '#fbbf24'} />
              <Stat label="Win Rate" value={`${dynamic.wr.toFixed(1)}%`} sub={`${dynamic.wins}/${dynamic.results.length}`} color="#60a5fa" />
              <Stat label="Max Drawdown" value={`$${dynamic.maxDD.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`${dynamic.maxDDPct.toFixed(1)}% of peak`} color="#f87171" />
              <Stat label="Risk/Trade (end)" value={`$${(dynamic.finalCapital * riskPct / 100).toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`was $${(capital * riskPct / 100).toFixed(0)}`} color="#6366f1" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: '#71717a' }}>{dynamic.results.length} trades</span>
              <button onClick={() => setShowDynamicTrades(!showDynamicTrades)}
                style={{ background: '#333', color: '#e4e4e7', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 11 }}>
                {showDynamicTrades ? 'Hide Trades' : 'Show Trades'}
              </button>
            </div>
            {showDynamicTrades && (
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: '#71717a', borderBottom: '1px solid #333', position: 'sticky', top: 0, background: '#1e1e2e' }}>
                      <th style={{ textAlign: 'left', padding: '4px 5px' }}>#</th>
                      <th style={{ textAlign: 'left', padding: '4px 5px' }}>Stock</th>
                      <th style={{ textAlign: 'left', padding: '4px 5px' }}>Date</th>
                      <th style={{ textAlign: 'right', padding: '4px 5px' }}>Capital</th>
                      <th style={{ textAlign: 'right', padding: '4px 5px' }}>Risk$</th>
                      <th style={{ textAlign: 'right', padding: '4px 5px' }}>Shares</th>
                      <th style={{ textAlign: 'right', padding: '4px 5px' }}>Pos%</th>
                      <th style={{ textAlign: 'right', padding: '4px 5px' }}>R</th>
                      <th style={{ textAlign: 'right', padding: '4px 5px' }}>P/L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dynamic.results.map((t, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #1a1a1a', color: t.pnlScaled >= 0 ? '#4ade80' : '#f87171' }}>
                        <td style={{ padding: '3px 5px', color: '#71717a' }}>{i + 1}</td>
                        <td style={{ padding: '3px 5px', color: '#60a5fa', fontWeight: 500 }}>{t.stock}</td>
                        <td style={{ padding: '3px 5px', color: '#a1a1aa' }}>{t.entryDate}</td>
                        <td style={{ padding: '3px 5px', textAlign: 'right', color: '#71717a' }}>${t.capitalAtEntry.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                        <td style={{ padding: '3px 5px', textAlign: 'right', color: '#6366f1' }}>${t.riskDollars.toFixed(0)}</td>
                        <td style={{ padding: '3px 5px', textAlign: 'right', color: '#e4e4e7' }}>{t.shares}</td>
                        <td style={{ padding: '3px 5px', textAlign: 'right', color: t.positionPct > 50 ? '#fbbf24' : '#71717a' }}>{t.positionPct.toFixed(0)}%</td>
                        <td style={{ padding: '3px 5px', textAlign: 'right' }}>{t.pnlR > 0 ? '+' : ''}{t.pnlR.toFixed(1)}R</td>
                        <td style={{ padding: '3px 5px', textAlign: 'right', fontWeight: 600 }}>{t.pnlScaled > 0 ? '+' : ''}${t.pnlScaled.toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ RISK REDUCTION STUDY ═══════════════ */}
        {reduction && (
          <div style={{ background: '#1e1e2e', border: '1px solid #f59e0b', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
            <h2 style={{ color: '#f59e0b', fontSize: 15, marginBottom: '0.75rem' }}>🛡️ Study 2: Risk Reduction (Drawdown Protection)</h2>
            <p style={{ color: '#a1a1aa', fontSize: 12, marginBottom: 8 }}>
              Same as Study 1, but after each loss reduce risk by 10% (floor at 50%). Win resets to full risk.
              Idea: losses cluster. Throttle down during hostile streaks, let compounding do its job during wins.
            </p>
            <div style={{ background: '#111', borderRadius: 6, padding: '8px 12px', marginBottom: '1rem', fontSize: 12, color: '#d4d4d8' }}>
              <strong style={{ color: '#f59e0b' }}>Logic:</strong> risk_mult = max(0.5, 1.0 − consecutive_losses × 0.1). After 1 loss → 90% risk. After 2 → 80%. After 5+ → 50%. Win → reset to 100%.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: '1rem' }}>
              <Stat label="Final Capital" value={`$${reduction.finalCapital.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`started $${capital.toLocaleString()}`} color="#4ade80" />
              <Stat label="Total Return" value={`$${reduction.totalPnl.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`${(reduction.totalPnl / capital * 100).toFixed(0)}%`} color={reduction.totalPnl >= 0 ? '#4ade80' : '#f87171'} />
              <Stat label="Profit Factor" value={reduction.pf.toFixed(2)} sub="gross W / gross L" color={reduction.pf >= 1.5 ? '#4ade80' : '#fbbf24'} />
              <Stat label="Win Rate" value={`${reduction.wr.toFixed(1)}%`} sub={`${reduction.wins}/${reduction.results.length}`} color="#60a5fa" />
              <Stat label="Max Drawdown" value={`$${reduction.maxDD.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`${reduction.maxDDPct.toFixed(1)}% of peak`} color="#f87171" />
              <Stat label="DD Saved" value={`$${(dynamic.maxDD - reduction.maxDD).toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub="vs dynamic" color={reduction.maxDD < dynamic.maxDD ? '#4ade80' : '#f87171'} />
            </div>

            {/* COMPARISON TABLE */}
            <div style={{ background: '#111', borderRadius: 6, padding: '10px 12px', marginBottom: '1rem' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: '#71717a', borderBottom: '1px solid #333' }}>
                    <th style={{ textAlign: 'left', padding: '4px 6px' }}>Method</th>
                    <th style={{ textAlign: 'right', padding: '4px 6px' }}>Return</th>
                    <th style={{ textAlign: 'right', padding: '4px 6px' }}>PF</th>
                    <th style={{ textAlign: 'right', padding: '4px 6px' }}>Max DD</th>
                    <th style={{ textAlign: 'right', padding: '4px 6px' }}>DD%</th>
                    <th style={{ textAlign: 'right', padding: '4px 6px' }}>Return/DD</th>
                  </tr>
                </thead>
                <tbody style={{ color: '#e4e4e7' }}>
                  <tr style={{ borderBottom: '1px solid #222' }}>
                    <td style={{ padding: '4px 6px' }}>Dynamic ({riskPct}%)</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', color: '#4ade80' }}>${dynamic.totalPnl.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right' }}>{dynamic.pf.toFixed(2)}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', color: '#f87171' }}>${dynamic.maxDD.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right' }}>{dynamic.maxDDPct.toFixed(1)}%</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right' }}>{(dynamic.totalPnl / dynamic.maxDD).toFixed(2)}</td>
                  </tr>
                  <tr style={{ background: '#f59e0b22', fontWeight: 600 }}>
                    <td style={{ padding: '4px 6px', color: '#f59e0b' }}>Risk Reduction</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', color: '#4ade80' }}>${reduction.totalPnl.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right' }}>{reduction.pf.toFixed(2)}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', color: '#4ade80' }}>${reduction.maxDD.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right' }}>{reduction.maxDDPct.toFixed(1)}%</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right' }}>{(reduction.totalPnl / reduction.maxDD).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: '#71717a' }}>{reduction.results.length} trades — risk mult shown per trade</span>
              <button onClick={() => setShowReductionTrades(!showReductionTrades)}
                style={{ background: '#333', color: '#e4e4e7', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 11 }}>
                {showReductionTrades ? 'Hide Trades' : 'Show Trades'}
              </button>
            </div>
            {showReductionTrades && (
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: '#71717a', borderBottom: '1px solid #333', position: 'sticky', top: 0, background: '#1e1e2e' }}>
                      <th style={{ textAlign: 'left', padding: '4px 5px' }}>#</th>
                      <th style={{ textAlign: 'left', padding: '4px 5px' }}>Stock</th>
                      <th style={{ textAlign: 'left', padding: '4px 5px' }}>Date</th>
                      <th style={{ textAlign: 'right', padding: '4px 5px' }}>Capital</th>
                      <th style={{ textAlign: 'right', padding: '4px 5px' }}>Risk$</th>
                      <th style={{ textAlign: 'center', padding: '4px 5px' }}>Mult</th>
                      <th style={{ textAlign: 'right', padding: '4px 5px' }}>Shares</th>
                      <th style={{ textAlign: 'right', padding: '4px 5px' }}>R</th>
                      <th style={{ textAlign: 'right', padding: '4px 5px' }}>P/L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reduction.results.map((t, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #1a1a1a', color: t.pnlScaled >= 0 ? '#4ade80' : '#f87171' }}>
                        <td style={{ padding: '3px 5px', color: '#71717a' }}>{i + 1}</td>
                        <td style={{ padding: '3px 5px', color: '#60a5fa', fontWeight: 500 }}>{t.stock}</td>
                        <td style={{ padding: '3px 5px', color: '#a1a1aa' }}>{t.entryDate}</td>
                        <td style={{ padding: '3px 5px', textAlign: 'right', color: '#71717a' }}>${t.capitalAtEntry.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                        <td style={{ padding: '3px 5px', textAlign: 'right', color: '#6366f1' }}>${t.riskDollars.toFixed(0)}</td>
                        <td style={{ padding: '3px 5px', textAlign: 'center', color: t.riskMult < 1 ? '#f59e0b' : '#71717a', fontWeight: t.riskMult < 1 ? 600 : 400 }}>{(t.riskMult * 100).toFixed(0)}%</td>
                        <td style={{ padding: '3px 5px', textAlign: 'right', color: '#e4e4e7' }}>{t.shares}</td>
                        <td style={{ padding: '3px 5px', textAlign: 'right' }}>{t.pnlR > 0 ? '+' : ''}{t.pnlR.toFixed(1)}R</td>
                        <td style={{ padding: '3px 5px', textAlign: 'right', fontWeight: 600 }}>{t.pnlScaled > 0 ? '+' : ''}${t.pnlScaled.toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* COMPARISON TABLE */}
        <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#fbbf24', fontSize: 15, marginBottom: '1rem' }}>📊 Honest Comparison</h2>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#71717a', borderBottom: '1px solid #333' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Approach</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>PF</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>WR</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>PnL</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Streak</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>DD</th>
              </tr>
            </thead>
            <tbody style={{ color: '#e4e4e7' }}>
              <tr style={{ borderBottom: '1px solid #222' }}>
                <td style={{ padding: '6px 8px', color: '#f87171' }}>❌ Cherry-picked 5 stocks (FAKE)</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>3.88</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>41%</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>$38k</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>11</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>$2,659</td>
              </tr>
              <tr style={{ background: '#22c55e22', fontWeight: 600, borderBottom: '1px solid #222' }}>
                <td style={{ padding: '6px 8px' }}>✅ Rotation Backtest (HONEST)</td>
                <td style={{ textAlign: 'right', padding: '6px 8px', color: '#4ade80' }}>{s.profit_factor}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>{s.win_rate.toFixed(1)}%</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>${s.total_pnl.toLocaleString()}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>{s.max_losing_streak}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>${s.max_drawdown.toLocaleString()}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #222' }}>
                <td style={{ padding: '6px 8px' }}>BT3 Confluence + Regime (275 stocks)</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>1.84</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>30.3%</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>$30,255</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>11</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>$7,992</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ROTATION LOG */}
        {s.rotation_log && s.rotation_log.length > 0 && (
          <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
            <h2 style={{ color: '#fbbf24', fontSize: 15, marginBottom: '0.75rem' }}>🔄 Watchlist Rotation History (sample)</h2>
            <p style={{ color: '#a1a1aa', fontSize: 12, marginBottom: 10 }}>Each month, top 10 by 6-month return are picked. Stocks rotate in/out — no hindsight.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 8 }}>
              {s.rotation_log.slice(0, 12).map(r => (
                <div key={r.month} style={{ fontSize: 12, padding: '4px 8px', background: '#111', borderRadius: 4 }}>
                  <span style={{ color: '#60a5fa', fontWeight: 600 }}>{r.month}:</span>{' '}
                  <span style={{ color: '#a1a1aa' }}>{r.watchlist.join(', ')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PER-STOCK BREAKDOWN */}
        {s.stock_breakdown && (
          <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
            <h2 style={{ color: '#fbbf24', fontSize: 15, marginBottom: '1rem' }}>📋 Per-Stock Results</h2>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: '#71717a', borderBottom: '1px solid #333' }}>
                  <th style={{ textAlign: 'left', padding: '4px 8px' }}>Stock</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px' }}>Trades</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px' }}>Wins</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px' }}>WR%</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px' }}>PnL</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(s.stock_breakdown)
                  .sort((a, b) => b[1].pnl - a[1].pnl)
                  .map(([stock, info]) => (
                    <tr key={stock} style={{ borderBottom: '1px solid #222', color: '#e4e4e7' }}>
                      <td style={{ padding: '4px 8px', fontWeight: 600, color: '#60a5fa' }}>{stock}</td>
                      <td style={{ textAlign: 'right', padding: '4px 8px' }}>{info.trades}</td>
                      <td style={{ textAlign: 'right', padding: '4px 8px' }}>{info.wins}</td>
                      <td style={{ textAlign: 'right', padding: '4px 8px' }}>{(info.wins / info.trades * 100).toFixed(0)}%</td>
                      <td style={{ textAlign: 'right', padding: '4px 8px', color: info.pnl >= 0 ? '#4ade80' : '#f87171' }}>
                        ${Math.round(info.pnl).toLocaleString()}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {/* TRADE LOG */}
        <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ color: '#fbbf24', fontSize: 15, margin: 0 }}>📝 All Trades ({trades.length})</h2>
            <button
              onClick={() => setShowAllTrades(!showAllTrades)}
              style={{ background: '#333', color: '#e4e4e7', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}
            >
              {showAllTrades ? 'Collapse' : 'Expand'}
            </button>
          </div>
          {showAllTrades && (
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: '#71717a', borderBottom: '1px solid #333', position: 'sticky', top: 0, background: '#1e1e2e' }}>
                    <th style={{ textAlign: 'left', padding: '4px 6px' }}>#</th>
                    <th style={{ textAlign: 'left', padding: '4px 6px' }}>Stock</th>
                    <th style={{ textAlign: 'left', padding: '4px 6px' }}>Entry</th>
                    <th style={{ textAlign: 'left', padding: '4px 6px' }}>Exit</th>
                    <th style={{ textAlign: 'right', padding: '4px 6px' }}>Entry$</th>
                    <th style={{ textAlign: 'right', padding: '4px 6px' }}>Exit$</th>
                    <th style={{ textAlign: 'right', padding: '4px 6px' }}>R</th>
                    <th style={{ textAlign: 'right', padding: '4px 6px' }}>PnL</th>
                    <th style={{ textAlign: 'left', padding: '4px 6px' }}>Reason</th>
                    <th style={{ textAlign: 'right', padding: '4px 6px' }}>Days</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #1a1a1a', color: t.pnlDollar >= 0 ? '#4ade80' : '#f87171' }}>
                      <td style={{ padding: '3px 6px', color: '#71717a' }}>{i + 1}</td>
                      <td style={{ padding: '3px 6px', color: '#60a5fa', fontWeight: 500 }}>{t.stock}</td>
                      <td style={{ padding: '3px 6px', color: '#a1a1aa' }}>{t.entryDate}</td>
                      <td style={{ padding: '3px 6px', color: '#a1a1aa' }}>{t.exitDate}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right', color: '#e4e4e7' }}>{t.entryPrice.toFixed(2)}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right', color: '#e4e4e7' }}>{t.exitPrice.toFixed(2)}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right' }}>{t.pnlR.toFixed(1)}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right', fontWeight: 600 }}>${t.pnlDollar.toLocaleString()}</td>
                      <td style={{ padding: '3px 6px', color: '#a1a1aa' }}>{t.exitReason}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right', color: '#71717a' }}>{t.durationDays}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>}

      {/* THE RULES */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#fbbf24', fontSize: 15, marginBottom: '1rem' }}>📏 Trading Rules (Exactly As Backtested)</h2>
        <div style={{ fontSize: 13, color: '#e4e4e7' }}>
          <div style={ruleStyle}><span style={numStyle}>1</span><span><strong>Pool:</strong> 30 mega/large-cap tech stocks, all liquid by Jan 2020 (NVDA, AAPL, MSFT, GOOGL, AMZN, META, TSLA, AMD, CRM, NFLX, AVGO, ADBE, ORCL, QCOM, INTC, CSCO, NOW, UBER, SHOP, PYPL, MRVL, PANW, CRWD, MU, ANET, ZM, DOCU, TWLO, WDAY, EA).</span></div>
          <div style={ruleStyle}><span style={numStyle}>2</span><span><strong>Monthly Rotation:</strong> On the 1st trading day of each month, rank the pool by 6-month return. Your watchlist = top 10.</span></div>
          <div style={ruleStyle}><span style={numStyle}>3</span><span><strong>Regime Check:</strong> SPY must be above its 200-day SMA. If not → 100% cash.</span></div>
          <div style={ruleStyle}><span style={numStyle}>4</span><span><strong>Entry Signal:</strong> Stock closes above its 20-day high + volume ≥ 1.2× 20-day avg volume + close {'>'} 50 SMA.</span></div>
          <div style={ruleStyle}><span style={numStyle}>5</span><span><strong>Stop Loss:</strong> 1 × ATR(14) below entry price. No exceptions.</span></div>
          <div style={ruleStyle}><span style={numStyle}>6</span><span><strong>Position Size:</strong> Risk $200 per trade. Shares = floor($200 ÷ ATR).</span></div>
          <div style={ruleStyle}><span style={numStyle}>7</span><span><strong>Max Positions:</strong> 3 open at any time. Max capital deployed: $40,000.</span></div>
          <div style={ruleStyle}><span style={numStyle}>8</span><span><strong>Trail Activation:</strong> When unrealized profit ≥ 2.5R ($500), activate trailing stop.</span></div>
          <div style={ruleStyle}><span style={numStyle}>9</span><span><strong>Trail Rule:</strong> Trail = EMA(20) − 1×ATR. Ratchets up only.</span></div>
          <div style={{ ...ruleStyle, borderBottom: 'none' }}><span style={numStyle}>10</span><span><strong>One Entry Per Stock:</strong> If stopped out, must wait for next fresh 20-day high breakout.</span></div>
        </div>
      </div>

      {/* DAILY ROUTINE */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#fbbf24', fontSize: 15, marginBottom: '1rem' }}>⏰ Daily Routine (5 min after close)</h2>
        <div style={{ fontSize: 13, color: '#d4d4d8', lineHeight: 1.8 }}>
          <div style={ruleStyle}><span style={numStyle}>1</span><span>Check SPY vs 200 SMA. If below → do nothing.</span></div>
          <div style={ruleStyle}><span style={numStyle}>2</span><span>Scan your top-10 watchlist: any close above 20-day high with 1.2× volume?</span></div>
          <div style={ruleStyle}><span style={numStyle}>3</span><span>If yes + under 3 positions → calculate ATR, set limit buy, set SL.</span></div>
          <div style={ruleStyle}><span style={numStyle}>4</span><span>Check open positions: any hit 2.5R? Activate trail. Update trail (EMA20 − ATR).</span></div>
          <div style={{ ...ruleStyle, borderBottom: 'none' }}><span style={numStyle}>5</span><span>Log in journal. Done.</span></div>
        </div>
      </div>

      {/* MONTHLY ROUTINE */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#fbbf24', fontSize: 15, marginBottom: '1rem' }}>📅 Monthly Routine (1st of month)</h2>
        <div style={{ fontSize: 13, color: '#d4d4d8', lineHeight: 1.8 }}>
          <div style={ruleStyle}><span style={numStyle}>1</span><span>Pull 6-month return for all 30 stocks in the pool.</span></div>
          <div style={ruleStyle}><span style={numStyle}>2</span><span>Rank by return. Top 10 = your watchlist for the month.</span></div>
          <div style={{ ...ruleStyle, borderBottom: 'none' }}><span style={numStyle}>3</span><span>If a stock drops OUT of top 10 but you have an open position → keep it until trail/SL exits.</span></div>
        </div>
      </div>

      {/* MENTAL PREP */}
      <div style={{ background: '#2a1a1a', border: '1px solid #7f1d1d', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#f87171', fontSize: 15, marginBottom: '1rem' }}>🧠 Mental Prep — What 18 Losses Feels Like</h2>
        <div style={{ fontSize: 13, color: '#d4d4d8', lineHeight: 1.7 }}>
          <p style={{ marginBottom: 8 }}>• <strong>75% of trades will lose.</strong> Only 1 in 4 wins. This is NORMAL for this system.</p>
          <p style={{ marginBottom: 8 }}>• <strong>Worst case: 18 losses in a row = ~$3,600 drawdown.</strong> It happened Dec 2021 – Mar 2023 during the bear.</p>
          <p style={{ marginBottom: 8 }}>• <strong>The winners average 5.6R ($1,121 each).</strong> One good NVDA trade pays for 5-6 losses.</p>
          <p style={{ marginBottom: 8 }}>• <strong>Do NOT quit during a streak.</strong> The $4,944 NVDA profit came RIGHT AFTER the 18-loss streak ended.</p>
          <p style={{ marginBottom: 8 }}>• <strong>Do NOT add extra filters.</strong> Confluence reduces PF from 2.0 to 1.8. Simpler is better.</p>
          <p style={{ marginBottom: 0 }}>• <strong>The regime filter saved you from the WORST of 2022.</strong> Without it, streak would be 30+.</p>
        </div>
      </div>

      {/* CIRCUIT BREAKERS */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1.25rem' }}>
        <h2 style={{ color: '#fbbf24', fontSize: 15, marginBottom: '1rem' }}>🛑 Circuit Breakers</h2>
        <div style={{ fontSize: 13, color: '#d4d4d8', lineHeight: 1.7 }}>
          <p style={{ marginBottom: 8 }}>• <strong>SPY drops below 200 SMA:</strong> Close all positions next day. 100% cash until it crosses back.</p>
          <p style={{ marginBottom: 8 }}>• <strong>Drawdown hits $5,000:</strong> Pause 1 week. Review if rules were followed.</p>
          <p style={{ marginBottom: 8 }}>• <strong>6 months, no profit:</strong> Re-run backtest with latest data. Confirm edge still exists.</p>
          <p style={{ marginBottom: 0 }}>• <strong>Broke a rule:</strong> Stop for the day. Journal it. No revenge trades.</p>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, sub, color }) {
  return (
    <div style={{ background: '#111', border: '1px solid #333', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
      <div style={{ color: '#71717a', fontSize: 10 }}>{label}</div>
      <div style={{ color, fontSize: 16, fontWeight: 800 }}>{value}</div>
      {sub && <div style={{ color: '#52525b', fontSize: 10 }}>{sub}</div>}
    </div>
  )
}
