import { describe, expect, it } from 'vitest'
import type { WorkspaceSnapshot } from '../domain/types'
import type { ProspectRecord } from './prospecting-workspace'
import { buildProspectingAutomationPlan, rankProspects, scoreProspectWithIcp } from './prospecting-intelligence'

const prospect = (patch: Partial<ProspectRecord> = {}): ProspectRecord => ({
  id: '00000000-0000-4000-8000-000000000010', workspaceId: 'ws', createdBy: null, name: 'Clínica Alpha', company: 'Clínica Alpha', phone: '(51) 99999-9999', email: 'contato@alpha.com.br', city: 'Porto Alegre', address: 'Centro', cnpj: '12.345.678/0001-90', instagram: '@clinicaalpha', website: 'https://clinicaalpha.com.br', bookingUrl: '', systemName: '', description: 'Clínica odontológica', followers: 2400, source: 'maps', sourceDetail: 'OpenStreetMap + web discovery', status: 'review', confidence: 92, duplicateLevel: 'none', duplicateLeadId: null, duplicateReasons: [], notes: '', rawData: { placeType: 'physical_place', category: 'Clínica odontológica', latitude: -30.03, longitude: -51.22 }, createdAt: '2026-10-16T10:00:00.000Z', updatedAt: '2026-10-16T10:00:00.000Z', analyzedAt: '2026-10-16T10:01:00.000Z', sentAt: null, ...patch,
})

const snapshot = {
  leads: [{ id: 'lead-won', status: 'won', temperature: 'hot', priority: 'high', companyId: 'company-1', city: 'Porto Alegre', tags: ['odontologia'], value: 12000 }],
  companies: [{ id: 'company-1', segment: 'Clínica odontológica' }],
} as unknown as WorkspaceSnapshot

describe('prospecting intelligence 2.0', () => {
  it('prioriza empresa confirmada que combina com a carteira', () => {
    const result = scoreProspectWithIcp(prospect(), snapshot)
    expect(result.entityConfidence).toBeGreaterThanOrEqual(70)
    expect(['candidate', 'priority']).toContain(result.qualification)
    expect(result.score).toBeGreaterThanOrEqual(65)
  })

  it('gera handoff determinístico para CRM e follow-up sem executar sozinho', () => {
    const plan = buildProspectingAutomationPlan(prospect(), snapshot)
    expect(plan.requiresConfirmation).toBe(true)
    expect(plan.actions).toContain('create_lead')
    expect(['create_crm', 'create_crm_and_followup']).toContain(plan.nextBestAction)
  })

  it('não transforma página de conteúdo em lead', () => {
    const result = scoreProspectWithIcp(prospect({ rawData: { placeType: 'web_document' } }), snapshot)
    expect(result.qualification).toBe('discard')
    expect(result.score).toBeLessThanOrEqual(20)
    expect(result.automationPlan.nextBestAction).toBe('discard_non_business')
  })

  it('manda duplicidade confirmada para revisão antes de qualquer criação', () => {
    const plan = buildProspectingAutomationPlan(prospect({ duplicateLevel: 'confirmed', duplicateLeadId: 'existing' }), snapshot)
    expect(plan.nextBestAction).toBe('review_duplicate')
    expect(plan.actions).not.toContain('create_lead')
  })

  it('ordena prioridade antes de conteúdo descartável', () => {
    const ranked = rankProspects([prospect({ id: 'content', rawData: { placeType: 'content' } }), prospect({ id: 'business' })], snapshot)
    expect(ranked[0].prospect.id).toBe('business')
    expect(ranked.at(-1)?.intelligence.qualification).toBe('discard')
  })
})
