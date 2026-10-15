import { describe, expect, it } from 'vitest'
import type { ContactRecord, Lead, WorkspaceSnapshot } from '../domain/types'
import { buildDiscoveryChecklist, callSessionObjective, inferCallSessionObjective } from './call-session-intelligence'

const lead = { id: 'l1', stageId: 's1', lastContactAt: null, nextActionAt: null } as Lead
const snapshot = { stages: [{ id: 's1', name: 'Diagnóstico' }], proposals: [] } as unknown as WorkspaceSnapshot

describe('call session intelligence', () => {
  it('infere qualificação em estágio de diagnóstico', () => {
    expect(inferCallSessionObjective(lead, snapshot)).toBe('qualify')
  })

  it('considera decisor mapeado no checklist', () => {
    const contacts = [{ decisionRole: 'decision_maker' }] as ContactRecord[]
    const items = buildDiscoveryChecklist({ lead, contacts, notes: '', decisionMaker: '', currentSystem: '', mainPain: '', bestTime: '', objective: 'qualify' })
    expect(items.find((item) => item.id === 'decision')?.complete).toBe(true)
  })

  it('mantém definição de objetivo legível', () => {
    expect(callSessionObjective('proposal_followup').label).toContain('proposta')
  })
})
