import { createUuid } from '../lib/id'

type OfficialCommunicationChannel = 'email' | 'whatsapp'

type StoredAttempt = {
  fingerprint: string
  key: string
  state: 'pending' | 'confirmed'
  eventId?: string
  updatedAt: number
}

export interface CommunicationIdempotencyInput {
  workspaceId: string
  leadId?: string | null
  contactId?: string | null
  channel: OfficialCommunicationChannel
  recipient?: string | null
  subject?: string | null
  body: string
  proposedKey?: string | null
}

export interface CommunicationIdempotencyAttempt {
  fingerprint: string
  key: string
  reusedPendingAttempt: boolean
}

const STORAGE_KEY = 'realtalent:communications:idempotency:v1'
const PENDING_TTL_MS = 15 * 60_000
const MAX_ENTRIES = 80
let memoryAttempts: StoredAttempt[] = []

const normalize = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR')

const hash = (value: string) => {
  let current = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    current ^= value.charCodeAt(index)
    current = Math.imul(current, 16777619)
  }
  return (current >>> 0).toString(36)
}

export const communicationFingerprint = (input: CommunicationIdempotencyInput) => hash([
  input.workspaceId,
  input.leadId ?? '',
  input.contactId ?? '',
  input.channel,
  normalize(input.recipient),
  normalize(input.subject),
  normalize(input.body),
].join('|'))

const browserSessionStorage = () => {
  try { return typeof window !== 'undefined' ? window.sessionStorage : null } catch { return null }
}

const readAttempts = (): StoredAttempt[] => {
  const storage = browserSessionStorage()
  if (!storage) return memoryAttempts
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? '[]') as StoredAttempt[]
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.fingerprint === 'string' && typeof item.key === 'string') : []
  } catch { return [] }
}

const writeAttempts = (attempts: StoredAttempt[], now = Date.now()) => {
  const fresh = attempts
    .filter((item) => item.state === 'confirmed' || now - item.updatedAt <= PENDING_TTL_MS)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_ENTRIES)
  const storage = browserSessionStorage()
  if (!storage) { memoryAttempts = fresh; return }
  try { storage.setItem(STORAGE_KEY, JSON.stringify(fresh)) } catch { memoryAttempts = fresh }
}

const freshPending = (attempt: StoredAttempt, now: number) => attempt.state === 'pending' && now - attempt.updatedAt <= PENDING_TTL_MS

const fallbackKey = (input: CommunicationIdempotencyInput, now: number) => `crm-${input.channel}:${input.leadId || input.contactId || 'unlinked'}:${now}`

const legacyAgentTransportKey = (value: string) => /^agent-(?:whatsapp|email):/.test(value)
  ? value.replace(/:\d{10,}$/, '')
  : value

const transportSafeProposedKey = (proposedKey: string, attempts: StoredAttempt[]) => {
  const transportKey = legacyAgentTransportKey(proposedKey)
  const collidesWithConfirmedSend = attempts.some((item) => (
    item.state === 'confirmed' && legacyAgentTransportKey(item.key) === transportKey
  ))
  if (!collidesWithConfirmedSend) return proposedKey

  // Older gateway code strips the final timestamp from Agent keys. Add a
  // non-numeric per-send suffix only after a confirmed send so an intentional
  // resend cannot collapse back onto the previous runtime idempotency key.
  return `${proposedKey}:send-${createUuid()}`
}

/**
 * A retry after an ambiguous/network failure reuses the first key for the same
 * exact outbound payload. Once a send is confirmed, a later intentional send
 * receives a new key even when recipient/body are identical.
 */
export const beginCommunicationIdempotencyAttempt = (input: CommunicationIdempotencyInput, now = Date.now()): CommunicationIdempotencyAttempt => {
  const fingerprint = communicationFingerprint(input)
  const attempts = readAttempts()
  const pending = attempts.find((item) => item.fingerprint === fingerprint && freshPending(item, now))
  if (pending) {
    pending.updatedAt = now
    writeAttempts(attempts, now)
    return { fingerprint, key: pending.key, reusedPendingAttempt: true }
  }

  const proposedKey = input.proposedKey?.trim()
  const key = proposedKey ? transportSafeProposedKey(proposedKey, attempts) : fallbackKey(input, now)
  writeAttempts([{ fingerprint, key, state: 'pending', updatedAt: now }, ...attempts.filter((item) => item.fingerprint !== fingerprint || item.state === 'confirmed')], now)
  return { fingerprint, key, reusedPendingAttempt: false }
}

export const confirmCommunicationIdempotencyAttempt = (attempt: CommunicationIdempotencyAttempt, eventId?: string | null, now = Date.now()) => {
  const attempts = readAttempts()
  const current = attempts.find((item) => item.fingerprint === attempt.fingerprint && item.key === attempt.key && item.state === 'pending')
  if (current) {
    current.state = 'confirmed'
    current.eventId = eventId?.trim() || undefined
    current.updatedAt = now
  } else {
    attempts.unshift({ fingerprint: attempt.fingerprint, key: attempt.key, state: 'confirmed', eventId: eventId?.trim() || undefined, updatedAt: now })
  }
  writeAttempts(attempts, now)
}

export const keepCommunicationIdempotencyPending = (attempt: CommunicationIdempotencyAttempt, now = Date.now()) => {
  const attempts = readAttempts()
  const current = attempts.find((item) => item.fingerprint === attempt.fingerprint && item.key === attempt.key)
  if (current) current.updatedAt = now
  else attempts.unshift({ fingerprint: attempt.fingerprint, key: attempt.key, state: 'pending', updatedAt: now })
  writeAttempts(attempts, now)
}

export const resetCommunicationIdempotencyForTests = () => {
  memoryAttempts = []
  const storage = browserSessionStorage()
  try { storage?.removeItem(STORAGE_KEY) } catch { /* ignore test cleanup failures */ }
}
