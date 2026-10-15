import { constantTimeEquals, createAdminClient, jsonResponse, readJsonBody, type CommunicationProvider } from '../core.ts'

const provider: CommunicationProvider = 'gmail'

function decodePayload(value: string): { emailAddress?: string; historyId?: string } {
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))))
  } catch { return {} }
}

export async function handleGmailWebhook(request: Request, requestId: string): Promise<Response> {
  if (request.method !== 'POST') return jsonResponse(provider, requestId, { error: 'Método não permitido' }, 405)
  const url = new URL(request.url)
  const expected = Deno.env.get('GMAIL_PUBSUB_WEBHOOK_SECRET') || ''
  const supplied = request.headers.get('x-gmail-pubsub-secret') || url.searchParams.get('token') || ''
  if (expected.length < 32) return jsonResponse(provider, requestId, { error: 'Webhook secret unavailable' }, 503)
  if (!constantTimeEquals(supplied, expected)) return jsonResponse(provider, requestId, { error: 'Não autorizado' }, 401)

  const { value: body } = await readJsonBody(request, 512_000)
  const message = body.message || {}
  const decoded = decodePayload(String(message.data || ''))
  const email = String(decoded.emailAddress || '').toLowerCase()
  if (!email || !decoded.historyId) return jsonResponse(provider, requestId, { error: 'Notificação Gmail inválida' }, 400)

  const admin = createAdminClient() as any
  const { data: accounts, error } = await admin.from('integration_connected_accounts').select('id,organization_id,provider,metadata').eq('provider', 'google').eq('status', 'connected')
  if (error) throw error
  const account = (accounts || []).find((item: any) => String(item.metadata?.email || '').toLowerCase() === email)
  if (!account) return jsonResponse(provider, requestId, { accepted: false, reason: 'account_not_found' }, 202)

  const idempotencyKey = `gmail:${String(message.messageId || decoded.historyId).slice(0, 160)}`
  const { error: queueError } = await admin.from('integration_sync_jobs').upsert({
    organization_id: account.organization_id,
    account_id: account.id,
    provider: 'google',
    job_type: 'google_mail_pull',
    worker_key: 'google-sync',
    status: 'queued',
    idempotency_key: idempotencyKey,
    payload: { history_id: decoded.historyId, email_address: email, pubsub_message_id: message.messageId || null, correlation_id: requestId, gateway: 'communications-gateway-v101.11.0' },
  }, { onConflict: 'organization_id,idempotency_key' })
  if (queueError) throw queueError
  const { error: subscriptionError } = await admin.from('communication_subscriptions').update({ last_notification_at: new Date().toISOString(), status: 'active', last_error: null, metadata: { history_id: decoded.historyId, email, correlation_id: requestId } }).eq('account_id', account.id).eq('resource_type', 'gmail_mailbox')
  if (subscriptionError) throw subscriptionError
  return jsonResponse(provider, requestId, { accepted: true, idempotencyKey }, 202)
}
