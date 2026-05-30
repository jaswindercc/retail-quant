import { useState, useEffect } from 'react'

export default function SimBacktest5Page() {
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

  const s = data?.summary
  const trades = data?.trades || []
  const equityCurve = data?.equity_curve || []
  const pnls = equityCurve.map(e => e.pnl)
  const maxPnl = Math.max(...pnls, 1)
  const minPnl = Math.min(...pnls, 0)

  function runDynamicRisk(trades, startCapital, riskPctVal) {
    let currentCapital = startCapital, peakCapital = startCapital, maxDD = 0, maxDDPct = 0
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

  function runRiskReduction(trades, startCapital, riskPctVal) {
    let currentCapital = startCapital, peakCapital = startCapital, maxDD = 0, maxDDPct = 0, consecutiveLosses = 0
    const results = []
    for (const t of trades) {
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
      if (t.pnlR < 0) { consecutiveLosses++ } else { consecutiveLosses = 0 }
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
      <h1 style={{ marginBottom: '0.25rem' }}>BT5 — Mega-Cap Rotation</h1>
      <p style={{ color: '#71717a', fontSize: 13, marginBottom: '1.5rem' }}>
        30 mega-cap tech stocks · Monthly rotation (top 10 by 6mo momentum) · SPY {'>'} 200 SMA regime · Breakout entry · Trail exit
      </p>

      {!data && <p style={{ color: '#71717a' }}>Loading...</p>}

      {s && <>
        {/* BASELINE STATS */}
        <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: 11, color: '#71717a', marginBottom: 8 }}>BASELINE (fixed $200/trade) · {s.total_trades} trades · {data?.params?.period}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
            <Stat label="PnL" value={`$${s.total_pnl.toLocaleString()}`} color={s.total_pnl >= 0 ? '#4ade80' : '#f87171'} />
            <Stat label="Profit Factor" value={s.profit_factor.toFixed(2)} color={s.profit_factor >= 1.5 ? '#4ade80' : '#fbbf24'} />
            <Stat label="Win Rate" value={`${s.win_rate.toFixed(1)}%`} color="#60a5fa" />
            <Stat label="Max Streak" value={s.max_losing_streak} color={s.max_losing_streak > 15 ? '#f87171' : '#fbbf24'} />
            <Stat label="Max DD" value={`$${s.max_drawdown.toLocaleString()}`} color="#f87171" />
            <Stat label="Avg Win" value={`${s.avg_r_winner}R`} color="#4ade80" />
          </div>
        </div>

        {/* EQUITY CURVE */}
        {equityCurve.length > 0 && (
          <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
            <svg width="100%" height="100" viewBox={`0 0 ${equityCurve.length} 100`} preserveAspectRatio="none" style={{ display: 'block' }}>
              <line x1="0" y1={((0 - minPnl) / (maxPnl - minPnl)) * -100 + 100} x2={equityCurve.length} y2={((0 - minPnl) / (maxPnl - minPnl)) * -100 + 100} stroke="#333" strokeWidth="0.5" />
              <polyline fill="none" stroke="#4ade80" strokeWidth="1.5"
                points={equityCurve.map((e, i) => `${i},${((e.pnl - minPnl) / (maxPnl - minPnl)) * -100 + 100}`).join(' ')} />
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#71717a', marginTop: 4 }}>
              <span>{equityCurve[0]?.date}</span><span>{equityCurve[equityCurve.length - 1]?.date}</span>
            </div>
          </div>
        )}

        {/* CONFIGURE YOUR RISK */}
        <div style={{ background: '#1e1e2e', border: '1px solid #6366f1', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
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
                <div style={{ color: '#71717a', fontSize: 10 }}>Starting risk/trade</div>
                <div style={{ color: '#4ade80', fontSize: 20, fontWeight: 800 }}>${(capital * riskPct / 100).toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
              </div>
            </div>
          </div>
        </div>

        {/* STUDY 1: DYNAMIC RISK */}
        {dynamic && (
          <div style={{ background: '#1e1e2e', border: '1px solid #4ade80', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
            <h2 style={{ color: '#4ade80', fontSize: 15, marginBottom: '0.5rem' }}>📊 Dynamic Risk ({riskPct}% compounding)</h2>
            <p style={{ color: '#71717a', fontSize: 11, marginBottom: '1rem' }}>Risk = {riskPct}% of current portfolio. Grows with wins, shrinks with losses.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: '1rem' }}>
              <Stat label="Final Capital" value={`$${dynamic.finalCapital.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`+${(dynamic.totalPnl / capital * 100).toFixed(0)}%`} color="#4ade80" />
              <Stat label="Total Return" value={`$${dynamic.totalPnl.toLocaleString(undefined, {maximumFractionDigits: 0})}`} color={dynamic.totalPnl >= 0 ? '#4ade80' : '#f87171'} />
              <Stat label="PF" value={dynamic.pf.toFixed(2)} color={dynamic.pf >= 1.5 ? '#4ade80' : '#fbbf24'} />
              <Stat label="Max DD" value={`$${dynamic.maxDD.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`${dynamic.maxDDPct.toFixed(1)}%`} color="#f87171" />
              <Stat label="Return/DD" value={(dynamic.totalPnl / dynamic.maxDD).toFixed(2)} color="#60a5fa" />
            </div>
            <TradeToggle show={showDynamicTrades} setShow={setShowDynamicTrades} results={dynamic.results} showMult={false} />
          </div>
        )}

        {/* STUDY 2: RISK REDUCTION */}
        {reduction && dynamic && (
          <div style={{ background: '#1e1e2e', border: '1px solid #f59e0b', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
            <h2 style={{ color: '#f59e0b', fontSize: 15, marginBottom: '0.5rem' }}>🛡️ Risk Reduction (Drawdown Protection)</h2>
            <p style={{ color: '#71717a', fontSize: 11, marginBottom: '1rem' }}>Each consecutive loss → reduce risk 10%. Floor 50%. Win resets to 100%.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: '1rem' }}>
              <Stat label="Final Capital" value={`$${reduction.finalCapital.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`+${(reduction.totalPnl / capital * 100).toFixed(0)}%`} color="#4ade80" />
              <Stat label="Total Return" value={`$${reduction.totalPnl.toLocaleString(undefined, {maximumFractionDigits: 0})}`} color={reduction.totalPnl >= 0 ? '#4ade80' : '#f87171'} />
              <Stat label="PF" value={reduction.pf.toFixed(2)} color={reduction.pf >= 1.5 ? '#4ade80' : '#fbbf24'} />
              <Stat label="Max DD" value={`$${reduction.maxDD.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`${reduction.maxDDPct.toFixed(1)}%`} color="#f87171" />
              <Stat label="DD Saved" value={`$${(dynamic.maxDD - reduction.maxDD).toLocaleString(undefined, {maximumFractionDigits: 0})}`} color={reduction.maxDD < dynamic.maxDD ? '#4ade80' : '#f87171'} />
            </div>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginBottom: '1rem' }}>
              <thead>
                <tr style={{ color: '#71717a', borderBottom: '1px solid #333' }}>
                  <th style={{ textAlign: 'left', padding: '4px 6px' }}>Method</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px' }}>Return</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px' }}>PF</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px' }}>Max DD</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px' }}>Return/DD</th>
                </tr>
              </thead>
              <tbody style={{ color: '#e4e4e7' }}>
                <tr style={{ borderBottom: '1px solid #222' }}>
                  <td style={{ padding: '4px 6px' }}>Dynamic</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right' }}>${dynamic.totalPnl.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right' }}>{dynamic.pf.toFixed(2)}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', color: '#f87171' }}>${dynamic.maxDD.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right' }}>{(dynamic.totalPnl / dynamic.maxDD).toFixed(2)}</td>
                </tr>
                <tr style={{ background: '#f59e0b22', fontWeight: 600 }}>
                  <td style={{ padding: '4px 6px', color: '#f59e0b' }}>Reduction</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right' }}>${reduction.totalPnl.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right' }}>{reduction.pf.toFixed(2)}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', color: '#4ade80' }}>${reduction.maxDD.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right' }}>{(reduction.totalPnl / reduction.maxDD).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
            <TradeToggle show={showReductionTrades} setShow={setShowReductionTrades} results={reduction.results} showMult={true} />
          </div>
        )}

        {/* BASELINE TRADES */}
        <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ color: '#71717a', fontSize: 12 }}>Baseline trades (fixed $200) · {trades.length} total</span>
            <button onClick={() => setShowAllTrades(!showAllTrades)}
              style={{ background: '#333', color: '#e4e4e7', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 11 }}>
              {showAllTrades ? 'Hide' : 'Show'}
            </button>
          </div>
          {showAllTrades && (
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: '#71717a', borderBottom: '1px solid #333', position: 'sticky', top: 0, background: '#1e1e2e' }}>
                    <th style={{ textAlign: 'left', padding: '3px 5px' }}>#</th>
                    <th style={{ textAlign: 'left', padding: '3px 5px' }}>Stock</th>
                    <th style={{ textAlign: 'left', padding: '3px 5px' }}>Entry</th>
                    <th style={{ textAlign: 'left', padding: '3px 5px' }}>Exit</th>
                    <th style={{ textAlign: 'right', padding: '3px 5px' }}>R</th>
                    <th style={{ textAlign: 'right', padding: '3px 5px' }}>PnL</th>
                    <th style={{ textAlign: 'left', padding: '3px 5px' }}>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #1a1a1a', color: t.pnlDollar >= 0 ? '#4ade80' : '#f87171' }}>
                      <td style={{ padding: '3px 5px', color: '#71717a' }}>{i + 1}</td>
                      <td style={{ padding: '3px 5px', color: '#60a5fa' }}>{t.stock}</td>
                      <td style={{ padding: '3px 5px', color: '#a1a1aa' }}>{t.entryDate}</td>
                      <td style={{ padding: '3px 5px', color: '#a1a1aa' }}>{t.exitDate}</td>
                      <td style={{ padding: '3px 5px', textAlign: 'right' }}>{t.pnlR.toFixed(1)}</td>
                      <td style={{ padding: '3px 5px', textAlign: 'right', fontWeight: 600 }}>${t.pnlDollar.toLocaleString()}</td>
                      <td style={{ padding: '3px 5px', color: '#71717a' }}>{t.exitReason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>}
    </div>
  )
}

