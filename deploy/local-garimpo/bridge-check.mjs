import test from 'node:test'
import assert from 'node:assert/strict'
import { connectorConfig, localResearch, runLocalJob, workerClient } from './bridge.mjs'
import { availableMemory, compactLocalSources, hardwareProfile, GiB } from './hardware-profile.mjs'

const org = 'aaaaaaaa-0000-4000-8000-000000000001'
const input = { organizationId: org, segment: 'Barbearias', city: 'Canoas', limit: 1 }
const config = connectorConfig({ SUPABASE_URL: 'https://crm.example.com', GARIMPO_CONNECTOR_TOKEN: 'a'.repeat(64), GARIMPO_WORKSPACE_ID: org, SUPABASE_PUBLISHABLE_KEY: 'public-key' })

test('envia pedidos de saída com token do workspace e rejeita redirecionamentos', async () => {
  let sent
  await workerClient(config, async (url, options) => { sent = { url, options }; return new Response('{"connected":true}') })('heartbeat')
  assert.equal(sent.options.redirect, 'error')
  assert.equal(sent.options.headers['x-connector-token'], config.token)
  assert.equal(JSON.parse(sent.options.body).organizationId, org)
  assert.throws(() => connectorConfig({ SUPABASE_URL: 'http://unsafe.example.com' }))
})

test('entrega o resultado na mesma reserva e não envia mensagens privadas de erro', async () => {
  const calls = []
  const api = async (...args) => { calls.push(args); return { accepted: true } }
  const job = { id: 'job', leaseId: 'lease', input }
  await runLocalJob(api, job, org, async () => ({ leads: [], warnings: [] }))
  assert.equal(calls[0][1].leaseId, 'lease')
  await assert.rejects(runLocalJob(api, job, 'other-workspace', async () => {}), /workspace_mismatch/)
  calls.length = 0
  await runLocalJob(api, job, org, async () => { throw new Error('secret-key') })
  assert.deepEqual(calls[0][1], { jobId: 'job', leaseId: 'lease', failed: true })
})

test('aceita serviços locais e nunca cria empresas sem fontes', async () => {
  const research = localResearch({ PROSPECTING_AI_MODEL: 'qa-model', FIRECRAWL_API_URL: 'http://127.0.0.1:3002', PROSPECTING_AI_BASE_URL: 'http://127.0.0.1:11434/v1' }, async () => new Response('{"success":true,"data":{"web":[]}}'))
  assert.deepEqual((await research(input, new AbortController().signal)).leads, [])
  assert.throws(() => localResearch({ PROSPECTING_AI_MODEL: 'm', PROSPECTING_AI_BASE_URL: 'http://unsafe.example.com/v1' }))
})

test('prioriza o modelo menor em 7,4 GiB e mantém o perfil normal em computadores maiores', () => {
  const installed = [{ name: 'qwen3:8b', size: 5.2e9 }, { name: 'qwen3:4b', size: 2.5e9 }, { name: 'qwen2.5-coder:3b', size: 1.9e9 }]
  const low = hardwareProfile(7.4 * GiB, installed)
  assert.equal(low.economy, true)
  assert.equal(low.models[0], 'qwen2.5-coder:3b')
  assert.equal(hardwareProfile(32 * GiB, installed).models[0], 'qwen3:8b')
  assert.equal(availableMemory('MemFree: 410000 kB\nMemAvailable: 1992294 kB\n'), 1992294 * 1024)
  assert.equal(availableMemory('MemFree: 410000 kB'), null)
})

test('reduz o contexto mantendo contatos e rodapé, sem misturar as fontes', () => {
  const url = 'https://empresa.example.com/'
  const sources = [{ url, title: 'Empresa', content: 'Empresa QA\n' + 'Texto extenso\n'.repeat(4000) + '\nTelefone: (51) 99222-1234\ncontato@empresa.example.com' }]
  const compact = JSON.parse(compactLocalSources(sources, 4000))
  assert.ok(compact[0].content.length <= 4000)
  assert.equal(compact[0].url, url)
  assert.match(compact[0].content, /99222-1234/)
  assert.match(compact[0].content, /contato@empresa.example.com/)
})

test('devolve dados com fontes e libera somente o modelo Ollama usado pelo conector', async () => {
  const url = 'https://empresa.example.com/'
  const calls = []
  const facts = [{ field: 'company', value: 'Empresa QA', sourceUrl: url }, { field: 'city', value: 'Canoas', sourceUrl: url }]
  const fetcher = async (endpoint, options) => {
    const address = String(endpoint)
    calls.push({ address, options })
    if (address.endsWith('/v2/search')) return new Response(JSON.stringify({ success: true, data: { web: [{ url, title: 'Empresa', markdown: 'Empresa QA\nCanoas\n' + 'Texto\n'.repeat(1800) }] } }))
    if (address.endsWith('/chat/completions')) return new Response(JSON.stringify({ id: 'qa', object: 'chat.completion', created: 1, model: 'qwen2.5-coder:3b', choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify({ leads: [{ facts, opportunity: '', suggestedApproach: '', signals: [] }] }) }, finish_reason: 'stop' }] }))
    if (address.endsWith('/api/generate')) return new Response('{"done":true}')
    throw new Error('Endpoint inesperado')
  }
  const research = localResearch({ PROSPECTING_AI_MODEL: 'qwen2.5-coder:3b', GARIMPO_MEMORY_PROFILE: 'low', GARIMPO_OLLAMA_RELEASE: 'true' }, fetcher)
  const result = await research(input, new AbortController().signal)
  assert.equal(result.leads[0].company, 'Empresa QA')
  const release = calls.find((call) => call.address.endsWith('/api/generate'))
  assert.equal(release.address, 'http://127.0.0.1:11434/api/generate')
  assert.deepEqual(JSON.parse(release.options.body), { model: 'qwen2.5-coder:3b', keep_alive: 0, stream: false })
  assert.equal(release.options.headers.authorization, undefined)
})
