import { describe, expect, it } from 'vitest'
import { createProspect, refreshProspectAnalysis } from './prospecting-workspace'
import { prospectDataQuality, prospectIsReady, prospectReadinessCounts, recordProspectApproval } from './prospecting-data-layer'
import { isProspectTransferable } from './prospecting-handoff-r1'
import { applyAiEnrichment, savedResearchResult, savedResearchVersions, localResearchVersion, localResearchProgress } from './prospecting-ai'
import { crossSourceReview } from './prospecting-cross-source-review'
import { commercialReviewActions, unifiedProspectEvidence } from './prospecting-research-view'
import { parseAiSearchResult, researchCompletionStatus, type AiSearchResult } from '../../supabase/functions/_shared/prospecting-ai'

const workspace = 'aaaaaaaa-0000-4000-8000-000000000001'
const now = '2026-11-15T20:00:00.000Z'
function prospect() {
  return refreshProspectAnalysis(createProspect(workspace, { company: 'Fainer Barber', name: 'Fainer Barber',
    phone: '51999990000', city: 'Canoas', website: 'https://fainer.com.br', sourceDetail: 'https://fainer.com.br' }, 'maps', []), [])
}
function result(): AiSearchResult {
  return { executionId: 'run-1', researchedAt: now, warnings: [], researchStatus: 'limited',
    leads: [{ company: 'Fainer Barber', phone: '51988880000', email: '', city: 'Canoas', address: '', cnpj: '',
      instagram: '', website: '', bookingUrl: '', systemName: '', whatsappUrl: '',
      aiResearch: { sources: [{ title: 'Fainer', url: 'https://fainer.com.br/' }], evidence: [{ field: 'phone', value: '51988880000', sourceUrl: 'https://fainer.com.br/' }],
        researchedAt: now, missingFields: [], opportunity: 'Hipótese a validar.', suggestedApproach: 'Perguntar sobre os serviços.' } }],
    leadIntelligence: { version: 'G7', status: 'partial_evidence', extraction: 'literal_only', sourceCount: 1,
      offerings: [{ label: 'Barba completa', excerpt: 'Barba completa com atendimento agendado.', sourceUrl: 'https://fainer.com.br/', channel: 'website_or_web' }],
      prices: [], positioning: [], missing: ['Endereço'], hypotheses: ['Possível aderência; validar.'], questions: ['Como funciona a contratação de barba completa?'], recommendedAction: 'Conferir a fonte.' },
    instagramDiscovery: { status: 'provided', profileUrl: 'https://www.instagram.com/fainer/', postCount: 0, profileAccess: 'blocked' },
    researchPlan: { version: 'G6', segment: 'beleza', priorities: ['serviços'], questions: [], queries: [], strategy: 'sector_rules', budget: { lowMemorySearches: 2, normalSearches: 3, deepPagesLow: 1, deepPagesNormal: 2 } },
    commercialBrief: { status: 'evidence_based', segment: 'beleza', summary: 'Serviços publicados.', knownFacts: [], missing: ['Endereço'], signals: [], hypotheses: [], questions: [], recommendedAction: 'Confirmar localização.', researchLimits: ['Instagram indisponível'] },
  }
}

describe('classificação única e aprovação G8', () => {
  it('cadastro suficiente sem coordenadas permanece em revisão em todos os contadores', () => {
    const row = prospect(), quality = prospectDataQuality(row)
    expect(quality.registrationSufficient).toBe(true)
    expect(quality.companyVerified).toBe(false)
    expect(quality.readiness).toBe('review')
    expect(prospectIsReady(row)).toBe(false)
    expect(prospectReadinessCounts([row])).toEqual({ ready: 0, review: 1, blocked: 0 })
  })
  it('aprovação com ressalvas exige aceite e registra responsável e ressalvas', () => {
    const row = prospect()
    expect(() => recordProspectApproval(row, 'reviewer')).toThrow('ressalvas')
    expect(isProspectTransferable({ ...row, status: 'approved' })).toBe(false)
    const approved = recordProspectApproval(row, 'reviewer', true)
    expect(isProspectTransferable(approved)).toBe(true)
    expect(prospectReadinessCounts([approved]).ready).toBe(1)
    expect(approved.rawData.garimpoApproval).toMatchObject({ reviewerId: 'reviewer', issues: expect.arrayContaining(['Coordenadas não confirmadas no território']) })
    expect(isProspectTransferable({ ...approved, city: 'Porto Alegre' })).toBe(false)
    expect(isProspectTransferable(applyAiEnrichment(approved, result(), [], true))).toBe(true)
  })
  it('não transforma coordenadas vazias em zero e só aprova automaticamente localização válida', () => {
    const row = prospect()
    expect(prospectDataQuality({ ...row, rawData: { ...row.rawData, latitude: null, longitude: '' } }).autoApprovable).toBe(false)
    const located = { ...row, rawData: { ...row.rawData, latitude: -29.9, longitude: -51.2, placeType: 'physical_place', placeConfidence: 90 } }
    expect(prospectDataQuality(located).autoApprovable).toBe(true)
    expect(prospectDataQuality({ ...located, rawData: { ...located.rawData, latitude: 100 } }).autoApprovable).toBe(false)
    expect(() => recordProspectApproval({ ...row, duplicateLevel: 'confirmed' }, 'reviewer', true)).toThrow()
  })
})

