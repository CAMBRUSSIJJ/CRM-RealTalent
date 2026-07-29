import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import type { ActivityItem, AppRoute, AuditLog, AutomationRule, AutomationRun, CalendarEvent, CallRecord, CommercialStructureSyncResult, Goal, Lead, PipelineStage, Playbook, ProductRecord, ProposalRecord, ProposalStatus, RevenueEntry, RepositoryHealth, Workspace, WorkspaceInvite, WorkspaceMember, WorkspaceRole, WorkspaceSnapshot } from '../domain/types'
import { createRepository } from '../repositories/create-repository'
import type {
  CommercialActionResult, CommercialActivityResult, NewActivityInput, NewAutomationRuleInput, NewCalendarEventInput, NewCallInput, NewGoalInput, NewLeadInput, NewPlaybookInput, NewProductInput, NewProposalInput, NewRevenueEntryInput, NewStageInput, RegisterActivityOutcomeInput, RegisterCallOutcomeInput, UpdateActivityInput,
  UpdateAutomationRuleInput, UpdateCalendarEventInput, UpdateGoalInput, UpdateLeadInput, UpdatePlaybookInput, UpdateProductInput, UpdateProposalInput, UpdateStageInput,
} from '../repositories/crm-repository'
import { importV99Backup } from '../services/v99-importer'
import { parseLeadCsv } from '../services/lead-csv'
import { safeStorage } from '../lib/storage'
import { useAuth } from '../features/auth/auth-context'
import { getSupabaseClient } from '../lib/supabase'
import { automationCorrelationId, automationEventKey, automationLoopDetected, conditionMatches, ruleMatches, type AutomationEvent } from '../services/automation-engine'
import { actionLabels, automationRunForLeadToday, conditionFieldLabels, describeAutomationAction, latestAutomationRunForLead, operatorLabels, readAutomationGuard, triggerLabels, validateAutomationRule, visibleAutomationConditions, type AutomationSimulationResult } from '../services/automation-workspace'
import { addBusinessDays, appendFollowupMetadata, readFollowupMetadata, type CadenceTemplateInput } from '../services/followup-workspace'
import { createId } from '../lib/id'
import { goalProgress } from '../services/metrics'
import { recordDiagnostic } from '../lib/diagnostics'
import { recordContactDraft, recordSellerNotification } from '../services/automation-operations'
import { dispatchAutomationWebhook } from '../services/automation-webhooks'
import { queueCalendarMutation } from '../services/calendar-integration'
import { normalizeSnapshotForRender } from '../services/snapshot-safety'

export interface ToastAction { label: string; run: () => void | Promise<void> }
export interface ToastOptions { action?: ToastAction; duration?: number; persistent?: boolean }
export interface ToastMessage { id: number; type: 'success' | 'error' | 'info'; message: string; closing?: boolean; action?: ToastAction; duration: number }

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
type CallCreatePayload = Omit<NewCallInput, 'workspaceId' | 'userId'>
type RegisterCallOutcomePayload = Omit<RegisterCallOutcomeInput, 'workspaceId' | 'userId'>
type RegisterActivityOutcomePayload = Omit<RegisterActivityOutcomeInput, 'workspaceId' | 'userId'>
type EventCreatePayload = Omit<NewCalendarEventInput, 'workspaceId'>
type PlaybookCreatePayload = Omit<NewPlaybookInput, 'workspaceId'>
type ProductCreatePayload = Omit<NewProductInput, 'workspaceId'>
type ProposalCreatePayload = Omit<NewProposalInput, 'workspaceId'>
type RevenueCreatePayload = Omit<NewRevenueEntryInput, 'workspaceId'>
type GoalCreatePayload = Omit<NewGoalInput, 'workspaceId'>
type AutomationRuleCreatePayload = Omit<NewAutomationRuleInput, 'workspaceId' | 'createdBy'>

interface AppContextValue {
  route: AppRoute
  setRoute(route: AppRoute): void
  repositoryMode: 'local' | 'supabase'
  health: RepositoryHealth | null
  workspaces: Workspace[]
  currentWorkspace: Workspace | null
  canWrite: boolean
  snapshot: WorkspaceSnapshot | null
  loading: boolean
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
  createWorkspaceInvite(email: string, role: Exclude<WorkspaceRole, 'owner'>): Promise<WorkspaceInvite>
  listWorkspaceInvites(): Promise<WorkspaceInvite[]>
  revokeWorkspaceInvite(inviteId: string): Promise<void>
  updateWorkspaceMemberRole(userId: string, role: Exclude<WorkspaceRole, 'owner'>): Promise<void>
  removeWorkspaceMember(userId: string): Promise<void>
  listAuditLogs(limit?: number): Promise<AuditLog[]>
  exportWorkspace(): Promise<Record<string, unknown>>
  refresh(): Promise<void>
  reinitialize(): Promise<void>
  synchronizeCommercialStructure(): Promise<CommercialStructureSyncResult>
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
  createCall(input: CallCreatePayload, recording?: Blob | null): Promise<CallRecord>
  registerCallOutcome(input: RegisterCallOutcomePayload, recording?: Blob | null): Promise<CommercialActionResult>
  deleteCall(callId: string): Promise<void>
  createCalendarEvent(input: EventCreatePayload): Promise<CalendarEvent>
  createCalendarEvents(inputs: EventCreatePayload[]): Promise<CalendarEvent[]>
  updateCalendarEvent(eventId: string, input: UpdateCalendarEventInput): Promise<CalendarEvent>
  deleteCalendarEvent(eventId: string): Promise<void>
  createPlaybook(input: PlaybookCreatePayload): Promise<Playbook>
  updatePlaybook(playbookId: string, input: UpdatePlaybookInput): Promise<Playbook>
  deletePlaybook(playbookId: string): Promise<void>
  createProduct(input: ProductCreatePayload): Promise<ProductRecord>
  updateProduct(productId: string, input: UpdateProductInput): Promise<ProductRecord>
  deleteProduct(productId: string): Promise<void>
  createProposal(input: ProposalCreatePayload): Promise<ProposalRecord>
  updateProposal(proposalId: string, input: UpdateProposalInput): Promise<ProposalRecord>
  createProposalRevision(proposalId: string): Promise<ProposalRecord>
  updateProposalStatus(proposalId: string, status: ProposalStatus): Promise<ProposalRecord>
  setOfficialProposal(proposalId: string): Promise<ProposalRecord>
  closeOpportunityFromProposal(proposalId: string): Promise<ProposalRecord>
  deleteProposal(proposalId: string): Promise<void>
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

const AppContext = createContext<AppContextValue | null>(null)
const ACTIVE_WORKSPACE_KEY = 'realtalent-crm-v100-active-workspace'

export function AppProvider({ children }: PropsWithChildren) {
  const { user, loading: authLoading, mode: authMode } = useAuth()
  const repository = useRef(createRepository()).current
  const [route, setRoute] = useState<AppRoute>('dashboard')
  const [health, setHealth] = useState<RepositoryHealth | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [currentWorkspace, setCurrentWorkspaceState] = useState<Workspace | null>(null)
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const toastId = useRef(0)
  const toastTimers = useRef(new Map<number, number>())
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(null)
  const actionDialogId = useRef(0)
  const actionDialogResolver = useRef<((value: boolean | string | null) => void) | null>(null)

  const dismissToast = useCallback((id: number) => {
    const timer = toastTimers.current.get(id)
    if (timer) window.clearTimeout(timer)
    toastTimers.current.delete(id)
    setToasts((current) => current.map((toast) => toast.id === id ? { ...toast, closing: true } : toast))
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 180)
  }, [])

  const notify = useCallback((type: ToastMessage['type'], message: string, options?: ToastOptions) => {
    const id = ++toastId.current
    const duration = Math.max(2200, options?.duration ?? (options?.action ? 7000 : 4200))
    setToasts((current) => [...current.slice(-3), { id, type, message, action: options?.action, duration }])
    if (!options?.persistent) {
      const timer = window.setTimeout(() => dismissToast(id), duration)
      toastTimers.current.set(id, timer)
    }
  }, [dismissToast])

  const openActionDialog = useCallback((dialog: Omit<ActionDialogState, 'id'>) => new Promise<boolean | string | null>((resolve) => {
    actionDialogResolver.current?.(null)
    actionDialogResolver.current = resolve
    setActionDialog({ ...dialog, id: ++actionDialogId.current })
  }), [])

  const confirmAction = useCallback(async (options: ConfirmActionOptions) => {
    const result = await openActionDialog({ kind: 'confirm', ...options })
    return result === true
  }, [openActionDialog])

  const promptAction = useCallback(async (options: PromptActionOptions) => {
    const result = await openActionDialog({ kind: 'prompt', ...options })
    return typeof result === 'string' ? result : null
  }, [openActionDialog])

