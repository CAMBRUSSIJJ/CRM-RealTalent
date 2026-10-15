import type { CommunicationChannel, CommunicationDirection, CommunicationEvent, CommunicationStatus, Lead, WorkspaceSnapshot } from '../domain/types'
import { createUuid } from '../lib/id'
import { getSupabaseClient } from '../lib/supabase'
import { loadGatewayCommunicationEvents, markGatewayConversationRead, sendGatewayCommunication, syncGatewayCommunications, type GatewaySyncFailure } from './local-communications-gateway'
import { safeStorage } from '../lib/storage'
import { loadIntegrationFramework, type ConnectedAccount } from './integration-framework'

export type UnifiedCommunicationSource = 'activity' | 'call' | 'calendar' | 'official' | 'assisted'
export interface UnifiedCommunicationItem {
  id: string
  source: UnifiedCommunicationSource
  leadId: string | null
  contactId: string | null
  channel: CommunicationChannel
  direction: CommunicationDirection
  status: CommunicationStatus
  title: string
  body: string
  subject: string
  occurredAt: string
  official: boolean
  metadata: Record<string, unknown>
}

export type PreferredCommunicationChannel = 'whatsapp' | 'email' | 'instagram' | 'facebook' | 'linkedin' | 'call' | 'meeting' | 'auto'
export type SocialCommunicationChannel = 'instagram' | 'facebook' | 'linkedin'
export type ConversationStatus = 'needs_reply' | 'waiting_reply' | 'internal' | 'idle'

export interface CommunicationConversation {
  key: string
  leadId: string | null
  contactId: string | null
  channel: CommunicationChannel
  title: string
  preview: string
  lastOccurredAt: string
  latestDirection: CommunicationDirection
  latestStatus: CommunicationStatus
  official: boolean
  unreadCount: number
  status: ConversationStatus
  events: UnifiedCommunicationItem[]
  externalThreadId?: string | null
  externalAddress?: string | null
  externalDisplayName?: string | null
  isGroup?: boolean
}

export interface AssistedCommunicationInput {
  workspaceId: string
  leadId: string
  contactId?: string | null
  channel: SocialCommunicationChannel
  direction?: Extract<CommunicationDirection, 'inbound' | 'outbound'>
  body?: string
  title?: string
  action?: 'profile_opened' | 'message_sent' | 'message_received' | 'note'
  occurredAt?: string
}

const PREFERENCE_PREFIX = 'realtalent-v10086-preferred-channel:'
const ASSISTED_PREFIX = 'realtalent-v10094-assisted-communications:'
const preferenceKey = (workspaceId: string) => `${PREFERENCE_PREFIX}${workspaceId}`
const assistedKey = (workspaceId: string) => `${ASSISTED_PREFIX}${workspaceId}`
const supportedPreferences: PreferredCommunicationChannel[] = ['auto', 'whatsapp', 'email', 'instagram', 'facebook', 'linkedin', 'call', 'meeting']

export const loadPreferredChannels = (workspaceId: string): Record<string, PreferredCommunicationChannel> => {
  try {
    const parsed = JSON.parse(safeStorage.getItem(preferenceKey(workspaceId)) ?? '{}') as Record<string, unknown>
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => supportedPreferences.includes(String(value) as PreferredCommunicationChannel))) as Record<string, PreferredCommunicationChannel>
  } catch { return {} }
}

export const savePreferredChannel = (workspaceId: string, entityKey: string, channel: PreferredCommunicationChannel) => {
  const current = loadPreferredChannels(workspaceId)
  if (channel === 'auto') delete current[entityKey]
  else current[entityKey] = channel
  safeStorage.setItem(preferenceKey(workspaceId), JSON.stringify(current))
}

const activityChannel = (type: string): CommunicationChannel => {
  if (type === 'email') return 'email'
  if (type === 'whatsapp') return 'whatsapp'
  if (type === 'call') return 'call'
  if (type === 'meeting') return 'meeting'
  if (type === 'note') return 'note'
  return 'system'
}

