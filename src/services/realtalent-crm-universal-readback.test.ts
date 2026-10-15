import { describe, expect, it } from 'vitest'
import type { WorkspaceSnapshot } from '../domain/types'
import type { CrmCapabilityPlanStep } from './realtalent-crm-capability-planner'
import { receiptStatusFromEvidence, verifyCrmCapabilityExecution } from './realtalent-crm-execution-truth'

const snapshot = (patch: Partial<WorkspaceSnapshot> = {}): WorkspaceSnapshot => ({
  workspace: { id: 'workspace-test', name: 'Workspace Teste' } as any,
  stages: [], leads: [], activities: [], calls: [], events: [], playbooks: [], goals: [], automationRules: [], automationRuns: [],
  companies: [], contacts: [], contactRelationships: [], opportunities: [], socialProfiles: [], products: [], proposals: [], buyerRooms: [], revenueEntries: [],
  ...patch,
})

const step = (capabilityId: string, risk: CrmCapabilityPlanStep['risk'] = 'medium'): CrmCapabilityPlanStep => ({
  id: `step-${capabilityId}`,
  capabilityId,
  title: capabilityId,
  reason: 'regressão universal',
  risk,
  args: [],
})

const verify = (capabilityId: string, before: WorkspaceSnapshot, after: WorkspaceSnapshot) => verifyCrmCapabilityExecution(
  step(capabilityId),
  { ok: true, summary: 'executado' },
  before,
  after,
  { workspaceId: 'workspace-test', repositoryMode: 'local', uiRefreshConfirmed: true },
)

describe('RealTalent Agent — Universal CRM Execution Truth', () => {
  it('confirma criação de relação entre contatos por readback', async () => {
    const before = snapshot()
    const after = snapshot({ contactRelationships: [{ id: 'rel-1', workspaceId: 'workspace-test', companyId: 'c1', fromContactId: 'p1', toContactId: 'p2', relationshipType: 'works_with', strength: 80, notes: '', createdAt: '', updatedAt: '' } as any] })
    const evidence = await verify('contacts.relationship_create', before, after)
    expect(evidence.status).toBe('verified')
  })

  it('confirma alteração em lote de leads por readback', async () => {
    const before = snapshot({ leads: [{ id: 'lead-1', name: 'Atlas', stageId: 's1', priority: 'medium' } as any] })
    const after = snapshot({ leads: [{ id: 'lead-1', name: 'Atlas', stageId: 's2', priority: 'high' } as any] })
    const evidence = await verify('leads.bulk_move', before, after)
    expect(evidence.status).toBe('verified')
  })

  it('confirma ligação com fluxo comercial por readback', async () => {
    const before = snapshot()
    const after = snapshot({ calls: [{ id: 'call-1', leadId: 'lead-1', outcome: 'callback_requested', startedAt: '2026-10-15T10:00:00Z' } as any] })
    const evidence = await verify('calls.register_outcome', before, after)
    expect(evidence.status).toBe('verified')
  })

  it('confirma criação de cadência por atividades persistidas', async () => {
    const before = snapshot()
    const after = snapshot({ activities: [{ id: 'act-1', leadId: 'lead-1', title: 'Cadência 1' } as any] })
    const evidence = await verify('cadences.create', before, after)
    expect(evidence.status).toBe('verified')
  })

  it('confirma nova revisão de proposta por readback', async () => {
    const before = snapshot({ proposals: [{ id: 'p1', title: 'Atlas', version: 1 } as any] })
    const after = snapshot({ proposals: [{ id: 'p1', title: 'Atlas', version: 1 } as any, { id: 'p2', title: 'Atlas', version: 2 } as any] })
    const evidence = await verify('proposals.create_revision', before, after)
    expect(evidence.status).toBe('verified')
  })

  it('confirma Buyer Room criada por readback', async () => {
    const before = snapshot()
    const after = snapshot({ buyerRooms: [{ id: 'room-1', proposalId: 'p1', title: 'Sala Atlas' } as any] })
    const evidence = await verify('buyer_rooms.create', before, after)
    expect(evidence.status).toBe('verified')
  })

  it('confirma automação atualizada por readback', async () => {
    const before = snapshot({ automationRules: [{ id: 'rule-1', name: 'Antiga', enabled: false } as any] })
    const after = snapshot({ automationRules: [{ id: 'rule-1', name: 'Nova', enabled: false } as any] })
    const evidence = await verify('automations.update', before, after)
    expect(evidence.status).toBe('verified')
  })

  it('confirma sincronização estrutural por readback', async () => {
    const before = snapshot()
    const after = snapshot({ companies: [{ id: 'company-1', name: 'Atlas' } as any] })
    const evidence = await verify('workspace.sync_structure', before, after)
    expect(evidence.status).toBe('verified')
  })

  it('só declara recibo verificado quando todas as mutações têm evidência verificada', async () => {
    const evidence = await Promise.all([
      verify('contacts.relationship_create', snapshot(), snapshot({ contactRelationships: [{ id: 'r1' } as any] })),
      verify('calls.register_outcome', snapshot(), snapshot({ calls: [{ id: 'c1' } as any] })),
      verify('buyer_rooms.create', snapshot(), snapshot({ buyerRooms: [{ id: 'b1' } as any] })),
    ])
    expect(receiptStatusFromEvidence(evidence)).toBe('verified')
  })
})
