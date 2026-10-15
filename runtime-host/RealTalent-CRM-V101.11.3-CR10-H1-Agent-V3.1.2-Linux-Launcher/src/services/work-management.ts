import type {
  TaskChecklistItem, TaskComment, TaskPriority, TaskRelation, TaskRelationEntity, TaskStatus,
  Team, TeamMembership, WorkTask,
} from '../domain/types'
import { createId, createUuid } from '../lib/id'
import { safeStorage } from '../lib/storage'
import { getSupabaseClient } from '../lib/supabase'
import { assertAccess, type EffectiveMemberAccess } from './team-access-control'

export interface WorkManagementSnapshot {
  teams: Team[]
  memberships: TeamMembership[]
  tasks: WorkTask[]
  relations: TaskRelation[]
  checklistItems: TaskChecklistItem[]
  comments: TaskComment[]
}

export interface TeamInput {
  id?: string
  name: string
  description?: string
  leaderId?: string | null
  color?: string
  active?: boolean
  memberIds?: string[]
}

export interface TaskInput {
  id?: string
  title: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  startsAt?: string | null
  dueAt?: string | null
  completedAt?: string | null
  assigneeId?: string | null
  assigneeName?: string
  teamId?: string | null
  recurrence?: WorkTask['recurrence']
  tags?: string[]
  relation?: { entityType: TaskRelationEntity; entityId: string; entityLabel: string } | null
  checklist?: Array<{ id?: string; title: string; completed?: boolean }>
}

const emptySnapshot = (): WorkManagementSnapshot => ({ teams: [], memberships: [], tasks: [], relations: [], checklistItems: [], comments: [] })
const storageKey = (workspaceId: string) => `realtalent:${workspaceId}:work-management:v1`
const now = () => new Date().toISOString()

const readLocal = (workspaceId: string): WorkManagementSnapshot => {
  const raw = safeStorage.getItem(storageKey(workspaceId))
  if (!raw) return emptySnapshot()
  try {
    const parsed = JSON.parse(raw) as Partial<WorkManagementSnapshot>
    return {
      teams: Array.isArray(parsed.teams) ? parsed.teams : [],
      memberships: Array.isArray(parsed.memberships) ? parsed.memberships : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      relations: Array.isArray(parsed.relations) ? parsed.relations : [],
      checklistItems: Array.isArray(parsed.checklistItems) ? parsed.checklistItems : [],
      comments: Array.isArray(parsed.comments) ? parsed.comments : [],
    }
  } catch {
    return emptySnapshot()
  }
}

const writeLocal = (workspaceId: string, snapshot: WorkManagementSnapshot) => safeStorage.setItem(storageKey(workspaceId), JSON.stringify(snapshot))

const mapTeam = (row: any): Team => ({
  id: row.id, workspaceId: row.organization_id, name: row.name, description: row.description ?? '', leaderId: row.leader_id ?? null,
  color: row.color ?? '#356AE6', active: row.active !== false, createdAt: row.created_at, updatedAt: row.updated_at,
})
const mapMembership = (row: any): TeamMembership => ({
  id: row.id, workspaceId: row.organization_id, teamId: row.team_id, userId: row.user_id,
  role: row.role === 'leader' ? 'leader' : 'member', allocationPercent: Number(row.allocation_percent ?? 100), createdAt: row.created_at,
})
const mapTask = (row: any): WorkTask => ({
  id: row.id, workspaceId: row.organization_id, title: row.title, description: row.description ?? '',
  status: row.status, priority: row.priority, startsAt: row.starts_at ?? null, dueAt: row.due_at ?? null, completedAt: row.completed_at ?? null,
  assigneeId: row.assignee_id ?? null, assigneeName: row.assignee_name ?? '', teamId: row.team_id ?? null,
  recurrence: row.recurrence ?? 'none', tags: Array.isArray(row.tags) ? row.tags : [], createdBy: row.created_by ?? null,
  createdAt: row.created_at, updatedAt: row.updated_at,
})
const mapRelation = (row: any): TaskRelation => ({ id: row.id, workspaceId: row.organization_id, taskId: row.task_id, entityType: row.entity_type, entityId: row.entity_id, entityLabel: row.entity_label ?? '', createdAt: row.created_at })
const mapChecklist = (row: any): TaskChecklistItem => ({ id: row.id, workspaceId: row.organization_id, taskId: row.task_id, title: row.title, completed: Boolean(row.completed), position: Number(row.position ?? 0), createdAt: row.created_at, updatedAt: row.updated_at })
const mapComment = (row: any): TaskComment => ({ id: row.id, workspaceId: row.organization_id, taskId: row.task_id, authorId: row.author_id ?? null, authorName: row.author_name ?? '', body: row.body, createdAt: row.created_at, updatedAt: row.updated_at })

