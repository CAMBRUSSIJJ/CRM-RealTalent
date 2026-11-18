import { describe, expect, it } from 'vitest'
import type { Lead } from '../domain/types'
import { applyProspectEnrichment, calculateProspectConfidence, createProspect, prospectInsightLines, prospectInsights, detectProspectDuplicate, parseProspectCsv, parseProspectJson, parseQuickCaptureLines } from './prospecting-workspace'

const lead: Lead = {
  id: 'lead-1', workspaceId: 'ws', name: 'Barbearia Alpha', company: 'Barbearia Alpha', phone: '(51) 99999-1001', email: '', city: 'Canoas', source: 'Manual',
  stageId: 'new', status: 'active', temperature: 'warm', priority: 'medium', ownerId: null, ownerName: 'Camila', value: 0, nextActionAt: null,
  notes: 'Instagram: @barbeariaalpha', tags: [], createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
}

describe('prospecting workspace', () => {
  it('detecta duplicidade confirmada por telefone', () => {
    const result = detectProspectDuplicate({ name: 'Outra', phone: '51999991001' }, [lead])
    expect(result.level).toBe('confirmed')
    expect(result.leadId).toBe('lead-1')
  })

  it('detecta possível duplicidade por nome e cidade', () => {
    const result = detectProspectDuplicate({ company: 'Barbearia Alpha', city: 'Canoas' }, [lead])
    expect(result.level).toBe('possible')
  })

  it('calcula confiança pelos campos disponíveis', () => {
    expect(calculateProspectConfidence({ name: 'Alpha', phone: '51999991001', city: 'Canoas', instagram: '@alpha' })).toBeGreaterThanOrEqual(60)
  })

  it('interpreta captura rápida em linhas', () => {
    const records = parseQuickCaptureLines('Alpha | 51999991001 | Canoas | @alpha\nBeta | 51988881111 | Esteio | https://beta.com.br')
    expect(records).toHaveLength(2)
    expect(records[0].instagram).toBe('@alpha')
    expect(records[1].website).toContain('beta.com.br')
  })

  it('importa CSV com cabeçalhos em português', () => {
    const records = parseProspectCsv('Nome;Telefone;Cidade;Instagram\nAlpha;51999991001;Canoas;@alpha')
    expect(records[0]).toMatchObject({ name: 'Alpha', phone: '51999991001', city: 'Canoas', instagram: '@alpha' })
  })

  it('importa JSON no formato da extensão', () => {
    const records = parseProspectJson(JSON.stringify({ leads: [{ nome: 'Alpha', phone: '123' }] }))
    expect(records).toHaveLength(1)
  })

  it('normaliza payload da extensão em português', () => {
    const prospect = createProspect('ws', { nome: 'Alpha Extensão', telefone: '51977776666', cidade: 'Canoas', origem: 'extensão' }, 'manual', [])
    expect(prospect.name).toBe('Alpha Extensão')
    expect(prospect.phone).toBe('51977776666')
    expect(prospect.source).toBe('extension')
  })

  it('cria prospecto com análise inicial', () => {
    const prospect = createProspect('ws', { name: 'Alpha', phone: '51999991001', city: 'Canoas' }, 'maps', [lead])
    expect(prospect.source).toBe('maps')
    expect(prospect.duplicateLevel).toBe('confirmed')
  })

  it('aplica enriquecimento sem sobrescrever dados revisados e guarda dados da Receita', () => {
    const prospect = { ...createProspect('ws', { company: 'Alpha Barbearia', phone: '(51) 98888-0000', website: 'https://alpha.com.br' }, 'maps', []), notes: 'revisado' }
    const enriched = applyProspectEnrichment(prospect, {
      company: 'Outro Nome', phone: '(51) 3456-7890', email: 'contato@alpha.com.br', cnpj: '11.222.333/0001-81', instagram: '@alpha',
      legalName: 'Alpha Barbearia Ltda', registrationStatus: 'ATIVA', cnae: '9602-5/01', whatsapp: '(51) 98888-0000',
      partners: [{ name: 'João Silva', role: 'Sócio-Administrador', since: '2019-01-01' }], rating: 4.7, reviewsCount: 90,
    }, [])
    expect(enriched).toMatchObject({ company: 'Alpha Barbearia', phone: '(51) 98888-0000', email: 'contato@alpha.com.br', cnpj: '11.222.333/0001-81', instagram: '@alpha', notes: 'revisado', status: 'review' })
    expect(enriched.confidence).toBeGreaterThan(prospect.confidence)
    const info = prospectInsights(enriched)
    expect(info).toMatchObject({ legalName: 'Alpha Barbearia Ltda', registrationStatus: 'ATIVA', rating: 4.7 })
    expect(info.partners).toHaveLength(1)
    const lines = prospectInsightLines(enriched).join('\n')
    expect(lines).toContain('Razão social: Alpha Barbearia Ltda')
    expect(lines).toContain('Sócios: João Silva (Sócio-Administrador)')
    expect(lines).toContain('Google: nota 4.7 (90 avaliações)')
  })
})
