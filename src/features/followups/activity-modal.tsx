import { Save, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import type { ActivityItem, ActivityType } from '../../domain/types'
import { appendFollowupMetadata, readFollowupMetadata, stripFollowupMetadata } from '../../services/followup-workspace'

const toInputDateTime = (value: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

interface Props {
  open: boolean
  activity?: ActivityItem | null
  initialLeadId?: string
  initialType?: ActivityType
  initialTitle?: string
  onClose(): void
}

export function ActivityModal({ open, activity, initialLeadId = '', initialType = 'followup', initialTitle = '', onClose }: Props) {
  const { snapshot, createActivity, updateActivity, deleteActivity, notify, confirmAction } = useApp()
  const [leadId, setLeadId] = useState('')
  const [type, setType] = useState<ActivityType>('followup')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setLeadId(activity?.leadId ?? initialLeadId)
    setType(activity?.type ?? initialType)
    setTitle(activity?.title ?? initialTitle)
    setDescription(stripFollowupMetadata(activity?.description ?? ''))
    setDueAt(toInputDateTime(activity?.dueAt ?? null))
  }, [activity, initialLeadId, initialTitle, initialType, open])

  const submit = async () => {
    if (!title.trim()) { notify('error', 'Informe o título da atividade.'); return }
    if (['followup', 'meeting', 'call'].includes(type) && !dueAt) { notify('error', 'Informe a data e o horário.'); return }
    setBusy(true)
    try {
      const payload = {
        leadId: leadId || null,
        type,
        title: title.trim(),
        description: activity && readFollowupMetadata(activity) ? appendFollowupMetadata(description.trim(), readFollowupMetadata(activity)!) : description.trim(),
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        completedAt: activity?.completedAt ?? null,
        assignedTo: activity?.assignedTo ?? null,
      }
      if (activity) await updateActivity(activity.id, payload)
      else await createActivity(payload)
      onClose()
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível salvar a atividade.') }
    finally { setBusy(false) }
  }

  const remove = async () => {
    if (!activity) return
    if (!await confirmAction({ title: 'Excluir atividade?', description: 'Esta atividade será removida da fila e do histórico operacional.', confirmLabel: 'Excluir atividade', tone: 'danger' })) return
    setBusy(true)
    try { await deleteActivity(activity.id); onClose() }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível excluir.') }
    finally { setBusy(false) }
  }

  const locked = Boolean(activity && activity.sourceType !== 'manual')

  return <Modal open={open} onClose={onClose} title={activity ? 'Editar atividade' : 'Nova atividade'} subtitle={locked ? 'Esta atividade é sincronizada pelo módulo de origem.' : 'Vincule o próximo passo ao lead e à fila diária.'} footer={
    <>
      {activity && !locked ? <Button variant="danger" disabled={busy} onClick={() => void remove()}><Trash2 size={16} /> Excluir</Button> : null}
      <span className="modal__footer-spacer" />
      <Button variant="secondary" onClick={onClose}>Cancelar</Button>
      <Button loading={busy} disabled={locked} onClick={() => void submit()}><Save size={16} /> Salvar</Button>
    </>
  }>
    <div className="form-grid">
      <label className="field field--span-2"><span>Lead relacionado</span><select value={leadId} onChange={(event) => setLeadId(event.target.value)} disabled={locked}><option value="">Sem lead</option>{snapshot?.leads.filter((lead) => lead.status === 'active').map((lead) => <option key={lead.id} value={lead.id}>{lead.name}</option>)}</select></label>
      <label className="field"><span>Tipo</span><select value={type} onChange={(event) => setType(event.target.value as ActivityType)} disabled={locked}><option value="followup">Follow-up</option><option value="call">Ligação programada</option><option value="meeting">Reunião</option><option value="note">Nota</option></select></label>
      <label className="field"><span>Data e horário</span><input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} disabled={locked} /></label>
      <label className="field field--span-2"><span>Título</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} disabled={locked} placeholder="Ex.: Retomar proposta enviada" /></label>
      <label className="field field--span-2"><span>Orientação</span><textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} disabled={locked} placeholder="Contexto e objetivo do próximo contato" /></label>
    </div>
  </Modal>
}
