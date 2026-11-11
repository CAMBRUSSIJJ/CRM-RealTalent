import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stageJournal, stagedLocalResearch, classifyStageError, companySources, sourceBackedFallback, extractFactBatches, instagramProfilesInText, instagramProfileUrl, identifyInstagramProfile, postLinkedToProfile } from './staged-research.mjs'

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


test('classifies model failure without exposing exception text', () => {
  assert.equal(classifyStageError({ name: 'TimeoutError' }), 'model_timeout')
  assert.equal(classifyStageError(new Error('CUDA out of memory at private_path')), 'model_out_of_memory')
  assert.equal(classifyStageError({ name: 'AI_NoObjectGeneratedError', message: 'model returned no object' }), 'model_invalid_output')
  assert.equal(classifyStageError(new Error('fetch failed ECONNREFUSED 127.0.0.1')), 'model_unavailable')
  assert.equal(classifyStageError(new Error('unrecognized private details')), 'model_failed')
})

test('pre-extracts only literal contacts from relevant pages and excludes namesakes elsewhere', () => {
  const input = { segment: 'Fainer Barber', city: 'Rio Grande, RS', query: '',
    website: 'https://kortar.com.br/barbearias/rio-grande/fainer-barber' }
  const selected = {
    url: input.website, title: 'Fainer Barber em Rio Grande',
    content: 'Fainer Barber, Rio Grande: (53) 99157-9674. Contato contato@fainer.com.br.',
  }
  const unrelated = { url: 'https://barbeariaoutro.com.br', title: 'Fainer Barber Pelotas',
    content: 'Fainer Barber em Pelotas (53) 98888-8888.' }
  const relevant = companySources(input, [selected, unrelated])
  assert.deepEqual(relevant.map((item) => item.url), [selected.url])
  const result = sourceBackedFallback(input, relevant, JSON.stringify(relevant))
  assert.equal(result.leads[0].company, 'Fainer Barber')
  assert.equal(result.leads[0].phone, '(53) 99157-9674')
  assert.equal(result.leads[0].email, 'contato@fainer.com.br')
})

test('extracts from small sequential source batches, preserving earlier evidence after model failure', async () => {
  const urls = [
    'https://kortar.com.br/barbearias/rio-grande/fainer-barber',
    'https://diretorio.example.com/rio-grande/fainer-barber',
    'https://portal.example.net/rio-grande/fainer-barber',
    'https://extra.example.org/rio-grande/fainer-barber',
  ]
  const sources = urls.map((url) => ({
    url, title: 'Fainer Barber Rio Grande',
    content: 'Fainer Barber Rio Grande telefone (53) 99157-9674 — dados da empresa.',
  }))
  let calls = 0
  const output = await extractFactBatches({
    input: { segment: 'Fainer Barber', city: 'Rio Grande', query: '' },
    sources, model: {}, signal: new AbortController().signal, lowMemory: true,
    generate: async (args) => {
      calls++
      assert.equal(args.prompt.includes(urls[3]), false, 'fourth source must not enter the low-memory model')
      const batch = JSON.parse(args.prompt).sources
      assert.equal(batch.length, 1)
      if (calls === 2) throw new Error('CUDA out of memory (private log)')
      return { output: { leads: [{
        facts: [
          { field: 'company', value: 'Fainer Barber', sourceUrl: batch[0].url },
          { field: 'phone', value: '(53) 99157-9674', sourceUrl: batch[0].url },
        ], opportunity: '', suggestedApproach: '', signals: [],
      }] } }
    },
  })
  assert.equal(calls, 3)
  assert.equal(output.failed.length, 1)
  assert.equal(output.failed[0], 'model_out_of_memory')
  assert.ok(output.extracted.some((fact) => fact.field === 'phone'))
  assert.ok(output.extracted.every((fact) => urls.slice(0, 3).includes(fact.sourceUrl)))
})


test('persists a verifiable contact before Ollama and marks a failed model stage as partial', async () => {
  const originalHome = process.env.HOME
  const home = await mkdtemp(join(tmpdir(), 'realtalent-early-facts-'))
  process.env.HOME = home
  const jobId = 'aaaaaaaa-0000-4000-8000-000000000321'
  const input = {
    organizationId: 'aaaaaaaa-0000-4000-8000-000000000001',
    segment: 'Fainer Barber', city: 'Rio Grande', source: 'manual', query: '',
    website: 'https://kortar.com.br/barbearias/rio-grande/fainer-barber', limit: 1,
  }
  const fetcher = async (url) => String(url).endsWith('/scrape')
    ? new Response(JSON.stringify({
      success: true,
      data: { metadata: { title: 'Fainer Barber Rio Grande' },
        markdown: 'Fainer Barber em Rio Grande. Telefone (53) 99157-9674.' },
    }))
    : new Response(JSON.stringify({ success: true, data: { web: [] } }))
  let inspectedBeforeModel = false
  try {
    const result = await stagedLocalResearch({
      input, signal: new AbortController().signal,
      values: { FIRECRAWL_API_URL: 'http://127.0.0.1:3002', GARIMPO_MEMORY_PROFILE: 'low' },
      fetcher, model: {}, jobId, onProgress: async () => {},
      generate: async () => {
        const interim = await stageJournal(jobId, input).load()
        assert.equal(interim.stage, 'facts')
        assert.equal(interim.facts.leads[0].phone, '(53) 99157-9674')
        inspectedBeforeModel = true
        throw new Error('CUDA out of memory on secret worker machine')
      },
    })
    assert.equal(inspectedBeforeModel, true)
    assert.equal(result.leads[0].phone, '(53) 99157-9674')
    assert.equal(result.researchStatus, 'partial')
    assert.equal(result.stages.find((item) =>
      item.stage === 'facts' && item.phaseStatus === 'failed').errorCode, 'model_out_of_memory')
    assert.equal(result.stages.at(-1).stage, 'completed')
    assert.equal(result.stages.at(-1).phaseStatus, 'completed')
    assert.equal(result.warnings.some((warning) => warning.includes('secret worker machine')), false)
  } finally {
    if (originalHome === undefined) delete process.env.HOME
    else process.env.HOME = originalHome
    await rm(home, { recursive: true, force: true })
  }
})


