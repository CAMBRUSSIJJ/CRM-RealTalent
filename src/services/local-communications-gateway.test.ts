import { describe, expect, it } from 'vitest'
import { normalizeAgentCommunicationIdempotencyKey } from './local-communications-gateway'

describe('Agent communication idempotency', () => {
  it('removes transient timestamps from WhatsApp Agent retries', () => {
    expect(normalizeAgentCommunicationIdempotencyKey('agent-whatsapp:step-42:1792171200123')).toBe('agent-whatsapp:step-42')
  })

  it('removes transient timestamps from email Agent retries', () => {
    expect(normalizeAgentCommunicationIdempotencyKey('agent-email:step-42:1792171200123')).toBe('agent-email:step-42')
  })

  it('keeps an already stable Agent key unchanged', () => {
    expect(normalizeAgentCommunicationIdempotencyKey('agent-whatsapp:step-42')).toBe('agent-whatsapp:step-42')
  })

  it('does not rewrite regular user-generated communication keys', () => {
    expect(normalizeAgentCommunicationIdempotencyKey('wa:lead-1:1792171200123')).toBe('wa:lead-1:1792171200123')
  })

  it('returns undefined when no key exists so normal composer behavior is preserved', () => {
    expect(normalizeAgentCommunicationIdempotencyKey()).toBeUndefined()
  })
})
