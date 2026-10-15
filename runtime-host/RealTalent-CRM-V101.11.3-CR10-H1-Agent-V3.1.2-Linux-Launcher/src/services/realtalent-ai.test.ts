import { describe, expect, it } from 'vitest'
import type { WorkspaceSnapshot } from '../domain/types'
import { buildRealTalentAiContext } from './realtalent-ai-context'
import { buildCommercialMemory } from './realtalent-ai-memory'
import { REALTALENT_AI_TOOLS } from './realtalent-ai-tools'

const snapshot = {
  workspace: { id: 'w1', name: 'Demo', slug: 'demo', role: 'owner', createdAt: '2026-09-01T00:00:00Z' },
  stages: [{ id: 's1', workspaceId: 'w1', name: 'Proposta', order: 1, color: '#000', probability: 60, isWon: false, isLost: false }],
  leads: [{ id: 'l1', workspaceId: 'w1', name: 'Carlos', company: 'Morada', phone: '51999999999', email: 'carlos@example.com', city: 'Canoas', source: 'manual', stageId: 's1', status: 'active', temperature: 'hot', priority: 'high', ownerId: null, ownerName: 'Equipe', value: 8000, nextActionAt: null, notes: 'Quer reduzir faltas e melhorar recorrência.', tags: [], createdAt: '2026-09-01T12:00:00Z', updatedAt: '2026-09-15T12:00:00Z' }],
  activities: [], calls: [], events: [], playbooks: [], goals: [], automationRules: [], automationRuns: [], companies: [], contacts: [], contactRelationships: [], opportunities: [], socialProfiles: [], products: [], proposals: [], buyerRooms: [], revenueEntries: [],
} as unknown as WorkspaceSnapshot

describe('RealTalent AI foundation', () => {
  it('builds a context envelope without write authority or external transmission', () => {
    const context = buildRealTalentAiContext(snapshot, { focusLeadId: 'l1', currentRoute: 'pipeline', now: new Date('2026-09-23T12:00:00Z') })
    expect(context.version).toBe('realtalent-ai-context/1.0')
    expect(context.focusLeadId).toBe('l1')
    expect(context.dataPolicy.sendsExternally).toBe(false)
    expect(context.dataPolicy.writeAuthority).toBe(false)
  })

  it('derives commercial memory from CRM source-of-truth', () => {
    const memory = buildCommercialMemory(snapshot, snapshot.leads[0], new Date('2026-09-23T12:00:00Z'))
    expect(memory.some((item) => item.label === 'Etapa atual' && item.value === 'Proposta')).toBe(true)
    expect(memory.some((item) => item.label === 'Notas comerciais')).toBe(true)
  })

  it('requires confirmation for every mutating AI tool', () => {
    const mutating = REALTALENT_AI_TOOLS.filter((tool) => tool.mutatesCrm)
    expect(mutating.length).toBeGreaterThan(0)
    expect(mutating.every((tool) => tool.requiresConfirmation)).toBe(true)
  })
})
