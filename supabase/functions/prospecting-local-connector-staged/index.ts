import { createClient } from 'npm:@supabase/supabase-js@2.110.7'
import { isRecord, parseAiSearchInput, ProspectingError } from '../_shared/prospecting-ai.ts'

const url = Deno.env.get('SUPABASE_URL') ?? ''
const publicKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, x-connector-token', 'access-control-allow-methods': 'POST, OPTIONS' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store' } })
const hash = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  try {
    const raw = await request.text()
    if (raw.length > 250_000) throw new ProspectingError('request_too_large', 413)
    const body: unknown = JSON.parse(raw)
    if (!isRecord(body) || typeof body.organizationId !== 'string' || !uuid.test(body.organizationId)) throw new ProspectingError('invalid_workspace')
    const organizationId = body.organizationId
    const admin = createClient(url, secretKey, { auth: { persistSession: false } })
    if (['poll', 'complete', 'heartbeat', 'verify', 'progress'].includes(String(body.action))) {
      const token = request.headers.get('x-connector-token') ?? ''
      if (!/^[a-f0-9]{64}$/.test(token)) throw new ProspectingError('connector_unauthorized', 401)
      const tokenHash = await hash(token)
      const connector = await admin.from('prospecting_local_connectors').select('organization_id').eq('organization_id', organizationId).eq('token_hash', tokenHash).eq('enabled', true).maybeSingle()
      if (connector.error || !connector.data) throw new ProspectingError('connector_unauthorized', 401)
      if (body.action === 'verify') return json({ authorized: true })
      await admin.from('prospecting_local_connectors').update({ last_seen_at: new Date().toISOString() }).eq('organization_id', organizationId).eq('token_hash', tokenHash)
      if (body.action === 'heartbeat') return json({ connected: true })
      if (body.action === 'poll') {
        const claim = await admin.rpc('claim_local_prospecting_job', { p_organization_id: organizationId, p_token_hash: tokenHash })
        if (claim.error) throw new ProspectingError('local_claim_failed', 500)
        const job = claim.data?.[0]
        return json({ job: job ? { id: job.id, leaseId: job.lease_id, input: parseAiSearchInput(job.input) } : null })
      }
      if (typeof body.jobId !== 'string' || !uuid.test(body.jobId) || typeof body.leaseId !== 'string' || !uuid.test(body.leaseId)) throw new ProspectingError('invalid_job')
      if (body.action === 'progress') {
        const stage = typeof body.stage === 'string' ? body.stage : ''
        const allowed = ['discover','website','web','instagram','facts','signals','completed']
        if (!allowed.includes(stage)) throw new ProspectingError('invalid_stage')
        const phaseStatus = ['running', 'completed', 'failed'].includes(String(body.phaseStatus))
          ? String(body.phaseStatus) : 'running'
        const code = typeof body.errorCode === 'string' && /^([a-z_]{4,56})$/.test(body.errorCode)
          ? body.errorCode : ''
        const sources = Number.isInteger(body.sourceCount) ? Math.min(30, Math.max(0, Number(body.sourceCount))) : 0
        const leadCount = Number.isInteger(body.leadCount) ? Math.min(10, Math.max(0, Number(body.leadCount))) : 0
        // Never put raw scraped HTML, private credentials, model prompts or stack traces in the DB.
        const report = { leads: [], warnings: [],
          researchedAt: new Date().toISOString(),
          progress: { stage, phaseStatus, errorCode: code, sourceCount: sources, leadCount,
            updatedAt: new Date().toISOString() },
        }
        const refreshed = await admin.from('prospecting_ai_jobs')
          .update({ result: report, locked_until: new Date(Date.now() + 150_000).toISOString(),
            expires_at: new Date(Date.now() + 10 * 60_000).toISOString() })
          .eq('id', body.jobId).eq('organization_id', organizationId).eq('status', 'processing')
          .eq('lease_id', body.leaseId).gt('locked_until', new Date().toISOString()).select('id')
        if (refreshed.error) throw new ProspectingError('local_progress_failed', 500)
        return json({ accepted: Boolean(refreshed.data?.length) })
      }
      const failed = body.failed === true
      if (!failed && (!isRecord(body.result) || !Array.isArray(body.result.leads) || body.result.leads.length > 10 || !Array.isArray(body.result.warnings))) throw new ProspectingError('invalid_result')
      const done = await admin.from('prospecting_ai_jobs').update({ status: failed ? 'failed' : 'completed', result: failed ? null : body.result,
        error_code: failed ? 'local_research_failed' : null, completed_at: new Date().toISOString(), locked_until: null,
      }).eq('id', body.jobId).eq('organization_id', organizationId).eq('status', 'processing').eq('lease_id', body.leaseId).gt('locked_until', new Date().toISOString()).select('id')
      if (done.error) throw new ProspectingError('local_complete_failed', 500)
      return json({ accepted: Boolean(done.data?.length) })
    }
    const authorization = request.headers.get('authorization') ?? ''
    if (!/^Bearer \S+$/i.test(authorization)) throw new ProspectingError('unauthorized', 401)
    const client = createClient(url, publicKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
    const user = await client.auth.getUser()
    if (user.error || !user.data.user) throw new ProspectingError('unauthorized', 401)
    const permission = await client.rpc('can_write_organization', { p_organization_id: organizationId })
    if (permission.error || permission.data !== true) throw new ProspectingError('workspace_forbidden', 403)
    if (body.action === 'cancel') {
      if (typeof body.jobId !== 'string' || !uuid.test(body.jobId)) throw new ProspectingError('invalid_job')
      const cancelled = await admin.from('prospecting_ai_jobs').update({ status: 'cancelled', completed_at: new Date().toISOString() }).eq('id', body.jobId).eq('organization_id', organizationId).eq('created_by', user.data.user.id).in('status', ['queued', 'processing'])
      if (cancelled.error) throw new ProspectingError('local_cancel_failed', 500)
      return json({ cancelled: true })
    }
    const membership = await client.from('organization_members').select('role').eq('organization_id', organizationId).eq('user_id', user.data.user.id).maybeSingle()
    if (membership.error || !['owner', 'admin'].includes(membership.data?.role ?? '')) throw new ProspectingError('connector_admin_required', 403)
    if (body.action === 'register') {
      const token = [...crypto.getRandomValues(new Uint8Array(32))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
      const saved = await admin.from('prospecting_local_connectors').upsert({ organization_id: organizationId, token_hash: await hash(token), enabled: true, last_seen_at: null, created_by: user.data.user.id, updated_at: new Date().toISOString() })
      if (saved.error) throw new ProspectingError('local_connector_unavailable', 503)
      return json({ token })
    }
    if (body.action === 'disconnect') {
      const revoked = await admin.from('prospecting_local_connectors').update({ enabled: false, updated_at: new Date().toISOString() }).eq('organization_id', organizationId)
      if (revoked.error) throw new ProspectingError('local_connector_unavailable', 503)
      return json({ disconnected: true })
    }
    throw new ProspectingError('invalid_action')
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: 'invalid_json' }, 400)
    if (error instanceof ProspectingError) return json({ error: error.code }, error.status)
    return json({ error: 'local_connector_failed' }, 500)
  }
})
