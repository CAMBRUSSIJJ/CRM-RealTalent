import { describe, expect, it } from 'vitest'
import type { ProspectRecord } from './prospecting-workspace'
import type { AiSearchResult } from '../../supabase/functions/_shared/prospecting-ai'
import { crossSourceReview } from './prospecting-cross-source-review'
import { buildReviewSuggestions } from './prospecting-review-suggestions'

const business = (website = '', phone = '') => ({
  company: 'Fainer Barber', name: 'Fainer Barber', city: 'Rio Grande, RS',
  website, phone, email: '', address: '', instagram: '', bookingUrl: '',
  cnpj: '', rawData: {},
}) as unknown as ProspectRecord

const evidence = (values: Array<{ field: 'website' | 'phone' | 'email'; value: string; sourceUrl: string }>) => ({
  leads: [{
    company: 'Fainer Barber', city: 'Rio Grande, RS', website: '',
    phone: '', address: '', cnpj: '', email: '', instagram: '',
    bookingUrl: '', systemName: '', whatsappUrl: '',
    aiResearch: { evidence: values,
      sources: [...new Set(values.map((v) => v.sourceUrl))].map((url) => ({ url, title: new URL(url).hostname })),
      opportunity: '', suggestedApproach: '', missingFields: [], researchedAt: '2026-11-12T12:00:00Z',
      signals: [] },
  }],
  warnings: [], researchedAt: '2026-11-12T12:00:00Z',
}) as AiSearchResult

describe('Feed de decisões do Garimpo', () => {
  it('mostra campo encontrado com fonte, sem copiar valores fictícios do modelo de layout', () => {
    const review = crossSourceReview(business(), evidence([
      { field: 'phone', value: '(53) 99111-2233', sourceUrl: 'https://kortar.com.br/empresa/fainer' },
    ]))
    const suggestions = buildReviewSuggestions(review)
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]).toMatchObject({
      field: 'phone', suggestedValue: '(53) 99111-2233',
      currentValue: '', kind: 'new', evidenceStatus: 'observed',
    })
    expect(suggestions[0].sourceUrls).toHaveLength(1)
  })

  it('mostra substituição apenas quando o dado difere e existe evidência', () => {
    const review = crossSourceReview(business('', '(53) 99333-2211'), evidence([
      { field: 'phone', value: '(53) 99111-2233', sourceUrl: 'https://kortar.com.br/empresa/fainer' },
      { field: 'phone', value: '(53) 99111-2233', sourceUrl: 'https://agendaexemplo.com.br/fainer' },
    ]))
    const suggestion = buildReviewSuggestions(review).find((s) => s.field === 'phone')
    expect(suggestion).toMatchObject({ kind: 'conflict', evidenceStatus: 'divergent', independentPublishers: 2 })
  })

  it('ignora valor equivalente e resultados não associados à empresa', () => {
    const review = crossSourceReview(business('', '(53) 99111-2233'), evidence([
      { field: 'phone', value: '53 99111-2233', sourceUrl: 'https://kortar.com.br/empresa/fainer' },
    ]))
    expect(buildReviewSuggestions(review)).toEqual([])
    const unrelated = crossSourceReview(business(), {
      ...evidence([{ field: 'phone', value: '99999', sourceUrl: 'https://outra.com.br' }]),
      leads: [{ ...evidence([]).leads[0], company: 'Outra empresa', city: 'Pelotas' }],
    })
    expect(buildReviewSuggestions(unrelated)).toEqual([])
  })

  it('não coloca valores sem fonte no feed de decisões', () => {
    const review = crossSourceReview(business(), evidence([
      { field: 'email', value: 'contato@fainer.example', sourceUrl: 'not-a-url' },
    ]))
    expect(buildReviewSuggestions(review)).toEqual([])
  })
})
