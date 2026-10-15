import { useEffect, useMemo, useState } from 'react'
import { AlarmClock, Check, CheckSquare2, Clock3, Plus, Tag, Trash2, UserRound } from 'lucide-react'
import { NativeSelectionSelect } from '../../components/selection'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import { useAppActions, useAppUi, useAppWorkspace } from '../../app/app-context'
import type { Lead, TaskPriority, WorkspaceMember } from '../../domain/types'
import type { ConversationStatus } from '../../services/communication-workspace'
import { saveTask } from '../../services/work-management'
import {
  createWhatsAppWorkLabel, deleteWhatsAppWorkLabel, saveWhatsAppWorkState, whatsappOperationalStatusLabel,
  type WhatsAppConversationWorkState, type WhatsAppOperationalStatus, type WhatsAppWorkLabel,
} from '../../services/whatsapp-work-management'
import { useAuth } from '../auth/auth-context'

interface Props {
  workspaceId: string
  conversationKey: string
  conversationStatus: ConversationStatus
  lead: Lead | null
  displayName: string
  state: WhatsAppConversationWorkState
  labels: WhatsAppWorkLabel[]
  onChanged(): void
}

const toLocalInput = (date: Date) => {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return shifted.toISOString().slice(0, 16)
}
const nextHour = () => { const date = new Date(Date.now() + 60 * 60_000); date.setMinutes(0, 0, 0); return date }
const tomorrowMorning = () => { const date = new Date(); date.setDate(date.getDate() + 1); date.setHours(9, 0, 0, 0); return date }

