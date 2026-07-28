import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const readSupabaseSecretKey = () => {
  const direct = Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (direct) return direct
  try {
    const values = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
    return values.default ?? Object.values(values)[0] ?? ''
  } catch { return '' }
}
const SERVICE_ROLE_KEY = readSupabaseSecretKey()
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, x-batch-id, x-rt-capture-test, x-rt-extension-version, x-rt-connection-name, x-rt-installation-id, x-rt-product-key, x-rt-browser, x-rt-browser-version, x-rt-platform, x-rt-manifest-version, x-rt-source, x-rt-source-url',
  'access-control-allow-methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
})
const text = (value: unknown, maximum = 300) => typeof value === 'string' ? value.trim().slice(0, maximum) : value == null ? '' : String(value).trim().slice(0, maximum)
const digits = (value: string) => value.replace(/\D/g, '')
const cleanInstagram = (value: string) => value.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '').toLocaleLowerCase('pt-BR')
const cleanEmail = (value: string) => value.toLocaleLowerCase('pt-BR')
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const sha256 = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map((byte) => byte.toString(16).padStart(2, '0')).join('')

type CleanLead = {
  index: number; externalId: string; name: string; company: string; phone: string; email: string; city: string; address: string; cnpj: string;
  instagram: string; website: string; bookingUrl: string; systemName: string; description: string; sourceDetail: string; notes: string;
  raw: Record<string, unknown>
}
type ItemError = { index: number; externalId: string; code: string; message: string }
type Result = { created: number; updated: number; skipped: number; review: number; errors: number; errorDetails: ItemError[] }

const cleanLead = async (input: Record<string, unknown>, index: number): Promise<CleanLead | null> => {
  const lead = {
    name: text(input.name, 180), company: text(input.company, 180), phone: text(input.phone, 40), email: cleanEmail(text(input.email, 180)),
    city: text(input.city, 120), address: text(input.address, 300), cnpj: digits(text(input.cnpj, 30)).slice(0, 14),
    instagram: cleanInstagram(text(input.instagram, 180)), website: text(input.website, 300), bookingUrl: text(input.bookingUrl ?? input.booking_url, 300),
    systemName: text(input.systemName ?? input.system_name, 180), description: text(input.description, 1500),
    sourceDetail: text(input.sourceDetail ?? input.source_detail, 180) || 'Extensão RealTalent', notes: text(input.notes, 1500),
  }
  if (![lead.name, lead.company, digits(lead.phone), lead.email, lead.cnpj, lead.instagram].some(Boolean)) return null
  const identity = [digits(lead.phone), lead.email, lead.cnpj, lead.instagram, lead.company.toLocaleLowerCase('pt-BR'), lead.city.toLocaleLowerCase('pt-BR')].join('|')
  return { ...lead, index, externalId: text(input.externalId ?? input.external_id, 180) || await sha256(`${identity}|${index}`), raw: input }
}

const safeError = (error: unknown) => {
  const source = isRecord(error) ? error : {}
  const code = text(source.code, 80) || 'processing_failed'
  const rawMessage = error instanceof Error ? error.message : text(source.message, 300)
  const message = rawMessage ? rawMessage.replace(/\s+/g, ' ').slice(0, 300) : 'Falha ao processar o registro.'
  return { code, message }
}
const addItemError = (result: Result, item: Pick<CleanLead, 'index' | 'externalId'>, error: unknown) => {
  result.errors += 1
  if (result.errorDetails.length < 50) result.errorDetails.push({ index: item.index, externalId: item.externalId, ...safeError(error) })
}
const nonEmptyPatch = (values: Record<string, unknown>) => Object.fromEntries(Object.entries(values).filter(([, value]) => {
  if (value == null) return false
  if (typeof value === 'string') return value.trim() !== ''
  return true
}))
const mergedText = (...values: unknown[]) => [...new Set(values.map((value) => text(value, 5000)).filter(Boolean))].join('\n\n').slice(0, 5000)

const connectionFailure = async (organizationId: string, message: string) => {
  await supabase.from('integration_audit_events').insert({ organization_id: organizationId, provider: 'extension', event_type: 'extension_ingest_failed', severity: 'error', message: message.slice(0, 500) })
}

