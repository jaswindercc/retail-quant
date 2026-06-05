import React, { useState, useEffect } from 'react'
import { useParams, NavLink } from 'react-router-dom'
import { fetchJson, fmt$ } from '../utils'

const COMBO_INFO = {
  '2D-1-2U': { name: '2D-1-2U Reversal', type: 'Reversal', dir: 'LONG' },
  '2U-1-2D': { name: '2U-1-2D Reversal', type: 'Reversal', dir: 'SHORT' },
  '2U-1-2U': { name: '2U-1-2U Continuation', type: 'Continuation', dir: 'LONG' },
  '2D-1-2D': { name: '2D-1-2D Continuation', type: 'Continuation', dir: 'SHORT' },
  '3-1-2U': { name: '3-1-2U Outside Squeeze', type: 'Squeeze', dir: 'LONG' },
  '3-1-2D': { name: '3-1-2D Outside Squeeze', type: 'Squeeze', dir: 'SHORT' },
  '2D-1-1-2U': { name: '2D-1-1-2U Compound', type: 'Compound', dir: 'LONG' },
  '2U-1-1-2D': { name: '2U-1-1-2D Compound', type: 'Compound', dir: 'SHORT' },
  '1-1-2U': { name: '1-1-2U Double Inside', type: 'Compression', dir: 'LONG' },
  '1-1-2D': { name: '1-1-2D Double Inside', type: 'Compression', dir: 'SHORT' },
  '1-1-1-2U': { name: '1-1-1-2U Triple Inside', type: 'Mega Comp.', dir: 'LONG' },
  '1-1-1-2D': { name: '1-1-1-2D Triple Inside', type: 'Mega Comp.', dir: 'SHORT' },
  '3-2D-1-2U': { name: '3-2D-1-2U Complex', type: 'Complex', dir: 'LONG' },
  '3-2U-1-2D': { name: '3-2U-1-2D Complex', type: 'Complex', dir: 'SHORT' },
  '1-2D-2U': { name: '1-2D-2U Rev Strat', type: 'RevStrat', dir: 'LONG' },
  '1-2U-2D': { name: '1-2U-2D Rev Strat', type: 'RevStrat', dir: 'SHORT' },
}

const VAR_INFO = {
  'fixed_2R': { name: 'Fixed 2R', icon: '🎯' },
  'fixed_3R': { name: 'Fixed 3R', icon: '🎯' },
  'partial_1R_2R': { name: 'Partial 1R→2R', icon: '✂️' },
  'swing_target': { name: 'Swing Target', icon: '📐' },
  'tfc_fixed_2R': { name: 'TFC + 2R', icon: '📅' },
  'tfc_swing': { name: 'TFC + Swing', icon: '📅' },
  'narrowing_2R': { name: 'Narrowing + 2R', icon: '🔽' },
  'magnitude_filter': { name: 'Magnitude + 2R', icon: '📏' },
  'volume_confirm': { name: 'Volume Confirm', icon: '📊' },
  'full_strat': { name: 'Full System', icon: '⚡' },
}

function aggregateStockTrades(comboDetails, symbol) {
  const byVariation = {}
  const byCombo = {}
  const byComboVar = []

  for (const [key, stocksObj] of Object.entries(comboDetails)) {
    const trades = stocksObj[symbol]
    if (!trades || !trades.length) continue

    const [variation, ...comboParts] = key.split('__')
    const combo = comboParts.join('__')

    // By variation
    if (!byVariation[variation]) byVariation[variation] = { trades: [], wins: 0, pnl: 0 }
    byVariation[variation].trades.push(...trades)
    byVariation[variation].pnl += trades.reduce((s, t) => s + t.pnlDollar, 0)
    byVariation[variation].wins += trades.filter(t => t.pnlDollar > 0).length

    // By combo
    if (!byCombo[combo]) byCombo[combo] = { trades: [], wins: 0, pnl: 0 }
    byCombo[combo].trades.push(...trades)
    byCombo[combo].pnl += trades.reduce((s, t) => s + t.pnlDollar, 0)
    byCombo[combo].wins += trades.filter(t => t.pnlDollar > 0).length

    // By combo+variation
    const pnl = trades.reduce((s, t) => s + t.pnlDollar, 0)
    const wins = trades.filter(t => t.pnlDollar > 0).length
    byComboVar.push({ combo, variation, trades: trades.length, wins, pnl, winRate: (wins / trades.length * 100) })
  }

  return { byVariation, byCombo, byComboVar }
}

