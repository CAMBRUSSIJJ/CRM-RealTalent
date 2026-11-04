import { env } from '../lib/env'
import type { CommunicationEvent } from '../domain/types'
import type { ConnectedAccount, DiagnosticStatus, OAuthProvider } from './integration-framework'
import {describeLocalServiceError} from '../lib/integration-availability-s34'
import { isCloudRuntimeProxy, runtimeFetch } from './realtalent-runtime-transport'
import { gatewayAuthFailure, gatewayPollRetryDelayMs } from './communications-retry-policy'

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

// Upstream gateway errors are not the same as Vite's proxy being unreachable.
// Keep the error returned by the local service instead of misdiagnosing all
// HTTP 502 responses as a disconnected gateway.
export function describeGatewayResponseError(status: number, payload: Record<string, unknown>): string {
  if (payload.error === 'runtime_upstream_auth_rejected') {
    return 'Autenticação Vercel ↔ Railway rejeitada para o gateway de comunicação. Verifique as credenciais internas nos dois ambientes.'
  }
  const error = typeof payload.error === 'string' ? payload.error.trim() : ''
  const message = typeof payload.message === 'string' ? payload.message.trim() : ''
  const upstream = (error && !['Bad Gateway', 'bad_gateway', 'proxy_error', 'ECONNREFUSED', 'ECONNRESET'].includes(error))
    ? error : (message || '')
  if ((status === 502 || status === 503) && upstream) {
    return `Falha no serviço de Comunicação (HTTP ${status}): ${upstream.slice(0, 350)}`
  }
  if (status === 502 || status === 503) return describeLocalServiceError(status, 'gateway')
  return upstream || `Falha HTTP ${status}`
}

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
    let nextAttemptAt = 0
    let failureCount = 0
    let inFlight = false
    const poll = async () => {
      if (closed || inFlight || Date.now() < nextAttemptAt) return
      inFlight = true
      try {
        // Vercel cannot keep the Railway SSE stream open reliably. Poll a
        // compact tenant-wide revision instead of inspecting only the newest
        // event: ACK/read changes and older chats must wake the inbox too.
        const response = await runtimeFetch(`${base()}/api/communications/revision?workspaceId=${encodeURIComponent(workspaceId)}`, { headers: { accept: 'application/json' } })
        const payload = await response.json().catch(() => ({})) as { revision?: string; count?: number; error?: string }
        if (!response.ok) {
          // 401 do proxy exige nova sessão; 502 runtime_upstream_auth_rejected
          // exige corrigir as credenciais entre serviços, não repetir a cada 5 s.
          const authFailure = gatewayAuthFailure(response.status, payload.error)
          failureCount += 1
          nextAttemptAt = Date.now() + gatewayPollRetryDelayMs(response.status, payload.error, failureCount)
          if (!closed) handlers.onState?.(authFailure ? 'offline' : 'connecting')
          return
        }
        const fingerprint = String(payload.revision || '')
        if (!fingerprint) throw new Error('Gateway não retornou a revisão do histórico.')
        if (lastFingerprint && fingerprint !== lastFingerprint && !closed) handlers.onSignal({ type: 'communications.changed', workspaceId, at: new Date().toISOString() })
        lastFingerprint = fingerprint
        failureCount = 0
        nextAttemptAt = 0
        if (!closed) handlers.onState?.('live')
      } catch {
        failureCount += 1
        nextAttemptAt = Date.now() + gatewayPollRetryDelayMs(0, undefined, failureCount)
        if (!closed) handlers.onState?.('connecting')
      } finally { inFlight = false }
    }
    void poll()
    const onVisible = () => { if (document.visibilityState === 'visible') void poll() }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void poll() }, 3000)
    return () => { closed = true; window.clearInterval(timer); window.removeEventListener('focus', onVisible); document.removeEventListener('visibilitychange', onVisible) }
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
  if (!response.ok) {
    throw new Error(describeGatewayResponseError(response.status, payload))
  }
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
export type WhatsAppMediaRecoveryResult = {
  ok: boolean
  state: 'ready' | 'not_found' | 'invalid_request' | 'not_available' | 'download_failed' | 'unsupported'
  message?: string
  attachment?: { id: string; url: string; fileName: string; mimeType: string; kind: string; size: number }
}

// The request only reads the already-received WhatsApp message. It NEVER sends
// or retries messages; historical media is persisted on the gateway on success.
export const recoverGatewayWhatsAppMedia = (workspaceId: string, eventId: string) =>
  request<WhatsAppMediaRecoveryResult>('/api/communications/media/resolve', {
    method: 'POST',
    body: JSON.stringify({ workspaceId, eventId }),
  })

export interface GatewayWhatsAppAttachmentInput {
  dataBase64: string
  mimeType: string
  fileName: string
  size: number
  kind: 'image' | 'video' | 'audio' | 'voice' | 'document' | 'sticker'
}

