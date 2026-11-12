import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildResearchPlan, refineResearchPlan, selectDeepPages,
  crawl4aiEndpoint, crawl4aiContent, readDeepPage,
  prioritizeEvidenceSources, selectBusinessSearchHits, buildCommercialBrief, refineCommercialBrief,
} from './research-g6.mjs'
import { stagedLocalResearch, stageJournal } from './staged-research.mjs'

test('G6 builds different bounded investigation plans per business sector', () => {
  const barber = buildResearchPlan({ segment: 'Fainer Barber', city: 'Rio Grande, RS', query: '' })
  const school = buildResearchPlan({ segment: 'Escola Municipal', city: 'Pelotas, RS', query: '' })
  assert.equal(barber.version, 'G6')
  assert.equal(barber.segment, 'beleza')
  assert.equal(school.segment, 'educacao')
  assert.ok(barber.questions.some((q) => q.includes('agendamento')))
  assert.ok(school.questions.some((q) => q.includes('cursos')))
  assert.notDeepEqual(barber.queries.slice(1), school.queries.slice(1))
  assert.equal(barber.queries.length, 3)
  assert.equal(barber.budget.lowMemorySearches, 2)
  assert.ok(barber.queries.every((q) => q.includes('Rio Grande') && q.length <= 190))
})

test('G6 Ollama can reorder permitted priorities only, never inject new targets', async () => {
  const plan = buildResearchPlan({ segment: 'Fainer Barber', city: 'Rio Grande', query: '' })
  const refined = await refineResearchPlan(plan, {
    model: {}, signal: new AbortController().signal, Output: { object: (x) => x },
    jsonSchema: (x) => x, generate: async () => ({
      output: { priorityOrder: ['equipe', 'new-untrusted-target', 'agendamento', 'equipe'] },
    }),
  })
  assert.equal(refined.priorities[0], 'equipe')
  assert.equal(refined.priorities[1], 'agendamento')
  assert.equal(refined.priorities.includes('new-untrusted-target'), false)
  assert.deepEqual(refined.queries, plan.queries)
  assert.equal(refined.strategy, 'ollama_bounded')
})

test('G6 only explores relevant public same-host pages, not arbitrary directory businesses', () => {
  const input = { segment: 'Fainer Barber', city: 'Rio Grande' }
  const ownedSite = 'https://fainerbarber.com.br/'
  assert.deepEqual(selectDeepPages(input, ownedSite, [
    'https://fainerbarber.com.br/servicos',
    'https://fainerbarber.com.br/contato',
    'https://fainerbarber.com.br/login',
    'https://evil.example.net/servicos',
    'https://fainerbarber.com.br/checkout',
    'http://127.0.0.1/private',
  ], 2), ['https://fainerbarber.com.br/contato', 'https://fainerbarber.com.br/servicos'])
  const directory = 'https://kortar.com.br/barbearias/rio-grande/fainer-barber'
  const pages = selectDeepPages(input, directory, [
    'https://kortar.com.br/barbearias/rio-grande/other-barber',
    'https://kortar.com.br/contato',
    'https://kortar.com.br/barbearias/rio-grande/fainer-barber/agendar',
  ], 2)
  assert.deepEqual(pages, ['https://kortar.com.br/barbearias/rio-grande/fainer-barber/agendar'])
})

test('G6 optional Crawl4AI is strictly local and accepts documented response shapes', () => {
  assert.equal(crawl4aiEndpoint('http://127.0.0.1:11235/'), 'http://127.0.0.1:11235/crawl')
  assert.equal(crawl4aiEndpoint('https://remote.example.com/'), '')
  assert.equal(crawl4aiEndpoint('http://localhost:11235/private'), '')
  assert.equal(crawl4aiEndpoint('http://127.0.0.1:11235/?token=secret'), '')
  assert.ok(crawl4aiContent({ results: [{
    success: true, markdown: { raw_markdown: 'Barbearia Fainer — '.repeat(5) },
  }] }).includes('Barbearia'))
  assert.equal(crawl4aiContent({ results: [{ success: false, markdown: 'fake' }] }), '')
})

