import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { essentialDiscovery } from './essential-research.mjs'
import { runEssentialDiscovery } from './essential-python.mjs'
import { localResearch } from './bridge.mjs'

const input = {
  organizationId: 'aaaaaaaa-0000-4000-8000-000000000001',
  segment: 'Barbearias', city: 'Rio Grande, RS',
  source: 'maps', mode: 'essential', limit: 5, query: '',
}
const good = {
  url: 'https://barbearia-atlantico.example.com/',
  title: 'Barbearia Atlântico | Rio Grande, RS',
  content: 'Barbearia Atlântico em Rio Grande. Telefone (53) 99123-4567. Contato: contato@atlantico.com.br.',
}
const unrelated = {
  url: 'https://barbearia-leite.example.com/',
  title: 'Barbearia Leite | Pelotas, RS',
  content: 'Barbearia Leite em Pelotas. Telefone (53) 99888-1122.',
}
const directory = {
  url: 'https://example.org/guia/barbearias-rio-grande',
  title: '10 melhores barbearias em Rio Grande | Guia',
  content: 'Confira 10 melhores barbearias em Rio Grande.',
}

test('essential discovers source-backed public companies without inventing records', () => {
  const result = essentialDiscovery(input, [directory, unrelated, good])
  assert.equal(result.researchMode, 'essential')
  assert.equal(result.leads.length, 1)
  assert.equal(result.leads[0].company, 'Barbearia Atlântico')
  assert.equal(result.leads[0].city, 'Rio Grande')
  assert.equal(result.leads[0].phone, '(53) 99123-4567')
  assert.equal(result.leads[0].email, 'contato@atlantico.com.br')
  assert.deepEqual(result.leads[0].aiResearch.sources.map((s) => s.url), [good.url])
  assert.equal(result.leads[0].aiResearch.opportunity, '')
  assert.equal(result.leads[0].aiResearch.signals.length, 0)
  assert.ok(!result.leads.some((row) => row.phone.includes('99888')))
})

test('empty or generic result does not become a fabricated business', () => {
  assert.equal(essentialDiscovery(input, [directory, unrelated]).leads.length, 0)
  assert.equal(essentialDiscovery(input, []).leads.length, 0)
})

test('legacy queued mode marker chooses essential and never calls an LLM', async () => {
  const calls = []
  const fetcher = async (url) => {
    calls.push(String(url))
    return new Response(JSON.stringify({ success: true, data: { web: [good] } }))
  }
  const research = localResearch({ FIRECRAWL_API_URL: 'http://127.0.0.1:3002' }, fetcher)
  const result = await research({ ...input, mode: undefined, query: 'GARIMPO_MODE_ESSENTIAL' },
    new AbortController().signal)
  assert.equal(result.leads[0].company, 'Barbearia Atlântico')
  assert.equal(result.researchMode, 'essential')
  assert.equal(calls.length, 1)
  assert.ok(calls.every((url) => url.endsWith('/v2/search')), 'no LLM endpoint')
})

test('Python worker is optional; every accepted output goes through canonical evidence validation', async () => {
  const result = await runEssentialDiscovery(input, [good, unrelated])
  assert.equal(result.leads.length, 1)
  assert.equal(result.leads[0].company, 'Barbearia Atlântico')
  assert.ok(['python', 'javascript'].includes(result.extractionEngine))
  const py = spawnSync('python3', ['--version'], { encoding: 'utf8' })
  if (py.status === 0) assert.equal(result.extractionEngine, 'python')
})
