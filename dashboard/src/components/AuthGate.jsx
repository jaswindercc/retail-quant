import { useState } from 'react'

const PASS_HASH = '5994471abb01112afcc18159f6cc74b4f511b99806da59b3caf5a9c173cacfc5'

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

const features = [
  { icon: '📡', title: 'Live Scanner', desc: 'Daily overnight signals for SPX, SPY & QQQ' },
  { icon: '🧪', title: '19× Return/DD', desc: 'Trail Forever strategy dominates all configs' },
  { icon: '📊', title: '10 Strategies', desc: 'Backtested across 12 stocks (2021–2026)' },
  { icon: '⚡', title: 'Auto-Refresh', desc: 'GitHub Actions pulls fresh data at 3:20 PM ET' },
]

export default function AuthGate({ children }) {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem('rq_auth') === '1')
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const hash = await sha256(input)
    if (hash === PASS_HASH) {
      sessionStorage.setItem('rq_auth', '1')
      setAuthed(true)
    } else {
      setError(true)
      setInput('')
    }
  }

  if (authed) return children

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800;900&display=swap');
        .rq-landing * { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; box-sizing: border-box; }
        .rq-landing { min-height: 100vh; background: #050508; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem 1.5rem; position: relative; overflow: hidden; }
        .rq-glow-1 { position: absolute; width: 700px; height: 700px; border-radius: 50%; filter: blur(150px); opacity: 0.12; top: -300px; left: -200px; background: #7c3aed; pointer-events: none; }
        .rq-glow-2 { position: absolute; width: 500px; height: 500px; border-radius: 50%; filter: blur(120px); opacity: 0.08; bottom: -200px; right: -150px; background: #06b6d4; pointer-events: none; }
        .rq-content { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; max-width: 580px; width: 100%; }
        .rq-badge { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.45rem 1.1rem; border-radius: 100px; background: rgba(139, 92, 246, 0.08); border: 1px solid rgba(139, 92, 246, 0.2); color: #c4b5fd; font-size: 0.78rem; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 1.75rem; }
        .rq-title { color: #fff; font-size: clamp(2.8rem, 7vw, 4rem); font-weight: 900; margin: 0 0 0.75rem; letter-spacing: -0.05em; line-height: 1; text-align: center; }
        .rq-title span { background: linear-gradient(135deg, #a78bfa 0%, #06b6d4 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .rq-sub { color: #94a3b8; font-size: 1rem; line-height: 1.75; text-align: center; margin: 0 0 2.75rem; max-width: 460px; font-weight: 400; }
        .rq-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; width: 100%; margin-bottom: 2.75rem; }
        .rq-card { padding: 1.25rem 1.1rem; border-radius: 16px; background: rgba(255,255,255,0.015); border: 1px solid rgba(255,255,255,0.06); transition: border-color 0.3s, transform 0.2s; }
        .rq-card:hover { border-color: rgba(139, 92, 246, 0.3); transform: translateY(-2px); }
        .rq-card-icon { font-size: 1.3rem; margin-bottom: 0.5rem; }
        .rq-card-title { color: #e2e8f0; font-weight: 600; font-size: 0.82rem; margin-bottom: 0.25rem; }
        .rq-card-desc { color: #64748b; font-size: 0.73rem; line-height: 1.5; }
        .rq-form { display: flex; align-items: center; gap: 0.5rem; width: 100%; max-width: 380px; padding: 0.5rem; border-radius: 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); }
        .rq-input { flex: 1; padding: 0.85rem 1rem; border-radius: 12px; border: none; background: transparent; color: #fff; font-size: 0.9rem; outline: none; font-weight: 400; }
        .rq-input::placeholder { color: #475569; }
        .rq-btn { padding: 0.85rem 1.5rem; border-radius: 12px; border: none; background: #7c3aed; color: #fff; font-size: 0.85rem; font-weight: 600; cursor: pointer; white-space: nowrap; transition: background 0.2s, transform 0.1s; }
        .rq-btn:hover { background: #6d28d9; transform: scale(1.02); }
        .rq-btn:active { transform: scale(0.98); }
        .rq-error { color: #ef4444; font-size: 0.78rem; margin-top: 0.5rem; }
        .rq-social { margin-top: 2.25rem; text-align: center; }
        .rq-social p { color: #475569; font-size: 0.82rem; margin: 0 0 0.75rem; }
        .rq-links { display: flex; gap: 1.5rem; justify-content: center; }
        .rq-links a { color: #a78bfa; text-decoration: none; font-weight: 500; font-size: 0.88rem; transition: color 0.2s; }
        .rq-links a:hover { color: #c4b5fd; }
        .rq-footer { margin-top: 3.5rem; color: #1e293b; font-size: 0.72rem; text-align: center; letter-spacing: 0.02em; }
        .rq-footer a { color: #334155; text-decoration: none; font-weight: 500; }
        .rq-footer a:hover { color: #a78bfa; }
        @media (max-width: 480px) { .rq-grid { grid-template-columns: 1fr; } .rq-form { flex-direction: column; } .rq-btn { width: 100%; } }
      `}</style>
      <div className="rq-landing">
        <div className="rq-glow-1" />
        <div className="rq-glow-2" />
        <div className="rq-content">
          <div className="rq-badge">◆ Quantitative Trading Research</div>
          <h1 className="rq-title"><span>retail-quant</span></h1>
          <p className="rq-sub">
            An open-source quantitative trading system. Backtested strategies,
            overnight edge research, and a live scanner — built by a retail trader
            who believes data beats opinions.
          </p>

          <div className="rq-grid">
            {features.map(f => (
              <div key={f.title} className="rq-card">
                <div className="rq-card-icon">{f.icon}</div>
                <div className="rq-card-title">{f.title}</div>
                <div className="rq-card-desc">{f.desc}</div>
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="rq-form">
            <input
              type="password"
              value={input}
              onChange={e => { setInput(e.target.value); setError(false) }}
              placeholder="Enter access code"
              autoFocus
              className="rq-input"
            />
            <button type="submit" className="rq-btn">Enter →</button>
          </form>
          {error && <div className="rq-error">Invalid code — try again</div>}

          <div className="rq-social">
            <p>Need access? DM me:</p>
            <div className="rq-links">
              <a href="https://x.com/jaswinder_cc" target="_blank" rel="noopener noreferrer">𝕏 @jaswinder_cc</a>
              <a href="https://www.linkedin.com/in/jaswindercc/" target="_blank" rel="noopener noreferrer">LinkedIn</a>
            </div>
          </div>

          <div className="rq-footer">
            Built by <a href="https://x.com/jaswinder_cc" target="_blank" rel="noopener noreferrer">Jaswinder</a> · Open Source · MIT License
          </div>
        </div>
      </div>
    </>
  )
}