const requireNoError = (error: { message?: string } | null | undefined, fallback: string) => {
  if (error) throw new Error(error.message || fallback)
}

export async function loadWorkManagement(mode: 'local' | 'supabase', workspaceId: string): Promise<WorkManagementSnapshot> {
  if (mode === 'local') return readLocal(workspaceId)
  const client = getSupabaseClient() as any
  if (!client) return readLocal(workspaceId)
  const [teams, memberships, tasks, relations, checklist, comments] = await Promise.all([
    client.from('teams').select('*').eq('organization_id', workspaceId).order('name'),
    client.from('team_members').select('*').eq('organization_id', workspaceId),
    client.from('work_tasks').select('*').eq('organization_id', workspaceId).order('created_at', { ascending: false }),
    client.from('task_relations').select('*').eq('organization_id', workspaceId),
    client.from('task_checklist_items').select('*').eq('organization_id', workspaceId).order('position'),
    client.from('task_comments').select('*').eq('organization_id', workspaceId).order('created_at'),
  ])
  for (const result of [teams, memberships, tasks, relations, checklist, comments]) requireNoError(result.error, 'Falha ao carregar Equipes e Tarefas.')
  return {
    teams: (teams.data ?? []).map(mapTeam), memberships: (memberships.data ?? []).map(mapMembership), tasks: (tasks.data ?? []).map(mapTask),
    relations: (relations.data ?? []).map(mapRelation), checklistItems: (checklist.data ?? []).map(mapChecklist), comments: (comments.data ?? []).map(mapComment),
  }
}

export async function saveTeam(mode: 'local' | 'supabase', workspaceId: string, input: TeamInput): Promise<Team> {
  const timestamp = now()
  const client = mode === 'supabase' ? getSupabaseClient() as any : null
  const id = input.id ?? (client ? createUuid() : createId('team'))
  const team: Team = { id, workspaceId, name: input.name.trim(), description: input.description?.trim() ?? '', leaderId: input.leaderId ?? null, color: input.color ?? '#356AE6', active: input.active !== false, createdAt: timestamp, updatedAt: timestamp }
  if (!team.name) throw new Error('Informe o nome da equipe.')
  if (!client) {
    const snapshot = readLocal(workspaceId)
    const previous = snapshot.teams.find((item) => item.id === id)
    const next = { ...team, createdAt: previous?.createdAt ?? timestamp }
    snapshot.teams = [next, ...snapshot.teams.filter((item) => item.id !== id)]
    const members = Array.from(new Set((input.memberIds ?? []).filter(Boolean)))
    snapshot.memberships = snapshot.memberships.filter((item) => item.teamId !== id)
    for (const userId of members) snapshot.memberships.push({ id: createId('tm'), workspaceId, teamId: id, userId, role: userId === next.leaderId ? 'leader' : 'member', allocationPercent: 100, createdAt: timestamp })
    if (next.leaderId && !members.includes(next.leaderId)) snapshot.memberships.push({ id: createId('tm'), workspaceId, teamId: id, userId: next.leaderId, role: 'leader', allocationPercent: 100, createdAt: timestamp })
    writeLocal(workspaceId, snapshot)
    return next
  }
  const payload = { id, organization_id: workspaceId, name: team.name, description: team.description, leader_id: team.leaderId, color: team.color, active: team.active, updated_at: timestamp }
  const result = await client.from('teams').upsert(payload).select('*').single()
  requireNoError(result.error, 'Falha ao salvar a equipe.')
  const deleteMemberships = await client.from('team_members').delete().eq('organization_id', workspaceId).eq('team_id', id)
  requireNoError(deleteMemberships.error, 'Equipe salva, mas não foi possível substituir os membros anteriores.')
  const memberIds = Array.from(new Set([...(input.memberIds ?? []), ...(team.leaderId ? [team.leaderId] : [])].filter(Boolean)))
  if (memberIds.length) {
    const membershipRows = memberIds.map((userId) => ({ organization_id: workspaceId, team_id: id, user_id: userId, role: userId === team.leaderId ? 'leader' : 'member', allocation_percent: 100 }))
    const membershipsResult = await client.from('team_members').insert(membershipRows)
    requireNoError(membershipsResult.error, 'Equipe salva, mas não foi possível atualizar os membros.')
  }
  return mapTeam(result.data)
}

export async function deleteTeam(mode: 'local' | 'supabase', workspaceId: string, teamId: string): Promise<void> {
  if (mode === 'local' || !getSupabaseClient()) {
    const snapshot = readLocal(workspaceId)
    snapshot.teams = snapshot.teams.filter((item) => item.id !== teamId)
    snapshot.memberships = snapshot.memberships.filter((item) => item.teamId !== teamId)
    snapshot.tasks = snapshot.tasks.map((task) => task.teamId === teamId ? { ...task, teamId: null, updatedAt: now() } : task)
    writeLocal(workspaceId, snapshot)
    return
  }
  const result = await (getSupabaseClient() as any).from('teams').delete().eq('organization_id', workspaceId).eq('id', teamId)
  requireNoError(result.error, 'Falha ao excluir a equipe.')
}

