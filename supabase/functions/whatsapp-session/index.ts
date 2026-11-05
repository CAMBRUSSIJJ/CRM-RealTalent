import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
}
const reply = (data: unknown, code = 200) => new Response(JSON.stringify(data), {
  status: code, headers: { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store' },
})
const uuid = (v: unknown) => typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const qrImage = (v: unknown): string | null => {
  if (typeof v !== 'string' || v.length > 500000) return null
  const raw = v.replace(/^data:image\/png;base64,/, '')
  return /^iVBORw0KGgo[A-Za-z0-9+/=\r\n]+$/.test(raw) ? 'data:image/png;base64,' + raw : null
}

/** Never exposes the service key or a public Evolution endpoint. */
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405)
  if (Deno.env.get('WHATSAPP_CONNECTION_MODE') !== 'bridge')
    return reply({ error: 'local_bridge_not_enabled' }, 503)
  const auth = request.headers.get('authorization') || ''
  if (!/^Bearer\s+\S+$/i.test(auth)) return reply({ error: 'sign_in_required' }, 401)

  let body: { organizationId?: unknown; action?: unknown }
  try { body = await request.json() } catch { return reply({ error: 'invalid_json' }, 400) }
  if (!uuid(body.organizationId) || !['status', 'connect', 'disconnect'].includes(String(body.action)))
    return reply({ error: 'invalid_request' }, 400)
  const organizationId = body.organizationId as string
  const action = body.action as string
  const url = Deno.env.get('SUPABASE_URL') || ''
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!url || !anon || !serviceKey) return reply({ error: 'supabase_configuration_missing' }, 503)

  const sessionClient = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user }, error: authError } = await sessionClient.auth.getUser()
  if (authError || !user) return reply({ error: 'invalid_session' }, 401)
  const { data: member, error: memberError } = await sessionClient.from('organization_members')
    .select('role').eq('organization_id', organizationId).eq('user_id', user.id).maybeSingle()
  if (memberError || !member) return reply({ error: 'workspace_access_denied' }, 403)
  const canConnect = member.role === 'owner' || member.role === 'admin'
  if (action !== 'status' && !canConnect) return reply({ error: 'admin_required' }, 403)

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: bridge, error } = await admin.from('whatsapp_local_bridge').select(
    'heartbeat_at,connection_state,qr_base64,qr_expires_at,requested_action,last_error,updated_at',
  ).eq('organization_id', organizationId).maybeSingle()
  if (error) return reply({ error: 'local_bridge_migration_missing' }, 503)
  const lastBeat = Date.parse(bridge?.heartbeat_at || '')
  const online = Number.isFinite(lastBeat) && Date.now() - lastBeat >= 0 && Date.now() - lastBeat < 45_000
  if (!online) {
    return action === 'status'
      ? reply({ state: 'offline', qr: null, online: false, connectionMode: 'bridge' })
      : reply({ error: 'local_connector_offline' }, 503)
  }
  if (action === 'status') {
    const expires = Date.parse(bridge?.qr_expires_at || '')
    const validUntil = Number.isFinite(expires) && expires > Date.now()
    return reply({
      state: bridge?.connection_state || 'close',
      online: true, connectionMode: 'bridge',
      qr: canConnect && validUntil && bridge?.connection_state !== 'open' ? qrImage(bridge?.qr_base64) : null,
      expiresIn: validUntil ? Math.max(0, Math.floor((expires - Date.now()) / 1000)) : 0,
      message: bridge?.last_error || null,
    })
  }
  const { error: setError } = await admin.from('whatsapp_local_bridge').update({
    requested_action: action,
    request_id: crypto.randomUUID(),
    request_created_at: new Date().toISOString(),
    qr_base64: null, qr_expires_at: null, last_error: null,
  }).eq('organization_id', organizationId)
  if (setError) return reply({ error: 'local_connector_command_failed' }, 503)
  return reply({ state: action === 'connect' ? 'connecting' : 'disconnecting', online: true, connectionMode: 'bridge' })
})
