import { describe, expect, it } from 'vitest'
import type { Lead, WorkspaceSnapshot } from '../domain/types'
import { normalizeLeadForRender, normalizeSnapshotForRender } from './snapshot-safety'

describe('snapshot safety', () => {
  it('normaliza lead legado e incompleto sem interromper o render', () => {
    const lead = normalizeLeadForRender({
      id: 123,
      workspaceId: null,
      name: null,
      company: null,
      phone: 51999999999,
      email: null,
      city: null,
      source: null,
      stageId: null,
      status: 'legacy',
      temperature: null,
      priority: null,
      ownerId: 5,
      ownerName: null,
      value: '1500',
      nextActionAt: 'invalid',
      notes: null,
      tags: 'barbearia, quente, barbearia',
      createdAt: null,
      updatedAt: 'invalid',
      latitude: 'not-a-coordinate',
      longitude: '-51.2',
    } as unknown as Lead, 'stage-default', 'workspace-default')

    expect(lead.id).toBe('123')
    expect(lead.workspaceId).toBe('workspace-default')
    expect(lead.name).toBe('Lead sem nome')
    expect(lead.phone).toBe('51999999999')
    expect(lead.stageId).toBe('stage-default')
    expect(lead.status).toBe('active')
    expect(lead.temperature).toBe('cold')
    expect(lead.priority).toBe('medium')
    expect(lead.value).toBe(1500)
    expect(lead.nextActionAt).toBeNull()
    expect(lead.tags).toEqual(['barbearia', 'quente'])
    expect(lead.latitude).toBeNull()
    expect(lead.longitude).toBe(-51.2)
  })

  it('protege snapshot com coleções nulas e etapas ausentes', () => {
    const snapshot = normalizeSnapshotForRender({
      workspace: { id: 'ws', name: 'Teste', slug: 'teste', role: 'owner', createdAt: '2026-01-01T00:00:00.000Z' },
      stages: null,
      leads: [{ id: 'lead-1', name: 'Teste', tags: null }],
      activities: null,
      calls: null,
      events: null,
      playbooks: null,
      goals: null,
      automationRules: null,
      automationRuns: null,
      companies: null,
      contacts: null,
      opportunities: null,
      socialProfiles: null,
      products: null,
      proposals: null,
      revenueEntries: null,
    } as unknown as WorkspaceSnapshot)

    expect(snapshot.stages).toEqual([])
    expect(snapshot.activities).toEqual([])
    expect(snapshot.companies).toEqual([])
    expect(snapshot.leads[0].name).toBe('Teste')
    expect(snapshot.leads[0].tags).toEqual([])
  })
})
