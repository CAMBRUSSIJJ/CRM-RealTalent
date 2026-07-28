import { describe, expect, it } from 'vitest'
import type { Lead } from '../domain/types'
import { buildCallQueue, calculateCallPerformance, defaultNextDate, outcomeLabel } from './call-workspace'

const lead = (overrides: Partial<Lead>): Lead => ({
  id: 'lead-1', workspaceId: 'ws', name: 'Lead', company: 'Empresa', phone: '51999999999', email: '', city: '', source: '', stageId: 'stage-1',
  status: 'active', temperature: 'warm', priority: 'medium', ownerId: null, ownerName: '', value: 0, nextActionAt: null, notes: '', tags: [], createdAt: '2026-07-01T10:00:00Z', updatedAt: '2026-07-01T10:00:00Z', ...overrides,
})

describe('call workspace', () => {
  it('prioritizes overdue urgent leads', () => {
    const now = new Date('2026-07-18T12:00:00-03:00')
    const queue = buildCallQueue([
      lead({ id: 'normal', priority: 'low', nextActionAt: '2026-07-18T15:00:00-03:00' }),
      lead({ id: 'urgent', priority: 'urgent', temperature: 'hot', nextActionAt: '2026-07-17T09:00:00-03:00' }),
    ], [], [], [], now)
    expect(queue[0].lead.id).toBe('urgent')
    expect(queue[0].bucket).toBe('overdue')
  })

  it('calculates contact and meeting rates', () => {
    const stats = calculateCallPerformance([
      { id: '1', workspaceId: 'ws', leadId: 'l', userId: null, outcome: 'answered', durationSeconds: 60, notes: '', transcript: '', recordingPath: null, startedAt: '2026-07-18T10:00:00-03:00', endedAt: null, createdAt: '2026-07-18T10:00:00-03:00' },
      { id: '2', workspaceId: 'ws', leadId: 'l', userId: null, outcome: 'meeting_scheduled', durationSeconds: 120, notes: '', transcript: '', recordingPath: null, startedAt: '2026-07-18T11:00:00-03:00', endedAt: null, createdAt: '2026-07-18T11:00:00-03:00' },
      { id: '3', workspaceId: 'ws', leadId: 'l', userId: null, outcome: 'no_answer', durationSeconds: 0, notes: '', transcript: '', recordingPath: null, startedAt: '2026-07-18T12:00:00-03:00', endedAt: null, createdAt: '2026-07-18T12:00:00-03:00' },
    ], new Date('2026-07-18T15:00:00-03:00'))
    expect(stats.answerRate).toBe(67)
    expect(stats.meetingRate).toBe(50)
  })

  it('provides labels and suggested next dates', () => {
    expect(outcomeLabel('callback_requested')).toBe('Pediu retorno')
    expect(defaultNextDate('invalid_number')).toBeNull()
  })
})
