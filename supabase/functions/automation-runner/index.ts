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
const CRON_SECRET = Deno.env.get('AUTOMATION_CRON_SECRET') ?? ''
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

type Row = Record<string, unknown>
type Mutation = { kind: 'lead_update' | 'activity_create' | 'activity_update' | 'event_create' | 'notification_create' | 'draft_create'; id: string; before?: Row }
type Guard = { mode: 'simulation' | 'live'; cooldownHours: number; maxRunsPerLeadPerDay: number; maxActionsPerRun: number; stopOnError: boolean; preventDuplicates: boolean }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
const normalized = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase('pt-BR')
const dayKey = (date = new Date()) => date.toISOString().slice(0, 10)
const defaultGuard: Guard = { mode: 'simulation', cooldownHours: 12, maxRunsPerLeadPerDay: 2, maxActionsPerRun: 8, stopOnError: true, preventDuplicates: true }


const timezoneCache = new Map<string, string>()
const timezoneFor = async (organizationId: unknown) => {
  const key = String(organizationId)
  const cached = timezoneCache.get(key)
  if (cached) return cached
  const { data } = await supabase.from('organization_settings').select('settings').eq('organization_id', organizationId).maybeSingle()
  const settings = data?.settings && typeof data.settings === 'object' && !Array.isArray(data.settings) ? data.settings as Row : {}
  const timezone = typeof settings.timezone === 'string' && settings.timezone ? settings.timezone : 'America/Sao_Paulo'
  timezoneCache.set(key, timezone)
  return timezone
}
const timeZoneOffset = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const asUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second))
  return asUtc - date.getTime()
}
const startOfBusinessDay = async (organizationId: unknown, date = new Date()) => {
  const timeZone = await timezoneFor(organizationId)
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const nominalUtc = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), 0, 0, 0))
  return new Date(nominalUtc.getTime() - timeZoneOffset(nominalUtc, timeZone)).toISOString()
}
const listOverdueActivities = async (organizationId: unknown, before: string) => {
  const rows: Row[] = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from('activities').select('id,lead_id,due_at,activity_type').eq('organization_id', organizationId).is('completed_at', null).lt('due_at', before).order('due_at', { ascending: true }).range(from, from + 499)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < 500) break
  }
  return rows
}

const readGuard = (conditions: Row[]): Guard => {
  const value = conditions.find((condition) => condition.field === 'automation_guard')?.value
  if (!value) return defaultGuard
  try {
    const parsed = JSON.parse(String(value)) as Partial<Guard>
    return {
      mode: parsed.mode === 'live' ? 'live' : 'simulation',
      cooldownHours: Math.max(0, Number(parsed.cooldownHours ?? defaultGuard.cooldownHours)),
      maxRunsPerLeadPerDay: Math.max(1, Number(parsed.maxRunsPerLeadPerDay ?? defaultGuard.maxRunsPerLeadPerDay)),
      maxActionsPerRun: Math.max(1, Number(parsed.maxActionsPerRun ?? defaultGuard.maxActionsPerRun)),
      stopOnError: parsed.stopOnError !== false,
      preventDuplicates: parsed.preventDuplicates !== false,
    }
  } catch { return { ...defaultGuard, mode: 'simulation' } }
}

const actualValue = (field: string, lead: Row, context: Row) => {
  if (field === 'stage_id') return lead.stage_id
  if (field === 'owner_name') return context.ownerName ?? ''
  if (field === 'tag') return Array.isArray(lead.tags) ? lead.tags.join(',') : ''
  if (field === 'days_without_contact') return Math.max(0, Math.floor((Date.now() - new Date(String(lead.last_contact_at ?? lead.created_at)).getTime()) / 86_400_000))
  if (field === 'has_next_action') return Boolean(lead.next_action_at)
  if (field === 'attempt_count') return context.attemptCount ?? 0
  if (field === 'activity_type') return context.activityType ?? ''
  if (field === 'call_outcome') return context.callOutcome ?? ''
  if (field === 'event_status') return context.eventStatus ?? ''
  return lead[field]
}

const conditionMatches = (condition: Row, lead: Row, context: Row) => {
  if (condition.field === 'automation_guard') return true
  const actual = actualValue(String(condition.field ?? ''), lead, context)
  const expected = condition.value
  const operator = String(condition.operator ?? 'equals')
  if (operator === 'is_empty') return actual == null || normalized(actual) === '' || actual === false
  if (operator === 'is_not_empty') return !(actual == null || normalized(actual) === '' || actual === false)
  if (operator === 'greater_than') return Number(actual) > Number(expected)
  if (operator === 'less_than') return Number(actual) < Number(expected)
  if (operator === 'contains') return normalized(actual).includes(normalized(expected))
  if (operator === 'not_contains') return !normalized(actual).includes(normalized(expected))
  if (operator === 'not_equals') return normalized(actual) !== normalized(expected)
  return normalized(actual) === normalized(expected)
}