export const buildLocalCommunicationTimeline = (snapshot: WorkspaceSnapshot): UnifiedCommunicationItem[] => {
  const callIds = new Set(snapshot.calls.map((item) => item.id))
  const eventIds = new Set(snapshot.events.map((item) => item.id))
  const activityItems: UnifiedCommunicationItem[] = snapshot.activities
    .filter((item) => ['call', 'email', 'whatsapp', 'meeting', 'note'].includes(item.type))
    .filter((item) => !(item.sourceType === 'call' && item.sourceId && callIds.has(item.sourceId)))
    .filter((item) => !(item.sourceType === 'calendar' && item.sourceId && eventIds.has(item.sourceId)))
    .map((item) => ({
      id: `activity:${item.id}`, source: 'activity', leadId: item.leadId, contactId: item.contactId ?? null,
      channel: activityChannel(item.type), direction: item.type === 'note' ? 'internal' : 'outbound', status: item.completedAt ? 'sent' : 'queued',
      title: item.title || 'Atividade comercial', body: item.description || '', subject: '', occurredAt: item.completedAt || item.dueAt || item.createdAt,
      official: false, metadata: { sourceType: item.sourceType, sourceId: item.sourceId, resolutionStatus: item.resolutionStatus },
    }))
  const calls: UnifiedCommunicationItem[] = snapshot.calls.map((item) => ({
    id: `call:${item.id}`, source: 'call', leadId: item.leadId, contactId: item.contactId ?? null, channel: 'call', direction: 'outbound',
    status: item.endedAt ? 'sent' : 'queued', title: `Ligação · ${item.outcome.replaceAll('_', ' ')}`, body: item.notes || item.transcript || '', subject: '',
    occurredAt: item.endedAt || item.startedAt || item.createdAt, official: false, metadata: { durationSeconds: item.durationSeconds, outcome: item.outcome },
  }))
  const meetings: UnifiedCommunicationItem[] = snapshot.events.map((item) => ({
    id: `calendar:${item.id}`, source: 'calendar', leadId: item.leadId, contactId: null, channel: 'meeting', direction: 'internal',
    status: item.status === 'cancelled' ? 'cancelled' : item.status === 'completed' ? 'sent' : 'queued', title: item.title, body: item.description || '', subject: item.title,
    occurredAt: item.startsAt, official: false, metadata: { status: item.status, endsAt: item.endsAt, location: item.location },
  }))
  return [...activityItems, ...calls, ...meetings].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
}

const normalizeAssistedItem = (item: Partial<UnifiedCommunicationItem>): UnifiedCommunicationItem | null => {
  if (!item.id || !item.leadId || !item.channel || !['instagram', 'facebook', 'linkedin'].includes(String(item.channel))) return null
  return {
    id: item.id,
    source: 'assisted',
    leadId: item.leadId,
    contactId: item.contactId ?? null,
    channel: item.channel,
    direction: item.direction === 'inbound' ? 'inbound' : 'outbound',
    status: item.status ?? (item.direction === 'inbound' ? 'received' : 'sent'),
    title: item.title || channelLabel(item.channel),
    body: item.body || '',
    subject: item.subject || '',
    occurredAt: item.occurredAt || new Date().toISOString(),
    official: false,
    metadata: item.metadata && typeof item.metadata === 'object' ? item.metadata : {},
  }
}

export const loadAssistedCommunicationTimeline = (workspaceId: string): UnifiedCommunicationItem[] => {
  try {
    const parsed = JSON.parse(safeStorage.getItem(assistedKey(workspaceId)) ?? '[]') as Array<Partial<UnifiedCommunicationItem>>
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeAssistedItem).filter((item): item is UnifiedCommunicationItem => Boolean(item)).sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
  } catch { return [] }
}

export const recordAssistedCommunication = (input: AssistedCommunicationInput): UnifiedCommunicationItem => {
  const occurredAt = input.occurredAt ?? new Date().toISOString()
  const direction = input.direction ?? 'outbound'
  const action = input.action ?? (direction === 'inbound' ? 'message_received' : 'message_sent')
  const actionLabel = action === 'profile_opened' ? 'Perfil aberto' : action === 'message_received' ? 'Mensagem recebida' : action === 'note' ? 'Nota de interação' : 'Mensagem enviada'
  const item: UnifiedCommunicationItem = {
    id: `assisted:${createUuid()}`,
    source: 'assisted',
    leadId: input.leadId,
    contactId: input.contactId ?? null,
    channel: input.channel,
    direction,
    status: direction === 'inbound' ? 'received' : 'sent',
    title: input.title?.trim() || `${channelLabel(input.channel)} · ${actionLabel}`,
    body: input.body?.trim() || '',
    subject: '',
    occurredAt,
    official: false,
    metadata: { action, assisted: true },
  }
  const current = loadAssistedCommunicationTimeline(input.workspaceId)
  safeStorage.setItem(assistedKey(input.workspaceId), JSON.stringify([item, ...current].slice(0, 1000)))
  return item
}

