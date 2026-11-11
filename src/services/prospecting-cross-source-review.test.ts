import { describe, expect, it } from 'vitest'
import type { ProspectRecord } from './prospecting-workspace'
import type { AiEvidence, AiLead, AiSearchResult } from '../../supabase/functions/_shared/prospecting-ai'
import { confirmedEnrichmentResult, crossSourceReview, matchedCrossSourceLead } from './prospecting-cross-source-review'

const prospect = (overrides: Record<string, string> = {}) => ({
  id: 'review-1',
  name: 'Barbearia Central',
  company: 'Barbearia Central',
  city: 'Rio Grande, RS',
  phone: '',
  address: '',
  cnpj: '',
  email: '',
  instagram: '',
  website: '',
  bookingUrl: '',
  whatsappUrl: '',
  ...overrides,
}) as unknown as ProspectRecord

const result = (facts: AiEvidence[], leadOverride: Partial<AiLead> = {}): AiSearchResult => ({
  researchedAt: '2026-11-11T12:00:00Z',
  warnings: [],
  leads: [{
    company: 'Barbearia Central', city: 'Rio Grande, RS',
    phone: '', address: '', cnpj: '', email: '', website: '', instagram: '',
    bookingUrl: '', whatsappUrl: '', systemName: '',
    aiResearch: {
      evidence: facts,
      sources: [...new Set(facts.map((fact) => fact.sourceUrl))].map((url) => ({ url, title: new URL(url).hostname })),
      opportunity: '', suggestedApproach: '', missingFields: [], researchedAt: '2026-11-11T12:00:00Z',
    },
    ...leadOverride,
  }],
})
const fact = (field: AiEvidence['field'], value: string, sourceUrl: string): AiEvidence => ({ field, value, sourceUrl })
const a = 'https://barbeariacentral.com.br/contato'
const b = 'https://diretorioexemplo.com.br/barbeariacentral'
const samePublisher = 'https://blog.barbeariacentral.com.br/contato'

describe('Garimpo: revisão cruzada de fontes', () => {
  it('não considera duas páginas do mesmo editor como confirmação independente', () => {
    const review = crossSourceReview(prospect(), result([
      fact('phone', '(53) 99911-2233', a), fact('phone', '(53) 99911-2233', samePublisher),
    ], { phone: '(53) 99911-2233' }))
    const field = review.fields.find((item) => item.field === 'phone')!
    expect(field.status).toBe('observed')
    expect(field.candidates[0].independentPublishers).toBe(1)
  })

  it('confirma um telefone quando duas origens independentes concordam', () => {
    const phone = '(53) 99911-2233'
    const review = crossSourceReview(prospect(), result([
      fact('phone', phone, a), fact('phone', phone, b),
    ], { phone }))
    expect(review.fields.find((item) => item.field === 'phone')?.status).toBe('confirmed')
    expect(review.importable).toContain('phone')
  })

  it('sinaliza divergência entre fontes ou com o cadastro existente', () => {
    const review = crossSourceReview(prospect({ phone: '(53) 99911-2222' }), result([
      fact('phone', '(53) 99911-2233', a), fact('phone', '(53) 99911-2233', b),
    ], { phone: '(53) 99911-2233' }))
    expect(review.fields.find((item) => item.field === 'phone')?.status).toBe('divergent')
    expect(review.importable).not.toContain('phone')
  })

  it('não atribui dados encontrados de outra empresa à selecionada', () => {
    const data = result([fact('phone', '(53) 99911-2233', a)], {
      company: 'Barbearia do Porto',
    })
    expect(matchedCrossSourceLead(prospect(), data)).toBeNull()
    const review = crossSourceReview(prospect(), data)
    expect(review.matched).toBe(false)
    expect(review.confirmed).toBe(0)
    expect(confirmedEnrichmentResult(prospect(), data)).toBeNull()
  })

  it('importa somente campos ausentes e corroborados, após ação explícita', () => {
    const phone = '(53) 99911-2233'
    const data = result([
      fact('phone', phone, a), fact('phone', phone, b),
      fact('email', 'contato@barbeariacentral.com.br', a),
    ], { phone, email: 'contato@barbeariacentral.com.br' })
    const allowed = confirmedEnrichmentResult(prospect(), data)
    expect(allowed?.leads).toHaveLength(1)
    expect(allowed?.leads[0].phone).toBe(phone)
    expect(allowed?.leads[0].email).toBe('')
    expect(allowed?.leads[0].company).toBe('Barbearia Central')
    expect(confirmedEnrichmentResult(prospect({ phone }), data)).toBeNull()
  })

  it('sem evidências não confirma nenhum dado e não preenche lacunas', () => {
    const data = result([])
    const review = crossSourceReview(prospect(), data)
    expect(review.confirmed).toBe(0)
    expect(review.pending).toBeGreaterThan(0)
    expect(confirmedEnrichmentResult(prospect(), data)).toBeNull()
  })
})
