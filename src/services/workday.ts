import type { Lead, WorkspaceSnapshot } from '../domain/types'
import { leadPriorityInsight } from './lead-intelligence'

export type WorkdayReason = 'sla' | 'overdue' | 'today' | 'proposal' | 'stale' | 'no_action' | 'hot'
export type WorkdayAction = 'call' | 'whatsapp' | 'followup' | 'review'
export type WorkdaySlaState = 'breached' | 'due_soon' | 'today' | 'planned'

export interface WorkdayConfig {
  firstContactSlaMinutes: number
  staleLeadDays: number
  proposalFollowupDays: number
  businessDays: number[]
  businessStart: string
  businessEnd: string
}

export interface WorkdayItem {
  id: string
  lead: Lead
  action: WorkdayAction
  title: string
  explanation: string
  reasons: WorkdayReason[]
  dueAt: string | null
  score: number
  slaState: WorkdaySlaState
}

export interface WorkdayQueue {
  items: WorkdayItem[]
  breached: number
  dueToday: number
  stale: number
  noAction: number
}

const DAY = 86_400_000
const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).getTime()
const proposalStage = (name: string) => /proposta|negocia|decis/i.test(name)
const clockMinutes = (value: string, fallback: number) => {
  const [hours, minutes] = value.split(':').map(Number)
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : fallback
}
const atMinute = (date: Date, minute: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(minute / 60), minute % 60)
export const addBusinessMinutes = (value: string, minutes: number, config: Pick<WorkdayConfig, 'businessDays' | 'businessStart' | 'businessEnd'>) => {
  const open = clockMinutes(config.businessStart, 8 * 60 + 30)
  const close = Math.max(open + 1, clockMinutes(config.businessEnd, 18 * 60))
  const days = new Set(config.businessDays.length ? config.businessDays : [1, 2, 3, 4, 5])
  let cursor = new Date(value)
  let remaining = Math.max(0, minutes)
  for (let guard = 0; guard < 370; guard += 1) {
    const dayOpen = atMinute(cursor, open)
    const dayClose = atMinute(cursor, close)
    if (!days.has(cursor.getDay()) || cursor >= dayClose) { cursor = atMinute(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1), open); continue }
    if (cursor < dayOpen) cursor = dayOpen
    const available = Math.max(0, Math.floor((dayClose.getTime() - cursor.getTime()) / 60_000))
    if (remaining <= available) return new Date(cursor.getTime() + remaining * 60_000)
    remaining -= available
    cursor = atMinute(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1), open)
  }
  return cursor
}

export const buildWorkdayQueue = (snapshot: WorkspaceSnapshot, config: WorkdayConfig, now = new Date(), ownerId?: string | null): WorkdayQueue => {
  const nowTime = now.getTime()
  const todayEnd = endOfDay(now)
  const stageById = new Map(snapshot.stages.map((stage) => [stage.id, stage]))
  const items = snapshot.leads.filter((lead) => lead.status === 'active' && (!ownerId || lead.ownerId === ownerId)).map((lead): WorkdayItem | null => {
    const reasons: WorkdayReason[] = []
    const labels: string[] = []
    const calls = snapshot.calls.filter((call) => call.leadId === lead.id)
    const completedContacts = snapshot.activities.filter((activity) => activity.leadId === lead.id && activity.completedAt && activity.type !== 'note' && activity.type !== 'stage_change')
    const firstContactDue = addBusinessMinutes(lead.createdAt, config.firstContactSlaMinutes, config).getTime()
    const nextTime = lead.nextActionAt ? new Date(lead.nextActionAt).getTime() : null
    const interactionTimes = [
      ...calls.map((call) => call.endedAt ?? call.startedAt ?? call.createdAt),
      ...snapshot.activities.filter((activity) => activity.leadId === lead.id && activity.completedAt).map((activity) => activity.completedAt!),
      ...snapshot.events.filter((event) => event.leadId === lead.id && event.status === 'completed').map((event) => event.endsAt),
    ].map((value) => new Date(value).getTime()).filter(Number.isFinite)
    const lastAt = interactionTimes.length ? Math.max(...interactionTimes) : new Date(lead.createdAt).getTime()
    const idleDays = Number.isFinite(lastAt) ? Math.max(0, Math.floor((nowTime - lastAt) / DAY)) : 0
    const untouched = calls.length === 0 && completedContacts.length === 0
    let action: WorkdayAction = lead.phone ? 'call' : 'followup'
    let dueAt = lead.nextActionAt
    let slaState: WorkdaySlaState = 'planned'
    let score = leadPriorityInsight(lead, now).score

    if (untouched && Number.isFinite(firstContactDue)) {
      reasons.push('sla'); dueAt = new Date(firstContactDue).toISOString(); action = lead.phone ? 'call' : 'followup'
      if (firstContactDue < nowTime) { score += 45; slaState = 'breached'; labels.push(`SLA de primeiro contato vencido há ${Math.max(1, Math.ceil((nowTime - firstContactDue) / 60_000))} min`) }
      else if (firstContactDue - nowTime <= 30 * 60_000) { score += 32; slaState = 'due_soon'; labels.push('SLA de primeiro contato vence em até 30 min') }
    }
    if (nextTime !== null && Number.isFinite(nextTime)) {
      if (nextTime < nowTime) { reasons.push('overdue'); score += 35; slaState = 'breached'; labels.push('próxima ação está atrasada') }
      else if (nextTime <= todayEnd) { reasons.push('today'); score += 22; if (slaState === 'planned') slaState = 'today'; labels.push('retorno programado para hoje') }
    } else { reasons.push('no_action'); score += 18; labels.push('não possui próxima ação') }

    if (proposalStage(stageById.get(lead.stageId)?.name ?? '') && idleDays >= config.proposalFollowupDays) {
      reasons.push('proposal'); score += 26; action = 'review'; labels.push(`proposta sem interação há ${idleDays} dias`)
    } else if (idleDays >= config.staleLeadDays) {
      reasons.push('stale'); score += 18; labels.push(`sem interação há ${idleDays} dias`)
    }
    if (lead.temperature === 'hot') { reasons.push('hot'); labels.push('lead quente') }
    if (!reasons.length) return null
    return {
      id: `workday:${lead.id}`, lead, action,
      title: action === 'review' ? 'Revisar oportunidade' : action === 'call' ? 'Fazer contato agora' : 'Programar follow-up',
      explanation: labels.slice(0, 3).join(' • '), reasons: Array.from(new Set(reasons)), dueAt,
      score: Math.min(100, score), slaState,
    }
  }).filter((item): item is WorkdayItem => Boolean(item)).sort((a, b) => b.score - a.score || (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'))

  return {
    items,
    breached: items.filter((item) => item.slaState === 'breached').length,
    dueToday: items.filter((item) => item.reasons.includes('today')).length,
    stale: items.filter((item) => item.reasons.includes('stale')).length,
    noAction: items.filter((item) => item.reasons.includes('no_action')).length,
  }
}