export default function StratStockPage() {
  const { symbol } = useParams()
  const [data, setData] = useState(null)

  useEffect(() => {
    fetchJson(`${import.meta.env.BASE_URL}strat_data.json`)
      .then(setData)
  }, [])

  if (!data) return <div className="main"><p>Loading STRAT data for {symbol}...</p></div>

  const stocks = Object.keys(data.stocks || {})
  const { byVariation, byCombo, byComboVar } = aggregateStockTrades(data.comboDetails || {}, symbol)

  // Rank variations
  const varRanking = Object.entries(byVariation)
    .map(([v, d]) => ({
      variation: v,
      name: VAR_INFO[v]?.name || v,
      icon: VAR_INFO[v]?.icon || '',
      trades: d.trades.length,
      wins: d.wins,
      winRate: (d.wins / d.trades.length * 100),
      pnl: d.pnl,
      perTrade: d.pnl / d.trades.length,
      profitFactor: calcPF(d.trades),
    }))
    .sort((a, b) => b.pnl - a.pnl)

  // Rank combos
  const comboRanking = Object.entries(byCombo)
    .map(([c, d]) => ({
      combo: c,
      name: COMBO_INFO[c]?.name || c,
      type: COMBO_INFO[c]?.type || '',
      dir: COMBO_INFO[c]?.dir || '',
      trades: d.trades.length,
      wins: d.wins,
      winRate: (d.wins / d.trades.length * 100),
      pnl: d.pnl,
      perTrade: d.pnl / d.trades.length,
    }))
    .sort((a, b) => b.pnl - a.pnl)

  // Top combo+variation combos (best specific configs)
  const topConfigs = [...byComboVar]
    .filter(c => c.trades >= 3)
    .sort((a, b) => b.pnl - a.pnl)
    .slice(0, 15)

  // Worst configs
  const worstConfigs = [...byComboVar]
    .filter(c => c.trades >= 3)
    .sort((a, b) => a.pnl - b.pnl)
    .slice(0, 10)

  const totalPnl = Object.values(byVariation).reduce((s, v) => s + v.pnl, 0) / (Object.keys(byVariation).length || 1)
  const bestVarEntry = varRanking[0]
  const bestComboEntry = comboRanking[0]

  return (
    <div>
      <h1 className="page-title">{symbol} — STRAT Analysis <span>Which combos & variations work best for this stock</span></h1>

      {/* Stock nav */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '1.5rem' }}>
        {stocks.map(s => (
          <NavLink key={s} to={`/the-strat/stock/${s}`}
            className={({isActive}) => `pill ${isActive ? 'pill-active' : ''}`}
            style={({isActive}) => ({
              padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600,
              background: isActive ? '#00e676' : '#2a2a3e', color: isActive ? '#000' : '#ccc',
              textDecoration: 'none', border: '1px solid ' + (isActive ? '#00e676' : '#444')
            })}
          >{s}</NavLink>
        ))}
      </div>

      {/* Bottom Line for this stock */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', border: '2px solid #00e676', padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#00e676', margin: '0 0 1rem 0' }}>Bottom Line for {symbol}</h2>
        <div style={{ fontSize: '1rem', lineHeight: 1.8, color: '#e0e0e0' }}>
          {bestVarEntry && <p style={{ margin: '0 0 0.5rem' }}>
            <strong style={{ color: '#fff' }}>Best Variation:</strong>{' '}
            <strong style={{ color: '#00e676' }}>{bestVarEntry.icon} {bestVarEntry.name}</strong>{' '}
            — {fmt$(bestVarEntry.pnl)} from {bestVarEntry.trades} trades ({bestVarEntry.winRate.toFixed(0)}% WR, PF {bestVarEntry.profitFactor})
          </p>}
          {bestComboEntry && <p style={{ margin: '0 0 0.5rem' }}>
            <strong style={{ color: '#fff' }}>Best Combo:</strong>{' '}
            <strong style={{ color: '#64b5f6' }}>{bestComboEntry.name}</strong>{' '}
            — {fmt$(bestComboEntry.pnl)} from {bestComboEntry.trades} trades ({bestComboEntry.winRate.toFixed(0)}% WR)
          </p>}
          {topConfigs[0] && <p style={{ margin: '0' }}>
            <strong style={{ color: '#fff' }}>Best Config:</strong>{' '}
            <span style={{ color: '#ffd54f' }}>{COMBO_INFO[topConfigs[0].combo]?.name || topConfigs[0].combo} + {VAR_INFO[topConfigs[0].variation]?.name || topConfigs[0].variation}</span>{' '}
            — {fmt$(topConfigs[0].pnl)} ({topConfigs[0].trades} trades, {topConfigs[0].winRate.toFixed(0)}% WR)
          </p>}
        </div>
      </div>

      {/* Variation Ranking */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Variation Ranking for {symbol}</h2>
        <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1rem' }}>Which approach (exit/filter method) works best on this stock</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Variation</th>
                <th>Trades</th>
                <th>Win%</th>
                <th>PF</th>
                <th>$/Trade</th>
                <th>Total P&L</th>
              </tr>
            </thead>
            <tbody>
              {varRanking.map((v, i) => (
                <tr key={v.variation} style={v.pnl < 0 ? { opacity: 0.6 } : {}}>
                  <td>{i + 1}</td>
                  <td>{v.icon} {v.name}</td>
                  <td>{v.trades}</td>
                  <td>{v.winRate.toFixed(1)}%</td>
                  <td>{v.profitFactor}</td>
                  <td style={{ color: v.perTrade >= 0 ? '#00e676' : '#ff5252' }}>{fmt$(v.perTrade)}</td>
                  <td style={{ color: v.pnl >= 0 ? '#00e676' : '#ff5252', fontWeight: 700 }}>{fmt$(v.pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Combo Ranking */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Combo Ranking for {symbol}</h2>
        <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1rem' }}>Which candlestick pattern (combo) works best on this stock across all variations</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Combo</th>
                <th>Type</th>
                <th>Dir</th>
                <th>Trades</th>
                <th>Win%</th>
                <th>$/Trade</th>
                <th>Total P&L</th>
              </tr>
            </thead>
            <tbody>
              {comboRanking.map((c, i) => (
                <tr key={c.combo} style={c.pnl < 0 ? { opacity: 0.6 } : {}}>
                  <td>{i + 1}</td>
                  <td style={{ fontSize: '0.8rem' }}>{c.name}</td>
                  <td><span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '3px', background: '#333' }}>{c.type}</span></td>
                  <td style={{ color: c.dir === 'LONG' ? '#4caf50' : '#ef5350', fontWeight: 600, fontSize: '0.75rem' }}>{c.dir}</td>
                  <td>{c.trades}</td>
                  <td>{c.winRate.toFixed(1)}%</td>
                  <td style={{ color: c.perTrade >= 0 ? '#00e676' : '#ff5252' }}>{fmt$(c.perTrade)}</td>
                  <td style={{ color: c.pnl >= 0 ? '#00e676' : '#ff5252', fontWeight: 700 }}>{fmt$(c.pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Configs - Best specific combo+variation pairs */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#00e676' }}>✅ Best Configs for {symbol}</h2>
        <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1rem' }}>Top specific combo + variation pairs (min 3 trades)</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Combo</th>
                <th>Variation</th>
                <th>Trades</th>
                <th>Win%</th>
                <th>Total P&L</th>
              </tr>
            </thead>
            <tbody>
              {topConfigs.map((c, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td style={{ fontSize: '0.8rem' }}>{COMBO_INFO[c.combo]?.name || c.combo}</td>
                  <td>{VAR_INFO[c.variation]?.icon} {VAR_INFO[c.variation]?.name || c.variation}</td>
                  <td>{c.trades}</td>
                  <td>{c.winRate.toFixed(1)}%</td>
                  <td style={{ color: '#00e676', fontWeight: 700 }}>{fmt$(c.pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Worst Configs */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#ff5252' }}>❌ Worst Configs for {symbol}</h2>
        <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1rem' }}>Avoid these — consistently lose money on this stock</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Combo</th>
                <th>Variation</th>
                <th>Trades</th>
                <th>Win%</th>
                <th>Total P&L</th>
              </tr>
            </thead>
            <tbody>
              {worstConfigs.map((c, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td style={{ fontSize: '0.8rem' }}>{COMBO_INFO[c.combo]?.name || c.combo}</td>
                  <td>{VAR_INFO[c.variation]?.icon} {VAR_INFO[c.variation]?.name || c.variation}</td>
                  <td>{c.trades}</td>
                  <td>{c.winRate.toFixed(1)}%</td>
                  <td style={{ color: '#ff5252', fontWeight: 700 }}>{fmt$(c.pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function calcPF(trades) {
  const gross = trades.filter(t => t.pnlDollar > 0).reduce((s, t) => s + t.pnlDollar, 0)
  const loss = Math.abs(trades.filter(t => t.pnlDollar < 0).reduce((s, t) => s + t.pnlDollar, 0))
  return loss === 0 ? '∞' : (gross / loss).toFixed(2)
}
