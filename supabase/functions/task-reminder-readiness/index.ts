import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, x-client-info, content-type',
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store' },
})
const present = (name: string) => Boolean((Deno.env.get(name) || '').trim())

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const authorization = request.headers.get('authorization') || ''
  if (!authorization.startsWith('Bearer ')) return json({ error: 'authentication_required' }, 401)
  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !anonKey) return json({ error: 'supabase_configuration_unavailable' }, 503)
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user }, error: authError } = await client.auth.getUser()
  if (authError || !user) return json({ error: 'invalid_session' }, 401)
  const body = await request.json().catch(() => ({})) as { organizationId?: unknown }
  if (typeof body.organizationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.organizationId))
    return json({ error: 'invalid_organization' }, 400)

  const member = await client.from('organization_members').select('user_id')
    .eq('organization_id', body.organizationId).eq('user_id', user.id).maybeSingle()
  if (member.error || !member.data) return json({ error: 'workspace_access_denied' }, 403)

  // Table is not shipped to live users before a database migration. Return
  // a "not installed" state, never a fake "ready" status.
  const table = await client.from('task_notification_preferences').select('user_id')
    .eq('organization_id', body.organizationId).eq('user_id', user.id).limit(1)
  const databaseReady = !table.error
  const deliveryEnabled = (Deno.env.get('TASK_REMINDER_DELIVERY_ENABLED') || '') === 'true'
  const schedulerAuthenticated = present('TASK_REMINDER_CRON_SECRET') &&
    (Deno.env.get('TASK_REMINDER_CRON_SECRET') || '').length >= 32
  let appUrlConfigured = false
  try {
    appUrlConfigured = new URL(Deno.env.get('TASK_REMINDER_APP_URL') || '').protocol === 'https:'
  } catch { /* not configured */ }
  return json({
    ok: true,
    databaseReady,
    deliveryEnabled,
    appUrlConfigured,
    schedulerAuthenticated,
    emailCredentialsPresent: present('RESEND_API_KEY') && present('TASK_REMINDER_FROM_EMAIL'),
    whatsappCredentialsPresent: ['TASK_REMINDER_META_TOKEN','TASK_REMINDER_META_PHONE_ID','TASK_REMINDER_META_GRAPH_VERSION','TASK_REMINDER_META_TEMPLATE_NAME'].every(present),
    // Credentials being present is not proof of verified domains, approved
    // message templates, a running cron, or end-to-end message delivery.
    checkedAt: new Date().toISOString(),
  })
})
