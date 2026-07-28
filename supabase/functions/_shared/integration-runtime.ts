import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

export type Provider = 'google' | 'microsoft' | 'meta' | 'whatsapp_cloud'
export type WorkerKey = 'google-sync' | 'microsoft-sync' | 'meta-sync' | 'whatsapp-sync' | 'token-refresh' | 'integration-health'

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, x-worker-secret' },
})

export const adminClient = () => createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  { auth: { persistSession: false, autoRefreshToken: false } },
) as any

export const assertWorkerSecret = (request: Request) => {
  const expected = Deno.env.get('INTEGRATION_WORKER_SECRET') || ''
  const supplied = request.headers.get('x-worker-secret') || ''
  if (expected.length < 32 || supplied !== expected) throw new Error('worker_unauthorized')
}

export const safeMessage = (error: unknown) => error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000)
const header = (headers: any[], name: string) => String(headers?.find((item) => String(item.name).toLowerCase() === name.toLowerCase())?.value || '')
const emailAddress = (value: string) => { const match = value.match(/<([^>]+)>/); return (match?.[1] || value).trim().toLowerCase() }
const textFromBase64Url = (value: string) => {
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4)
    return decodeURIComponent(escape(atob(normalized)))
  } catch { return '' }
}

const bytesToBase64Url = (bytes: Uint8Array) => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}
const utf8ToBase64Url = (value: string) => bytesToBase64Url(new TextEncoder().encode(value))
const sha256Hex = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map((item) => item.toString(16).padStart(2, '0')).join('')
const stripHtml = (value: string) => value.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim()
const sanitizeHtml = (value: string) => value
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/\son[a-z]+\s*=\s*(["']).*?\1/gi, '')
  .replace(/javascript:/gi, '')
const toIso = (value: unknown, fallback = new Date().toISOString()) => {
  const parsed = new Date(String(value || ''))
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString()
}
const providerFunctionBase = () => (Deno.env.get('SUPABASE_PUBLIC_FUNCTIONS_URL') || `${(Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '')}/functions/v1`).replace(/\/$/, '')

const gmailParts = (payload: any): { text: string; html: string; attachments: Array<Record<string, unknown>> } => {
  const output = { text: '', html: '', attachments: [] as Array<Record<string, unknown>> }
  const visit = (part: any) => {
    const mime = String(part?.mimeType || '').toLowerCase()
    const filename = String(part?.filename || '')
    const data = String(part?.body?.data || '')
    if (filename || part?.body?.attachmentId) {
      output.attachments.push({
        providerAttachmentId: String(part?.body?.attachmentId || ''),
        fileName: filename || 'anexo', contentType: mime || 'application/octet-stream',
        sizeBytes: Number(part?.body?.size || 0), disposition: header(part?.headers || [], 'Content-Disposition').toLowerCase().includes('inline') ? 'inline' : 'attachment',
        contentId: header(part?.headers || [], 'Content-ID').replace(/[<>]/g, ''),
      })
    } else if (data && mime === 'text/plain') output.text += `${textFromBase64Url(data)}\n`
    else if (data && mime === 'text/html') output.html += `${textFromBase64Url(data)}\n`
    for (const child of part?.parts || []) visit(child)
  }
  visit(payload)
  output.text = output.text.trim()
  output.html = sanitizeHtml(output.html.trim())
  if (!output.text && output.html) output.text = stripHtml(output.html)
  return output
}

async function subscriptionRow(admin: any, accountId: string, resourceType: string) {
  const { data, error } = await admin.from('communication_subscriptions').select('*').eq('account_id', accountId).eq('resource_type', resourceType).maybeSingle()
  if (error) throw new Error(error.message)
  return data || null
}

async function saveSubscriptionCursor(admin: any, account: any, resourceType: string, cursorKind: string, syncCursor: string | null, metadata: Record<string, unknown> = {}) {
  const current = await subscriptionRow(admin, account.id, resourceType)
  const { error } = await admin.from('communication_subscriptions').upsert({
    organization_id: account.organization_id, account_id: account.id, provider: account.provider, resource_type: resourceType,
    status: 'active', cursor_kind: cursorKind, sync_cursor: syncCursor, last_error: null,
    metadata: { ...(current?.metadata || {}), ...metadata }, updated_at: new Date().toISOString(),
  }, { onConflict: 'account_id,resource_type' })
  if (error) throw new Error(error.message)
  await admin.from('integration_connected_accounts').update({ sync_cursor: syncCursor, last_error: null }).eq('id', account.id)
}

async function upsertEmailFromProvider(admin: any, account: any, input: {
  externalId: string; direction: 'inbound' | 'outbound'; sender: string; recipients: string[]; subject: string;
  text: string; html?: string; occurredAt: string; threadId?: string; internetMessageId?: string; metadata?: Record<string, unknown>;
  attachments?: Array<Record<string, unknown>>
}) {
  let eventId: string | null = null
  if (input.direction === 'inbound') {
    const { data, error } = await admin.rpc('upsert_inbound_communication', {
      p_organization_id: account.organization_id, p_account_id: account.id, p_channel: 'email', p_external_message_id: input.externalId,
      p_sender: input.sender, p_recipients: input.recipients, p_subject: input.subject, p_body: input.text,
      p_occurred_at: input.occurredAt, p_metadata: { ...(input.metadata || {}), provider_thread_id: input.threadId || null },
    })
    if (error) throw new Error(error.message)
    eventId = String(data || '') || null
  } else {
    const { data, error } = await admin.from('communication_events').upsert({
      organization_id: account.organization_id, account_id: account.id, channel: 'email', direction: 'outbound', event_type: 'email', status: 'sent',
      external_message_id: input.externalId, sender_address: input.sender, recipient_addresses: input.recipients, subject: input.subject,
      body_text: input.text, occurred_at: input.occurredAt, metadata: { ...(input.metadata || {}), provider_thread_id: input.threadId || null },
    }, { onConflict: 'organization_id,channel,external_message_id' }).select('id').single()
    if (error) throw new Error(error.message)
    eventId = data?.id || null
  }
  if (!eventId) return null
  await admin.from('communication_events').update({
    body_html: sanitizeHtml(input.html || ''), internet_message_id: input.internetMessageId || null,
    has_attachments: Boolean(input.attachments?.length), metadata: { ...(input.metadata || {}), provider_thread_id: input.threadId || null },
  }).eq('id', eventId)
  if (input.attachments?.length) {
    await admin.from('communication_attachments').delete().eq('event_id', eventId)
    await admin.from('communication_attachments').insert(input.attachments.map((item) => ({
      organization_id: account.organization_id, event_id: eventId,
      file_name: String(item.fileName || 'anexo').slice(0, 255), content_type: String(item.contentType || 'application/octet-stream').slice(0, 150),
      size_bytes: Math.max(0, Math.min(10485760, Number(item.sizeBytes || 0))), content_id: String(item.contentId || '').slice(0, 255) || null,
      disposition: item.disposition === 'inline' ? 'inline' : 'attachment', provider_attachment_id: String(item.providerAttachmentId || '').slice(0, 500) || null,
    })))
  }
  return eventId
}

async function registerCalendarConflict(admin: any, account: any, provider: 'google' | 'microsoft', link: any, local: any, external: any, conflictType: string) {
  const resourceType = provider === 'google' ? 'google_calendar' : 'outlook_calendar'
  const payload = { organization_id: account.organization_id, account_id: account.id, resource_type: resourceType,
    local_resource_id: local?.id || link?.event_id || null, external_resource_id: String(external.id), conflict_type: conflictType,
    local_snapshot: local || {}, external_snapshot: external || {}, status: 'open', resolution: null, resolved_by: null, resolved_at: null }
  const { data: existing, error: lookupError } = await admin.from('integration_sync_conflicts').select('id').eq('account_id', account.id).eq('resource_type', resourceType).eq('external_resource_id', String(external.id)).eq('status', 'open').maybeSingle()
  if (lookupError) throw new Error(lookupError.message)
  const operation = existing ? admin.from('integration_sync_conflicts').update(payload).eq('id', existing.id) : admin.from('integration_sync_conflicts').insert(payload)
  const { error } = await operation
  if (error) throw new Error(error.message)
  await admin.from('calendar_external_links').update({ conflict_status: 'open' }).eq('account_id', account.id).eq('external_event_id', String(external.id))
}

async function applyExternalCalendarEvent(admin: any, account: any, provider: 'google' | 'microsoft', external: any) {
  const externalId = String(external.id || '')
  if (!externalId) return 0
  const { data: link } = await admin.from('calendar_external_links').select('*').eq('account_id', account.id).eq('external_event_id', externalId).maybeSingle()
  const { data: local } = link?.event_id ? await admin.from('calendar_events').select('*').eq('id', link.event_id).maybeSingle() : { data: null }
  const deleted = provider === 'google' ? external.status === 'cancelled' : Boolean(external['@removed']) || Boolean(external.isCancelled)
  const externalUpdatedAt = toIso(provider === 'google' ? external.updated : external.lastModifiedDateTime)
  const externalVersion = String(provider === 'google' ? external.etag || '' : external.changeKey || '')
  const localChangedAfterSync = Boolean(local && link?.last_synced_at && new Date(local.updated_at).getTime() > new Date(link.last_synced_at).getTime() + 1000)
  const externalChanged = Boolean(link && externalVersion && link.etag && externalVersion !== link.etag)
  if (link && localChangedAfterSync && (externalChanged || deleted) && link.conflict_status !== 'resolved_external') {
    await registerCalendarConflict(admin, account, provider, link, local, external, deleted ? 'external_deleted_local_updated' : 'both_updated')
    return 0
  }
  if (deleted) {
    if (local) await admin.from('calendar_events').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', local.id)
    await admin.from('calendar_external_links').update({ etag: externalVersion || link?.etag || null, external_updated_at: externalUpdatedAt, last_synced_at: new Date().toISOString(), conflict_status: 'clear' }).eq('account_id', account.id).eq('external_event_id', externalId)
    return 1
  }
  const starts = provider === 'google' ? external.start?.dateTime || `${external.start?.date}T00:00:00Z` : String(external.start?.dateTime || new Date().toISOString())
  const ends = provider === 'google' ? external.end?.dateTime || `${external.end?.date}T23:59:59Z` : String(external.end?.dateTime || starts)
  const title = provider === 'google' ? external.summary || 'Evento' : external.subject || 'Evento'
  const description = provider === 'google' ? external.description || '' : external.bodyPreview || stripHtml(String(external.body?.content || ''))
  const allDay = provider === 'google' ? Boolean(external.start?.date) : Boolean(external.isAllDay)
  const location = provider === 'google' ? external.location || '' : external.location?.displayName || ''
  let eventId = local?.id || null
  const timestamp = new Date().toISOString()
  if (eventId) {
    await admin.from('calendar_events').update({ title, description, starts_at: starts, ends_at: ends, all_day: allDay, location, status: 'confirmed', updated_at: timestamp }).eq('id', eventId)
  } else {
    const { data: created, error } = await admin.from('calendar_events').insert({ organization_id: account.organization_id, lead_id: null, title, description, starts_at: starts, ends_at: ends, all_day: allDay, location, status: 'confirmed', assigned_to: account.connected_by_user_id }).select('id,updated_at').single()
    if (error) throw new Error(error.message)
    eventId = created?.id
  }
  const fingerprint = await sha256Hex(JSON.stringify({ title, description, starts, ends, allDay, location }))
  await admin.from('calendar_external_links').upsert({
    organization_id: account.organization_id, event_id: eventId, account_id: account.id, provider,
    external_event_id: externalId, external_calendar_id: provider === 'google' ? String(account.metadata?.calendar_id || 'primary') : String(account.metadata?.calendar_id || 'default'),
    etag: externalVersion || null, external_updated_at: externalUpdatedAt, last_local_updated_at: timestamp, sync_fingerprint: fingerprint,
    conflict_status: 'clear', last_synced_at: timestamp,
  }, { onConflict: 'event_id,account_id' })
  await admin.from('communication_events').upsert({
    organization_id: account.organization_id, lead_id: local?.lead_id || null, account_id: account.id, channel: 'calendar', direction: 'internal', event_type: 'calendar_event', status: 'received',
    external_message_id: `${provider === 'google' ? 'gcal' : 'mscal'}:${externalId}`, subject: title, body_text: description, occurred_at: starts,
    metadata: { calendar_event_id: eventId, provider, external_updated_at: externalUpdatedAt },
  }, { onConflict: 'organization_id,channel,external_message_id' })
  return 1
}

export async function recordDiagnostic(admin: any, input: {
  organizationId: string
  accountId?: string | null
  provider: Provider | 'extension' | 'framework'
  runId: string
  checkKey: string
  status: 'pass' | 'warn' | 'fail'
  message: string
  latencyMs?: number | null
  details?: Record<string, unknown>
}) {
  await admin.from('integration_diagnostics').insert({
    organization_id: input.organizationId,
    account_id: input.accountId || null,
    provider: input.provider,
    run_id: input.runId,
    check_key: input.checkKey,
    status: input.status,
    message: input.message.slice(0, 1000),
    latency_ms: input.latencyMs ?? null,
    details: input.details || {},
  })
}

export async function auditEvent(admin: any, input: {
  organizationId: string
  accountId?: string | null
  provider: string
  eventType: string
  severity?: 'info' | 'warning' | 'error' | 'security'
  message: string
  correlationId?: string | null
  metadata?: Record<string, unknown>
  actorUserId?: string | null
}) {
  await admin.from('integration_audit_events').insert({
    organization_id: input.organizationId,
    account_id: input.accountId || null,
    provider: input.provider,
    event_type: input.eventType,
    severity: input.severity || 'info',
    actor_user_id: input.actorUserId || null,
    message: input.message.slice(0, 1000),
    correlation_id: input.correlationId || null,
    metadata: input.metadata || {},
  })
}


export async function recoverStaleJobs(admin: any, timeoutSeconds = 600) {
  const { data, error } = await admin.rpc('recover_stale_integration_jobs', { p_lock_timeout_seconds: timeoutSeconds })
  if (error) throw new Error(error.message)
  return Number(data || 0)
}

export async function claimJobs(admin: any, workerKey: WorkerKey, jobTypes: string[], limit = 20) {
  const { data, error } = await admin.rpc('claim_integration_sync_jobs', {
    p_worker_key: workerKey,
    p_job_types: jobTypes,
    p_limit: Math.max(1, Math.min(100, limit)),
    p_lease_seconds: 300,
  })
  if (error) throw new Error(error.message)
  if (!Array.isArray(data) || !data.length) return []
  const ids = data.map((job: any) => job.id)
  const { data: hydrated, error: hydrationError } = await admin.from('integration_sync_jobs')
    .select('*,integration_connected_accounts(*)').in('id', ids)
  if (hydrationError) throw new Error(hydrationError.message)
  const byId = new Map((hydrated || []).map((job: any) => [job.id, job]))
  return ids.map((id: string) => byId.get(id)).filter(Boolean)
}

async function readToken(admin: any, accountId: string) {
  const encryptionKey = Deno.env.get('INTEGRATION_TOKEN_ENCRYPTION_KEY') || ''
  if (encryptionKey.length < 32) throw new Error('INTEGRATION_TOKEN_ENCRYPTION_KEY ausente ou curta')
  const { data, error } = await admin.rpc('read_integration_oauth_token', { p_account_id: accountId, p_encryption_key: encryptionKey })
  if (error || !data?.[0]?.access_token) throw new Error(error?.message || 'Token OAuth indisponível')
  return { ...data[0], encryptionKey }
}

const providerCredentials = (provider: Provider) => {
  if (provider === 'google') return {
    clientId: Deno.env.get('GOOGLE_OAUTH_CLIENT_ID') || '',
    clientSecret: Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET') || '',
    tokenUrl: 'https://oauth2.googleapis.com/token',
  }
  if (provider === 'microsoft') return {
    clientId: Deno.env.get('MICROSOFT_OAUTH_CLIENT_ID') || '',
    clientSecret: Deno.env.get('MICROSOFT_OAUTH_CLIENT_SECRET') || '',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  }
  return {
    clientId: Deno.env.get('META_OAUTH_CLIENT_ID') || '',
    clientSecret: Deno.env.get('META_OAUTH_CLIENT_SECRET') || '',
    tokenUrl: `https://graph.facebook.com/${Deno.env.get('META_GRAPH_VERSION') || 'v23.0'}/oauth/access_token`,
  }
}

export async function refreshProviderToken(admin: any, account: any, force = false) {
  const current = await readToken(admin, account.id)
  const expiry = current.expires_at ? new Date(current.expires_at).getTime() : 0
  if (!force && expiry > Date.now() + 5 * 60_000) return String(current.access_token)
  const config = providerCredentials(account.provider as Provider)
  if (!config.clientId || !config.clientSecret) throw new Error(`Credenciais de servidor ausentes para ${account.provider}`)

  let response: Response
  if (account.provider === 'google') {
    if (!current.refresh_token) throw new Error('Refresh token do Google ausente; reconecte a conta')
    response = await fetch(config.tokenUrl, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: 'refresh_token', refresh_token: String(current.refresh_token) }),
    })
  } else if (account.provider === 'microsoft') {
    if (!current.refresh_token) throw new Error('Refresh token da Microsoft ausente; reconecte a conta')
    response = await fetch(config.tokenUrl, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: 'refresh_token', refresh_token: String(current.refresh_token), scope: Array.isArray(account.scopes) ? account.scopes.join(' ') : 'openid profile email offline_access' }),
    })
  } else {
    const url = new URL(config.tokenUrl)
    url.searchParams.set('grant_type', 'fb_exchange_token')
    url.searchParams.set('client_id', config.clientId)
    url.searchParams.set('client_secret', config.clientSecret)
    url.searchParams.set('fb_exchange_token', String(current.access_token))
    response = await fetch(url)
  }

  const payload = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok || typeof payload.access_token !== 'string') {
    const detail = typeof payload.error_description === 'string' ? payload.error_description : typeof (payload.error as any)?.message === 'string' ? (payload.error as any).message : 'Falha ao renovar token'
    throw new Error(detail)
  }
  const expiresIn = Number(payload.expires_in || 0)
  const expiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : current.expires_at || null
  const { error } = await admin.rpc('store_integration_oauth_token', {
    p_account_id: account.id,
    p_access_token: String(payload.access_token),
    p_refresh_token: typeof payload.refresh_token === 'string' ? payload.refresh_token : String(current.refresh_token || ''),
    p_token_type: String(payload.token_type || current.token_type || 'Bearer'),
    p_expires_at: expiresAt,
    p_encryption_key: current.encryptionKey,
  })
  if (error) throw new Error(error.message)
  await auditEvent(admin, {
    organizationId: account.organization_id, accountId: account.id, provider: account.provider,
    eventType: 'credential_refreshed', severity: 'security', message: 'Token OAuth renovado e rotacionado no cofre',
    metadata: { expires_at: expiresAt },
  })
  return String(payload.access_token)
}

