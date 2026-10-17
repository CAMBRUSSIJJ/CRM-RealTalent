import http from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { Readable } from 'node:stream'
import { Sandbox } from '@vercel/sandbox'

const PORT = Number(process.env.PORT || 3000)
const OUTER_TOKEN = String(process.env.REALTALENT_PROSPECTING_RUNTIME_TOKEN || '').trim()
const SANDBOX_NAME = 'realtalent-prospecting-preview'
const SANDBOX_PORT = 4319
const TOKEN_FILE = '/vercel/.realtalent-prospecting/runtime-token'
const STATE_DIR = '/vercel/.realtalent-prospecting/state'
const AGENT_FILE = '/vercel/CRM-RealTalent/runtime-host/RealTalent-CRM-V101.11.3-CR10-H1-Agent-V3.1.2-Linux-Launcher/scripts/realtalent-prospecting-agent.mjs'
const VERSION = 'prospecting-vercel-control-2.0.1'
const MAX_BODY = 1_200_000

let runtimePromise = null

function secureEqual(left, right) {
  const a = Buffer.from(String(left || ''))
  const b = Buffer.from(String(right || ''))
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b)
}

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

function suppliedToken(req) {
  return String(req.headers['x-realtalent-prospecting-token'] || '').trim()
}

async function readBody(req) {
  if (['GET', 'HEAD'].includes(String(req.method || 'GET').toUpperCase())) return undefined
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY) throw new Error('request_body_too_large')
    chunks.push(buffer)
  }
  return chunks.length ? Buffer.concat(chunks) : undefined
}

const ensureScript = `
set -euo pipefail
mkdir -p /vercel/.realtalent-prospecting ${STATE_DIR}
if [ ! -s ${TOKEN_FILE} ]; then
  node -e 'const {randomBytes}=require("crypto"); process.stdout.write(randomBytes(48).toString("base64url"))' > ${TOKEN_FILE}
  chmod 600 ${TOKEN_FILE}
fi
TOKEN="$(cat ${TOKEN_FILE})"
if curl -fsS --max-time 2 -H "x-realtalent-prospecting-token: $TOKEN" http://127.0.0.1:${SANDBOX_PORT}/api/prospecting-agent/health >/dev/null 2>&1; then
  exit 0
fi
if [ -f /vercel/.realtalent-prospecting/agent.pid ]; then
  kill "$(cat /vercel/.realtalent-prospecting/agent.pid)" 2>/dev/null || true
fi
nohup env \\
  REALTALENT_PROSPECTING_AGENT_HOST=0.0.0.0 \\
  REALTALENT_PROSPECTING_AGENT_PORT=${SANDBOX_PORT} \\
  REALTALENT_PROSPECTING_AGENT_STATE_DIR=${STATE_DIR} \\
  REALTALENT_PROSPECTING_RUNTIME_TOKEN="$TOKEN" \\
  PUPPETEER_SKIP_DOWNLOAD=true \\
  NODE_ENV=production \\
  node ${AGENT_FILE} > /vercel/.realtalent-prospecting/agent.log 2>&1 < /dev/null &
echo $! > /vercel/.realtalent-prospecting/agent.pid
for i in $(seq 1 80); do
  if curl -fsS --max-time 2 -H "x-realtalent-prospecting-token: $TOKEN" http://127.0.0.1:${SANDBOX_PORT}/api/prospecting-agent/health >/dev/null 2>&1; then
    exit 0
  fi
  sleep 0.25
done
exit 1
`

