import { describe, expect, it } from 'vitest'
import { gatewayAuthFailure, gatewayPollRetryDelayMs } from './communications-retry-policy'

describe('communications gateway retry policy', () => {
  it('backs off when the session is unauthorized', () => {
    expect(gatewayAuthFailure(401, undefined)).toBe(true)
    expect(gatewayPollRetryDelayMs(401, undefined, 1)).toBe(120_000)
  })
  it('backs off on rejected service credentials', () => {
    expect(gatewayAuthFailure(502, 'runtime_upstream_auth_rejected')).toBe(true)
    expect(gatewayPollRetryDelayMs(502, 'runtime_upstream_auth_rejected', 2)).toBe(120_000)
  })
  it('retries transient errors with a bounded backoff', () => {
    expect(gatewayAuthFailure(503, 'runtime_upstream_unavailable')).toBe(false)
    expect(gatewayPollRetryDelayMs(503, 'runtime_upstream_unavailable', 1)).toBe(10_000)
    expect(gatewayPollRetryDelayMs(503, 'runtime_upstream_unavailable', 8)).toBe(60_000)
  })
})
