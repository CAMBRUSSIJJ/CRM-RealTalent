import { describe, expect, it } from 'vitest'
import type { Lead } from '../domain/types'
import { calculateProspectConfidence, createProspect, detectProspectDuplicate, parseProspectCsv, parseProspectJson, parseQuickCaptureLines } from './prospecting-workspace'

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
})
