import type { CalendarEvent } from '../domain/types'

export type AgendaEventType = 'meeting' | 'call' | 'followup' | 'task' | 'return'
export type AgendaCalendar = 'commercial' | 'team' | 'personal'
export type AgendaRecurrence = 'none' | 'daily' | 'weekly' | 'monthly'

export interface AgendaMetadata {
  version: 1
  type: AgendaEventType
  calendar: AgendaCalendar
  reminderMinutes: number
  recurrence: AgendaRecurrence
  recurrenceId?: string
  recurrenceIndex?: number
  recurrenceTotal?: number
}

const META_PATTERN = /\n?\[\[CRM_AGENDA_META:([^\]]+)\]\]/g

export const agendaEventTypeLabel: Record<AgendaEventType, string> = {
  meeting: 'Reunião',
  call: 'Ligação',
  followup: 'Follow-up',
  task: 'Tarefa',
  return: 'Retorno',
}

export const agendaCalendarLabel: Record<AgendaCalendar, string> = {
  commercial: 'Comercial',
  team: 'Equipe',
  personal: 'Pessoal',
}

export const agendaReminderLabel = (minutes: number) => {
  if (minutes <= 0) return 'Sem lembrete'
  if (minutes < 60) return `${minutes} min antes`
  if (minutes === 60) return '1 hora antes'
  if (minutes < 1440) return `${Math.round(minutes / 60)} horas antes`
  return `${Math.round(minutes / 1440)} dia(s) antes`
}

export const stripAgendaMetadata = (description: string | null | undefined) => (description ?? '').replace(META_PATTERN, '').trim()

export const appendAgendaMetadata = (description: string, metadata: AgendaMetadata) => {
  const clean = stripAgendaMetadata(description)
  const encoded = encodeURIComponent(JSON.stringify(metadata))
  return `${clean}${clean ? '\n' : ''}[[CRM_AGENDA_META:${encoded}]]`
}

export const readAgendaMetadata = (eventOrDescription: CalendarEvent | string | null | undefined): AgendaMetadata | null => {
  const description = typeof eventOrDescription === 'string' ? eventOrDescription : eventOrDescription?.description
  if (!description) return null
  const raw = [...description.matchAll(META_PATTERN)].at(-1)?.[1]
  if (!raw) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as AgendaMetadata
    return parsed?.version === 1 ? parsed : null
  } catch {
    return null
  }
}

export const inferAgendaEventType = (event: Pick<CalendarEvent, 'title' | 'description'>): AgendaEventType => {
  const metadata = readAgendaMetadata(event as CalendarEvent)
  if (metadata?.type) return metadata.type
  const text = `${event.title} ${stripAgendaMetadata(event.description)}`.toLowerCase()
  if (text.includes('ligaç') || text.includes('telefon')) return 'call'
  if (text.includes('follow') || text.includes('acompanh')) return 'followup'
  if (text.includes('retorno') || text.includes('retornar')) return 'return'
  if (text.includes('tarefa') || text.includes('preparar') || text.includes('enviar')) return 'task'
  return 'meeting'
}

export const inferAgendaCalendar = (event: CalendarEvent): AgendaCalendar => readAgendaMetadata(event)?.calendar ?? (event.assignedTo ? 'team' : 'commercial')
export const agendaReminderMinutes = (event: CalendarEvent) => readAgendaMetadata(event)?.reminderMinutes ?? 30

export const addAgendaRecurrence = (date: Date, recurrence: AgendaRecurrence, offset: number) => {
  const next = new Date(date)
  if (recurrence === 'daily') next.setDate(next.getDate() + offset)
  if (recurrence === 'weekly') next.setDate(next.getDate() + (offset * 7))
  if (recurrence === 'monthly') {
    const originalDay = next.getDate()
    next.setDate(1)
    next.setMonth(next.getMonth() + offset)
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
    next.setDate(Math.min(originalDay, lastDay))
  }
  return next
}

export const eventsOverlap = (a: Pick<CalendarEvent, 'startsAt' | 'endsAt' | 'allDay' | 'status'>, b: Pick<CalendarEvent, 'startsAt' | 'endsAt' | 'allDay' | 'status'>) => {
  if (a.status === 'cancelled' || b.status === 'cancelled') return false
  const aStart = new Date(a.startsAt).getTime()
  const aEnd = new Date(a.endsAt).getTime()
  const bStart = new Date(b.startsAt).getTime()
  const bEnd = new Date(b.endsAt).getTime()
  return aStart < bEnd && bStart < aEnd
}

export const findEventConflicts = (event: CalendarEvent, events: CalendarEvent[]) => events.filter((candidate) => candidate.id !== event.id && eventsOverlap(event, candidate))

export const moveEventToDate = (event: CalendarEvent, target: Date) => {
  const start = new Date(event.startsAt)
  const end = new Date(event.endsAt)
  const duration = Math.max(0, end.getTime() - start.getTime())
  const nextStart = new Date(target)
  if (event.allDay) nextStart.setHours(0, 0, 0, 0)
  const nextEnd = new Date(nextStart.getTime() + duration)
  return { startsAt: nextStart.toISOString(), endsAt: nextEnd.toISOString() }
}

export const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
