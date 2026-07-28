import { adminClient, assertWorkerSecret, claimJobs, completeJob, ensureFreshToken, failJob, json, safeMessage } from '../_shared/integration-runtime.ts'
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return json({}, 204)
  try { assertWorkerSecret(request) } catch { return json({ error: 'Não autorizado' }, 401) }
  const admin = adminClient()
  const body = await request.json().catch(() => ({})) as { limit?: number }
  try {
    const jobs = await claimJobs(admin, 'token-refresh', ['credential_refresh'], Number(body.limit || 20))
    const results = []
    for (const job of jobs) {
      const started = Date.now()
      try {
        const account = job.integration_connected_accounts
        if (!account) throw new Error('Conta não encontrada')
        if (account.status !== 'connected' || !account.has_credential) { await completeJob(admin, job, started, { skipped: true, reason: 'account_not_connected' }); results.push({ id: job.id, status: 'skipped' }); continue }
        await ensureFreshToken(admin, { ...account, token_expires_at: new Date(0).toISOString() })
        await completeJob(admin, job, started, { refreshed: true })
        results.push({ id: job.id, status: 'succeeded' })
      } catch (error) { results.push({ id: job.id, ...(await failJob(admin, job, started, error)) }) }
    }
    return json({ worker: 'token-refresh', processed: results.length, results })
  } catch (error) { return json({ error: safeMessage(error) }, 500) }
})
