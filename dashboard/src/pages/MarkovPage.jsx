import { useState, useEffect } from 'react'
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts'
import { fetchJson } from '../utils'

export default function MarkovPage() {
  const [data, setData] = useState(null)

  useEffect(() => {
    fetchJson(`${import.meta.env.BASE_URL}markov_data.json`)
      .then(setData)
      .catch(() => setData({ error: true }))
  }, [])

  if (!data) return <div className="loading">Loading Markov analysis…</div>
  if (data.error) return <div className="card"><p>Failed to load markov_data.json</p></div>

  const { metadata, transitionMatrix, chiSquare, significant, streaks, strategies } = data
  const baseline = strategies.find(s => s.name.includes('Baseline'))
  const best = strategies.reduce((a, b) => a.totalPnl > b.totalPnl && a.name !== baseline?.name ? a : (b.totalPnl > a.totalPnl && b.name !== baseline?.name ? b : a))

  // Sizing stats (dynamic from data)
  const sizingFlat = data.sizing?.find(s => s.name.includes('Flat')) || data.sizing?.[0]
  const sizingMarkov = data.sizing?.find(s => s.name.includes('Markov')) || data.sizing?.[1]
  const sizingPnl = sizingMarkov?.totalPnl || 0
  const sizingDD = sizingMarkov?.maxDD || 0
  const flatPnl = sizingFlat?.totalPnl || 1
  const flatDD = sizingFlat?.maxDD || 0
  const pctBetter = flatPnl ? Math.round((sizingPnl - flatPnl) / flatPnl * 100) : 0
  const ddRatioMarkov = sizingPnl ? (sizingDD / sizingPnl * 100).toFixed(1) : '0'
  const ddRatioFlat = flatPnl ? (flatDD / flatPnl * 100).toFixed(1) : '0'

  return (
    <div>
      <h1 className="page-title">Markov Chain Analysis <span>SPX Overnight · {metadata.totalTrades} trades · Can streaks predict the next trade?</span></h1>

      {/* Key Finding */}
      <div className="card" style={{ border: '2px solid #ffd700', background: 'linear-gradient(135deg, #1a1a2e 0%, #1b2838 100%)' }}>
        <h3 style={{ color: '#ffd700', margin: '0 0 0.75rem' }}>💡 Simple Rule — Lower Drawdown + More Profit</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: '1rem' }}>
          <div style={{ background: '#0d1b2a', borderRadius: 8, padding: '1rem', border: '1px solid #4ade8044', textAlign: 'center' }}>
            <div style={{ color: '#ef5350', fontWeight: 700, fontSize: '1.3rem' }}>After a LOSS</div>
            <div style={{ color: '#4ade80', fontSize: '1.5rem', fontWeight: 800, margin: '0.25rem 0' }}>Risk $125</div>
            <div style={{ color: '#888', fontSize: '0.8rem' }}>1.25× base (bounce-back likely)</div>
          </div>
          <div style={{ background: '#0d1b2a', borderRadius: 8, padding: '1rem', border: '1px solid #64748b44', textAlign: 'center' }}>
            <div style={{ color: '#4ade80', fontWeight: 700, fontSize: '1.3rem' }}>After a WIN</div>
            <div style={{ color: '#ccc', fontSize: '1.5rem', fontWeight: 800, margin: '0.25rem 0' }}>Risk $100</div>
            <div style={{ color: '#888', fontSize: '0.8rem' }}>Normal base risk</div>
          </div>
          <div style={{ background: '#0d1b2a', borderRadius: 8, padding: '1rem', border: '1px solid #ef535044', textAlign: 'center' }}>
            <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: '1.3rem' }}>After 2 WINS</div>
            <div style={{ color: '#ef5350', fontSize: '1.5rem', fontWeight: 800, margin: '0.25rem 0' }}>Risk $75</div>
            <div style={{ color: '#888', fontSize: '0.8rem' }}>0.75× base (exhaustion likely)</div>
          </div>
        </div>
        <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#1a2744', borderRadius: 8, display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#888', fontSize: '0.75rem' }}>Total PnL</div>
            <div style={{ color: '#4ade80', fontWeight: 700 }}>${sizingPnl.toLocaleString()} <span style={{ color: '#888', fontSize: '0.8rem' }}>(+{pctBetter}% vs flat)</span></div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#888', fontSize: '0.75rem' }}>Max Drawdown</div>
            <div style={{ color: '#4ade80', fontWeight: 700 }}>-${sizingDD.toLocaleString()} <span style={{ color: '#888', fontSize: '0.8rem' }}>(vs -${flatDD.toLocaleString()} flat)</span></div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#888', fontSize: '0.75rem' }}>DD / Profit</div>
            <div style={{ color: '#4ade80', fontWeight: 700 }}>{ddRatioMarkov}% <span style={{ color: '#888', fontSize: '0.8rem' }}>(vs {ddRatioFlat}% flat)</span></div>
          </div>
        </div>
        <p style={{ color: '#71717a', fontSize: '0.75rem', margin: '0.75rem 0 0' }}>
          More profit, lower drawdown, only ±25% size adjustment. Conservative and safe to try live.
        </p>
      </div>

      {/* Transition Matrix */}
      <div className="card">
        <h3>Transition Matrix</h3>
        <p style={{ color: '#a1a1aa', fontSize: '0.85rem', marginTop: -8 }}>
          Probability of next outcome given previous outcome. If trades were independent, both rows would equal {metadata.baselineWinRate}%.
        </p>
        <table>
          <thead>
            <tr><th>Previous</th><th>→ Next Win</th><th>→ Next Loss</th><th>P(Win)</th><th>Sample</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><strong style={{ color: '#4ade80' }}>Win</strong></td>
              <td>{transitionMatrix.W_to_W}</td>
              <td>{transitionMatrix.W_to_L}</td>
              <td style={{ color: transitionMatrix.pWinAfterWin > metadata.baselineWinRate ? '#4ade80' : '#ef5350' }}>
                <strong>{transitionMatrix.pWinAfterWin}%</strong>
              </td>
              <td style={{ color: '#888' }}>{transitionMatrix.nAfterWin}</td>
            </tr>
            <tr>
              <td><strong style={{ color: '#ef5350' }}>Loss</strong></td>
              <td>{transitionMatrix.L_to_W}</td>
              <td>{transitionMatrix.L_to_L}</td>
              <td style={{ color: transitionMatrix.pWinAfterLoss > metadata.baselineWinRate ? '#4ade80' : '#ef5350' }}>
                <strong>{transitionMatrix.pWinAfterLoss}%</strong>
              </td>
              <td style={{ color: '#888' }}>{transitionMatrix.nAfterLoss}</td>
            </tr>
          </tbody>
        </table>
        <p style={{ color: '#71717a', fontSize: '0.75rem', marginTop: 8 }}>
          Baseline win rate: {metadata.baselineWinRate}% · Chi² = {chiSquare} · {significant ? '✓ Significant' : '✗ Not significant at p=0.05'}
        </p>
      </div>

      {/* Streak Analysis */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))', gap: '1rem' }}>
        <div className="card">
          <h3>After N Consecutive <span style={{ color: '#ef5350' }}>Losses</span></h3>
          <table>
            <thead><tr><th>Streak</th><th>Next W</th><th>Next L</th><th>P(Win)</th><th>Avg R</th><th>n</th></tr></thead>
            <tbody>
              {streaks.afterLosses.map(row => (
                <tr key={row.streak}>
                  <td><strong>{row.streak}L</strong></td>
                  <td style={{ color: '#4ade80' }}>{row.nextWin}</td>
                  <td style={{ color: '#ef5350' }}>{row.nextLoss}</td>
                  <td style={{ color: row.pWin > metadata.baselineWinRate ? '#4ade80' : '#ef5350', fontWeight: 600 }}>{row.pWin}%</td>
                  <td style={{ color: row.avgR > 0 ? '#4ade80' : '#ef5350' }}>{row.avgR > 0 ? '+' : ''}{row.avgR}R</td>
                  <td style={{ color: '#888' }}>{row.sample}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>After N Consecutive <span style={{ color: '#4ade80' }}>Wins</span></h3>
          <table>
            <thead><tr><th>Streak</th><th>Next W</th><th>Next L</th><th>P(Win)</th><th>Avg R</th><th>n</th></tr></thead>
            <tbody>
              {streaks.afterWins.map(row => (
                <tr key={row.streak}>
                  <td><strong>{row.streak}W</strong></td>
                  <td style={{ color: '#4ade80' }}>{row.nextWin}</td>
                  <td style={{ color: '#ef5350' }}>{row.nextLoss}</td>
                  <td style={{ color: row.pWin > metadata.baselineWinRate ? '#4ade80' : '#ef5350', fontWeight: 600 }}>{row.pWin}%</td>
                  <td style={{ color: row.avgR > 0 ? '#4ade80' : '#ef5350' }}>{row.avgR > 0 ? '+' : ''}{row.avgR}R</td>
                  <td style={{ color: '#888' }}>{row.sample}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Strategy Comparison */}
      <div className="card">
        <h3>Markov Strategies vs Baseline</h3>
        <p style={{ color: '#a1a1aa', fontSize: '0.85rem', marginTop: -8 }}>
          Each strategy filters which trades to take based on the outcome sequence. Same $100 risk per trade.
        </p>
        <table>
          <thead>
            <tr>
              <th>Strategy</th>
              <th>Trades</th>
              <th>Win %</th>
              <th>Avg R</th>
              <th>Total $</th>
              <th>PF</th>
              <th>Max DD</th>
            </tr>
          </thead>
          <tbody>
            {strategies.map(s => {
              const isBest = s.name === best.name
              const isBase = s.name.includes('Baseline')
              return (
                <tr key={s.name} style={isBest ? { background: '#4ade8011' } : {}}>
                  <td>
                    <strong>{s.name}</strong>
                    {isBest && <span style={{ color: '#ffd700', marginLeft: 6, fontSize: '0.75rem' }}>⭐ BEST</span>}
                    <div style={{ color: '#888', fontSize: '0.75rem' }}>{s.description}</div>
                  </td>
                  <td>{s.trades}</td>
                  <td style={{ color: s.winRate > baseline.winRate ? '#4ade80' : s.winRate < baseline.winRate ? '#ef5350' : '#ccc' }}>
                    <strong>{s.winRate}%</strong>
                  </td>
                  <td style={{ color: s.avgR > baseline.avgR ? '#4ade80' : s.avgR < baseline.avgR ? '#ef5350' : '#ccc' }}>
                    <strong>{s.avgR > 0 ? '+' : ''}{s.avgR}R</strong>
                  </td>
                  <td style={{ color: '#4ade80' }}>${s.totalPnl.toLocaleString()}</td>
                  <td style={{ color: s.profitFactor > baseline.profitFactor ? '#4ade80' : '#ccc' }}>
                    {s.profitFactor}
                  </td>
                  <td style={{ color: '#ef5350' }}>-${s.maxDD.toLocaleString()}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Equity Curves — Sizing */}
      <div className="card">
        <h3>Equity Curve — Flat $100 vs Markov Sizing</h3>
        <p style={{ color: '#a1a1aa', fontSize: '0.85rem', marginTop: -8 }}>Same trades, different risk amounts based on streak.</p>
        {data.sizing && <SizingChart sizing={data.sizing} />}
      </div>

      {/* Trade-by-Trade Table */}
      <TradeTable sizing={data.sizing} />

      {/* Interpretation */}
      <div className="card">
        <h3>How to Use This</h3>
        <table>
          <thead>
            <tr><th>Situation</th><th>Action</th><th>Risk Amount</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Last trade was a <strong style={{ color: '#4ade80' }}>win</strong></td>
              <td>Normal size</td>
              <td>$100</td>
            </tr>
            <tr>
              <td>Last 2 trades were <strong style={{ color: '#4ade80' }}>wins</strong></td>
              <td>Reduce size (exhaustion zone)</td>
              <td style={{ color: '#ef5350' }}>$75</td>
            </tr>
            <tr style={{ background: '#4ade8011' }}>
              <td>Last trade was a <strong style={{ color: '#ef5350' }}>loss</strong></td>
              <td>Slight size up (mean-reversion)</td>
              <td style={{ color: '#4ade80' }}>$125</td>
            </tr>
          </tbody>
        </table>
        <p style={{ color: '#71717a', fontSize: '0.8rem', marginTop: 12 }}>
          Only ±25% adjustment from base. Conservative enough to try live immediately. 
          If after 30+ trades you see it working, you can increase to ±50%.
        </p>
      </div>
    </div>
  )
}

function SizingChart({ sizing }) {
  const flat = sizing.find(s => s.name.includes('Flat'))
  const markov = sizing.find(s => s.name.includes('Markov'))
  if (!flat || !markov) return null

  // Both have same dates (same trades), merge
  const chartData = flat.equityCurve.map((p, i) => ({
    date: p.date,
    flat: p.equity,
    markov: markov.equityCurve[i]?.equity || 0,
  }))

  return (
    <div>
      <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem', fontSize: '0.9rem' }}>
        <div><span style={{ color: '#64748b' }}>■</span> Flat $100 → <strong style={{ color: '#ccc' }}>${flat.totalPnl.toLocaleString()}</strong> (DD: -${flat.maxDD.toLocaleString()})</div>
        <div><span style={{ color: '#4ade80' }}>■</span> Markov Sizing → <strong style={{ color: '#4ade80' }}>${markov.totalPnl.toLocaleString()}</strong> (DD: -${markov.maxDD.toLocaleString()})</div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey="date" tick={{ fill: '#888', fontSize: 11 }} tickFormatter={d => d.slice(2, 7)} interval={Math.floor(chartData.length / 8)} />
          <YAxis tick={{ fill: '#888', fontSize: 11 }} tickFormatter={v => `$${v}`} />
          <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333' }} formatter={(v, name) => [`$${v}`, name]} />
          <ReferenceLine y={0} stroke="#555" />
          <Line type="monotone" dataKey="flat" stroke="#64748b" strokeWidth={1.5} dot={false} name="Flat $100" />
          <Area type="monotone" dataKey="markov" stroke="#4ade80" fill="#4ade8022" strokeWidth={2.5} dot={false} name="Markov Sizing" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function TradeTable({ sizing }) {
  const [showAll, setShowAll] = useState(false)
  if (!sizing) return null
  const tableData = sizing.find(s => s.tradeTable)?.tradeTable
  if (!tableData) return null

  const displayed = showAll ? tableData : tableData.slice(0, 30)

  return (
    <div className="card">
      <h3>Trade-by-Trade Comparison</h3>
      <p style={{ color: '#a1a1aa', fontSize: '0.85rem', marginTop: -8 }}>
        Every trade with flat $100 vs Markov sizing. The "Why" column shows why risk was adjusted.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ fontSize: '0.8rem' }}>
          <thead>
            <tr>
              <th>#</th>
              <th>Date</th>
              <th>W/L</th>
              <th>R</th>
              <th>Score</th>
              <th style={{ borderLeft: '2px solid #64748b' }}>Flat Risk</th>
              <th>Flat PnL</th>
              <th>Flat Equity</th>
              <th style={{ borderLeft: '2px solid #4ade80' }}>Markov Risk</th>
              <th>Markov PnL</th>
              <th>Markov Equity</th>
              <th>Diff</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((t, i) => {
              const diff = t.markovPnl - t.flatPnl
              return (
                <tr key={i} style={t.markovRisk !== 100 ? { background: t.markovRisk > 100 ? '#4ade8008' : '#ef535008' } : {}}>
                  <td style={{ color: '#666' }}>{i + 1}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{t.date}</td>
                  <td style={{ color: t.outcome === 'W' ? '#4ade80' : '#ef5350', fontWeight: 700 }}>{t.outcome}</td>
                  <td style={{ color: t.pnlR > 0 ? '#4ade80' : '#ef5350' }}>{t.pnlR > 0 ? '+' : ''}{t.pnlR.toFixed(2)}</td>
                  <td>{t.score}</td>
                  <td style={{ borderLeft: '2px solid #64748b33' }}>${t.flatRisk}</td>
                  <td style={{ color: t.flatPnl > 0 ? '#4ade80' : '#ef5350' }}>{t.flatPnl > 0 ? '+' : ''}${t.flatPnl.toFixed(0)}</td>
                  <td style={{ color: '#888' }}>${t.flatEquity.toFixed(0)}</td>
                  <td style={{ borderLeft: '2px solid #4ade8033', fontWeight: t.markovRisk !== 100 ? 700 : 400, color: t.markovRisk > 100 ? '#4ade80' : t.markovRisk < 100 ? '#ef5350' : '#ccc' }}>
                    ${t.markovRisk}
                  </td>
                  <td style={{ color: t.markovPnl > 0 ? '#4ade80' : '#ef5350' }}>{t.markovPnl > 0 ? '+' : ''}${t.markovPnl.toFixed(0)}</td>
                  <td style={{ color: '#888' }}>${t.markovEquity.toFixed(0)}</td>
                  <td style={{ color: diff > 0 ? '#4ade80' : diff < 0 ? '#ef5350' : '#666', fontWeight: diff !== 0 ? 600 : 400 }}>
                    {diff !== 0 ? (diff > 0 ? '+' : '') + '$' + diff.toFixed(0) : '—'}
                  </td>
                  <td style={{ color: '#a1a1aa', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{t.reason}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!showAll && tableData.length > 30 && (
        <button onClick={() => setShowAll(true)} style={{ marginTop: 12, padding: '8px 16px', background: '#1a2744', border: '1px solid #4ade8044', borderRadius: 6, color: '#4ade80', cursor: 'pointer' }}>
          Show all {tableData.length} trades
        </button>
      )}
    </div>
  )
}
