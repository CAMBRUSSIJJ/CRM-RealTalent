import type { ActivityItem, Goal, GoalMetric, Lead, WorkspaceSnapshot } from '../domain/types'
import { getMetricValue, goalProgress } from './metrics'

const ACTIVE_CONTACT_OUTCOMES = new Set(['answered', 'callback_requested', 'interested', 'meeting_scheduled', 'proposal_requested', 'proposal_sent', 'sale_completed'])

const dateOnly = (date: Date) => date.toISOString().slice(0, 10)
const atStart = (value: string) => new Date(`${value}T00:00:00`)
const atEnd = (value: string) => new Date(`${value}T23:59:59.999`)
const clampRate = (value: number, fallback: number) => Number.isFinite(value) && value > 0 ? Math.min(1, value) : fallback

export interface GoalInsight {
  goal: Goal
  value: number
  percentage: number
  expected: number
  pace: 'on_track' | 'attention' | 'at_risk'
  remaining: number
  forecast: number
  forecastPercentage: number
  workdaysRemaining: number
  dailyRequired: number
}

export interface FunnelRates {
  contactRate: number
  meetingRate: number
  proposalRate: number
  winRate: number
  averageTicket: number
}

export interface RoutinePlan {
  periodEnd: string
  workdaysRemaining: number
  calls: number
  followups: number
  contacts: number
  meetings: number
  proposals: number
  wins: number
  revenue: number
  rates: FunnelRates
}

export interface RoutineActivityInput {
  leadId: string | null
  type: 'call' | 'followup'
  title: string
  description: string
  dueAt: string | null
  completedAt: string | null
  assignedTo: string | null
}

