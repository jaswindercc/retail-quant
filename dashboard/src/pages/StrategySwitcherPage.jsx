import { useState, useEffect } from 'react'
import { fetchJson } from '../utils'

export default function StrategySwitcherPage() {
  const [data, setData] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [showTrades, setShowTrades] = useState(false)

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    fetchJson(`${base}strategy_switcher_data.json`).then(setData).catch(() => {})
  }, [])

  if (!data) return <div style={{ padding: '2rem', color: '#71717a' }}>Loading...</div>

  const strategies = data.strategies || []
  const switcher = data.switcher || {}
  const params = data.params || {}

  const tabs = [
    { id: 'overview', label: '📊 Overview' },
    { id: 'timeline', label: '🔀 Decision Timeline' },
    ...strategies.map((s, i) => ({ id: `strat-${i}`, label: `${i + 1}. ${s.name}` })),
    { id: 'switcher', label: '⭐ Switcher' },
    { id: 'rand-1', label: '🎲 RAND-1' },
  ]

  const activeStrat = activeTab.startsWith('strat-') ? strategies[parseInt(activeTab.split('-')[1])] : null

  return (
    <div className="page-container" style={{ padding: '1.5rem', maxWidth: 1200 }}>
      <h1 style={{ marginBottom: '0.25rem' }}>Strategy Switcher</h1>
      <p style={{ color: '#71717a', fontSize: 13, marginBottom: '1rem' }}>
        5 different strategies on {params.universe_count} S&P 500 stocks · {params.start_date} to {params.end_date} · ${params.starting_capital?.toLocaleString()} start · {params.risk_pct}% risk/trade
      </p>
      <p style={{ color: '#6366f1', fontSize: 12, marginBottom: '1.5rem' }}>
        <strong>Hypothesis:</strong> Can we beat all strategies by switching to one after its losing streak? (buying the dip in strategy performance)
      </p>

      {/* TABS */}
      <div style={{ display: 'flex', gap: 4, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => { setActiveTab(tab.id); setShowTrades(false) }}
            style={{ padding: '6px 14px', borderRadius: 6, border: activeTab === tab.id ? '2px solid #4ade80' : '1px solid #333', background: activeTab === tab.id ? '#0f2a1a' : '#1e1e2e', color: activeTab === tab.id ? '#4ade80' : '#e4e4e7', fontSize: 12, fontWeight: activeTab === tab.id ? 700 : 400, cursor: 'pointer' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && <OverviewTab strategies={strategies} switcher={switcher} params={params} />}

      {/* DECISION TIMELINE TAB */}
      {activeTab === 'timeline' && <DecisionTimelineTab switcher={switcher} strategies={strategies} />}

      {/* INDIVIDUAL STRATEGY TABS */}
      {activeStrat && <StrategyTab strat={activeStrat} showTrades={showTrades} setShowTrades={setShowTrades} />}

      {/* SWITCHER TAB */}
      {activeTab === 'switcher' && <SwitcherTab switcher={switcher} strategies={strategies} showTrades={showTrades} setShowTrades={setShowTrades} />}

      {/* RAND-1 TAB */}
      {activeTab === 'rand-1' && <RandSimTab />}
    </div>
  )
}

function OverviewTab({ strategies, switcher, params }) {
  const all = [...strategies, switcher]
  return (
    <>
      {/* COMPARISON TABLE */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#e4e4e7', fontSize: 14, marginBottom: '1rem' }}>Strategy Comparison</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#71717a', borderBottom: '1px solid #444' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Strategy</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Trades</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Win Rate</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>PF</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Total P/L</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Return %</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Max DD</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Max Streak</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Avg Win R</th>
              </tr>
            </thead>
            <tbody>
              {all.map((s, i) => {
                const sm = s.summary
                if (!sm || !sm.total_trades) return null
                const isSwitcher = s.name === 'Switcher'
                const isBest = sm.profit_factor === Math.max(...all.filter(x => x.summary?.profit_factor).map(x => x.summary.profit_factor))
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #222', background: isSwitcher ? '#1a1a3e' : isBest ? '#0a1f14' : 'transparent' }}>
                    <td style={{ padding: '6px 8px', color: isSwitcher ? '#f59e0b' : isBest ? '#4ade80' : '#e4e4e7', fontWeight: isSwitcher ? 700 : 400 }}>
                      {isSwitcher ? '⭐ ' : ''}{s.name}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{sm.total_trades}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: sm.win_rate > 30 ? '#4ade80' : '#f87171' }}>{sm.win_rate}%</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: sm.profit_factor >= 1.5 ? '#4ade80' : sm.profit_factor >= 1 ? '#fbbf24' : '#f87171', fontWeight: 700 }}>{sm.profit_factor}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: sm.total_pnl >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>${sm.total_pnl?.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: sm.return_pct >= 0 ? '#4ade80' : '#f87171' }}>{sm.return_pct}%</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#f87171' }}>${sm.max_drawdown?.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: sm.max_losing_streak > 10 ? '#f87171' : '#fbbf24' }}>{sm.max_losing_streak}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#4ade80' }}>{sm.avg_winner_r}R</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* EQUITY CURVES OVERLAY */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#e4e4e7', fontSize: 14, marginBottom: '0.5rem' }}>Equity Curves (all strategies)</h2>
        <p style={{ color: '#71717a', fontSize: 11, marginBottom: '1rem' }}>Starting capital: ${params.starting_capital?.toLocaleString()}</p>
        <EquityCurveOverlay strategies={strategies} switcher={switcher} startingCapital={params.starting_capital} />
      </div>

      {/* KEY FINDING */}
      <div style={{ background: switcher.summary?.total_pnl >= 0 ? '#0f2a1a' : '#1f0a0a', border: `1px solid ${switcher.summary?.total_pnl >= 0 ? '#4ade80' : '#f87171'}`, borderRadius: 8, padding: '1.25rem' }}>
        <h2 style={{ color: switcher.summary?.total_pnl >= 0 ? '#4ade80' : '#f87171', fontSize: 14, marginBottom: '0.75rem' }}>
          {switcher.summary?.total_pnl >= 0 ? '✅ Hypothesis CONFIRMED' : '❌ Hypothesis REJECTED'}
        </h2>
        <div style={{ fontSize: 12, color: '#d4d4d8', lineHeight: 2 }}>
          {switcher.summary?.total_pnl >= 0 ? (
            <>
              <div>The Switcher strategy beat individual strategies by rotating into strategies after their losing streaks.</div>
              <div>This suggests strategy performance DOES mean-revert and you CAN exploit losing streaks.</div>
            </>
          ) : (
            <>
              <div>The Switcher strategy <strong>lost money</strong> (${switcher.summary?.total_pnl?.toLocaleString()}) while the best individual strategy made ${Math.max(...strategies.map(s => s.summary?.total_pnl || 0)).toLocaleString()}.</div>
              <div style={{ marginTop: 8 }}><strong style={{ color: '#fbbf24' }}>What this means:</strong></div>
              <div>• Losing streaks do NOT reliably predict recovery. Strategy performance is not mean-reverting in the short term.</div>
              <div>• A strategy that's losing may continue losing (regime change, not just bad luck).</div>
              <div>• The best approach: pick the strategy with the highest PF and STICK WITH IT through drawdowns.</div>
              <div>• Switching strategies based on recent losses is a form of curve-fitting on noise.</div>
              <div style={{ marginTop: 8 }}><strong style={{ color: '#4ade80' }}>The real lesson:</strong> Your edge comes from the strategy's structural advantage, not from timing when to use it. Breakout (PF {strategies[0]?.summary?.profit_factor}) dominated because it has a real edge — not because other strategies had bad streaks.</div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

function DecisionTimelineTab({ switcher, strategies }) {
  const log = switcher.decision_log || []
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50
  const totalPages = Math.ceil(log.length / PAGE_SIZE)

  const stratNames = strategies.map(s => s.name)
  const shortNames = { 'Breakout': 'BRK', 'Mean Reversion': 'MR', 'Trend Pullback': 'TP', 'MACD Crossover': 'MACD', 'Bollinger Squeeze': 'BOL' }

  // Track switches and build reasons
  let prevPicked = null
  const logWithSwitch = log.map((entry, i) => {
    const switched = entry.picked !== prevPicked
    const prevStrategy = prevPicked
    prevPicked = entry.picked

    // Build "why" reason
    const sortedScores = Object.entries(entry.scores).sort((a, b) => b[1] - a[1])
    const pickedScore = entry.scores[entry.picked] || 0
    const secondBest = sortedScores.find(([n]) => n !== entry.picked)
    const gap = secondBest ? (pickedScore - secondBest[1]).toFixed(1) : '—'
    const coldStrats = Object.entries(entry.streaks || {}).filter(([, s]) => s >= 3).map(([n]) => shortNames[n])

    let reason = ''
    if (switched && prevStrategy) {
      const prevScore = entry.scores[prevStrategy] || 0
      reason = `${shortNames[prevStrategy]} dropped to ${prevScore.toFixed(1)}, ${shortNames[entry.picked]} now best at ${pickedScore.toFixed(1)}`
    } else if (switched) {
      reason = `First pick — ${shortNames[entry.picked]} has highest score (${pickedScore.toFixed(1)})`
    } else {
      reason = `Still best (${pickedScore.toFixed(1)}${gap !== '—' ? `, +${gap} vs 2nd` : ''})`
    }
    if (coldStrats.length > 0 && !switched) {
      reason += ` · Avoiding: ${coldStrats.join(', ')}`
    }

    return { ...entry, switched, prevStrategy, reason, idx: i }
  })
  const currentLogWithSwitch = logWithSwitch.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Stats for summary
  const totalSwitches = logWithSwitch.filter(e => e.switched).length
  const switchWins = logWithSwitch.filter(e => e.switched && e.pnlR > 0).length
  const stayWins = logWithSwitch.filter(e => !e.switched && e.pnlR > 0).length
  const stayTotal = logWithSwitch.filter(e => !e.switched).length

  // Which strategy was followed most
  const followDuration = {}
  let current = null, currentStart = 0
  logWithSwitch.forEach((e, i) => {
    if (e.switched) {
      if (current) followDuration[current] = (followDuration[current] || 0) + (i - currentStart)
      current = e.picked
      currentStart = i
    }
  })
  if (current) followDuration[current] = (followDuration[current] || 0) + (log.length - currentStart)
  const longestFollow = Object.entries(followDuration).sort((a, b) => b[1] - a[1])

  if (!log.length) return <p style={{ color: '#71717a' }}>No decision log available. Re-run the backtest script.</p>

  return (
    <div>
      {/* SUMMARY: WHAT IS THIS */}
      <div style={{ background: '#0f0f2a', border: '1px solid #6366f1', borderRadius: 8, padding: '1.25rem', marginBottom: '1.25rem' }}>
        <h2 style={{ color: '#e4e4e7', fontSize: 15, marginBottom: '0.75rem' }}>How The Switcher Decides</h2>
        <div style={{ fontSize: 12, color: '#d4d4d8', lineHeight: 2.2 }}>
          <div><strong style={{ color: '#4ade80' }}>1.</strong> Every day, all 5 strategies independently generate buy signals on 50 stocks.</div>
          <div><strong style={{ color: '#4ade80' }}>2.</strong> The Switcher scores each strategy by its <strong style={{ color: '#60a5fa' }}>rolling Profit Factor</strong> ($ won ÷ $ lost over last 10 completed trades).</div>
          <div><strong style={{ color: '#4ade80' }}>3.</strong> If a strategy is on a <strong style={{ color: '#f87171' }}>losing streak (3+)</strong>, its score gets penalized (×0.3) — don't follow a cold strategy.</div>
          <div><strong style={{ color: '#4ade80' }}>4.</strong> The Switcher <strong>only takes signals from the highest-scoring strategy</strong>. All other signals are ignored that day.</div>
          <div><strong style={{ color: '#4ade80' }}>5.</strong> When a different strategy overtakes the current one in score → <span style={{ background: '#fbbf24', color: '#000', padding: '1px 6px', borderRadius: 3, fontWeight: 700, fontSize: 10 }}>⚡ SWITCH</span></div>
        </div>
        <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#1e1e2e', borderRadius: 6, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#71717a', fontSize: 10 }}>Total Trades</div>
            <div style={{ color: '#e4e4e7', fontSize: 18, fontWeight: 800 }}>{log.length}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#71717a', fontSize: 10 }}>Times Switched</div>
            <div style={{ color: '#fbbf24', fontSize: 18, fontWeight: 800 }}>{totalSwitches}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#71717a', fontSize: 10 }}>Win Rate After Switch</div>
            <div style={{ color: switchWins/totalSwitches > 0.35 ? '#4ade80' : '#f87171', fontSize: 18, fontWeight: 800 }}>{(switchWins/totalSwitches*100).toFixed(0)}%</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#71717a', fontSize: 10 }}>Win Rate When Staying</div>
            <div style={{ color: stayWins/stayTotal > 0.35 ? '#4ade80' : '#f87171', fontSize: 18, fontWeight: 800 }}>{(stayWins/stayTotal*100).toFixed(0)}%</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#71717a', fontSize: 10 }}>Most Followed</div>
            <div style={{ color: '#60a5fa', fontSize: 14, fontWeight: 700 }}>{longestFollow[0] ? `${shortNames[longestFollow[0][0]]} (${longestFollow[0][1]} trades)` : '—'}</div>
          </div>
        </div>
      </div>

      {/* PAGINATION */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <span style={{ color: '#71717a', fontSize: 12 }}>{log.length} decisions · Page {page + 1}/{totalPages}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setPage(0)} disabled={page === 0} style={{ ...btnStyle, opacity: page === 0 ? 0.3 : 1 }}>««</button>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ ...btnStyle, opacity: page === 0 ? 0.3 : 1 }}>‹</button>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{ ...btnStyle, opacity: page >= totalPages - 1 ? 0.3 : 1 }}>›</button>
          <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} style={{ ...btnStyle, opacity: page >= totalPages - 1 ? 0.3 : 1 }}>»»</button>
        </div>
      </div>

      {/* TABLE */}
      <div style={{ overflowX: 'auto', background: '#1e1e2e', border: '1px solid #333', borderRadius: 8 }}>
        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', minWidth: 1100 }}>
          <thead>
            <tr style={{ color: '#71717a', borderBottom: '2px solid #444', position: 'sticky', top: 0, background: '#1e1e2e' }}>
              <th style={{ padding: '8px 6px', textAlign: 'left' }}>#</th>
              <th style={{ padding: '8px 6px', textAlign: 'left' }}>Date</th>
              <th style={{ padding: '8px 6px', textAlign: 'left' }}>Stock</th>
              {stratNames.map(n => (
                <th key={n} style={{ padding: '8px 4px', textAlign: 'center', minWidth: 90 }}>
                  <span style={{ fontSize: 9 }}>{shortNames[n] || n}</span>
                  <br /><span style={{ fontSize: 7, color: '#52525b' }}>last 5 trades (R)</span>
                </th>
              ))}
              <th style={{ padding: '8px 6px', textAlign: 'center' }}>Picked</th>
              <th style={{ padding: '8px 6px', textAlign: 'center' }}>Result</th>
              <th style={{ padding: '8px 6px', textAlign: 'left' }}>Why</th>
            </tr>
          </thead>
          <tbody>
            {currentLogWithSwitch.map((entry, i) => {
              const win = entry.pnlR > 0
              return (
                <tr key={i} style={{ borderBottom: '1px solid #222', background: entry.switched ? '#1a1a0a' : 'transparent' }}>
                  <td style={{ padding: '5px 6px', color: '#52525b', fontSize: 10 }}>{entry.idx + 1}</td>
                  <td style={{ padding: '5px 6px', color: '#a1a1aa', whiteSpace: 'nowrap' }}>{entry.date}</td>
                  <td style={{ padding: '5px 6px', color: '#60a5fa', fontWeight: 600 }}>{entry.stock}</td>
                  {stratNames.map(name => {
                    const rs = entry.lastRs?.[name] || []
                    const isPicked = name === entry.picked
                    const streak = entry.streaks?.[name] || 0
                    const isCold = streak >= 3
                    const border = isPicked ? '2px solid #4ade80' : isCold ? '1px solid #f8717155' : '1px solid #333'
                    const bg = isPicked ? '#0f2a1a' : isCold ? '#1f0a0a' : '#141420'
                    return (
                      <td key={name} style={{ padding: '3px 2px', textAlign: 'center' }}>
                        <div style={{ background: bg, border, borderRadius: 4, padding: '3px 2px', display: 'flex', gap: 1, justifyContent: 'center', alignItems: 'center', minHeight: 20 }}>
                          {rs.length === 0 ? <span style={{ color: '#333', fontSize: 8 }}>—</span> : rs.map((r, ri) => (
                            <span key={ri} style={{
                              fontSize: 8, fontWeight: 700, padding: '1px 2px', borderRadius: 2,
                              color: r > 0 ? '#4ade80' : '#f87171',
                              background: r > 0 ? '#0a1f14' : '#1f0a0a',
                            }}>
                              {r > 0 ? '+' : ''}{r}
                            </span>
                          ))}
                          {isPicked && <span style={{ fontSize: 7, color: '#4ade80', marginLeft: 2 }}>✓</span>}
                        </div>
                      </td>
                    )
                  })}
                  <td style={{ padding: '5px 6px', textAlign: 'center' }}>
                    <span style={{ fontSize: 10, color: '#4ade80', fontWeight: 700 }}>
                      {shortNames[entry.picked]}
                    </span>
                    {entry.switched && <span style={{ marginLeft: 3, fontSize: 8, background: '#fbbf24', color: '#000', padding: '1px 4px', borderRadius: 3, fontWeight: 700 }}>⚡</span>}
                  </td>
                  <td style={{ padding: '5px 6px', textAlign: 'center', color: win ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                    {win ? '+' : ''}{entry.pnlR?.toFixed(1)}R
                  </td>
                  <td style={{ padding: '5px 6px', color: entry.switched ? '#fbbf24' : '#52525b', fontSize: 10, maxWidth: 220 }}>
                    {entry.reason}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* SWITCH EVENTS */}
      <div style={{ marginTop: '1.5rem', background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1rem' }}>
        <h3 style={{ color: '#e4e4e7', fontSize: 13, marginBottom: '0.5rem' }}>All {totalSwitches} Switch Events</h3>
        <p style={{ color: '#71717a', fontSize: 11, marginBottom: '0.75rem' }}>Every time the Switcher changed which strategy it follows. Yellow = the switch moment.</p>
        <div style={{ maxHeight: 350, overflowY: 'auto' }}>
          {logWithSwitch.filter(e => e.switched).map((entry, i) => {
            const win = entry.pnlR > 0
            return (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid #222', fontSize: 11 }}>
                <span style={{ color: '#71717a', minWidth: 30 }}>#{entry.idx + 1}</span>
                <span style={{ color: '#a1a1aa', minWidth: 78 }}>{entry.date}</span>
                <span style={{ color: '#fbbf24', fontWeight: 700, minWidth: 50 }}>→ {shortNames[entry.picked]}</span>
                <span style={{ color: '#60a5fa', minWidth: 40 }}>{entry.stock}</span>
                <span style={{ color: win ? '#4ade80' : '#f87171', fontWeight: 600, minWidth: 40 }}>{win ? '+' : ''}{entry.pnlR?.toFixed(1)}R</span>
                <span style={{ color: '#d4d4d8', fontSize: 10, flex: 1 }}>{entry.reason}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const btnStyle = { background: '#333', color: '#e4e4e7', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 11 }

function EquityCurveOverlay({ strategies, switcher, startingCapital }) {
  const colors = ['#4ade80', '#60a5fa', '#f59e0b', '#a78bfa', '#f87171', '#fbbf24']
  const all = [...strategies, switcher]

  // Normalize all curves to same x-axis (by index)
  const maxLen = Math.max(...all.map(s => (s.equity_curve || []).length))
  if (maxLen < 2) return null

  // Find global min/max capital
  let globalMin = startingCapital, globalMax = startingCapital
  for (const s of all) {
    for (const pt of (s.equity_curve || [])) {
      if (pt.capital < globalMin) globalMin = pt.capital
      if (pt.capital > globalMax) globalMax = pt.capital
    }
  }
  const range = globalMax - globalMin || 1

  return (
    <div>
      <svg width="100%" height="150" viewBox={`0 0 ${maxLen} 150`} preserveAspectRatio="none" style={{ display: 'block' }}>
        {/* Starting capital line */}
        <line x1="0" y1={((startingCapital - globalMin) / range) * -150 + 150} x2={maxLen} y2={((startingCapital - globalMin) / range) * -150 + 150} stroke="#333" strokeWidth="0.5" strokeDasharray="4" />
        {all.map((s, si) => {
          const ec = s.equity_curve || []
          if (ec.length < 2) return null
          const points = ec.map((pt, i) => `${(i / ec.length) * maxLen},${((pt.capital - globalMin) / range) * -150 + 150}`).join(' ')
          return <polyline key={si} fill="none" stroke={colors[si % colors.length]} strokeWidth={s.name === 'Switcher' ? '2.5' : '1'} strokeOpacity={s.name === 'Switcher' ? 1 : 0.7} points={points} />
        })}
      </svg>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
        {all.map((s, i) => (
          <span key={i} style={{ fontSize: 10, color: colors[i % colors.length], fontWeight: s.name === 'Switcher' ? 700 : 400 }}>
            ● {s.name} (${s.summary?.final_capital?.toLocaleString(undefined, {maximumFractionDigits: 0})})
          </span>
        ))}
      </div>
    </div>
  )
}

function StrategyTab({ strat, showTrades, setShowTrades }) {
  const s = strat.summary
  const ec = strat.equity_curve || []
  if (!s || !s.total_trades) return <p style={{ color: '#71717a' }}>No data for this strategy.</p>

  const capitals = ec.map(e => e.capital)
  const maxCap = Math.max(...capitals, 50001)
  const minCap = Math.min(...capitals, 49999)

  return (
    <>
      {/* STATS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <Stat label="Final Capital" value={`$${s.final_capital?.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`+${s.return_pct}%`} color="#4ade80" />
        <Stat label="Total P/L" value={`$${s.total_pnl?.toLocaleString(undefined, {maximumFractionDigits: 0})}`} color={s.total_pnl >= 0 ? '#4ade80' : '#f87171'} />
        <Stat label="Profit Factor" value={s.profit_factor} color={s.profit_factor >= 1.5 ? '#4ade80' : s.profit_factor >= 1 ? '#fbbf24' : '#f87171'} />
        <Stat label="Win Rate" value={`${s.win_rate}%`} sub={`${s.wins}/${s.total_trades}`} color="#60a5fa" />
        <Stat label="Max DD" value={`$${s.max_drawdown?.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`${s.max_drawdown_pct}%`} color="#f87171" />
        <Stat label="Return/DD" value={(s.total_pnl / s.max_drawdown).toFixed(2)} color="#60a5fa" />
        <Stat label="Max Streak" value={s.max_losing_streak} sub="losses" color={s.max_losing_streak > 10 ? '#f87171' : '#fbbf24'} />
        <Stat label="Avg Win" value={`${s.avg_winner_r}R`} color="#4ade80" />
      </div>

      {/* EQUITY CURVE */}
      {ec.length > 1 && (
        <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: 11, color: '#71717a', marginBottom: 6 }}>Equity Curve</div>
          <svg width="100%" height="100" viewBox={`0 0 ${ec.length} 100`} preserveAspectRatio="none" style={{ display: 'block' }}>
            <line x1="0" y1={50} x2={ec.length} y2={50} stroke="#333" strokeWidth="0.5" />
            <polyline fill="none" stroke="#4ade80" strokeWidth="1.5"
              points={ec.map((e, i) => `${i},${((e.capital - minCap) / (maxCap - minCap)) * -100 + 100}`).join(' ')} />
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#71717a', marginTop: 4 }}>
            <span>{ec[0]?.date}</span><span>{ec[ec.length - 1]?.date}</span>
          </div>
        </div>
      )}

      {/* TRADES */}
      <TradeTable trades={strat.trades} showTrades={showTrades} setShowTrades={setShowTrades} />
    </>
  )
}

function SwitcherTab({ switcher, strategies, showTrades, setShowTrades }) {
  const s = switcher.summary
  const ec = switcher.equity_curve || []
  if (!s || !s.total_trades) return <p style={{ color: '#71717a' }}>No switcher trades generated.</p>

  const capitals = ec.map(e => e.capital)
  const maxCap = Math.max(...capitals, 50001)
  const minCap = Math.min(...capitals, 49999)

  return (
    <>
      {/* EXPLANATION */}
      <div style={{ background: '#1a1a3e', border: '1px solid #6366f1', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem', fontSize: 12, color: '#d4d4d8', lineHeight: 1.8 }}>
        <strong style={{ color: '#6366f1' }}>Switcher Logic:</strong> Monitor all 5 strategies. When a strategy accumulates 3+ consecutive losses, take its next signal (betting on mean-reversion of strategy performance). Risk = 2% of current capital, compounding. Reduce risk on our own losing streaks.
      </div>

      {/* STATS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <Stat label="Final Capital" value={`$${s.final_capital?.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`${s.return_pct > 0 ? '+' : ''}${s.return_pct}%`} color={s.total_pnl >= 0 ? '#4ade80' : '#f87171'} />
        <Stat label="Total P/L" value={`$${s.total_pnl?.toLocaleString(undefined, {maximumFractionDigits: 0})}`} color={s.total_pnl >= 0 ? '#4ade80' : '#f87171'} />
        <Stat label="Profit Factor" value={s.profit_factor} color={s.profit_factor >= 1.5 ? '#4ade80' : s.profit_factor >= 1 ? '#fbbf24' : '#f87171'} />
        <Stat label="Win Rate" value={`${s.win_rate}%`} sub={`${s.wins}/${s.total_trades}`} color="#60a5fa" />
        <Stat label="Max DD" value={`$${s.max_drawdown?.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`${s.max_drawdown_pct}%`} color="#f87171" />
        <Stat label="Max Streak" value={s.max_losing_streak} sub="losses" color={s.max_losing_streak > 10 ? '#f87171' : '#fbbf24'} />
        <Stat label="Avg Win" value={`${s.avg_winner_r}R`} color="#4ade80" />
        <Stat label="Trades" value={s.total_trades} color="#e4e4e7" />
      </div>

      {/* SIGNALS PER STRATEGY */}
      {s.signals_per_strategy && (
        <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: 11, color: '#71717a', marginBottom: 8 }}>Signals taken from each strategy:</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {Object.entries(s.signals_per_strategy).map(([name, count]) => (
              <span key={name} style={{ fontSize: 12, color: '#e4e4e7', background: '#0f0f1a', padding: '4px 10px', borderRadius: 4, border: '1px solid #333' }}>
                {name}: <strong>{count}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* EQUITY CURVE */}
      {ec.length > 1 && (
        <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: 11, color: '#71717a', marginBottom: 6 }}>Switcher Equity Curve</div>
          <svg width="100%" height="100" viewBox={`0 0 ${ec.length} 100`} preserveAspectRatio="none" style={{ display: 'block' }}>
            <line x1="0" y1={50} x2={ec.length} y2={50} stroke="#333" strokeWidth="0.5" />
            <polyline fill="none" stroke={s.total_pnl >= 0 ? '#4ade80' : '#f87171'} strokeWidth="1.5"
              points={ec.map((e, i) => `${i},${((e.capital - minCap) / (maxCap - minCap)) * -100 + 100}`).join(' ')} />
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#71717a', marginTop: 4 }}>
            <span>{ec[0]?.date}</span><span>{ec[ec.length - 1]?.date}</span>
          </div>
        </div>
      )}

      {/* TRADES */}
      <TradeTable trades={switcher.trades} showTrades={showTrades} setShowTrades={setShowTrades} showSource={true} />
    </>
  )
}

function TradeTable({ trades, showTrades, setShowTrades, showSource = false }) {
  if (!trades || !trades.length) return null
  const reversedTrades = [...trades].reverse()
  return (
    <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: '#71717a', fontSize: 12 }}>{trades.length} trades (newest first)</span>
        <button onClick={() => setShowTrades(!showTrades)}
          style={{ background: '#333', color: '#e4e4e7', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 11 }}>
          {showTrades ? 'Hide' : 'Show Trades'}
        </button>
      </div>
      {showTrades && (
        <div style={{ maxHeight: 500, overflowY: 'auto', overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ color: '#71717a', borderBottom: '1px solid #333', position: 'sticky', top: 0, background: '#1e1e2e' }}>
                <th style={{ textAlign: 'left', padding: '3px 5px' }}>#</th>
                {showSource && <th style={{ textAlign: 'left', padding: '3px 5px' }}>Source</th>}
                <th style={{ textAlign: 'left', padding: '3px 5px' }}>Stock</th>
                <th style={{ textAlign: 'left', padding: '3px 5px' }}>Entry</th>
                <th style={{ textAlign: 'right', padding: '3px 5px' }}>Capital</th>
                <th style={{ textAlign: 'right', padding: '3px 5px' }}>Risk$</th>
                <th style={{ textAlign: 'right', padding: '3px 5px' }}>R</th>
                <th style={{ textAlign: 'right', padding: '3px 5px' }}>P/L</th>
                <th style={{ textAlign: 'left', padding: '3px 5px' }}>Exit</th>
                <th style={{ textAlign: 'right', padding: '3px 5px' }}>Days</th>
              </tr>
            </thead>
            <tbody>
              {reversedTrades.map((t, i) => {
                const win = t.pnlR > 0
                const tradeNum = trades.length - i
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #1a1a1a', background: win ? '#0a1f14' : 'transparent' }}>
                    <td style={{ padding: '3px 5px', color: '#71717a' }}>{tradeNum}</td>
                    {showSource && <td style={{ padding: '3px 5px', color: '#a78bfa', fontSize: 10 }}>{t.sourceStrategy}</td>}
                    <td style={{ padding: '3px 5px', color: '#60a5fa' }}>{t.stock}</td>
                    <td style={{ padding: '3px 5px', color: '#a1a1aa' }}>{t.entryDate}</td>
                    <td style={{ padding: '3px 5px', textAlign: 'right', color: '#71717a' }}>${t.capitalAtEntry?.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                    <td style={{ padding: '3px 5px', textAlign: 'right', color: '#6366f1' }}>${t.riskDollars?.toFixed(0)}</td>
                    <td style={{ padding: '3px 5px', textAlign: 'right', color: win ? '#4ade80' : '#f87171', fontWeight: 700 }}>{t.pnlR > 0 ? '+' : ''}{t.pnlR?.toFixed(1)}R</td>
                    <td style={{ padding: '3px 5px', textAlign: 'right', color: win ? '#4ade80' : '#f87171', fontWeight: 600 }}>{t.pnlDollar > 0 ? '+' : ''}${t.pnlDollar?.toFixed(0)}</td>
                    <td style={{ padding: '3px 5px', color: '#71717a', fontSize: 10 }}>{t.exitReason}</td>
                    <td style={{ padding: '3px 5px', textAlign: 'right', color: '#71717a' }}>{t.durationDays}d</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, sub, color }) {
  return (
    <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '0.75rem', textAlign: 'center' }}>
      <div style={{ color: '#71717a', fontSize: 10 }}>{label}</div>
      <div style={{ color, fontSize: 18, fontWeight: 800 }}>{value}</div>
      {sub && <div style={{ color: '#52525b', fontSize: 10 }}>{sub}</div>}
    </div>
  )
}

// ─── RAND-1: Random Strategy Simulation ───────────────────────────────────────

function seededRandom(seed) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

function runRandomSim(seed, numTrades = 25, customProfiles = null) {
  const rng = seededRandom(seed)
  const STARTING_CAPITAL = 50000
  const RISK_PCT = 0.02

  const stratProfiles = customProfiles || [
    { name: 'A', winRate: 0.45, avgWinR: 2.0, avgLoseR: -1.0 },
    { name: 'B', winRate: 0.30, avgWinR: 3.5, avgLoseR: -1.0 },
    { name: 'C', winRate: 0.55, avgWinR: 1.2, avgLoseR: -1.0 },
    { name: 'D', winRate: 0.25, avgWinR: 2.0, avgLoseR: -1.0 },
    { name: 'E', winRate: 0.35, avgWinR: 2.8, avgLoseR: -1.0 },
    { name: 'F', winRate: 0.20, avgWinR: 2.5, avgLoseR: -1.0 },
    { name: 'G', winRate: 0.40, avgWinR: 2.2, avgLoseR: -1.0 },
    { name: 'H', winRate: 0.50, avgWinR: 1.5, avgLoseR: -1.0 },
    { name: 'I', winRate: 0.28, avgWinR: 1.8, avgLoseR: -1.0 },
    { name: 'J', winRate: 0.38, avgWinR: 2.5, avgLoseR: -1.0 },
  ]

  const NUM_STRATEGIES = stratProfiles.length
  const TRADES_PER_STRATEGY = numTrades

  // Generate trades for each strategy
  const stratResults = stratProfiles.map(profile => {
    const trades = []
    let capital = STARTING_CAPITAL
    let equity = [{ trade: 0, capital }]
    let streak = 0
    let maxStreak = 0

    for (let i = 0; i < TRADES_PER_STRATEGY; i++) {
      const isWin = rng() < profile.winRate
      // Add some variance to R
      const rVariance = 0.5 + rng() * 1.0
      const pnlR = isWin ? profile.avgWinR * rVariance : profile.avgLoseR * (0.7 + rng() * 0.6)
      const riskDollars = capital * RISK_PCT
      const pnlDollar = riskDollars * pnlR
      capital += pnlDollar

      if (pnlR <= 0) { streak++; maxStreak = Math.max(maxStreak, streak) }
      else { streak = 0 }

      trades.push({ pnlR: Math.round(pnlR * 10) / 10, pnlDollar: Math.round(pnlDollar), capital: Math.round(capital) })
      equity.push({ trade: i + 1, capital: Math.round(capital) })
    }

    const wins = trades.filter(t => t.pnlR > 0)
    const losses = trades.filter(t => t.pnlR <= 0)
    const grossWin = wins.reduce((s, t) => s + t.pnlDollar, 0)
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlDollar, 0))

    return {
      ...profile,
      trades,
      equity,
      finalCapital: Math.round(capital),
      totalPnl: Math.round(capital - STARTING_CAPITAL),
      returnPct: Math.round((capital - STARTING_CAPITAL) / STARTING_CAPITAL * 1000) / 10,
      winRate: Math.round(wins.length / trades.length * 1000) / 10,
      profitFactor: grossLoss > 0 ? Math.round(grossWin / grossLoss * 100) / 100 : 99,
      maxStreak,
      avgWinR: wins.length > 0 ? Math.round(wins.reduce((s, t) => s + t.pnlR, 0) / wins.length * 10) / 10 : 0,
    }
  })

  // ─── SWITCHER LOGIC (same as real one) ───────────────────────────────────
  // Interleave trades from all strategies (round-robin, 1 per "day")
  // Rolling PF over last 10 trades, 3+ streak penalty at 0.3x, pick highest scorer
  const ROLLING_WINDOW = 10
  const STREAK_THRESHOLD = 3
  const STREAK_PENALTY = 0.3

  // Build a timeline: each "day" one trade fires from each strategy
  // Switcher picks one strategy per day
  let switcherCapital = STARTING_CAPITAL
  const switcherTrades = []
  const switcherEquity = [{ trade: 0, capital: switcherCapital }]
  let switcherStreak = 0
  let switcherMaxStreak = 0

  // Track each strategy's history as switcher evaluates
  const historyPerStrat = stratProfiles.map(() => []) // completed R values
  const streakPerStrat = stratProfiles.map(() => 0)

  for (let day = 0; day < TRADES_PER_STRATEGY; day++) {
    // Score each strategy based on rolling PF of their last ROLLING_WINDOW trades
    const scores = stratProfiles.map((_, si) => {
      const hist = historyPerStrat[si]
      const recent = hist.slice(-ROLLING_WINDOW)
      if (recent.length < 3) return 1.0 // not enough data, neutral score
      const wins = recent.filter(r => r > 0)
      const losses = recent.filter(r => r <= 0)
      const grossWin = wins.reduce((s, r) => s + r, 0)
      const grossLoss = Math.abs(losses.reduce((s, r) => s + r, 0))
      let pf = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? 5.0 : 0.5)
      // Streak penalty
      if (streakPerStrat[si] >= STREAK_THRESHOLD) pf *= STREAK_PENALTY
      return pf
    })

    // Pick strategy with highest score
    let bestIdx = 0
    let bestScore = scores[0]
    for (let i = 1; i < scores.length; i++) {
      if (scores[i] > bestScore) { bestScore = scores[i]; bestIdx = i }
    }

    // Take that strategy's trade for this day
    const trade = stratResults[bestIdx].trades[day]
    const riskDollars = switcherCapital * RISK_PCT
    // Scale the R to our capital
    const pnlDollar = riskDollars * trade.pnlR
    switcherCapital += pnlDollar

    if (trade.pnlR <= 0) { switcherStreak++; switcherMaxStreak = Math.max(switcherMaxStreak, switcherStreak) }
    else { switcherStreak = 0 }

    switcherTrades.push({ pnlR: trade.pnlR, pnlDollar: Math.round(pnlDollar), capital: Math.round(switcherCapital), source: stratProfiles[bestIdx].name, score: Math.round(bestScore * 100) / 100 })
    switcherEquity.push({ trade: day + 1, capital: Math.round(switcherCapital) })

    // Update ALL strategies' history (they all "traded" this day regardless of pick)
    for (let si = 0; si < NUM_STRATEGIES; si++) {
      const t = stratResults[si].trades[day]
      historyPerStrat[si].push(t.pnlR)
      if (t.pnlR <= 0) streakPerStrat[si]++
      else streakPerStrat[si] = 0
    }
  }

  const switcherWins = switcherTrades.filter(t => t.pnlR > 0)
  const switcherLosses = switcherTrades.filter(t => t.pnlR <= 0)
  const swGrossWin = switcherWins.reduce((s, t) => s + t.pnlDollar, 0)
  const swGrossLoss = Math.abs(switcherLosses.reduce((s, t) => s + t.pnlDollar, 0))

  const switcherSummary = {
    finalCapital: Math.round(switcherCapital),
    totalPnl: Math.round(switcherCapital - STARTING_CAPITAL),
    returnPct: Math.round((switcherCapital - STARTING_CAPITAL) / STARTING_CAPITAL * 1000) / 10,
    winRate: Math.round(switcherWins.length / switcherTrades.length * 1000) / 10,
    profitFactor: swGrossLoss > 0 ? Math.round(swGrossWin / swGrossLoss * 100) / 100 : 99,
    maxStreak: switcherMaxStreak,
    avgWinR: switcherWins.length > 0 ? Math.round(switcherWins.reduce((s, t) => s + t.pnlR, 0) / switcherWins.length * 10) / 10 : 0,
    trades: switcherTrades.length,
  }

  // How many strategies did switcher beat?
  const switcherReturn = switcherSummary.returnPct
  const beaten = stratResults.filter(s => switcherReturn > s.returnPct).length

  return { stratResults, switcherSummary, switcherEquity, switcherTrades, beaten, seed }
}

// ─── SCENARIOS ────────────────────────────────────────────────────────────────
const SCENARIOS = [
  {
    id: 'outlier',
    title: '🏆 1 Outlier + 9 Losers',
    question: 'If ONE strategy is crushing it and 9 others are mediocre/losing, will the switcher find and lock onto it?',
    profiles: [
      { name: 'A', winRate: 0.50, avgWinR: 3.0, avgLoseR: -1.0 },  // THE OUTLIER
      { name: 'B', winRate: 0.25, avgWinR: 1.5, avgLoseR: -1.0 },  // loser
      { name: 'C', winRate: 0.22, avgWinR: 1.8, avgLoseR: -1.0 },  // loser
      { name: 'D', winRate: 0.28, avgWinR: 1.3, avgLoseR: -1.0 },  // loser
      { name: 'E', winRate: 0.30, avgWinR: 1.2, avgLoseR: -1.0 },  // breakeven
      { name: 'F', winRate: 0.20, avgWinR: 2.0, avgLoseR: -1.0 },  // loser
      { name: 'G', winRate: 0.26, avgWinR: 1.4, avgLoseR: -1.0 },  // loser
      { name: 'H', winRate: 0.24, avgWinR: 1.6, avgLoseR: -1.0 },  // loser
      { name: 'I', winRate: 0.30, avgWinR: 1.1, avgLoseR: -1.0 },  // loser
      { name: 'J', winRate: 0.27, avgWinR: 1.5, avgLoseR: -1.0 },  // loser
    ],
    pass: (result) => {
      // Pass if switcher picked strategy A most often
      const aPicks = result.switcherTrades.filter(t => t.source === 'A').length
      return aPicks >= result.switcherTrades.length * 0.4
    },
    verdict: (result) => {
      const aPicks = result.switcherTrades.filter(t => t.source === 'A').length
      const pct = Math.round(aPicks / result.switcherTrades.length * 100)
      return `Switcher picked outlier A in ${pct}% of trades (${aPicks}/${result.switcherTrades.length})`
    },
  },
  {
    id: 'half-fail',
    title: '💀 5 Winners + 5 Losers',
    question: 'If half your strategies are failing, does the switcher avoid them and stick with winners?',
    profiles: [
      { name: 'A', winRate: 0.42, avgWinR: 2.5, avgLoseR: -1.0 },  // winner
      { name: 'B', winRate: 0.45, avgWinR: 2.0, avgLoseR: -1.0 },  // winner
      { name: 'C', winRate: 0.40, avgWinR: 2.2, avgLoseR: -1.0 },  // winner
      { name: 'D', winRate: 0.50, avgWinR: 1.5, avgLoseR: -1.0 },  // winner
      { name: 'E', winRate: 0.38, avgWinR: 2.8, avgLoseR: -1.0 },  // winner
      { name: 'F', winRate: 0.15, avgWinR: 1.5, avgLoseR: -1.0 },  // LOSER
      { name: 'G', winRate: 0.18, avgWinR: 1.2, avgLoseR: -1.0 },  // LOSER
      { name: 'H', winRate: 0.12, avgWinR: 1.8, avgLoseR: -1.0 },  // LOSER
      { name: 'I', winRate: 0.20, avgWinR: 1.0, avgLoseR: -1.0 },  // LOSER
      { name: 'J', winRate: 0.16, avgWinR: 1.3, avgLoseR: -1.0 },  // LOSER
    ],
    pass: (result) => {
      // Pass if switcher mostly avoided F-J (losers)
      const loserPicks = result.switcherTrades.filter(t => 'FGHIJ'.includes(t.source)).length
      return loserPicks <= result.switcherTrades.length * 0.3
    },
    verdict: (result) => {
      const loserPicks = result.switcherTrades.filter(t => 'FGHIJ'.includes(t.source)).length
      const pct = Math.round(loserPicks / result.switcherTrades.length * 100)
      const winnerPicks = result.switcherTrades.filter(t => 'ABCDE'.includes(t.source)).length
      return `Picked losers (F–J) only ${pct}% of the time. Winners (A–E): ${winnerPicks}/${result.switcherTrades.length} trades.`
    },
  },
  {
    id: 'all-mediocre',
    title: '😐 All 10 Mediocre (No Edge)',
    question: 'If NO strategy has real edge, does the switcher create fake edge from noise? (It shouldn\'t!)',
    profiles: [
      { name: 'A', winRate: 0.32, avgWinR: 1.3, avgLoseR: -1.0 },
      { name: 'B', winRate: 0.30, avgWinR: 1.4, avgLoseR: -1.0 },
      { name: 'C', winRate: 0.33, avgWinR: 1.2, avgLoseR: -1.0 },
      { name: 'D', winRate: 0.31, avgWinR: 1.3, avgLoseR: -1.0 },
      { name: 'E', winRate: 0.29, avgWinR: 1.4, avgLoseR: -1.0 },
      { name: 'F', winRate: 0.32, avgWinR: 1.2, avgLoseR: -1.0 },
      { name: 'G', winRate: 0.30, avgWinR: 1.3, avgLoseR: -1.0 },
      { name: 'H', winRate: 0.31, avgWinR: 1.3, avgLoseR: -1.0 },
      { name: 'I', winRate: 0.33, avgWinR: 1.2, avgLoseR: -1.0 },
      { name: 'J', winRate: 0.30, avgWinR: 1.4, avgLoseR: -1.0 },
    ],
    pass: (result) => {
      // Pass (honest) if switcher also loses — it shouldn't create edge from nothing
      return result.switcherSummary.returnPct <= 5
    },
    verdict: (result) => {
      const ret = result.switcherSummary.returnPct
      return ret > 5
        ? `⚠️ Switcher returned ${ret}% from strategies with no edge — possible overfitting to noise.`
        : `Switcher returned ${ret}% — correctly shows no magic edge when none exists.`
    },
  },
]

function runScenarios(baseSeed) {
  return SCENARIOS.map((scenario, i) => {
    const result = runRandomSim(baseSeed + i * 7919, 25, scenario.profiles)
    return { ...result, scenario, passed: scenario.pass(result), verdictText: scenario.verdict(result) }
  })
}

function RandSimTab() {
  const [results, setResults] = useState(() => runScenarios(42))

  const rerun = () => {
    const baseSeed = Math.floor(Math.random() * 1000000)
    setResults(runScenarios(baseSeed))
  }

  const passCount = results.filter(r => r.passed).length

  return (
    <div>
      {/* EXPLANATION */}
      <div style={{ background: '#0f0f2a', border: '1px solid #6366f1', borderRadius: 8, padding: '1.25rem', marginBottom: '1.25rem' }}>
        <h2 style={{ color: '#e4e4e7', fontSize: 15, marginBottom: '0.5rem' }}>🎲 RAND-1: Stress-Testing Switcher Logic</h2>
        <div style={{ fontSize: 12, color: '#d4d4d8', lineHeight: 2 }}>
          <div><strong style={{ color: '#fbbf24' }}>Apple-to-apple comparison.</strong> We don't compare switcher vs individual strategies.</div>
          <div>Instead we ask: <strong style={{ color: '#4ade80' }}>does it behave correctly</strong> in 3 controlled scenarios?</div>
          <div style={{ marginTop: 6 }}>
            <div>1. <strong>1 outlier + 9 losers</strong> → Does it find the outlier?</div>
            <div>2. <strong>5 winners + 5 losers</strong> → Does it avoid the losers?</div>
            <div>3. <strong>All mediocre</strong> → Does it honestly show no edge? (not fake alpha from noise)</div>
          </div>
          <div style={{ marginTop: 6 }}>Each test: 25 trades only. Same switcher logic (rolling PF, streak penalty).</div>
        </div>
      </div>

      <button onClick={rerun} style={{ background: '#4ade80', color: '#000', border: 'none', borderRadius: 6, padding: '10px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 14, marginBottom: '1.5rem' }}>
        🎲 Re-Run All 3 Scenarios
      </button>

      {/* SCORECARD */}
      <div style={{ background: '#1e1e2e', border: `1px solid ${passCount === 3 ? '#4ade80' : passCount >= 2 ? '#fbbf24' : '#f87171'}`, borderRadius: 8, padding: '1rem', marginBottom: '1.5rem', textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: passCount === 3 ? '#4ade80' : passCount >= 2 ? '#fbbf24' : '#f87171' }}>
          {passCount}/3 Tests Passed
        </div>
        <div style={{ fontSize: 11, color: '#71717a', marginTop: 4 }}>
          {passCount === 3 ? 'Switcher logic is working correctly in all scenarios.' : passCount >= 2 ? 'Mostly working. Re-run to see if the failure is random variance or systematic.' : 'Switcher logic struggling. May need more than 25 trades to work.'}
        </div>
      </div>

      {/* 3 SCENARIO RESULTS */}
      {results.map((result, idx) => (
        <ScenarioResult key={idx} result={result} idx={idx} />
      ))}
    </div>
  )
}

function ScenarioResult({ result, idx }) {
  const { stratResults, switcherSummary, switcherTrades, scenario, passed, verdictText } = result
  const colors = ['#6366f1', '#60a5fa', '#4ade80', '#f87171', '#fbbf24', '#a78bfa', '#f472b6', '#34d399', '#fb923c', '#94a3b8']

  return (
    <div style={{ background: '#1e1e2e', border: `1px solid ${passed ? '#4ade80' : '#f87171'}`, borderRadius: 8, padding: '1rem', marginBottom: '1.25rem' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e4e4e7' }}>{scenario.title}</div>
          <div style={{ fontSize: 11, color: '#71717a' }}>{scenario.question}</div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: passed ? '#4ade80' : '#f87171', padding: '4px 10px', background: passed ? '#0a1f14' : '#1f0a0a', borderRadius: 4 }}>
          {passed ? '✅ PASS' : '❌ FAIL'}
        </div>
      </div>

      {/* VERDICT */}
      <div style={{ fontSize: 11, color: passed ? '#4ade80' : '#f87171', marginBottom: 10, padding: '6px 10px', background: '#0f0f1a', borderRadius: 4 }}>
        {verdictText}
      </div>

      {/* TRADE GRID TABLE */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 10, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #333' }}>
              <th style={{ textAlign: 'left', padding: '3px 6px', color: '#71717a', minWidth: 35 }}>Strat</th>
              <th style={{ textAlign: 'left', padding: '3px 4px', color: '#71717a' }}>25 Trades</th>
              <th style={{ textAlign: 'right', padding: '3px 6px', color: '#71717a', minWidth: 45 }}>Ret%</th>
              <th style={{ textAlign: 'right', padding: '3px 6px', color: '#71717a', minWidth: 25 }}>PF</th>
            </tr>
          </thead>
          <tbody>
            {stratResults.map((s, si) => {
              const pickCount = switcherTrades.filter(t => t.source === s.name).length
              return (
                <tr key={si} style={{ borderBottom: '1px solid #1a1a1a', opacity: pickCount === 0 ? 0.4 : 1 }}>
                  <td style={{ padding: '2px 6px', color: colors[si], fontWeight: 600 }}>
                    {s.name} {pickCount > 0 && <span style={{ color: '#fbbf24', fontSize: 8 }}>({pickCount})</span>}
                  </td>
                  <td style={{ padding: '2px 4px' }}>
                    <div style={{ display: 'flex', gap: 1 }}>
                      {s.trades.map((t, ti) => {
                        const isPicked = switcherTrades[ti]?.source === s.name
                        return (
                          <div key={ti} title={`#${ti+1}: ${t.pnlR > 0 ? '+' : ''}${t.pnlR}R${isPicked ? ' ← PICKED' : ''}`}
                            style={{
                              width: 16, height: 16, borderRadius: 2, fontSize: 7, fontWeight: 600,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: t.pnlR > 0 ? '#0a1f14' : '#1f0a0a',
                              color: t.pnlR > 0 ? '#4ade80' : '#f87171',
                              border: isPicked ? '2px solid #fbbf24' : '1px solid #222',
                            }}>
                            {t.pnlR > 0 ? '+' : ''}{t.pnlR}
                          </div>
                        )
                      })}
                    </div>
                  </td>
                  <td style={{ padding: '2px 6px', textAlign: 'right', color: s.returnPct >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>{s.returnPct}%</td>
                  <td style={{ padding: '2px 6px', textAlign: 'right', color: s.profitFactor >= 1.5 ? '#4ade80' : s.profitFactor >= 1 ? '#fbbf24' : '#f87171' }}>{s.profitFactor}</td>
                </tr>
              )
            })}
            {/* SWITCHER ROW */}
            <tr style={{ borderTop: '2px solid #fbbf24', background: '#0f0f1a' }}>
              <td style={{ padding: '3px 6px', color: '#fbbf24', fontWeight: 700 }}>⭐ SW</td>
              <td style={{ padding: '2px 4px' }}>
                <div style={{ display: 'flex', gap: 1 }}>
                  {switcherTrades.map((t, ti) => (
                    <div key={ti} title={`#${ti+1}: ${t.pnlR > 0 ? '+' : ''}${t.pnlR}R from ${t.source} (score ${t.score})`}
                      style={{
                        width: 16, height: 16, borderRadius: 2, fontSize: 7, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: t.pnlR > 0 ? '#0a2f1a' : '#2f0a0a',
                        color: t.pnlR > 0 ? '#4ade80' : '#f87171',
                        border: '1px solid #fbbf2488',
                      }}>
                      {t.source}
                    </div>
                  ))}
                </div>
              </td>
              <td style={{ padding: '3px 6px', textAlign: 'right', color: switcherSummary.returnPct >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>{switcherSummary.returnPct}%</td>
              <td style={{ padding: '3px 6px', textAlign: 'right', color: '#fbbf24', fontWeight: 700 }}>{switcherSummary.profitFactor}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
