import type { ActivityItem, CallRecord } from '../domain/types'

export type PipelineCallStatusTone = 'done' | 'due' | 'overdue' | 'scheduled' | 'pending'

export interface PipelineCallStatus {
  tone: PipelineCallStatusTone
  label: string
  detail: string
  lastCallAt: string | null
  nextCallAt: string | null
}

const startOfLocalDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
const endOfLocalDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999).getTime()

export function buildPipelineCallStatus(
  leadId: string,
  calls: CallRecord[],
  activities: ActivityItem[],
  now = new Date(),
): PipelineCallStatus {
  const leadCalls = calls
    .filter((call) => call.leadId === leadId)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
  const pendingCalls = activities
    .filter((activity) => activity.leadId === leadId && activity.type === 'call' && !activity.completedAt && activity.dueAt)
    .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime())

  const lastCallAt = leadCalls[0]?.startedAt ?? null
  const nextCallAt = pendingCalls[0]?.dueAt ?? null
  const nowTime = now.getTime()
  const todayStart = startOfLocalDay(now)
  const todayEnd = endOfLocalDay(now)

  if (nextCallAt) {
    const dueTime = new Date(nextCallAt).getTime()
    if (dueTime < nowTime) return { tone: 'overdue', label: 'Falta ligar', detail: 'Ligação atrasada', lastCallAt, nextCallAt }
    if (dueTime >= todayStart && dueTime <= todayEnd) return { tone: 'due', label: 'Ligar hoje', detail: 'Ligação programada para hoje', lastCallAt, nextCallAt }
    return { tone: 'scheduled', label: 'Ligação agendada', detail: 'Próxima ligação programada', lastCallAt, nextCallAt }
  }

  if (lastCallAt) {
    const lastTime = new Date(lastCallAt).getTime()
    return {
      tone: 'done',
      label: lastTime >= todayStart && lastTime <= todayEnd ? 'Ligado hoje' : 'Já ligado',
      detail: 'Contato telefônico registrado',
      lastCallAt,
      nextCallAt: null,
    }
  }

  return { tone: 'pending', label: 'Ainda não ligado', detail: 'Nenhuma ligação registrada', lastCallAt: null, nextCallAt: null }
}
