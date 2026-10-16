import type { AppRoute, Workspace, WorkspaceSnapshot } from '../domain/types'
import type { CrmRepository } from '../repositories/crm-repository'
import { loadWorkManagement } from './work-management'
import { projectWorkTasksToActivities } from './work-task-activity-projection'

export type SnapshotSlice = 'commercial' | 'stages' | 'activities' | 'calls' | 'events' | 'playbooks' | 'products' | 'proposals' | 'buyerRooms' | 'revenue' | 'goals' | 'automationRules' | 'automationRuns'

/**
 * V101.11.3-H10 — Progressive workspace hydration.
 *
 * The shell keeps the commercial identity/index data and pipeline stages warm because
 * global navigation/search depends on them. Operational histories and specialist
 * modules are hydrated only when a route needs them. This preserves the legacy
 * WorkspaceSnapshot shape while avoiding an eager full-workspace materialization.
 *
 * WorkTask remains the canonical task entity. Whenever the activities slice is
 * hydrated, tasks are projected in-memory as ActivityItem records so Meu Dia,
 * contact timelines and commercial intelligence can consume the same source of truth
 * without persisting a duplicate follow-up/activity row.
 */
export const CORE_SNAPSHOT_SLICES: SnapshotSlice[] = ['commercial', 'stages']

const ROUTE_SNAPSHOT_SLICES: Record<AppRoute, SnapshotSlice[]> = {
  dashboard: ['activities', 'calls', 'goals', 'proposals', 'revenue'],
  leads: ['activities', 'calls', 'events', 'proposals', 'buyerRooms'],
  'commercial-map': [],
  pipeline: ['activities', 'proposals'],
  tasks: [],
  teams: [],
  followups: ['activities'],
  calls: ['activities', 'calls', 'playbooks', 'goals'],
  communications: ['activities'],
  proposals: ['products', 'proposals', 'buyerRooms', 'revenue'],
  agenda: ['activities', 'events', 'playbooks'],
  playbooks: ['playbooks'],
  goals: ['activities', 'calls', 'events', 'goals', 'proposals', 'revenue'],
  automations: ['automationRules', 'automationRuns'],
  metrics: ['activities', 'calls', 'events', 'goals', 'proposals', 'revenue'],
  prospecting: [],
  settings: [],
}

export const snapshotSlicesForRoute = (route: AppRoute): SnapshotSlice[] => [...new Set([...CORE_SNAPSHOT_SLICES, ...ROUTE_SNAPSHOT_SLICES[route]])]

export const createWorkspaceShellSnapshot = (workspace: Workspace): WorkspaceSnapshot => ({
  workspace,
  stages: [],
  leads: [],
  activities: [],
  calls: [],
  events: [],
  playbooks: [],
  goals: [],
  automationRules: [],
  automationRuns: [],
  companies: [],
  contacts: [],
  contactRelationships: [],
  opportunities: [],
  socialProfiles: [],
  products: [],
  proposals: [],
  buyerRooms: [],
  revenueEntries: [],
})

const loadSlice = async (repository: CrmRepository, workspaceId: string, slice: SnapshotSlice): Promise<Partial<WorkspaceSnapshot>> => {
  if (slice === 'commercial') {
    const [leads, companies, contacts, contactRelationships, opportunities, socialProfiles] = await Promise.all([
      repository.listLeads(workspaceId), repository.listCompanies(workspaceId), repository.listContacts(workspaceId), repository.listContactRelationships(workspaceId),
      repository.listOpportunities(workspaceId), repository.listSocialProfiles(workspaceId),
    ])
    return { leads, companies, contacts, contactRelationships, opportunities, socialProfiles }
  }
  if (slice === 'stages') return { stages: await repository.listStages(workspaceId) }
  if (slice === 'activities') {
    const [activities, workManagement, contacts] = await Promise.all([
      repository.listActivities(workspaceId),
      loadWorkManagement(repository.mode, workspaceId),
      repository.listContacts(workspaceId),
    ])
    return { activities: projectWorkTasksToActivities(activities, workManagement, { contacts }) }
  }
  if (slice === 'calls') return { calls: await repository.listCallsPage(workspaceId, null, 500) }
  if (slice === 'events') return { events: await repository.listCalendarEvents(workspaceId) }
  if (slice === 'playbooks') return { playbooks: await repository.listPlaybooks(workspaceId) }
  if (slice === 'products') return { products: await repository.listProducts(workspaceId) }
  if (slice === 'proposals') return { proposals: await repository.listProposals(workspaceId) }
  if (slice === 'buyerRooms') return { buyerRooms: await repository.listBuyerRooms(workspaceId) }
  if (slice === 'revenue') return { revenueEntries: await repository.listRevenueEntries(workspaceId) }
  if (slice === 'goals') return { goals: await repository.listGoals(workspaceId) }
  if (slice === 'automationRules') return { automationRules: await repository.listAutomationRules(workspaceId) }
  return { automationRuns: await repository.listAutomationRuns(workspaceId) }
}

export const loadSnapshotPatch = async (repository: CrmRepository, workspaceId: string, slices: SnapshotSlice[]): Promise<Partial<WorkspaceSnapshot>> => {
  const unique = [...new Set(slices)]
  if (!unique.length) return {}
  const parts = await Promise.all(unique.map((slice) => loadSlice(repository, workspaceId, slice)))
  return Object.assign({}, ...parts)
}


export const loadWorkspaceSnapshotSlices = async (repository: CrmRepository, workspace: Workspace, slices: SnapshotSlice[]): Promise<WorkspaceSnapshot> => {
  const patch = await loadSnapshotPatch(repository, workspace.id, slices)
  return { ...createWorkspaceShellSnapshot(workspace), ...patch }
}

export const loadWorkspaceSnapshotSlicesById = async (repository: CrmRepository, workspaceId: string, slices: SnapshotSlice[]): Promise<WorkspaceSnapshot> => {
  const workspace = (await repository.listWorkspaces()).find((item) => item.id === workspaceId)
  if (!workspace) throw new Error('Workspace não encontrado ou sem acesso.')
  return loadWorkspaceSnapshotSlices(repository, workspace, slices)
}

export const loadProgressiveWorkspaceSnapshot = async (repository: CrmRepository, workspace: Workspace, route: AppRoute) => {
  const slices = snapshotSlicesForRoute(route)
  const patch = await loadSnapshotPatch(repository, workspace.id, slices)
  return { snapshot: { ...createWorkspaceShellSnapshot(workspace), ...patch }, slices }
}
