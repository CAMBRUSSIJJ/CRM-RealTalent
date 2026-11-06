import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { AlertTriangle, Bell, CalendarDays, CheckCircle2, Clock3, Filter, Kanban, ListChecks, Pencil, Plus, Search, Trash2, UserRound, UsersRound, X } from 'lucide-react'
import { useAppActions, useAppUi, useAppWorkspace } from '../../app/app-context'
import { useAuth } from '../auth/auth-context'
import { Button } from '../../components/ui/button'
import { StatusPill } from '../../components/ui/status-pill'
import { NativeSelectionSelect } from '../../components/selection'
import type { TaskRelation, TaskStatus, Team, WorkTask, WorkspaceMember } from '../../domain/types'
import { deleteTask, loadWorkManagement, saveTask, taskPriorityLabel, taskStatusLabel, updateTaskStatus, type WorkManagementSnapshot } from '../../services/work-management'
import { TaskModal } from './task-modal'
import { consumeWahaTaskHandoff, type WahaTaskHandoff } from '../../services/waha-task-handoff'
import { CommunicationAutomationCenter } from '../communications-automations/communication-automation-center'
import { TaskCommunicationState } from '../communications-automations/task-communication-state'
import { Modal } from '../../components/ui/modal'
import { loadGatewayLocalTaskAutoHistory, type LocalTaskAutoDiagnostic } from '../../services/local-communications-gateway'
import { flushTaskNotificationIntents, reconcileTaskNotificationWorkspace } from '../../services/notifications/notification-orchestrator'
import './tasks-page-v4.css'

