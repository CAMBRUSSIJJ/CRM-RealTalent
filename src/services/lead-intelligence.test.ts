import { describe, expect, it } from 'vitest'
import type { Lead } from '../domain/types'
import { findDuplicateMatches, findDuplicatePairs, leadDataIssues, leadPriorityInsight, mergeLeadRecords } from './lead-intelligence'

const baseLead = (overrides: Partial<Lead> = {}): Lead => ({
  id: 'lead-1', workspaceId: 'workspace-1', name: 'Barbearia Alfa', company: 'Alfa', phone: '51999999999', email: 'contato@alfa.com', city: 'Canoas', source: 'Instagram', stageId: 'stage-1', status: 'active', temperature: 'warm', priority: 'medium', ownerId: 'user-1', ownerName: 'Camila', value: 1500, nextActionAt: new Date(Date.now() + 86_400_000).toISOString(), notes: '', tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...overrides,
})

describe('lead intelligence', () => {
  it('detecta problemas de qualidade', () => {
    const issues = leadDataIssues(baseLead({ phone: '', company: '', nextActionAt: null }))
    expect(issues.map((item) => item.key)).toEqual(expect.arrayContaining(['phone', 'company', 'next_action']))
  })

  it('prioriza lead quente e vencido', () => {
    const insight = leadPriorityInsight(baseLead({ temperature: 'hot', priority: 'urgent', nextActionAt: new Date(Date.now() - 86_400_000).toISOString(), value: 12000 }))
    expect(insight.score).toBeGreaterThanOrEqual(75)
    expect(insight.level).toBe('urgent')
  })

  it('encontra duplicados por telefone e email', () => {
    const leads = [baseLead(), baseLead({ id: 'lead-2', phone: '(51) 99999-9999', email: 'contato@alfa.com' })]
    const matches = findDuplicateMatches(leads)
    expect(matches).toHaveLength(2)
    expect(matches[0].reasons).toEqual(expect.arrayContaining(['mesmo telefone', 'mesmo e-mail']))
    expect(findDuplicatePairs(leads)).toHaveLength(1)
  })

  it('mescla campos sem duplicar o valor da oportunidade', () => {
    const primary = baseLead({ notes: 'Nota principal', tags: ['A'], value: 2000, email: '', priority: 'medium' })
    const duplicate = baseLead({ id: 'lead-2', notes: 'Nota secundária', tags: ['A', 'B'], value: 5000, email: 'novo@alfa.com', priority: 'urgent' })
    const merged = mergeLeadRecords(primary, duplicate, new Date('2026-07-19T12:00:00.000Z'))
    expect(merged.value).toBe(5000)
    expect(merged.email).toBe('novo@alfa.com')
    expect(merged.tags).toEqual(['A', 'B'])
    expect(merged.priority).toBe('urgent')
    expect(merged.notes).toContain('Nota secundária')
  })
})
