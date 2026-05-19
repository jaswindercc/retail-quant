import { computeMetrics, buildEquityCurve, buildDrawdownSeries, buildConsecutive, buildMonthlyReturns, fmt$ } from '../utils'
import KpiCard from '../components/KpiCard'
import EquityChart from '../components/EquityChart'
import DrawdownChart from '../components/DrawdownChart'
import MonthlyChart from '../components/MonthlyChart'

export default function SpxOvernightPage({ data }) {
  if (!data) return <div className="loading">Loading overnight data…</div>

  const trades = (data.allTrades || []).filter(t => t.exitDate)
  const metrics = computeMetrics(trades)
  const equity = buildEquityCurve(trades)
  const dd = buildDrawdownSeries(trades)
  const consec = buildConsecutive(trades)
  const monthly = buildMonthlyReturns(trades)
  const settings = data.settings || {}
  const scoreAnalysis = data.scoreAnalysis || {}

  // Long/Short breakdown
  const longs = trades.filter(t => t.dir === 'LONG')
  const shorts = trades.filter(t => t.dir === 'SHORT')
  const longWins = longs.filter(t => t.pnlDollar > 0)
  const shortWins = shorts.filter(t => t.pnlDollar > 0)
  const longWR = longs.length ? (longWins.length / longs.length * 100).toFixed(1) : '0'
  const shortWR = shorts.length ? (shortWins.length / shorts.length * 100).toFixed(1) : '0'
  const longPnl = longs.reduce((s, t) => s + t.pnlDollar, 0)
  const shortPnl = shorts.reduce((s, t) => s + t.pnlDollar, 0)

  // Score breakdown for table
  const scoreRows = Object.entries(scoreAnalysis)
    .map(([score, info]) => ({ score: +score, ...info }))
    .sort((a, b) => a.score - b.score)

  // Factor frequency analysis
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
      <h1 className="page-title">SPX Overnight <span>Multi-factor prediction model · Enter at close · Exit next day close</span></h1>

      <div className="card strategy-summary">
        <h3>How It Works (Simple Version)</h3>
        <ul>
          <li><strong>Every day at 3:30pm,</strong> the model scores the market from -10 to +10</li>
          <li><strong>Score ≥ +3</strong> → BUY SPY at close, sell tomorrow at close</li>
          <li><strong>Score ≤ -3</strong> → SHORT SPY at close, cover tomorrow at close</li>
          <li><strong>Score -2 to +2</strong> → NO TRADE (not enough conviction)</li>
          <li><strong>Hold time:</strong> Always 1 day. Enter today's close → exit tomorrow's close.</li>
          <li><strong>Risk:</strong> $100 per trade</li>
        </ul>

        <h3>Why Not Every Day? ({metrics?.totalTrades || 0} trades out of ~1,300 days)</h3>
        <ul>
          <li>We only trade when the model sees a <strong>statistical edge</strong></li>
          <li>Most days the market is "neutral" — no strong signal either way</li>
          <li>Trading every day = ~50/50 coin flip with commissions eating your profits</li>
          <li>Trading only high-score days = 55% win rate with positive expectancy</li>
          <li>Think of it like poker: fold bad hands, bet big on good ones</li>
        </ul>

        <h3>What Creates the Score?</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <h4 style={{ color: '#22c55e', marginBottom: '0.5rem' }}>🟢 Bullish (tomorrow likely UP)</h4>
            <ul style={{ fontSize: 14 }}>
              <li><strong>+2</strong> VIX panic spike &gt;12% today</li>
              <li><strong>+2</strong> SPY extremely oversold (RSI5 &lt; 20)</li>
              <li><strong>+2</strong> SPY crashed &gt;2% but still in uptrend</li>
              <li><strong>+1</strong> VIX above its average (fear elevated)</li>
              <li><strong>+1</strong> SPY moderately oversold</li>
              <li><strong>+1</strong> 3+ down days in a row</li>
              <li><strong>+1</strong> Close near day's low (sellers exhausted)</li>
              <li><strong>+1</strong> VIX &gt; 25 (high fear environment)</li>
              <li><strong>+1</strong> SPY above 200-day MA (bull market)</li>
            </ul>
          </div>
          <div>
            <h4 style={{ color: '#ef4444', marginBottom: '0.5rem' }}>🔴 Bearish (tomorrow likely DOWN)</h4>
            <ul style={{ fontSize: 14 }}>
              <li><strong>-2</strong> SPY extremely overbought (RSI5 &gt; 90)</li>
              <li><strong>-2</strong> SPY rallied &gt;3% today (overextended)</li>
              <li><strong>-2</strong> VIX crushed &gt;20% (complacency extreme)</li>
              <li><strong>-1</strong> VIX way below average (too calm)</li>
              <li><strong>-1</strong> SPY overbought (RSI5 &gt; 75)</li>
              <li><strong>-1</strong> 4+ up days + stretched RSI</li>
              <li><strong>-1</strong> SPY below 200-day MA (bear market)</li>
              <li><strong>-1</strong> VIX dropped 10-20% (relief fading)</li>
              <li><strong>-1</strong> SPY up 1.5-3% today</li>
            </ul>
          </div>
        </div>

        <h3 style={{ marginTop: '1rem' }}>Example</h3>
        <ul>
          <li>Today: SPY down 2.5%, VIX spiked 15%, RSI(5)=18, 3 down days, above SMA200</li>
          <li>Score: +2 (crash dip) +2 (VIX panic) +2 (RSI&lt;20) +1 (3dn) +1 (VIX&gt;SMA) +1 (above SMA200) +1 (VIX&gt;25) = <strong>+10</strong></li>
          <li>Action: BUY at close → very high conviction that tomorrow closes higher</li>
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

        {/* Long/Short Breakdown */}
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

        {/* Score Analysis */}
        <div className="card">
          <h3>Performance by Signal Score <span style={{color:'#8e8e9a', fontWeight:400, fontSize:14}}>(higher |score| = more factors aligned)</span></h3>
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

        {/* Factor Attribution */}
        <div className="card">
          <h3>Factor Attribution <span style={{color:'#8e8e9a', fontWeight:400, fontSize:14}}>(which signals contributed most to profits)</span></h3>
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

        {/* Charts */}
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

        {/* Trade Log */}
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

        {/* Signals Reference */}
        <div className="card">
          <h3>Signal Reference</h3>
          <p style={{ color: '#8e8e9a', fontSize: 13, marginBottom: 12 }}>
            Each day we check these conditions. Bullish signals add to the score (go long), bearish signals subtract (go short). We only trade when total score ≥ +3 (long) or ≤ −3 (short).
          </p>
          <table>
            <thead>
              <tr><th>Signal</th><th>Score</th><th>Direction</th><th>What It Means</th></tr>
            </thead>
            <tbody>
              <tr><td><strong>VIX_panic</strong></td><td style={{color:'#00c853'}}>+2</td><td>Bull</td><td>VIX spiked &gt;12% today — extreme fear, market tends to bounce overnight</td></tr>
              <tr><td><strong>RSI5&lt;20</strong></td><td style={{color:'#00c853'}}>+2</td><td>Bull</td><td>5-day RSI below 20 — deeply oversold, strong mean-reversion setup</td></tr>
              <tr><td><strong>crash_dip</strong></td><td style={{color:'#00c853'}}>+2</td><td>Bull</td><td>SPY fell &gt;2% today but still above 200-day MA — panic selling in an uptrend</td></tr>
              <tr><td><strong>VIX&gt;SMA20</strong></td><td style={{color:'#00c853'}}>+1</td><td>Bull</td><td>VIX above its 20-day average — elevated fear environment favors overnight longs</td></tr>
              <tr><td><strong>RSI5&lt;35</strong></td><td style={{color:'#00c853'}}>+1</td><td>Bull</td><td>5-day RSI between 20–35 — moderately oversold</td></tr>
              <tr><td><strong>Xdn_days</strong></td><td style={{color:'#00c853'}}>+1</td><td>Bull</td><td>3+ consecutive down days — selling exhaustion, bounce likely</td></tr>
              <tr><td><strong>close_near_low</strong></td><td style={{color:'#00c853'}}>+1</td><td>Bull</td><td>Close in the bottom 20% of today's range — sellers dominated, snapback likely</td></tr>
              <tr><td><strong>dip_in_uptrend</strong></td><td style={{color:'#00c853'}}>+1</td><td>Bull</td><td>SPY fell 1–2% today but still above 200-day MA — healthy pullback in uptrend</td></tr>
              <tr><td><strong>VIX&gt;25</strong></td><td style={{color:'#00c853'}}>+1</td><td>Bull</td><td>VIX above 25 absolute — high fear regime favors overnight mean reversion</td></tr>
              <tr><td><strong>above_SMA200</strong></td><td style={{color:'#00c853'}}>+1</td><td>Bull</td><td>SPY above its 200-day MA — structural uptrend intact (weaker signal)</td></tr>
              <tr style={{borderTop:'1px solid var(--border)'}}><td><strong>RSI5&gt;90</strong></td><td style={{color:'#ff1744'}}>−2</td><td>Bear</td><td>5-day RSI above 90 — extremely overbought, likely to fade overnight</td></tr>
              <tr><td><strong>huge_rally</strong></td><td style={{color:'#ff1744'}}>−2</td><td>Bear</td><td>SPY rallied &gt;3% today — overextended, overnight profit-taking likely</td></tr>
              <tr><td><strong>VIX_crushed</strong></td><td style={{color:'#ff1744'}}>−2</td><td>Bear</td><td>VIX dropped &gt;20% in one day — extreme complacency event, reversal risk</td></tr>
              <tr><td><strong>VIX_complacent</strong></td><td style={{color:'#ff1744'}}>−1</td><td>Bear</td><td>VIX is 15%+ below its 20-day average — too much calm, risk of pullback</td></tr>
              <tr><td><strong>RSI5&gt;75</strong></td><td style={{color:'#ff1744'}}>−1</td><td>Bear</td><td>5-day RSI between 75–90 — moderately overbought</td></tr>
              <tr><td><strong>extended_up</strong></td><td style={{color:'#ff1744'}}>−1</td><td>Bear</td><td>4+ consecutive up days AND RSI14 &gt; 65 — rally getting stretched</td></tr>
              <tr><td><strong>below_SMA200</strong></td><td style={{color:'#ff1744'}}>−1</td><td>Bear</td><td>SPY below its 200-day MA — structural downtrend, shorts have an edge</td></tr>
              <tr><td><strong>VIX_drop</strong></td><td style={{color:'#ff1744'}}>−1</td><td>Bear</td><td>VIX dropped 10–20% today — relief rally may be exhausted</td></tr>
              <tr><td><strong>big_up_day</strong></td><td style={{color:'#ff1744'}}>−1</td><td>Bear</td><td>SPY rallied 1.5–3% — extended move, profit-taking overnight</td></tr>
              <tr><td><strong>distribution</strong></td><td style={{color:'#ff1744'}}>−1</td><td>Bear</td><td>Close in top 15% of range on 1.5× average volume — smart money selling into strength</td></tr>
            </tbody>
          </table>
        </div>
      </>
      )}
    </div>
  )
}
