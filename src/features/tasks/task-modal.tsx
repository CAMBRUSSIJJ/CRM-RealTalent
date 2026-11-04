import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, CheckSquare2, GripVertical, Link2, Plus, Save, Trash2, UserRound } from 'lucide-react'
import { NativeSelectionSelect } from '../../components/selection'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import type { TaskChecklistItem, TaskRelation, TaskRelationEntity, TaskStatus, TaskPriority, Team, TeamMembership, WorkTask, WorkspaceMember, WorkspaceSnapshot } from '../../domain/types'
import type { TaskInput } from '../../services/work-management'
import { TaskReminderEditor, draftTaskReminders, defaultTaskReminders, type TaskReminderDraft } from './task-reminder-editor'
import { LocalTeamTaskWhatsAppAction } from './local-team-task-whatsapp-action'
import '../../styles/local-team-whatsapp-action.css'
import './task-board-v3.css'

interface Props {
  open: boolean
  task: WorkTask | null
  relation: TaskRelation | null
  checklist: TaskChecklistItem[]
  teams: Team[]
  memberships: TeamMembership[]
  members: WorkspaceMember[]
  snapshot: WorkspaceSnapshot | null
  workspaceId: string
  repositoryMode: 'local' | 'supabase'
  loading?: boolean
  onClose(): void
  onSubmit(input: TaskInput): Promise<void>
}

type ChecklistDraftItem = { id?: string; title: string; completed: boolean }

const toLocalInput = (value: string | null | undefined) => {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}
const toIso = (value: string) => value ? new Date(value).toISOString() : null

