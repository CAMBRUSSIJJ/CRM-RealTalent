import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMultiChannelQueries, multiChannelCoverage, sourceChannel } from './multichannel-g7.mjs'
import { buildLeadIntelligence, validateCommercialIntelligence } from './lead-intelligence-g7.mjs'
import { instagramReadableText } from './staged-research.mjs'

const site = 'https://sites.appbarber.com.br/fainerbarber-wpm'
const record = { segment: 'Fainer Barber', city: 'Rio Grande, RS', website: site }
const booking = {
  url: site, title: 'Fainer Barber Serviços Agendamento',
  content: 'Fainer Barber, Rio Grande RS. Corte de cabelo R$ 45,00\nBarba R$ 30,00\nAgendamento online.',
}
const reviews = {
  url: 'https://www.google.com/maps/place/fainer-barber', title: 'Fainer Barber — Avaliações',
  content: 'Fainer Barber Rio Grande RS — Avaliação: Ótimo atendimento e ambiente agradável.',
}

test('G7.1 creates bounded, identity-specific multichannel queries, including independent reviews', () => {
  const queries = buildMultiChannelQueries(record, 'beleza')
  assert.equal(queries.length, 4)
  assert.ok(queries.every((x) => x.length <= 190))
  assert.ok(queries[0].includes('site:sites.appbarber.com.br'))
  assert.ok(queries.some((x) => x.includes('Google Maps')))
  assert.ok(queries.some((x) => x.includes('preços')))
  assert.ok(queries.every((x) => x.includes('Fainer Barber')))
})

test('G7.1 classifies independently verified public source channels', () => {
  assert.equal(sourceChannel(site), 'booking')
  assert.equal(sourceChannel(reviews.url), 'maps')
  assert.equal(sourceChannel('https://www.instagram.com/p/abc123/'), 'instagram')
  assert.equal(sourceChannel('https://www.facebook.com/fainerbarber'), 'social')
  assert.equal(sourceChannel('https://www.linkedin.com/jobs/view/123'), 'jobs')
  const coverage = multiChannelCoverage([booking, reviews], { profileUrl: 'https://www.instagram.com/fainerbarber/', postCount: 0, profileAccess: 'blocked' })
  assert.ok(coverage.some((x) => x.channel === 'booking' && x.pages === 1))
  assert.ok(coverage.some((x) => x.channel === 'maps' && x.pages === 1))
  assert.ok(coverage.some((x) => x.channel === 'instagram' && x.pages === 0 && x.status === 'restricted'))
})

test('G7.1 preserves booking prices and reviewed public testimonials even when Instagram is blocked', async () => {
  const intelligence = await buildLeadIntelligence({
    sources: [booking, reviews], instagramDiscovery: { postCount: 0, profileAccess: 'blocked' },
    signal: new AbortController().signal, model: null,
  })
  assert.equal(intelligence.status, 'partial_evidence')
  assert.equal(intelligence.extraction, 'literal_only')
  assert.equal(intelligence.prices.length, 2)
  assert.ok(intelligence.coverage.some((x) => x.channel === 'booking'))
  assert.ok(intelligence.businessSummary)
  const verified = validateCommercialIntelligence({ reputation: [{
    label: 'Ótimo atendimento', excerpt: 'Ótimo atendimento e ambiente agradável.', sourceUrl: reviews.url,
  }] }, [booking, reviews])
  assert.equal(verified.reputation.length, 1)
  const fabricated = validateCommercialIntelligence({ reputation: [{
    label: 'Péssimo atendimento', excerpt: 'Péssimo atendimento', sourceUrl: reviews.url,
  }] }, [booking, reviews])
  assert.equal(fabricated.reputation.length, 0)
})

test('G7.1 rejects Instagram login and image navigation as commercial biography', () => {
  const nav = '[Log in](https://www.instagram.com/accounts/login/) ' +
    '[Open app](https://app.link.instagram.com/fainerbarber) ' +
    "[fainerbarber's profile picture](https://scontent.cdninstagram.com/image-123) Instagram"
  assert.equal(instagramReadableText(nav, { profile: true }), '')
  assert.ok(instagramReadableText('Fainer Barber (@fainerbarber) em Rio Grande RS. Barbearia com atendimento, horários e agendamentos.', { profile: true }))
})
