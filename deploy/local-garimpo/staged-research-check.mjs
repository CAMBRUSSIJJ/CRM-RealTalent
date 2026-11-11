import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stageJournal, stagedLocalResearch } from './staged-research.mjs'

test('separates collection phases, retains verified company if model fails and resumes from checkpoint', async () => {
  const originalHome = process.env.HOME
  const home = await mkdtemp(join(tmpdir(), 'realtalent-stage-test-'))
  process.env.HOME = home
  const jobId = 'aaaaaaaa-0000-4000-8000-000000000123'
  const input = {
    organizationId: 'aaaaaaaa-0000-4000-8000-000000000001', segment: 'Fainer Barber',
    city: 'Rio Grande', source: 'manual', query: 'cadastro empresarial',
    website: 'https://kortar.com.br/barbearias/rio-grande/fainer-barber',
    limit: 1,
  }
  const statuses = []
  const calls = []
  const fetcher = async (url) => {
    calls.push(String(url))
    if (String(url).endsWith('/scrape')) return new Response(JSON.stringify({
      success: true, data: { metadata: { title: 'Fainer Barber' }, markdown: 'Fainer Barber — Rio Grande. Agendamento público.' },
    }))
    // Both web and Instagram searches are allowed to fail independently.
    return new Response('{"success":false}', { status: 503 })
  }
  try {
    const arg = { input, signal: new AbortController().signal,
      values: { FIRECRAWL_API_URL: 'http://127.0.0.1:3002', GARIMPO_MEMORY_PROFILE: 'low' },
      fetcher, model: {}, jobId,
      onProgress: async (s) => { statuses.push(s) },
    }
    const done = await stagedLocalResearch(arg)
    assert.equal(done.leads.length, 1)
    assert.equal(done.leads[0].company, 'Fainer Barber')
    assert.ok(done.warnings.some((warning) => warning.includes('web principal')))
    assert.ok(done.warnings.some((warning) => warning.includes('Instagram')))
    assert.ok(statuses.some((item) => item.stage === 'website' && item.phaseStatus === 'completed'))
    assert.ok(statuses.some((item) => item.stage === 'web' && item.phaseStatus === 'failed'))
    assert.ok(statuses.some((item) => item.stage === 'facts' && item.phaseStatus === 'failed'))
    const persisted = await stageJournal(jobId, input).load()
    assert.equal(persisted.stage, 'completed')
    assert.equal(persisted.facts.leads[0].company, 'Fainer Barber')
    const before = calls.length
    const rerun = await stagedLocalResearch(arg)
    assert.equal(rerun.leads[0].company, 'Fainer Barber')
    assert.equal(calls.length, before, 'resume must not repeat completed web requests')
  } finally {
    if (originalHome === undefined) delete process.env.HOME
    else process.env.HOME = originalHome
    await rm(home, { recursive: true, force: true })
  }
})
