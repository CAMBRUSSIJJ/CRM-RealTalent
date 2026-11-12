import test from 'node:test'
import assert from 'node:assert/strict'
import { validateCommercialIntelligence, literalPriceCandidates, buildLeadIntelligence } from './lead-intelligence-g7.mjs'

const companyPage = {
  url: 'https://alphabarbearia.example.com/servicos',
  title: 'Alpha Barbearia | Serviços',
  content: 'Alpha Barbearia Rio Grande. Corte de cabelo R$ 45,00\nBarba R$ 30,00\nAtendimento personalizado para clientes.',
}
const instagramPost = {
  url: 'https://www.instagram.com/p/abc123/',
  title: 'Alpha Barber Instagram',
  content: 'Novo serviço de hidratação capilar disponível no salão de Rio Grande.',
}

test('G7 accepts only literal offerings, monetary prices and positioning with original URL', () => {
  const rows = validateCommercialIntelligence({
    offerings: [
      { label: 'Corte de cabelo', excerpt: 'Corte de cabelo R$ 45,00', sourceUrl: companyPage.url },
      { label: 'Massagem terapêutica', excerpt: 'Massagem terapêutica R$ 80', sourceUrl: companyPage.url },
      { label: 'hidratação capilar', excerpt: 'Novo serviço de hidratação capilar disponível no salão de Rio Grande.', sourceUrl: instagramPost.url },
    ],
    prices: [
      { label: 'Corte de cabelo', amount: 'R$ 45,00', excerpt: 'Corte de cabelo R$ 45,00', sourceUrl: companyPage.url },
      { label: 'Ticket médio', amount: 'R$ 250,00', excerpt: 'Corte de cabelo R$ 45,00', sourceUrl: companyPage.url },
    ],
    positioning: [
      { label: 'personalizado', excerpt: 'Atendimento personalizado para clientes.', sourceUrl: companyPage.url },
      { label: 'premium', excerpt: 'Atendimento personalizado para clientes.', sourceUrl: companyPage.url },
    ],
  }, [companyPage, instagramPost])
  assert.equal(rows.offerings.length, 2)
  assert.equal(rows.prices.length, 1)
  assert.equal(rows.prices[0].amount, 'R$ 45,00')
  assert.equal(rows.positioning.length, 1)
  assert.equal(rows.positioning[0].label, 'personalizado')
  assert.equal(rows.offerings[1].channel, 'instagram')
})

test('G7 never accepts a plausible but unrelated source URL', () => {
  const fake = validateCommercialIntelligence({ offerings: [
    { label: 'Corte de cabelo', excerpt: 'Corte de cabelo R$ 45,00',
      sourceUrl: 'https://outra-empresa.example.com/menu' },
  ] }, [companyPage])
  assert.deepEqual(fake.offerings, [])
})

test('G7 finds only explicit published R$ amounts, never estimates ticket', () => {
  const prices = literalPriceCandidates([companyPage])
  assert.ok(prices.some((entry) => entry.amount === 'R$ 45,00'))
  assert.ok(prices.some((entry) => entry.amount === 'R$ 30,00'))
  assert.equal(prices.some((entry) => /ticket/i.test(entry.label)), false)
})

test('G7 produces a cited fallback with Ollama unavailable and reports missing fields', async () => {
  const intelligence = await buildLeadIntelligence({
    sources: [companyPage], instagramDiscovery: { postCount: 0 },
    model: null, signal: new AbortController().signal,
  })
  assert.equal(intelligence.version, 'G7')
  assert.equal(intelligence.extraction, 'literal_only')
  assert.ok(intelligence.prices.length > 0)
  assert.ok(intelligence.missing.some((gap) => gap.includes('Instagram')))
  assert.equal(intelligence.positioning.length, 0)
})

test('G7 discards fabricated fields from Ollama but keeps source-cited facts', async () => {
  const output = {
    offerings: [
      { label: 'Corte de cabelo', excerpt: 'Corte de cabelo R$ 45,00', sourceUrl: companyPage.url },
      { label: 'Botox capilar', excerpt: 'Botox capilar exclusivo', sourceUrl: companyPage.url },
    ],
    prices: [{ label: 'Massagem', amount: 'R$ 300,00', excerpt: 'Massagem R$ 300,00', sourceUrl: companyPage.url }],
    positioning: [{ label: 'premium', excerpt: 'Atendimento premium', sourceUrl: companyPage.url }],
  }
  const intelligence = await buildLeadIntelligence({
    sources: [companyPage], instagramDiscovery: { postCount: 0 },
    model: { doGenerate: () => {} },
    generate: async () => ({ output }),
    Output: { object: (shape) => shape },
    jsonSchema: (shape) => shape,
    signal: new AbortController().signal,
  })
  assert.equal(intelligence.offerings.length, 1)
  assert.equal(intelligence.offerings[0].label, 'Corte de cabelo')
  assert.equal(intelligence.prices.some((entry) => entry.amount === 'R$ 300,00'), false)
  assert.equal(intelligence.positioning.length, 0)
  assert.equal(intelligence.extraction, 'ollama_verified')
})