export const normalizeAgentCommunicationIdempotencyKey = (value?: string) => {
  const key = String(value || '').trim()
  if (!key) return undefined
  if (!/^agent-(?:whatsapp|email):/.test(key)) return key
  return key.replace(/:\d{10,}$/, '')
}

export const sendGatewayCommunication = (input: { workspaceId: string; leadId?: string | null; contactId?: string | null; accountId: string; channel: 'email' | 'whatsapp'; recipient?: string; threadId?: string | null; subject?: string; body: string; idempotencyKey?: string; attachment?: GatewayWhatsAppAttachmentInput | null; replyToExternalMessageId?: string | null; replyPreview?: string | null }) => {
  const payload = { ...input, idempotencyKey: normalizeAgentCommunicationIdempotencyKey(input.idempotencyKey) }
  return request<{ event: CommunicationEvent }>('/api/communications/send', { method: 'POST', body: JSON.stringify(payload) }).then((result) => result.event)
}
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
  /** Account ID bound to the current live QR session (no authorization token). */
  accountId?: string | null
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

export interface LocalTaskAutoMember {
  workspaceId: string
  userId: string
  phone: string
  consentAt: string | null
  autoEnabledAt: string | null
  /** Background reconciliation may not turn automation on or undo revocation. */
  reconcileOnly?: boolean
}
export interface LocalTaskAutoJob {
  id: string
  taskId: string
  eventType: 'assigned' | 'due_soon' | 'requested'
  at: string
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'unknown' | 'cancelled' | 'blocked' | 'expired'
  error: string | null
}
export const syncGatewayLocalTaskAutoMember = (member: LocalTaskAutoMember) =>
  request<{ ok:boolean; active:boolean; needsExplicitSave?:boolean }>('/api/task-reminders/member',{ method:'POST',body:JSON.stringify(member) })
export const scheduleGatewayLocalTaskAuto = (input: {
  workspaceId:string
  task: import('../domain/types').WorkTask
  member: LocalTaskAutoMember | null
  assignmentChanged:boolean
  assignmentAt?:string
  rearmCancelled?:boolean
}) => request<{ ok:boolean; scheduled:number; automaticEnabled:boolean; assignmentScheduled:boolean; dueChannelEnabled:boolean; reason:string }>('/api/task-reminders/schedule',{
  method:'POST',body:JSON.stringify(input),
})
export const cancelGatewayLocalTaskAuto = (workspaceId:string,taskId:string) =>
  request<{ ok:boolean;cancelled:boolean;pendingCancelled:number;inFlight:boolean }>('/api/task-reminders/cancel',{ method:'POST',body:JSON.stringify({workspaceId,taskId}) })
export interface LocalTaskAutoDiagnostic {
  taskId:string
  code:string
  state:'attention'|'inactive'|'scheduled'|'history'|'none'
  reason:string
  canRequest:boolean
  scheduled?:number
  latestStatus?:LocalTaskAutoJob['status'] | null
  nextAt?:string | null
}
export interface LocalTaskAutoHistory {
  ok:boolean
  jobs:LocalTaskAutoJob[]
  diagnostics:LocalTaskAutoDiagnostic[]
  counts: Record<LocalTaskAutoJob['status'],number>
  total:number
  lastActivityAt:string | null
}
export const loadGatewayLocalTaskAutoHistory = (workspaceId:string,taskId = '') =>
  request<LocalTaskAutoHistory>('/api/task-reminders/status?workspaceId='+encodeURIComponent(workspaceId)+'&taskId='+encodeURIComponent(taskId))
export const loadGatewayLocalTaskMemberStatus = (workspaceId:string,userId:string) =>
  request<{ok:boolean;present:boolean;active:boolean;consentRecorded:boolean;phoneConfigured:boolean;updatedAt:string|null}>(
    '/api/task-reminders/member-status?workspaceId='+encodeURIComponent(workspaceId)+'&userId='+encodeURIComponent(userId),
  )
export const reconcileGatewayLocalTaskWorkspace = (workspaceId:string,taskIds:string[]) =>
  request<{ok:boolean;cancelled:number;tracked:number}>('/api/task-reminders/reconcile',{
    method:'POST',body:JSON.stringify({workspaceId,taskIds}),
  })

/** The gateway is the source of truth for notification eligibility and state. */
export const diagnoseGatewayLocalTaskNotification = (workspaceId:string,taskId:string) =>
  request<LocalTaskAutoDiagnostic & { ok:boolean }>(
    '/api/task-reminders/diagnose?workspaceId='+encodeURIComponent(workspaceId)+'&taskId='+encodeURIComponent(taskId),
  )
/** Explicit one-time operator action. No automatic retry after uncertain delivery. */
export const requestGatewayLocalTaskNotice = (workspaceId:string,taskId:string) =>
  request<{ok:boolean;scheduled:number;jobId:string}>('/api/task-reminders/request',{
    method:'POST',body:JSON.stringify({workspaceId,taskId}),
  })