test('G6 crawls sequentially with optional local Crawl4AI, falling back to Firecrawl', async () => {
  const site = 'https://fainerbarber.example.org/servicos'
  const signal = new AbortController().signal
  const fromCrawl = await readDeepPage({
    url: site, crawl4aiUrl: 'http://127.0.0.1:11235/',
    fetcher: async (url, options) => {
      assert.equal(url, 'http://127.0.0.1:11235/crawl')
      assert.deepEqual(JSON.parse(options.body).urls, [site])
      return new Response(JSON.stringify({ results: [{
        success: true, markdown: 'Fainer Barber, Rio Grande. '.repeat(8),
      }] }))
    },
    callFirecrawl: async () => { throw new Error('should not call Firecrawl when Crawl4AI succeeds') },
    signal,
  })
  assert.equal(fromCrawl.reader, 'crawl4ai')
  const fallback = await readDeepPage({
    url: site, crawl4aiUrl: 'http://127.0.0.1:11235/',
    fetcher: async () => { throw new Error('Crawl4AI unavailable') },
    callFirecrawl: async (_path, payload) => {
      assert.equal(payload.url, site)
      return { data: { metadata: { title: 'Serviços' }, markdown: 'Fainer Barber. '.repeat(8) } }
    },
    signal,
  })
  assert.equal(fallback.reader, 'firecrawl')
})

test('G6 rejects unassociated web hits and city homonyms before allocating evidence slots', () => {
  const input = { segment: 'Fainer Barber', city: 'Rio Grande, RS' }
  const results = [
    { url: 'https://kortar.com.br/barbearias/pelotas/king-bravos-barber',
      title: 'King Bravos Barber — Pelotas', markdown: 'Outra empresa.' },
    { url: 'https://kortar.com.br/barbearias/rio-grande/fainer-barber',
      title: 'Fainer Barber — Rio Grande', description: 'Agendamentos e atendimento.' },
    { url: 'https://barbearias.example.net/pelotas/fainer-barber',
      title: 'Fainer Barber — Pelotas', description: 'Empresa com o mesmo nome em outra cidade.' },
  ]
  const selected = selectBusinessSearchHits(input, results)
  assert.deepEqual(selected.map((item) => item.url), [results[1].url])
})

test('G6 prioritizes company identity and contact facts before unrelated sources', () => {
  const input = { segment: 'Fainer Barber', city: 'Rio Grande, RS',
    website: 'https://kortar.com.br/barbearias/rio-grande/fainer-barber' }
  const sources = [
    { url: 'https://somewhere.example.org/unrelated', title: 'Barber outra',
      content: 'Barbearia em Rio Grande com serviços e atendimento' },
    { url: input.website, title: 'Fainer Barber Rio Grande',
      content: 'Fainer Barber em Rio Grande, telefone (53) 99157-9674' },
  ]
  const ranked = prioritizeEvidenceSources(input, sources)
  assert.equal(ranked[0].url, input.website)
  assert.equal(ranked.length, 2)
})

test('G6 commercial brief distinguishes literal evidence and consultative hypotheses', () => {
  const website = 'https://kortar.com.br/barbearias/rio-grande/fainer-barber'
  const plan = buildResearchPlan({ segment: 'Fainer Barber', city: 'Rio Grande' })
  const result = { leads: [{ company: 'Fainer Barber', phone: '(53) 99157-9674',
    city: 'Rio Grande', bookingUrl: '',
    aiResearch: {
      evidence: [
        { field: 'company', value: 'Fainer Barber', sourceUrl: website },
        { field: 'phone', value: '(53) 99157-9674', sourceUrl: website },
      ],
      missingFields: ['instagram','cnpj','email','bookingUrl'],
      signals: [], sources: [{ url: website, title: 'Kortar' }],
    },
  }] }
  const brief = buildCommercialBrief({
    input: { segment: 'Fainer Barber', city: 'Rio Grande' },
    plan, result, instagramDiscovery: { status: 'provided', postCount: 0 },
  })
  assert.equal(brief.status, 'evidence_based')
  assert.equal(brief.knownFacts.length, 2)
  assert.equal(brief.knownFacts[1].sourceUrl, website)
  assert.ok(brief.missing.includes('Instagram'))
  assert.ok(brief.hypotheses.every((h) => /investigar/i.test(h)))
  assert.ok(brief.researchLimits.some((value) => value.includes('Instagram')))
  assert.equal(brief.signals.length, 0)
  assert.ok(brief.questions.length > 0)
  const empty = buildCommercialBrief({ input: {}, plan,
    result: { leads: [] }, instagramDiscovery: null })
  assert.equal(empty.status, 'insufficient_evidence')
  assert.deepEqual(empty.knownFacts, [])
})

