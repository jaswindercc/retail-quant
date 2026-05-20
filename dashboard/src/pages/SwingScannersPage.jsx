import React, { useState } from 'react'
import { Link } from 'react-router-dom'

const SCANNERS = [
  {
    key: 'bounce',
    label: 'MA Bounce v1',
    path: '/bounce',
    timeframe: 'Daily',
    description: 'Pullback to EMA20 in uptrend — catches entries inside existing trends.',
    conditions: [
      'Close > SMA(50) — uptrend filter',
      'Yesterday Low ≤ EMA(20) + 0.5×ATR(14) — touched the EMA',
      'Today Close > EMA(20) — bounced back above',
      'Close − EMA(20) ≤ 3×ATR(14) — not over-extended',
    ],
    tvScreener: [
      'Close > Simple Moving Average (50)',
      'Low[1] ≤ Exponential Moving Average (20) × 1.02',
      'Close > Exponential Moving Average (20)',
      'Close − Exponential Moving Average (20) < Average True Range (14) × 3',
    ],
    tvAlert: 'EMA(20) on Daily chart. Set alert: "Crossing Up" on EMA(20). Filter: Close > SMA(50).',
  },
  {
    key: 'breakout',
    label: 'Breakout v1',
    path: '/breakout',
    timeframe: 'Daily',
    description: 'Price breaks above 20-day Donchian high — momentum breakout in uptrend.',
    conditions: [
      'Close > SMA(50) — uptrend filter',
      'Close > Highest High of last 20 bars — Donchian breakout',
      'Close − SMA(50) ≤ 4×ATR(14) — not over-extended',
      'Bar range (H−L) ≤ 2.5×ATR(14) — no blow-off candle',
    ],
    tvScreener: [
      'Close > Simple Moving Average (50)',
      'Close > Donchian Channel Upper (20)',
      'Close − Simple Moving Average (50) < Average True Range (14) × 4',
    ],
    tvAlert: 'Donchian Channel (20) on Daily chart. Set alert: "Crossing Up" on Donchian Upper. Filter: Close > SMA(50).',
  },
  {
    key: 'trendline',
    label: 'Trendline v1',
    path: '/trendline',
    timeframe: 'Daily',
    description: 'Price bounces off a rising trendline drawn from recent pivot lows.',
    conditions: [
      'Close > SMA(50) — uptrend filter',
      'Two recent pivot lows (5-bar each side) with positive slope',
      'Yesterday Low touched the rising trendline (within 0.5×ATR)',
      'Today Close bounced above the trendline',
    ],
    tvScreener: [
      'Close > Simple Moving Average (50)',
      '⚠️ No native TradingView screener for trendlines — use visual scan or Pine indicator',
    ],
    tvAlert: 'Use a Pine Script indicator that draws auto-trendlines and alerts on touch. Apply to Daily chart. Filter: Close > SMA(50).',
  },
  {
    key: 'rsi',
    label: 'RSI Trend v1',
    path: '/rsi',
    timeframe: 'Daily',
    description: 'RSI crosses above 50 — momentum shifts bullish while in uptrend.',
    conditions: [
      'Close > SMA(50) — uptrend filter',
      'RSI(14) crosses above 50 from below',
      'Close − SMA(50) ≤ 4×ATR(14) — not over-extended',
      'Bar range (H−L) ≤ 2.5×ATR(14) — normal bar',
    ],
    tvScreener: [
      'Close > Simple Moving Average (50)',
      'RSI (14) > 50',
      'RSI (14) [1 bar ago] < 50',
    ],
    tvAlert: 'RSI(14) on Daily chart. Set alert: "Crossing Up" on level 50. Filter: Close > SMA(50).',
  },
  {
    key: 'sr',
    label: 'S/R Bounce v1',
    path: '/sr',
    timeframe: 'Daily',
    description: 'Price bounces off a horizontal support level (recent pivot low).',
    conditions: [
      'Close > SMA(50) — uptrend filter',
      'Identified pivot low (5-bar) within last 60 bars as support',
      'Yesterday Low touched support (within ±0.5×ATR)',
      'Today Close bounced above the support level',
    ],
    tvScreener: [
      'Close > Simple Moving Average (50)',
      '⚠️ No native screener for pivot-based S/R — use visual scan or Pine indicator',
    ],
    tvAlert: 'Mark horizontal support levels manually on Daily chart. Set price alert at each level. Filter: Close > SMA(50).',
  },
  {
    key: 'fvg',
    label: 'FVG v1',
    path: '/fvg',
    timeframe: 'Daily',
    description: 'Price pulls back into a bullish Fair Value Gap and bounces.',
    conditions: [
      'Close > SMA(50) — uptrend filter',
      'Bullish FVG exists: bar[i-2] High < bar[i] Low (gap between)',
      'Impulse candle body ≥ 0.5×ATR(14)',
      'Today Low pulls into the FVG zone, Close > FVG midpoint',
      'FVG is < 30 bars old and not filled',
    ],
    tvScreener: [
      'Close > Simple Moving Average (50)',
      '⚠️ No native screener for FVG — use a Fair Value Gap Pine indicator with alerts',
    ],
    tvAlert: 'Use a Pine FVG indicator (many free ones on TradingView). Set alert on "Bullish FVG Pullback". Filter: Close > SMA(50).',
  },
  {
    key: 'tr',
    label: 'Trend Rider v1',
    path: '/trend-rider',
    timeframe: 'Daily',
    description: 'SMA(10) crosses SMA(50) — classic trend-following crossover.',
    conditions: [
      'LONG: SMA(10) crosses above SMA(50) on this bar',
      'Distance: |Close − SMA(10)| ≤ 3×ATR(14)',
      'Bar range (H−L) ≤ 2×ATR(14)',
      'SHORT: SMA(10) crosses below SMA(50) + Close < SMA(200) + ATR contracting',
    ],
    tvScreener: [
      'SMA (10) > SMA (50) — for longs',
      'SMA (10) [1 bar ago] < SMA (50) [1 bar ago] — confirms crossover just happened',
      'For shorts: add SMA (10) < SMA (50) AND Close < SMA (200)',
    ],
    tvAlert: 'Add SMA(10) and SMA(50) to Daily chart. Set alert: SMA(10) "Crossing Up" SMA(50) for longs. "Crossing Down" for shorts (add SMA 200 filter).',
  },
  {
    key: 'vol',
    label: 'Volume v1',
    path: '/volume',
    timeframe: 'Daily',
    description: 'Volume spike (1.5× avg) on a bullish candle near 20-day high.',
    conditions: [
      'Close > SMA(50) — uptrend filter',
      'Volume > 1.5× SMA(20) of Volume — spike',
      'Close > Open AND Close > previous Close — bullish',
      'Close ≥ 98% of 20-bar highest high — near highs',
    ],
    tvScreener: [
      'Close > Simple Moving Average (50)',
      'Volume > Volume Moving Average (20) × 1.5',
      'Change > 0 (up day)',
      'Close near Highest High (20) — within 2%',
    ],
    tvAlert: 'Set volume alert: Volume "Greater Than" 1.5× its 20-bar SMA. Filter: Close > SMA(50), green candle, near 20-bar high.',
  },
  {
    key: 'vcp',
    label: 'VCP v1',
    path: '/vcp',
    timeframe: 'Daily',
    description: 'Volatility Contraction Pattern — ATR shrinking, range tightening, breakout near highs.',
    conditions: [
      'Close > SMA(50) — Stage 2 uptrend',
      'ATR(14) < SMA(20) of ATR — volatility contracting',
      '10-bar range < 10-bar range from 15 bars ago — range shrinking',
      'Close within 8% of 50-bar high — near highs',
      'Close breaks above 10-bar highest high — breakout',
      'Volume ≥ 0.8× 20-bar avg volume — decent participation',
    ],
    tvScreener: [
      'Close > Simple Moving Average (50)',
      'Average True Range (14) < its own 20-bar SMA (hard to do natively — use Pine)',
      '⚠️ Full VCP is best scanned with a custom Pine indicator',
    ],
    tvAlert: 'Use a VCP/Contraction Pine indicator. Alert on breakout above 10-bar high. Filter: Close > SMA(50), ATR declining.',
  },
  {
    key: 'meanrev',
    label: 'Mean Rev v1',
    path: '/meanrev',
    timeframe: 'Daily',
    description: '3 consecutive down closes in an uptrend — buy the dip.',
    conditions: [
      'Close > SMA(50) — uptrend filter',
      'Close < Close[1] < Close[2] < Close[3] — 3 consecutive red closes',
      'Bar range (H−L) ≤ 3×ATR(14) — no crash bar',
    ],
    tvScreener: [
      'Close > Simple Moving Average (50)',
      'Change < 0 (today)',
      'Change [1 bar ago] < 0',
      'Change [2 bars ago] < 0',
    ],
    tvAlert: 'No single alert works. Scan daily after close: filter for Close > SMA(50) and 3 consecutive red candles. Easy in screener.',
  },
]

