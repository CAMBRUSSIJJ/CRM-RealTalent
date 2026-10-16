import { afterEach, describe, expect, it } from 'vitest'
import {
  beginCommunicationIdempotencyAttempt,
  confirmCommunicationIdempotencyAttempt,
  resetCommunicationIdempotencyForTests,
} from './communication-idempotency'
import { normalizeAgentCommunicationIdempotencyKey } from './local-communications-gateway'

const base = {
  workspaceId: 'workspace-1',
  leadId: 'lead-1',
  contactId: 'contact-1',
  channel: 'whatsapp' as const,
  recipient: '5551999999999',
  body: 'Olá, Camila! Tudo bem?',
}

afterEach(() => resetCommunicationIdempotencyForTests())

describe('communication idempotency', () => {
  it('reuses the first key while the exact outbound attempt is still pending', () => {
    const first = beginCommunicationIdempotencyAttempt({ ...base, proposedKey: 'agent-whatsapp:step-1:1000' }, 1_000)
    const retry = beginCommunicationIdempotencyAttempt({ ...base, proposedKey: 'agent-whatsapp:step-1:2000' }, 2_000)
    expect(first.key).toBe('agent-whatsapp:step-1:1000')
    expect(retry.key).toBe(first.key)
    expect(retry.reusedPendingAttempt).toBe(true)
  })

  it('allows a new intentional send after the previous event was confirmed', () => {
    const first = beginCommunicationIdempotencyAttempt({ ...base, proposedKey: 'agent-whatsapp:step-1:1000' }, 1_000)
    confirmCommunicationIdempotencyAttempt(first, 'event-1', 1_500)
    const next = beginCommunicationIdempotencyAttempt({ ...base, proposedKey: 'agent-whatsapp:step-1:2000' }, 2_000)
    expect(next.key).toBe('agent-whatsapp:step-1:2000')
    expect(next.key).not.toBe(first.key)
    expect(next.reusedPendingAttempt).toBe(false)
  })

  it('keeps an intentional Agent resend distinct after legacy gateway normalization', () => {
    const first = beginCommunicationIdempotencyAttempt({ ...base, proposedKey: 'agent-whatsapp:step-42:1792171200123' }, 1_000)
    confirmCommunicationIdempotencyAttempt(first, 'event-1', 1_500)
    const next = beginCommunicationIdempotencyAttempt({ ...base, proposedKey: 'agent-whatsapp:step-42:1792171201123' }, 2_000)

    expect(normalizeAgentCommunicationIdempotencyKey(first.key)).toBe('agent-whatsapp:step-42')
    expect(normalizeAgentCommunicationIdempotencyKey(next.key)).not.toBe(normalizeAgentCommunicationIdempotencyKey(first.key))
    expect(next.reusedPendingAttempt).toBe(false)
  })

  it('does not collapse different payloads into the same pending action', () => {
    const first = beginCommunicationIdempotencyAttempt({ ...base, proposedKey: 'key-a' }, 1_000)
    const second = beginCommunicationIdempotencyAttempt({ ...base, body: 'Outra mensagem', proposedKey: 'key-b' }, 1_100)
    expect(second.key).toBe('key-b')
    expect(second.key).not.toBe(first.key)
  })

  it('keeps email and WhatsApp attempts isolated', () => {
    const whatsapp = beginCommunicationIdempotencyAttempt({ ...base, proposedKey: 'wa-key' }, 1_000)
    const email = beginCommunicationIdempotencyAttempt({ ...base, channel: 'email', recipient: 'camila@example.com', subject: 'Contato', proposedKey: 'email-key' }, 1_100)
    expect(whatsapp.key).toBe('wa-key')
    expect(email.key).toBe('email-key')
  })

  it('expires an unresolved attempt so a much later action can start fresh', () => {
    const first = beginCommunicationIdempotencyAttempt({ ...base, proposedKey: 'old-key' }, 1_000)
    const muchLater = beginCommunicationIdempotencyAttempt({ ...base, proposedKey: 'new-key' }, 1_000 + 16 * 60_000)
    expect(muchLater.key).toBe('new-key')
    expect(muchLater.key).not.toBe(first.key)
  })
})
