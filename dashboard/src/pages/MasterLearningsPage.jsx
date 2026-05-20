import React from 'react'

const LEARNINGS = [
  {
    category: 'Overnight Edge — Trail Stop Research',
    icon: '🌙',
    items: [
      {
        rule: 'Trail Forever is king — letting winners run indefinitely with a trailing stop beats every fixed holding period.',
        proof: 'Trail Forever: 90 trades, 67% WR, $20,193 P&L, $1,045 max DD = 19.3× return/drawdown ratio. Vanilla (1d hold): 264 trades, 56% WR, $7,894, 6.9× R/DD. Trail 3d: 94 trades, 69% WR, $10,084, 9.3× R/DD.',
        tested: 'Overnight Trail Stop Study — 3 configs compared on SPX data (2021–2026).'
      },
      {
        rule: 'SMA(50) filter is non-negotiable — without regime filtering, trailing stops amplify bear market losses.',
        proof: 'Unfiltered trailing stops get whipsawed in downtrends. Adding SPX > SMA(50) eliminates the worst drawdown periods while keeping the majority of winning trades.',
        tested: 'Overnight Trail Stop Study — Trail3d and Forever configs both use SMA50 + pause filter.'
      },
      {
        rule: 'Pause after 2 consecutive losses — stops bleeding during hostile regimes.',
        proof: 'Trail3d and Forever configs pause entry after 2 losses. This avoids the middle of bear markets where even the best setups fail repeatedly.',
        tested: 'Config comparison — Vanilla (no pause) vs Trail configs (with pause).'
      },
      {
        rule: 'Bonds and macro indicators add nothing beyond SPX > SMA(50).',
        proof: 'Tested TLT, IEF, BND as additional regime filters. None improved performance. The only regime to avoid is when SPX < SMA50 — bonds just add noise.',
        tested: 'Macro Overnight Study — tested bond ETFs as supplementary filters.'
      },
    ]
  },
  {
    category: 'Strategy Selection',
    icon: '🏆',
    items: [
      {
        rule: 'MA Bounce is the best strategy across 12 stocks.',
        proof: '$39,481 total P&L, wins or ties 10/12 stocks, 73 big wins (3R+). Beat Trend Rider ($26,907), Breakout ($22,178), RSI Trend ($16,685), and Mean Reversion ($7,920).',
        tested: 'Compare tab — 5-strategy head-to-head, 12 stocks, same risk ($100/trade), same exit (EMA20 trail at 2.5R).'
      },
      {
        rule: 'More trades = more edge captured. Don\'t fear low win rates.',
        proof: 'MA Bounce: 512 trades, 28.7% WR, $39,481. Mean Reversion: 198 trades, 30.8% WR, $7,920. More signals = more chances for big R winners.',
        tested: 'All 5 strategy backtests across 12 stocks.'
      },
    ]
  },
  {
    category: 'Trade Filtering — What Doesn\'t Work',
    icon: '🚫',
    items: [
      {
        rule: 'NO trade-skipping pattern beats taking every trade. We tested 12 different filters.',
        proof: '13 filters tested across 12 stocks: after reds take/skip, after greens take/skip, mechanical spacing. Every single one lost money vs baseline ($39,481). Closest was "After 2 reds → skip next" at −$3,204. Worst was "After 2 greens → take next" at −$38,228.',
        tested: 'Trade Skip Analysis — 13 filters × 12 stocks, exhaustive combinations.'
      },
      {
        rule: 'Losses are random. Wins are random. They do NOT cluster in exploitable patterns.',
        proof: 'Tested reversion theory (after reds, take next), momentum theory (after greens, take next), avoidance theory (after streaks, skip next). All failed. Every pool of skipped trades was net profitable — meaning every filter skips good trades.',
        tested: 'Trade Skip Analysis — skipped trade P&L analysis across all filters.'
      },
      {
        rule: 'Higher win rate per trade ≠ more money. "Quality" filters reduce total returns.',
        proof: 'Wait-3-Reds on SPY: 50% WR, PF 6.59, Avg R 2.79 — looks amazing. But only 8 trades, $2,234 total vs $3,494 baseline. Per-trade quality up, total P&L down.',
        tested: 'Filter Lab — SPY detailed analysis. Confirmed across all 12 stocks in Trade Skip Analysis.'
      },
    ]
  },
  {
    category: 'Risk Management',
    icon: '🛡️',
    items: [
      {
        rule: 'Tight stops (1× ATR) outperform wide stops. Bigger position, bigger R on winners.',
        proof: 'All 5 strategies use 1× ATR stop (except Mean Rev 1.5×). Tight stop = more shares per $100 risk = winners pay off in much bigger R multiples.',
        tested: 'Consistent across all strategy backtests.'
      },
      {
        rule: 'EMA(20) trailing stop at 2.5R is the sweet spot for longs.',
        proof: 'Rides big trends (NVDA: $8,539 on MA Bounce) while protecting gains. Too tight = cut winners early. Too loose = give back too much.',
        tested: 'All 5 strategies use identical trailing exit — proven across 12 stocks.'
      },
      {
        rule: 'Fixed $100 risk per trade keeps position sizing consistent and comparable.',
        proof: 'Allows apples-to-apples comparison across strategies and stocks. No leverage blowups, no outsized positions distorting results.',
        tested: 'All backtests use same risk parameter.'
      },
    ]
  },
  {
    category: 'Entry Logic',
    icon: '🎯',
    items: [
      {
        rule: 'Pullback entries (MA Bounce) beat breakout entries and crossover entries.',
        proof: 'MA Bounce ($39,481) > Breakout ($22,178) > Trend Rider crossover ($26,907). Buying the dip to EMA(20) in an uptrend gives better R:R than chasing new highs.',
        tested: 'Compare tab — same exit rules, same risk, different entries.'
      },
      {
        rule: 'Trend filter (above SMA 50) is essential. Don\'t buy dips in downtrends.',
        proof: 'All strategies require price > SMA(50) for longs. Without it, you\'re catching falling knives. Mean Reversion without trend filter → too few trades or massive losses.',
        tested: 'Mean Reversion development — RSI<30 + near BB + above SMA50 gave 0 trades. Had to loosen entry while keeping trend filter.'
      },
      {
        rule: 'Shorts should be treated differently than longs. Quick TP, strict filters.',
        proof: 'Trend Rider shorts: only below SMA200 + ATR contracting + fixed 3R TP. Asymmetric approach — ride longs, scalp shorts.',
        tested: 'Trend Rider v1 PineScript — proven in TradingView backtests.'
      },
    ]
  },
  {
    category: 'Backtesting Discipline',
    icon: '📊',
    items: [
      {
        rule: 'Test across 12+ stocks. Single-stock results are misleading.',
        proof: 'SPY-only analysis suggested Wait-3-Reds was viable (50% WR, PF 6.59). 12-stock test killed it (2/12 stocks helped). One stock ≠ proof.',
        tested: 'Filter Lab — SPY-only vs all-12-stocks comparison.'
      },
      {
        rule: 'Keep the exit the same when comparing entries. Only change one variable.',
        proof: 'All 5 strategies use identical exits (EMA20 trail at 2.5R, 1× ATR stop). This isolates the entry signal as the only variable. Fair comparison.',
        tested: 'All 5 strategy generators use same exit logic.'
      },
      {
        rule: 'Use the "anomaly" check — if one stock\'s spread > $4,000 between strategies, investigate.',
        proof: 'Compare tab highlights big P&L spreads with white outlines. Shows where one strategy got lucky on a single trade vs consistent edge.',
        tested: 'Compare tab — anomaly detection on per-stock results.'
      },
      {
        rule: 'Tie = within $500 of the top. Don\'t overfit to small differences.',
        proof: 'Winner column uses $500 threshold. Multiple strategies can "win" a stock if they\'re close. Prevents reading too much into noise.',
        tested: 'Compare tab — winner logic.'
      },
    ]
  },
  {
    category: 'Philosophy',
    icon: '🧠',
    items: [
      {
        rule: 'Backtest everything — no hunches, no guru calls.',
        proof: 'Every strategy in this system has full trade logs, equity curves, drawdown analysis. Nothing is taken on faith.',
        tested: 'This entire project — 10 strategies, 12 stocks, 1,500+ trades.'
      },
      {
        rule: 'Keep it simple — if you need a PhD to understand it, it\'s overfit.',
        proof: 'Best strategies use simple ingredients: moving averages, RSI, price > SMA50. No neural networks, no 47-parameter models.',
        tested: 'All strategies use 3-5 parameters max.'
      },
      {
        rule: 'Risk first — return/drawdown ratio matters more than total return.',
        proof: 'Trail Forever wins not because of highest total P&L, but because of 19× return/drawdown. A system you can\'t stomach trading is worthless.',
        tested: 'All strategy comparisons rank by R/DD ratio, not raw P&L.'
      },
      {
        rule: 'Retail edge is real — small size, patience, and discipline beat institutions.',
        proof: 'No slippage pressure, no mandate to be fully invested, no quarterly performance reviews. We can wait for perfect setups and hold forever.',
        tested: 'Overnight edge exists precisely because institutions can\'t hold overnight easily.'
      },
    ]
  },
]