type ViewMode = 'list' | 'board' | 'today' | 'overdue' | 'blocked' | 'completed' | 'in_progress'
type TaskLayout = 'list' | 'board'
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
  const [view, setView] = useState<ViewMode>('board')
  const [layout, setLayout] = useState<TaskLayout>('board')
  const [query, setQuery] = useState('')
  const [owner, setOwner] = useState('all')
  const [teamId, setTeamId] = useState('all')
  const [priority, setPriority] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<WorkTask | null>(null)
  const [taskHandoff,setTaskHandoff]=useState<WahaTaskHandoff|null>(null)
  const [saving, setSaving] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [notificationDiagnostics, setNotificationDiagnostics] = useState<Record<string,LocalTaskAutoDiagnostic>>({})
  const [notificationsReachable, setNotificationsReachable] = useState(false)

  const workspaceId = currentWorkspace?.id ?? ''
  const canTaskCreate = canTeamAccess('create','tasks')
  const canTaskEdit = canTeamAccess('edit','tasks')
  const canTaskDelete = canTeamAccess('delete','tasks')
  useEffect(()=>{
    if(!canTaskCreate||!workspaceId)return
    const handoff=consumeWahaTaskHandoff()
    if(handoff){setTaskHandoff(handoff);setEditing(null);setModalOpen(true)}
  },[canTaskCreate,workspaceId])
  const reload = async () => {
    if (!workspaceId) return
    try { const next = await loadWorkManagement(repositoryMode, workspaceId); const visibleTasks = next.tasks.filter((task) => canTeamAccess('view','tasks') && canTeamAccessRecord('tasks',task.assigneeId,task.teamId)); const taskIds = new Set(visibleTasks.map((task)=>task.id)); setData({ ...next, tasks:visibleTasks, relations:next.relations.filter((item)=>taskIds.has(item.taskId)), checklistItems:next.checklistItems.filter((item)=>taskIds.has(item.taskId)), comments:next.comments.filter((item)=>taskIds.has(item.taskId)) }) }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível carregar as tarefas.') }
  }

  useEffect(() => { void reload() }, [repositoryMode, workspaceId, canTeamAccess, canTeamAccessRecord])
  useEffect(() => {
    let active = true
    void listWorkspaceMembers().then(async items => {
      if (!active) return
      setMembers(items)
      if (repositoryMode !== 'local' || !workspaceId) return
      // On startup reconcile consent/revocations BEFORE resuming persisted jobs.
      try {
        const currentTasks=(await loadWorkManagement('local',workspaceId)).tasks
        await reconcileTaskNotificationWorkspace(workspaceId,items,currentTasks)
      } catch { /* Gateway may not be running; manual task edits report scheduling failures. */ }
    }).catch(() => { if (active) setMembers([]) })
    return () => { active = false }
  }, [listWorkspaceMembers, workspaceId, repositoryMode])

  useEffect(() => {
    if(repositoryMode!=='local'||!workspaceId||!members.length)return
    let busy=false
    const timer=window.setInterval(()=>{
      if(busy)return
      busy=true
      void flushTaskNotificationIntents(workspaceId,members)
        .catch(()=>{ /* persisted intents stay pending until reconnect */ })
        .finally(()=>{busy=false})
    },20_000)
    return ()=>window.clearInterval(timer)
  },[repositoryMode,workspaceId,members])


  useEffect(() => {
    if(repositoryMode !== 'local' || !workspaceId) {
      setNotificationDiagnostics({}); setNotificationsReachable(false)
      return
    }
    let active=true
    const refresh=()=>{
      void loadGatewayLocalTaskAutoHistory(workspaceId).then(data=>{
        if(!active)return
        setNotificationsReachable(true)
        setNotificationDiagnostics(Object.fromEntries((data.diagnostics||[]).map(d=>[d.taskId,d])))
      }).catch(()=>{
        if(active){setNotificationsReachable(false);setNotificationDiagnostics({})}
      })
    }
    refresh()
    const interval=window.setInterval(refresh,15_000)
    return ()=>{active=false;window.clearInterval(interval)}
  },[repositoryMode,workspaceId,showNotifications,data.tasks.length])

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
    inProgress: openTasks.filter(task => task.status === 'in_progress').length,
    completed: data.tasks.filter(task => task.status === 'completed').length,
    all: data.tasks.filter(task => task.status !== 'cancelled').length,
  }

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return data.tasks.filter((task) => {
      if (normalized && !`${task.title} ${task.description} ${task.assigneeName} ${task.tags.join(' ')} ${relationByTask.get(task.id)?.entityLabel ?? ''}`.toLowerCase().includes(normalized)) return false
      if (owner === 'mine' && task.assigneeId !== user?.id) return false
      if (owner !== 'all' && owner !== 'mine' && task.assigneeId !== owner) return false
      if (teamId !== 'all' && task.teamId !== teamId) return false
      if (priority !== 'all' && task.priority !== priority) return false
      if (view === 'today' && !(OPEN_STATUSES.includes(task.status) && dueKey(task.dueAt) === today)) return false
      if (view === 'overdue' && !(OPEN_STATUSES.includes(task.status) && task.dueAt && new Date(task.dueAt).getTime() < nowMs)) return false
      if (view === 'completed' && task.status !== 'completed') return false
      if (view === 'in_progress' && task.status !== 'in_progress') return false
      if (view === 'blocked' && task.status !== 'blocked') return false
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
      const previousAssignee=editing?.assigneeId||null
      const assignmentChanged=Boolean(input.assigneeId && previousAssignee!==input.assigneeId)
      const task=await saveTask(repositoryMode,workspaceId,input,user?.id??null,teamAccess)
      let outbox=null
      if(repositoryMode==='local') {
        try {outbox=await flushTaskNotificationIntents(workspaceId,members)}
        catch(error) {
          // The task was committed. A communication failure must not turn
          // its save into a false failure or demand a duplicate creation.
          outbox={pending:1,processed:0,scheduledTaskIds:[],expiredTaskIds:[],
            inFlightCancellations:[],error:error instanceof Error?error.message:'Gateway indisponível'}
        }
      }
      await reload();setModalOpen(false);setEditing(null);setTaskHandoff(null)
      if(outbox?.pending)notify('warning',
        'Tarefa salva. Notificações aguardando sincronização; nenhum envio foi confirmado. '+
        'A reconciliação será tentada novamente quando o gateway voltar.')
      else if(outbox?.inFlightCancellations.length) notify('warning',
        'Tarefa salva. Um aviso anterior já estava sendo processado e pode chegar ao responsável.')
      else if(outbox?.expiredTaskIds.includes(task.id)) notify('warning',
        'Tarefa salva, mas a notificação de atribuição expirou antes da reconexão. Não haverá envio atrasado.')
      else if(assignmentChanged && outbox?.scheduledTaskIds.includes(task.id))
        notify('success','Tarefa atribuída. Aviso automático de WhatsApp programado no gateway.')
      else notify('success',input.id?'Tarefa atualizada.':'Tarefa criada.')
    } catch(error) {
      notify('error',error instanceof Error?error.message:'Não foi possível salvar a tarefa.')
    } finally {setSaving(false)}
  }

  const changeStatus = async (task: WorkTask, status: TaskStatus) => {
    if (!workspaceId) return
    try {
      // Task state and cancel intent are committed together; WhatsApp
      // downtime never blocks completion or reclassification.
      await updateTaskStatus(repositoryMode,workspaceId,task.id,status,teamAccess)
      let pending=0
      let inFlight=false
      if(repositoryMode==='local') {
        try {
          const outcome=await flushTaskNotificationIntents(workspaceId,members)
          pending=outcome.pending
          inFlight=outcome.inFlightCancellations.includes(task.id)
        } catch {pending=1}
      }
      await reload()
      notify('success',status==='completed'?'Tarefa concluída.':'Status atualizado.')
      if(pending)notify('warning',
        'Atualização registrada. O cancelamento de notificações ainda aguarda sincronização com o gateway.')
      else if(inFlight)notify('warning',
        'A tarefa foi atualizada, mas o aviso já estava em processamento e pode ser entregue.')
    }catch(error){notify('error',error instanceof Error?error.message:'Falha ao atualizar a tarefa.')}
  }

  const remove = async (task: WorkTask) => {
    if (!workspaceId || !await confirmAction({title:'Excluir tarefa?',
      description:`A tarefa “${task.title}” será removida.`,confirmLabel:'Excluir',tone:'danger'}))return
    try {
      await deleteTask(repositoryMode,workspaceId,task.id,teamAccess)
      let pending=0
      let inFlight=false
      if(repositoryMode==='local') {
        try {
          const outcome=await flushTaskNotificationIntents(workspaceId,members)
          pending=outcome.pending
          inFlight=outcome.inFlightCancellations.includes(task.id)
        } catch {pending=1}
      }
      await reload()
      notify('success','Tarefa excluída.')
      if(pending)notify('warning',
        'Exclusão registrada. A solicitação de cancelamento do aviso ficou pendente de sincronização.')
      else if(inFlight)notify('warning',
        'A tarefa foi excluída, mas uma mensagem já iniciada pode chegar ao destinatário.')
    }catch(error){notify('error',error instanceof Error?error.message:'Falha ao excluir a tarefa.')}
  }

  const openEdit = (task: WorkTask) => { setTaskHandoff(null);setEditing(task); setModalOpen(true) }
  const relationForEditing = editing ? relationByTask.get(editing.id) ?? null : null
  const checklistForEditing = editing ? data.checklistItems.filter((item) => item.taskId === editing.id) : []

  const showTaskCreate = () => { setTaskHandoff(null);setEditing(null); setModalOpen(true) }
  const switchLayout = (next: TaskLayout) => { setLayout(next); setView(next) }
  const toggleTaskFilter = (filter: ViewMode) => setView((current) => current === filter ? layout : filter)
  const filterActive = view !== 'board' && view !== 'list'
  const totalFiltered = filtered.length
  const taskViewLabel = view === 'today' ? 'para hoje' : view === 'overdue' ? 'atrasadas' : view === 'blocked' ? 'bloqueadas' : view === 'completed' ? 'concluídas' : view === 'in_progress' ? 'em andamento' : ''

  return <div className="workspace-page tasks-page-v4">
    <div className="tasks-page-v4__header">
      <div className="tasks-page-v4__heading">
        <ListChecks size={18} aria-hidden="true" />
        <div><h1>Tarefas</h1><span>Organize, acompanhe e distribua o trabalho.</span></div>
      </div>
      <div className="tasks-page-v4__top-actions">
        {repositoryMode === 'local' && workspaceId ? <button type="button" className="tasks-page-v4__automation" onClick={() => setShowNotifications(true)} title="Comunicação e automações" aria-label="Comunicação e automações"><Bell size={16} /></button> : null}
        {canTaskCreate ? <Button className="tasks-page-v4__new" onClick={showTaskCreate}><Plus size={16}/> Nova tarefa</Button> : null}
      </div>
    </div>

    {repositoryMode === 'local' && workspaceId ? <Modal open={showNotifications} onClose={() => setShowNotifications(false)}
      size="xl" title="Comunicação e automações" subtitle="Acompanhe notificações e entenda por que um aviso não foi programado.">
      <CommunicationAutomationCenter workspaceId={workspaceId} tasks={data.tasks}
        onOpenTask={task => {setShowNotifications(false);setEditing(task);setModalOpen(true)}} />
    </Modal> : null}

    <section className="tasks-page-v4__metrics" aria-label="Indicadores e filtros">
      <button type="button" className={!filterActive?'is-active':''} aria-pressed={!filterActive}
        onClick={()=>setView(layout)}><span>Todas</span><strong>{metrics.all}</strong><small>Visão geral</small></button>
      <button type="button" className={view==='today'?'is-active':''} aria-pressed={view==='today'}
        onClick={()=>toggleTaskFilter('today')}><span>Para hoje</span><strong>{metrics.today}</strong><small>Prazo de hoje</small></button>
      <button type="button" className={view==='overdue'?'is-active is-alert':''} aria-pressed={view==='overdue'}
        onClick={()=>toggleTaskFilter('overdue')}><span>Atrasadas</span><strong>{metrics.overdue}</strong><small>Exigem atenção</small></button>
      <button type="button" className={view==='in_progress'?'is-active':''} aria-pressed={view==='in_progress'}
        onClick={()=>toggleTaskFilter('in_progress')}><span>Em andamento</span><strong>{metrics.inProgress}</strong><small>Em execução</small></button>
      <button type="button" className={view==='completed'?'is-active':''} aria-pressed={view==='completed'}
        onClick={()=>toggleTaskFilter('completed')}><span>Concluídas</span><strong>{metrics.completed}</strong><small>Finalizadas</small></button>
    </section>

    <section className="tasks-page-v4__toolbar" aria-label="Ferramentas de tarefas">
      <div className="tasks-page-v4__layout-switch" role="group" aria-label="Modo de visualização">
        <button type="button" className={layout === 'list' ? 'is-active' : ''} onClick={() => switchLayout('list')} aria-pressed={layout === 'list'} aria-label="Visualizar em lista" title="Lista"><ListChecks size={17}/></button>
        <button type="button" className={layout === 'board' ? 'is-active' : ''} onClick={() => switchLayout('board')} aria-pressed={layout === 'board'} aria-label="Visualizar em quadro" title="Quadro"><Kanban size={17}/></button>
      </div>
      <span className="tasks-page-v4__divider" aria-hidden="true"/>
      <label className="tasks-page-v4__search"><Search size={16}/><input value={query} onChange={(event)=>setQuery(event.target.value)} aria-label="Buscar tarefas" placeholder="Buscar tarefas..." /></label>
      <div className="tasks-page-v4__quick-filters" role="group" aria-label="Atalhos">
        <button type="button" className={owner==='mine'?'is-active':''} aria-pressed={owner==='mine'}
          onClick={()=>setOwner(current=>current==='mine'?'all':'mine')}><UserRound size={14}/> Minhas tarefas</button>
        <button type="button" className={view==='blocked'?'is-active is-blocked':'is-blocked'} aria-pressed={view==='blocked'}
          onClick={()=>toggleTaskFilter('blocked')}><AlertTriangle size={14}/> Bloqueadas <b>{metrics.blocked}</b></button>
      </div>
      <span className="tasks-page-v4__divider" aria-hidden="true"/>
      <details className="tasks-page-v4__filters">
        <summary><Filter size={15}/> Filtros{(owner !== 'all' || teamId !== 'all' || priority !== 'all' || view === 'completed') ? <span className="tasks-page-v4__filter-indicator"/> : null}</summary>
        <div className="tasks-page-v4__filter-panel">
          <div className="tasks-page-v4__filter-title">Filtrar tarefas</div>
          <label><span>Responsável</span><NativeSelectionSelect value={owner} onChange={(event)=>setOwner(event.target.value)}><option value="all">Todos os responsáveis</option><option value="mine">Minhas tarefas</option>{members.map((member)=><option key={member.userId} value={member.userId}>{member.displayName}</option>)}</NativeSelectionSelect></label>
          <label><span>Equipe</span><NativeSelectionSelect value={teamId} onChange={(event)=>setTeamId(event.target.value)}><option value="all">Todas as equipes</option>{data.teams.map((team)=><option key={team.id} value={team.id}>{team.name}</option>)}</NativeSelectionSelect></label>
          <label><span>Prioridade</span><NativeSelectionSelect value={priority} onChange={(event)=>setPriority(event.target.value)}><option value="all">Todas as prioridades</option><option value="urgent">Urgente</option><option value="high">Alta</option><option value="normal">Normal</option><option value="low">Baixa</option></NativeSelectionSelect></label>
          <button type="button" className={view === 'completed' ? 'tasks-page-v4__completed is-active' : 'tasks-page-v4__completed'} aria-pressed={view === 'completed'} onClick={()=>toggleTaskFilter('completed')}><CheckCircle2 size={15}/> {view === 'completed' ? 'Exibindo concluídas' : 'Mostrar concluídas'}</button>
          <button type="button" className="tasks-page-v4__reset" onClick={()=>{setOwner('all');setTeamId('all');setPriority('all');setView(layout);setQuery('')}}><X size={14}/> Limpar filtros</button>
        </div>
      </details>
    </section>

    {filterActive ? <div className="tasks-page-v4__filter-status"><span>{totalFiltered} tarefa(s) {taskViewLabel}</span><button type="button" onClick={()=>setView(layout)}><X size={13}/> Mostrar todas</button></div> : null}

    {layout === 'board' ? <TaskBoard tasks={filtered} teamById={teamById} relationByTask={relationByTask} checklistItems={data.checklistItems}
      diagnostics={notificationDiagnostics} notificationsReachable={notificationsReachable} repositoryMode={repositoryMode}
      readOnly={!canTaskEdit} canCreate={canTaskCreate} onCreate={showTaskCreate} onEdit={openEdit} onStatus={changeStatus}
      canDelete={canTaskDelete} onDelete={remove} onNotifications={()=>setShowNotifications(true)}
      onQuickCreate={(title,status)=>save({title,status,priority:'normal',reminderEnabled:true,reminderOnAssignment:true,reminderChannels:['in_app']})} />
      : <section className="tasks-page-v4__list" aria-label="Lista de tarefas">{filtered.length
        ? filtered.map((task) => <TaskRow key={task.id} task={task} diagnostic={notificationDiagnostics[task.id]??null}
          notificationsReachable={notificationsReachable} repositoryMode={repositoryMode} team={task.teamId ? teamById.get(task.teamId) ?? null : null}
          relation={relationByTask.get(task.id) ?? null} checklist={data.checklistItems.filter((item)=>item.taskId===task.id)} readOnly={!canTaskEdit}
          onEdit={()=>openEdit(task)} onStatus={(status)=>void changeStatus(task,status)}
          onDelete={()=>{ if(canTaskDelete) void remove(task); else notify('info','Seu perfil não permite excluir tarefas.') }} />)
        : <div className="tasks-page-v4__empty-list"><ListChecks size={25}/><strong>Nenhuma tarefa encontrada</strong><span>Altere os filtros ou crie uma tarefa.</span>{canTaskCreate ? <button type="button" onClick={showTaskCreate}><Plus size={14}/> Criar tarefa</button> : null}</div>}
      </section>}

    <TaskModal open={canTaskCreate || canTaskEdit ? modalOpen : false} task={editing} initialDraft={taskHandoff} relation={relationForEditing} checklist={checklistForEditing} teams={data.teams} memberships={data.memberships} members={members} snapshot={snapshot} workspaceId={workspaceId} repositoryMode={repositoryMode} loading={saving} onClose={()=>{setModalOpen(false);setEditing(null);setTaskHandoff(null)}} onSubmit={save}/>
  </div>
}

