import { useState } from 'react'
import { fmt$ } from '../utils'

const CONFIG_COLORS = { vanilla: '#8e8e9a', trail3d: '#f59e0b', forever: '#4ade80' }
const CONFIG_LABELS = { vanilla: 'Vanilla (1d)', trail3d: 'Trail 3d', forever: 'Trail Forever' }
const INST_LABELS = { SPX: 'S&P 500 (SPX)', SPY: 'SPY ETF', QQQ: 'QQQ ETF' }

export default function ScannerPage({ data }) {
  const [scanStatus, setScanStatus] = useState(null)

  const runScanner = async () => {
    setScanStatus('running')
    try {
      // Trigger GitHub Actions workflow_dispatch
      const resp = await fetch('https://api.github.com/repos/jaswindercc/retail-quant/actions/workflows/overnight-scanner.yml/dispatches', {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `token ${localStorage.getItem('gh_pat') || ''}`,
        },
        body: JSON.stringify({ ref: 'main' }),
      })
      if (resp.status === 204) {
        setScanStatus('done')
      } else if (resp.status === 401 || resp.status === 403) {
        const pat = prompt('Enter GitHub PAT (actions:write scope) to trigger scanner:')
        if (pat) {
          localStorage.setItem('gh_pat', pat)
          setScanStatus(null)
          runScanner()
        } else {
          setScanStatus('error')
        }
      } else {
        setScanStatus('error')
      }
    } catch {
      setScanStatus('error')
    }
  }

  if (!data) return <p className="loading">Loading scanner data…</p>

  const { instruments, lastFetched, nextRefresh, fetchSuccess } = data
  const instKeys = Object.keys(instruments || {})
  const [instTab, setInstTab] = useState(instKeys[0] || 'SPX')
  const [configTab, setConfigTab] = useState('forever')

  if (!instruments || instKeys.length === 0) return <p>No scanner data available.</p>

  const inst = instruments[instTab]
  if (!inst) return <p>No data for {instTab}.</p>

  const { today, history, configSummaries } = inst
  const cfg = today.configs[configTab]
  const position = cfg?.position

  // Signal status
  const isEntry = today.entrySignal && cfg?.status === 'entered'
  const isBlocked = cfg?.status?.startsWith('blocked')
  const isInPosition = cfg?.status === 'in_position'

  let signalColor = '#ef4444', signalText = 'NO TRADE', signalEmoji = '🔴'
  if (isInPosition) { signalColor = '#3b82f6'; signalText = 'IN POSITION'; signalEmoji = '📈' }
  else if (isEntry) { signalColor = '#4ade80'; signalText = 'BUY AT CLOSE'; signalEmoji = '🟢' }
  else if (isBlocked) { signalColor = '#f59e0b'; signalText = 'BLOCKED'; signalEmoji = '⚠️' }

  const recentEntries = history.filter(r => r.score >= 3)

  return (
    <div>
      <h2>📡 Overnight Scanner</h2>

      {/* Data Freshness Banner */}
      <div className="card" style={{padding:'12px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, borderLeft: fetchSuccess ? '3px solid #4ade80' : '3px solid #f59e0b'}}>
        <div>
          <span style={{color:'#8e8e9a', fontSize:13}}>Last data fetched: </span>
          <strong style={{color: fetchSuccess ? '#4ade80' : '#f59e0b'}}>{lastFetched || 'Never'}</strong>
          {!fetchSuccess && <span style={{color:'#f59e0b', marginLeft:8}}>⚠️ Some fetches failed</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{textAlign:'right'}}>
            <span style={{color:'#8e8e9a', fontSize:13}}>Auto-refresh: </span>
            <strong style={{color:'#d1d1d8'}}>{nextRefresh}</strong>
          </div>
          <button onClick={runScanner} disabled={scanStatus === 'running'}
            style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #4ade80', background: scanStatus === 'running' ? '#1e1e2e' : '#0a1f14', color: '#4ade80', fontSize: 12, fontWeight: 600, cursor: scanStatus === 'running' ? 'wait' : 'pointer' }}>
            {scanStatus === 'running' ? '⏳ Running…' : scanStatus === 'done' ? '✅ Done' : scanStatus === 'error' ? '❌ Failed' : '▶️ Run Scanner'}
          </button>
        </div>
      </div>

      {/* Instrument Tabs */}
      <div style={{display:'flex', gap:6, marginBottom:12}}>
        {instKeys.map(key => {
          const t = instruments[key]?.today
          const hasSignal = t?.entrySignal
          return (
            <button key={key} onClick={() => setInstTab(key)}
              style={{
                padding:'12px 24px', borderRadius:8, border:'none', cursor:'pointer', fontWeight:700, fontSize:15,
                background: instTab === key ? '#3b82f6' : '#1e293b',
                color: instTab === key ? '#fff' : '#8e8e9a',
              }}>
              {key} {hasSignal && '🟢'}
            </button>
          )
        })}
      </div>

      {/* Config Tabs */}
      <div style={{display:'flex', gap:6, marginBottom:24}}>
        {Object.keys(CONFIG_LABELS).map(key => (
          <button key={key} onClick={() => setConfigTab(key)}
            style={{
              padding:'8px 16px', borderRadius:6, border:'none', cursor:'pointer', fontWeight:600, fontSize:13,
              background: configTab === key ? CONFIG_COLORS[key] : '#1e293b',
              color: configTab === key ? '#000' : CONFIG_COLORS[key],
              opacity: configTab === key ? 1 : 0.7,
            }}>
            {CONFIG_LABELS[key]}
          </button>
        ))}
      </div>

      {/* Big Signal Light */}
      <div className="card" style={{textAlign:'center', padding:40, borderLeft:`4px solid ${signalColor}`}}>
        <div style={{fontSize:56, marginBottom:8}}>{signalEmoji}</div>
        <div style={{fontSize:28, fontWeight:800, color: signalColor, marginBottom:6}}>
          {signalText}
        </div>
        <div style={{fontSize:16, color:'#d1d1d8'}}>
          {instTab} Score: <strong style={{fontSize:22}}>{today.score}</strong> / min 3
        </div>
        {isBlocked && (
          <div style={{marginTop:10, color:'#f59e0b', fontSize:14}}>
            {cfg.status.replace('blocked: ', '⚠️ ')}
          </div>
        )}
        <div style={{marginTop:12, color:'#8e8e9a', fontSize:12}}>
          {today.date} | {instTab} {today.close} | SMA50 {today.sma50} | {today.aboveSma50 ? '✅ Above SMA50' : '❌ Below SMA50'}
        </div>
      </div>

      {/* How to Read */}
      <div className="card" style={{background:'#0f172a', border:'1px solid #1e293b'}}>
        <h3 style={{margin:'0 0 12px'}}>❓ How to Read This</h3>
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:16, fontSize:13, color:'#d1d1d8', lineHeight:1.8}}>
          <div>
            <div style={{fontWeight:700, color:'#4ade80', marginBottom:4}}>🟢 BUY AT CLOSE</div>
            Score ≥ 3 and all filters pass. Enter at today's closing price (MOC order).
          </div>
          <div>
            <div style={{fontWeight:700, color:'#ef4444', marginBottom:4}}>🔴 NO TRADE</div>
            Score is below 3 — not enough bullish signals. Do nothing. Wait for next day.
          </div>
          <div>
            <div style={{fontWeight:700, color:'#f59e0b', marginBottom:4}}>⚠️ BLOCKED</div>
            Score ≥ 3 but a filter blocks entry (below SMA50, or paused after 2 losses).
          </div>
          <div>
            <div style={{fontWeight:700, color:'#3b82f6', marginBottom:4}}>📈 IN POSITION</div>
            Already holding from a previous signal. Monitoring trail stop for exit.
          </div>
        </div>
        <div style={{marginTop:16, padding:'12px 16px', background:'rgba(255,255,255,0.03)', borderRadius:8, fontSize:13, color:'#94a3b8'}}>
          <strong style={{color:'#d1d1d8'}}>Score explained:</strong> Each day is scored using 10+ factors (VIX spike, RSI oversold, consecutive down days, dip-in-uptrend, etc.).
          Each factor adds +1 or +2 points. Bearish factors subtract points. <strong>Score ≥ 3 = bullish enough to trade.</strong> Score of 1 means only 1 weak signal fired — not enough conviction.
        </div>
      </div>
      <div className="card">
        <h3 style={{color: CONFIG_COLORS[configTab]}}>Entry Rules — {CONFIG_LABELS[configTab]}</h3>
        <table>
          <thead><tr><th>Rule</th><th>Value</th><th>Status</th></tr></thead>
          <tbody>
            <tr>
              <td><strong>Score ≥ 3</strong></td>
              <td>Multi-factor bullish</td>
              <td>{today.score >= 3 ? '✅' : '❌'} Score = {today.score}</td>
            </tr>
            {configTab !== 'vanilla' && (
              <tr>
                <td><strong>{instTab} {'>'} SMA(50)</strong></td>
                <td>Regime filter</td>
                <td>{today.aboveSma50 ? '✅' : '❌'} {today.close} vs {today.sma50}</td>
              </tr>
            )}
            {configTab !== 'vanilla' && (
              <tr>
                <td><strong>Not Paused</strong></td>
                <td>After 2 consecutive losses</td>
                <td>{cfg.paused ? '❌ PAUSED' : '✅ Active'}</td>
              </tr>
            )}
            <tr>
              <td><strong>Exit</strong></td>
              <td>{configTab === 'vanilla' ? 'Next day close' : configTab === 'trail3d' ? 'Trail stop or 3d max' : 'Trail stop only'}</td>
              <td>—</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Signal Breakdown */}
      <div className="card">
        <h3>Signal Breakdown — {today.date}</h3>
        {today.signals.length > 0 ? (
          <table>
            <thead><tr><th>Signal</th><th>Points</th><th>Type</th></tr></thead>
            <tbody>
              {today.signals.map((s, i) => (
                <tr key={i}>
                  <td><strong>{s.name}</strong></td>
                  <td style={{color: s.type === 'bull' ? '#4ade80' : '#f87171', fontWeight:700}}>
                    {s.points > 0 ? '+' : ''}{s.points}
                  </td>
                  <td>{s.type === 'bull' ? '🟢' : '🔴'}</td>
                </tr>
              ))}
              <tr style={{borderTop:'2px solid #3a3d4a'}}>
                <td><strong>Total</strong></td>
                <td style={{fontWeight:800, fontSize:18, color: today.score >= 3 ? '#4ade80' : '#f87171'}}>{today.score}</td>
                <td>{today.score >= 3 ? '✅ ENTRY' : '❌ No entry'}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p style={{color:'#8e8e9a'}}>No signals fired. Neutral conditions.</p>
        )}
      </div>

      {/* Open Position */}
      {position && (
        <div className="card" style={{borderLeft:'3px solid #3b82f6'}}>
          <h3 style={{color:'#3b82f6'}}>📈 Open Position — {instTab} {CONFIG_LABELS[configTab]}</h3>
          <table>
            <thead><tr><th>Metric</th><th>Value</th></tr></thead>
            <tbody>
              <tr><td><strong>Entry Date</strong></td><td>{position.entryDate}</td></tr>
              <tr><td><strong>Entry Price</strong></td><td>{position.entryPrice}</td></tr>
              <tr><td><strong>Days Held</strong></td><td>{position.daysHeld}</td></tr>
              <tr><td><strong>Current R</strong></td><td style={{color: position.currentR >= 0 ? '#4ade80' : '#f87171', fontWeight:700, fontSize:18}}>
                {position.currentR > 0 ? '+' : ''}{position.currentR}R
              </td></tr>
              <tr><td><strong>Trail Active</strong></td><td>{position.trailActive ? '✅ Yes' : '⏳ Not yet'}</td></tr>
              {position.trailActive && <>
                <tr><td><strong>Highest Close</strong></td><td>{position.highestClose}</td></tr>
                <tr><td><strong>Trail Stop</strong></td><td style={{color:'#f59e0b', fontWeight:700}}>{position.trailStop}</td></tr>
              </>}
              {!position.trailActive && (
                <tr><td><strong>Activation Level</strong></td><td>{position.activationLevel} (+1.5R)</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Market Context */}
      <div className="card">
        <h3>Market Context — {instTab}</h3>
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))', gap:12}}>
          {[
            { label: `${instTab} Close`, value: today.close, color: '#d1d1d8' },
            { label: 'SMA(50)', value: today.sma50, color: today.aboveSma50 ? '#4ade80' : '#f87171' },
            { label: 'RSI(5)', value: today.rsi5, color: today.rsi5 < 35 ? '#4ade80' : today.rsi5 > 75 ? '#f87171' : '#d1d1d8' },
            { label: 'VIX', value: today.vix, color: today.vix > 25 ? '#f59e0b' : '#d1d1d8' },
            { label: 'ATR(14)', value: today.atr, color: '#d1d1d8' },
            { label: 'Score', value: today.score, color: today.score >= 3 ? '#4ade80' : '#8e8e9a' },
          ].map(m => (
            <div key={m.label} style={{textAlign:'center', padding:14, background:'#1e293b', borderRadius:8}}>
              <div style={{fontSize:11, color:'#8e8e9a'}}>{m.label}</div>
              <div style={{fontSize:20, fontWeight:700, color: m.color}}>{m.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* All Instruments Overview */}
      <div className="card">
        <h3>All Instruments — {CONFIG_LABELS[configTab]}</h3>
        <table>
          <thead><tr><th>Instrument</th><th>Date</th><th>Score</th><th>Signal</th><th>Status</th><th>Trades</th><th>Win%</th><th>P&L</th></tr></thead>
          <tbody>
            {instKeys.map(key => {
              const r = instruments[key]
              const t = r.today
              const s = r.configSummaries[configTab]
              const c = t.configs[configTab]
              return (
                <tr key={key} style={{background: key === instTab ? '#1e293b' : 'transparent', cursor:'pointer'}} onClick={() => setInstTab(key)}>
                  <td><strong>{key}</strong></td>
                  <td>{t.date}</td>
                  <td style={{fontWeight:700, color: t.score >= 3 ? '#4ade80' : '#8e8e9a'}}>{t.score}</td>
                  <td>{t.entrySignal ? '🟢 YES' : '—'}</td>
                  <td style={{fontSize:12}}>{c?.status}</td>
                  <td>{s?.totalTrades}</td>
                  <td>{s?.winRate}%</td>
                  <td style={{color: (s?.totalPnl || 0) >= 0 ? '#4ade80' : '#f87171'}}>{fmt$(s?.totalPnl || 0)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Daily Score History — full transparency */}
      <div className="card">
        <h3>Daily Score History — {instTab} (last 60 days)</h3>
        <p style={{color:'#8e8e9a', fontSize:12, marginBottom:12}}>Every day's score. Green = entry signal (≥3). Shows why there's no trade when score is low.</p>
        <div style={{overflowX:'auto', maxHeight:450}}>
          <table style={{fontSize:'0.78rem'}}>
            <thead><tr><th>Date</th><th>Close</th><th>Score</th><th>RSI(5)</th><th>VIX</th><th>Bullish Signals</th><th>Bearish Signals</th></tr></thead>
            <tbody>
              {[...history].reverse().map((r, i) => {
                const bullSignals = (r.signals || []).filter(s => s.type === 'bull').map(s => `${s.name} (+${s.points})`).join(', ')
                const bearSignals = (r.signals || []).filter(s => s.type === 'bear').map(s => `${s.name} (${s.points})`).join(', ')
                return (
                  <tr key={i} style={r.score >= 3 ? {background:'rgba(74,222,128,0.08)'} : {}}>
                    <td style={{whiteSpace:'nowrap'}}>{r.date}</td>
                    <td>{r.close?.toLocaleString()}</td>
                    <td style={{fontWeight:700, color: r.score >= 3 ? '#4ade80' : r.score >= 1 ? '#fbbf24' : r.score <= -2 ? '#ef4444' : '#8e8e9a'}}>{r.score}</td>
                    <td>{r.rsi5?.toFixed(1)}</td>
                    <td>{r.vix?.toFixed(1)}</td>
                    <td style={{color:'#4ade80', maxWidth:250}}>{bullSignals || '—'}</td>
                    <td style={{color:'#ef4444', maxWidth:250}}>{bearSignals || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Signal History */}
      <div className="card">
        <h3>Recent Entry Signals — {instTab} (Score ≥ 3)</h3>
        {recentEntries.length > 0 ? (
          <div style={{overflowX:'auto', maxHeight:350}}>
            <table>
              <thead><tr><th>Date</th><th>Close</th><th>Score</th><th>Signals</th><th>Vanilla</th><th>Trail 3d</th><th>Forever</th></tr></thead>
              <tbody>
                {[...recentEntries].reverse().map((r, i) => (
                  <tr key={i}>
                    <td>{r.date}</td>
                    <td>{r.close}</td>
                    <td style={{fontWeight:700, color:'#4ade80'}}>{r.score}</td>
                    <td style={{fontSize:11, color:'#8e8e9a', maxWidth:220}}>
                      {r.signals.filter(s => s.type === 'bull').map(s => s.name).join(', ')}
                    </td>
                    <td style={{fontSize:12}}>{r.configs.vanilla?.status}</td>
                    <td style={{fontSize:12}}>{r.configs.trail3d?.status}</td>
                    <td style={{fontSize:12}}>{r.configs.forever?.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{color:'#8e8e9a'}}>No entry signals in the last 60 trading days for {instTab}.</p>
        )}
      </div>

      {/* How to Use */}
      <div className="card" style={{borderLeft:'3px solid #f59e0b'}}>
        <h3>📋 Daily Workflow</h3>
        <ol style={{lineHeight:2.2, color:'#d1d1d8'}}>
          <li><strong>3:20 PM ET</strong> — Data auto-refreshes (GitHub Action fetches Google Sheets)</li>
          <li><strong>3:25 PM ET</strong> — Check this page. Look for 🟢 on any instrument tab</li>
          <li><strong>3:50 PM ET</strong> — If signal is GO, place MOC order on the instrument</li>
          <li><strong>Daily</strong> — If in position, check trail stop level and manage exit</li>
        </ol>
        <p style={{color:'#8e8e9a', fontSize:12, marginTop:8}}>
          Data source: Google Sheets with GOOGLEFINANCE(). Refreshes last 5 days each run.
          Historical data preserved in repo CSVs.
        </p>
      </div>
    </div>
  )
}
