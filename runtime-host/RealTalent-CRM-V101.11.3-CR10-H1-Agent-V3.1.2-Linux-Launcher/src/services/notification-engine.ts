import type { AppRoute, WorkspaceSnapshot } from '../domain/types'
import type { RouteContext } from '../app/route-state'
import type { NotificationPreferences } from './notification-preferences'
import { goalProgress } from './metrics'
import { localDateKey } from './goals-workspace'
import { dismissedNotificationIds } from './notification-state'

export type NotificationCategory =
  | 'overdue_activity'
  | 'upcoming_activity'
  | 'upcoming_event'
  | 'proposal_silence'
  | 'stale_lead'
  | 'goal_at_risk'
  | 'automation_failure'

export type NotificationTone = 'danger' | 'warning' | 'info'

export interface NotificationAlert {
  id: string
  category: NotificationCategory
  title: string
  detail: string
  date: string | null
  tone: NotificationTone
  route: AppRoute
  context?: RouteContext
}

export interface NotificationBuildOptions {
  now?: Date
  staleLeadDays?: number
}

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const validTime = (value: string | null | undefined) => {
  const parsed = value ? new Date(value).getTime() : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}

const alertTime = (alert: NotificationAlert) => validTime(alert.date) ?? Number.MAX_SAFE_INTEGER