function Stat({ label, value, sub, color }) {
  return (
    <div style={{ background: '#111', border: '1px solid #222', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
      <div style={{ color: '#71717a', fontSize: 10 }}>{label}</div>
      <div style={{ color, fontSize: 16, fontWeight: 800 }}>{value}</div>
      {sub && <div style={{ color: '#52525b', fontSize: 10 }}>{sub}</div>}
    </div>
  )
}

function TradeToggle({ show, setShow, results, showMult }) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#71717a' }}>{results.length} trades</span>
        <button onClick={() => setShow(!show)}
          style={{ background: '#333', color: '#e4e4e7', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 11 }}>
          {show ? 'Hide' : 'Show Trades'}
        </button>
      </div>
      {show && (
        <div style={{ maxHeight: 350, overflowY: 'auto', marginTop: 8 }}>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#71717a', borderBottom: '1px solid #333', position: 'sticky', top: 0, background: '#1e1e2e' }}>
                <th style={{ textAlign: 'left', padding: '3px 5px' }}>#</th>
                <th style={{ textAlign: 'left', padding: '3px 5px' }}>Stock</th>
                <th style={{ textAlign: 'left', padding: '3px 5px' }}>Date</th>
                <th style={{ textAlign: 'right', padding: '3px 5px' }}>Capital</th>
                <th style={{ textAlign: 'right', padding: '3px 5px' }}>Risk$</th>
                {showMult && <th style={{ textAlign: 'center', padding: '3px 5px' }}>Mult</th>}
                <th style={{ textAlign: 'right', padding: '3px 5px' }}>R</th>
                <th style={{ textAlign: 'right', padding: '3px 5px' }}>P/L</th>
              </tr>
            </thead>
            <tbody>
              {results.map((t, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #1a1a1a', color: t.pnlScaled >= 0 ? '#4ade80' : '#f87171' }}>
                  <td style={{ padding: '3px 5px', color: '#71717a' }}>{i + 1}</td>
                  <td style={{ padding: '3px 5px', color: '#60a5fa' }}>{t.stock}</td>
                  <td style={{ padding: '3px 5px', color: '#a1a1aa' }}>{t.entryDate}</td>
                  <td style={{ padding: '3px 5px', textAlign: 'right', color: '#71717a' }}>${t.capitalAtEntry.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                  <td style={{ padding: '3px 5px', textAlign: 'right', color: '#6366f1' }}>${t.riskDollars.toFixed(0)}</td>
                  {showMult && <td style={{ padding: '3px 5px', textAlign: 'center', color: t.riskMult < 1 ? '#f59e0b' : '#71717a' }}>{(t.riskMult * 100).toFixed(0)}%</td>}
                  <td style={{ padding: '3px 5px', textAlign: 'right' }}>{t.pnlR > 0 ? '+' : ''}{t.pnlR.toFixed(1)}R</td>
                  <td style={{ padding: '3px 5px', textAlign: 'right', fontWeight: 600 }}>{t.pnlScaled > 0 ? '+' : ''}${t.pnlScaled.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
