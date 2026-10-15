import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, Check, CheckSquare2, GripVertical, Link2, Plus, Save, Trash2, UserRound, UsersRound, X } from 'lucide-react'
import { NativeSelectionSelect } from '../../components/selection'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import type { TaskChecklistItem, TaskRelation, TaskRelationEntity, TaskStatus, TaskPriority, Team, TeamMembership, WorkTask, WorkspaceMember, WorkspaceSnapshot } from '../../domain/types'
import type { TaskInput } from '../../services/work-management'

interface Props {
  open: boolean
  task: WorkTask | null
  relation: TaskRelation | null
  checklist: TaskChecklistItem[]
  teams: Team[]
  memberships: TeamMembership[]
  members: WorkspaceMember[]
  snapshot: WorkspaceSnapshot | null
  loading?: boolean
  onClose(): void
  onSubmit(input: TaskInput): Promise<void>
}

type ChecklistDraftItem = { id?: string; title: string; completed: boolean }

const toLocalInput = (value: string | null | undefined) => value ? new Date(value).toISOString().slice(0, 16) : ''
const toIso = (value: string) => value ? new Date(value).toISOString() : null

export function TaskModal({ open, task, relation, checklist, teams, memberships, members, snapshot, loading = false, onClose, onSubmit }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<TaskStatus>('todo')
  const [priority, setPriority] = useState<TaskPriority>('normal')
  const [dueAt, setDueAt] = useState('')
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
    const member = members.find((item) => item.userId === assigneeId)
    const relationOption = relationOptions.find((item) => item.id === relationId)
    await onSubmit({
      id: task?.id, title, description, status, priority, dueAt: toIso(dueAt), completedAt: task?.completedAt ?? null, assigneeId: assigneeId || null,
      assigneeName: member?.displayName ?? '', teamId: teamId || null, tags: tags.split(',').map((item) => item.trim()).filter(Boolean),
      relation: relationId && relationOption ? { entityType: relationType, entityId: relationId, entityLabel: relationOption.label } : null,
      checklist: checklistDraft.filter((item) => item.title.trim()).map((item) => ({ id: item.id, title: item.title.trim(), completed: item.completed })),
    })
  }

  return <Modal open={open} size="lg" title={task ? 'Editar tarefa' : 'Nova tarefa'} subtitle="Organize execução, responsável, equipe, prazo e checklist em um único cartão de trabalho." onClose={onClose}
    footer={<><span className="modal__footer-spacer" /><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={loading} onClick={() => void submit()}><Save size={16}/> Salvar tarefa</Button></>}>
    <div className="work-task-modal work-task-modal--collaborative">
      <section className="work-form-section"><header><CheckSquare2 size={18}/><div><strong>Execução</strong><small>O que precisa ser entregue e com qual prioridade.</small></div></header>
        <div className="form-grid"><label className="form-field form-field--full"><span>Título</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Revisar proposta antes da reunião" /></label>
          <label className="form-field form-field--full"><span>Descrição</span><textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Contexto, resultado esperado e observações..." /></label>
          <label className="form-field"><span>Status</span><NativeSelectionSelect value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)}><option value="todo">A fazer</option><option value="in_progress">Em andamento</option><option value="blocked">Bloqueada</option><option value="completed">Concluída</option><option value="cancelled">Cancelada</option></NativeSelectionSelect></label>
          <label className="form-field"><span>Prioridade</span><NativeSelectionSelect value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></NativeSelectionSelect></label>
        </div>
      </section>

      <section className="work-form-section work-responsibility-section"><header><UsersRound size={18}/><div><strong>Equipe e pessoa</strong><small>A pessoa responsável precisa pertencer à equipe selecionada. A tarefa acompanha as duas dimensões.</small></div></header>
        <div className="work-responsibility-link">
          <label className="form-field"><span>Equipe</span><NativeSelectionSelect value={teamId} onChange={(event) => chooseTeam(event.target.value)}><option value="">Sem equipe</option>{activeTeams.length ? activeTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>) : <option value="__no_team__" disabled>Nenhuma equipe cadastrada</option>}</NativeSelectionSelect><small>{selectedTeam ? `${selectedTeamMemberIds.size} pessoa(s) disponíveis nesta equipe` : activeTeams.length ? 'Selecione uma equipe para filtrar os responsáveis.' : 'Nenhuma equipe cadastrada. Crie uma equipe no módulo Equipes para atribuir tarefas por time.'}</small></label>
          <span className="work-responsibility-link__connector" aria-hidden="true">→</span>
          <label className="form-field"><span>Responsável</span><NativeSelectionSelect value={assigneeId} onChange={(event) => chooseAssignee(event.target.value)}><option value="">Sem responsável</option>{availableMembers.length ? availableMembers.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>) : <option value="__no_member__" disabled>{teamId ? 'Nenhuma pessoa nesta equipe' : 'Nenhuma pessoa disponível'}</option>}</NativeSelectionSelect><small>{selectedMember ? teamsForAssignee.length ? `${selectedMember.displayName} participa de ${teamsForAssignee.map((team) => team.name).join(', ')}` : 'Pessoa sem equipe vinculada.' : teamId ? availableMembers.length ? 'Mostrando apenas membros da equipe.' : 'Esta equipe não possui pessoas vinculadas. Adicione membros no módulo Equipes.' : members.length ? 'Todas as pessoas do workspace.' : 'Nenhuma pessoa disponível no workspace.'}</small></label>
        </div>
        {(selectedTeam || selectedMember) ? <div className="work-assignment-summary"><span className="work-assignment-summary__team"><UsersRound size={15}/>{selectedTeam?.name ?? 'Sem equipe'}</span><span className="work-assignment-summary__person"><UserRound size={15}/>{selectedMember?.displayName ?? 'Sem responsável'}</span></div> : null}
      </section>

      <section className="work-form-section"><header><CalendarClock size={18}/><div><strong>Prazo</strong><small>Datas vencidas entram automaticamente na visão Atrasadas.</small></div></header>
        <div className="form-grid"><label className="form-field"><span>Prazo</span><input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label><label className="form-field"><span>Tags</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="proposta, retorno, urgente" /></label></div>
      </section>

      <section className="work-form-section"><header><Link2 size={18}/><div><strong>Relacionar ao CRM</strong><small>Conecte a tarefa a um contato, empresa, oportunidade, pipeline, playbook ou reunião.</small></div></header>
        <div className="form-grid"><label className="form-field"><span>Tipo</span><NativeSelectionSelect value={relationType} onChange={(event) => { setRelationType(event.target.value as TaskRelationEntity); setRelationId('') }}><option value="contact">Contato</option><option value="company">Empresa</option><option value="opportunity">Oportunidade</option><option value="lead">Registro comercial</option><option value="pipeline">Etapa do Pipeline</option><option value="playbook">Playbook</option><option value="meeting">Reunião</option></NativeSelectionSelect></label>
          <label className="form-field"><span>Registro</span><NativeSelectionSelect value={relationId} onChange={(event) => setRelationId(event.target.value)}><option value="">Nenhum</option>{relationOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</NativeSelectionSelect></label></div>
      </section>

      <section className="work-form-section work-checklist-card"><header><CheckSquare2 size={18}/><div><strong>Checklist</strong><small>Itens independentes, progresso visível e reordenação — fluxo inspirado no Trello, com identidade RealTalent.</small></div>{checklistDraft.length ? <button type="button" className="work-checklist-card__visibility" onClick={() => setHideCompleted((current) => !current)}>{hideCompleted ? 'Mostrar concluídos' : 'Ocultar concluídos'}</button> : null}</header>
        <div className="work-checklist-progress"><span>{checklistProgress}%</span><div><i style={{ width: `${checklistProgress}%` }} /></div><small>{checklistCompleted} de {checklistDraft.length} concluído(s)</small></div>
        <div className="work-checklist-items">
          {checklistDraft.map((item, index) => hideCompleted && item.completed ? null : <div key={item.id ?? `draft-${index}`} className={`work-checklist-item ${item.completed ? 'is-completed' : ''}`} draggable onDragStart={() => { dragIndex.current = index }} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragIndex.current !== null) moveChecklistItem(dragIndex.current, index); dragIndex.current = null }}>
            <span className="work-checklist-item__drag" aria-hidden="true"><GripVertical size={16}/></span>
            <button type="button" className={`work-checklist-item__check ${item.completed ? 'is-checked' : ''}`} onClick={() => updateChecklistItem(index, { completed: !item.completed })} aria-label={item.completed ? 'Reabrir item' : 'Concluir item'}>{item.completed ? <Check size={15}/> : null}</button>
            <input value={item.title} onChange={(event) => updateChecklistItem(index, { title: event.target.value })} aria-label={`Item ${index + 1} do checklist`} />
            <button type="button" className="work-checklist-item__remove" onClick={() => removeChecklistItem(index)} aria-label="Excluir item"><Trash2 size={15}/></button>
          </div>)}
          {!checklistDraft.length ? <div className="work-checklist-empty"><CheckSquare2 size={22}/><span>Nenhum item ainda. Quebre a tarefa em passos executáveis.</span></div> : null}
        </div>
        <div className="work-checklist-add"><Plus size={16}/><input value={newChecklistTitle} onChange={(event) => setNewChecklistTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addChecklistItem() } }} placeholder="Adicionar um item"/><Button size="sm" variant="secondary" disabled={!newChecklistTitle.trim()} onClick={addChecklistItem}>Adicionar</Button>{newChecklistTitle ? <button type="button" className="work-checklist-add__clear" aria-label="Limpar novo item" onClick={() => setNewChecklistTitle('')}><X size={15}/></button> : null}</div>
      </section>
    </div>
  </Modal>
}
