import type { VoiceCallRuntime, VoiceCallState, VoiceEvent, VoiceProviderId, VoiceTransportState } from './voice-dialer'

export const CALL_RUNTIME_SCHEMA = 'realtalent.call.runtime.v1014' as const

export interface CallRuntimeAttempt {
  schema: typeof CALL_RUNTIME_SCHEMA
  attemptId: string
  workspaceId: string
  leadId: string
  contactId: string | null
  providerId: VoiceProviderId
  deviceId: string | null
  phone: string
  externalCallId: string | null
  state: VoiceCallState
  transport: VoiceTransportState
  startedAt: string
  connectedAt: string | null
  endedAt: string | null
  lastEventAt: string
  lastDetail: string | null
  savedAt: string | null
}

const keyFor = (workspaceId: string) => `realtalent:${workspaceId}:call-runtime:v1014`
const nowIso = () => new Date().toISOString()
const validIso = (value: unknown) => typeof value === 'string' && Number.isFinite(new Date(value).getTime()) ? value : null
const providerIds = new Set<VoiceProviderId>(['realtalent_connect', 'external_tel', 'browser_webrtc', 'sip'])
const states = new Set<VoiceCallState>(['ready', 'connecting', 'ringing', 'connected', 'held', 'ended', 'failed'])
const transports = new Set<VoiceTransportState>(['healthy', 'degraded', 'recovered'])

const createAttemptId = () => {
  try { return crypto.randomUUID() } catch { return `call-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` }
}

function normalizeAttempt(value: unknown): CallRuntimeAttempt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Partial<CallRuntimeAttempt>
  const attemptId = typeof raw.attemptId === 'string' ? raw.attemptId.trim() : ''
  const workspaceId = typeof raw.workspaceId === 'string' ? raw.workspaceId.trim() : ''
  const leadId = typeof raw.leadId === 'string' ? raw.leadId.trim() : ''
  const startedAt = validIso(raw.startedAt)
  const lastEventAt = validIso(raw.lastEventAt)
  if (raw.schema !== CALL_RUNTIME_SCHEMA || !attemptId || !workspaceId || !leadId || !startedAt || !lastEventAt) return null
  if (!providerIds.has(raw.providerId as VoiceProviderId) || !states.has(raw.state as VoiceCallState)) return null
  return {
    schema: CALL_RUNTIME_SCHEMA,
    attemptId,
    workspaceId,
    leadId,
    contactId: typeof raw.contactId === 'string' && raw.contactId ? raw.contactId : null,
    providerId: raw.providerId as VoiceProviderId,
    deviceId: typeof raw.deviceId === 'string' && raw.deviceId ? raw.deviceId : null,
    phone: typeof raw.phone === 'string' ? raw.phone : '',
    externalCallId: typeof raw.externalCallId === 'string' && raw.externalCallId ? raw.externalCallId : null,
    state: raw.state as VoiceCallState,
    transport: transports.has(raw.transport as VoiceTransportState) ? raw.transport as VoiceTransportState : 'healthy',
    startedAt,
    connectedAt: validIso(raw.connectedAt),
    endedAt: validIso(raw.endedAt),
    lastEventAt,
    lastDetail: typeof raw.lastDetail === 'string' ? raw.lastDetail.slice(0, 500) : null,
    savedAt: validIso(raw.savedAt),
  }
}

export function readCallRuntimeAttempts(workspaceId: string): CallRuntimeAttempt[] {
  try {
    const raw = window.localStorage.getItem(keyFor(workspaceId))
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item) => {
      const normalized = normalizeAttempt(item)
      return normalized ? [normalized] : []
    }).sort((a, b) => b.lastEventAt.localeCompare(a.lastEventAt)).slice(0, 30)
  } catch { return [] }
}

function writeAttempts(workspaceId: string, attempts: CallRuntimeAttempt[]) {
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000
  const compact = attempts.filter((item) => new Date(item.lastEventAt).getTime() >= cutoff).sort((a, b) => b.lastEventAt.localeCompare(a.lastEventAt)).slice(0, 30)
  try { window.localStorage.setItem(keyFor(workspaceId), JSON.stringify(compact)) } catch { /* storage opcional */ }
  return compact
}

export function beginCallRuntimeAttempt(input: { workspaceId: string; leadId: string; contactId?: string | null; providerId: VoiceProviderId; deviceId?: string | null; phone: string }): CallRuntimeAttempt {
  const timestamp = nowIso()
  const attempt: CallRuntimeAttempt = {
    schema: CALL_RUNTIME_SCHEMA,
    attemptId: createAttemptId(),
    workspaceId: input.workspaceId,
    leadId: input.leadId,
    contactId: input.contactId ?? null,
    providerId: input.providerId,
    deviceId: input.deviceId ?? null,
    phone: input.phone,
    externalCallId: null,
    state: 'connecting',
    transport: 'healthy',
    startedAt: timestamp,
    connectedAt: null,
    endedAt: null,
    lastEventAt: timestamp,
    lastDetail: null,
    savedAt: null,
  }
  writeAttempts(input.workspaceId, [attempt, ...readCallRuntimeAttempts(input.workspaceId)])
  return attempt
}

export function updateCallRuntimeAttempt(workspaceId: string, attemptId: string, patch: Partial<Omit<CallRuntimeAttempt, 'schema' | 'attemptId' | 'workspaceId'>>): CallRuntimeAttempt | null {
  const attempts = readCallRuntimeAttempts(workspaceId)
  const current = attempts.find((item) => item.attemptId === attemptId)
  if (!current) return null
  const timestamp = nowIso()
  const state = patch.state ?? current.state
  const next: CallRuntimeAttempt = {
    ...current,
    ...patch,
    schema: CALL_RUNTIME_SCHEMA,
    attemptId,
    workspaceId,
    state,
    connectedAt: patch.connectedAt ?? current.connectedAt ?? (state === 'connected' ? timestamp : null),
    endedAt: patch.endedAt ?? current.endedAt ?? (state === 'ended' || state === 'failed' ? timestamp : null),
    lastEventAt: patch.lastEventAt ?? timestamp,
  }
  writeAttempts(workspaceId, [next, ...attempts.filter((item) => item.attemptId !== attemptId)])
  return next
}

export function bindVoiceRuntime(workspaceId: string, attemptId: string, runtime: VoiceCallRuntime) {
  return updateCallRuntimeAttempt(workspaceId, attemptId, {
    providerId: runtime.providerId,
    externalCallId: runtime.externalCallId,
    state: runtime.state,
    phone: runtime.phone,
    startedAt: runtime.startedAt,
  })
}

export function applyVoiceRuntimeEvent(workspaceId: string, attemptId: string, event: VoiceEvent) {
  return updateCallRuntimeAttempt(workspaceId, attemptId, {
    state: event.state,
    transport: event.transport ?? 'healthy',
    lastEventAt: event.occurredAt,
    lastDetail: event.detail ?? null,
  })
}

export function markCallRuntimeSaved(workspaceId: string, attemptId: string) {
  return updateCallRuntimeAttempt(workspaceId, attemptId, { savedAt: nowIso() })
}

export function recoverableCallRuntimeAttempt(workspaceId: string, leadId?: string | null) {
  return readCallRuntimeAttempts(workspaceId).find((item) => !item.savedAt && !['ended', 'failed'].includes(item.state) && (!leadId || item.leadId === leadId)) ?? null
}

export function runtimeAttemptById(workspaceId: string, attemptId?: string | null) {
  if (!attemptId) return null
  return readCallRuntimeAttempts(workspaceId).find((item) => item.attemptId === attemptId) ?? null
}