export default function MasterLearningsPage() {
  return (
    <div>
      <h1 className="page-title">Master Learnings <span>Proven rules — tested and unshakable</span></h1>

      <div className="card strategy-summary">
        <p style={{ fontSize: '16px', margin: 0 }}>
          These rules survived rigorous testing across <strong>5 strategies</strong>, <strong>12 stocks</strong>, and <strong>1,500+ trades</strong>.
          They are not opinions — they are data-driven conclusions from this project. Refer back here before making changes or trying "new ideas."
        </p>
      </div>

      {LEARNINGS.map(section => (
        <div key={section.category} className="card" style={{ marginBottom: '16px' }}>
          <h2>{section.icon} {section.category}</h2>
          {section.items.map((item, i) => (
            <div key={i} style={{
              padding: '12px 16px',
              marginBottom: i < section.items.length - 1 ? '12px' : 0,
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '6px',
              borderLeft: '3px solid #448aff'
            }}>
              <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px', color: '#ffffff' }}>
                {item.rule}
              </div>
              <div style={{ fontSize: '14px', opacity: 0.8, marginBottom: '4px' }}>
                <strong style={{ color: '#00e676' }}>Proof:</strong> {item.proof}
              </div>
              <div style={{ fontSize: '13px', opacity: 0.6 }}>
                <strong>Tested:</strong> {item.tested}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
