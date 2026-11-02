import { describe, expect, it } from 'vitest'
import { describeGatewayResponseError, normalizeAgentCommunicationIdempotencyKey } from './local-communications-gateway'

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

describe('Communications gateway error transparency', () => {
  it('shows the actual WhatsApp Web error when gateway responds HTTP 502', () => {
    const message = describeGatewayResponseError(502, { error: 'Evaluation failed: User not found for recipient' })
    expect(message).toContain('User not found for recipient')
    expect(message).not.toContain('proxy local não conseguiu')
  })
  it('keeps the unavailable proxy warning when there is no upstream JSON error', () => {
    expect(describeGatewayResponseError(502, {})).toContain('proxy local')
    expect(describeGatewayResponseError(502, { error: 'Bad Gateway' })).toContain('proxy local')
  })
  it('retains the dedicated authentication error for hosted runtimes', () => {
    expect(describeGatewayResponseError(502, { error: 'runtime_upstream_auth_rejected' })).toContain('Autenticação Vercel')
  })
  it('caps upstream error length before displaying to the operator', () => {
    expect(describeGatewayResponseError(502, { error: 'x'.repeat(900) }).length).toBeLessThan(420)
  })
})
