import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarDays, CheckCircle2, CircleDot, Clock3, Kanban, ListChecks, Pencil, Plus, Search, Trash2, UserRound, UsersRound } from 'lucide-react'
import { useAppActions, useAppUi, useAppWorkspace } from '../../app/app-context'
import { useAuth } from '../auth/auth-context'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { StatusPill } from '../../components/ui/status-pill'
import { NativeSelectionSelect } from '../../components/selection'
import type { TaskRelation, TaskStatus, Team, WorkTask, WorkspaceMember } from '../../domain/types'
import { deleteTask, loadWorkManagement, saveTask, taskPriorityLabel, taskStatusLabel, updateTaskStatus, type WorkManagementSnapshot } from '../../services/work-management'
import { TaskModal } from './task-modal'
import { WorkspaceCommandBar, WorkspaceCommandGroup, WorkspacePageHeader, WorkspaceSummaryMetric, WorkspaceSummaryStrip, WorkspaceViewStrip } from '../../components/workspace/workspace-shell'

type ViewMode = 'list' | 'board' | 'today' | 'overdue' | 'completed'
const OPEN_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'blocked']
const statusTone = (status: TaskStatus) => status === 'completed' ? 'success' : status === 'blocked' ? 'danger' : status === 'in_progress' ? 'info' : status === 'cancelled' ? 'neutral' : 'warning'
const priorityTone = (priority: WorkTask['priority']) => priority === 'urgent' ? 'danger' : priority === 'high' ? 'warning' : priority === 'normal' ? 'info' : 'neutral'
const todayKey = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}` }
const dueKey = (value: string | null) => value ? new Date(value).toLocaleDateString('en-CA') : ''
const dueLabel = (value: string | null) => value ? new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Sem prazo'

export function TasksPage() {
  const { currentWorkspace, repositoryMode, snapshot, teamAccess, canTeamAccess, canTeamAccessRecord } = useAppWorkspace()
  const { listWorkspaceMembers } = useAppActions()
  const { notify, confirmAction } = useAppUi()
  const { user } = useAuth()
  const [data, setData] = useState<WorkManagementSnapshot>({ teams: [], memberships: [], tasks: [], relations: [], checklistItems: [], comments: [] })
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [view, setView] = useState<ViewMode>('list')
  const [query, setQuery] = useState('')
  const [owner, setOwner] = useState('all')
  const [teamId, setTeamId] = useState('all')
  const [priority, setPriority] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<WorkTask | null>(null)
  const [saving, setSaving] = useState(false)

  const workspaceId = currentWorkspace?.id ?? ''
  const canTaskCreate = canTeamAccess('create','tasks')
  const canTaskEdit = canTeamAccess('edit','tasks')
  const canTaskDelete = canTeamAccess('delete','tasks')
  const reload = async () => {
    if (!workspaceId) return
    try { const next = await loadWorkManagement(repositoryMode, workspaceId); const visibleTasks = next.tasks.filter((task) => canTeamAccess('view','tasks') && canTeamAccessRecord('tasks',task.assigneeId,task.teamId)); const taskIds = new Set(visibleTasks.map((task)=>task.id)); setData({ ...next, tasks:visibleTasks, relations:next.relations.filter((item)=>taskIds.has(item.taskId)), checklistItems:next.checklistItems.filter((item)=>taskIds.has(item.taskId)), comments:next.comments.filter((item)=>taskIds.has(item.taskId)) }) }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível carregar as tarefas.') }
  }

  useEffect(() => { void reload() }, [repositoryMode, workspaceId, canTeamAccess, canTeamAccessRecord])
  useEffect(() => {
    let active = true
    void listWorkspaceMembers().then((items) => { if (active) setMembers(items) }).catch(() => { if (active) setMembers([]) })
    return () => { active = false }
  }, [listWorkspaceMembers, workspaceId])

  const relationByTask = useMemo(() => new Map(data.relations.map((item) => [item.taskId, item])), [data.relations])
  const teamById = useMemo(() => new Map(data.teams.map((item) => [item.id, item])), [data.teams])
  const today = todayKey()
  const nowMs = Date.now()
  const openTasks = data.tasks.filter((task) => OPEN_STATUSES.includes(task.status))
  const metrics = {
    open: openTasks.length,
    today: openTasks.filter((task) => dueKey(task.dueAt) === today).length,
    overdue: openTasks.filter((task) => task.dueAt && new Date(task.dueAt).getTime() < nowMs).length,
    blocked: openTasks.filter((task) => task.status === 'blocked').length,
  }

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return data.tasks.filter((task) => {
      if (normalized && !`${task.title} ${task.description} ${task.assigneeName} ${task.tags.join(' ')} ${relationByTask.get(task.id)?.entityLabel ?? ''}`.toLowerCase().includes(normalized)) return false
      if (owner === 'mine' && task.assigneeId !== user?.id) return false
      if (owner !== 'all' && owner !== 'mine' && task.assigneeId !== owner) return false
      if (teamId !== 'all' && task.teamId !== teamId) return false
      if (priority !== 'all' && task.priority !== priority) return false
      if (view === 'today' && dueKey(task.dueAt) !== today) return false
      if (view === 'overdue' && !(OPEN_STATUSES.includes(task.status) && task.dueAt && new Date(task.dueAt).getTime() < nowMs)) return false
      if (view === 'completed' && task.status !== 'completed') return false
      if ((view === 'list' || view === 'board') && task.status === 'cancelled') return false
      return true
    }).sort((a, b) => {
      const rank = { urgent: 0, high: 1, normal: 2, low: 3 }
      return rank[a.priority] - rank[b.priority] || (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999')
    })
  }, [data.tasks, nowMs, owner, priority, query, relationByTask, teamId, today, user?.id, view])

  const save = async (input: Parameters<typeof saveTask>[2]) => {
    if (!workspaceId) return
    setSaving(true)
    try {
      await saveTask(repositoryMode, workspaceId, input, user?.id ?? null, teamAccess)
      await reload(); setModalOpen(false); setEditing(null); notify('success', input.id ? 'Tarefa atualizada.' : 'Tarefa criada.')
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível salvar a tarefa.') }
    finally { setSaving(false) }
  }

  const changeStatus = async (task: WorkTask, status: TaskStatus) => {
    if (!workspaceId) return
    try { await updateTaskStatus(repositoryMode, workspaceId, task.id, status, teamAccess); await reload(); notify('success', status === 'completed' ? 'Tarefa concluída.' : 'Status atualizado.') }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Falha ao atualizar a tarefa.') }
  }

  const remove = async (task: WorkTask) => {
    if (!workspaceId || !await confirmAction({ title: 'Excluir tarefa?', description: `A tarefa “${task.title}” será removida.`, confirmLabel: 'Excluir', tone: 'danger' })) return
    try { await deleteTask(repositoryMode, workspaceId, task.id, teamAccess); await reload(); notify('success', 'Tarefa excluída.') }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Falha ao excluir a tarefa.') }
  }

  const openEdit = (task: WorkTask) => { setEditing(task); setModalOpen(true) }
  const relationForEditing = editing ? relationByTask.get(editing.id) ?? null : null
  const checklistForEditing = editing ? data.checklistItems.filter((item) => item.taskId === editing.id) : []

  return <div className="workspace-page tasks-page-v101112">
    <WorkspacePageHeader className="tasks-page-header-h223h1" eyebrow="Execução comercial" icon={ListChecks} title="Tarefas" description="Centralize o que precisa ser feito, por quem e em qual contexto do CRM." actions={canTaskCreate ? <Button onClick={() => { setEditing(null); setModalOpen(true) }}><Plus size={17}/> Nova tarefa</Button> : null} />

    <WorkspaceSummaryStrip className="tasks-summary-strip-h223h1">
      <WorkspaceSummaryMetric icon={CircleDot} label="Abertas" value={metrics.open} meta="Em execução" tone="brand" onClick={() => setView('list')} />
      <WorkspaceSummaryMetric icon={CalendarDays} label="Para hoje" value={metrics.today} meta="Prazo no dia" onClick={() => setView('today')} />
      <WorkspaceSummaryMetric icon={Clock3} label="Atrasadas" value={metrics.overdue} meta="Precisam de atenção" tone={metrics.overdue ? 'danger' : 'neutral'} onClick={() => setView('overdue')} />
      <WorkspaceSummaryMetric icon={AlertTriangle} label="Bloqueadas" value={metrics.blocked} meta="Dependência ou impedimento" tone={metrics.blocked ? 'warning' : 'neutral'} />
    </WorkspaceSummaryStrip>

    <WorkspaceViewStrip className="tasks-view-strip-h223h1" value={view} onChange={setView} ariaLabel="Visualização das tarefas" items={[
      { id: 'list', label: 'Lista', icon: ListChecks }, { id: 'board', label: 'Quadro', icon: Kanban }, { id: 'today', label: 'Hoje', icon: CalendarDays, badge: metrics.today || undefined },
      { id: 'overdue', label: 'Atrasadas', icon: Clock3, badge: metrics.overdue || undefined }, { id: 'completed', label: 'Concluídas', icon: CheckCircle2 },
    ] as const} />

    <WorkspaceCommandBar className="work-toolbar work-toolbar--h20">
      <WorkspaceCommandGroup className="work-filters"><label className="work-search"><Search size={16}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Buscar tarefas..."/></label>
        <NativeSelectionSelect value={owner} onChange={(event)=>setOwner(event.target.value)}><option value="all">Todos responsáveis</option><option value="mine">Minhas tarefas</option>{members.map((member)=><option key={member.userId} value={member.userId}>{member.displayName}</option>)}</NativeSelectionSelect>
        <NativeSelectionSelect value={teamId} onChange={(event)=>setTeamId(event.target.value)}><option value="all">Todas as equipes</option>{data.teams.map((team)=><option key={team.id} value={team.id}>{team.name}</option>)}</NativeSelectionSelect>
        <NativeSelectionSelect value={priority} onChange={(event)=>setPriority(event.target.value)}><option value="all">Todas prioridades</option><option value="urgent">Urgente</option><option value="high">Alta</option><option value="normal">Normal</option><option value="low">Baixa</option></NativeSelectionSelect>
      </WorkspaceCommandGroup>
    </WorkspaceCommandBar>

    {view === 'board' ? <TaskBoard tasks={filtered} teamById={teamById} relationByTask={relationByTask} checklistItems={data.checklistItems} readOnly={!canTaskEdit} onEdit={openEdit} onStatus={changeStatus} /> : filtered.length ? <section className="work-task-list">{filtered.map((task) => <TaskRow key={task.id} task={task} team={task.teamId ? teamById.get(task.teamId) ?? null : null} relation={relationByTask.get(task.id) ?? null} checklist={data.checklistItems.filter((item)=>item.taskId===task.id)} readOnly={!canTaskEdit} onEdit={()=>openEdit(task)} onStatus={(status)=>void changeStatus(task,status)} onDelete={()=>{ if(canTaskDelete) void remove(task); else notify('info','Seu perfil não permite excluir tarefas.') }} />)}</section> : <EmptyState icon={ListChecks} title="Nenhuma tarefa neste filtro" description="Crie uma tarefa ou ajuste os filtros para acompanhar a execução da equipe." />}

    <TaskModal open={canTaskCreate || canTaskEdit ? modalOpen : false} task={editing} relation={relationForEditing} checklist={checklistForEditing} teams={data.teams} memberships={data.memberships} members={members} snapshot={snapshot} loading={saving} onClose={()=>{setModalOpen(false);setEditing(null)}} onSubmit={save}/>
  </div>
}

function TaskRow({ task, team, relation, checklist, readOnly, onEdit, onStatus, onDelete }: { task: WorkTask; team: Team | null; relation: TaskRelation | null; checklist: WorkManagementSnapshot['checklistItems']; readOnly: boolean; onEdit(): void; onStatus(status: TaskStatus): void; onDelete(): void }) {
  const done = checklist.filter((item)=>item.completed).length
  const overdue = OPEN_STATUSES.includes(task.status) && task.dueAt && new Date(task.dueAt).getTime() < Date.now()
  return <article className={`work-task-row ${overdue?'is-overdue':''}`}>
    <button type="button" className={`work-task-check ${task.status==='completed'?'is-done':''}`} disabled={readOnly} onClick={()=>onStatus(task.status==='completed'?'todo':'completed')} aria-label={task.status==='completed'?'Reabrir tarefa':'Concluir tarefa'}><CheckCircle2 size={20}/></button>
    <div className="work-task-main" onDoubleClick={readOnly?undefined:onEdit}><div className="work-task-title"><strong>{task.title}</strong><StatusPill tone={priorityTone(task.priority)}>{taskPriorityLabel[task.priority]}</StatusPill><StatusPill tone={statusTone(task.status)}>{taskStatusLabel[task.status]}</StatusPill></div><p>{task.description || 'Sem descrição.'}</p><div className="work-task-meta">{task.assigneeName?<span><UserRound size={14}/>{task.assigneeName}</span>:<span>Sem responsável</span>}{team?<span><UsersRound size={14}/>{team.name}</span>:null}<span className={overdue?'is-danger':''}><CalendarDays size={14}/>{dueLabel(task.dueAt)}</span>{relation?<span>↗ {relation.entityLabel}</span>:null}{checklist.length?<span>☑ {done}/{checklist.length}</span>:null}</div></div>
    {!readOnly ? <div className="work-task-actions"><NativeSelectionSelect value={task.status} onChange={(event)=>onStatus(event.target.value as TaskStatus)}><option value="todo">A fazer</option><option value="in_progress">Em andamento</option><option value="blocked">Bloqueada</option><option value="completed">Concluída</option><option value="cancelled">Cancelada</option></NativeSelectionSelect><button type="button" onClick={onEdit} aria-label="Editar"><Pencil size={16}/></button><button type="button" className="is-danger" onClick={onDelete} aria-label="Excluir"><Trash2 size={16}/></button></div>:null}
  </article>
}

function TaskBoard({ tasks, teamById, relationByTask, checklistItems, readOnly, onEdit, onStatus }: { tasks: WorkTask[]; teamById: Map<string,Team>; relationByTask: Map<string,TaskRelation>; checklistItems: WorkManagementSnapshot['checklistItems']; readOnly: boolean; onEdit(task: WorkTask): void; onStatus(task: WorkTask,status:TaskStatus):void }) {
  const columns: Array<{status:TaskStatus;label:string}> = [{status:'todo',label:'A fazer'},{status:'in_progress',label:'Em andamento'},{status:'blocked',label:'Bloqueadas'},{status:'completed',label:'Concluídas'}]
  return <section className="work-task-board">{columns.map((column)=><div className="work-board-column" key={column.status}><header><strong>{column.label}</strong><span>{tasks.filter((task)=>task.status===column.status).length}</span></header><div>{tasks.filter((task)=>task.status===column.status).map((task)=><article key={task.id} onDoubleClick={readOnly?undefined:()=>onEdit(task)}><div><StatusPill tone={priorityTone(task.priority)}>{taskPriorityLabel[task.priority]}</StatusPill><small>{dueLabel(task.dueAt)}</small></div><h3>{task.title}</h3><p>{task.description || 'Sem descrição.'}</p><footer><span>{task.assigneeName || 'Sem responsável'}</span>{task.teamId?<span>{teamById.get(task.teamId)?.name}</span>:null}{relationByTask.get(task.id)?<span>↗ {relationByTask.get(task.id)?.entityLabel}</span>:null}{checklistItems.some((item)=>item.taskId===task.id)?<span>☑ {checklistItems.filter((item)=>item.taskId===task.id&&item.completed).length}/{checklistItems.filter((item)=>item.taskId===task.id).length}</span>:null}</footer>{!readOnly?<NativeSelectionSelect value={task.status} onChange={(event)=>onStatus(task,event.target.value as TaskStatus)}><option value="todo">A fazer</option><option value="in_progress">Em andamento</option><option value="blocked">Bloqueada</option><option value="completed">Concluída</option><option value="cancelled">Cancelada</option></NativeSelectionSelect>:null}</article>)}</div></div>)}</section>
}
