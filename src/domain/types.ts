export type AppRoute =
  | 'dashboard'
  | 'leads'
  | 'commercial-map'
  | 'pipeline'
  | 'followups'
  | 'calls'
  | 'communications'
  | 'proposals'
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
export type GeocodeStatus = 'pending' | 'exact' | 'approximate' | 'incomplete' | 'not_found' | 'manual'
export type GeocodePrecision = 'rooftop' | 'range_interpolated' | 'street' | 'district' | 'city' | 'manual' | 'unknown'
export type ActivityType = 'call' | 'followup' | 'meeting' | 'note' | 'stage_change' | 'email' | 'whatsapp'
export type ActivitySourceType = 'manual' | 'calendar' | 'call' | 'system' | 'gmail' | 'outlook' | 'whatsapp'
export type CallOutcome = 'answered' | 'no_answer' | 'busy' | 'voicemail' | 'callback_requested' | 'interested' | 'meeting_scheduled' | 'proposal_requested' | 'proposal_sent' | 'wrong_person' | 'invalid_number' | 'not_interested' | 'sale_completed' | 'other'
export type CalendarEventStatus = 'confirmed' | 'tentative' | 'completed' | 'cancelled'
export type PlaybookKind = 'script' | 'objection'
export type DecisionRole = 'decision_maker' | 'influencer' | 'user' | 'unknown'
export type ConsentStatus = 'unknown' | 'legitimate_interest' | 'consented' | 'opted_out'
export type SocialNetwork = 'instagram' | 'linkedin' | 'facebook' | 'whatsapp' | 'website' | 'google_business' | 'other'
export type SocialEntityType = 'company' | 'contact'
export type DataQualitySeverity = 'critical' | 'high' | 'medium' | 'low'
export type DataQualityCategory = 'duplicate' | 'identity' | 'contact' | 'origin' | 'consent' | 'social' | 'opportunity' | 'location'


export type ProductBillingType = 'one_time' | 'recurring'
export type ProductBillingInterval = 'month' | 'quarter' | 'year' | null
export type ProposalStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'expired' | 'cancelled'
export type ForecastCategory = 'pipeline' | 'best_case' | 'commit' | 'closed' | 'omitted'
export type RevenueType = 'one_time' | 'recurring'
export type RevenueStatus = 'forecast' | 'recognized' | 'cancelled'

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
  | 'send_webhook'
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
  postalCode?: string
  street?: string
  addressNumber?: string
  complement?: string
  district?: string
  state?: string
  country?: string
  formattedAddress?: string
  latitude?: number | null
  longitude?: number | null
  geocodeStatus?: GeocodeStatus
  geocodePrecision?: GeocodePrecision
  geocodeProvider?: string | null
  geocodePlaceId?: string | null
  geocodedAt?: string | null
  geocodeError?: string | null
  source: string
  sourceDetail?: string
  sourceUrl?: string
  capturedAt?: string | null
  consentStatus?: ConsentStatus
  doNotContact?: boolean
  doNotContactReason?: string
  companyId?: string | null
  primaryContactId?: string | null
  opportunityId?: string | null
  cnpj?: string
  website?: string
  instagramUrl?: string
  linkedinUrl?: string
  facebookUrl?: string
  jobTitle?: string
  decisionRole?: DecisionRole
  influenceLevel?: number
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


export interface CompanyRecord {
  id: string
  workspaceId: string
  name: string
  legalName: string
  cnpj: string
  domain: string
  website: string
  segment: string
  phone: string
  city: string
  state: string
  status: 'prospect' | 'customer' | 'inactive'
  leadIds: string[]
  createdAt: string
  updatedAt: string
}

export interface ContactRecord {
  id: string
  workspaceId: string
  companyId: string | null
  name: string
  jobTitle: string
  phone: string
  email: string
  decisionRole: DecisionRole
  influenceLevel: number
  consentStatus: ConsentStatus
  doNotContact: boolean
  doNotContactReason: string
  leadIds: string[]
  createdAt: string
  updatedAt: string
}

