import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { finishGeocodeJob, geocodeLeadRecord, GOOGLE_MAPS_API_KEY, persistGeocodeOutcome } from '../_shared/lead-geocoding.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? ''
const WORKER_SECRET = Deno.env.get('MAPS_WORKER_SECRET') ?? ''
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !GOOGLE_MAPS_API_KEY || !WORKER_SECRET) return json({ error: 'worker_not_configured' }, 503)
  if (request.headers.get('x-worker-secret') !== WORKER_SECRET) return json({ error: 'unauthorized' }, 401)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  let limit = 25
  try { const body = await request.json(); limit = Math.max(1, Math.min(100, Number(body?.limit) || 25)) } catch { /* usa padrão */ }
  const { data: jobs, error: claimError } = await admin.rpc('claim_lead_geocode_jobs', { p_limit: limit, p_worker: 'lead-geocode-worker', p_lease_seconds: 300 })
  if (claimError) return json({ error: 'claim_failed', message: claimError.message }, 500)
  const result = { claimed: (jobs ?? []).length, completed: 0, failed: 0, retried: 0 }
  for (const job of jobs ?? []) {
    const { data: lead, error: leadError } = await admin.from('leads')
      .select('id,organization_id,name,postal_code,street,address_number,complement,district,city,state,country')
      .eq('id', job.lead_id).eq('organization_id', job.organization_id).maybeSingle()
    if (leadError || !lead) {
      await finishGeocodeJob(admin, job.id, null, leadError?.message || 'Lead não encontrado.', Number(job.attempts), Number(job.max_attempts))
      result.failed += 1; continue
    }
    try {
      const outcome = await geocodeLeadRecord(lead)
      await persistGeocodeOutcome(admin, lead, outcome)
      await finishGeocodeJob(admin, job.id, outcome, null, Number(job.attempts), Number(job.max_attempts))
      result.completed += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha desconhecida.'
      await finishGeocodeJob(admin, job.id, null, message, Number(job.attempts), Number(job.max_attempts))
      if (Number(job.attempts) >= Number(job.max_attempts)) result.failed += 1; else result.retried += 1
    }
  }
  return json(result)
})
