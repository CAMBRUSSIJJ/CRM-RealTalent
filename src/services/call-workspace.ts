import type { ActivityItem, CallOutcome, CallRecord, Lead, PipelineStage } from '../domain/types'

export type CallQueueBucket = 'all' | 'overdue' | 'today' | 'upcoming' | 'hot' | 'proposal' | 'without_action'

export interface CallQueueEntry {
  lead: Lead
  stage: PipelineStage | null
  attempts: number
  lastCall: CallRecord | null
  pendingCalls: number
  dueAt: string | null
  bucket: Exclude<CallQueueBucket, 'all'>
  score: number
  reason: string
}

export interface CallOutcomeDefinition {
  value: CallOutcome
  label: string
  tone: 'success' | 'warning' | 'danger' | 'neutral'
  nextDelayHours: number | null
  requiresSchedule: boolean
  closesLead?: 'won' | 'lost'
}

export const CALL_OUTCOMES: CallOutcomeDefinition[] = [
  { value: 'answered', label: 'Atendeu', tone: 'success', nextDelayHours: 24, requiresSchedule: false },
  { value: 'no_answer', label: 'Não atendeu', tone: 'warning', nextDelayHours: 24, requiresSchedule: true },
  { value: 'busy', label: 'Ocupado', tone: 'warning', nextDelayHours: 2, requiresSchedule: true },
  { value: 'voicemail', label: 'Caixa postal', tone: 'warning', nextDelayHours: 24, requiresSchedule: true },
  { value: 'callback_requested', label: 'Pediu retorno', tone: 'success', nextDelayHours: 24, requiresSchedule: true },
  { value: 'interested', label: 'Demonstrou interesse', tone: 'success', nextDelayHours: 24, requiresSchedule: true },
  { value: 'meeting_scheduled', label: 'Reunião marcada', tone: 'success', nextDelayHours: 24, requiresSchedule: true },
  { value: 'proposal_requested', label: 'Solicitou proposta', tone: 'success', nextDelayHours: 24, requiresSchedule: true },
  { value: 'proposal_sent', label: 'Proposta enviada', tone: 'success', nextDelayHours: 48, requiresSchedule: true },
  { value: 'wrong_person', label: 'Pessoa errada', tone: 'warning', nextDelayHours: 24, requiresSchedule: true },
  { value: 'invalid_number', label: 'Número inválido', tone: 'danger', nextDelayHours: null, requiresSchedule: false },
  { value: 'not_interested', label: 'Sem interesse', tone: 'danger', nextDelayHours: null, requiresSchedule: false, closesLead: 'lost' },
  { value: 'sale_completed', label: 'Venda concluída', tone: 'success', nextDelayHours: null, requiresSchedule: false, closesLead: 'won' },
  { value: 'other', label: 'Outro resultado', tone: 'neutral', nextDelayHours: 24, requiresSchedule: false },
]

export const outcomeDefinition = (outcome: CallOutcome) => CALL_OUTCOMES.find((item) => item.value === outcome) ?? CALL_OUTCOMES[CALL_OUTCOMES.length - 1]
export const outcomeLabel = (outcome: CallOutcome) => outcomeDefinition(outcome).label

const dayStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
const dayEnd = (date: Date) => dayStart(date) + 86_400_000 - 1

const bucketForLead = (lead: Lead, stage: PipelineStage | null, now: Date): Exclude<CallQueueBucket, 'all'> => {
  if (!lead.nextActionAt) return 'without_action'
  const due = new Date(lead.nextActionAt).getTime()
  if (due < dayStart(now)) return 'overdue'
  if (due <= dayEnd(now)) return 'today'
  if (lead.temperature === 'hot') return 'hot'
  if ((stage?.name ?? '').toLowerCase().includes('proposta')) return 'proposal'
  return 'upcoming'
}

