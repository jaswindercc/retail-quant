import { useState, useEffect } from 'react'
import { fetchJson } from '../utils'

export default function BreakoutV3Page() {
  const [data, setData] = useState(null)
  const [capital, setCapital] = useState(40000)
  const [riskPct, setRiskPct] = useState(1)
  const [sortCol, setSortCol] = useState('pnl')
  const [sortDir, setSortDir] = useState('desc')
  const [tradeFilter, setTradeFilter] = useState('')

  useEffect(() => {
    fetchJson(`${import.meta.env.BASE_URL}breakout_v2_sp100_data.json`)
      .then(setData).catch(console.error)
  }, [])

  if (!data) return <div className="loading">Loading Breakout v3…</div>

  const allTrades = data.allTrades || []
  const settings = data.settings || {}
  const buyHold = data.buyHold || {}
  const universe = data.universe || {}
  const categories = universe.categories || {}
  const marketCaps = data.marketCaps || {}

  // Compounding + Skip after 3L (Breakout v3 — compounding)
  function runStrategy(trades, startCapital, riskPctVal) {
    let currentCapital = startCapital
    let peakCapital = startCapital
    let maxDD = 0, maxDDPct = 0
    let consecutiveLosses = 0, skipNext = false
    const results = []
    const equityCurve = [{ capital: startCapital, date: trades[0]?.entryDate || '' }]
    const maxPositions = 5
    const maxPositionPct = 0.2 // never hold more than 20% in one stock (cap based on start capital)
    let activePositions = [] // track open positions by exitDate

    for (const t of trades) {
      if (t.exitReason === 'Open') continue
      activePositions = activePositions.filter(p => p.exitDate > t.entryDate)
      if (activePositions.length >= maxPositions) {
        results.push({ ...t, status: 'skipped', shares: 0, pnlScaled: 0, capitalAtEntry: currentCapital, riskDollars: 0, positionValue: 0 })
        continue
      }
      const riskDollars = currentCapital * (riskPctVal / 100)
      let shares = Math.floor(riskDollars / t.risk)
      const maxSharesByCapital = Math.floor(currentCapital / t.entryPrice)
      if (shares > maxSharesByCapital) shares = maxSharesByCapital
      const capSharesByPct = Math.floor((startCapital * maxPositionPct) / t.entryPrice)
      if (shares > capSharesByPct) shares = capSharesByPct
      const positionValue = shares * t.entryPrice
      const pnlScaled = shares > 0 ? shares * t.risk * t.pnlR : 0

      if (skipNext) {
        results.push({ ...t, status: 'skipped', shares: 0, pnlScaled: 0, capitalAtEntry: currentCapital, riskDollars, positionValue: 0 })
        skipNext = false
        consecutiveLosses = 0
        equityCurve.push({ capital: currentCapital, date: t.exitDate })
        continue
      }

      results.push({ ...t, status: 'taken', shares, pnlScaled, capitalAtEntry: currentCapital, riskDollars, positionValue, exitDate: t.exitDate })
      if (shares > 0) {
        currentCapital += pnlScaled
        activePositions.push({ stock: t.stock, exitDate: t.exitDate })
      }
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

  // Per-stock (FLAT — we still report per-trade fixed-risk P/L for table comparison)
  function runStrategyFlatForTable(trades, startCapital, riskPctVal) {
    const results = []
    const fixedRisk = startCapital * (riskPctVal / 100)
    const maxPositions = 5
    const maxPositionPct = 0.2
    let activePositions = []
    for (const t of trades) {
      if (t.exitReason === 'Open') continue
      activePositions = activePositions.filter(p => p.exitDate > t.entryDate)
      if (activePositions.length >= maxPositions) {
        results.push({ ...t, status: 'skipped', shares: 0, pnlScaled: 0, capitalAtEntry: startCapital, riskDollars: 0, positionValue: 0 })
        continue
      }
      const shares = Math.floor(fixedRisk / t.risk)
      const capSharesByPct = Math.floor((startCapital * maxPositionPct) / t.entryPrice)
      const actualShares = Math.min(shares, capSharesByPct)
      const positionValue = actualShares * t.entryPrice
      const pnlScaled = actualShares > 0 ? actualShares * t.risk * t.pnlR : 0
      results.push({ ...t, status: 'taken', shares: actualShares, pnlScaled, capitalAtEntry: startCapital, riskDollars: fixedRisk, positionValue, exitDate: t.exitDate })
      if (actualShares > 0) activePositions.push({ stock: t.stock, exitDate: t.exitDate })
    }
    return results
  }

  const strat = allTrades.length > 0 ? runStrategy(allTrades, capital, riskPct) : null
  const flatForTable = allTrades.length > 0 ? runStrategyFlatForTable(allTrades, capital, riskPct) : null
  const openPositions = allTrades.filter(t => t.exitReason === 'Open')
  const riskDollars = capital * riskPct / 100

  // Per-stock (FLAT — no compounding, fixed risk for fair comparison)
  const fixedRisk = capital * riskPct / 100  // e.g. $400 at 1% of $40k
  const stockMap = {}
  if (flatForTable) {
    for (const t of flatForTable.filter(r => r.status === 'taken')) {
      if (!stockMap[t.stock]) stockMap[t.stock] = { wins: 0, losses: 0, pnlFlat: 0, trades: 0 }
      stockMap[t.stock].trades++
      const flatPnl = t.pnlR * fixedRisk  // fixed risk per trade, no compounding
      if (flatPnl > 0) stockMap[t.stock].wins++
      else stockMap[t.stock].losses++
      stockMap[t.stock].pnlFlat += flatPnl
    }
  }
  // Compute peak concurrent invested amount per stock (max exposure at any time), capped at 20% of portfolio
  const investedMap = {}
  const maxPositionPct = 0.2
  if (flatForTable) {
    const taken = flatForTable.filter(r => r.status === 'taken')
    const byStock = {}
    for (const r of taken) {
      if (!byStock[r.stock]) byStock[r.stock] = []
      byStock[r.stock].push(r)
    }
    for (const [stock, trs] of Object.entries(byStock)) {
      trs.sort((a, b) => (a.entryDate || '').localeCompare(b.entryDate || ''))
      let active = []
      let peak = 0
      for (const t of trs) {
        active = active.filter(p => p.exitDate > t.entryDate)
        active.push(t)
        const current = active.reduce((s, p) => s + (p.positionValue || 0), 0)
        if (current > peak) peak = current
      }
      investedMap[stock] = Math.min(peak, capital * maxPositionPct)
    }
  }

  const stockRows = Object.entries(stockMap).map(([s, v]) => {
    const bh = buyHold[s] || {}
    const mcap = marketCaps[s] || bh.marketCap || 0
    const invested = investedMap[s] || 0
    const bhDollar = bh.returnPct ? invested * (bh.returnPct / 100) : 0
    return {
      symbol: s, trades: v.trades, wins: v.wins,
      wr: Math.round((v.wins / v.trades) * 100),
      pnl: v.pnlFlat,
      bhDollar,
      bhRetPct: bh.returnPct || 0,
      mcap,
      category: categories[s] || 'unknown',
    }
  })

*** End Patch