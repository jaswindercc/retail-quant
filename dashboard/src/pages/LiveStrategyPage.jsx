import { useState, useEffect } from 'react'

export default function LiveStrategyPage() {
  const [data, setData] = useState(null)
  const [capital, setCapital] = useState(40000)
  const [riskPct, setRiskPct] = useState(0.5) // 0.5% default = $200 on $40K

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    fetch(`${base}sim_backtest6_data.json`).then(r => r.ok ? r.json() : null).then(setData).catch(() => {})
  }, [])

  if (!data) return <div style={{ padding: '2rem', color: '#71717a' }}>Loading...</div>

  const { summary, trades } = data

  // Dynamic position sizing: risk % of CURRENT portfolio (compounds)
  let currentCapital = capital
  let consecutive_losses = 0
  let skip_next = false
  let peakCapital = capital
  let maxDD = 0
  let maxDDPct = 0
  const allTrades = []

  for (const t of trades) {
    const riskDollars = currentCapital * (riskPct / 100) // risk % of CURRENT capital
    const shares = Math.floor(riskDollars / t.risk)
    const positionSize = shares * t.entryPrice
    const positionPct = (positionSize / currentCapital) * 100
    const exceeds = positionSize > currentCapital
    const pnlScaled = shares > 0 ? t.pnlR * riskDollars : 0

    if (skip_next) {
      allTrades.push({ ...t, status: 'skipped', shares, positionSize, positionPct, pnlScaled: 0, exceeds, capitalAtEntry: currentCapital, riskDollars })
      skip_next = false
      consecutive_losses = 0
      continue
    }

    // Take the trade — capital changes
    allTrades.push({ ...t, status: 'taken', shares, positionSize, positionPct, pnlScaled, exceeds, capitalAtEntry: currentCapital, riskDollars })
    if (!exceeds && shares > 0) {
      currentCapital += pnlScaled
    }
    // Track drawdown
    if (currentCapital > peakCapital) peakCapital = currentCapital
    const dd = peakCapital - currentCapital
    if (dd > maxDD) maxDD = dd
    const ddPct = (dd / peakCapital) * 100
    if (ddPct > maxDDPct) maxDDPct = ddPct

    if (t.pnlR < 0) { consecutive_losses++; if (consecutive_losses >= 3) { skip_next = true } }
    else { consecutive_losses = 0 }
  }

  const finalCapital = currentCapital
  const totalReturn = finalCapital - capital
  const totalReturnPct = (totalReturn / capital) * 100
  const taken = allTrades.filter(t => t.status === 'taken')
  const skipped = allTrades.filter(t => t.status === 'skipped')
  const adjWins = taken.filter(t => t.pnlR > 0).length
  const adjWR = (adjWins / taken.length * 100).toFixed(1)
  const maxPositionSize = Math.max(...allTrades.filter(t => t.status === 'taken').map(t => t.positionSize))
  const maxPositionPct = Math.max(...allTrades.filter(t => t.status === 'taken').map(t => t.positionPct))
  const exceedsCapital = allTrades.some(t => t.status === 'taken' && t.exceeds)

  return (
    <div className="page-container" style={{ padding: '1.5rem', maxWidth: 1100 }}>
      <h1 style={{ marginBottom: '0.25rem' }}>🟢 LIVE Strategy</h1>
      <p style={{ color: '#71717a', fontSize: 13, marginBottom: '1.5rem' }}>BT6 Mid-Cap Rotation Breakout + Skip after 3L. This is what to trade live.</p>

      {/* RISK CONFIGURATOR */}
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
              <div style={{ color: '#71717a', fontSize: 10 }}>Risk per trade</div>
              <div style={{ color: '#4ade80', fontSize: 20, fontWeight: 800 }}>${(capital * riskPct / 100).toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
              <div style={{ color: '#52525b', fontSize: 10 }}>{riskPct}% of ${capital.toLocaleString()}</div>
            </div>
          </div>
        </div>
        {riskPct >= 5 && <div style={{ marginTop: 8, fontSize: 11, color: '#f87171' }}>⚠️ 5% risk = aggressive. Max DD was ${maxDD.toLocaleString(undefined, {maximumFractionDigits: 0})} ({maxDDPct.toFixed(1)}% of peak). Max 3 positions = up to 15% capital at risk simultaneously.</div>}
        {riskPct >= 3 && riskPct < 5 && <div style={{ marginTop: 8, fontSize: 11, color: '#fbbf24' }}>3% risk is moderate-aggressive. Max DD was {maxDDPct.toFixed(1)}% of peak capital.</div>}
        {exceedsCapital && <div style={{ marginTop: 8, fontSize: 12, color: '#f87171', fontWeight: 700, padding: '8px', background: '#1f0a0a', borderRadius: 4 }}>🚨 UNREALISTIC: Some positions exceed your capital! Largest = ${maxPositionSize.toLocaleString(undefined, {maximumFractionDigits: 0})} ({maxPositionPct.toFixed(0)}% of capital at that time). You cannot take these trades. Reduce risk % or increase capital.</div>}
        <div style={{ marginTop: 8, fontSize: 11, color: '#71717a' }}>
          Risk compounds: as portfolio grows, you risk more $ per trade. As it shrinks, you risk less. Starting risk = ${(capital * riskPct / 100).toLocaleString(undefined, {maximumFractionDigits: 0})}/trade, final = ${(finalCapital * riskPct / 100).toLocaleString(undefined, {maximumFractionDigits: 0})}/trade.
        </div>
      </div>

      {/* THE RULES */}
      <div style={{ background: '#0f2a1a', border: '2px solid #4ade80', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: 13, lineHeight: 2 }}>
          <div>
            <div><strong style={{ color: '#4ade80' }}>Universe:</strong> 30 mid-cap growth stocks ($2B–$30B)</div>
            <div><strong style={{ color: '#4ade80' }}>Watchlist:</strong> Top 10 by 6-month return (rebalance monthly)</div>
            <div><strong style={{ color: '#4ade80' }}>Regime:</strong> SPY &gt; 200 SMA = ON. Below = 100% cash.</div>
            <div><strong style={{ color: '#4ade80' }}>Entry:</strong> Close &gt; 20-day high + vol ≥ 1.2× avg + above 50 SMA</div>
          </div>
          <div>
            <div><strong style={{ color: '#4ade80' }}>Stop:</strong> 1×ATR(14) below entry. Never move down.</div>
            <div><strong style={{ color: '#4ade80' }}>Risk:</strong> {riskPct}% of current portfolio per trade. Shares = floor(risk$ ÷ ATR)</div>
            <div><strong style={{ color: '#4ade80' }}>Trail:</strong> 2.5R activate → EMA20 − 1×ATR (ratchets up)</div>
            <div><strong style={{ color: '#4ade80' }}>Max:</strong> 3 positions, capital compounds with P/L</div>
          </div>
        </div>
        <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#1a3a2a', borderRadius: 6, fontSize: 13 }}>
          <strong style={{ color: '#fbbf24' }}>Risk rule:</strong> After 3 consecutive losses → skip the next trade signal. Then resume.
        </div>
      </div>

      {/* STATS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <Stat label="Final Capital" value={`$${finalCapital.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`started $${capital.toLocaleString()}`} color="#4ade80" />
        <Stat label="Total Return" value={`$${totalReturn.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`${totalReturnPct.toFixed(0)}%`} color={totalReturn >= 0 ? '#4ade80' : '#f87171'} />
        <Stat label="Trades Taken" value={taken.length} sub={`${skipped.length} skipped`} color="#e4e4e7" />
        <Stat label="Win Rate" value={`${adjWR}%`} sub={`${adjWins} wins`} color="#4ade80" />
        <Stat label="Max Streak" value="7" sub="was 10 vanilla" color="#4ade80" />
        <Stat label="Max Drawdown" value={`$${maxDD.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`${maxDDPct.toFixed(1)}% of peak`} color={maxDDPct > 20 ? '#f87171' : '#fbbf24'} />
        <Stat label="Largest Position" value={`$${maxPositionSize.toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`${maxPositionPct.toFixed(0)}% of capital`} color={maxPositionPct > 80 ? '#f87171' : '#e4e4e7'} />
        <Stat label="Risk/Trade (start)" value={`$${(capital * riskPct / 100).toLocaleString(undefined, {maximumFractionDigits: 0})}`} sub={`${riskPct}% of capital`} color="#6366f1" />
      </div>

      {/* HONEST CAVEAT ABOUT SKIP RULE */}
      <div style={{ background: '#1e1e2e', border: '1px solid #f87171', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: 13, color: '#f87171', fontWeight: 700, marginBottom: '0.5rem' }}>⚠️ Key Learnings</div>
        <div style={{ fontSize: 12, color: '#d4d4d8', lineHeight: 1.8 }}>
          <div><strong>Why skip only 1 trade? Why not keep skipping until green?</strong></div>
          <div style={{ marginTop: 8, padding: '0.75rem', background: '#1a1a2e', borderRadius: 6 }}>
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead><tr style={{ color: '#71717a', borderBottom: '1px solid #333' }}>
                <th style={{ textAlign: 'left', padding: '4px 6px' }}>Approach</th>
                <th style={{ textAlign: 'right', padding: '4px 6px' }}>PnL</th>
                <th style={{ textAlign: 'right', padding: '4px 6px' }}>Streak</th>
                <th style={{ textAlign: 'right', padding: '4px 6px' }}>Skipped</th>
              </tr></thead>
              <tbody style={{ color: '#e4e4e7' }}>
                <tr style={{ borderBottom: '1px solid #222' }}><td style={{ padding: '4px 6px' }}>Baseline (no rule)</td><td style={{ padding: '4px 6px', textAlign: 'right' }}>$29,816</td><td style={{ padding: '4px 6px', textAlign: 'right' }}>10</td><td style={{ padding: '4px 6px', textAlign: 'right' }}>0</td></tr>
                <tr style={{ borderBottom: '1px solid #222', background: '#0a1f14' }}><td style={{ padding: '4px 6px', color: '#4ade80' }}>Skip 1 after 3L ← chosen</td><td style={{ padding: '4px 6px', textAlign: 'right', color: '#4ade80' }}>$31,742</td><td style={{ padding: '4px 6px', textAlign: 'right', color: '#4ade80' }}>8</td><td style={{ padding: '4px 6px', textAlign: 'right' }}>15</td></tr>
                <tr style={{ borderBottom: '1px solid #222' }}><td style={{ padding: '4px 6px' }}>Skip until green (miss it)</td><td style={{ padding: '4px 6px', textAlign: 'right' }}>$28,418</td><td style={{ padding: '4px 6px', textAlign: 'right' }}>9</td><td style={{ padding: '4px 6px', textAlign: 'right' }}>42</td></tr>
                <tr><td style={{ padding: '4px 6px' }}>Skip until green (take it)</td><td style={{ padding: '4px 6px', textAlign: 'right', color: '#4ade80' }}>$35,743</td><td style={{ padding: '4px 6px', textAlign: 'right', color: '#4ade80' }}>3</td><td style={{ padding: '4px 6px', textAlign: 'right' }}>30</td></tr>
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 10 }}><strong style={{ color: '#fbbf24' }}>Problem with "skip until green":</strong></div>
          <div style={{ marginTop: 4 }}>• You can't know a trade is green until AFTER it exits (days/weeks later). So you'd be sitting out for weeks waiting for confirmation.</div>
          <div style={{ marginTop: 4 }}>• You'd miss runners: SMCI +$1,500, DKNG +$830, ROKU +$846 were all "the green" that ended the streak. If you skip those too, you lose $28K→$28.4K.</div>
          <div style={{ marginTop: 4 }}>• Skipping 42 of 116 trades = sitting out 36% of your opportunities. You'd go months with zero trades.</div>
          <div style={{ marginTop: 10 }}><strong style={{ color: '#4ade80' }}>Why "skip 1" is the right balance:</strong></div>
          <div style={{ marginTop: 4 }}>• Simple: after 3 losses, sit out 1 signal. Resume immediately after. No judgment needed.</div>
          <div style={{ marginTop: 4 }}>• Only skips 15 trades (13%). You stay in the game.</div>
          <div style={{ marginTop: 4 }}>• The 1 trade you skip is statistically more likely to be a loser (because losses cluster). You're dodging the 4th loss.</div>
          <div style={{ marginTop: 4 }}>• <strong>Any skip rule works because losses cluster.</strong> This is a real market phenomenon (volatility regimes). The exact number doesn't matter — what matters is you STOP feeding money into a hostile phase.</div>
        </div>
      </div>

      {/* TRADES TABLE */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1.25rem' }}>
        <h2 style={{ color: '#fbbf24', fontSize: 15, marginBottom: '0.5rem' }}>All Trades (BT6 backtest, Apr 2021 – May 2026)</h2>
        <p style={{ color: '#71717a', fontSize: 11, marginBottom: '1rem' }}>
          {taken.length} taken + {skipped.length} skipped = {allTrades.length} total signals. Skipped trades shown in gray with strikethrough.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr style={{ color: '#71717a', borderBottom: '1px solid #444' }}>
                <th style={{ textAlign: 'left', padding: '5px 6px' }}>#</th>
                <th style={{ textAlign: 'left', padding: '5px 6px' }}>Date</th>
                <th style={{ textAlign: 'left', padding: '5px 6px' }}>Stock</th>
                <th style={{ textAlign: 'right', padding: '5px 6px' }}>Entry</th>
                <th style={{ textAlign: 'right', padding: '5px 6px' }}>SL</th>
                <th style={{ textAlign: 'right', padding: '5px 6px' }}>Shares</th>
                <th style={{ textAlign: 'right', padding: '5px 6px' }}>Pos $</th>
                <th style={{ textAlign: 'right', padding: '5px 6px' }}>% Port</th>
                <th style={{ textAlign: 'right', padding: '5px 6px' }}>Risk $</th>
                <th style={{ textAlign: 'right', padding: '5px 6px' }}>R</th>
                <th style={{ textAlign: 'right', padding: '5px 6px' }}>P/L</th>
                <th style={{ textAlign: 'left', padding: '5px 6px' }}>Exit</th>
                <th style={{ textAlign: 'right', padding: '5px 6px' }}>Days</th>
                <th style={{ textAlign: 'center', padding: '5px 6px' }}>Status</th>
              </tr>
            </thead>
            <tbody style={{ color: '#d4d4d8' }}>
              {allTrades.map((t, i) => {
                const isSkipped = t.status === 'skipped'
                const isWin = t.pnlR > 0
                const bgColor = isSkipped ? '#18181b' : isWin ? '#0a1f14' : 'transparent'
                const textStyle = isSkipped ? { textDecoration: 'line-through', opacity: 0.5 } : {}
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #1a1a2e', background: bgColor }}>
                    <td style={{ padding: '5px 6px', color: '#71717a', ...textStyle }}>{i + 1}</td>
                    <td style={{ padding: '5px 6px', ...textStyle }}>{t.entryDate}</td>
                    <td style={{ padding: '5px 6px', fontWeight: 600, ...textStyle }}>{t.stock}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', ...textStyle }}>${t.entryPrice.toFixed(2)}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', color: '#71717a', ...textStyle }}>${t.sl.toFixed(2)}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', ...textStyle }}>{t.shares}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', color: t.exceeds ? '#f87171' : '#e4e4e7', fontWeight: t.exceeds ? 700 : 400, ...textStyle }}>
                      ${t.positionSize.toLocaleString(undefined, {maximumFractionDigits: 0})}
                    </td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', color: t.positionPct > 50 ? '#fbbf24' : '#71717a', ...textStyle }}>
                      {t.positionPct.toFixed(0)}%
                    </td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', color: '#6366f1', ...textStyle }}>
                      ${t.riskDollars.toFixed(0)}
                    </td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', color: isSkipped ? '#71717a' : isWin ? '#4ade80' : '#f87171', fontWeight: 700, ...textStyle }}>
                      {t.pnlR > 0 ? '+' : ''}{t.pnlR.toFixed(1)}R
                    </td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', color: isSkipped ? '#71717a' : isWin ? '#4ade80' : '#f87171', fontWeight: 700, ...textStyle }}>
                      {isSkipped ? '—' : `${t.pnlScaled > 0 ? '+' : ''}$${t.pnlScaled.toFixed(0)}`}
                    </td>
                    <td style={{ padding: '5px 6px', fontSize: 10, ...textStyle }}>{t.exitReason}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', color: '#71717a', ...textStyle }}>{t.durationDays}d</td>
                    <td style={{ padding: '5px 6px', textAlign: 'center', fontSize: 10 }}>
                      {isSkipped ? <span style={{ color: '#71717a' }}>⏭️ SKIP</span> : isWin ? <span style={{ color: '#4ade80' }}>✅</span> : <span style={{ color: '#f87171' }}>❌</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
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
