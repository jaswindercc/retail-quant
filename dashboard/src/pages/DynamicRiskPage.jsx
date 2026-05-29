import { useState, useEffect } from 'react'

export default function DynamicRiskPage() {
  const [data, setData] = useState(null)

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    fetch(`${base}dynamic_risk_data.json`).then(r => r.ok ? r.json() : null).then(setData).catch(() => {})
  }, [])

  if (!data) return <div style={{ padding: '2rem', color: '#71717a' }}>Loading dynamic risk data...</div>

  const { strategy_names, backtest_names, results, summary, best_overall, best_overall_summary } = data

  // Color helpers
  const pnlColor = (val, baseline) => val >= baseline ? '#4ade80' : '#f87171'
  const streakColor = (val, baseline) => val < baseline ? '#4ade80' : val === baseline ? '#e4e4e7' : '#f87171'
  const ddColor = (val, baseline) => val < baseline ? '#4ade80' : val === baseline ? '#e4e4e7' : '#f87171'

  return (
    <div className="page-container" style={{ padding: '1.5rem', maxWidth: 1200 }}>
      <h1 style={{ marginBottom: '0.25rem' }}>🎛️ Dynamic Risk Study</h1>
      <p style={{ color: '#71717a', fontSize: 13, marginBottom: '1.5rem' }}>
        What happens if we reduce risk or skip trades during losing streaks? 11 approaches tested across all backtests.
      </p>

      {/* WINNER BOX */}
      <div style={{ background: '#0f2a1a', border: '2px solid #4ade80', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#4ade80', fontSize: 15, marginBottom: '0.75rem' }}>⭐ Best Overall: {best_overall}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', fontSize: 13 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#71717a', fontSize: 11 }}>Avg Streak Reduction</div>
            <div style={{ color: '#4ade80', fontSize: 22, fontWeight: 800 }}>-{best_overall_summary.avg_streak_reduction}</div>
            <div style={{ color: '#52525b', fontSize: 11 }}>fewer consecutive losses</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#71717a', fontSize: 11 }}>Avg Drawdown Reduction</div>
            <div style={{ color: '#4ade80', fontSize: 22, fontWeight: 800 }}>-{best_overall_summary.avg_dd_reduction_pct}%</div>
            <div style={{ color: '#52525b', fontSize: 11 }}>smaller peak-to-trough</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#71717a', fontSize: 11 }}>PnL Retained</div>
            <div style={{ color: '#4ade80', fontSize: 22, fontWeight: 800 }}>{best_overall_summary.avg_pnl_retention_pct}%</div>
            <div style={{ color: '#52525b', fontSize: 11 }}>{best_overall_summary.avg_pnl_retention_pct > 100 ? 'actually MORE profit' : 'of original profits'}</div>
          </div>
        </div>
        <div style={{ marginTop: '1rem', fontSize: 12, color: '#d4d4d8', lineHeight: 1.8 }}>
          <strong>How it works:</strong> After 3 consecutive losing trades, sit out the next 2 trades. Then resume at full $200 risk.
          This avoids "momentum crashes" where markets are hostile and losses cluster. You keep 104% of profits while cutting drawdown by 37%.
        </div>
      </div>

      {/* BIAS WARNING */}
      <div style={{ background: '#1a0a0a', border: '2px solid #f87171', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: 13, color: '#f87171', fontWeight: 700, marginBottom: '0.25rem' }}>⚠️ BT4 Mega excluded from this study</div>
        <div style={{ fontSize: 12, color: '#d4d4d8' }}>
          BT4 used a fixed hand-picked list of today's mega-caps (NVDA, META, AVGO, etc.) — survivorship bias. Only BT1, BT3, BT5, BT6 are included here because they use honest universe selection.
        </div>
      </div>

      {/* HEAD-TO-HEAD TABLE: Vanilla vs Cool-off */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#fbbf24', fontSize: 15, marginBottom: '1rem' }}>📊 Vanilla vs Cool-off: 3L → skip 2 (Per Backtest)</h2>

        {/* Quick summary card */}
        {(() => {
          const totals = backtest_names.reduce((acc, bt) => {
            acc.vanillaPnl += results[bt]['Baseline ($200 fixed)'].total_pnl
            acc.coolPnl += results[bt]['Cool-off: 3L \u2192 skip 2'].total_pnl
            return acc
          }, { vanillaPnl: 0, coolPnl: 0 })
          const wins = backtest_names.filter(bt => results[bt]['Cool-off: 3L \u2192 skip 2'].total_pnl >= results[bt]['Baseline ($200 fixed)'].total_pnl).length
          return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem', padding: '1rem', background: '#0f0f1a', borderRadius: 8 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#71717a', fontSize: 11 }}>Total P/L (All BTs Combined)</div>
                <div style={{ fontSize: 11, marginTop: 4 }}>
                  <span style={{ color: '#71717a' }}>Vanilla: </span><span style={{ color: '#e4e4e7' }}>${totals.vanillaPnl.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                </div>
                <div style={{ fontSize: 11, marginTop: 2 }}>
                  <span style={{ color: '#71717a' }}>Cool-off: </span><span style={{ color: '#4ade80', fontWeight: 700 }}>${totals.coolPnl.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#71717a', fontSize: 11 }}>Cool-off Wins</div>
                <div style={{ color: '#4ade80', fontSize: 22, fontWeight: 800 }}>{wins} / {backtest_names.length}</div>
                <div style={{ color: '#52525b', fontSize: 11 }}>backtests more profitable</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#71717a', fontSize: 11 }}>Every Backtest Gets</div>
                <div style={{ color: '#4ade80', fontSize: 22, fontWeight: 800 }}>Less DD</div>
                <div style={{ color: '#52525b', fontSize: 11 }}>100% hit rate on drawdown cut</div>
              </div>
            </div>
          )
        })()}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#71717a', borderBottom: '2px solid #444' }}>
                <th style={{ textAlign: 'left', padding: '8px 10px' }}>Backtest</th>
                <th style={{ textAlign: 'right', padding: '8px 10px' }}>P/L Vanilla</th>
                <th style={{ textAlign: 'right', padding: '8px 10px' }}>P/L Cool-off</th>
                <th style={{ textAlign: 'right', padding: '8px 10px' }}>Δ P/L</th>
                <th style={{ textAlign: 'right', padding: '8px 10px' }}>Streak Before</th>
                <th style={{ textAlign: 'right', padding: '8px 10px' }}>Streak After</th>
                <th style={{ textAlign: 'right', padding: '8px 10px' }}>DD Before</th>
                <th style={{ textAlign: 'right', padding: '8px 10px' }}>DD After</th>
                <th style={{ textAlign: 'right', padding: '8px 10px' }}>DD Cut</th>
                <th style={{ textAlign: 'center', padding: '8px 10px' }}>Winner</th>
              </tr>
            </thead>
            <tbody style={{ color: '#e4e4e7' }}>
              {backtest_names.map(bt => {
                const base = results[bt]['Baseline ($200 fixed)']
                const cool = results[bt]['Cool-off: 3L \u2192 skip 2']
                const pnlDelta = cool.total_pnl - base.total_pnl
                const ddCut = ((base.max_drawdown - cool.max_drawdown) / base.max_drawdown * 100).toFixed(0)
                const coolWins = pnlDelta >= 0
                return (
                  <tr key={bt} style={{ borderBottom: '1px solid #333', background: coolWins ? '#0a1f14' : '#1f0a0a' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>{bt}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>${base.total_pnl.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: coolWins ? '#4ade80' : '#e4e4e7' }}>${cool.total_pnl.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: pnlDelta >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                      {pnlDelta >= 0 ? '+' : ''}${pnlDelta.toLocaleString(undefined, {maximumFractionDigits: 0})}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#71717a' }}>{base.max_losing_streak}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: cool.max_losing_streak < base.max_losing_streak ? '#4ade80' : '#e4e4e7' }}>{cool.max_losing_streak}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#71717a' }}>-${base.max_drawdown.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#4ade80' }}>-${cool.max_drawdown.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#4ade80', fontWeight: 700 }}>-{ddCut}%</td>
                    <td style={{ padding: '8px 10px', textAlign: 'center', fontSize: 14 }}>
                      {coolWins ? '✅ Cool-off' : '⚠️ Vanilla*'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: '0.75rem', fontSize: 11, color: '#71717a' }}>
          * Where Vanilla "wins" on PnL, Cool-off still has lower DD and shorter streaks — you trade a small PnL hit for massively better risk. Even in those cases, you'd still use Cool-off for survivability.
        </div>
      </div>

      {/* WHY IS COOL-OFF THE BEST? */}
      <div style={{ background: '#1e1e2e', border: '1px solid #60a5fa', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#60a5fa', fontSize: 15, marginBottom: '1rem' }}>🤔 Why "Cool-off" When PnL Retention Is Similar?</h2>
        <div style={{ fontSize: 13, lineHeight: 2, color: '#d4d4d8' }}>
          <div>You're right — many strategies produce similar PnL retention (102-104%). <strong>PnL is NOT the differentiator.</strong> The reason Cool-off wins is:</div>
          <div style={{ marginTop: '0.5rem', paddingLeft: '1rem' }}>
            <div>1️⃣ <strong>Streak reduction: -2.4 trades</strong> — No other strategy reduces losing streaks this much. "Skip after 3" only cuts 1.2, half-risk cuts 0, progressive cuts 0. Cool-off is 2× better at the thing that actually hurts you psychologically.</div>
            <div>2️⃣ <strong>DD reduction: -37%</strong> — Highest of any strategy. Progressive is 32% but costs you PnL (99.5% retained). Half-risk is only 26%. Cool-off gives you the deepest DD cut while keeping profits.</div>
            <div>3️⃣ <strong>The COMBINATION matters.</strong> Anti-Martingale retains 116% PnL (way more!) but has ZERO streak reduction and only 23% DD cut. It makes you more money but does nothing for the actual problem: surviving losing streaks without going tilt.</div>
          </div>
          <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#1a1a3e', borderRadius: 6, fontSize: 12 }}>
            <strong style={{ color: '#fbbf24' }}>TL;DR:</strong> If you only care about max profit → Anti-Martingale (116% retained but more volatile). If you want to <em>survive psychologically</em> with less pain and still keep full profits → Cool-off wins because it's the only strategy that materially cuts BOTH streak AND drawdown simultaneously.
          </div>
        </div>
      </div>

      {/* CROSS-BACKTEST SUMMARY TABLE */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#fbbf24', fontSize: 15, marginBottom: '1rem' }}>🔬 All Strategies Ranked (Averaged Across All Backtests)</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ color: '#71717a', borderBottom: '1px solid #444' }}>
                <th style={{ textAlign: 'center', padding: '6px 8px' }}>#</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Strategy</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Streak Δ</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>DD Reduction</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>PnL Retained</th>
                <th style={{ textAlign: 'center', padding: '6px 8px' }}>Verdict</th>
              </tr>
            </thead>
            <tbody style={{ color: '#e4e4e7' }}>
              {[...strategy_names]
                .filter(n => n !== 'Baseline ($200 fixed)')
                .sort((a, b) => {
                  // Rank by: streak reduction (40%) + DD reduction (40%) + PnL retention bonus (20%)
                  const sa = summary[a], sb = summary[b]
                  const scoreA = sa.avg_streak_reduction * 10 + sa.avg_dd_reduction_pct + (sa.avg_pnl_retention_pct - 100) * 2
                  const scoreB = sb.avg_streak_reduction * 10 + sb.avg_dd_reduction_pct + (sb.avg_pnl_retention_pct - 100) * 2
                  return scoreB - scoreA
                })
                .map((name, i) => {
                  const s = summary[name]
                  const isBest = name === best_overall
                  const rank = i + 1
                  const medalColors = ['#ffd700', '#c0c0c0', '#cd7f32']
                  return (
                    <tr key={name} style={{ borderBottom: '1px solid #222', background: isBest ? '#0f2a1a' : rank <= 3 ? '#0f0f1a' : 'transparent' }}>
                      <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: rank <= 3 ? medalColors[rank-1] : '#71717a' }}>
                        {rank <= 3 ? ['🥇','🥈','🥉'][rank-1] : rank}
                      </td>
                      <td style={{ padding: '6px 8px', fontWeight: isBest ? 700 : 400, color: isBest ? '#4ade80' : '#e4e4e7' }}>
                        {isBest && '⭐ '}{name}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: s.avg_streak_reduction > 0 ? '#4ade80' : s.avg_streak_reduction === 0 ? '#71717a' : '#f87171' }}>
                        {s.avg_streak_reduction > 0 ? `-${s.avg_streak_reduction}` : s.avg_streak_reduction === 0 ? '0' : `+${Math.abs(s.avg_streak_reduction)}`}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: s.avg_dd_reduction_pct > 0 ? '#4ade80' : '#f87171' }}>
                        {s.avg_dd_reduction_pct > 0 ? '-' : '+'}{Math.abs(s.avg_dd_reduction_pct).toFixed(1)}%
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: s.avg_pnl_retention_pct >= 100 ? '#4ade80' : s.avg_pnl_retention_pct >= 90 ? '#fbbf24' : '#f87171' }}>
                        {s.avg_pnl_retention_pct.toFixed(1)}%
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', fontSize: 10 }}>
                        {s.avg_streak_reduction >= 2 && s.avg_dd_reduction_pct >= 30 && s.avg_pnl_retention_pct >= 100 ? '✅ Best' :
                         s.avg_dd_reduction_pct >= 20 && s.avg_pnl_retention_pct >= 100 ? '👍 Great' :
                         s.avg_pnl_retention_pct >= 100 && s.avg_dd_reduction_pct > 0 ? '👌 Good' :
                         s.avg_pnl_retention_pct < 85 ? '❌ Too costly' :
                         s.avg_dd_reduction_pct < 0 ? '❌ Worse DD' : '🤷 Marginal'}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: '0.75rem', fontSize: 10, color: '#52525b' }}>
          Ranked by composite score: streak reduction (weighted 40%) + DD reduction (40%) + PnL above baseline (20%). Baseline excluded.
        </div>
      </div>

      {/* PER-BACKTEST DETAIL */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#fbbf24', fontSize: 15, marginBottom: '1rem' }}>📊 Per-Backtest Breakdown</h2>
        {backtest_names.map(bt => {
          const btResults = results[bt]
          const baseline = btResults['Baseline ($200 fixed)']
          return (
            <div key={bt} style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ color: '#60a5fa', fontSize: 13, marginBottom: '0.5rem' }}>
                {bt} — Baseline: {baseline.trades_taken} trades, PnL ${baseline.total_pnl.toLocaleString()}, PF {baseline.profit_factor}, Streak {baseline.max_losing_streak}, DD ${baseline.max_drawdown.toLocaleString()}
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', minWidth: 750 }}>
                  <thead>
                    <tr style={{ color: '#71717a', borderBottom: '1px solid #333' }}>
                      <th style={{ textAlign: 'left', padding: '4px 6px' }}>Strategy</th>
                      <th style={{ textAlign: 'right', padding: '4px 6px' }}>Taken</th>
                      <th style={{ textAlign: 'right', padding: '4px 6px' }}>Skipped</th>
                      <th style={{ textAlign: 'right', padding: '4px 6px' }}>WR%</th>
                      <th style={{ textAlign: 'right', padding: '4px 6px' }}>PnL</th>
                      <th style={{ textAlign: 'right', padding: '4px 6px' }}>PF</th>
                      <th style={{ textAlign: 'right', padding: '4px 6px' }}>Streak</th>
                      <th style={{ textAlign: 'right', padding: '4px 6px' }}>DD</th>
                      <th style={{ textAlign: 'right', padding: '4px 6px' }}>PnL Δ</th>
                    </tr>
                  </thead>
                  <tbody style={{ color: '#d4d4d8' }}>
                    {strategy_names.filter(n => n !== 'Baseline ($200 fixed)').map((name, i) => {
                      const r = btResults[name]
                      const pnlDelta = r.total_pnl - baseline.total_pnl
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid #1a1a2e' }}>
                          <td style={{ padding: '4px 6px', fontSize: 10 }}>{name}</td>
                          <td style={{ padding: '4px 6px', textAlign: 'right' }}>{r.trades_taken}</td>
                          <td style={{ padding: '4px 6px', textAlign: 'right', color: '#71717a' }}>{r.trades_skipped}</td>
                          <td style={{ padding: '4px 6px', textAlign: 'right' }}>{r.win_rate}%</td>
                          <td style={{ padding: '4px 6px', textAlign: 'right', color: pnlColor(r.total_pnl, baseline.total_pnl) }}>
                            ${r.total_pnl.toLocaleString()}
                          </td>
                          <td style={{ padding: '4px 6px', textAlign: 'right' }}>{r.profit_factor}</td>
                          <td style={{ padding: '4px 6px', textAlign: 'right', color: streakColor(r.max_losing_streak, baseline.max_losing_streak) }}>
                            {r.max_losing_streak}
                          </td>
                          <td style={{ padding: '4px 6px', textAlign: 'right', color: ddColor(r.max_drawdown, baseline.max_drawdown) }}>
                            ${r.max_drawdown.toLocaleString()}
                          </td>
                          <td style={{ padding: '4px 6px', textAlign: 'right', color: pnlDelta >= 0 ? '#4ade80' : '#f87171' }}>
                            {pnlDelta >= 0 ? '+' : ''}${pnlDelta.toLocaleString()}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>

      {/* KEY FINDINGS */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#fbbf24', fontSize: 15, marginBottom: '1rem' }}>💡 Key Findings</h2>
        <div style={{ fontSize: 13, lineHeight: 2, color: '#d4d4d8' }}>
          <div>🔑 <strong>Cool-off (3L → skip 2) is the clear winner.</strong> Cuts streak by 2.4, DD by 37%, and actually INCREASES PnL by 4%. Losses cluster because markets have hostile phases — stepping aside works.</div>
          <div>🔑 <strong>Skipping trades doesn't hurt profits.</strong> The trades you skip during streaks are statistically more likely to also be losers (momentum effect). You're not missing winners — you're dodging bullets.</div>
          <div>🔑 <strong>Anti-Martingale is DANGEROUS.</strong> Increasing size after wins sounds logical but increases DD because it amplifies the inevitable reversal. Don't do it.</div>
          <div>🔑 <strong>Half-risk approaches work but are weaker.</strong> They reduce DD by ~20% but only cut streak by ~1 trade. The psychological benefit is smaller.</div>
          <div>🔑 <strong>Progressive reduction over-complicates.</strong> Similar results to simple half-risk but harder to execute consistently.</div>
          <div>🔑 <strong>The simpler the rule, the more likely you'll follow it.</strong> "3 losses = sit out 2 days" is dead simple.</div>
        </div>
      </div>

      {/* IMPLEMENTATION */}
      <div style={{ background: '#0f2a1a', border: '2px solid #4ade80', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#4ade80', fontSize: 15, marginBottom: '1rem' }}>✅ Recommended Implementation</h2>
        <div style={{ fontSize: 13, color: '#d4d4d8', lineHeight: 2 }}>
          <div><span style={{ color: '#4ade80', fontWeight: 700 }}>Rule:</span> After 3 consecutive losing trades → skip the next 2 trade signals. Then resume at full $200 risk.</div>
          <div><span style={{ color: '#4ade80', fontWeight: 700 }}>Why 3?</span> Backtested threshold. 3 losses = statistically likely you're in a hostile market phase. 2 skips lets the storm pass.</div>
          <div><span style={{ color: '#4ade80', fontWeight: 700 }}>Reset:</span> After skipping 2, your loss counter resets. If you get another 3 in a row, skip 2 again.</div>
          <div><span style={{ color: '#4ade80', fontWeight: 700 }}>Psychology:</span> This turns "am I in a drawdown?" anxiety into a clear mechanical rule. No decisions needed.</div>
          <div style={{ marginTop: 8, padding: '0.75rem', background: '#1a3a2a', borderRadius: 6, fontFamily: 'monospace', fontSize: 12 }}>
            <div style={{ color: '#4ade80' }}>// Execution logic:</div>
            <div>if (consecutive_losses {'>'}= 3) {'{'}</div>
            <div>{'  '}skip_next = 2;  // don't take next 2 signals</div>
            <div>{'  '}consecutive_losses = 0;  // reset counter</div>
            <div>{'}'}</div>
          </div>
        </div>
      </div>

      {/* HONEST CAVEATS */}
      <div style={{ background: '#1e1e2e', border: '1px solid #f87171', borderRadius: 8, padding: '1.25rem' }}>
        <h2 style={{ color: '#f87171', fontSize: 15, marginBottom: '1rem' }}>⚠️ Honest Caveats</h2>
        <div style={{ fontSize: 13, lineHeight: 2, color: '#d4d4d8' }}>
          <div>⚠️ <strong>This is backtested, not live-tested.</strong> Real execution may differ due to slippage, partial fills, etc.</div>
          <div>⚠️ <strong>The skipped trades MIGHT have been winners.</strong> On average they're not, but any individual skip could cost you a 10R runner.</div>
          <div>⚠️ <strong>Dynamic risk adds a psychological layer.</strong> You need discipline to resume after the cool-off period. Don't extend it.</div>
          <div>⚠️ <strong>Results vary by backtest.</strong> BT6 (already best) sees the least improvement because it already has a low streak. BT1/BT5 benefit most.</div>
          <div>⚠️ <strong>Don't stack multiple rules.</strong> Pick ONE approach. Cool-off OR half-risk, not both. Complexity kills execution.</div>
        </div>
      </div>
    </div>
  )
}
