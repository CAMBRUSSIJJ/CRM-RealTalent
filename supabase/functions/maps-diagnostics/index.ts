import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? ''
const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY') ?? ''
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) return json({ error: 'supabase_not_configured' }, 503)
  const authorization = request.headers.get('authorization') ?? ''
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401)
  let body: { organizationId?: string } = {}
  try { body = await request.json() } catch { /* vazio */ }
  const organizationId = String(body.organizationId || '')
  if (!organizationId) return json({ error: 'organization_required' }, 400)
  const { data: membership } = await userClient.from('organization_members').select('role').eq('organization_id', organizationId).eq('user_id', userData.user.id).maybeSingle()
  if (!membership) return json({ error: 'forbidden' }, 403)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const [total, mapped, exact, pending, failed, jobs] = await Promise.all([
    admin.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
    admin.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('latitude', 'is', null).not('longitude', 'is', null),
    admin.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).in('geocode_status', ['exact', 'manual']),
    admin.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).in('geocode_status', ['pending', 'approximate', 'incomplete']),
    admin.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('geocode_status', 'not_found'),
    admin.from('lead_geocode_jobs').select('status').eq('organization_id', organizationId).in('status', ['queued', 'processing', 'retry', 'failed']),
  ])
  const jobCounts = (jobs.data ?? []).reduce<Record<string, number>>((acc, row) => { acc[row.status] = (acc[row.status] || 0) + 1; return acc }, {})
  const totalCount = total.count || 0
  const mappedCount = mapped.count || 0
  return json({
    ok: Boolean(GOOGLE_MAPS_API_KEY),
    mode: GOOGLE_MAPS_API_KEY ? 'connected' : 'demo',
    provider: GOOGLE_MAPS_API_KEY ? 'google-geocoding' : 'local-estimate',
    secretConfigured: Boolean(GOOGLE_MAPS_API_KEY),
    coverage: { total: totalCount, mapped: mappedCount, exact: exact.count || 0, pending: pending.count || 0, failed: failed.count || 0, percentage: totalCount ? Math.round(mappedCount / totalCount * 100) : 0 },
    queue: jobCounts,
    checkedAt: new Date().toISOString(),
  })
})