describe('persistência e evidências G8', () => {
  it('salva a análise inteira sem alterar campos cadastrais e recupera após serialização', async () => {
    const row = prospect(), data = result()
    const saved = applyAiEnrichment(row, data, [], true)
    expect(saved.phone).toBe(row.phone)
    expect(saved.email).toBe(row.email)
    expect(saved.rawData).toMatchObject({ leadIntelligence: data.leadIntelligence, commercialBrief: data.commercialBrief, instagramDiscovery: data.instagramDiscovery, researchPlan: data.researchPlan })
    expect(savedResearchResult(JSON.parse(JSON.stringify(saved)))).toEqual(data)
    const twice = applyAiEnrichment(saved, data, [], true)
    expect(twice.rawData.researchHistory).toHaveLength(1)
    const next = applyAiEnrichment(twice, { ...data, executionId: 'run-2' }, [], true)
    expect(next.rawData.researchHistory).toHaveLength(2)
    expect(savedResearchVersions(next)[0]).not.toHaveProperty('result')
    expect(await localResearchVersion(next, 'run-2')).toEqual({ ...data, executionId: 'run-2' })
  })
  it('consolida a mesma URL de descoberta e investigação, registra bloqueio e separa ações comerciais', () => {
    const row = prospect(), data = result(), review = crossSourceReview(row, data)
    const sources = unifiedProspectEvidence(row, data, review)
    expect(sources.find((source) => source.url === 'https://fainer.com.br/')?.origins).toEqual(['discovery', 'investigation'])
    expect(sources.find((source) => source.title === 'Instagram')?.status).toBe('blocked')
    expect(commercialReviewActions(row, data).map((action) => action.kind)).toEqual(['verification', 'hypothesis'])
    expect(commercialReviewActions(row, data)[1].question).toContain('barba completa')
    const older = { ...row, sourceDetail: 'https://fainer.com.br/descoberta-antiga', createdAt: '2020-01-01T00:00:00Z' }
    expect(unifiedProspectEvidence(older, data, review).find((source) => source.url.endsWith('/descoberta-antiga'))?.collectedAt).toBe(older.createdAt)
  })
  it('conta domínios registráveis e não subdomínios como fontes distintas', () => {
    const row = prospect(), data = result(), lead = data.leads[0]
    lead.aiResearch.sources = [{ url: 'https://one.example.co.nz/', title: 'A' }, { url: 'https://two.example.co.nz/', title: 'B' }]
    lead.aiResearch.evidence = lead.aiResearch.sources.map((source) => ({ field: 'phone', value: row.phone, sourceUrl: source.url }))
    expect(crossSourceReview(row, data).fields.find((field) => field.field === 'phone')?.candidates[0].independentPublishers).toBe(1)
    lead.aiResearch.sources[1].url = 'https://other.co.nz/'
    lead.aiResearch.evidence[1].sourceUrl = 'https://other.co.nz/'
    expect(crossSourceReview(row, data).fields.find((field) => field.field === 'phone')?.candidates[0].independentPublishers).toBe(2)
  })
})

describe('contrato e estados da investigação', () => {
  it('descarta progresso incompatível sem permitir objetos ou contagens inválidas na tela', () => {
    expect(localResearchProgress({ stage: {}, phaseStatus: 'running', sourceCount: 5, leadCount: 1 })).toBeNull()
    expect(localResearchProgress({ stage: 'web', phaseStatus: 'running', sourceCount: -1, leadCount: 1 })).toBeNull()
    expect(localResearchProgress({ stage: 'web', phaseStatus: 'running', sourceCount: 5, leadCount: 1, errorCode: {} }))
      .toEqual({ stage: 'web', phaseStatus: 'running', sourceCount: 5, leadCount: 1 })
  })
  it('aceita um resultado completo e rejeita objetos aninhados inválidos antes de renderizar', () => {
    const valid = result()
    expect(parseAiSearchResult(valid)).toBe(valid)
    expect(() => parseAiSearchResult({ ...valid, leadIntelligence: { ...valid.leadIntelligence, questions: {} } })).toThrow()
    expect(() => parseAiSearchResult({ ...valid, leads: [{ ...valid.leads[0], phone: {} }] })).toThrow()
    expect(() => parseAiSearchResult({ ...valid, providers: [{ name: 'Crawl4AI', used: 'sim' }] })).toThrow()
    expect(() => parseAiSearchResult({ ...valid, contractVersion: 'garimpo-research/9' })).toThrow('research_contract_unsupported')
  })
  it('Instagram opcional indisponível não produz falha de uma etapa essencial', () => {
    const stages = [{ stage: 'facts' as const, phaseStatus: 'completed' as const, sourceCount: 5, leadCount: 1 },
      { stage: 'instagram' as const, phaseStatus: 'failed' as const, sourceCount: 5, leadCount: 1 }]
    expect(researchCompletionStatus(stages, true)).toBe('limited')
    expect(researchCompletionStatus([{ ...stages[0], phaseStatus: 'failed' }], true)).toBe('partial')
    expect(researchCompletionStatus([stages[0]], true)).toBe('completed')
  })
})