const dueFor = (action: Row) => {
  const due = new Date()
  due.setDate(due.getDate() + Math.max(0, Number(action.delayDays ?? 0)))
  due.setHours(due.getHours() + Math.max(0, Number(action.delayHours ?? 0)))
  due.setMinutes(0, 0, 0)
  return due
}

const createSellerNotification = async (organizationId: unknown, lead: Row, sourceId: string, title: string, body: string, severity = 'info') => {
  const { data, error } = await supabase.from('seller_notifications').insert({
    organization_id: organizationId, user_id: lead.owner_id ?? null, lead_id: lead.id, title, body,
    severity, action_route: 'automations', source_type: 'automation', source_id: sourceId,
  }).select('id').maybeSingle()
  if (error && error.code !== '23505') throw error
  return data?.id ? String(data.id) : null
}

const createContactDraft = async (organizationId: unknown, lead: Row, sourceId: string, channel: 'whatsapp' | 'email', message?: string) => {
  const firstName = String(lead.name ?? '').trim().split(/\s+/)[0] || 'tudo bem'
  const company = String(lead.company ?? '').trim()
  const defaultMessage = channel === 'whatsapp'
    ? `Olá, ${firstName}! Tudo bem? Analisei ${company ? `a ${company}` : 'seu perfil'} e gostaria de conversar rapidamente sobre como podemos apoiar seu processo comercial. Posso te explicar em poucos minutos?`
    : `Olá, ${firstName}!\n\nAnalisei ${company ? `a ${company}` : 'seu perfil'} e identifiquei uma oportunidade de conversa sobre o processo comercial. Podemos marcar uma conversa rápida?\n\nAtenciosamente,\nEquipe RealTalent`
  const { data, error } = await supabase.from('contact_drafts').insert({
    organization_id: organizationId, lead_id: lead.id, channel,
    subject: channel === 'email' ? `Contato RealTalent — ${company || String(lead.name ?? 'novo lead')}` : '',
    message: message?.trim() || defaultMessage, source_type: 'automation', source_id: sourceId,
  }).select('id').maybeSingle()
  if (error && error.code !== '23505') throw error
  return data?.id ? String(data.id) : null
}

const processPostCapture = async (queueEvent: Row, lead: Row) => {
  const payload = queueEvent.payload && typeof queueEvent.payload === 'object' && !Array.isArray(queueEvent.payload) ? queueEvent.payload as Row : {}
  const postCapture = payload.postCapture && typeof payload.postCapture === 'object' && !Array.isArray(payload.postCapture) ? payload.postCapture as Row : {}
  if (queueEvent.trigger_type !== 'lead_imported' || postCapture.enabled !== true) return 0
  const organizationId = queueEvent.organization_id
  const sourceId = String(queueEvent.id)
  const cadenceName = String(postCapture.cadenceName ?? 'Primeiro contato').trim().slice(0, 120) || 'Primeiro contato'
  let processed = 0
  const createCadenceStep = async (type: 'followup' | 'call', title: string, offsetDays: number) => {
    const { data: duplicate } = await supabase.from('activities').select('id').eq('organization_id', organizationId).eq('lead_id', lead.id).eq('source_type', 'system').eq('source_id', sourceId).eq('title', title).limit(1)
    if (duplicate?.length) return
    const due = new Date(); due.setDate(due.getDate() + offsetDays); due.setMinutes(0, 0, 0)
    const metadata = JSON.stringify({ version: 1, kind: 'cadence-step', cadenceId: sourceId, cadenceName, cadenceCategory: 'Pós-captura', stepIndex: offsetDays === 2 ? 2 : 3, stepTotal: 3, channel: type === 'call' ? 'call' : 'whatsapp', script: 'Revise o histórico, personalize a abordagem e registre o resultado.' })
    const { error } = await supabase.from('activities').insert({
      organization_id: organizationId, lead_id: lead.id, activity_type: type, title,
      description: `Cadência criada pelo fluxo pós-captura.\n\n[CRM_META]${metadata}`, due_at: due.toISOString(),
      assigned_to: lead.owner_id ?? null, source_type: 'system', source_id: sourceId,
    })
    if (error) throw error
    processed += 1
  }
  await createCadenceStep('call', `${cadenceName} · Etapa 2 · Ligação de qualificação`, 2)
  await createCadenceStep('followup', `${cadenceName} · Etapa 3 · Retomada assistida`, 5)
  if (postCapture.notifySeller !== false) {
    await createSellerNotification(organizationId, lead, sourceId, 'Novo lead preparado para contato', `${String(lead.name ?? 'Lead')}${lead.company ? ` · ${String(lead.company)}` : ''} entrou com responsável, prioridade, próxima ação e cadência definidos.`, 'success')
    processed += 1
  }
  if (postCapture.prepareWhatsApp !== false) { await createContactDraft(organizationId, lead, sourceId, 'whatsapp'); processed += 1 }
  if (postCapture.prepareEmail === true) { await createContactDraft(organizationId, lead, sourceId, 'email'); processed += 1 }
  return processed
}