export interface OpportunityRecord {
  id: string
  workspaceId: string
  companyId: string | null
  primaryContactId: string | null
  leadId: string
  title: string
  stageId: string
  status: LeadStatus
  value: number
  ownerId: string | null
  expectedCloseAt: string | null
  createdAt: string
  updatedAt: string
}

export interface SocialProfile {
  id: string
  workspaceId: string
  entityType: SocialEntityType
  entityId: string
  network: SocialNetwork
  username: string
  url: string
  externalId: string | null
  verified: boolean
  source: string
  confidence: number
  lastCheckedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface DataQualityIssue {
  id: string
  workspaceId: string
  category: DataQualityCategory
  severity: DataQualitySeverity
  title: string
  description: string
  leadIds: string[]
  companyId?: string | null
  contactId?: string | null
  opportunityId?: string | null
  suggestedAction: string
}

export interface CommercialStructureSyncResult {
  companiesCreated: number
  contactsCreated: number
  opportunitiesCreated: number
  socialProfilesCreated: number
  leadsLinked: number
}


export interface ProductRecord {
  id: string
  workspaceId: string
  name: string
  sku: string
  description: string
  category: string
  active: boolean
  unitPrice: number
  billingType: ProductBillingType
  billingInterval: ProductBillingInterval
  taxRate: number
  createdAt: string
  updatedAt: string
}

export interface ProposalLineItem {
  id: string
  productId: string | null
  name: string
  description: string
  quantity: number
  unitPrice: number
  discountPercent: number
  taxRate: number
  billingType: ProductBillingType
  billingInterval: ProductBillingInterval
  lineSubtotal: number
  lineDiscount: number
  lineTax: number
  lineTotal: number
  recurringMonthlyTotal: number
}

export interface ProposalRecord {
  id: string
  workspaceId: string
  proposalGroupId: string
  version: number
  proposalNumber: string
  leadId: string
  opportunityId: string | null
  companyId: string | null
  contactId: string | null
  title: string
  status: ProposalStatus
  forecastCategory: ForecastCategory
  probability: number
  currency: 'BRL'
  subtotal: number
  discountTotal: number
  taxTotal: number
  total: number
  recurringMonthlyTotal: number
  validUntil: string | null
  sentAt: string | null
  viewedAt: string | null
  acceptedAt: string | null
  rejectedAt: string | null
  ownerId: string | null
  notes: string
  terms: string
  items: ProposalLineItem[]
  createdAt: string
  updatedAt: string
}

export interface RevenueEntry {
  id: string
  workspaceId: string
  proposalId: string | null
  leadId: string | null
  opportunityId: string | null
  revenueType: RevenueType
  status: RevenueStatus
  amount: number
  recurringMonthlyAmount: number
  recognizedAt: string
  description: string
  ownerId: string | null
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


export type CommunicationChannel = 'email' | 'whatsapp' | 'calendar' | 'call' | 'meeting' | 'note' | 'system'
export type CommunicationDirection = 'inbound' | 'outbound' | 'internal'
export type CommunicationStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'received' | 'failed' | 'cancelled'
export type CommunicationEventType = 'message' | 'email' | 'calendar_event' | 'delivery_status' | 'internal_note'

export interface CommunicationEvent {
  id: string
  workspaceId: string
  leadId: string | null
  accountId: string | null
  threadId: string | null
  channel: CommunicationChannel
  direction: CommunicationDirection
  eventType: CommunicationEventType
  status: CommunicationStatus
  externalMessageId: string | null
  senderAddress: string
  recipientAddresses: string[]
  subject: string
  bodyText: string
  occurredAt: string
  metadata: Record<string, unknown>
  createdAt: string
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
  maxChainDepth: number
  loopWindowMinutes: number
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
  correlationId?: string
  durationMs?: number
  chainDepth?: number
  webhookDeliveryIds?: string[]
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
  companies: CompanyRecord[]
  contacts: ContactRecord[]
  opportunities: OpportunityRecord[]
  socialProfiles: SocialProfile[]
  products: ProductRecord[]
  proposals: ProposalRecord[]
  revenueEntries: RevenueEntry[]
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
