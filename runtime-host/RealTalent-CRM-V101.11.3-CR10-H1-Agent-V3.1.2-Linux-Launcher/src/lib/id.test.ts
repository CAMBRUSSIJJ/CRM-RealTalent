import { describe, expect, it, vi } from 'vitest'
import { createId, createUuid } from './id'

describe('identificadores', () => {
  it('gera UUID v4 válido e identificador prefixado', () => {
    expect(createUuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(createId('lead')).toMatch(/^lead-[0-9a-f-]{36}$/)
  })

  it('mantém fallback UUID quando randomUUID não está disponível', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues: (bytes: Uint8Array) => { bytes.fill(7); return bytes } } })
    expect(createUuid()).toBe('07070707-0707-4707-8707-070707070707')
    if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor)
    else vi.unstubAllGlobals()
  })
})
