import test from 'node:test'
import assert from 'node:assert/strict'
import { connectorConfig, localResearch, runLocalJob, workerClient } from './bridge.mjs'

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
