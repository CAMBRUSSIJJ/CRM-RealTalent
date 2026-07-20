import { AlertTriangle, Bell, CalendarDays, Clock3, Repeat2, Save, Trash2, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import type { CalendarEvent, CalendarEventStatus } from '../../domain/types'
import { createId } from '../../lib/id'
import { usePreferences } from '../settings/preferences-context'
import {
  addAgendaRecurrence,
  agendaCalendarLabel,
  agendaEventTypeLabel,
  agendaReminderLabel,
  appendAgendaMetadata,
  eventsOverlap,
  readAgendaMetadata,
  stripAgendaMetadata,
  type AgendaCalendar,
  type AgendaEventType,
  type AgendaRecurrence,
} from '../../services/agenda-workspace'

const toInput = (value: string) => {
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

const fromDate = (date?: Date | null) => {
  const start = date ? new Date(date) : new Date()
  if (!date) start.setHours(start.getHours() + 1, 0, 0, 0)
  else if (start.getHours() === 0 && start.getMinutes() === 0) start.setHours(9, 0, 0, 0)
  const end = new Date(start)
  end.setMinutes(end.getMinutes() + 30)
  return { start: toInput(start.toISOString()), end: toInput(end.toISOString()) }
}

const recurrenceLabel: Record<AgendaRecurrence, string> = {
  none: 'Não repetir',
  daily: 'Todos os dias',
  weekly: 'Toda semana',
  monthly: 'Todo mês',
}

export function EventModal({ open, event, initialDate, initialLeadId = '', onClose }: { open: boolean; event?: CalendarEvent | null; initialDate?: Date | null; initialLeadId?: string; onClose(): void }) {
  const { snapshot, createCalendarEvent, createCalendarEvents, updateCalendarEvent, deleteCalendarEvent, notify } = useApp()
  const { preferences } = usePreferences()
  const [leadId, setLeadId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [location, setLocation] = useState('')
  const [status, setStatus] = useState<CalendarEventStatus>('confirmed')
  const [assignedTo, setAssignedTo] = useState('')
  const [eventType, setEventType] = useState<AgendaEventType>('meeting')
  const [calendar, setCalendar] = useState<AgendaCalendar>('commercial')
  const [reminderMinutes, setReminderMinutes] = useState('30')
  const [recurrence, setRecurrence] = useState<AgendaRecurrence>('none')
  const [recurrenceCount, setRecurrenceCount] = useState('4')
  const [busy, setBusy] = useState(false)

  const owners = useMemo(() => {
    const unique = new Map<string, string>()
    snapshot?.leads.forEach((lead) => {
      if (lead.ownerId && lead.ownerName) unique.set(lead.ownerId, lead.ownerName)
    })
    return [...unique.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [snapshot])

  useEffect(() => {
    if (!open) return
    const defaults = fromDate(initialDate)
    const metadata = event ? readAgendaMetadata(event) : null
    setLeadId(event?.leadId ?? initialLeadId)
    setTitle(event?.title ?? '')
    setDescription(event ? stripAgendaMetadata(event.description) : '')
    setStartsAt(event ? toInput(event.startsAt) : defaults.start)
    setEndsAt(event ? toInput(event.endsAt) : defaults.end)
    setAllDay(event?.allDay ?? false)
    setLocation(event?.location ?? '')
    setStatus(event?.status ?? 'confirmed')
    setAssignedTo(event?.assignedTo ?? '')
    setEventType(metadata?.type ?? 'meeting')
    setCalendar(metadata?.calendar ?? 'commercial')
    setReminderMinutes(String(metadata?.reminderMinutes ?? preferences.commercial.meetingReminderMinutes))
    setRecurrence('none')
    setRecurrenceCount('4')
  }, [event, initialDate, initialLeadId, open, preferences.commercial.meetingReminderMinutes])

  const selectedLead = snapshot?.leads.find((lead) => lead.id === leadId) ?? null
  const conflicts = useMemo(() => {
    if (!startsAt || !endsAt) return []
    const candidate: CalendarEvent = {
      id: event?.id ?? 'draft', workspaceId: event?.workspaceId ?? snapshot?.workspace.id ?? '', leadId: leadId || null,
      title: title || 'Novo compromisso', description: '', startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(),
      allDay, location, status, assignedTo: assignedTo || null, createdAt: event?.createdAt ?? '', updatedAt: event?.updatedAt ?? '',
    }
    return (snapshot?.events ?? []).filter((item) => item.id !== event?.id && (!assignedTo || !item.assignedTo || item.assignedTo === assignedTo) && eventsOverlap(candidate, item))
  }, [allDay, assignedTo, endsAt, event, leadId, location, snapshot, startsAt, status, title])

  const setLead = (nextLeadId: string) => {
    setLeadId(nextLeadId)
    const lead = snapshot?.leads.find((item) => item.id === nextLeadId)
    if (lead?.ownerId && !assignedTo) setAssignedTo(lead.ownerId)
  }

  const setType = (nextType: AgendaEventType) => {
    setEventType(nextType)
    if (!title.trim()) setTitle(agendaEventTypeLabel[nextType])
  }

  const submit = async () => {
    if (!title.trim()) { notify('error', 'Informe o título do compromisso.'); return }
    if (!startsAt || !endsAt) { notify('error', 'Informe início e término.'); return }
    const startDate = new Date(startsAt)
    const endDate = new Date(endsAt)
    if (endDate.getTime() <= startDate.getTime()) { notify('error', 'O término deve ser posterior ao início.'); return }
    const total = event || recurrence === 'none' ? 1 : Math.max(2, Math.min(24, Number(recurrenceCount) || 4))
    setBusy(true)
    try {
      const recurrenceId = total > 1 ? createId('agenda-series') : undefined
      const inputs = Array.from({ length: total }, (_, index) => {
        const nextStart = addAgendaRecurrence(startDate, recurrence, index)
        const nextEnd = addAgendaRecurrence(endDate, recurrence, index)
        const metadata = {
          version: 1 as const,
          type: eventType,
          calendar,
          reminderMinutes: Number(reminderMinutes) || 0,
          recurrence: total > 1 ? recurrence : 'none' as AgendaRecurrence,
          recurrenceId,
          recurrenceIndex: total > 1 ? index + 1 : undefined,
          recurrenceTotal: total > 1 ? total : undefined,
        }
        return {
          leadId: leadId || null,
          title: title.trim(),
          description: appendAgendaMetadata(description.trim(), metadata),
          startsAt: nextStart.toISOString(),
          endsAt: nextEnd.toISOString(),
          allDay,
          location: location.trim(),
          status,
          assignedTo: assignedTo || null,
        }
      })
      if (event) await updateCalendarEvent(event.id, inputs[0])
      else if (inputs.length > 1) await createCalendarEvents(inputs)
      else await createCalendarEvent(inputs[0])
      onClose()
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Não foi possível salvar o compromisso.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!event || !window.confirm('Excluir este compromisso e sua atividade vinculada?')) return
    setBusy(true)
    try { await deleteCalendarEvent(event.id); onClose() }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível excluir.') }
    finally { setBusy(false) }
  }

  return <Modal open={open} onClose={onClose} size="lg" title={event ? 'Editar compromisso' : 'Novo compromisso'} subtitle={event ? 'As alterações serão sincronizadas com o histórico e o Follow-up.' : 'Organize reunião, ligação, retorno ou tarefa com integração ao lead.'} footer={<>{event ? <Button variant="danger" disabled={busy} onClick={() => void remove()}><Trash2 size={16} /> Excluir</Button> : null}<span className="modal__footer-spacer" /><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={busy} onClick={() => void submit()}><Save size={16} /> {event ? 'Salvar alterações' : recurrence === 'none' ? 'Criar compromisso' : 'Criar recorrência'}</Button></>}>
    <div className="agenda-event-form">
      <section className="agenda-event-form__main">
        <div className="agenda-type-picker">
          {(Object.keys(agendaEventTypeLabel) as AgendaEventType[]).map((type) => <button type="button" key={type} className={eventType === type ? 'is-active' : ''} onClick={() => setType(type)}><span className={`agenda-type-dot agenda-type-dot--${type}`} />{agendaEventTypeLabel[type]}</button>)}
        </div>

        <div className="form-grid">
          <label className="field field--span-2"><span>Título</span><input value={title} onChange={(change) => setTitle(change.target.value)} maxLength={240} placeholder="Ex.: Reunião de diagnóstico" /></label>
          <label className="field field--span-2"><span>Lead relacionado</span><select value={leadId} onChange={(change) => setLead(change.target.value)}><option value="">Sem lead</option>{snapshot?.leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name}{lead.company ? ` — ${lead.company}` : ''}</option>)}</select></label>
          <label className="field"><span>Início</span><input type="datetime-local" value={startsAt} onChange={(change) => setStartsAt(change.target.value)} /></label>
          <label className="field"><span>Término</span><input type="datetime-local" value={endsAt} onChange={(change) => setEndsAt(change.target.value)} /></label>
          <label className="field"><span>Status</span><select value={status} onChange={(change) => setStatus(change.target.value as CalendarEventStatus)}><option value="confirmed">Confirmado</option><option value="tentative">Aguardando confirmação</option><option value="completed">Concluído</option><option value="cancelled">Cancelado</option></select></label>
          <label className="field"><span>Local ou link</span><input value={location} onChange={(change) => setLocation(change.target.value)} placeholder="Google Meet, endereço..." /></label>
          <label className="consent-check field--span-2"><input type="checkbox" checked={allDay} onChange={(change) => setAllDay(change.target.checked)} /><span>Evento de dia inteiro</span></label>
          <label className="field field--span-2"><span>Descrição e pauta</span><textarea rows={5} value={description} onChange={(change) => setDescription(change.target.value)} placeholder="Contexto, objetivo, pauta e preparação necessária" /></label>
        </div>
      </section>

      <aside className="agenda-event-form__settings">
        <div className="agenda-setting-card"><CalendarDays size={17} /><label><span>Agenda</span><select value={calendar} onChange={(change) => setCalendar(change.target.value as AgendaCalendar)}>{(Object.keys(agendaCalendarLabel) as AgendaCalendar[]).map((item) => <option key={item} value={item}>{agendaCalendarLabel[item]}</option>)}</select></label></div>
        <div className="agenda-setting-card"><Users size={17} /><label><span>Responsável</span><select value={assignedTo} onChange={(change) => setAssignedTo(change.target.value)}><option value="">Sem responsável</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label></div>
        <div className="agenda-setting-card"><Bell size={17} /><label><span>Lembrete</span><select value={reminderMinutes} onChange={(change) => setReminderMinutes(change.target.value)}>{[0,10,30,60,120,1440].map((minutes) => <option key={minutes} value={minutes}>{agendaReminderLabel(minutes)}</option>)}</select></label></div>
        <div className="agenda-setting-card"><Repeat2 size={17} /><label><span>Recorrência</span><select value={recurrence} disabled={Boolean(event)} onChange={(change) => setRecurrence(change.target.value as AgendaRecurrence)}>{(Object.keys(recurrenceLabel) as AgendaRecurrence[]).map((item) => <option key={item} value={item}>{recurrenceLabel[item]}</option>)}</select></label></div>
        {!event && recurrence !== 'none' ? <div className="agenda-setting-card"><Clock3 size={17} /><label><span>Quantidade de ocorrências</span><input type="number" min="2" max="24" value={recurrenceCount} onChange={(change) => setRecurrenceCount(change.target.value)} /></label></div> : null}
        {selectedLead ? <div className="agenda-lead-preview"><span>Lead selecionado</span><strong>{selectedLead.name}</strong><small>{selectedLead.company || selectedLead.city || 'Sem empresa informada'}</small></div> : null}
        {conflicts.length ? <div className="agenda-conflict-warning"><AlertTriangle size={18} /><div><strong>{conflicts.length} conflito(s) de horário</strong><span>{conflicts.slice(0, 2).map((item) => item.title).join(', ')}</span></div></div> : <div className="agenda-availability-ok"><Clock3 size={17} /><span>Horário livre para este responsável.</span></div>}
        {event && readAgendaMetadata(event)?.recurrenceId ? <p className="agenda-series-note">Esta alteração afeta somente esta ocorrência da série.</p> : null}
      </aside>
    </div>
  </Modal>
}
