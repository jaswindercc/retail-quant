import { useState, useEffect, useMemo } from 'react'

const STRAT_COLORS = {
  'put_spread_20d': '#4ade80',
  'put_spread_30d': '#fbbf24',
  'put_spread_40d': '#fb923c',
  'iron_condor_20d': '#64b5f6',
  'iron_condor_30d': '#a78bfa',
  'iron_fly': '#f472b6',
}

function fmtMoney(v) {
  if (!Number.isFinite(v)) return '$0'
  const sign = v < 0 ? '-' : ''
  return `${sign}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export default function SpxIncomePage() {
  const [data, setData] = useState(null)
  const [selectedStrat, setSelectedStrat] = useState(null)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}spread_data_spx.json`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(d => {
        setData(d)
        // Default to best strategy by annual return
        const sorted = Object.entries(d?.strategies || {}).sort((a, b) => (b[1].stats?.annualReturnPct || 0) - (a[1].stats?.annualReturnPct || 0))
        if (sorted.length && !selectedStrat) setSelectedStrat(sorted[0][0])
      })
      .catch(e => setData({ error: e.message }))
  }, [])

  const strategies = data?.strategies || {}
  // Sort strategies by annual return (best to worst)
  const sortedStratKeys = useMemo(() => {
    return Object.entries(strategies).sort((a, b) => (b[1].stats?.annualReturnPct || 0) - (a[1].stats?.annualReturnPct || 0)).map(([key]) => key)
  }, [strategies])
  const strat = strategies[selectedStrat]
  const config = strat?.config || {}
  const stats = strat?.stats || {}
  const trades = strat?.trades || []

  // Yearly breakdown
  const yearlyData = useMemo(() => {
    const years = {}
    trades.forEach(t => {
      const y = t.entryDate.slice(0, 4)
      if (!years[y]) years[y] = { wins: 0, losses: 0, pnl: 0, trades: 0, credits: 0 }
      years[y].trades++
      years[y].pnl += t.pnl
      years[y].credits += t.credit
      if (t.outcome === 'WIN') years[y].wins++
      else years[y].losses++
    })
    return Object.entries(years).sort().map(([year, d]) => ({
      year, ...d,
      wr: d.trades ? (d.wins / d.trades * 100).toFixed(1) : 0,
      roi: d.credits > 0 ? (d.pnl / (config.width || 50) * 100).toFixed(1) : 0,
    }))
  }, [trades, config.width])

  // Monthly breakdown
  const monthlyData = useMemo(() => {
    const months = {}
    trades.forEach(t => {
      const m = t.entryDate.slice(0, 7) // YYYY-MM
      if (!months[m]) months[m] = { wins: 0, losses: 0, pnl: 0, trades: 0 }
      months[m].trades++
      months[m].pnl += t.pnl
      if (t.outcome === 'WIN') months[m].wins++
      else months[m].losses++
    })
    return Object.entries(months).sort().map(([month, d]) => ({
      month, ...d,
      wr: d.trades ? (d.wins / d.trades * 100).toFixed(1) : 0,
    }))
  }, [trades])

  // Next trade calculation
  const nextTrade = useMemo(() => {
    if (!trades.length) return null
    const lastTrade = trades[trades.length - 1]
    const lastExit = new Date(lastTrade.exitDate)
    const today = new Date()
    // Find next Monday from today
    const nextMonday = new Date(today)
    const dayOfWeek = nextMonday.getDay()
    const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek
    nextMonday.setDate(nextMonday.getDate() + daysUntilMonday)
    // Count open positions today
    const openPositions = trades.filter(t => new Date(t.exitDate) > today).length
    const maxPos = data?.params?.maxPositions || 1
    const canTrade = openPositions < maxPos
    return { nextMonday: nextMonday.toISOString().slice(0, 10), openPositions, maxPos, canTrade, lastEntry: lastTrade.entryDate, lastExit: lastTrade.exitDate }
  }, [trades, data])

  if (!data) return <div className="loading">Loading SPX backtest…</div>
  if (data.error) return (
    <div style={{ padding: 40, maxWidth: 520, margin: '60px auto', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔻</div>
      <h2 style={{ color: '#e2e8f0' }}>SPX data not available</h2>
      <p style={{ color: '#a1a1aa', fontSize: 14 }}>Run: <code>python scripts/generate_spx_spread_data.py</code></p>
    </div>
  )

  const { params } = data

  // Equity curve
  const equityCurve = stats.equityCurve || []
  const maxEquity = Math.max(...equityCurve, 1)
  const minEquity = Math.min(...equityCurve, 0)
  const eqRange = maxEquity - minEquity || 1

  return (
    <div>
      <h1 className="page-title">SPX Income Strategy <span>Put Spread 30Δ · {params.dataRange} · Cash-settled</span></h1>

      {/* === ACTION BOX — FIRST THING YOU SEE === */}
      {nextTrade && (
        <div className="card" style={{ marginBottom: 20, padding: '20px 24px', border: `2px solid ${nextTrade.canTrade ? '#4ade80' : '#fbbf24'}`, background: nextTrade.canTrade ? 'rgba(74,222,128,0.08)' : 'rgba(251,191,36,0.06)', borderRadius: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: '1.5rem' }}>{nextTrade.canTrade ? '🟢' : '⏸️'}</span>
            <strong style={{ color: nextTrade.canTrade ? '#4ade80' : '#fbbf24', fontSize: '1.2rem' }}>
              {nextTrade.canTrade
                ? `NEXT ENTRY: Monday ${nextTrade.nextMonday}`
                : `PAUSED — ${nextTrade.openPositions}/${nextTrade.maxPos} positions full`}
            </strong>
          </div>
          {nextTrade.canTrade && (
            <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: '14px 18px', marginBottom: 12 }}>
              <p style={{ color: '#e2e8f0', fontSize: '0.95rem', margin: '0 0 8px', fontWeight: 700 }}>What to do:</p>
              <div style={{ fontSize: '0.88rem', color: '#cbd5e1', lineHeight: 2.2 }}>
                <p style={{ margin: 0 }}>1. Open broker → SPX options → <strong style={{ color: '#4ade80' }}>standard monthly expiry (3rd Friday)</strong> closest to 45 DTE</p>
                <p style={{ margin: 0 }}>2. Find the <strong style={{ color: '#fbbf24' }}>30-delta put</strong> (~2-3% below current SPX)</p>
                <p style={{ margin: 0 }}>3. Sell that put, buy the put $5 below → <strong>Bull Put Spread</strong></p>
                <p style={{ margin: 0 }}>4. Collect ~$1.50-$1.70 credit. Max risk = $3.30-$3.50 ($500 total)</p>
                <p style={{ margin: 0 }}>5. Set alerts: <strong style={{ color: '#4ade80' }}>close at 50% profit</strong> · <strong style={{ color: '#ef4444' }}>close at 2× loss</strong></p>
              </div>
            </div>
          )}
          <div style={{ fontSize: '0.82rem', color: '#aaa', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <span>Open positions: <strong style={{ color: nextTrade.openPositions >= nextTrade.maxPos ? '#ef4444' : '#4ade80' }}>{nextTrade.openPositions}/{nextTrade.maxPos}</strong></span>
            <span>Last entry: <strong>{nextTrade.lastEntry}</strong></span>
            <span>Last exit: <strong>{nextTrade.lastExit}</strong></span>
          </div>
        </div>
      )}

      {/* SPX = No Assignment + Expiry tip */}
      <div className="card" style={{ marginBottom: 16, padding: '12px 18px', border: '1px solid #4ade80', background: 'rgba(74,222,128,0.04)', borderRadius: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem' }}>
          <span>✅</span>
          <strong style={{ color: '#4ade80' }}>SPX = NO ASSIGNMENT RISK</strong>
          <span style={{ color: '#888' }}>·</span>
          <span style={{ color: '#cbd5e1' }}>European-style, cash-settled. Pick <strong style={{ color: '#64b5f6' }}>monthly expiry (3rd Friday)</strong> for liquidity.</span>
          <span style={{ color: '#888' }}>·</span>
          <span style={{ color: '#fbbf24', fontSize: '0.8rem' }}>Alt: SPY (1/10th size, 10 contracts = 1 SPX)</span>
        </div>
      </div>

      {/* Strategy selector — sorted best to worst */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 16 }}>
        <span style={{ color: '#888', fontSize: '0.85rem', display: 'block', marginBottom: 8 }}>Strategy (best → worst by annual return):</span>
        <div className="tab-bar" style={{ margin: 0, flexWrap: 'wrap' }}>
          {sortedStratKeys.map((key, idx) => {
            const s = strategies[key]
            return (
              <button key={key} className={selectedStrat === key ? 'active' : ''} onClick={() => setSelectedStrat(key)}
                style={selectedStrat === key ? { borderColor: STRAT_COLORS[key], color: STRAT_COLORS[key], fontSize: '0.78rem' } : { fontSize: '0.78rem' }}>
                {idx + 1}. {s.config.label} ({s.stats?.annualReturnPct}%)
              </button>
            )
          })}
        </div>
        {config.desc && <p style={{ color: '#888', fontSize: '0.8rem', margin: '8px 0 0' }}>{config.desc}</p>}
      </div>

      {/* KPI Grid */}
      <div className="kpi-grid">
        <div className="kpi" style={{ borderTop: `3px solid ${STRAT_COLORS[selectedStrat]}` }}>
          <div className="label">Win Rate</div>
          <div className="value green">{stats.winRate}%</div>
        </div>
        <div className="kpi" style={{ borderTop: '3px solid #4ade80' }}>
          <div className="label">Total P&L / Contract</div>
          <div className="value" style={{ color: stats.totalPnlPerContract >= 0 ? '#4ade80' : '#ef4444' }}>{fmtMoney(stats.totalPnlPerContract)}</div>
        </div>
        <div className="kpi" style={{ borderTop: '3px solid #fbbf24' }}>
          <div className="label">Profit Factor</div>
          <div className="value">{stats.profitFactor}</div>
        </div>
        <div className="kpi" style={{ borderTop: '3px solid #ef4444' }}>
          <div className="label">Max Drawdown</div>
          <div className="value" style={{ color: '#ef4444' }}>{fmtMoney(stats.maxDDPerContract)}</div>
        </div>
        <div className="kpi">
          <div className="label">Annual Return %</div>
          <div className="value" style={{ color: stats.annualReturnPct >= 0 ? '#4ade80' : '#ef4444' }}>{stats.annualReturnPct}%</div>
        </div>
        <div className="kpi">
          <div className="label">Avg Credit/Contract</div>
          <div className="value">{fmtMoney(stats.avgCreditPerContract)}</div>
        </div>
        <div className="kpi">
          <div className="label">Avg Days Held</div>
          <div className="value">{stats.avgDaysHeld}d</div>
        </div>
        <div className="kpi" style={{ borderTop: '3px solid #a78bfa' }}>
          <div className="label">Avg Delta Sold</div>
          <div className="value">{stats.avgDelta}Δ</div>
        </div>
        <div className="kpi">
          <div className="label">Risk per Contract</div>
          <div className="value" style={{ color: '#ef4444' }}>{fmtMoney(stats.maxRiskPerContract)}</div>
        </div>
        <div className="kpi">
          <div className="label">Trades</div>
          <div className="value">{stats.totalTrades}</div>
        </div>
      </div>

      {/* Exit reason breakdown */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: '0.82rem' }}>
        <span style={{ color: '#888' }}>Exit Reasons:</span>
        <span style={{ color: '#4ade80' }}>✓ Take Profit: <strong>{stats.takeProfitCount || 0}</strong></span>
        <span style={{ color: '#64b5f6' }}>✓ Expired OTM: <strong>{stats.expiredOtmCount || 0}</strong></span>
        <span style={{ color: '#fbbf24' }}>⚠ Stop Loss: <strong>{stats.stopLossCount || 0}</strong></span>
        <span style={{ color: '#ef4444' }}>✕ Max Loss: <strong>{stats.maxLossCount || 0}</strong></span>
      </div>

      {/* RISK RULES - clear and prominent */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 16, border: '1px solid #fbbf24', background: 'rgba(251,191,36,0.05)' }}>
        <h3 style={{ textTransform: 'none', letterSpacing: 0, fontSize: '0.95rem', color: '#fbbf24', margin: '0 0 12px' }}>⚡ RULES (how this backtest works)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, fontSize: '0.85rem' }}>
          <div><span style={{ color: '#888' }}>Open positions:</span> <strong style={{ color: '#4ade80' }}>{params.maxPositions || 1} MAX</strong><br/><span style={{ color: '#666', fontSize: '0.78rem' }}>Skip Monday if already at limit</span></div>
          <div><span style={{ color: '#888' }}>Entry day:</span> <strong style={{ color: '#fff' }}>Every Monday</strong><br/><span style={{ color: '#666', fontSize: '0.78rem' }}>Open new position if below max</span></div>
          <div><span style={{ color: '#888' }}>DTE:</span> <strong style={{ color: '#fff' }}>{config.dte} days</strong><br/><span style={{ color: '#666', fontSize: '0.78rem' }}>~6 weeks to expiration at entry</span></div>
          <div><span style={{ color: '#888' }}>Delta:</span> <strong style={{ color: '#fff' }}>{config.sell_delta ? `${config.sell_delta * 100}Δ` : '50Δ (ATM)'}</strong><br/><span style={{ color: '#666', fontSize: '0.78rem' }}>Strike selected by delta, not price distance</span></div>
          <div><span style={{ color: '#888' }}>Max risk per trade:</span> <strong style={{ color: '#ef4444' }}>{fmtMoney(stats.maxRiskPerContract)}</strong><br/><span style={{ color: '#666', fontSize: '0.78rem' }}>${config.width} spread width × 100</span></div>
          <div><span style={{ color: '#888' }}>Capital needed:</span> <strong style={{ color: '#fff' }}>{fmtMoney(stats.maxRiskPerContract * (params.maxPositions || 1))}</strong><br/><span style={{ color: '#666', fontSize: '0.78rem' }}>{params.maxPositions || 1} position{(params.maxPositions || 1) > 1 ? 's' : ''} × {fmtMoney(stats.maxRiskPerContract)}</span></div>
        </div>
      </div>

      {/* Strategy params */}
      <div className="card" style={{ padding: '10px 16px', marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.8rem', color: '#888' }}>
        <span>DTE: <strong style={{ color: '#ccc' }}>{config.dte}d</strong></span>
        <span>Delta: <strong style={{ color: '#ccc' }}>{config.sell_delta ? `${config.sell_delta * 100}Δ` : 'ATM'}</strong></span>
        <span>Type: <strong style={{ color: '#ccc' }}>{config.type?.replace('_', ' ')}</strong></span>
        <span>Width: <strong style={{ color: '#ccc' }}>${config.width}</strong></span>
        <span>Entry: <strong style={{ color: '#ccc' }}>Every {config.freq}d</strong></span>
        <span>Take Profit: <strong style={{ color: '#ccc' }}>{config.take_profit ? `${config.take_profit * 100}%` : 'None'}</strong></span>
        <span>Stop Loss: <strong style={{ color: '#ccc' }}>{config.stop_loss ? `${config.stop_loss}× credit` : 'None'}</strong></span>
      </div>

      {/* Equity Curve (SVG) */}
      <div className="card">
        <h3 style={{ textTransform: 'none', letterSpacing: 0 }}>Equity Curve (per contract, $)</h3>
        <div style={{ width: '100%', height: 200, position: 'relative' }}>
          <svg viewBox={`0 0 ${equityCurve.length || 1} 200`} preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
            <line x1="0" y1={200 - ((0 - minEquity) / eqRange) * 200} x2={equityCurve.length} y2={200 - ((0 - minEquity) / eqRange) * 200} stroke="#333" strokeWidth="0.5" strokeDasharray="2"/>
            <polyline
              fill="none"
              stroke={STRAT_COLORS[selectedStrat]}
              strokeWidth="1.5"
              points={equityCurve.map((v, i) => `${i},${200 - ((v - minEquity) / eqRange) * 200}`).join(' ')}
            />
            <polygon
              fill={`${STRAT_COLORS[selectedStrat]}15`}
              points={`0,200 ${equityCurve.map((v, i) => `${i},${200 - ((v - minEquity) / eqRange) * 200}`).join(' ')} ${equityCurve.length - 1},200`}
            />
          </svg>
          <div style={{ position: 'absolute', top: 4, left: 8, fontSize: '0.75rem', color: '#4ade80' }}>{fmtMoney(maxEquity * 100)}</div>
          <div style={{ position: 'absolute', bottom: 4, left: 8, fontSize: '0.75rem', color: '#ef4444' }}>{fmtMoney(minEquity * 100)}</div>
        </div>
      </div>

      {/* SPX vs Strategy Correlation Chart */}
      {data?.priceData && trades.length > 0 && (() => {
        const priceData = data.priceData
        const priceDates = priceData.dates
        const prices = priceData.prices
        
        // Build equity timeline aligned to trade exit dates
        const eqTimeline = []
        let cumPnl = 0
        trades.forEach(t => {
          cumPnl += t.pnl * 100
          eqTimeline.push({ date: t.exitDate, equity: cumPnl })
        })
        
        // Find date range overlap
        const firstTradeDate = trades[0].entryDate
        const lastTradeDate = eqTimeline[eqTimeline.length - 1].date
        
        // Filter price data to trade period
        const filteredPrices = []
        priceDates.forEach((d, i) => {
          if (d >= firstTradeDate && d <= lastTradeDate) {
            filteredPrices.push({ date: d, price: prices[i] })
          }
        })
        
        if (filteredPrices.length < 2) return null
        
        // Normalize SPX to 0-100% range for chart
        const spxMin = Math.min(...filteredPrices.map(p => p.price))
        const spxMax = Math.max(...filteredPrices.map(p => p.price))
        const spxRange = spxMax - spxMin || 1
        
        const eqMin = Math.min(...eqTimeline.map(e => e.equity), 0)
        const eqMax = Math.max(...eqTimeline.map(e => e.equity), 1)
        const eqRange2 = eqMax - eqMin || 1
        
        // Create unified x-axis based on dates
        const startDate = new Date(firstTradeDate).getTime()
        const endDate = new Date(lastTradeDate).getTime()
        const dateRange = endDate - startDate || 1
        
        const chartW = 800
        const chartH = 250
        
        // SPX line points
        const spxPoints = filteredPrices.map(p => {
          const x = ((new Date(p.date).getTime() - startDate) / dateRange) * chartW
          const y = chartH - ((p.price - spxMin) / spxRange) * (chartH - 20)
          return `${x},${y}`
        }).join(' ')
        
        // Equity line points (step function)
        const eqPoints = eqTimeline.map(e => {
          const x = ((new Date(e.date).getTime() - startDate) / dateRange) * chartW
          const y = chartH - ((e.equity - eqMin) / eqRange2) * (chartH - 20)
          return `${x},${y}`
        }).join(' ')
        
        // Mark losing trades
        const lossTrades = trades.filter(t => t.outcome === 'LOSS')
        
        return (
          <div className="card" style={{ marginTop: '1rem' }}>
            <h3 style={{ textTransform: 'none', letterSpacing: 0 }}>SPX Price vs {config.label} Equity — Correlation</h3>
            <div style={{ display: 'flex', gap: 16, marginBottom: 8, fontSize: '0.75rem' }}>
              <span><span style={{ display: 'inline-block', width: 16, height: 3, background: '#64b5f6', marginRight: 4, verticalAlign: 'middle' }}></span>SPX ({Math.round(spxMin).toLocaleString()} – {Math.round(spxMax).toLocaleString()})</span>
              <span><span style={{ display: 'inline-block', width: 16, height: 3, background: STRAT_COLORS[selectedStrat], marginRight: 4, verticalAlign: 'middle' }}></span>{config.label} Equity ({fmtMoney(eqMin)} – {fmtMoney(eqMax)})</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#ef4444', borderRadius: '50%', marginRight: 4, verticalAlign: 'middle' }}></span>Loss trades</span>
            </div>
            <div style={{ width: '100%', height: chartH + 30, position: 'relative', overflowX: 'auto' }}>
              <svg viewBox={`0 0 ${chartW} ${chartH + 10}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                {/* Zero line for equity */}
                <line x1="0" y1={chartH - ((0 - eqMin) / eqRange2) * (chartH - 20)} x2={chartW} y2={chartH - ((0 - eqMin) / eqRange2) * (chartH - 20)} stroke="#333" strokeWidth="0.5" strokeDasharray="4"/>
                {/* SPX price line */}
                <polyline fill="none" stroke="#64b5f6" strokeWidth="1.2" opacity="0.6" points={spxPoints} />
                {/* Strategy equity line */}
                <polyline fill="none" stroke={STRAT_COLORS[selectedStrat]} strokeWidth="2" points={eqPoints} />
                {/* Loss trade markers */}
                {lossTrades.map((t, i) => {
                  const x = ((new Date(t.exitDate).getTime() - startDate) / dateRange) * chartW
                  return <circle key={i} cx={x} cy={10} r="3" fill="#ef4444" opacity="0.8" />
                })}
              </svg>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#888', marginTop: 8 }}>
              <strong style={{ color: '#ccc' }}>Key insight:</strong> Losses cluster during sharp SPX selloffs (red dots). 
              The strategy recovers quickly because each loss is capped at 2× credit (~${Math.round((stats.avgCreditPerContract || 160) * 2)}).
              {lossTrades.length > 0 && <span> Biggest drawdown periods: {lossTrades.slice(-3).map(t => t.exitDate.slice(0,7)).join(', ')}</span>}
            </div>
          </div>
        )
      })()}

      {/* All strategies comparison */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <h3 style={{ textTransform: 'none', letterSpacing: 0 }}>All Strategies Compared</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ fontSize: '0.8rem' }}>
            <thead>
              <tr>
                <th>Strategy</th><th>Type</th><th>Delta</th><th>Trades</th><th>Win Rate</th><th>PF</th><th>Total/Contract</th><th>MaxDD</th><th>Annual%</th><th>Avg Held</th><th>Avg Credit</th>
              </tr>
            </thead>
            <tbody>
              {sortedStratKeys.map((key) => { const s = strategies[key]; return (
                <tr key={key} style={key === selectedStrat ? { background: `${STRAT_COLORS[key]}11` } : {}}>
                  <td><strong style={{ color: STRAT_COLORS[key] }}>{s.config.label}</strong></td>
                  <td>{s.config.type?.replace('_', ' ')}</td>
                  <td>{s.config.sell_delta ? `${s.config.sell_delta * 100}Δ` : 'ATM'}</td>
                  <td>{s.stats.totalTrades}</td>
                  <td><strong>{s.stats.winRate}%</strong></td>
                  <td>{s.stats.profitFactor}</td>
                  <td className={s.stats.totalPnlPerContract >= 0 ? 'win' : 'loss'}>{fmtMoney(s.stats.totalPnlPerContract)}</td>
                  <td style={{ color: '#ef4444' }}>{fmtMoney(s.stats.maxDDPerContract)}</td>
                  <td style={{ color: s.stats.annualReturnPct >= 0 ? '#4ade80' : '#ef4444' }}>{s.stats.annualReturnPct}%</td>
                  <td>{s.stats.avgDaysHeld}d</td>
                  <td>{fmtMoney(s.stats.avgCreditPerContract)}</td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>

      {/* Yearly breakdown */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <h3 style={{ textTransform: 'none', letterSpacing: 0 }}>Yearly P&L — {config.label}</h3>
        <table>
          <thead>
            <tr><th>Year</th><th>Trades</th><th>Wins</th><th>Losses</th><th>Win Rate</th><th>P&L/Contract</th></tr>
          </thead>
          <tbody>
            {yearlyData.map(y => (
              <tr key={y.year}>
                <td><strong>{y.year}</strong></td>
                <td>{y.trades}</td>
                <td style={{ color: '#4ade80' }}>{y.wins}</td>
                <td style={{ color: '#ef4444' }}>{y.losses}</td>
                <td>{y.wr}%</td>
                <td className={y.pnl >= 0 ? 'win' : 'loss'}>{fmtMoney(y.pnl * 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Monthly P&L Bar Chart */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <h3 style={{ textTransform: 'none', letterSpacing: 0 }}>Monthly P&L — {config.label}</h3>
        {monthlyData.length > 0 && (() => {
          const maxPnl = Math.max(...monthlyData.map(m => Math.abs(m.pnl * 100)), 1)
          const barWidth = Math.max(100 / monthlyData.length, 1)
          return (
            <div>
              <div style={{ width: '100%', overflowX: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', height: 200, minWidth: monthlyData.length * 28, borderBottom: '1px solid #333', position: 'relative' }}>
                  {/* Zero line */}
                  <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', borderTop: '1px dashed #555' }} />
                  {monthlyData.map((m, i) => {
                    const pnlDollars = m.pnl * 100
                    const barHeight = Math.abs(pnlDollars) / maxPnl * 90
                    const isPositive = pnlDollars >= 0
                    return (
                      <div key={m.month} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 28, position: 'relative', height: '100%', justifyContent: 'center' }}>
                        {isPositive ? (
                          <>
                            <div style={{ position: 'absolute', bottom: `calc(50% + ${barHeight}% + 2px)`, fontSize: '0.6rem', color: '#4ade80', whiteSpace: 'nowrap' }}>{fmtMoney(pnlDollars)}</div>
                            <div style={{ position: 'absolute', bottom: '50%', width: '60%', maxWidth: 20, height: `${barHeight}%`, background: '#4ade80', borderRadius: '2px 2px 0 0', opacity: 0.85 }} title={`${m.month}: ${fmtMoney(pnlDollars)}`} />
                          </>
                        ) : (
                          <>
                            <div style={{ position: 'absolute', top: `calc(50% + ${barHeight}% + 2px)`, fontSize: '0.6rem', color: '#ef4444', whiteSpace: 'nowrap' }}>{fmtMoney(pnlDollars)}</div>
                            <div style={{ position: 'absolute', top: '50%', width: '60%', maxWidth: 20, height: `${barHeight}%`, background: '#ef4444', borderRadius: '0 0 2px 2px', opacity: 0.85 }} title={`${m.month}: ${fmtMoney(pnlDollars)}`} />
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
                {/* X-axis labels */}
                <div style={{ display: 'flex', minWidth: monthlyData.length * 28 }}>
                  {monthlyData.map((m, i) => (
                    <div key={m.month} style={{ flex: 1, minWidth: 24, textAlign: 'center', fontSize: '0.6rem', color: '#888', paddingTop: 4, transform: 'rotate(-45deg)', transformOrigin: 'top center' }}>
                      {m.month.slice(2)}
                    </div>
                  ))}
                </div>
              </div>
              {/* Monthly table */}
              <div style={{ overflowX: 'auto', marginTop: 16, maxHeight: 400 }}>
                <table style={{ fontSize: '0.78rem' }}>
                  <thead>
                    <tr><th>Month</th><th>Trades</th><th>Wins</th><th>Losses</th><th>WR</th><th>P&L/Contract</th></tr>
                  </thead>
                  <tbody>
                    {[...monthlyData].reverse().map(m => (
                      <tr key={m.month}>
                        <td><strong>{m.month}</strong></td>
                        <td>{m.trades}</td>
                        <td style={{ color: '#4ade80' }}>{m.wins}</td>
                        <td style={{ color: '#ef4444' }}>{m.losses}</td>
                        <td>{m.wr}%</td>
                        <td className={m.pnl >= 0 ? 'win' : 'loss'}><strong>{fmtMoney(m.pnl * 100)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })()}
      </div>

      {/* All trades */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <h3 style={{ textTransform: 'none', letterSpacing: 0 }}>Full Trade Log — {trades.length} trades ({config.label})</h3>

        <div style={{ overflowX: 'auto', maxHeight: 600 }}>
          <table style={{ fontSize: '0.78rem' }}>
            <thead>
              <tr>
                <th>#</th><th>Entry</th><th>Day</th><th>Exit</th><th title="Other positions still open when this trade was entered (not counting this one)">Others Open</th><th>SPX</th><th>Qty</th><th>SELL Put</th><th>BUY Put</th>{config.type !== 'put_spread' && <><th>SELL Call</th><th>BUY Call</th></>}<th>Delta</th><th>Credit</th><th>Max Risk</th><th>R:R</th><th>P&L</th><th>Days</th><th>Exit</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const reversed = [...trades].reverse()
                return reversed.map((t, i) => {
                  const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(t.entryDate + 'T12:00:00').getDay()]
                  // Count how many OTHER trades were still open when this trade was entered
                  const tEntry = new Date(t.entryDate).getTime()
                  const othersOpen = trades.filter(other => {
                    if (other === t) return false
                    const oEntry = new Date(other.entryDate).getTime()
                    const oExit = new Date(other.exitDate).getTime()
                    return oEntry < tEntry && oExit > tEntry
                  }).length
                  const isOverlap = othersOpen > 0
                  return (
                    <tr key={i} style={isOverlap ? { borderLeft: '3px solid #fbbf24', background: 'rgba(251,191,36,0.04)' } : {}}>
                      <td style={{ color: '#666' }}>{trades.length - i}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{t.entryDate}</td>
                      <td style={{ whiteSpace: 'nowrap', color: '#a78bfa' }}>{weekday}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{t.exitDate}</td>
                      <td style={{ color: isOverlap ? '#fbbf24' : '#4ade80', fontWeight: isOverlap ? 700 : 400 }}>{othersOpen === 0 ? '—' : othersOpen}</td>
                      <td>{Math.round(t.entryPrice).toLocaleString()}</td>
                      <td><strong>1</strong></td>
                      <td style={{ color: '#ef4444' }}>{t.shortPutK?.toLocaleString()}</td>
                      <td style={{ color: '#4ade80' }}>{t.longPutK?.toLocaleString()}</td>
                      {config.type !== 'put_spread' && <><td style={{ color: '#ef4444' }}>{t.shortCallK?.toLocaleString()}</td><td style={{ color: '#4ade80' }}>{t.longCallK?.toLocaleString()}</td></>}
                      <td style={{ color: '#a78bfa' }}>{t.delta}Δ</td>
                      <td style={{ color: '#4ade80' }}>{fmtMoney(t.creditDollars)}</td>
                      <td style={{ color: '#ef4444' }}>{fmtMoney(t.maxLossDollars)}</td>
                      <td style={{ color: '#fbbf24' }}>{t.creditDollars > 0 ? `${Math.round(t.maxLossDollars / t.creditDollars)}:1` : '-'}</td>
                      <td className={t.pnlDollars >= 0 ? 'win' : 'loss'}><strong>{fmtMoney(t.pnlDollars)}</strong></td>
                      <td>{t.daysHeld}d</td>
                      <td>
                        <span style={{
                          padding: '2px 6px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600,
                          background: t.exitReason === 'TAKE_PROFIT' ? 'rgba(74,222,128,0.15)' :
                                      t.exitReason === 'EXPIRED_OTM' ? 'rgba(100,181,246,0.15)' :
                                      t.exitReason === 'STOP_LOSS' ? 'rgba(251,191,36,0.15)' : 'rgba(239,68,68,0.2)',
                          color: t.exitReason === 'TAKE_PROFIT' ? '#4ade80' :
                                 t.exitReason === 'EXPIRED_OTM' ? '#64b5f6' :
                                 t.exitReason === 'STOP_LOSS' ? '#fbbf24' : '#ef4444'
                        }}>{t.exitReason?.replace('_', ' ')}</span>
                      </td>
                    </tr>
                  )
                })
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trading Playbook */}
      <div className="card" style={{ marginTop: '1.5rem', borderLeft: '3px solid #fbbf24', padding: '20px 24px' }}>
        <h3 style={{ textTransform: 'none', letterSpacing: 0, fontSize: '1.05rem', marginBottom: 12, color: '#fbbf24' }}>📋 EXACT TRADING PLAYBOOK — {config.label}</h3>
        
        <div style={{ fontSize: '0.88rem', color: '#e2e8f0', lineHeight: 2.0 }}>
          <p style={{ marginBottom: 12 }}><strong style={{ color: '#fff' }}>Position Size:</strong> 1 contract per position, <strong>max {params.maxPositions || 1} open at a time</strong>. Max risk per position = <strong style={{ color: '#ef4444' }}>{fmtMoney(stats.maxRiskPerContract)}</strong>. Total capital at risk = <strong style={{ color: '#ef4444' }}>{fmtMoney(stats.maxRiskPerContract * (params.maxPositions || 1))}</strong>. Avg credit = <strong style={{ color: '#4ade80' }}>{fmtMoney(stats.avgCreditPerContract)}</strong>.</p>
          
          <p style={{ color: '#a1a1aa', fontSize: '0.82rem', marginBottom: 16 }}>
            Enter every Monday if below position limit. Each trade has its own independent management (take profit / stop loss / expiry).
          </p>

          <table style={{ width: '100%', fontSize: '0.85rem', marginBottom: 16 }}>
            <tbody>
              <tr><td style={{ color: '#888', width: 120, padding: '6px 0' }}>Instrument</td><td><strong>SPX options</strong> (not SPY — SPX is cash-settled, no assignment risk)</td></tr>
              <tr><td style={{ color: '#888', padding: '6px 0' }}>Strategy</td><td><strong>{config.label}</strong> ({config.type === 'put_spread' ? 'sell higher put, buy lower put' : config.type === 'iron_condor' ? 'sell put spread + call spread' : 'sell ATM straddle, buy wings'})</td></tr>
              <tr><td style={{ color: '#888', padding: '6px 0' }}>Entry Day</td><td><strong>Monday</strong> — open a new trade each Monday if below max positions ({params.maxPositions || 1}). If Monday is a holiday, enter on Tuesday instead.</td></tr>
              <tr><td style={{ color: '#888', padding: '6px 0' }}>Max Positions</td><td><strong>{params.maxPositions || 1} at a time</strong> — skip Monday if already at limit</td></tr>
              <tr><td style={{ color: '#888', padding: '6px 0' }}>DTE at Entry</td><td><strong>{config.dte} days to expiration</strong></td></tr>
              <tr><td style={{ color: '#888', padding: '6px 0' }}>Short Strike</td><td><strong>{config.sell_delta ? `${config.sell_delta * 100}Δ` : 'ATM (50Δ)'}</strong> — binary-searched to match target delta exactly</td></tr>
              <tr><td style={{ color: '#888', padding: '6px 0' }}>Spread Width</td><td><strong>${config.width}</strong> between short and long strikes</td></tr>
              <tr><td style={{ color: '#888', padding: '6px 0' }}>Credit Target</td><td>~<strong>{fmtMoney(stats.avgCreditPerContract)}</strong> per contract (varies with IV)</td></tr>
              <tr><td style={{ color: '#888', padding: '6px 0' }}>Max Risk</td><td><strong>{fmtMoney(stats.maxRiskPerContract)}</strong> per contract (width × 100 − credit)</td></tr>
            </tbody>
          </table>

          <h4 style={{ color: '#4ade80', marginBottom: 8, fontSize: '0.9rem' }}>✅ EXIT RULES</h4>
          <table style={{ width: '100%', fontSize: '0.85rem', marginBottom: 16 }}>
            <tbody>
              <tr><td style={{ color: '#4ade80', width: 140, padding: '6px 0' }}>🎯 Take Profit</td><td>{config.take_profit ? `Close when P&L reaches ${config.take_profit * 100}% of credit received (spread lost half its value)` : 'None — hold to expiration'}</td></tr>
              <tr><td style={{ color: '#ef4444', padding: '6px 0' }}>🛑 Stop Loss</td><td>{config.stop_loss ? `Close when unrealized loss reaches ${config.stop_loss}× the credit received` : 'None — accept max loss at expiry'}</td></tr>
              <tr><td style={{ color: '#64b5f6', padding: '6px 0' }}>⏰ Expiration</td><td>If neither target hit, let it expire. SPX settles in cash — no shares assigned.</td></tr>
            </tbody>
          </table>

          <h4 style={{ color: '#fbbf24', marginBottom: 8, fontSize: '0.9rem' }}>📅 EXAMPLE TRADE (today, SPX ~5,500)</h4>
          <div style={{ background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 6, fontSize: '0.82rem', fontFamily: 'monospace' }}>
            {config.type === 'put_spread' && <>
              <div>1. <strong style={{color:'#ef4444'}}>SELL</strong> 1x SPX {Math.round(5500 * (1 - (config.sell_delta || 0.2) * 1.5))} Put ({config.sell_delta * 100}Δ) — {config.dte} DTE</div>
              <div>2. <strong style={{color:'#4ade80'}}>BUY</strong>  1x SPX {Math.round(5500 * (1 - (config.sell_delta || 0.2) * 1.5)) - (config.width || 50)} Put — {config.dte} DTE (same expiry)</div>
            </>}
            {config.type === 'iron_condor' && <>
              <div style={{color:'#ef4444'}}>PUT SIDE:</div>
              <div>1. <strong style={{color:'#ef4444'}}>SELL</strong> 1x SPX {Math.round(5500 * (1 - (config.sell_delta || 0.2) * 1.5))} Put ({config.sell_delta * 100}Δ) — {config.dte} DTE</div>
              <div>2. <strong style={{color:'#4ade80'}}>BUY</strong>  1x SPX {Math.round(5500 * (1 - (config.sell_delta || 0.2) * 1.5)) - (config.width || 50)} Put — {config.dte} DTE</div>
              <div style={{color:'#ef4444', marginTop: 4}}>CALL SIDE:</div>
              <div>3. <strong style={{color:'#ef4444'}}>SELL</strong> 1x SPX {Math.round(5500 * (1 + (config.sell_delta || 0.2) * 1.5))} Call ({config.sell_delta * 100}Δ) — {config.dte} DTE</div>
              <div>4. <strong style={{color:'#4ade80'}}>BUY</strong>  1x SPX {Math.round(5500 * (1 + (config.sell_delta || 0.2) * 1.5)) + (config.width || 50)} Call — {config.dte} DTE</div>
            </>}
            {config.type === 'iron_fly' && <>
              <div style={{color:'#ef4444'}}>SELL (ATM):</div>
              <div>1. <strong style={{color:'#ef4444'}}>SELL</strong> 1x SPX 5500 Put (ATM ~50Δ) — {config.dte} DTE</div>
              <div>2. <strong style={{color:'#ef4444'}}>SELL</strong> 1x SPX 5500 Call (ATM ~50Δ) — {config.dte} DTE</div>
              <div style={{color:'#4ade80', marginTop: 4}}>BUY (WINGS):</div>
              <div>3. <strong style={{color:'#4ade80'}}>BUY</strong>  1x SPX {5500 - (config.width || 75)} Put — {config.dte} DTE</div>
              <div>4. <strong style={{color:'#4ade80'}}>BUY</strong>  1x SPX {5500 + (config.width || 75)} Call — {config.dte} DTE</div>
            </>}
            <div style={{ marginTop: 8, borderTop: '1px solid #333', paddingTop: 8 }}>
              <div>→ Credit received: ~{fmtMoney(stats.avgCreditPerContract)} per contract</div>
              <div>→ Max risk: {fmtMoney(stats.maxRiskPerContract)} per contract</div>
              <div>→ Risk:Reward: <strong>{stats.avgCreditPerContract > 0 ? `${Math.round(stats.maxRiskPerContract / stats.avgCreditPerContract)}:1` : 'N/A'}</strong></div>
              <div style={{ marginTop: 4, color: '#4ade80' }}>→ Take profit: Close when you've made ~{fmtMoney(Math.round((stats.avgCreditPerContract || 0) * (config.take_profit || 0.5)))} ({(config.take_profit || 0.5) * 100}% of credit)</div>
              <div style={{ color: '#ef4444' }}>→ Stop loss: Close if losing ~{fmtMoney(Math.round((stats.avgCreditPerContract || 0) * (config.stop_loss || 2)))} ({config.stop_loss || 2}× credit)</div>
              <div style={{ marginTop: 4, color: '#888' }}>→ Avg hold: {stats.avgDaysHeld} days | Win rate: {stats.winRate}% | {stats.totalTrades} trades over {params.dataRange}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Why SPX */}
      <div className="card" style={{ marginTop: '1rem', borderLeft: '3px solid #4ade80' }}>
        <h3 style={{ textTransform: 'none', letterSpacing: 0, fontSize: '0.95rem' }}>📘 Why SPX (Not SPY, Not Stocks)</h3>
        <ul style={{ fontSize: '0.85rem', color: '#ccc', lineHeight: 2.2, paddingLeft: '1.25rem' }}>
          <li><strong>European-style:</strong> Cannot be exercised early. No surprise assignment. Only expiration price matters.</li>
          <li><strong>Cash-settled:</strong> At expiry, you just receive/pay the cash difference. No stock delivery headaches.</li>
          <li><strong>Tax advantage (US):</strong> SPX options get 60/40 tax treatment (60% long-term, 40% short-term capital gains).</li>
          <li><strong>No pin risk:</strong> SPY can be assigned after-hours on expiration. SPX cannot.</li>
          <li><strong>Larger notional:</strong> 1 SPX contract ≈ 10 SPY contracts. Fewer commissions for same exposure.</li>
          <li><strong>S&P 500 upward bias:</strong> Historical ~10%/yr drift. Selling puts profits from time decay + this drift.</li>
          <li><strong>Key risk:</strong> Sudden crashes (Mar 2020, 2022 bear). The stop-loss at 2× credit limits damage.</li>
        </ul>
      </div>

      {/* Backtest assumptions */}
      <div className="card" style={{ marginTop: '1rem', borderLeft: '3px solid #888' }}>
        <h3 style={{ textTransform: 'none', letterSpacing: 0, fontSize: '0.9rem', color: '#888' }}>⚙️ Backtest Assumptions</h3>
        <ul style={{ fontSize: '0.82rem', color: '#999', lineHeight: 2, paddingLeft: '1.25rem' }}>
          <li>1 contract per trade (scale with account size)</li>
          <li><strong style={{ color: '#4ade80' }}>IV = Real VIX</strong> (actual market implied vol, not synthetic)</li>
          <li>No slippage modeled (SPX is extremely liquid, tight spreads)</li>
          <li>Daily close prices used for management checks (no intraday)</li>
          <li>Commissions not deducted (~$1.30/contract on most brokers = negligible)</li>
          <li>No vol skew — flat IV across all strikes (call side slightly too far OTM as a result)</li>
          <li>Data: {params.totalBars} trading days of ^GSPC + VIX</li>
        </ul>
      </div>

      {/* DATA RELIABILITY DISCLAIMER */}
      <div className="card" style={{ marginTop: '1rem', borderLeft: '3px solid #ef4444', background: 'rgba(239,68,68,0.04)' }}>
        <h3 style={{ textTransform: 'none', letterSpacing: 0, fontSize: '0.9rem', color: '#ef4444' }}>⚠️ DATA RELIABILITY — REAL VIX, SYNTHETIC OPTION PRICES</h3>
        <p style={{ fontSize: '0.85rem', color: '#ccc', lineHeight: 1.8, margin: '8px 0' }}>
          This backtest uses <strong style={{ color: '#4ade80' }}>real VIX data</strong> for strike placement (IV) and <strong style={{ color: '#4ade80' }}>real SPX prices</strong> — 
          but option credits are still Black-Scholes theoretical. No real bid/ask fills.
        </p>
        <table style={{ fontSize: '0.8rem', width: '100%', marginBottom: 12 }}>
          <thead>
            <tr><th style={{ textAlign: 'left', color: '#4ade80' }}>✓ What's Real</th><th style={{ textAlign: 'left', color: '#ef4444' }}>✕ What's Still Synthetic</th></tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ color: '#aaa', verticalAlign: 'top', padding: '4px 8px' }}>SPX daily prices (Yahoo Finance)</td>
              <td style={{ color: '#aaa', verticalAlign: 'top', padding: '4px 8px' }}>Option premiums (Black-Scholes formula)</td>
            </tr>
            <tr>
              <td style={{ color: '#aaa', verticalAlign: 'top', padding: '4px 8px' }}>VIX as implied volatility (real market IV)</td>
              <td style={{ color: '#aaa', verticalAlign: 'top', padding: '4px 8px' }}>No vol skew (flat IV across strikes)</td>
            </tr>
            <tr>
              <td style={{ color: '#aaa', verticalAlign: 'top', padding: '4px 8px' }}>Strike placement realistic (~5-7% OTM for 20Δ)</td>
              <td style={{ color: '#aaa', verticalAlign: 'top', padding: '4px 8px' }}>Call side slightly too far (skew makes real 20Δ calls closer)</td>
            </tr>
            <tr>
              <td style={{ color: '#aaa', verticalAlign: 'top', padding: '4px 8px' }}>Trade timing (Monday entries, 45 DTE)</td>
              <td style={{ color: '#aaa', verticalAlign: 'top', padding: '4px 8px' }}>No bid-ask spread or slippage</td>
            </tr>
          </tbody>
        </table>
        <p style={{ fontSize: '0.82rem', color: '#999', lineHeight: 1.8, margin: '8px 0 0' }}>
          <strong style={{ color: '#fbbf24' }}>Bottom line:</strong> Put spreads are most realistic here (real VIX overstates put-side IV = conservative). 
          Iron condor call side is slightly optimistic (real skew puts 20Δ calls ~4% away, model uses ~6%). 
          Use for relative comparison between strategies — don't treat exact $ as guaranteed.
        </p>
      </div>
    </div>
  )
}
