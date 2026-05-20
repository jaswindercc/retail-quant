import React from 'react'
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { computeMetrics, fmt$ } from '../utils'

const GROUPS = [
  { label: '🟢 Uptrending', color: '#4ade80', stocks: ['SPY', 'AAPL', 'MSFT', 'GOOGL', 'NVDA'] },
  { label: '🔵 Range / Breakout', color: '#3b82f6', stocks: ['ADBE', 'CRM', 'AMD'] },
  { label: '🔴 Downtrend / Volatile', color: '#ef4444', stocks: ['BA', 'SNOW', 'TSLA', 'META'] },
]

const STOCK_META = {
  SPY: { desc: 'S&P 500 ETF — benchmark' },
  AAPL: { desc: 'Consistent grinder, shallow pullbacks' },
  ADBE: { desc: 'Sideways chop since 2021 highs' },
  AMD: { desc: 'Big swings, strong trend when moving' },
  BA: { desc: 'Multi-year decline, choppy recovery' },
  CRM: { desc: 'Long base then strong breakout' },
  GOOGL: { desc: 'Steady compounding, moderate vol' },
  META: { desc: 'Crashed 75%, recovered 5x' },
  MSFT: { desc: 'Low volatility, consistent climber' },
  NVDA: { desc: 'Monster parabolic run' },
  SNOW: { desc: 'IPO highs → prolonged decline' },
  TSLA: { desc: 'Massive swings in both directions' },
}

const STRAT_INFO = [
  { key: 'tr', label: 'Trend Rider', color: '#4caf50' },
  { key: 'bn', label: 'MA Bounce', color: '#2196f3' },
  { key: 'br', label: 'Breakout', color: '#ff9800' },
  { key: 'rsi', label: 'RSI Trend', color: '#e040fb' },
  { key: 'mr', label: 'Mean Rev', color: '#ff5252' },
  { key: 'tl', label: 'Trendline', color: '#00bcd4' },
  { key: 'sr', label: 'S/R Bounce', color: '#8bc34a' },
  { key: 'fvg', label: 'FVG', color: '#ffeb3b' },
  { key: 'vcp', label: 'VCP', color: '#9c27b0' },
  { key: 'vol', label: 'Volume', color: '#ff7043' },
]

function normalizeToPercent(prices) {
  if (!prices || prices.length === 0) return []
  const first = prices[0].close
  return prices.filter((_, i) => i % 5 === 0).map(p => ({
    date: p.date,
    pct: ((p.close - first) / first * 100).toFixed(1)
  }))
}

