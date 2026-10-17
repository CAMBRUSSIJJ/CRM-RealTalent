import { describe, expect, it } from 'vitest'
import type { ProspectRecord } from './prospecting-workspace'
import { buildProspectingDataLayerEnvelope, prospectDataQuality, prospectIdentityKey, prospectPipelineCounts, resolveProspectEntity, sortProspectsForGuidedReview } from './prospecting-data-layer'

const base = (patch: Partial<ProspectRecord> = {}): ProspectRecord => ({
  id: '00000000-0000-4000-8000-000000000001', workspaceId: 'ws', createdBy: null, name: 'Barbearia Alpha', company: 'Barbearia Alpha', phone: '(51) 99999-9999', email: 'contato@alpha.com.br', city: 'Canoas', address: 'Centro', cnpj: '12.345.678/0001-90', instagram: '@alpha', website: 'https://alpha.com.br', bookingUrl: '', systemName: '', description: 'Atendimento por agenda', followers: 1000, source: 'maps', sourceDetail: 'Google Maps', status: 'review', confidence: 88, duplicateLevel: 'none', duplicateLeadId: null, duplicateReasons: [], notes: '', rawData: { source: 'maps', url: 'x', capturedAt: 'now', placeType: 'physical_place', latitude: -29.9, longitude: -51.1 }, createdAt: '2026-09-23T10:00:00.000Z', updatedAt: '2026-09-23T10:00:00.000Z', analyzedAt: '2026-09-23T10:01:00.000Z', sentAt: null, ...patch,
})

describe('prospecting data layer', () => {
  it('usa CNPJ como identidade forte quando disponível', () => expect(prospectIdentityKey(base())).toBe('cnpj:12345678000190'))
  it('confirma empresa real com evidências independentes', () => {
    const entity = resolveProspectEntity(base())
    expect(entity.kind).toBe('business')
    expect(entity.status).toBe('confirmed')
    expect(entity.confidence).toBeGreaterThanOrEqual(70)
  })
  it('rejeita conteúdo web que não representa empresa individual', () => {
    const prospect = base({ rawData: { placeType: 'web_document' } })
    expect(resolveProspectEntity(prospect).status).toBe('rejected')
    expect(prospectDataQuality(prospect).readiness).toBe('blocked')
  })
  it('não usa corte fixo de confiança para bloquear empresa confirmada', () => expect(prospectDataQuality(base({ confidence: 40 })).readiness).toBe('ready'))
  it('bloqueia registro sem canal de contato', () => expect(prospectDataQuality(base({ phone: '', email: '', instagram: '', website: '' })).readiness).toBe('blocked'))
  it('bloqueia duplicidade confirmada', () => expect(prospectDataQuality(base({ duplicateLevel: 'confirmed' })).readiness).toBe('blocked'))
  it('prioriza bloqueados na revisão guiada', () => expect(sortProspectsForGuidedReview([base(), base({ id: '00000000-0000-4000-8000-000000000002', phone: '', email: '', instagram: '', website: '' })])[0].id).toBe('00000000-0000-4000-8000-000000000002'))
  it('contabiliza o funil progressivo com identidade, contato e enriquecimento', () => {
    const counts = prospectPipelineCounts([base(), base({ id: '00000000-0000-4000-8000-000000000002', website: '', analyzedAt: null })])
    expect(counts.discovered).toBe(2)
    expect(counts.identitiesConfirmed).toBe(2)
    expect(counts.withPhone).toBe(2)
    expect(counts.withWebsite).toBe(1)
    expect(counts.enriched).toBe(1)
  })
  it('exporta contrato do RealTalent Data Layer', () => expect(buildProspectingDataLayerEnvelope('ws', [base()]).contract).toBe('realtalent-data-layer/2.5'))
})
