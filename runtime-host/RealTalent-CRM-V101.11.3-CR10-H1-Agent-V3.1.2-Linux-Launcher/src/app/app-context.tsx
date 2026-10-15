import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import type { ActivityItem, AppRoute, AuditLog, AutomationRule, AutomationRun, CalendarEvent, CallRecord, CommercialStructureSyncResult, CompanyRecord, ContactRecord, ContactRelationship, Goal, Lead, PipelineStage, Playbook, ProductRecord, ProposalRecord, ProposalStatus, RevenueEntry, RepositoryHealth, Workspace, WorkspaceInvite, WorkspaceMember, WorkspaceRole, WorkspaceSnapshot } from '../domain/types'
import { createRepository } from '../repositories/create-repository'
import type {
  CommercialActionResult, CommercialActivityResult, OperationalDataClearResult, NewActivityInput, NewAutomationRuleInput, NewCalendarEventInput, NewCallInput, NewCompanyInput, NewContactInput, NewContactRelationshipInput, NewGoalInput, NewLeadInput, NewPlaybookInput, NewProductInput, NewProposalInput, NewRevenueEntryInput, NewStageInput, RegisterActivityOutcomeInput, RegisterCallOutcomeInput, UpdateActivityInput,
  UpdateAutomationRuleInput, UpdateCalendarEventInput, UpdateCompanyInput, UpdateContactInput, UpdateContactRelationshipInput, UpdateGoalInput, UpdateLeadInput, UpdatePlaybookInput, UpdateProductInput, UpdateProposalInput, UpdateStageInput,
} from '../repositories/crm-repository'
import { importV99Backup } from '../services/v99-importer'
import { parseLeadCsv } from '../services/lead-csv'
import { safeStorage } from '../lib/storage'
import { useAuth } from '../features/auth/auth-context'
import { automationCorrelationId, automationEventKey, automationLoopDetected, conditionMatches, ruleMatches, type AutomationEvent } from '../services/automation-engine'
import { actionLabels, automationRunForLeadToday, conditionFieldLabels, describeAutomationAction, latestAutomationRunForLead, operatorLabels, readAutomationGuard, triggerLabels, validateAutomationRule, visibleAutomationConditions, type AutomationSimulationResult } from '../services/automation-workspace'
import { addBusinessDays, appendFollowupMetadata, cadencePolicy, readFollowupMetadata, type CadenceTemplateInput } from '../services/followup-workspace'
import { buildCadenceOutcomePatches, buildCadenceStatePatches } from '../services/sales-engagement'
import { createId } from '../lib/id'
import { goalProgress } from '../services/metrics'
import { recordDiagnostic } from '../lib/diagnostics'
import { recordContactDraft, recordSellerNotification } from '../services/automation-operations'
import { dispatchAutomationWebhook } from '../services/automation-webhooks'
import { createAutomationEventExecutor } from '../services/automation-event-executor'
import { queueCalendarMutation } from '../services/calendar-integration'
import { normalizeSnapshotForRender } from '../services/snapshot-safety'
import { restoreWorkspaceBackupToRepository } from '../services/workspace-backup-restore'
import { routeContextFromHash, routeFromHash, routeToHash, type RouteContext } from './route-state'
import { closeTransientOverlays } from './overlay-manager'
import { buyerRoomPatchForProposal } from '../services/buyer-room'
import { primaryProposalPipelineStage } from '../services/proposal-pipeline'
import { createWorkspaceShellSnapshot, loadProgressiveWorkspaceSnapshot, loadSnapshotPatch, loadWorkspaceSnapshotSlices, snapshotSlicesForRoute, type SnapshotSlice } from '../services/snapshot-refresh'
import { ensureProposalRevenueSchedule } from '../services/revenue-contract-bridge'
import {
  createDomainEvent, createEventRefreshCoordinator, domainEventBus, installEventInspector,
  useGlobalRealtimeBridge,
  type DomainEventName, type DomainEventSource,
} from '../platform/events'
import { assertFieldWrite, assertPermission, can as canPermission, type PermissionAction, type PermissionRequest, type PermissionResource, type PermissionSubject } from '../platform/permissions'
import { accessActionAllowed, accessCanApprove, accessRecordAllowed, accessScopeFor, assertAccess as assertTeamAccess, assertSensitiveField, defaultAccessProfiles, loadTeamAccessControl, resolveMemberAccess, type EffectiveMemberAccess } from '../services/team-access-control'
import { approvalStatusForEntity, proposalApprovalReasons, recordTeamSecurityAudit, requestTeamApproval } from '../services/team-governance'
import { loadWorkManagement } from '../services/work-management'
import { readAgendaMetadata } from '../services/agenda-workspace'

import type { ActionDialogState, AppContextValue, ConfirmActionOptions, PromptActionOptions, ToastMessage, ToastOptions } from './app-context-types'
export type { ActionDialogState, ActionDialogTone, ConfirmActionOptions, PromptActionOptions, ToastAction, ToastMessage, ToastOptions } from './app-context-types'

const AppContext = createContext<AppContextValue | null>(null)

type AppNavigationKeys = 'route' | 'routeContext' | 'setRoute' | 'navigate' | 'clearRouteContext'
type AppWorkspaceKeys = 'repositoryMode' | 'health' | 'workspaces' | 'currentWorkspace' | 'currentUserId' | 'teamAccess' | 'canWrite' | 'can' | 'canTeamAccess' | 'teamAccessScope' | 'canTeamAccessRecord' | 'snapshot' | 'loading' | 'routeDataLoading' | 'loadedSnapshotSlices' | 'error'
type AppUiKeys = 'toasts' | 'dismissToast' | 'actionDialog' | 'confirmAction' | 'promptAction' | 'resolveActionDialog' | 'notify'

export type AppNavigationContextValue = Pick<AppContextValue, AppNavigationKeys>
export type AppWorkspaceContextValue = Pick<AppContextValue, AppWorkspaceKeys>
export type AppUiContextValue = Pick<AppContextValue, AppUiKeys>
export type AppActionsContextValue = Omit<AppContextValue, AppNavigationKeys | AppWorkspaceKeys | AppUiKeys>

const AppNavigationContext = createContext<AppNavigationContextValue | null>(null)
const AppWorkspaceContext = createContext<AppWorkspaceContextValue | null>(null)
const AppUiContext = createContext<AppUiContextValue | null>(null)
const AppActionsContext = createContext<AppActionsContextValue | null>(null)
const ACTIVE_WORKSPACE_KEY = 'realtalent-crm-v100-active-workspace'

