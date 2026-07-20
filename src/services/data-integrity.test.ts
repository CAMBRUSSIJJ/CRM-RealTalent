import { describe, expect, it } from 'vitest'
import type { WorkspaceSnapshot } from '../domain/types'
import { inspectWorkspaceIntegrity } from './data-integrity'

const snapshot = (): WorkspaceSnapshot => ({
  workspace: { id: 'w1', name: 'Teste', slug: 'teste', role: 'owner', createdAt: '2026-01-01T00:00:00.000Z' },
  stages: [{ id: 's1', workspaceId: 'w1', name: 'Novo', order: 1, color: '#000000', probability: 10, isWon: false, isLost: false }],
  leads: [{ id: 'l1', workspaceId: 'w1', name: 'Lead', company: 'Empresa', phone: '51999999999', email: 'lead@empresa.com', city: 'Canoas', source: 'Manual', stageId: 's1', status: 'active', temperature: 'warm', priority: 'medium', ownerId: null, ownerName: '', value: 0, nextActionAt: null, notes: '', tags: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
  activities: [], calls: [], events: [], playbooks: [], goals: [], automationRules: [], automationRuns: [],
})

describe('integridade do workspace', () => {
  it('aprova um snapshot consistente', () => {
    const report = inspectWorkspaceIntegrity(snapshot())
    expect(report.errors).toBe(0)
    expect(report.warnings).toBe(0)
    expect(report.score).toBe(100)
  })

  it('detecta referências órfãs e intervalo inválido', () => {
    const value = snapshot()
    value.leads[0].stageId = 'inexistente'
    value.calls.push({ id: 'c1', workspaceId: 'w1', leadId: 'removido', userId: null, outcome: 'answered', durationSeconds: 10, notes: '', transcript: '', recordingPath: null, startedAt: '2026-01-01T00:00:00.000Z', endedAt: null, createdAt: '2026-01-01T00:00:00.000Z' })
    value.events.push({ id: 'e1', workspaceId: 'w1', leadId: null, title: 'Evento', description: '', startsAt: '2026-01-02T10:00:00.000Z', endsAt: '2026-01-02T09:00:00.000Z', allDay: false, location: '', status: 'confirmed', assignedTo: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' })
    const report = inspectWorkspaceIntegrity(value)
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['lead_without_stage', 'orphan_call', 'invalid_event_range']))
    expect(report.errors).toBe(3)
  })

  it('identifica duplicidade por telefone e e-mail', () => {
    const value = snapshot()
    value.leads.push({ ...value.leads[0], id: 'l2', name: 'Outro', phone: '+55 (51) 99999-9999', email: 'LEAD@EMPRESA.COM' })
    const report = inspectWorkspaceIntegrity(value)
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['duplicate_phone', 'duplicate_email']))
    expect(report.warnings).toBeGreaterThanOrEqual(2)
  })
})
