import { createUuid } from '../lib/id'
import { safeStorage } from '../lib/storage'
import { getSupabaseClient } from '../lib/supabase'
import type { AutomationRule, Lead } from '../domain/types'

export type WebhookMethod = 'POST' | 'PUT' | 'PATCH'
export type WebhookDeliveryStatus = 'pending' | 'sending' | 'success' | 'failed' | 'cancelled' | 'simulated'

export interface AutomationWebhook {
  id: string
  workspaceId: string
  name: string
  url: string
  method: WebhookMethod
  enabled: boolean
  secretToken: string
  hasSecret: boolean
  timeoutSeconds: number
  maxAttempts: number
  headers: Record<string, string>
  createdAt: string
  updatedAt: string
}

export interface WebhookDelivery {
  id: string
  workspaceId: string
  webhookId: string
  automationRunId: string | null
  ruleId: string | null
  leadId: string | null
  eventType: string
  correlationId: string
  status: WebhookDeliveryStatus
  attempts: number
  requestBody: Record<string, unknown>
  responseStatus: number | null
  responseBody: string
  errorMessage: string
  createdAt: string
  finishedAt: string | null
}

export interface WebhookState {
  endpoints: AutomationWebhook[]
  deliveries: WebhookDelivery[]
}

export interface WebhookInput {
  name: string
  url: string
  method: WebhookMethod
  enabled: boolean
  secretToken: string
  timeoutSeconds: number
  maxAttempts: number
  headers: Record<string, string>
}

const STORAGE_PREFIX = 'realtalent-crm-v100-36-webhooks:'
const now = () => new Date().toISOString()
const key = (workspaceId: string) => `${STORAGE_PREFIX}${workspaceId}`
const blank = (): WebhookState => ({ endpoints: [], deliveries: [] })

const readLocal = (workspaceId: string): WebhookState => {
  const raw = safeStorage.getItem(key(workspaceId))
  if (!raw) return blank()
  try {
    const parsed = JSON.parse(raw) as Partial<WebhookState>
    return {
      endpoints: Array.isArray(parsed.endpoints) ? parsed.endpoints.slice(0, 100) : [],
      deliveries: Array.isArray(parsed.deliveries) ? parsed.deliveries.slice(0, 300) : [],
    }
  } catch { return blank() }
}

const writeLocal = (workspaceId: string, value: WebhookState) => safeStorage.setItem(key(workspaceId), JSON.stringify({
  endpoints: value.endpoints.slice(0, 100), deliveries: value.deliveries.slice(0, 300),
}))

const normalizeUrl = (value: string) => {
  const url = new URL(value.trim())
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Use uma URL HTTP ou HTTPS válida.')
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Webhooks externos devem utilizar HTTPS.')
  return url.toString()
}

export function validateWebhookInput(input: WebhookInput) {
  const errors: string[] = []
  if (!input.name.trim()) errors.push('Informe o nome do webhook.')
  try { normalizeUrl(input.url) } catch (error) { errors.push(error instanceof Error ? error.message : 'URL inválida.') }
  if (input.timeoutSeconds < 3 || input.timeoutSeconds > 30) errors.push('O timeout deve ficar entre 3 e 30 segundos.')
  if (input.maxAttempts < 1 || input.maxAttempts > 8) errors.push('O limite de tentativas deve ficar entre 1 e 8.')
  if (Object.keys(input.headers).length > 12) errors.push('Use no máximo 12 cabeçalhos personalizados.')
  return Array.from(new Set(errors))
}

const mapEndpoint = (row: Record<string, any>): AutomationWebhook => ({
  id: row.id, workspaceId: row.organization_id, name: row.name, url: row.url, method: row.method as WebhookMethod,
  enabled: row.enabled, secretToken: '', hasSecret: Boolean(row.has_secret), timeoutSeconds: row.timeout_seconds ?? 10,
  maxAttempts: row.max_attempts ?? 3, headers: row.headers && typeof row.headers === 'object' ? row.headers : {},
  createdAt: row.created_at, updatedAt: row.updated_at,
})
const mapDelivery = (row: Record<string, any>): WebhookDelivery => ({
  id: row.id, workspaceId: row.organization_id, webhookId: row.webhook_id, automationRunId: row.automation_run_id,
  ruleId: row.rule_id, leadId: row.lead_id, eventType: row.event_type, correlationId: row.correlation_id ?? '', status: row.status as WebhookDeliveryStatus,
  attempts: row.attempts ?? 0, requestBody: row.request_body && typeof row.request_body === 'object' ? row.request_body : {},
  responseStatus: row.response_status, responseBody: row.response_body ?? '', errorMessage: row.error_message ?? '',
  createdAt: row.created_at, finishedAt: row.finished_at,
})