export async function ensureFreshToken(admin: any, account: any) {
  const current = await readToken(admin, account.id)
  const expiry = current.expires_at ? new Date(current.expires_at).getTime() : 0
  if (expiry && expiry <= Date.now() + 5 * 60_000) return refreshProviderToken(admin, account, true)
  return String(current.access_token)
}

export async function completeJob(admin: any, job: any, startedAt: number, result: Record<string, unknown> = {}) {
  await admin.from('integration_sync_attempts').insert({
    organization_id: job.organization_id, job_id: job.id, attempt_number: Number(job.attempts || 1),
    status: 'succeeded', duration_ms: Date.now() - startedAt,
  })
  await admin.from('integration_sync_jobs').update({
    status: 'succeeded', completed_at: new Date().toISOString(), locked_at: null, locked_by: null,
    lease_expires_at: null, last_error: null, payload: { ...(job.payload || {}), result },
  }).eq('id', job.id)
  if (job.account_id) await admin.from('integration_connected_accounts').update({ last_sync_at: new Date().toISOString(), last_error: null, status: 'connected' }).eq('id', job.account_id).in('status', ['connected','attention','error','expired'])
}

export async function failJob(admin: any, job: any, startedAt: number, error: unknown) {
  const message = safeMessage(error)
  const terminal = Number(job.attempts || 1) >= Number(job.max_attempts || 5)
  const delaySeconds = Math.min(3600, Math.pow(2, Number(job.attempts || 1)) * 45)
  await admin.from('integration_sync_attempts').insert({
    organization_id: job.organization_id, job_id: job.id, attempt_number: Number(job.attempts || 1),
    status: terminal ? 'failed' : 'retry_scheduled', duration_ms: Date.now() - startedAt, error_message: message,
  })
  await admin.from('integration_sync_jobs').update({
    status: terminal ? 'dead_letter' : 'retry',
    available_at: terminal ? job.available_at : new Date(Date.now() + delaySeconds * 1000).toISOString(),
    locked_at: null, locked_by: null, lease_expires_at: null, last_error: message,
  }).eq('id', job.id)
  if (job.account_id) await admin.from('integration_connected_accounts').update({ status: terminal ? 'error' : 'attention', last_error: message }).eq('id', job.account_id).in('status', ['connected','attention','error','expired'])
  await auditEvent(admin, {
    organizationId: job.organization_id, accountId: job.account_id, provider: job.provider,
    eventType: 'integration_job_failed', severity: terminal ? 'error' : 'warning', message,
    correlationId: job.id, metadata: { job_type: job.job_type, attempts: job.attempts, terminal },
  })
  return { status: terminal ? 'dead_letter' : 'retry', error: message }
}

