import { Link } from 'react-router-dom'

const STRATEGIES = [
  { name: 'BT5 LIVE Mega-Cap', pnl: 20194, flatPnl: 20194, flatDD: 5183, retDD: 3.9, eff: 0.80, trades: 128, risk: '$197', wr: 26.6, bear2022: -917, link: '/sim/backtest-5', focus: true },
  { name: 'Strategy Switcher', pnl: 193415, flatPnl: 84154, flatDD: 4168, retDD: 20.2, eff: 0.74, trades: 572, risk: '$200*', wr: 41.6, bear2022: 16831, link: '/strategy-switcher', focus: true },
  { name: 'BT3 Regime', pnl: 21241, flatPnl: 21480, flatDD: 7086, retDD: 3.0, eff: 0.37, trades: 293, risk: '$197', wr: 28.0, bear2022: 2432, link: '/sim/backtest-3' },
  { name: 'BT6 Rotation', pnl: 9697, flatPnl: 9697, flatDD: 3977, retDD: 2.4, eff: 0.33, trades: 150, risk: '$197', wr: 22.9, bear2022: null, link: '/sim/backtest-6', focus: true },
  { name: 'Overnight + Factor', pnl: 6805, flatPnl: 6805, flatDD: 590, retDD: 11.5, eff: 0.26, trades: 264, risk: '$100', wr: 51.7, bear2022: null, link: '/strategy-switcher/factors', focus: true },
  { name: 'Overnight Baseline', pnl: 7073, flatPnl: 7073, flatDD: 2136, retDD: 3.3, eff: 0.27, trades: 264, risk: '$100', wr: 47.7, bear2022: null, link: '/overnight' },
  { name: 'SPX Put Spread 30Δ', pnl: 4368, flatPnl: 2569, flatDD: 1859, retDD: 1.4, eff: 0.06, trades: 220, risk: '$340', wr: 82.7, bear2022: null, link: '/options/spx' },
  { name: 'SPX Iron Condor 20Δ', pnl: 1654, flatPnl: 1099, flatDD: 2876, retDD: 0.4, eff: 0.03, trades: 194, risk: '$301', wr: 72.7, bear2022: null, link: '/options/spx' },
]

function fmt(n) {
  if (n == null) return '—'
  if (n >= 0) return '$' + n.toLocaleString()
  return '-$' + Math.abs(n).toLocaleString()
}

