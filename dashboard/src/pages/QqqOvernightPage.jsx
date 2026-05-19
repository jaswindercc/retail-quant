import { computeMetrics, buildEquityCurve, buildDrawdownSeries, buildConsecutive, buildMonthlyReturns, fmt$ } from '../utils'
import KpiCard from '../components/KpiCard'
import EquityChart from '../components/EquityChart'
import DrawdownChart from '../components/DrawdownChart'
import MonthlyChart from '../components/MonthlyChart'

export default function QqqOvernightPage({ data }) {
  if (!data) return <div className="loading">Loading QQQ overnight data…</div>

  const trades = (data.allTrades || []).filter(t => t.exitDate)
  const metrics = computeMetrics(trades)
  const equity = buildEquityCurve(trades)
  const dd = buildDrawdownSeries(trades)
  const consec = buildConsecutive(trades)
  const monthly = buildMonthlyReturns(trades)
  const scoreAnalysis = data.scoreAnalysis || {}

  const longs = trades.filter(t => t.dir === 'LONG')
  const shorts = trades.filter(t => t.dir === 'SHORT')
  const longWins = longs.filter(t => t.pnlDollar > 0)
  const shortWins = shorts.filter(t => t.pnlDollar > 0)
  const longWR = longs.length ? (longWins.length / longs.length * 100).toFixed(1) : '0'
  const shortWR = shorts.length ? (shortWins.length / shorts.length * 100).toFixed(1) : '0'
  const longPnl = longs.reduce((s, t) => s + t.pnlDollar, 0)
  const shortPnl = shorts.reduce((s, t) => s + t.pnlDollar, 0)

  const scoreRows = Object.entries(scoreAnalysis)
    .map(([score, info]) => ({ score: +score, ...info }))
    .sort((a, b) => a.score - b.score)

  const factorFreq = {}
  trades.forEach(t => {
    ;(t.reasonsBull || []).forEach(r => {
      const key = r.replace(/\(\+\d\)/, '').trim()
      if (!factorFreq[key]) factorFreq[key] = { fired: 0, wins: 0, pnl: 0 }
      factorFreq[key].fired++
      if (t.pnlDollar > 0) factorFreq[key].wins++
      factorFreq[key].pnl += t.pnlDollar
    })
    ;(t.reasonsBear || []).forEach(r => {
      const key = r.replace(/\(-\d\)/, '').trim()
      if (!factorFreq[key]) factorFreq[key] = { fired: 0, wins: 0, pnl: 0 }
      factorFreq[key].fired++
      if (t.pnlDollar > 0) factorFreq[key].wins++
      factorFreq[key].pnl += t.pnlDollar
    })
  })
  const factorRows = Object.entries(factorFreq)
    .map(([name, info]) => ({ name, ...info, wr: (info.wins / info.fired * 100).toFixed(1) }))
    .sort((a, b) => b.pnl - a.pnl)

  return (
    <div>
      <h1 className="page-title">QQQ Overnight <span>Nasdaq 100 ETF · VIX-based scoring · Enter at close · Exit next day close</span></h1>

      <div className="card strategy-summary">
        <h3>How It Works</h3>
        <ul>
          <li><strong>Same scoring model as SPX/SPY Overnight</strong> — applied to QQQ (Nasdaq 100 ETF)</li>
          <li><strong>Why VIX works for QQQ:</strong> VIX measures S&P 500 fear, but QQQ is highly correlated (~0.90). When VIX spikes, tech sells off even harder → bigger overnight bounce</li>
          <li><strong>QQQ is more volatile</strong> — larger overnight moves = bigger winners when the model is right</li>
          <li><strong>Score ≥ +3</strong> → BUY QQQ at close, sell tomorrow at close</li>
          <li><strong>Score ≤ -3</strong> → SHORT QQQ at close, cover tomorrow at close</li>
          <li><strong>Risk:</strong> $100 per trade, 0.5× ATR risk distance</li>
        </ul>

        <h3>QQQ vs SPY for This Strategy</h3>
        <ul>
          <li><strong>More trades:</strong> QQQ's higher volatility triggers oversold/overbought signals more often</li>
          <li><strong>Bigger swings:</strong> When VIX spikes, Nasdaq typically drops harder than S&P → stronger bounce</li>
          <li><strong>Same edge:</strong> Overnight mean-reversion works on both, but QQQ amplifies the moves</li>
          <li><strong>Thresholds adjusted slightly:</strong> Crash dip &gt;2.5% (vs 2% for SPY), big up day &gt;1.8% (vs 1.5%)</li>
        </ul>
      </div>

      {metrics && (
      <>
        <div className="kpi-grid">
          <KpiCard label="Total Trades" value={metrics.totalTrades} />
          <KpiCard label="Win Rate" value={metrics.winRate + '%'} cls={metrics.winRate >= 53 ? 'green' : metrics.winRate >= 50 ? '' : 'red'} />
          <KpiCard label="Total P&L" value={fmt$(metrics.totalPnl)} cls={metrics.totalPnl >= 0 ? 'green' : 'red'} />
          <KpiCard label="Profit Factor" value={metrics.profitFactor} cls={metrics.profitFactor >= 1.3 ? 'green' : 'red'} />
          <KpiCard label="Avg R" value={metrics.avgR + 'R'} cls={metrics.avgR >= 0 ? 'green' : 'red'} />
          <KpiCard label="Max DD" value={fmt$(dd.maxDD)} cls="red" />
          <KpiCard label="Max Consec Wins" value={consec.maxConsecWin} cls="green" />
          <KpiCard label="Max Consec Losses" value={consec.maxConsecLoss} cls="red" />
        </div>

        <div className="card">
          <h3>Direction Breakdown</h3>
          <table>
            <thead>
              <tr><th>Direction</th><th>Trades</th><th>Win%</th><th>P&L</th><th>Avg R</th></tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>LONG</strong></td>
                <td>{longs.length}</td>
                <td>{longWR}%</td>
                <td className={longPnl >= 0 ? 'win' : 'loss'}>{fmt$(longPnl)}</td>
                <td className={longPnl >= 0 ? 'win' : 'loss'}>{longs.length ? (longs.reduce((s, t) => s + t.pnlR, 0) / longs.length).toFixed(2) : '0'}R</td>
              </tr>
              <tr>
                <td><strong>SHORT</strong></td>
                <td>{shorts.length}</td>
                <td>{shortWR}%</td>
                <td className={shortPnl >= 0 ? 'win' : 'loss'}>{fmt$(shortPnl)}</td>
                <td className={shortPnl >= 0 ? 'win' : 'loss'}>{shorts.length ? (shorts.reduce((s, t) => s + t.pnlR, 0) / shorts.length).toFixed(2) : '0'}R</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Performance by Signal Score</h3>
          <table>
            <thead>
              <tr><th>Score</th><th>Trades</th><th>Win%</th><th>Avg R</th><th>Total P&L</th><th>Edge</th></tr>
            </thead>
            <tbody>
              {scoreRows.map(r => (
                <tr key={r.score}>
                  <td><strong>{r.score > 0 ? '+' : ''}{r.score}</strong></td>
                  <td>{r.trades}</td>
                  <td className={r.winRate >= 55 ? 'win' : r.winRate < 50 ? 'loss' : ''}>{r.winRate}%</td>
                  <td className={r.avgR >= 0 ? 'win' : 'loss'}>{r.avgR > 0 ? '+' : ''}{r.avgR}R</td>
                  <td className={r.totalPnl >= 0 ? 'win' : 'loss'}>{fmt$(r.totalPnl)}</td>
                  <td>{r.winRate >= 55 && r.avgR > 0 ? '✅ Strong' : r.winRate >= 52 && r.avgR >= 0 ? '⚡ Moderate' : '⚠️ Weak'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Factor Attribution</h3>
          <table>
            <thead>
              <tr><th>Factor</th><th>Fired</th><th>Win%</th><th>Total P&L Contribution</th></tr>
            </thead>
            <tbody>
              {factorRows.slice(0, 15).map(r => (
                <tr key={r.name}>
                  <td><strong>{r.name}</strong></td>
                  <td>{r.fired}</td>
                  <td className={+r.wr >= 55 ? 'win' : +r.wr < 50 ? 'loss' : ''}>{r.wr}%</td>
                  <td className={r.pnl >= 0 ? 'win' : 'loss'}>{fmt$(r.pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Equity Curve</h3>
          <EquityChart data={equity} />
        </div>

        <div className="card">
          <h3>Drawdown</h3>
          <DrawdownChart data={dd.series} />
        </div>

        <div className="card">
          <h3>Monthly Returns</h3>
          <MonthlyChart data={monthly} />
        </div>

        <div className="card">
          <h3>Recent Trades <span style={{color:'#8e8e9a', fontWeight:400, fontSize:14}}>(last 50)</span></h3>
          <div style={{ maxHeight: 500, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Dir</th>
                  <th>Score</th>
                  <th>Entry Date</th>
                  <th>Entry $</th>
                  <th>Exit $</th>
                  <th>P&L ($)</th>
                  <th>P&L (R)</th>
                  <th>Signals</th>
                </tr>
              </thead>
              <tbody>
                {[...trades.slice(-50)].reverse().map((t, i) => {
                  const signals = t.dir === 'LONG'
                    ? (t.reasonsBull || []).join(', ')
                    : (t.reasonsBear || []).join(', ')
                  return (
                    <tr key={i}>
                      <td>{trades.length - i}</td>
                      <td style={{ color: t.dir === 'LONG' ? '#00c853' : '#ff1744' }}>{t.dir}</td>
                      <td><strong>{t.score > 0 ? '+' : ''}{t.score}</strong></td>
                      <td>{t.entryDate}</td>
                      <td>${t.entryPrice.toFixed(2)}</td>
                      <td>${t.exitPrice.toFixed(2)}</td>
                      <td className={t.pnlDollar >= 0 ? 'win' : 'loss'}>
                        {t.pnlDollar >= 0 ? '+' : '-'}{fmt$(t.pnlDollar)}
                      </td>
                      <td className={t.pnlR >= 0 ? 'win' : 'loss'}>
                        {t.pnlR >= 0 ? '+' : ''}{t.pnlR.toFixed(1)}R
                      </td>
                      <td style={{ fontSize: 12, color: '#8e8e9a', maxWidth: 260 }}>{signals}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h3>Signal Reference</h3>
          <p style={{ color: '#8e8e9a', fontSize: 13, marginBottom: 12 }}>
            Same VIX + price-action signals as SPX/SPY Overnight, with slightly wider thresholds for QQQ's higher volatility.
          </p>
          <table>
            <thead>
              <tr><th>Signal</th><th>Score</th><th>Direction</th><th>What It Means</th></tr>
            </thead>
            <tbody>
              <tr><td><strong>VIX_panic</strong></td><td style={{color:'#00c853'}}>+2</td><td>Bull</td><td>VIX spiked &gt;12% today — extreme fear, QQQ tends to bounce hard overnight</td></tr>
              <tr><td><strong>RSI5&lt;20</strong></td><td style={{color:'#00c853'}}>+2</td><td>Bull</td><td>5-day RSI below 20 — deeply oversold, strong mean-reversion</td></tr>
              <tr><td><strong>crash_dip</strong></td><td style={{color:'#00c853'}}>+2</td><td>Bull</td><td>QQQ fell &gt;2.5% today but still above 200-day MA — panic in an uptrend</td></tr>
              <tr><td><strong>VIX&gt;SMA20</strong></td><td style={{color:'#00c853'}}>+1</td><td>Bull</td><td>VIX above its 20-day average — elevated fear favors overnight longs</td></tr>
              <tr><td><strong>RSI5&lt;35</strong></td><td style={{color:'#00c853'}}>+1</td><td>Bull</td><td>5-day RSI between 20–35 — moderately oversold</td></tr>
              <tr><td><strong>Xdn_days</strong></td><td style={{color:'#00c853'}}>+1</td><td>Bull</td><td>3+ consecutive down days — selling exhaustion</td></tr>
              <tr><td><strong>close_near_low</strong></td><td style={{color:'#00c853'}}>+1</td><td>Bull</td><td>Close in bottom 20% of today's range — sellers dominated</td></tr>
              <tr><td><strong>dip_in_uptrend</strong></td><td style={{color:'#00c853'}}>+1</td><td>Bull</td><td>QQQ fell 1.2–2.5% today but above 200-day MA</td></tr>
              <tr><td><strong>VIX&gt;25</strong></td><td style={{color:'#00c853'}}>+1</td><td>Bull</td><td>VIX above 25 — high fear environment</td></tr>
              <tr><td><strong>above_SMA200</strong></td><td style={{color:'#00c853'}}>+1</td><td>Bull</td><td>QQQ above its 200-day MA — structural uptrend</td></tr>
              <tr style={{borderTop:'1px solid var(--border)'}}><td><strong>RSI5&gt;90</strong></td><td style={{color:'#ff1744'}}>−2</td><td>Bear</td><td>5-day RSI above 90 — extremely overbought</td></tr>
              <tr><td><strong>huge_rally</strong></td><td style={{color:'#ff1744'}}>−2</td><td>Bear</td><td>QQQ rallied &gt;3.5% today — massively overextended</td></tr>
              <tr><td><strong>VIX_crushed</strong></td><td style={{color:'#ff1744'}}>−2</td><td>Bear</td><td>VIX dropped &gt;20% — extreme complacency</td></tr>
              <tr><td><strong>VIX_complacent</strong></td><td style={{color:'#ff1744'}}>−1</td><td>Bear</td><td>VIX 15%+ below its 20-day avg — too calm</td></tr>
              <tr><td><strong>RSI5&gt;75</strong></td><td style={{color:'#ff1744'}}>−1</td><td>Bear</td><td>5-day RSI 75–90 — moderately overbought</td></tr>
              <tr><td><strong>extended_up</strong></td><td style={{color:'#ff1744'}}>−1</td><td>Bear</td><td>4+ up days + RSI14 &gt; 65 — stretched</td></tr>
              <tr><td><strong>below_SMA200</strong></td><td style={{color:'#ff1744'}}>−1</td><td>Bear</td><td>QQQ below 200-day MA — bear regime</td></tr>
              <tr><td><strong>VIX_drop</strong></td><td style={{color:'#ff1744'}}>−1</td><td>Bear</td><td>VIX dropped 10–20% — relief may be done</td></tr>
              <tr><td><strong>big_up_day</strong></td><td style={{color:'#ff1744'}}>−1</td><td>Bear</td><td>QQQ rallied 1.8–3.5% — overextended</td></tr>
              <tr><td><strong>distribution</strong></td><td style={{color:'#ff1744'}}>−1</td><td>Bear</td><td>Close in top 15% + 1.5× avg volume — selling into strength</td></tr>
            </tbody>
          </table>
        </div>
      </>
      )}
    </div>
  )
}