export async function loadWebhookState(workspaceId: string): Promise<WebhookState> {
  const local = readLocal(workspaceId)
  const client = getSupabaseClient() as any
  if (!client) return local
  const [endpointsResult, deliveriesResult] = await Promise.all([
    client.from('automation_webhooks').select('id,organization_id,name,url,method,enabled,has_secret,timeout_seconds,max_attempts,headers,created_at,updated_at').eq('organization_id', workspaceId).order('created_at', { ascending: false }).limit(100),
    client.from('webhook_deliveries').select('*').eq('organization_id', workspaceId).order('created_at', { ascending: false }).limit(300),
  ])
  const state = {
    endpoints: endpointsResult.error ? local.endpoints : (endpointsResult.data ?? []).map(mapEndpoint),
    deliveries: deliveriesResult.error ? local.deliveries : (deliveriesResult.data ?? []).map(mapDelivery),
  }
  writeLocal(workspaceId, state)
  return state
}

export async function saveWebhook(workspaceId: string, input: WebhookInput, webhookId?: string) {
  const errors = validateWebhookInput(input)
  if (errors.length) throw new Error(errors.join(' '))
  const normalized: WebhookInput = { ...input, name: input.name.trim(), url: normalizeUrl(input.url), secretToken: input.secretToken.trim() }
  const client = getSupabaseClient() as any
  if (client) {
    if (!normalized.url.startsWith('https://')) throw new Error('No Supabase, o destino do webhook deve utilizar HTTPS.')
    const payload: Record<string, unknown> = {
      organization_id: workspaceId, name: normalized.name, url: normalized.url, method: normalized.method,
      enabled: normalized.enabled, timeout_seconds: normalized.timeoutSeconds,
      max_attempts: normalized.maxAttempts, headers: normalized.headers,
    }
    if (normalized.secretToken) payload.secret_token = normalized.secretToken
    const query = webhookId
      ? client.from('automation_webhooks').update(payload).eq('organization_id', workspaceId).eq('id', webhookId)
      : client.from('automation_webhooks').insert(payload)
    const { data, error } = await query.select('id,organization_id,name,url,method,enabled,has_secret,timeout_seconds,max_attempts,headers,created_at,updated_at').single()
    if (error) throw new Error(`Não foi possível salvar o webhook: ${error.message}`)
    return mapEndpoint(data)
  }
  const state = readLocal(workspaceId)
  const timestamp = now()
  const endpoint: AutomationWebhook = webhookId
    ? { ...(state.endpoints.find((item) => item.id === webhookId) ?? { id: webhookId, workspaceId, createdAt: timestamp, hasSecret: false }), ...normalized, hasSecret: Boolean(normalized.secretToken || state.endpoints.find((item) => item.id === webhookId)?.hasSecret), updatedAt: timestamp }
    : { ...normalized, hasSecret: Boolean(normalized.secretToken), id: createUuid(), workspaceId, createdAt: timestamp, updatedAt: timestamp }
  const endpoints = webhookId ? state.endpoints.map((item) => item.id === webhookId ? endpoint : item) : [endpoint, ...state.endpoints]
  writeLocal(workspaceId, { ...state, endpoints })
  return endpoint
}

export async function deleteWebhook(workspaceId: string, webhookId: string) {
  const client = getSupabaseClient() as any
  if (client) {
    const { error } = await client.from('automation_webhooks').delete().eq('organization_id', workspaceId).eq('id', webhookId)
    if (error) throw new Error(`Não foi possível remover o webhook: ${error.message}`)
    return
  }
  const state = readLocal(workspaceId)
  writeLocal(workspaceId, { ...state, endpoints: state.endpoints.filter((item) => item.id !== webhookId) })
}

