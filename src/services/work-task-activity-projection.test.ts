import { describe, expect, it } from 'vitest'
import type { ContactRecord, TaskRelation, WorkTask } from '../domain/types'
import { isWorkTaskActivityProjection, projectWorkTasksToActivities, workTaskToActivityProjection } from './work-task-activity-projection'

const task = (patch: Partial<WorkTask> = {}): WorkTask => ({
  id: 'task-1', workspaceId: 'workspace-1', title: 'Ligar para Camila', description: 'Confirmar interesse', status: 'todo', priority: 'high',
  startsAt: null, dueAt: '2026-10-16T14:00:00.000Z', completedAt: null, assigneeId: 'user-1', assigneeName: 'Vendedor', teamId: null,
  recurrence: 'none', tags: ['realtalent-agent'], createdBy: 'user-1', createdAt: '2026-10-16T12:00:00.000Z', updatedAt: '2026-10-16T12:00:00.000Z',
  ...patch,
})

const relation = (patch: Partial<TaskRelation> = {}): TaskRelation => ({
  id: 'rel-1', workspaceId: 'workspace-1', taskId: 'task-1', entityType: 'lead', entityId: 'lead-1', entityLabel: 'Camila', createdAt: '2026-10-16T12:00:00.000Z',
  ...patch,
})

describe('Work Task → Activity projection', () => {
  it('projects a canonical WorkTask as a timeline/Meu Dia activity without changing its identity', () => {
    const activity = workTaskToActivityProjection(task(), relation())
    expect(activity.id).toBe('work-task:task-1')
    expect(activity.leadId).toBe('lead-1')
    expect(activity.type).toBe('followup')
    expect(activity.dueAt).toBe('2026-10-16T14:00:00.000Z')
    expect(activity.sourceId).toBe('task-1')
    expect(activity.purpose).toContain('RealTalent Agent')
    expect(isWorkTaskActivityProjection(activity)).toBe(true)
  })

  it('resolves a contact task back to the commercial lead used by the contact timeline', () => {
    const contacts: ContactRecord[] = [{ id: 'contact-1', leadIds: ['lead-1'] } as ContactRecord]
    const activity = workTaskToActivityProjection(task(), relation({ entityType: 'contact', entityId: 'contact-1' }), { contacts })
    expect(activity.contactId).toBe('contact-1')
    expect(activity.leadId).toBe('lead-1')
  })

  it('preserves completed/cancelled state so Meu Dia does not treat closed work as pending', () => {
    expect(workTaskToActivityProjection(task({ status: 'completed', completedAt: '2026-10-16T15:00:00.000Z' }), relation()).resolutionStatus).toBe('completed')
    expect(workTaskToActivityProjection(task({ status: 'cancelled' }), relation()).resolutionStatus).toBe('cancelled')
  })

  it('merges projections with persisted activities without duplicating projection ids', () => {
    const projected = projectWorkTasksToActivities([
      { ...workTaskToActivityProjection(task(), relation()), title: 'stale projection' },
      { ...workTaskToActivityProjection(task({ id: 'persisted' }), undefined), id: 'activity-real', originEventKey: null, sourceId: null, title: 'Persisted activity' },
    ], { tasks: [task()], relations: [relation()] })
    expect(projected.filter((activity) => activity.id === 'work-task:task-1')).toHaveLength(1)
    expect(projected.find((activity) => activity.id === 'work-task:task-1')?.title).toBe('Ligar para Camila')
    expect(projected.some((activity) => activity.id === 'activity-real')).toBe(true)
  })

  it('does not leak internal/unlinked tasks into commercial activities', () => {
    const projected = projectWorkTasksToActivities([], { tasks: [task()], relations: [] })
    expect(projected).toEqual([])
  })

  it('does not project tasks linked only to non-commercial objects', () => {
    const projected = projectWorkTasksToActivities([], {
      tasks: [task()],
      relations: [relation({ entityType: 'pipeline', entityId: 'pipeline-1', entityLabel: 'Pipeline' })],
    })
    expect(projected).toEqual([])
  })
})