const rollback = async (mutations: Mutation[]) => {
  const errors: string[] = []
  for (const mutation of [...mutations].reverse()) {
    let result: { error: { message: string } | null } | null = null
    if (mutation.kind === 'activity_create') result = await supabase.from('activities').delete().eq('id', mutation.id)
    if (mutation.kind === 'event_create') result = await supabase.from('calendar_events').delete().eq('id', mutation.id)
    if (mutation.kind === 'notification_create') result = await supabase.from('seller_notifications').delete().eq('id', mutation.id)
    if (mutation.kind === 'draft_create') result = await supabase.from('contact_drafts').delete().eq('id', mutation.id)
    if (mutation.kind === 'activity_update' && mutation.before) result = await supabase.from('activities').update(mutation.before).eq('id', mutation.id)
    if (mutation.kind === 'lead_update' && mutation.before) result = await supabase.from('leads').update(mutation.before).eq('id', mutation.id)
    if (result?.error) errors.push(`${mutation.kind}:${result.error.message}`)
  }
  return errors
}

const processQueuedRule = async (rule: Row, lead: Row, queueEvent: Row) => {
  const conditions = Array.isArray(rule.conditions) ? rule.conditions as Row[] : []
  const actions = Array.isArray(rule.actions) ? rule.actions as Row[] : []
  const context = { ...(queueEvent.payload as Row ?? {}), integrationSource: 'extension' }
  if (!conditions.every((condition) => conditionMatches(condition, lead, context))) return 'skipped'
  const guard = readGuard(conditions)
  const now = new Date()
  const dayStart = await startOfBusinessDay(rule.organization_id, now)
  const eventKey = `${rule.id}:${queueEvent.trigger_type}:${queueEvent.entity_id}:attempt:${Number(queueEvent.attempts ?? 0)}`
  const { data: run, error: runError } = await supabase.from('automation_runs').insert({
    organization_id: rule.organization_id, rule_id: rule.id, event_key: eventKey, status: 'running',
    input: { triggerType: queueEvent.trigger_type, queueEventId: queueEvent.id, leadId: lead.id, mode: guard.mode, ...context },
  }).select().maybeSingle()
  if (runError || !run) return 'skipped'

  const { data: recentRuns } = await supabase.from('automation_runs').select('id,started_at,status,input').eq('rule_id', rule.id).gte('started_at', dayStart).neq('id', run.id).order('started_at', { ascending: false })
  const leadRuns = (recentRuns ?? []).filter((item) => (item.input as Row | null)?.leadId === lead.id && item.status !== 'undone')
  const latest = leadRuns[0]
  const cooldownActive = latest && guard.cooldownHours > 0 && now.getTime() - new Date(latest.started_at).getTime() < guard.cooldownHours * 3_600_000
  if (leadRuns.length >= guard.maxRunsPerLeadPerDay || cooldownActive) {
    const reason = leadRuns.length >= guard.maxRunsPerLeadPerDay ? 'daily_limit' : 'cooldown'
    await supabase.from('automation_runs').update({ status: 'success', output: { skippedReason: reason, matchedLeadIds: [lead.id] }, finished_at: new Date().toISOString() }).eq('id', run.id)
    return 'skipped'
  }
  if (guard.mode === 'simulation') {
    await supabase.from('automation_runs').update({ status: 'success', output: { simulated: true, actionPreview: actions.slice(0, guard.maxActionsPerRun).map((action) => action.type), matchedLeadIds: [lead.id] }, finished_at: new Date().toISOString() }).eq('id', run.id)
    return 'simulated'
  }

  const mutations: Mutation[] = []; const warnings: string[] = []; const messages: string[] = []
  let currentLead = lead
  const createActivity = async (type: string, title: string, dueAt: string | null, completedAt: string | null = null) => {
    if (guard.preventDuplicates) {
      let duplicateQuery = supabase.from('activities').select('id').eq('organization_id', rule.organization_id).eq('lead_id', currentLead.id).eq('activity_type', type).ilike('title', title)
      duplicateQuery = completedAt ? duplicateQuery.not('completed_at', 'is', null) : duplicateQuery.is('completed_at', null)
      const { data: duplicate } = await duplicateQuery.limit(1)
      if (duplicate?.length) { messages.push(`Duplicidade evitada: ${title}`); return }
    }
    const { data, error } = await supabase.from('activities').insert({ organization_id: rule.organization_id, lead_id: currentLead.id, activity_type: type, title, description: `Criado pela automação “${rule.name}”.`, due_at: dueAt, completed_at: completedAt, assigned_to: currentLead.owner_id, source_type: 'system', source_id: run.id }).select('id').single()
    if (error) throw error
    mutations.push({ kind: 'activity_create', id: data.id }); messages.push(title)
  }
  const executeAction = async (action: Row) => {
    const type = String(action.type ?? ''); const value = String(action.value ?? '').trim()
    if (type === 'create_followup' || type === 'create_call') await createActivity(type === 'create_call' ? 'call' : 'followup', value || `Automação — ${rule.name}`, dueFor(action).toISOString())
    else if (type === 'create_note') await createActivity('note', value || `Nota automática — ${rule.name}`, null, new Date().toISOString())
    else if (type === 'internal_alert') {
      const title = value || `Lead exige atenção — ${String(rule.name)}`
      const notificationId = await createSellerNotification(rule.organization_id, currentLead, `${String(queueEvent.id)}:${String(rule.id)}`, title, `${String(currentLead.name ?? 'Lead')} está pronto para a próxima ação.`, 'warning')
      if (notificationId) mutations.push({ kind: 'notification_create', id: notificationId })
      await createActivity('followup', `Alerta interno — ${title}`, new Date().toISOString())
    } else if (type === 'assisted_whatsapp' || type === 'assisted_email') {
      const channel = type === 'assisted_whatsapp' ? 'whatsapp' : 'email'
      const draftId = await createContactDraft(rule.organization_id, currentLead, `${String(queueEvent.id)}:${String(rule.id)}`, channel, value)
      if (draftId) mutations.push({ kind: 'draft_create', id: draftId })
      await createActivity('followup', `${channel === 'whatsapp' ? 'WhatsApp' : 'E-mail'} preparado — ${String(rule.name)}`, new Date().toISOString())
    }
    else if (type === 'create_meeting') {
      const starts = dueFor(action); const ends = new Date(starts.getTime() + Math.max(15, Number(action.durationMinutes ?? 30)) * 60_000)
      const { data, error } = await supabase.from('calendar_events').insert({ organization_id: rule.organization_id, lead_id: currentLead.id, title: value || `Reunião — ${rule.name}`, description: `Criado pela automação “${rule.name}”.`, starts_at: starts.toISOString(), ends_at: ends.toISOString(), all_day: false, location: '', status: 'tentative', assigned_to: currentLead.owner_id }).select('id').single()
      if (error) throw error
      mutations.push({ kind: 'event_create', id: data.id }); messages.push(value || 'Reunião criada')
    } else if (type === 'add_tag' || type === 'remove_tag') {
      const before = { tags: currentLead.tags }; const currentTags = Array.isArray(currentLead.tags) ? currentLead.tags as string[] : []
      const tags = type === 'add_tag' ? [...new Set([...currentTags, value])] : currentTags.filter((tag) => normalized(tag) !== normalized(value))
      const { data, error } = await supabase.from('leads').update({ tags }).eq('organization_id', rule.organization_id).eq('id', currentLead.id).select().single(); if (error) throw error
      mutations.push({ kind: 'lead_update', id: String(currentLead.id), before }); currentLead = data
    } else if (type === 'set_priority' || type === 'set_temperature') {
      const field = type === 'set_priority' ? 'priority' : 'temperature'; const before = { [field]: currentLead[field] }
      const { data, error } = await supabase.from('leads').update({ [field]: value }).eq('organization_id', rule.organization_id).eq('id', currentLead.id).select().single(); if (error) throw error
      mutations.push({ kind: 'lead_update', id: String(currentLead.id), before }); currentLead = data
    } else if (type === 'assign_owner') {
      const before = { owner_id: currentLead.owner_id }; const { data, error } = await supabase.from('leads').update({ owner_id: value || null }).eq('organization_id', rule.organization_id).eq('id', currentLead.id).select().single(); if (error) throw error
      mutations.push({ kind: 'lead_update', id: String(currentLead.id), before }); currentLead = data
    } else if (type === 'move_stage' || type === 'mark_lost') {
      const stageQuery = type === 'mark_lost' ? supabase.from('pipeline_stages').select('id,is_won,is_lost').eq('organization_id', rule.organization_id).eq('is_lost', true).limit(1).maybeSingle() : supabase.from('pipeline_stages').select('id,is_won,is_lost').eq('organization_id', rule.organization_id).eq('id', value).maybeSingle()
      const { data: stage, error: stageError } = await stageQuery; if (stageError || !stage) throw stageError ?? new Error('Etapa da automação não encontrada.')
      const before = { stage_id: currentLead.stage_id, status: currentLead.status }; const status = stage.is_won ? 'won' : stage.is_lost ? 'lost' : 'active'
      const { data, error } = await supabase.from('leads').update({ stage_id: stage.id, status }).eq('organization_id', rule.organization_id).eq('id', currentLead.id).select().single(); if (error) throw error
      mutations.push({ kind: 'lead_update', id: String(currentLead.id), before }); currentLead = data
    } else if (type === 'start_cadence') {
      for (const [index, offset] of [0, 2, 5].entries()) { const due = new Date(); due.setDate(due.getDate() + offset); await createActivity(index === 1 ? 'call' : 'followup', `${value || 'Cadência automática'} · Etapa ${index + 1}`, due.toISOString()) }
    } else if (type === 'end_cadence') {
      const { data: pending, error } = await supabase.from('activities').select('id,completed_at').eq('organization_id', rule.organization_id).eq('lead_id', currentLead.id).is('completed_at', null).in('activity_type', ['followup', 'call', 'meeting']); if (error) throw error
      for (const item of pending ?? []) { const { error: completionError } = await supabase.from('activities').update({ completed_at: new Date().toISOString() }).eq('id', item.id); if (completionError) throw completionError; mutations.push({ kind: 'activity_update', id: item.id, before: { completed_at: item.completed_at } }) }
    } else throw new Error(`Ação não suportada: ${type}`)
  }
  try {
    for (const action of actions.slice(0, guard.maxActionsPerRun)) {
      try { await executeAction(action) }
      catch (actionError) {
        const message = actionError instanceof Error ? actionError.message : 'Falha em uma ação.'
        warnings.push(`${String(action.type)}: ${message}`)
        if (guard.stopOnError) throw actionError
      }
    }
    await supabase.from('automation_runs').update({ status: 'success', output: { message: `${messages.length} ação(ões) processada(s).`, mutations: mutations.map((item) => ({ ...item, [`${item.kind.split('_')[0]}Id`]: item.id })), warnings, matchedLeadIds: [lead.id] }, finished_at: new Date().toISOString() }).eq('id', run.id)
    return 'executed'
  } catch (error) {
    const rollbackErrors = await rollback(mutations)
    if (rollbackErrors.length) warnings.push(`Rollback incompleto: ${rollbackErrors.join(' | ')}`)
    const message = error instanceof Error ? error.message : 'automation failed'
    await supabase.from('automation_runs').update({ status: 'failed', output: { message: 'Alterações revertidas após falha.', warnings }, error_message: message, finished_at: new Date().toISOString() }).eq('id', run.id)
    throw error
  }
}