async function buildRuntime() {
  const sandbox = await Sandbox.get({ name: SANDBOX_NAME })
  const ensured = await sandbox.runCommand('bash', ['-lc', ensureScript])
  if (ensured.exitCode !== 0) {
    throw new Error('prospecting_sandbox_agent_start_failed')
  }

  const tokenResult = await sandbox.runCommand('cat', [TOKEN_FILE])
  if (tokenResult.exitCode !== 0) throw new Error('prospecting_sandbox_token_unavailable')
  const internalToken = String(await tokenResult.stdout()).trim()
  if (internalToken.length < 24) throw new Error('prospecting_sandbox_token_invalid')

  const baseUrl = sandbox.domain(SANDBOX_PORT).replace(/\/$/, '')
  const health = await fetch(`${baseUrl}/api/prospecting-agent/health`, {
    headers: { 'x-realtalent-prospecting-token': internalToken, accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  })
  if (!health.ok) throw new Error(`prospecting_sandbox_health_${health.status}`)

  return { sandbox, baseUrl, internalToken }
}

async function getRuntime({ refresh = false } = {}) {
  if (refresh) runtimePromise = null
  runtimePromise ||= buildRuntime().catch((error) => {
    runtimePromise = null
    throw error
  })
  return runtimePromise
}

async function fetchAgent(path, init = {}, retry = true) {
  const runtime = await getRuntime()
  try {
    const response = await fetch(`${runtime.baseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
      ...init,
      headers: {
        ...(init.headers || {}),
        'x-realtalent-prospecting-token': runtime.internalToken,
      },
      redirect: 'manual',
      signal: init.signal || AbortSignal.timeout(55_000),
      cache: 'no-store',
    })
    if (retry && [502, 503, 504].includes(response.status)) {
      try { await response.body?.cancel() } catch {}
      await getRuntime({ refresh: true })
      return fetchAgent(path, init, false)
    }
    return response
  } catch (error) {
    if (!retry) throw error
    await getRuntime({ refresh: true })
    return fetchAgent(path, init, false)
  }
}

async function operationalHealth(res) {
  try {
    const response = await fetchAgent('/api/prospecting-agent/health', {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    })
    const agent = await response.json().catch(() => null)
    return sendJson(res, response.ok ? 200 : 503, {
      ok: response.ok && Boolean(agent?.ok),
      service: 'realtalent-prospecting-vercel-control',
      version: VERSION,
      runtime: 'vercel-sandbox',
      sandbox: SANDBOX_NAME,
      region: 'gru1',
      agent: agent ? {
        ok: Boolean(agent.ok),
        version: agent.version,
        featureVersion: agent.featureVersion,
        queued: agent.queued,
        running: agent.running,
        chromium: agent.chromium,
        providerStatus: agent.providerStatus,
      } : null,
    })
  } catch (error) {
    return sendJson(res, 503, {
      ok: false,
      service: 'realtalent-prospecting-vercel-control',
      version: VERSION,
      runtime: 'vercel-sandbox',
      error: String(error?.message || error).slice(0, 240),
    })
  }
}

async function proxy(req, res) {
  if (!OUTER_TOKEN) return sendJson(res, 503, { ok: false, error: 'prospecting_control_token_not_configured' })
  if (!secureEqual(suppliedToken(req), OUTER_TOKEN)) return sendJson(res, 401, { ok: false, error: 'unauthorized' })

  let body
  try {
    body = await readBody(req)
  } catch (error) {
    return sendJson(res, 413, { ok: false, error: String(error?.message || error) })
  }

  const headers = { accept: String(req.headers.accept || 'application/json') }
  if (req.headers['content-type']) headers['content-type'] = String(req.headers['content-type'])
  if (req.headers['idempotency-key']) headers['idempotency-key'] = String(req.headers['idempotency-key'])
  if (req.headers['last-event-id']) headers['last-event-id'] = String(req.headers['last-event-id'])
  if (req.headers['x-realtalent-user-id']) headers['x-realtalent-user-id'] = String(req.headers['x-realtalent-user-id'])

  try {
    const upstream = await fetchAgent(String(req.url || '/'), {
      method: req.method,
      headers,
      body,
      signal: AbortSignal.timeout(55_000),
    })
    res.statusCode = upstream.status
    for (const name of ['content-type', 'cache-control', 'etag', 'last-modified']) {
      const value = upstream.headers.get(name)
      if (value) res.setHeader(name, value)
    }
    res.setHeader('cache-control', upstream.headers.get('cache-control') || 'no-store')
    if (upstream.body) return Readable.fromWeb(upstream.body).pipe(res)
    return res.end()
  } catch (error) {
    return sendJson(res, 502, {
      ok: false,
      error: 'prospecting_sandbox_unavailable',
      message: String(error?.message || error).slice(0, 240),
    })
  }
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(String(req.url || '/'), `http://${req.headers.host || 'localhost'}`).pathname
  if (pathname === '/health' || pathname === '/ready') return operationalHealth(res)
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    return res.end()
  }
  return proxy(req, res)
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[realtalent-prospecting-vercel-control] ${VERSION} listening on 0.0.0.0:${PORT}`)
})
