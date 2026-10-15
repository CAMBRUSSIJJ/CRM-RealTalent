import type {
  ActivityItem, AutomationAction, AutomationCondition, AutomationRule, AutomationRun, AutomationRunOutput, AutomationRunStatus, BuyerRoom, CalendarEvent, CalendarEventStatus, CallOutcome, CallRecord, CompanyRecord, ContactRecord, ContactRelationship, Goal, GoalMetric, Lead, OpportunityRecord, PipelineStage, Playbook, ProductRecord, ProposalLineItem, ProposalRecord, RevenueEntry, SocialProfile,
} from '../domain/types'
import type { Database } from '../lib/supabase.types'

export type LeadRow = Database['public']['Tables']['leads']['Row']
export type StageRow = Database['public']['Tables']['pipeline_stages']['Row']
export type ActivityRow = Database['public']['Tables']['activities']['Row']
export type CallRow = Database['public']['Tables']['calls']['Row']
export type EventRow = Database['public']['Tables']['calendar_events']['Row']
export type PlaybookRow = Database['public']['Tables']['playbooks']['Row']
export type GoalRow = Database['public']['Tables']['goals']['Row']
export type AutomationRuleRow = Database['public']['Tables']['automation_rules']['Row']
export type AutomationRunRow = Database['public']['Tables']['automation_runs']['Row']
export type ProductRow = Database['public']['Tables']['products']['Row']
export type ProposalRow = Database['public']['Tables']['sales_proposals']['Row']
export type ProposalItemRow = Database['public']['Tables']['sales_proposal_items']['Row']
export type RevenueRow = Database['public']['Tables']['revenue_entries']['Row']


