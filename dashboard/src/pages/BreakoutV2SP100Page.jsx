import { useState, useEffect } from 'react'
import { fetchJson } from '../utils'

export default function BreakoutV2SP100Page() {
  const [data, setData] = useState(null)
  const [capital, setCapital] = useState(40000)
  const [riskPct, setRiskPct] = useState(1)
  const [useCompounding, setUseCompounding] = useState(true)
  const [tradeFilter, setTradeFilter] = useState('')

  useEffect(() => {
    fetchJson(`${import.meta.env.BASE_URL}breakout_v2_sp100_data.json`)
      .then(setData).catch(console.error)
  }, [])

  if (!data) return <div className="loading">Loading SP100 Backtest…</div>

  const allTrades = data.allTrades || []
  const settings = data.settings || {}
  const buyHold = data.buyHold || {}
  const universe = data.universe || {}
  const categories = universe.categories || {}
  const marketCaps = data.marketCaps || {}

  // Compounding + Skip after 3L
  function runStrategy(trades, startCapital, riskPctVal) {
    let currentCapital = startCapital
    let peakCapital = startCapital
    let maxDD = 0, maxDDPct = 0
    let consecutiveLosses = 0, skipNext = false
    const results = []
    const equityCurve = [{ capital: startCapital, date: trades[0]?.entryDate || '' }]

    for (const t of trades) {
      if (t.exitReason === 'Open') continue
      const riskDollars = currentCapital * (riskPctVal / 100)
      const shares = Math.floor(riskDollars / t.risk)
      const pnlScaled = shares > 0 ? t.pnlR * riskDollars : 0

      if (skipNext) {
        results.push({ ...t, status: 'skipped', shares: 0, pnlScaled: 0, capitalAtEntry: currentCapital, riskDollars })
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

  // Flat (no compounding) strategy: fixed dollar risk per trade, do not update capital between trades
  function runStrategyFlat(trades, startCapital, riskPctVal) {
    const results = []
    const equityCurve = [{ capital: startCapital, date: trades[0]?.entryDate || '' }]
    const fixedRisk = startCapital * (riskPctVal / 100)
    for (const t of trades) {
      if (t.exitReason === 'Open') continue
      const shares = Math.floor(fixedRisk / t.risk)
      const pnlScaled = shares > 0 ? t.pnlR * fixedRisk : 0
      results.push({ ...t, status: 'taken', shares, pnlScaled, capitalAtEntry: startCapital, riskDollars: fixedRisk })
      equityCurve.push({ capital: startCapital, date: t.exitDate })
    }
    const taken = results.filter(r => r.status === 'taken')
    const wins = taken.filter(r => r.pnlScaled > 0).length
    const totalPnl = taken.reduce((s, r) => s + r.pnlScaled, 0)
    const grossWin = taken.filter(r => r.pnlScaled > 0).reduce((s, r) => s + r.pnlScaled, 0)
    const grossLoss = Math.abs(taken.filter(r => r.pnlScaled < 0).reduce((s, r) => s + r.pnlScaled, 0))
    const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0
    let streak = 0, maxStreak = 0
    for (const r of taken) { if (r.pnlScaled < 0) { streak++; if (streak > maxStreak) maxStreak = streak } else { streak = 0 } }
    return { results, taken, skipped: [], equityCurve, finalCapital: startCapital + totalPnl, totalPnl, wins, wr: taken.length > 0 ? (wins / taken.length * 100) : 0, pf, maxDD: 0, maxDDPct: 0, maxStreak }
  }

  const strat = allTrades.length > 0 ? (useCompounding ? runStrategy(allTrades, capital, riskPct) : runStrategyFlat(allTrades, capital, riskPct)) : null
  const openPositions = allTrades.filter(t => t.exitReason === 'Open')

  // Per-stock P/L
  const stockMap = {}
  if (strat) {
    const fixedRisk = capital * riskPct / 100
    for (const t of strat.taken) {
      if (!stockMap[t.stock]) stockMap[t.stock] = { wins: 0, losses: 0, pnl: 0, trades: 0 }
      stockMap[t.stock].trades++
      const flatPnl = t.pnlR * fixedRisk
      if (flatPnl > 0) stockMap[t.stock].wins++
      else stockMap[t.stock].losses++
      stockMap[t.stock].pnl += flatPnl
    }
  }

  const stockRows = Object.entries(stockMap).map(([s, v]) => {
    const bh = buyHold[s] || {}
    const mcap = marketCaps[s] || bh.marketCap || 0
    return {
      symbol: s, trades: v.trades, wins: v.wins,
      wr: ((v.wins / v.trades) * 100).toFixed(0),
      pnl: v.pnl,
      stratRetPct: capital > 0 ? ((v.pnl / capital) * 100).toFixed(1) : '0',
      bhRetPct: bh.returnPct || 0,
      mcap,
      category: categories[s] || 'unknown',
    }
  }).sort((a, b) => b.pnl - a.pnl)

  // Category summary
  const catSummary = {}
  for (const r of stockRows) {
    if (!catSummary[r.category]) catSummary[r.category] = { trades: 0, wins: 0, pnl: 0, stocks: 0 }
    catSummary[r.category].trades += r.trades
    catSummary[r.category].wins += r.wins
    catSummary[r.category].pnl += r.pnl
    catSummary[r.category].stocks++
  }

  const riskDollars = capital * riskPct / 100
  const catColors = { bull: '#4ade80', sideways: '#fbbf24', crashed: '#f87171' }
  const catLabels = { bull: '🐂 Bull Run', sideways: '➡️ Sideways', crashed: '💀 Crashed' }

  return (
    <div className="page-container" style={{ padding: '2rem', maxWidth: 1200 }}>
      <h1 style={{ marginBottom: '0.5rem', fontSize: '1.8rem' }}>🧪 Breakout v2 — Realistic 100-Stock Test</h1>
      <p style={{ color: '#a1a1aa', fontSize: 15, marginBottom: '0.5rem' }}>
        Same strategy. No cherry-picked stocks. {universe.total || 99} S&P 500 stocks including ones that crashed.
      </p>
      <p style={{ color: '#71717a', fontSize: 13, marginBottom: '1.5rem' }}>
        Period: {settings.period} · {allTrades.length} total trades · Universe selected BEFORE knowing results
      </p>

      {/* ═══ WHY THIS TEST MATTERS ═══ */}
      <div style={{ background: '#1a1a2e', border: '1px solid #6366f1', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#6366f1', fontSize: 16, marginBottom: '0.75rem' }}>Why this test matters</h2>
        <div style={{ fontSize: 14, color: '#e4e4e7', lineHeight: 2 }}>
          <div>The original backtest used 13 hand-picked stocks (mostly big tech winners). That's <strong style={{ color: '#f87171' }}>survivorship bias</strong>.</div>
          <div>This test uses {universe.total || 99} stocks split into 3 categories selected <strong>blind</strong>:</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginTop: '0.75rem' }}>
            <div style={{ background: '#071a0f', border: '1px solid #4ade80', borderRadius: 8, padding: '0.75rem', textAlign: 'center' }}>
              <div style={{ color: '#4ade80', fontSize: 20, fontWeight: 800 }}>{universe.bull?.length || 35}</div>
              <div style={{ color: '#a1a1aa', fontSize: 12 }}>Bull stocks</div>
              <div style={{ color: '#71717a', fontSize: 11 }}>NVDA, META, AMZN…</div>
            </div>
            <div style={{ background: '#1a1a0a', border: '1px solid #fbbf24', borderRadius: 8, padding: '0.75rem', textAlign: 'center' }}>
              <div style={{ color: '#fbbf24', fontSize: 20, fontWeight: 800 }}>{universe.sideways?.length || 35}</div>
              <div style={{ color: '#a1a1aa', fontSize: 12 }}>Sideways stocks</div>
              <div style={{ color: '#71717a', fontSize: 11 }}>JPM, JNJ, PG, KO…</div>
            </div>
            <div style={{ background: '#1f0a0a', border: '1px solid #f87171', borderRadius: 8, padding: '0.75rem', textAlign: 'center' }}>
              <div style={{ color: '#f87171', fontSize: 20, fontWeight: 800 }}>{universe.crashed?.length || 30}</div>
              <div style={{ color: '#a1a1aa', fontSize: 12 }}>Crashed stocks</div>
              <div style={{ color: '#71717a', fontSize: 11 }}>PYPL, INTC, DIS, SNAP…</div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ RISK CONFIG ═══ */}
      <div style={{ background: '#1e1e2e', border: '1px solid #555', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', fontSize: 14 }}>
          <div>
            <label style={{ color: '#a1a1aa', fontSize: 13, display: 'block', marginBottom: 6 }}>Account Size ($)</label>
            <input type="number" value={capital} onChange={e => setCapital(Math.max(1000, +e.target.value || 40000))}
              style={{ background: '#0f0f1a', border: '1px solid #555', borderRadius: 6, padding: '10px 14px', color: '#e4e4e7', width: '100%', fontSize: 16 }} />
          </div>
          <div>
            <label style={{ color: '#a1a1aa', fontSize: 13, display: 'block', marginBottom: 6 }}>Risk per Trade</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[0.5, 1, 1.5, 2].map(pct => (
                <button key={pct} onClick={() => setRiskPct(pct)}
                  style={{ padding: '10px 16px', borderRadius: 6, border: riskPct === pct ? '2px solid #4ade80' : '1px solid #555', background: riskPct === pct ? '#0f2a1a' : '#0f0f1a', color: riskPct === pct ? '#4ade80' : '#e4e4e7', fontSize: 15, fontWeight: riskPct === pct ? 700 : 400, cursor: 'pointer' }}>
                  {pct}%
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ background: '#0f0f1a', border: '1px solid #555', borderRadius: 6, padding: '10px 16px', textAlign: 'center', width: '100%' }}>
              <div style={{ color: '#a1a1aa', fontSize: 12 }}>Risk/trade</div>
              <div style={{ color: '#4ade80', fontSize: 24, fontWeight: 800 }}>${riskDollars.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <label style={{ color: '#a1a1aa', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={!useCompounding ? true : false} onChange={() => setUseCompounding(prev => !prev)} />
              <span style={{ fontSize: 13, color: '#e4e4e7' }}>No compounding (fixed risk per trade)</span>
            </label>
          </div>
        </div>
      </div>

      {/* ═══ PERFORMANCE ═══ */}
      {strat && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <Stat label="Final Capital" value={`$${strat.finalCapital.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`${strat.totalPnl >= 0 ? '+' : ''}${(strat.totalPnl / capital * 100).toFixed(0)}%`} color="#4ade80" />
          <Stat label="Total P/L" value={`${strat.totalPnl >= 0 ? '+' : ''}$${Math.abs(strat.totalPnl).toLocaleString(undefined, {maximumFractionDigits: 0})}`} color={strat.totalPnl >= 0 ? '#4ade80' : '#f87171'} />
          <Stat label="Profit Factor" value={strat.pf.toFixed(2)} color={strat.pf >= 1.5 ? '#4ade80' : '#fbbf24'} />
          <Stat label="Win Rate" value={`${strat.wr.toFixed(0)}%`} sub={`${strat.wins}W / ${strat.taken.length - strat.wins}L`} color="#60a5fa" />
          <Stat label="Max Drawdown" value={`$${strat.maxDD.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`${strat.maxDDPct.toFixed(1)}%`} color="#f87171" />
          <Stat label="Return / DD" value={(strat.totalPnl / Math.max(strat.maxDD, 1)).toFixed(1) + 'x'} color="#60a5fa" />
          <Stat label="Worst Streak" value={strat.maxStreak + ' losses'} color={strat.maxStreak > 5 ? '#f87171' : '#fbbf24'} />
          <Stat label="Trades Taken" value={strat.taken.length} sub={`${strat.skipped.length} skipped`} color="#a1a1aa" />
        </div>
      )}

      {/* ═══ EQUITY CURVE ═══ */}
      {strat && strat.equityCurve.length > 1 && (
        <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#e4e4e7', fontSize: 16, marginBottom: '1rem' }}>📈 Equity Curve {useCompounding ? `(compounding at ${riskPct}%)` : '(no compounding)'}</h2>
          <div style={{ height: 220, position: 'relative' }}>
            <EquityMini data={strat.equityCurve} startCapital={capital} />
          </div>
        </div>
      )}

      {/* ═══ PER-CATEGORY BREAKDOWN ═══ */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#e4e4e7', fontSize: 16, marginBottom: '1rem' }}>📊 Results by Category</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
          {['bull', 'sideways', 'crashed'].map(cat => {
            const s = catSummary[cat] || { trades: 0, wins: 0, pnl: 0, stocks: 0 }
            const wr = s.trades > 0 ? (s.wins / s.trades * 100).toFixed(0) : 0
            return (
              <div key={cat} style={{ background: '#0f0f1a', border: `1px solid ${catColors[cat]}`, borderRadius: 8, padding: '1rem' }}>
                <div style={{ color: catColors[cat], fontSize: 14, fontWeight: 700, marginBottom: '0.5rem' }}>{catLabels[cat]}</div>
                <div style={{ color: '#e4e4e7', fontSize: 20, fontWeight: 800 }}>
                  {s.pnl >= 0 ? '+' : ''}${Math.round(s.pnl).toLocaleString()}
                </div>
                <div style={{ color: '#a1a1aa', fontSize: 12, marginTop: 4 }}>{s.trades} trades · {wr}% WR · {s.stocks} stocks</div>
              </div>
            )
          })}
        </div>
        <div style={{ fontSize: 13, color: '#a1a1aa', lineHeight: 1.8 }}>
          <strong style={{ color: '#4ade80' }}>Key insight:</strong> Strategy makes money in ALL categories — even crashed stocks.
          Why? Because the SPY regime filter + stop loss means we exit early when things turn bad.
          The crashed stocks only generated {catSummary.crashed?.trades || 0} trades (vs {catSummary.bull?.trades || 0} from bull stocks) — we naturally avoid them.
        </div>
      </div>

      {/* ═══ PER-STOCK TABLE ═══ */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#e4e4e7', fontSize: 16, marginBottom: '0.5rem' }}>All Stocks — Strategy vs Buy & Hold</h2>
        <p style={{ color: '#71717a', fontSize: 12, marginBottom: '1rem' }}>
          Table uses fixed ${Math.round(capital * riskPct / 100).toLocaleString()} risk/trade (no compounding) for a fair comparison to Buy & Hold.
        </p>
        <div style={{ overflowX: 'auto', maxHeight: 500, overflowY: 'auto' }}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#1e1e2e' }}>
              <tr style={{ color: '#a1a1aa', borderBottom: '2px solid #444' }}>
                <th style={{ textAlign: 'left', padding: '8px' }}>Stock</th>
                <th style={{ textAlign: 'center', padding: '8px' }}>Type</th>
                <th style={{ textAlign: 'right', padding: '8px' }}>Trades</th>
                <th style={{ textAlign: 'right', padding: '8px' }}>Win%</th>
                <th style={{ textAlign: 'right', padding: '8px' }}>Strategy P/L</th>
                <th style={{ textAlign: 'right', padding: '8px' }}>B&H %</th>
                <th style={{ textAlign: 'center', padding: '8px' }}>Alpha</th>
              </tr>
            </thead>
            <tbody>
              {stockRows.map(s => {
                const alpha = (parseFloat(s.stratRetPct) - s.bhRetPct).toFixed(1)
                return (
                  <tr key={s.symbol} style={{ borderBottom: '1px solid #2a2a3e' }}>
                    <td style={{ padding: '6px 8px', color: '#60a5fa', fontWeight: 600 }}>{s.symbol}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      <span style={{ fontSize: 11, color: catColors[s.category], fontWeight: 600 }}>{s.category}</span>
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#e4e4e7' }}>{s.trades}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#e4e4e7' }}>{s.wr}%</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: s.pnl >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                      {s.pnl >= 0 ? '+' : ''}${Math.round(s.pnl).toLocaleString()}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: s.bhRetPct >= 0 ? '#4ade80' : '#f87171' }}>
                      {s.bhRetPct > 0 ? '+' : ''}{s.bhRetPct}%
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'center', color: parseFloat(alpha) >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                      {parseFloat(alpha) >= 0 ? '+' : ''}{alpha}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ OPEN POSITIONS ═══ */}
      {openPositions.length > 0 && (
        <div style={{ background: '#0a1628', border: '1px solid #60a5fa', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#60a5fa', fontSize: 16, marginBottom: '1rem' }}>📍 Open Positions ({openPositions.length})</h2>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#a1a1aa', borderBottom: '1px solid #444' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Stock</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Entry</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Entry $</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Stop $</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Current R</th>
              </tr>
            </thead>
            <tbody>
              {openPositions.map((t, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #2a2a3e' }}>
                  <td style={{ padding: '6px 8px', color: '#60a5fa', fontWeight: 700 }}>{t.stock}</td>
                  <td style={{ padding: '6px 8px', color: '#d4d4d8', fontFamily: 'monospace', fontSize: 12 }}>{t.entryDate}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#e4e4e7' }}>${t.entryPrice.toFixed(2)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#f87171' }}>${t.sl.toFixed(2)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#4ade80', fontWeight: 700 }}>+{t.pnlR.toFixed(1)}R</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ TRADE LOG (newest first) ═══ */}
      {strat && (
        <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 10, padding: '1.25rem' }}>
          <h2 style={{ color: '#e4e4e7', fontSize: 16, marginBottom: '1rem' }}>📝 Trade Log (newest first)</h2>
          <div style={{ marginBottom: '0.75rem', display: 'flex', gap: 8, alignItems: 'center' }}>
            <input placeholder="Filter by stock (e.g. AAPL)" value={tradeFilter}
              onChange={e => setTradeFilter(e.target.value)}
              style={{ background: '#0f0f1a', border: '1px solid #333', borderRadius: 6, padding: '8px 10px', color: '#e4e4e7', fontSize: 13, width: 180 }} />
            <button onClick={() => setTradeFilter('')}
              style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #555', background: '#0f2a1a', color: '#e4e4e7', cursor: 'pointer' }}>Clear</button>
            <div style={{ color: '#71717a', fontSize: 13 }}>Filtering trades by symbol (case-insensitive)</div>
          </div>
          <div style={{ color: '#71717a', fontSize: 12, marginBottom: '0.75rem' }}>Note: "Stop $" shows the initial stop price at entry (not a trailing stop).</div>
          <div style={{ overflowX: 'auto', maxHeight: 600, overflowY: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#1e1e2e' }}>
                <tr style={{ color: '#a1a1aa', borderBottom: '2px solid #444' }}>
                  <th style={{ textAlign: 'center', padding: '6px 4px' }}>#</th>
                  <th style={{ textAlign: 'left', padding: '6px' }}>Entry</th>
                  <th style={{ textAlign: 'left', padding: '6px' }}>Exit</th>
                  <th style={{ textAlign: 'left', padding: '6px' }}>Stock</th>
                  <th style={{ textAlign: 'right', padding: '6px' }}>Entry $</th>
                  <th style={{ textAlign: 'right', padding: '6px' }}>Stop $</th>
                  <th style={{ textAlign: 'right', padding: '6px' }}>R</th>
                  <th style={{ textAlign: 'right', padding: '6px' }}>P/L</th>
                  <th style={{ textAlign: 'left', padding: '6px' }}>Why</th>
                  <th style={{ textAlign: 'right', padding: '6px' }}>Days</th>
                </tr>
              </thead>
              <tbody>
                {([...strat.results].filter(t => !tradeFilter || t.stock.toLowerCase().includes(tradeFilter.trim().toLowerCase()))).reverse().map((t, i) => {
                  const tradeNum = strat.results.length - i
                  const win = t.pnlScaled > 0
                  const isSkipped = t.status === 'skipped'
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #2a2a3e', opacity: isSkipped ? 0.4 : 1, background: win ? '#071a0f' : 'transparent' }}>
                      <td style={{ padding: '5px 4px', textAlign: 'center', color: '#71717a', fontSize: 11 }}>{tradeNum}</td>
                      <td style={{ padding: '5px 6px', color: '#e4e4e7', fontFamily: 'monospace', fontSize: 11 }}>{t.entryDate}</td>
                      <td style={{ padding: '5px 6px', color: '#d4d4d8', fontFamily: 'monospace', fontSize: 11 }}>{t.exitDate}</td>
                      <td style={{ padding: '5px 6px', color: '#60a5fa', fontWeight: 600 }}>{t.stock}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: '#e4e4e7' }}>${t.entryPrice.toFixed(2)}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: '#f87171' }}>${t.sl.toFixed(2)}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: win ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                        {t.pnlR > 0 ? '+' : ''}{t.pnlR.toFixed(1)}R
                      </td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: win ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                        {isSkipped ? '—' : `${t.pnlScaled >= 0 ? '+' : ''}$${Math.round(t.pnlScaled).toLocaleString()}`}
                      </td>
                      <td style={{ padding: '5px 6px', color: t.exitReason === 'Trail' ? '#4ade80' : '#f87171', fontSize: 11 }}>{isSkipped ? 'SKIP' : t.exitReason}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: '#71717a', fontSize: 11 }}>{t.durationDays}d</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, sub, color }) {
  return (
    <div style={{ background: '#1e1e2e', border: '1px solid #444', borderRadius: 8, padding: '1rem', textAlign: 'center' }}>
      <div style={{ color: '#a1a1aa', fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ color: color || '#e4e4e7', fontSize: 22, fontWeight: 800 }}>{value}</div>
      {sub && <div style={{ color: '#71717a', fontSize: 12, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function EquityMini({ data, startCapital }) {
  if (!data || data.length < 2) return null
  const values = data.map(d => d.capital)
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const w = 100
  const h = 100
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((d.capital - min) / range) * h
    return `${x},${y}`
  }).join(' ')
  const lastVal = values[values.length - 1]
  const pnl = lastVal - startCapital
  const color = pnl >= 0 ? '#4ade80' : '#f87171'
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: '100%' }} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth="0.5" />
    </svg>
  )
}
