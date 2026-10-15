import type { ActivityItem, AppRoute, AuditLog, AutomationRule, AutomationRun, BuyerRoom, BuyerRoomActivity, CalendarEvent, CallRecord, CommercialStructureSyncResult, CompanyRecord, ContactRecord, ContactRelationship, Goal, Lead, PipelineStage, Playbook, ProductRecord, ProposalRecord, ProposalStatus, RevenueEntry, RepositoryHealth, Workspace, WorkspaceInvite, WorkspaceMember, WorkspaceRole, WorkspaceSnapshot } from '../domain/types'
import type {
  CommercialActionResult, CommercialActivityResult, OperationalDataClearResult, NewWorkspaceMemberInput, NewActivityInput, NewAutomationRuleInput, NewBuyerRoomInput, NewCalendarEventInput, NewCallInput, NewCompanyInput, NewContactInput, NewContactRelationshipInput, NewGoalInput, NewLeadInput, NewPlaybookInput, NewProductInput, NewProposalInput, NewRevenueEntryInput, NewStageInput, RegisterActivityOutcomeInput, RegisterCallOutcomeInput, UpdateActivityInput,
  UpdateAutomationRuleInput, UpdateBuyerRoomInput, UpdateCalendarEventInput, UpdateCompanyInput, UpdateContactInput, UpdateContactRelationshipInput, UpdateGoalInput, UpdateLeadInput, UpdatePlaybookInput, UpdateProductInput, UpdateProposalInput, UpdateStageInput,
} from '../repositories/crm-repository'
import type { AutomationSimulationResult } from '../services/automation-workspace'
import type { CadenceTemplateInput } from '../services/followup-workspace'
import type { RouteContext } from './route-state'
import type { PermissionAction, PermissionResource } from '../platform/permissions'
import type { TeamAccessAction, TeamAccessResource, TeamAccessScope } from '../domain/types'
import type { EffectiveMemberAccess } from '../services/team-access-control'
import type { SnapshotSlice } from '../services/snapshot-refresh'

export interface ToastAction { label: string; run: () => void | Promise<void> }
export interface ToastOptions { action?: ToastAction; duration?: number; persistent?: boolean }
export interface ToastMessage { id: number; type: 'success' | 'error' | 'info' | 'warning'; message: string; closing?: boolean; action?: ToastAction; duration: number }

export type ActionDialogTone = 'default' | 'warning' | 'danger'
export interface ConfirmActionOptions {
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: ActionDialogTone
  details?: string[]
}
export interface PromptActionOptions extends ConfirmActionOptions {
  label: string
  initialValue?: string
  placeholder?: string
  inputType?: 'text' | 'datetime-local'
  required?: boolean
}
export interface ActionDialogState extends ConfirmActionOptions {
  id: number
  kind: 'confirm' | 'prompt'
  label?: string
  initialValue?: string
  placeholder?: string
  inputType?: 'text' | 'datetime-local'
  required?: boolean
}

interface LeadClassificationInput { leadId: string; priority: Lead['priority']; temperature: Lead['temperature']; score?: number }

type ActivityCreatePayload = Omit<NewActivityInput, 'workspaceId' | 'sourceType' | 'sourceId'>
type ContactCreatePayload = Omit<NewContactInput, 'workspaceId'>
type ContactRelationshipCreatePayload = Omit<NewContactRelationshipInput, 'workspaceId'>
type CallCreatePayload = Omit<NewCallInput, 'workspaceId' | 'userId'>
type RegisterCallOutcomePayload = Omit<RegisterCallOutcomeInput, 'workspaceId' | 'userId'>
type RegisterActivityOutcomePayload = Omit<RegisterActivityOutcomeInput, 'workspaceId' | 'userId'>
type EventCreatePayload = Omit<NewCalendarEventInput, 'workspaceId'>
type PlaybookCreatePayload = Omit<NewPlaybookInput, 'workspaceId'>
type ProductCreatePayload = Omit<NewProductInput, 'workspaceId'>
type ProposalCreatePayload = Omit<NewProposalInput, 'workspaceId'>
type RevenueCreatePayload = Omit<NewRevenueEntryInput, 'workspaceId'>
type BuyerRoomCreatePayload = Omit<NewBuyerRoomInput, 'workspaceId'>
type GoalCreatePayload = Omit<NewGoalInput, 'workspaceId'>
type AutomationRuleCreatePayload = Omit<NewAutomationRuleInput, 'workspaceId' | 'createdBy'>

