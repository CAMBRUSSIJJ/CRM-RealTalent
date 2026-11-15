import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { contextualCommercialAdvice, adaptiveResearchPlan } from './intelligence-g8.mjs'
import { stageJournal, stagedLocalResearch } from './staged-research.mjs'
import { parseAiSearchResult } from '../../supabase/functions/_shared/prospecting-ai.ts'

test('commercial questions use the observed service rather than assuming scheduling problems', () => {
  const intelligence = { offerings: [{ label: 'Manutenção de motores', sourceUrl: 'https://empresa.com.br' }], prices: [], positioning: [] }
  const advice = contextualCommercialAdvice({ intelligence })
  assert.match(advice.questions[0], /Manutenção de motores/)
  assert.ok(!advice.questions.join(' ').includes('agendamento'))
  assert.match(advice.hypotheses[0], /não há evidência de um problema/)
  assert.deepEqual(contextualCommercialAdvice({ intelligence: { offerings: [], prices: [] } }).hypotheses, [])
})
test('booking and price observations produce specific discovery questions', () => {
  const advice = contextualCommercialAdvice({ intelligence: {
    offerings: [{ label: 'Barba completa' }], prices: [{ label: 'Barba completa', amount: 'R$ 45' }], positioning: [],
  }, facts: [{ field: 'bookingUrl', sourceUrl: 'https://empresa.com.br/agenda' }] })
  assert.match(advice.questions[0], /canal de agendamento divulgado/)
  assert.ok(advice.questions.some((question) => question.includes('R$ 45') && question.includes('Barba completa')))
})
test('adaptive discovery targets gaps and respects the low-memory search budget', () => {
  const input = { segment: 'Fainer Barber', city: 'Canoas' }
  const args = { input, plan: { queries: ['geral', 'geral', 'outra'] }, multiQueries: ['multicanal', 'outro canal'], lowMemory: true }
  const missing = adaptiveResearchPlan({ ...args, sources: [] })
  assert.match(missing.queries[0], /catálogo/)
  assert.equal(missing.queries.length, new Set(missing.queries).size)
  assert.ok(missing.queries.length <= 4)
  const complete = adaptiveResearchPlan({ ...args, sources: [{ content: 'Nossos serviços. Agendamento e contato disponíveis.' }] })
  assert.deepEqual(complete.gaps, [])
  assert.equal(complete.queries[0], 'multicanal')
})

test('resumed company research reports optional Instagram limitations without an essential failure', async () => {
  const original = process.env.GARIMPO_JOB_STORAGE_DIR
  const folder = await mkdtemp(join(tmpdir(), 'garimpo-g8-'))
  process.env.GARIMPO_JOB_STORAGE_DIR = folder
  try {
    const input = { organizationId: randomUUID(), source: 'manual', segment: 'Fainer Barber', city: 'Canoas', query: '', limit: 1 }
    const jobId = randomUUID(), at = new Date().toISOString()
    const source = { url: 'https://fainer.com.br/', title: 'Fainer Barber', content: 'Fainer Barber em Canoas. Serviço de barba completa.' }
    const intelligence = { version: 'G7', status: 'partial_evidence', extraction: 'literal_only', sourceCount: 1,
      offerings: [{ label: 'Barba completa', excerpt: 'Serviço de barba completa.', sourceUrl: source.url, channel: 'website_or_web' }],
      prices: [], positioning: [], missing: [], hypotheses: [], questions: [], recommendedAction: '' }
    const facts = { leads: [{ company: input.segment, city: input.city, phone: '', email: '', address: '', cnpj: '', instagram: '', website: source.url, bookingUrl: '', systemName: '', whatsappUrl: '',
      aiResearch: { sources: [source], evidence: [], opportunity: '', suggestedApproach: '', missingFields: [], researchedAt: at } }], warnings: [], researchedAt: at }
    const trace = ['website', 'web', 'facts', 'business'].map((stage) => ({ stage, phaseStatus: 'completed', sourceCount: 1, leadCount: 1, at }))
    trace.push({ stage: 'instagram', phaseStatus: 'failed', sourceCount: 1, leadCount: 1, at, errorCode: 'instagram_posts_unavailable' })
    await stageJournal(jobId, input).save('business', { sources: [source], warnings: [], trace, facts, leadIntelligence: intelligence,
      commercialBrief: { status: 'evidence_based', segment: 'beleza', summary: 'Serviços publicados.', knownFacts: [], missing: [], signals: [], hypotheses: [], questions: [], recommendedAction: '', researchLimits: [] } })
    const done = await stagedLocalResearch({ input, jobId, signal: new AbortController().signal,
      values: { PROSPECTING_AI_MODEL: 'qwen3:8b', GARIMPO_MEMORY_PROFILE: 'low' }, model: {},
      fetcher: async () => { throw new Error('A completed stage must not be fetched again') }, onProgress: async () => {} })
    assert.equal(done.researchStatus, 'limited')
    assert.equal(done.contractVersion, 'garimpo-research/8')
    assert.equal(done.runtime.model, 'qwen3:8b')
    assert.match(done.leadIntelligence.questions[0], /Barba completa/)
    assert.equal(done.providers.find((provider) => provider.name === 'Crawl4AI').used, false)
    assert.equal(parseAiSearchResult(done), done)
  } finally {
    if (original === undefined) delete process.env.GARIMPO_JOB_STORAGE_DIR
    else process.env.GARIMPO_JOB_STORAGE_DIR = original
    await rm(folder, { recursive: true, force: true })
  }
})

test('resuming an interrupted search preserves its query budget and skips recorded queries', async () => {
  const previous = process.env.GARIMPO_JOB_STORAGE_DIR
  const folder = await mkdtemp(join(tmpdir(), 'garimpo-g8-resume-'))
  process.env.GARIMPO_JOB_STORAGE_DIR = folder
  try {
    const input = { organizationId: randomUUID(), source: 'manual', segment: 'Oficina G8', city: 'Canoas', query: '', limit: 1 }
    const jobId = randomUUID(), at = new Date().toISOString(), queries = []
    await stageJournal(jobId, input).save('web', {
      sources: [], warnings: [], trace: [
        { stage: 'website', phaseStatus: 'completed', sourceCount: 0, leadCount: 0, at },
        { stage: 'web', phaseStatus: 'running', sourceCount: 0, leadCount: 0, at },
        { stage: 'instagram', phaseStatus: 'completed', sourceCount: 0, leadCount: 0, at },
      ],
      adaptive: { gaps: ['serviços'], queries: ['consulta já registrada', 'consulta restante'] },
      researchAttempts: [{ query: 'consulta já registrada', status: 'completed' }],
    })
    const done = await stagedLocalResearch({ input, jobId, signal: new AbortController().signal,
      values: { GARIMPO_MEMORY_PROFILE: 'low', GARIMPO_G6_AI_PLAN: 'false' }, model: {},
      fetcher: async (_url, options) => {
        queries.push(JSON.parse(options.body).query)
        return new Response(JSON.stringify({ success: true, data: { web: [] } }), { headers: { 'content-type': 'application/json' } })
      }, onProgress: async () => {} })
    assert.deepEqual(queries, ['consulta restante'])
    assert.equal(done.adaptiveResearch.queriesExecuted, 2)
    assert.equal(parseAiSearchResult(done), done)
  } finally {
    if (previous === undefined) delete process.env.GARIMPO_JOB_STORAGE_DIR
    else process.env.GARIMPO_JOB_STORAGE_DIR = previous
    await rm(folder, { recursive: true, force: true })
  }
})