export default function SwingScannersPage() {
  const [activeTab, setActiveTab] = useState(SCANNERS[0].key)
  const active = SCANNERS.find(s => s.key === activeTab)

  return (
    <div>
      <h1 className="page-title">Swing Scanners <span>TradingView setup guide for each strategy</span></h1>

      <div className="card">
        <h3>How to Use</h3>
        <div style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.8 }}>
          <p style={{ margin: '0 0 12px' }}>Each strategy below has specific entry conditions you can scan for in TradingView. Two approaches:</p>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li><strong>TradingView Screener</strong> — use the Stock Screener (bottom panel) with the filters listed below. Won't catch every condition but gets you 80% there.</li>
            <li><strong>Pine Script Alert</strong> — add the indicators to a chart and set crossing alerts. More precise, fires automatically.</li>
          </ol>
          <p style={{ margin: '12px 0 0', color: '#f59e0b' }}>⚠️ All strategies use <strong>Daily timeframe</strong>. Scan after market close, enter at next day's open or set MOC orders.</p>
        </div>
      </div>

      {/* Strategy tabs */}
      <div className="tab-bar">
        {SCANNERS.map(s => (
          <button key={s.key} className={activeTab === s.key ? 'active' : ''} onClick={() => setActiveTab(s.key)}>
            {s.label}
          </button>
        ))}
      </div>

      {active && (
        <div className="card" style={{ marginTop: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>
              <Link to={active.path} style={{ color: 'var(--blue)', textDecoration: 'none' }}>{active.label}</Link>
            </h3>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Timeframe: {active.timeframe}</span>
          </div>
          <p style={{ margin: '0 0 16px', fontSize: 15, color: 'var(--text)', lineHeight: 1.6 }}>{active.description}</p>

          {/* Entry Conditions */}
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ margin: '0 0 8px', fontSize: 15, color: '#4ade80' }}>Entry Conditions</h4>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 2 }}>
              {active.conditions.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>

          {/* TradingView Screener Setup */}
          <div style={{ marginBottom: 20, padding: 16, background: 'rgba(68,138,255,0.06)', borderRadius: 8, borderLeft: '3px solid var(--blue)' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: 15, color: 'var(--blue)' }}>📊 TradingView Screener Filters</h4>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 2, color: 'var(--text)' }}>
              {active.tvScreener.map((s, i) => (
                <li key={i} style={s.startsWith('⚠️') ? { color: '#f59e0b' } : {}}>{s}</li>
              ))}
            </ol>
          </div>

          {/* Alert Setup */}
          <div style={{ padding: 16, background: 'rgba(0,230,118,0.06)', borderRadius: 8, borderLeft: '3px solid #00e676' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: 15, color: '#00e676' }}>🔔 Alert Setup</h4>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7 }}>{active.tvAlert}</p>
          </div>

          {/* Link to backtest */}
          <div style={{ marginTop: 16, fontSize: 14, color: 'var(--muted)' }}>
            → <Link to={active.path}>View {active.label} backtest results</Link>
          </div>
        </div>
      )}

      {/* Quick Reference Table */}
      <div className="card" style={{ marginTop: 20 }}>
        <h3>Quick Reference — All Strategies</h3>
        <table>
          <thead>
            <tr><th>Strategy</th><th>Core Signal</th><th>Screener Difficulty</th><th>Best Approach</th></tr>
          </thead>
          <tbody>
            {SCANNERS.map(s => (
              <tr key={s.key}>
                <td><Link to={s.path} style={{ fontWeight: 600 }}>{s.label}</Link></td>
                <td style={{ fontSize: 13 }}>{s.conditions[s.conditions.length > 2 ? 1 : 0]}</td>
                <td>{s.tvScreener.some(x => x.startsWith('⚠️'))
                  ? <span style={{ color: '#f59e0b' }}>🟡 Needs Pine</span>
                  : <span style={{ color: '#4ade80' }}>🟢 Native</span>
                }</td>
                <td style={{ fontSize: 13 }}>{s.tvScreener.some(x => x.startsWith('⚠️')) ? 'Pine indicator + alert' : 'Stock Screener'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
