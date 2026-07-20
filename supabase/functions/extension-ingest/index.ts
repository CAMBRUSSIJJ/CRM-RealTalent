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
  'access-control-allow-headers': 'authorization, content-type, x-batch-id, x-rt-capture-test, x-rt-extension-version, x-rt-connection-name',
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
  await supabase.from('integration_connections').update({ status: 'error', last_error: message.slice(0, 500) }).eq('organization_id', organizationId).eq('provider', 'extension')
}

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

  const { data: connection, error: connectionError } = await supabase.from('integration_connections').select('*').eq('organization_id', organizationId).eq('provider', 'extension').maybeSingle()
  if (connectionError || !connection || !connection.enabled) return json({ error: 'integration_disabled' }, 409)
  const settings = isRecord(connection.settings) ? connection.settings : {}
  const destination = settings.destination === 'crm' ? 'crm' : 'garimpo'
  const clientVersion = text(request.headers.get('x-rt-extension-version'), 40) || (isRecord(body) ? text(body.version, 40) : '')
  const connectionName = text(request.headers.get('x-rt-connection-name'), 120) || (isRecord(body) ? text(body.connectionName ?? body.connection_name, 120) : '') || 'Extensão RealTalent'

  if (isRecord(body) && body.type === 'connection_test') {
    const testedAt = new Date().toISOString()
    const metadata = { clientVersion, connectionName, destination, maximumItems: 100, maximumBytes: 1_000_000 }
    const { data: event } = await supabase.from('integration_events').insert({
      organization_id: organizationId, connection_id: connection.id, provider: 'extension', direction: 'inbound',
      event_type: 'connection_test', status: 'processed', item_count: 0, metadata, processed_at: testedAt,
    }).select('id').single()
    await supabase.from('integration_connections').update({
      status: 'connected', last_tested_at: testedAt, last_error: null, client_version: clientVersion || null,
      connection_name: connectionName, last_latency_ms: null,
    }).eq('id', connection.id)
    return json({ ok: true, connection: true, eventId: event?.id ?? null, workspaceId: organizationId, destination, limits: { maximumItems: 100, maximumBytes: 1_000_000 }, serverTime: testedAt })
  }

  const inputItems = Array.isArray(body) ? body : isRecord(body) && Array.isArray(body.leads) ? body.leads : []
  if (!inputItems.length) return json({ error: 'empty_batch' }, 400)
  if (inputItems.length > 100) return json({ error: 'batch_limit_exceeded', maximumItems: 100 }, 413)

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

  // Reserva idempotente antes de qualquer efeito colateral. O status "skipped" é temporário;
  // metadata.state diferencia lote em processamento de lote concluído.
  const reservedAt = new Date().toISOString()
  const { data: reservedEvent, error: reserveError } = await supabase.from('integration_events').insert({
    organization_id: organizationId, connection_id: connection.id, provider: 'extension', direction: 'inbound', event_type: 'extension_batch',
    status: 'skipped', external_id: batchId, item_count: inputItems.length,
    metadata: { state: 'processing', clientVersion, connectionName, destination, reservedAt },
  }).select('id,status,metadata').single()
  if (reserveError) {
    if (reserveError.code === '23505') {
      const { data: existingEvent } = await supabase.from('integration_events').select('id,status,metadata').eq('organization_id', organizationId).eq('provider', 'extension').eq('external_id', batchId).maybeSingle()
      return json({ accepted: false, duplicateBatch: true, inProgress: existingEvent?.metadata?.state === 'processing', eventId: existingEvent?.id ?? null, status: existingEvent?.status ?? 'skipped', result: existingEvent?.metadata ?? null }, 200)
    }
    await connectionFailure(String(organizationId), 'Não foi possível reservar o lote de integração.')
    return json({ error: 'batch_reservation_failed' }, 503)
  }

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
  const { error: eventUpdateError } = await supabase.from('integration_events').update({
    status, error_message: errorMessage, metadata, processed_at: finishedAt,
  }).eq('id', reservedEvent.id)
  await supabase.from('integration_connections').update({
    status: result.errors ? (processed ? 'attention' : 'error') : 'connected', last_received_at: finishedAt,
    last_error: errorMessage, received_count: Number(connection.received_count ?? 0) + processed, error_count: Number(connection.error_count ?? 0) + result.errors,
    client_version: clientVersion || null, connection_name: connectionName, last_batch_id: batchId,
  }).eq('id', connection.id)
  if (eventUpdateError) await connectionFailure(String(organizationId), 'Não foi possível concluir o histórico do lote.')
  return json({ accepted: true, eventId: reservedEvent.id, destination, result })
})