Deno.serve(async (request) => {
  if (!CRON_SECRET || request.headers.get('x-automation-secret') !== CRON_SECRET) return json({ error: 'unauthorized' }, 401)
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'runner_not_configured' }, 503)
  const now = new Date()
  const { data: rules, error: ruleError } = await supabase.from('automation_rules').select('*').eq('enabled', true).eq('trigger_type', 'activity_overdue')
  if (ruleError) return json({ error: ruleError.message }, 500)
  let executed = 0; let simulated = 0; let skipped = 0; let failed = 0

  for (const rule of rules ?? []) {
    const conditions = Array.isArray(rule.conditions) ? rule.conditions as Row[] : []
    const actions = Array.isArray(rule.actions) ? rule.actions as Row[] : []
    const guard = readGuard(conditions)
    let activities: Row[]
    try { activities = await listOverdueActivities(rule.organization_id, now.toISOString()) }
    catch { failed += 1; continue }
    const dayStart = await startOfBusinessDay(rule.organization_id, now)

    for (const activity of activities) {
      if (!activity.lead_id) continue
      const [{ data: lead }, { count: attemptCount }] = await Promise.all([
        supabase.from('leads').select('*').eq('organization_id', rule.organization_id).eq('id', activity.lead_id).maybeSingle(),
        supabase.from('calls').select('id', { count: 'exact', head: true }).eq('organization_id', rule.organization_id).eq('lead_id', activity.lead_id),
      ])
      if (!lead || !conditions.every((condition) => conditionMatches(condition, lead, { activityType: activity.activity_type, attemptCount: attemptCount ?? 0 }))) continue

      const eventKey = `${rule.id}:activity_overdue:${activity.id}:${dayKey(now)}`
      const { data: run, error: runError } = await supabase.from('automation_runs').insert({
        organization_id: rule.organization_id, rule_id: rule.id, event_key: eventKey, status: 'running',
        input: { triggerType: 'activity_overdue', activityId: activity.id, activityType: activity.activity_type, leadId: lead.id, mode: guard.mode },
      }).select().maybeSingle()
      if (runError || !run) { skipped += 1; continue }

      const { data: recentRuns } = await supabase.from('automation_runs').select('id,started_at,status,input').eq('rule_id', rule.id).gte('started_at', dayStart).neq('id', run.id).order('started_at', { ascending: false })
      const leadRuns = (recentRuns ?? []).filter((item) => (item.input as Row | null)?.leadId === lead.id && item.status !== 'undone')
      const latest = leadRuns[0]
      const cooldownActive = latest && guard.cooldownHours > 0 && now.getTime() - new Date(latest.started_at).getTime() < guard.cooldownHours * 3_600_000
      if (leadRuns.length >= guard.maxRunsPerLeadPerDay || cooldownActive) {
        const reason = leadRuns.length >= guard.maxRunsPerLeadPerDay ? 'daily_limit' : 'cooldown'
        await supabase.from('automation_runs').update({ status: 'success', output: { skippedReason: reason, matchedLeadIds: [lead.id] }, finished_at: new Date().toISOString() }).eq('id', run.id)
        skipped += 1; continue
      }
      if (guard.mode === 'simulation') {
        await supabase.from('automation_runs').update({ status: 'success', output: { simulated: true, actionPreview: actions.slice(0, guard.maxActionsPerRun).map((action) => action.type), matchedLeadIds: [lead.id] }, finished_at: new Date().toISOString() }).eq('id', run.id)
        simulated += 1; continue
      }

      const mutations: Mutation[] = []; const warnings: string[] = []; const messages: string[] = []
      let currentLead = lead as Row
      const createActivity = async (type: string, title: string, dueAt: string | null, completedAt: string | null = null) => {
        if (guard.preventDuplicates) {
          let duplicateQuery = supabase.from('activities').select('id').eq('organization_id', rule.organization_id).eq('lead_id', currentLead.id).eq('activity_type', type).ilike('title', title)
          duplicateQuery = completedAt ? duplicateQuery.not('completed_at', 'is', null) : duplicateQuery.is('completed_at', null)
          const { data: duplicate } = await duplicateQuery.limit(1)
          if (duplicate?.length) { messages.push(`Duplicidade evitada: ${title}`); return }
        }
        const { data, error } = await supabase.from('activities').insert({ organization_id: rule.organization_id, lead_id: currentLead.id, activity_type: type, title, description: `Criado pela automação “${rule.name}”.`, due_at: dueAt, completed_at: completedAt, assigned_to: currentLead.owner_id, source_type: 'system', source_id: run.id }).select('id').single()
        if (error) throw error
        mutations.push({ kind: 'activity_create', id: data.id }); messages.push(title)
      }

      const executeAction = async (action: Row) => {
        const type = String(action.type ?? ''); const value = String(action.value ?? '').trim()
        if (type === 'create_followup' || type === 'create_call') await createActivity(type === 'create_call' ? 'call' : 'followup', value || `Automação — ${rule.name}`, dueFor(action).toISOString())
        else if (type === 'create_note') await createActivity('note', value || `Nota automática — ${rule.name}`, null, new Date().toISOString())
        else if (type === 'internal_alert') {
          const title = value || `Lead exige atenção — ${String(rule.name)}`
          const notificationId = await createSellerNotification(rule.organization_id, currentLead, String(run.id), title, `${String(currentLead.name ?? 'Lead')} está pronto para a próxima ação.`, 'warning')
          if (notificationId) mutations.push({ kind: 'notification_create', id: notificationId })
          await createActivity('followup', `Alerta interno — ${title}`, new Date().toISOString())
        } else if (type === 'assisted_whatsapp' || type === 'assisted_email') {
          const channel = type === 'assisted_whatsapp' ? 'whatsapp' : 'email'
          const draftId = await createContactDraft(rule.organization_id, currentLead, String(run.id), channel, value)
          if (draftId) mutations.push({ kind: 'draft_create', id: draftId })
          await createActivity('followup', `${channel === 'whatsapp' ? 'WhatsApp' : 'E-mail'} preparado — ${String(rule.name)}`, new Date().toISOString())
        }
        else if (type === 'create_meeting') {
          const starts = dueFor(action); const ends = new Date(starts.getTime() + Math.max(15, Number(action.durationMinutes ?? 30)) * 60_000)
          const { data, error } = await supabase.from('calendar_events').insert({ organization_id: rule.organization_id, lead_id: currentLead.id, title: value || `Reunião — ${rule.name}`, description: `Criado pela automação “${rule.name}”.`, starts_at: starts.toISOString(), ends_at: ends.toISOString(), all_day: false, location: '', status: 'tentative', assigned_to: currentLead.owner_id }).select('id').single()
          if (error) throw error
          mutations.push({ kind: 'event_create', id: data.id }); messages.push(value || 'Reunião criada')
        } else if (type === 'add_tag' || type === 'remove_tag') {
          const before = { tags: currentLead.tags }; const currentTags = Array.isArray(currentLead.tags) ? currentLead.tags as string[] : []
          const tags = type === 'add_tag' ? [...new Set([...currentTags, value])] : currentTags.filter((tag) => normalized(tag) !== normalized(value))
          const { data, error } = await supabase.from('leads').update({ tags }).eq('organization_id', rule.organization_id).eq('id', currentLead.id).select().single(); if (error) throw error
          mutations.push({ kind: 'lead_update', id: String(currentLead.id), before }); currentLead = data
        } else if (type === 'set_priority' || type === 'set_temperature') {
          const field = type === 'set_priority' ? 'priority' : 'temperature'; const before = { [field]: currentLead[field] }
          const { data, error } = await supabase.from('leads').update({ [field]: value }).eq('organization_id', rule.organization_id).eq('id', currentLead.id).select().single(); if (error) throw error
          mutations.push({ kind: 'lead_update', id: String(currentLead.id), before }); currentLead = data
        } else if (type === 'assign_owner') {
          const before = { owner_id: currentLead.owner_id }; const { data, error } = await supabase.from('leads').update({ owner_id: value || null }).eq('organization_id', rule.organization_id).eq('id', currentLead.id).select().single(); if (error) throw error
          mutations.push({ kind: 'lead_update', id: String(currentLead.id), before }); currentLead = data
        } else if (type === 'move_stage' || type === 'mark_lost') {
          const stageQuery = type === 'mark_lost' ? supabase.from('pipeline_stages').select('id,is_won,is_lost').eq('organization_id', rule.organization_id).eq('is_lost', true).limit(1).maybeSingle() : supabase.from('pipeline_stages').select('id,is_won,is_lost').eq('organization_id', rule.organization_id).eq('id', value).maybeSingle()
          const { data: stage, error: stageError } = await stageQuery; if (stageError || !stage) throw stageError ?? new Error('Etapa da automação não encontrada.')
          const before = { stage_id: currentLead.stage_id, status: currentLead.status }; const status = stage.is_won ? 'won' : stage.is_lost ? 'lost' : 'active'
          const { data, error } = await supabase.from('leads').update({ stage_id: stage.id, status }).eq('organization_id', rule.organization_id).eq('id', currentLead.id).select().single(); if (error) throw error
          mutations.push({ kind: 'lead_update', id: String(currentLead.id), before }); currentLead = data
        } else if (type === 'start_cadence') {
          for (const [index, offset] of [0, 2, 5].entries()) { const due = new Date(); due.setDate(due.getDate() + offset); await createActivity(index === 1 ? 'call' : 'followup', `${value || 'Cadência automática'} · Etapa ${index + 1}`, due.toISOString()) }
        } else if (type === 'end_cadence') {
          const { data: pending, error } = await supabase.from('activities').select('id,completed_at').eq('organization_id', rule.organization_id).eq('lead_id', currentLead.id).is('completed_at', null).in('activity_type', ['followup', 'call', 'meeting']); if (error) throw error
          for (const item of pending ?? []) { const { error: completionError } = await supabase.from('activities').update({ completed_at: new Date().toISOString() }).eq('id', item.id); if (completionError) throw completionError; mutations.push({ kind: 'activity_update', id: item.id, before: { completed_at: item.completed_at } }) }
        } else throw new Error(`Ação não suportada: ${type}`)
      }

      try {
        for (const action of actions.slice(0, guard.maxActionsPerRun)) {
          try { await executeAction(action) }
          catch (actionError) {
            const message = actionError instanceof Error ? actionError.message : 'Falha em uma ação.'
            warnings.push(`${String(action.type)}: ${message}`)
            if (guard.stopOnError) throw actionError
          }
        }
        await supabase.from('automation_runs').update({ status: 'success', output: { message: `${messages.length} ação(ões) processada(s).`, mutations: mutations.map((item) => ({ ...item, [`${item.kind.split('_')[0]}Id`]: item.id })), warnings, matchedLeadIds: [lead.id] }, finished_at: new Date().toISOString() }).eq('id', run.id)
        executed += 1
      } catch (error) {
        const rollbackErrors = await rollback(mutations)
        if (rollbackErrors.length) warnings.push(`Rollback incompleto: ${rollbackErrors.join(' | ')}`)
        const message = error instanceof Error ? error.message : 'automation failed'
        await supabase.from('automation_runs').update({ status: 'failed', output: { message: 'Alterações revertidas após falha.', warnings }, error_message: message, finished_at: new Date().toISOString() }).eq('id', run.id)
        failed += 1
      }
    }
  }
  const staleLock = new Date(Date.now() - 10 * 60_000).toISOString()
  await supabase.from('automation_events').update({ status: 'failed', locked_at: null, available_at: now.toISOString(), last_error: 'Processamento anterior expirou e voltou para a fila.' }).eq('status', 'processing').lt('locked_at', staleLock)
  const { data: queueCandidates } = await supabase.from('automation_events').select('*').in('status', ['queued','failed']).lte('available_at', now.toISOString()).order('priority', { ascending: true }).order('available_at', { ascending: true }).limit(100)
  const queue = (queueCandidates ?? []).filter((item) => Number(item.attempts) < Number(item.max_attempts ?? 5)).slice(0, 50)
  for (const queueEvent of queue) {
    const nextAttempt = Number(queueEvent.attempts) + 1
    const attemptAt = new Date().toISOString()
    const { data: claimed } = await supabase.from('automation_events').update({ status: 'processing', locked_at: attemptAt, last_attempt_at: attemptAt, attempts: nextAttempt }).eq('id', queueEvent.id).in('status', ['queued','failed']).select('id').maybeSingle()
    if (!claimed) continue
    let queueLead: Row | null = null
    try {
      const [{ data: lead }, { data: eventRules, error: eventRuleError }] = await Promise.all([
        queueEvent.lead_id ? supabase.from('leads').select('*').eq('organization_id', queueEvent.organization_id).eq('id', queueEvent.lead_id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from('automation_rules').select('*').eq('organization_id', queueEvent.organization_id).eq('enabled', true).eq('trigger_type', queueEvent.trigger_type),
      ])
      if (eventRuleError) throw eventRuleError
      if (!lead) throw new Error('Lead do evento não foi encontrado.')
      queueLead = lead as Row
      executed += await processPostCapture(queueEvent as Row, queueLead)
      for (const rule of eventRules ?? []) {
        const result = await processQueuedRule(rule as Row, queueLead, queueEvent as Row)
        if (result === 'executed') executed += 1
        else if (result === 'simulated') simulated += 1
        else skipped += 1
      }
      await supabase.from('automation_events').update({ status: 'completed', processed_at: new Date().toISOString(), locked_at: null, last_error: null }).eq('id', queueEvent.id)
    } catch (queueError) {
      const message = queueError instanceof Error ? queueError.message : 'Falha ao processar evento externo.'
      const maxAttempts = Number(queueEvent.max_attempts ?? 5)
      const exhausted = nextAttempt >= maxAttempts
      const delayMinutes = Math.min(60, 2 ** Math.max(1, nextAttempt)) + Math.floor(Math.random() * 3)
      const retryAt = new Date(Date.now() + delayMinutes * 60_000).toISOString()
      await supabase.from('automation_events').update({
        status: exhausted ? 'dead_letter' : 'failed', available_at: retryAt, locked_at: null,
        last_error: message.slice(0, 500), dead_lettered_at: exhausted ? new Date().toISOString() : null,
      }).eq('id', queueEvent.id)
      if (exhausted && queueLead) await createSellerNotification(queueEvent.organization_id, queueLead, `dead-letter:${String(queueEvent.id)}`, 'Automação requer intervenção', `O evento ${String(queueEvent.trigger_type)} falhou ${nextAttempt} vezes. Revise o erro e use Reprocessar na fila operacional.`, 'danger')
      failed += 1
    }
  }
  return json({ executed, simulated, skipped, failed, queuedChecked: queue.length, checkedAt: now.toISOString() })
})
