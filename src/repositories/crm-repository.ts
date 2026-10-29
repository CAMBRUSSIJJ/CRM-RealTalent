import type {
  ActivityItem, AutomationRule, AutomationRun, AutomationRunOutput, AutomationRunStatus, BuyerRoom, BuyerRoomActivity, CalendarEvent, CommercialStructureSyncResult, CompanyRecord, ContactRecord, ContactRelationship, DashboardStats,
  AuditLog, Goal, Lead, OpportunityRecord, PipelineStage, Playbook, ProductRecord, ProposalRecord, ProposalStatus, RevenueEntry, RepositoryHealth, SocialProfile, Workspace, WorkspaceInvite, WorkspaceMember, WorkspaceRole, WorkspaceSnapshot,
} from '../domain/types'

export interface NewWorkspaceMemberInput { displayName: string; email?: string; role?: Exclude<WorkspaceRole, 'owner'> }
export type NewLeadInput = Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>
export type NewCompanyInput = Omit<CompanyRecord, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateCompanyInput = Partial<Omit<CompanyRecord, 'id' | 'workspaceId' | 'createdAt' | 'updatedAt'>>
export type NewContactInput = Omit<ContactRecord, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateContactInput = Partial<Omit<ContactRecord, 'id' | 'workspaceId' | 'createdAt' | 'updatedAt'>>
export type NewContactRelationshipInput = Omit<ContactRelationship, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateContactRelationshipInput = Partial<Pick<ContactRelationship, 'fromContactId' | 'toContactId' | 'relationshipType' | 'strength' | 'notes'>>
export type UpdateLeadInput = Partial<Omit<Lead, 'id' | 'workspaceId' | 'createdAt' | 'updatedAt'>>
export type NewStageInput = Omit<PipelineStage, 'id' | 'order'> & { order?: number }
export type UpdateStageInput = Partial<Pick<PipelineStage, 'name' | 'color' | 'probability' | 'isWon' | 'isLost' | 'order'>>
export type NewActivityInput = Omit<ActivityItem, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateActivityInput = Partial<Pick<ActivityItem, 'leadId' | 'contactId' | 'type' | 'title' | 'description' | 'dueAt' | 'completedAt' | 'resolutionStatus' | 'resolutionReason' | 'originEventKey' | 'purpose' | 'assignedTo'>>
export type NewCallInput = Omit<import('../domain/types').CallRecord, 'id' | 'createdAt' | 'recordingUrl'>
export interface RegisterCallOutcomeInput extends NewCallInput {
  scheduleNext: boolean
  nextAt: string | null
  meetingDurationMinutes?: number
}
export interface CommercialActionResult {
  call: import('../domain/types').CallRecord
  lead: Lead
  activityId: string
  nextActivityId: string | null
  calendarEventId: string | null
  idempotent: boolean
}
export type CommercialActivityOutcome = 'answered' | 'no_response' | 'callback_requested' | 'interested' | 'proposal_requested' | 'meeting_scheduled' | 'not_decision_maker' | 'invalid_contact' | 'not_interested' | 'won' | 'lost'
export interface RegisterActivityOutcomeInput {
  workspaceId: string
  userId: string | null
  activityId: string
  outcome: CommercialActivityOutcome
  resultTitle: string
  resultDescription: string
  createNext: boolean
  nextType: ActivityItem['type'] | null
  nextTitle: string | null
  nextDescription: string | null
  nextAt: string | null
  stageId: string | null
}
export interface CommercialActivityResult {
  activity: ActivityItem
  lead: Lead
  resultActivityId: string
  nextActivityId: string | null
  idempotent: boolean
}
export type NewCalendarEventInput = Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateCalendarEventInput = Partial<Omit<CalendarEvent, 'id' | 'workspaceId' | 'createdAt' | 'updatedAt'>>
export type NewPlaybookInput = Omit<Playbook, 'id' | 'createdAt' | 'updatedAt'>
export type UpdatePlaybookInput = Partial<Pick<Playbook, 'kind' | 'title' | 'category' | 'content' | 'tags' | 'guidance' | 'active'>>

export type NewProductInput = Omit<ProductRecord, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateProductInput = Partial<Omit<ProductRecord, 'id' | 'workspaceId' | 'createdAt' | 'updatedAt'>>
export type NewProposalInput = Omit<ProposalRecord, 'id' | 'proposalGroupId' | 'version' | 'proposalNumber' | 'createdAt' | 'updatedAt' | 'sentAt' | 'viewedAt' | 'acceptedAt' | 'rejectedAt' | 'closedWonAt' | 'supersededById'> & { proposalGroupId?: string; version?: number; proposalNumber?: string; closedWonAt?: string | null; supersededById?: string | null }
export type UpdateProposalInput = Partial<Pick<ProposalRecord, 'title' | 'status' | 'forecastCategory' | 'probability' | 'validUntil' | 'expectedCloseAt' | 'contractStartAt' | 'contractEndAt' | 'contractTermMonths' | 'autoRenew' | 'postSaleStartAt' | 'postSaleCadenceName' | 'notes' | 'terms' | 'items'>>
export type NewRevenueEntryInput = Omit<RevenueEntry, 'id' | 'createdAt' | 'updatedAt'>
export type NewBuyerRoomInput = Omit<BuyerRoom, 'id' | 'createdAt' | 'updatedAt' | 'viewCount' | 'lastOpenedAt' | 'activity'> & { activity?: BuyerRoomActivity[] }
export type UpdateBuyerRoomInput = Partial<Pick<BuyerRoom, 'leadId' | 'opportunityId' | 'proposalId' | 'companyId' | 'title' | 'welcomeMessage' | 'status' | 'shareEnabled' | 'expiresAt' | 'participants' | 'steps' | 'documents'>>

