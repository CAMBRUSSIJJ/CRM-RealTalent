import { Readable } from 'node:stream'
import {cloudflareAgentAccessHeaders} from './_cloudflare-access.mjs'

// URLs may have a trailing slash. Machine credentials must be forwarded byte-for-byte.
const clean = (value) => String(value || '').trim().replace(/\/$/, '')
const machineCredential = (value) => typeof value === 'string' ? value : ''
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

// A WhatsApp Web QR is a pairing secret. Authentication alone is not enough:
// only an owner/admin of the requested workspace may read/start/revoke its pairing.
const isQrPairingRoute = (service, suffix) => service === 'communications'
  && /^\/api\/integrations\/whatsapp\/qr\/(?:status|start|disconnect|diagnostics)$/.test(new URL(suffix, 'https://runtime.local').pathname)

const qrWorkspaceId = (req, suffix) => {
  const endpoint = new URL(suffix, 'https://runtime.local')
  if (String(req.method || 'GET').toUpperCase() === 'GET') return endpoint.searchParams.get('workspaceId') || ''
  let body = req.body
  if (Buffer.isBuffer(body)) body = body.toString('utf8')
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { return '' } }
  return typeof body?.workspaceId === 'string' ? body.workspaceId : ''
}

async function canManageQrWorkspace(req, userId, workspaceId) {
  const supabaseUrl = clean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const publishable = clean(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY)
  const bearer = clean(req.headers.authorization)
  const params = new URLSearchParams({ select: 'role', organization_id: 'eq.' + workspaceId,
    user_id: 'eq.' + userId, limit: '1' })
  const response = await fetch(supabaseUrl + '/rest/v1/organization_members?' + params, {
    headers: { apikey: publishable, authorization: bearer, accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error('workspace_membership_check_unavailable')
  const rows = await response.json()
  return Array.isArray(rows) && rows.some((row) => row?.role === 'owner' || row?.role === 'admin')
}

// QR chats and account lists live in Railway, not in Supabase's RLS tables.
// Enforce a workspace membership check before the hosted proxy can read/sync
// gateway records; a valid JWT from another workspace is not sufficient.
const needsCommunicationWorkspaceMembership = (service, suffix) => service === 'communications'
  && ['/api/communications/events', '/api/communications/revision', '/api/integrations/accounts', '/api/communications/sync',
    '/api/communications/send', '/api/communications/retry', '/api/communications/read',
    '/api/integrations/whatsapp/qr/contacts', '/api/integrations/whatsapp/qr/groups',
    '/api/integrations/whatsapp/qr/groups/info']
    .includes(new URL(suffix, 'https://runtime.local').pathname)

async function canReadCommunicationWorkspace(req, userId, workspaceId) {
  const supabaseUrl = clean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const publishable = clean(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY)
  const params = new URLSearchParams({ select: 'role', organization_id: 'eq.' + workspaceId,
    user_id: 'eq.' + userId, limit: '1' })
  const response = await fetch(supabaseUrl + '/rest/v1/organization_members?' + params, {
    headers: { apikey: publishable, authorization: clean(req.headers.authorization), accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error('workspace_membership_check_unavailable')
  const rows = await response.json()
  return Array.isArray(rows) && rows.some((row) => typeof row?.role === 'string' && row.role.length > 0)
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
  const token = machineCredential(process.env[config.token])
  if (!upstream || !token) return sendJson(res, 503, { ok:false, error:'runtime_upstream_not_configured', service })
  let parsed
  try { parsed = new URL(upstream) } catch { return sendJson(res, 503, { ok:false, error:'runtime_upstream_invalid', service }) }
  if (process.env.VERCEL_ENV === 'production' && parsed.protocol !== 'https:') return sendJson(res, 503, { ok:false, error:'runtime_upstream_must_use_https', service })

  const prefix = `/api/runtime/${service}`
  const rawUrl = String(req.url || '/')
  const suffix = typeof req.__realtalentRuntimePath === 'string'
    ? req.__realtalentRuntimePath
    : (rawUrl.startsWith(prefix) ? rawUrl.slice(prefix.length) || '/' : '/')
  if (isQrPairingRoute(service, suffix) || needsCommunicationWorkspaceMembership(service, suffix)) {
    const workspaceId = qrWorkspaceId(req, suffix)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId)) {
      return sendJson(res, 400, { ok:false, error:'invalid_workspace_id' })
    }
    const pairing = isQrPairingRoute(service, suffix)
    let permitted = false
    try {
      permitted = pairing
        ? await canManageQrWorkspace(req, String(user.id), workspaceId)
        : await canReadCommunicationWorkspace(req, String(user.id), workspaceId)
    } catch { return sendJson(res, 503, { ok:false, error:'workspace_permission_check_unavailable' }) }
    if (!permitted) return sendJson(res, 403, { ok:false, error:pairing ? 'workspace_admin_required' : 'workspace_membership_required' })
  }
  const target = `${upstream}${suffix.startsWith('/') ? suffix : `/${suffix}`}`
  let cloudflareHeaders = {}
  if (service === 'agent') {
    try { cloudflareHeaders = cloudflareAgentAccessHeaders() }
    catch { return sendJson(res, 503, { ok:false, error:'cloudflare_access_not_configured', service }) }
  }
  const headers = {
    accept: String(req.headers.accept || 'application/json'),
    [config.header]: token,
    'x-realtalent-user-id': String(user.id),
    ...cloudflareHeaders,
  }
  const protectionBypass = clean(process.env.VERCEL_AUTOMATION_BYPASS_SECRET)
  if (service === 'prospecting' && protectionBypass) headers['x-vercel-protection-bypass'] = protectionBypass
  if (req.headers['content-type']) headers['content-type'] = String(req.headers['content-type'])
  if (req.headers['idempotency-key']) headers['idempotency-key'] = String(req.headers['idempotency-key'])

  try {
    const upstreamResponse = await fetch(target, { method: req.method, headers, body: safeBody(req), redirect:'manual', signal: AbortSignal.timeout(55_000) })
    // A página de proteção da Vercel não é a resposta JSON do motor. Não encaminhar HTML de login como se fosse falha do Garimpo.
    const upstreamType = upstreamResponse.headers.get('content-type') || ''
    const upstreamLocation = upstreamResponse.headers.get('location') || ''
    if (service === 'prospecting' && [301, 302, 303, 307, 308, 401, 403].includes(upstreamResponse.status)
      && (upstreamType.includes('text/html') || /(?:vercel\.com\/login|_vercel_sso_nonce|_vercel_share)/i.test(upstreamLocation))) {
      return sendJson(res, 502, { ok:false, service, error:'runtime_preview_protection_blocked',
        message:'A proteção do deployment Preview impede a comunicação com o Garimpo. Configure a autenticação de serviço no ambiente Preview.' })
    }
    // A requisição do usuário já foi validada pelo Supabase neste proxy.
    // HTTP 401 daqui vem do serviço upstream ou da credencial de máquina.
    // Não apresentar isto como sessão expirada do usuário nem revelar tokens.
    if (upstreamResponse.status === 401) {
      console.error('[runtime-auth] Credencial de serviço rejeitada pelo upstream', {
        service, environment: process.env.VERCEL_ENV || 'unknown', upstreamStatus: 401,
      })
      return sendJson(res, 502, {
        ok:false, service, error:'runtime_upstream_auth_rejected',
        message:'Integração temporariamente indisponível: o gateway rejeitou a autenticação entre serviços. Verifique os tokens do runtime no Vercel e no Railway.',
      })
    }
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
