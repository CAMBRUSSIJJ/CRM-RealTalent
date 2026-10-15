export const REALTALENT_CONNECT_SIGNAL_SCHEMA = 'realtalent.connect.conversation.v1' as const

export interface RealTalentConnectParticipantSignal {
  name: string
  role?: string
  contactId?: string | null
}

export interface RealTalentConnectNextActionSignal {
  type: 'call' | 'followup' | 'meeting' | 'proposal' | 'other'
  title: string
  dueAt?: string | null
  confidence: number
}

export interface RealTalentConnectConversationSignal {
  schema: typeof REALTALENT_CONNECT_SIGNAL_SCHEMA
  workspaceId: string
  leadId: string
  callId: string
  occurredAt: string
  summary: string
  pains: string[]
  objections: string[]
  buyingSignals: string[]
  risks: string[]
  participants: RealTalentConnectParticipantSignal[]
  nextAction: RealTalentConnectNextActionSignal | null
  source: 'realtalent-connect'
}

const cleanStrings = (value: unknown, max = 20) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, max)
  : []

const validIso = (value: unknown) => typeof value === 'string' && Number.isFinite(new Date(value).getTime()) ? value : null
const confidence = (value: unknown) => Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 0))

export const normalizeRealTalentConnectSignal = (value: unknown): RealTalentConnectConversationSignal | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  if (raw.schema !== REALTALENT_CONNECT_SIGNAL_SCHEMA || raw.source !== 'realtalent-connect') return null
  const workspaceId = typeof raw.workspaceId === 'string' ? raw.workspaceId.trim() : ''
  const leadId = typeof raw.leadId === 'string' ? raw.leadId.trim() : ''
  const callId = typeof raw.callId === 'string' ? raw.callId.trim() : ''
  const occurredAt = validIso(raw.occurredAt)
  if (!workspaceId || !leadId || !callId || !occurredAt) return null
  const next = raw.nextAction && typeof raw.nextAction === 'object' && !Array.isArray(raw.nextAction) ? raw.nextAction as Record<string, unknown> : null
  const allowedTypes = new Set(['call', 'followup', 'meeting', 'proposal', 'other'])
  const nextAction = next && allowedTypes.has(String(next.type)) && typeof next.title === 'string' && next.title.trim()
    ? { type: String(next.type) as RealTalentConnectNextActionSignal['type'], title: next.title.trim().slice(0, 240), dueAt: validIso(next.dueAt), confidence: confidence(next.confidence) }
    : null
  const participants = Array.isArray(raw.participants) ? raw.participants.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const participant = item as Record<string, unknown>
    const name = typeof participant.name === 'string' ? participant.name.trim() : ''
    if (!name) return []
    return [{ name: name.slice(0, 160), role: typeof participant.role === 'string' ? participant.role.trim().slice(0, 120) : undefined, contactId: typeof participant.contactId === 'string' ? participant.contactId : null }]
  }).slice(0, 20) : []
  return {
    schema: REALTALENT_CONNECT_SIGNAL_SCHEMA,
    workspaceId,
    leadId,
    callId,
    occurredAt,
    summary: typeof raw.summary === 'string' ? raw.summary.trim().slice(0, 4_000) : '',
    pains: cleanStrings(raw.pains),
    objections: cleanStrings(raw.objections),
    buyingSignals: cleanStrings(raw.buyingSignals),
    risks: cleanStrings(raw.risks),
    participants,
    nextAction,
    source: 'realtalent-connect',
  }
}
