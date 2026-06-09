const fs = require('fs')
const path = require('path')
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../dashboard/public/breakout_v2_sp100_data.json'), 'utf8'))
const trades = data.allTrades || []

function runStrategyV4(trades, startCapital, riskPctVal) {
  const results = []
  const equityCurve = [{ capital: startCapital, date: trades[0]?.entryDate || '' }]
  const fixedRisk = startCapital * (riskPctVal / 100)
  const maxPositions = 5
  const maxPositionPct = 0.2
  let activePositions = []
  const stockStats = {}
  function updateStats(stock, pnlR) {
    if (!stockStats[stock]) stockStats[stock] = { wins: 0, trades: 0, sumPnlR: 0, recent: [] }
    const s = stockStats[stock]
    s.trades++
    if (pnlR > 0) s.wins++
    s.sumPnlR += pnlR
    s.recent.push(pnlR > 0 ? 1 : 0)
    if (s.recent.length > 8) s.recent.shift()
  }
  const grouped = {}
  for (const t of trades) {
    if (t.exitReason === 'Open') continue
    ;(grouped[t.entryDate] = grouped[t.entryDate] || []).push(t)
  }
  const dates = Object.keys(grouped).sort()
  for (const date of dates) {
    const todays = grouped[date]
    activePositions = activePositions.filter(p => p.exitDate > date)
    const scored = todays.map(t => {
      const s = stockStats[t.stock] || { wins: 0, trades: 0, sumPnlR: 0, recent: [] }
      const winRate = s.trades > 0 ? s.wins / s.trades : 0.5
      const recentRate = s.recent.length > 0 ? (s.recent.reduce((a,b)=>a+b,0) / s.recent.length) : 0.5
      const avgPnlR = s.trades > 0 ? s.sumPnlR / s.trades : 0.5
      const score = (winRate * 0.6) + (recentRate * 0.3) + (Math.tanh(avgPnlR / 2) * 0.1)
      return { ...t, score }
    })
    scored.sort((a,b)=>b.score - a.score)
    for (const t of scored) {
      if (activePositions.length >= maxPositions) {
        results.push({ ...t, status: 'skipped', shares: 0, pnlScaled: 0, capitalAtEntry: startCapital, riskDollars: 0, positionValue: 0, score: t.score })
        continue
      }
      const shares = Math.floor(fixedRisk / t.risk)
      const capSharesByPct = Math.floor((startCapital * maxPositionPct) / t.entryPrice)
      const actualShares = Math.min(shares, capSharesByPct)
      const positionValue = actualShares * t.entryPrice
      const pnlScaled = actualShares > 0 ? actualShares * t.risk * t.pnlR : 0
      results.push({ ...t, status: 'taken', shares: actualShares, pnlScaled, capitalAtEntry: startCapital, riskDollars: fixedRisk, positionValue, exitDate: t.exitDate, score: t.score })
      if (actualShares > 0) activePositions.push({ stock: t.stock, exitDate: t.exitDate })
      updateStats(t.stock, t.pnlR)
      equityCurve.push({ capital: startCapital, date: t.exitDate })
    }
  }
  const taken = results.filter(r => r.status === 'taken')
  const skipped = results.filter(r => r.status === 'skipped')
  const wins = taken.filter(r => r.pnlScaled > 0).length
  const totalPnl = taken.reduce((s,r)=>s+r.pnlScaled,0)
  const grossWin = taken.filter(r => r.pnlScaled > 0).reduce((s,r)=>s+r.pnlScaled,0)
  const grossLoss = Math.abs(taken.filter(r=>r.pnlScaled<0).reduce((s,r)=>s+r.pnlScaled,0) || 0)
  const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0
  return { results, taken, skipped, equityCurve, finalCapital: startCapital + totalPnl, totalPnl, wins, wr: taken.length > 0 ? (wins / taken.length * 100) : 0, pf }
}

const out = runStrategyV4(trades, 40000, 1)
console.log('Taken trades count:', out.taken.length)
console.log('First 40 taken trades:')
console.log(out.taken.slice(0,40).map(t => ({ stock: t.stock, entryDate: t.entryDate, entryPrice: t.entryPrice, shares: t.shares, pnlScaled: t.pnlScaled, score: Number(t.score.toFixed(4)) })))

// Also show first date scored order
const grouped = {}
for (const t of trades) { if (t.exitReason === 'Open') continue; (grouped[t.entryDate] = grouped[t.entryDate] || []).push(t) }
const firstDate = Object.keys(grouped).sort()[0]
console.log('\nFirst date:', firstDate)
const todays = grouped[firstDate]
const stockStats = {}
const scoredToday = todays.map(t => {
  const s = stockStats[t.stock] || { wins: 0, trades: 0, sumPnlR: 0, recent: [] }
  const winRate = s.trades > 0 ? s.wins / s.trades : 0.5
  const recentRate = s.recent.length > 0 ? (s.recent.reduce((a,b)=>a+b,0) / s.recent.length) : 0.5
  const avgPnlR = s.trades > 0 ? s.sumPnlR / s.trades : 0.5
  const score = (winRate * 0.6) + (recentRate * 0.3) + (Math.tanh(avgPnlR / 2) * 0.1)
  return { stock: t.stock, entryPrice: t.entryPrice, score: Number(score.toFixed(6)) }
})
console.log('Scores for first date (default neutral stats):')
console.log(scoredToday.slice(0,30))

// write a small csv of taken trades to /tmp/v4_taken.csv
try {
  const csv = ['stock,entryDate,entryPrice,shares,pnlScaled,score'].concat(out.taken.map(t => `${t.stock},${t.entryDate},${t.entryPrice},${t.shares},${t.pnlScaled},${t.score}`)).join('\n')
  fs.writeFileSync(path.join(__dirname,'../tmp/v4_taken.csv'), csv)
  console.log('\nWrote /tmp/v4_taken.csv')
} catch (e) { console.error('write failed', e) }