async function googleMailPull(admin: any, account: any, token: string, jobPayload: any = {}) {
  const subscription = await subscriptionRow(admin, account.id, 'gmail')
  let cursor = String(subscription?.sync_cursor || '')
  const messageIds = new Set<string>()
  let latestHistoryId = String(jobPayload?.history_id || cursor || '')
  let fullSync = !cursor
  if (cursor) {
    let endpoint = `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${encodeURIComponent(cursor)}&historyTypes=messageAdded&maxResults=500`
    try {
      while (endpoint) {
        const response = await fetch(endpoint, { headers: { authorization: `Bearer ${token}` } })
        const data = await response.json().catch(() => ({})) as any
        if (response.status === 404) { fullSync = true; cursor = ''; break }
        if (!response.ok) throw new Error(data?.error?.message || 'Falha no histórico incremental do Gmail')
        for (const history of data.history || []) {
          latestHistoryId = String(history.id || latestHistoryId)
          for (const added of history.messagesAdded || []) if (added.message?.id) messageIds.add(String(added.message.id))
        }
        latestHistoryId = String(data.historyId || latestHistoryId)
        endpoint = data.nextPageToken ? `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${encodeURIComponent(cursor)}&historyTypes=messageAdded&maxResults=500&pageToken=${encodeURIComponent(data.nextPageToken)}` : ''
      }
    } catch (error) {
      if (!fullSync) throw error
    }
  }
  if (fullSync) {
    let pageToken = ''
    let pages = 0
    do {
      const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
      url.searchParams.set('maxResults', '100')
      url.searchParams.set('q', 'newer_than:90d')
      if (pageToken) url.searchParams.set('pageToken', pageToken)
      const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
      const data = await response.json().catch(() => ({})) as any
      if (!response.ok) throw new Error(data?.error?.message || 'Falha ao consultar Gmail')
      for (const item of data.messages || []) if (item.id) messageIds.add(String(item.id))
      pageToken = String(data.nextPageToken || '')
      pages += 1
    } while (pageToken && pages < 10)
  }
  let count = 0
  for (const id of messageIds) {
    const detailResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`, { headers: { authorization: `Bearer ${token}` } })
    const message = await detailResponse.json().catch(() => ({})) as any
    if (!detailResponse.ok) continue
    const headers = message.payload?.headers || []
    const from = emailAddress(header(headers, 'From'))
    const to = header(headers, 'To').split(',').map(emailAddress).filter(Boolean)
    const cc = header(headers, 'Cc').split(',').map(emailAddress).filter(Boolean)
    const subject = header(headers, 'Subject')
    const internetMessageId = header(headers, 'Message-ID')
    const own = String(account.metadata?.email || account.display_name || '').toLowerCase()
    const inbound = !own || !from.includes(own)
    const parts = gmailParts(message.payload)
    const text = parts.text || String(message.snippet || '')
    await upsertEmailFromProvider(admin, account, {
      externalId: String(message.id), direction: inbound ? 'inbound' : 'outbound', sender: from, recipients: [...to, ...cc], subject,
      text, html: parts.html, occurredAt: new Date(Number(message.internalDate || Date.now())).toISOString(), threadId: String(message.threadId || ''), internetMessageId,
      metadata: { provider: 'gmail', thread_id: message.threadId, label_ids: message.labelIds || [], history_id: message.historyId || null, cc }, attachments: parts.attachments,
    })
    latestHistoryId = String(message.historyId || latestHistoryId)
    count += 1
  }
  const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { authorization: `Bearer ${token}` } })
  const profile = await profileResponse.json().catch(() => ({})) as any
  if (profileResponse.ok) latestHistoryId = String(profile.historyId || latestHistoryId)
  if (latestHistoryId) await saveSubscriptionCursor(admin, account, 'gmail', 'gmail_history_id', latestHistoryId, { email: profile.emailAddress || account.metadata?.email || null, last_full_sync: fullSync ? new Date().toISOString() : subscription?.metadata?.last_full_sync || null })
  return count
}

async function microsoftMailPull(admin: any, account: any, token: string) {
  const subscription = await subscriptionRow(admin, account.id, 'outlook_mail')
  const metadata = subscription?.metadata || {}
  const pullFolder = async (folder: 'inbox' | 'sentitems', initialCursor: string, direction: 'inbound' | 'outbound') => {
    let endpoint = initialCursor || `https://graph.microsoft.com/v1.0/me/mailFolders/${folder}/messages/delta?$top=100&$select=id,conversationId,internetMessageId,subject,body,bodyPreview,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,hasAttachments,lastModifiedDateTime`
    let deltaLink = ''
    let count = 0
    let pages = 0
    while (endpoint && pages < 50) {
      const response = await fetch(endpoint, { headers: { authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="html"' } })
      const data = await response.json().catch(() => ({})) as any
      if ((response.status === 404 || response.status === 410) && initialCursor) return pullFolder(folder, '', direction)
      if (!response.ok) throw new Error(data?.error?.message || `Falha ao consultar delta do Outlook (${folder})`)
      for (const message of data.value || []) {
        if (message['@removed']) {
          await admin.from('communication_events').update({ status: 'cancelled', metadata: { provider: 'outlook', removed: true, folder } }).eq('organization_id', account.organization_id).eq('channel', 'email').eq('external_message_id', String(message.id))
          continue
        }
        const from = String(message.from?.emailAddress?.address || '').toLowerCase()
        const recipients = [...(message.toRecipients || []), ...(message.ccRecipients || [])].map((recipient: any) => String(recipient.emailAddress?.address || '')).filter(Boolean)
        let attachments: Array<Record<string, unknown>> = []
        if (message.hasAttachments) {
          const attachmentResponse = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(message.id)}/attachments?$select=id,name,contentType,size,isInline,contentId`, { headers: { authorization: `Bearer ${token}` } })
          const attachmentData = await attachmentResponse.json().catch(() => ({})) as any
          if (attachmentResponse.ok) attachments = (attachmentData.value || []).map((item: any) => ({ providerAttachmentId: item.id, fileName: item.name, contentType: item.contentType, sizeBytes: item.size, disposition: item.isInline ? 'inline' : 'attachment', contentId: item.contentId }))
        }
        const html = String(message.body?.contentType || '').toLowerCase() === 'html' ? sanitizeHtml(String(message.body?.content || '')) : ''
        const text = html ? stripHtml(html) : String(message.body?.content || message.bodyPreview || '')
        await upsertEmailFromProvider(admin, account, {
          externalId: String(message.id), direction, sender: from, recipients, subject: String(message.subject || ''), text, html,
          occurredAt: String(direction === 'outbound' ? message.sentDateTime || message.receivedDateTime : message.receivedDateTime || message.sentDateTime || new Date().toISOString()),
          threadId: String(message.conversationId || ''), internetMessageId: String(message.internetMessageId || ''),
          metadata: { provider: 'outlook', folder, conversation_id: message.conversationId, is_read: message.isRead, last_modified_at: message.lastModifiedDateTime }, attachments,
        })
        count += 1
      }
      endpoint = String(data['@odata.nextLink'] || '')
      deltaLink = String(data['@odata.deltaLink'] || deltaLink)
      pages += 1
    }
    return { count, deltaLink }
  }
  const inbox = await pullFolder('inbox', String(metadata.inbox_delta_link || subscription?.sync_cursor || ''), 'inbound')
  const sent = await pullFolder('sentitems', String(metadata.sent_delta_link || ''), 'outbound')
  const cursor = inbox.deltaLink || String(metadata.inbox_delta_link || subscription?.sync_cursor || '')
  await saveSubscriptionCursor(admin, account, 'outlook_mail', 'microsoft_delta_link', cursor || null, { folder: 'inbox+sentitems', inbox_delta_link: cursor || null, sent_delta_link: sent.deltaLink || metadata.sent_delta_link || null })
  return inbox.count + sent.count
}

async function calendarPull(admin: any, account: any, token: string, provider: 'google' | 'microsoft') {
  const resourceType = provider === 'google' ? 'google_calendar' : 'outlook_calendar'
  const subscription = await subscriptionRow(admin, account.id, resourceType)
  let count = 0
  if (provider === 'google') {
    const calendarId = String(account.metadata?.calendar_id || 'primary')
    let syncToken = String(subscription?.sync_cursor || '')
    let pageToken = ''
    let nextSyncToken = ''
    let reset = false
    do {
      const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`)
      url.searchParams.set('singleEvents', 'true')
      url.searchParams.set('showDeleted', 'true')
      url.searchParams.set('maxResults', '1000')
      if (syncToken) url.searchParams.set('syncToken', syncToken)
      else {
        url.searchParams.set('timeMin', new Date(Date.now() - 90 * 86_400_000).toISOString())
        url.searchParams.set('timeMax', new Date(Date.now() + 365 * 86_400_000).toISOString())
      }
      if (pageToken) url.searchParams.set('pageToken', pageToken)
      const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
      const data = await response.json().catch(() => ({})) as any
      if (response.status === 410 && syncToken) { reset = true; break }
      if (!response.ok) throw new Error(data?.error?.message || 'Falha ao consultar Google Calendar')
      for (const external of data.items || []) count += await applyExternalCalendarEvent(admin, account, 'google', external)
      pageToken = String(data.nextPageToken || '')
      nextSyncToken = String(data.nextSyncToken || nextSyncToken)
    } while (pageToken)
    if (reset) {
      await saveSubscriptionCursor(admin, account, resourceType, 'google_sync_token', null, { reset_at: new Date().toISOString(), calendar_id: calendarId })
      return calendarPull(admin, account, token, provider)
    }
    if (nextSyncToken) await saveSubscriptionCursor(admin, account, resourceType, 'google_sync_token', nextSyncToken, { calendar_id: calendarId })
    return count
  }
  const start = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const end = new Date(Date.now() + 365 * 86_400_000).toISOString()
  let endpoint = String(subscription?.sync_cursor || '') || `https://graph.microsoft.com/v1.0/me/calendarView/delta?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}&$top=250&$select=id,changeKey,subject,body,bodyPreview,start,end,isAllDay,location,isCancelled,lastModifiedDateTime`
  let deltaLink = ''
  let pages = 0
  while (endpoint && pages < 50) {
    const response = await fetch(endpoint, { headers: { authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' } })
    const data = await response.json().catch(() => ({})) as any
    if ((response.status === 404 || response.status === 410) && subscription?.sync_cursor) {
      await saveSubscriptionCursor(admin, account, resourceType, 'microsoft_delta_link', null, { reset_at: new Date().toISOString(), start, end })
      return calendarPull(admin, account, token, provider)
    }
    if (!response.ok) throw new Error(data?.error?.message || 'Falha ao consultar Microsoft Calendar')
    for (const external of data.value || []) count += await applyExternalCalendarEvent(admin, account, 'microsoft', external)
    endpoint = String(data['@odata.nextLink'] || '')
    deltaLink = String(data['@odata.deltaLink'] || deltaLink)
    pages += 1
  }
  if (deltaLink) await saveSubscriptionCursor(admin, account, resourceType, 'microsoft_delta_link', deltaLink, { start, end })
  return count
}

async function renewGoogleSubscriptions(admin: any, account: any, token: string) {
  const results: Array<Record<string, unknown>> = []
  const topicName = Deno.env.get('GOOGLE_GMAIL_PUBSUB_TOPIC') || ''
  if (topicName) {
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ topicName }) })
    const data = await response.json().catch(() => ({})) as any
    if (!response.ok) throw new Error(data?.error?.message || 'Falha ao renovar watch do Gmail')
    const expiration = data.expiration ? new Date(Number(data.expiration)).toISOString() : new Date(Date.now() + 6 * 86_400_000).toISOString()
    const currentGmail = await subscriptionRow(admin, account.id, 'gmail')
    await admin.from('communication_subscriptions').upsert({ organization_id: account.organization_id, account_id: account.id, provider: 'google', resource_type: 'gmail', cursor_kind: currentGmail?.cursor_kind || 'gmail_history_id', expiration_at: expiration, renew_after: new Date(new Date(expiration).getTime() - 24 * 60 * 60 * 1000).toISOString(), last_renewed_at: new Date().toISOString(), status: 'active', metadata: { ...(currentGmail?.metadata || {}), topic_name: topicName, watch_history_id: String(data.historyId || '') } }, { onConflict: 'account_id,resource_type' })
    results.push({ resource: 'gmail', expiration })
  }
  const calendarId = String(account.metadata?.calendar_id || 'primary')
  const webhookUrl = `${providerFunctionBase()}/google-communications-webhook`
  const rawToken = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '')
  const channelId = crypto.randomUUID()
  const requestedExpiration = Date.now() + 6 * 86_400_000
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ id: channelId, type: 'web_hook', address: webhookUrl, token: rawToken, expiration: String(requestedExpiration) }) })
  const data = await response.json().catch(() => ({})) as any
  if (!response.ok) throw new Error(data?.error?.message || 'Falha ao criar canal do Google Calendar')
  const expiration = data.expiration ? new Date(Number(data.expiration)).toISOString() : new Date(requestedExpiration).toISOString()
  const previousCalendar = await subscriptionRow(admin, account.id, 'google_calendar')
  await admin.from('communication_subscriptions').upsert({ organization_id: account.organization_id, account_id: account.id, provider: 'google', resource_type: 'google_calendar', external_subscription_id: String(data.id || channelId), resource_id: String(data.resourceId || ''), verification_secret_hash: await sha256Hex(rawToken), notification_url: webhookUrl, expiration_at: expiration, renew_after: new Date(new Date(expiration).getTime() - 24 * 60 * 60 * 1000).toISOString(), last_renewed_at: new Date().toISOString(), status: 'active', metadata: { ...(previousCalendar?.metadata || {}), calendar_id: calendarId } }, { onConflict: 'account_id,resource_type' })
  if (previousCalendar?.external_subscription_id && previousCalendar?.resource_id && previousCalendar.external_subscription_id !== String(data.id || channelId)) {
    await fetch('https://www.googleapis.com/calendar/v3/channels/stop', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ id: previousCalendar.external_subscription_id, resourceId: previousCalendar.resource_id }) }).catch(() => null)
  }
  results.push({ resource: 'google_calendar', expiration })
  return results.length
}

