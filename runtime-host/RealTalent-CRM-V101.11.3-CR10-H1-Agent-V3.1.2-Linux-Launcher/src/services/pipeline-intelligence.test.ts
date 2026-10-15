import { describe, expect, it } from 'vitest'
import type { ActivityItem, CalendarEvent, CallRecord, Lead, PipelineStage } from '../domain/types'
import { buildPipelineSignal, expectedCloseState, forecastMonthKey, latestStageEntryAt, recommendedStagePolicy } from './pipeline-intelligence'

const lead: Lead = { id: 'lead-1', workspaceId: 'w', name: 'Ana', company: 'ACME', phone: '', email: '', city: '', source: 'Manual', stageId: 'proposal', status: 'active', temperature: 'warm', priority: 'medium', ownerId: null, ownerName: 'Equipe', value: 1000, nextActionAt: '2026-07-25T12:00:00.000Z', expectedCloseAt: '2026-07-30', notes: '', tags: [], createdAt: '2026-07-01T12:00:00.000Z', updatedAt: '2026-07-19T12:00:00.000Z' }
const stage: PipelineStage = { id: 'proposal', workspaceId: 'w', name: 'Proposta enviada', order: 3, color: '#000000', probability: 70, isWon: false, isLost: false }
const activity = (patch: Partial<ActivityItem>): ActivityItem => ({ id: 'a', workspaceId: 'w', leadId: lead.id, type: 'note', title: '', description: '', dueAt: null, completedAt: null, assignedTo: null, sourceType: 'manual', sourceId: null, createdAt: '2026-07-01T12:00:00.000Z', updatedAt: '2026-07-01T12:00:00.000Z', ...patch })
const snapshot = (activities: ActivityItem[] = []) => ({ activities, calls: [] as CallRecord[], events: [] as CalendarEvent[] })

describe('pipeline intelligence', () => {
  it('mede a permanência pela última troca de etapa, sem usar updatedAt', () => {
    const activities = [activity({ id: 'old', type: 'stage_change', createdAt: '2026-07-05T12:00:00.000Z' }), activity({ id: 'new', type: 'stage_change', createdAt: '2026-07-10T12:00:00.000Z' })]
    expect(latestStageEntryAt(lead, snapshot(activities))).toBe('2026-07-10T12:00:00.000Z')
    expect(buildPipelineSignal(lead, stage, snapshot(activities), recommendedStagePolicy(stage, 3, 6), new Date('2026-07-19T12:00:00.000Z')).stageAge).toBe(9)
  })

  it('não considera atividade pendente como interação concluída', () => {
    const pending = activity({ dueAt: '2026-07-19T10:00:00.000Z', completedAt: null })
    expect(buildPipelineSignal(lead, stage, snapshot([pending]), recommendedStagePolicy(stage), new Date('2026-07-19T12:00:00.000Z')).lastInteractionAt).toBeNull()
  })

  it('sinaliza proposta parada e fechamento vencido', () => {
    const proposal = buildPipelineSignal(lead, stage, snapshot([activity({ type: 'stage_change', createdAt: '2026-07-10T12:00:00.000Z' })]), recommendedStagePolicy(stage), new Date('2026-07-19T12:00:00.000Z'))
    expect(proposal.health).toBe('proposal_stale')
    expect(expectedCloseState('2026-07-01', new Date('2026-07-19T12:00:00.000Z'))).toBe('overdue')
  })

  it('agrupa o forecast pela previsão de fechamento', () => {
    expect(forecastMonthKey('2026-07-30')).toBe('julho de 2026')
    expect(forecastMonthKey(null)).toBe('Sem previsão')
  })
})