export default function MasterPage() {
  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.6rem', marginBottom: '1.5rem' }}>🏆 Master Ranking</h1>

      {/* Warning */}
      <p style={{ color: '#fbbf24', fontSize: '0.82rem', marginBottom: '1.5rem', padding: '0.75rem 1rem', background: 'rgba(251,191,36,0.08)', borderRadius: 6, border: '1px solid rgba(251,191,36,0.15)' }}>
        ⚠️ All strategies are LONG-only. Backtest 2021–2025 (4 bull years, 1 bear). Results inflated by bull market.
      </p>

      {/* Single Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #3f3f46' }}>
              <th style={{ padding: '0.6rem 0.4rem', textAlign: 'left' }}>#</th>
              <th style={{ padding: '0.6rem 0.4rem', textAlign: 'left' }}>Strategy</th>
              <th style={{ padding: '0.6rem 0.4rem', textAlign: 'right' }}>Risk/Trade</th>
              <th style={{ padding: '0.6rem 0.4rem', textAlign: 'right' }}>Trades</th>
              <th style={{ padding: '0.6rem 0.4rem', textAlign: 'right' }}>WR%</th>
              <th style={{ padding: '0.6rem 0.4rem', textAlign: 'right' }}>PnL @$200</th>
              <th style={{ padding: '0.6rem 0.4rem', textAlign: 'right' }}>DD @$200</th>
              <th style={{ padding: '0.6rem 0.4rem', textAlign: 'right' }}>Ret/DD</th>
              <th style={{ padding: '0.6rem 0.4rem', textAlign: 'right', color: '#4ade80', fontWeight: 700 }}>$/$ Risked</th>
              <th style={{ padding: '0.6rem 0.4rem', textAlign: 'right' }}>2022 Bear</th>
            </tr>
          </thead>
          <tbody>
            {STRATEGIES.map((s, i) => {
              const effColor = s.eff >= 0.5 ? '#4ade80' : s.eff >= 0.2 ? '#fbbf24' : '#f87171'
              const bearColor = s.bear2022 == null ? '#52525b' : s.bear2022 >= 0 ? '#4ade80' : '#f87171'
              const rowBg = s.focus ? 'rgba(74,222,128,0.07)' : 'transparent'
              return (
                <tr key={s.name} style={{ borderBottom: '1px solid #27272a', background: rowBg }}>
                  <td style={{ padding: '0.5rem 0.4rem', color: '#71717a' }}>{i + 1}</td>
                  <td style={{ padding: '0.5rem 0.4rem', fontWeight: s.focus ? 700 : 400 }}>
                    {s.focus && '▶ '}<Link to={s.link} style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: '#52525b' }}>{s.name}</Link>
                  </td>
                  <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right', color: '#a1a1aa' }}>{s.risk}</td>
                  <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right', color: '#a1a1aa' }}>{s.trades}</td>
                  <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right' }}>{s.wr}%</td>
                  <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right', color: '#4ade80', fontWeight: 600 }}>{fmt(s.flatPnl)}</td>
                  <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right', color: '#f87171' }}>{fmt(s.flatDD)}</td>
                  <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right', color: s.retDD >= 10 ? '#4ade80' : s.retDD >= 3 ? '#fbbf24' : '#f87171', fontWeight: 600 }}>
                    {s.retDD}x
                  </td>
                  <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 700, color: effColor }}>
                    ${s.eff.toFixed(2)}
                  </td>
                  <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right', color: bearColor }}>
                    {s.bear2022 != null ? fmt(s.bear2022) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footnote */}
      <p style={{ color: '#71717a', fontSize: '0.75rem', marginTop: '0.75rem' }}>
        * Switcher compounds (2% of capital). "PnL @$200" and "$/$ Risked" use flat $200/trade R-multiple math for fair comparison.
      </p>

      {/* My 4 */}
      <div style={{ marginTop: '2.5rem', padding: '1.25rem', background: 'rgba(74,222,128,0.06)', borderRadius: 10, border: '2px solid rgba(74,222,128,0.3)' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#4ade80' }}>▶ Active Focus (Trading These)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
          <div>
            <strong>1. BT5 LIVE</strong>
            <p style={{ color: '#a1a1aa', fontSize: '0.85rem', margin: '0.3rem 0 0' }}>
              $0.80/$. Most efficient. Rare trades (128/5yr). Patient swing on mega-caps.
            </p>
          </div>
          <div>
            <strong>2. Strategy Switcher</strong>
            <p style={{ color: '#a1a1aa', fontSize: '0.85rem', margin: '0.3rem 0 0' }}>
              $0.74/$, 20x Ret/DD. Most trades (572). +$16.8K in 2022 bear. Rotates to beaten-down strategy.
            </p>
          </div>
          <div>
            <strong>3. Overnight + Factor</strong>
            <p style={{ color: '#a1a1aa', fontSize: '0.85rem', margin: '0.3rem 0 0' }}>
              $0.26/$. Different timeframe (daily). Tiny DD ($590). Uncorrelated to swing strategies.
            </p>
          </div>
          <div>
            <strong>4. BT6 IWM Rotation</strong>
            <p style={{ color: '#a1a1aa', fontSize: '0.85rem', margin: '0.3rem 0 0' }}>
              $0.33/$. Small/mid-cap growth rotation. Diversifies away from mega-cap. Same breakout framework as BT5.
            </p>
          </div>
        </div>
      </div>

      {/* Definitions */}
      <div style={{ marginTop: '2rem', color: '#52525b', fontSize: '0.75rem', lineHeight: 1.8 }}>
        <p><strong>$/$ Risked</strong> = Total PnL ÷ (Risk/Trade × Trades). How much you earn per dollar put at risk.</p>
        <p><strong>Ret/DD</strong> = PnL ÷ Max Drawdown. Reward per unit of worst pain.</p>
        <p><strong>2022 Bear</strong> = PnL from Jan–Oct 2022 (SPX -25%). Shows if strategy survives downturns.</p>
      </div>
    </div>
  )
}