async function renewMicrosoftSubscriptions(admin: any, account: any, token: string) {
  const webhookUrl = `${providerFunctionBase()}/microsoft-communications-webhook`
  const expiration = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString()
  const resources = [
    { type: 'outlook_mail', resource: '/me/messages', changeType: 'created,updated,deleted' },
    { type: 'outlook_calendar', resource: '/me/events', changeType: 'created,updated,deleted' },
  ]
  let count = 0
  for (const item of resources) {
    const current = await subscriptionRow(admin, account.id, item.type)
    let data: any = null
    if (current?.external_subscription_id) {
      const patch = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${encodeURIComponent(current.external_subscription_id)}`, { method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ expirationDateTime: expiration }) })
      if (patch.ok) data = await patch.json().catch(() => ({ id: current.external_subscription_id, expirationDateTime: expiration }))
    }
    let clientState = ''
    if (!data) {
      clientState = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '')
      const create = await fetch('https://graph.microsoft.com/v1.0/subscriptions', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ changeType: item.changeType, notificationUrl: webhookUrl, lifecycleNotificationUrl: webhookUrl, resource: item.resource, expirationDateTime: expiration, clientState }) })
      data = await create.json().catch(() => ({})) as any
      if (!create.ok) throw new Error(data?.error?.message || `Falha ao criar subscription ${item.type}`)
    }
    await admin.from('communication_subscriptions').upsert({ organization_id: account.organization_id, account_id: account.id, provider: 'microsoft', resource_type: item.type, external_subscription_id: String(data.id || current?.external_subscription_id || ''), resource_id: item.resource, verification_secret_hash: clientState ? await sha256Hex(clientState) : current?.verification_secret_hash || null, notification_url: webhookUrl, lifecycle_notification_url: webhookUrl, expiration_at: String(data.expirationDateTime || expiration), renew_after: new Date(new Date(String(data.expirationDateTime || expiration)).getTime() - 24 * 60 * 60 * 1000).toISOString(), last_renewed_at: new Date().toISOString(), status: 'active', metadata: { resource: item.resource, change_type: item.changeType } }, { onConflict: 'account_id,resource_type' })
    count += 1
  }
  return count
}

async function calendarPush(admin: any, account: any, token: string, provider: 'google' | 'microsoft', payload: any) {
  const mutation = String(payload?.mutation || 'update')
  const eventId = String(payload?.eventId || '')
  const externalFromPayload = String(payload?.externalEventId || '')
  const force = String(payload?.source || '') === 'conflict_resolution'
  let event = payload?.event || null
  if (!event && eventId) { const { data } = await admin.from('calendar_events').select('*').eq('id', eventId).eq('organization_id', account.organization_id).maybeSingle(); event = data }
  const { data: link } = eventId ? await admin.from('calendar_external_links').select('*').eq('event_id', eventId).eq('account_id', account.id).maybeSingle() : { data: null }
  const externalId = externalFromPayload || String(link?.external_event_id || '')
  const calendarId = provider === 'google' ? String(account.metadata?.calendar_id || link?.external_calendar_id || 'primary') : String(account.metadata?.calendar_id || 'default')
  const fetchExternal = async () => {
    if (!externalId) return null
    const endpoint = provider === 'google'
      ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(externalId)}`
      : `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(externalId)}?$select=id,changeKey,subject,body,bodyPreview,start,end,isAllDay,location,isCancelled,lastModifiedDateTime`
    const response = await fetch(endpoint, { headers: { authorization: `Bearer ${token}` } })
    if (response.status === 404) return { id: externalId, status: 'cancelled', '@removed': { reason: 'deleted' } }
    const data = await response.json().catch(() => ({})) as any
    if (!response.ok) throw new Error(data?.error?.message || 'Falha ao consultar evento externo para conflito')
    return data
  }
  if (mutation === 'delete') {
    if (externalId) {
      const endpoint = provider === 'google' ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(externalId)}` : `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(externalId)}`
      const headers: Record<string, string> = { authorization: `Bearer ${token}` }
      if (!force && link?.etag) headers['if-match'] = String(link.etag)
      const response = await fetch(endpoint, { method: 'DELETE', headers })
      if (response.status === 412) {
        const external = await fetchExternal()
        await registerCalendarConflict(admin, account, provider, link, event, external || { id: externalId }, 'local_deleted_external_updated')
        return 0
      }
      if (!response.ok && response.status !== 404) throw new Error('Falha ao excluir evento externo')
    }
    if (link) await admin.from('calendar_external_links').update({ conflict_status: 'clear', last_synced_at: new Date().toISOString() }).eq('id', link.id)
    return 1
  }
  if (!event) throw new Error('Evento local não encontrado')
  if (provider === 'google') {
    const body = { summary: event.title, description: event.description || '', location: event.location || '', start: event.all_day ? { date: String(event.starts_at || event.startsAt).slice(0, 10) } : { dateTime: event.starts_at || event.startsAt }, end: event.all_day ? { date: String(event.ends_at || event.endsAt).slice(0, 10) } : { dateTime: event.ends_at || event.endsAt } }
    const endpoint = externalId ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(externalId)}` : `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
    const headers: Record<string, string> = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
    if (!force && externalId && link?.etag) headers['if-match'] = String(link.etag)
    const response = await fetch(endpoint, { method: externalId ? 'PUT' : 'POST', headers, body: JSON.stringify(body) })
    const result = await response.json().catch(() => ({})) as any
    if (response.status === 412) {
      const external = await fetchExternal()
      await registerCalendarConflict(admin, account, 'google', link, event, external || { id: externalId }, 'both_updated')
      return 0
    }
    if (!response.ok) throw new Error(result?.error?.message || 'Falha ao sincronizar Google Calendar')
    const timestamp = new Date().toISOString()
    await admin.from('calendar_external_links').upsert({ organization_id: account.organization_id, event_id: eventId, account_id: account.id, provider: 'google', external_event_id: String(result.id), external_calendar_id: calendarId, etag: result.etag || null, external_updated_at: toIso(result.updated), last_local_updated_at: event.updated_at || event.updatedAt || timestamp, conflict_status: 'clear', last_synced_at: timestamp }, { onConflict: 'event_id,account_id' })
  } else {
    const body = { subject: event.title, body: { contentType: 'HTML', content: sanitizeHtml(String(event.description || '').replace(/\n/g, '<br>')) }, start: { dateTime: event.starts_at || event.startsAt, timeZone: 'UTC' }, end: { dateTime: event.ends_at || event.endsAt, timeZone: 'UTC' }, location: { displayName: event.location || '' }, isAllDay: Boolean(event.all_day ?? event.allDay) }
    const endpoint = externalId ? `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(externalId)}` : 'https://graph.microsoft.com/v1.0/me/events'
    const headers: Record<string, string> = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
    if (!force && externalId && link?.etag) headers['if-match'] = String(link.etag)
    const response = await fetch(endpoint, { method: externalId ? 'PATCH' : 'POST', headers, body: JSON.stringify(body) })
    const result = response.status === 204 ? await fetchExternal() || { id: externalId, changeKey: link?.etag } : await response.json().catch(() => ({})) as any
    if (response.status === 412) {
      const external = await fetchExternal()
      await registerCalendarConflict(admin, account, 'microsoft', link, event, external || { id: externalId }, 'both_updated')
      return 0
    }
    if (!response.ok) throw new Error(result?.error?.message || 'Falha ao sincronizar Microsoft Calendar')
    const timestamp = new Date().toISOString()
    await admin.from('calendar_external_links').upsert({ organization_id: account.organization_id, event_id: eventId, account_id: account.id, provider: 'microsoft', external_event_id: String(result?.id || externalId), external_calendar_id: calendarId, etag: result?.changeKey || link?.etag || null, external_updated_at: toIso(result?.lastModifiedDateTime), last_local_updated_at: event.updated_at || event.updatedAt || timestamp, conflict_status: 'clear', last_synced_at: timestamp }, { onConflict: 'event_id,account_id' })
  }
  return 1
}

async function metaTask(account: any, token: string, task: string) {
  const version = Deno.env.get('META_GRAPH_VERSION') || 'v23.0'
  let endpoint = `https://graph.facebook.com/${version}/me?fields=id,name`
  if (task === 'meta_leads_pull') {
    const pageId = String(account.metadata?.page_id || '')
    if (!pageId) throw new Error('Selecione uma Página Meta antes de sincronizar Lead Ads')
    endpoint = `https://graph.facebook.com/${version}/${encodeURIComponent(pageId)}/leadgen_forms?fields=id,name,status`
  }
  const response = await fetch(endpoint, { headers: { authorization: `Bearer ${token}` } })
  const result = await response.json().catch(() => ({})) as any
  if (!response.ok) throw new Error(result?.error?.message || 'Falha ao consultar Meta')
  return Array.isArray(result.data) ? result.data.length : 1
}

