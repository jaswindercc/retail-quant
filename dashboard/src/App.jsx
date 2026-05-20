import { useState, useEffect } from 'react'
import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
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
import StratCandlePage from './pages/StratCandlePage'

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
]

function NavGroup({ label, icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(true)
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
    const load = (file, setter) => fetch(`${base}${file}`).then(r => r.json()).then(setter).catch(e => console.error(`Failed to load ${file}:`, e))
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
  }, [])

  if (!trData || !bnData || !brData || !rsiData || !mrData || !tlData || !srData || !fvgData || !vcpData || !volData) return <div className="loading">Loading…</div>

  // Detect active strategy from URL
  const active = STRATS.find(s => location.pathname.startsWith(s.path)) || null
  const stockBase = active ? `/${active.prefix}/stock` : '/trend-rider/stock'

  // Auto-open nav groups based on current route
  const isOvernightRoute = ['/overnight', '/spy-overnight', '/qqq-overnight', '/overnight-trail-study', '/qqq-trail-study', '/overnight-macro', '/scanner'].some(p => location.pathname.startsWith(p))
  const isSwingRoute = STRATS.some(s => location.pathname.startsWith(s.path)) || location.pathname === '/' || location.pathname === '/stocks' || location.pathname === '/swing-scanners'
  const isResearchRoute = ['/trail-study', '/skip-analysis'].some(p => location.pathname.startsWith(p))

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
          </NavGroup>

          <NavGroup label="Swing Strategies" icon="📈" defaultOpen={isSwingRoute}>
            <NavLink to="/" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              📊 Swing Summary
            </NavLink>
            <NavLink to="/stocks" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              🏷️ Stock Universe
            </NavLink>
            <NavLink to="/swing-scanners" end className={({isActive}) => `strategy-link sub-link ${isActive ? 'active' : ''}`}>
              📡 Swing Scanners
            </NavLink>
            {STRATS.map(s => (
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

          <NavLink to="/the-strat" end className={({isActive}) => `strategy-link ${isActive ? 'active' : ''}`} style={{marginTop:'0.5rem'}}>
            🕯️ The STRAT
          </NavLink>

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
        </div>
      </nav>
      {sidebarOpen && <div className="sidebar-overlay show" onClick={() => setSidebarOpen(false)} />}
      <div className="main">
        <Routes>
          <Route path="/" element={<ComparePage trData={trData} bnData={bnData} brData={brData} rsiData={rsiData} mrData={mrData} tlData={tlData} srData={srData} fvgData={fvgData} vcpData={vcpData} volData={volData} />} />
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
          <Route path="/trail-study" element={<TrailStudyPage />} />
          <Route path="/learnings" element={<MasterLearningsPage />} />
        </Routes>
      </div>
    </div>
  )
}