const communicationTitle = (channel: CommunicationChannel) => channelLabel(channel)
const whatsappTechnicalTypes = new Set(['e2e_notification','notification_template','protocol','ciphertext','history_sync_notification','notification','gp2','groups_v4_invite'])
const isEncodedWhatsAppBody = (value: unknown) => {
  const text = String(value || '').trim()
  if (!text) return false
  if (/^data:[^;]{1,120};base64,/i.test(text)) return true
  return text.length >= 512 && !/\s/.test(text.slice(0, 512)) && /^[A-Za-z0-9+/=_-]+$/.test(text.slice(0, Math.min(text.length, 4096)))
}
const isTechnicalWhatsAppItem = (item: UnifiedCommunicationItem) => item.channel === 'whatsapp' && whatsappTechnicalTypes.has(String(item.metadata?.messageType || item.metadata?.type || '').toLowerCase())
const mapCommunicationEvent = (row: Record<string, unknown>): UnifiedCommunicationItem => {
  const channel = String(row.channel || 'system') as CommunicationChannel
  return {
    id: `official:${String(row.id)}`, source: 'official', leadId: row.lead_id ? String(row.lead_id) : null, contactId: row.contact_id ? String(row.contact_id) : null,
    channel, direction: String(row.direction || 'outbound') as CommunicationDirection,
    status: String(row.status || 'sent') as CommunicationStatus, title: String(row.subject || communicationTitle(channel)),
    subject: String(row.subject || ''), body: String(row.body_text || ''), occurredAt: String(row.occurred_at || row.created_at || new Date().toISOString()),
    official: !(row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) && (row.metadata as Record<string, unknown>).unofficial === true),
    metadata: {
      ...(row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {}),
      senderAddress: String(row.sender_address || ''), recipientAddresses: Array.isArray(row.recipient_addresses) ? row.recipient_addresses : [],
      accountId: row.account_id ? String(row.account_id) : null, threadId: row.thread_id ? String(row.thread_id) : null, externalMessageId: row.external_message_id ? String(row.external_message_id) : null,
    },
  }
}

const mapGatewayCommunicationEvent = (row: CommunicationEvent): UnifiedCommunicationItem => {
  // Historical H9 marker: official: row.metadata?.unofficial !== true
  const metadata = { ...(row.metadata || {}), senderAddress: row.senderAddress, recipientAddresses: row.recipientAddresses, accountId: row.accountId, threadId: row.threadId, externalMessageId: row.externalMessageId || null, eventId: row.id, replyToExternalMessageId: row.replyToExternalMessageId || null, hasAttachments: row.hasAttachments } as Record<string, unknown>
  const importedQrHistory = row.channel === 'whatsapp' && metadata.transport === 'qr' && (metadata.importedHistory === true || String(metadata.historySource || '').includes('history_sync'))
  if (row.direction === 'inbound' && importedQrHistory && !metadata.crmReadAt) metadata.crmReadAt = row.occurredAt || row.createdAt || new Date().toISOString()
  return {
    id: `official:${row.id}`, source: 'official', leadId: row.leadId ?? null, contactId: row.contactId ?? null,
    channel: row.channel, direction: row.direction, status: row.status,
    title: String(metadata.chatName || row.subject || communicationTitle(row.channel)), subject: row.subject || '', body: row.channel === 'whatsapp' && isEncodedWhatsAppBody(row.bodyText) ? '' : (row.bodyText || ''),
    occurredAt: row.occurredAt || row.createdAt || new Date().toISOString(), official: metadata.unofficial !== true,
    metadata,
  }
}

export async function loadOfficialCommunicationTimeline(workspaceId: string, limit = 3000): Promise<UnifiedCommunicationItem[]> {
  const client = getSupabaseClient() as any
  if (!client) return (await loadGatewayCommunicationEvents(workspaceId, limit)).map(mapGatewayCommunicationEvent).filter((item) => !isTechnicalWhatsAppItem(item))
  const { data, error } = await client.from('communication_events').select('id,lead_id,contact_id,account_id,thread_id,channel,direction,status,external_message_id,subject,body_text,sender_address,recipient_addresses,occurred_at,created_at,metadata').eq('organization_id', workspaceId).order('occurred_at', { ascending: false }).limit(limit)
  if (error) throw new Error(`Não foi possível carregar o histórico oficial: ${error.message}`)
  return (Array.isArray(data) ? data : []).map((row: Record<string, unknown>) => mapCommunicationEvent(row)).filter((item) => !isTechnicalWhatsAppItem(item))
}

