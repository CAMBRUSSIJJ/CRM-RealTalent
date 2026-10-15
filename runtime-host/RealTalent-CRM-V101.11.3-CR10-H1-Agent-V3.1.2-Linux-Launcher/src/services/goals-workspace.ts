import type { ActivityItem, Goal, GoalMetric, Lead, WorkspaceSnapshot } from '../domain/types'
import { getMetricValue } from './metrics'

const ACTIVE_CONTACT_OUTCOMES = new Set(['answered', 'callback_requested', 'interested', 'meeting_scheduled', 'proposal_requested', 'proposal_sent', 'sale_completed'])
const DAY_MS = 86_400_000
const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5]

export const localDateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const atStart = (value: string) => new Date(`${value}T00:00:00`)
const atEnd = (value: string) => new Date(`${value}T23:59:59.999`)
const addDays = (value: string, days: number) => { const date = atStart(value); date.setDate(date.getDate() + days); return localDateKey(date) }
const calendarDaysInclusive = (startValue: string, endValue: string) => Math.max(0, Math.round((atStart(endValue).getTime() - atStart(startValue).getTime()) / DAY_MS) + 1)
const clampRate = (value: number, fallback: number) => Number.isFinite(value) && value > 0 ? Math.min(1, value) : fallback
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export type GoalPeriodPreset = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom'

export function getGoalPeriodBounds(preset: Exclude<GoalPeriodPreset, 'custom'>, baseDate = new Date()) {
  const start = new Date(baseDate); start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  if (preset === 'week') {
    const mondayOffset = start.getDay() === 0 ? -6 : 1 - start.getDay()
    start.setDate(start.getDate() + mondayOffset)
    end.setTime(start.getTime()); end.setDate(end.getDate() + 6)
  } else if (preset === 'month') {
    start.setDate(1)
    end.setTime(start.getTime()); end.setMonth(end.getMonth() + 1); end.setDate(0)
  } else if (preset === 'quarter') {
    const quarterStart = Math.floor(start.getMonth() / 3) * 3
    start.setMonth(quarterStart, 1)
    end.setTime(start.getTime()); end.setMonth(end.getMonth() + 3); end.setDate(0)
  } else if (preset === 'year') {
    start.setMonth(0, 1)
    end.setTime(start.getTime()); end.setFullYear(end.getFullYear() + 1); end.setDate(0)
  }
  return { start: localDateKey(start), end: localDateKey(end) }
}