export type NewGoalInput = Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateGoalInput = Partial<Pick<Goal, 'scope' | 'teamId' | 'teamName' | 'userId' | 'userName' | 'metric' | 'targetValue' | 'periodStart' | 'periodEnd'>>
export type NewAutomationRuleInput = Omit<AutomationRule, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateAutomationRuleInput = Partial<Pick<AutomationRule, 'name' | 'enabled' | 'triggerType' | 'conditions' | 'actions'>>
export interface NewAutomationRunInput {
  workspaceId: string
  ruleId: string | null
  eventKey: string
  input: Record<string, unknown>
}

export interface OperationalDataClearResult { cleared: boolean; total: number }

export interface CrmRepository {
  readonly mode: 'local' | 'supabase'
  initialize(): Promise<void>
  health(): Promise<RepositoryHealth>
  listWorkspaces(): Promise<Workspace[]>
  createWorkspace(name: string): Promise<Workspace>
  listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]>
  createWorkspaceMember(workspaceId: string, input: NewWorkspaceMemberInput): Promise<WorkspaceMember>
  createWorkspaceInvite(workspaceId: string, email: string, role: Exclude<WorkspaceRole, 'owner'>): Promise<WorkspaceInvite>
  listWorkspaceInvites(workspaceId: string): Promise<WorkspaceInvite[]>
  revokeWorkspaceInvite(inviteId: string): Promise<void>
  acceptWorkspaceInvite(token: string): Promise<Workspace>
  updateWorkspaceMemberRole(workspaceId: string, userId: string, role: Exclude<WorkspaceRole, 'owner'>): Promise<void>
  removeWorkspaceMember(workspaceId: string, userId: string): Promise<void>
  listAuditLogs(workspaceId: string, limit?: number): Promise<AuditLog[]>
  exportWorkspace(workspaceId: string): Promise<Record<string, unknown>>
  clearOperationalData(workspaceId: string): Promise<OperationalDataClearResult>
  getSnapshot(workspaceId: string): Promise<WorkspaceSnapshot>
  synchronizeCommercialStructure(workspaceId: string): Promise<CommercialStructureSyncResult>
  listLeads(workspaceId: string): Promise<Lead[]>
  listCompanies(workspaceId: string): Promise<CompanyRecord[]>
  createCompany(input: NewCompanyInput): Promise<CompanyRecord>
  updateCompany(companyId: string, input: UpdateCompanyInput): Promise<CompanyRecord>
  listContacts(workspaceId: string): Promise<ContactRecord[]>
  listContactRelationships(workspaceId: string): Promise<ContactRelationship[]>
  createContact(input: NewContactInput): Promise<ContactRecord>
  updateContact(contactId: string, input: UpdateContactInput): Promise<ContactRecord>
  deleteContact(contactId: string): Promise<void>
  createContactRelationship(input: NewContactRelationshipInput): Promise<ContactRelationship>
  updateContactRelationship(relationshipId: string, input: UpdateContactRelationshipInput): Promise<ContactRelationship>
  deleteContactRelationship(relationshipId: string): Promise<void>
  listOpportunities(workspaceId: string): Promise<OpportunityRecord[]>
  listSocialProfiles(workspaceId: string): Promise<SocialProfile[]>
  createLead(input: NewLeadInput): Promise<Lead>
  updateLead(leadId: string, input: UpdateLeadInput): Promise<Lead>
  moveLead(leadId: string, stageId: string, lossReason?: string | null): Promise<Lead>
  bulkMoveLeads(workspaceId: string, leadIds: string[], stageId: string, lossReason?: string | null): Promise<Lead[]>
  mergeLeads(workspaceId: string, primaryLeadId: string, duplicateLeadId: string): Promise<Lead>
  deleteLead(leadId: string): Promise<void>
  bulkUpdateLeads(workspaceId: string, leadIds: string[], input: UpdateLeadInput): Promise<number>
  bulkAddLeadTag(workspaceId: string, leadIds: string[], tag: string): Promise<number>
  bulkDeleteLeads(workspaceId: string, leadIds: string[]): Promise<number>
  listStages(workspaceId: string): Promise<PipelineStage[]>
  createStage(input: NewStageInput): Promise<PipelineStage>
  updateStage(stageId: string, input: UpdateStageInput): Promise<PipelineStage>
  deleteStage(stageId: string): Promise<void>
  listActivities(workspaceId: string): Promise<ActivityItem[]>
  createActivity(input: NewActivityInput): Promise<ActivityItem>
  createActivities(inputs: NewActivityInput[]): Promise<ActivityItem[]>
  updateActivity(activityId: string, input: UpdateActivityInput): Promise<ActivityItem>
  deleteActivity(activityId: string): Promise<void>
  completeActivity(activityId: string, completed: boolean): Promise<ActivityItem>
  registerActivityOutcome(input: RegisterActivityOutcomeInput): Promise<CommercialActivityResult>
  listCalls(workspaceId: string): Promise<import('../domain/types').CallRecord[]>
  listCallsPage(workspaceId: string, beforeStartedAt?: string | null, limit?: number): Promise<import('../domain/types').CallRecord[]>
  getCallRecordingUrl(callId: string): Promise<string | null>
  createCall(input: NewCallInput, recording?: Blob | null): Promise<import('../domain/types').CallRecord>
  registerCallOutcome(input: RegisterCallOutcomeInput, recording?: Blob | null): Promise<CommercialActionResult>
  deleteCall(callId: string): Promise<void>
  listCalendarEvents(workspaceId: string): Promise<CalendarEvent[]>
  createCalendarEvent(input: NewCalendarEventInput): Promise<CalendarEvent>
  updateCalendarEvent(eventId: string, input: UpdateCalendarEventInput): Promise<CalendarEvent>
  deleteCalendarEvent(eventId: string): Promise<void>
  listPlaybooks(workspaceId: string): Promise<Playbook[]>
  createPlaybook(input: NewPlaybookInput): Promise<Playbook>
  updatePlaybook(playbookId: string, input: UpdatePlaybookInput): Promise<Playbook>
  deletePlaybook(playbookId: string): Promise<void>

  listProducts(workspaceId: string): Promise<ProductRecord[]>
  createProduct(input: NewProductInput): Promise<ProductRecord>
  updateProduct(productId: string, input: UpdateProductInput): Promise<ProductRecord>
  reconcileProposalItems(workspaceId: string, legacyName: string, productId: string): Promise<number>
  deleteProduct(productId: string): Promise<void>
  listProposals(workspaceId: string): Promise<ProposalRecord[]>
  createProposal(input: NewProposalInput): Promise<ProposalRecord>
  updateProposal(proposalId: string, input: UpdateProposalInput): Promise<ProposalRecord>
  createProposalRevision(proposalId: string): Promise<ProposalRecord>
  updateProposalStatus(proposalId: string, status: ProposalStatus): Promise<ProposalRecord>
  setOfficialProposal(proposalId: string): Promise<ProposalRecord>
  closeOpportunityFromProposal(proposalId: string): Promise<ProposalRecord>
  deleteProposal(proposalId: string): Promise<void>
  listBuyerRooms(workspaceId: string): Promise<BuyerRoom[]>
  createBuyerRoom(input: NewBuyerRoomInput): Promise<BuyerRoom>
  updateBuyerRoom(roomId: string, input: UpdateBuyerRoomInput): Promise<BuyerRoom>
  rotateBuyerRoomToken(roomId: string): Promise<BuyerRoom>
  recordBuyerRoomActivity(roomId: string, event: Omit<BuyerRoomActivity, 'id' | 'occurredAt'> & { occurredAt?: string }): Promise<BuyerRoom>
  deleteBuyerRoom(roomId: string): Promise<void>
  listRevenueEntries(workspaceId: string): Promise<RevenueEntry[]>
  createRevenueEntry(input: NewRevenueEntryInput): Promise<RevenueEntry>
  updateRevenueEntryStatus(entryId: string, status: RevenueEntry['status']): Promise<RevenueEntry>
  listGoals(workspaceId: string): Promise<Goal[]>
  createGoal(input: NewGoalInput): Promise<Goal>
  updateGoal(goalId: string, input: UpdateGoalInput): Promise<Goal>
  deleteGoal(goalId: string): Promise<void>
  listAutomationRules(workspaceId: string): Promise<AutomationRule[]>
  createAutomationRule(input: NewAutomationRuleInput): Promise<AutomationRule>
  updateAutomationRule(ruleId: string, input: UpdateAutomationRuleInput): Promise<AutomationRule>
  deleteAutomationRule(ruleId: string): Promise<void>
  listAutomationRuns(workspaceId: string): Promise<AutomationRun[]>
  startAutomationRun(input: NewAutomationRunInput): Promise<AutomationRun | null>
  finishAutomationRun(runId: string, status: AutomationRunStatus, output: AutomationRunOutput, errorMessage?: string | null): Promise<AutomationRun>
  getDashboardStats(workspaceId: string): Promise<DashboardStats>
  importLeads(workspaceId: string, leads: Lead[]): Promise<number>
}
