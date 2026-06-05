import { useState, useEffect } from 'react'
import { fetchJson } from '../utils'

export default function BreakoutV2Page() {
  const [data, setData] = useState(null)
  const [capital, setCapital] = useState(40000)
  const [riskPct, setRiskPct] = useState(1)

  useEffect(() => {
    fetchJson(`${import.meta.env.BASE_URL}breakout_v2_data.json`)
      .then(setData).catch(console.error)
  }, [])

  if (!data) return <div className="loading">Loading Breakout v2…</div>

  const allTrades = data.allTrades || []
  const settings = data.settings || {}
  const buyHold = data.buyHold || {}

  // ── Compounding + Skip after 3L ──
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

  const strat = allTrades.length > 0 ? runStrategy(allTrades, capital, riskPct) : null

  // Open positions
  const openPositions = allTrades.filter(t => t.exitReason === 'Open')

  // Per-stock breakdown
  const stockMap = {}
  if (strat) {
    for (const t of strat.taken) {
      if (!stockMap[t.stock]) stockMap[t.stock] = { wins: 0, losses: 0, pnl: 0 }
      if (t.pnlScaled > 0) stockMap[t.stock].wins++
      else stockMap[t.stock].losses++
      stockMap[t.stock].pnl += t.pnlScaled
    }
  }
  const stockRows = Object.entries(stockMap).map(([s, v]) => {
    const bh = buyHold[s] || {}
    const stratRetPct = capital > 0 ? (v.pnl / capital) * 100 : 0
    return {
      symbol: s, trades: v.wins + v.losses, wins: v.wins,
      wr: ((v.wins / (v.wins + v.losses)) * 100).toFixed(0),
      pnl: v.pnl, stratRetPct: stratRetPct.toFixed(1),
      bhRetPct: bh.returnPct || 0,
    }
  }).sort((a, b) => b.pnl - a.pnl)

  const riskDollars = capital * riskPct / 100

  return (
    <div className="page-container" style={{ padding: '2rem', maxWidth: 1200 }}>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 1: EXACTLY WHAT TO DO (TOP)
      ═══════════════════════════════════════════════════════════════ */}
      <h1 style={{ marginBottom: '0.75rem', fontSize: '1.8rem' }}>🚀 Breakout v2 — Your Playbook</h1>

      <div style={{ background: '#0f2a1a', border: '2px solid #4ade80', borderRadius: 12, padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#4ade80', fontSize: 20, marginBottom: '1rem' }}>📋 The Strategy in Plain English</h2>

        <div style={{ fontSize: 15, lineHeight: 2.4, color: '#e4e4e7', marginBottom: '1.5rem' }}>
          <div><strong style={{ color: '#4ade80' }}>What you're doing:</strong> Buying stocks that break to new 20-day highs with momentum behind them.</div>
          <div style={{ marginTop: '0.5rem', paddingLeft: '1rem', borderLeft: '3px solid #4ade80', color: '#d4d4d8', fontSize: 14, lineHeight: 2 }}>
            <div><strong>20-day high</strong> = the highest price in the last 20 trading days. When price closes above it, that's a "breakout".</div>
            <div><strong>SMA50</strong> = average closing price over 50 days. Price must be above this (confirms uptrend).</div>
            <div><strong>SPY 200 SMA</strong> = S&P 500 average over 200 days. If SPY is below it, the market is bearish → you sit in cash.</div>
            <div><strong>ATR</strong> = Average True Range (14 days). Measures how much a stock moves daily. Used to set your stop.</div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #2a5e3a', paddingTop: '1.25rem', marginBottom: '1.25rem' }}>
          <h3 style={{ color: '#fbbf24', fontSize: 16, marginBottom: '0.75rem' }}>📅 Your Daily Checklist</h3>
          <div style={{ fontSize: 15, lineHeight: 2.4, color: '#e4e4e7' }}>
            <div><strong>1.</strong> Is SPY above its 200-day average? → <strong>No?</strong> Do nothing today. Close this app.</div>
            <div><strong>2.</strong> Check: Did any stock close above its 20-day high yesterday?</div>
            <div style={{ paddingLeft: '2rem', fontSize: 14, color: '#a1a1aa' }}>AND volume was above its 20-day average</div>
            <div style={{ paddingLeft: '2rem', fontSize: 14, color: '#a1a1aa' }}>AND it closed in the upper 70% of the day's range (strong close, not a wick)</div>
            <div><strong>3.</strong> Next morning: Does it open at or above yesterday's breakout level?</div>
            <div style={{ paddingLeft: '2rem', fontSize: 14, color: '#a1a1aa' }}>Yes → <strong>BUY</strong>. No → skip, no chase.</div>
            <div><strong>4.</strong> Set your stop: <strong>Entry price minus 1x ATR</strong></div>
            <div><strong>5. </strong> Calculate shares: <span style={{ color: '#4ade80', fontWeight: 700 }}>${riskDollars.toLocaleString(undefined, {maximumFractionDigits: 0})} ÷ ATR = number of shares</span></div>
            <div><strong>6.</strong> Once profit reaches 2R: trailing stop activates at EMA20 − ATR (only goes up, never down)</div>
            <div><strong>7.</strong> Max {settings.maxPositions || 5} positions at once. Lost 3 in a row? Skip the next signal.</div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #2a5e3a', paddingTop: '1.25rem' }}>
          <h3 style={{ color: '#f87171', fontSize: 16, marginBottom: '0.75rem' }}>🚫 Do NOT</h3>
          <div style={{ fontSize: 15, lineHeight: 2.2, color: '#fca5a5' }}>
            <div>✗ Trade if SPY is below 200 SMA — doesn't matter how good the setup looks</div>
            <div>✗ Chase — if it gaps up past your level, you missed it</div>
            <div>✗ Move your stop down, ever</div>
            <div>✗ Take profits early — the trailing stop does that job</div>
            <div>✗ Hold more than {settings.maxPositions || 5} stocks at once</div>
            <div>✗ Trade after 3 losses in a row — sit out the next one</div>
            <div>✗ Average down on a losing position</div>
          </div>
        </div>
      </div>

      {/* ═══ GAP RISK WARNING ═══ */}
      <div style={{ background: '#1f0a0a', border: '1px solid #f87171', borderRadius: 10, padding: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: 14, color: '#fca5a5', lineHeight: 1.8 }}>
          <strong style={{ color: '#f87171' }}>⚠️ Gap Risk:</strong> If a stock gaps down past your stop (opens below it), you take more than 1R loss.
          This happened 18 times in 121 trades (15%). Worst case: −2.84R. Average extra slippage: 0.7R.
          <strong> Budget for occasional 2-3R losses on gaps.</strong> That's why we risk only {riskPct}% per trade.
        </div>
      </div>

      {/* ═══ OPEN POSITIONS ═══ */}
      {openPositions.length > 0 && (
        <div style={{ background: '#0a1628', border: '2px solid #60a5fa', borderRadius: 12, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#60a5fa', fontSize: 18, marginBottom: '1rem' }}>
            📍 Currently Open: {openPositions.length} position{openPositions.length > 1 ? 's' : ''}
          </h2>
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#a1a1aa', borderBottom: '2px solid #444' }}>
                <th style={{ textAlign: 'left', padding: '8px 10px' }}>Stock</th>
                <th style={{ textAlign: 'left', padding: '8px 10px' }}>Entry Date</th>
                <th style={{ textAlign: 'right', padding: '8px 10px' }}>Entry $</th>
                <th style={{ textAlign: 'right', padding: '8px 10px' }}>Stop $</th>
                <th style={{ textAlign: 'right', padding: '8px 10px' }}>Risk/share</th>
                <th style={{ textAlign: 'right', padding: '8px 10px' }}>Current R</th>
                <th style={{ textAlign: 'center', padding: '8px 10px' }}>Trail Active?</th>
              </tr>
            </thead>
            <tbody>
              {openPositions.map((t, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #2a2a3e', background: '#071a0f' }}>
                  <td style={{ padding: '10px', color: '#60a5fa', fontWeight: 700, fontSize: 16 }}>{t.stock}</td>
                  <td style={{ padding: '10px', color: '#e4e4e7', fontFamily: 'monospace' }}>{t.entryDate}</td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#e4e4e7', fontWeight: 600 }}>${t.entryPrice.toFixed(2)}</td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#f87171', fontWeight: 600 }}>${t.sl.toFixed(2)}</td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#a1a1aa' }}>${t.risk.toFixed(2)}</td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#4ade80', fontWeight: 800, fontSize: 16 }}>+{t.pnlR.toFixed(1)}R</td>
                  <td style={{ padding: '10px', textAlign: 'center', color: t.pnlR >= 2.0 ? '#4ade80' : '#71717a', fontWeight: 700 }}>
                    {t.pnlR >= 2.0 ? '✓ YES' : 'Not yet'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: '0.75rem', fontSize: 13, color: '#a1a1aa' }}>
            Trail activates at 2R profit. Once active, stop ratchets up to EMA20 − ATR (never goes down). Positions above 2R have trailing stops protecting gains.
          </div>
        </div>
      )}

      {/* ═══ RISK CONFIGURATOR ═══ */}
      <div style={{ background: '#1e1e2e', border: '1px solid #6366f1', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: 16, color: '#6366f1', fontWeight: 700, marginBottom: '1rem' }}>⚙️ Your Capital & Risk</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', fontSize: 14 }}>
          <div>
            <label style={{ color: '#a1a1aa', fontSize: 13, display: 'block', marginBottom: 6 }}>Account Size ($)</label>
            <input type="number" value={capital} onChange={e => setCapital(Math.max(1000, +e.target.value || 40000))}
              style={{ background: '#0f0f1a', border: '1px solid #555', borderRadius: 6, padding: '10px 14px', color: '#e4e4e7', width: '100%', fontSize: 16 }} />
          </div>
          <div>
            <label style={{ color: '#a1a1aa', fontSize: 13, display: 'block', marginBottom: 6 }}>Risk per Trade</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[0.5, 1, 1.5, 2, 3].map(pct => (
                <button key={pct} onClick={() => setRiskPct(pct)}
                  style={{ padding: '10px 16px', borderRadius: 6, border: riskPct === pct ? '2px solid #4ade80' : '1px solid #555', background: riskPct === pct ? '#0f2a1a' : '#0f0f1a', color: riskPct === pct ? '#4ade80' : '#e4e4e7', fontSize: 15, fontWeight: riskPct === pct ? 700 : 400, cursor: 'pointer' }}>
                  {pct}%
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ background: '#0f0f1a', border: '1px solid #555', borderRadius: 6, padding: '10px 16px', textAlign: 'center', width: '100%' }}>
              <div style={{ color: '#a1a1aa', fontSize: 12 }}>You risk per trade</div>
              <div style={{ color: '#4ade80', fontSize: 24, fontWeight: 800 }}>${riskDollars.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12, fontSize: 13, color: '#a1a1aa' }}>
          After wins, capital grows → you risk more $ next time. After losses, capital shrinks → you risk less. Automatic position sizing.
        </div>
      </div>

      {/* ═══ PERFORMANCE STATS ═══ */}
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
          <h2 style={{ color: '#e4e4e7', fontSize: 16, marginBottom: '1rem' }}>📈 Equity Curve (compounding at {riskPct}% risk)</h2>
          <div style={{ height: 220, position: 'relative' }}>
            <EquityMini data={strat.equityCurve} startCapital={capital} />
          </div>
        </div>
      )}

      {/* ═══ PER-STOCK BREAKDOWN ═══ */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#e4e4e7', fontSize: 16, marginBottom: '1rem' }}>📊 Strategy vs Buy & Hold</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#a1a1aa', borderBottom: '2px solid #444' }}>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Stock</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Trades</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Win%</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Strategy P/L</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Strategy %</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Buy & Hold %</th>
                <th style={{ textAlign: 'center', padding: '10px 12px' }}>Alpha</th>
              </tr>
            </thead>
            <tbody>
              {stockRows.map(s => {
                const alpha = (parseFloat(s.stratRetPct) - s.bhRetPct).toFixed(1)
                return (
                  <tr key={s.symbol} style={{ borderBottom: '1px solid #2a2a3e' }}>
                    <td style={{ padding: '10px 12px', color: '#60a5fa', fontWeight: 700, fontSize: 15 }}>{s.symbol}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#e4e4e7' }}>{s.trades}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#e4e4e7' }}>{s.wr}%</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: s.pnl >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                      {s.pnl >= 0 ? '+' : ''}${Math.round(s.pnl).toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: parseFloat(s.stratRetPct) >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                      {parseFloat(s.stratRetPct) > 0 ? '+' : ''}{s.stratRetPct}%
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: s.bhRetPct >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                      {s.bhRetPct > 0 ? '+' : ''}{s.bhRetPct}%
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: parseFloat(alpha) >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                      {parseFloat(alpha) >= 0 ? '+' : ''}{alpha}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: '1rem', fontSize: 12, color: '#71717a' }}>
          Period: {allTrades[0]?.entryDate} to {allTrades[allTrades.length-1]?.exitDate}. Strategy % = P/L relative to ${capital.toLocaleString()} starting capital.
        </div>
      </div>

      {/* ═══ ALL TRADES (newest first) ═══ */}
      {strat && (
        <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#e4e4e7', fontSize: 16, marginBottom: '1rem' }}>
            📝 Trade Log — newest first ({strat.taken.length} taken, {strat.skipped.length} skipped)
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: '#a1a1aa', borderBottom: '2px solid #444' }}>
                  <th style={{ textAlign: 'center', padding: '8px 6px' }}>#</th>
                  <th style={{ textAlign: 'left', padding: '8px' }}>Entry</th>
                  <th style={{ textAlign: 'left', padding: '8px' }}>Exit</th>
                  <th style={{ textAlign: 'left', padding: '8px' }}>Stock</th>
                  <th style={{ textAlign: 'right', padding: '8px' }}>Entry $</th>
                  <th style={{ textAlign: 'right', padding: '8px' }}>Exit $</th>
                  <th style={{ textAlign: 'right', padding: '8px' }}>R</th>
                  <th style={{ textAlign: 'right', padding: '8px' }}>P/L</th>
                  <th style={{ textAlign: 'right', padding: '8px' }}>Capital</th>
                  <th style={{ textAlign: 'left', padding: '8px' }}>Why</th>
                  <th style={{ textAlign: 'right', padding: '8px' }}>Days</th>
                  <th style={{ textAlign: 'center', padding: '8px 6px' }}></th>
                </tr>
              </thead>
              <tbody>
                {[...strat.results].reverse().map((t, i) => {
                  const tradeNum = strat.results.length - i
                  const win = t.pnlScaled > 0
                  const isSkipped = t.status === 'skipped'
                  const gapDown = t.pnlR < -1.05
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #2a2a3e', opacity: isSkipped ? 0.45 : 1, background: isSkipped ? '#1f0a0a' : gapDown ? '#1a0a0a' : win ? '#071a0f' : 'transparent' }}>
                      <td style={{ padding: '8px 6px', textAlign: 'center', color: '#71717a', fontWeight: 600, fontSize: 12 }}>{tradeNum}</td>
                      <td style={{ padding: '8px', color: '#e4e4e7', fontFamily: 'monospace', fontSize: 12 }}>{t.entryDate}</td>
                      <td style={{ padding: '8px', color: '#d4d4d8', fontFamily: 'monospace', fontSize: 12 }}>{t.exitDate}</td>
                      <td style={{ padding: '8px', color: '#60a5fa', fontWeight: 700 }}>{t.stock}</td>
                      <td style={{ padding: '8px', textAlign: 'right', color: '#d4d4d8' }}>${t.entryPrice?.toFixed(2)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', color: '#d4d4d8' }}>${t.exitPrice?.toFixed(2)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', color: win ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                        {t.pnlR > 0 ? '+' : ''}{t.pnlR.toFixed(1)}R
                        {gapDown && <span style={{ color: '#fbbf24', fontSize: 10 }}> ⚡</span>}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', color: win ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                        {isSkipped ? '—' : `${t.pnlScaled >= 0 ? '+' : ''}$${Math.round(t.pnlScaled).toLocaleString()}`}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', color: '#a1a1aa', fontSize: 12 }}>${Math.round(t.capitalAtEntry).toLocaleString()}</td>
                      <td style={{ padding: '8px', color: t.exitReason === 'Trail' ? '#4ade80' : t.exitReason === 'SL' ? '#f87171' : '#71717a', fontSize: 12 }}>{isSkipped ? 'SKIPPED' : t.exitReason}</td>
                      <td style={{ padding: '8px', textAlign: 'right', color: '#71717a', fontSize: 12 }}>{t.durationDays}d</td>
                      <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                        {isSkipped ? <span style={{ color: '#fbbf24' }}>⏭</span> : win ? <span style={{ color: '#4ade80' }}>✓</span> : <span style={{ color: '#f87171' }}>✗</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: '0.75rem', fontSize: 12, color: '#71717a' }}>
            ⚡ = gap-down (lost more than 1R due to gap). Trail = trailing stop locked profit. SL = initial stop loss hit.
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
