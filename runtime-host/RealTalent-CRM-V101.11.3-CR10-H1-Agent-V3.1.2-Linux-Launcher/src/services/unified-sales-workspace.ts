import type { ActivityItem, CalendarEvent, CallRecord, Lead, Playbook, WorkspaceSnapshot } from '../domain/types'
import { recommendPlaybooks, type PlaybookRecommendation } from './coaching-engine'
import { inferCallSessionObjective, type CallSessionObjective } from './call-session-intelligence'

export const UNIFIED_SALES_WORKSPACE_SCHEMA = 'realtalent.sales.workspace.v1013' as const

export interface LeadSalesStrategyPreference {
  schema: typeof UNIFIED_SALES_WORKSPACE_SCHEMA
  objective: CallSessionObjective
  playbookId: string
  updatedAt: string
}

export type NextActionState = 'missing' | 'overdue' | 'today' | 'planned'

export interface UnifiedSalesWorkspaceContext {
  objective: CallSessionObjective
  recommendedPlaybooks: PlaybookRecommendation[]
  recommendedPlaybook: Playbook | null
  lastCall: CallRecord | null
  lastActivity: ActivityItem | null
  lastEvent: CalendarEvent | null
  lastInteractionAt: string | null
  pendingActivities: ActivityItem[]
  upcomingEvents: CalendarEvent[]
  opportunity: WorkspaceSnapshot['opportunities'][number] | null
  nextActionState: NextActionState
  nextActionLabel: string
}

const preferenceKey = (workspaceId: string, leadId: string) => `realtalent:${workspaceId}:lead:${leadId}:sales-workspace:v1013`
const validObjectives = new Set<CallSessionObjective>(['first_meeting', 'identify_decision_maker', 'qualify', 'proposal_followup', 'recover_opportunity'])
const validTime = (value: string | null | undefined) => {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}

export function readLeadSalesStrategyPreference(workspaceId: string, lead: Lead, snapshot: WorkspaceSnapshot | null | undefined): LeadSalesStrategyPreference {
  const fallback: LeadSalesStrategyPreference = {
    schema: UNIFIED_SALES_WORKSPACE_SCHEMA,
    objective: inferCallSessionObjective(lead, snapshot),
    playbookId: '',
    updatedAt: new Date(0).toISOString(),
  }
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(preferenceKey(workspaceId, lead.id))
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<LeadSalesStrategyPreference>
    return {
      schema: UNIFIED_SALES_WORKSPACE_SCHEMA,
      objective: validObjectives.has(parsed.objective as CallSessionObjective) ? parsed.objective as CallSessionObjective : fallback.objective,
      playbookId: typeof parsed.playbookId === 'string' ? parsed.playbookId.slice(0, 180) : '',
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : fallback.updatedAt,
    }
  } catch {
    return fallback
  }
}

export function saveLeadSalesStrategyPreference(workspaceId: string, leadId: string, value: Pick<LeadSalesStrategyPreference, 'objective' | 'playbookId'>) {
  const normalized: LeadSalesStrategyPreference = {
    schema: UNIFIED_SALES_WORKSPACE_SCHEMA,
    objective: validObjectives.has(value.objective) ? value.objective : 'first_meeting',
    playbookId: value.playbookId.slice(0, 180),
    updatedAt: new Date().toISOString(),
  }
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(preferenceKey(workspaceId, leadId), JSON.stringify(normalized)) } catch { /* armazenamento indisponível */ }
  }
  return normalized
}

export function clearLeadSalesStrategyPreference(workspaceId: string, leadId: string) {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(preferenceKey(workspaceId, leadId)) } catch { /* armazenamento indisponível */ }
}

function latestBy<T>(items: T[], getter: (item: T) => string | null | undefined): T | null {
  return [...items].sort((a, b) => (validTime(getter(b)) ?? 0) - (validTime(getter(a)) ?? 0))[0] ?? null
}

function nextActionStatus(nextActionAt: string | null, now: Date): { state: NextActionState; label: string } {
  if (!nextActionAt || validTime(nextActionAt) === null) return { state: 'missing', label: 'Sem próxima ação definida' }
  const date = new Date(nextActionAt)
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startTomorrow = startToday + 86_400_000
  const time = date.getTime()
  if (time < now.getTime()) return { state: 'overdue', label: 'Próxima ação atrasada' }
  if (time >= startToday && time < startTomorrow) return { state: 'today', label: 'Próxima ação hoje' }
  return { state: 'planned', label: 'Próxima ação programada' }
}

export function buildUnifiedSalesWorkspace(snapshot: WorkspaceSnapshot, lead: Lead, now = new Date()): UnifiedSalesWorkspaceContext {
  const calls = snapshot.calls.filter((item) => item.leadId === lead.id)
  const activities = snapshot.activities.filter((item) => item.leadId === lead.id)
  const events = snapshot.events.filter((item) => item.leadId === lead.id)
  const lastCall = latestBy(calls, (item) => item.endedAt ?? item.startedAt)
  const lastActivity = latestBy(activities, (item) => item.completedAt ?? item.dueAt ?? item.createdAt)
  const lastEvent = latestBy(events, (item) => item.endsAt ?? item.startsAt)
  const interactionDates = [
    lastCall?.endedAt ?? lastCall?.startedAt,
    lastActivity?.completedAt ?? lastActivity?.dueAt ?? lastActivity?.createdAt,
    lastEvent?.endsAt ?? lastEvent?.startsAt,
  ].filter((value): value is string => Boolean(value) && validTime(value) !== null)
  const lastInteractionAt = interactionDates.sort((a, b) => (validTime(b) ?? 0) - (validTime(a) ?? 0))[0] ?? lead.lastContactAt ?? null
  const pendingActivities = activities
    .filter((item) => !item.completedAt && item.resolutionStatus !== 'cancelled')
    .sort((a, b) => (validTime(a.dueAt) ?? Number.MAX_SAFE_INTEGER) - (validTime(b.dueAt) ?? Number.MAX_SAFE_INTEGER))
  const upcomingEvents = events
    .filter((item) => item.status !== 'cancelled' && (validTime(item.startsAt) ?? 0) >= now.getTime())
    .sort((a, b) => (validTime(a.startsAt) ?? 0) - (validTime(b.startsAt) ?? 0))
  const opportunity = snapshot.opportunities.find((item) => item.id === lead.opportunityId)
    ?? snapshot.opportunities.find((item) => item.leadId === lead.id)
    ?? null
  const objective = inferCallSessionObjective(lead, snapshot)
  const recommendedPlaybooks = recommendPlaybooks(snapshot.playbooks, {
    objective,
    stageId: lead.stageId,
    outcome: lastCall?.outcome ?? null,
    decisionRole: lead.decisionRole ?? null,
    temperature: lead.temperature,
    kind: 'script',
  })
  const action = nextActionStatus(lead.nextActionAt, now)
  return {
    objective,
    recommendedPlaybooks,
    recommendedPlaybook: recommendedPlaybooks[0]?.playbook ?? snapshot.playbooks.find((item) => item.active && item.kind === 'script') ?? null,
    lastCall,
    lastActivity,
    lastEvent,
    lastInteractionAt,
    pendingActivities,
    upcomingEvents,
    opportunity,
    nextActionState: action.state,
    nextActionLabel: action.label,
  }
}
