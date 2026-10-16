import type { ActivityItem, ContactRecord, TaskRelation, WorkTask } from '../domain/types'
import type { WorkManagementSnapshot } from './work-management'

interface WorkTaskProjectionContext {
  contacts?: ContactRecord[]
}

const relationByTaskId = (relations: TaskRelation[]) => new Map(relations.map((relation) => [relation.taskId, relation]))

const linkedLeadId = (relation: TaskRelation | undefined, contacts: ContactRecord[]) => {
  if (!relation) return null
  if (relation.entityType === 'lead') return relation.entityId
  if (relation.entityType === 'contact') return contacts.find((contact) => contact.id === relation.entityId)?.leadIds?.[0] ?? null
  return null
}

const linkedContactId = (relation: TaskRelation | undefined) => relation?.entityType === 'contact' ? relation.entityId : null

export const workTaskToActivityProjection = (
  task: WorkTask,
  relation: TaskRelation | undefined,
  context: WorkTaskProjectionContext = {},
): ActivityItem => ({
  id: `work-task:${task.id}`,
  workspaceId: task.workspaceId,
  leadId: linkedLeadId(relation, context.contacts ?? []),
  contactId: linkedContactId(relation),
  type: 'followup',
  title: task.title,
  description: task.description,
  dueAt: task.dueAt,
  completedAt: task.completedAt,
  resolutionStatus: task.status === 'completed' ? 'completed' : task.status === 'cancelled' ? 'cancelled' : 'pending',
  resolutionReason: null,
  originEventKey: `work-task:${task.id}`,
  purpose: task.tags.includes('realtalent-agent') ? 'Tarefa criada pela RealTalent Agent' : 'Tarefa do CRM',
  assignedTo: task.assigneeId,
  sourceType: 'system',
  sourceId: task.id,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
})

export const projectWorkTasksToActivities = (
  activities: ActivityItem[],
  workManagement: Pick<WorkManagementSnapshot, 'tasks' | 'relations'>,
  context: WorkTaskProjectionContext = {},
): ActivityItem[] => {
  const relations = relationByTaskId(workManagement.relations)
  const projected = workManagement.tasks.map((task) => workTaskToActivityProjection(task, relations.get(task.id), context))
  const projectedIds = new Set(projected.map((activity) => activity.id))
  return [...activities.filter((activity) => !projectedIds.has(activity.id)), ...projected]
}

export const isWorkTaskActivityProjection = (activity: Pick<ActivityItem, 'originEventKey'>) => activity.originEventKey?.startsWith('work-task:') === true
