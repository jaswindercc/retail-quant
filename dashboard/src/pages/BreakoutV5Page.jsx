import { useState, useEffect } from 'react'
import { fetchJson } from '../utils'

export default function BreakoutV5Page() {
  const [data, setData] = useState(null)
  const [capital, setCapital] = useState(40000)
  const [riskPct, setRiskPct] = useState(1)
  const [sortCol, setSortCol] = useState('score')
  const [sortDir, setSortDir] = useState('desc')
  const [tradeFilter, setTradeFilter] = useState('')

  useEffect(() => {
    fetchJson(`${import.meta.env.BASE_URL}breakout_v2_data.json`)
      .then(setData)
      .catch(console.error)
  }, [])

  if (!data) return <div className="loading">Loading Breakout v5…</div>

  const allTrades = data.allTrades || []
  const settings = data.settings || {}
  const buyHold = data.buyHold || {}
  const universe = data.universe || {}
  const categories = universe.categories || {}
  const marketCaps = data.marketCaps || {}

  function computeHistoryStats(history = []) {
    const wins = history.filter(t => t.pnlR > 0).length
    const losses = history.filter(t => t.pnlR < 0).length
    const breakeven = history.filter(t => t.pnlR === 0).length
    const winRate = history.length ? wins / history.length : 0.5
    const avgR = history.length ? history.reduce((sum, t) => sum + (t.pnlR || 0), 0) / history.length : 0
    const recent = history.slice(-5)
    const recentWinRate = recent.length ? recent.filter(t => t.pnlR > 0).length / recent.length : 0.5
    const recentAvgR = recent.length ? recent.reduce((sum, t) => sum + (t.pnlR || 0), 0) / recent.length : 0

    let winStreak = 0
    let lossStreak = 0
    for (let i = history.length - 1; i >= 0; i--) {
      const r = history[i].pnlR || 0
      if (r > 0) {
        winStreak += 1
        lossStreak = 0
      } else if (r < 0) {
        lossStreak += 1
        winStreak = 0
      } else {
        break
      }
    }

    return {
      historyCount: history.length,
      wins,
      losses,
      breakeven,
      winRate,
      avgR,
      recent,
      recentWinRate,
      recentAvgR,
      winStreak,
      lossStreak,
      streakLabel: winStreak > 0 ? `+${winStreak}W` : lossStreak > 0 ? `-${lossStreak}L` : 'flat',
    }
  }

  function runStrategyV5(trades, startCapital, riskPctVal) {
    const results = []
    const signalEvents = []
    const equityCurve = [{ capital: startCapital, date: trades[0]?.entryDate || '' }]
    const fixedRisk = startCapital * (riskPctVal / 100)
    const maxPositionPct = 0.2
    const historyByStock = {}

    const grouped = {}
    for (const t of trades) {
      if (t.exitReason === 'Open') continue
      ;(grouped[t.entryDate] = grouped[t.entryDate] || []).push(t)
    }
    const dates = Object.keys(grouped).sort()

    for (const date of dates) {
      const todays = grouped[date]

      const scored = todays.map(t => {
        const prior = historyByStock[t.stock] || []
        const stats = computeHistoryStats(prior)
        const recentMomentum = stats.recentAvgR
        const recentWinRate = stats.recentWinRate
        const streakPenalty = stats.lossStreak >= 3 ? -0.18 : 0
        const hotBonus = stats.winStreak >= 2 ? 0.08 : 0
        const coldPenalty = stats.lossStreak >= 2 && stats.recentWinRate < 0.35 ? -0.10 : 0
        const avgRScore = Math.tanh(stats.avgR / 2)
        const recentScore = Math.tanh(recentMomentum / 2)
        const score = 0.35 * stats.winRate + 0.20 * recentWinRate + 0.20 * avgRScore + 0.15 * recentScore + hotBonus + streakPenalty + coldPenalty

        let pickReason = 'Baseline v2 breakout'
        if (stats.lossStreak >= 3) pickReason = 'Avoiding losing streak'
        else if (stats.winStreak >= 2 || stats.recentAvgR > 0.6) pickReason = 'Momentum on recent winners'
        else if (stats.recentWinRate >= 0.6) pickReason = 'Recent win-rate edge'

        return {
          ...t,
          score,
          pickReason,
          streakLabel: stats.streakLabel,
          historyCount: stats.historyCount,
          winRate: stats.winRate,
          recentWinRate,
          recentAvgR: recentMomentum,
          avgR: stats.avgR,
          lossStreak: stats.lossStreak,
          winStreak: stats.winStreak,
          priorHistory: prior,
        }
      })

      scored.sort((a, b) => b.score - a.score || b.pnlR - a.pnlR || a.stock.localeCompare(b.stock))

      for (const candidate of scored) {
        const signalRecord = {
          entryDate: candidate.entryDate,
          stock: candidate.stock,
          score: candidate.score,
          pickReason: candidate.pickReason,
          streakLabel: candidate.streakLabel,
          winRate: candidate.winRate,
          recentWinRate: candidate.recentWinRate,
          recentAvgR: candidate.recentAvgR,
          status: 'candidate',
          entryPrice: candidate.entryPrice,
          sl: candidate.sl,
          pnlR: candidate.pnlR,
        }
        signalEvents.push(signalRecord)

        const shares = Math.floor(fixedRisk / candidate.risk)
        const capSharesByPct = Math.floor((startCapital * maxPositionPct) / candidate.entryPrice)
        const actualShares = Math.min(shares, capSharesByPct)
        const positionValue = actualShares * candidate.entryPrice
        const pnlScaled = actualShares > 0 ? actualShares * candidate.risk * candidate.pnlR : 0

        const result = {
          ...candidate,
          status: 'taken',
          shares: actualShares,
          pnlScaled,
          capitalAtEntry: startCapital,
          riskDollars: fixedRisk,
          positionValue,
          exitDate: candidate.exitDate,
        }
        results.push(result)
        signalRecord.status = 'taken'
        signalRecord.shares = actualShares
        signalRecord.positionValue = positionValue
        signalRecord.pnlScaled = pnlScaled
        signalRecord.reason = candidate.pickReason

        equityCurve.push({ capital: startCapital, date: candidate.exitDate })
      }

      // Update history after the full signal date so future dates see the completed outcomes.
      for (const trade of todays) {
        ;(historyByStock[trade.stock] = historyByStock[trade.stock] || []).push(trade)
      }
    }

    const taken = results.filter(r => r.status === 'taken')
    const skipped = results.filter(r => r.status === 'skipped')
    const wins = taken.filter(r => r.pnlScaled > 0).length
    const totalPnl = taken.reduce((sum, r) => sum + r.pnlScaled, 0)
    const grossWin = taken.filter(r => r.pnlScaled > 0).reduce((sum, r) => sum + r.pnlScaled, 0)
    const grossLoss = Math.abs(taken.filter(r => r.pnlScaled < 0).reduce((sum, r) => sum + r.pnlScaled, 0))
    const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0

    let streak = 0
    let maxStreak = 0
    for (const r of taken) {
      if (r.pnlScaled < 0) {
        streak += 1
        if (streak > maxStreak) maxStreak = streak
      } else {
        streak = 0
      }
    }

    return {
      results,
      taken,
      skipped,
      signalEvents,
      equityCurve,
      finalCapital: startCapital + totalPnl,
      totalPnl,
      wins,
      wr: taken.length > 0 ? (wins / taken.length) * 100 : 0,
      pf,
      maxDD: 0,
      maxDDPct: 0,
      maxStreak,
    }
  }

  const strat = allTrades.length > 0 ? runStrategyV5(allTrades, capital, riskPct) : null
  const openPositions = allTrades.filter(t => t.exitReason === 'Open')
  const riskDollars = capital * riskPct / 100

  const fixedRisk = capital * riskPct / 100
  const stockMap = {}
  if (strat) {
    for (const t of strat.taken) {
      if (!stockMap[t.stock]) stockMap[t.stock] = { wins: 0, losses: 0, pnlFlat: 0, trades: 0, avgScore: 0, scoreTotal: 0 }
      stockMap[t.stock].trades += 1
      const flatPnl = t.pnlR * fixedRisk
      if (flatPnl > 0) stockMap[t.stock].wins += 1
      else stockMap[t.stock].losses += 1
      stockMap[t.stock].pnlFlat += flatPnl
      stockMap[t.stock].scoreTotal += (t.score || 0)
      stockMap[t.stock].avgScore = stockMap[t.stock].scoreTotal / stockMap[t.stock].trades
    }
  }

  const investedMap = {}
  if (strat) {
    const byStock = {}
    for (const r of strat.results.filter(r => r.status === 'taken')) {
      ;(byStock[r.stock] = byStock[r.stock] || []).push(r)
    }
    for (const [stock, trs] of Object.entries(byStock)) {
      trs.sort((a, b) => (a.entryDate || '').localeCompare(b.entryDate || ''))
      let active = []
      let peak = 0
      for (const t of trs) {
        active = active.filter(p => p.exitDate > t.entryDate)
        active.push(t)
        const current = active.reduce((sum, p) => sum + (p.positionValue || 0), 0)
        if (current > peak) peak = current
      }
      investedMap[stock] = Math.min(peak, capital * 0.2)
    }
  }

  const stockRows = Object.entries(stockMap).map(([s, v]) => {
    const bh = buyHold[s] || {}
    const mcap = marketCaps[s] || bh.marketCap || 0
    const invested = investedMap[s] || 0
    const bhDollar = bh.returnPct ? invested * (bh.returnPct / 100) : 0
    return {
      symbol: s,
      trades: v.trades,
      wins: v.wins,
      wr: Math.round((v.wins / v.trades) * 100),
      pnl: v.pnlFlat,
      bhDollar,
      bhRetPct: bh.returnPct || 0,
      mcap,
      category: categories[s] || 'unknown',
      avgScore: v.avgScore || 0,
    }
  })

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const sortedStockRows = [...stockRows].sort((a, b) => {
    let av = a[sortCol]
    let bv = b[sortCol]
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
    catSummary[r.category].stocks += 1
  }

  const signalRows = (strat?.signalEvents || [])
    .filter(row => !tradeFilter || row.stock.toLowerCase().includes(tradeFilter.trim().toLowerCase()))
    .sort((a, b) => b.entryDate.localeCompare(a.entryDate))

  return (
    <div className="page-container" style={{ padding: '2rem', maxWidth: 1300 }}>
      <h1 style={{ marginBottom: '0.5rem', fontSize: '1.8rem' }}>🚀 Breakout v5 — Full v2 universe, streak-aware picks</h1>
      <p style={{ color: '#a1a1aa', fontSize: 15, marginBottom: '1.25rem' }}>
        Uses the full v2 breakout universe and the same breakout criteria, but ranks each signal by recent stock history so losing streaks are de-prioritized and winners are allowed to run.
      </p>

      <div style={{ background: '#1a1a2e', border: '1px solid #38bdf8', borderRadius: 12, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#38bdf8', fontSize: 17, marginBottom: '0.75rem' }}>🧭 What changes in v5</h2>
        <div style={{ color: '#e4e4e7', fontSize: 14, lineHeight: 1.9 }}>
          <div>• Same v2 stop / trailing logic and fixed-risk sizing, so the core strategy stays intact.</div>
          <div>• We only allow the best 5 signals at a time, but now every signal is scored from its stock’s prior history to avoid losing streaks and favor momentum.</div>
          <div>• Every signal is logged with score, recent win-rate, recent average R, current streak and the reason it was taken or skipped.</div>
          <div>• This is the “avoid DD / let winners run” version of the v2 playbook, with all the decision details visible instead of hidden.</div>
        </div>
      </div>

      <div style={{ background: '#1e1e2e', border: '1px solid #555', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={{ color: '#a1a1aa', fontSize: 13, display: 'block', marginBottom: 6 }}>Account Size ($)</label>
            <input type="number" value={capital} onChange={e => setCapital(Math.max(1000, +e.target.value || 40000))}
              style={{ background: '#0f0f1a', border: '1px solid #555', borderRadius: 6, padding: '10px 14px', color: '#e4e4e7', width: '100%', fontSize: 16 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ background: '#0f0f1a', border: '1px solid #555', borderRadius: 6, padding: '10px 16px', width: '100%' }}>
              <div style={{ color: '#a1a1aa', fontSize: 12 }}>Mode</div>
              <div style={{ color: '#e4e4e7', fontSize: 14, fontWeight: 700 }}>V2 core risk · v5 selection</div>
            </div>
          </div>
          <div>
            <label style={{ color: '#a1a1aa', fontSize: 13, display: 'block', marginBottom: 6 }}>Risk per Trade</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[0.5, 1, 1.5, 2].map(pct => (
                <button key={pct} onClick={() => setRiskPct(pct)} style={{ padding: '10px 16px', borderRadius: 6, border: riskPct === pct ? '2px solid #38bdf8' : '1px solid #555', background: riskPct === pct ? '#082f49' : '#0f0f1a', color: riskPct === pct ? '#7dd3fc' : '#e4e4e7', fontSize: 15, cursor: 'pointer' }}>{pct}%</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ background: '#0f0f1a', border: '1px solid #555', borderRadius: 6, padding: '10px 16px', textAlign: 'center', width: '100%' }}>
              <div style={{ color: '#a1a1aa', fontSize: 12 }}>Risk / trade</div>
              <div style={{ color: '#38bdf8', fontSize: 24, fontWeight: 800 }}>${riskDollars.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            </div>
          </div>
        </div>
      </div>

      {strat && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <Stat label="Final Capital" value={`$${strat.finalCapital.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub={`${strat.totalPnl >= 0 ? '+' : ''}${(strat.totalPnl / capital * 100).toFixed(0)}%`} color="#38bdf8" />
          <Stat label="Total P/L" value={`${strat.totalPnl >= 0 ? '+' : ''}$${Math.abs(strat.totalPnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} color={strat.totalPnl >= 0 ? '#4ade80' : '#f87171'} />
          <Stat label="Profit Factor" value={strat.pf.toFixed(2)} color={strat.pf >= 1.5 ? '#4ade80' : '#fbbf24'} />
          <Stat label="Win Rate" value={`${strat.wr.toFixed(0)}%`} sub={`${strat.wins}W / ${strat.taken.length - strat.wins}L`} color="#60a5fa" />
          <Stat label="Trades" value={strat.taken.length} sub={`${strat.skipped.length} skipped`} color="#a1a1aa" />
          <Stat label="Max Streak" value={strat.maxStreak + ' losses'} color={strat.maxStreak > 3 ? '#f87171' : '#fbbf24'} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ background: '#0f1724', border: '1px solid #334155', borderRadius: 10, padding: '1rem' }}>
          <h2 style={{ color: '#e4e4e7', fontSize: 15, marginBottom: '0.5rem' }}>🧠 Score logic</h2>
          <ul style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.8, paddingLeft: '1rem' }}>
            <li>Recent win-rate and recent avg R carry the most weight.</li>
            <li>Winning streaks get a small bonus; 3+ consecutive losers are penalized.</li>
            <li>Stocks with a long losing streak are pushed down the ranking and are less likely to be chosen when capital is tight.</li>
          </ul>
        </div>
        <div style={{ background: '#0f1724', border: '1px solid #334155', borderRadius: 10, padding: '1rem' }}>
          <h2 style={{ color: '#e4e4e7', fontSize: 15, marginBottom: '0.5rem' }}>📍 Signal philosophy</h2>
          <ul style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.8, paddingLeft: '1rem' }}>
            <li>Still uses the v2 setup rules: same stops, exits, fixed risk, max 5 positions.</li>
            <li>Only the selection order changes — the best candidates get the slots and weaker / losing-streak names are skipped.</li>
            <li>Everything is visible to you in the signals table and the trade log below.</li>
          </ul>
        </div>
      </div>

      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#e4e4e7', fontSize: 16, marginBottom: '0.5rem' }}>📡 All signals — how each stock was picked</h2>
        <p style={{ color: '#a1a1aa', fontSize: 12, marginBottom: '0.75rem' }}>This is the full signal queue, not just the winners. It shows the stock’s history, score, streak, and why it was chosen or held back.</p>
        <div style={{ marginBottom: '0.75rem', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input placeholder="Filter stock" value={tradeFilter} onChange={e => setTradeFilter(e.target.value)} style={{ background: '#0f0f1a', border: '1px solid #333', borderRadius: 6, padding: '8px 10px', color: '#e4e4e7', width: 180 }} />
          <button onClick={() => setTradeFilter('')} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #555', background: '#0f2a1a', color: '#e4e4e7', cursor: 'pointer' }}>Clear</button>
        </div>
        <div style={{ overflowX: 'auto', maxHeight: 480, overflowY: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#1e1e2e', zIndex: 1 }}>
              <tr style={{ color: '#a1a1aa', borderBottom: '2px solid #444' }}>
                <th style={{ textAlign: 'left', padding: '6px' }}>Date</th>
                <th style={{ textAlign: 'left', padding: '6px' }}>Stock</th>
                <th style={{ textAlign: 'right', padding: '6px' }}>Score</th>
                <th style={{ textAlign: 'right', padding: '6px' }}>Streak</th>
                <th style={{ textAlign: 'right', padding: '6px' }}>Hist</th>
                <th style={{ textAlign: 'right', padding: '6px' }}>Win%</th>
                <th style={{ textAlign: 'right', padding: '6px' }}>Recent R</th>
                <th style={{ textAlign: 'left', padding: '6px' }}>Decision</th>
              </tr>
            </thead>
            <tbody>
              {signalRows.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #2a2a3e', background: row.status === 'taken' ? '#071a0f' : row.status === 'skipped' ? '#140f16' : 'transparent' }}>
                  <td style={{ padding: '6px', color: '#e4e4e7', fontFamily: 'monospace' }}>{row.entryDate}</td>
                  <td style={{ padding: '6px', color: '#38bdf8', fontWeight: 700 }}>{row.stock}</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#7dd3fc', fontWeight: 700 }}>{row.score ? row.score.toFixed(3) : '—'}</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: row.streakLabel?.startsWith('-') ? '#f87171' : '#4ade80' }}>{row.streakLabel || '—'}</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#e4e4e7' }}>{row.historyCount || 0} trades</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#e4e4e7' }}>{row.winRate ? `${Math.round(row.winRate * 100)}%` : '—'}</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: row.recentAvgR >= 0 ? '#4ade80' : '#f87171' }}>{row.recentAvgR ? `${row.recentAvgR >= 0 ? '+' : ''}${row.recentAvgR.toFixed(2)}R` : '—'}</td>
                  <td style={{ padding: '6px', color: row.status === 'taken' ? '#4ade80' : row.status === 'skipped' ? '#fbbf24' : '#cbd5e1' }}>{row.status === 'candidate' ? `Queued · ${row.pickReason}` : `${row.status.toUpperCase()} · ${row.reason || row.pickReason}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* STRATEGY TRADES */}
      {strat && (
        <div style={{ background: '#0f1724', border: '1px solid #333', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#e4e4e7', fontSize: 16, marginBottom: '0.5rem' }}>Strategy Trades (v5) — Taken / Skipped</h2>
          <p style={{ color: '#71717a', fontSize: 12, marginBottom: '0.75rem' }}>This table shows the actual decisions made by the ranking engine: status, score, allocated shares and scaled P/L.</p>
          <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#0b1220', zIndex: 1 }}>
                <tr style={{ color: '#a1a1aa', borderBottom: '2px solid #444' }}>
                  {['Status','Stock','Entry','Entry $','Shares','Score','Strat $'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(strat.results || []).slice().sort((a, b) => b.entryDate.localeCompare(a.entryDate)).map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #172033', background: r.status === 'taken' ? '#071a0f' : '#0b0b12' }}>
                    <td style={{ padding: '6px 8px', color: r.status === 'taken' ? '#4ade80' : '#fbbf24', fontWeight: 700 }}>{r.status}</td>
                    <td style={{ padding: '6px 8px', color: '#e4e4e7', fontWeight: 600 }}>{r.stock}</td>
                    <td style={{ padding: '6px 8px', color: '#9ca3af', fontFamily: 'monospace' }}>{r.entryDate}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#e4e4e7' }}>${(r.entryPrice || 0).toFixed(2)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#e4e4e7' }}>{r.shares}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#60a5fa' }}>{r.score ? r.score.toFixed(4) : ''}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: r.pnlScaled >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>{r.pnlScaled >= 0 ? '+' : ''}${Math.round(r.pnlScaled)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#e4e4e7', fontSize: 16, marginBottom: '0.5rem' }}>📋 Trade log — v2 format, v5 selection</h2>
        <p style={{ color: '#a1a1aa', fontSize: 12, marginBottom: '0.75rem' }}>The trade log mirrors the v2 view so you can compare the original rules and the filtered v5 picks side-by-side.</p>
        <div style={{ overflowX: 'auto', maxHeight: 520, overflowY: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#1e1e2e' }}>
              <tr style={{ color: '#a1a1aa', borderBottom: '2px solid #444' }}>
                <th style={{ textAlign: 'left', padding: '6px' }}>Entry</th>
                <th style={{ textAlign: 'left', padding: '6px' }}>Exit</th>
                <th style={{ textAlign: 'left', padding: '6px' }}>Stock</th>
                <th style={{ textAlign: 'right', padding: '6px' }}>Entry $</th>
                <th style={{ textAlign: 'right', padding: '6px' }}>Stop $</th>
                <th style={{ textAlign: 'right', padding: '6px' }}>Shares</th>
                <th style={{ textAlign: 'right', padding: '6px' }}>Pos $</th>
                <th style={{ textAlign: 'right', padding: '6px' }}>R</th>
                <th style={{ textAlign: 'right', padding: '6px' }}>P/L</th>
                <th style={{ textAlign: 'left', padding: '6px' }}>Why picked</th>
                <th style={{ textAlign: 'right', padding: '6px' }}>Days</th>
              </tr>
            </thead>
            <tbody>
              {([...strat.results].filter(t => !tradeFilter || t.stock.toLowerCase().includes(tradeFilter.trim().toLowerCase()))).sort((a, b) => b.entryDate.localeCompare(a.entryDate)).map((t, i) => {
                const win = t.pnlScaled > 0
                const isSkipped = t.status === 'skipped'
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #2a2a3e', background: win ? '#071a0f' : 'transparent', opacity: isSkipped ? 0.45 : 1 }}>
                    <td style={{ padding: '5px 6px', color: '#e4e4e7', fontFamily: 'monospace', fontSize: 11 }}>{t.entryDate}</td>
                    <td style={{ padding: '5px 6px', color: '#d4d4d8', fontFamily: 'monospace', fontSize: 11 }}>{t.exitDate}</td>
                    <td style={{ padding: '5px 6px', color: '#38bdf8', fontWeight: 700 }}>{t.stock}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', color: '#e4e4e7' }}>${t.entryPrice.toFixed(2)}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', color: '#f87171' }}>${t.sl.toFixed(2)}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', color: '#e4e4e7' }}>{isSkipped ? '—' : t.shares}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', color: '#a1a1aa' }}>{isSkipped ? '—' : `$${Math.round(t.positionValue).toLocaleString()}`}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', color: win ? '#4ade80' : '#f87171', fontWeight: 700 }}>{t.pnlR > 0 ? '+' : ''}{t.pnlR.toFixed(1)}R</td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', color: win ? '#4ade80' : '#f87171', fontWeight: 700 }}>{isSkipped ? '—' : `${t.pnlScaled >= 0 ? '+' : ''}$${Math.round(t.pnlScaled).toLocaleString()}`}</td>
                    <td style={{ padding: '5px 6px', color: t.pickReason ? '#cbd5e1' : '#fbbf24', fontSize: 11 }}>{isSkipped ? 'SKIP · 5-position cap' : (t.pickReason || 'v2 breakout')}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', color: '#71717a', fontSize: 11 }}>{t.durationDays}d</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#e4e4e7', fontSize: 16, marginBottom: '0.5rem' }}>📊 Stock summary — which names were favored</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#a1a1aa', borderBottom: '2px solid #444' }}>
                <th style={{ textAlign: 'left', padding: '8px' }}>Stock</th>
                <th style={{ textAlign: 'right', padding: '8px' }}>Trades</th>
                <th style={{ textAlign: 'right', padding: '8px' }}>Win%</th>
                <th style={{ textAlign: 'right', padding: '8px' }}>Strat $</th>
                <th style={{ textAlign: 'right', padding: '8px' }}>Avg Score</th>
                <th style={{ textAlign: 'center', padding: '8px' }}>Type</th>
              </tr>
            </thead>
            <tbody>
              {sortedStockRows.map(row => (
                <tr key={row.symbol} style={{ borderBottom: '1px solid #2a2a3e' }}>
                  <td style={{ padding: '6px 8px', color: '#38bdf8', fontWeight: 700 }}>{row.symbol}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#e4e4e7' }}>{row.trades}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#e4e4e7' }}>{row.wr}%</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: row.pnl >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>{row.pnl >= 0 ? '+' : ''}${Math.round(row.pnl).toLocaleString()}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#7dd3fc' }}>{row.avgScore.toFixed(3)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'center', color: catColors[row.category], fontSize: 11 }}>{row.category}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
