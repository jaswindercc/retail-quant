import { useState, useEffect } from 'react'
import { fetchJson } from '../utils'

export default function BreakoutV2Page() {
  const [data, setData] = useState(null)
  const [capital, setCapital] = useState(40000)
  const [riskPct, setRiskPct] = useState(1)
  const [sortCol, setSortCol] = useState('pnl')
  const [sortDir, setSortDir] = useState('desc')

  useEffect(() => {
    fetchJson(`${import.meta.env.BASE_URL}breakout_v2_sp100_data.json`)
      .then(setData).catch(console.error)
  }, [])

  if (!data) return <div className="loading">Loading Breakout v2…</div>

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
      let shares = Math.floor(riskDollars / t.risk)
      // CAP: position value must never exceed current capital
      const maxSharesByCapital = Math.floor(currentCapital / t.entryPrice)
      if (shares > maxSharesByCapital) shares = maxSharesByCapital
      const positionValue = shares * t.entryPrice
      const pnlScaled = shares > 0 ? shares * t.risk * t.pnlR : 0

      if (skipNext) {
        results.push({ ...t, status: 'skipped', shares: 0, pnlScaled: 0, capitalAtEntry: currentCapital, riskDollars, positionValue: 0 })
        skipNext = false
        consecutiveLosses = 0
        equityCurve.push({ capital: currentCapital, date: t.exitDate })
        continue
      }

      results.push({ ...t, status: 'taken', shares, pnlScaled, capitalAtEntry: currentCapital, riskDollars, positionValue })
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

  const strat = allTrades.length > 0 ? runStrategy(allTrades, capital, riskPct) : null
  const openPositions = allTrades.filter(t => t.exitReason === 'Open')
  const riskDollars = capital * riskPct / 100

  // Per-stock
  const stockMap = {}
  if (strat) {
    for (const t of strat.taken) {
      if (!stockMap[t.stock]) stockMap[t.stock] = { wins: 0, losses: 0, pnl: 0, trades: 0 }
      stockMap[t.stock].trades++
      if (t.pnlScaled > 0) stockMap[t.stock].wins++
      else stockMap[t.stock].losses++
      stockMap[t.stock].pnl += t.pnlScaled
    }
  }
  const stockRows = Object.entries(stockMap).map(([s, v]) => {
    const bh = buyHold[s] || {}
    const mcap = marketCaps[s] || bh.marketCap || 0
    // B&H $ amount: equal-weight allocation across all stocks
    const numStocks = Object.keys(stockMap).length
    const perStockAlloc = capital / numStocks
    const bhDollar = bh.returnPct ? perStockAlloc * (bh.returnPct / 100) : 0
    return {
      symbol: s, trades: v.trades, wins: v.wins,
      wr: Math.round((v.wins / v.trades) * 100),
      pnl: v.pnl,
      stratRetPct: capital > 0 ? parseFloat(((v.pnl / capital) * 100).toFixed(1)) : 0,
      bhRetPct: bh.returnPct || 0,
      bhDollar,
      mcap,
      category: categories[s] || 'unknown',
    }
  })

  // Sort stock rows
  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }
  const sortedStockRows = [...stockRows].sort((a, b) => {
    let av = a[sortCol], bv = b[sortCol]
    if (typeof av === 'string') av = av.toLowerCase()
    if (typeof bv === 'string') bv = bv.toLowerCase()
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const catColors = { bull: '#4ade80', sideways: '#fbbf24', crashed: '#f87171' }
  const catSummary = {}
  for (const r of stockRows) {
    if (!catSummary[r.category]) catSummary[r.category] = { trades: 0, wins: 0, pnl: 0, stocks: 0 }
    catSummary[r.category].trades += r.trades
    catSummary[r.category].wins += r.wins
    catSummary[r.category].pnl += r.pnl
    catSummary[r.category].stocks++
  }

  return (
    <div className="page-container" style={{ padding: '2rem', maxWidth: 1200 }}>

      {/* ═══ HEADER ═══ */}
      <h1 style={{ marginBottom: '0.5rem', fontSize: '1.8rem' }}>🚀 Breakout v2 — Tested on 100 S&P 500 Stocks</h1>
      <p style={{ color: '#a1a1aa', fontSize: 15, marginBottom: '1.5rem' }}>
        {universe.total || 99} stocks · {settings.period} · No cherry-picking · Includes stocks that crashed
      </p>

      {/* ═══ HONEST ASSESSMENT ═══ */}
      <div style={{ background: '#1a1a2e', border: '1px solid #a78bfa', borderRadius: 12, padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#a78bfa', fontSize: 18, marginBottom: '1rem' }}>🧠 Honest Assessment</h2>
        <div style={{ fontSize: 14, color: '#e4e4e7', lineHeight: 2.2 }}>
          <div style={{ marginBottom: '1rem' }}>
            <strong style={{ color: '#4ade80' }}>What's real:</strong>
            <div style={{ paddingLeft: '1rem' }}>
              <div>• PF 2.42 on 99 blind-picked stocks. Not spectacular, but robust.</div>
              <div>• Avg win $644 vs avg loss $108 — 6:1 payoff ratio. That's why 29% WR still makes money.</div>
              <div>• Works on ALL categories — even crashed stocks were profitable (strategy avoids them naturally).</div>
              <div>• The edge isn't stock-picking. It's the system: regime filter + stops + trailing.</div>
            </div>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <strong style={{ color: '#f87171' }}>What's hard:</strong>
            <div style={{ paddingLeft: '1rem' }}>
              <div>• 29% win rate = you lose 7 out of 10 trades. Psychologically brutal. Most people quit.</div>
              <div>• 15% of trades lose more than 1R due to gap-downs. Budget for occasional 2-3R hits.</div>
              <div>• The backtest can't simulate your execution — no FOMO, no hesitation after 5 losses.</div>
              <div>• Max 5 positions from 100 stocks = you'll miss signals. Need a nightly scan + ranking.</div>
            </div>
          </div>
          <div>
            <strong style={{ color: '#fbbf24' }}>How to start:</strong>
            <div style={{ paddingLeft: '1rem' }}>
              <div>• Start at <strong>0.5% risk</strong> until you've taken 20+ trades and verified fills match assumptions.</div>
              <div>• It's mechanical — use alerts/scanners, don't override the rules.</div>
              <div>• The 3-loss skip rule keeps you alive. Never bypass it.</div>
              <div>• You don't need to pick stocks. Just scan S&P 500 nightly for breakout signals.</div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ THE RULES (simple) ═══ */}
      <div style={{ background: '#0f2a1a', border: '2px solid #4ade80', borderRadius: 12, padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#4ade80', fontSize: 18, marginBottom: '1rem' }}>📋 What to Do — Daily</h2>
        <div style={{ fontSize: 15, lineHeight: 2.4, color: '#e4e4e7' }}>
          <div><strong>1.</strong> Is SPY above its 200-day average? <strong style={{ color: '#f87171' }}>No → do nothing.</strong></div>
          <div><strong>2.</strong> Any stock close above its 20-day high with above-average volume + strong close?</div>
          <div><strong>3.</strong> Next morning: opens at or above that level? → <strong style={{ color: '#4ade80' }}>BUY</strong></div>
          <div><strong>4.</strong> Stop = entry − ATR. Shares = ${riskDollars.toLocaleString(undefined, {maximumFractionDigits: 0})} ÷ ATR</div>
          <div><strong>5.</strong> At +2R → trailing stop kicks in (EMA20 − ATR). Let it ride.</div>
          <div><strong>6.</strong> Max 5 positions. Lost 3 in a row → skip next signal.</div>
        </div>

        <div style={{ borderTop: '1px solid #2a5e3a', marginTop: '1.25rem', paddingTop: '1rem' }}>
          <h3 style={{ color: '#f87171', fontSize: 15, marginBottom: '0.5rem' }}>🚫 Don't</h3>
          <div style={{ fontSize: 14, color: '#fca5a5', lineHeight: 2 }}>
            <span>Chase gaps • Move stops down • Take profits early • Trade in bear market • Hold 6+ positions • Override skip rule</span>
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
        </div>
      </div>

      {/* ═══ STATS ═══ */}
      {strat && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <Stat label="Final Capital" value={`$${strat.finalCapital.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`${strat.totalPnl >= 0 ? '+' : ''}${(strat.totalPnl / capital * 100).toFixed(0)}%`} color="#4ade80" />
          <Stat label="Total P/L" value={`${strat.totalPnl >= 0 ? '+' : ''}$${Math.abs(strat.totalPnl).toLocaleString(undefined, {maximumFractionDigits: 0})}`} color={strat.totalPnl >= 0 ? '#4ade80' : '#f87171'} />
          <Stat label="Profit Factor" value={strat.pf.toFixed(2)} color={strat.pf >= 1.5 ? '#4ade80' : '#fbbf24'} />
          <Stat label="Win Rate" value={`${strat.wr.toFixed(0)}%`} sub={`${strat.wins}W / ${strat.taken.length - strat.wins}L`} color="#60a5fa" />
          <Stat label="Max Drawdown" value={`$${strat.maxDD.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`${strat.maxDDPct.toFixed(1)}%`} color="#f87171" />
          <Stat label="Return / DD" value={(strat.totalPnl / Math.max(strat.maxDD, 1)).toFixed(1) + 'x'} color="#60a5fa" />
          <Stat label="Worst Streak" value={strat.maxStreak + ' losses'} color={strat.maxStreak > 5 ? '#f87171' : '#fbbf24'} />
          <Stat label="Trades" value={strat.taken.length} sub={`${strat.skipped.length} skipped`} color="#a1a1aa" />
        </div>
      )}

      {/* ═══ EQUITY CURVE ═══ */}
      {strat && strat.equityCurve.length > 1 && (
        <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#e4e4e7', fontSize: 16, marginBottom: '1rem' }}>📈 Equity Curve</h2>
          <div style={{ height: 220, position: 'relative' }}>
            <EquityMini data={strat.equityCurve} startCapital={capital} />
          </div>
        </div>
      )}

      {/* ═══ CATEGORY BREAKDOWN ═══ */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#e4e4e7', fontSize: 16, marginBottom: '1rem' }}>Results by Stock Type</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
          {['bull', 'sideways', 'crashed'].map(cat => {
            const s = catSummary[cat] || { trades: 0, wins: 0, pnl: 0, stocks: 0 }
            const wr = s.trades > 0 ? (s.wins / s.trades * 100).toFixed(0) : 0
            return (
              <div key={cat} style={{ background: '#0f0f1a', border: `1px solid ${catColors[cat]}`, borderRadius: 8, padding: '1rem' }}>
                <div style={{ color: catColors[cat], fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
                  {cat === 'bull' ? '🐂 Bull' : cat === 'sideways' ? '➡️ Sideways' : '💀 Crashed'}
                </div>
                <div style={{ color: '#e4e4e7', fontSize: 20, fontWeight: 800 }}>
                  {s.pnl >= 0 ? '+' : ''}${Math.round(s.pnl).toLocaleString()}
                </div>
                <div style={{ color: '#a1a1aa', fontSize: 12, marginTop: 4 }}>{s.trades} trades · {wr}% WR · {s.stocks} stocks</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ═══ OPEN POSITIONS ═══ */}
      {openPositions.length > 0 && (
        <div style={{ background: '#0a1628', border: '2px solid #60a5fa', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#60a5fa', fontSize: 16, marginBottom: '1rem' }}>📍 Open: {openPositions.length} positions</h2>
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#a1a1aa', borderBottom: '1px solid #444' }}>
                <th style={{ textAlign: 'left', padding: '8px' }}>Stock</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>Entry</th>
                <th style={{ textAlign: 'right', padding: '8px' }}>Entry $</th>
                <th style={{ textAlign: 'right', padding: '8px' }}>Stop $</th>
                <th style={{ textAlign: 'right', padding: '8px' }}>Current R</th>
                <th style={{ textAlign: 'center', padding: '8px' }}>Trail?</th>
              </tr>
            </thead>
            <tbody>
              {openPositions.map((t, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #2a2a3e', background: '#071a0f' }}>
                  <td style={{ padding: '8px', color: '#60a5fa', fontWeight: 700 }}>{t.stock}</td>
                  <td style={{ padding: '8px', color: '#d4d4d8', fontFamily: 'monospace', fontSize: 12 }}>{t.entryDate}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#e4e4e7' }}>${t.entryPrice.toFixed(2)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#f87171' }}>${t.sl.toFixed(2)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#4ade80', fontWeight: 800 }}>+{t.pnlR.toFixed(1)}R</td>
                  <td style={{ padding: '8px', textAlign: 'center', color: t.pnlR >= 2 ? '#4ade80' : '#71717a' }}>{t.pnlR >= 2 ? '✓ YES' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ PER-STOCK TABLE ═══ */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#e4e4e7', fontSize: 16, marginBottom: '1rem' }}>All Stocks — Strategy vs Buy & Hold</h2>
        <div style={{ overflowX: 'auto', maxHeight: 450, overflowY: 'auto' }}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#1e1e2e' }}>
              <tr style={{ color: '#a1a1aa', borderBottom: '2px solid #444' }}>
                {[
                  { key: 'symbol', label: 'Stock', align: 'left' },
                  { key: 'mcap', label: 'Mkt Cap', align: 'right' },
                  { key: 'category', label: 'Type', align: 'center' },
                  { key: 'trades', label: 'Trades', align: 'right' },
                  { key: 'wr', label: 'Win%', align: 'right' },
                  { key: 'pnl', label: 'Strat $', align: 'right' },
                  { key: 'stratRetPct', label: 'Strat %', align: 'right' },
                  { key: 'bhDollar', label: 'B&H $', align: 'right' },
                  { key: 'bhRetPct', label: 'B&H %', align: 'right' },
                ].map(col => (
                  <th key={col.key} onClick={() => toggleSort(col.key)}
                    style={{ textAlign: col.align, padding: '8px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                    {col.label} {sortCol === col.key ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedStockRows.map(s => (
                <tr key={s.symbol} style={{ borderBottom: '1px solid #2a2a3e' }}>
                  <td style={{ padding: '6px 8px', color: '#60a5fa', fontWeight: 600 }}>{s.symbol}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#a1a1aa', fontSize: 11 }}>
                    {s.mcap > 0 ? `$${(s.mcap / 1e9).toFixed(0)}B` : '—'}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center', fontSize: 11, color: catColors[s.category] }}>{s.category}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#e4e4e7' }}>{s.trades}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#e4e4e7' }}>{s.wr}%</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: s.pnl >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                    {s.pnl >= 0 ? '+' : ''}${Math.round(s.pnl).toLocaleString()}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: s.stratRetPct >= 0 ? '#4ade80' : '#f87171' }}>
                    {s.stratRetPct > 0 ? '+' : ''}{s.stratRetPct}%
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: s.bhDollar >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                    {s.bhDollar >= 0 ? '+' : ''}${Math.round(s.bhDollar).toLocaleString()}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: s.bhRetPct >= 0 ? '#4ade80' : '#f87171' }}>
                    {s.bhRetPct > 0 ? '+' : ''}{s.bhRetPct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ TRADE LOG ═══ */}
      {strat && (
        <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 10, padding: '1.25rem' }}>
          <h2 style={{ color: '#e4e4e7', fontSize: 16, marginBottom: '1rem' }}>
            📝 Trade Log — newest first ({strat.taken.length} taken, {strat.skipped.length} skipped)
          </h2>
          <div style={{ overflowX: 'auto', maxHeight: 500, overflowY: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#1e1e2e' }}>
                <tr style={{ color: '#a1a1aa', borderBottom: '2px solid #444' }}>
                  <th style={{ textAlign: 'center', padding: '6px 4px' }}>#</th>
                  <th style={{ textAlign: 'left', padding: '6px' }}>Entry</th>
                  <th style={{ textAlign: 'left', padding: '6px' }}>Exit</th>
                  <th style={{ textAlign: 'left', padding: '6px' }}>Stock</th>
                  <th style={{ textAlign: 'right', padding: '6px' }}>Shares</th>
                  <th style={{ textAlign: 'right', padding: '6px' }}>Pos $</th>
                  <th style={{ textAlign: 'right', padding: '6px' }}>R</th>
                  <th style={{ textAlign: 'right', padding: '6px' }}>P/L</th>
                  <th style={{ textAlign: 'left', padding: '6px' }}>Why</th>
                  <th style={{ textAlign: 'right', padding: '6px' }}>Days</th>
                </tr>
              </thead>
              <tbody>
                {[...strat.results].reverse().map((t, i) => {
                  const tradeNum = strat.results.length - i
                  const win = t.pnlScaled > 0
                  const isSkipped = t.status === 'skipped'
                  const capped = t.positionValue >= t.capitalAtEntry * 0.99
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #2a2a3e', opacity: isSkipped ? 0.4 : 1, background: win ? '#071a0f' : 'transparent' }}>
                      <td style={{ padding: '5px 4px', textAlign: 'center', color: '#71717a', fontSize: 11 }}>{tradeNum}</td>
                      <td style={{ padding: '5px 6px', color: '#e4e4e7', fontFamily: 'monospace', fontSize: 11 }}>{t.entryDate}</td>
                      <td style={{ padding: '5px 6px', color: '#d4d4d8', fontFamily: 'monospace', fontSize: 11 }}>{t.exitDate}</td>
                      <td style={{ padding: '5px 6px', color: '#60a5fa', fontWeight: 600 }}>{t.stock}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: '#e4e4e7', fontSize: 11 }}>
                        {isSkipped ? '—' : t.shares}
                      </td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: capped ? '#fbbf24' : '#a1a1aa', fontSize: 11 }}>
                        {isSkipped ? '—' : `$${Math.round(t.positionValue).toLocaleString()}`}
                        {capped && ' ⚠️'}
                      </td>
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
