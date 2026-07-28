import type { ActivityItem, CalendarEvent, CommunicationChannel, CommunicationDirection, CommunicationEvent, CommunicationStatus, Lead, WorkspaceSnapshot } from '../domain/types'
import { env } from '../lib/env'
import { createUuid } from '../lib/id'
import { getSupabaseClient } from '../lib/supabase'
import { safeStorage } from '../lib/storage'
import { enqueueIntegrationSync, loadIntegrationFramework } from './integration-framework'

export interface CommunicationDraft {
  workspaceId: string
  leadId: string
  accountId: string | null
  channel: 'email' | 'whatsapp'
  recipient: string
  subject: string
  body: string
  idempotencyKey?: string
}

export interface UnifiedTimelineEntry {
  id: string
  leadId: string | null
  channel: CommunicationChannel
  direction: CommunicationDirection
  status: CommunicationStatus | 'completed' | 'pending'
  date: string
  title: string
  description: string
  detail: string
  source: 'communication' | 'activity' | 'call' | 'calendar'
}

const STORAGE_PREFIX = 'realtalent-v10042-communications:'
const storageKey = (workspaceId: string) => `${STORAGE_PREFIX}${workspaceId}`
const now = () => new Date().toISOString()

const readLocal = (workspaceId: string): CommunicationEvent[] => {
  const raw = safeStorage.getItem(storageKey(workspaceId))
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed as CommunicationEvent[] : []
  } catch { return [] }
}
const writeLocal = (workspaceId: string, events: CommunicationEvent[]) => safeStorage.setItem(storageKey(workspaceId), JSON.stringify(events.slice(0, 1000)))

const objectValue = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

export async function loadCommunicationEvents(workspaceId: string, leadId?: string | null): Promise<CommunicationEvent[]> {
  const client = getSupabaseClient()
  if (!client) return readLocal(workspaceId).filter((item) => !leadId || item.leadId === leadId)
  let query = (client as unknown as { from(name: string): any }).from('communication_events').select('*').eq('organization_id', workspaceId).order('occurred_at', { ascending: false }).limit(500)
  if (leadId) query = query.eq('lead_id', leadId)
  const { data, error } = await query
  if (error) return readLocal(workspaceId).filter((item) => !leadId || item.leadId === leadId)
  const events = (data ?? []).map((row: any): CommunicationEvent => ({
    id: row.id,
    workspaceId: row.organization_id,
    leadId: row.lead_id,
    accountId: row.account_id,
    threadId: row.thread_id,
    channel: row.channel,
    direction: row.direction,
    eventType: row.event_type,
    status: row.status,
    externalMessageId: row.external_message_id,
    senderAddress: row.sender_address || '',
    recipientAddresses: Array.isArray(row.recipient_addresses) ? row.recipient_addresses : [],
    subject: row.subject || '',
    bodyText: row.body_text || '',
    occurredAt: row.occurred_at,
    metadata: objectValue(row.metadata),
    createdAt: row.created_at,
  }))
  writeLocal(workspaceId, events)
  return events
}

export async function sendOfficialCommunication(input: CommunicationDraft): Promise<CommunicationEvent> {
  const client = getSupabaseClient()
  if (!client || !env.supabaseUrl) {
    const event: CommunicationEvent = {
      id: createUuid(), workspaceId: input.workspaceId, leadId: input.leadId, accountId: input.accountId, threadId: null,
      channel: input.channel, direction: 'outbound', eventType: input.channel === 'email' ? 'email' : 'message', status: 'queued',
      externalMessageId: null, senderAddress: 'modo-local', recipientAddresses: [input.recipient], subject: input.subject.trim(), bodyText: input.body.trim(),
      occurredAt: now(), metadata: { simulated: true, idempotencyKey: input.idempotencyKey || createUuid() }, createdAt: now(),
    }
    const current = readLocal(input.workspaceId)
    writeLocal(input.workspaceId, [event, ...current])
    return event
  }
  const { data: sessionData } = await client.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Sua sessão expirou. Entre novamente antes de enviar.')
  const response = await fetch(`${env.supabaseUrl.replace(/\/$/, '')}/functions/v1/official-communication-send`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      organizationId: input.workspaceId, leadId: input.leadId, accountId: input.accountId, channel: input.channel,
      recipient: input.recipient, subject: input.subject, body: input.body,
      idempotencyKey: input.idempotencyKey || `${input.channel}:${input.leadId}:${Date.now()}`,
    }),
  })
  const payload = await response.json().catch(() => ({})) as { event?: CommunicationEvent; error?: string }
  if (!response.ok || !payload.event) throw new Error(payload.error || 'Não foi possível colocar a comunicação na fila.')
  return payload.event
}