export const mapLead = (row: LeadRow, ownerName?: string): Lead => {
  const raw = row as LeadRow & Record<string, any>
  return {
    id: row.id, workspaceId: row.organization_id, name: row.name, company: row.company, phone: row.phone, email: row.email,
    city: row.city, postalCode: row.postal_code, street: row.street, addressNumber: row.address_number, complement: row.complement, district: row.district, state: row.state, country: row.country,
    formattedAddress: row.formatted_address, latitude: row.latitude, longitude: row.longitude, geocodeStatus: row.geocode_status, geocodePrecision: row.geocode_precision,
    geocodeProvider: row.geocode_provider, geocodePlaceId: row.geocode_place_id, geocodedAt: row.geocoded_at, geocodeError: row.geocode_error,
    source: row.source, sourceDetail: raw.source_detail ?? '', sourceUrl: raw.source_url ?? '', capturedAt: raw.captured_at ?? row.created_at,
    consentStatus: raw.consent_status ?? 'unknown', doNotContact: Boolean(raw.do_not_contact), doNotContactReason: raw.do_not_contact_reason ?? '',
    companyId: raw.company_id ?? null, primaryContactId: raw.primary_contact_id ?? null, opportunityId: raw.opportunity_id ?? null,
    cnpj: raw.cnpj ?? '', website: raw.website ?? '', instagramUrl: raw.instagram_url ?? '', linkedinUrl: raw.linkedin_url ?? '', facebookUrl: raw.facebook_url ?? '',
    jobTitle: raw.job_title ?? '', decisionRole: raw.decision_role ?? 'unknown', influenceLevel: Number(raw.influence_level ?? 0),
    stageId: row.stage_id, status: row.status, temperature: row.temperature, priority: row.priority, ownerId: row.owner_id, ownerName: ownerName ?? (row.owner_id ? 'Usuário' : 'Equipe'),
    value: Number(row.value), nextActionAt: row.next_action_at, lastContactAt: row.last_contact_at, expectedCloseAt: row.expected_close_at,
    notes: row.notes, tags: row.tags ?? [], createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

export const mapCompany = (row: Record<string, any>): CompanyRecord => ({ id: row.id, workspaceId: row.organization_id, name: row.name, legalName: row.legal_name ?? '', cnpj: row.cnpj ?? '', domain: row.domain ?? '', website: row.website ?? '', segment: row.segment ?? '', phone: row.phone ?? '', city: row.city ?? '', state: row.state ?? '', status: row.status ?? 'prospect', leadIds: row.lead_ids ?? [], createdAt: row.created_at, updatedAt: row.updated_at })
export const mapContact = (row: Record<string, any>): ContactRecord => ({ id: row.id, workspaceId: row.organization_id, companyId: row.company_id, name: row.name, jobTitle: row.job_title ?? '', phone: row.phone ?? '', email: row.email ?? '', decisionRole: row.decision_role ?? 'unknown', influenceLevel: Number(row.influence_level ?? 0), relationshipStrength: row.relationship_strength ?? 'unknown', relationshipScore: Number(row.relationship_score ?? 0), stance: row.stance ?? 'unknown', relationshipOwnerId: row.relationship_owner_id ?? null, relationshipOwnerName: row.relationship_owner_name ?? '', lastContactAt: row.last_contact_at ?? null, nextActionAt: row.next_action_at ?? null, notes: row.notes ?? '', isPrimary: Boolean(row.is_primary), consentStatus: row.consent_status ?? 'unknown', doNotContact: Boolean(row.do_not_contact), doNotContactReason: row.do_not_contact_reason ?? '', leadIds: row.lead_ids ?? [], createdAt: row.created_at, updatedAt: row.updated_at })
export const mapContactRelationship = (row: Record<string, any>): ContactRelationship => ({ id: row.id, workspaceId: row.organization_id, companyId: row.company_id, fromContactId: row.from_contact_id, toContactId: row.to_contact_id, relationshipType: row.relationship_type ?? 'other', strength: Number(row.strength ?? 0), notes: row.notes ?? '', createdAt: row.created_at, updatedAt: row.updated_at })
export const mapOpportunity = (row: Record<string, any>): OpportunityRecord => ({ id: row.id, workspaceId: row.organization_id, companyId: row.company_id, primaryContactId: row.primary_contact_id, leadId: row.lead_id, title: row.title, stageId: row.stage_id, status: row.status, value: Number(row.value), ownerId: row.owner_id, expectedCloseAt: row.expected_close_at, forecastCategory: row.forecast_category ?? 'pipeline', probability: Number(row.probability ?? 0), officialProposalId: row.official_proposal_id ?? null, closedWonAt: row.closed_won_at ?? null, createdAt: row.created_at, updatedAt: row.updated_at })
export const mapSocialProfile = (row: Record<string, any>): SocialProfile => ({ id: row.id, workspaceId: row.organization_id, entityType: row.entity_type, entityId: row.entity_id, network: row.network, username: row.username ?? '', url: row.url, externalId: row.external_id, verified: Boolean(row.verified), source: row.source ?? '', confidence: Number(row.confidence ?? 0), lastCheckedAt: row.last_checked_at, createdAt: row.created_at, updatedAt: row.updated_at })

export const mapStage = (row: StageRow): PipelineStage => ({
  id: row.id, workspaceId: row.organization_id, name: row.name, order: row.stage_order, color: row.color,
  probability: row.probability, isWon: row.is_won, isLost: row.is_lost,
})

export const mapActivity = (row: ActivityRow): ActivityItem => {
  const raw = row as ActivityRow & Record<string, any>
  return {
    id: row.id, workspaceId: row.organization_id, leadId: row.lead_id, contactId: raw.contact_id ?? null, type: row.activity_type, title: row.title,
    description: row.description, dueAt: row.due_at, completedAt: row.completed_at,
    resolutionStatus: raw.resolution_status && !(raw.resolution_status === 'pending' && row.completed_at) ? raw.resolution_status : (row.completed_at ? 'completed' : 'pending'), resolutionReason: raw.resolution_reason ?? null,
    originEventKey: raw.origin_event_key ?? null, purpose: raw.purpose ?? null, assignedTo: row.assigned_to,
    sourceType: row.source_type, sourceId: row.source_id, createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

const validOutcomes: CallOutcome[] = ['answered', 'no_answer', 'busy', 'voicemail', 'callback_requested', 'interested', 'meeting_scheduled', 'proposal_requested', 'proposal_sent', 'wrong_person', 'invalid_number', 'not_interested', 'sale_completed', 'other']
export const mapCall = (row: CallRow, recordingUrl: string | null = null): CallRecord => {
  const raw = row as CallRow & Record<string, any>
  return {
  id: row.id, workspaceId: row.organization_id, leadId: row.lead_id, contactId: raw.contact_id ?? null, userId: row.user_id,
  outcome: validOutcomes.includes(row.outcome as CallOutcome) ? row.outcome as CallOutcome : 'other',
  durationSeconds: row.duration_seconds, notes: row.notes, transcript: row.transcript, recordingPath: row.recording_path,
  recordingUrl, consentAt: row.consent_at, startedAt: row.started_at, endedAt: row.ended_at, createdAt: row.created_at,
  }
}

const validEventStatuses: CalendarEventStatus[] = ['confirmed', 'tentative', 'completed', 'cancelled']
export const mapEvent = (row: EventRow): CalendarEvent => {
  const raw = row as EventRow & Record<string, any>
  return {
  id: row.id, workspaceId: row.organization_id, leadId: row.lead_id, contactId: raw.contact_id ?? null, title: row.title, description: row.description,
  startsAt: row.starts_at, endsAt: row.ends_at, allDay: row.all_day, location: row.location,
  status: validEventStatuses.includes(row.status as CalendarEventStatus) ? row.status as CalendarEventStatus : 'confirmed',
  assignedTo: row.assigned_to, createdAt: row.created_at, updatedAt: row.updated_at,
  }
}



export const mapPlaybook = (row: PlaybookRow): Playbook => ({
  id: row.id, workspaceId: row.organization_id, kind: row.kind, title: row.title, category: row.category,
  content: row.content, tags: row.tags ?? [], guidance: (row.guidance && typeof row.guidance === 'object' && !Array.isArray(row.guidance) ? row.guidance : {}) as Playbook['guidance'], active: row.active, createdAt: row.created_at, updatedAt: row.updated_at,
})

const validGoalMetrics: GoalMetric[] = ['calls', 'contacts', 'followups', 'meetings', 'proposals', 'wins', 'revenue', 'new_leads']
export const mapGoal = (row: GoalRow): Goal => ({
  id: row.id, workspaceId: row.organization_id, scope: (row.scope === 'team' || row.scope === 'user' ? row.scope : row.user_id ? 'user' : 'workspace'), teamId: row.team_id ?? null, teamName: row.team_name ?? '', userId: row.user_id, userName: row.user_id ? 'Usuário' : (row.team_name || 'Workspace'),
  metric: validGoalMetrics.includes(row.metric as GoalMetric) ? row.metric as GoalMetric : 'calls', targetValue: Number(row.target_value),
  periodStart: row.period_start, periodEnd: row.period_end, createdAt: row.created_at, updatedAt: row.updated_at,
})

export const mapAutomationRule = (row: AutomationRuleRow): AutomationRule => ({
  id: row.id, workspaceId: row.organization_id, name: row.name, enabled: row.enabled,
  triggerType: row.trigger_type as AutomationRule['triggerType'], conditions: (Array.isArray(row.conditions) ? row.conditions : []) as unknown as AutomationCondition[],
  actions: (Array.isArray(row.actions) ? row.actions : []) as unknown as AutomationAction[], createdBy: row.created_by,
  createdAt: row.created_at, updatedAt: row.updated_at,
})


export const mapProduct = (row: ProductRow): ProductRecord => ({
  id: row.id, workspaceId: row.organization_id, name: row.name, sku: row.sku, description: row.description, category: row.category,
  active: row.active, unitPrice: Number(row.unit_price), unitCost: Number(row.unit_cost ?? 0), kind: row.product_kind ?? 'service', commercialType: (row.commercial_type ?? undefined) as ProductRecord['commercialType'],
  unitLabel: row.unit_label ?? 'unidade', defaultDiscountPercent: Number(row.default_discount_percent ?? 0), maxDiscountPercent: Number(row.max_discount_percent ?? 20), minMarginPercent: Number(row.min_margin_percent ?? 0), valueProposition: row.value_proposition ?? '', targetCustomer: row.target_customer ?? '', salesNotes: row.sales_notes ?? '', pricingMode: row.pricing_mode ?? 'fixed', lifecycleStatus: row.lifecycle_status ?? (row.active ? 'active' : 'archived'), salesProblems: Array.isArray(row.sales_problems) ? row.sales_problems as string[] : [], salesBenefits: Array.isArray(row.sales_benefits) ? row.sales_benefits as string[] : [], discoveryQuestions: Array.isArray(row.discovery_questions) ? row.discovery_questions as string[] : [], objectionNotes: Array.isArray(row.objection_notes) ? row.objection_notes as string[] : [], salesProofs: Array.isArray(row.sales_proofs) ? row.sales_proofs as string[] : [], competitors: Array.isArray(row.competitors) ? row.competitors as string[] : [], bundleItems: Array.isArray(row.bundle_items) ? row.bundle_items as Array<{ productId: string; quantity: number }> : [], billingType: row.billing_type, billingInterval: row.billing_interval,
  taxRate: Number(row.tax_rate), createdAt: row.created_at, updatedAt: row.updated_at,
})

export const mapProposalItem = (row: ProposalItemRow): ProposalLineItem => ({
  id: row.id, productId: row.product_id, name: row.name, description: row.description, quantity: Number(row.quantity),
  unitPrice: Number(row.unit_price), discountPercent: Number(row.discount_percent), taxRate: Number(row.tax_rate),
  billingType: row.billing_type, billingInterval: row.billing_interval, lineSubtotal: Number(row.line_subtotal),
  lineDiscount: Number(row.line_discount), lineTax: Number(row.line_tax), lineTotal: Number(row.line_total),
  recurringMonthlyTotal: Number(row.recurring_monthly_total),
  pricingSource: row.pricing_source ?? (row.product_id ? 'catalog' : 'manual'), catalogUnitPrice: row.catalog_unit_price === null ? undefined : Number(row.catalog_unit_price),
  unitCostSnapshot: row.unit_cost_snapshot === null ? undefined : Number(row.unit_cost_snapshot), catalogDiscountPercent: row.catalog_discount_percent === null ? undefined : Number(row.catalog_discount_percent),
  pricingOverridden: Boolean(row.pricing_overridden),
})

export const mapProposal = (row: ProposalRow, items: ProposalLineItem[]): ProposalRecord => ({
  id: row.id, workspaceId: row.organization_id, proposalGroupId: row.proposal_group_id, version: row.version,
  proposalNumber: row.proposal_number, leadId: row.lead_id, opportunityId: row.opportunity_id, companyId: row.company_id,
  contactId: row.contact_id, title: row.title, status: row.status, forecastCategory: row.forecast_category,
  probability: Number(row.probability), currency: row.currency, subtotal: Number(row.subtotal), discountTotal: Number(row.discount_total),
  taxTotal: Number(row.tax_total), total: Number(row.total), recurringMonthlyTotal: Number(row.recurring_monthly_total),
  oneTimeTotal: Number(row.one_time_total ?? 0), annualRecurringTotal: Number(row.annual_recurring_total ?? 0), totalContractValue: Number(row.total_contract_value ?? row.total ?? 0),
  isOfficial: Boolean(row.is_official), isCurrentVersion: row.is_current_version !== false, supersededById: row.superseded_by_id ?? null,
  expectedCloseAt: row.expected_close_at ?? null, contractStartAt: row.contract_start_at ?? null, contractEndAt: row.contract_end_at ?? null,
  contractTermMonths: Number(row.contract_term_months ?? 12), autoRenew: Boolean(row.auto_renew), postSaleStartAt: row.post_sale_start_at ?? null,
  postSaleCadenceName: row.post_sale_cadence_name ?? 'Onboarding padrão', closedWonAt: row.closed_won_at ?? null,
  validUntil: row.valid_until, sentAt: row.sent_at, viewedAt: row.viewed_at, acceptedAt: row.accepted_at,
  rejectedAt: row.rejected_at, ownerId: row.owner_id, notes: row.notes, terms: row.terms, items,
  createdAt: row.created_at, updatedAt: row.updated_at,
})


export const mapBuyerRoom = (row: Record<string, any>): BuyerRoom => ({
  id: row.id, workspaceId: row.organization_id, leadId: row.lead_id, opportunityId: row.opportunity_id ?? null, proposalId: row.proposal_id, companyId: row.company_id ?? null,
  title: row.title ?? 'Sala de fechamento', welcomeMessage: row.welcome_message ?? '', status: row.status ?? 'draft', shareToken: row.share_token, shareEnabled: Boolean(row.share_enabled),
  expiresAt: row.expires_at ?? null, lastOpenedAt: row.last_opened_at ?? null, viewCount: Number(row.view_count ?? 0),
  participants: Array.isArray(row.participants) ? row.participants : [], steps: Array.isArray(row.steps) ? row.steps : [], documents: Array.isArray(row.documents) ? row.documents : [], activity: Array.isArray(row.activity) ? row.activity : [],
  createdAt: row.created_at, updatedAt: row.updated_at,
})

export const mapRevenueEntry = (row: RevenueRow): RevenueEntry => ({
  id: row.id, workspaceId: row.organization_id, proposalId: row.proposal_id, leadId: row.lead_id,
  opportunityId: row.opportunity_id, revenueType: row.revenue_type, status: row.status, amount: Number(row.amount),
  recurringMonthlyAmount: Number(row.recurring_monthly_amount), recognizedAt: row.recognized_at, competenceDate: row.competence_date ?? row.recognized_at.slice(0, 10),
  servicePeriodStart: row.service_period_start ?? null, servicePeriodEnd: row.service_period_end ?? null, adjustmentReason: row.adjustment_reason ?? '', description: row.description,
  ownerId: row.owner_id, source: row.source ?? 'manual', scheduleKey: row.schedule_key ?? null, installmentIndex: row.installment_index ?? null, installmentCount: row.installment_count ?? null, createdAt: row.created_at, updatedAt: row.updated_at,
})

export const mapAutomationRun = (row: AutomationRunRow): AutomationRun => ({
  id: row.id, workspaceId: row.organization_id, ruleId: row.rule_id, eventKey: row.event_key,
  status: row.status as AutomationRunStatus, input: (row.input ?? {}) as unknown as Record<string, unknown>,
  output: (row.output ?? {}) as unknown as AutomationRunOutput, errorMessage: row.error_message,
  startedAt: row.started_at, finishedAt: row.finished_at,
})

export const recordingExtension = (type: string) => type.includes('ogg') ? 'ogg' : type.includes('mpeg') ? 'mp3' : type.includes('wav') ? 'wav' : 'webm'

