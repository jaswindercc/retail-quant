import { useState, useEffect } from 'react'

export default function SimBacktest5Page() {
  const [data, setData] = useState(null)
  const [showTrades, setShowTrades] = useState(true)
  const [capital, setCapital] = useState(40000)
  const [riskPct, setRiskPct] = useState(0.5)

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    fetch(`${base}sim_backtest5_data.json`).then(r => r.ok ? r.json() : null).then(setData).catch(() => {})
  }, [])

  const trades = data?.trades || []
  const params = data?.params || {}

  // Compounding + Skip after 3 consecutive losses
  function runStrategy(trades, startCapital, riskPctVal) {
    let currentCapital = startCapital, peakCapital = startCapital, maxDD = 0, maxDDPct = 0
    let consecutiveLosses = 0, skipNext = false
    const results = []
    const equityCurve = [{ capital: startCapital, date: trades[0]?.entryDate }]

    for (const t of trades) {
      const riskDollars = currentCapital * (riskPctVal / 100)
      const shares = Math.floor(riskDollars / t.risk)
      const positionSize = shares * t.entryPrice
      const positionPct = (positionSize / currentCapital) * 100
      const pnlScaled = shares > 0 ? t.pnlR * riskDollars : 0

      if (skipNext) {
        results.push({ ...t, status: 'skipped', shares, positionSize, positionPct, pnlScaled: 0, capitalAtEntry: currentCapital, riskDollars })
        skipNext = false
        consecutiveLosses = 0
        equityCurve.push({ capital: currentCapital, date: t.exitDate })
        continue
      }

      results.push({ ...t, status: 'taken', shares, positionSize, positionPct, pnlScaled, capitalAtEntry: currentCapital, riskDollars })
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

  const strat = trades.length > 0 ? runStrategy(trades, capital, riskPct) : null
  const ec = strat?.equityCurve || []
  const capitals = ec.map(e => e.capital)
  const maxCap = Math.max(...capitals, capital + 1)
  const minCap = Math.min(...capitals, capital)

  if (!data) return <div style={{ padding: '2rem', color: '#71717a' }}>Loading...</div>

  return (
    <div className="page-container" style={{ padding: '1.5rem', maxWidth: 1100 }}>
      <h1 style={{ marginBottom: '0.25rem' }}>🟢 LIVE — BT5 Mega-Cap Rotation</h1>
      <p style={{ color: '#6366f1', fontSize: 12, marginBottom: '0.25rem' }}>Based on: <strong>Breakout v1</strong> (momentum rotation + breakout entry + trailing exit)</p>
      <p style={{ color: '#71717a', fontSize: 13, marginBottom: '1.5rem' }}>
        30 mega-cap tech stocks · Top 10 by 6mo momentum (monthly rebalance) · Breakout + trail · Skip after 3L · {params.period}
      </p>

      {strat && <>
        {/* RISK CONFIGURATOR */}
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
                <div style={{ color: '#71717a', fontSize: 10 }}>Risk/trade</div>
                <div style={{ color: '#4ade80', fontSize: 20, fontWeight: 800 }}>${(capital * riskPct / 100).toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
              </div>
            </div>
          </div>
        </div>

        {/* SUMMARY STATS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <Stat label="Final Capital" value={`$${strat.finalCapital.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`+${(strat.totalPnl / capital * 100).toFixed(0)}%`} color="#4ade80" />
          <Stat label="Total P/L" value={`$${strat.totalPnl.toLocaleString(undefined, {maximumFractionDigits: 0})}`} color={strat.totalPnl >= 0 ? '#4ade80' : '#f87171'} />
          <Stat label="Profit Factor" value={strat.pf.toFixed(2)} color={strat.pf >= 1.5 ? '#4ade80' : '#fbbf24'} />
          <Stat label="Win Rate" value={`${strat.wr.toFixed(1)}%`} sub={`${strat.wins}/${strat.taken.length}`} color="#60a5fa" />
          <Stat label="Max DD" value={`$${strat.maxDD.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`${strat.maxDDPct.toFixed(1)}%`} color="#f87171" />
          <Stat label="Return/DD" value={(strat.totalPnl / strat.maxDD).toFixed(2)} color="#60a5fa" />
          <Stat label="Max Streak" value={strat.maxStreak} sub="losses" color={strat.maxStreak > 10 ? '#f87171' : '#fbbf24'} />
          <Stat label="Skipped" value={strat.skipped.length} sub="trades" color="#71717a" />
        </div>

        {/* EQUITY CURVE */}
        {ec.length > 1 && (
          <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: 11, color: '#71717a', marginBottom: 6 }}>Equity Curve (compounding + skip after 3L)</div>
            <svg width="100%" height="120" viewBox={`0 0 ${ec.length} 120`} preserveAspectRatio="none" style={{ display: 'block' }}>
              <line x1="0" y1={((capital - minCap) / (maxCap - minCap)) * -120 + 120} x2={ec.length} y2={((capital - minCap) / (maxCap - minCap)) * -120 + 120} stroke="#333" strokeWidth="0.5" />
              <polyline fill="none" stroke="#4ade80" strokeWidth="1.5"
                points={ec.map((e, i) => `${i},${((e.capital - minCap) / (maxCap - minCap)) * -120 + 120}`).join(' ')} />
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#71717a', marginTop: 4 }}>
              <span>{ec[0]?.date}</span><span>{ec[ec.length - 1]?.date}</span>
            </div>
          </div>
        )}

        {/* RULES OF THE GAME */}
        <div style={{ background: '#0f2a1a', border: '1px solid #4ade80', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#4ade80', fontSize: 14, marginBottom: '0.75rem' }}>📋 Rules of the Game</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: 12, lineHeight: 1.9, color: '#d4d4d8' }}>
            <div>
              <div><strong style={{ color: '#4ade80' }}>Universe:</strong> 30 mega/large-cap tech (all liquid by Jan 2020)</div>
              <div><strong style={{ color: '#4ade80' }}>Watchlist:</strong> Top 10 by 6mo return (monthly rebalance on 1st)</div>
              <div><strong style={{ color: '#4ade80' }}>Regime:</strong> SPY &gt; 200 SMA = ON. Below = 100% cash, no trades.</div>
              <div><strong style={{ color: '#4ade80' }}>Entry:</strong> Close &gt; 20d high + volume ≥ 1.2× avg + price &gt; 50 SMA</div>
              <div><strong style={{ color: '#4ade80' }}>Max positions:</strong> 3 at a time</div>
            </div>
            <div>
              <div><strong style={{ color: '#4ade80' }}>Stop:</strong> 1×ATR(14) below entry. Never move stop down.</div>
              <div><strong style={{ color: '#4ade80' }}>Risk:</strong> {riskPct}% of current capital per trade (compounding)</div>
              <div><strong style={{ color: '#4ade80' }}>Shares:</strong> floor(risk$ ÷ ATR)</div>
              <div><strong style={{ color: '#4ade80' }}>Trail:</strong> Activate at 2.5R → EMA20 − 1×ATR (ratchets up only)</div>
              <div><strong style={{ color: '#4ade80' }}>Skip rule:</strong> After 3 consecutive losses → skip 1 signal, then resume</div>
            </div>
          </div>
        </div>

        {/* DAILY ROUTINE */}
        <div style={{ background: '#1e1e2e', border: '1px solid #6366f1', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#6366f1', fontSize: 14, marginBottom: '0.75rem' }}>📅 Daily Routine</h2>
          <div style={{ fontSize: 12, color: '#d4d4d8', lineHeight: 2 }}>
            <div>1. <strong>Pre-market (9:00 AM):</strong> Check SPY vs 200 SMA. If below → do nothing all day.</div>
            <div>2. <strong>Scan watchlist (9:30 AM):</strong> Any of top-10 breaking 20d high with volume?</div>
            <div>3. <strong>Check open positions:</strong> Any hit stop? Any hit 2.5R trail activation?</div>
            <div>4. <strong>Update trailing stops:</strong> For positions at 2.5R+, recalc EMA20 − ATR. Only ratchet UP.</div>
            <div>5. <strong>Execute entries:</strong> If signal fires and under 3 positions, enter at close. Set stop order.</div>
            <div>6. <strong>After close:</strong> Log trade in journal. Update consecutive loss counter.</div>
          </div>
        </div>

        {/* MONTHLY ROUTINE */}
        <div style={{ background: '#1e1e2e', border: '1px solid #f59e0b', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#f59e0b', fontSize: 14, marginBottom: '0.75rem' }}>📆 Monthly Routine (1st of each month)</h2>
          <div style={{ fontSize: 12, color: '#d4d4d8', lineHeight: 2 }}>
            <div>1. <strong>Rebalance watchlist:</strong> Rank all 30 stocks by 6-month return. New top 10 = your watchlist.</div>
            <div>2. <strong>Do NOT close open positions</strong> just because a stock left the top 10. Ride the trail.</div>
            <div>3. <strong>Review regime:</strong> If SPY crossed below 200 SMA mid-month, close all at next open. Go cash.</div>
            <div>4. <strong>Update capital:</strong> Your current capital is your new base for risk calculations.</div>
          </div>
        </div>

        {/* WHAT NOT TO DO */}
        <div style={{ background: '#1f0a0a', border: '1px solid #f87171', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#f87171', fontSize: 14, marginBottom: '0.75rem' }}>🚫 What NOT To Do</h2>
          <div style={{ fontSize: 12, color: '#d4d4d8', lineHeight: 2 }}>
            <div>• Do NOT trade when SPY is below 200 SMA. No exceptions.</div>
            <div>• Do NOT move your stop loss down. Ever.</div>
            <div>• Do NOT take more than 3 positions simultaneously.</div>
            <div>• Do NOT override the skip rule. If 3L says skip, you skip.</div>
            <div>• Do NOT average down or add to losers.</div>
            <div>• Do NOT increase risk % after a big win (stay mechanical).</div>
            <div>• Do NOT trade stocks outside the top-10 watchlist.</div>
            <div>• Do NOT chase entries if you missed the breakout day.</div>
          </div>
        </div>

        {/* TRADES TABLE */}
        <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ color: '#71717a', fontSize: 12 }}>{strat.taken.length} taken + {strat.skipped.length} skipped = {strat.results.length} signals</span>
            <button onClick={() => setShowTrades(!showTrades)}
              style={{ background: '#333', color: '#e4e4e7', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 11 }}>
              {showTrades ? 'Hide' : 'Show Trades'}
            </button>
          </div>
          {showTrades && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', minWidth: 800 }}>
                <thead>
                  <tr style={{ color: '#71717a', borderBottom: '1px solid #333', position: 'sticky', top: 0, background: '#1e1e2e' }}>
                    <th style={{ textAlign: 'left', padding: '4px 5px' }}>#</th>
                    <th style={{ textAlign: 'left', padding: '4px 5px' }}>Date</th>
                    <th style={{ textAlign: 'left', padding: '4px 5px' }}>Stock</th>
                    <th style={{ textAlign: 'right', padding: '4px 5px' }}>Entry</th>
                    <th style={{ textAlign: 'right', padding: '4px 5px' }}>SL</th>
                    <th style={{ textAlign: 'right', padding: '4px 5px' }}>Shares</th>
                    <th style={{ textAlign: 'right', padding: '4px 5px' }}>Capital</th>
                    <th style={{ textAlign: 'right', padding: '4px 5px' }}>Risk$</th>
                    <th style={{ textAlign: 'right', padding: '4px 5px' }}>R</th>
                    <th style={{ textAlign: 'right', padding: '4px 5px' }}>P/L</th>
                    <th style={{ textAlign: 'left', padding: '4px 5px' }}>Exit</th>
                    <th style={{ textAlign: 'right', padding: '4px 5px' }}>Days</th>
                    <th style={{ textAlign: 'center', padding: '4px 5px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {strat.results.map((t, i) => {
                    const skipped = t.status === 'skipped'
                    const win = t.pnlScaled > 0
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #1a1a2e', background: skipped ? '#18181b' : win ? '#0a1f14' : 'transparent', opacity: skipped ? 0.5 : 1, textDecoration: skipped ? 'line-through' : 'none' }}>
                        <td style={{ padding: '4px 5px', color: '#71717a' }}>{i + 1}</td>
                        <td style={{ padding: '4px 5px', color: '#a1a1aa' }}>{t.entryDate}</td>
                        <td style={{ padding: '4px 5px', color: '#60a5fa', fontWeight: 600 }}>{t.stock}</td>
                        <td style={{ padding: '4px 5px', textAlign: 'right' }}>${t.entryPrice.toFixed(2)}</td>
                        <td style={{ padding: '4px 5px', textAlign: 'right', color: '#71717a' }}>${t.sl.toFixed(2)}</td>
                        <td style={{ padding: '4px 5px', textAlign: 'right' }}>{t.shares}</td>
                        <td style={{ padding: '4px 5px', textAlign: 'right', color: '#71717a' }}>${t.capitalAtEntry.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                        <td style={{ padding: '4px 5px', textAlign: 'right', color: '#6366f1' }}>${t.riskDollars.toFixed(0)}</td>
                        <td style={{ padding: '4px 5px', textAlign: 'right', color: skipped ? '#71717a' : win ? '#4ade80' : '#f87171', fontWeight: 700 }}>{t.pnlR > 0 ? '+' : ''}{t.pnlR.toFixed(1)}R</td>
                        <td style={{ padding: '4px 5px', textAlign: 'right', color: skipped ? '#71717a' : win ? '#4ade80' : '#f87171', fontWeight: 700 }}>{skipped ? '—' : `${t.pnlScaled > 0 ? '+' : ''}$${t.pnlScaled.toFixed(0)}`}</td>
                        <td style={{ padding: '4px 5px', color: '#71717a', fontSize: 10 }}>{t.exitReason}</td>
                        <td style={{ padding: '4px 5px', textAlign: 'right', color: '#71717a' }}>{t.durationDays}d</td>
                        <td style={{ padding: '4px 5px', textAlign: 'center', fontSize: 10 }}>{skipped ? '⏭️ SKIP' : win ? '✅' : '❌'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* LEARNINGS */}
        <div style={{ background: '#1e1e2e', border: '1px solid #71717a', borderRadius: 8, padding: '1.25rem' }}>
          <h2 style={{ color: '#a1a1aa', fontSize: 14, marginBottom: '0.75rem' }}>📝 Learnings</h2>
          <div style={{ fontSize: 12, color: '#a1a1aa', lineHeight: 2 }}>
            <div><strong style={{ color: '#d4d4d8' }}>Why skip only 1 trade (not keep skipping until green)?</strong></div>
            <div style={{ marginLeft: 12 }}>• You can't know a trade is green until AFTER it exits (days/weeks later).</div>
            <div style={{ marginLeft: 12 }}>• Skipping until green means sitting out 36% of signals → miss runners like SMCI +$1,500.</div>
            <div style={{ marginLeft: 12 }}>• Skip-1 after 3L only skips 13% of trades. You stay in the game.</div>
            <div style={{ marginLeft: 12 }}>• The 4th trade after 3 losses is statistically more likely to be a loser (losses cluster in volatility regimes).</div>
            <div style={{ marginTop: 12 }}><strong style={{ color: '#d4d4d8' }}>Why compounding (% of current capital) not fixed $200?</strong></div>
            <div style={{ marginLeft: 12 }}>• Fixed risk = capped upside. Your 50th win makes the same $ as your 1st.</div>
            <div style={{ marginLeft: 12 }}>• Compounding = winners get bigger as account grows, losers get smaller as it shrinks.</div>
            <div style={{ marginLeft: 12 }}>• Natural position sizing: you automatically take less risk when drawdown hits.</div>
            <div style={{ marginTop: 12 }}><strong style={{ color: '#d4d4d8' }}>Honest backtest notes:</strong></div>
            <div style={{ marginLeft: 12 }}>• Pool includes ZM, DOCU (crashed 80%+ from 2021 peaks) — strategy took the losses.</div>
            <div style={{ marginLeft: 12 }}>• Removed SNOW, ABNB, COIN, PLTR (late IPOs that didn't exist Jan 2020).</div>
            <div style={{ marginLeft: 12 }}>• Rotation picked ZM in Feb-Mar 2021 (top momentum) — strategy held and lost when it crashed.</div>
            <div style={{ marginLeft: 12 }}>• Win rate is only ~27% but profit factor {'>'} 2.0 because winners are 5-6R avg.</div>
            <div style={{ marginTop: 12 }}><strong style={{ color: '#d4d4d8' }}>Why this works despite low win rate:</strong></div>
            <div style={{ marginLeft: 12 }}>• Avg winner = 5.6R, avg loser = -1R. You need to win 1 in 5 to break even.</div>
            <div style={{ marginLeft: 12 }}>• Trailing stop lets winners run 10-20R when momentum continues.</div>
            <div style={{ marginLeft: 12 }}>• Regime filter (SPY {'>'} 200 SMA) keeps you out of bear markets entirely.</div>
            <div style={{ marginLeft: 12 }}>• Long losing streaks (10-16) are normal and expected. The skip rule reduces max streak.</div>
          </div>
        </div>
      </>}
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
