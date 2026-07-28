import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}
const encoder = new TextEncoder()
const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
const json = (body: unknown, init: ResponseInit = {}) => Response.json(body, { ...init, headers: { ...cors, ...(init.headers ?? {}) } })

async function hmac(secret: string, body: string) {
  if (!secret) return ''
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(body)))
}

function privateDestination(rawUrl: string) {
  const url = new URL(rawUrl)
  if (url.protocol !== 'https:') throw new Error('O destino deve utilizar HTTPS.')
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.local') || host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return true
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!match) return false
  const [a, b] = [Number(match[1]), Number(match[2])]
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

function safeHeaders(value: Record<string, unknown> | null) {
  const blocked = new Set(['host', 'content-length', 'user-agent', 'x-realtalent-signature', 'x-realtalent-delivery', 'x-realtalent-event', 'x-realtalent-correlation'])
  return Object.fromEntries(Object.entries(value ?? {}).filter(([key, item]) => !blocked.has(key.toLowerCase()) && typeof item === 'string').slice(0, 12))
}

type DbClient = ReturnType<typeof createClient>

async function processDelivery(client: DbClient, deliveryId: string) {
  const { data: delivery, error: deliveryError } = await client.from('webhook_deliveries').select('*').eq('id', deliveryId).single()
  if (deliveryError || !delivery) return { id: deliveryId, ok: false, status: 'failed', error: deliveryError?.message ?? 'Entrega não encontrada.' }
  if (['success', 'cancelled'].includes(delivery.status)) return { id: delivery.id, ok: true, status: delivery.status }
  if (delivery.status === 'sending') return { id: delivery.id, ok: true, status: 'sending', skipped: 'already_claimed' }

  const { data: endpoint, error: endpointError } = await client.from('automation_webhooks').select('*').eq('id', delivery.webhook_id).single()
  if (endpointError || !endpoint) return { id: delivery.id, ok: false, status: 'failed', error: endpointError?.message ?? 'Webhook não encontrado.' }

  const attempts = Number(delivery.attempts ?? 0) + 1
  const maxAttempts = Number(endpoint.max_attempts ?? 3)
  const finishFailure = async (message: string, responseStatus: number | null = null, responseBody = '') => {
    const terminal = attempts >= maxAttempts || !endpoint.enabled
    const delayMinutes = Math.min(60, 2 ** Math.max(0, attempts - 1))
    await client.from('webhook_deliveries').update({
      status: terminal ? 'failed' : 'pending', attempts, response_status: responseStatus,
      response_body: responseBody.slice(0, 8000), error_message: message.slice(0, 2000),
      next_attempt_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
      finished_at: terminal ? new Date().toISOString() : null,
    }).eq('id', delivery.id)
    return { id: delivery.id, ok: false, status: terminal ? 'failed' : 'pending', attempts, error: message }
  }

  if (!endpoint.enabled) return await finishFailure('Webhook pausado.')
  try {
    if (privateDestination(endpoint.url)) return await finishFailure('Destino privado ou local bloqueado por segurança.')
  } catch (error) { return await finishFailure(error instanceof Error ? error.message : 'URL inválida.') }

  const { data: claim, error: claimError } = await client.from('webhook_deliveries')
    .update({ status: 'sending', attempts, error_message: '', last_attempt_at: new Date().toISOString() })
    .eq('id', delivery.id).eq('status', delivery.status).select('id').maybeSingle()
  if (claimError) return { id: delivery.id, ok: false, status: 'pending', error: claimError.message }
  if (!claim) return { id: delivery.id, ok: true, status: 'sending', skipped: 'claimed_by_another_worker' }
  const body = JSON.stringify(delivery.request_body ?? {})
  const signature = await hmac(endpoint.secret_token ?? '', body)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(3, Math.min(30, endpoint.timeout_seconds ?? 10)) * 1000)

  try {
    const response = await fetch(endpoint.url, {
      method: endpoint.method,
      headers: {
        'content-type': 'application/json',
        'user-agent': 'RealTalent-Automation/100.42',
        'x-realtalent-event': delivery.event_type,
        'x-realtalent-delivery': delivery.id,
        'x-realtalent-correlation': delivery.correlation_id,
        ...(signature ? { 'x-realtalent-signature': `sha256=${signature}` } : {}),
        ...safeHeaders(endpoint.headers),
      },
      body,
      signal: controller.signal,
      redirect: 'error',
    })
    const responseBody = (await response.text()).slice(0, 8000)
    if (!response.ok) return await finishFailure(`HTTP ${response.status}: ${responseBody || response.statusText}`, response.status, responseBody)
    await client.from('webhook_deliveries').update({
      status: 'success', attempts, response_status: response.status, response_body: responseBody,
      error_message: '', finished_at: new Date().toISOString(),
    }).eq('id', delivery.id)
    return { id: delivery.id, ok: true, status: 'success', attempts, responseStatus: response.status }
  } catch (error) {
    const message = error instanceof DOMException && error.name === 'AbortError' ? 'Tempo limite excedido.' : error instanceof Error ? error.message : 'Falha desconhecida.'
    return await finishFailure(message)
  } finally { clearTimeout(timeout) }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!supabaseUrl || !serviceRole || !anonKey) return json({ ok: false, error: 'Ambiente Supabase incompleto.' }, { status: 500 })
  const client = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } })

  try {
    const payload = await request.json().catch(() => ({}))
    const deliveryId = String(payload?.deliveryId ?? '')
    if (deliveryId) {
      const authorization = request.headers.get('authorization') ?? ''
      const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: authorization } } })
      const { data: authData, error: authError } = await authClient.auth.getUser()
      if (authError || !authData.user) return json({ ok: false, error: 'Usuário não autenticado.' }, { status: 401 })
      const { data: delivery, error: deliveryError } = await client.from('webhook_deliveries').select('organization_id').eq('id', deliveryId).single()
      if (deliveryError || !delivery) return json({ ok: false, error: 'Entrega não encontrada.' }, { status: 404 })
      const { data: membership } = await client.from('organization_members').select('organization_id').eq('organization_id', delivery.organization_id).eq('user_id', authData.user.id).maybeSingle()
      if (!membership) return json({ ok: false, error: 'Acesso negado para esta organização.' }, { status: 403 })
      return json(await processDelivery(client, deliveryId))
    }

    const cronSecret = Deno.env.get('AUTOMATION_WEBHOOK_CRON_SECRET') ?? ''
    if (!cronSecret || request.headers.get('x-cron-secret') !== cronSecret) return json({ ok: false, error: 'Execução de fila não autorizada.' }, { status: 401 })
    await client.from('webhook_deliveries').update({ status: 'pending', error_message: 'Execução anterior interrompida; entrega recolocada na fila.' })
      .eq('status', 'sending').lt('last_attempt_at', new Date(Date.now() - 5 * 60_000).toISOString())
    const { data, error } = await client.from('webhook_deliveries').select('id')
      .eq('status', 'pending').lte('next_attempt_at', new Date().toISOString()).order('created_at', { ascending: true }).limit(20)
    if (error) throw new Error(error.message)
    const results = []
    for (const row of data ?? []) results.push(await processDelivery(client, row.id))
    return json({ ok: true, processed: results.length, results })
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'Falha desconhecida.' }, { status: 500 })
  }
})