function MiniChart({ prices, color }) {
  const data = normalizeToPercent(prices)
  return (
    <ResponsiveContainer width="100%" height={100}>
      <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
        <XAxis dataKey="date" hide />
        <YAxis hide domain={['dataMin', 'dataMax']} />
        <Tooltip
          contentStyle={{ background: '#1a1d28', border: '1px solid #2a2d3a', borderRadius: 6, fontSize: 12 }}
          labelStyle={{ color: '#8e8e9a' }}
          formatter={(v) => [`${v}%`, 'Return']}
        />
        <Line type="monotone" dataKey="pct" stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function getStockPnl(allData, symbol) {
  return STRAT_INFO.map(st => {
    const trades = (allData[st.key]?.stocks?.[symbol]?.trades || []).filter(t => t.exitDate)
    const m = computeMetrics(trades)
    return { ...st, pnl: m?.totalPnl ?? 0, trades: trades.length, wr: m?.winRate ?? 0 }
  })
}

export default function StocksOverviewPage({ data, allData }) {
  if (!data || !allData) return <div className="loading">Loading…</div>

  // Compute group-level stats: avg P&L per strategy per group
  const groupStats = GROUPS.map(group => {
    const stratAvgs = STRAT_INFO.map(st => {
      const pnls = group.stocks.map(symbol => {
        const trades = (allData[st.key]?.stocks?.[symbol]?.trades || []).filter(t => t.exitDate)
        const m = computeMetrics(trades)
        return m?.totalPnl ?? 0
      })
      const avg = pnls.reduce((a, b) => a + b, 0) / pnls.length
      const positive = pnls.filter(p => p > 0).length
      return { ...st, avgPnl: avg, positive, total: pnls.length }
    }).sort((a, b) => b.avgPnl - a.avgPnl)
    return { ...group, stratAvgs, best: stratAvgs[0], worst: stratAvgs[stratAvgs.length - 1] }
  })

  return (
    <div>
      <h1 className="page-title">Stock Universe <span>12 stocks · Jan 2021 – Present</span></h1>

      <div className="card">
        <h3>Why These 12?</h3>
        <p style={{ color: 'var(--muted)', fontSize: '0.95rem', lineHeight: 1.7, margin: 0 }}>
          We intentionally picked stocks that cover <strong>every market regime</strong> — steady uptrends (AAPL, MSFT, NVDA),
          range-bound / breakout plays (ADBE, CRM, AMD), and downtrends / high volatility (BA, SNOW, TSLA, META).
          If a strategy works across all groups, it's robust.
        </p>
      </div>

      {/* ── STRATEGY × REGIME SUMMARY ── */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', border: '2px solid var(--blue)' }}>
        <h3 style={{ color: 'var(--blue)', margin: '0 0 16px' }}>Which Strategy Works Where?</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
          {groupStats.map(g => (
            <div key={g.label} style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 8, borderLeft: `3px solid ${g.color}` }}>
              <h4 style={{ margin: '0 0 10px', color: g.color, fontSize: 15 }}>{g.label}</h4>
              <div style={{ fontSize: 13, color: '#d1d1d8', lineHeight: 1.8 }}>
                <p style={{ margin: '0 0 8px' }}>
                  <strong style={{ color: '#fff' }}>Best:</strong>{' '}
                  <span style={{ color: g.best.color, fontWeight: 700 }}>{g.best.label}</span>{' '}
                  — avg <span className="win">{fmt$(g.best.avgPnl)}</span>/stock
                  ({g.best.positive}/{g.best.total} profitable)
                </p>
                <p style={{ margin: '0 0 8px' }}>
                  <strong style={{ color: '#fff' }}>Worst:</strong>{' '}
                  <span style={{ color: g.worst.color }}>{g.worst.label}</span>{' '}
                  — avg <span className={g.worst.avgPnl >= 0 ? 'win' : 'loss'}>{fmt$(g.worst.avgPnl)}</span>/stock
                </p>
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
                  Top 3: {g.stratAvgs.slice(0, 3).map((s, i) => (
                    <span key={s.key}>{i > 0 && ' · '}<span style={{ color: s.color }}>{s.label}</span> ({fmt$(s.avgPnl)})</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Key takeaways */}
        <div style={{ marginTop: 20, padding: 16, background: 'rgba(0,230,118,0.06)', borderRadius: 8, border: '1px solid rgba(0,230,118,0.2)' }}>
          <h4 style={{ margin: '0 0 10px', color: '#00e676', fontSize: 14 }}>Key Takeaways</h4>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#d1d1d8', lineHeight: 2 }}>
            <li><strong>Uptrending stocks</strong> — almost any strategy works. The trend does the heavy lifting. MA Bounce and Breakout typically lead because they fire the most trades in clean trends.</li>
            <li><strong>Range-bound / breakout stocks</strong> — trend-following entries (Trend Rider, RSI) struggle with false signals. Breakout and Mean Reversion tend to do better by catching the eventual move or fading the range.</li>
            <li><strong>Downtrending / volatile stocks</strong> — this is where strategies separate. Most lose money or barely break even. Strategies that cut losses quickly (short avg duration) survive better. If a strategy is profitable here, it's genuinely robust.</li>
            <li><strong>The universal truth:</strong> your exit (trailing EMA at 2.5R) matters more than your entry. Even in downtrends, the trailing stop prevents catastrophic losses.</li>
          </ul>
        </div>
      </div>

      {GROUPS.map(group => (
        <div key={group.label} style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, margin: '0 0 12px', color: group.color }}>{group.label}</h2>

          {group.stocks.map(symbol => {
            const prices = data.stocks?.[symbol]?.prices || []
            const firstPrice = prices[0]?.close
            const lastPrice = prices[prices.length - 1]?.close
            const totalReturn = firstPrice ? ((lastPrice - firstPrice) / firstPrice * 100).toFixed(1) : 0
            const stratPnls = getStockPnl(allData, symbol)
            const best = stratPnls.reduce((a, b) => a.pnl > b.pnl ? a : b)

            return (
              <div key={symbol} className="card" style={{ padding: 16, margin: '0 0 12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, alignItems: 'start' }}>
                  {/* Left: chart + info */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                      <h3 style={{ margin: 0, fontSize: 16, textTransform: 'none', letterSpacing: 0 }}>{symbol}</h3>
                      <span style={{ fontSize: 14, fontWeight: 700, color: totalReturn >= 0 ? '#4ade80' : '#ef4444' }}>
                        {totalReturn >= 0 ? '+' : ''}{totalReturn}%
                      </span>
                    </div>
                    <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--muted)' }}>{STOCK_META[symbol]?.desc}</p>
                    <MiniChart prices={prices} color={group.color} />
                  </div>

                  {/* Right: strategy P&L table */}
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ fontSize: 13, width: '100%' }}>
                      <thead>
                        <tr>
                          <th>Strategy</th><th>Trades</th><th>Win%</th><th>P&L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stratPnls.sort((a, b) => b.pnl - a.pnl).map(st => (
                          <tr key={st.key} style={st.key === best.key ? { background: 'rgba(0,230,118,0.06)' } : {}}>
                            <td style={{ color: st.color, fontWeight: st.key === best.key ? 700 : 400 }}>{st.label}</td>
                            <td>{st.trades}</td>
                            <td>{st.wr}%</td>
                            <td className={st.pnl >= 0 ? 'win' : 'loss'} style={{ fontWeight: 600 }}>{fmt$(st.pnl)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