function TaskRow({ task, team, relation, checklist, diagnostic, notificationsReachable, repositoryMode, readOnly, onEdit, onStatus, onDelete }: {
  task: WorkTask; team: Team | null; relation: TaskRelation | null
  checklist: WorkManagementSnapshot['checklistItems']; diagnostic:LocalTaskAutoDiagnostic|null
  notificationsReachable:boolean; repositoryMode:'local'|'supabase'
  readOnly: boolean; onEdit(): void; onStatus(status: TaskStatus): void; onDelete(): void
}) {
  const done = checklist.filter((item)=>item.completed).length
  const overdue = OPEN_STATUSES.includes(task.status) && task.dueAt && new Date(task.dueAt).getTime() < Date.now()
  return <article className={`tasks-page-v4__row ${overdue?'is-overdue':''}`}>
    <button type="button" className={`tasks-page-v4__row-check ${task.status==='completed'?'is-done':''}`} disabled={readOnly} onClick={()=>onStatus(task.status==='completed'?'todo':'completed')} aria-label={task.status==='completed'?'Reabrir tarefa':'Concluir tarefa'}><CheckCircle2 size={20}/></button>
    <div className="tasks-page-v4__row-main" onDoubleClick={readOnly?undefined:onEdit}><div className="tasks-page-v4__row-title"><strong>{task.title}</strong><StatusPill tone={priorityTone(task.priority)}>{taskPriorityLabel[task.priority]}</StatusPill><StatusPill tone={statusTone(task.status)}>{taskStatusLabel[task.status]}</StatusPill></div><p>{task.description || 'Sem descrição.'}</p><div className="tasks-page-v4__row-meta">{task.assigneeName?<span><UserRound size={14}/>{task.assigneeName}</span>:<span>Sem responsável</span>}{team?<span><UsersRound size={14}/>{team.name}</span>:null}<span className={overdue?'is-danger':''}><CalendarDays size={14}/>{dueLabel(task.dueAt)}</span>{relation?<span>↗ {relation.entityLabel}</span>:null}{repositoryMode === 'local'
  ? <TaskCommunicationState configured={Boolean(task.assigneeId)} available={notificationsReachable} status={diagnostic}/>
  : task.reminderEnabled!==false && task.assigneeId && (task.reminderChannels??[]).length
    ? <span title="Regra de lembrete configurada; entrega não confirmada"><Bell size={14}/> Regra configurada</span>:null}{checklist.length?<span>☑ {done}/{checklist.length}</span>:null}</div></div>
    {!readOnly ? <div className="tasks-page-v4__row-actions"><NativeSelectionSelect value={task.status} onChange={(event)=>onStatus(event.target.value as TaskStatus)}><option value="todo">A fazer</option><option value="in_progress">Em andamento</option><option value="blocked">Bloqueada</option><option value="completed">Concluída</option><option value="cancelled">Cancelada</option></NativeSelectionSelect><button type="button" onClick={onEdit} aria-label="Editar"><Pencil size={16}/></button><button type="button" className="is-danger" onClick={onDelete} aria-label="Excluir"><Trash2 size={16}/></button></div>:null}
  </article>
}

