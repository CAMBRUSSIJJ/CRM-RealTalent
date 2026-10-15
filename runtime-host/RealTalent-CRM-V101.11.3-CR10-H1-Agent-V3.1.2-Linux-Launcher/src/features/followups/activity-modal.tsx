import { NativeSelectionSelect } from '../../components/selection'
import { CalendarClock, Link2, Save, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAppActions, useAppUi, useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import type { ActivityItem, ActivityType } from '../../domain/types'
import { appendFollowupMetadata, readFollowupMetadata, stripFollowupMetadata } from '../../services/followup-workspace'
import { usePreferences } from '../settings/preferences-context'

const toInputDateTime = (value: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

const inputFromDate = (date: Date) => {
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
  const { snapshot } = useAppWorkspace()
  const { notify, confirmAction } = useAppUi()
  const { createActivity, updateActivity, deleteActivity } = useAppActions()
  const { preferences } = usePreferences()
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

  const quickDate = (mode: 'later' | 'tomorrow' | 'next-business') => {
    const now = new Date()
    const [startHour, startMinute] = preferences.commercial.businessStart.split(':').map(Number)
    const allowed = preferences.commercial.businessDays.length ? preferences.commercial.businessDays : [1, 2, 3, 4, 5]
    const next = new Date(now)
    if (mode === 'later') next.setHours(next.getHours() + 2)
    else {
      next.setDate(next.getDate() + 1)
      while (!allowed.includes(next.getDay())) next.setDate(next.getDate() + 1)
      if (mode === 'tomorrow') next.setHours(9, 0, 0, 0)
      else next.setHours(Number.isFinite(startHour) ? startHour : 9, Number.isFinite(startMinute) ? startMinute : 0, 0, 0)
    }
    setDueAt(inputFromDate(next))
  }

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

  return <Modal open={open} onClose={onClose} title={activity ? 'Editar atividade' : 'Nova atividade'} subtitle={locked ? 'Esta atividade é sincronizada pelo módulo de origem.' : 'Crie o próximo passo em três decisões: relacionamento, ação e orientação.'} footer={
    <>
      {activity && !locked ? <Button variant="danger" disabled={busy} onClick={() => void remove()}><Trash2 size={16} /> Excluir</Button> : null}
      <span className="modal__footer-spacer" />
      <Button variant="secondary" onClick={onClose}>Cancelar</Button>
      <Button loading={busy} disabled={locked} onClick={() => void submit()}><Save size={16} /> Salvar atividade</Button>
    </>
  }>
    <div className="activity-create-workflow-v10168">
      {!activity ? <div className="activity-create-steps-v10168" aria-label="Etapas da criação de atividade">
        <span><i>1</i><b>Relacionar</b><small>Contato e tipo</small></span>
        <span><i>2</i><b>Próxima ação</b><small>O que e quando</small></span>
        <span><i>3</i><b>Orientação</b><small>Contexto para executar</small></span>
      </div> : null}

      <section className="activity-create-section-v10168">
        <header><Link2 size={17} /><div><strong>Relacionar</strong><span>Defina com quem e por qual canal a atividade será executada.</span></div></header>
        <div className="form-grid">
          <label className="field field--span-2"><span>Contato / oportunidade</span><NativeSelectionSelect value={leadId} onChange={(event) => setLeadId(event.target.value)} disabled={locked}><option value="">Sem contato relacionado</option>{snapshot?.leads.filter((lead) => lead.status === 'active').map((lead) => <option key={lead.id} value={lead.id}>{lead.name}{lead.company ? ` · ${lead.company}` : ''}</option>)}</NativeSelectionSelect></label>
          <label className="field field--span-2"><span>Tipo de atividade</span><NativeSelectionSelect value={type} onChange={(event) => setType(event.target.value as ActivityType)} disabled={locked}><option value="followup">Follow-up / tarefa</option><option value="call">Ligação programada</option><option value="meeting">Reunião</option><option value="note">Nota</option></NativeSelectionSelect></label>
        </div>
      </section>

      <section className="activity-create-section-v10168">
        <header><CalendarClock size={17} /><div><strong>Próxima ação</strong><span>Dê nome ao próximo passo e deixe o horário explícito para a fila.</span></div></header>
        <div className="form-grid">
          <label className="field field--span-2"><span>Título *</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} disabled={locked} placeholder="Ex.: Retomar proposta enviada" /></label>
          <label className="field field--span-2"><span>Data e horário</span><input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} disabled={locked} /></label>
          {!locked && type !== 'note' ? <div className="activity-quick-dates-v10168 field--span-2"><span>Atalhos</span><button type="button" onClick={() => quickDate('later')}>+2h</button><button type="button" onClick={() => quickDate('tomorrow')}>Amanhã 09:00</button><button type="button" onClick={() => quickDate('next-business')}>Próximo dia útil</button></div> : null}
        </div>
      </section>

      <section className="activity-create-section-v10168">
        <header><Sparkles size={17} /><div><strong>Orientação</strong><span>Registre apenas o contexto que ajuda a executar melhor a próxima conversa.</span></div></header>
        <label className="field"><span>Contexto e objetivo</span><textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} disabled={locked} placeholder="Ex.: confirmar recebimento da proposta, entender objeção e combinar próximo passo com data." /></label>
      </section>
    </div>
  </Modal>
}