export function buildNotificationAlerts(snapshot: WorkspaceSnapshot, preferences: NotificationPreferences, options: NotificationBuildOptions = {}): NotificationAlert[] {
  if (!preferences.inAppEnabled && !preferences.browserEnabled) return []
  const now = options.now ?? new Date()
  const nowMs = now.getTime()
  const horizon = nowMs + Math.max(1, preferences.upcomingWindowHours) * HOUR
  const proposalSilenceMs = Math.max(1, preferences.proposalSilenceDays) * DAY
  const staleDays = Math.max(1, options.staleLeadDays ?? 7)
  const notifications: NotificationAlert[] = []

  if (preferences.overdueActivities) {
    snapshot.activities
      .filter((activity) => !activity.completedAt && activity.dueAt && (validTime(activity.dueAt) ?? Infinity) <= nowMs)
      .forEach((activity) => notifications.push({
        id: `activity-overdue:${activity.id}`,
        category: 'overdue_activity',
        title: activity.title,
        detail: 'Follow-up vencido e aguardando ação.',
        date: activity.dueAt,
        tone: 'danger',
        route: 'followups',
        context: { activityId: activity.id },
      }))
  }

  if (preferences.upcomingActivities) {
    snapshot.activities
      .filter((activity) => {
        const due = validTime(activity.dueAt)
        return !activity.completedAt && due !== null && due > nowMs && due <= horizon
      })
      .forEach((activity) => notifications.push({
        id: `activity-upcoming:${activity.id}`,
        category: 'upcoming_activity',
        title: activity.title,
        detail: 'Próxima atividade comercial dentro da janela configurada.',
        date: activity.dueAt,
        tone: 'info',
        route: 'followups',
        context: { activityId: activity.id },
      }))
  }

  if (preferences.upcomingEvents) {
    snapshot.events
      .filter((event) => {
        const start = validTime(event.startsAt)
        return event.status !== 'cancelled' && event.status !== 'completed' && start !== null && start >= nowMs && start <= horizon
      })
      .forEach((event) => notifications.push({
        id: `event:${event.id}`,
        category: 'upcoming_event',
        title: event.title,
        detail: 'Reunião ou compromisso dentro da janela configurada.',
        date: event.startsAt,
        tone: 'info',
        route: 'agenda',
        context: { eventId: event.id, leadId: event.leadId ?? undefined },
      }))
  }

  if (preferences.proposalFollowups) {
    snapshot.proposals
      .filter((proposal) => proposal.isCurrentVersion !== false && (proposal.status === 'sent' || proposal.status === 'viewed'))
      .forEach((proposal) => {
        const reference = validTime(proposal.viewedAt ?? proposal.sentAt ?? proposal.updatedAt)
        if (reference === null || nowMs - reference < proposalSilenceMs) return
        const quietDays = Math.max(1, Math.floor((nowMs - reference) / DAY))
        notifications.push({
          id: `proposal-silence:${proposal.id}`,
          category: 'proposal_silence',
          title: proposal.title,
          detail: `Proposta ${proposal.status === 'viewed' ? 'visualizada' : 'enviada'} sem avanço há ${quietDays} dia(s).`,
          date: proposal.viewedAt ?? proposal.sentAt ?? proposal.updatedAt,
          tone: 'warning',
          route: 'proposals',
          context: { proposalId: proposal.id, leadId: proposal.leadId },
        })
      })
  }

  if (preferences.staleLeads) {
    const activeStageIds = new Set(snapshot.stages.filter((stage) => !stage.isWon && !stage.isLost).map((stage) => stage.id))
    snapshot.leads.forEach((lead) => {
      if (!activeStageIds.has(lead.stageId)) return
      const reference = validTime(lead.lastContactAt ?? lead.updatedAt ?? lead.createdAt)
      if (reference === null || nowMs - reference < staleDays * DAY) return
      notifications.push({
        id: `stale-lead:${lead.id}`,
        category: 'stale_lead',
        title: lead.name,
        detail: `${lead.company || 'Lead'} está há ${Math.floor((nowMs - reference) / DAY)} dia(s) sem contato registrado.`,
        date: lead.lastContactAt ?? lead.updatedAt ?? lead.createdAt,
        tone: 'warning',
        route: 'leads',
        context: { leadId: lead.id },
      })
    })
  }

  if (preferences.goalsAtRisk) {
    const today = localDateKey(now)
    snapshot.goals
      .filter((goal) => goal.periodStart <= today && goal.periodEnd >= today)
      .forEach((goal) => {
        const progress = goalProgress(snapshot, goal.metric, goal.targetValue, goal.periodStart, goal.periodEnd, goal.userId)
        if (progress.pace !== 'at_risk') return
        notifications.push({
          id: `goal-risk:${goal.id}`,
          category: 'goal_at_risk',
          title: `Meta em risco · ${goal.userName || 'Equipe'}`,
          detail: `Realizado ${Math.round(progress.percentage)}% com ritmo esperado de ${Math.round(progress.expected)}%.`,
          date: goal.updatedAt,
          tone: 'danger',
          route: 'goals',
        })
      })
  }

  if (preferences.automationFailures) {
    snapshot.automationRuns
      .filter((run) => run.status === 'failed')
      .forEach((run) => notifications.push({
        id: `automation:${run.id}`,
        category: 'automation_failure',
        title: 'Falha em automação',
        detail: run.errorMessage || 'Uma execução precisa ser revisada.',
        date: run.finishedAt ?? run.startedAt,
        tone: 'warning',
        route: 'automations',
      }))
  }

  const toneRank: Record<NotificationTone, number> = { danger: 0, warning: 1, info: 2 }
  const dismissed = dismissedNotificationIds(snapshot.workspace.id)
  return notifications
    .filter((alert) => !dismissed.has(alert.id))
    .sort((a, b) => toneRank[a.tone] - toneRank[b.tone] || alertTime(a) - alertTime(b))
    .slice(0, 100)
}

export function isNotificationQuietTime(preferences: NotificationPreferences, reference = new Date()) {
  if (!preferences.quietHoursEnabled) return false
  const current = reference.getHours() * 60 + reference.getMinutes()
  const parse = (value: string) => {
    const [hour, minute] = value.split(':').map(Number)
    return hour * 60 + minute
  }
  const start = parse(preferences.quietStart)
  const end = parse(preferences.quietEnd)
  if (start === end) return true
  return start < end ? current >= start && current < end : current >= start || current < end
}

export function notificationFrequencyBucket(frequency: NotificationPreferences['frequency'], reference = new Date()) {
  if (frequency === 'daily') return reference.toISOString().slice(0, 10)
  if (frequency === 'hourly') return reference.toISOString().slice(0, 13)
  return null
}
