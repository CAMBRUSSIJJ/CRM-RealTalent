export type AppRoute =
  | 'dashboard'
  | 'leads'
  | 'pipeline'
  | 'followups'
  | 'calls'
  | 'agenda'
  | 'playbooks'
  | 'goals'
  | 'automations'
  | 'metrics'
  | 'prospecting'
  | 'settings'

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer'
export type LeadTemperature = 'cold' | 'warm' | 'hot'
export type LeadPriority = 'low' | 'medium' | 'high' | 'urgent'
export type LeadStatus = 'active' | 'won' | 'lost' | 'archived'
export type ActivityType = 'call' | 'followup' | 'meeting' | 'note' | 'stage_change'
export type ActivitySourceType = 'manual' | 'calendar' | 'call' | 'system'
export type CallOutcome = 'answered' | 'no_answer' | 'busy' | 'voicemail' | 'callback_requested' | 'interested' | 'meeting_scheduled' | 'proposal_requested' | 'proposal_sent' | 'wrong_person' | 'invalid_number' | 'not_interested' | 'sale_completed' | 'other'
export type CalendarEventStatus = 'confirmed' | 'tentative' | 'completed' | 'cancelled'
export type PlaybookKind = 'script' | 'objection'

export type GoalMetric = 'calls' | 'contacts' | 'followups' | 'meetings' | 'proposals' | 'wins' | 'revenue' | 'new_leads'
export type AutomationTriggerType =
  | 'lead_created'
  | 'lead_imported'
  | 'stage_changed'
  | 'activity_completed'
  | 'activity_overdue'
  | 'call_outcome'
  | 'meeting_scheduled'
  | 'meeting_cancelled'
  | 'proposal_sent'
  | 'date_reached'
  | 'lead_stale'
  | 'goal_at_risk'
  | 'opportunity_won'
  | 'opportunity_lost'
  | 'manual'
export type AutomationConditionField =
  | 'status'
  | 'temperature'
  | 'priority'
  | 'stage_id'
  | 'source'
  | 'city'
  | 'call_outcome'
  | 'owner_name'
  | 'tag'
  | 'value'
  | 'days_without_contact'
  | 'has_next_action'
  | 'attempt_count'
  | 'event_status'
  | 'activity_type'
  | 'automation_guard'
export type AutomationConditionOperator = 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than' | 'is_empty' | 'is_not_empty'
export type AutomationActionType =
  | 'create_followup'
  | 'create_call'
  | 'create_meeting'
  | 'add_tag'
  | 'remove_tag'
  | 'set_priority'
  | 'set_temperature'
  | 'assign_owner'
  | 'move_stage'
  | 'start_cadence'
  | 'end_cadence'
  | 'create_note'
  | 'internal_alert'
  | 'mark_lost'
  | 'assisted_whatsapp'
  | 'assisted_email'
export type AutomationRunStatus = 'running' | 'success' | 'failed' | 'undone'

export interface UserProfile {
  id: string
  email: string
  displayName: string
  avatarUrl?: string | null
}

export interface WorkspaceMember {
  workspaceId: string
  userId: string
  displayName: string
  email: string
  avatarUrl?: string | null
  role: WorkspaceRole
  joinedAt: string
}

export interface WorkspaceInvite {
  id: string
  workspaceId: string
  token: string
  email: string
  role: Exclude<WorkspaceRole, 'owner'>
  expiresAt: string
  acceptedAt: string | null
  revokedAt: string | null
  createdAt: string
}

export interface AuditLog {
  id: string
  workspaceId: string
  userId: string | null
  userName: string
  action: string
  entityType: string
  entityId: string | null
  createdAt: string
}

export interface Workspace {
  id: string
  name: string
  slug: string
  role: WorkspaceRole
  createdAt: string
}

export interface PipelineStage {
  id: string
  workspaceId: string
  name: string
  order: number
  color: string
  probability: number
  isWon: boolean
  isLost: boolean
}

