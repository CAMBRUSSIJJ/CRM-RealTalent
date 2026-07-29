import { adminClient, assertWorkerSecret, claimJobs, completeJob, ensureFreshToken, failJob, json, recordDiagnostic, safeMessage } from '../_shared/integration-runtime.ts'

const endpointFor = (provider: string) => provider === 'google'
  ? 'https://openidconnect.googleapis.com/v1/userinfo'
  : provider === 'microsoft'
    ? 'https://graph.microsoft.com/v1.0/me?$select=id,displayName,userPrincipalName'
    : `https://graph.facebook.com/${Deno.env.get('META_GRAPH_VERSION') || 'v23.0'}/me?fields=id,name`

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return json({}, 204)
  try { assertWorkerSecret(request) } catch { return json({ error: 'Não autorizado' }, 401) }
  const admin = adminClient()
  const body = await request.json().catch(() => ({})) as { limit?: number }
  try {
    const jobs = await claimJobs(admin, 'integration-health', ['account_health_check'], Number(body.limit || 20))
    const results = []
    for (const job of jobs) {
      const started = Date.now()
      const runId = crypto.randomUUID()
      try {
        const account = job.integration_connected_accounts
        if (!account) throw new Error('Conta não encontrada')
        if (account.status !== 'connected' || !account.has_credential) { await completeJob(admin, job, started, { skipped: true, reason: 'account_not_connected' }); results.push({ id: job.id, status: 'skipped' }); continue }
        const token = await ensureFreshToken(admin, account)
        const response = await fetch(endpointFor(account.provider), { headers: { authorization: `Bearer ${token}` } })
        const payload = await response.json().catch(() => ({})) as Record<string, unknown>
        if (!response.ok) throw new Error(String((payload.error as any)?.message || 'O provedor recusou a credencial'))
        const latency = Date.now() - started
        await admin.from('integration_connected_accounts').update({ last_tested_at: new Date().toISOString(), last_test_status: 'pass', last_test_latency_ms: latency, last_error: null }).eq('id', account.id)
        await recordDiagnostic(admin, { organizationId: account.organization_id, accountId: account.id, provider: account.provider, runId, checkKey: 'provider_api', status: 'pass', message: 'Credencial validada diretamente no provedor', latencyMs: latency })
        await completeJob(admin, job, started, { tested: true, latency_ms: latency })
        results.push({ id: job.id, status: 'succeeded', latencyMs: latency })
      } catch (error) {
        const account = job.integration_connected_accounts
        if (account) {
          await admin.from('integration_connected_accounts').update({ last_tested_at: new Date().toISOString(), last_test_status: 'fail', last_test_latency_ms: Date.now() - started, last_error: safeMessage(error) }).eq('id', account.id)
          await recordDiagnostic(admin, { organizationId: account.organization_id, accountId: account.id, provider: account.provider, runId, checkKey: 'provider_api', status: 'fail', message: safeMessage(error), latencyMs: Date.now() - started })
        }
        results.push({ id: job.id, ...(await failJob(admin, job, started, error)) })
      }
    }
    return json({ worker: 'integration-health', processed: results.length, results })
  } catch (error) { return json({ error: safeMessage(error) }, 500) }
})
