import { useState, useEffect } from 'react'
import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { fetchJson } from './utils'
import StrategyPage from './pages/StrategyPage'
import BouncePage from './pages/BouncePage'
import BreakoutPage from './pages/BreakoutPage'
import RsiPage from './pages/RsiPage'
import MeanRevPage from './pages/MeanRevPage'
import TrendlinePage from './pages/TrendlinePage'
import SrPage from './pages/SrPage'
import FvgPage from './pages/FvgPage'
import VcpPage from './pages/VcpPage'
import VolumePage from './pages/VolumePage'
import ComparePage from './pages/ComparePage'
import FilterLabPage from './pages/FilterLabPage'
import MasterLearningsPage from './pages/MasterLearningsPage'
import TrailStudyPage from './pages/TrailStudyPage'
import SpxOvernightPage from './pages/SpxOvernightPage'
import SpyOvernightPage from './pages/SpyOvernightPage'
import QqqOvernightPage from './pages/QqqOvernightPage'
import OvernightTrailStudyPage from './pages/OvernightTrailStudyPage'
import QqqTrailStudyPage from './pages/QqqTrailStudyPage'
import MacroOvernightPage from './pages/MacroOvernightPage'
import ScannerPage from './pages/ScannerPage'
import StockPage from './pages/StockPage'
import StocksOverviewPage from './pages/StocksOverviewPage'
import SwingScannersPage from './pages/SwingScannersPage'
import FiftyTwoWeekHighPage from './pages/FiftyTwoWeekHighPage'
import BottomPickerPage from './pages/BottomPickerPage'
import HigherHighBreakPage from './pages/HigherHighBreakPage'
import RareScannerPage from './pages/RareScannerPage'
import HHScannerPage from './pages/HHScannerPage'
import LiveScannerPage from './pages/LiveScannerPage'
import StratCandlePage from './pages/StratCandlePage'
import StratSummaryPage from './pages/StratSummaryPage'
import StratStockPage from './pages/StratStockPage'
import Strat2D12UPage from './pages/Strat2D12UPage'
import Strat32D12UPage from './pages/Strat32D12UPage'
import StratComboDetailPage from './pages/StratComboDetailPage'
import MarkovPage from './pages/MarkovPage'
import PositionTrackerPage from './pages/PositionTrackerPage'
import SpreadBacktestPage from './pages/SpreadBacktestPage'
import SpxIncomePage from './pages/SpxIncomePage'
import SpxSkipAnalysisPage from './pages/SpxSkipAnalysisPage'
import SimPage from './pages/SimPage'
import SimBacktestPage from './pages/SimBacktestPage'
import SimBacktest2Page from './pages/SimBacktest2Page'
import SimBacktest3Page from './pages/SimBacktest3Page'
import SimBacktest4Page from './pages/SimBacktest4Page'
import SimBacktestSummaryPage from './pages/SimBacktestSummaryPage'
import SimBacktest5Page from './pages/SimBacktest5Page'
import SimBacktest6Page from './pages/SimBacktest6Page'
import StrategySwitcherPage from './pages/StrategySwitcherPage'
import FactorSwitcherPage from './pages/FactorSwitcherPage'
import DynamicRiskPage from './pages/DynamicRiskPage'
import MasterPage from './pages/MasterPage'
import RotationPage from './pages/RotationPage'
import RotationComparisonPage from './pages/RotationComparisonPage'
import RotationTop3Page from './pages/RotationTop3Page'
import BreakoutV2Page from './pages/BreakoutV2Page'
// LiveStrategyPage removed — merged into SimBacktest5Page

const STOCKS = ['SPY','AAPL','ADBE','AMD','BA','CRM','GOOGL','META','MSFT','NVDA','SNOW','TSLA']

const STRATS = [
  { path: '/bounce', label: 'MA Bounce v1', prefix: 'bounce' },
  { path: '/breakout', label: 'Breakout v1', prefix: 'breakout' },
  { path: '/trendline', label: 'Trendline v1', prefix: 'trendline' },
  { path: '/rsi', label: 'RSI Trend v1', prefix: 'rsi' },
  { path: '/sr', label: 'S/R Bounce v1', prefix: 'sr' },
  { path: '/fvg', label: 'FVG v1', prefix: 'fvg' },
  { path: '/trend-rider', label: 'Trend Rider v1', prefix: 'trend-rider' },
  { path: '/volume', label: 'Volume v1', prefix: 'volume' },
  { path: '/vcp', label: 'VCP v1', prefix: 'vcp' },
  { path: '/meanrev', label: 'Mean Rev v1', prefix: 'meanrev' },
  { path: '/52wk-high', label: '52-Wk High Break', prefix: '52wk-high' },
  { path: '/bottom-picker', label: 'Bottom Picker', prefix: 'bottom-picker' },
  { path: '/higher-high', label: 'Higher High Break', prefix: 'higher-high' },
]