const activityTitle: Record<ActivityItem['type'], string> = {
  call: 'Ligação programada', followup: 'Follow-up', meeting: 'Reunião', note: 'Nota', stage_change: 'Mudança de etapa', email: 'E-mail', whatsapp: 'WhatsApp',
}

export function buildUnifiedTimeline(snapshot: WorkspaceSnapshot, communicationEvents: CommunicationEvent[], leadId?: string | null): UnifiedTimelineEntry[] {
  const allow = (candidate: string | null) => !leadId || candidate === leadId
  const activities = snapshot.activities.filter((item) => allow(item.leadId)).map((item): UnifiedTimelineEntry => ({
    id: `activity-${item.id}`, leadId: item.leadId, channel: item.type === 'email' ? 'email' : item.type === 'whatsapp' ? 'whatsapp' : item.type === 'meeting' ? 'meeting' : item.type === 'call' ? 'call' : 'note',
    direction: 'internal', status: item.completedAt ? 'completed' : 'pending', date: item.completedAt ?? item.dueAt ?? item.createdAt,
    title: activityTitle[item.type], description: item.title, detail: item.description || (item.completedAt ? 'Concluída' : 'Pendente'), source: 'activity',
  }))
  const calls = snapshot.calls.filter((item) => allow(item.leadId)).map((item): UnifiedTimelineEntry => ({
    id: `call-${item.id}`, leadId: item.leadId, channel: 'call', direction: 'outbound', status: 'completed', date: item.endedAt ?? item.startedAt,
    title: 'Ligação registrada', description: item.notes || 'Ligação registrada sem observações.', detail: `${Math.max(0, Math.round(item.durationSeconds / 60))} min · ${item.outcome.replaceAll('_', ' ')}`, source: 'call',
  }))
  const calendar = snapshot.events.filter((item) => allow(item.leadId)).map((item): UnifiedTimelineEntry => ({
    id: `calendar-${item.id}`, leadId: item.leadId, channel: 'calendar', direction: 'internal', status: item.status === 'cancelled' ? 'cancelled' : item.status === 'completed' ? 'completed' : 'pending', date: item.startsAt,
    title: item.title, description: item.description || item.location || 'Evento comercial', detail: `${item.status} · agenda`, source: 'calendar',
  }))
  const external = communicationEvents.filter((item) => allow(item.leadId)).map((item): UnifiedTimelineEntry => ({
    id: `communication-${item.id}`, leadId: item.leadId, channel: item.channel, direction: item.direction, status: item.status, date: item.occurredAt,
    title: item.subject || (item.channel === 'whatsapp' ? 'Mensagem no WhatsApp' : item.channel === 'email' ? 'E-mail' : 'Comunicação'),
    description: item.bodyText || 'Evento recebido do canal oficial.',
    detail: `${item.direction === 'inbound' ? 'Recebida' : item.direction === 'outbound' ? 'Enviada' : 'Interna'} · ${item.status}`,
    source: 'communication',
  }))
  return [...external, ...calls, ...calendar, ...activities].filter((item) => item.date).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export function leadForCommunication(leads: Lead[], event: CommunicationEvent) {
  return event.leadId ? leads.find((lead) => lead.id === event.leadId) ?? null : null
}

export const communicationChannelLabel: Record<CommunicationChannel, string> = {
  email: 'E-mail', whatsapp: 'WhatsApp', calendar: 'Calendário', call: 'Ligação', meeting: 'Reunião', note: 'Nota', system: 'Sistema',
}


export async function queueCalendarMutation(workspaceId: string, eventId: string, mutation: 'create' | 'update' | 'delete', event?: CalendarEvent | null) {
  const framework = await loadIntegrationFramework(workspaceId)
  const account = framework.accounts.find((item) => item.status === 'connected' && ['google', 'microsoft'].includes(item.provider))
  if (!account) return null
  let externalEventId: string | null = null
  const client = getSupabaseClient()
  if (client) {
    const { data } = await (client as unknown as { from(name: string): any }).from('calendar_external_links').select('external_event_id').eq('organization_id', workspaceId).eq('event_id', eventId).eq('account_id', account.id).maybeSingle()
    externalEventId = data?.external_event_id ?? null
  }
  return enqueueIntegrationSync(workspaceId, account, 'calendar_push', { eventId, mutation, event: event ?? null, externalEventId })
}
