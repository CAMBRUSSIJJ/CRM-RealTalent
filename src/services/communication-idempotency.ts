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

const writeAttempts = (attempts: StoredAttempt[]) => {
  const fresh = attempts
    .filter((item) => item.state === 'confirmed' || Date.now() - item.updatedAt <= PENDING_TTL_MS)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_ENTRIES)
  const storage = browserSessionStorage()
  if (!storage) { memoryAttempts = fresh; return }
  try { storage.setItem(STORAGE_KEY, JSON.stringify(fresh)) } catch { memoryAttempts = fresh }
}

const freshPending = (attempt: StoredAttempt, now: number) => attempt.state === 'pending' && now - attempt.updatedAt <= PENDING_TTL_MS

const fallbackKey = (input: CommunicationIdempotencyInput, now: number) => `crm-${input.channel}:${input.leadId || input.contactId || 'unlinked'}:${now}`

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
    writeAttempts(attempts)
    return { fingerprint, key: pending.key, reusedPendingAttempt: true }
  }

  const key = input.proposedKey?.trim() || fallbackKey(input, now)
  writeAttempts([{ fingerprint, key, state: 'pending', updatedAt: now }, ...attempts.filter((item) => item.fingerprint !== fingerprint || item.state === 'confirmed')])
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
  writeAttempts(attempts)
}

export const keepCommunicationIdempotencyPending = (attempt: CommunicationIdempotencyAttempt, now = Date.now()) => {
  const attempts = readAttempts()
  const current = attempts.find((item) => item.fingerprint === attempt.fingerprint && item.key === attempt.key)
  if (current) current.updatedAt = now
  else attempts.unshift({ fingerprint: attempt.fingerprint, key: attempt.key, state: 'pending', updatedAt: now })
  writeAttempts(attempts)
}

export const resetCommunicationIdempotencyForTests = () => {
  memoryAttempts = []
  const storage = browserSessionStorage()
  try { storage?.removeItem(STORAGE_KEY) } catch { /* ignore test cleanup failures */ }
}