const RARE_STRATS = [
  { path: '/52wk-high', label: '52-Wk High Break', prefix: '52wk-high' },
  { path: '/bottom-picker', label: 'Bottom Picker', prefix: 'bottom-picker' },
  { path: '/higher-high', label: '⭐ Higher High Break', prefix: 'higher-high' },
]

const CORE_STRATS = STRATS.filter(s => !RARE_STRATS.some(r => r.path === s.path))

function NavGroup({ label, icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="nav-group">
      <button className={`nav-group-toggle ${open ? 'open' : ''}`} onClick={() => setOpen(!open)}>
        <span>{icon} {label}</span>
        <span className="nav-chevron">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="nav-group-items">{children}</div>}
    </div>
  )
}

export default function App() {
  const [trData, setTrData] = useState(null)
  const [bnData, setBnData] = useState(null)
  const [brData, setBrData] = useState(null)
  const [rsiData, setRsiData] = useState(null)
  const [mrData, setMrData] = useState(null)
  const [tlData, setTlData] = useState(null)
  const [srData, setSrData] = useState(null)
  const [fvgData, setFvgData] = useState(null)
  const [vcpData, setVcpData] = useState(null)
  const [volData, setVolData] = useState(null)
  const [onData, setOnData] = useState(null)
  const [spyOnData, setSpyOnData] = useState(null)
  const [qqqOnData, setQqqOnData] = useState(null)
  const [onTrailData, setOnTrailData] = useState(null)
  const [qqqTrailData, setQqqTrailData] = useState(null)
  const [macroOnData, setMacroOnData] = useState(null)
  const [scannerData, setScannerData] = useState(null)
  const [wk52Data, setWk52Data] = useState(null)
  const [bpData, setBpData] = useState(null)
  const [hhData, setHhData] = useState(null)
  const [loadErrors, setLoadErrors] = useState([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  const location = useLocation()

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  // Close sidebar on route change (mobile)
  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    const load = (file, setter) => fetchJson(`${base}${file}`)
      .then(setter)
      .catch(e => setLoadErrors(prev => [...prev, `${file}: ${e.message}`]))
    load('data.json', setTrData)
    load('bounce_data.json', setBnData)
    load('breakout_data.json', setBrData)
    load('rsi_data.json', setRsiData)
    load('meanrev_data.json', setMrData)
    load('trendline_data.json', setTlData)
    load('sr_data.json', setSrData)
    load('fvg_data.json', setFvgData)
    load('vcp_data.json', setVcpData)
    load('volume_data.json', setVolData)
    load('overnight_data.json', setOnData)
    load('spy_overnight_data.json', setSpyOnData)
    load('qqq_overnight_data.json', setQqqOnData)
    load('overnight_trail_study.json', setOnTrailData)
    load('qqq_trail_study.json', setQqqTrailData)
    load('macro_overnight_data.json', setMacroOnData)
    load('scanner_data.json', setScannerData)
    load('52wk_high_data.json', setWk52Data)
    load('bottom_picker_data.json', setBpData)
    load('higher_high_data.json', setHhData)
  }, [])

  if (!trData || !bnData || !brData || !rsiData || !mrData || !tlData || !srData || !fvgData || !vcpData || !volData || !wk52Data || !bpData || !hhData) {
    if (loadErrors.length > 0) {
      return (
        <div style={{padding: 40, maxWidth: 600, margin: '0 auto', fontFamily: 'monospace'}}>
          <h2 style={{color: '#f87171', marginBottom: 16}}>⚠️ Failed to load data</h2>
          <p style={{color: '#a1a1aa', marginBottom: 12}}>The following files are missing or corrupted:</p>
          <ul style={{color: '#fbbf24', fontSize: 14, lineHeight: 2}}>
            {loadErrors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
          <p style={{color: '#a1a1aa', marginTop: 20, fontSize: 13}}>
            Check that these JSON files exist in <code>dashboard/public/</code> and are valid JSON.
          </p>
        </div>
      )
    }
    return <div className="loading">Loading…</div>
  }

  // Detect active strategy from URL
  const active = STRATS.find(s => location.pathname.startsWith(s.path)) || null
  const stockBase = active ? `/${active.prefix}/stock` : '/trend-rider/stock'

  // Auto-open nav groups based on current route
  const isOvernightRoute = ['/overnight', '/spy-overnight', '/qqq-overnight', '/overnight-trail-study', '/qqq-trail-study', '/overnight-macro', '/scanner', '/markov'].some(p => location.pathname.startsWith(p))
  const isSwingRoute = CORE_STRATS.some(s => location.pathname.startsWith(s.path)) || location.pathname === '/' || location.pathname === '/stocks' || location.pathname === '/swing-scanners' || location.pathname === '/live-scanner'
  const isRareRoute = RARE_STRATS.some(s => location.pathname.startsWith(s.path)) || location.pathname === '/rare-scanner' || location.pathname === '/hh-scanner'
  const isStratRoute = location.pathname.startsWith('/the-strat')
  const isOptionsRoute = ['/options/tsla', '/options/qqq', '/options/spx'].some(p => location.pathname.startsWith(p))
  const isSimRoute = location.pathname.startsWith('/sim')
  const isSwitcherRoute = location.pathname.startsWith('/strategy-switcher')
  const isResearchRoute = ['/trail-study', '/skip-analysis'].some(p => location.pathname.startsWith(p))
  const isBreakoutsRoute = ['/breakout', '/breakout-v2'].some(p => location.pathname === p)

  return (
    <div className="app">
      <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
        {sidebarOpen ? '✕' : '☰'}
      </button>
      <button className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
      <nav className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-section">

          <NavGroup label="Overnight" icon="🌙" defaultOpen={isOvernightRoute}>
            <div className="nav-sub-label">Scanner</div>
            <NavLink to="/scanner" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              📡 Overnight Scanner
            </NavLink>
            <div className="nav-sub-label">Backtests</div>
            <NavLink to="/overnight" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              SPX Overnight
            </NavLink>
            <NavLink to="/spy-overnight" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              SPY Overnight
            </NavLink>
            <NavLink to="/qqq-overnight" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              QQQ Overnight
            </NavLink>
            <div className="nav-sub-label">Research</div>
            <NavLink to="/overnight-trail-study" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              🔬 SPX Trail Study
            </NavLink>
            <NavLink to="/qqq-trail-study" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              🔬 QQQ Trail Study
            </NavLink>
            <NavLink to="/overnight-macro" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              🌐 Macro Study
            </NavLink>
            <NavLink to="/markov" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              🔗 Markov Chain
            </NavLink>
          </NavGroup>

          <NavGroup label="SIM" icon="🎮" defaultOpen={isSimRoute}>
            <NavLink to="/sim" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`} style={({isActive}) => ({ color: '#ffd700', fontWeight: 700 })}>
              📝 Paper Trading
            </NavLink>
            <NavLink to="/sim/summary" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`} style={({isActive}) => ({ color: '#4ade80', fontWeight: 700 })}>
              📋 Summary & Final Plan
            </NavLink>
            <NavLink to="/sim/backtest-1" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              📊 Backtest 1 — Confluence
            </NavLink>
            <NavLink to="/sim/backtest-2" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              📊 Backtest 2 — Top 3
            </NavLink>
            <NavLink to="/sim/backtest-3" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`} style={({isActive}) => ({ color: '#4ade80', fontWeight: 600 })}>
              ⭐ Backtest 3 — Regime
            </NavLink>
            <NavLink to="/sim/backtest-4" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              🎯 Backtest 4 — Universe
            </NavLink>
            <NavLink to="/sim/backtest-5" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`} style={({isActive}) => ({ color: isActive ? '#4ade80' : '#4ade80', fontWeight: 700 })}>
              🟢 LIVE — Mega-Cap
            </NavLink>
            <NavLink to="/sim/backtest-6" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              🔄 Backtest 6 — Rotation Mid-Cap
            </NavLink>
            <NavLink to="/sim/dynamic-risk" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              ⚡ Dynamic Risk
            </NavLink>

          </NavGroup>

          <NavGroup label="Strategy Switcher" icon="🔀" defaultOpen={isSwitcherRoute}>
            <NavLink to="/strategy-switcher" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              📊 Switcher Dashboard
            </NavLink>
            <NavLink to="/strategy-switcher/factors" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              🧬 Factor Switcher
            </NavLink>
          </NavGroup>

          <NavGroup label="Swing Strategies" icon="📈" defaultOpen={isSwingRoute}>
            <NavLink to="/live-scanner" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`} style={({isActive}) => ({ color: isActive ? '#ffd700' : '#ffd700', fontWeight: 700 })}>
              🔴 Live Scanner
            </NavLink>
            <NavLink to="/" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              📊 Swing Summary
            </NavLink>
            <NavLink to="/stocks" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              🏷️ Stock Universe
            </NavLink>
            <NavLink to="/swing-scanners" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              📡 Strategy Rules
            </NavLink>
            {CORE_STRATS.map(s => (
              <NavLink key={s.path} to={s.path} end className={({isActive}) =>
                `strategy-link sub-link ${isActive ? 'active' : ''}`
              }>{s.label}</NavLink>
            ))}
          </NavGroup>

          <NavGroup label="Options" icon="🔻" defaultOpen={isOptionsRoute}>
            <NavLink to="/options/spx" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              SPX Bull Put Spread
            </NavLink>
            <NavLink to="/options/spx/skip-analysis" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              SPX Skip Analysis
            </NavLink>
            <NavLink to="/options/qqq" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              QQQ Bull Put Spread
            </NavLink>
            <NavLink to="/options/tsla" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              TSLA Bull Put Spread
            </NavLink>
          </NavGroup>

          <NavGroup label="Rare Patterns" icon="⚡" defaultOpen={isRareRoute}>
            <NavLink to="/rare-scanner" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              📡 Rare Pattern Scanner
            </NavLink>
            <NavLink to="/hh-scanner" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              📐 Higher High Scanner
            </NavLink>
            {RARE_STRATS.map(s => (
              <NavLink key={s.path} to={s.path} end className={({isActive}) =>
                `strategy-link sub-link ${isActive ? 'active' : ''}`
              }>{s.label}</NavLink>
            ))}
          </NavGroup>

          {active && (
            <NavGroup label={`Stocks · ${active.label}`} icon="🏷️" defaultOpen={true}>
              {STOCKS.map(s => (
                <NavLink key={s} to={`${stockBase}/${s}`} className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
                  {s}
                </NavLink>
              ))}
            </NavGroup>
          )}

          <NavGroup label="The STRAT" icon="🕯️" defaultOpen={isStratRoute}>
            <NavLink to="/the-strat" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              📊 Candle Combos
            </NavLink>
            <NavLink to="/the-strat/summary" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              📋 Summary
            </NavLink>
            <NavLink to="/the-strat/2d-1-2u" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              🔄 2D-1-2U
            </NavLink>
            <NavLink to="/the-strat/3-2d-1-2u" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              🔄 3-2D-1-2U
            </NavLink>
          </NavGroup>

          <NavGroup label="Research" icon="🧪" defaultOpen={isResearchRoute}>
            <NavLink to="/trail-study" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              🔬 Trail Stop Study
            </NavLink>
            <NavLink to="/skip-analysis" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              🧪 Trade Skip Analysis
            </NavLink>
          </NavGroup>

          <NavLink to="/learnings" end className={({isActive}) => `strategy-link ${isActive ? 'active' : ''}`} style={{marginTop:'0.5rem'}}>
            📖 Master Learnings
          </NavLink>
          <NavLink to="/rotation" end className={({isActive}) => `strategy-link ${isActive ? 'active' : ''}`} style={{marginTop:'0.75rem', padding:'0.75rem 1rem', fontSize:'1rem', fontWeight:700, background:'rgba(74,222,128,0.1)', borderRadius:8, border:'1px solid rgba(74,222,128,0.2)'}}>
            🎯 Live Rotation Scanner
          </NavLink>
          <NavLink to="/rotation-top3" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
            🔄 Top 10 Rotation (S&P 500)
          </NavLink>
          <NavLink to="/rotation-comparison" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
            🔬 Scoring Comparison
          </NavLink>
          <NavLink to="/master" end className={({isActive}) => `strategy-link ${isActive ? 'active' : ''}`} style={{marginTop:'0.5rem', padding:'0.75rem 1rem', fontSize:'1rem', fontWeight:700, background:'rgba(74,222,128,0.1)', borderRadius:8, border:'1px solid rgba(74,222,128,0.2)'}}>
            🏆 Master Ranking
          </NavLink>

          <NavGroup label="Breakouts" icon="🚀" defaultOpen={isBreakoutsRoute}>
            <NavLink to="/breakout" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              📊 Breakout v1
            </NavLink>
            <NavLink to="/breakout-v2" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`} style={({isActive}) => ({ color: '#4ade80', fontWeight: 600 })}>
              🚀 Breakout v2 (150 Stocks)
            </NavLink>
          </NavGroup>
        </div>
      </nav>
      {sidebarOpen && <div className="sidebar-overlay show" onClick={() => setSidebarOpen(false)} />}
      <div className="main">
        <Routes>
          <Route path="/" element={<ComparePage trData={trData} bnData={bnData} brData={brData} rsiData={rsiData} mrData={mrData} tlData={tlData} srData={srData} fvgData={fvgData} vcpData={vcpData} volData={volData} wk52Data={wk52Data} bpData={bpData} hhData={hhData} />} />
          <Route path="/trend-rider" element={<StrategyPage data={trData} strategyName="Trend Rider v1" />} />
          <Route path="/trend-rider/stock/:symbol" element={<StockPage data={trData} strategy="Trend Rider v1" />} />
          <Route path="/bounce" element={<BouncePage data={bnData} strategyName="MA Bounce v1" />} />
          <Route path="/bounce/stock/:symbol" element={<StockPage data={bnData} strategy="MA Bounce v1" />} />
          <Route path="/breakout" element={<BreakoutPage data={brData} strategyName="Breakout v1" />} />
          <Route path="/breakout/stock/:symbol" element={<StockPage data={brData} strategy="Breakout v1" />} />
          <Route path="/rsi" element={<RsiPage data={rsiData} strategyName="RSI Trend v1" />} />
          <Route path="/rsi/stock/:symbol" element={<StockPage data={rsiData} strategy="RSI Trend v1" />} />
          <Route path="/meanrev" element={<MeanRevPage data={mrData} strategyName="Mean Reversion v1" />} />
          <Route path="/meanrev/stock/:symbol" element={<StockPage data={mrData} strategy="Mean Reversion v1" />} />
          <Route path="/trendline" element={<TrendlinePage data={tlData} strategyName="Trendline v1" />} />
          <Route path="/trendline/stock/:symbol" element={<StockPage data={tlData} strategy="Trendline v1" />} />
          <Route path="/sr" element={<SrPage data={srData} strategyName="S/R Bounce v1" />} />
          <Route path="/sr/stock/:symbol" element={<StockPage data={srData} strategy="S/R Bounce v1" />} />
          <Route path="/fvg" element={<FvgPage data={fvgData} strategyName="FVG v1" />} />
          <Route path="/fvg/stock/:symbol" element={<StockPage data={fvgData} strategy="FVG v1" />} />
          <Route path="/vcp" element={<VcpPage data={vcpData} strategyName="VCP v1" />} />
          <Route path="/vcp/stock/:symbol" element={<StockPage data={vcpData} strategy="VCP v1" />} />
          <Route path="/volume" element={<VolumePage data={volData} strategyName="Volume v1" />} />
          <Route path="/volume/stock/:symbol" element={<StockPage data={volData} strategy="Volume v1" />} />
          <Route path="/52wk-high" element={<FiftyTwoWeekHighPage data={wk52Data} strategyName="52-Week High Break" />} />
          <Route path="/52wk-high/stock/:symbol" element={<StockPage data={wk52Data} strategy="52-Week High Break" />} />
          <Route path="/bottom-picker" element={<BottomPickerPage data={bpData} strategyName="Bottom Picker" />} />
          <Route path="/bottom-picker/stock/:symbol" element={<StockPage data={bpData} strategy="Bottom Picker" />} />
          <Route path="/higher-high" element={<HigherHighBreakPage data={hhData} strategyName="Higher High Break" />} />
          <Route path="/higher-high/stock/:symbol" element={<StockPage data={hhData} strategy="Higher High Break" />} />
          <Route path="/rare-scanner" element={<RareScannerPage />} />
          <Route path="/hh-scanner" element={<HHScannerPage />} />
          <Route path="/live-scanner" element={<LiveScannerPage />} />
          <Route path="/tracker" element={<PositionTrackerPage />} />
          <Route path="/overnight" element={<SpxOvernightPage data={onData} />} />
          <Route path="/spy-overnight" element={<SpyOvernightPage data={spyOnData} />} />
          <Route path="/qqq-overnight" element={<QqqOvernightPage data={qqqOnData} />} />
          <Route path="/overnight-trail-study" element={<OvernightTrailStudyPage data={onTrailData} />} />
          <Route path="/qqq-trail-study" element={<QqqTrailStudyPage data={qqqTrailData} />} />
          <Route path="/overnight-macro" element={<MacroOvernightPage data={macroOnData} />} />
          <Route path="/scanner" element={<ScannerPage data={scannerData} />} />
          <Route path="/skip-analysis" element={<FilterLabPage bnData={bnData} />} />
          <Route path="/stocks" element={<StocksOverviewPage data={trData} allData={{tr:trData,bn:bnData,br:brData,rsi:rsiData,mr:mrData,tl:tlData,sr:srData,fvg:fvgData,vcp:vcpData,vol:volData}} />} />
          <Route path="/swing-scanners" element={<SwingScannersPage />} />
          <Route path="/the-strat" element={<StratCandlePage />} />
          <Route path="/the-strat/summary" element={<StratSummaryPage />} />
          <Route path="/the-strat/stock/:symbol" element={<StratStockPage />} />
          <Route path="/the-strat/2d-1-2u" element={<Strat2D12UPage />} />
          <Route path="/the-strat/3-2d-1-2u" element={<Strat32D12UPage />} />
          <Route path="/the-strat/combo/:combo/:stock" element={<StratComboDetailPage />} />
          <Route path="/trail-study" element={<TrailStudyPage />} />
          <Route path="/options/tsla" element={<SpreadBacktestPage dataFile="spread_data_tsla.json" findings="TSLA is too volatile for bull put spreads with strict assignment-risk management. Even at 10% OTM, the short strike is touched 40% of the time. With exit-on-touch rule, all OTM levels are net losers. TSLA's high IV gives good premiums but the whipsaw makes it unviable." />} />
          <Route path="/options/qqq" element={<SpreadBacktestPage dataFile="spread_data_qqq.json" findings="QQQ is calmer than TSLA but still net-negative with strict exit-on-touch. At 10% OTM, 89% win rate but tiny credits ($0.38) can't overcome the max-loss exits. The 10.8% touch rate is manageable, but the risk/reward doesn't justify the capital at risk." />} />
          <Route path="/options/spx" element={<SpxIncomePage />} />
          <Route path="/options/spx/skip-analysis" element={<SpxSkipAnalysisPage />} />
          <Route path="/sim" element={<SimPage />} />
          <Route path="/sim/backtest-1" element={<SimBacktestPage />} />
          <Route path="/sim/backtest-2" element={<SimBacktest2Page />} />
          <Route path="/sim/backtest-3" element={<SimBacktest3Page />} />
          <Route path="/sim/backtest-4" element={<SimBacktest4Page />} />
          <Route path="/sim/summary" element={<SimBacktestSummaryPage />} />
          <Route path="/sim/backtest-5" element={<SimBacktest5Page />} />
          <Route path="/sim/backtest-6" element={<SimBacktest6Page />} />
          <Route path="/strategy-switcher" element={<StrategySwitcherPage />} />
          <Route path="/strategy-switcher/factors" element={<FactorSwitcherPage />} />
          <Route path="/sim/dynamic-risk" element={<DynamicRiskPage />} />
          <Route path="/sim/live" element={<SimBacktest5Page />} />
          <Route path="/markov" element={<MarkovPage />} />
          <Route path="/learnings" element={<MasterLearningsPage />} />
          <Route path="/master" element={<MasterPage />} />
          <Route path="/rotation" element={<RotationPage />} />
          <Route path="/rotation-top3" element={<RotationTop3Page />} />
          <Route path="/rotation-comparison" element={<RotationComparisonPage />} />
          <Route path="/breakout-v2" element={<BreakoutV2Page />} />
        </Routes>
      </div>
    </div>
  )
}
