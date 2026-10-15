import { constantTimeEquals, createAdminClient, jsonResponse, readJsonBody, sha256Hex, stableDigest, textResponse, type CommunicationProvider } from '../core.ts'

const provider: CommunicationProvider = 'microsoft'

export async function handleMicrosoftWebhook(request: Request, requestId: string): Promise<Response> {
  const url = new URL(request.url)
  const validation = url.searchParams.get('validationToken')
  if (validation) return textResponse(provider, requestId, validation, 200)
  if (request.method !== 'POST') return jsonResponse(provider, requestId, { error: 'Método não permitido' }, 405)

  const { value: body } = await readJsonBody(request)
  const notices = Array.isArray(body.value) ? body.value : []
  if (!notices.length) return jsonResponse(provider, requestId, { accepted: 0, lifecycle: 0, rejected: 0 }, 202)
  const ids = [...new Set(notices.map((notice: any) => String(notice.subscriptionId || '')).filter(Boolean))]
  if (!ids.length) return jsonResponse(provider, requestId, { accepted: 0, lifecycle: 0, rejected: notices.length }, 202)
  const admin = createAdminClient() as any
  const { data: subscriptions, error: subscriptionQueryError } = await admin.from('communication_subscriptions').select('*').eq('provider', 'microsoft').in('external_subscription_id', ids)
  if (subscriptionQueryError) throw subscriptionQueryError
  const byId = new Map((subscriptions || []).map((item: any) => [String(item.external_subscription_id), item]))

  let accepted = 0
  let lifecycle = 0
  let rejected = 0
  for (const notice of notices) {
    const subscription = byId.get(String(notice.subscriptionId || '')) as any
    if (!subscription) { rejected += 1; continue }
    if (subscription.verification_secret_hash) {
      const suppliedHash = await sha256Hex(String(notice.clientState || ''))
      if (!constantTimeEquals(suppliedHash, String(subscription.verification_secret_hash))) { rejected += 1; continue }
    }

    const stableNoticeId = String(notice.sequenceNumber || notice.resourceData?.id || await stableDigest({ subscriptionId: notice.subscriptionId, changeType: notice.changeType, resource: notice.resource, lifecycleEvent: notice.lifecycleEvent, resourceData: notice.resourceData }))
    const lifecycleEvent = String(notice.lifecycleEvent || '')
    if (lifecycleEvent) {
      lifecycle += 1
      const renewalNeeded = ['reauthorizationRequired', 'subscriptionRemoved', 'missed'].includes(lifecycleEvent)
      const { error: updateError } = await admin.from('communication_subscriptions').update({ status: renewalNeeded ? 'renewal_due' : 'active', last_error: renewalNeeded ? `Microsoft lifecycle: ${lifecycleEvent}` : null, metadata: { ...(subscription.metadata || {}), last_lifecycle_event: lifecycleEvent, correlation_id: requestId } }).eq('id', subscription.id)
      if (updateError) throw updateError
      if (renewalNeeded) {
        const syncType = subscription.resource_type === 'outlook_mail' ? 'microsoft_mail_pull' : 'microsoft_calendar_pull'
        const { error: renewError } = await admin.rpc('enqueue_integration_sync_job_system', { p_organization_id: subscription.organization_id, p_account_id: subscription.account_id, p_job_type: 'microsoft_subscription_renew', p_idempotency_key: `ms-lifecycle:${subscription.id}:${lifecycleEvent}:${stableNoticeId}`.slice(0, 180), p_payload: { source: 'microsoft_lifecycle', subscription_id: subscription.id, lifecycle_event: lifecycleEvent, correlation_id: requestId } })
        if (renewError) throw renewError
        const { error: syncError } = await admin.rpc('enqueue_integration_sync_job_system', { p_organization_id: subscription.organization_id, p_account_id: subscription.account_id, p_job_type: syncType, p_idempotency_key: `ms-lifecycle-sync:${subscription.id}:${stableNoticeId}`.slice(0, 180), p_payload: { source: 'microsoft_lifecycle', full_recovery: lifecycleEvent === 'missed', correlation_id: requestId } })
        if (syncError) throw syncError
      }
      continue
    }

    const jobType = subscription.resource_type === 'outlook_mail' ? 'microsoft_mail_pull' : 'microsoft_calendar_pull'
    const idempotencyKey = `microsoft:${String(notice.subscriptionId || '').slice(0, 80)}:${stableNoticeId}`.slice(0, 180)
    const { error: queueError } = await admin.from('integration_sync_jobs').upsert({
      organization_id: subscription.organization_id,
      account_id: subscription.account_id,
      provider: 'microsoft',
      job_type: jobType,
      worker_key: 'microsoft-sync',
      status: 'queued',
      idempotency_key: idempotencyKey,
      payload: { resource: notice.resource, subscription_id: subscription.id, change_type: notice.changeType || null, correlation_id: requestId, gateway: 'communications-gateway-v101.11.0' },
    }, { onConflict: 'organization_id,idempotency_key' })
    if (queueError) throw queueError
    const { error: updateError } = await admin.from('communication_subscriptions').update({ last_notification_at: new Date().toISOString(), status: 'active', last_error: null }).eq('id', subscription.id)
    if (updateError) throw updateError
    accepted += 1
  }
  return jsonResponse(provider, requestId, { accepted, lifecycle, rejected }, 202)
}