export function countBusinessDays(startValue: string | Date, endValue: string | Date): number {
  const start = typeof startValue === 'string' ? atStart(startValue) : new Date(startValue)
  const end = typeof endValue === 'string' ? atEnd(endValue) : new Date(endValue)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0
  const cursor = new Date(start); cursor.setHours(12, 0, 0, 0)
  const finish = new Date(end); finish.setHours(12, 0, 0, 0)
  let count = 0
  while (cursor <= finish) {
    const day = cursor.getDay()
    if (day !== 0 && day !== 6) count += 1
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}

export function getGoalInsight(snapshot: WorkspaceSnapshot, goal: Goal, now = new Date()): GoalInsight {
  const progress = goalProgress(snapshot, goal.metric, goal.targetValue, goal.periodStart, goal.periodEnd, goal.userId)
  const start = atStart(goal.periodStart).getTime()
  const end = atEnd(goal.periodEnd).getTime()
  const elapsed = Math.max(0.01, Math.min(1, (now.getTime() - start) / Math.max(1, end - start)))
  const forecast = progress.value / elapsed
  const remaining = Math.max(0, goal.targetValue - progress.value)
  const workdaysRemaining = Math.max(1, countBusinessDays(now, goal.periodEnd))
  const dailyRequired = remaining / workdaysRemaining
  return {
    goal,
    ...progress,
    remaining,
    forecast,
    forecastPercentage: goal.targetValue ? Math.round((forecast / goal.targetValue) * 100) : 0,
    workdaysRemaining,
    dailyRequired,
  }
}

export function calculateFunnelRates(snapshot: WorkspaceSnapshot, lookbackDays = 90, now = new Date()): FunnelRates {
  const start = new Date(now); start.setDate(start.getDate() - lookbackDays); start.setHours(0, 0, 0, 0)
  const end = new Date(now); end.setHours(23, 59, 59, 999)
  const calls = snapshot.calls.filter((call) => {
    const value = new Date(call.startedAt)
    return value >= start && value <= end
  })
  const contacts = calls.filter((call) => ACTIVE_CONTACT_OUTCOMES.has(call.outcome))
  const meetings = snapshot.events.filter((event) => {
    const value = new Date(event.startsAt)
    return event.status !== 'cancelled' && value >= start && value <= end
  })
  const proposalIds = new Set(snapshot.calls.filter((call) => ['proposal_requested', 'proposal_sent'].includes(call.outcome) && new Date(call.startedAt) >= start && new Date(call.startedAt) <= end).map((call) => call.leadId))
  const proposalStages = new Set(snapshot.stages.filter((stage) => /proposta|negocia/i.test(stage.name)).map((stage) => stage.id))
  snapshot.leads.filter((lead) => proposalStages.has(lead.stageId) && new Date(lead.updatedAt) >= start && new Date(lead.updatedAt) <= end).forEach((lead) => proposalIds.add(lead.id))
  const wins = snapshot.leads.filter((lead) => lead.status === 'won' && new Date(lead.updatedAt) >= start && new Date(lead.updatedAt) <= end)
  const revenue = wins.reduce((sum, lead) => sum + lead.value, 0)
  return {
    contactRate: clampRate(contacts.length / Math.max(1, calls.length), 0.3),
    meetingRate: clampRate(meetings.length / Math.max(1, contacts.length), 0.25),
    proposalRate: clampRate(proposalIds.size / Math.max(1, meetings.length), 0.45),
    winRate: clampRate(wins.length / Math.max(1, proposalIds.size), 0.3),
    averageTicket: revenue > 0 && wins.length ? revenue / wins.length : Math.max(1500, snapshot.leads.filter((lead) => lead.status === 'active' && lead.value > 0).reduce((sum, lead) => sum + lead.value, 0) / Math.max(1, snapshot.leads.filter((lead) => lead.status === 'active' && lead.value > 0).length)),
  }
}

const goalGap = (snapshot: WorkspaceSnapshot, goals: Goal[], metric: GoalMetric) => goals
  .filter((goal) => goal.metric === metric)
  .reduce((sum, goal) => sum + Math.max(0, goal.targetValue - getMetricValue(snapshot, metric, goal.periodStart, goal.periodEnd, goal.userId)), 0)

export function buildRoutinePlan(snapshot: WorkspaceSnapshot, activeGoals: Goal[], now = new Date()): RoutinePlan {
  const rates = calculateFunnelRates(snapshot, 90, now)
  const periodEnd = activeGoals.reduce((latest, goal) => goal.periodEnd > latest ? goal.periodEnd : latest, dateOnly(now))
  const workdaysRemaining = Math.max(1, countBusinessDays(now, periodEnd))

  const revenueGap = goalGap(snapshot, activeGoals, 'revenue')
  const directWins = goalGap(snapshot, activeGoals, 'wins')
  const winsNeeded = Math.max(directWins, Math.ceil(revenueGap / Math.max(1, rates.averageTicket)))
  const directProposals = goalGap(snapshot, activeGoals, 'proposals')
  const proposalsNeeded = Math.max(directProposals, Math.ceil(winsNeeded / Math.max(0.01, rates.winRate)))
  const directMeetings = goalGap(snapshot, activeGoals, 'meetings')
  const meetingsNeeded = Math.max(directMeetings, Math.ceil(proposalsNeeded / Math.max(0.01, rates.proposalRate)))
  const directContacts = goalGap(snapshot, activeGoals, 'contacts')
  const contactsNeeded = Math.max(directContacts, Math.ceil(meetingsNeeded / Math.max(0.01, rates.meetingRate)))
  const directCalls = goalGap(snapshot, activeGoals, 'calls')
  const callsNeeded = Math.max(directCalls, Math.ceil(contactsNeeded / Math.max(0.01, rates.contactRate)))
  const followupsNeeded = goalGap(snapshot, activeGoals, 'followups')

  return {
    periodEnd,
    workdaysRemaining,
    calls: Math.ceil(callsNeeded / workdaysRemaining),
    followups: Math.ceil(followupsNeeded / workdaysRemaining),
    contacts: Math.ceil(contactsNeeded / workdaysRemaining),
    meetings: Math.ceil(meetingsNeeded / workdaysRemaining),
    proposals: Math.ceil(proposalsNeeded / workdaysRemaining),
    wins: Math.ceil(winsNeeded / workdaysRemaining),
    revenue: revenueGap / workdaysRemaining,
    rates,
  }
}

const priorityScore = (lead: Lead) => {
  const priority = { urgent: 40, high: 30, medium: 20, low: 10 }[lead.priority]
  const temperature = { hot: 30, warm: 20, cold: 10 }[lead.temperature]
  const nextAction = !lead.nextActionAt ? 20 : new Date(lead.nextActionAt).getTime() <= Date.now() ? 15 : 0
  return priority + temperature + nextAction + Math.min(15, lead.value / 1000)
}

const routineTaskExistsToday = (activities: ActivityItem[], leadId: string, now: Date) => {
  const today = dateOnly(now)
  return activities.some((activity) => activity.leadId === leadId && !activity.completedAt && activity.dueAt?.slice(0, 10) === today && /rotina de metas/i.test(activity.title))
}

export function buildRoutineActivities(snapshot: WorkspaceSnapshot, plan: RoutinePlan, requestedCalls: number, requestedFollowups: number, now = new Date()): RoutineActivityInput[] {
  const eligible = snapshot.leads
    .filter((lead) => lead.status === 'active' && !routineTaskExistsToday(snapshot.activities, lead.id, now))
    .sort((a, b) => priorityScore(b) - priorityScore(a))

  const totalRequested = Math.max(0, requestedCalls) + Math.max(0, requestedFollowups)
  const selected = eligible.slice(0, totalRequested)
  const start = new Date(now)
  start.setSeconds(0, 0)
  start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15)
  if (start.getHours() < 9) start.setHours(9, 0, 0, 0)

  return selected.map((lead, index) => {
    const isCall = index < requestedCalls
    const due = new Date(start); due.setMinutes(due.getMinutes() + index * 20)
    const action = isCall ? 'Ligação prioritária' : 'Follow-up prioritário'
    return {
      leadId: lead.id,
      type: isCall ? 'call' : 'followup',
      title: `Rotina de metas • ${action}`,
      description: `Atividade gerada pela meta comercial. Prioridade ${lead.priority}, temperatura ${lead.temperature}. Objetivo diário estimado: ${plan.calls} ligações, ${plan.contacts} contatos e ${plan.meetings} reuniões.`,
      dueAt: due.toISOString(),
      completedAt: null,
      assignedTo: lead.ownerId,
    }
  })
}
