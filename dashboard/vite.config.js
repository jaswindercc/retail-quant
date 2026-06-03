import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

function simRefreshPlugin() {
  return {
    name: 'sim-refresh',
    configureServer(server) {
      server.middlewares.use('/api/refresh-sim', (req, res) => {
        try {
          const output = execSync('python3 scripts/generate_sim_data.py', {
            cwd: server.config.root + '/..',
            timeout: 120000,
            encoding: 'utf-8'
          })
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, output }))
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: e.message }))
        }
      })

      server.middlewares.use('/api/run-live-scanner', (req, res) => {
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return }
        try {
          const output = execSync('python3 scripts/scan_live.py && cp data/live_scanner_data.json dashboard/public/live_scanner_data.json', {
            cwd: server.config.root + '/..',
            timeout: 180000,
            encoding: 'utf-8'
          })
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, output }))
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: e.message }))
        }
      })

      server.middlewares.use('/api/run-overnight-scanner', (req, res) => {
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return }
        try {
          const output = execSync('python3 scripts/refresh_scanner.py', {
            cwd: server.config.root + '/..',
            timeout: 180000,
            encoding: 'utf-8'
          })
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, output }))
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: e.message }))
        }
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), simRefreshPlugin()],
  base: '/retail-quant/',
})
