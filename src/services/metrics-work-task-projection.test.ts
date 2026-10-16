import { describe, expect, it } from 'vitest'
import type { ActivityItem, WorkspaceSnapshot } from '../domain/types'
import { calculateActivityIntelligence, getMetricValue } from './metrics'

const activity = (patch: Partial<ActivityItem>): ActivityItem => ({
  id: 'activity-1', workspaceId: 'workspace-1', leadId: 'lead-1', contactId: null,
  type: 'followup', title: 'Follow-up', description: '', dueAt: '2026-10-16T12:00:00.000Z',
  completedAt: '2026-10-16T12:30:00.000Z', resolutionStatus: 'completed', resolutionReason: null,
  originEventKey: null, purpose: '', assignedTo: 'user-1', sourceType: 'manual', sourceId: null,
  createdAt: '2026-10-16T11:00:00.000Z', updatedAt: '2026-10-16T12:30:00.000Z',
  ...patch,
})

const snapshot = (activities: ActivityItem[]) => ({
  activities,
  calls: [], events: [], leads: [{ id: 'lead-1', ownerId: 'user-1' }], stages: [], goals: [],
} as unknown as WorkspaceSnapshot)

describe('metrics with WorkTask activity projections', () => {
  it('does not count a completed projected WorkTask as a completed follow-up goal', () => {
    const value = getMetricValue(snapshot([
      activity({ id: 'work-task:task-1', originEventKey: 'work-task:task-1', sourceType: 'system', sourceId: 'task-1' }),
      activity({ id: 'real-followup', originEventKey: null, sourceType: 'manual', sourceId: null }),
    ]), 'followups', '2026-10-16', '2026-10-16', 'user-1')
    expect(value).toBe(1)
  })

  it('keeps projected overdue tasks visible to operational intelligence without counting them as completed follow-ups', () => {
    const data = calculateActivityIntelligence(snapshot([
      activity({ id: 'work-task:task-1', originEventKey: 'work-task:task-1', completedAt: null, resolutionStatus: 'pending', dueAt: '2026-10-15T12:00:00.000Z' }),
    ]), { start: '2026-10-15', end: '2026-10-16', label: '2 dias' })
    expect(data.completedFollowups).toHaveLength(0)
    expect(data.overdue).toHaveLength(1)
  })
})
