import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
})
const text = (value: unknown, maximum: number) => typeof value === 'string' ? value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, maximum) : ''
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json({ error: 'diagnostics_not_configured' }, 503)
  const authorization = request.headers.get('authorization') ?? ''
  if (!authorization.toLowerCase().startsWith('bearer ')) return json({ error: 'authentication_required' }, 401)

  let body: Record<string, unknown>
  try { body = record(await request.json()) }
  catch { return json({ error: 'invalid_json' }, 400) }

  const organizationId = text(body.organizationId ?? body.organization_id, 120)
  const severity = text(body.severity, 20)
  const source = text(body.source, 80)
  const message = text(body.message, 1000)
  if (!organizationId || !source || !message || !['info','warning','error','critical'].includes(severity)) {
    return json({ error: 'invalid_diagnostic' }, 400)
  }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { authorization } },
    auth: { persistSession: false },
  })
  const { data: userResult, error: userError } = await client.auth.getUser()
  if (userError || !userResult.user) return json({ error: 'invalid_session' }, 401)

  const { error } = await client.from('system_health_events').insert({
    organization_id: organizationId,
    user_id: userResult.user.id,
    severity,
    source,
    event_code: text(body.eventCode ?? body.event_code, 100) || 'client_diagnostic',
    message,
    reference: text(body.reference, 120),
    route: text(body.route, 200),
    app_version: text(body.appVersion ?? body.app_version, 40),
    correlation_id: text(body.correlationId ?? body.correlation_id, 160),
    context: record(body.context),
  })
  if (error) return json({ error: error.message }, error.code === '42501' ? 403 : 400)
  return json({ ok: true }, 202)
})
