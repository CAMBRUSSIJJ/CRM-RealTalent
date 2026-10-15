import { env } from '../lib/env'
import type { CommunicationEvent } from '../domain/types'
import type { ConnectedAccount, DiagnosticStatus, OAuthProvider } from './integration-framework'
import { isCloudRuntimeProxy, runtimeFetch } from './realtalent-runtime-transport'

export interface CommunicationsGatewayHealth {
  ok: boolean
  mode: 'local-gateway'
  version: string
  providers: { google: boolean; microsoft: boolean; whatsapp: boolean }
  syncIntervalMs: number
  realtime?: { transport: 'sse'; workspaces: number; subscribers: number; revision: number }
}

const base = () => {
  const configured = (env.communicationsGatewayUrl || '/__rt/communications').replace(/\/$/, '')
  try {
    const url = new URL(configured)
    if ((url.hostname === '127.0.0.1' || url.hostname === 'localhost') && url.port === '3002') return '/__rt/communications'
  } catch { /* relative proxy path */ }
  return configured || '/__rt/communications'
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export type CommunicationsRealtimeState = 'connecting' | 'live' | 'offline'
export interface CommunicationsRealtimeSignal { type: string; workspaceId: string; revision?: number; at?: string; reason?: string }

export function subscribeGatewayCommunicationsRealtime(
  workspaceId: string,
  handlers: { onSignal(signal: CommunicationsRealtimeSignal): void; onState?(state: CommunicationsRealtimeState): void },
) {
  if (typeof EventSource === 'undefined') {
    handlers.onState?.('offline')
    return () => {}
  }
  handlers.onState?.('connecting')
  if (isCloudRuntimeProxy(base())) {
    let closed = false
    let lastFingerprint = ''
    const poll = async () => {
      if (closed) return
      try {
        const response = await runtimeFetch(`${base()}/api/communications/events?workspaceId=${encodeURIComponent(workspaceId)}&limit=1`, { headers: { accept: 'application/json' } })
        const payload = await response.json().catch(() => ({})) as { events?: Array<{ id?: string; createdAt?: string; updatedAt?: string }> }
        if (!response.ok) throw new Error('poll_failed')
        const event = payload.events?.[0]
        const fingerprint = event ? `${event.id ?? ''}:${event.updatedAt ?? event.createdAt ?? ''}` : 'empty'
        if (lastFingerprint && fingerprint !== lastFingerprint) handlers.onSignal({ type: 'communications.changed', workspaceId, at: new Date().toISOString() })
        lastFingerprint = fingerprint
        handlers.onState?.('live')
      } catch { handlers.onState?.('connecting') }
    }
    void poll()
    const timer = window.setInterval(() => void poll(), 5000)
    return () => { closed = true; window.clearInterval(timer) }
  }
  const source = new EventSource(`${base()}/api/communications/stream?workspaceId=${encodeURIComponent(workspaceId)}`)
  let closed = false
  const parse = (event: MessageEvent, type: string) => {
    try {
      const payload = JSON.parse(String(event.data || '{}')) as Partial<CommunicationsRealtimeSignal>
      handlers.onSignal({ type, workspaceId, ...payload })
    } catch {
      handlers.onSignal({ type, workspaceId })
    }
  }
  source.addEventListener('realtime.ready', (event) => {
    handlers.onState?.('live')
    parse(event as MessageEvent, 'realtime.ready')
  })
  source.addEventListener('communications.changed', (event) => {
    handlers.onState?.('live')
    parse(event as MessageEvent, 'communications.changed')
  })
  source.onopen = () => handlers.onState?.('live')
  source.onerror = () => { if (!closed) handlers.onState?.('connecting') }
  return () => {
    closed = true
    source.close()
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = String(init?.method || 'GET').toUpperCase()
  const attempts = method === 'GET' ? 3 : 1
  let response: Response | null = null
  let networkError: unknown = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      response = await runtimeFetch(`${base()}${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      })
      break
    } catch (error) {
      networkError = error
      if (attempt < attempts) await wait(250 * attempt)
    }
  }
  if (!response) {
    void networkError
    throw new Error('Serviço local do WhatsApp indisponível. Use “Reiniciar serviço” em Configurações > WhatsApp > Diagnóstico ou tente novamente em alguns segundos.')
  }
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) throw new Error(String(payload.error || payload.message || `Falha HTTP ${response.status}`))
  return payload as T
}

export const loadCommunicationsGatewayHealth = () => request<CommunicationsGatewayHealth>('/api/communications/health')
export const loadGatewayAccounts = (workspaceId: string) => request<{ accounts: ConnectedAccount[] }>(`/api/integrations/accounts?workspaceId=${encodeURIComponent(workspaceId)}`).then((result) => result.accounts)
const currentReturnUrl = () => {
  const href = typeof globalThis.location?.href === 'string' ? globalThis.location.href : ''
  return href || 'http://127.0.0.1:4188/'
}

export const beginGatewayOAuth = (workspaceId: string, provider: OAuthProvider) => request<{ url: string | null; message: string; mode: 'oauth' | 'local-gateway' }>('/api/integrations/oauth/start', { method: 'POST', body: JSON.stringify({ workspaceId, provider, returnUrl: currentReturnUrl() }) })
export const testGatewayAccount = (workspaceId: string, accountId: string) => request<{ status: DiagnosticStatus; message: string; latencyMs: number }>('/api/integrations/test', { method: 'POST', body: JSON.stringify({ workspaceId, accountId }) })
export const gatewayAccountAction = (workspaceId: string, accountId: string, action: 'pause' | 'resume' | 'disconnect') => request<{ ok: boolean }>('/api/integrations/account-action', { method: 'POST', body: JSON.stringify({ workspaceId, accountId, action }) })
export const configureGatewayWhatsApp = (input: { workspaceId: string; accessToken: string; phoneNumberId: string; wabaId?: string; displayName?: string }) => request<{ account: ConnectedAccount; message: string }>('/api/integrations/whatsapp/connect', { method: 'POST', body: JSON.stringify(input) })
export interface GatewaySyncFailure { accountId: string; provider: string; message: string; transport?: string | null; displayName?: string; liveState?: string | null }
export const syncGatewayCommunications = (workspaceId: string, accountId?: string | null) => request<{ queued: string[]; triggered: string[]; accounts: number; imported: number; failures: GatewaySyncFailure[] }>('/api/communications/sync', { method: 'POST', body: JSON.stringify({ workspaceId, accountId: accountId || null }) })
export const markGatewayConversationRead = (workspaceId: string, threadId?: string | null, peerAddress?: string | null) => request<{ updated: number }>('/api/communications/read', { method: 'POST', body: JSON.stringify({ workspaceId, threadId: threadId || '', peerAddress: peerAddress || '' }) })
export const loadGatewayCommunicationEvents = (workspaceId: string, limit = 500) => request<{ events: CommunicationEvent[] }>(`/api/communications/events?workspaceId=${encodeURIComponent(workspaceId)}&limit=${limit}`).then((result) => result.events)
export interface GatewayWhatsAppAttachmentInput {
  dataBase64: string
  mimeType: string
  fileName: string
  size: number
  kind: 'image' | 'video' | 'audio' | 'voice' | 'document' | 'sticker'
}
export const sendGatewayCommunication = (input: { workspaceId: string; leadId?: string | null; contactId?: string | null; accountId: string; channel: 'email' | 'whatsapp'; recipient?: string; threadId?: string | null; subject?: string; body: string; idempotencyKey?: string; attachment?: GatewayWhatsAppAttachmentInput | null; replyToExternalMessageId?: string | null; replyPreview?: string | null }) => request<{ event: CommunicationEvent }>('/api/communications/send', { method: 'POST', body: JSON.stringify(input) }).then((result) => result.event)
export const retryGatewayCommunication = (workspaceId: string, eventId: string) => request<{ event: CommunicationEvent }>('/api/communications/retry', { method: 'POST', body: JSON.stringify({ workspaceId, eventId }) }).then((result) => result.event)

export interface WhatsAppGroupCreateResult {
  ok: boolean
  groupId: string
  title: string
  participants: Record<string, { statusCode: number; message: string; isGroupCreator?: boolean; isInviteV4Sent?: boolean }>
  event?: CommunicationEvent
}
export const createGatewayWhatsAppGroup = (input: { workspaceId: string; title: string; participants: string[] }) => request<WhatsAppGroupCreateResult>('/api/integrations/whatsapp/qr/groups', { method: 'POST', body: JSON.stringify(input) })

export interface GatewayWhatsAppContact {
  phone: string
  name: string
  pushName: string
  isMyContact: boolean
  isBusiness: boolean
  isBlocked: boolean
}
export const loadGatewayWhatsAppContacts = (workspaceId: string) => request<{ contacts: GatewayWhatsAppContact[] }>(`/api/integrations/whatsapp/qr/contacts?workspaceId=${encodeURIComponent(workspaceId)}`).then((result) => result.contacts)

export interface GatewayWhatsAppGroupInfo {
  id: string
  name: string
  description: string
  participantCount: number
  participants: Array<{ id: string; phone: string; isAdmin: boolean; isSuperAdmin: boolean }>
}
export const loadGatewayWhatsAppGroupInfo = (workspaceId: string, groupId: string) => request<GatewayWhatsAppGroupInfo>(`/api/integrations/whatsapp/qr/groups/info?workspaceId=${encodeURIComponent(workspaceId)}&groupId=${encodeURIComponent(groupId)}`)



export interface WhatsAppQrStatus {
  state: 'idle' | 'starting' | 'qr' | 'connected' | 'disconnected' | 'logged_out'
  qrDataUrl: string | null
  phone: string
  displayName: string
  lastError: string | null
  updatedAt: string
  engine?: 'whatsapp-web-js' | 'baileys'
  lastHistorySyncAt?: string | null
  lastHistoryImportCount?: number
  syncingHistory?: boolean
}
export const startGatewayWhatsAppQr = (workspaceId: string, displayName = 'WhatsApp QR Local') => request<WhatsAppQrStatus>('/api/integrations/whatsapp/qr/start', { method: 'POST', body: JSON.stringify({ workspaceId, displayName }) })
export const loadGatewayWhatsAppQrStatus = (workspaceId: string) => request<WhatsAppQrStatus>(`/api/integrations/whatsapp/qr/status?workspaceId=${encodeURIComponent(workspaceId)}`)
export const disconnectGatewayWhatsAppQr = (workspaceId: string) => request<{ ok: boolean }>('/api/integrations/whatsapp/qr/disconnect', { method: 'POST', body: JSON.stringify({ workspaceId }) })