export const mergeCommunicationTimeline = (...groups: UnifiedCommunicationItem[][]) => {
  const seen = new Set<string>()
  return groups.flat().filter((item) => {
    const externalMessageId = String(item.metadata?.externalMessageId || '').trim()
    const accountId = String(item.metadata?.accountId || '').trim()
    const fingerprint = item.source === 'official' && externalMessageId
      ? `official-external:${accountId}:${externalMessageId}`
      : item.source === 'official' || item.source === 'assisted' ? item.id : `${item.leadId}:${item.channel}:${item.title}:${item.occurredAt.slice(0, 16)}`
    if (seen.has(fingerprint)) return false
    seen.add(fingerprint); return true
  }).sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
}

const normalizeWhatsAppPhone = (value: unknown) => {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.length >= 8 && digits.length <= 15 ? digits : ''
}
const safeWhatsAppDisplayName = (value: unknown) => {
  const text = String(value || '').trim()
  if (!text || /^\+?\d{8,}$/.test(text)) return ''
  if (['whatsapp', 'whatsapp qr local', 'contato', 'conversa do whatsapp'].includes(text.toLocaleLowerCase('pt-BR'))) return ''
  return text
}

const isUnreadInbound = (event: UnifiedCommunicationItem) => event.direction === 'inbound' && event.status !== 'read' && !event.metadata?.crmReadAt

const conversationStatus = (event: UnifiedCommunicationItem): ConversationStatus => {
  if (isUnreadInbound(event)) return 'needs_reply'
  if (event.direction === 'outbound') return 'waiting_reply'
  if (event.direction === 'internal') return 'internal'
  return 'idle'
}

export const buildCommunicationConversations = (timeline: UnifiedCommunicationItem[]): CommunicationConversation[] => {
  const grouped = new Map<string, UnifiedCommunicationItem[]>()
  for (const item of timeline) {
    if (isTechnicalWhatsAppItem(item)) continue
    const threadId = String(item.metadata?.threadId || '').trim()
    const peerAddress = normalizeWhatsAppPhone(item.metadata?.peerAddress)
    const senderPhone = normalizeWhatsAppPhone(item.metadata?.senderAddress)
    const isGroup = Boolean(item.metadata?.isGroup)
    // Conversas 1:1 podem alternar entre @lid e @c.us no WhatsApp Web.
    // Só números E.164 plausíveis viram identidade telefônica; LIDs longos permanecem como thread técnica.
    const whatsappIdentity = isGroup
      ? (threadId || peerAddress || item.leadId || item.contactId || senderPhone || 'unlinked')
      : (peerAddress || threadId || item.leadId || item.contactId || senderPhone || 'unlinked')
    const identity = item.channel === 'whatsapp'
      ? whatsappIdentity
      : (item.leadId ?? item.contactId ?? 'unlinked')
    const key = `${identity}:${item.channel}`
    const values = grouped.get(key) ?? []
    values.push(item)
    grouped.set(key, values)
  }
  return [...grouped.entries()].map(([key, events]) => {
    const ordered = [...events].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    const latest = ordered[0]
    const externalThreadId = String(latest.metadata?.threadId || '') || null
    const externalAddress = normalizeWhatsAppPhone(latest.metadata?.peerAddress || latest.metadata?.senderAddress) || null
    const resolvedDisplayName = ordered.map((item) => safeWhatsAppDisplayName(item.metadata?.chatName)).find(Boolean) || ''
    const externalDisplayName = resolvedDisplayName || (Boolean(latest.metadata?.isGroup) ? 'Grupo do WhatsApp' : externalAddress ? `+${externalAddress}` : latest.channel === 'whatsapp' ? 'WhatsApp · identidade pendente' : null)
    return {
      key,
      leadId: latest.leadId,
      contactId: latest.contactId,
      channel: latest.channel,
      title: externalDisplayName || latest.title || channelLabel(latest.channel),
      preview: latest.body || latest.subject || latest.title || channelLabel(latest.channel),
      lastOccurredAt: latest.occurredAt,
      latestDirection: latest.direction,
      latestStatus: latest.status,
      official: ordered.some((item) => item.official),
      unreadCount: ordered.filter(isUnreadInbound).length,
      status: conversationStatus(latest),
      events: ordered,
      externalThreadId,
      externalAddress,
      externalDisplayName,
      isGroup: Boolean(latest.metadata?.isGroup),
    }
  }).sort((a, b) => Date.parse(b.lastOccurredAt) - Date.parse(a.lastOccurredAt))
}

