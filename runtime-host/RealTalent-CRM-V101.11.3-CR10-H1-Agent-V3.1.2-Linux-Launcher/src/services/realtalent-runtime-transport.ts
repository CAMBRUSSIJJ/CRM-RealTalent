import { getSupabaseClient } from '../lib/supabase'

const loopback = (value: string) => {
  try {
    const parsed = new URL(value, typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1')
    return ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)
  } catch { return false }
}

export async function runtimeAuthHeaders(target: string): Promise<Record<string, string>> {
  if (loopback(target)) return {}
  const client = getSupabaseClient()
  if (!client) return {}
  try {
    const { data } = await client.auth.getSession()
    const token = data.session?.access_token
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

export async function runtimeFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const auth = await runtimeAuthHeaders(input)
  return fetch(input, {
    ...init,
    credentials: input.startsWith('/') ? 'same-origin' : init.credentials,
    headers: { ...auth, ...(init.headers ?? {}) },
  })
}

export const isCloudRuntimeProxy = (value: string) => value.startsWith('/api/runtime/')
