/**
 * Regra única de prazo usada em todo o CRM (Meu Dia, Follow-ups, Ligações, Agenda, Métricas).
 * Atrasado = não concluído e com horário já passado, inclusive mais cedo hoje.
 * Hoje = ainda não atrasado e com horário até o fim do dia de hoje.
 */
export type DueStatus = 'overdue' | 'today' | 'upcoming' | 'unscheduled' | 'completed'

const toTime = (value: Date | string | number | null | undefined) => {
  if (value == null || value === '') return null
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}

export function dueStatus(due: Date | string | number | null | undefined, completed: boolean, now: Date = new Date()): DueStatus {
  if (completed) return 'completed'
  const time = toTime(due)
  if (time == null) return 'unscheduled'
  if (time < now.getTime()) return 'overdue'
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime()
  return time < endOfToday ? 'today' : 'upcoming'
}

export const isOverdue = (due: Date | string | number | null | undefined, completed: boolean, now: Date = new Date()) => dueStatus(due, completed, now) === 'overdue'
