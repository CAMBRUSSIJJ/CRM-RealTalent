import { constantTimeEquals, createAdminClient, hmacSha256Hex, jsonResponse, readJsonBody, textResponse, type CommunicationProvider } from '../core.ts'

const provider: CommunicationProvider = 'whatsapp'

export async function handleWhatsAppWebhook(request: Request, requestId: string): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === 'GET') {
    const expected = Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN') || ''
    const supplied = url.searchParams.get('hub.verify_token') || ''
    const mode = url.searchParams.get('hub.mode') || ''
    if (!expected || mode !== 'subscribe' || !constantTimeEquals(supplied, expected)) return textResponse(provider, requestId, 'Forbidden', 403)
    return textResponse(provider, requestId, url.searchParams.get('hub.challenge') || '', 200)
  }
  if (request.method !== 'POST') return jsonResponse(provider, requestId, { error: 'Método não permitido' }, 405)

  const { raw, value: payload } = await readJsonBody(request)
  const appSecret = Deno.env.get('META_APP_SECRET') || ''
  const supplied = request.headers.get('x-hub-signature-256') || ''
  if (appSecret.length < 32 || !supplied.startsWith('sha256=')) return jsonResponse(provider, requestId, { error: 'Webhook signature unavailable' }, 503)
  const expected = `sha256=${await hmacSha256Hex(raw, appSecret)}`
  if (!constantTimeEquals(supplied, expected)) return jsonResponse(provider, requestId, { error: 'Invalid signature' }, 401)

  const admin = createAdminClient() as any
  let processed = 0
  let ignored = 0
  for (const entry of payload.entry || []) for (const change of entry.changes || []) {
    const value = change.value || {}
    const phoneNumberId = String(value.metadata?.phone_number_id || '')
    if (!phoneNumberId) { ignored += 1; continue }
    const { data: account, error: accountError } = await admin.from('integration_connected_accounts').select('*').eq('provider', 'whatsapp_cloud').eq('metadata->>phone_number_id', phoneNumberId).eq('status', 'connected').maybeSingle()
    if (accountError) throw accountError
    if (!account) { ignored += 1; continue }

    for (const message of value.messages || []) {
      const body = message.text?.body || message.button?.text || message.interactive?.button_reply?.title || '[Mensagem não textual]'
      const { error } = await admin.rpc('upsert_inbound_communication', {
        p_organization_id: account.organization_id,
        p_account_id: account.id,
        p_channel: 'whatsapp',
        p_external_message_id: String(message.id),
        p_sender: String(message.from || ''),
        p_recipients: [String(value.metadata?.display_phone_number || '')],
        p_subject: '',
        p_body: String(body),
        p_occurred_at: new Date(Number(message.timestamp || Date.now() / 1000) * 1000).toISOString(),
        p_metadata: { type: message.type, contacts: value.contacts || [], gateway: 'communications-gateway-v101.11.0', correlation_id: requestId },
      })
      if (error) throw error
      processed += 1
    }

    for (const status of value.statuses || []) {
      const mapped = status.status === 'read' ? 'read' : status.status === 'delivered' ? 'delivered' : status.status === 'sent' ? 'sent' : status.status === 'failed' ? 'failed' : 'sent'
      const { error } = await admin.from('communication_events').update({ status: mapped, metadata: { whatsapp_status: status, gateway: 'communications-gateway-v101.11.0', correlation_id: requestId } }).eq('organization_id', account.organization_id).eq('external_message_id', String(status.id || ''))
      if (error) throw error
      processed += 1
    }
  }
  return jsonResponse(provider, requestId, { accepted: true, processed, ignored }, 200)
}