export async function saveTask(mode: 'local' | 'supabase', workspaceId: string, input: TaskInput, createdBy: string | null = null, access: EffectiveMemberAccess | null = null): Promise<WorkTask> {
  const timestamp = now()
  const client = mode === 'supabase' ? getSupabaseClient() as any : null
  const id = input.id ?? (client ? createUuid() : createId('task'))
  if (!input.title.trim()) throw new Error('Informe o título da tarefa.')

  let previous: WorkTask | null = null
  if (input.id) {
    if (!client) {
      previous = readLocal(workspaceId).tasks.find((item) => item.id === input.id) ?? null
    } else {
      const existing = await client.from('work_tasks').select('*').eq('organization_id', workspaceId).eq('id', input.id).single()
      requireNoError(existing.error, 'Tarefa não encontrada ou fora do seu escopo.')
      previous = existing.data ? mapTask(existing.data) : null
    }
    if (!previous) throw new Error('Tarefa não encontrada.')
    assertAccess(access, 'edit', 'tasks', previous.assigneeId, previous.teamId)
    const assignmentChanged = (input.assigneeId ?? null) !== (previous.assigneeId ?? null) || (input.teamId ?? null) !== (previous.teamId ?? null)
    if (assignmentChanged) {
      assertAccess(access, 'assign', 'tasks', previous.assigneeId, previous.teamId)
      assertAccess(access, 'assign', 'tasks', input.assigneeId ?? null, input.teamId ?? null)
    }
  } else {
    assertAccess(access, 'create', 'tasks', input.assigneeId ?? createdBy, input.teamId ?? null)
    const delegated = Boolean((input.assigneeId && input.assigneeId !== createdBy) || (!input.assigneeId && input.teamId))
    if (delegated) assertAccess(access, 'assign', 'tasks', input.assigneeId ?? null, input.teamId ?? null)
  }
  const completed = input.status === 'completed'
  const task: WorkTask = {
    id, workspaceId, title: input.title.trim(), description: input.description?.trim() ?? '', status: input.status ?? 'todo', priority: input.priority ?? 'normal',
    startsAt: input.startsAt ?? null, dueAt: input.dueAt ?? null, completedAt: completed ? (input.completedAt ?? timestamp) : null, assigneeId: input.assigneeId ?? null,
    assigneeName: input.assigneeName?.trim() ?? '', teamId: input.teamId ?? null, recurrence: input.recurrence ?? 'none', tags: Array.from(new Set(input.tags ?? [])),
    createdBy, createdAt: timestamp, updatedAt: timestamp,
  }
  if (!client) {
    const snapshot = readLocal(workspaceId)
    const localPrevious = previous ?? snapshot.tasks.find((item) => item.id === id) ?? null
    const next = { ...task, createdAt: localPrevious?.createdAt ?? timestamp, completedAt: completed ? (localPrevious?.completedAt ?? timestamp) : null }
    snapshot.tasks = [next, ...snapshot.tasks.filter((item) => item.id !== id)]
    snapshot.relations = snapshot.relations.filter((item) => item.taskId !== id)
    if (input.relation?.entityId) snapshot.relations.push({ id: createId('rel'), workspaceId, taskId: id, entityType: input.relation.entityType, entityId: input.relation.entityId, entityLabel: input.relation.entityLabel, createdAt: timestamp })
    snapshot.checklistItems = snapshot.checklistItems.filter((item) => item.taskId !== id)
    for (const [position, item] of (input.checklist ?? []).filter((item) => item.title.trim()).entries()) snapshot.checklistItems.push({ id: item.id ?? createId('check'), workspaceId, taskId: id, title: item.title.trim(), completed: Boolean(item.completed), position, createdAt: timestamp, updatedAt: timestamp })
    writeLocal(workspaceId, snapshot)
    return next
  }
  const payload = {
    id, organization_id: workspaceId, title: task.title, description: task.description, status: task.status, priority: task.priority,
    starts_at: task.startsAt, due_at: task.dueAt, completed_at: task.completedAt, assignee_id: task.assigneeId, assignee_name: task.assigneeName,
    team_id: task.teamId, recurrence: task.recurrence, tags: task.tags, updated_at: timestamp,
    ...(input.id ? {} : { created_by: createdBy }),
  }
  const result = await client.from('work_tasks').upsert(payload).select('*').single()
  requireNoError(result.error, 'Falha ao salvar a tarefa.')
  const [deleteRelations, deleteChecklist] = await Promise.all([
    client.from('task_relations').delete().eq('organization_id', workspaceId).eq('task_id', id),
    client.from('task_checklist_items').delete().eq('organization_id', workspaceId).eq('task_id', id),
  ])
  requireNoError(deleteRelations.error, 'Tarefa salva, mas não foi possível substituir as relações anteriores.')
  requireNoError(deleteChecklist.error, 'Tarefa salva, mas não foi possível substituir o checklist anterior.')
  if (input.relation?.entityId) {
    const rel = await client.from('task_relations').insert({ organization_id: workspaceId, task_id: id, entity_type: input.relation.entityType, entity_id: input.relation.entityId, entity_label: input.relation.entityLabel })
    requireNoError(rel.error, 'Tarefa salva, mas a relação com o CRM falhou.')
  }
  const checklistRows = (input.checklist ?? []).filter((item) => item.title.trim()).map((item, position) => ({ id: item.id, organization_id: workspaceId, task_id: id, title: item.title.trim(), completed: Boolean(item.completed), position })).map(({ id: rowId, ...rest }) => rowId ? { id: rowId, ...rest } : rest)
  if (checklistRows.length) {
    const checklistResult = await client.from('task_checklist_items').insert(checklistRows)
    requireNoError(checklistResult.error, 'Tarefa salva, mas o checklist não pôde ser atualizado.')
  }
  return mapTask(result.data)
}