export interface GoalInsight {
  goal: Goal
  value: number
  percentage: number
  expected: number
  expectedPercentage: number
  pace: 'on_track' | 'attention' | 'at_risk'
  paceRatio: number
  paceGap: number
  remaining: number
  forecast: number
  forecastPercentage: number
  projectedToHit: boolean
  workdaysTotal: number
  workdaysElapsed: number
  workdaysRemaining: number
  dailyRequired: number
  previousValue: number
  previousDeltaPercentage: number | null
  previousPeriodStart: string
  previousPeriodEnd: string
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

export interface GoalInsightOptions {
  workingDays?: number[]
  riskThreshold?: number
  /** Team scope: only production from these users contributes to the goal. */
  userIds?: string[]
}

export function countBusinessDays(startValue: string | Date, endValue: string | Date, workingDays = DEFAULT_WORKING_DAYS): number {
  const start = typeof startValue === 'string' ? atStart(startValue) : new Date(startValue)
  const end = typeof endValue === 'string' ? atEnd(endValue) : new Date(endValue)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0
  const activeDays = new Set(workingDays)
  const cursor = new Date(start); cursor.setHours(12, 0, 0, 0)
  const finish = new Date(end); finish.setHours(12, 0, 0, 0)
  let count = 0
  while (cursor <= finish) {
    if (activeDays.has(cursor.getDay())) count += 1
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}

export function getGoalInsight(snapshot: WorkspaceSnapshot, goal: Goal, now = new Date(), options: GoalInsightOptions = {}): GoalInsight {
  const workingDays = options.workingDays?.length ? options.workingDays : DEFAULT_WORKING_DAYS
  const riskThreshold = clamp(options.riskThreshold ?? 0.75, 0.5, 0.99)
  const today = localDateKey(now)
  const scopedUserIds = options.userIds?.length ? options.userIds : null
  const value = getMetricValue(snapshot, goal.metric, goal.periodStart, goal.periodEnd, goal.userId, scopedUserIds)
  const percentage = goal.targetValue > 0 ? Math.min(999, Math.round((value / goal.targetValue) * 100)) : 0
  const workdaysTotal = Math.max(1, countBusinessDays(goal.periodStart, goal.periodEnd, workingDays))
  const comparableEnd = today < goal.periodStart ? null : today > goal.periodEnd ? goal.periodEnd : today
  const workdaysElapsed = comparableEnd ? Math.min(workdaysTotal, countBusinessDays(goal.periodStart, comparableEnd, workingDays)) : 0
  const elapsedFraction = clamp(workdaysElapsed / workdaysTotal, 0, 1)
  const expected = goal.targetValue * elapsedFraction
  const expectedPercentage = Math.round(elapsedFraction * 100)
  const paceRatio = expected <= 0 ? 1 : value / expected
  const pace = percentage >= 100 || paceRatio >= 1 ? 'on_track' : paceRatio >= riskThreshold ? 'attention' : 'at_risk'
  const paceGap = value - expected
  const remaining = Math.max(0, goal.targetValue - value)
  const workdaysRemaining = today > goal.periodEnd ? 0 : Math.max(0, countBusinessDays(today < goal.periodStart ? goal.periodStart : today, goal.periodEnd, workingDays))
  const dailyRequired = remaining <= 0 ? 0 : remaining / Math.max(1, workdaysRemaining)
  const forecast = elapsedFraction > 0 ? value / elapsedFraction : 0
  const forecastPercentage = goal.targetValue ? Math.round((forecast / goal.targetValue) * 100) : 0

  const totalCalendarDays = Math.max(1, calendarDaysInclusive(goal.periodStart, goal.periodEnd))
  const elapsedCalendarDays = today < goal.periodStart ? 0 : today > goal.periodEnd ? totalCalendarDays : clamp(calendarDaysInclusive(goal.periodStart, today), 0, totalCalendarDays)
  const previousPeriodStart = addDays(goal.periodStart, -totalCalendarDays)
  const previousPeriodEnd = elapsedCalendarDays > 0 ? addDays(previousPeriodStart, elapsedCalendarDays - 1) : previousPeriodStart
  const previousValue = elapsedCalendarDays > 0 ? getMetricValue(snapshot, goal.metric, previousPeriodStart, previousPeriodEnd, goal.userId, scopedUserIds) : 0
  const previousDeltaPercentage = previousValue > 0 ? Math.round(((value - previousValue) / previousValue) * 100) : value > 0 ? 100 : null

  return {
    goal,
    value,
    percentage,
    expected,
    expectedPercentage,
    pace,
    paceRatio,
    paceGap,
    remaining,
    forecast,
    forecastPercentage,
    projectedToHit: percentage >= 100 || forecastPercentage >= 100,
    workdaysTotal,
    workdaysElapsed,
    workdaysRemaining,
    dailyRequired,
    previousValue,
    previousDeltaPercentage,
    previousPeriodStart,
    previousPeriodEnd,
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

export function buildRoutinePlan(snapshot: WorkspaceSnapshot, activeGoals: Goal[], now = new Date(), workingDays = DEFAULT_WORKING_DAYS): RoutinePlan {
  const rates = calculateFunnelRates(snapshot, 90, now)
  const periodEnd = activeGoals.reduce((latest, goal) => goal.periodEnd > latest ? goal.periodEnd : latest, localDateKey(now))
  const workdaysRemaining = Math.max(1, countBusinessDays(localDateKey(now), periodEnd, workingDays))

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
  const today = localDateKey(now)
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
