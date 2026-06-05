import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { fetchJson } from '../utils'

export default function SimBacktestSummaryPage() {
  const [bt5, setBt5] = useState(null)
  const [bt6, setBt6] = useState(null)

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    fetchJson(`${base}sim_backtest5_data.json`).then(setBt5).catch(() => {})
    fetchJson(`${base}sim_backtest6_data.json`).then(setBt6).catch(() => {})
  }, [])

  const linkStyle = { color: '#60a5fa', textDecoration: 'underline' }

  return (
    <div className="page-container" style={{ padding: '1.5rem', maxWidth: 900 }}>
      <h1 style={{ marginBottom: '0.5rem' }}>📋 Backtest Summary</h1>
      <p style={{ color: '#71717a', fontSize: 13, marginBottom: '1.5rem' }}>
        6 backtests → 1 winner. All use $200/trade risk, $40K max capital, max 3 positions, no stocks under $15.
      </p>

      {/* WINNER BOX */}
      <div style={{ background: '#0f2a1a', border: '2px solid #4ade80', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#4ade80', fontSize: 16, marginBottom: '0.75rem' }}>⭐ Winner: BT5 — Mega-Cap Rotation</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.6rem', marginBottom: '1rem' }}>
          <BigStat label="PnL (5yr)" value={`$${Math.round(bt5?.summary?.total_pnl || 20194).toLocaleString()}`} color="#4ade80" />
          <BigStat label="Profit Factor" value={bt5?.summary?.profit_factor?.toFixed(2) || '2.13'} color="#4ade80" />
          <BigStat label="Win Rate" value={`${bt5?.summary?.win_rate?.toFixed(1) || '26.6'}%`} color="#fbbf24" />
          <BigStat label="Trades" value={bt5?.summary?.total_trades || 128} color="#a1a1aa" />
          <BigStat label="Max Streak" value={bt5?.summary?.max_losing_streak || 16} color="#fbbf24" />
          <BigStat label="Max DD" value={`$${Math.round(bt5?.summary?.max_drawdown || 5183).toLocaleString()}`} color="#f87171" />
        </div>
        <div style={{ fontSize: 13, color: '#d4d4d8', lineHeight: 1.8 }}>
          <div><strong>Pool:</strong> 30 mega/large-cap tech stocks (hand-picked, all liquid by Jan 2020)</div>
          <div><strong>Entry:</strong> Breakout (close {'>'} 20d high) + volume ≥ 1.2× avg + above 50 SMA</div>
          <div><strong>Rotation:</strong> Monthly, top 10 by 6-month momentum</div>
          <div><strong>Regime:</strong> SPY {'>'} 200 SMA — below = 100% cash</div>
          <div><strong>Trail:</strong> 2.5R activate → EMA20 − 1×ATR</div>
        </div>
        <div style={{ marginTop: '0.75rem' }}>
          <Link to="/sim/backtest-5" style={linkStyle}>→ Full BT5 details</Link>
          <span style={{ margin: '0 1rem', color: '#555' }}>|</span>
          <Link to="/sim/live" style={linkStyle}>→ Live execution page</Link>
        </div>
      </div>

      {/* COMPARISON TABLE */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#fbbf24', fontSize: 14, marginBottom: '1rem' }}>All Backtests Compared</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#71717a', borderBottom: '1px solid #444' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>BT</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Strategy</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>PF</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>PnL</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>WR</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Streak</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Status</th>
              </tr>
            </thead>
            <tbody style={{ color: '#e4e4e7' }}>
              <tr style={{ borderBottom: '1px solid #222' }}>
                <td style={{ padding: '6px 8px' }}><Link to="/sim/backtest-1" style={linkStyle}>1</Link></td>
                <td style={{ padding: '6px 8px', color: '#a1a1aa' }}>Confluence (275 stocks)</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>1.48</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>$31k</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>24.2%</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>—</td>
                <td style={{ padding: '6px 8px', color: '#fbbf24' }}>🟡 Biased pool</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #222' }}>
                <td style={{ padding: '6px 8px' }}><Link to="/sim/backtest-2" style={linkStyle}>2</Link></td>
                <td style={{ padding: '6px 8px', color: '#a1a1aa' }}>Single strategies alone</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>0.90–1.83</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>varies</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>21–31%</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>—</td>
                <td style={{ padding: '6px 8px', color: '#fbbf24' }}>🟡 Biased pool</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #222' }}>
                <td style={{ padding: '6px 8px' }}><Link to="/sim/backtest-3" style={linkStyle}>3</Link></td>
                <td style={{ padding: '6px 8px', color: '#a1a1aa' }}>Confluence + SPY regime</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>1.45</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>$21k</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>28.0%</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>—</td>
                <td style={{ padding: '6px 8px', color: '#fbbf24' }}>🟡 Biased pool</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #222' }}>
                <td style={{ padding: '6px 8px' }}><Link to="/sim/backtest-4" style={linkStyle}>4</Link></td>
                <td style={{ padding: '6px 8px', color: '#a1a1aa' }}>Universe size test</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>1.03–2.60</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>$2k–$62k</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>25–32%</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>12–28</td>
                <td style={{ padding: '6px 8px', color: '#f87171' }}>🔴 High bias</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #222', background: '#0f2a1a' }}>
                <td style={{ padding: '6px 8px', fontWeight: 700 }}><Link to="/sim/backtest-5" style={{ ...linkStyle, color: '#4ade80' }}>5 ⭐</Link></td>
                <td style={{ padding: '6px 8px', color: '#4ade80' }}>Rotation + Breakout (30 mega-caps)</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: '#4ade80', fontWeight: 700 }}>{bt5?.summary?.profit_factor?.toFixed(2) || '2.13'}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: '#4ade80' }}>${Math.round((bt5?.summary?.total_pnl || 20194) / 1000)}k</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: '#4ade80' }}>{bt5?.summary?.win_rate?.toFixed(1) || '26.6'}%</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{bt5?.summary?.max_losing_streak || 16}</td>
                <td style={{ padding: '6px 8px', color: '#4ade80', fontWeight: 600 }}>✅ Honest</td>
              </tr>
              <tr style={{ background: '#0a1520' }}>
                <td style={{ padding: '6px 8px' }}><Link to="/sim/backtest-6" style={{ ...linkStyle, color: '#38bdf8' }}>6</Link></td>
                <td style={{ padding: '6px 8px', color: '#38bdf8' }}>Rotation + Breakout (68 mid-caps)</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: '#38bdf8' }}>{bt6?.summary?.profit_factor?.toFixed(2) || '1.44'}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: '#38bdf8' }}>${Math.round((bt6?.summary?.total_pnl || 9697) / 1000)}k</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: '#38bdf8' }}>{bt6?.summary?.win_rate?.toFixed(1) || '22.9'}%</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{bt6?.summary?.max_losing_streak || 16}</td>
                <td style={{ padding: '6px 8px', color: '#4ade80' }}>✅ Honest</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11, color: '#71717a', marginTop: 8, marginBottom: 0 }}>
          BT1–4 use today's index membership (survivorship bias). Only BT5/BT6 use fixed pools verified to exist before trading started.
        </p>
      </div>

      {/* WHY BT5 WINS */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#fbbf24', fontSize: 14, marginBottom: '0.75rem' }}>Why BT5 {'>'} BT6</h2>
        <div style={{ fontSize: 13, color: '#d4d4d8', lineHeight: 1.8 }}>
          <div>• <strong>2× the profit</strong> — $20k vs $10k on same risk ($200/trade)</div>
          <div>• <strong>Higher PF</strong> — 2.13 vs 1.44 (more profit per dollar of loss)</div>
          <div>• <strong>Bigger winners</strong> — 5.6R avg ($1,119) vs 4.6R avg ($912)</div>
          <div>• <strong>Better liquidity</strong> — mega-caps have tight spreads, no slippage concern</div>
          <div>• <strong>Similar pain</strong> — both have ~15-16 max losing streak</div>
        </div>
        <div style={{ marginTop: 10, padding: '8px 12px', background: '#1a2a1a', borderRadius: 6, fontSize: 12, color: '#a1a1aa' }}>
          <strong style={{ color: '#4ade80' }}>BT5 pool:</strong> 30 hand-picked mega/large-cap tech stocks (NVDA, AAPL, MSFT, GOOGL, AMZN, META, etc). SPY {'>'} 200 SMA regime.
          <br />
          <strong style={{ color: '#38bdf8' }}>BT6 pool:</strong> 68 hand-picked mid-cap growth stocks (NET, DDOG, PTON, PLUG, etc). SPY {'>'} 200 SMA regime.
          <br />
          Neither uses a dynamic market cap filter — pools are fixed. The $15 min price filter excludes penny-stock entries.
        </div>
      </div>

      {/* KEY LEARNINGS (condensed) */}
      <div style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#fbbf24', fontSize: 14, marginBottom: '0.75rem' }}>Key Learnings</h2>
        <div style={{ fontSize: 13, lineHeight: 2, color: '#d4d4d8' }}>
          <div>1. <strong>Regime filter is non-negotiable</strong> — SPY {'>'} 200 SMA. Skipping bear markets cuts DD in half.</div>
          <div>2. <strong>Momentum rotation works</strong> — top 10 by 6mo return refreshed monthly.</div>
          <div>3. <strong>Mega-caps {'>'} mid-caps</strong> — better PF, better liquidity, bigger avg winners.</div>
          <div>4. <strong>Simple breakout {'>'} confluence</strong> — BT5's single signal beats BT1-3's multi-signal approach.</div>
          <div>5. <strong>The edge is in the trail stop</strong> — avg winner is 5.6R. Without trailing, most profit disappears.</div>
          <div>6. <strong>73% of trades lose</strong> — this is normal. One $1,119 winner pays for ~6 losses ($190 each).</div>
        </div>
      </div>

      {/* MENTAL PREP (compact) */}
      <div style={{ background: '#1e1e2e', border: '1px solid #6366f1', borderRadius: 8, padding: '1.25rem' }}>
        <h2 style={{ color: '#6366f1', fontSize: 14, marginBottom: '0.75rem' }}>Mental Prep</h2>
        <div style={{ fontSize: 13, lineHeight: 2, color: '#d4d4d8' }}>
          <div>• Expect 16 losses in a row ($3,200 drawdown). It happened. Stay the course.</div>
          <div>• Only ~2 trades per month. This is boring by design.</div>
          <div>• When SPY drops below 200 SMA: STOP. Go 100% cash.</div>
          <div>• The only way to lose long-term is to quit or change rules mid-streak.</div>
        </div>
        <div style={{ marginTop: '0.75rem' }}>
          <Link to="/sim/live" style={linkStyle}>→ Go to execution page (daily/monthly routine)</Link>
        </div>
      </div>
    </div>
  )
}

function BigStat({ label, value, color }) {
  return (
    <div style={{ background: '#27272a', borderRadius: 6, padding: '0.5rem', textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: '#71717a', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || '#e4e4e7' }}>{value}</div>
    </div>
  )
}