test('G6 generated follow-up questions cannot modify verified facts or recorded sources', async () => {
  const plan = buildResearchPlan({ segment: 'Fainer Barber', city: 'Rio Grande' })
  const brief = buildCommercialBrief({
    input: {}, plan, instagramDiscovery: null,
    result: { leads: [{ aiResearch: {
      evidence: [{ field: 'company', value: 'Fainer Barber', sourceUrl: 'https://kortar.com.br/fainer' }],
      missingFields: ['cnpj'], signals: [],
    } }] },
  })
  const transformed = await refineCommercialBrief(brief, {
    model: {}, Output: { object: (x) => x }, jsonSchema: (x) => x,
    signal: new AbortController().signal,
    generate: async () => ({ output: {
      questions: ['Como organiza a agenda?', 'A empresa tem 200 funcionários', 'Quais serviços priorizam?'],
      recommendedAction: 'A empresa está expandindo; venda imediatamente!',
    } }),
  })
  assert.deepEqual(transformed.knownFacts, brief.knownFacts)
  assert.equal(transformed.recommendedAction, brief.recommendedAction)
  assert.equal(transformed.questions.includes('A empresa tem 200 funcionários'), false)
  assert.equal(transformed.planner, 'ollama_questions')
})

test('G6 runs two targeted searches on low RAM, deep-reads own page and keeps checkpoint', async () => {
  const originalHome = process.env.HOME
  const home = await mkdtemp(join(tmpdir(), 'realtalent-g6-'))
  process.env.HOME = home
  const website = 'https://fainerbarber.example.org/'
  const deepUrl = 'https://fainerbarber.example.org/servicos'
  const input = { organizationId: 'aaaaaaaa-0000-4000-8000-000000000001',
    segment: 'Fainer Barber', city: 'Rio Grande, RS',
    website, query: '', source: 'manual', limit: 1 }
  const queries = []
  const scrapes = []
  try {
    const result = await stagedLocalResearch({
      input, model: {}, signal: new AbortController().signal,
      values: { FIRECRAWL_API_URL: 'http://127.0.0.1:3002',
        GARIMPO_MEMORY_PROFILE: 'low' },
      jobId: 'aaaaaaaa-0000-4000-8000-000000000666', onProgress: async () => {},
      fetcher: async (url, opts) => {
        const data = JSON.parse(opts.body)
        if (String(url).endsWith('/scrape')) {
          scrapes.push(data.url)
          if (data.url === website) return new Response(JSON.stringify({
            success: true, data: { markdown: 'Fainer Barber — Rio Grande (53) 99157-9674. Serviços e agendamento.',
              links: [deepUrl, 'https://evil.example.com/servicos'], metadata: { title: 'Fainer Barber' } },
          }))
          if (data.url === deepUrl) return new Response(JSON.stringify({
            success: true, data: { markdown: 'Fainer Barber Rio Grande. Corte de cabelo e barba são serviços divulgados.',
              metadata: { title: 'Serviços da Fainer Barber' } },
          }))
        }
        if (data.query) queries.push(data.query)
        return new Response(JSON.stringify({ success: true, data: { web: [] } }))
      },
      generate: async () => { throw new Error('Ollama offline for test: literal evidence should remain') },
    })
    const expected = buildResearchPlan(input)
    assert.ok(expected.queries.slice(0, 2).every((q) => queries.includes(q)))
    assert.ok(scrapes.includes(deepUrl), 'G6 reads relevant own-site page')
    assert.ok(!scrapes.some((url) => url.includes('evil.example.com')))
    assert.equal(result.researchPlan.segment, 'beleza')
    assert.equal(result.commercialBrief.status, 'evidence_based')
    assert.ok(result.commercialBrief.knownFacts.some((item) => item.field === 'phone'))
    assert.equal(result.leads[0].phone, '(53) 99157-9674')
    const journal = await stageJournal('aaaaaaaa-0000-4000-8000-000000000666', input).load()
    assert.equal(journal.stage, 'completed')
    assert.ok(journal.researchPlan)
    assert.ok(journal.commercialBrief)
  } finally {
    if (originalHome === undefined) delete process.env.HOME
    else process.env.HOME = originalHome
    await rm(home, { recursive: true, force: true })
  }
})