export function WhatsAppWorkToolbar({ workspaceId, conversationKey, conversationStatus, lead, displayName, state, labels, onChanged }: Props) {
  const { repositoryMode, teamAccess, canTeamAccess, canTeamAccessRecord, teamAccessScope } = useAppWorkspace()
  const { createActivity, updateLead, listWorkspaceMembers } = useAppActions()
  const { notify } = useAppUi()
  const { user } = useAuth()
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [labelsOpen, setLabelsOpen] = useState(false)
  const [followupOpen, setFollowupOpen] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  const [followupAt, setFollowupAt] = useState(toLocalInput(tomorrowMorning()))
  const [taskTitle, setTaskTitle] = useState(`Retornar WhatsApp · ${displayName}`)
  const [taskDueAt, setTaskDueAt] = useState(toLocalInput(nextHour()))
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('normal')
  const [taskAssigneeId, setTaskAssigneeId] = useState(state.ownerId || lead?.ownerId || user?.id || '')
  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColor, setNewLabelColor] = useState('#356AE6')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    void listWorkspaceMembers().then((items) => { if (active) setMembers(items) }).catch(() => { if (active) setMembers([]) })
    return () => { active = false }
  }, [listWorkspaceMembers, workspaceId])

  useEffect(() => {
    setTaskTitle(`Retornar WhatsApp · ${displayName}`)
    setTaskAssigneeId(state.ownerId || lead?.ownerId || user?.id || '')
  }, [conversationKey, displayName, lead?.ownerId, state.ownerId, user?.id])

  const selectedLabels = useMemo(() => labels.filter((item) => state.labelIds.includes(item.id)), [labels, state.labelIds])
  const communicationOwnerId = lead?.ownerId ?? state.ownerId ?? null
  const communicationInScope = communicationOwnerId ? canTeamAccessRecord('communications', communicationOwnerId) : teamAccessScope('communications') === 'all'
  const canEditCommunication = canTeamAccess('edit','communications') && communicationInScope
  const canAssignCommunication = canTeamAccess('assign','communications') && communicationInScope

  const patch = (next: Partial<Omit<WhatsAppConversationWorkState, 'conversationKey' | 'updatedAt'>>) => {
    if (!canEditCommunication) throw new Error('Seu perfil não permite alterar esta conversa.')
    saveWhatsAppWorkState(workspaceId, conversationKey, conversationStatus, next)
    onChanged()
  }

  const chooseStatus = (status: WhatsAppOperationalStatus) => {
    patch({ status, ...(status === 'resolved' ? { followUpAt: null, snoozedUntil: null } : {}) })
    notify('success', `Conversa marcada como “${whatsappOperationalStatusLabel[status]}”.`)
  }

  const chooseOwner = (ownerId: string) => {
    if (!canAssignCommunication) { notify('error', 'Seu perfil não permite atribuir conversas.'); return }
    const member = members.find((item) => item.userId === ownerId)
    patch({ ownerId: ownerId || null, ownerName: member?.displayName ?? '' })
    notify('success', ownerId ? `Conversa atribuída a ${member?.displayName || 'responsável'}.` : 'Conversa ficou sem responsável.')
  }

  const toggleLabel = (labelId: string) => patch({ labelIds: state.labelIds.includes(labelId) ? state.labelIds.filter((id) => id !== labelId) : [...state.labelIds, labelId] })

  const addLabel = () => {
    try {
      const label = createWhatsAppWorkLabel(workspaceId, { name: newLabelName, color: newLabelColor })
      setNewLabelName('')
      patch({ labelIds: state.labelIds.includes(label.id) ? state.labelIds : [...state.labelIds, label.id] })
      notify('success', 'Etiqueta criada e aplicada à conversa.')
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível criar a etiqueta.') }
  }

  const removeLabel = (label: WhatsAppWorkLabel) => {
    if (label.system) return
    if (deleteWhatsAppWorkLabel(workspaceId, label.id)) { onChanged(); notify('success', 'Etiqueta excluída.') }
  }

  const scheduleFollowup = async () => {
    if (!followupAt) return
    const dueAt = new Date(followupAt).toISOString()
    setSaving(true)
    try {
      patch({ status: 'followup_scheduled', followUpAt: dueAt })
      if (lead) {
        await createActivity({
          leadId: lead.id,
          contactId: lead.primaryContactId ?? null,
          type: 'followup',
          title: `Retornar WhatsApp · ${lead.name}`,
          description: `Follow-up criado pela conversa do WhatsApp (${conversationKey}).`,
          dueAt,
          completedAt: null,
          resolutionStatus: 'pending',
          resolutionReason: null,
          originEventKey: `whatsapp-followup:${conversationKey}:${Date.now()}`,
          purpose: 'whatsapp_followup',
          assignedTo: state.ownerId || lead.ownerId || user?.id || null,
        })
        await updateLead(lead.id, { nextActionAt: dueAt })
        notify('success', 'Follow-up criado e conectado ao CRM.')
      } else notify('success', 'Retorno agendado na Inbox. Vincule o contato ao CRM para também aparecer em Follow-ups.')
      setFollowupOpen(false)
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível criar o follow-up.') }
    finally { setSaving(false) }
  }

  const createTask = async () => {
    if (!taskTitle.trim()) return
    setSaving(true)
    try {
      const assignee = members.find((item) => item.userId === taskAssigneeId)
      if (!canTeamAccess('create','tasks')) throw new Error('Seu perfil não permite criar tarefas.')
      await saveTask(repositoryMode, workspaceId, {
        title: taskTitle.trim(),
        description: `Criada a partir da conversa do WhatsApp com ${displayName}. Conversa: ${conversationKey}`,
        status: 'todo',
        priority: taskPriority,
        dueAt: taskDueAt ? new Date(taskDueAt).toISOString() : null,
        assigneeId: taskAssigneeId || null,
        assigneeName: assignee?.displayName ?? (taskAssigneeId === lead?.ownerId ? lead?.ownerName || '' : ''),
        teamId: null,
        tags: ['whatsapp', 'comunicacoes'],
        relation: lead ? { entityType: 'lead', entityId: lead.id, entityLabel: `${lead.name}${lead.company ? ` · ${lead.company}` : ''}` } : null,
        checklist: [],
      }, user?.id ?? null, teamAccess)
      onChanged()
      notify('success', 'Tarefa criada no módulo Tarefas.')
      setTaskOpen(false)
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível criar a tarefa.') }
    finally { setSaving(false) }
  }

  return <>
    <div className="whatsapp-workbar" data-h19="work-management">
      <div className="whatsapp-workbar__actions">
        <Button size="sm" variant="secondary" disabled={!canEditCommunication} onClick={() => { setFollowupAt(toLocalInput(tomorrowMorning())); setFollowupOpen(true) }}><AlarmClock size={14}/> Follow-up</Button>
        <Button size="sm" variant="secondary" disabled={!canEditCommunication} onClick={() => { setTaskDueAt(toLocalInput(nextHour())); setTaskOpen(true) }}><CheckSquare2 size={14}/> Tarefa</Button>
        <Button size="sm" variant="secondary" disabled={!canEditCommunication} onClick={() => setLabelsOpen(true)}><Tag size={14}/> Etiqueta{selectedLabels.length ? ` · ${selectedLabels.length}` : ''}</Button>
      </div>
      <div className="whatsapp-workbar__controls">
        <label><span>Status</span><NativeSelectionSelect value={state.status} disabled={!canEditCommunication} onChange={(event) => chooseStatus(event.target.value as WhatsAppOperationalStatus)}><option value="new">Novo</option><option value="in_progress">Em atendimento</option><option value="awaiting_customer">Aguardando cliente</option><option value="followup_scheduled">Retorno agendado</option><option value="resolved">Concluído</option></NativeSelectionSelect></label>
        <label><span>Responsável</span><NativeSelectionSelect value={state.ownerId ?? ''} disabled={!canAssignCommunication} onChange={(event) => chooseOwner(event.target.value)}><option value="">Sem responsável</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}</NativeSelectionSelect></label>
      </div>
      {selectedLabels.length || state.followUpAt ? <div className="whatsapp-workbar__signals">{selectedLabels.map((label) => <button type="button" key={label.id} onClick={() => setLabelsOpen(true)}><i style={{ backgroundColor: label.color }}/>{label.name}</button>)}{state.followUpAt ? <span className={Date.parse(state.followUpAt) < Date.now() ? 'is-overdue' : ''}><Clock3 size={12}/> {new Date(state.followUpAt).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span> : null}</div> : null}
    </div>

    <Modal open={labelsOpen} title="Etiquetas da conversa" subtitle="Organize a Inbox sem alterar o Pipeline ou poluir o chat." onClose={() => setLabelsOpen(false)} footer={<><span className="modal__footer-spacer"/><Button variant="secondary" onClick={() => setLabelsOpen(false)}>Fechar</Button></>}>
      <div className="whatsapp-label-manager">
        <div className="whatsapp-label-manager__list">{labels.map((label) => <div key={label.id} className={state.labelIds.includes(label.id) ? 'is-selected' : ''}><button type="button" disabled={!canEditCommunication} onClick={() => toggleLabel(label.id)}><span className="whatsapp-label-manager__check">{state.labelIds.includes(label.id) ? <Check size={13}/> : null}</span><i style={{ backgroundColor: label.color }}/><strong>{label.name}</strong></button>{!label.system ? <button type="button" disabled={!canEditCommunication} className="is-delete" aria-label={`Excluir ${label.name}`} onClick={() => removeLabel(label)}><Trash2 size={14}/></button> : null}</div>)}</div>
        <section className="whatsapp-label-manager__new"><div><Plus size={16}/><strong>Nova etiqueta</strong></div><div className="form-grid form-grid--2"><label className="field"><span>Nome</span><input value={newLabelName} onChange={(event) => setNewLabelName(event.target.value)} placeholder="Ex.: Indicação"/></label><label className="field"><span>Cor</span><input type="color" value={newLabelColor} onChange={(event) => setNewLabelColor(event.target.value)}/></label></div><Button size="sm" disabled={!canEditCommunication || !newLabelName.trim()} onClick={addLabel}>Criar e aplicar</Button></section>
      </div>
    </Modal>

    <Modal open={followupOpen} title="Agendar retorno" subtitle={`Voltar para a conversa com ${displayName}.`} onClose={() => setFollowupOpen(false)} footer={<><Button variant="secondary" onClick={() => setFollowupOpen(false)}>Cancelar</Button><span className="modal__footer-spacer"/><Button loading={saving} disabled={!followupAt} onClick={() => void scheduleFollowup()}><AlarmClock size={15}/> Agendar</Button></>}>
      <div className="whatsapp-work-modal"><label className="field"><span>Data e hora</span><input type="datetime-local" value={followupAt} onChange={(event) => setFollowupAt(event.target.value)}/></label><div className="whatsapp-work-modal__presets"><button type="button" onClick={() => setFollowupAt(toLocalInput(nextHour()))}>Em 1 hora</button><button type="button" onClick={() => setFollowupAt(toLocalInput(tomorrowMorning()))}>Amanhã 09:00</button></div>{lead ? <p>Também será criado um Follow-up no CRM e atualizado o próximo passo do contato.</p> : <p>Esta conversa ainda não está vinculada ao CRM. O retorno ficará na Inbox do WhatsApp.</p>}</div>
    </Modal>

    <Modal open={taskOpen} title="Nova tarefa" subtitle="A tarefa será criada no módulo Tarefas, ligada ao contato quando possível." onClose={() => setTaskOpen(false)} footer={<><Button variant="secondary" onClick={() => setTaskOpen(false)}>Cancelar</Button><span className="modal__footer-spacer"/><Button loading={saving} disabled={!taskTitle.trim()} onClick={() => void createTask()}><CheckSquare2 size={15}/> Criar tarefa</Button></>}>
      <div className="whatsapp-work-modal"><label className="field"><span>Título</span><input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)}/></label><div className="form-grid form-grid--2"><label className="field"><span>Prazo</span><input type="datetime-local" value={taskDueAt} onChange={(event) => setTaskDueAt(event.target.value)}/></label><label className="field"><span>Prioridade</span><NativeSelectionSelect value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as TaskPriority)}><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></NativeSelectionSelect></label></div><label className="field"><span>Responsável</span><NativeSelectionSelect value={taskAssigneeId} onChange={(event) => setTaskAssigneeId(event.target.value)}><option value="">Sem responsável</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}</NativeSelectionSelect></label><div className="whatsapp-work-modal__relation"><UserRound size={15}/><span>{lead ? `Relacionada a ${lead.name}${lead.company ? ` · ${lead.company}` : ''}` : 'Conversa sem contato CRM: tarefa será criada sem relação até o contato ser vinculado.'}</span></div></div>
    </Modal>
  </>
}
