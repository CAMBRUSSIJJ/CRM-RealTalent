import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

export type CommunicationProvider = 'whatsapp' | 'gmail' | 'microsoft'
export type AdminClient = ReturnType<typeof createClient>

const textEncoder = new TextEncoder()

export function createAdminClient(): AdminClient {
  const url = Deno.env.get('SUPABASE_URL') || ''
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!url || !key) throw new Error('Supabase service credentials unavailable')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export function correlationId(request: Request): string {
  const supplied = (request.headers.get('x-request-id') || request.headers.get('x-correlation-id') || '').trim()
  return supplied && supplied.length <= 160 ? supplied : crypto.randomUUID()
}

export function constantTimeEquals(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return mismatch === 0
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', textEncoder.encode(value)))
  return Array.from(digest).map((item) => item.toString(16).padStart(2, '0')).join('')
}

export async function hmacSha256Hex(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', textEncoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, textEncoder.encode(value)))
  return Array.from(signature).map((item) => item.toString(16).padStart(2, '0')).join('')
}

function stableObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableObject)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableObject(item)]))
}

export async function stableDigest(value: unknown): Promise<string> {
  return sha256Hex(JSON.stringify(stableObject(value)))
}

export async function readJsonBody(request: Request, maxBytes = 1_500_000): Promise<{ raw: string; value: any }> {
  const raw = await request.text()
  if (textEncoder.encode(raw).byteLength > maxBytes) {
    const error = new Error('Payload too large') as Error & { status?: number }
    error.status = 413
    throw error
  }
  try {
    return { raw, value: raw ? JSON.parse(raw) : {} }
  } catch {
    const error = new Error('Invalid JSON') as Error & { status?: number }
    error.status = 400
    throw error
  }
}

export function providerHeaders(provider: CommunicationProvider, requestId: string, extra: HeadersInit = {}): Headers {
  const headers = new Headers(extra)
  headers.set('cache-control', 'no-store')
  headers.set('x-content-type-options', 'nosniff')
  headers.set('x-realtalent-provider', provider)
  headers.set('x-realtalent-correlation-id', requestId)
  return headers
}

export function jsonResponse(provider: CommunicationProvider, requestId: string, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: providerHeaders(provider, requestId, { 'content-type': 'application/json; charset=utf-8' }) })
}

export function textResponse(provider: CommunicationProvider, requestId: string, body: string, status = 200): Response {
  return new Response(body, { status, headers: providerHeaders(provider, requestId, { 'content-type': 'text/plain; charset=utf-8' }) })
}

export function emptyResponse(provider: CommunicationProvider, requestId: string, status = 204): Response {
  return new Response(null, { status, headers: providerHeaders(provider, requestId) })
}

export function logCommunication(provider: CommunicationProvider, requestId: string, event: string, detail: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ scope: 'realtalent.communications', provider, requestId, event, at: new Date().toISOString(), ...detail }))
}

export async function runProvider(provider: CommunicationProvider, request: Request, handler: (request: Request, requestId: string) => Promise<Response>): Promise<Response> {
  const requestId = correlationId(request)
  const started = Date.now()
  try {
    logCommunication(provider, requestId, 'request.received', { method: request.method, path: new URL(request.url).pathname })
    const response = await handler(request, requestId)
    const headers = providerHeaders(provider, requestId, response.headers)
    headers.set('server-timing', `app;dur=${Date.now() - started}`)
    logCommunication(provider, requestId, 'request.completed', { status: response.status, durationMs: Date.now() - started })
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  } catch (error) {
    const status = Number((error as any)?.status || 500)
    const message = error instanceof Error ? error.message : String(error)
    console.error(JSON.stringify({ scope: 'realtalent.communications', provider, requestId, event: 'request.failed', at: new Date().toISOString(), status, durationMs: Date.now() - started, error: message }))
    return jsonResponse(provider, requestId, { error: status >= 500 ? 'Falha interna de comunicações' : message, correlationId: requestId }, status)
  }
}
