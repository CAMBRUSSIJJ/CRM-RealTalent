import type { ActivityType, AutomationCondition, AutomationRule, AutomationTriggerType, CalendarEventStatus, Lead } from '../domain/types'
import { visibleAutomationConditions } from './automation-workspace'

export interface AutomationEvent {
  triggerType: AutomationTriggerType
  entityId: string
  lead: Lead | null
  callOutcome?: string
  stageId?: string
  activityId?: string
  activityType?: ActivityType
  eventStatus?: CalendarEventStatus | string
  attemptCount?: number
  now?: string
  correlationId?: string
  chainDepth?: number
  originRuleIds?: string[]
}

const text = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase('pt-BR')

const daysSince = (iso: string | null | undefined, now = new Date()) => {
  if (!iso) return 0
  const value = new Date(iso)
  if (Number.isNaN(value.getTime())) return 0
  return Math.max(0, Math.floor((now.getTime() - value.getTime()) / 86_400_000))
}

const getValue = (condition: AutomationCondition, event: AutomationEvent): unknown => {
  if (condition.field === 'call_outcome') return event.callOutcome ?? ''
  if (condition.field === 'stage_id') return event.stageId ?? event.lead?.stageId ?? ''
  if (condition.field === 'status') return event.lead?.status ?? ''
  if (condition.field === 'temperature') return event.lead?.temperature ?? ''
  if (condition.field === 'priority') return event.lead?.priority ?? ''
  if (condition.field === 'source') return event.lead?.source ?? ''
  if (condition.field === 'city') return event.lead?.city ?? ''
  if (condition.field === 'owner_name') return event.lead?.ownerName ?? ''
  if (condition.field === 'tag') return event.lead?.tags.join(',') ?? ''
  if (condition.field === 'value') return event.lead?.value ?? 0
  if (condition.field === 'days_without_contact') return daysSince(event.lead?.lastContactAt ?? event.lead?.createdAt, event.now ? new Date(event.now) : new Date())
  if (condition.field === 'has_next_action') return Boolean(event.lead?.nextActionAt)
  if (condition.field === 'attempt_count') return event.attemptCount ?? 0
  if (condition.field === 'event_status') return event.eventStatus ?? ''
  if (condition.field === 'activity_type') return event.activityType ?? ''
  return ''
}

export function conditionMatches(condition: AutomationCondition, event: AutomationEvent) {
  if (condition.field === 'automation_guard') return true
  const actual = getValue(condition, event)
  const expected = condition.value
  if (condition.operator === 'is_empty') return actual === null || actual === undefined || text(actual) === '' || actual === false
  if (condition.operator === 'is_not_empty') return !(actual === null || actual === undefined || text(actual) === '' || actual === false)
  if (condition.operator === 'greater_than') return Number(actual) > Number(expected)
  if (condition.operator === 'less_than') return Number(actual) < Number(expected)
  if (condition.operator === 'contains') return text(actual).includes(text(expected))
  if (condition.operator === 'not_contains') return !text(actual).includes(text(expected))
  if (condition.operator === 'not_equals') return text(actual) !== text(expected)
  return text(actual) === text(expected)
}

export function ruleMatches(rule: AutomationRule, event: AutomationEvent) {
  return rule.enabled && rule.triggerType === event.triggerType && visibleAutomationConditions(rule.conditions).every((condition) => conditionMatches(condition, event))
}

export function automationEventKey(ruleId: string, event: AutomationEvent) {
  return `${ruleId}:${event.triggerType}:${event.entityId}`
}

export function automationCorrelationId(event: AutomationEvent) {
  return event.correlationId?.trim() || `corr:${event.triggerType}:${event.entityId}`
}

export function automationLoopDetected(ruleId: string, event: AutomationEvent, maxChainDepth: number) {
  const depth = Math.max(0, Number(event.chainDepth ?? 0))
  if (depth >= maxChainDepth) return 'max_chain_depth' as const
  if ((event.originRuleIds ?? []).includes(ruleId)) return 'rule_cycle' as const
  return null
}