export function AppProvider({ children }: PropsWithChildren) {
  const { user, loading: authLoading } = useAuth()
  const repository = useRef(createRepository()).current
  const [route, setRouteState] = useState<AppRoute>(() => routeFromHash(window.location.hash))
  const routeRef = useRef(route)
  routeRef.current = route
  const [routeContext, setRouteContext] = useState<RouteContext>(() => routeContextFromHash(window.location.hash))
  const navigate = useCallback((nextRoute: AppRoute, context: RouteContext = {}) => {
    closeTransientOverlays()
    setRouteState(nextRoute); setRouteContext(context)
    const nextHash = routeToHash(nextRoute, context)
    if (window.location.hash !== nextHash) window.history.pushState({ route: nextRoute, context }, '', nextHash)
  }, [])
  const setRoute = useCallback((nextRoute: AppRoute) => navigate(nextRoute), [navigate])
  const clearRouteContext = useCallback((keys?: Array<keyof RouteContext>) => {
    setRouteContext((current) => {
      const next = keys?.length
        ? Object.fromEntries(Object.entries(current).filter(([key]) => !keys.includes(key as keyof RouteContext))) as RouteContext
        : {}
      const nextHash = routeToHash(route, next)
      if (window.location.hash !== nextHash) window.history.replaceState({ route, context: next }, '', nextHash)
      return next
    })
  }, [route])
  const [health, setHealth] = useState<RepositoryHealth | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [currentWorkspace, setCurrentWorkspaceState] = useState<Workspace | null>(null)
  const [teamAccess, setTeamAccess] = useState<EffectiveMemberAccess | null>(null)
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [routeDataLoading, setRouteDataLoading] = useState(false)
  const [loadedSnapshotSlices, setLoadedSnapshotSlices] = useState<SnapshotSlice[]>([])
  const loadedSnapshotSlicesRef = useRef(new Set<SnapshotSlice>())
  const routeHydrationRevision = useRef(0)
  const [error, setError] = useState<string | null>(null)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const toastId = useRef(0)
  const toastTimers = useRef(new Map<number, number>())
  const recentToastKeys = useRef(new Map<string, number>())
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(null)
  const actionDialogId = useRef(0)

  useEffect(() => {
    const syncRouteFromLocation = () => { closeTransientOverlays(); setRouteState(routeFromHash(window.location.hash)); setRouteContext(routeContextFromHash(window.location.hash)) }
    if (!window.location.hash) window.history.replaceState({ route: 'dashboard' }, '', routeToHash('dashboard'))
    window.addEventListener('popstate', syncRouteFromLocation)
    window.addEventListener('hashchange', syncRouteFromLocation)
    return () => {
      window.removeEventListener('popstate', syncRouteFromLocation)
      window.removeEventListener('hashchange', syncRouteFromLocation)
    }
  }, [])
  const actionDialogResolver = useRef<((value: boolean | string | null) => void) | null>(null)

  const dismissToast = useCallback((id: number) => {
    const timer = toastTimers.current.get(id)
    if (timer) window.clearTimeout(timer)
    toastTimers.current.delete(id)
    setToasts((current) => current.map((toast) => toast.id === id ? { ...toast, closing: true } : toast))
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 180)
  }, [])

  const notify = useCallback((type: ToastMessage['type'], message: string, options?: ToastOptions) => {
    const now = Date.now()
    const toastKey = `${type}:${message}:${options?.action?.label ?? ''}`
    const lastSeen = recentToastKeys.current.get(toastKey) ?? 0
    if (now - lastSeen < 1800) return
    recentToastKeys.current.set(toastKey, now)
    for (const [key, timestamp] of recentToastKeys.current) if (now - timestamp > 12_000) recentToastKeys.current.delete(key)

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

  const permissionSubject = useMemo<PermissionSubject | null>(() => currentWorkspace ? ({ workspaceId: currentWorkspace.id, userId: user?.id ?? null, role: currentWorkspace.role }) : null, [currentWorkspace, user?.id])
  const can = useCallback((action: PermissionAction, resource: PermissionResource, field?: string) => Boolean(permissionSubject && canPermission(permissionSubject, { action, resource, ...(field ? { field } : {}) })), [permissionSubject, teamAccess])
  const canTeamAccess = useCallback((action: import('../domain/types').TeamAccessAction, resource: import('../domain/types').TeamAccessResource) => accessActionAllowed(teamAccess, action, resource), [teamAccess])
  const teamAccessScope = useCallback((resource: import('../domain/types').TeamAccessResource) => accessScopeFor(teamAccess, resource), [teamAccess])
  const canTeamAccessRecord = useCallback((resource: import('../domain/types').TeamAccessResource, ownerId?: string | null, teamId?: string | null) => accessRecordAllowed(teamAccess, resource, ownerId, teamId), [teamAccess])
  const canWrite = can('update', 'lead') && (canTeamAccess('edit','contacts') || canTeamAccess('edit','pipeline'))
  const assertAuthorized = useCallback((request: PermissionRequest) => {
    if (!permissionSubject) throw new Error('Selecione um workspace.')
    return assertPermission(permissionSubject, request)
  }, [permissionSubject])
  const assertWritable = useCallback(() => { assertAuthorized({ action: 'update', resource: 'lead' }) }, [assertAuthorized])

  const loadWorkspace = useCallback(async (workspace: Workspace) => {
    setLoading(true); setError(null)
    try {
      const [progressive, accessSnapshot, workManagement] = await Promise.all([
        loadProgressiveWorkspaceSnapshot(repository, workspace, routeRef.current),
        loadTeamAccessControl(repository.mode, workspace.id).catch(() => ({ profiles: defaultAccessProfiles(workspace.id), assignments: [] })),
        loadWorkManagement(repository.mode, workspace.id).catch(() => ({ teams: [], memberships: [], tasks: [], relations: [], checklistItems: [], comments: [] })),
      ])
      loadedSnapshotSlicesRef.current = new Set(progressive.slices)
      setLoadedSnapshotSlices(progressive.slices)
      setTeamAccess(resolveMemberAccess(workspace.id, user?.id ?? null, workspace.role, accessSnapshot, workManagement.memberships))
      setCurrentWorkspaceState(workspace); setSnapshot(normalizeSnapshotForRender(progressive.snapshot)); safeStorage.setItem(ACTIVE_WORKSPACE_KEY, workspace.id)
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Falha ao carregar o workspace.'
      recordDiagnostic({ severity: 'error', source: 'workspace', message, route: window.location.hash || 'dashboard', workspaceId: workspace.id })
      setError(message); notify('error', message)
    } finally { setLoading(false) }
  }, [notify, repository, user?.id])

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
    if (!user) {
      loadedSnapshotSlicesRef.current.clear(); setLoadedSnapshotSlices([]); setRouteDataLoading(false); setWorkspaces([]); setCurrentWorkspaceState(null); setTeamAccess(null); setSnapshot(null); setError(null); setLoading(false); return
    }
    void bootstrap()
  }, [authLoading, bootstrap, user])

  useEffect(() => {
    if (!currentWorkspace) return
    const refreshAccess = async (event?: Event) => {
      const custom = event as CustomEvent<{ workspaceId?: string }>
      if (custom.detail?.workspaceId && custom.detail.workspaceId !== currentWorkspace.id) return
      try {
        const [accessSnapshot, workManagement] = await Promise.all([loadTeamAccessControl(repository.mode,currentWorkspace.id), loadWorkManagement(repository.mode,currentWorkspace.id)])
        setTeamAccess(resolveMemberAccess(currentWorkspace.id,user?.id ?? null,currentWorkspace.role,accessSnapshot,workManagement.memberships))
      } catch {
        setTeamAccess(resolveMemberAccess(currentWorkspace.id,user?.id ?? null,currentWorkspace.role,{profiles:defaultAccessProfiles(currentWorkspace.id),assignments:[]},[]))
      }
    }
    const handler = (event: Event) => { void refreshAccess(event) }
    window.addEventListener('realtalent:team-access-changed', handler)
    return () => window.removeEventListener('realtalent:team-access-changed', handler)
  }, [currentWorkspace, repository.mode, user?.id])

  const refreshData = useCallback(async () => {
    if (!currentWorkspace) return
    const slices = [...loadedSnapshotSlicesRef.current]
    const patch = await loadSnapshotPatch(repository, currentWorkspace.id, slices.length ? slices : snapshotSlicesForRoute(route))
    setSnapshot((current) => current && current.workspace.id === currentWorkspace.id ? normalizeSnapshotForRender({ ...current, ...patch }) : current)
    setHealth(await repository.health())
  }, [currentWorkspace, repository, route])

  const refreshSlices = useCallback(async (slices: SnapshotSlice[], workspaceId = currentWorkspace?.id) => {
    if (!workspaceId || !slices.length) return
    const routeSlices = new Set(snapshotSlicesForRoute(routeRef.current))
    const activeSlices = [...new Set(slices)].filter((slice) => loadedSnapshotSlicesRef.current.has(slice) || routeSlices.has(slice))
    if (!activeSlices.length) return
    const patch = await loadSnapshotPatch(repository, workspaceId, activeSlices)
    for (const slice of activeSlices) loadedSnapshotSlicesRef.current.add(slice)
    setLoadedSnapshotSlices([...loadedSnapshotSlicesRef.current])
    setSnapshot((current) => current && current.workspace.id === workspaceId ? normalizeSnapshotForRender({ ...current, ...patch }) : current)
  }, [currentWorkspace?.id, repository])

  useEffect(() => {
    if (!currentWorkspace?.id || !snapshot) return
    const required = snapshotSlicesForRoute(route)
    const missing = required.filter((slice) => !loadedSnapshotSlicesRef.current.has(slice))
    if (!missing.length) { setRouteDataLoading(false); return }
    const revision = ++routeHydrationRevision.current
    setRouteDataLoading(true)
    void loadSnapshotPatch(repository, currentWorkspace.id, missing).then((patch) => {
      if (revision !== routeHydrationRevision.current) return
      for (const slice of missing) loadedSnapshotSlicesRef.current.add(slice)
      setLoadedSnapshotSlices([...loadedSnapshotSlicesRef.current])
      setSnapshot((current) => current && current.workspace.id === currentWorkspace.id ? normalizeSnapshotForRender({ ...current, ...patch }) : current)
    }).catch((routeError) => {
      recordDiagnostic({ severity: 'warning', source: 'snapshot-hydration', message: routeError instanceof Error ? routeError.message : 'Falha ao carregar dados do módulo.', route, workspaceId: currentWorkspace.id })
      notify('error', routeError instanceof Error ? routeError.message : 'Não foi possível carregar os dados deste módulo.')
    }).finally(() => { if (revision === routeHydrationRevision.current) setRouteDataLoading(false) })
  }, [currentWorkspace?.id, notify, repository, route, snapshot?.workspace.id])

  useEffect(() => {
    installEventInspector()
    if (!currentWorkspace?.id) return
    const coordinator = createEventRefreshCoordinator({ workspaceId: currentWorkspace.id, refreshSlices })
    const unsubscribe = domainEventBus.subscribe('*', coordinator.onEvent)
    return () => { unsubscribe(); coordinator.dispose() }
  }, [currentWorkspace?.id, refreshSlices])

  const publishDomainChange = useCallback(async (
    name: DomainEventName,
    options: { entityType?: string; entityId?: string | null; source?: DomainEventSource; payload?: Record<string, unknown> } = {},
  ) => {
    if (!currentWorkspace?.id) return
    await domainEventBus.publish(createDomainEvent({
      name, workspaceId: currentWorkspace.id, source: options.source ?? 'ui',
      entityType: options.entityType ?? null, entityId: options.entityId ?? null, payload: options.payload ?? {},
    }))
  }, [currentWorkspace?.id])

  const refreshRealtimeSlice = useCallback(async (slice: SnapshotSlice, workspaceId: string) => {
    try { await refreshSlices([slice], workspaceId) }
    catch (realtimeError) {
      recordDiagnostic({ severity: 'warning', source: 'realtime', message: realtimeError instanceof Error ? realtimeError.message : 'Falha ao atualizar dados em tempo real.', route: window.location.hash || 'dashboard', workspaceId })
    }
  }, [refreshSlices])

  useGlobalRealtimeBridge(currentWorkspace?.id, repository.mode)



  const executeAutomationEvent = useMemo(() => createAutomationEventExecutor({ workspaceId: currentWorkspace?.id ?? null, repository, notify, refreshData: () => refreshSlices(['commercial', 'activities', 'events', 'automationRuns']) }), [currentWorkspace?.id, notify, refreshSlices, repository])

  const value = useMemo<AppContextValue>(() => ({
    route, routeContext, setRoute, navigate, clearRouteContext, repositoryMode: repository.mode, health, workspaces, currentWorkspace, canWrite, can, snapshot, loading, routeDataLoading, loadedSnapshotSlices, error, toasts, dismissToast, actionDialog, confirmAction, promptAction, resolveActionDialog,
    reinitialize: bootstrap,
    async synchronizeCommercialStructure() { assertAuthorized({ action: 'manage', resource: 'workspace' }); if (!currentWorkspace) throw new Error('Selecione um workspace.'); const result = await repository.synchronizeCommercialStructure(currentWorkspace.id); await publishDomainChange('commercial.structure.changed', { entityType: 'workspace', entityId: currentWorkspace.id }); notify('success', `Estrutura sincronizada: ${result.leadsLinked} lead(s) vinculados.`); return result },
    async createCompany(input) { assertAuthorized({ action: 'create', resource: 'company' }); if (!currentWorkspace) throw new Error('Selecione um workspace.'); const company = await repository.createCompany({ ...input, workspaceId: currentWorkspace.id }); await publishDomainChange('commercial.record.created', { entityType: 'company', entityId: company.id }); notify('success', 'Empresa adicionada ao CRM.'); return company },
    async updateCompany(companyId, input) { if (!permissionSubject) throw new Error('Selecione um workspace.'); assertFieldWrite(permissionSubject, 'company', Object.keys(input)); const company = await repository.updateCompany(companyId, input); await publishDomainChange('commercial.record.updated', { entityType: 'company', entityId: company.id }); return company },
    async createContact(input) { assertAuthorized({ action: 'create', resource: 'contact' }); if (input.phone) assertSensitiveField(teamAccess,'contact_phone','edit'); if (input.email) assertSensitiveField(teamAccess,'contact_email','edit'); if (!currentWorkspace) throw new Error('Selecione um workspace.'); const contact = await repository.createContact({ ...input, workspaceId: currentWorkspace.id }); await publishDomainChange('commercial.record.created', { entityType: 'contact', entityId: contact.id }); notify('success', 'Pessoa adicionada à conta.'); return contact },
    async updateContact(contactId, input) { if (!permissionSubject) throw new Error('Selecione um workspace.'); assertFieldWrite(permissionSubject, 'contact', Object.keys(input)); if (input.phone !== undefined) assertSensitiveField(teamAccess,'contact_phone','edit'); if (input.email !== undefined) assertSensitiveField(teamAccess,'contact_email','edit'); if (!currentWorkspace) throw new Error('Selecione um workspace.'); const contact = await repository.updateContact(contactId, input); await publishDomainChange('commercial.record.updated', { entityType: 'contact', entityId: contact.id }); notify('success', 'Stakeholder atualizado.'); return contact },
    async deleteContact(contactId) { assertAuthorized({ action: 'delete', resource: 'contact' }); if (!currentWorkspace) throw new Error('Selecione um workspace.'); await repository.deleteContact(contactId); await publishDomainChange('commercial.record.deleted', { entityType: 'contact', entityId: contactId }); notify('success', 'Pessoa removida da conta.') },
    async createContactRelationship(input) { assertWritable(); if (!currentWorkspace) throw new Error('Selecione um workspace.'); const relationship = await repository.createContactRelationship({ ...input, workspaceId: currentWorkspace.id }); await publishDomainChange('commercial.record.created', { entityType: 'contact_relationship', entityId: relationship.id }); notify('success', 'Relação adicionada ao mapa da conta.'); return relationship },
    async updateContactRelationship(relationshipId, input) { assertWritable(); if (!currentWorkspace) throw new Error('Selecione um workspace.'); const relationship = await repository.updateContactRelationship(relationshipId, input); await publishDomainChange('commercial.record.updated', { entityType: 'contact_relationship', entityId: relationship.id }); notify('success', 'Relação atualizada.'); return relationship },
    async deleteContactRelationship(relationshipId) { assertWritable(); if (!currentWorkspace) throw new Error('Selecione um workspace.'); await repository.deleteContactRelationship(relationshipId); await publishDomainChange('commercial.record.deleted', { entityType: 'contact_relationship', entityId: relationshipId }); notify('success', 'Relação removida.') },
    async setCurrentWorkspace(id) {
      const workspace = workspaces.find((item) => item.id === id); if (!workspace) throw new Error('Workspace não encontrado.'); await loadWorkspace(workspace)
    },
    async createWorkspace(name) {
      const workspace = await repository.createWorkspace(name); setWorkspaces(await repository.listWorkspaces()); await loadWorkspace(workspace); notify('success', 'Workspace criado com etapas padrão.')
    },
    async listWorkspaceMembers() { if (!currentWorkspace) return []; return repository.listWorkspaceMembers(currentWorkspace.id) },
    async createWorkspaceMember(input) { assertAuthorized({ action: 'manage', resource: 'workspace' }); if (!currentWorkspace) throw new Error('Selecione um workspace.'); const member = await repository.createWorkspaceMember(currentWorkspace.id, input); notify('success', `${member.displayName} adicionado à equipe local.`); return member },
    async createWorkspaceInvite(email, role) { assertAuthorized({ action: 'manage', resource: 'workspace' }); if (!currentWorkspace) throw new Error('Selecione um workspace.'); const invite = await repository.createWorkspaceInvite(currentWorkspace.id, email, role); notify('success', 'Convite criado.'); return invite },
    async listWorkspaceInvites() { if (!currentWorkspace) return []; return repository.listWorkspaceInvites(currentWorkspace.id) },
    async revokeWorkspaceInvite(inviteId) { assertAuthorized({ action: 'manage', resource: 'workspace' }); await repository.revokeWorkspaceInvite(inviteId); notify('success', 'Convite revogado.') },
    async updateWorkspaceMemberRole(userId, role) { assertAuthorized({ action: 'manage', resource: 'workspace' }); if (!currentWorkspace) throw new Error('Selecione um workspace.'); await repository.updateWorkspaceMemberRole(currentWorkspace.id, userId, role); setWorkspaces(await repository.listWorkspaces()); notify('success', 'Permissão atualizada.') },
    async removeWorkspaceMember(userId) { assertAuthorized({ action: 'manage', resource: 'workspace' }); if (!currentWorkspace) throw new Error('Selecione um workspace.'); await repository.removeWorkspaceMember(currentWorkspace.id, userId); notify('success', 'Membro removido.') },
    async listAuditLogs(limit = 100) { assertAuthorized({ action: 'read', resource: 'audit' }); if (!currentWorkspace) return []; return repository.listAuditLogs(currentWorkspace.id, limit) },
    async exportWorkspace() { assertAuthorized({ action: 'export', resource: 'workspace' }); if (!currentWorkspace) throw new Error('Selecione um workspace.'); return repository.exportWorkspace(currentWorkspace.id) },
    async clearOperationalData(): Promise<OperationalDataClearResult> { assertAuthorized({ action: 'manage', resource: 'workspace' }); if (!currentWorkspace) throw new Error('Selecione um workspace.'); const result = await repository.clearOperationalData(currentWorkspace.id); await refreshData(); return result },
    async refresh() {
      try { await refreshData(); notify('success', 'Dados atualizados.') }
      catch (refreshError) { notify('error', refreshError instanceof Error ? refreshError.message : 'Não foi possível atualizar.') }
    },
    async refreshAgentExecutionState(slices = snapshotSlicesForRoute(routeRef.current)) {
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const requested = [...new Set(slices)]
      const patch = await loadSnapshotPatch(repository, currentWorkspace.id, requested)
      const base = snapshot && snapshot.workspace.id === currentWorkspace.id ? snapshot : createWorkspaceShellSnapshot(currentWorkspace)
      const fresh = normalizeSnapshotForRender({ ...base, ...patch })
      for (const slice of requested) loadedSnapshotSlicesRef.current.add(slice)
      setLoadedSnapshotSlices([...loadedSnapshotSlicesRef.current])
      setSnapshot(fresh)
      setHealth(await repository.health())
      return fresh
    },
    async createLead(input) { assertAuthorized({ action: 'create', resource: 'lead' });
      if (input.phone) assertSensitiveField(teamAccess,'contact_phone','edit'); if (input.email) assertSensitiveField(teamAccess,'contact_email','edit'); if (Number(input.value||0)!==0) assertSensitiveField(teamAccess,'deal_value','edit');
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const resource = accessActionAllowed(teamAccess,'create','contacts') ? 'contacts' : 'pipeline'
      assertTeamAccess(teamAccess, 'create', resource, input.ownerId ?? user?.id ?? null)
      const lead = await repository.createLead({ ...input, workspaceId: currentWorkspace.id }); await executeAutomationEvent({ triggerType: 'lead_created', entityId: lead.id, lead }, { refreshAfter: false }); await refreshSlices(['commercial', 'activities', 'events', 'automationRuns']); notify('success', 'Registro comercial criado com sucesso.'); return lead
    },
    async updateLead(leadId, input) { if (!permissionSubject) throw new Error('Selecione um workspace.'); assertFieldWrite(permissionSubject, 'lead', Object.keys(input)); if (input.phone !== undefined) assertSensitiveField(teamAccess,'contact_phone','edit'); if (input.email !== undefined) assertSensitiveField(teamAccess,'contact_email','edit'); if (input.value !== undefined) assertSensitiveField(teamAccess,'deal_value','edit'); const currentLead = snapshot?.leads.find((item) => item.id === leadId); const resource = accessActionAllowed(teamAccess,'edit','contacts') ? 'contacts' : 'pipeline'; assertTeamAccess(teamAccess,'edit',resource,currentLead?.ownerId); if (input.ownerId !== undefined && input.ownerId !== currentLead?.ownerId) { assertTeamAccess(teamAccess,'assign',resource,currentLead?.ownerId); assertTeamAccess(teamAccess,'assign',resource,input.ownerId) } const lead = await repository.updateLead(leadId, input); await publishDomainChange('commercial.record.updated', { entityType: 'lead', entityId: lead.id }); notify('success', 'Contato atualizado.'); return lead },
    async moveLead(leadId, stageId, lossReason) { assertAuthorized({ action: 'update', resource: 'opportunity' });
      const currentLead = snapshot?.leads.find((item) => item.id === leadId); assertTeamAccess(teamAccess,'edit','pipeline',currentLead?.ownerId)
      const lead = await repository.moveLead(leadId, stageId, lossReason)
      await executeAutomationEvent({ triggerType: 'stage_changed', entityId: `${lead.id}:${stageId}:${lead.updatedAt}`, lead, stageId }, { refreshAfter: false })
      if (lead.status === 'won') await executeAutomationEvent({ triggerType: 'opportunity_won', entityId: `${lead.id}:${lead.updatedAt}`, lead, stageId }, { refreshAfter: false })
      if (lead.status === 'lost') await executeAutomationEvent({ triggerType: 'opportunity_lost', entityId: `${lead.id}:${lead.updatedAt}`, lead, stageId }, { refreshAfter: false })
      await publishDomainChange('pipeline.opportunity.moved', { entityType: 'opportunity', entityId: lead.opportunityId ?? lead.id, payload: { leadId: lead.id, stageId } }); notify('success', 'Oportunidade movida no Pipeline.'); return lead
    },
    async bulkMoveLeads(leadIds, stageId, lossReason) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      for (const leadId of leadIds) { const currentLead = snapshot?.leads.find((item) => item.id === leadId); assertTeamAccess(teamAccess,'edit','pipeline',currentLead?.ownerId) }
      const leads = await repository.bulkMoveLeads(currentWorkspace.id, leadIds, stageId, lossReason)
      for (const lead of leads) {
        await executeAutomationEvent({ triggerType: 'stage_changed', entityId: `${lead.id}:${stageId}:${lead.updatedAt}`, lead, stageId }, { refreshAfter: false })
        if (lead.status === 'won') await executeAutomationEvent({ triggerType: 'opportunity_won', entityId: `${lead.id}:${lead.updatedAt}`, lead, stageId }, { refreshAfter: false })
        if (lead.status === 'lost') await executeAutomationEvent({ triggerType: 'opportunity_lost', entityId: `${lead.id}:${lead.updatedAt}`, lead, stageId }, { refreshAfter: false })
      }
      await publishDomainChange('pipeline.opportunity.moved', { entityType: 'opportunity', payload: { leadIds: leads.map((item) => item.id), stageId } }); notify('success', `${leads.length} oportunidade(s) movida(s) no Pipeline.`); return leads
    },
    async deleteLead(leadId) { assertAuthorized({ action: 'delete', resource: 'lead' }); const currentLead = snapshot?.leads.find((item) => item.id === leadId); const resource = accessActionAllowed(teamAccess,'delete','contacts') ? 'contacts' : 'pipeline'; assertTeamAccess(teamAccess,'delete',resource,currentLead?.ownerId); await repository.deleteLead(leadId); await refreshData(); notify('success', 'Lead removido.') },
    async mergeLeads(primaryLeadId, duplicateLeadId) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const primaryLead = snapshot?.leads.find((item) => item.id === primaryLeadId)
      const duplicateLead = snapshot?.leads.find((item) => item.id === duplicateLeadId)
      assertTeamAccess(teamAccess,'edit','contacts',primaryLead?.ownerId)
      assertTeamAccess(teamAccess,'delete','contacts',duplicateLead?.ownerId)
      const lead = await repository.mergeLeads(currentWorkspace.id, primaryLeadId, duplicateLeadId)
      await refreshSlices(['commercial', 'activities', 'calls', 'events', 'proposals', 'buyerRooms']); notify('success', 'Cadastros mesclados com histórico preservado.'); return lead
    },
    async bulkUpdateLeads(leadIds, input) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const resource = accessActionAllowed(teamAccess,'edit','pipeline') ? 'pipeline' : 'contacts'
      for (const leadId of leadIds) { const currentLead = snapshot?.leads.find((item) => item.id === leadId); assertTeamAccess(teamAccess,'edit',resource,currentLead?.ownerId); if (input.ownerId !== undefined && input.ownerId !== currentLead?.ownerId) { assertTeamAccess(teamAccess,'assign',resource,currentLead?.ownerId); assertTeamAccess(teamAccess,'assign',resource,input.ownerId) } }
      const count = await repository.bulkUpdateLeads(currentWorkspace.id, leadIds, input); await refreshSlices(['commercial']); notify('success', `${count} lead(s) atualizado(s).`); return count
    },
    async reclassifyLeads(updates, silent = false) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const unique = Array.from(new Map(updates.map((item) => [item.leadId, item])).values())
      let count = 0
      const resource = accessActionAllowed(teamAccess,'edit','pipeline') ? 'pipeline' : 'contacts'
      for (const item of unique) {
        const current = snapshot?.leads.find((lead) => lead.id === item.leadId)
        if (!current || current.status !== 'active' || (current.priority === item.priority && current.temperature === item.temperature)) continue
        assertTeamAccess(teamAccess,'edit',resource,current.ownerId)
        await repository.updateLead(item.leadId, { priority: item.priority, temperature: item.temperature })
        count += 1
      }
      if (count) await refreshSlices(['commercial'])
      if (count && !silent) notify('success', `${count} lead(s) reclassificado(s) pelo Lead Score.`)
      return count
    },
    async bulkAddLeadTag(leadIds, tag) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const resource = accessActionAllowed(teamAccess,'edit','pipeline') ? 'pipeline' : 'contacts'
      for (const leadId of leadIds) { const currentLead = snapshot?.leads.find((item) => item.id === leadId); assertTeamAccess(teamAccess,'edit',resource,currentLead?.ownerId) }
      const count = await repository.bulkAddLeadTag(currentWorkspace.id, leadIds, tag); await refreshSlices(['commercial']); notify('success', `Tag adicionada em ${count} lead(s).`); return count
    },
    async bulkDeleteLeads(leadIds) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const resource = accessActionAllowed(teamAccess,'delete','contacts') ? 'contacts' : 'pipeline'
      for (const leadId of leadIds) { const currentLead = snapshot?.leads.find((item) => item.id === leadId); assertTeamAccess(teamAccess,'delete',resource,currentLead?.ownerId) }
      const count = await repository.bulkDeleteLeads(currentWorkspace.id, leadIds); await refreshData(); notify('success', `${count} lead(s) removido(s).`); return count
    },
    async createStage(input) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const stage = await repository.createStage({ ...input, workspaceId: currentWorkspace.id }); await publishDomainChange('pipeline.structure.changed', { entityType: 'pipeline_stage', entityId: stage.id }); notify('success', 'Etapa criada.'); return stage
    },
    async updateStage(stageId, input) { assertWritable(); const stage = await repository.updateStage(stageId, input); await publishDomainChange('pipeline.structure.changed', { entityType: 'pipeline_stage', entityId: stage.id }); notify('success', 'Etapa atualizada.'); return stage },
    async deleteStage(stageId) { assertWritable(); await repository.deleteStage(stageId); await publishDomainChange('pipeline.structure.changed', { entityType: 'pipeline_stage', entityId: stageId }); notify('success', 'Etapa removida.') },
    async createActivity(input) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const activity = await repository.createActivity({ ...input, workspaceId: currentWorkspace.id, sourceType: 'manual', sourceId: null }); await publishDomainChange('activity.created', { entityType: 'activity', entityId: activity.id }); notify('success', 'Atividade criada.'); return activity
    },
    async createActivities(inputs) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      if (!inputs.length) return []
      const created = await repository.createActivities(inputs.map((input) => ({ ...input, workspaceId: currentWorkspace.id, sourceType: 'system', sourceId: 'bulk-activity' })))
      await refreshSlices(['activities', 'commercial']); notify('success', `${created.length} atividade(s) adicionada(s) à rotina comercial.`); return created
    },
    async updateActivity(activityId, input) { assertWritable(); const activity = await repository.updateActivity(activityId, input); await publishDomainChange('activity.updated', { entityType: 'activity', entityId: activity.id }); notify('success', 'Atividade atualizada.'); return activity },
    async completeActivity(activityId, completed) { assertWritable();
      const activity = await repository.completeActivity(activityId, completed)
      if (completed && currentWorkspace) {
        const lead = activity.leadId ? (await repository.listLeads(currentWorkspace.id)).find((item) => item.id === activity.leadId) ?? null : null
        await executeAutomationEvent({ triggerType: 'activity_completed', entityId: `${activity.id}:${activity.updatedAt}`, lead, activityId: activity.id, activityType: activity.type }, { refreshAfter: false })
      }
      await publishDomainChange('activity.completed', { entityType: 'activity', entityId: activity.id, payload: { completed } }); notify('success', completed ? 'Atividade concluída.' : 'Atividade reaberta.'); return activity
    },
    async registerActivityOutcome(input) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const shouldCreateMeeting = Boolean(input.createNext && input.nextType === 'meeting' && input.nextAt)
      let createdMeetingEvent: CalendarEvent | null = null
      const result = await repository.registerActivityOutcome({
        ...input,
        createNext: shouldCreateMeeting ? false : input.createNext,
        nextType: shouldCreateMeeting ? null : input.nextType,
        nextTitle: shouldCreateMeeting ? null : input.nextTitle,
        nextDescription: shouldCreateMeeting ? null : input.nextDescription,
        nextAt: shouldCreateMeeting ? null : input.nextAt,
        workspaceId: currentWorkspace.id,
        userId: user?.id ?? null,
      })
      const engagementBase = await loadWorkspaceSnapshotSlices(repository, currentWorkspace, ['activities'])
      const completedSource = engagementBase.activities.find((item) => item.id === result.activity.id) ?? result.activity
      const engagementPatches = buildCadenceOutcomePatches(engagementBase.activities, completedSource, input.outcome, input.nextAt)
      for (const patch of engagementPatches) {
        await repository.updateActivity(patch.id, {
          description: patch.description,
          ...(patch.dueAt !== undefined ? { dueAt: patch.dueAt } : {}),
          ...(patch.resolutionStatus ? { resolutionStatus: patch.resolutionStatus } : {}),
          ...(patch.resolutionReason !== undefined ? { resolutionReason: patch.resolutionReason } : {}),
        })
      }
      if (shouldCreateMeeting && input.nextAt) {
        const starts = new Date(input.nextAt)
        const ends = new Date(starts.getTime() + 30 * 60_000)
        createdMeetingEvent = await repository.createCalendarEvent({
          workspaceId: currentWorkspace.id, leadId: result.lead.id, title: input.nextTitle?.trim() || `Reunião — ${result.lead.name}`,
          description: input.nextDescription ?? `Reunião criada a partir do resultado comercial da atividade ${result.activity.id}.`,
          startsAt: starts.toISOString(), endsAt: ends.toISOString(), allDay: false, location: '', status: 'confirmed', assignedTo: result.lead.ownerId,
        })
      }
      const base = await loadWorkspaceSnapshotSlices(repository, currentWorkspace, ['commercial', 'stages', 'calls', 'automationRules'])
      const lead = base.leads.find((item) => item.id === result.lead.id) ?? result.lead
      await executeAutomationEvent({ triggerType: 'activity_completed', entityId: `${result.activity.id}:${result.activity.updatedAt}`, lead, activityId: result.activity.id, activityType: result.activity.type }, { refreshAfter: false, baseSnapshot: base })
      if (createdMeetingEvent) await executeAutomationEvent({ triggerType: 'meeting_scheduled', entityId: createdMeetingEvent.id, lead, eventStatus: createdMeetingEvent.status }, { refreshAfter: false, baseSnapshot: base })
      if (lead.status === 'won') await executeAutomationEvent({ triggerType: 'opportunity_won', entityId: result.resultActivityId, lead }, { refreshAfter: false, baseSnapshot: base })
      if (lead.status === 'lost') await executeAutomationEvent({ triggerType: 'opportunity_lost', entityId: result.resultActivityId, lead }, { refreshAfter: false, baseSnapshot: base })
      await refreshSlices(['activities', 'commercial', 'events', 'automationRuns'])
      notify(result.idempotent ? 'info' : 'success', result.idempotent ? 'Este resultado já havia sido registrado; nenhum dado foi duplicado.' : 'Resultado salvo e rotina comercial sincronizada.')
      return result
    },
    async deleteActivity(activityId) { assertWritable(); await repository.deleteActivity(activityId); await publishDomainChange('activity.deleted', { entityType: 'activity', entityId: activityId }); notify('success', 'Atividade removida.') },
    async createCadence(leadIds, firstDueAt, template) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const first = new Date(firstDueAt); if (Number.isNaN(first.getTime())) throw new Error('Informe uma data válida.')
      if (!leadIds.length) throw new Error('Selecione pelo menos um lead.')
      if (!template.steps.length) throw new Error('A cadência precisa ter pelo menos uma etapa.')
      const base = await loadWorkspaceSnapshotSlices(repository, currentWorkspace, ['commercial', 'activities'])
      const cadenceId = createId('cadence')
      let skipped = 0
      let blocked = 0
      const activities: NewActivityInput[] = []
      for (const leadId of leadIds) {
        const lead = base.leads.find((item) => item.id === leadId)
        if (lead?.doNotContact) { blocked += 1; continue }
        const duplicate = base.activities.some((activity) => {
          if (activity.leadId !== leadId || activity.completedAt || !['pending', undefined].includes(activity.resolutionStatus)) return false
          const meta = readFollowupMetadata(activity)
          return meta?.kind === 'cadence-step' && meta.cadenceName === template.name
        })
        if (duplicate) { skipped += 1; continue }
        for (let index = 0; index < template.steps.length; index += 1) {
          const step = template.steps[index]
          const due = addBusinessDays(first, Math.max(0, step.offsetDays), template.skipWeekends)
          const description = appendFollowupMetadata(step.objective, {
            version: 1, kind: 'cadence-step', cadenceId, enrollmentId: `${cadenceId}:${leadId}`, cadenceName: template.name, cadenceCategory: template.category,
            stepId: step.id, stepIndex: index + 1, stepTotal: template.steps.length, channel: step.channel, objective: step.objective, script: step.script,
            cadenceState: 'active', executionMode: step.executionMode ?? 'assisted', policy: cadencePolicy(template), engagementAction: 'continue',
          })
          activities.push({ workspaceId: currentWorkspace.id, leadId, type: step.type, title: step.title, description, dueAt: due.toISOString(), completedAt: null, assignedTo: user?.id ?? null, sourceType: 'manual', sourceId: cadenceId })
        }
      }
      const created = activities.length ? (await repository.createActivities(activities)).length : 0
      await refreshSlices(['activities', 'commercial'])
      const appliedLeads = Math.max(0, leadIds.length - skipped - blocked)
      if (created) notify('success', `${created} etapa(s) criada(s) em ${appliedLeads} lead(s).${skipped ? ` ${skipped} lead(s) já estavam nessa cadência.` : ''}${blocked ? ` ${blocked} lead(s) foram ignorados por “Não entrar em contato”.` : ''}`)
      else if (blocked === leadIds.length) notify('info', 'Nenhuma cadência foi criada: todos os leads selecionados estão bloqueados para contato.')
      else notify('info', `Os leads elegíveis já possuem esta cadência ativa.${blocked ? ` ${blocked} lead(s) bloqueado(s) foram ignorados.` : ''}`)
      return created
    },
    async updateCadenceState(cadenceId, action, leadId = null) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const base = await loadWorkspaceSnapshotSlices(repository, currentWorkspace, ['activities'])
      const patches = buildCadenceStatePatches(base.activities, cadenceId, action, leadId)
      for (const patch of patches) {
        await repository.updateActivity(patch.id, {
          description: patch.description,
          ...(patch.dueAt !== undefined ? { dueAt: patch.dueAt } : {}),
          ...(patch.resolutionStatus ? { resolutionStatus: patch.resolutionStatus } : {}),
          ...(patch.resolutionReason !== undefined ? { resolutionReason: patch.resolutionReason } : {}),
        })
      }
      await refreshSlices(['activities', 'commercial'])
      notify(patches.length ? 'success' : 'info', patches.length ? `${patches.length} etapa(s) atualizada(s) na cadência.` : 'Nenhuma etapa pendente encontrada para esta cadência.')
      return patches.length
    },
    async createCall(input, recording) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const call = await repository.createCall({ ...input, workspaceId: currentWorkspace.id, userId: user?.id ?? null }, recording)
      const base = await loadWorkspaceSnapshotSlices(repository, currentWorkspace, ['commercial', 'stages', 'calls', 'automationRules'])
      const lead = base.leads.find((item) => item.id === call.leadId) ?? null
      const attemptCount = base.calls.filter((item) => item.leadId === call.leadId).length
      await executeAutomationEvent({ triggerType: 'call_outcome', entityId: call.id, lead, callOutcome: call.outcome, attemptCount }, { refreshAfter: false, baseSnapshot: base })
      if (call.outcome === 'proposal_sent') await executeAutomationEvent({ triggerType: 'proposal_sent', entityId: call.id, lead, callOutcome: call.outcome, attemptCount }, { refreshAfter: false, baseSnapshot: base })
      await publishDomainChange('call.recorded', { entityType: 'call', entityId: call.id, payload: { leadId: call.leadId, outcome: call.outcome } }); notify('success', 'Ligação salva no histórico.'); return call
    },
    async registerCallOutcome(input, recording) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const result = await repository.registerCallOutcome({ ...input, workspaceId: currentWorkspace.id, userId: user?.id ?? null }, recording)
      const base = await loadWorkspaceSnapshotSlices(repository, currentWorkspace, ['commercial', 'stages', 'calls', 'automationRules'])
      const lead = base.leads.find((item) => item.id === result.lead.id) ?? result.lead
      const attemptCount = base.calls.filter((item) => item.leadId === result.call.leadId).length
      await executeAutomationEvent({ triggerType: 'call_outcome', entityId: result.call.id, lead, callOutcome: result.call.outcome, attemptCount }, { refreshAfter: false, baseSnapshot: base })
      if (result.call.outcome === 'proposal_sent') await executeAutomationEvent({ triggerType: 'proposal_sent', entityId: result.call.id, lead, callOutcome: result.call.outcome, attemptCount }, { refreshAfter: false, baseSnapshot: base })
      if (result.calendarEventId) await executeAutomationEvent({ triggerType: 'meeting_scheduled', entityId: result.calendarEventId, lead, eventStatus: 'confirmed' }, { refreshAfter: false, baseSnapshot: base })
      if (lead.status === 'won') await executeAutomationEvent({ triggerType: 'opportunity_won', entityId: result.call.id, lead }, { refreshAfter: false, baseSnapshot: base })
      if (lead.status === 'lost') await executeAutomationEvent({ triggerType: 'opportunity_lost', entityId: result.call.id, lead }, { refreshAfter: false, baseSnapshot: base })
      await publishDomainChange('call.recorded', { entityType: 'call', entityId: result.call.id, payload: { leadId: result.call.leadId, outcome: result.call.outcome, idempotent: result.idempotent } })
      notify(result.idempotent ? 'info' : 'success', result.idempotent ? 'Este resultado já havia sido registrado; nenhum dado foi duplicado.' : 'Resultado salvo e CRM sincronizado.')
      return result
    },
    async deleteCall(callId) { assertWritable(); await repository.deleteCall(callId); await publishDomainChange('call.deleted', { entityType: 'call', entityId: callId }); notify('success', 'Ligação removida.') },
    async resolveCallRecordingUrl(callId) { return repository.getCallRecordingUrl(callId) },
    async loadOlderCalls(limit = 200) {
      if (!currentWorkspace) return 0
      const oldest = snapshot?.calls.reduce<string | null>((current, call) => !current || new Date(call.startedAt).getTime() < new Date(current).getTime() ? call.startedAt : current, null) ?? null
      const older = await repository.listCallsPage(currentWorkspace.id, oldest, limit)
      if (older.length) setSnapshot((current) => {
        if (!current || current.workspace.id !== currentWorkspace.id) return current
        const merged = new Map(current.calls.map((call) => [call.id, call]))
        for (const call of older) merged.set(call.id, call)
        return normalizeSnapshotForRender({ ...current, calls: [...merged.values()].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()) })
      })
      return older.length
    },
    async createCalendarEvent(input) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const event = await repository.createCalendarEvent({ ...input, workspaceId: currentWorkspace.id })
      const lead = event.leadId ? (await repository.listLeads(currentWorkspace.id)).find((item) => item.id === event.leadId) ?? null : null
      const agendaType = readAgendaMetadata(event)?.type
      if (!agendaType || agendaType === 'meeting') await executeAutomationEvent({ triggerType: 'meeting_scheduled', entityId: event.id, lead, eventStatus: event.status }, { refreshAfter: false })
      void queueCalendarMutation(currentWorkspace.id, event.id, 'create', event).catch(() => undefined)
      await publishDomainChange('calendar.event.changed', { entityType: 'calendar_event', entityId: event.id, payload: { operation: 'create' } }); notify('success', 'Compromisso criado na Agenda.'); return event
    },
    async createCalendarEvents(inputs) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      if (!inputs.length) return []
      const events: CalendarEvent[] = []
      try {
        for (const input of inputs) events.push(await repository.createCalendarEvent({ ...input, workspaceId: currentWorkspace.id }))
      } catch (error) {
        await Promise.allSettled([...events].reverse().map((event) => repository.deleteCalendarEvent(event.id)))
        throw error
      }
      for (const event of events) void queueCalendarMutation(currentWorkspace.id, event.id, 'create', event).catch(() => undefined)
      await publishDomainChange('calendar.event.changed', { entityType: 'calendar_event', payload: { operation: 'create_many', eventIds: events.map((item) => item.id) } }); notify('success', `${events.length} compromisso(s) criado(s) na Agenda.`); return events
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
      await publishDomainChange('calendar.event.changed', { entityType: 'calendar_event', entityId: event.id, payload: { operation: 'update' } }); notify('success', 'Compromisso atualizado.'); return event
    },
    async deleteCalendarEvent(eventId) { assertWritable(); if (!currentWorkspace) throw new Error('Selecione um workspace.'); const before = (await repository.listCalendarEvents(currentWorkspace.id)).find((item) => item.id === eventId) ?? null; await queueCalendarMutation(currentWorkspace.id, eventId, 'delete', before).catch(() => undefined); await repository.deleteCalendarEvent(eventId); await publishDomainChange('calendar.event.changed', { entityType: 'calendar_event', entityId: eventId, payload: { operation: 'delete' } }); notify('success', 'Compromisso removido.') },

    async createPlaybook(input) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const playbook = await repository.createPlaybook({ ...input, workspaceId: currentWorkspace.id }); await refreshSlices(['playbooks']); notify('success', 'Playbook criado.'); return playbook
    },
    async updatePlaybook(playbookId, input) { assertWritable(); const playbook = await repository.updatePlaybook(playbookId, input); await refreshSlices(['playbooks']); notify('success', 'Playbook atualizado.'); return playbook },
    async deletePlaybook(playbookId) { assertWritable(); await repository.deletePlaybook(playbookId); await refreshSlices(['playbooks']); notify('success', 'Playbook removido.') },
    async createProduct(input) { assertWritable(); assertTeamAccess(teamAccess,'create','proposals'); if(input.unitCost!==undefined) assertSensitiveField(teamAccess,'proposal_cost','edit'); if(input.defaultDiscountPercent!==undefined||input.maxDiscountPercent!==undefined) assertSensitiveField(teamAccess,'proposal_discount','edit'); if(input.minMarginPercent!==undefined) assertSensitiveField(teamAccess,'proposal_margin','edit'); if (!currentWorkspace) throw new Error('Selecione um workspace.'); const product = await repository.createProduct({ ...input, workspaceId: currentWorkspace.id }); await refreshSlices(['products']); notify('success', 'Produto ou serviço cadastrado.'); return product },
    async updateProduct(productId, input) { assertWritable(); assertTeamAccess(teamAccess,'edit','proposals'); if(input.unitCost!==undefined) assertSensitiveField(teamAccess,'proposal_cost','edit'); if(input.defaultDiscountPercent!==undefined||input.maxDiscountPercent!==undefined) assertSensitiveField(teamAccess,'proposal_discount','edit'); if(input.minMarginPercent!==undefined) assertSensitiveField(teamAccess,'proposal_margin','edit'); const product = await repository.updateProduct(productId, input); await refreshSlices(['products']); notify('success', 'Produto atualizado.'); return product },
    async reconcileProposalItems(legacyName, productId) { assertWritable(); assertTeamAccess(teamAccess,'edit','proposals'); if (!currentWorkspace) throw new Error('Selecione um workspace.'); const count = await repository.reconcileProposalItems(currentWorkspace.id, legacyName, productId); if (count) { await refreshSlices(['proposals', 'products']); await publishDomainChange('proposal.changed', { entityType: 'proposal', entityId: productId, payload: { operation: 'catalog_reconcile', legacyName, count } }) } notify('success', count ? `${count} item(ns) históricos vinculados ao catálogo.` : 'Nenhum item histórico encontrado para reconciliar.'); return count },
    async deleteProduct(productId) { assertWritable(); assertTeamAccess(teamAccess,'delete','proposals'); await repository.deleteProduct(productId); await refreshSlices(['products']); notify('success', 'Produto removido.') },
    async createProposal(input) {
      assertWritable()
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const proposalStage = primaryProposalPipelineStage(snapshot?.stages ?? [])
      if (!proposalStage) throw new Error('Configure uma etapa de Proposta no Pipeline antes de criar propostas.')
      const lead = snapshot?.leads.find((item) => item.id === input.leadId)
      const proposalOwnerId = input.ownerId ?? lead?.ownerId ?? user?.id ?? null
      assertTeamAccess(teamAccess,'create','proposals',proposalOwnerId)
      if (input.items.some((item)=>Number(item.discountPercent||0)!==0)) assertSensitiveField(teamAccess,'proposal_discount','edit')
      if (proposalOwnerId && proposalOwnerId !== user?.id) assertTeamAccess(teamAccess,'assign','proposals',proposalOwnerId)
      const preApprovalReasons = proposalApprovalReasons(teamAccess,input.items,snapshot?.products??[],input.totalContractValue)
      const governedInput = preApprovalReasons.length && !accessCanApprove(teamAccess,'proposals') ? { ...input, isOfficial:false, status:'draft' as ProposalStatus } : input
      let movedLead: Lead | null = null
      if (lead && lead.stageId !== proposalStage.id && lead.status === 'active') movedLead = await repository.moveLead(lead.id, proposalStage.id)
      let proposal: ProposalRecord
      try {
        proposal = await repository.createProposal({ ...governedInput, workspaceId: currentWorkspace.id })
      } catch (error) {
        if (movedLead && lead) await repository.moveLead(lead.id, lead.stageId).catch(() => undefined)
        throw error
      }
      if (movedLead) await executeAutomationEvent({ triggerType: 'stage_changed', entityId: `${movedLead.id}:${proposalStage.id}:${movedLead.updatedAt}`, lead: movedLead, stageId: proposalStage.id }, { refreshAfter: false })
      await publishDomainChange('proposal.changed', { entityType: 'proposal', entityId: proposal.id, payload: { operation: 'create' } })
      const governanceReasons = proposalApprovalReasons(teamAccess,proposal.items,snapshot?.products??[],proposal.totalContractValue)
      if (currentWorkspace && governanceReasons.length && !accessCanApprove(teamAccess,'proposals')) {
        await requestTeamApproval(repository.mode,currentWorkspace.id,{requesterId:user?.id??null,requesterName:user?.displayName??user?.email??'Usuário',resource:'proposals',kind:'proposal_policy',entityType:'proposal',entityId:proposal.id,reason:governanceReasons.join(' '),payload:{totalContractValue:proposal.totalContractValue,discountTotal:proposal.discountTotal}})
        notify('warning','Proposta criada como rascunho e enviada para aprovação comercial.')
      } else {
        if (currentWorkspace && governanceReasons.length && accessCanApprove(teamAccess,'proposals')) await recordTeamSecurityAudit(repository.mode,currentWorkspace.id,{userId:user?.id,userName:user?.displayName??user?.email??'Gestor',action:'proposal_policy_override',entityType:'proposal',entityId:proposal.id,metadata:{reasons:governanceReasons}})
        notify('success', movedLead ? `Proposta criada e negócio movido para ${proposalStage.name}.` : 'Proposta criada.')
      }
      return proposal
    },
    async updateProposal(proposalId, input) { assertWritable(); if (input.items?.some((item)=>Number(item.discountPercent||0)!==0)) assertSensitiveField(teamAccess,'proposal_discount','edit'); const currentProposal=snapshot?.proposals.find((item)=>item.id===proposalId); const proposalOwner=currentProposal?.ownerId ?? snapshot?.leads.find((item)=>item.id===currentProposal?.leadId)?.ownerId ?? null; assertTeamAccess(teamAccess,'edit','proposals',proposalOwner); const candidateItems=input.items??currentProposal?.items??[]; const candidateTcv=input.totalContractValue??currentProposal?.totalContractValue??0; const preApprovalReasons=proposalApprovalReasons(teamAccess,candidateItems,snapshot?.products??[],candidateTcv); const governedInput=preApprovalReasons.length&&!accessCanApprove(teamAccess,'proposals')?{...input,isOfficial:false,status:'draft' as ProposalStatus}:input; const proposal = await repository.updateProposal(proposalId, governedInput); if (currentWorkspace) { const room = (await repository.listBuyerRooms(currentWorkspace.id)).find((item) => item.proposalId === proposal.id); if (room) await repository.updateBuyerRoom(room.id, buyerRoomPatchForProposal(room, proposal)) } await publishDomainChange('proposal.changed', { entityType: 'proposal', entityId: proposal.id, payload: { operation: 'update' } }); const governanceReasons=proposalApprovalReasons(teamAccess,proposal.items,snapshot?.products??[],proposal.totalContractValue); if(currentWorkspace&&governanceReasons.length&&!accessCanApprove(teamAccess,'proposals')){await requestTeamApproval(repository.mode,currentWorkspace.id,{requesterId:user?.id??null,requesterName:user?.displayName??user?.email??'Usuário',resource:'proposals',kind:'proposal_policy',entityType:'proposal',entityId:proposal.id,reason:governanceReasons.join(' '),payload:{totalContractValue:proposal.totalContractValue,discountTotal:proposal.discountTotal}});notify('warning','Proposta atualizada e enviada para aprovação comercial.')}else{if(currentWorkspace&&governanceReasons.length&&accessCanApprove(teamAccess,'proposals'))await recordTeamSecurityAudit(repository.mode,currentWorkspace.id,{userId:user?.id,userName:user?.displayName??user?.email??'Gestor',action:'proposal_policy_override',entityType:'proposal',entityId:proposal.id,metadata:{reasons:governanceReasons}});notify('success','Proposta atualizada.')} return proposal },
    async createProposalRevision(proposalId) { assertWritable(); const currentProposal=snapshot?.proposals.find((item)=>item.id===proposalId); assertTeamAccess(teamAccess,'create','proposals',currentProposal?.ownerId ?? snapshot?.leads.find((item)=>item.id===currentProposal?.leadId)?.ownerId ?? null); const rooms = currentWorkspace ? await repository.listBuyerRooms(currentWorkspace.id) : []; const inheritedRoom = rooms.find((item) => item.proposalId === proposalId) ?? null; const proposal = await repository.createProposalRevision(proposalId); if (inheritedRoom) { await repository.updateBuyerRoom(inheritedRoom.id, buyerRoomPatchForProposal(inheritedRoom, proposal)); await repository.recordBuyerRoomActivity(inheritedRoom.id, { type: 'status_changed', actorName: 'Equipe RealTalent', description: `Buyer Room atualizada para a revisão v${proposal.version}.`, metadata: { previousProposalId: proposalId, proposalId: proposal.id } }) } await publishDomainChange('proposal.changed', { entityType: 'proposal', entityId: proposal.id, payload: { operation: 'revision' } }); notify('success', `Revisão v${proposal.version} criada.`); return proposal },
    async updateProposalStatus(proposalId, status) {
      assertWritable()
      const currentProposal=snapshot?.proposals.find((item)=>item.id===proposalId)
      assertTeamAccess(teamAccess,'edit','proposals',currentProposal?.ownerId ?? snapshot?.leads.find((item)=>item.id===currentProposal?.leadId)?.ownerId ?? null)
      if (currentWorkspace && currentProposal && ['sent','viewed','accepted'].includes(status) && !accessCanApprove(teamAccess,'proposals')) {
        const reasons=proposalApprovalReasons(teamAccess,currentProposal.items,snapshot?.products??[],currentProposal.totalContractValue)
        if (reasons.length) { const approval=await approvalStatusForEntity(repository.mode,currentWorkspace.id,'proposal_policy','proposal',proposalId); if (approval!=='approved') { if(approval!=='pending') await requestTeamApproval(repository.mode,currentWorkspace.id,{requesterId:user?.id??null,requesterName:user?.displayName??user?.email??'Usuário',resource:'proposals',kind:'proposal_policy',entityType:'proposal',entityId:proposalId,reason:reasons.join(' '),payload:{totalContractValue:currentProposal.totalContractValue,discountTotal:currentProposal.discountTotal}}); throw new Error(`Esta proposta exige aprovação antes de avançar. Solicitação ${approval==='pending'?'já está pendente':'foi enviada ao gestor'}. ${reasons.join(' ')}`) } }
      }
      const proposal = await repository.updateProposalStatus(proposalId, status)
      if (currentWorkspace) {
        const room = (await repository.listBuyerRooms(currentWorkspace.id)).find((item) => item.proposalId === proposal.id)
        if (room) { await repository.updateBuyerRoom(room.id, buyerRoomPatchForProposal(room, proposal)); await repository.recordBuyerRoomActivity(room.id, { type: 'status_changed', actorName: 'Equipe RealTalent', description: `Proposta atualizada para ${status}.`, metadata: { proposalStatus: status } }) }
      }
      const lead = snapshot?.leads.find((item) => item.id === proposal.leadId)
      if (lead && status === 'sent') await executeAutomationEvent({ triggerType: 'proposal_sent', entityId: `${proposal.id}:${proposal.updatedAt}`, lead }, { refreshAfter: false })
      if (status === 'accepted') {
        const createdRevenue = await ensureProposalRevenueSchedule(repository, proposal)
        if (createdRevenue.length) { await refreshSlices(['revenue']); await publishDomainChange('revenue.changed', { entityType: 'revenue', entityId: proposal.id, payload: { operation: 'proposal_schedule', count: createdRevenue.length } }) }
      }
      await publishDomainChange('proposal.changed', { entityType: 'proposal', entityId: proposal.id, payload: { operation: 'status', status } })
      notify('success', status === 'accepted' ? 'Aceite registrado. O plano de receita foi criado sem reconhecer competências automaticamente.' : 'Status da proposta atualizado.')
      return proposal
    },
    async setOfficialProposal(proposalId) { assertWritable(); const currentProposal=snapshot?.proposals.find((item)=>item.id===proposalId); assertTeamAccess(teamAccess,'edit','proposals',currentProposal?.ownerId ?? snapshot?.leads.find((item)=>item.id===currentProposal?.leadId)?.ownerId ?? null); if(currentWorkspace&&currentProposal&&!accessCanApprove(teamAccess,'proposals')){const reasons=proposalApprovalReasons(teamAccess,currentProposal.items,snapshot?.products??[],currentProposal.totalContractValue);if(reasons.length){const approval=await approvalStatusForEntity(repository.mode,currentWorkspace.id,'proposal_policy','proposal',proposalId);if(approval!=='approved'){if(approval!=='pending')await requestTeamApproval(repository.mode,currentWorkspace.id,{requesterId:user?.id??null,requesterName:user?.displayName??user?.email??'Usuário',resource:'proposals',kind:'proposal_policy',entityType:'proposal',entityId:proposalId,reason:reasons.join(' '),payload:{totalContractValue:currentProposal.totalContractValue,discountTotal:currentProposal.discountTotal}});throw new Error(`Esta proposta exige aprovação antes de virar oficial. Solicitação ${approval==='pending'?'já está pendente':'foi enviada ao gestor'}. ${reasons.join(' ')}`)}}} const proposal = await repository.setOfficialProposal(proposalId); await publishDomainChange('proposal.changed', { entityType: 'proposal', entityId: proposal.id, payload: { operation: 'official' } }); notify('success', 'Proposta definida como oficial do forecast.'); return proposal },
    async closeOpportunityFromProposal(proposalId) { assertWritable(); const currentProposal=snapshot?.proposals.find((item)=>item.id===proposalId); assertTeamAccess(teamAccess,'edit','proposals',currentProposal?.ownerId ?? snapshot?.leads.find((item)=>item.id===currentProposal?.leadId)?.ownerId ?? null); if (!currentWorkspace) throw new Error('Selecione um workspace.'); if(currentProposal&&!accessCanApprove(teamAccess,'proposals')){const reasons=proposalApprovalReasons(teamAccess,currentProposal.items,snapshot?.products??[],currentProposal.totalContractValue);if(reasons.length){const approval=await approvalStatusForEntity(repository.mode,currentWorkspace.id,'proposal_policy','proposal',proposalId);if(approval!=='approved'){if(approval!=='pending')await requestTeamApproval(repository.mode,currentWorkspace.id,{requesterId:user?.id??null,requesterName:user?.displayName??user?.email??'Usuário',resource:'proposals',kind:'proposal_policy',entityType:'proposal',entityId:proposalId,reason:reasons.join(' '),payload:{totalContractValue:currentProposal.totalContractValue,discountTotal:currentProposal.discountTotal}});throw new Error('A proposta precisa de aprovação comercial antes de fechar a oportunidade como ganha.')}}} const proposal = await repository.closeOpportunityFromProposal(proposalId); const room = (await repository.listBuyerRooms(currentWorkspace.id)).find((item) => item.proposalId === proposal.id); if (room) { await repository.updateBuyerRoom(room.id, buyerRoomPatchForProposal(room, proposal)); await repository.recordBuyerRoomActivity(room.id, { type: 'status_changed', actorName: 'Equipe RealTalent', description: 'Negócio ganho; Buyer Room avançou para implantação.', metadata: { closedWon: true } }) } const createdRevenue = await ensureProposalRevenueSchedule(repository, proposal); if (createdRevenue.length) await refreshSlices(['revenue']); const freshSnapshot = await loadWorkspaceSnapshotSlices(repository, currentWorkspace, ['commercial', 'stages', 'automationRules']); const lead = freshSnapshot.leads.find((item) => item.id === proposal.leadId); if (lead) await executeAutomationEvent({ triggerType: 'opportunity_won', entityId: `${proposal.id}:${proposal.updatedAt}`, lead }, { refreshAfter: false, baseSnapshot: freshSnapshot }); await publishDomainChange('proposal.changed', { entityType: 'proposal', entityId: proposal.id, payload: { operation: 'close_won' } }); notify('success', 'Oportunidade fechada como ganha. O plano contratual permanece separado do reconhecimento por competência.'); return proposal },
    async deleteProposal(proposalId) { assertWritable(); const currentProposal=snapshot?.proposals.find((item)=>item.id===proposalId); assertTeamAccess(teamAccess,'delete','proposals',currentProposal?.ownerId ?? snapshot?.leads.find((item)=>item.id===currentProposal?.leadId)?.ownerId ?? null); await repository.deleteProposal(proposalId); await publishDomainChange('proposal.changed', { entityType: 'proposal', entityId: proposalId, payload: { operation: 'delete' } }); notify('success', 'Proposta removida.') },
    async createBuyerRoom(input) { assertWritable(); const proposal=snapshot?.proposals.find((item)=>item.id===input.proposalId); assertTeamAccess(teamAccess,'create','proposals',proposal?.ownerId ?? snapshot?.leads.find((item)=>item.id===input.leadId)?.ownerId ?? null); if (!currentWorkspace) throw new Error('Selecione um workspace.'); const room = await repository.createBuyerRoom({ ...input, workspaceId: currentWorkspace.id }); await publishDomainChange('buyer-room.changed', { entityType: 'buyer_room', entityId: room.id, payload: { operation: 'create' } }); notify('success', 'Buyer Room criada.'); return room },
    async updateBuyerRoom(roomId, input) { assertWritable(); const currentRoom=snapshot?.buyerRooms?.find((item)=>item.id===roomId); const proposal=snapshot?.proposals.find((item)=>item.id===currentRoom?.proposalId); assertTeamAccess(teamAccess,'edit','proposals',proposal?.ownerId ?? snapshot?.leads.find((item)=>item.id===currentRoom?.leadId)?.ownerId ?? null); if (!currentWorkspace) throw new Error('Selecione um workspace.'); const room = await repository.updateBuyerRoom(roomId, input); await publishDomainChange('buyer-room.changed', { entityType: 'buyer_room', entityId: room.id, payload: { operation: 'update' } }); notify('success', 'Buyer Room atualizada.'); return room },
    async rotateBuyerRoomToken(roomId) { assertWritable(); const currentRoom=snapshot?.buyerRooms?.find((item)=>item.id===roomId); const proposal=snapshot?.proposals.find((item)=>item.id===currentRoom?.proposalId); assertTeamAccess(teamAccess,'edit','proposals',proposal?.ownerId ?? snapshot?.leads.find((item)=>item.id===currentRoom?.leadId)?.ownerId ?? null); if (!currentWorkspace) throw new Error('Selecione um workspace.'); const room = await repository.rotateBuyerRoomToken(roomId); await publishDomainChange('buyer-room.changed', { entityType: 'buyer_room', entityId: room.id, payload: { operation: 'rotate_token' } }); notify('success', 'Link público regenerado. O link anterior deixou de funcionar.'); return room },
    async recordBuyerRoomActivity(roomId, event) { assertWritable(); const currentRoom=snapshot?.buyerRooms?.find((item)=>item.id===roomId); const proposal=snapshot?.proposals.find((item)=>item.id===currentRoom?.proposalId); assertTeamAccess(teamAccess,'edit','proposals',proposal?.ownerId ?? snapshot?.leads.find((item)=>item.id===currentRoom?.leadId)?.ownerId ?? null); if (!currentWorkspace) throw new Error('Selecione um workspace.'); const room = await repository.recordBuyerRoomActivity(roomId, event); await publishDomainChange('buyer-room.changed', { entityType: 'buyer_room', entityId: room.id, payload: { operation: 'activity' } }); return room },
    async deleteBuyerRoom(roomId) { assertWritable(); const room=snapshot?.buyerRooms?.find((item)=>item.id===roomId); const proposal=snapshot?.proposals.find((item)=>item.id===room?.proposalId); assertTeamAccess(teamAccess,'delete','proposals',proposal?.ownerId ?? snapshot?.leads.find((item)=>item.id===room?.leadId)?.ownerId ?? null); if (!currentWorkspace) throw new Error('Selecione um workspace.'); await repository.deleteBuyerRoom(roomId); await publishDomainChange('buyer-room.changed', { entityType: 'buyer_room', entityId: roomId, payload: { operation: 'delete' } }); notify('success', 'Buyer Room removida.') },
    async createRevenueEntry(input) { assertWritable(); assertSensitiveField(teamAccess,'revenue_amount','edit'); assertTeamAccess(teamAccess,'create','proposals',input.ownerId ?? user?.id ?? null); if (!currentWorkspace) throw new Error('Selecione um workspace.'); const entry = await repository.createRevenueEntry({ ...input, workspaceId: currentWorkspace.id }); await publishDomainChange('revenue.changed', { entityType: 'revenue', entityId: entry.id, payload: { operation: 'create' } }); notify('success', 'Receita registrada.'); return entry },
    async updateRevenueEntryStatus(entryId, status) { assertWritable(); const currentEntry=snapshot?.revenueEntries.find((item)=>item.id===entryId); assertTeamAccess(teamAccess,'edit','proposals',currentEntry?.ownerId ?? null); const entry = await repository.updateRevenueEntryStatus(entryId, status); await publishDomainChange('revenue.changed', { entityType: 'revenue', entityId: entry.id, payload: { operation: 'status', status } }); notify('success', 'Receita atualizada.'); return entry },
    async createGoal(input) { assertWritable();
      const goalOwner=input.scope==='team' ? null : input.userId ?? user?.id ?? null
      assertTeamAccess(teamAccess,'create','goals',goalOwner,input.teamId ?? null)
      if ((input.scope==='team' || (input.userId && input.userId!==user?.id)) && !accessActionAllowed(teamAccess,'assign','goals')) throw new Error('Permissão negada: o perfil não permite atribuir metas.')
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const goal = await repository.createGoal({ ...input, workspaceId: currentWorkspace.id }); await publishDomainChange('goal.changed', { entityType: 'goal', entityId: goal.id, payload: { operation: 'create' } }); notify('success', 'Meta criada.'); return goal
    },
    async updateGoal(goalId, input) { assertWritable(); const currentGoal=snapshot?.goals.find((item)=>item.id===goalId); assertTeamAccess(teamAccess,'edit','goals',currentGoal?.scope==='team'?null:currentGoal?.userId,currentGoal?.teamId ?? null); if ((input.teamId!==undefined && input.teamId!==currentGoal?.teamId) || (input.userId!==undefined && input.userId!==currentGoal?.userId) || (input.scope!==undefined && input.scope!==currentGoal?.scope)) assertTeamAccess(teamAccess,'assign','goals',input.scope==='team'?null:(input.userId ?? currentGoal?.userId ?? null),input.teamId ?? currentGoal?.teamId ?? null); const goal = await repository.updateGoal(goalId, input); await publishDomainChange('goal.changed', { entityType: 'goal', entityId: goal.id, payload: { operation: 'update' } }); notify('success', 'Meta atualizada.'); return goal },
    async deleteGoal(goalId) { assertWritable(); const currentGoal=snapshot?.goals.find((item)=>item.id===goalId); assertTeamAccess(teamAccess,'delete','goals',currentGoal?.scope==='team'?null:currentGoal?.userId,currentGoal?.teamId ?? null); await repository.deleteGoal(goalId); await publishDomainChange('goal.changed', { entityType: 'goal', entityId: goalId, payload: { operation: 'delete' } }); notify('success', 'Meta removida.') },
    async createAutomationRule(input) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const rule = await repository.createAutomationRule({ ...input, workspaceId: currentWorkspace.id, createdBy: user?.id ?? null }); await publishDomainChange('automation.changed', { entityType: 'automation_rule', entityId: rule.id, payload: { operation: 'create' } }); notify('success', 'Automação criada.'); return rule
    },
    async updateAutomationRule(ruleId, input) { assertWritable(); const rule = await repository.updateAutomationRule(ruleId, input); await publishDomainChange('automation.changed', { entityType: 'automation_rule', entityId: rule.id, payload: { operation: 'update' } }); notify('success', 'Automação atualizada.'); return rule },
    async deleteAutomationRule(ruleId) { assertWritable(); await repository.deleteAutomationRule(ruleId); await publishDomainChange('automation.changed', { entityType: 'automation_rule', entityId: ruleId, payload: { operation: 'delete' } }); notify('success', 'Automação removida.') },
    async simulateAutomationRule(ruleId, leadId) {
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const base = await loadWorkspaceSnapshotSlices(repository, currentWorkspace, ['commercial', 'stages', 'calls', 'automationRules'])
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
      const base = await loadWorkspaceSnapshotSlices(repository, currentWorkspace, ['commercial', 'stages', 'calls', 'automationRules']); const rule = base.automationRules.find((item) => item.id === ruleId); const lead = base.leads.find((item) => item.id === leadId)
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
      const base = await loadWorkspaceSnapshotSlices(repository, currentWorkspace, ['commercial', 'stages', 'activities', 'calls', 'goals', 'automationRules'])
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
      if (count) await refreshSlices(['commercial'])
      notify(count ? 'success' : 'info', count ? `${count} automação(ões) processada(s) nas checagens.` : 'Nenhuma regra elegível nas checagens operacionais.')
      return count
    },
    async undoAutomationRun(runId) { assertWritable();
      const run = snapshot?.automationRuns.find((item) => item.id === runId)
      if (!run || run.status !== 'success') throw new Error('Somente execuções concluídas podem ser desfeitas.')
      const mutations = [...(run.output.mutations ?? [])].reverse()
      for (const mutation of mutations) {
        if (mutation.kind === 'activity_create' && mutation.activityId) await repository.deleteActivity(mutation.activityId)
        if (mutation.kind === 'activity_update' && mutation.activityId && mutation.before) await repository.updateActivity(mutation.activityId, { completedAt: mutation.before.completedAt ?? null, resolutionStatus: mutation.before.resolutionStatus ?? (mutation.before.completedAt ? 'completed' : 'pending'), resolutionReason: mutation.before.resolutionReason ?? null })
        if (mutation.kind === 'event_create' && mutation.eventId) await repository.deleteCalendarEvent(mutation.eventId)
        if (mutation.kind === 'lead_update' && mutation.leadId && mutation.before) await repository.updateLead(mutation.leadId, mutation.before)
      }
      const updated = await repository.finishAutomationRun(run.id, 'undone', { ...run.output, message: 'Execução desfeita com restauração dos registros reversíveis.' })
      await refreshSlices(['commercial', 'activities', 'events', 'automationRuns']); notify('success', 'Execução desfeita.'); return updated
    },
    async restoreWorkspaceBackup(file) { assertWritable();
      if (!currentWorkspace) throw new Error('Selecione um workspace.')
      const result = await restoreWorkspaceBackupToRepository({ file, workspaceId: currentWorkspace.id, userId: user?.id ?? null, repository })
      await refreshData(); notify('success', `${result.imported} registro(s) restaurado(s) com validação.`)
      return result
    },
    async importLegacyBackup(file) { assertWritable();
      if (!currentWorkspace || !snapshot) throw new Error('Selecione um workspace.')
      const result = importV99Backup(await file.text(), currentWorkspace.id, snapshot.stages)
      const imported = await repository.importLeads(currentWorkspace.id, result.leads)
      const base = await loadWorkspaceSnapshotSlices(repository, currentWorkspace, ['commercial', 'stages', 'automationRules'])
      for (const importedLead of result.leads) {
        const lead = base.leads.find((item) => item.id === importedLead.id)
        if (lead) await executeAutomationEvent({ triggerType: 'lead_imported', entityId: lead.id, lead }, { refreshAfter: false, baseSnapshot: base })
      }
      await refreshData(); notify('success', `${imported} lead(s) importado(s) da V99.`); return { imported, warnings: result.warnings }
    },
    async importLeadFile(file) { assertWritable();
      if (!currentWorkspace || !snapshot) throw new Error('Selecione um workspace.')
      assertTeamAccess(teamAccess,'create','contacts',user?.id ?? null)
      const text = await file.text(); const result = file.name.toLowerCase().endsWith('.json') || text.trim().startsWith('{') || text.trim().startsWith('[')
        ? importV99Backup(text, currentWorkspace.id, snapshot.stages) : parseLeadCsv(text, currentWorkspace.id, snapshot.stages)
      for (const importedLead of result.leads) assertTeamAccess(teamAccess,'create','contacts',importedLead.ownerId ?? user?.id ?? null)
      const imported = await repository.importLeads(currentWorkspace.id, result.leads)
      const base = await loadWorkspaceSnapshotSlices(repository, currentWorkspace, ['commercial', 'stages', 'automationRules'])
      for (const importedLead of result.leads) {
        const lead = base.leads.find((item) => item.id === importedLead.id)
        if (lead) await executeAutomationEvent({ triggerType: 'lead_imported', entityId: lead.id, lead }, { refreshAfter: false, baseSnapshot: base })
      }
      await refreshData(); notify('success', `${imported} lead(s) importado(s).`); return { imported, warnings: result.warnings }
    },
    notify,
  }), [actionDialog, assertAuthorized, assertWritable, bootstrap, can, canWrite, confirmAction, currentWorkspace, dismissToast, error, executeAutomationEvent, health, loadWorkspace, loading, routeDataLoading, loadedSnapshotSlices, notify, promptAction, refreshData, refreshSlices, publishDomainChange, repository, resolveActionDialog, route, snapshot, teamAccess, toasts, user?.id, workspaces, permissionSubject])

  const latestValueRef = useRef(value)
  latestValueRef.current = value
  const actionWrapperCache = useRef(new Map<PropertyKey, (...args: any[]) => any>())

  const navigationValue = useMemo<AppNavigationContextValue>(() => ({
    route, routeContext, setRoute, navigate, clearRouteContext,
  }), [route, routeContext, setRoute, navigate, clearRouteContext])

  const workspaceValue = useMemo<AppWorkspaceContextValue>(() => ({
    repositoryMode: repository.mode, health, workspaces, currentWorkspace, currentUserId: user?.id ?? null, teamAccess, canWrite, can, canTeamAccess, teamAccessScope, canTeamAccessRecord, snapshot, loading, routeDataLoading, loadedSnapshotSlices, error,
  }), [repository.mode, health, workspaces, currentWorkspace, user?.id, teamAccess, canWrite, can, canTeamAccess, teamAccessScope, canTeamAccessRecord, snapshot, loading, routeDataLoading, loadedSnapshotSlices, error])

  const uiValue = useMemo<AppUiContextValue>(() => ({
    toasts, dismissToast, actionDialog, confirmAction, promptAction, resolveActionDialog, notify,
  }), [toasts, dismissToast, actionDialog, confirmAction, promptAction, resolveActionDialog, notify])

  const actionsValue = useMemo<AppActionsContextValue>(() => new Proxy({} as AppActionsContextValue, {
    get(_target, property: PropertyKey) {
      const cached = actionWrapperCache.current.get(property)
      if (cached) return cached
      const wrapper = (...args: any[]) => {
        const current = latestValueRef.current as unknown as Record<PropertyKey, unknown>
        const action = current[property]
        if (typeof action !== 'function') throw new Error(`Ação do CRM indisponível: ${String(property)}`)
        return (action as (...actionArgs: any[]) => any)(...args)
      }
      actionWrapperCache.current.set(property, wrapper)
      return wrapper
    },
  }), [])

  return (
    <AppContext.Provider value={value}>
      <AppNavigationContext.Provider value={navigationValue}>
        <AppWorkspaceContext.Provider value={workspaceValue}>
          <AppUiContext.Provider value={uiValue}>
            <AppActionsContext.Provider value={actionsValue}>
              {children}
            </AppActionsContext.Provider>
          </AppUiContext.Provider>
        </AppWorkspaceContext.Provider>
      </AppNavigationContext.Provider>
    </AppContext.Provider>
  )
}

const requireContext = <T,>(value: T | null, name: string): T => {
  if (!value) throw new Error(`${name} deve ser usado dentro de AppProvider.`)
  return value
}

export const useApp = () => requireContext(useContext(AppContext), 'useApp')
export const useAppNavigation = () => requireContext(useContext(AppNavigationContext), 'useAppNavigation')
export const useAppWorkspace = () => requireContext(useContext(AppWorkspaceContext), 'useAppWorkspace')
export const useAppUi = () => requireContext(useContext(AppUiContext), 'useAppUi')
export const useAppActions = () => requireContext(useContext(AppActionsContext), 'useAppActions')
