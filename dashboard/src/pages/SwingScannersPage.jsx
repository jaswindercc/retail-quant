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
      'Simple Moving Average (50) < Price',
      'Exponential Moving Average (20) ≥ Low',
      'Exponential Moving Average (20) < Price',
    ],
    tvNote: 'The backtest uses "Low ≤ EMA20 + 0.5×ATR" (a tolerance buffer so near-misses count too) and checks yesterday\'s bar. The screener can\'t do math between indicators or look back 1 bar — so we use today\'s Low ≤ EMA(20) instead. This is stricter (only catches real touches) which is fine. The "not over-extended" filter also needs math — skip it, eyeball the chart.',
    tvAlert: 'Add EMA(20) to a Daily chart → Create Alert → Condition: Price → Crossing Up → EMA(20).',
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
      'Simple Moving Average (50) < Price',
      'Donchian Channels (20) Upper Line < Price',
      'Change % > 0',
    ],
    tvNote: 'The "not over-extended" and "no blow-off candle" filters need math between indicators (e.g. Close − SMA ≤ 4×ATR). The screener can\'t do this. Skip them — just avoid stocks that gapped 5%+ on earnings or look obviously extended. These filters only remove ~3% of signals.',
    tvAlert: 'Add Donchian Channel (20) to Daily chart → Create Alert → Condition: Price → Crossing Up → DC Upper Band.',
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
      'Simple Moving Average (50) < Price',
    ],
    tvNote: 'Trendlines are diagonal lines connecting pivot lows — no screener can detect them. Use filter #1 to get your uptrending stock list, then flip through charts looking for price touching a rising trendline. This strategy requires chart reading.',
    cantScan: true,
    tvAlert: 'Draw trendlines manually on charts → Set Price Alert at the trendline level → Confirm bounce when triggered.',
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
      'Simple Moving Average (50) < Price',
      'Relative Strength Index (14) Crossing Up 50',
    ],
    tvNote: 'This scans perfectly with just 2 filters! The "not over-extended" and "normal bar" filters need ATR math — skip them, they only filter out ~5% of signals on extreme gap days.',
    tvAlert: 'Add RSI(14) to Daily chart → Create Alert → Condition: RSI(14) → Crossing Up → 50.',
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
      'Simple Moving Average (50) < Price',
    ],
    tvNote: 'Support levels are previous pivot lows — the screener doesn\'t know where these are. Use filter #1 to get uptrending stocks, then visually scan for pullbacks to obvious horizontal price floors.',
    cantScan: true,
    tvAlert: 'Mark support levels on your charts → Set Price Alert at each level → Check for bounce candle when triggered.',
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
      'Simple Moving Average (50) < Price',
    ],
    tvNote: 'Fair Value Gaps need multi-bar comparison (bar[i-2].High vs bar[i].Low) — no screener supports this. Use filter #1 for uptrend list, add a free "FVG" community indicator to charts, visually find pullbacks into unfilled gaps.',
    cantScan: true,
    tvAlert: 'Add a community "Fair Value Gap" indicator → Some have alerts for "price entering bullish FVG."',
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
      'Simple Moving Average (10) Crossing Up Simple Moving Average (50) — LONG',
      'Simple Moving Average (10) Crossing Down Simple Moving Average (50) — SHORT',
      'Simple Moving Average (200) > Price — add for SHORT only',
    ],
    tvNote: 'The MA crossover scans perfectly! The "distance ≤ 3×ATR" and "bar range" filters need math — skip them. They just prevent entries on wild gap days (rare). If the crossover candle looks normal, the signal is valid.',
    tvAlert: 'Add SMA(10) + SMA(50) to Daily chart → Create Alert → Condition: SMA(10) → Crossing Up → SMA(50) for longs.',
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
      'Simple Moving Average (50) < Price',
      'Relative Volume > 1.5',
      'Change % > 0',
    ],
    tvNote: 'The "near 20-bar high" condition needs math (Close ≥ 0.98 × Highest High 20). Skip it — you\'ll get more results but the core signal (volume spike + up day + uptrend) works. Eyeball: is the stock near recent highs? If yes, valid.',
    tvAlert: 'Create Alert → Condition: Volume → Greater Than → 1.5× its 20-period MA.',
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
      'Simple Moving Average (50) < Price',
      'Price to 52 Week High % between -10% and 0%',
      'Volatility (Week) < Volatility (Month)',
    ],
    tvNote: 'VCP is the hardest to scan. The screener gets you "uptrending + near highs + low volatility" but can\'t detect ATR contraction or range-tightening. Use these as a starting list, then visually look for tight sideways bases under resistance. Add a community VCP indicator for better detection.',
    tvAlert: 'Use a community VCP/Contraction indicator with alerts. Or watch for tight bases near 52w highs.',
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
      'Simple Moving Average (50) < Price',
      'Change % < 0',
      'Change % 1 Bar Ago < 0 — if plan supports lookback',
      'Change % 2 Bars Ago < 0 — if plan supports lookback',
    ],
    tvNote: 'If your plan doesn\'t support "X bars ago" lookback, just use filter #1 + #2 (uptrend + red today), then visually confirm 2 more red candles on the chart. The "no crash bar" filter needs math — skip it, avoid stocks down 8%+ in a day (obvious).',
    tvAlert: 'No single alert works. Run this scan daily after close — takes 30 seconds.',
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
          <p style={{ margin: '0 0 12px' }}>Each strategy below shows the exact filters to set in <strong>TradingView → Stock Screener</strong> (bottom panel).</p>
          <p style={{ margin: '0 0 12px' }}>The table shows exactly what to click: <strong>Filter</strong> (left dropdown) → <strong>Condition</strong> (middle) → <strong>Value</strong> (right dropdown or number).</p>
          <p style={{ margin: '0 0 12px', color: '#f59e0b' }}>⚠️ Some backtest conditions can't be replicated in the screener (they need math between indicators or lookback bars). These are explained below each table — they're usually safety filters, not the core signal.</p>
          <p style={{ margin: 0, color: '#4ade80' }}>✅ All strategies use <strong>Daily timeframe</strong>. Set screener to "1D" timeframe. Scan after market close.</p>
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

          {active.cantScan && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(245,158,11,0.1)', borderRadius: 8, fontSize: 14, color: '#f59e0b' }}>
              ⚠️ This strategy requires visual chart analysis — the screener can only pre-filter for uptrending stocks.
            </div>
          )}

          {/* Entry Conditions (from backtest) */}
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ margin: '0 0 8px', fontSize: 15, color: '#4ade80' }}>Entry Conditions (backtest logic)</h4>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 2 }}>
              {active.conditions.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>

          {/* TradingView Screener Filters */}
          <div style={{ marginBottom: 20, padding: 16, background: 'rgba(68,138,255,0.06)', borderRadius: 8, borderLeft: '3px solid var(--blue)' }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 15, color: 'var(--blue)' }}>📊 TradingView Screener — Exact Filters</h4>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 2.2, color: 'var(--text)' }}>
              {active.tvScreener.map((s, i) => (
                <li key={i} style={{ fontFamily: 'monospace', letterSpacing: '-0.3px' }}>{s}</li>
              ))}
            </ol>
          </div>

          {/* Why some filters are skipped */}
          {active.tvNote && (
            <div style={{ marginBottom: 20, padding: 16, background: 'rgba(245,158,11,0.06)', borderRadius: 8, borderLeft: '3px solid #f59e0b' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 15, color: '#f59e0b' }}>💡 What the screener can't do & why it's OK</h4>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8, color: 'var(--text)' }}>{active.tvNote}</p>
            </div>
          )}

          {/* Alert Setup */}
          <div style={{ padding: 16, background: 'rgba(0,230,118,0.06)', borderRadius: 8, borderLeft: '3px solid #00e676' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: 15, color: '#00e676' }}>🔔 Alert Setup (alternative to screener)</h4>
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
            <tr><th>Strategy</th><th># Filters</th><th>Scannable?</th><th>Best Approach</th></tr>
          </thead>
          <tbody>
            {SCANNERS.map(s => (
              <tr key={s.key}>
                <td><Link to={s.path} style={{ fontWeight: 600 }}>{s.label}</Link></td>
                <td>{s.tvScreener.length}</td>
                <td>{s.cantScan
                  ? <span style={{ color: '#f59e0b' }}>🟡 Visual scan only</span>
                  : <span style={{ color: '#4ade80' }}>🟢 Yes — Screener works</span>
                }</td>
                <td style={{ fontSize: 13 }}>{s.cantScan ? 'Filter uptrend → check charts' : 'Stock Screener filters above'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
