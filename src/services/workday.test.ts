import { describe, expect, it } from 'vitest'
import { DEFAULT_STAGES, DEMO_WORKSPACE } from '../domain/defaults'
import type { Lead, WorkspaceSnapshot } from '../domain/types'
import { DEFAULT_LEAD_SCORING_CONFIG } from './lead-scoring'
import { addBusinessMinutes, buildWorkdayQueue } from './workday'

const now = new Date('2026-07-19T15:00:00.000Z')
const lead = (overrides: Partial<Lead> = {}): Lead => ({
  id: 'lead-1', workspaceId: DEMO_WORKSPACE.id, name: 'Lead teste', company: 'Real', phone: '51999999999', email: '', city: 'Canoas', source: 'Site', stageId: 'stage-new', status: 'active', temperature: 'warm', priority: 'medium', ownerId: 'seller-1', ownerName: 'Ana', value: 1000, nextActionAt: null, notes: '', tags: [], createdAt: '2026-07-19T13:00:00.000Z', updatedAt: '2026-07-19T13:00:00.000Z', ...overrides,
})
const snapshot = (leads: Lead[]): WorkspaceSnapshot => ({ workspace: DEMO_WORKSPACE, stages: DEFAULT_STAGES, leads, activities: [], calls: [], events: [], playbooks: [], goals: [], automationRules: [], automationRuns: [], companies: [], contacts: [], opportunities: [], socialProfiles: [] })
const config = { firstContactSlaMinutes: 30, staleLeadDays: 7, proposalFollowupDays: 3, businessDays: [1, 2, 3, 4, 5, 6, 0], businessStart: '08:30', businessEnd: '18:00', leadScoring: DEFAULT_LEAD_SCORING_CONFIG }

describe('fila Meu Dia', () => {
  it('conta o SLA somente dentro do expediente configurado', () => {
    const due = addBusinessMinutes(new Date(2026, 6, 17, 17, 50).toISOString(), 30, { businessDays: [1, 2, 3, 4, 5], businessStart: '08:30', businessEnd: '18:00', leadScoring: DEFAULT_LEAD_SCORING_CONFIG })
    expect([due.getDay(), due.getHours(), due.getMinutes()]).toEqual([1, 8, 50])
  })

  it('marca SLA de primeiro contato vencido e explica o motivo', () => {
    const queue = buildWorkdayQueue(snapshot([lead()]), config, now)
    expect(queue.breached).toBe(1)
    expect(queue.items[0].reasons).toContain('sla')
    expect(queue.items[0].explanation).toContain('SLA de primeiro contato vencido')
  })

  it('prioriza retorno vencido acima de ação apenas sem data', () => {
    const overdue = lead({ id: 'overdue', nextActionAt: '2026-07-18T15:00:00.000Z' })
    const noAction = lead({ id: 'no-action', createdAt: '2026-07-19T14:50:00.000Z', updatedAt: '2026-07-19T14:50:00.000Z' })
    expect(buildWorkdayQueue(snapshot([noAction, overdue]), config, now).items[0].lead.id).toBe('overdue')
  })

  it('identifica proposta parada com limite configurável', () => {
    const proposal = lead({ stageId: 'stage-proposal', createdAt: '2026-07-10T12:00:00.000Z', updatedAt: '2026-07-10T12:00:00.000Z' })
    const item = buildWorkdayQueue(snapshot([proposal]), config, now).items[0]
    expect(item.reasons).toContain('proposal')
    expect(item.action).toBe('review')
  })

  it('permite limitar a fila ao responsável conectado', () => {
    const other = lead({ id: 'other', ownerId: 'seller-2' })
    const queue = buildWorkdayQueue(snapshot([lead(), other]), config, now, 'seller-1')
    expect(queue.items.map((item) => item.lead.id)).toEqual(['lead-1'])
  })
})