export function buildCallQueue(leads: Lead[], calls: CallRecord[], activities: ActivityItem[], stages: PipelineStage[], now = new Date()): CallQueueEntry[] {
  const priorityWeight = { low: 10, medium: 30, high: 60, urgent: 100 }
  const temperatureWeight = { cold: 0, warm: 25, hot: 55 }
  return leads
    .filter((lead) => lead.status === 'active' && Boolean(lead.phone.trim()))
    .map((lead) => {
      const leadCalls = calls.filter((call) => call.leadId === lead.id).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      const stage = stages.find((item) => item.id === lead.stageId) ?? null
      const bucket = bucketForLead(lead, stage, now)
      const dueTime = lead.nextActionAt ? new Date(lead.nextActionAt).getTime() : Number.MAX_SAFE_INTEGER
      const hoursLate = lead.nextActionAt ? Math.max(0, (now.getTime() - dueTime) / 3_600_000) : 0
      const pendingCalls = activities.filter((activity) => activity.leadId === lead.id && activity.type === 'call' && !activity.completedAt).length
      const score = priorityWeight[lead.priority] + temperatureWeight[lead.temperature] + Math.min(120, Math.round(hoursLate * 2)) + (pendingCalls ? 35 : 0) + ((stage?.name ?? '').toLowerCase().includes('proposta') ? 30 : 0) - Math.min(35, leadCalls.length * 3)
      const reason = bucket === 'overdue' ? 'Ligação atrasada' : bucket === 'today' ? 'Programada para hoje' : bucket === 'without_action' ? 'Sem próxima ação' : bucket === 'hot' ? 'Lead quente' : bucket === 'proposal' ? 'Retorno de proposta' : 'Próxima ligação'
      return { lead, stage, attempts: leadCalls.length, lastCall: leadCalls[0] ?? null, pendingCalls, dueAt: lead.nextActionAt, bucket, score, reason }
    })
    .sort((a, b) => b.score - a.score || new Date(a.dueAt ?? '2999-01-01').getTime() - new Date(b.dueAt ?? '2999-01-01').getTime())
}

export function calculateCallPerformance(calls: CallRecord[], now = new Date()) {
  const todayCalls = calls.filter((call) => new Date(call.startedAt).toDateString() === now.toDateString())
  const conversations = todayCalls.filter((call) => ['answered', 'callback_requested', 'interested', 'meeting_scheduled', 'proposal_requested', 'proposal_sent', 'sale_completed'].includes(call.outcome))
  const meetings = todayCalls.filter((call) => call.outcome === 'meeting_scheduled')
  const totalDuration = todayCalls.reduce((sum, call) => sum + call.durationSeconds, 0)
  const averageDuration = conversations.length ? Math.round(conversations.reduce((sum, call) => sum + call.durationSeconds, 0) / conversations.length) : 0
  const byHour = new Map<number, { attempts: number; contacts: number }>()
  calls.forEach((call) => {
    const hour = new Date(call.startedAt).getHours()
    const current = byHour.get(hour) ?? { attempts: 0, contacts: 0 }
    current.attempts += 1
    if (!['no_answer', 'busy', 'voicemail', 'invalid_number', 'wrong_person'].includes(call.outcome)) current.contacts += 1
    byHour.set(hour, current)
  })
  const bestHour = [...byHour.entries()].filter(([, value]) => value.attempts >= 2).sort((a, b) => (b[1].contacts / b[1].attempts) - (a[1].contacts / a[1].attempts))[0]?.[0] ?? null
  return {
    today: todayCalls.length,
    conversations: conversations.length,
    answerRate: todayCalls.length ? Math.round((conversations.length / todayCalls.length) * 100) : 0,
    meetings: meetings.length,
    meetingRate: conversations.length ? Math.round((meetings.length / conversations.length) * 100) : 0,
    totalDuration,
    averageDuration,
    recordings: calls.filter((call) => call.recordingPath || call.recordingUrl).length,
    bestHour,
  }
}

export function defaultNextDate(outcome: CallOutcome, from = new Date(), options?: { defaultFollowupDays: number; businessDays: number[]; businessStart: string }) {
  const definition = outcomeDefinition(outcome)
  if (definition.nextDelayHours === null) return null
  const date = new Date(from)
  if (options && definition.nextDelayHours === 24) {
    let remaining = Math.max(0, options.defaultFollowupDays)
    while (remaining > 0) {
      date.setDate(date.getDate() + 1)
      if (options.businessDays.includes(date.getDay())) remaining -= 1
    }
    while (!options.businessDays.includes(date.getDay())) date.setDate(date.getDate() + 1)
    const [hour, minute] = options.businessStart.split(':').map(Number)
    date.setHours(hour || 9, minute || 0, 0, 0)
  } else {
    date.setHours(date.getHours() + definition.nextDelayHours)
    const allowedDays = options?.businessDays ?? [1, 2, 3, 4, 5]
    while (!allowedDays.includes(date.getDay())) date.setDate(date.getDate() + 1)
  }
  return date
}