async function whatsappTask(account: any, token: string, task: string) {
  const version = Deno.env.get('META_GRAPH_VERSION') || 'v23.0'
  const wabaId = String(account.metadata?.whatsapp_business_account_id || '')
  if (!wabaId) throw new Error('Configure a conta WhatsApp Business antes de sincronizar')
  const fields = task === 'whatsapp_template_sync' ? 'message_templates?fields=id,name,status,language,category' : 'phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,status'
  const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(wabaId)}/${fields}`, { headers: { authorization: `Bearer ${token}` } })
  const result = await response.json().catch(() => ({})) as any
  if (!response.ok) throw new Error(result?.error?.message || 'Falha ao consultar WhatsApp Business')
  return Array.isArray(result.data) ? result.data.length : 0
}

export async function processProviderJob(admin: any, job: any, provider: Provider) {
  const account = job.integration_connected_accounts
  if (!account || account.provider !== provider || account.status !== 'connected' || !account.has_credential) throw new Error('Conta não conectada ou incompatível com o worker')
  const token = await ensureFreshToken(admin, account)
  if (job.job_type === 'google_mail_pull') return googleMailPull(admin, account, token, job.payload)
  if (job.job_type === 'microsoft_mail_pull') return microsoftMailPull(admin, account, token)
  if (job.job_type === 'google_calendar_pull') return calendarPull(admin, account, token, 'google')
  if (job.job_type === 'microsoft_calendar_pull') return calendarPull(admin, account, token, 'microsoft')
  if (job.job_type === 'google_calendar_push') return calendarPush(admin, account, token, 'google', job.payload)
  if (job.job_type === 'microsoft_calendar_push') return calendarPush(admin, account, token, 'microsoft', job.payload)
  if (provider === 'meta' && ['meta_account_sync', 'meta_leads_pull'].includes(job.job_type)) return metaTask(account, token, job.job_type)
  if (provider === 'whatsapp_cloud' && ['whatsapp_account_sync', 'whatsapp_template_sync'].includes(job.job_type)) return whatsappTask(account, token, job.job_type)
  if (job.job_type === 'google_subscription_renew') return renewGoogleSubscriptions(admin, account, token)
  if (job.job_type === 'microsoft_subscription_renew') return renewMicrosoftSubscriptions(admin, account, token)
  throw new Error(`Tipo de trabalho não implementado pelo worker ${provider}: ${job.job_type}`)
}

export async function runProviderWorker(request: Request, provider: Provider, workerKey: WorkerKey, jobTypes: string[]) {
  try { assertWorkerSecret(request) } catch { return json({ error: 'Não autorizado' }, 401) }
  const admin = adminClient()
  const body = await request.json().catch(() => ({})) as { limit?: number }
  let jobs: any[]
  try { jobs = await claimJobs(admin, workerKey, jobTypes, Number(body.limit || 20)) }
  catch (error) { return json({ error: safeMessage(error) }, 500) }
  const results = []
  for (const job of jobs) {
    const started = Date.now()
    try {
      const count = await processProviderJob(admin, job, provider)
      await completeJob(admin, job, started, { count })
      results.push({ id: job.id, status: 'succeeded', count })
    } catch (error) { results.push({ id: job.id, ...(await failJob(admin, job, started, error)) }) }
  }
  return json({ worker: workerKey, processed: results.length, results })
}
