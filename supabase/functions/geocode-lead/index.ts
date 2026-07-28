import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { finishGeocodeJob, geocodeLeadRecord, GOOGLE_MAPS_API_KEY, persistGeocodeOutcome } from '../_shared/lead-geocoding.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? ''
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
const text = (value: unknown, maximum = 500) => typeof value === 'string' ? value.trim().slice(0, maximum) : value == null ? '' : String(value).trim().slice(0, maximum)
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) return json({ error: 'supabase_not_configured' }, 503)
  if (!GOOGLE_MAPS_API_KEY) return json({ error: 'google_maps_api_key_missing', message: 'Configure GOOGLE_MAPS_API_KEY nos secrets da Edge Function.' }, 503)

  const authorization = request.headers.get('authorization') ?? ''
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  let body: unknown
  try { body = await request.json() } catch { return json({ error: 'invalid_json' }, 400) }
  const ids = isRecord(body) && Array.isArray(body.leadIds) ? [...new Set(body.leadIds.map((item) => text(item, 80)).filter(Boolean))] : []
  const source = isRecord(body) ? text(body.source, 40) || 'map' : 'map'
  if (!ids.length) return json({ error: 'empty_lead_ids' }, 400)
  if (ids.length > 100) return json({ error: 'batch_limit_exceeded', maximum: 100 }, 413)

  const { data: visibleLeads, error: visibilityError } = await userClient.from('leads').select('id').in('id', ids)
  if (visibilityError) return json({ error: 'lead_access_failed', message: visibilityError.message }, 403)
  const authorizedIds = (visibleLeads ?? []).map((lead) => String(lead.id))
  if (!authorizedIds.length) return json({ error: 'no_authorized_leads' }, 403)

  const { data: queued, error: queueError } = await userClient.rpc('enqueue_lead_geocoding', { p_lead_ids: authorizedIds, p_source: source, p_priority: 100 })
  if (queueError) return json({ error: 'queue_failed', message: queueError.message }, 400)

  const { data: jobs, error: jobsError } = await admin.from('lead_geocode_jobs')
    .select('id,organization_id,lead_id,status,attempts,max_attempts')
    .in('lead_id', authorizedIds).in('status', ['queued', 'retry']).order('created_at', { ascending: true }).limit(100)
  if (jobsError) return json({ error: 'queue_read_failed', message: jobsError.message }, 500)

  const result = { queued: Number(queued) || 0, processed: 0, exact: 0, approximate: 0, incomplete: 0, notFound: 0, errors: [] as Array<{ leadId: string; message: string }> }
  for (const job of jobs ?? []) {
    const lock = await admin.from('lead_geocode_jobs').update({ status: 'processing', locked_at: new Date().toISOString(), locked_by: `user:${userData.user.id}`, attempts: Number(job.attempts || 0) + 1 })
      .eq('id', job.id).in('status', ['queued', 'retry']).select('id,attempts,max_attempts').maybeSingle()
    if (lock.error || !lock.data) continue
    const { data: lead, error: leadError } = await admin.from('leads')
      .select('id,organization_id,name,postal_code,street,address_number,complement,district,city,state,country')
      .eq('id', job.lead_id).eq('organization_id', job.organization_id).maybeSingle()
    if (leadError || !lead) {
      const message = leadError?.message || 'Lead removido antes da geocodificação.'
      await finishGeocodeJob(admin, job.id, null, message, Number(lock.data.attempts), Number(lock.data.max_attempts))
      result.errors.push({ leadId: job.lead_id, message }); continue
    }
    try {
      const outcome = await geocodeLeadRecord(lead)
      await persistGeocodeOutcome(admin, lead, outcome)
      await finishGeocodeJob(admin, job.id, outcome, null, Number(lock.data.attempts), Number(lock.data.max_attempts))
      result.processed += 1
      if (outcome.status === 'exact') result.exact += 1
      else if (outcome.status === 'approximate') result.approximate += 1
      else if (outcome.status === 'incomplete') result.incomplete += 1
      else result.notFound += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha desconhecida na geocodificação.'
      await finishGeocodeJob(admin, job.id, null, message, Number(lock.data.attempts), Number(lock.data.max_attempts))
      result.errors.push({ leadId: job.lead_id, message })
    }
  }
  return json(result)
})
