export type AppRoute =
  | 'dashboard'
  | 'leads'
  | 'commercial-map'
  | 'pipeline'
  | 'tasks'
  | 'teams'
  | 'followups'
  | 'calls'
  | 'communications'
  | 'proposals'
  | 'agenda'
  | 'meet'
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
export type ActivityResolutionStatus = 'pending' | 'completed' | 'cancelled' | 'superseded'
export type CallOutcome = 'answered' | 'no_answer' | 'busy' | 'voicemail' | 'callback_requested' | 'interested' | 'meeting_scheduled' | 'proposal_requested' | 'proposal_sent' | 'wrong_person' | 'invalid_number' | 'not_interested' | 'sale_completed' | 'other'
export type CalendarEventStatus = 'confirmed' | 'tentative' | 'completed' | 'cancelled'
export type PlaybookKind = 'script' | 'objection' | 'battlecard' | 'checklist'
export type PlaybookObjective = 'first_meeting' | 'identify_decision_maker' | 'qualify' | 'proposal_followup' | 'recover_opportunity'
export type PlaybookExecutionMode = 'step_by_step' | 'checklist' | 'call' | 'meeting'
export type DecisionRole = 'decision_maker' | 'economic_buyer' | 'champion' | 'influencer' | 'technical_evaluator' | 'finance' | 'procurement' | 'gatekeeper' | 'blocker' | 'user' | 'operational' | 'unknown'
export type RelationshipStrength = 'unknown' | 'weak' | 'developing' | 'strong' | 'trusted'
export type StakeholderStance = 'unknown' | 'supportive' | 'neutral' | 'opposed'
export type ContactRelationshipType = 'reports_to' | 'partner' | 'co_owner' | 'referred_by' | 'works_with' | 'influences' | 'other'
export type ConsentStatus = 'unknown' | 'legitimate_interest' | 'consented' | 'opted_out'
export type SocialNetwork = 'instagram' | 'linkedin' | 'facebook' | 'whatsapp' | 'website' | 'google_business' | 'other'
export type SocialEntityType = 'company' | 'contact'
export type DataQualitySeverity = 'critical' | 'high' | 'medium' | 'low'
export type DataQualityCategory = 'duplicate' | 'identity' | 'contact' | 'origin' | 'consent' | 'social' | 'opportunity' | 'location'


export type ProductBillingType = 'one_time' | 'recurring'
export type ProductBillingInterval = 'month' | 'quarter' | 'year' | null
export type ProductPricingMode = 'fixed' | 'from' | 'quote' | 'free' | 'custom'
export type ProductLifecycleStatus = 'draft' | 'ready' | 'active' | 'archived'
export type ProductCommercialType = 'software' | 'service' | 'subscription' | 'license' | 'addon' | 'bundle' | 'training' | 'consulting' | 'implementation' | 'support' | 'other'
export type RevenueSource = 'manual' | 'proposal_schedule'
export type ProposalStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'expired' | 'cancelled'
export type ForecastCategory = 'pipeline' | 'best_case' | 'commit' | 'closed' | 'omitted'
export type RevenueType = 'one_time' | 'recurring'
export type RevenueStatus = 'forecast' | 'recognized' | 'cancelled'
export type ProposalRole = 'official' | 'alternative'
export type BuyerRoomStatus = 'draft' | 'shared' | 'active' | 'completed' | 'archived'
export type BuyerRoomStepStatus = 'pending' | 'in_progress' | 'completed' | 'blocked'
export type BuyerRoomStepOwner = 'seller' | 'buyer' | 'shared'
export type BuyerRoomDocumentKind = 'proposal' | 'document' | 'link'
export type BuyerRoomActivityType = 'created' | 'shared' | 'opened' | 'step_updated' | 'document_opened' | 'comment' | 'status_changed' | 'token_rotated'

export type GoalMetric = 'calls' | 'contacts' | 'followups' | 'meetings' | 'proposals' | 'wins' | 'revenue' | 'new_leads'
export type GoalScope = 'workspace' | 'team' | 'user'
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
  | 'wait'
  | 'branch_if'
