import { describe, expect, it } from 'vitest'
import { runRealTalentAssistant } from './realtalent-assistant'
import type { WorkspaceSnapshot } from '../domain/types'

const snapshot = {
  workspace: { id: 'w1', name: 'Demo', slug: 'demo', role: 'owner', createdAt: new Date().toISOString() },
  stages: [{ id: 's1', workspaceId: 'w1', name: 'Proposta', order: 1, color: '#000', probability: 60, isWon: false, isLost: false }],
  leads: [{ id: 'l1', workspaceId: 'w1', name: 'Carlos', company: 'Morada', phone: '51999999999', email: '', city: 'Canoas', source: 'manual', stageId: 's1', status: 'active', temperature: 'hot', priority: 'high', ownerId: null, ownerName: 'Equipe', value: 8000, nextActionAt: null, notes: '', tags: [], createdAt: '2026-09-01T12:00:00Z', updatedAt: '2026-09-01T12:00:00Z' }],
  activities: [], calls: [], events: [], playbooks: [], goals: [], automationRules: [], automationRuns: [], companies: [], contacts: [], contactRelationships: [], opportunities: [], socialProfiles: [], products: [], proposals: [], buyerRooms: [], revenueEntries: [],
} as unknown as WorkspaceSnapshot

describe('RealTalent Assistant', () => {
  it('prioritizes commercial work', () => {
    const result = runRealTalentAssistant('o que devo fazer hoje?', snapshot, { now: new Date('2026-09-15T12:00:00Z') })
    expect(result.intent).toBe('priorities')
    expect(result.items[0]?.leadId).toBe('l1')
  })
  it('creates a preview instead of mutating data', () => {
    const result = runRealTalentAssistant('crie follow-up para esses leads amanhã às 10h', snapshot, { previousLeadIds: ['l1'], now: new Date('2026-09-15T12:00:00Z') })
    expect(result.plan?.kind).toBe('create_followups')
    expect(result.plan?.leadIds).toEqual(['l1'])
    expect(new Date(result.plan!.dueAt).getHours()).toBe(10)
  })
  it('uses the focused CRM lead without repeating the company name', () => {
    const result = runRealTalentAssistant('prepare a ligação', snapshot, { focusLeadId: 'l1', currentRoute: 'pipeline', now: new Date('2026-09-15T12:00:00Z') })
    expect(result.intent).toBe('prepare_call')
    expect(result.focus?.leadId).toBe('l1')
    expect(result.title).toContain('Morada')
  })
  it('summarizes contextual history and suggests a next action', () => {
    const history = runRealTalentAssistant('resuma o histórico desta conta', snapshot, { focusLeadId: 'l1', now: new Date('2026-09-15T12:00:00Z') })
    const next = runRealTalentAssistant('qual a próxima ação?', snapshot, { focusLeadId: 'l1', now: new Date('2026-09-15T12:00:00Z') })
    expect(history.intent).toBe('activity_summary')
    expect(history.focus?.leadId).toBe('l1')
    expect(next.intent).toBe('next_action')
    expect(next.items[0]?.leadId).toBe('l1')
  })
  it('creates a contextual message draft but does not send it', () => {
    const result = runRealTalentAssistant('sugira uma mensagem', snapshot, { focusLeadId: 'l1', now: new Date('2026-09-15T12:00:00Z') })
    expect(result.intent).toBe('suggest_message')
    expect(result.draft?.leadId).toBe('l1')
    expect(result.draft?.body).toContain('Carlos')
  })

})