export interface AppContextValue {
  route: AppRoute
  routeContext: RouteContext
  setRoute(route: AppRoute): void
  navigate(route: AppRoute, context?: RouteContext): void
  clearRouteContext(keys?: Array<keyof RouteContext>): void
  repositoryMode: 'local' | 'supabase'
  health: RepositoryHealth | null
  workspaces: Workspace[]
  currentWorkspace: Workspace | null
  currentUserId: string | null
  teamAccess: EffectiveMemberAccess | null
  canWrite: boolean
  can(action: PermissionAction, resource: PermissionResource, field?: string): boolean
  canTeamAccess(action: TeamAccessAction, resource: TeamAccessResource): boolean
  teamAccessScope(resource: TeamAccessResource): TeamAccessScope
  canTeamAccessRecord(resource: TeamAccessResource, ownerId?: string | null, teamId?: string | null): boolean
  snapshot: WorkspaceSnapshot | null
  loading: boolean
  routeDataLoading: boolean
  loadedSnapshotSlices: string[]
  error: string | null
  toasts: ToastMessage[]
  dismissToast(id: number): void
  actionDialog: ActionDialogState | null
  confirmAction(options: ConfirmActionOptions): Promise<boolean>
  promptAction(options: PromptActionOptions): Promise<string | null>
  resolveActionDialog(value: boolean | string | null): void
  setCurrentWorkspace(id: string): Promise<void>
  createWorkspace(name: string): Promise<void>
  listWorkspaceMembers(): Promise<WorkspaceMember[]>
  createWorkspaceMember(input: NewWorkspaceMemberInput): Promise<WorkspaceMember>
  createWorkspaceInvite(email: string, role: Exclude<WorkspaceRole, 'owner'>): Promise<WorkspaceInvite>
  listWorkspaceInvites(): Promise<WorkspaceInvite[]>
  revokeWorkspaceInvite(inviteId: string): Promise<void>
  updateWorkspaceMemberRole(userId: string, role: Exclude<WorkspaceRole, 'owner'>): Promise<void>
  removeWorkspaceMember(userId: string): Promise<void>
  listAuditLogs(limit?: number): Promise<AuditLog[]>
  exportWorkspace(): Promise<Record<string, unknown>>
  clearOperationalData(): Promise<OperationalDataClearResult>
  refresh(): Promise<void>
  refreshAgentExecutionState(slices?: SnapshotSlice[]): Promise<WorkspaceSnapshot>
  reinitialize(): Promise<void>
  synchronizeCommercialStructure(): Promise<CommercialStructureSyncResult>
  createCompany(input: Omit<NewCompanyInput, 'workspaceId'>): Promise<CompanyRecord>
  updateCompany(companyId: string, input: UpdateCompanyInput): Promise<CompanyRecord>
  createContact(input: ContactCreatePayload): Promise<ContactRecord>
  updateContact(contactId: string, input: UpdateContactInput): Promise<ContactRecord>
  deleteContact(contactId: string): Promise<void>
  createContactRelationship(input: ContactRelationshipCreatePayload): Promise<ContactRelationship>
  updateContactRelationship(relationshipId: string, input: UpdateContactRelationshipInput): Promise<ContactRelationship>
  deleteContactRelationship(relationshipId: string): Promise<void>
  createLead(input: Omit<NewLeadInput, 'workspaceId'>): Promise<Lead>
  updateLead(leadId: string, input: UpdateLeadInput): Promise<Lead>
  moveLead(leadId: string, stageId: string, lossReason?: string | null): Promise<Lead>
  bulkMoveLeads(leadIds: string[], stageId: string, lossReason?: string | null): Promise<Lead[]>
  mergeLeads(primaryLeadId: string, duplicateLeadId: string): Promise<Lead>
  deleteLead(leadId: string): Promise<void>
  bulkUpdateLeads(leadIds: string[], input: UpdateLeadInput): Promise<number>
  reclassifyLeads(updates: LeadClassificationInput[], silent?: boolean): Promise<number>
  bulkAddLeadTag(leadIds: string[], tag: string): Promise<number>
  bulkDeleteLeads(leadIds: string[]): Promise<number>
  createStage(input: Omit<NewStageInput, 'workspaceId'>): Promise<PipelineStage>
  updateStage(stageId: string, input: UpdateStageInput): Promise<PipelineStage>
  deleteStage(stageId: string): Promise<void>
  createActivity(input: ActivityCreatePayload): Promise<ActivityItem>
  createActivities(inputs: ActivityCreatePayload[]): Promise<ActivityItem[]>
  updateActivity(activityId: string, input: UpdateActivityInput): Promise<ActivityItem>
  completeActivity(activityId: string, completed: boolean): Promise<ActivityItem>
  registerActivityOutcome(input: RegisterActivityOutcomePayload): Promise<CommercialActivityResult>
  deleteActivity(activityId: string): Promise<void>
  createCadence(leadIds: string[], firstDueAt: string, template: CadenceTemplateInput): Promise<number>
  updateCadenceState(cadenceId: string, action: 'pause' | 'resume' | 'stop', leadId?: string | null): Promise<number>
  createCall(input: CallCreatePayload, recording?: Blob | null): Promise<CallRecord>
  registerCallOutcome(input: RegisterCallOutcomePayload, recording?: Blob | null): Promise<CommercialActionResult>
  deleteCall(callId: string): Promise<void>
  resolveCallRecordingUrl(callId: string): Promise<string | null>
  loadOlderCalls(limit?: number): Promise<number>
  createCalendarEvent(input: EventCreatePayload): Promise<CalendarEvent>
  createCalendarEvents(inputs: EventCreatePayload[]): Promise<CalendarEvent[]>
  updateCalendarEvent(eventId: string, input: UpdateCalendarEventInput): Promise<CalendarEvent>
  deleteCalendarEvent(eventId: string): Promise<void>
  createPlaybook(input: PlaybookCreatePayload): Promise<Playbook>
  updatePlaybook(playbookId: string, input: UpdatePlaybookInput): Promise<Playbook>
  deletePlaybook(playbookId: string): Promise<void>
  createProduct(input: ProductCreatePayload): Promise<ProductRecord>
  updateProduct(productId: string, input: UpdateProductInput): Promise<ProductRecord>
  reconcileProposalItems(legacyName: string, productId: string): Promise<number>
  deleteProduct(productId: string): Promise<void>
  createProposal(input: ProposalCreatePayload): Promise<ProposalRecord>
  updateProposal(proposalId: string, input: UpdateProposalInput): Promise<ProposalRecord>
  createProposalRevision(proposalId: string): Promise<ProposalRecord>
  updateProposalStatus(proposalId: string, status: ProposalStatus): Promise<ProposalRecord>
  setOfficialProposal(proposalId: string): Promise<ProposalRecord>
  closeOpportunityFromProposal(proposalId: string): Promise<ProposalRecord>
  deleteProposal(proposalId: string): Promise<void>
  createBuyerRoom(input: BuyerRoomCreatePayload): Promise<BuyerRoom>
  updateBuyerRoom(roomId: string, input: UpdateBuyerRoomInput): Promise<BuyerRoom>
  rotateBuyerRoomToken(roomId: string): Promise<BuyerRoom>
  recordBuyerRoomActivity(roomId: string, event: Omit<BuyerRoomActivity, 'id' | 'occurredAt'> & { occurredAt?: string }): Promise<BuyerRoom>
  deleteBuyerRoom(roomId: string): Promise<void>
  createRevenueEntry(input: RevenueCreatePayload): Promise<RevenueEntry>
  updateRevenueEntryStatus(entryId: string, status: RevenueEntry['status']): Promise<RevenueEntry>
  createGoal(input: GoalCreatePayload): Promise<Goal>
  updateGoal(goalId: string, input: UpdateGoalInput): Promise<Goal>
  deleteGoal(goalId: string): Promise<void>
  createAutomationRule(input: AutomationRuleCreatePayload): Promise<AutomationRule>
  updateAutomationRule(ruleId: string, input: UpdateAutomationRuleInput): Promise<AutomationRule>
  deleteAutomationRule(ruleId: string): Promise<void>
  simulateAutomationRule(ruleId: string, leadId: string): Promise<AutomationSimulationResult>
  runAutomationRule(ruleId: string, leadId: string): Promise<number>
  runAutomationChecks(): Promise<number>
  undoAutomationRun(runId: string): Promise<AutomationRun>
  restoreWorkspaceBackup(file: File): Promise<{ imported: number; warnings: string[] }>
  importLegacyBackup(file: File): Promise<{ imported: number; warnings: string[] }>
  importLeadFile(file: File): Promise<{ imported: number; warnings: string[] }>
  notify(type: ToastMessage['type'], message: string, options?: ToastOptions): void
}