function TaskBoard({ tasks, teamById, relationByTask, checklistItems, diagnostics, notificationsReachable, repositoryMode, readOnly, canCreate, onCreate, onEdit, onStatus }: {
  tasks: WorkTask[]
  teamById: Map<string, Team>
  relationByTask: Map<string, TaskRelation>
  checklistItems: WorkManagementSnapshot['checklistItems']
  diagnostics: Record<string, LocalTaskAutoDiagnostic>
  notificationsReachable: boolean
  repositoryMode: 'local' | 'supabase'
  readOnly: boolean
  canCreate: boolean
  onCreate(): void
  onEdit(task: WorkTask): void
  onStatus(task: WorkTask, status: TaskStatus): void
}) {
  const columns: Array<{status:TaskStatus; label:string}> = [
    {status:'todo',label:'A fazer'},
    {status:'in_progress',label:'Em andamento'},
    {status:'blocked',label:'Bloqueadas'},
    {status:'completed',label:'Concluídas'},
  ]
  const [dropTarget, setDropTarget] = useState<TaskStatus | null>(null)
  const moveTask = (event: DragEvent<HTMLElement>, target: TaskStatus) => {
    event.preventDefault()
    setDropTarget(null)
    if (readOnly) return
    const id = event.dataTransfer.getData('application/x-realtalent-task-id')
    const task = tasks.find((item) => item.id === id)
    if (task && task.status !== target) onStatus(task, target)
  }
  return <section className="tasks-page-v4__board" aria-label="Quadro de tarefas">
    {columns.map((column) => {
      const entries = tasks.filter((task)=>task.status===column.status)
      return <section key={column.status} className={`tasks-page-v4__column is-${column.status} ${dropTarget===column.status ? 'is-drag-over' : ''}`}
        onDragOver={(event)=>{ if(!readOnly){event.preventDefault(); event.dataTransfer.dropEffect='move';setDropTarget(column.status)} }}
        onDragLeave={(event)=>{ if(!event.currentTarget.contains(event.relatedTarget as Node|null))setDropTarget(null) }}
        onDrop={(event)=>moveTask(event,column.status)}>
        <header className="tasks-page-v4__column-heading">
          <strong>{column.label}</strong>
          <span>{entries.length}</span>
        </header>
        <div className="tasks-page-v4__column-body">
          {entries.length ? entries.map((task)=>{
            const isOverdue=Boolean(task.dueAt && OPEN_STATUSES.includes(task.status) && new Date(task.dueAt).getTime()<Date.now())
            const taskChecklist=checklistItems.filter((item)=>item.taskId===task.id)
            const done=taskChecklist.filter((item)=>item.completed).length
            return <article key={task.id} className={`tasks-page-v4__card ${isOverdue?'is-overdue':''}`} draggable={!readOnly}
              onDragStart={(event)=>{if(readOnly)return;event.dataTransfer.setData('application/x-realtalent-task-id',task.id);event.dataTransfer.effectAllowed='move'}}
              onDragEnd={()=>setDropTarget(null)}>
              <div className="tasks-page-v4__card-head">
                <StatusPill tone={priorityTone(task.priority)}>{taskPriorityLabel[task.priority]}</StatusPill>
                <span className={isOverdue ? 'is-overdue' : ''}><Clock3 size={12}/>{dueLabel(task.dueAt)}</span>
              </div>
              <button className="tasks-page-v4__card-title" type="button" onClick={()=>onEdit(task)} disabled={readOnly}>{task.title}</button>
              {task.description ? <p>{task.description}</p> : null}
              <div className="tasks-page-v4__card-meta">
                <span><UserRound size={13}/>{task.assigneeName || 'Sem responsável'}</span>
                {task.teamId ? <span><UsersRound size={13}/>{teamById.get(task.teamId)?.name ?? 'Equipe'}</span> : null}
                {relationByTask.get(task.id) ? <span title="Vínculo com o CRM">↗ {relationByTask.get(task.id)?.entityLabel}</span> : null}
                {taskChecklist.length ? <span><CheckCircle2 size={13}/>{done}/{taskChecklist.length}</span> : null}
                {repositoryMode==='local'
                  ? <TaskCommunicationState configured={Boolean(task.assigneeId)} available={notificationsReachable} status={diagnostics[task.id]??null} />
                  : task.reminderEnabled!==false && task.assigneeId && (task.reminderChannels??[]).length
                    ? <span title="Regra configurada; entrega não confirmada"><Bell size={13}/> Lembrete</span> : null}
              </div>
              {!readOnly ? <div className="tasks-page-v4__card-actions">
                <NativeSelectionSelect value={task.status} aria-label={`Alterar status de ${task.title}`} onChange={(event)=>onStatus(task,event.target.value as TaskStatus)}>
                  <option value="todo">A fazer</option><option value="in_progress">Em andamento</option><option value="blocked">Bloqueada</option><option value="completed">Concluída</option><option value="cancelled">Cancelada</option>
                </NativeSelectionSelect>
                <button type="button" onClick={()=>onEdit(task)} aria-label={`Editar ${task.title}`}><Pencil size={14}/></button>
              </div> : null}
            </article>
          }) : <div className="tasks-page-v4__empty-column">
            <ListChecks size={19}/>
            <span>{column.status==='todo' ? 'Nenhuma tarefa pendente' : 'Nenhuma tarefa nesta etapa'}</span>
            {column.status==='todo' && canCreate ? <button type="button" onClick={onCreate}><Plus size={13}/> Criar tarefa rápida</button> : null}
          </div>}
        </div>
      </section>
    })}
  </section>
}
