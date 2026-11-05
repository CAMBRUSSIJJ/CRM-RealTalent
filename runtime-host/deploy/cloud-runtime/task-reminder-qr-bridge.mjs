import { timingSafeEqual } from 'node:crypto'

// This endpoint is a trusted *service-to-service* delivery adapter, not a
// browser API. The Supabase private cron job owns eligibility and consent.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const E164 = /^\+[1-9]\d{7,14}$/
const allowedType = new Set(['assigned', 'due_soon'])

export function taskBridgeAuthorized(supplied, configured) {
  if (typeof configured !== 'string' || configured.length < 32 || typeof supplied !== 'string') return false
  const secret = Buffer.from(configured, 'utf8')
  const actual = Buffer.from(supplied, 'utf8')
  return secret.length === actual.length && timingSafeEqual(secret, actual)
}

export function validateTaskReminder(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_request')
  const workspaceId = String(input.workspaceId || '')
  const jobId = String(input.jobId || '')
  const phone = String(input.phone || '')
  const title = String(input.title || '').trim()
  const eventType = String(input.eventType || '')
  const dueAt = input.dueAt == null ? null : String(input.dueAt)
  if (!UUID.test(workspaceId) || !UUID.test(jobId) || !E164.test(phone) ||
      title.length < 1 || title.length > 120 || !allowedType.has(eventType) ||
      (dueAt && (!Number.isFinite(Date.parse(dueAt)) || dueAt.length > 48))) throw new Error('invalid_request')
  return { workspaceId, jobId, phone, title, eventType, dueAt }
}

export function taskReminderMessage(input, appUrl) {
  const date = input.dueAt
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(input.dueAt))
    : 'Sem prazo'
  let link = 'Acesse o RealTalent CRM'
  try {
    const u = new URL(String(appUrl || ''))
    if (u.protocol === 'https:') link = `Acesse: ${u.origin}/tasks`
  } catch {}
  return `RealTalent | ${input.eventType === 'assigned' ? 'Nova tarefa atribuída' : 'Lembrete de tarefa'}\n\nTarefa: ${input.title}\nPrazo: ${date}\n${link}`
}

const gatewayRequest = async (path, { method = 'GET', body, runtimeToken, timeout = 5000 }) => {
  const response = await fetch(`http://127.0.0.1:3002${path}`, {
    method,
    headers: {
      'x-realtalent-runtime-token': runtimeToken,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(timeout),
  })
  const payload = await response.json().catch(() => ({}))
  return { status: response.status, payload }
}

const reply = (res, code, data) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(data))
}

const readLimitedJson = async req => {
  const chunks = []
  let count = 0
  for await (const chunk of req) {
    count += chunk.byteLength
    if (count > 8192) throw new Error('payload_too_large')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export async function handleTaskReminderQrBridge(req, res, {
  token = process.env.REALTALENT_TASK_REMINDER_BRIDGE_TOKEN,
  runtimeToken = process.env.REALTALENT_RUNTIME_TOKEN,
  appUrl = process.env.REALTALENT_PUBLIC_APP_URL,
  requestGateway = gatewayRequest,
} = {}) {
  if (req.method !== 'POST') return reply(res, 405, { ok: false, reason: 'method_not_allowed' })
  if (!taskBridgeAuthorized(req.headers['x-realtalent-task-bridge-token'], token))
    return reply(res, 401, { ok: false, reason: 'unauthorized' })
  if (typeof runtimeToken !== 'string' || runtimeToken.length < 24)
    return reply(res, 503, { ok: false, reason: 'gateway_auth_unavailable' })
  let input
  try { input = validateTaskReminder(await readLimitedJson(req)) }
  catch (error) {
    return reply(res, error?.message === 'payload_too_large' ? 413 : 400,
      { ok: false, reason: 'invalid_request' })
  }
  try {
    const workspaceId = encodeURIComponent(input.workspaceId)
    const [accounts, state] = await Promise.all([
      requestGateway(`/api/integrations/accounts?workspaceId=${workspaceId}`, { runtimeToken }),
      requestGateway(`/api/integrations/whatsapp/qr/status?workspaceId=${workspaceId}`, { runtimeToken }),
    ])
    if (accounts.status !== 200 || state.status !== 200)
      return reply(res, 503, { ok: false, reason: 'gateway_unavailable' })
    const account = (accounts.payload.accounts || []).find(a =>
      a.provider === 'whatsapp_cloud' && a.metadata?.transport === 'qr' && a.status === 'connected')
    if (!account || state.payload.state !== 'connected')
      return reply(res, 409, { ok: false, reason: 'qr_session_not_connected' })

    const result = await requestGateway('/api/communications/send', {
      method: 'POST', runtimeToken, timeout: 20_000,
      body: {
        workspaceId: input.workspaceId,
        accountId: account.id,
        channel: 'whatsapp',
        recipient: input.phone,
        body: taskReminderMessage(input, appUrl),
        idempotencyKey: `task-reminder-qr:${input.jobId}`,
      },
    })
    if (![200, 202].includes(result.status) || !result.payload?.event)
      return reply(res, 503, { ok: false, reason: 'gateway_send_not_confirmed' })
    const event = result.payload.event
    if (event.status === 'failed')
      return reply(res, 503, { ok: false, reason: 'gateway_rejected_message' })
    // Accepted into the gateway outbox, NOT WhatsApp delivery/read proof.
    return reply(res, 202, {
      ok: true, state: 'accepted_by_gateway', deliveryConfirmed: false,
      gatewayEventId: String(event.id || ''),
      idempotent: Boolean(result.payload.idempotent),
    })
  } catch (error) {
    console.error('[task-qr-bridge] entrega de job não confirmada', input.jobId,
      error instanceof Error ? error.name : 'unknown_error')
    return reply(res, 503, { ok: false, reason: 'delivery_outcome_unknown_requires_review' })
  }
}