export interface Lead {
  id: string
  workspaceId: string
  name: string
  company: string
  phone: string
  email: string
  city: string
  source: string
  stageId: string
  status: LeadStatus
  temperature: LeadTemperature
  priority: LeadPriority
  ownerId: string | null
  ownerName: string
  value: number
  nextActionAt: string | null
  lastContactAt?: string | null
  expectedCloseAt?: string | null
  notes: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface DashboardStats {
  activeLeads: number
  pipelineValue: number
  dueToday: number
  hotLeads: number
  wonThisMonth: number
}

export interface ActivityItem {
  id: string
  workspaceId: string
  leadId: string | null
  type: ActivityType
  title: string
  description: string
  dueAt: string | null
  completedAt: string | null
  assignedTo: string | null
  sourceType: ActivitySourceType
  sourceId: string | null
  createdAt: string
  updatedAt: string
}

export interface CallRecord {
  id: string
  workspaceId: string
  leadId: string
  userId: string | null
  outcome: CallOutcome
  durationSeconds: number
  notes: string
  transcript: string
  recordingPath: string | null
  recordingUrl?: string | null
  consentAt?: string | null
  startedAt: string
  endedAt: string | null
  createdAt: string
}

export interface CalendarEvent {
  id: string
  workspaceId: string
  leadId: string | null
  title: string
  description: string
  startsAt: string
  endsAt: string
  allDay: boolean
  location: string
  status: CalendarEventStatus
  assignedTo: string | null
  createdAt: string
  updatedAt: string
}

export interface Playbook {
  id: string
  workspaceId: string
  kind: PlaybookKind
  title: string
  category: string
  content: string
  tags: string[]
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface Goal {
  id: string
  workspaceId: string
  userId: string | null
  userName: string
  metric: GoalMetric
  targetValue: number
  periodStart: string
  periodEnd: string
  createdAt: string
  updatedAt: string
}

export interface AutomationCondition {
  id: string
  field: AutomationConditionField
  operator: AutomationConditionOperator
  value: string
}

export interface AutomationAction {
  id: string
  type: AutomationActionType
  value: string
  delayDays?: number
  delayHours?: number
  durationMinutes?: number
}

export interface AutomationGuard {
  mode: 'simulation' | 'live'
  cooldownHours: number
  maxRunsPerLeadPerDay: number
  maxActionsPerRun: number
  stopOnError: boolean
  preventDuplicates: boolean
}

export interface AutomationRule {
  id: string
  workspaceId: string
  name: string
  enabled: boolean
  triggerType: AutomationTriggerType
  conditions: AutomationCondition[]
  actions: AutomationAction[]
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface AutomationMutation {
  kind: 'lead_update' | 'activity_create' | 'activity_update' | 'event_create'
  leadId?: string
  activityId?: string
  eventId?: string
  before?: Partial<Pick<Lead, 'tags' | 'priority' | 'temperature' | 'stageId' | 'status' | 'ownerId' | 'ownerName'>> & { completedAt?: string | null }
}

export interface AutomationRunOutput {
  message?: string
  mutations?: AutomationMutation[]
  matchedLeadIds?: string[]
  simulated?: boolean
  skippedReason?: string
  actionPreview?: string[]
  warnings?: string[]
}

export interface AutomationRun {
  id: string
  workspaceId: string
  ruleId: string | null
  eventKey: string
  status: AutomationRunStatus
  input: Record<string, unknown>
  output: AutomationRunOutput
  errorMessage: string | null
  startedAt: string
  finishedAt: string | null
}

export interface WorkspaceSnapshot {
  workspace: Workspace
  stages: PipelineStage[]
  leads: Lead[]
  activities: ActivityItem[]
  calls: CallRecord[]
  events: CalendarEvent[]
  playbooks: Playbook[]
  goals: Goal[]
  automationRules: AutomationRule[]
  automationRuns: AutomationRun[]
}

export interface RepositoryHealth {
  mode: 'local' | 'supabase'
  connected: boolean
  message: string
  checkedAt: string
}

export interface V99ImportResult {
  leads: Lead[]
  warnings: string[]
  sourceKeys: string[]
}
