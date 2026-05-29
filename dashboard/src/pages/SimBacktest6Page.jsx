import { useState, useEffect } from 'react'

export default function SimBacktest6Page() {
  const [data, setData] = useState(null)
  const [showAllTrades, setShowAllTrades] = useState(false)

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    fetch(`${base}sim_backtest6_data.json`).then(r => r.ok ? r.json() : null).then(setData).catch(() => {})
  }, [])

  const ruleStyle = { padding: '8px 12px', borderBottom: '1px solid #333', display: 'flex', gap: 10, alignItems: 'flex-start' }
  const numStyle = { color: '#fbbf24', fontWeight: 700, minWidth: 22 }

  const s = data?.summary
  const trades = data?.trades || []
  const params = data?.params || {}
  const equityCurve = data?.equity_curve || []

  const pnls = equityCurve.map(e => e.pnl)
  const maxPnl = Math.max(...pnls, 1)
  const minPnl = Math.min(...pnls, 0)

  return (
    <div className="page-container" style={{ padding: '1.5rem', maxWidth: 1100 }}>
      <h1 style={{ marginBottom: '0.25rem' }}>🔄 Backtest 6 — Rotation Mid-Cap (HONEST)</h1>
      <p style={{ color: '#71717a', fontSize: 13, marginBottom: '1.5rem' }}>
        Momentum rotation on 68 mid-cap growth stocks that were liquid by mid-2020. Includes disaster stocks (PTON, BYND, SPCE, PLUG, WKHS). No cherry-picking.
      </p>

      {/* HONESTY PROOF */}
      <div style={{ background: '#0a1f2a', border: '2px solid #38bdf8', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#38bdf8', fontSize: 15, marginBottom: '0.75rem' }}>✅ This Backtest Is Honest — Here's Proof</h2>
        <div style={{ fontSize: 13, color: '#d4d4d8', lineHeight: 1.8 }}>
          <p style={{ marginBottom: 8 }}>The rotation algorithm picked the top 10 by 6-month return <strong>each month</strong> from a pool of 68 stocks that existed in 2020. No look-ahead, no cherry-picking. The watchlist rotated in disaster stocks when they had momentum:</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 8, marginTop: 8 }}>
            <div style={{ background: '#111', borderRadius: 4, padding: '8px 10px', fontSize: 12 }}>
              <span style={{ color: '#f87171', fontWeight: 600 }}>Jan 2021:</span> <span style={{ color: '#a1a1aa' }}>BLNK, CELH, NIO, FCEL, PLUG, FUBO</span>
              <div style={{ color: '#71717a', fontSize: 11 }}>↑ EV/clean energy bubble — these had 300%+ 6mo returns</div>
            </div>
            <div style={{ background: '#111', borderRadius: 4, padding: '8px 10px', fontSize: 12 }}>
              <span style={{ color: '#f87171', fontWeight: 600 }}>Feb 2021:</span> <span style={{ color: '#a1a1aa' }}>FCEL, PLUG, FUBO, BLNK, NIO</span>
              <div style={{ color: '#71717a', fontSize: 11 }}>↑ Still top momentum — then they crashed 80-90%</div>
            </div>
            <div style={{ background: '#111', borderRadius: 4, padding: '8px 10px', fontSize: 12 }}>
              <span style={{ color: '#f87171', fontWeight: 600 }}>Feb 2023:</span> <span style={{ color: '#a1a1aa' }}>PTON in top 10</span>
              <div style={{ color: '#71717a', fontSize: 11 }}>↑ Dead-cat bounce — PTON rallied 50% then died again</div>
            </div>
            <div style={{ background: '#111', borderRadius: 4, padding: '8px 10px', fontSize: 12 }}>
              <span style={{ color: '#f87171', fontWeight: 600 }}>Apr 2021:</span> <span style={{ color: '#a1a1aa' }}>QS, PLUG, PLTR in top 10</span>
              <div style={{ color: '#71717a', fontSize: 11 }}>↑ Momentum still high — these all fell 60-80% after</div>
            </div>
          </div>
          <p style={{ marginTop: 10, color: '#38bdf8', fontWeight: 600, marginBottom: 0 }}>Result: PF 1.51 — still profitable despite eating real losses from bubble stocks. The strategy survived honest conditions.</p>
        </div>
      </div>

      {!data && <p style={{ color: '#71717a' }}>Loading backtest data...</p>}

      {s && <>
        {/* KEY STATS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: '1.5rem' }}>
          {[
            { label: 'Total PnL', value: `$${s.total_pnl.toLocaleString()}`, color: s.total_pnl >= 0 ? '#4ade80' : '#f87171' },
            { label: 'Profit Factor', value: s.profit_factor.toFixed(2), color: s.profit_factor >= 1.5 ? '#4ade80' : '#fbbf24' },
            { label: 'Win Rate', value: `${s.win_rate.toFixed(1)}%`, color: '#60a5fa' },
            { label: 'Trades', value: s.total_trades, color: '#e4e4e7' },
            { label: 'Max Streak', value: s.max_losing_streak, color: s.max_losing_streak > 15 ? '#f87171' : '#fbbf24' },
            { label: 'Max Drawdown', value: `$${s.max_drawdown.toLocaleString()}`, color: '#f87171' },
            { label: 'Avg Winner', value: `$${s.avg_winner.toLocaleString()} (${s.avg_r_winner}R)`, color: '#4ade80' },
            { label: 'Avg Loser', value: `$${s.avg_loser.toLocaleString()}`, color: '#f87171' },
          ].map(m => (
            <div key={m.label} style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: '#71717a', marginBottom: 4 }}>{m.label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: m.color }}>{m.value}</div>
            </div>
          ))}
        </div>

        {/* EQUITY CURVE */}
        {equityCurve.length > 0 && (
          <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
            <h2 style={{ color: '#fbbf24', fontSize: 15, marginBottom: '0.75rem' }}>📈 Equity Curve</h2>
            <svg width="100%" height="120" viewBox={`0 0 ${equityCurve.length} 100`} preserveAspectRatio="none" style={{ display: 'block' }}>
              <line x1="0" y1={((0 - minPnl) / (maxPnl - minPnl)) * -100 + 100} x2={equityCurve.length} y2={((0 - minPnl) / (maxPnl - minPnl)) * -100 + 100} stroke="#333" strokeWidth="0.5" />
              <polyline
                fill="none"
                stroke="#4ade80"
                strokeWidth="1.5"
                points={equityCurve.map((e, i) => `${i},${((e.pnl - minPnl) / (maxPnl - minPnl)) * -100 + 100}`).join(' ')}
              />
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#71717a', marginTop: 4 }}>
              <span>{equityCurve[0]?.date}</span>
              <span>{equityCurve[equityCurve.length - 1]?.date}</span>
            </div>
          </div>
        )}

        {/* COMPARISON vs BT5 */}
        <div style={{ background: '#1a2e1a', border: '1px solid #22c55e', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#4ade80', fontSize: 15, marginBottom: '1rem' }}>📊 Mid-Cap vs Mega-Cap Rotation</h2>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#71717a', borderBottom: '1px solid #333' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Strategy</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>PF</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>WR</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>PnL</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Streak</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>DD</th>
              </tr>
            </thead>
            <tbody style={{ color: '#e4e4e7' }}>
              <tr style={{ background: '#22c55e22', fontWeight: 600, borderBottom: '1px solid #222' }}>
                <td style={{ padding: '6px 8px' }}>⭐ BT6: Mid-Cap Rotation</td>
                <td style={{ textAlign: 'right', padding: '6px 8px', color: '#4ade80' }}>{s.profit_factor}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>{s.win_rate.toFixed(1)}%</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>${s.total_pnl.toLocaleString()}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>{s.max_losing_streak}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>${s.max_drawdown.toLocaleString()}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #222' }}>
                <td style={{ padding: '6px 8px' }}>BT5: Mega-Cap Rotation</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>2.02</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>25.8%</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>$19,263</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>18</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>$3,559</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #222' }}>
                <td style={{ padding: '6px 8px' }}>BT3: Confluence + Regime (275)</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>1.84</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>30.3%</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>$30,255</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>11</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>$7,992</td>
              </tr>
            </tbody>
          </table>
          <p style={{ color: '#a1a1aa', fontSize: 12, marginTop: 10, marginBottom: 0 }}>
            Honest results: lower PF than biased version (was 2.93 with cherry-picked pool, now 1.51 with honest pool). Strategy still profitable.
          </p>
        </div>

        {/* ROTATION LOG */}
        {s.rotation_log && s.rotation_log.length > 0 && (
          <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
            <h2 style={{ color: '#fbbf24', fontSize: 15, marginBottom: '0.75rem' }}>🔄 Watchlist Rotation History</h2>
            <p style={{ color: '#a1a1aa', fontSize: 12, marginBottom: 10 }}>Monthly rotation — top 10 by 6-month momentum. Stocks rotate in/out.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 8 }}>
              {s.rotation_log.map(r => (
                <div key={r.month} style={{ fontSize: 12, padding: '4px 8px', background: '#111', borderRadius: 4 }}>
                  <span style={{ color: '#60a5fa', fontWeight: 600 }}>{r.month}:</span>{' '}
                  <span style={{ color: '#a1a1aa' }}>{r.watchlist.join(', ')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PER-STOCK BREAKDOWN */}
        {s.stock_breakdown && (
          <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
            <h2 style={{ color: '#fbbf24', fontSize: 15, marginBottom: '1rem' }}>📋 Per-Stock Results</h2>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: '#71717a', borderBottom: '1px solid #333' }}>
                  <th style={{ textAlign: 'left', padding: '4px 8px' }}>Stock</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px' }}>Trades</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px' }}>Wins</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px' }}>WR%</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px' }}>PnL</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(s.stock_breakdown)
                  .sort((a, b) => b[1].pnl - a[1].pnl)
                  .map(([stock, info]) => (
                    <tr key={stock} style={{ borderBottom: '1px solid #222', color: '#e4e4e7' }}>
                      <td style={{ padding: '4px 8px', fontWeight: 600, color: '#60a5fa' }}>{stock}</td>
                      <td style={{ textAlign: 'right', padding: '4px 8px' }}>{info.trades}</td>
                      <td style={{ textAlign: 'right', padding: '4px 8px' }}>{info.wins}</td>
                      <td style={{ textAlign: 'right', padding: '4px 8px' }}>{(info.wins / info.trades * 100).toFixed(0)}%</td>
                      <td style={{ textAlign: 'right', padding: '4px 8px', color: info.pnl >= 0 ? '#4ade80' : '#f87171' }}>
                        ${Math.round(info.pnl).toLocaleString()}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {/* TRADE LOG */}
        <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ color: '#fbbf24', fontSize: 15, margin: 0 }}>📝 All Trades ({trades.length})</h2>
            <button
              onClick={() => setShowAllTrades(!showAllTrades)}
              style={{ background: '#333', color: '#e4e4e7', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}
            >
              {showAllTrades ? 'Collapse' : 'Expand'}
            </button>
          </div>
          {showAllTrades && (
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: '#71717a', borderBottom: '1px solid #333', position: 'sticky', top: 0, background: '#1e1e2e' }}>
                    <th style={{ textAlign: 'left', padding: '4px 6px' }}>#</th>
                    <th style={{ textAlign: 'left', padding: '4px 6px' }}>Stock</th>
                    <th style={{ textAlign: 'left', padding: '4px 6px' }}>Entry</th>
                    <th style={{ textAlign: 'left', padding: '4px 6px' }}>Exit</th>
                    <th style={{ textAlign: 'right', padding: '4px 6px' }}>Entry$</th>
                    <th style={{ textAlign: 'right', padding: '4px 6px' }}>Exit$</th>
                    <th style={{ textAlign: 'right', padding: '4px 6px' }}>R</th>
                    <th style={{ textAlign: 'right', padding: '4px 6px' }}>PnL</th>
                    <th style={{ textAlign: 'left', padding: '4px 6px' }}>Reason</th>
                    <th style={{ textAlign: 'right', padding: '4px 6px' }}>Days</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #1a1a1a', color: t.pnlDollar >= 0 ? '#4ade80' : '#f87171' }}>
                      <td style={{ padding: '3px 6px', color: '#71717a' }}>{i + 1}</td>
                      <td style={{ padding: '3px 6px', color: '#60a5fa', fontWeight: 500 }}>{t.stock}</td>
                      <td style={{ padding: '3px 6px', color: '#a1a1aa' }}>{t.entryDate}</td>
                      <td style={{ padding: '3px 6px', color: '#a1a1aa' }}>{t.exitDate}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right', color: '#e4e4e7' }}>{t.entryPrice.toFixed(2)}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right', color: '#e4e4e7' }}>{t.exitPrice.toFixed(2)}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right' }}>{t.pnlR.toFixed(1)}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right', fontWeight: 600 }}>${t.pnlDollar.toLocaleString()}</td>
                      <td style={{ padding: '3px 6px', color: '#a1a1aa' }}>{t.exitReason}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right', color: '#71717a' }}>{t.durationDays}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>}

      {/* THE POOL */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#fbbf24', fontSize: 15, marginBottom: '0.75rem' }}>📋 Mid-Cap Pool (68 stocks — honest)</h2>
        <p style={{ color: '#a1a1aa', fontSize: 12, marginBottom: 10 }}>
          All mid-cap growth stocks liquid by mid-2020. Includes winners AND disasters — no hindsight cherry-picking.
        </p>
        <div style={{ fontSize: 13, color: '#60a5fa', lineHeight: 2 }}>
          {(params.pool || []).join(', ')}
        </div>
      </div>

      {/* RULES */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1.25rem' }}>
        <h2 style={{ color: '#fbbf24', fontSize: 15, marginBottom: '1rem' }}>📏 Rules (Same as BT5)</h2>
        <div style={{ fontSize: 13, color: '#e4e4e7' }}>
          <div style={ruleStyle}><span style={numStyle}>1</span><span><strong>Monthly Rotation:</strong> Top 10 from pool by 6-month return.</span></div>
          <div style={ruleStyle}><span style={numStyle}>2</span><span><strong>Regime:</strong> SPY {'>'} 200 SMA → trade. Below → 100% cash.</span></div>
          <div style={ruleStyle}><span style={numStyle}>3</span><span><strong>Entry:</strong> Close above 20-day high + volume ≥ 1.2× avg + above 50 SMA.</span></div>
          <div style={ruleStyle}><span style={numStyle}>4</span><span><strong>Stop:</strong> 1×ATR below entry. Risk $200/trade.</span></div>
          <div style={ruleStyle}><span style={numStyle}>5</span><span><strong>Trail:</strong> 2.5R activate → EMA20 − 1×ATR (ratchets up).</span></div>
          <div style={{ ...ruleStyle, borderBottom: 'none' }}><span style={numStyle}>6</span><span><strong>Max:</strong> 3 positions, $40k capital.</span></div>
        </div>
      </div>
    </div>
  )
}