  const resolveActionDialog = useCallback((value: boolean | string | null) => {
    const resolve = actionDialogResolver.current
    actionDialogResolver.current = null
    setActionDialog(null)
    resolve?.(value)
  }, [])

  const canWrite = currentWorkspace?.role !== 'viewer'
  const assertWritable = useCallback(() => {
    if (currentWorkspace?.role === 'viewer') throw new Error('Seu perfil está em modo somente leitura. Solicite permissão de vendedor ou administrador para alterar dados.')
  }, [currentWorkspace?.role])

  const loadWorkspace = useCallback(async (workspace: Workspace) => {
    setLoading(true); setError(null)
    try {
      const nextSnapshot = await repository.getSnapshot(workspace.id)
      setCurrentWorkspaceState(workspace); setSnapshot(normalizeSnapshotForRender(nextSnapshot)); safeStorage.setItem(ACTIVE_WORKSPACE_KEY, workspace.id)
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Falha ao carregar o workspace.'
      recordDiagnostic({ severity: 'error', source: 'workspace', message, route: window.location.hash || 'dashboard', workspaceId: workspace.id })
      setError(message); notify('error', message)
    } finally { setLoading(false) }
  }, [notify, repository])

  const bootstrap = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      await repository.initialize()
      const inviteToken = new URLSearchParams(window.location.search).get('invite')
      if (inviteToken) {
        await repository.acceptWorkspaceInvite(inviteToken)
        const nextUrl = new URL(window.location.href); nextUrl.searchParams.delete('invite'); window.history.replaceState({}, document.title, `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`)
        notify('success', 'Convite aceito. O workspace foi adicionado à sua conta.')
      }
      const [repositoryHealth, workspaceList] = await Promise.all([repository.health(), repository.listWorkspaces()])
      setHealth(repositoryHealth); setWorkspaces(workspaceList)
      const savedId = safeStorage.getItem(ACTIVE_WORKSPACE_KEY)
      const preferred = workspaceList.find((workspace) => workspace.id === savedId) ?? workspaceList[0] ?? null
      if (preferred) await loadWorkspace(preferred); else setLoading(false)
    } catch (bootstrapError) {
      const message = bootstrapError instanceof Error ? bootstrapError.message : 'Falha ao iniciar o CRM.'
      recordDiagnostic({ severity: 'error', source: 'inicialização', message, route: window.location.hash || 'dashboard', workspaceId: null })
      setError(message); setLoading(false)
    }
  }, [loadWorkspace, repository])

  useEffect(() => {
    if (authLoading) return
    if (authMode === 'supabase' && !user) {
      setWorkspaces([]); setCurrentWorkspaceState(null); setSnapshot(null); setError(null); setLoading(false); return
    }
    void bootstrap()
  }, [authLoading, authMode, bootstrap, user])

  const refreshData = useCallback(async () => {
    if (!currentWorkspace) return
    const nextSnapshot = await repository.getSnapshot(currentWorkspace.id)
    setSnapshot(normalizeSnapshotForRender(nextSnapshot)); setHealth(await repository.health())
  }, [currentWorkspace, repository])

  useEffect(() => {
    if (repository.mode !== 'supabase' || !currentWorkspace) return
    const client = getSupabaseClient(); if (!client) return
    let timer: number | null = null
    const scheduleRefresh = () => {
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => { void refreshData() }, 220)
    }
    const channel = client.channel(`crm-v100-workspace-${currentWorkspace.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads', filter: `organization_id=eq.${currentWorkspace.id}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pipeline_stages', filter: `organization_id=eq.${currentWorkspace.id}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities', filter: `organization_id=eq.${currentWorkspace.id}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls', filter: `organization_id=eq.${currentWorkspace.id}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events', filter: `organization_id=eq.${currentWorkspace.id}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playbooks', filter: `organization_id=eq.${currentWorkspace.id}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `organization_id=eq.${currentWorkspace.id}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_proposals', filter: `organization_id=eq.${currentWorkspace.id}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'revenue_entries', filter: `organization_id=eq.${currentWorkspace.id}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goals', filter: `organization_id=eq.${currentWorkspace.id}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'automation_rules', filter: `organization_id=eq.${currentWorkspace.id}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'automation_runs', filter: `organization_id=eq.${currentWorkspace.id}` }, scheduleRefresh)
      .subscribe()
    return () => { if (timer) window.clearTimeout(timer); void client.removeChannel(channel) }
  }, [currentWorkspace, refreshData, repository.mode])


  const executeAutomationEvent = useCallback(async (
    event: AutomationEvent,
    options: { ruleId?: string; forceRule?: boolean; refreshAfter?: boolean; baseSnapshot?: WorkspaceSnapshot } = {},
  ) => {
    if (!currentWorkspace) return 0
    const base = options.baseSnapshot ?? await repository.getSnapshot(currentWorkspace.id)
    const candidates = options.ruleId ? base.automationRules.filter((rule) => rule.id === options.ruleId) : base.automationRules
    const rules = candidates.filter((rule) => options.forceRule
      ? rule.triggerType === event.triggerType && visibleAutomationConditions(rule.conditions).every((condition) => conditionMatches(condition, event))
      : ruleMatches(rule, event))
    let executed = 0
    for (const rule of rules) {
      const guard = readAutomationGuard(rule.conditions)
      const validation = validateAutomationRule(rule, base.stages)
      const correlationId = automationCorrelationId(event)
      const chainDepth = Math.max(0, Number(event.chainDepth ?? 0))
      const eventKey = options.forceRule
        ? `${automationEventKey(rule.id, event)}:manual:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`
        : automationEventKey(rule.id, event)
      const run = await repository.startAutomationRun({
        workspaceId: currentWorkspace.id, ruleId: rule.id, eventKey,
        input: {
          triggerType: event.triggerType, entityId: event.entityId, leadId: event.lead?.id ?? null,
          callOutcome: event.callOutcome ?? null, stageId: event.stageId ?? null, activityType: event.activityType ?? null,
          eventStatus: event.eventStatus ?? null, mode: guard.mode, correlationId, chainDepth, originRuleIds: event.originRuleIds ?? [],
        },
      })
      if (!run) continue
      const runStartedAt = Date.now()
      const preview = rule.actions.slice(0, guard.maxActionsPerRun).map((action) => describeAutomationAction(action, base.stages))
      const loopReason = automationLoopDetected(rule.id, event, guard.maxChainDepth)
      if (!options.forceRule && loopReason) {
        await repository.finishAutomationRun(run.id, 'success', {
          message: loopReason === 'rule_cycle' ? 'Execução bloqueada: a regra já participou desta cadeia.' : 'Execução bloqueada: profundidade máxima da cadeia atingida.',
          skippedReason: loopReason, actionPreview: preview, correlationId, chainDepth, durationMs: Date.now() - runStartedAt,
        })
        continue
      }
      if (validation.errors.length) {
        const message = validation.errors.join(' ')
        await repository.finishAutomationRun(run.id, 'failed', { message, actionPreview: preview, warnings: validation.warnings, correlationId, chainDepth, durationMs: Date.now() - runStartedAt }, message)
        continue
      }
      if (guard.mode === 'simulation' && !options.forceRule) {
        await repository.finishAutomationRun(run.id, 'success', {
          message: `Simulação concluída: ${preview.length} ação(ões) seriam executadas.`, simulated: true,
          actionPreview: preview, matchedLeadIds: event.lead ? [event.lead.id] : [], warnings: validation.warnings, correlationId, chainDepth, durationMs: Date.now() - runStartedAt,
        })
        executed += 1
        continue
      }
      if (event.lead) {
        const currentRuns = (await repository.listAutomationRuns(currentWorkspace.id)).filter((item) => item.id !== run.id)
        const loopWindowStart = Date.now() - guard.loopWindowMinutes * 60_000
        const repeatedInChain = currentRuns.some((item) => item.ruleId === rule.id && item.input.correlationId === correlationId && new Date(item.startedAt).getTime() >= loopWindowStart && item.status !== 'undone')
        if (!options.forceRule && repeatedInChain) {
          await repository.finishAutomationRun(run.id, 'success', {
            message: 'Execução ignorada pela janela anti-loop.', skippedReason: 'loop_window', actionPreview: preview,
            matchedLeadIds: [event.lead.id], warnings: validation.warnings, correlationId, chainDepth, durationMs: Date.now() - runStartedAt,
          })
          continue
        }
        const todayRuns = automationRunForLeadToday(currentRuns, rule.id, event.lead.id)
        if (!options.forceRule && todayRuns.length >= guard.maxRunsPerLeadPerDay) {
          await repository.finishAutomationRun(run.id, 'success', {
            message: 'Execução ignorada pelo limite diário de segurança.', skippedReason: 'daily_limit', actionPreview: preview,
            matchedLeadIds: [event.lead.id], warnings: validation.warnings, correlationId, chainDepth, durationMs: Date.now() - runStartedAt,
          })
          continue
        }
        const latest = latestAutomationRunForLead(currentRuns, rule.id, event.lead.id)
        if (!options.forceRule && latest && guard.cooldownHours > 0 && Date.now() - new Date(latest.startedAt).getTime() < guard.cooldownHours * 3_600_000) {
          await repository.finishAutomationRun(run.id, 'success', {
            message: 'Execução ignorada pelo intervalo de segurança.', skippedReason: 'cooldown', actionPreview: preview,
            matchedLeadIds: [event.lead.id], warnings: validation.warnings, correlationId, chainDepth, durationMs: Date.now() - runStartedAt,
          })
          continue
        }
      }
      const mutations: NonNullable<AutomationRun['output']['mutations']> = []
      const warnings = [...validation.warnings]
      const actionMessages: string[] = []
      const webhookDeliveryIds: string[] = []
      const webhookRequests: string[] = []
      const workingActivities = await repository.listActivities(currentWorkspace.id)
      const workingEvents = await repository.listCalendarEvents(currentWorkspace.id)
      let currentLead = event.lead ? { ...event.lead, tags: [...event.lead.tags] } : null
      const dueFor = (action: AutomationRule['actions'][number]) => {
        const now = new Date()
        const due = new Date(now)
        due.setDate(due.getDate() + Math.max(0, Number(action.delayDays ?? 0)))
        due.setHours(due.getHours() + Math.max(0, Number(action.delayHours ?? 0)))
        due.setMinutes(0, 0, 0)
        if (due.getTime() <= now.getTime()) due.setHours(due.getHours() + 1)
        return due
      }
      const createActivityAction = async (type: ActivityItem['type'], title: string, dueAt: string | null, completedAt: string | null = null) => {
        const relatedLeadId = currentLead?.id ?? null
        const duplicate = guard.preventDuplicates && workingActivities.some((activity) => {
          if (activity.leadId !== relatedLeadId || activity.type !== type || activity.title.toLocaleLowerCase('pt-BR') !== title.toLocaleLowerCase('pt-BR')) return false
          if (completedAt) return Boolean(activity.completedAt)
          if (activity.completedAt) return false
          if (!dueAt || !activity.dueAt) return dueAt === activity.dueAt
          return new Date(activity.dueAt).toDateString() === new Date(dueAt).toDateString()
        })
        if (duplicate) { actionMessages.push(`Duplicidade evitada: ${title}`); return null }
        const activity = await repository.createActivity({
          workspaceId: currentWorkspace.id, leadId: relatedLeadId, type, title,
          description: `Criado pela automação “${rule.name}”.`, dueAt, completedAt, assignedTo: currentLead?.ownerId ?? null,
          sourceType: 'system', sourceId: run.id,
        })
        workingActivities.unshift(activity)
        mutations.push({ kind: 'activity_create', activityId: activity.id })
        actionMessages.push(title)
        return activity
      }
      const executeAction = async (action: AutomationRule['actions'][number]) => {
        const lead = currentLead
        if (!lead && !['internal_alert', 'create_note', 'send_webhook'].includes(action.type)) throw new Error('A automação exige um lead relacionado.')
        if (action.type === 'create_followup' || action.type === 'create_call') {
          const title = action.value.trim() || `${actionLabels[action.type]} — ${rule.name}`
          await createActivityAction(action.type === 'create_call' ? 'call' : 'followup', title, dueFor(action).toISOString())
        } else if (action.type === 'create_meeting') {
          const starts = dueFor(action); const ends = new Date(starts.getTime() + Math.max(15, Number(action.durationMinutes ?? 30)) * 60_000)
          const title = action.value.trim() || `Reunião — ${rule.name}`
          const duplicate = guard.preventDuplicates && workingEvents.some((item) => item.leadId === lead?.id && item.status !== 'cancelled' && item.title.toLocaleLowerCase('pt-BR') === title.toLocaleLowerCase('pt-BR') && new Date(item.startsAt).toDateString() === starts.toDateString())
          if (duplicate) { actionMessages.push(`Duplicidade evitada: ${title}`); return }
          const calendarEvent = await repository.createCalendarEvent({
            workspaceId: currentWorkspace.id, leadId: lead!.id, title, description: `Criado pela automação “${rule.name}”.`,
            startsAt: starts.toISOString(), endsAt: ends.toISOString(), allDay: false, location: '', status: 'tentative', assignedTo: lead!.ownerId,
          })
          workingEvents.unshift(calendarEvent); mutations.push({ kind: 'event_create', eventId: calendarEvent.id }); actionMessages.push(title)
        } else if (action.type === 'create_note') {
          await createActivityAction('note', action.value.trim() || `Nota automática — ${rule.name}`, null, new Date().toISOString())
        } else if (action.type === 'internal_alert') {
          const title = action.value.trim() || `Lead exige atenção — ${rule.name}`
          await recordSellerNotification({
            workspaceId: currentWorkspace.id, userId: lead?.ownerId ?? null, leadId: lead?.id ?? null, title,
            body: lead ? `${lead.name}${lead.company ? ` · ${lead.company}` : ''} está pronto para a próxima ação.` : 'A automação gerou um aviso operacional.',
            severity: 'warning', actionRoute: 'automations', sourceType: 'automation_run', sourceId: run.id,
          })
          await createActivityAction('followup', `Alerta interno — ${title}`, new Date().toISOString())
        } else if (action.type === 'assisted_whatsapp' || action.type === 'assisted_email') {
          const channel = action.type === 'assisted_whatsapp' ? 'WhatsApp' : 'e-mail'
          const firstName = lead!.name.trim().split(/\s+/)[0] || 'tudo bem'
          const defaultMessage = action.type === 'assisted_whatsapp'
            ? `Olá, ${firstName}! Tudo bem? Analisei ${lead!.company ? `a ${lead!.company}` : 'seu perfil'} e gostaria de conversar rapidamente sobre como podemos apoiar seu processo comercial. Posso te explicar em poucos minutos?`
            : `Olá, ${firstName}!\n\nAnalisei ${lead!.company ? `a ${lead!.company}` : 'seu perfil'} e identifiquei uma oportunidade de conversa sobre o processo comercial. Podemos marcar uma conversa rápida?\n\nAtenciosamente,\nEquipe RealTalent`
          const message = action.value.trim() || defaultMessage
          await recordContactDraft({
            workspaceId: currentWorkspace.id, leadId: lead!.id, channel: action.type === 'assisted_whatsapp' ? 'whatsapp' : 'email',
            subject: action.type === 'assisted_email' ? `Contato RealTalent — ${lead!.company || lead!.name}` : '', message,
            sourceType: 'automation_run', sourceId: run.id,
          })
          await createActivityAction('followup', `${channel} preparado — ${rule.name}`, new Date().toISOString())
        } else if (action.type === 'send_webhook') {
          webhookRequests.push(action.value)
          actionMessages.push('Webhook preparado para despacho após a confirmação da execução')
        } else if (action.type === 'add_tag' || action.type === 'remove_tag') {
          const before = { tags: [...lead!.tags] }
          const tag = action.value.trim(); if (!tag) throw new Error('A tag da automação está vazia.')
          const tags = action.type === 'add_tag' ? Array.from(new Set([...lead!.tags, tag])) : lead!.tags.filter((item) => item.toLocaleLowerCase('pt-BR') !== tag.toLocaleLowerCase('pt-BR'))
          currentLead = await repository.updateLead(lead!.id, { tags })
          mutations.push({ kind: 'lead_update', leadId: currentLead.id, before }); actionMessages.push(`${actionLabels[action.type]}: ${tag}`)
        } else if (action.type === 'set_priority') {
          const priority = action.value as Lead['priority']
          if (!['low', 'medium', 'high', 'urgent'].includes(priority)) throw new Error('Prioridade inválida na automação.')
          const before = { priority: lead!.priority }; currentLead = await repository.updateLead(lead!.id, { priority })
          mutations.push({ kind: 'lead_update', leadId: currentLead.id, before }); actionMessages.push(`Prioridade: ${priority}`)
        } else if (action.type === 'set_temperature') {
          const temperature = action.value as Lead['temperature']
          if (!['cold', 'warm', 'hot'].includes(temperature)) throw new Error('Temperatura inválida na automação.')
          const before = { temperature: lead!.temperature }; currentLead = await repository.updateLead(lead!.id, { temperature })
          mutations.push({ kind: 'lead_update', leadId: currentLead.id, before }); actionMessages.push(`Temperatura: ${temperature}`)
        } else if (action.type === 'assign_owner') {
          const ownerName = action.value.trim(); if (!ownerName) throw new Error('Informe o responsável da automação.')
          const ownerReference = base.leads.find((item) => item.ownerId && item.ownerName.toLocaleLowerCase('pt-BR') === ownerName.toLocaleLowerCase('pt-BR'))
          const before = { ownerId: lead!.ownerId, ownerName: lead!.ownerName }
          currentLead = await repository.updateLead(lead!.id, { ownerId: ownerReference?.ownerId ?? null, ownerName })
          mutations.push({ kind: 'lead_update', leadId: currentLead.id, before }); actionMessages.push(`Responsável: ${ownerName}`)
        } else if (action.type === 'move_stage' || action.type === 'mark_lost') {
          const target = action.type === 'mark_lost' ? base.stages.find((stage) => stage.isLost) : base.stages.find((stage) => stage.id === action.value)
          const before = { stageId: lead!.stageId, status: lead!.status }
          if (action.type === 'mark_lost' && !target) {
            currentLead = await repository.updateLead(lead!.id, { status: 'lost' })
            mutations.push({ kind: 'lead_update', leadId: currentLead.id, before }); actionMessages.push('Marcado como perdido')
          } else {
            if (!target) throw new Error('A etapa configurada não existe.')
            currentLead = await repository.moveLead(lead!.id, target.id)
            mutations.push({ kind: 'lead_update', leadId: currentLead.id, before }); actionMessages.push(`Movido para ${target.name}`)
          }
        } else if (action.type === 'start_cadence') {
          const cadenceName = action.value.trim() || 'Cadência automática'
          for (const [index, offset] of [0, 2, 5].entries()) {
            const due = new Date(); due.setDate(due.getDate() + offset); due.setMinutes(0, 0, 0)
            await createActivityAction(index === 1 ? 'call' : 'followup', `${cadenceName} · Etapa ${index + 1}`, due.toISOString())
          }
        } else if (action.type === 'end_cadence') {
          const pending = workingActivities.filter((activity) => activity.leadId === lead?.id && !activity.completedAt && ['followup', 'call', 'meeting'].includes(activity.type))
          for (const activity of pending) {
            await repository.completeActivity(activity.id, true)
            mutations.push({ kind: 'activity_update', activityId: activity.id, before: { completedAt: activity.completedAt } })
            activity.completedAt = new Date().toISOString()
          }
          actionMessages.push(`${pending.length} atividade(s) pendente(s) encerrada(s)`)
        }
      }
      let completedOutput: AutomationRun['output'] | null = null
      try {
        for (const action of rule.actions.slice(0, guard.maxActionsPerRun)) {
          try { await executeAction(action) }
          catch (actionError) {
            const message = actionError instanceof Error ? actionError.message : 'Falha em uma ação da automação.'
            warnings.push(`${actionLabels[action.type]}: ${message}`)
            if (guard.stopOnError) throw actionError
          }
        }
        completedOutput = {
          message: `${actionMessages.length} ação(ões) processada(s).`, mutations, matchedLeadIds: currentLead ? [currentLead.id] : [],
          actionPreview: actionMessages, warnings: [...warnings], correlationId, chainDepth, durationMs: Date.now() - runStartedAt, webhookDeliveryIds,
        }
        await repository.finishAutomationRun(run.id, 'success', completedOutput)
        executed += 1
      } catch (automationError) {
        const message = automationError instanceof Error ? automationError.message : 'Falha ao executar automação.'
        const rollbackWarnings: string[] = []
        for (const mutation of [...mutations].reverse()) {
          try {
            if (mutation.kind === 'activity_create' && mutation.activityId) await repository.deleteActivity(mutation.activityId)
            if (mutation.kind === 'activity_update' && mutation.activityId && mutation.before) await repository.updateActivity(mutation.activityId, { completedAt: mutation.before.completedAt ?? null })
            if (mutation.kind === 'event_create' && mutation.eventId) await repository.deleteCalendarEvent(mutation.eventId)
            if (mutation.kind === 'lead_update' && mutation.leadId && mutation.before) await repository.updateLead(mutation.leadId, mutation.before)
          } catch (rollbackError) {
            rollbackWarnings.push(rollbackError instanceof Error ? rollbackError.message : 'Falha ao restaurar uma alteração parcial.')
          }
        }
        const rollbackMessage = rollbackWarnings.length ? 'Algumas alterações parciais não puderam ser restauradas.' : 'Alterações parciais restauradas automaticamente.'
        await repository.finishAutomationRun(run.id, 'failed', { message: `${message} ${rollbackMessage}`, mutations: rollbackWarnings.length ? mutations : [], matchedLeadIds: currentLead ? [currentLead.id] : [], actionPreview: actionMessages, warnings: [...warnings, ...rollbackWarnings], correlationId, chainDepth, durationMs: Date.now() - runStartedAt, webhookDeliveryIds }, message)
      }
      if (completedOutput && webhookRequests.length) {
        for (const webhookId of webhookRequests) {
          try {
            const delivery = await dispatchAutomationWebhook({
              workspaceId: currentWorkspace.id, webhookId, runId: run.id, rule, lead: currentLead,
              eventType: event.triggerType, correlationId,
            })
            webhookDeliveryIds.push(delivery.id)
          } catch (webhookError) {
            warnings.push(`Webhook: ${webhookError instanceof Error ? webhookError.message : 'Não foi possível criar a entrega.'}`)
          }
        }
        try {
          await repository.finishAutomationRun(run.id, 'success', {
            ...completedOutput,
            message: `${actionMessages.length} ação(ões) processada(s); ${webhookDeliveryIds.length} webhook(s) enfileirado(s).`,
            warnings: [...warnings], webhookDeliveryIds, durationMs: Date.now() - runStartedAt,
          })
        } catch {
          notify('info', 'A automação foi concluída, mas o vínculo final com o log de webhook precisa ser revisado.')
        }
      }
    }
    if (executed && options.refreshAfter !== false) await refreshData()
    return executed
  }, [currentWorkspace, notify, refreshData, repository])

  const value = useMemo<AppContextValue>(() => ({
    route, setRoute, repositoryMode: repository.mode, health, workspaces, currentWorkspace, canWrite, snapshot, loading, error, toasts, dismissToast, actionDialog, confirmAction, promptAction, resolveActionDialog,
    reinitialize: bootstrap,
    async synchronizeCommercialStructure() { assertWritable(); if (!currentWorkspace) throw new Error('Selecione um workspace.'); const result = await repository.synchronizeCommercialStructure(currentWorkspace.id); await refreshData(); notify('success', `Estrutura sincronizada: ${result.leadsLinked} lead(s) vinculados.`); return result },
    async setCurrentWorkspace(id) {
      const workspace = workspaces.find((item) => item.id === id); if (!workspace) throw new Error('Workspace não encontrado.'); await loadWorkspace(workspace)
    },
    async createWorkspace(name) {
      const workspace = await repository.createWorkspace(name); setWorkspaces(await repository.listWorkspaces()); await loadWorkspace(workspace); notify('success', 'Workspace criado com etapas padrão.')
    },
    async listWorkspaceMembers() { if (!currentWorkspace) return []; return repository.listWorkspaceMembers(currentWorkspace.id) },
    async createWorkspaceInvite(email, role) { assertWritable(); if (!currentWorkspace) throw new Error('Selecione um workspace.'); const invite = await repository.createWorkspaceInvite(currentWorkspace.id, email, role); notify('success', 'Convite criado.'); return invite },
    async listWorkspaceInvites() { if (!currentWorkspace) return []; return repository.listWorkspaceInvites(currentWorkspace.id) },
    async revokeWorkspaceInvite(inviteId) { assertWritable(); await repository.revokeWorkspaceInvite(inviteId); notify('success', 'Convite revogado.') },
    async updateWorkspaceMemberRole(userId, role) { assertWritable(); if (!currentWorkspace) throw new Error('Selecione um workspace.'); await repository.updateWorkspaceMemberRole(currentWorkspace.id, userId, role); setWorkspaces(await repository.listWorkspaces()); notify('success', 'Permissão atualizada.') },
    async removeWorkspaceMember(userId) { assertWritable(); if (!currentWorkspace) throw new Error('Selecione um workspace.'); await repository.removeWorkspaceMember(currentWorkspace.id, userId); notify('success', 'Membro removido.') },
    async listAuditLogs(limit = 100) { if (!currentWorkspace) return []; return repository.listAuditLogs(currentWorkspace.id, limit) },
    async exportWorkspace() { if (!currentWorkspace) throw new Error('Selecione um workspace.'); return repository.exportWorkspace(currentWorkspace.id) },
    async refresh() {
      try { await refreshData(); notify('success', 'Dados atualizados.') }
      catch (refreshError) { notify('error', refreshError instanceof Error ? refreshError.message : 'Não foi possível atualizar.') }
    },
    async createLead(input) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const lead = await repository.createLead({ ...input, workspaceId: currentWorkspace.id }); await executeAutomationEvent({ triggerType: 'lead_created', entityId: lead.id, lead }, { refreshAfter: false }); await refreshData(); notify('success', 'Lead criado com sucesso.'); return lead
    },
    async updateLead(leadId, input) { assertWritable(); const lead = await repository.updateLead(leadId, input); await refreshData(); notify('success', 'Lead atualizado.'); return lead },
    async moveLead(leadId, stageId, lossReason) { assertWritable();
      const lead = await repository.moveLead(leadId, stageId, lossReason)
      await executeAutomationEvent({ triggerType: 'stage_changed', entityId: `${lead.id}:${stageId}:${lead.updatedAt}`, lead, stageId }, { refreshAfter: false })
      if (lead.status === 'won') await executeAutomationEvent({ triggerType: 'opportunity_won', entityId: `${lead.id}:${lead.updatedAt}`, lead, stageId }, { refreshAfter: false })
      if (lead.status === 'lost') await executeAutomationEvent({ triggerType: 'opportunity_lost', entityId: `${lead.id}:${lead.updatedAt}`, lead, stageId }, { refreshAfter: false })
      await refreshData(); notify('success', 'Lead movido no Pipeline.'); return lead
    },
    async bulkMoveLeads(leadIds, stageId, lossReason) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const leads = await repository.bulkMoveLeads(currentWorkspace.id, leadIds, stageId, lossReason)
      for (const lead of leads) {
        await executeAutomationEvent({ triggerType: 'stage_changed', entityId: `${lead.id}:${stageId}:${lead.updatedAt}`, lead, stageId }, { refreshAfter: false })
        if (lead.status === 'won') await executeAutomationEvent({ triggerType: 'opportunity_won', entityId: `${lead.id}:${lead.updatedAt}`, lead, stageId }, { refreshAfter: false })
        if (lead.status === 'lost') await executeAutomationEvent({ triggerType: 'opportunity_lost', entityId: `${lead.id}:${lead.updatedAt}`, lead, stageId }, { refreshAfter: false })
      }
      await refreshData(); notify('success', `${leads.length} lead(s) movido(s) no Pipeline.`); return leads
    },
    async deleteLead(leadId) { assertWritable(); await repository.deleteLead(leadId); await refreshData(); notify('success', 'Lead removido.') },
    async mergeLeads(primaryLeadId, duplicateLeadId) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const lead = await repository.mergeLeads(currentWorkspace.id, primaryLeadId, duplicateLeadId)
      await refreshData(); notify('success', 'Cadastros mesclados com histórico preservado.'); return lead
    },
    async bulkUpdateLeads(leadIds, input) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const count = await repository.bulkUpdateLeads(currentWorkspace.id, leadIds, input); await refreshData(); notify('success', `${count} lead(s) atualizado(s).`); return count
    },
    async reclassifyLeads(updates, silent = false) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const unique = Array.from(new Map(updates.map((item) => [item.leadId, item])).values())
      let count = 0
      for (const item of unique) {
        const current = snapshot?.leads.find((lead) => lead.id === item.leadId)
        if (!current || current.status !== 'active' || (current.priority === item.priority && current.temperature === item.temperature)) continue
        await repository.updateLead(item.leadId, { priority: item.priority, temperature: item.temperature })
        count += 1
      }
      if (count) await refreshData()
      if (count && !silent) notify('success', `${count} lead(s) reclassificado(s) pelo Lead Score.`)
      return count
    },
    async bulkAddLeadTag(leadIds, tag) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const count = await repository.bulkAddLeadTag(currentWorkspace.id, leadIds, tag); await refreshData(); notify('success', `Tag adicionada em ${count} lead(s).`); return count
    },
    async bulkDeleteLeads(leadIds) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const count = await repository.bulkDeleteLeads(currentWorkspace.id, leadIds); await refreshData(); notify('success', `${count} lead(s) removido(s).`); return count
    },
    async createStage(input) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const stage = await repository.createStage({ ...input, workspaceId: currentWorkspace.id }); await refreshData(); notify('success', 'Etapa criada.'); return stage
    },
    async updateStage(stageId, input) { assertWritable(); const stage = await repository.updateStage(stageId, input); await refreshData(); notify('success', 'Etapa atualizada.'); return stage },
    async deleteStage(stageId) { assertWritable(); await repository.deleteStage(stageId); await refreshData(); notify('success', 'Etapa removida.') },
    async createActivity(input) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const activity = await repository.createActivity({ ...input, workspaceId: currentWorkspace.id, sourceType: 'manual', sourceId: null }); await refreshData(); notify('success', 'Atividade criada.'); return activity
    },
    async createActivities(inputs) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      if (!inputs.length) return []
      const created = await repository.createActivities(inputs.map((input) => ({ ...input, workspaceId: currentWorkspace.id, sourceType: 'system', sourceId: 'bulk-activity' })))
      await refreshData(); notify('success', `${created.length} atividade(s) adicionada(s) à rotina comercial.`); return created
    },
    async updateActivity(activityId, input) { assertWritable(); const activity = await repository.updateActivity(activityId, input); await refreshData(); notify('success', 'Atividade atualizada.'); return activity },
    async completeActivity(activityId, completed) { assertWritable();
      const activity = await repository.completeActivity(activityId, completed)
      if (completed && currentWorkspace) {
        const lead = activity.leadId ? (await repository.listLeads(currentWorkspace.id)).find((item) => item.id === activity.leadId) ?? null : null
        await executeAutomationEvent({ triggerType: 'activity_completed', entityId: `${activity.id}:${activity.updatedAt}`, lead, activityId: activity.id, activityType: activity.type }, { refreshAfter: false })
      }
      await refreshData(); notify('success', completed ? 'Atividade concluída.' : 'Atividade reaberta.'); return activity
    },
    async registerActivityOutcome(input) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const result = await repository.registerActivityOutcome({ ...input, workspaceId: currentWorkspace.id, userId: user?.id ?? null })
      const base = await repository.getSnapshot(currentWorkspace.id)
      const lead = base.leads.find((item) => item.id === result.lead.id) ?? result.lead
      await executeAutomationEvent({ triggerType: 'activity_completed', entityId: `${result.activity.id}:${result.activity.updatedAt}`, lead, activityId: result.activity.id, activityType: result.activity.type }, { refreshAfter: false, baseSnapshot: base })
      if (lead.status === 'won') await executeAutomationEvent({ triggerType: 'opportunity_won', entityId: result.resultActivityId, lead }, { refreshAfter: false, baseSnapshot: base })
      if (lead.status === 'lost') await executeAutomationEvent({ triggerType: 'opportunity_lost', entityId: result.resultActivityId, lead }, { refreshAfter: false, baseSnapshot: base })
      await refreshData()
      notify(result.idempotent ? 'info' : 'success', result.idempotent ? 'Este resultado já havia sido registrado; nenhum dado foi duplicado.' : 'Resultado salvo e rotina comercial sincronizada.')
      return result
    },
    async deleteActivity(activityId) { assertWritable(); await repository.deleteActivity(activityId); await refreshData(); notify('success', 'Atividade removida.') },
    async createCadence(leadIds, firstDueAt, template) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const first = new Date(firstDueAt); if (Number.isNaN(first.getTime())) throw new Error('Informe uma data válida.')
      if (!leadIds.length) throw new Error('Selecione pelo menos um lead.')
      if (!template.steps.length) throw new Error('A cadência precisa ter pelo menos uma etapa.')
      const base = await repository.getSnapshot(currentWorkspace.id)
      const cadenceId = createId('cadence')
      let skipped = 0
      const activities: NewActivityInput[] = []
      for (const leadId of leadIds) {
        const duplicate = base.activities.some((activity) => {
          if (activity.leadId !== leadId || activity.completedAt) return false
          const meta = readFollowupMetadata(activity)
          return meta?.kind === 'cadence-step' && meta.cadenceName === template.name
        })
        if (duplicate) { skipped += 1; continue }
        for (let index = 0; index < template.steps.length; index += 1) {
          const step = template.steps[index]
          const due = addBusinessDays(first, Math.max(0, step.offsetDays), template.skipWeekends)
          const description = appendFollowupMetadata(step.objective, {
            version: 1, kind: 'cadence-step', cadenceId, cadenceName: template.name, cadenceCategory: template.category,
            stepIndex: index + 1, stepTotal: template.steps.length, channel: step.channel, objective: step.objective, script: step.script,
          })
          activities.push({ workspaceId: currentWorkspace.id, leadId, type: step.type, title: step.title, description, dueAt: due.toISOString(), completedAt: null, assignedTo: user?.id ?? null, sourceType: 'manual', sourceId: cadenceId })
        }
      }
      const created = activities.length ? (await repository.createActivities(activities)).length : 0
      await refreshData()
      if (created) notify('success', `${created} etapa(s) criada(s) em ${leadIds.length - skipped} lead(s).${skipped ? ` ${skipped} lead(s) já estavam nessa cadência.` : ''}`)
      else notify('info', 'Os leads selecionados já possuem esta cadência ativa.')
      return created
    },
    async createCall(input, recording) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const call = await repository.createCall({ ...input, workspaceId: currentWorkspace.id, userId: user?.id ?? null }, recording)
      const base = await repository.getSnapshot(currentWorkspace.id)
      const lead = base.leads.find((item) => item.id === call.leadId) ?? null
      const attemptCount = base.calls.filter((item) => item.leadId === call.leadId).length
      await executeAutomationEvent({ triggerType: 'call_outcome', entityId: call.id, lead, callOutcome: call.outcome, attemptCount }, { refreshAfter: false, baseSnapshot: base })
      if (call.outcome === 'proposal_sent') await executeAutomationEvent({ triggerType: 'proposal_sent', entityId: call.id, lead, callOutcome: call.outcome, attemptCount }, { refreshAfter: false, baseSnapshot: base })
      await refreshData(); notify('success', 'Ligação salva no histórico.'); return call
    },
    async registerCallOutcome(input, recording) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const result = await repository.registerCallOutcome({ ...input, workspaceId: currentWorkspace.id, userId: user?.id ?? null }, recording)
      const base = await repository.getSnapshot(currentWorkspace.id)
      const lead = base.leads.find((item) => item.id === result.lead.id) ?? result.lead
      const attemptCount = base.calls.filter((item) => item.leadId === result.call.leadId).length
      await executeAutomationEvent({ triggerType: 'call_outcome', entityId: result.call.id, lead, callOutcome: result.call.outcome, attemptCount }, { refreshAfter: false, baseSnapshot: base })
      if (result.call.outcome === 'proposal_sent') await executeAutomationEvent({ triggerType: 'proposal_sent', entityId: result.call.id, lead, callOutcome: result.call.outcome, attemptCount }, { refreshAfter: false, baseSnapshot: base })
      if (result.calendarEventId) await executeAutomationEvent({ triggerType: 'meeting_scheduled', entityId: result.calendarEventId, lead, eventStatus: 'confirmed' }, { refreshAfter: false, baseSnapshot: base })
      if (lead.status === 'won') await executeAutomationEvent({ triggerType: 'opportunity_won', entityId: result.call.id, lead }, { refreshAfter: false, baseSnapshot: base })
      if (lead.status === 'lost') await executeAutomationEvent({ triggerType: 'opportunity_lost', entityId: result.call.id, lead }, { refreshAfter: false, baseSnapshot: base })
      await refreshData()
      notify(result.idempotent ? 'info' : 'success', result.idempotent ? 'Este resultado já havia sido registrado; nenhum dado foi duplicado.' : 'Resultado salvo e CRM sincronizado.')
      return result
    },
    async deleteCall(callId) { assertWritable(); await repository.deleteCall(callId); await refreshData(); notify('success', 'Ligação removida.') },
    async createCalendarEvent(input) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const event = await repository.createCalendarEvent({ ...input, workspaceId: currentWorkspace.id })
      const lead = event.leadId ? (await repository.listLeads(currentWorkspace.id)).find((item) => item.id === event.leadId) ?? null : null
      await executeAutomationEvent({ triggerType: 'meeting_scheduled', entityId: event.id, lead, eventStatus: event.status }, { refreshAfter: false })
      void queueCalendarMutation(currentWorkspace.id, event.id, 'create', event).catch(() => undefined)
      await refreshData(); notify('success', 'Compromisso criado na Agenda.'); return event
    },
    async createCalendarEvents(inputs) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      if (!inputs.length) return []
      const events: CalendarEvent[] = []
      try {
        for (const input of inputs) events.push(await repository.createCalendarEvent({ ...input, workspaceId: currentWorkspace.id }))
      } catch (error) {
        // Uma série precisa ser tudo-ou-nada para não deixar a agenda pela
        // metade quando uma das ocorrências falhar.
        await Promise.allSettled([...events].reverse().map((event) => repository.deleteCalendarEvent(event.id)))
        throw error
      }
      for (const event of events) void queueCalendarMutation(currentWorkspace.id, event.id, 'create', event).catch(() => undefined)
      await refreshData(); notify('success', `${events.length} compromisso(s) criado(s) na Agenda.`); return events
    },
    async updateCalendarEvent(eventId, input) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const before = (await repository.listCalendarEvents(currentWorkspace.id)).find((item) => item.id === eventId) ?? null
      const event = await repository.updateCalendarEvent(eventId, input)
      if (event.status === 'cancelled' && before?.status !== 'cancelled') {
        const lead = event.leadId ? (await repository.listLeads(currentWorkspace.id)).find((item) => item.id === event.leadId) ?? null : null
        await executeAutomationEvent({ triggerType: 'meeting_cancelled', entityId: `${event.id}:${event.updatedAt}`, lead, eventStatus: event.status }, { refreshAfter: false })
      }
      void queueCalendarMutation(currentWorkspace.id, event.id, 'update', event).catch(() => undefined)
      await refreshData(); notify('success', 'Compromisso atualizado.'); return event
    },
    async deleteCalendarEvent(eventId) { assertWritable(); if (!currentWorkspace) throw new Error('Selecione um workspace.'); const before = (await repository.listCalendarEvents(currentWorkspace.id)).find((item) => item.id === eventId) ?? null; await queueCalendarMutation(currentWorkspace.id, eventId, 'delete', before).catch(() => undefined); await repository.deleteCalendarEvent(eventId); await refreshData(); notify('success', 'Compromisso removido.') },

    async createPlaybook(input) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const playbook = await repository.createPlaybook({ ...input, workspaceId: currentWorkspace.id }); await refreshData(); notify('success', 'Playbook criado.'); return playbook
    },
    async updatePlaybook(playbookId, input) { assertWritable(); const playbook = await repository.updatePlaybook(playbookId, input); await refreshData(); notify('success', 'Playbook atualizado.'); return playbook },
    async deletePlaybook(playbookId) { assertWritable(); await repository.deletePlaybook(playbookId); await refreshData(); notify('success', 'Playbook removido.') },
    async createProduct(input) { assertWritable(); if (!currentWorkspace) throw new Error('Selecione um workspace.'); const product = await repository.createProduct({ ...input, workspaceId: currentWorkspace.id }); await refreshData(); notify('success', 'Produto ou serviço cadastrado.'); return product },
    async updateProduct(productId, input) { assertWritable(); const product = await repository.updateProduct(productId, input); await refreshData(); notify('success', 'Produto atualizado.'); return product },
    async deleteProduct(productId) { assertWritable(); await repository.deleteProduct(productId); await refreshData(); notify('success', 'Produto removido.') },
    async createProposal(input) { assertWritable(); if (!currentWorkspace) throw new Error('Selecione um workspace.'); const proposal = await repository.createProposal({ ...input, workspaceId: currentWorkspace.id }); await refreshData(); notify('success', 'Proposta criada.'); return proposal },
    async updateProposal(proposalId, input) { assertWritable(); const proposal = await repository.updateProposal(proposalId, input); await refreshData(); notify('success', 'Proposta atualizada.'); return proposal },
    async createProposalRevision(proposalId) { assertWritable(); const proposal = await repository.createProposalRevision(proposalId); await refreshData(); notify('success', `Revisão v${proposal.version} criada.`); return proposal },
    async updateProposalStatus(proposalId, status) { assertWritable(); const proposal = await repository.updateProposalStatus(proposalId, status); const lead = snapshot?.leads.find((item) => item.id === proposal.leadId); if (lead && status === 'sent') await executeAutomationEvent({ triggerType: 'proposal_sent', entityId: `${proposal.id}:${proposal.updatedAt}`, lead }, { refreshAfter: false }); await refreshData(); notify('success', status === 'accepted' ? 'Aceite registrado. Fechamento e receita continuam separados.' : 'Status da proposta atualizado.'); return proposal },
    async setOfficialProposal(proposalId) { assertWritable(); const proposal = await repository.setOfficialProposal(proposalId); await refreshData(); notify('success', 'Proposta definida como oficial do forecast.'); return proposal },
    async closeOpportunityFromProposal(proposalId) { assertWritable(); const proposal = await repository.closeOpportunityFromProposal(proposalId); const lead = snapshot?.leads.find((item) => item.id === proposal.leadId); if (lead) await executeAutomationEvent({ triggerType: 'opportunity_won', entityId: `${proposal.id}:${proposal.updatedAt}`, lead }, { refreshAfter: false }); await refreshData(); notify('success', 'Oportunidade fechada como ganha. Receita ainda deve ser reconhecida na competência correta.'); return proposal },
    async deleteProposal(proposalId) { assertWritable(); await repository.deleteProposal(proposalId); await refreshData(); notify('success', 'Proposta removida.') },
    async createRevenueEntry(input) { assertWritable(); if (!currentWorkspace) throw new Error('Selecione um workspace.'); const entry = await repository.createRevenueEntry({ ...input, workspaceId: currentWorkspace.id }); await refreshData(); notify('success', 'Receita registrada.'); return entry },
    async updateRevenueEntryStatus(entryId, status) { assertWritable(); const entry = await repository.updateRevenueEntryStatus(entryId, status); await refreshData(); notify('success', 'Receita atualizada.'); return entry },
    async createGoal(input) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const goal = await repository.createGoal({ ...input, workspaceId: currentWorkspace.id }); await refreshData(); notify('success', 'Meta criada.'); return goal
    },
    async updateGoal(goalId, input) { assertWritable(); const goal = await repository.updateGoal(goalId, input); await refreshData(); notify('success', 'Meta atualizada.'); return goal },
    async deleteGoal(goalId) { assertWritable(); await repository.deleteGoal(goalId); await refreshData(); notify('success', 'Meta removida.') },
    async createAutomationRule(input) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const rule = await repository.createAutomationRule({ ...input, workspaceId: currentWorkspace.id, createdBy: user?.id ?? null }); await refreshData(); notify('success', 'Automação criada.'); return rule
    },
    async updateAutomationRule(ruleId, input) { assertWritable(); const rule = await repository.updateAutomationRule(ruleId, input); await refreshData(); notify('success', 'Automação atualizada.'); return rule },
    async deleteAutomationRule(ruleId) { assertWritable(); await repository.deleteAutomationRule(ruleId); await refreshData(); notify('success', 'Automação removida.') },
    async simulateAutomationRule(ruleId, leadId) {
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const base = await repository.getSnapshot(currentWorkspace.id)
      const rule = base.automationRules.find((item) => item.id === ruleId)
      const lead = base.leads.find((item) => item.id === leadId)
      if (!rule || !lead) throw new Error('Automação ou lead não encontrado.')
      const callOutcome = rule.conditions.find((condition) => condition.field === 'call_outcome')?.value
      const stageId = rule.conditions.find((condition) => condition.field === 'stage_id')?.value ?? lead.stageId
      const eventStatus = rule.conditions.find((condition) => condition.field === 'event_status')?.value
      const activityType = rule.conditions.find((condition) => condition.field === 'activity_type')?.value as ActivityItem['type'] | undefined
      const attemptCount = base.calls.filter((call) => call.leadId === lead.id).length
      const event: AutomationEvent = { triggerType: rule.triggerType, entityId: `simulation:${rule.id}:${lead.id}`, lead, callOutcome, stageId, eventStatus, activityType, attemptCount }
      const conditions = visibleAutomationConditions(rule.conditions)
      const conditionResults = conditions.map((condition) => ({
        label: `${conditionFieldLabels[condition.field as Exclude<typeof condition.field, 'automation_guard'>] ?? condition.field} ${operatorLabels[condition.operator]} ${condition.value}`,
        matched: conditionMatches(condition, event),
      }))
      const validation = validateAutomationRule(rule, base.stages)
      return {
        matched: conditionResults.every((item) => item.matched), leadName: lead.name, trigger: triggerLabels[rule.triggerType],
        conditionResults, actions: rule.actions.map((action) => describeAutomationAction(action, base.stages)),
        warnings: [...validation.errors, ...validation.warnings], mode: readAutomationGuard(rule.conditions).mode,
      }
    },
    async runAutomationRule(ruleId, leadId) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const base = await repository.getSnapshot(currentWorkspace.id); const rule = base.automationRules.find((item) => item.id === ruleId); const lead = base.leads.find((item) => item.id === leadId)
      if (!rule || !lead) throw new Error('Automação ou lead não encontrado.')
      const callOutcome = rule.conditions.find((condition) => condition.field === 'call_outcome')?.value
      const stageId = rule.conditions.find((condition) => condition.field === 'stage_id')?.value ?? lead.stageId
      const eventStatus = rule.conditions.find((condition) => condition.field === 'event_status')?.value
      const activityType = rule.conditions.find((condition) => condition.field === 'activity_type')?.value as ActivityItem['type'] | undefined
      const attemptCount = base.calls.filter((call) => call.leadId === lead.id).length
      const count = await executeAutomationEvent({ triggerType: rule.triggerType, entityId: `test:${rule.id}:${lead.id}`, lead, callOutcome, stageId, eventStatus, activityType, attemptCount }, { ruleId, forceRule: true, baseSnapshot: base })
      notify(count ? 'success' : 'info', count ? 'Teste real executado e registrado.' : 'O lead não atende às condições da regra.')
      return count
    },
    async runAutomationChecks() { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const base = await repository.getSnapshot(currentWorkspace.id)
      const now = new Date(); const dayKey = now.toISOString().slice(0, 10); let count = 0
      for (const activity of base.activities.filter((item) => item.dueAt && !item.completedAt && new Date(item.dueAt).getTime() < now.getTime())) {
        const lead = base.leads.find((item) => item.id === activity.leadId) ?? null
        const attempts = lead ? base.calls.filter((call) => call.leadId === lead.id).length : 0
        count += await executeAutomationEvent({ triggerType: 'activity_overdue', entityId: `${activity.id}:${dayKey}`, lead, activityId: activity.id, activityType: activity.type, attemptCount: attempts, now: now.toISOString() }, { refreshAfter: false, baseSnapshot: base })
      }
      for (const lead of base.leads.filter((item) => item.status === 'active')) {
        const attempts = base.calls.filter((call) => call.leadId === lead.id).length
        if (lead.nextActionAt && new Date(lead.nextActionAt).getTime() <= now.getTime()) {
          count += await executeAutomationEvent({ triggerType: 'date_reached', entityId: `${lead.id}:${dayKey}`, lead, stageId: lead.stageId, attemptCount: attempts, now: now.toISOString() }, { refreshAfter: false, baseSnapshot: base })
        }
        const daysWithoutMovement = Math.floor((now.getTime() - new Date(lead.updatedAt).getTime()) / 86_400_000)
        if (daysWithoutMovement >= 1) {
          count += await executeAutomationEvent({ triggerType: 'lead_stale', entityId: `${lead.id}:${dayKey}`, lead, stageId: lead.stageId, attemptCount: attempts, now: now.toISOString() }, { refreshAfter: false, baseSnapshot: base })
        }
      }
      for (const goal of base.goals) {
        const isCurrent = goal.periodStart <= dayKey && goal.periodEnd >= dayKey
        if (!isCurrent) continue
        const progress = goalProgress(base, goal.metric, goal.targetValue, goal.periodStart, goal.periodEnd, goal.userId)
        if (progress.pace === 'at_risk') {
          count += await executeAutomationEvent({ triggerType: 'goal_at_risk', entityId: `${goal.id}:${dayKey}`, lead: null, now: now.toISOString() }, { refreshAfter: false, baseSnapshot: base })
        }
      }
      if (count) await refreshData()
      notify(count ? 'success' : 'info', count ? `${count} automação(ões) processada(s) nas checagens.` : 'Nenhuma regra elegível nas checagens operacionais.')
      return count
    },
    async undoAutomationRun(runId) { assertWritable();
      const run = snapshot?.automationRuns.find((item) => item.id === runId)
      if (!run || run.status !== 'success') throw new Error('Somente execuções concluídas podem ser desfeitas.')
      const mutations = [...(run.output.mutations ?? [])].reverse()
      for (const mutation of mutations) {
        if (mutation.kind === 'activity_create' && mutation.activityId) await repository.deleteActivity(mutation.activityId)
        if (mutation.kind === 'activity_update' && mutation.activityId && mutation.before) await repository.updateActivity(mutation.activityId, { completedAt: mutation.before.completedAt ?? null })
        if (mutation.kind === 'event_create' && mutation.eventId) await repository.deleteCalendarEvent(mutation.eventId)
        if (mutation.kind === 'lead_update' && mutation.leadId && mutation.before) await repository.updateLead(mutation.leadId, mutation.before)
      }
      const updated = await repository.finishAutomationRun(run.id, 'undone', { ...run.output, message: 'Execução desfeita com restauração dos registros reversíveis.' })
      await refreshData(); notify('success', 'Execução desfeita.'); return updated
    },
    async restoreWorkspaceBackup(file) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const parsed = JSON.parse(await file.text()) as { workspace?: { snapshot?: WorkspaceSnapshot }; snapshot?: WorkspaceSnapshot }
      const source = parsed.workspace?.snapshot ?? parsed.snapshot
      if (!source || !Array.isArray(source.leads) || !Array.isArray(source.stages)) throw new Error('O arquivo não contém um snapshot completo reconhecível.')
      const target = await repository.getSnapshot(currentWorkspace.id)
      const warnings: string[] = []
      const created = { leads: [] as string[], activities: [] as string[], calls: [] as string[], events: [] as string[], playbooks: [] as string[], goals: [] as string[], rules: [] as string[] }
      const stageMap = new Map(source.stages.map((stage) => {
        const matched = target.stages.find((item) => item.name.trim().toLocaleLowerCase('pt-BR') === stage.name.trim().toLocaleLowerCase('pt-BR'))
          ?? target.stages.find((item) => item.isWon === stage.isWon && item.isLost === stage.isLost)
          ?? target.stages[0]
        return [stage.id, matched?.id ?? '']
      }))
      const leadMap = new Map<string, string>()
      const keyForLead = (lead: Lead) => `${lead.phone.replace(/\D/g, '')}|${lead.email.trim().toLocaleLowerCase('pt-BR')}|${lead.name.trim().toLocaleLowerCase('pt-BR')}|${lead.company.trim().toLocaleLowerCase('pt-BR')}`
      let imported = 0
      try {
        for (const lead of source.leads) {
          const existing = target.leads.find((item) => keyForLead(item) === keyForLead(lead))
          if (existing) { leadMap.set(lead.id, existing.id); warnings.push(`${lead.name}: lead já existente; dados operacionais vinculados ao cadastro atual.`); continue }
          const restored = await repository.createLead({
            workspaceId: currentWorkspace.id, name: lead.name, company: lead.company, phone: lead.phone, email: lead.email, city: lead.city,
            source: lead.source, stageId: stageMap.get(lead.stageId) || target.stages[0].id, status: lead.status, temperature: lead.temperature,
            priority: lead.priority, ownerId: null, ownerName: lead.ownerName || 'Equipe', value: lead.value, nextActionAt: lead.nextActionAt, notes: lead.notes, tags: lead.tags,
          })
          leadMap.set(lead.id, restored.id); created.leads.push(restored.id); imported += 1
        }
        for (const activity of source.activities.filter((item) => item.sourceType !== 'call' && item.sourceType !== 'calendar')) {
          const restored = await repository.createActivity({ workspaceId: currentWorkspace.id, leadId: activity.leadId ? leadMap.get(activity.leadId) ?? null : null, type: activity.type, title: activity.title, description: activity.description, dueAt: activity.dueAt, completedAt: activity.completedAt, assignedTo: null, sourceType: activity.sourceType, sourceId: activity.sourceId })
          created.activities.push(restored.id); imported += 1
        }
        for (const call of source.calls) {
          const leadId = leadMap.get(call.leadId); if (!leadId) { warnings.push('Uma ligação sem lead correspondente foi ignorada.'); continue }
          const restored = await repository.createCall({ workspaceId: currentWorkspace.id, leadId, userId: null, outcome: call.outcome, durationSeconds: call.durationSeconds, notes: call.notes, transcript: call.transcript, recordingPath: null, consentAt: call.consentAt ?? null, startedAt: call.startedAt, endedAt: call.endedAt })
          created.calls.push(restored.id); imported += 1
          if (call.recordingPath) warnings.push(`Ligação de ${source.leads.find((lead) => lead.id === call.leadId)?.name ?? 'lead'}: metadados restaurados sem o arquivo de áudio.`)
        }
        for (const event of source.events) {
          const restored = await repository.createCalendarEvent({ workspaceId: currentWorkspace.id, leadId: event.leadId ? leadMap.get(event.leadId) ?? null : null, title: event.title, description: event.description, startsAt: event.startsAt, endsAt: event.endsAt, allDay: event.allDay, location: event.location, status: event.status, assignedTo: null })
          created.events.push(restored.id); imported += 1
        }
        for (const playbook of source.playbooks) {
          if (target.playbooks.some((item) => item.kind === playbook.kind && item.title.toLocaleLowerCase('pt-BR') === playbook.title.toLocaleLowerCase('pt-BR'))) continue
          const restored = await repository.createPlaybook({ workspaceId: currentWorkspace.id, kind: playbook.kind, title: playbook.title, category: playbook.category, content: playbook.content, tags: playbook.tags, active: playbook.active })
          created.playbooks.push(restored.id); imported += 1
        }
        for (const goal of source.goals) {
          if (target.goals.some((item) => item.metric === goal.metric && item.periodStart === goal.periodStart && item.periodEnd === goal.periodEnd)) continue
          const restored = await repository.createGoal({ workspaceId: currentWorkspace.id, userId: null, userName: goal.userName || 'Equipe', metric: goal.metric, targetValue: goal.targetValue, periodStart: goal.periodStart, periodEnd: goal.periodEnd })
          created.goals.push(restored.id); imported += 1
        }
        for (const rule of source.automationRules) {
          if (target.automationRules.some((item) => item.name.toLocaleLowerCase('pt-BR') === rule.name.toLocaleLowerCase('pt-BR'))) continue
          const actions = rule.actions.map((action) => action.type === 'move_stage' ? { ...action, value: stageMap.get(action.value) ?? action.value } : action)
          const conditions = rule.conditions.map((condition) => condition.field === 'stage_id' ? { ...condition, value: stageMap.get(condition.value) ?? condition.value } : condition)
          const restored = await repository.createAutomationRule({ workspaceId: currentWorkspace.id, name: rule.name, enabled: false, triggerType: rule.triggerType, conditions, actions, createdBy: user?.id ?? null })
          created.rules.push(restored.id); imported += 1
        }
        if (source.automationRules.some((rule) => rule.enabled)) warnings.push('Automações restauradas em modo desativado para revisão segura.')
      } catch (restoreError) {
        await Promise.allSettled(created.rules.reverse().map((id) => repository.deleteAutomationRule(id)))
        await Promise.allSettled(created.goals.reverse().map((id) => repository.deleteGoal(id)))
        await Promise.allSettled(created.playbooks.reverse().map((id) => repository.deletePlaybook(id)))
        await Promise.allSettled(created.events.reverse().map((id) => repository.deleteCalendarEvent(id)))
        await Promise.allSettled(created.calls.reverse().map((id) => repository.deleteCall(id)))
        await Promise.allSettled(created.activities.reverse().map((id) => repository.deleteActivity(id)))
        await Promise.allSettled(created.leads.reverse().map((id) => repository.deleteLead(id)))
        throw restoreError
      }
      await refreshData(); notify('success', `${imported} registro(s) restaurado(s) com validação.`)
      return { imported, warnings }
    },
    async importLegacyBackup(file) { assertWritable();
      if (!currentWorkspace || !snapshot) throw new Error('Selecione um workspace.')
      const result = importV99Backup(await file.text(), currentWorkspace.id, snapshot.stages)
      const imported = await repository.importLeads(currentWorkspace.id, result.leads)
      const base = await repository.getSnapshot(currentWorkspace.id)
      for (const importedLead of result.leads) {
        const lead = base.leads.find((item) => item.id === importedLead.id)
        if (lead) await executeAutomationEvent({ triggerType: 'lead_imported', entityId: lead.id, lead }, { refreshAfter: false, baseSnapshot: base })
      }
      await refreshData(); notify('success', `${imported} lead(s) importado(s) da V99.`); return { imported, warnings: result.warnings }
    },
    async importLeadFile(file) { assertWritable();
      if (!currentWorkspace || !snapshot) throw new Error('Selecione um workspace.')
      const text = await file.text(); const result = file.name.toLowerCase().endsWith('.json') || text.trim().startsWith('{') || text.trim().startsWith('[')
        ? importV99Backup(text, currentWorkspace.id, snapshot.stages) : parseLeadCsv(text, currentWorkspace.id, snapshot.stages)
      const imported = await repository.importLeads(currentWorkspace.id, result.leads)
      const base = await repository.getSnapshot(currentWorkspace.id)
      for (const importedLead of result.leads) {
        const lead = base.leads.find((item) => item.id === importedLead.id)
        if (lead) await executeAutomationEvent({ triggerType: 'lead_imported', entityId: lead.id, lead }, { refreshAfter: false, baseSnapshot: base })
      }
      await refreshData(); notify('success', `${imported} lead(s) importado(s).`); return { imported, warnings: result.warnings }
    },
    notify,
  }), [actionDialog, assertWritable, bootstrap, canWrite, confirmAction, currentWorkspace, dismissToast, error, executeAutomationEvent, health, loadWorkspace, loading, notify, promptAction, refreshData, repository, resolveActionDialog, route, snapshot, toasts, user?.id, workspaces])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export const useApp = () => {
  const value = useContext(AppContext); if (!value) throw new Error('useApp deve ser usado dentro de AppProvider.'); return value
}
