import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7'

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
}
const reply = (data: unknown, code = 200) => new Response(JSON.stringify(data), {
  status: code, headers: { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store' },
})
const configured = (key: string) => (Deno.env.get(key) || '').trim()
const defaultApiKey = (name: string) => {
  try {
    const keys = JSON.parse(configured(name))
    return typeof keys?.default === 'string' ? keys.default : ''
  } catch { return '' }
}
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
  // Dedicated bridge endpoint: no manual mode secret is needed.
  // An explicit non-bridge value still disables it.
  if (configured('WHATSAPP_CONNECTION_MODE') &&
      configured('WHATSAPP_CONNECTION_MODE') !== 'bridge')
    return reply({ error: 'local_bridge_not_enabled' }, 503)
  const auth = request.headers.get('authorization') || ''
  if (!/^Bearer\s+\S+$/i.test(auth)) return reply({ error: 'sign_in_required' }, 401)

  let body: { organizationId?: unknown; action?: unknown; code?: unknown }
  try { body = await request.json() } catch { return reply({ error: 'invalid_json' }, 400) }
  if (!uuid(body.organizationId) || !['status', 'connect', 'disconnect', 'verify-start', 'verify-confirm'].includes(String(body.action)))
    return reply({ error: 'invalid_request' }, 400)
  const organizationId = body.organizationId as string
  const action = body.action as string
  const url = Deno.env.get('SUPABASE_URL') || ''
  const anon = configured('SUPABASE_ANON_KEY') ||
    defaultApiKey('SUPABASE_PUBLISHABLE_KEYS')
  const serviceKey = configured('SUPABASE_SERVICE_ROLE_KEY') ||
    defaultApiKey('SUPABASE_SECRET_KEYS')
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
  if (['connect','disconnect'].includes(action) && !canConnect) return reply({ error: 'admin_required' }, 403)

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: bridge, error } = await admin.from('whatsapp_local_bridge').select(
    'heartbeat_at,connection_state,qr_base64,qr_expires_at,requested_action,last_error,updated_at',
  ).eq('organization_id', organizationId).maybeSingle()
  if (error) return reply({ error: 'local_bridge_migration_missing' }, 503)
  const lastBeat = Date.parse(bridge?.heartbeat_at || '')
  const online = Number.isFinite(lastBeat) && Date.now() - lastBeat >= 0 && Date.now() - lastBeat < 45_000
  // Number ownership is verified by a short code sent to the opted-in phone.
  // Neither browser nor Edge response receives the verification code.
  if (action === 'verify-start') {
    if (!online || bridge?.connection_state !== 'open')
      return reply({ error: 'pair_whatsapp_before_verifying_phone' }, 503)
    const { data: prefs, error: prefError } = await admin.from('task_notification_preferences')
      .select('whatsapp_enabled,whatsapp_phone_e164,whatsapp_consented_at')
      .eq('organization_id', organizationId).eq('user_id', user.id).maybeSingle()
    const phone = String(prefs?.whatsapp_phone_e164 || '')
    if (prefError || !prefs?.whatsapp_enabled || !prefs?.whatsapp_consented_at || !/^\+[1-9][0-9]{7,14}$/.test(phone))
      return reply({ error: 'save_your_phone_and_consent_first' }, 400)
    const { data: directory } = await admin.from('team_member_notification_contacts')
      .select('phone_e164').eq('organization_id', organizationId).eq('user_id', user.id).maybeSingle()
    if (directory?.phone_e164 && directory.phone_e164 !== phone)
      return reply({ error: 'team_phone_changed_confirm_again' }, 409)
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0')
    const { data: queued, error: queueError } = await admin.rpc('queue_whatsapp_local_phone_code', {
      p_organization_id: organizationId, p_user_id: user.id, p_phone: phone, p_code: code,
    })
    if (queueError) return reply({ error: 'phone_verification_not_installed' }, 503)
    if (!queued) return reply({ error: 'verification_rate_limited' }, 429)
    return reply({ queued: true, message: 'Código solicitado. Consulte seu WhatsApp e informe os seis dígitos.' })
  }
  if (action === 'verify-confirm') {
    if (typeof body.code !== 'string' || !/^[0-9]{6}$/.test(body.code))
      return reply({ error: 'invalid_verification_code' }, 400)
    const { data: verified, error: verifyError } = await admin.rpc('confirm_whatsapp_local_phone_code', {
      p_organization_id: organizationId, p_user_id: user.id, p_code: body.code,
    })
    if (verifyError) return reply({ error: 'phone_verification_unavailable' }, 503)
    return verified ? reply({ verified: true }) : reply({ error: 'invalid_or_expired_code' }, 400)
  }
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
