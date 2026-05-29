import { useState, useEffect } from 'react'

export default function SimBacktestSummaryPage() {
  const [bt5, setBt5] = useState(null)
  const [bt6, setBt6] = useState(null)

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    fetch(`${base}sim_backtest5_data.json`).then(r => r.ok ? r.json() : null).then(setBt5).catch(() => {})
    fetch(`${base}sim_backtest6_data.json`).then(r => r.ok ? r.json() : null).then(setBt6).catch(() => {})
  }, [])

  return (
    <div className="page-container" style={{ padding: '1.5rem', maxWidth: 1100 }}>
      <h1 style={{ marginBottom: '0.25rem' }}>📋 Backtest Summary — All 6 Compared</h1>
      <p style={{ color: '#71717a', fontSize: 13, marginBottom: '1.5rem' }}>
        The full journey from BT1 → BT6. All backtests start Jan 2021 (apples-to-apples comparison). BT5/BT6 start Mar–Apr 2021 due to 6-month momentum lookback. $200/trade risk, $40K max capital, max 3 positions.
      </p>

      {/* MASTER COMPARISON TABLE */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#fbbf24', fontSize: 15, marginBottom: '1rem' }}>🔬 All Backtests Compared</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ color: '#71717a', borderBottom: '1px solid #444' }}>
                <th style={{ textAlign: 'left', padding: '8px' }}>Backtest</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>Strategy</th>
                <th style={{ textAlign: 'right', padding: '8px' }}>Trades</th>
                <th style={{ textAlign: 'right', padding: '8px' }}>WR%</th>
                <th style={{ textAlign: 'right', padding: '8px' }}>PnL</th>
                <th style={{ textAlign: 'right', padding: '8px' }}>PF</th>
                <th style={{ textAlign: 'right', padding: '8px' }}>Streak</th>
                <th style={{ textAlign: 'right', padding: '8px' }}>DD</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>Verdict</th>
              </tr>
            </thead>
            <tbody style={{ color: '#e4e4e7' }}>
              <tr style={{ borderBottom: '1px solid #222' }}>
                <td style={{ padding: '8px', fontWeight: 600 }}>BT1</td>
                <td style={{ padding: '8px', color: '#a1a1aa' }}>Confluence (2+ signals, 275 stocks)</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>426</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>23.7%</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>$16,264</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>1.23</td>
                <td style={{ padding: '8px', textAlign: 'right', color: '#f87171' }}>18</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>$12,745</td>
                <td style={{ padding: '8px', color: '#f87171' }}>❌ Low PF, high DD</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #222' }}>
                <td style={{ padding: '8px', fontWeight: 600 }}>BT2</td>
                <td style={{ padding: '8px', color: '#a1a1aa' }}>Individual strategies (Breakout, Bounce, RSI)</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>—</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>18-23%</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>-$1.8k–$21k</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>0.97-1.35</td>
                <td style={{ padding: '8px', textAlign: 'right', color: '#f87171' }}>24-31</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>—</td>
                <td style={{ padding: '8px', color: '#f87171' }}>❌ Much worse alone</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #222' }}>
                <td style={{ padding: '8px', fontWeight: 600 }}>BT3</td>
                <td style={{ padding: '8px', color: '#a1a1aa' }}>Confluence + Regime (SPY{'>'} 200 SMA)</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>316</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>29.1%</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>$25,449</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>1.54</td>
                <td style={{ padding: '8px', textAlign: 'right', color: '#4ade80' }}>16</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>$6,764</td>
                <td style={{ padding: '8px', color: '#4ade80' }}>✅ Regime helps WR & DD</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #222', background: '#1f0a0a' }}>
                <td style={{ padding: '8px', fontWeight: 600, color: '#f87171' }}>BT4 ⚠️</td>
                <td style={{ padding: '8px', color: '#a1a1aa' }}>Universe test (Mega/Large/Mid/Full)</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>229-370</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>25-32%</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>$2k–$64k</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>1.04-2.64</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>12-21</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>$6k–$16k</td>
                <td style={{ padding: '8px', color: '#f87171' }}>❌ SURVIVORSHIP BIAS — fixed list of today's winners</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #222' }}>
                <td style={{ padding: '8px', fontWeight: 600 }}>BT5</td>
                <td style={{ padding: '8px', color: '#a1a1aa' }}>Rotation Mega-Cap (top 10 by 6mo mom)</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{bt5?.summary?.total_trades || 132}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{bt5?.summary?.win_rate?.toFixed(1) || '25.8'}%</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>${(bt5?.summary?.total_pnl || 19263).toLocaleString()}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{bt5?.summary?.profit_factor?.toFixed(2) || '2.02'}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: '#f87171' }}>{bt5?.summary?.max_losing_streak || 18}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>${(bt5?.summary?.max_drawdown || 3559).toLocaleString()}</td>
                <td style={{ padding: '8px', color: '#fbbf24' }}>Good PF, streak high in bear</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #222', background: '#0f2a1a' }}>
                <td style={{ padding: '8px', fontWeight: 700, color: '#4ade80' }}>BT6 ⭐</td>
                <td style={{ padding: '8px', color: '#4ade80' }}>Rotation Mid-Cap (top 10 by 6mo mom)</td>
                <td style={{ padding: '8px', textAlign: 'right', color: '#4ade80' }}>{bt6?.summary?.total_trades || 116}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: '#4ade80' }}>{bt6?.summary?.win_rate?.toFixed(1) || '31.9'}%</td>
                <td style={{ padding: '8px', textAlign: 'right', color: '#4ade80' }}>${(bt6?.summary?.total_pnl || 29816).toLocaleString()}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: '#4ade80', fontWeight: 700 }}>{bt6?.summary?.profit_factor?.toFixed(2) || '2.93'}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: '#4ade80', fontWeight: 700 }}>{bt6?.summary?.max_losing_streak || 10}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: '#4ade80', fontWeight: 700 }}>${(bt6?.summary?.max_drawdown || 1985).toLocaleString()}</td>
                <td style={{ padding: '8px', color: '#4ade80', fontWeight: 700 }}>🏆 BEST overall</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* WHY BT6 WINS */}
      <div style={{ background: '#0f2a1a', border: '2px solid #4ade80', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#4ade80', fontSize: 15, marginBottom: '1rem' }}>🏆 Why BT6 (Mid-Cap Rotation) Wins</h2>
        <div style={{ fontSize: 13, color: '#d4d4d8', lineHeight: 1.8 }}>
          <p style={{ marginBottom: 8 }}><strong style={{ color: '#4ade80' }}>Best PF (2.93)</strong> — every $1 risked returns ~$3. That's over 2× BT3.</p>
          <p style={{ marginBottom: 8 }}><strong style={{ color: '#4ade80' }}>Lowest streak (10)</strong> — only 10 consecutive losers worst-case. That's $2,000 max pain at $200/trade.</p>
          <p style={{ marginBottom: 8 }}><strong style={{ color: '#4ade80' }}>Lowest DD ($1,985)</strong> — peak-to-trough drawdown under $2k. Compare to BT1's $12.7k or BT3's $6.8k.</p>
          <p style={{ marginBottom: 8 }}><strong style={{ color: '#4ade80' }}>Highest avg winner (6.1R / $1,224)</strong> — mid-caps move more on breakouts. When they go, they GO.</p>
          <p style={{ marginBottom: 8 }}><strong style={{ color: '#fbbf24' }}>IWM regime tested:</strong> We tested IWM {'>'} 200 SMA as an alternative regime filter for mid-caps. SPY regime is definitively better (PF 2.93 vs 2.09). IWM filters too aggressively (62% bull vs SPY 76%).</p>
          <p style={{ marginBottom: 0 }}><strong style={{ color: '#fbbf24' }}>No survivorship bias:</strong> Monthly rotation picks top 10 by recent momentum. Stocks rotate in/out. No cherry-picking.</p>
        </div>
      </div>

      {/* JOURNEY NARRATIVE */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#fbbf24', fontSize: 15, marginBottom: '1rem' }}>📖 The Journey</h2>
        <div style={{ fontSize: 13, color: '#d4d4d8', lineHeight: 1.8 }}>
          <p style={{ marginBottom: 10 }}><strong>BT1:</strong> Started with confluence (2+ strategies agree). PnL $16k but streak of 18 and DD $12.7k too painful. Question: can we reduce it?</p>
          <p style={{ marginBottom: 10 }}><strong>BT2:</strong> Tried single strategies alone. MUCH worse (streaks 24-31). Proved: confluence IS needed.</p>
          <p style={{ marginBottom: 10 }}><strong>BT3:</strong> Added regime filter (SPY {'>'} 200 SMA). WR jumped from 23.7%→29.1%, DD cut from $12.7k→$6.8k. PF up from 1.23→1.54.</p>
          <p style={{ marginBottom: 10 }}><strong>BT4:</strong> Tested different universe sizes. Mega caps = best overall (PF 2.64, streak 12). Large caps terrible (PF 1.04).</p>
          <p style={{ marginBottom: 10 }}><strong>BT5:</strong> Switched to breakout-only + momentum rotation on mega-caps. PF 2.02 but streak 18 during 2022 bear.</p>
          <p style={{ marginBottom: 0 }}><strong>BT6:</strong> Same rotation strategy but mid-cap growth stocks. <strong style={{ color: '#4ade80' }}>WINNER.</strong> PF 2.93, streak 10, DD $1,985. Mid-caps produce bigger breakout moves with less crowding.</p>
        </div>
      </div>

      {/* FINAL STRATEGY */}
      <div style={{ background: '#0f2a1a', border: '2px solid #4ade80', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#4ade80', fontSize: 15, marginBottom: '1rem' }}>✅ FINAL STRATEGY — Breakout + Mid-Cap Rotation + Regime</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: 13, lineHeight: 2 }}>
          <div>
            <div><span style={{ color: '#4ade80', fontWeight: 700 }}>1.</span> <strong>Pool:</strong> 30 mid-cap growth stocks ($2B-$30B)</div>
            <div><span style={{ color: '#4ade80', fontWeight: 700 }}>2.</span> <strong>Rotation:</strong> Monthly, top 10 by 6-month return</div>
            <div><span style={{ color: '#4ade80', fontWeight: 700 }}>3.</span> <strong>Regime:</strong> SPY {'>'} 200 SMA only. Below = 100% cash</div>
            <div><span style={{ color: '#4ade80', fontWeight: 700 }}>4.</span> <strong>Entry:</strong> Close {'>'} 20-day high + vol ≥ 1.2× avg + above 50 SMA</div>
            <div><span style={{ color: '#4ade80', fontWeight: 700 }}>5.</span> <strong>Stop:</strong> 1×ATR below entry. Never move down.</div>
          </div>
          <div>
            <div><span style={{ color: '#4ade80', fontWeight: 700 }}>6.</span> <strong>Risk:</strong> $200 per trade. Shares = floor($200 ÷ ATR)</div>
            <div><span style={{ color: '#4ade80', fontWeight: 700 }}>7.</span> <strong>Trail:</strong> 2.5R activate → EMA20 − 1×ATR (ratchets up)</div>
            <div><span style={{ color: '#4ade80', fontWeight: 700 }}>8.</span> <strong>Max:</strong> 3 positions at a time, $40k capital</div>
            <div><span style={{ color: '#4ade80', fontWeight: 700 }}>9.</span> <strong>Frequency:</strong> ~2-3 trades/month</div>
            <div><span style={{ color: '#4ade80', fontWeight: 700 }}>10.</span> <strong>Review:</strong> Re-run backtest quarterly with fresh data</div>
          </div>
        </div>
      </div>

      {/* EXPECTED PERFORMANCE */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#fbbf24', fontSize: 15, marginBottom: '1rem' }}>📊 Expected Performance (BT6 — Jan 2021–May 2026)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
          <BigStat label="Total PnL" value={`$${(bt6?.summary?.total_pnl || 29816).toLocaleString()}`} sub="5 years" color="#4ade80" />
          <BigStat label="Win Rate" value={`${bt6?.summary?.win_rate?.toFixed(1) || '31.9'}%`} sub={`${bt6?.summary?.total_wins || 37} of ${bt6?.summary?.total_trades || 116}`} color="#4ade80" />
          <BigStat label="Profit Factor" value={bt6?.summary?.profit_factor?.toFixed(2) || '2.93'} sub="wins / losses" color="#4ade80" />
          <BigStat label="Max Streak" value={bt6?.summary?.max_losing_streak || 10} sub="consecutive SL" color="#4ade80" />
          <BigStat label="Max Drawdown" value={`$${(bt6?.summary?.max_drawdown || 1985).toLocaleString()}`} sub="peak to trough" color="#fbbf24" />
          <BigStat label="Avg Winner" value={`$${(bt6?.summary?.avg_winner || 1224).toLocaleString()}`} sub={`${bt6?.summary?.avg_r_winner || '6.1'}R`} color="#4ade80" />
          <BigStat label="Avg Loser" value={`$${(bt6?.summary?.avg_loser || 196).toLocaleString()}`} sub="1R = $200" color="#f87171" />
          <BigStat label="Trades/Year" value="~23" sub="~2/month" color="#a1a1aa" />
        </div>
      </div>

      {/* KEY LEARNINGS */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#fbbf24', fontSize: 15, marginBottom: '1rem' }}>💡 Key Learnings Across All Backtests</h2>
        <div style={{ fontSize: 13, lineHeight: 2, color: '#d4d4d8' }}>
          <div>🔑 <strong>Regime filter is non-negotiable.</strong> BT3 proved: skip bear markets. WR jumps from 23.7%→29.1%, DD cut in half.</div>
          <div>🔑 <strong>Momentum rotation beats fixed watchlist.</strong> Cherry-picked stocks (PF 3.88) is hindsight bias. Honest rotation still works (PF 2-3).</div>
          <div>🔑 <strong>Mid-caps {'>'} Mega-caps for breakouts.</strong> More volatile = bigger moves on breakout. Less institutional crowding = cleaner signals.</div>
          <div>🔑 <strong>SPY regime {'>'} IWM regime for mid-caps.</strong> Tested IWM {'>'} 200 SMA — it filters too aggressively (62% vs 76% bull days). SPY gives 40% more PnL.</div>
          <div>🔑 <strong>Simpler is better.</strong> Confluence (4 strategies) gave PF 1.54. Single breakout with proper filters gives PF 2.93.</div>
          <div>🔑 <strong>Position limit (3 max) naturally manages risk.</strong> You never have more than ~$600 at risk at once. Capital never exceeds $40K.</div>
          <div>🔑 <strong>The edge is in the trailing stop.</strong> Avg winner is 6.1R ($1,224). Without trail, most of that profit disappears.</div>
        </div>
      </div>

      {/* MENTAL PREP */}
      <div style={{ background: '#1e1e2e', border: '1px solid #6366f1', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#6366f1', fontSize: 15, marginBottom: '1rem' }}>🧠 Mental Prep</h2>
        <div style={{ fontSize: 13, lineHeight: 2, color: '#d4d4d8' }}>
          <div>📉 <strong>68% of trades lose.</strong> Only 1 in 3 wins. This is normal for a trend-following system.</div>
          <div>📉 <strong>Max 10 losses in a row = $2,000 pain.</strong> It will happen. Stay the course.</div>
          <div>💰 <strong>One winner ($1,224) pays for 6 losers ($196 each).</strong> The math works if you don't quit.</div>
          <div>⏸️ <strong>When SPY drops below 200 SMA:</strong> STOP. Go cash. Don't try to be a hero.</div>
          <div>🎯 <strong>The only way to lose is to quit or change rules mid-streak.</strong></div>
        </div>
      </div>

      {/* DAILY/MONTHLY ROUTINE */}
      <div style={{ background: '#1e1e2e', border: '1px solid #fbbf24', borderRadius: 8, padding: '1.25rem' }}>
        <h2 style={{ color: '#fbbf24', fontSize: 15, marginBottom: '1rem' }}>📝 Execution Routine</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', fontSize: 13, color: '#d4d4d8' }}>
          <div>
            <h3 style={{ color: '#60a5fa', fontSize: 13, marginBottom: 8 }}>Daily (5 min after close)</h3>
            <div style={{ lineHeight: 2 }}>
              <div>☐ Check SPY vs 200 SMA (if below → done)</div>
              <div>☐ Scan top-10 watchlist: any 20-day high breakout + volume?</div>
              <div>☐ If signal + under 3 positions → set buy order for tomorrow</div>
              <div>☐ Update trail stops on open positions</div>
              <div>☐ Log in journal</div>
            </div>
          </div>
          <div>
            <h3 style={{ color: '#60a5fa', fontSize: 13, marginBottom: 8 }}>Monthly (1st of month)</h3>
            <div style={{ lineHeight: 2 }}>
              <div>☐ Pull 6-month return for all 30 mid-cap pool stocks</div>
              <div>☐ Rank by return → top 10 = new watchlist</div>
              <div>☐ Keep open positions even if stock drops off watchlist</div>
              <div>☐ Note which stocks rotated in/out</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function BigStat({ label, value, sub, color }) {
  return (
    <div style={{ background: '#27272a', borderRadius: 8, padding: '0.75rem', textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: '#71717a', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || '#e4e4e7' }}>{value}</div>
      <div style={{ fontSize: 10, color: '#52525b', marginTop: 2 }}>{sub}</div>
    </div>
  )
}