const versionParts = (value: string) => value.split(/[^0-9]+/).filter(Boolean).slice(0, 4).map((part) => Number(part) || 0)
const compareVersions = (left: string, right: string) => {
  const a = versionParts(left); const b = versionParts(right)
  for (let index = 0; index < Math.max(a.length, b.length, 3); index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0)
    if (delta) return delta
  }
  return 0
}
const defaultExtensionSettings = (organizationId: string, productKey: string) => ({
  organization_id: organizationId, product_key: productKey, enabled: true, destination: 'garimpo', require_confirmation: true,
  duplicate_policy: 'skip', minimum_version: '', recommended_version: '', max_batch_size: 50, process_interval_ms: 1200,
  close_tab_after_analysis: true, allowed_sources: ['google_maps','google_search','instagram','cnpj'], settings: {}, config_version: 1,
})

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'integration_not_configured' }, 503)

  const authorization = request.headers.get('authorization') ?? ''
  const token = authorization.replace(/^Bearer\s+/i, '').trim()
  if (!token.startsWith('rt_live_') || token.length > 100) return json({ error: 'invalid_token' }, 401)
  const { data: organizationId, error: tokenError } = await supabase.rpc('validate_extension_ingest_token', { p_token: token })
  if (tokenError || !organizationId) return json({ error: 'invalid_or_revoked_token' }, 401)
  const { data: withinRateLimit, error: rateLimitError } = await supabase.rpc('consume_extension_rate_limit', { p_organization_id: organizationId, p_limit: 60 })
  if (rateLimitError) return json({ error: 'rate_limit_unavailable' }, 503)
  if (!withinRateLimit) return json({ error: 'rate_limit_exceeded', retryAfterSeconds: 60 }, 429)

  const declaredLength = Number(request.headers.get('content-length') ?? 0)
  if (declaredLength > 1_000_000) return json({ error: 'payload_too_large', maximumBytes: 1_000_000 }, 413)
  const rawBody = await request.text()
  if (rawBody.length > 1_000_000) return json({ error: 'payload_too_large', maximumBytes: 1_000_000 }, 413)

  let body: unknown
  try { body = JSON.parse(rawBody) }
  catch { return json({ error: 'invalid_json' }, 400) }

  const legacySettings: Record<string, unknown> = {}
  const clientVersion = text(request.headers.get('x-rt-extension-version'), 40) || (isRecord(body) ? text(body.version ?? body.appVersion ?? body.app_version, 40) : '')
  const connectionName = text(request.headers.get('x-rt-connection-name'), 120) || (isRecord(body) ? text(body.connectionName ?? body.connection_name, 120) : '') || 'Extensão RealTalent'
  const productKey = text(request.headers.get('x-rt-product-key'), 80) || (isRecord(body) ? text(body.productKey ?? body.product_key, 80) : '') || 'realtalent_capture'
  const installationKey = text(request.headers.get('x-rt-installation-id'), 180) || (isRecord(body) ? text(body.installationId ?? body.installation_id, 180) : '') || await sha256(`${organizationId}|${productKey}|${connectionName}|${request.headers.get('user-agent') ?? ''}`)
  const connection = { id: String(organizationId) }
  const browser = text(request.headers.get('x-rt-browser'), 60) || 'Chrome'
  const browserVersion = text(request.headers.get('x-rt-browser-version'), 40)
  const platform = text(request.headers.get('x-rt-platform'), 80) || text(request.headers.get('user-agent'), 80)
  const manifestVersion = Math.max(2, Math.min(4, Number(request.headers.get('x-rt-manifest-version') ?? 3)))
  const source = text(request.headers.get('x-rt-source'), 80) || (isRecord(body) ? text(body.source, 80) : '') || 'extension'
  const sourceUrl = text(request.headers.get('x-rt-source-url'), 500) || (isRecord(body) ? text(body.sourceUrl ?? body.source_url, 500) : '')

  const { data: existingInstallation } = await supabase.from('extension_installations').select('*')
    .eq('organization_id', organizationId).eq('product_key', productKey).eq('installation_key', installationKey).maybeSingle()
  if (existingInstallation?.status === 'revoked') return json({ error: 'installation_revoked' }, 403)
  if (existingInstallation?.status === 'paused') return json({ error: 'installation_paused' }, 423)
  const { data: settingsData } = await supabase.from('extension_product_settings').select('*')
    .eq('organization_id', organizationId).eq('product_key', productKey).maybeSingle()
  const centralSettings = settingsData ?? defaultExtensionSettings(String(organizationId), productKey)
  if (!settingsData) await supabase.from('extension_product_settings').upsert(centralSettings, { onConflict: 'organization_id,product_key' })
  if (!centralSettings.enabled) return json({ error: 'extension_product_disabled' }, 409)
  const minimumVersion = text(centralSettings.minimum_version, 40)
  const outdated = Boolean(minimumVersion && (!clientVersion || compareVersions(clientVersion, minimumVersion) < 0))
  const { data: installation, error: installationError } = await supabase.from('extension_installations').upsert({
    organization_id: organizationId, user_id: null, product_key: productKey, installation_key: installationKey,
    display_name: connectionName, browser, browser_version: browserVersion, platform, app_version: clientVersion,
    manifest_version: manifestVersion, status: outdated ? 'outdated' : 'connected', last_seen_at: new Date().toISOString(),
    last_error: outdated ? `Versão mínima exigida: ${minimumVersion}` : null,
    metadata: { userAgent: text(request.headers.get('user-agent'), 300), legacyTokenConnection: true },
  }, { onConflict: 'organization_id,product_key,installation_key' }).select('*').single()
  if (installationError || !installation) return json({ error: 'installation_registration_failed' }, 503)
  if (outdated) return json({ error: 'extension_version_outdated', minimumVersion, recommendedVersion: centralSettings.recommended_version }, 426)

  const allowedSources = Array.isArray(centralSettings.allowed_sources) ? centralSettings.allowed_sources.map((item: unknown) => text(item, 80)).filter(Boolean) : []
  if (source && allowedSources.length && !allowedSources.includes(source)) return json({ error: 'extension_source_not_allowed', source, allowedSources }, 403)
  const destination = centralSettings.require_confirmation ? 'garimpo' : centralSettings.destination === 'crm' ? 'crm' : 'garimpo'
  const settings = { ...legacySettings, ...(isRecord(centralSettings.settings) ? centralSettings.settings : {}), destination, duplicatePolicy: centralSettings.duplicate_policy }

  if (isRecord(body) && body.type === 'connection_test') {
    const testedAt = new Date().toISOString()
    const metadata = { clientVersion, connectionName, destination, installationId: installation.id, productKey, maximumItems: centralSettings.max_batch_size, maximumBytes: 1_000_000 }
    const { data: event } = await supabase.from('integration_audit_events').insert({
      organization_id: organizationId, provider: 'extension', event_type: 'connection_test', severity: 'info',
      message: 'Extensão validou a credencial de ingestão', correlation_id: installationKey, metadata,
    }).select('id').single()
    await supabase.from('extension_events').insert({ organization_id: organizationId, installation_id: installation.id, event_type: 'connection_test', status: 'processed', correlation_id: installationKey, payload: metadata })
    await supabase.from('extension_installations').update({ last_seen_at: testedAt, last_sync_at: testedAt, last_error: null }).eq('id', installation.id)
    return json({ ok: true, connection: true, eventId: event?.id ?? null, installationId: installation.id, workspaceId: organizationId, destination, settings: centralSettings, limits: { maximumItems: centralSettings.max_batch_size, maximumBytes: 1_000_000 }, serverTime: testedAt })
  }

  const inputItems = Array.isArray(body) ? body : isRecord(body) && Array.isArray(body.leads) ? body.leads : []
  if (!inputItems.length) return json({ error: 'empty_batch' }, 400)
  if (inputItems.length > centralSettings.max_batch_size) return json({ error: 'batch_limit_exceeded', maximumItems: centralSettings.max_batch_size }, 413)

  const headerBatchId = text(request.headers.get('x-batch-id'), 180)
  const bodyBatchId = isRecord(body) ? text(body.batchId ?? body.batch_id, 180) : ''
  const batchId = headerBatchId || bodyBatchId || await sha256(rawBody)
  const duplicatePolicy = ['skip', 'update', 'create'].includes(String(settings.duplicatePolicy)) ? String(settings.duplicatePolicy) : 'skip'
  const result: Result = { created: 0, updated: 0, skipped: 0, review: 0, errors: 0, errorDetails: [] }
  const cleanItems = (await Promise.all(inputItems.map((item, index) => isRecord(item) ? cleanLead(item, index) : Promise.resolve(null)))).filter((item): item is CleanLead => Boolean(item))
  inputItems.forEach((item, index) => {
    if (!isRecord(item) || !cleanItems.some((clean) => clean.index === index)) {
      result.errors += 1
      if (result.errorDetails.length < 50) result.errorDetails.push({ index, externalId: '', code: 'invalid_item', message: 'O registro não possui identidade comercial suficiente.' })
    }
  })

  let stage: { id: string } | null = null
  if (destination === 'crm') {
    const stageId = text(settings.defaultStageId, 120)
    const stageResult = stageId ? await supabase.from('pipeline_stages').select('id').eq('organization_id', organizationId).eq('id', stageId).eq('is_won', false).eq('is_lost', false).maybeSingle() : { data: null }
    stage = stageResult.data
    if (!stage) return json({ error: 'invalid_default_stage' }, 409)
  }

  const reservedAt = new Date().toISOString()
  const captureJobKey = `${productKey}:${installation.id}:${batchId}`
  const { data: captureJob, error: captureJobError } = await supabase.from('extension_capture_jobs').insert({
    organization_id: organizationId, installation_id: installation.id, user_id: installation.user_id, product_key: productKey,
    source, source_url: sourceUrl || null, external_id: batchId, status: 'processing', attempts: 1,
    idempotency_key: captureJobKey, item_count: inputItems.length, payload: { clientVersion, connectionName, destination, retryPayload: { batchId, source, sourceUrl, leads: inputItems } }, started_at: reservedAt,
  }).select('*').single()
  if (captureJobError) {
    if (captureJobError.code === '23505') {
      const { data: existingJob } = await supabase.from('extension_capture_jobs').select('*').eq('organization_id', organizationId).eq('idempotency_key', captureJobKey).maybeSingle()
      return json({ accepted: false, duplicateBatch: true, jobId: existingJob?.id ?? null, status: existingJob?.status ?? 'processing', result: existingJob?.result ?? null }, 200)
    }
    return json({ error: 'capture_job_reservation_failed' }, 503)
  }

  // A própria reserva em extension_capture_jobs é a fonte idempotente do lote.
  const reservedEvent = { id: captureJob.id }
  await supabase.from('extension_events').insert({
    organization_id: organizationId, installation_id: installation.id, job_id: captureJob.id,
    event_type: 'capture_reserved', status: 'processed', correlation_id: batchId,
    payload: { state: 'processing', clientVersion, connectionName, destination, reservedAt },
  })

  try {
    if (destination === 'crm' && stage) {
      const ownerId = text(settings.defaultOwnerId, 120) || null
      const priority = ['low','medium','high','urgent'].includes(String(settings.priority)) ? settings.priority : 'medium'
      const temperature = ['cold','warm','hot'].includes(String(settings.temperature)) ? settings.temperature : 'warm'
      const tags = Array.isArray(settings.tags) ? settings.tags.filter((item): item is string => typeof item === 'string').map((item) => item.trim().slice(0, 40)).filter(Boolean).slice(0, 20) : ['Extensão RealTalent']
      const createNextAction = settings.createNextAction !== false
      const nextActionHours = Math.max(1, Math.min(720, Number(settings.nextActionDelayHours ?? 2)))
      const startAutomation = Boolean(settings.startCadence)
      const cadenceName = text(settings.cadenceName, 120) || 'Primeiro contato'
      const notifySeller = settings.notifySeller !== false
      const prepareWhatsApp = settings.prepareWhatsApp !== false
      const prepareEmail = Boolean(settings.prepareEmail)

      for (const item of cleanItems) {
        try {
          const { data: duplicateId, error: duplicateError } = await supabase.rpc('find_extension_duplicate_lead', {
            p_organization_id: organizationId, p_phone: item.phone, p_email: item.email, p_cnpj: item.cnpj, p_instagram: item.instagram,
          })
          if (duplicateError) throw duplicateError
          let leadId: string
          if (duplicateId && duplicatePolicy === 'skip') { result.skipped += 1; continue }
          if (duplicateId && duplicatePolicy === 'update') {
            const { data: duplicate, error: readError } = await supabase.from('leads').select('id,name,company,phone,email,city,cnpj,instagram,tags,notes').eq('organization_id', organizationId).eq('id', duplicateId).single()
            if (readError || !duplicate) throw readError ?? new Error('Lead duplicado não encontrado.')
            const patch = nonEmptyPatch({
              name: item.name || item.company, company: item.company, phone: item.phone, email: item.email, city: item.city,
              cnpj: item.cnpj, instagram: item.instagram, priority, temperature, source: 'Extensão RealTalent',
              owner_id: ownerId, tags: [...new Set([...(duplicate.tags ?? []), ...tags])],
              notes: mergedText(duplicate.notes, item.notes, item.description, item.address ? `Endereço: ${item.address}` : '', item.website ? `Site: ${item.website}` : '', item.bookingUrl ? `Agendamento: ${item.bookingUrl}` : '', item.systemName ? `Sistema: ${item.systemName}` : ''),
            })
            const { error } = await supabase.from('leads').update(patch).eq('organization_id', organizationId).eq('id', duplicate.id)
            if (error) throw error
            leadId = duplicate.id
            result.updated += 1
          } else {
            const nextActionAt = createNextAction ? new Date(Date.now() + nextActionHours * 3_600_000).toISOString() : null
            const { data: created, error } = await supabase.from('leads').insert({
              organization_id: organizationId, name: item.name || item.company || 'Lead da extensão', company: item.company,
              phone: item.phone, email: item.email, city: item.city, cnpj: item.cnpj, instagram: item.instagram,
              source: 'Extensão RealTalent', stage_id: stage.id, status: 'active', temperature, priority, owner_id: ownerId,
              value: 0, next_action_at: nextActionAt,
              notes: mergedText(item.notes, item.description, item.address ? `Endereço: ${item.address}` : '', item.website ? `Site: ${item.website}` : '', item.bookingUrl ? `Agendamento: ${item.bookingUrl}` : '', item.systemName ? `Sistema: ${item.systemName}` : ''), tags,
            }).select('id').single()
            if (error) throw error
            leadId = created.id
            if (createNextAction) {
              const { error: activityError } = await supabase.from('activities').insert({ organization_id: organizationId, lead_id: leadId, activity_type: 'followup', title: 'Primeiro contato — lead da extensão', description: 'Criado automaticamente pela integração RealTalent.', due_at: nextActionAt, assigned_to: ownerId, source_type: 'system', source_id: connection.id })
              if (activityError) {
                const { error: cleanupError } = await supabase.from('leads').delete().eq('organization_id', organizationId).eq('id', leadId)
                if (cleanupError) throw new Error(`Falha ao criar próxima ação e ao reverter o lead: ${safeError(cleanupError).message}`)
                throw activityError
              }
            }
            result.created += 1
          }
          if (startAutomation) {
            const { error: automationError } = await supabase.from('automation_events').upsert({
              organization_id: organizationId, trigger_type: 'lead_imported', entity_id: `${batchId}:${item.externalId}`, lead_id: leadId,
              source: 'extension', batch_id: batchId, priority: priority === 'urgent' ? 10 : priority === 'high' ? 30 : 100, max_attempts: 5,
              payload: {
                source: 'Extensão RealTalent', integrationEventId: reservedEvent.id, externalId: item.externalId,
                postCapture: { enabled: true, cadenceName, notifySeller, prepareWhatsApp, prepareEmail, createNextAction, nextActionHours },
              },
            }, { onConflict: 'organization_id,trigger_type,entity_id', ignoreDuplicates: true })
            if (automationError) throw automationError
          }
        } catch (error) { addItemError(result, item, error) }
      }
    } else {
      for (const item of cleanItems) {
        try {
          const { data: duplicateId, error: duplicateError } = await supabase.rpc('find_extension_duplicate_prospect', {
            p_organization_id: organizationId, p_phone: item.phone, p_email: item.email, p_cnpj: item.cnpj, p_instagram: item.instagram,
          })
          if (duplicateError) throw duplicateError
          if (duplicateId && duplicatePolicy === 'skip') { result.skipped += 1; continue }
          if (duplicateId && duplicatePolicy === 'update') {
            const patch = nonEmptyPatch({
              name: item.name, company: item.company, phone: item.phone, email: item.email, city: item.city, address: item.address,
              cnpj: item.cnpj, instagram: item.instagram, website: item.website, booking_url: item.bookingUrl,
              system_name: item.systemName, description: item.description, source_detail: item.sourceDetail, notes: item.notes,
              raw_data: { ...item.raw, extensionExternalId: item.externalId },
            })
            const { error } = await supabase.from('prospecting_leads').update(patch).eq('organization_id', organizationId).eq('id', duplicateId)
            if (error) throw error
            result.updated += 1
            continue
          }
          const { error } = await supabase.from('prospecting_leads').insert({
            organization_id: organizationId, name: item.name, company: item.company, phone: item.phone, email: item.email,
            city: item.city, address: item.address, cnpj: item.cnpj, instagram: item.instagram, website: item.website,
            booking_url: item.bookingUrl, system_name: item.systemName, description: item.description, source: 'extension',
            source_detail: item.sourceDetail, status: 'review', confidence: 50, duplicate_level: 'none', notes: item.notes,
            raw_data: { ...item.raw, extensionExternalId: item.externalId },
          })
          if (error) throw error
          result.review += 1
        } catch (error) { addItemError(result, item, error) }
      }
    }
  } catch (fatalError) {
    const safe = safeError(fatalError)
    result.errors += 1
    result.errorDetails.push({ index: -1, externalId: '', ...safe })
  }

  const processed = result.created + result.updated + result.skipped + result.review
  const status = result.errors ? (processed ? 'partial' : 'failed') : 'processed'
  const errorMessage = result.errors ? `${result.errors} registro(s) inválido(s) ou com falha.` : null
  const finishedAt = new Date().toISOString()
  const metadata = { ...result, state: 'completed', clientVersion, connectionName, destination, finishedAt }
  const { error: eventUpdateError } = await supabase.from('integration_audit_events').insert({
    organization_id: organizationId, provider: 'extension', event_type: 'capture_batch_completed',
    severity: result.errors ? (processed ? 'warning' : 'error') : 'info', correlation_id: batchId,
    message: errorMessage || `Lote processado com ${processed} registro(s)`, metadata,
  })
  const jobStatus = result.errors && !processed ? 'failed' : destination === 'crm' ? 'sent' : 'review'
  await supabase.from('extension_capture_jobs').update({ status: jobStatus, result: metadata, last_error: errorMessage, completed_at: finishedAt }).eq('id', captureJob.id)
  await supabase.from('extension_installations').update({
    last_seen_at: finishedAt, last_sync_at: finishedAt, pending_items: 0, captured_today: installation.captured_on === finishedAt.slice(0, 10) ? Number(installation.captured_today ?? 0) + processed : processed,
    captured_on: finishedAt.slice(0, 10), total_captured: Number(installation.total_captured ?? 0) + processed, last_error: errorMessage,
  }).eq('id', installation.id)
  await supabase.from('extension_events').insert({
    organization_id: organizationId, installation_id: installation.id, job_id: captureJob.id, event_type: 'capture_batch',
    status: result.errors ? (processed ? 'attention' : 'failed') : 'processed', correlation_id: batchId,
    payload: { destination, source, sourceUrl, clientVersion, result },
  })
  if (eventUpdateError) await connectionFailure(String(organizationId), 'Não foi possível concluir o histórico do lote.')
  return json({ accepted: true, eventId: reservedEvent.id, jobId: captureJob.id, installationId: installation.id, destination, settings: centralSettings, result })
})