export type AutomationRunStatus = 'running' | 'success' | 'failed' | 'undone'
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'completed' | 'cancelled'
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'
export type TaskRelationEntity = 'contact' | 'company' | 'opportunity' | 'lead' | 'pipeline' | 'playbook' | 'meeting'
export type TaskRecurrence = 'none' | 'daily' | 'weekly' | 'monthly'

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

export interface Team {
  id: string
  workspaceId: string
  name: string
  description: string
  leaderId: string | null
  color: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface TeamMembership {
  id: string
  workspaceId: string
  teamId: string
  userId: string
  role: 'leader' | 'member'
  allocationPercent: number
  createdAt: string
}

export type TeamAccessScope = 'none' | 'own' | 'team' | 'all'
export type TeamAccessAction = 'view' | 'create' | 'edit' | 'delete' | 'export' | 'assign' | 'approve'
export type TeamAccessResource = 'contacts' | 'pipeline' | 'tasks' | 'communications' | 'proposals' | 'prospecting' | 'goals' | 'settings'

export type TeamSensitiveField = 'contact_phone' | 'contact_email' | 'deal_value' | 'proposal_discount' | 'proposal_margin' | 'proposal_cost' | 'proposal_total' | 'revenue_amount'
export type TeamFieldAccessLevel = 'hidden' | 'view' | 'edit'

export interface TeamApprovalPolicy {
  proposalDiscountPercent: number | null
  proposalMinMarginPercent: number | null
  proposalTotalValue: number | null
  exportRequiresApproval: boolean
}

export type TeamApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type TeamApprovalKind = 'proposal_policy' | 'data_export'

export interface TeamApprovalRequest {
  id: string
  workspaceId: string
  requesterId: string | null
  requesterName: string
  approverId: string | null
  approverName: string
  resource: TeamAccessResource
  kind: TeamApprovalKind
  entityType: string
  entityId: string | null
  reason: string
  payload: Record<string, unknown>
  status: TeamApprovalStatus
  decidedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface TeamAccessRule {
  resource: TeamAccessResource
  scope: TeamAccessScope
  actions: TeamAccessAction[]
}

export interface TeamAccessProfile {
  id: string
  workspaceId: string
  name: string
  description: string
  systemKey: 'administrator' | 'manager' | 'seller' | 'sdr' | 'viewer' | null
  isSystem: boolean
  rules: TeamAccessRule[]
  fieldAccess: Record<TeamSensitiveField, TeamFieldAccessLevel>
  approvalPolicy: TeamApprovalPolicy
  createdAt: string
  updatedAt: string
}

export interface MemberAccessAssignment {
  workspaceId: string
  userId: string
  profileId: string
  updatedAt: string
}

export interface WorkTask {
  id: string
  workspaceId: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  startsAt: string | null
  dueAt: string | null
  completedAt: string | null
  assigneeId: string | null
  assigneeName: string
  teamId: string | null
  recurrence: TaskRecurrence
  tags: string[]
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface TaskRelation {
  id: string
  workspaceId: string
  taskId: string
  entityType: TaskRelationEntity
  entityId: string
  entityLabel: string
  createdAt: string
}

export interface TaskChecklistItem {
  id: string
  workspaceId: string
  taskId: string
  title: string
  completed: boolean
  position: number
  createdAt: string
  updatedAt: string
}

export interface TaskComment {
  id: string
  workspaceId: string
  taskId: string
  authorId: string | null
  authorName: string
  body: string
  createdAt: string
  updatedAt: string
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
  relationshipStrength?: RelationshipStrength
  relationshipScore?: number
  stance?: StakeholderStance
  relationshipOwnerId?: string | null
  relationshipOwnerName?: string
  lastContactAt?: string | null
  nextActionAt?: string | null
  notes?: string
  isPrimary?: boolean
  consentStatus: ConsentStatus
  doNotContact: boolean
  doNotContactReason: string
  leadIds: string[]
  createdAt: string
  updatedAt: string
}

export interface ContactRelationship {
  id: string
  workspaceId: string
  companyId: string
  fromContactId: string
  toContactId: string
  relationshipType: ContactRelationshipType
  strength: number
  notes: string
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
  forecastCategory?: ForecastCategory
  probability?: number
  officialProposalId?: string | null
  closedWonAt?: string | null
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
  /** V100.97 — custo unitário para leitura de margem. Opcional para preservar workspaces antigos. */
  unitCost?: number
  /** Produto físico/digital ou serviço. */
  kind?: 'product' | 'service'
  /** Classificação comercial controlada para filtros, ofertas e analytics. */
  commercialType?: ProductCommercialType
  /** Unidade comercial exibida em propostas (unidade, licença, hora, projeto...). */
  unitLabel?: string
  /** Desconto padrão sugerido ao inserir o item em uma proposta. */
  defaultDiscountPercent?: number
  /** Limite comercial recomendado; acima dele a proposta pede revisão/aprovação. */
  maxDiscountPercent?: number
  /** Margem bruta comercial mínima recomendada para negociação. */
  minMarginPercent?: number
  /** Proposta de valor usada por vendedor, Playbook e Product Studio. */
  valueProposition?: string
  /** Perfil de cliente ideal / público principal do produto. */
  targetCustomer?: string
  /** Conhecimento comercial livre legado; mantido para compatibilidade. */
  salesNotes?: string
  /** Como o preço deve ser interpretado no catálogo. */
  pricingMode?: ProductPricingMode
  /** Ciclo de vida comercial independente da existência do registro. */
  lifecycleStatus?: ProductLifecycleStatus
  /** Conhecimento estruturado consumido por Playbook, Calling e Product Studio. */
  salesProblems?: string[]
  salesBenefits?: string[]
  discoveryQuestions?: string[]
  objectionNotes?: string[]
  salesProofs?: string[]
  competitors?: string[]
  /** Oferta reutilizável: componentes do catálogo e respectivas quantidades. */
  bundleItems?: Array<{ productId: string; quantity: number }>
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
  /** Origem comercial do preço desta linha. */
  pricingSource?: 'catalog' | 'manual'
  /** Preço de tabela capturado quando o produto foi inserido. */
  catalogUnitPrice?: number
  /** Custo unitário capturado no momento da proposta. */
  unitCostSnapshot?: number
  /** Desconto padrão capturado do catálogo. */
  catalogDiscountPercent?: number
  /** Verdadeiro quando preço/cobrança/desconto divergem do snapshot do catálogo. */
  pricingOverridden?: boolean
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
  oneTimeTotal: number
  annualRecurringTotal: number
  totalContractValue: number
  isOfficial: boolean
  isCurrentVersion: boolean
  supersededById: string | null
  expectedCloseAt: string | null
  contractStartAt: string | null
  contractEndAt: string | null
  contractTermMonths: number
  autoRenew: boolean
  postSaleStartAt: string | null
  postSaleCadenceName: string
  closedWonAt: string | null
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


export interface BuyerRoomParticipant {
  id: string
  contactId: string | null
  name: string
  email: string
  jobTitle: string
  decisionRole: DecisionRole | 'seller'
  side: 'seller' | 'buyer'
  required: boolean
  acknowledgedAt: string | null
}

export interface BuyerRoomStep {
  id: string
  title: string
  description: string
  owner: BuyerRoomStepOwner
  ownerContactId: string | null
  dueAt: string | null
  status: BuyerRoomStepStatus
  completedAt: string | null
  order: number
}

export interface BuyerRoomDocument {
  id: string
  kind: BuyerRoomDocumentKind
  title: string
  url: string
  proposalId: string | null
  visible: boolean
  addedAt: string
}

export interface BuyerRoomActivity {
  id: string
  type: BuyerRoomActivityType
  actorName: string
  description: string
  occurredAt: string
  metadata: Record<string, string | number | boolean | null>
}

export interface BuyerRoom {
  id: string
  workspaceId: string
  leadId: string
  opportunityId: string | null
  proposalId: string
  companyId: string | null
  title: string
  welcomeMessage: string
  status: BuyerRoomStatus
  shareToken: string
  shareEnabled: boolean
  expiresAt: string | null
  lastOpenedAt: string | null
  viewCount: number
  participants: BuyerRoomParticipant[]
  steps: BuyerRoomStep[]
  documents: BuyerRoomDocument[]
  activity: BuyerRoomActivity[]
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
  competenceDate: string
  servicePeriodStart: string | null
  servicePeriodEnd: string | null
  adjustmentReason: string
  description: string
  ownerId: string | null
  /** Origem do lançamento: manual ou plano de receita gerado pela proposta. */
  source?: RevenueSource
  /** Chave idempotente de uma competência gerada automaticamente. */
  scheduleKey?: string | null
  installmentIndex?: number | null
  installmentCount?: number | null
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


export type CommunicationChannel = 'email' | 'whatsapp' | 'instagram' | 'facebook' | 'linkedin' | 'calendar' | 'call' | 'meeting' | 'note' | 'system'
export type CommunicationDirection = 'inbound' | 'outbound' | 'internal'
export type CommunicationStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'received' | 'failed' | 'cancelled'
export type CommunicationEventType = 'message' | 'email' | 'calendar_event' | 'delivery_status' | 'internal_note'

export interface CommunicationEvent {
  id: string
  workspaceId: string
  leadId: string | null
  contactId?: string | null
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
  bodyHtml: string
  internetMessageId: string | null
  replyToExternalMessageId: string | null
  hasAttachments: boolean
  occurredAt: string
  metadata: Record<string, unknown>
  createdAt: string
}

export interface ActivityItem {
  id: string
  workspaceId: string
  leadId: string | null
  contactId?: string | null
  type: ActivityType
  title: string
  description: string
  dueAt: string | null
  completedAt: string | null
  resolutionStatus?: ActivityResolutionStatus
  resolutionReason?: string | null
  originEventKey?: string | null
  purpose?: string | null
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
  contactId?: string | null
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
  contactId?: string | null
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

export type PlaybookConversationNodeType = 'stage' | 'statement' | 'question' | 'decision' | 'objection' | 'action' | 'outcome' | 'note'
export type PlaybookConversationNodeColor = 'blue' | 'sky' | 'violet' | 'amber' | 'rose' | 'slate'

export interface PlaybookConversationNode {
  id: string
  type: PlaybookConversationNodeType
  title: string
  content: string
  objective?: string
  x: number
  y: number
  groupId?: string
  color?: PlaybookConversationNodeColor
}

export interface PlaybookConversationGroup {
  id: string
  title: string
  x: number
  y: number
  width: number
  height: number
}

export interface PlaybookConversationEdge {
  id: string
  sourceId: string
  targetId: string
  label?: string
}

export interface PlaybookConversationGraph {
  version: 1
  rootNodeId: string
  nodes: PlaybookConversationNode[]
  edges: PlaybookConversationEdge[]
  groups?: PlaybookConversationGroup[]
  defaultView?: 'map' | 'structure' | 'script' | 'execution'
}

export interface PlaybookGuidance {
  objectives?: PlaybookObjective[]
  stageIds?: string[]
  decisionRoles?: DecisionRole[]
  outcomes?: CallOutcome[]
  temperatures?: LeadTemperature[]
  coachingFocus?: string
  successCriteria?: string[]
  avoidPhrases?: string[]
  executionModes?: PlaybookExecutionMode[]
  segments?: string[]
  personas?: string[]
  discoveryQuestions?: string[]
  objectionPrompts?: string[]
  meetingAgenda?: string[]
  conversationGraph?: PlaybookConversationGraph
}

export interface Playbook {
  id: string
  workspaceId: string
  kind: PlaybookKind
  title: string
  category: string
  content: string
  tags: string[]
  guidance?: PlaybookGuidance
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface Goal {
  id: string
  workspaceId: string
  /** Escopo canônico da meta. Metas legadas sem scope são inferidas pelo userId. */
  scope?: GoalScope
  teamId?: string | null
  teamName?: string
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
  delayMinutes?: number
  durationMinutes?: number
  branchField?: Exclude<AutomationConditionField, 'automation_guard'>
  branchOperator?: AutomationConditionOperator
  branchValue?: string
  branchSkip?: number
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
  before?: Partial<Pick<Lead, 'tags' | 'priority' | 'temperature' | 'stageId' | 'status' | 'ownerId' | 'ownerName'>> & { completedAt?: string | null; resolutionStatus?: ActivityResolutionStatus; resolutionReason?: string | null }
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
  contactRelationships: ContactRelationship[]
  opportunities: OpportunityRecord[]
  socialProfiles: SocialProfile[]
  products: ProductRecord[]
  proposals: ProposalRecord[]
  buyerRooms?: BuyerRoom[]
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
