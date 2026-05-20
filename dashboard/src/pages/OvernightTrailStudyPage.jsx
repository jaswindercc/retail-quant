import DrawdownChart from '../components/DrawdownChart'
import MonthlyChart from '../components/MonthlyChart'
import { buildEquityCurve, buildDrawdownSeries, buildMonthlyReturns, fmt$ } from '../utils'
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useState } from 'react'

const COLORS = { vanilla: '#8e8e9a', trail3d: '#f59e0b', forever: '#4ade80' }
const LABELS = { vanilla: 'Vanilla (1d)', trail3d: 'Trail 3d', forever: 'Trail Forever' }

export default function OvernightTrailStudyPage({ data }) {
  if (!data) return <p>Loading…</p>

  const { configs, holdComparison, spxPrices } = data
  if (!configs || !configs.length) return <p>Loading…</p>

  const [selected, setSelected] = useState('forever')

  // Build equity curves for all 3 configs
  const equities = {}
  const cfgMap = {}
  configs.forEach(cfg => {
    cfgMap[cfg.key] = cfg
    const sorted = (cfg.trades || []).sort((a, b) => a.exitDate.localeCompare(b.exitDate))
    equities[cfg.key] = buildEquityCurve(sorted)
  })

  // Combined chart data
  const dateMap = {}
  ;(spxPrices || []).forEach(p => { dateMap[p.date] = { date: p.date, spx: p.close } })
  Object.entries(equities).forEach(([key, curve]) => {
    curve.forEach(p => {
      if (!dateMap[p.date]) dateMap[p.date] = { date: p.date }
      dateMap[p.date][key] = p.equity
    })
  })
  const combined = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date))
  const lastVals = {}
  combined.forEach(row => {
    Object.keys(equities).forEach(key => {
      if (row[key] !== undefined) lastVals[key] = row[key]
      else row[key] = lastVals[key] || 0
    })
  })

  // Selected config
  const sel = cfgMap[selected] || configs[0]
  const selTrades = (sel.trades || []).sort((a, b) => a.exitDate.localeCompare(b.exitDate))
  const selDD = buildDrawdownSeries(selTrades)
  const selMonthly = buildMonthlyReturns(selTrades)

  return (
    <div>
      <h2>SPX Overnight — Trail Stop Study</h2>
      <p style={{color:'#b0b0b8', marginBottom:16}}>
        Vanilla = unfiltered baseline. Trail configs add SMA50 + pause filter + trailing stop.
      </p>

      {/* Toggle Buttons */}
      <div style={{display:'flex', gap:8, marginBottom:20}}>
        {configs.map(cfg => (
          <button key={cfg.key} onClick={() => setSelected(cfg.key)}
            style={{
              padding:'10px 20px', borderRadius:8, border:'none', cursor:'pointer', fontWeight:700,
              background: selected === cfg.key ? COLORS[cfg.key] : '#1e293b',
              color: selected === cfg.key ? '#000' : COLORS[cfg.key],
              opacity: selected === cfg.key ? 1 : 0.7,
            }}>
            {LABELS[cfg.key] || cfg.name}
          </button>
        ))}
      </div>

      {/* Strategy Rules — changes with selected config */}
      <div className="card">
        <h3 style={{color: COLORS[selected]}}>Strategy Rules — {LABELS[selected]}</h3>
        <table>
          <thead><tr><th>Rule</th><th>Value</th></tr></thead>
          <tbody>
            <tr><td><strong>Entry Signal</strong></td><td>Score ≥ 3 (multi-factor bullish)</td></tr>
            {selected !== 'vanilla' && <tr><td><strong>Regime Filter</strong></td><td>SPX {'>'} SMA(50) — only trade in uptrends</td></tr>}
            {selected !== 'vanilla' && <tr><td><strong>Pause Filter</strong></td><td>After 2 consecutive losses, skip until next win</td></tr>}
            {selected !== 'vanilla' && <tr><td><strong>Trail Activation</strong></td><td>After +1.5R profit reached</td></tr>}
            {selected !== 'vanilla' && <tr><td><strong>Trail Distance</strong></td><td>1.5 × ATR(14) from highest close</td></tr>}
            {selected === 'vanilla' && <tr><td><strong>Exit</strong></td><td>Next day close (1-day hold)</td></tr>}
            {selected === 'trail3d' && <tr><td><strong>Exit</strong></td><td>Trail stop hit OR 3-day time exit (whichever first)</td></tr>}
            {selected === 'forever' && <tr><td><strong>Exit</strong></td><td>Trail stop only — no time limit</td></tr>}
            <tr><td><strong>Risk</strong></td><td>$100 per trade (0.5×ATR stop distance)</td></tr>
          </tbody>
        </table>
      </div>

      {/* Comparison Table */}
      <div className="card">
        <h3>Config Comparison</h3>
        <table>
          <thead>
            <tr><th>Config</th><th>Trades</th><th>Win%</th><th>PF</th><th>P&L</th><th>Max DD</th><th>Avg R</th><th>Avg Hold</th><th>P&L/DD</th></tr>
          </thead>
          <tbody>
            {configs.map(cfg => {
              const s = cfg.stats
              const rtd = s.maxDrawdown > 0 ? (s.totalPnl / s.maxDrawdown).toFixed(1) : '∞'
              return (
                <tr key={cfg.key} style={{background: cfg.key === selected ? '#1e293b' : 'transparent', cursor:'pointer'}} onClick={() => setSelected(cfg.key)}>
                  <td><strong style={{color: COLORS[cfg.key]}}>{LABELS[cfg.key] || cfg.name}</strong></td>
                  <td>{s.trades}</td>
                  <td>{s.winRate}%</td>
                  <td>{s.profitFactor}</td>
                  <td style={{color:'#4ade80'}}>{fmt$(s.totalPnl)}</td>
                  <td style={{color: s.maxDrawdown > 1100 ? '#f59e0b' : '#4ade80'}}>{fmt$(s.maxDrawdown)}</td>
                  <td>{s.avgR}</td>
                  <td>{s.avgDuration}d</td>
                  <td style={{fontWeight:700}}>{rtd}×</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* All Equity Curves */}
      <div className="card">
        <h3>Equity Curves</h3>
        <ResponsiveContainer width="100%" height={380}>
          <ComposedChart data={combined} margin={{ top: 5, right: 50, bottom: 30, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3a" />
            <XAxis dataKey="date" tick={{ fill: '#8e8e9a', fontSize: 11 }} tickFormatter={d => d.slice(2, 7)} />
            <YAxis yAxisId="eq" tick={{ fill: '#8e8e9a', fontSize: 11 }} tickFormatter={v => `$${v}`} />
            <YAxis yAxisId="spx" orientation="right" tick={{ fill: '#555', fontSize: 10 }} tickFormatter={v => v.toLocaleString()} />
            <Tooltip
              contentStyle={{ background: '#1a1d28', border: '1px solid #2a2d3a', borderRadius: 8 }}
              labelStyle={{ color: '#8e8e9a' }}
              formatter={(v, name) => name === 'SPX' ? [v?.toLocaleString(), name] : [`$${(v||0).toFixed(0)}`, name]}
            />
            <Legend />
            <Area yAxisId="spx" type="monotone" dataKey="spx" name="SPX" stroke="#555" fill="#2a2d3a" fillOpacity={0.3} dot={false} />
            <Line yAxisId="eq" type="monotone" dataKey="vanilla" name="Vanilla (1d)" stroke={COLORS.vanilla} strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
            <Line yAxisId="eq" type="monotone" dataKey="trail3d" name="Trail 3d" stroke={COLORS.trail3d} strokeWidth={2} dot={false} />
            <Line yAxisId="eq" type="monotone" dataKey="forever" name="Trail Forever" stroke={COLORS.forever} strokeWidth={2.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Hold Duration Table */}
      {holdComparison && holdComparison.length > 0 && (
      <div className="card">
        <h3>Hold Duration Breakdown</h3>
        <table>
          <thead>
            <tr><th>Max Hold</th><th>Trades</th><th>Win%</th><th>PF</th><th>P&L</th><th>Max DD</th><th>Avg R</th><th>Avg Hold</th><th>P&L/DD</th></tr>
          </thead>
          <tbody>
            {holdComparison.map(h => {
              const rtd = h.maxDrawdown > 0 ? (h.totalPnl / h.maxDrawdown).toFixed(1) : '∞'
              return (
                <tr key={h.maxDays}>
                  <td><strong>{h.label}</strong></td>
                  <td>{h.trades}</td>
                  <td>{h.winRate}%</td>
                  <td>{h.profitFactor}</td>
                  <td style={{color:'#4ade80'}}>{fmt$(h.totalPnl)}</td>
                  <td style={{color: h.maxDrawdown > 2000 ? '#f87171' : h.maxDrawdown > 1100 ? '#f59e0b' : '#4ade80'}}>{fmt$(h.maxDrawdown)}</td>
                  <td>{h.avgR}</td>
                  <td>{h.avgDuration}d</td>
                  <td style={{fontWeight:700}}>{rtd}×</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      )}

      {/* Drawdown for selected */}
      <div className="card">
        <h3 style={{color: COLORS[selected]}}>Drawdown — {LABELS[selected]}</h3>
        <DrawdownChart data={selDD.series} />
      </div>

      {/* Monthly Returns for selected */}
      <div className="card">
        <h3 style={{color: COLORS[selected]}}>Monthly Returns — {LABELS[selected]}</h3>
        <MonthlyChart data={selMonthly} />
      </div>

      {/* Trade Log for selected */}
      <div className="card">
        <h3 style={{color: COLORS[selected]}}>Trade Log — {LABELS[selected]} ({selTrades.length} trades)</h3>
        <div style={{overflowX:'auto', maxHeight:500}}>
          <table>
            <thead>
              <tr><th>Entry</th><th>Exit</th><th>Entry$</th><th>Exit$</th><th>Days</th><th>P&L</th><th>R</th><th>Exit Reason</th><th>Score</th><th>Signals</th></tr>
            </thead>
            <tbody>
              {[...selTrades].reverse().map((t, i) => (
                <tr key={i}>
                  <td>{t.entryDate}</td>
                  <td>{t.exitDate}</td>
                  <td>{t.entryPrice}</td>
                  <td>{t.exitPrice}</td>
                  <td>{t.durationDays}</td>
                  <td className={t.pnlDollar >= 0 ? 'win' : 'loss'}>{fmt$(t.pnlDollar)}</td>
                  <td className={t.pnlR >= 0 ? 'win' : 'loss'}>{t.pnlR > 0 ? '+' : ''}{t.pnlR}R</td>
                  <td>{t.exitReason}</td>
                  <td><strong>{t.score > 0 ? '+' : ''}{t.score}</strong></td>
                  <td style={{fontSize:12, color:'#8e8e9a', maxWidth:260}}>{(t.reasonsBull || []).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Learnings */}
      <div className="card" style={{borderLeft:'3px solid #f59e0b'}}>
        <h3>📝 Overnight Learnings</h3>
        <ul style={{lineHeight:2, color:'#d1d1d8'}}>
          <li><strong>Trail Forever is king</strong> — $20K P&L, $1,045 DD, 19.3× P&L/DD. Let winners run.</li>
          <li>Trail 3d is the conservative option — 2× vanilla P&L, controlled hold time.</li>
          <li>SMA50 filter is non-negotiable. Without it, trail amplifies losses in bear markets.</li>
          <li>When BOTH stocks AND bonds are falling, overnight longs fail. SPX {'>'} SMA50 catches most of those.</li>
        </ul>
      </div>
    </div>
  )
}
