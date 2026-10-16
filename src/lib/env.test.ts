import { describe, expect, it } from 'vitest'
import { isValidSupabaseUrl } from './env'

describe('Supabase environment URL validation', () => {
  it('accepts local loopback HTTP URLs used by Supabase CLI', () => {
    expect(isValidSupabaseUrl('http://127.0.0.1:54321')).toBe(true)
    expect(isValidSupabaseUrl('http://localhost:54321')).toBe(true)
    expect(isValidSupabaseUrl('http://[::1]:54321')).toBe(true)
  })

  it('accepts HTTPS for hosted Supabase projects', () => {
    expect(isValidSupabaseUrl('https://example.supabase.co')).toBe(true)
  })

  it('rejects insecure remote HTTP and malformed or placeholder URLs', () => {
    expect(isValidSupabaseUrl('http://example.supabase.co')).toBe(false)
    expect(isValidSupabaseUrl('not-a-url')).toBe(false)
    expect(isValidSupabaseUrl('https://SEU-PROJETO.supabase.co')).toBe(false)
  })
})