test('discovers Instagram from the known business page without attributing the directory own account', () => {
  const input = { segment: 'Fainer Barber', city: 'Rio Grande, RS', query: '',
    website: 'https://kortar.com.br/barbearias/rio-grande/fainer-barber' }
  const listing = { url: input.website, title: 'Fainer Barber em Rio Grande',
    content: 'Fainer Barber Rio Grande — Instagram: https://www.instagram.com/fainerbarber/?hl=pt-br. ' +
      'Página do diretório: https://www.instagram.com/kortaroficial/' }
  const discovered = identifyInstagramProfile(input, [listing])
  assert.equal(discovered.profileUrl, 'https://www.instagram.com/fainerbarber/')
  assert.equal(discovered.status, 'linked')
  assert.equal(discovered.evidenceUrl, input.website)
  assert.ok(instagramProfilesInText(listing.content).includes(discovered.profileUrl))
  assert.equal(instagramProfileUrl('https://www.instagram.com/p/Abcde/'), '')
})

test('search profile by matching company and city; never assume homonymous barbers are same company', () => {
  const input = { segment: 'Fainer Barber', city: 'Rio Grande, RS', query: '' }
  const candidate = { url: 'https://www.instagram.com/fainerbarber/', title: 'Fainer Barber — Rio Grande RS',
    description: 'Serviços de barbearia' }
  const unrelated = { url: 'https://www.instagram.com/fainerpelotas/', title: 'Fainer Barber — Pelotas RS',
    description: 'Barbearia em Pelotas' }
  const found = identifyInstagramProfile(input, [], [unrelated, candidate])
  assert.equal(found.status, 'candidate')
  assert.equal(found.profileUrl, candidate.url)
  const notFound = identifyInstagramProfile(input, [], [unrelated])
  assert.equal(notFound.status, 'not_found')
  const provided = identifyInstagramProfile({ ...input, instagram: '@fainerbarber' }, [], [])
  assert.equal(provided.status, 'provided')
})

test('does not attribute an unrelated post to company merely because the search query mentions its name', () => {
  const actual = { url: 'https://www.instagram.com/p/AAAA/', title: 'Fainer Barber (@fainerbarber) • Instagram post',
    description: 'Contratamos uma pessoa para a equipe.' }
  const unrelated = { url: 'https://www.instagram.com/p/BBBB/', title: 'Barbearia Outra (@barbeariaoutra) • Instagram post',
    description: 'Marque @fainerbarber na promoção.' }
  const profile = 'https://www.instagram.com/fainerbarber/'
  assert.equal(postLinkedToProfile(actual, profile), true)
  assert.equal(postLinkedToProfile(unrelated, profile), false)
})

test('Instagram is reported missing with no invented account or signals when searches fail', async () => {
  const originalHome = process.env.HOME
  const home = await mkdtemp(join(tmpdir(), 'realtalent-instagram-missing-'))
  process.env.HOME = home
  try {
    const input = {
      organizationId: 'aaaaaaaa-0000-4000-8000-000000000001',
      segment: 'Fainer Barber', city: 'Rio Grande', source: 'manual', query: '', limit: 1,
      website: 'https://kortar.com.br/barbearias/rio-grande/fainer-barber',
    }
    const result = await stagedLocalResearch({
      input, jobId: 'aaaaaaaa-0000-4000-8000-000000000777', model: {},
      signal: new AbortController().signal,
      values: { FIRECRAWL_API_URL: 'http://127.0.0.1:3002', GARIMPO_MEMORY_PROFILE: 'low' },
      onProgress: async () => {},
      fetcher: async (url) => new Response(JSON.stringify(String(url).endsWith('/scrape')
        ? { success: true, data: { metadata: { title: 'Fainer Barber' },
          markdown: 'Fainer Barber, Rio Grande, telefone (53) 99157-9674.' } }
        : { success: true, data: { web: [] } })),
      generate: async () => { throw new Error('private failure') },
    })
    assert.equal(result.instagramDiscovery.status, 'not_found')
    assert.equal(result.instagramDiscovery.postCount, 0)
    assert.equal(result.leads[0].instagram, '')
    assert.equal(result.leads[0].aiResearch.signals.length, 0)
  } finally {
    if (originalHome === undefined) delete process.env.HOME
    else process.env.HOME = originalHome
    await rm(home, { recursive: true, force: true })
  }
})
