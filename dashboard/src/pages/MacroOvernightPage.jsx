import { buildEquityCurve, buildDrawdownSeries, buildMonthlyReturns, fmt$ } from '../utils'
import DrawdownChart from '../components/DrawdownChart'
import MonthlyChart from '../components/MonthlyChart'
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useState } from 'react'

export default function MacroOvernightPage({ data }) {
  if (!data) return <p>Loading…</p>

  const { configs, spxPrices } = data
  if (!configs || !configs.length) return <p>No configs found</p>

  const [selected, setSelected] = useState('or_ief')

  // Build equity curves for all configs
  const equities = {}
  configs.forEach(cfg => {
    equities[cfg.key] = buildEquityCurve(
      cfg.trades.sort((a, b) => a.exitDate.localeCompare(b.exitDate))
    )
  })

  // Build combined chart: all equity curves + SPX
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

  // Selected config details
  const selCfg = configs.find(c => c.key === selected) || configs[0]
  const selTrades = (selCfg.trades || []).sort((a, b) => a.exitDate.localeCompare(b.exitDate))
  const selDD = buildDrawdownSeries(selTrades)
  const selMonthly = buildMonthlyReturns(selTrades)

  const colors = {
    vanilla: '#8e8e9a',
    sma50: '#f59e0b',
    or_ief: '#4ade80',
    or_tlt: '#60a5fa',
    no_yield_spike: '#a78bfa',
  }

  return (
    <div>
      <h2>SPX Overnight — Macro Study</h2>
      <p style={{color:'#b0b0b8', marginBottom:16}}>
        Do bonds/rates improve overnight entry rules? Same signal scoring (score ≥ 3), testing macro filters.
      </p>

      {/* Comparison Table */}
      <div className="card">
        <h3>Filter Comparison</h3>
        <table>
          <thead>
            <tr>
              <th>Config</th><th>Trades</th><th>Win%</th><th>PF</th>
              <th>P&L</th><th>Max DD</th><th>Avg R</th><th>P&L/DD</th>
            </tr>
          </thead>
          <tbody>
            {configs.map(cfg => {
              const s = cfg.stats
              const isBest = cfg.key === 'sma50'
              return (
                <tr key={cfg.key}
                  style={{
                    cursor: 'pointer',
                    background: cfg.key === selected ? '#1e293b' : 'transparent',
                    borderLeft: cfg.key === selected ? '3px solid #4ade80' : '3px solid transparent'
                  }}
                  onClick={() => setSelected(cfg.key)}>
                  <td><strong style={{color: colors[cfg.key] || '#fff'}}>{cfg.name}</strong></td>
                  <td>{s.trades}</td>
                  <td>{s.winRate}%</td>
                  <td style={{color: isBest ? '#4ade80' : undefined}}>{s.profitFactor}</td>
                  <td>{fmt$(s.totalPnl)}</td>
                  <td style={{color: s.maxDrawdown <= 700 ? '#4ade80' : s.maxDrawdown > 1100 ? '#f87171' : '#f59e0b'}}>
                    {fmt$(s.maxDrawdown)}
                  </td>
                  <td>{s.avgR}</td>
                  <td style={{fontWeight: 700, color: s.returnToDD >= 8 ? '#4ade80' : s.returnToDD >= 5 ? '#f59e0b' : '#8e8e9a'}}>
                    {s.returnToDD}×
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p style={{color:'#8e8e9a', fontSize:12, marginTop:8}}>Click a row to see its details below.</p>
      </div>

      {/* All Equity Curves */}
      <div className="card">
        <h3>Equity Curves — All Configs</h3>
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
            <Line yAxisId="eq" type="monotone" dataKey="vanilla" name="Vanilla" stroke="#8e8e9a" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
            <Line yAxisId="eq" type="monotone" dataKey="sma50" name="SMA50" stroke="#f59e0b" strokeWidth={2} dot={false} />
            <Line yAxisId="eq" type="monotone" dataKey="or_ief" name="SMA50 OR IEF" stroke="#4ade80" strokeWidth={2.5} dot={false} />
            <Line yAxisId="eq" type="monotone" dataKey="or_tlt" name="SMA50 OR TLT" stroke="#60a5fa" strokeWidth={1.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Selected Config Details */}
      <div className="card">
        <h3 style={{color: colors[selected] || '#fff'}}>
          {selCfg.name} — Details
        </h3>
        <p style={{color:'#8e8e9a', fontSize:13, marginBottom:12}}>{selCfg.rule}</p>

        <div style={{display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap:10, marginBottom:20}}>
          {[
            ['Trades', selCfg.stats.trades],
            ['Win%', selCfg.stats.winRate + '%'],
            ['PF', selCfg.stats.profitFactor],
            ['P&L', fmt$(selCfg.stats.totalPnl)],
            ['Max DD', fmt$(selCfg.stats.maxDrawdown)],
            ['P&L/DD', selCfg.stats.returnToDD + '×'],
          ].map(([label, val]) => (
            <div key={label} style={{textAlign:'center', padding:'8px 4px', background:'#1a1d28', borderRadius:8}}>
              <div style={{color:'#8e8e9a', fontSize:11}}>{label}</div>
              <div style={{fontSize:18, fontWeight:700}}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Drawdown for selected */}
      <div className="card">
        <h3>Drawdown — {selCfg.name}</h3>
        <DrawdownChart data={selDD.series} />
      </div>

      {/* Monthly Returns for selected */}
      <div className="card">
        <h3>Monthly Returns — {selCfg.name}</h3>
        <MonthlyChart data={selMonthly} />
      </div>

      {/* Trade Log for selected */}
      <div className="card">
        <h3>Trade Log — {selCfg.name} ({selTrades.length} trades)</h3>
        <div style={{overflowX:'auto', maxHeight:500}}>
          <table>
            <thead>
              <tr><th>Entry</th><th>Exit</th><th>Entry$</th><th>Exit$</th><th>P&L</th><th>R</th><th>Score</th><th>Signals</th></tr>
            </thead>
            <tbody>
              {[...selTrades].reverse().map((t, i) => (
                <tr key={i}>
                  <td>{t.entryDate}</td>
                  <td>{t.exitDate}</td>
                  <td>{t.entryPrice}</td>
                  <td>{t.exitPrice}</td>
                  <td className={t.pnlDollar >= 0 ? 'win' : 'loss'}>{fmt$(t.pnlDollar)}</td>
                  <td className={t.pnlR >= 0 ? 'win' : 'loss'}>{t.pnlR > 0 ? '+' : ''}{t.pnlR}R</td>
                  <td><strong>{t.score > 0 ? '+' : ''}{t.score}</strong></td>
                  <td style={{fontSize:12, color:'#8e8e9a', maxWidth:260}}>{(t.reasons || []).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Learnings */}
      <div className="card" style={{marginTop:20, borderLeft:'3px solid #60a5fa'}}>
        <h3>📝 Macro Study Findings</h3>
        <ul style={{lineHeight:2, color:'#d1d1d8'}}>
          <li><strong>SPX {'>'} SMA50 alone = best risk-adjusted (8.7× P&L/DD).</strong> Stock trend is the strongest filter.</li>
          <li><strong>Adding IEF (7-10Y bonds) via OR logic</strong> catches ~39 more trades in pullbacks. Slightly more DD but more P&L.</li>
          <li>Bonds trending UP (IEF {'>'} SMA20) means rates are stable/falling — safe to buy overnight dips even if SPX is below SMA50.</li>
          <li><strong>When BOTH stocks AND bonds are in downtrends → don't trade.</strong> That's the real edge from macro.</li>
        </ul>
      </div>
    </div>
  )
}
