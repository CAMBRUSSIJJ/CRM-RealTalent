import type { CallOutcome, CallRecord, ContactRecord, Lead, PipelineStage, Playbook } from '../domain/types'
import { buildTeamCoachingSummary, playbookCoverage } from './coaching-engine'
import { outcomeLabel } from './call-workspace'

export type CallIntelligencePeriod = 'today' | '7d' | '30d' | 'all'

const CONTACT_OUTCOMES: CallOutcome[] = ['answered', 'callback_requested', 'interested', 'meeting_scheduled', 'proposal_requested', 'proposal_sent', 'sale_completed']
const QUALIFIED_OUTCOMES: CallOutcome[] = ['interested', 'meeting_scheduled', 'proposal_requested', 'proposal_sent', 'sale_completed']
const PROPOSAL_OUTCOMES: CallOutcome[] = ['proposal_requested', 'proposal_sent', 'sale_completed']

export function callsForPeriod(calls: CallRecord[], period: CallIntelligencePeriod, now = new Date()) {
  if (period === 'all') return [...calls]
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  if (period === '7d') start.setDate(start.getDate() - 6)
  if (period === '30d') start.setDate(start.getDate() - 29)
  return calls.filter((call) => new Date(call.startedAt).getTime() >= start.getTime())
}

const safePercent = (value: number, base: number) => base > 0 ? Math.round((value / base) * 100) : 0

export function buildCallIntelligence(input: {
  calls: CallRecord[]
  leads: Lead[]
  contacts: ContactRecord[]
  playbooks: Playbook[]
  stages: PipelineStage[]
  period: CallIntelligencePeriod
  now?: Date
}) {
  const calls = callsForPeriod(input.calls, input.period, input.now)
  const conversations = calls.filter((call) => CONTACT_OUTCOMES.includes(call.outcome))
  const qualified = calls.filter((call) => QUALIFIED_OUTCOMES.includes(call.outcome))
  const meetings = calls.filter((call) => call.outcome === 'meeting_scheduled')
  const proposals = calls.filter((call) => PROPOSAL_OUTCOMES.includes(call.outcome))
  const wins = calls.filter((call) => call.outcome === 'sale_completed')
  const totalDuration = calls.reduce((sum, call) => sum + Math.max(0, call.durationSeconds), 0)
  const conversationDuration = conversations.reduce((sum, call) => sum + Math.max(0, call.durationSeconds), 0)

  const hourly = new Map<number, { attempts: number; contacts: number; meetings: number }>()
  calls.forEach((call) => {
    const hour = new Date(call.startedAt).getHours()
    const current = hourly.get(hour) ?? { attempts: 0, contacts: 0, meetings: 0 }
    current.attempts += 1
    if (CONTACT_OUTCOMES.includes(call.outcome)) current.contacts += 1
    if (call.outcome === 'meeting_scheduled') current.meetings += 1
    hourly.set(hour, current)
  })
  const hourlyRows = [...hourly.entries()].map(([hour, row]) => ({
    hour,
    ...row,
    contactRate: safePercent(row.contacts, row.attempts),
    meetingRate: safePercent(row.meetings, row.contacts),
  })).sort((a, b) => b.attempts - a.attempts || a.hour - b.hour)
  const bestHour = [...hourlyRows].filter((row) => row.attempts >= 2).sort((a, b) => b.contactRate - a.contactRate || b.contacts - a.contacts)[0] ?? null

  const outcomeMap = new Map<CallOutcome, number>()
  calls.forEach((call) => outcomeMap.set(call.outcome, (outcomeMap.get(call.outcome) ?? 0) + 1))
  const outcomes = [...outcomeMap.entries()].map(([outcome, count]) => ({
    outcome,
    label: outcomeLabel(outcome),
    count,
    percent: safePercent(count, calls.length),
  })).sort((a, b) => b.count - a.count)

  const coaching = buildTeamCoachingSummary({ calls, leads: input.leads, contacts: input.contacts, playbooks: input.playbooks })
  const playbooks = playbookCoverage(input.playbooks, input.stages)

  return {
    period: input.period,
    calls,
    totals: {
      attempts: calls.length,
      conversations: conversations.length,
      qualified: qualified.length,
      meetings: meetings.length,
      proposals: proposals.length,
      wins: wins.length,
      connectionRate: safePercent(conversations.length, calls.length),
      qualificationRate: safePercent(qualified.length, conversations.length),
      meetingRate: safePercent(meetings.length, conversations.length),
      proposalRate: safePercent(proposals.length, conversations.length),
      winRate: safePercent(wins.length, conversations.length),
      totalDuration,
      averageDuration: conversations.length ? Math.round(conversationDuration / conversations.length) : 0,
      recordings: calls.filter((call) => Boolean(call.recordingPath || call.recordingUrl)).length,
      bestHour,
    },
    funnel: [
      { id: 'attempts', label: 'Tentativas', value: calls.length, rate: 100 },
      { id: 'conversations', label: 'Conversas', value: conversations.length, rate: safePercent(conversations.length, calls.length) },
      { id: 'qualified', label: 'Qualificados', value: qualified.length, rate: safePercent(qualified.length, calls.length) },
      { id: 'meetings', label: 'Reuniões', value: meetings.length, rate: safePercent(meetings.length, calls.length) },
      { id: 'proposals', label: 'Propostas', value: proposals.length, rate: safePercent(proposals.length, calls.length) },
      { id: 'wins', label: 'Vendas', value: wins.length, rate: safePercent(wins.length, calls.length) },
    ],
    hourly: hourlyRows,
    outcomes,
    coaching,
    playbooks,
  }
}