export async function updateTaskStatus(mode: 'local' | 'supabase', workspaceId: string, taskId: string, status: TaskStatus, access: EffectiveMemberAccess | null = null): Promise<void> {
  if (mode === 'local' || !getSupabaseClient()) {
    const snapshot = readLocal(workspaceId)
    const target = snapshot.tasks.find((task) => task.id === taskId)
    if (!target) throw new Error('Tarefa não encontrada.')
    assertAccess(access, 'edit', 'tasks', target.assigneeId, target.teamId)
    snapshot.tasks = snapshot.tasks.map((task) => task.id === taskId ? { ...task, status, completedAt: status === 'completed' ? (task.completedAt ?? now()) : null, updatedAt: now() } : task)
    writeLocal(workspaceId, snapshot)
    return
  }
  const client = getSupabaseClient() as any
  const existing = await client.from('work_tasks').select('assignee_id,team_id').eq('organization_id', workspaceId).eq('id', taskId).single()
  if (existing.error) throw new Error(existing.error.message || 'Tarefa não encontrada ou fora do seu escopo.')
  assertAccess(access, 'edit', 'tasks', existing.data?.assignee_id ?? null, existing.data?.team_id ?? null)
  const result = await client.from('work_tasks').update({ status, completed_at: status === 'completed' ? now() : null, updated_at: now() }).eq('organization_id', workspaceId).eq('id', taskId)
  requireNoError(result.error, 'Falha ao atualizar o status da tarefa.')
}

export async function deleteTask(mode: 'local' | 'supabase', workspaceId: string, taskId: string, access: EffectiveMemberAccess | null = null): Promise<void> {
  if (mode === 'local' || !getSupabaseClient()) {
    const snapshot = readLocal(workspaceId)
    const target = snapshot.tasks.find((task) => task.id === taskId)
    if (!target) throw new Error('Tarefa não encontrada.')
    assertAccess(access, 'delete', 'tasks', target.assigneeId, target.teamId)
    snapshot.tasks = snapshot.tasks.filter((item) => item.id !== taskId)
    snapshot.relations = snapshot.relations.filter((item) => item.taskId !== taskId)
    snapshot.checklistItems = snapshot.checklistItems.filter((item) => item.taskId !== taskId)
    snapshot.comments = snapshot.comments.filter((item) => item.taskId !== taskId)
    writeLocal(workspaceId, snapshot)
    return
  }
  const client = getSupabaseClient() as any
  const existing = await client.from('work_tasks').select('assignee_id,team_id').eq('organization_id', workspaceId).eq('id', taskId).single()
  if (existing.error) throw new Error(existing.error.message || 'Tarefa não encontrada ou fora do seu escopo.')
  assertAccess(access, 'delete', 'tasks', existing.data?.assignee_id ?? null, existing.data?.team_id ?? null)
  const result = await client.from('work_tasks').delete().eq('organization_id', workspaceId).eq('id', taskId)
  requireNoError(result.error, 'Falha ao excluir a tarefa.')
}

export const taskStatusLabel: Record<TaskStatus, string> = { todo: 'A fazer', in_progress: 'Em andamento', blocked: 'Bloqueada', completed: 'Concluída', cancelled: 'Cancelada' }
export const taskPriorityLabel: Record<TaskPriority, string> = { low: 'Baixa', normal: 'Normal', high: 'Alta', urgent: 'Urgente' }