export function TaskModal({ open, task, relation, checklist, teams, memberships, members, snapshot, workspaceId, repositoryMode, loading = false, onClose, onSubmit }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<TaskStatus>('todo')
  const [priority, setPriority] = useState<TaskPriority>('normal')
  const [dueAt, setDueAt] = useState('')
  const [reminders, setReminders] = useState<TaskReminderDraft>(defaultTaskReminders)
  const [reminderError, setReminderError] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [relationType, setRelationType] = useState<TaskRelationEntity>('contact')
  const [relationId, setRelationId] = useState('')
  const [tags, setTags] = useState('')
  const [checklistDraft, setChecklistDraft] = useState<ChecklistDraftItem[]>([])
  const [newChecklistTitle, setNewChecklistTitle] = useState('')
  const [hideCompleted, setHideCompleted] = useState(false)
  const dragIndex = useRef<number | null>(null)

  useEffect(() => {
    if (!open) return
    setTitle(task?.title ?? '')
    setDescription(task?.description ?? '')
    setStatus(task?.status ?? 'todo')
    setPriority(task?.priority ?? 'normal')
    setDueAt(toLocalInput(task?.dueAt))
    setReminders(draftTaskReminders(task))
    setReminderError('')
    setAssigneeId(task?.assigneeId ?? '')
    setTeamId(task?.teamId ?? '')
    setRelationType(relation?.entityType ?? 'contact')
    setRelationId(relation?.entityId ?? '')
    setTags((task?.tags ?? []).join(', '))
    setChecklistDraft([...checklist].sort((a, b) => a.position - b.position).map((item) => ({ id: item.id, title: item.title, completed: item.completed })))
    setNewChecklistTitle('')
    setHideCompleted(false)
  }, [checklist, open, relation, task])

  const activeTeams = useMemo(() => teams.filter((team) => team.active), [teams])
  const selectedTeam = useMemo(() => activeTeams.find((team) => team.id === teamId) ?? null, [activeTeams, teamId])
  const selectedMember = useMemo(() => members.find((member) => member.userId === assigneeId) ?? null, [assigneeId, members])
  const selectedTeamMemberIds = useMemo(() => new Set(memberships.filter((item) => item.teamId === teamId).map((item) => item.userId)), [memberships, teamId])
  const availableMembers = useMemo(() => teamId ? members.filter((member) => selectedTeamMemberIds.has(member.userId)) : members, [members, selectedTeamMemberIds, teamId])
  const teamsForAssignee = useMemo(() => assigneeId ? activeTeams.filter((team) => memberships.some((item) => item.teamId === team.id && item.userId === assigneeId)) : [], [activeTeams, assigneeId, memberships])

  const relationOptions = useMemo(() => {
    if (!snapshot) return []
    if (relationType === 'contact') return snapshot.contacts.map((item) => ({ id: item.id, label: `${item.name}${item.jobTitle ? ` · ${item.jobTitle}` : ''}` }))
    if (relationType === 'company') return snapshot.companies.map((item) => ({ id: item.id, label: item.name }))
    if (relationType === 'opportunity') return snapshot.opportunities.map((item) => ({ id: item.id, label: item.title }))
    if (relationType === 'lead') return snapshot.leads.map((item) => ({ id: item.id, label: `${item.name}${item.company ? ` · ${item.company}` : ''}` }))
    if (relationType === 'playbook') return snapshot.playbooks.map((item) => ({ id: item.id, label: item.title }))
    if (relationType === 'meeting') return snapshot.events.map((item) => ({ id: item.id, label: item.title }))
    return snapshot.stages.map((item) => ({ id: item.id, label: item.name }))
  }, [relationType, snapshot])

  useEffect(() => {
    if (!relationId) return
    if (!relationOptions.some((item) => item.id === relationId)) setRelationId('')
  }, [relationId, relationOptions])

  const chooseTeam = (nextTeamId: string) => {
    setTeamId(nextTeamId)
    if (!nextTeamId || !assigneeId) return
    const belongs = memberships.some((membership) => membership.teamId === nextTeamId && membership.userId === assigneeId)
    if (!belongs) setAssigneeId('')
  }

  const chooseAssignee = (nextAssigneeId: string) => {
    setAssigneeId(nextAssigneeId)
    if (!nextAssigneeId) return
    const eligibleTeamIds = memberships.filter((membership) => membership.userId === nextAssigneeId).map((membership) => membership.teamId)
    if (teamId && eligibleTeamIds.includes(teamId)) return
    if (eligibleTeamIds.length === 1) setTeamId(eligibleTeamIds[0])
    else if (teamId && !eligibleTeamIds.includes(teamId)) setTeamId('')
  }

  const addChecklistItem = () => {
    const clean = newChecklistTitle.trim()
    if (!clean) return
    setChecklistDraft((current) => [...current, { title: clean, completed: false }])
    setNewChecklistTitle('')
  }
  const updateChecklistItem = (index: number, patch: Partial<ChecklistDraftItem>) => setChecklistDraft((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  const removeChecklistItem = (index: number) => setChecklistDraft((current) => current.filter((_, itemIndex) => itemIndex !== index))
  const moveChecklistItem = (from: number, to: number) => setChecklistDraft((current) => {
    if (from === to || from < 0 || to < 0 || from >= current.length || to >= current.length) return current
    const next = [...current]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    return next
  })
  const checklistCompleted = checklistDraft.filter((item) => item.completed).length
  const checklistProgress = checklistDraft.length ? Math.round((checklistCompleted / checklistDraft.length) * 100) : 0

  const submit = async () => {
    if (reminders.customMinutes !== null && (!Number.isInteger(reminders.customMinutes) || reminders.customMinutes < 5 || reminders.customMinutes > 10080)) {
      setReminderError('Use uma antecedência personalizada entre 5 e 10.080 minutos.'); return
    }
    setReminderError('')
    const member = members.find((item) => item.userId === assigneeId)
    const relationOption = relationOptions.find((item) => item.id === relationId)
    await onSubmit({
      id: task?.id, title, description, status, priority, dueAt: toIso(dueAt), completedAt: task?.completedAt ?? null, assigneeId: assigneeId || null,
      reminderEnabled: reminders.enabled, reminderOnAssignment: reminders.onAssignment,
      reminderChannels: reminders.channels, reminderOffsetsMinutes: reminders.offsets,
      reminderCustomMinutes: reminders.customMinutes,
      assigneeName: member?.displayName ?? '', teamId: teamId || null, tags: tags.split(',').map((item) => item.trim()).filter(Boolean),
      relation: relationId && relationOption ? { entityType: relationType, entityId: relationId, entityLabel: relationOption.label } : null,
      checklist: checklistDraft.filter((item) => item.title.trim()).map((item) => ({ id: item.id, title: item.title.trim(), completed: item.completed })),
    })
  }

  return <Modal
    open={open}
    size="xl"
    title={task ? 'Editar tarefa' : 'Nova tarefa'}
    onClose={onClose}
    footer={<div className="task-board-v3__footer">
      <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
      <Button type="button" loading={loading} disabled={!title.trim()} onClick={() => void submit()}><Save size={16}/>{task ? 'Salvar alterações' : 'Criar tarefa'}</Button>
    </div>}
  >
    <div className="task-board-v3">
      <label className="task-board-v3__title">
        <span className="task-board-v3__title-label">Título</span>
        <input autoFocus data-autofocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Revisar proposta para o cliente" aria-label="Título da tarefa" maxLength={250} />
      </label>

      <div className="task-board-v3__layout">
        <div className="task-board-v3__primary">
          <section className="task-board-v3__section" aria-labelledby="task-board-v3-plan">
            <header className="task-board-v3__section-head"><strong id="task-board-v3-plan">Planejamento</strong></header>
            <div className="task-board-v3__fields">
              <label className="task-board-v3__field"><span>Responsável</span>
                <NativeSelectionSelect value={assigneeId} onChange={(event) => chooseAssignee(event.target.value)}>
                  <option value="">Sem responsável</option>
                  {availableMembers.length ? availableMembers.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>) : <option disabled value="__no_member__">Nenhuma pessoa disponível</option>}
                </NativeSelectionSelect>
              </label>
              <label className="task-board-v3__field"><span>Equipe</span>
                <NativeSelectionSelect value={teamId} onChange={(event) => chooseTeam(event.target.value)}>
                  <option value="">Sem equipe</option>
                  {activeTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </NativeSelectionSelect>
              </label>
              <label className="task-board-v3__field"><span>Prazo</span><input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label>
              <label className="task-board-v3__field"><span>Status</span>
                <NativeSelectionSelect value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)}>
                  <option value="todo">A fazer</option><option value="in_progress">Em andamento</option><option value="blocked">Bloqueada</option><option value="completed">Concluída</option><option value="cancelled">Cancelada</option>
                </NativeSelectionSelect>
              </label>
              <label className="task-board-v3__field"><span>Prioridade</span>
                <NativeSelectionSelect value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
                  <option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option>
                </NativeSelectionSelect>
              </label>
              <label className="task-board-v3__field"><span>Tags</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="proposta, retorno..." /></label>
            </div>
            {teamId && !availableMembers.length ? <small className="task-board-v3__helper">Esta equipe não possui integrantes. Adicione membros em Equipes para atribuir.</small> : null}
            {selectedMember && !selectedTeam && teamsForAssignee.length ? <small className="task-board-v3__helper">Este responsável participa de {teamsForAssignee.map((team) => team.name).join(', ')}.</small> : null}
          </section>

          <section className="task-board-v3__section" aria-labelledby="task-board-v3-context">
            <header className="task-board-v3__section-head"><strong id="task-board-v3-context">Descrição e vínculo</strong></header>
            <label className="task-board-v3__field task-board-v3__field--wide"><span>Descrição</span>
              <textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descreva o resultado esperado, orientações e links de referência..." />
            </label>
            <div className="task-board-v3__relation">
              <label className="task-board-v3__field"><span><Link2 size={14}/> Relacionar ao CRM</span>
                <NativeSelectionSelect value={relationType} onChange={(event) => { setRelationType(event.target.value as TaskRelationEntity); setRelationId('') }}>
                  <option value="contact">Contato</option><option value="company">Empresa</option><option value="opportunity">Oportunidade</option><option value="lead">Registro comercial</option><option value="pipeline">Etapa do Pipeline</option><option value="playbook">Playbook</option><option value="meeting">Reunião</option>
                </NativeSelectionSelect>
              </label>
              <label className="task-board-v3__field"><span>Registro vinculado</span>
                <NativeSelectionSelect value={relationId} onChange={(event) => setRelationId(event.target.value)}>
                  <option value="">Nenhum vínculo</option>
                  {relationOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </NativeSelectionSelect>
              </label>
            </div>
          </section>

          {repositoryMode === 'local' && selectedMember ? <section className="task-board-v3__automation" aria-label="WhatsApp do responsável">
            {task && task.assigneeId === assigneeId && task.status === status
              ? <LocalTeamTaskWhatsAppAction workspaceId={workspaceId} task={task} member={selectedMember}/>
              : <div className="task-board-v3__automation-note">
                  <UserRound size={15}/><div><strong>WhatsApp de {selectedMember.displayName}</strong>
                    <small>{selectedMember.whatsappAutoEnabledAt && reminders.enabled && reminders.onAssignment
                      ? 'Aviso de atribuição programado ao salvar, se o gateway estiver conectado.'
                      : selectedMember.whatsappAutoEnabledAt
                        ? 'Ative o lembrete de atribuição para avisar automaticamente.'
                        : 'Automação não ativada para este integrante.'}</small>
                  </div>
                </div>}
          </section> : null}
        </div>

        <div className="task-board-v3__secondary">
          <section className="task-board-v3__section task-board-v3__checklist" aria-labelledby="task-board-v3-checklist">
            <header className="task-board-v3__section-head">
              <strong id="task-board-v3-checklist"><CheckSquare2 size={16}/> Checklist</strong>
              <span>{checklistCompleted} de {checklistDraft.length} concluído(s)</span>
            </header>
            {checklistDraft.length ? <div className="task-board-v3__checklist-progress" aria-label={`Progresso do checklist: ${checklistProgress}%`}><div><i style={{ width: `${checklistProgress}%` }}/></div><strong>{checklistProgress}%</strong></div> : null}
            <div className="task-board-v3__checklist-items">
              {checklistDraft.map((item, index) => hideCompleted && item.completed ? null : <div key={item.id ?? `draft-${index}`} className={`task-board-v3__checklist-item ${item.completed ? 'is-completed' : ''}`} draggable
                onDragStart={() => { dragIndex.current = index }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => { if (dragIndex.current !== null) moveChecklistItem(dragIndex.current, index); dragIndex.current = null }}
                onDragEnd={() => { dragIndex.current = null }}>
                <GripVertical size={14} aria-hidden="true" className="task-board-v3__drag"/>
                <button type="button" className={item.completed ? 'is-checked' : ''} aria-label={item.completed ? 'Reabrir item' : 'Concluir item'} onClick={() => updateChecklistItem(index, { completed: !item.completed })}>{item.completed ? <Check size={14}/> : null}</button>
                <input aria-label={`Item ${index + 1} do checklist`} value={item.title} onChange={(event) => updateChecklistItem(index, { title: event.target.value })}/>
                <button type="button" className="task-board-v3__remove" aria-label="Excluir item" onClick={() => removeChecklistItem(index)}><Trash2 size={14}/></button>
              </div>)}
            </div>
            <div className="task-board-v3__checklist-add"><Plus size={16}/>
              <input value={newChecklistTitle} onChange={(event) => setNewChecklistTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addChecklistItem() } }} placeholder="Adicionar item executável..." aria-label="Novo item do checklist"/>
              <Button variant="ghost" type="button" size="sm" disabled={!newChecklistTitle.trim()} onClick={addChecklistItem}>Adicionar</Button>
            </div>
            {checklistDraft.some((item) => item.completed) ? <button type="button" className="task-board-v3__hide-completed" onClick={() => setHideCompleted((current) => !current)}>{hideCompleted ? 'Mostrar concluídos' : 'Ocultar concluídos'}</button> : null}
          </section>

          {reminderError ? <p role="alert" className="task-board-v3__error">{reminderError}</p> : null}
          <div className="task-board-v3__reminders">
            <TaskReminderEditor
              value={reminders}
              onChange={setReminders}
              taskId={task?.id ?? null}
              workspaceId={workspaceId}
              repositoryMode={repositoryMode}
              assigneeId={assigneeId}
              assigneeName={selectedMember?.displayName ?? null}
              dueAt={dueAt}
              status={status}
              open={open}
              compact
            />
          </div>
        </div>
      </div>
    </div>
  </Modal>
}