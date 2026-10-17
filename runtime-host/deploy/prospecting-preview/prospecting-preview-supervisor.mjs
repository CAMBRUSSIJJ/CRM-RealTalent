import http from 'node:http'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 8080)
const AGENT_PORT = Number(process.env.REALTALENT_PROSPECTING_INNER_PORT || 4319)
const PRIMARY_TOKEN = String(process.env.REALTALENT_PROSPECTING_RUNTIME_TOKEN || '').trim()
const PREVIEW_TOKEN = String(process.env.REALTALENT_PREVIEW_PROSPECTING_RUNTIME_TOKEN || '').trim()
const SOURCE_SHA = String(process.env.REALTALENT_PROSPECTING_SOURCE_SHA || '').trim()
const DATA_ROOT = process.env.REALTALENT_CLOUD_DATA_DIR || '/data'
const STATE_DIR = path.join(DATA_ROOT, 'prospecting')
const VERSION = 'prospecting-preview-1.1.0'

if (PRIMARY_TOKEN.length < 24) {
  console.error('REALTALENT_PROSPECTING_RUNTIME_TOKEN é obrigatório (mín. 24 caracteres).')
  process.exit(1)
}
if (!/^[0-9a-f]{40}$/i.test(SOURCE_SHA)) {
  console.error('REALTALENT_PROSPECTING_SOURCE_SHA é obrigatório e deve ser um SHA completo.')
  process.exit(1)
}

fs.mkdirSync(STATE_DIR, { recursive: true })

const runtimeFiles = [
  ['runtime-host/RealTalent-CRM-V101.11.3-CR10-H1-Agent-V3.1.2-Linux-Launcher/scripts/realtalent-prospecting-agent.mjs', 'realtalent-prospecting-agent.mjs'],
  ['runtime-host/RealTalent-CRM-V101.11.3-CR10-H1-Agent-V3.1.2-Linux-Launcher/scripts/realtalent-prospecting-adaptive-learning.mjs', 'realtalent-prospecting-adaptive-learning.mjs'],
]

async function ensureRuntimeFiles() {
  const base = `https://raw.githubusercontent.com/CAMBRUSSIJJ/CRM-RealTalent/${SOURCE_SHA}`
  for (const [sourcePath, localName] of runtimeFiles) {
    const target = path.join(here, localName)
    if (fs.existsSync(target)) continue
    const response = await fetch(`${base}/${sourcePath}`, { signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw new Error(`bootstrap ${localName}: HTTP ${response.status}`)
    await fs.promises.writeFile(target, Buffer.from(await response.arrayBuffer()))
  }
}

await ensureRuntimeFiles()

let shuttingDown = false
const child = spawn(process.execPath, [path.join(here, 'realtalent-prospecting-agent.mjs')], {
  cwd: here,
  env: {
    ...process.env,
    REALTALENT_PROSPECTING_AGENT_HOST: '127.0.0.1',
    REALTALENT_PROSPECTING_AGENT_PORT: String(AGENT_PORT),
    REALTALENT_PROSPECTING_AGENT_STATE_DIR: STATE_DIR,
    PUPPETEER_SKIP_DOWNLOAD: 'true',
  },
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  console.error(`[prospecting-preview] agent encerrou code=${code} signal=${signal || ''}`)
  if (!shuttingDown) process.exit(code || 1)
})

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

function normalizedPath(req) {
  const parsed = new URL(String(req.url || '/'), `http://${req.headers.host || 'localhost'}`)
  let pathname = parsed.pathname || '/'
  if (pathname === '/prospecting') pathname = '/'
  else if (pathname.startsWith('/prospecting/')) pathname = pathname.slice('/prospecting'.length) || '/'
  const search = parsed.searchParams.toString()
  return `${pathname.startsWith('/') ? pathname : `/${pathname}`}${search ? `?${search}` : ''}`
}

function translatedHeaders(req) {
  const headers = { ...req.headers, host: `127.0.0.1:${AGENT_PORT}` }
  const supplied = String(headers['x-realtalent-prospecting-token'] || '').trim()
  if (PREVIEW_TOKEN.length >= 24 && supplied === PREVIEW_TOKEN) {
    headers['x-realtalent-prospecting-token'] = PRIMARY_TOKEN
  }
  delete headers.origin
  delete headers.referer
  delete headers['x-forwarded-host']
  delete headers['x-forwarded-proto']
  delete headers['x-vercel-id']
  return headers
}

function proxy(req, res) {
  const targetPath = normalizedPath(req)
  const upstream = http.request({
    host: '127.0.0.1',
    port: AGENT_PORT,
    path: targetPath,
    method: req.method,
    headers: translatedHeaders(req),
  }, (upstreamResponse) => {
    res.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers)
    upstreamResponse.pipe(res)
  })
  upstream.on('error', (error) => {
    if (!res.headersSent) {
      res.statusCode = 502
      res.setHeader('content-type', 'application/json; charset=utf-8')
    }
    res.end(JSON.stringify({ ok: false, error: 'prospecting_upstream_unavailable', message: String(error?.message || error) }))
  })
  req.pipe(upstream)
}

async function ready() {
  try {
    const response = await fetch(`http://127.0.0.1:${AGENT_PORT}/api/prospecting-agent/health`, {
      headers: { 'x-realtalent-prospecting-token': PRIMARY_TOKEN },
      signal: AbortSignal.timeout(2000),
    })
    return { ok: response.ok, status: response.status }
  } catch (error) {
    return { ok: false, error: String(error?.message || error) }
  }
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(String(req.url || '/'), `http://${req.headers.host || 'localhost'}`).pathname
  if (pathname === '/health') {
    return sendJson(res, 200, { ok: true, status: 'ok', service: 'realtalent-prospecting-preview', version: VERSION, sourceSha: SOURCE_SHA, uptimeSeconds: Math.round(process.uptime()) })
  }
  if (pathname === '/ready') {
    const agent = await ready()
    return sendJson(res, agent.ok ? 200 : 503, { ok: agent.ok, status: agent.ok ? 'ready' : 'starting', service: 'realtalent-prospecting-preview', version: VERSION, sourceSha: SOURCE_SHA, agent })
  }
  if (pathname === '/prospecting' || pathname.startsWith('/prospecting/')) return proxy(req, res)
  return sendJson(res, 404, { ok: false, error: 'route_not_found' })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`RealTalent Prospecting Preview (${VERSION}) em 0.0.0.0:${PORT}`)
})

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  server.close()
  try { child.kill('SIGTERM') } catch {}
  setTimeout(() => process.exit(0), 1000).unref()
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
