import { createUuid } from '../lib/id'
import { safeStorage } from '../lib/storage'
import { getSupabaseClient } from '../lib/supabase'
import type { Database } from '../lib/supabase.types'

export type AutomationQueueStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'dead_letter'
export type ContactDraftChannel = 'whatsapp' | 'email' | 'instagram'

export interface AutomationQueueEvent {
  id: string
  workspaceId: string
  triggerType: string
  entityId: string
  leadId: string | null
  status: AutomationQueueStatus
  attempts: number
  maxAttempts: number
  priority: number
  source: string
  availableAt: string
  lastAttemptAt: string | null
  lastError: string | null
  createdAt: string
  processedAt: string | null
}

export interface SellerNotification {
  id: string
  workspaceId: string
  userId: string | null
  leadId: string | null
  title: string
  body: string
  severity: 'info' | 'success' | 'warning' | 'danger'
  status: 'unread' | 'read' | 'dismissed'
  actionRoute: string
  sourceType: string
  sourceId: string | null
  createdAt: string
  readAt: string | null
}

export interface ContactDraft {
  id: string
  workspaceId: string
  leadId: string
  channel: ContactDraftChannel
  subject: string
  message: string
  status: 'ready' | 'used' | 'discarded'
  sourceType: string
  sourceId: string | null
  createdAt: string
  usedAt: string | null
}

export interface AutomationOperationsState {
  queue: AutomationQueueEvent[]
  notifications: SellerNotification[]
  drafts: ContactDraft[]
}

const STORAGE_PREFIX = 'realtalent-crm-v100-automation-operations:'
const now = () => new Date().toISOString()
const blankState = (): AutomationOperationsState => ({ queue: [], notifications: [], drafts: [] })
const storageKey = (workspaceId: string) => `${STORAGE_PREFIX}${workspaceId}`

const readLocal = (workspaceId: string): AutomationOperationsState => {
  const raw = safeStorage.getItem(storageKey(workspaceId))
  if (!raw) return blankState()
  try {
    const parsed = JSON.parse(raw) as Partial<AutomationOperationsState>
    return {
      queue: Array.isArray(parsed.queue) ? parsed.queue.slice(0, 200) : [],
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications.slice(0, 200) : [],
      drafts: Array.isArray(parsed.drafts) ? parsed.drafts.slice(0, 200) : [],
    }
  } catch { return blankState() }
}

const writeLocal = (workspaceId: string, state: AutomationOperationsState) => safeStorage.setItem(storageKey(workspaceId), JSON.stringify({
  queue: state.queue.slice(0, 200), notifications: state.notifications.slice(0, 200), drafts: state.drafts.slice(0, 200),
}))

type QueueRow = Database['public']['Tables']['automation_events']['Row']
type NotificationRow = Database['public']['Tables']['seller_notifications']['Row']
type DraftRow = Database['public']['Tables']['contact_drafts']['Row']

const mapQueue = (row: QueueRow): AutomationQueueEvent => ({
  id: row.id, workspaceId: row.organization_id, triggerType: row.trigger_type, entityId: row.entity_id, leadId: row.lead_id,
  status: row.status as AutomationQueueStatus, attempts: row.attempts, maxAttempts: row.max_attempts, priority: row.priority,
  source: row.source, availableAt: row.available_at, lastAttemptAt: row.last_attempt_at, lastError: row.last_error,
  createdAt: row.created_at, processedAt: row.processed_at,
})
const mapNotification = (row: NotificationRow): SellerNotification => ({
  id: row.id, workspaceId: row.organization_id, userId: row.user_id, leadId: row.lead_id, title: row.title, body: row.body,
  severity: row.severity as SellerNotification['severity'], status: row.status as SellerNotification['status'], actionRoute: row.action_route,
  sourceType: row.source_type, sourceId: row.source_id, createdAt: row.created_at, readAt: row.read_at,
})
const mapDraft = (row: DraftRow): ContactDraft => ({
  id: row.id, workspaceId: row.organization_id, leadId: row.lead_id, channel: row.channel as ContactDraftChannel,
  subject: row.subject, message: row.message, status: row.status as ContactDraft['status'], sourceType: row.source_type,
  sourceId: row.source_id, createdAt: row.created_at, usedAt: row.used_at,
})

export async function loadAutomationOperations(workspaceId: string, includeQueue = true): Promise<AutomationOperationsState> {
  const local = readLocal(workspaceId)
  const safeLocal = includeQueue ? local : { ...local, queue: [] }
  const client = getSupabaseClient()
  if (!client) return safeLocal
  const queuePromise = includeQueue
    ? client.from('automation_events').select('*').eq('organization_id', workspaceId).order('created_at', { ascending: false }).limit(200)
    : Promise.resolve({ data: [], error: null })
  const [queueResult, notificationResult, draftResult] = await Promise.all([
    queuePromise,
    client.from('seller_notifications').select('*').eq('organization_id', workspaceId).order('created_at', { ascending: false }).limit(200),
    client.from('contact_drafts').select('*').eq('organization_id', workspaceId).order('created_at', { ascending: false }).limit(200),
  ])
  const state: AutomationOperationsState = {
    queue: queueResult.error ? [] : (queueResult.data ?? []).map(mapQueue),
    notifications: notificationResult.error ? safeLocal.notifications : (notificationResult.data ?? []).map(mapNotification),
    drafts: draftResult.error ? safeLocal.drafts : (draftResult.data ?? []).map(mapDraft),
  }
  writeLocal(workspaceId, state)
  return state
}

