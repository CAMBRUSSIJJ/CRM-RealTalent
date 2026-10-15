import { describe, expect, it } from 'vitest'
import { classifyCommercialFailure } from './commercial-failure-recovery'

describe('commercial failure recovery', () => {
  it('classifica sessão expirada sem sugerir retry cego', () => {
    const result = classifyCommercialFailure(new Error('JWT expired'))
    expect(result.kind).toBe('session'); expect(result.retryable).toBe(false); expect(result.preservesDraft).toBe(true)
  })
  it('classifica falha de rede como recuperável', () => {
    const result = classifyCommercialFailure(new Error('Failed to fetch'))
    expect(result.kind).toBe('offline'); expect(result.retryable).toBe(true)
  })
  it('classifica aprovação pendente', () => expect(classifyCommercialFailure(new Error('precisa de aprovação comercial')).kind).toBe('approval'))
  it('classifica conflito concorrente', () => expect(classifyCommercialFailure(new Error('409 conflict')).kind).toBe('conflict'))
})
