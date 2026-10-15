import { describe, expect, it } from 'vitest'
import type { ActivityItem, CallRecord } from '../domain/types'
import { buildPipelineCallStatus } from './pipeline-call-status'

const call = (startedAt: string): CallRecord => ({
  id: 'call-1', workspaceId: 'workspace-1', leadId: 'lead-1', userId: null, outcome: 'answered', durationSeconds: 30,
  notes: '', transcript: '', recordingPath: null, startedAt, endedAt: startedAt, createdAt: startedAt,
})
const activity = (dueAt: string): ActivityItem => ({
  id: 'activity-1', workspaceId: 'workspace-1', leadId: 'lead-1', type: 'call', title: 'Ligar', description: '', dueAt,
  completedAt: null, assignedTo: null, sourceType: 'manual', sourceId: null, createdAt: dueAt, updatedAt: dueAt,
})
const now = new Date('2026-07-19T15:00:00-03:00')

describe('buildPipelineCallStatus', () => {
  it('identifica lead ainda não ligado', () => {
    expect(buildPipelineCallStatus('lead-1', [], [], now).tone).toBe('pending')
  })

  it('prioriza ligação atrasada mesmo quando já houve contato anterior', () => {
    const result = buildPipelineCallStatus('lead-1', [call('2026-07-18T10:00:00-03:00')], [activity('2026-07-19T14:00:00-03:00')], now)
    expect(result).toMatchObject({ tone: 'overdue', label: 'Falta ligar' })
  })

  it('identifica ligação feita hoje', () => {
    const result = buildPipelineCallStatus('lead-1', [call('2026-07-19T11:00:00-03:00')], [], now)
    expect(result).toMatchObject({ tone: 'done', label: 'Ligado hoje' })
  })

  it('identifica ligação futura agendada', () => {
    const result = buildPipelineCallStatus('lead-1', [], [activity('2026-07-21T09:00:00-03:00')], now)
    expect(result).toMatchObject({ tone: 'scheduled', label: 'Ligação agendada' })
  })
})