export async function retryAutomationEvent(workspaceId: string, eventId: string) {
  const client = getSupabaseClient()
  if (client) {
    const { error } = await client.rpc('retry_automation_event', { p_event_id: eventId })
    if (error) throw new Error(`Não foi possível reprocessar o evento: ${error.message}`)
    return
  }
  const state = readLocal(workspaceId)
  writeLocal(workspaceId, { ...state, queue: state.queue.map((item) => item.id === eventId ? { ...item, status: 'queued', attempts: 0, availableAt: now(), lastAttemptAt: null, lastError: null, processedAt: null } : item) })
}

export async function retryFailedAutomationEvents(workspaceId: string) {
  const client = getSupabaseClient()
  if (client) {
    const { data, error } = await client.rpc('retry_failed_automation_events', { p_organization_id: workspaceId })
    if (error) throw new Error(`Não foi possível reprocessar a fila: ${error.message}`)
    return Number(data ?? 0)
  }
  const state = readLocal(workspaceId)
  let count = 0
  const queue = state.queue.map((item) => {
    if (!['failed', 'dead_letter'].includes(item.status)) return item
    count += 1
    return { ...item, status: 'queued' as const, attempts: 0, availableAt: now(), lastAttemptAt: null, lastError: null, processedAt: null }
  })
  writeLocal(workspaceId, { ...state, queue })
  return count
}

export async function cancelAutomationEvent(workspaceId: string, eventId: string) {
  const client = getSupabaseClient()
  if (client) {
    const { error } = await client.rpc('cancel_automation_event', { p_event_id: eventId })
    if (error) throw new Error(`Não foi possível cancelar o evento: ${error.message}`)
    return
  }
  const state = readLocal(workspaceId)
  writeLocal(workspaceId, { ...state, queue: state.queue.map((item) => item.id === eventId ? { ...item, status: 'cancelled', processedAt: now() } : item) })
}

export async function markSellerNotification(workspaceId: string, notificationId: string, status: 'read' | 'dismissed' = 'read') {
  const readAt = status === 'read' ? now() : null
  const client = getSupabaseClient()
  if (client) {
    const { error } = await client.from('seller_notifications').update({ status, read_at: readAt }).eq('organization_id', workspaceId).eq('id', notificationId)
    if (error) throw new Error(`Não foi possível atualizar o aviso: ${error.message}`)
    return
  }
  const state = readLocal(workspaceId)
  writeLocal(workspaceId, { ...state, notifications: state.notifications.map((item) => item.id === notificationId ? { ...item, status, readAt } : item) })
}

export async function markContactDraft(workspaceId: string, draftId: string, status: 'used' | 'discarded' = 'used') {
  const usedAt = status === 'used' ? now() : null
  const client = getSupabaseClient()
  if (client) {
    const { error } = await client.from('contact_drafts').update({ status, used_at: usedAt }).eq('organization_id', workspaceId).eq('id', draftId)
    if (error) throw new Error(`Não foi possível atualizar a mensagem: ${error.message}`)
    return
  }
  const state = readLocal(workspaceId)
  writeLocal(workspaceId, { ...state, drafts: state.drafts.map((item) => item.id === draftId ? { ...item, status, usedAt } : item) })
}

export async function recordSellerNotification(input: Omit<SellerNotification, 'id' | 'status' | 'createdAt' | 'readAt'>) {
  const createdAt = now()
  const client = getSupabaseClient()
  if (client) {
    const { error } = await client.from('seller_notifications').insert({
      organization_id: input.workspaceId, user_id: input.userId, lead_id: input.leadId, title: input.title, body: input.body,
      severity: input.severity, action_route: input.actionRoute, source_type: input.sourceType, source_id: input.sourceId,
    })
    if (error && error.code !== '23505') throw error
    return
  }
  const state = readLocal(input.workspaceId)
  const duplicate = input.sourceId && state.notifications.some((item) => item.sourceType === input.sourceType && item.sourceId === input.sourceId && item.title === input.title)
  if (duplicate) return
  const notification: SellerNotification = { ...input, id: createUuid(), status: 'unread', createdAt, readAt: null }
  writeLocal(input.workspaceId, { ...state, notifications: [notification, ...state.notifications] })
}

export async function recordContactDraft(input: Omit<ContactDraft, 'id' | 'status' | 'createdAt' | 'usedAt'>) {
  const createdAt = now()
  const client = getSupabaseClient()
  if (client) {
    const { error } = await client.from('contact_drafts').insert({
      organization_id: input.workspaceId, lead_id: input.leadId, channel: input.channel, subject: input.subject,
      message: input.message, source_type: input.sourceType, source_id: input.sourceId,
    })
    if (error && error.code !== '23505') throw error
    return
  }
  const state = readLocal(input.workspaceId)
  const duplicate = input.sourceId && state.drafts.some((item) => item.sourceType === input.sourceType && item.sourceId === input.sourceId && item.channel === input.channel)
  if (duplicate) return
  const draft: ContactDraft = { ...input, id: createUuid(), status: 'ready', createdAt, usedAt: null }
  writeLocal(input.workspaceId, { ...state, drafts: [draft, ...state.drafts] })
}