export async function loadCommunicationChannelState(workspaceId: string) {
  const state = await loadIntegrationFramework(workspaceId)
  const live = state.accounts.filter((item) => item.status === 'connected' && item.connectionMode === 'live')
  const emailAccounts = live.filter((item) => (item.provider === 'google' || item.provider === 'microsoft') && item.capabilities.email_send)
  const mailSyncAccounts = live.filter((item) => (item.provider === 'google' || item.provider === 'microsoft') && (item.capabilities.email_read || item.capabilities.mail_sync))
  const whatsappAccounts = state.accounts.filter((item) => item.connectionMode === 'live' && item.provider === 'whatsapp_cloud' && item.capabilities.messages && (item.status === 'connected' || (item.status === 'attention' && item.metadata?.transport === 'qr')))
  const calendarAccounts = live.filter((item) => (item.provider === 'google' || item.provider === 'microsoft') && item.capabilities.calendar_write)
  const metaAccounts = live.filter((item) => item.provider === 'meta')
  const instagramAccounts = metaAccounts.filter((item) => item.capabilities.instagram_messages)
  const facebookAccounts = metaAccounts.filter((item) => item.capabilities.facebook_messages)
  const leadAdsAccounts = metaAccounts.filter((item) => item.capabilities.lead_ads)
  return { accounts: live, emailAccounts, mailSyncAccounts, whatsappAccounts, calendarAccounts, metaAccounts, instagramAccounts, facebookAccounts, leadAdsAccounts }
}

export async function sendOfficialEmail(input: { workspaceId: string; leadId: string; contactId?: string | null; accountId?: string | null; recipient: string; subject: string; body: string; idempotencyKey?: string }): Promise<CommunicationEvent> {
  const client = getSupabaseClient()
  if (!client) {
    if (!input.accountId) throw new Error('Selecione uma conta de e-mail conectada.')
    return sendGatewayCommunication({ workspaceId: input.workspaceId, leadId: input.leadId, contactId: input.contactId ?? null, accountId: input.accountId, channel: 'email', recipient: input.recipient, subject: input.subject, body: input.body, idempotencyKey: input.idempotencyKey ?? `crm-email:${input.leadId}:${Date.now()}` })
  }
  const { data, error } = await client.functions.invoke('official-communication-send', { body: { organizationId: input.workspaceId, leadId: input.leadId, contactId: input.contactId ?? null, accountId: input.accountId || null, channel: 'email', recipient: input.recipient, subject: input.subject, body: input.body, idempotencyKey: input.idempotencyKey ?? `crm-email:${input.leadId}:${Date.now()}` } })
  if (error) throw new Error(error.message)
  const payload = data as { event?: CommunicationEvent; error?: string } | null
  if (!payload?.event) throw new Error(payload?.error ?? 'O backend não retornou o evento de e-mail.')
  return payload.event
}


export async function syncOfficialCommunications(workspaceId: string): Promise<{ queued: string[]; triggered: string[]; accounts: number; imported: number; failures: GatewaySyncFailure[] }> {
  const client = getSupabaseClient()
  if (!client) { const result = await syncGatewayCommunications(workspaceId); return { queued: result.queued, triggered: result.triggered, accounts: result.accounts, imported: result.imported, failures: result.failures ?? [] } }
  const { data, error } = await client.functions.invoke('communication-sync-now', { body: { organizationId: workspaceId } })
  if (error) throw new Error(error.message)
  const payload = data as { queued?: string[]; triggered?: string[]; accounts?: number; error?: string } | null
  if (payload?.error) throw new Error(payload.error)
  return { queued: payload?.queued ?? [], triggered: payload?.triggered ?? [], accounts: Number(payload?.accounts ?? 0), imported: 0, failures: [] }
}

export async function markCommunicationConversationRead(workspaceId: string, conversation: Pick<CommunicationConversation, 'externalThreadId' | 'externalAddress'>): Promise<number> {
  if (getSupabaseClient()) return 0
  const result = await markGatewayConversationRead(workspaceId, conversation.externalThreadId, conversation.externalAddress)
  return result.updated
}

export const preferredChannelEntityKey = (lead: Pick<Lead, 'id'>, contactId?: string | null) => contactId ? `contact:${contactId}` : `lead:${lead.id}`
export const channelLabel = (channel: CommunicationChannel | PreferredCommunicationChannel) => ({ email: 'E-mail', whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook', linkedin: 'LinkedIn', call: 'Ligação', meeting: 'Reunião', calendar: 'Agenda', note: 'Nota', system: 'Sistema', auto: 'Automático' }[channel] ?? channel)
export const connectedAccountLabel = (account: ConnectedAccount) => `${account.displayName || account.externalAccountId} · ${account.provider === 'google' ? 'Google' : account.provider === 'microsoft' ? 'Microsoft' : account.provider === 'meta' ? 'Meta' : account.provider === 'whatsapp_cloud' ? (account.metadata?.transport === 'qr' ? 'WhatsApp QR' : 'WhatsApp Cloud') : account.provider}`
