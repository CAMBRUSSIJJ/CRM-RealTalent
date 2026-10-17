import { Readable } from 'node:stream'

const clean = (value) => String(value || '').trim().replace(/\/$/, '')
const serviceConfig = {
  agent: { upstream: 'REALTALENT_AGENT_UPSTREAM_URL', token: 'REALTALENT_AGENT_RUNTIME_TOKEN', header: 'x-realtalent-agent-token' },
  communications: { upstream: 'REALTALENT_COMMUNICATIONS_UPSTREAM_URL', token: 'REALTALENT_RUNTIME_TOKEN', header: 'x-realtalent-runtime-token' },
  prospecting: { upstream: 'REALTALENT_PROSPECTING_UPSTREAM_URL', token: 'REALTALENT_PROSPECTING_RUNTIME_TOKEN', header: 'x-realtalent-prospecting-token' },
}

const sendJson = (res, status, body) => {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

async function authenticatedUser(req) {
  const auth = clean(req.headers.authorization)
  if (!auth.toLowerCase().startsWith('bearer ')) return null
  const supabaseUrl = clean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const publishable = clean(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY)
  if (!supabaseUrl || !publishable) throw new Error('cloud_auth_not_configured')
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: publishable, authorization: auth }, signal: AbortSignal.timeout(8000) })
  if (!response.ok) return null
  const user = await response.json().catch(() => null)
  return user?.id ? user : null
}

const safeBody = (req) => {
  if (['GET','HEAD'].includes(String(req.method || 'GET').toUpperCase())) return undefined
  if (req.body == null) return undefined
  if (Buffer.isBuffer(req.body) || typeof req.body === 'string') return req.body
  return JSON.stringify(req.body)
}

export async function proxyRuntime(req, res, service) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
  const config = serviceConfig[service]
  if (!config) return sendJson(res, 404, { ok:false, error:'runtime_service_not_found' })
  let user
  try { user = await authenticatedUser(req) } catch { return sendJson(res, 503, { ok:false, error:'cloud_auth_not_configured' }) }
  if (!user) return sendJson(res, 401, { ok:false, error:'authentication_required' })

  const upstream = clean(process.env[config.upstream])
  const token = clean(process.env[config.token])
  if (!upstream || !token) return sendJson(res, 503, { ok:false, error:'runtime_upstream_not_configured', service })
  let parsed
  try { parsed = new URL(upstream) } catch { return sendJson(res, 503, { ok:false, error:'runtime_upstream_invalid', service }) }
  if (process.env.VERCEL_ENV === 'production' && parsed.protocol !== 'https:') return sendJson(res, 503, { ok:false, error:'runtime_upstream_must_use_https', service })

  const prefix = `/api/runtime/${service}`
  const rawUrl = String(req.url || '/')
  const suffix = typeof req.__realtalentRuntimePath === 'string'
    ? req.__realtalentRuntimePath
    : (rawUrl.startsWith(prefix) ? rawUrl.slice(prefix.length) || '/' : '/')
  const target = `${upstream}${suffix.startsWith('/') ? suffix : `/${suffix}`}`
  const headers = {
    accept: String(req.headers.accept || 'application/json'),
    [config.header]: token,
    'x-realtalent-user-id': String(user.id),
  }
  const protectionBypass = clean(process.env.VERCEL_AUTOMATION_BYPASS_SECRET)
  if (service === 'prospecting' && protectionBypass) headers['x-vercel-protection-bypass'] = protectionBypass
  if (req.headers['content-type']) headers['content-type'] = String(req.headers['content-type'])
  if (req.headers['idempotency-key']) headers['idempotency-key'] = String(req.headers['idempotency-key'])

  try {
    const upstreamResponse = await fetch(target, { method: req.method, headers, body: safeBody(req), redirect:'manual', signal: AbortSignal.timeout(55_000) })
    res.statusCode = upstreamResponse.status
    for (const name of ['content-type','cache-control','etag','last-modified']) {
      const value = upstreamResponse.headers.get(name); if (value) res.setHeader(name, value)
    }
    res.setHeader('cache-control', upstreamResponse.headers.get('cache-control') || 'no-store')
    const contentType = upstreamResponse.headers.get('content-type') || ''
    if (contentType.includes('text/event-stream') && upstreamResponse.body) {
      res.setHeader('x-accel-buffering','no')
      return Readable.fromWeb(upstreamResponse.body).pipe(res)
    }
    const body = Buffer.from(await upstreamResponse.arrayBuffer())
    res.end(body)
  } catch (error) {
    return sendJson(res, 502, { ok:false, error:'runtime_upstream_unavailable', service, message: String(error?.message || error).slice(0,240) })
  }
}
