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
const text = (value: unknown, maximum = 180) => typeof value === 'string' ? value.trim().slice(0, maximum) : ''
const list = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 100) : []
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json({ error: 'extension_registration_not_configured' }, 503)
  const authorization = request.headers.get('authorization') ?? ''
  if (!authorization.toLocaleLowerCase('en-US').startsWith('bearer ')) return json({ error: 'authentication_required' }, 401)
  let body: Record<string, unknown>
  try { body = record(await request.json()) }
  catch { return json({ error: 'invalid_json' }, 400) }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { authorization } },
    auth: { persistSession: false },
  })
  const action = text(body.action, 30) || 'register'
  const organizationId = text(body.organizationId ?? body.organization_id, 120)
  if (!organizationId) return json({ error: 'organization_required' }, 400)

  if (action === 'heartbeat') {
    const installationId = text(body.installationId ?? body.installation_id, 120)
    if (!installationId) return json({ error: 'installation_required' }, 400)
    const { data, error } = await client.rpc('heartbeat_extension_installation', {
      p_organization_id: organizationId,
      p_installation_id: installationId,
      p_pending_items: Math.max(0, Number(body.pendingItems ?? body.pending_items ?? 0)),
      p_captured_delta: Math.max(0, Number(body.capturedDelta ?? body.captured_delta ?? 0)),
      p_last_error: text(body.lastError ?? body.last_error, 500) || null,
    })
    if (error) return json({ error: error.message }, error.message.toLocaleLowerCase('pt-BR').includes('revogada') ? 403 : 400)
    const retryJobs = await client.from('extension_capture_jobs').select('id,external_id,source,source_url,payload,attempts,max_attempts,available_at')
      .eq('organization_id', organizationId).eq('installation_id', installationId).eq('status', 'retry')
      .lte('available_at', new Date().toISOString()).order('available_at', { ascending: true }).limit(20)
    return json({ ok: true, ...record(data), retryJobs: retryJobs.data ?? [] })
  }

  const productKey = text(body.productKey ?? body.product_key, 80) || 'realtalent_capture'
  const installationKey = text(body.installationKey ?? body.installation_key, 180)
  if (installationKey.length < 8) return json({ error: 'invalid_installation_key' }, 400)
  const { data, error } = await client.rpc('register_extension_installation', {
    p_organization_id: organizationId,
    p_product_key: productKey,
    p_installation_key: installationKey,
    p_display_name: text(body.displayName ?? body.display_name, 120) || 'RealTalent Capture',
    p_browser: text(body.browser, 60) || 'Chrome',
    p_browser_version: text(body.browserVersion ?? body.browser_version, 40),
    p_platform: text(body.platform, 80),
    p_app_version: text(body.appVersion ?? body.app_version, 40),
    p_manifest_version: Math.max(2, Math.min(4, Number(body.manifestVersion ?? body.manifest_version ?? 3))),
    p_permissions: list(body.permissions),
    p_capabilities: list(body.capabilities),
    p_metadata: record(body.metadata),
  })
  if (error) return json({ error: error.message }, error.message.toLocaleLowerCase('pt-BR').includes('revogada') ? 403 : 400)
  const result = record(data)
  const installation = record(result.installation)
  const settings = record(result.settings)
  if (installation.status === 'outdated') return json({ error: 'extension_version_outdated', minimumVersion: settings.minimum_version, recommendedVersion: settings.recommended_version, ...result }, 426)
  return json({ ok: true, ...result })
})