const buildPayload = (input: {
  workspaceId: string
  runId: string | null
  rule: Pick<AutomationRule, 'id' | 'name' | 'triggerType'> | null
  lead: Lead | null
  eventType: string
  correlationId: string
  test?: boolean
}) => ({
  version: '100.42',
  event: input.test ? 'webhook.test' : input.eventType,
  occurredAt: now(),
  correlationId: input.correlationId,
  workspaceId: input.workspaceId,
  automation: input.rule ? { id: input.rule.id, name: input.rule.name, trigger: input.rule.triggerType } : null,
  runId: input.runId,
  lead: input.lead ? {
    id: input.lead.id, name: input.lead.name, company: input.lead.company, phone: input.lead.phone,
    email: input.lead.email, city: input.lead.city, stageId: input.lead.stageId, status: input.lead.status,
    priority: input.lead.priority, temperature: input.lead.temperature, value: input.lead.value, tags: input.lead.tags,
    ownerName: input.lead.ownerName, nextActionAt: input.lead.nextActionAt,
  } : null,
})

export async function dispatchAutomationWebhook(input: {
  workspaceId: string
  webhookId: string
  runId: string | null
  rule: Pick<AutomationRule, 'id' | 'name' | 'triggerType'> | null
  lead: Lead | null
  eventType: string
  correlationId: string
  test?: boolean
}) {
  const state = await loadWebhookState(input.workspaceId)
  const endpoint = state.endpoints.find((item) => item.id === input.webhookId)
  if (!endpoint) throw new Error('O webhook selecionado não existe mais.')
  if (!endpoint.enabled && !input.test) throw new Error('O webhook selecionado está pausado.')
  const payload = buildPayload(input)
  const client = getSupabaseClient() as any
  if (client) {
    const record = {
      organization_id: input.workspaceId, webhook_id: endpoint.id, automation_run_id: input.runId,
      rule_id: input.rule?.id ?? null, lead_id: input.lead?.id ?? null, event_type: input.test ? 'webhook.test' : input.eventType,
      correlation_id: input.correlationId, status: 'pending', attempts: 0, request_body: payload,
    }
    let { data, error } = await client.from('webhook_deliveries').insert(record).select('*').single()
    if (error?.code === '23505') {
      const existing = await client.from('webhook_deliveries').select('*')
        .eq('organization_id', input.workspaceId).eq('webhook_id', endpoint.id)
        .eq('correlation_id', input.correlationId).eq('event_type', record.event_type).single()
      data = existing.data; error = existing.error
    }
    if (error || !data) throw new Error(`Não foi possível enfileirar o webhook: ${error?.message ?? 'registro não encontrado'}`)
    const delivery = mapDelivery(data)
    if (['success', 'cancelled', 'sending'].includes(delivery.status)) return delivery
    const invocation = await client.functions.invoke('automation-webhook-dispatch', { body: { deliveryId: delivery.id } })
    if (invocation.error) throw new Error(`Webhook enfileirado, mas o envio não iniciou: ${invocation.error.message}`)
    return delivery
  }
  const timestamp = now()
  const delivery: WebhookDelivery = {
    id: createUuid(), workspaceId: input.workspaceId, webhookId: endpoint.id, automationRunId: input.runId,
    ruleId: input.rule?.id ?? null, leadId: input.lead?.id ?? null, eventType: input.test ? 'webhook.test' : input.eventType, correlationId: input.correlationId,
    status: 'simulated', attempts: 1, requestBody: payload, responseStatus: 200,
    responseBody: 'Modo local: entrega simulada com sucesso; nenhum dado saiu do navegador.', errorMessage: '',
    createdAt: timestamp, finishedAt: timestamp,
  }
  writeLocal(input.workspaceId, { ...state, deliveries: [delivery, ...state.deliveries] })
  return delivery
}

export const maskSecret = (value: string) => value ? `${value.slice(0, 3)}••••••${value.slice(-2)}` : 'Sem assinatura'
export const maskWebhookUrl = (value: string) => {
  try { const url = new URL(value); return `${url.origin}${url.pathname.length > 34 ? `${url.pathname.slice(0, 31)}…` : url.pathname}` }
  catch { return value }
}
