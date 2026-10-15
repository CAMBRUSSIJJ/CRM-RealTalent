import { getSupabaseClient } from '../lib/supabase'
import { safeStorage } from '../lib/storage'
import { contactSavedViewToUniversal } from '../platform/views/legacy-view-adapters'
import { archiveUniversalView, removeUniversalView, reorderUniversalViews, replaceSurfaceUniversalViews, saveUniversalView } from '../platform/views/view-store'

export type ContactSavedViewDisplay = 'table' | 'board' | 'compact'
export type ContactSavedViewDensity = 'comfortable' | 'compact'
export type ContactSavedViewVisibility = 'private' | 'workspace'
export type ContactSavedViewIcon = 'users' | 'flame' | 'clock' | 'alert' | 'star' | 'target' | 'briefcase' | 'table' | 'board' | 'list'
export type ContactStarterViewKey = 'all' | 'hot' | 'due' | 'no-action'

export interface ContactSavedView {
  id: string
  workspaceId: string
  createdBy: string
  name: string
  display: ContactSavedViewDisplay
  filters: Record<string, string>
  columns: string[]
  density: ContactSavedViewDensity
  sort: string
  groupBy: 'stage'
  visibility: ContactSavedViewVisibility
  isDefault: boolean
  color: string
  icon: ContactSavedViewIcon
  position: number
  starterKey: ContactStarterViewKey | null
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

interface ViewContext {
  mode: 'local' | 'supabase'
  workspaceId: string
  userId: string
}

type WritableContactView = Omit<ContactSavedView, 'workspaceId' | 'createdBy' | 'createdAt' | 'updatedAt'>

const LOCAL_PREFIX = 'realtalent-crm-v10161-contact-views:'
const localKey = ({ workspaceId, userId }: ViewContext) => `${LOCAL_PREFIX}${workspaceId}:${userId || 'anonymous'}`

export const CONTACT_VIEW_COLORS = ['#315fd6', '#c84b55', '#d88419', '#6f5bd3', '#168a68', '#64748b', '#b54d9c', '#0f7894'] as const
export const CONTACT_VIEW_ICONS: ContactSavedViewIcon[] = ['users', 'flame', 'clock', 'alert', 'star', 'target', 'briefcase', 'table', 'board', 'list']

const STARTER_VIEWS: Array<Pick<WritableContactView, 'name' | 'display' | 'filters' | 'columns' | 'density' | 'sort' | 'groupBy' | 'visibility' | 'color' | 'icon' | 'position' | 'starterKey'>> = [
  { name: 'Todos os contatos', display: 'table', filters: {}, columns: ['contact','score','stage','temperature','owner','nextAction','value'], density: 'comfortable', sort: 'updated-desc', groupBy: 'stage', visibility: 'private', color: '#315fd6', icon: 'users', position: 0, starterKey: 'all' },
  { name: 'Contatos quentes', display: 'table', filters: { status: 'active', temperature: 'hot', sort: 'priority' }, columns: ['contact','score','stage','temperature','owner','nextAction','value'], density: 'comfortable', sort: 'priority', groupBy: 'stage', visibility: 'private', color: '#c84b55', icon: 'flame', position: 1, starterKey: 'hot' },
  { name: 'Retornos pendentes', display: 'table', filters: { status: 'active', due: 'due', sort: 'next-action' }, columns: ['contact','score','stage','owner','nextAction','value'], density: 'comfortable', sort: 'next-action', groupBy: 'stage', visibility: 'private', color: '#d88419', icon: 'clock', position: 2, starterKey: 'due' },
  { name: 'Sem próxima ação', display: 'compact', filters: { status: 'active', due: 'none', sort: 'updated-desc' }, columns: ['contact','score','stage','owner','lastActivity'], density: 'compact', sort: 'updated-desc', groupBy: 'stage', visibility: 'private', color: '#64748b', icon: 'alert', position: 3, starterKey: 'no-action' },
]

const randomId = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`

const readLocal = (context: ViewContext): ContactSavedView[] => {
  try {
    const value = JSON.parse(safeStorage.getItem(localKey(context)) ?? '[]')
    return Array.isArray(value) ? value.map(normalizeLegacyView) : []
  } catch { return [] }
}
const writeLocal = (context: ViewContext, views: ContactSavedView[]) => safeStorage.setItem(localKey(context), JSON.stringify(views))

const normalizeLegacyView = (view: Partial<ContactSavedView> & Record<string, unknown>): ContactSavedView => ({
  id: String(view.id ?? randomId()), workspaceId: String(view.workspaceId ?? ''), createdBy: String(view.createdBy ?? ''), name: String(view.name ?? 'Exibição'),
  display: view.display === 'board' ? 'board' : view.display === 'compact' ? 'compact' : 'table', filters: view.filters && typeof view.filters === 'object' ? view.filters as Record<string,string> : {},
  columns: Array.isArray(view.columns) ? view.columns.map(String) : [], density: view.density === 'compact' ? 'compact' : 'comfortable', sort: String(view.sort ?? 'updated-desc'), groupBy: 'stage',
  visibility: view.visibility === 'workspace' ? 'workspace' : 'private', isDefault: Boolean(view.isDefault), color: typeof view.color === 'string' ? view.color : '#315fd6',
  icon: CONTACT_VIEW_ICONS.includes(view.icon as ContactSavedViewIcon) ? view.icon as ContactSavedViewIcon : 'table', position: Number.isFinite(Number(view.position)) ? Number(view.position) : 100,
  starterKey: ['all','hot','due','no-action'].includes(String(view.starterKey)) ? view.starterKey as ContactStarterViewKey : null, isArchived: Boolean(view.isArchived),
  createdAt: String(view.createdAt ?? new Date().toISOString()), updatedAt: String(view.updatedAt ?? new Date().toISOString()),
})

const mapRow = (row: any): ContactSavedView => ({
  id: String(row.id), workspaceId: String(row.organization_id), createdBy: String(row.created_by), name: String(row.name ?? 'Exibição'),
  display: row.display === 'board' ? 'board' : row.display === 'compact' ? 'compact' : 'table',
  filters: row.filters && typeof row.filters === 'object' ? row.filters as Record<string, string> : {},
  columns: Array.isArray(row.columns) ? row.columns.map(String) : [], density: row.density === 'compact' ? 'compact' : 'comfortable',
  sort: String(row.sort_key ?? 'updated-desc'), groupBy: 'stage', visibility: row.visibility === 'workspace' ? 'workspace' : 'private',
  isDefault: Boolean(row.is_default), color: String(row.color ?? '#315fd6'), icon: CONTACT_VIEW_ICONS.includes(row.icon as ContactSavedViewIcon) ? row.icon as ContactSavedViewIcon : 'table',
  position: Number(row.position ?? 100), starterKey: ['all','hot','due','no-action'].includes(String(row.starter_key)) ? row.starter_key as ContactStarterViewKey : null,
  isArchived: Boolean(row.is_archived), createdAt: String(row.created_at ?? new Date().toISOString()), updatedAt: String(row.updated_at ?? new Date().toISOString()),
})

const sortViews = (views: ContactSavedView[], userId: string) => [...views].sort((a,b) => {
  const ownerDiff = Number(b.createdBy === userId) - Number(a.createdBy === userId)
  if (ownerDiff) return ownerDiff
  if (a.position !== b.position) return a.position - b.position
  return a.updatedAt.localeCompare(b.updatedAt)
})

async function loadSupabaseRows(context: ViewContext, includeArchived = false): Promise<ContactSavedView[] | null> {
  const client = getSupabaseClient()
  if (!client || !context.userId) return null
  let query = (client as any).from('contact_saved_views').select('*').eq('organization_id', context.workspaceId)
  if (!includeArchived) query = query.eq('is_archived', false)
  const { data, error } = await query
  if (error) return null
  return (data ?? []).map(mapRow)
}

export async function ensureContactStarterViews(context: ViewContext): Promise<void> {
  const client = getSupabaseClient()
  if (context.mode === 'supabase' && client && context.userId) {
    const allRows = await loadSupabaseRows(context, true)
    if (allRows) {
      const mine = allRows.filter((view) => view.createdBy === context.userId)
      const hasDefault = mine.some((view) => view.isDefault && !view.isArchived)
      for (const starter of STARTER_VIEWS) {
        if (mine.some((view) => view.starterKey === starter.starterKey)) continue
        await saveContactSavedView(context, { ...starter, id: randomId(), isDefault: starter.starterKey === 'all' && !hasDefault, isArchived: false })
      }
      return
    }
  }
  const current = readLocal(context)
  const mine = current.filter((view) => view.createdBy === context.userId || !view.createdBy)
  const hasDefault = mine.some((view) => view.isDefault && !view.isArchived)
  let changed = false
  const next = [...current]
  for (const starter of STARTER_VIEWS) {
    if (mine.some((view) => view.starterKey === starter.starterKey)) continue
    const now = new Date().toISOString()
    next.push({ ...starter, id: randomId(), workspaceId: context.workspaceId, createdBy: context.userId, isDefault: starter.starterKey === 'all' && !hasDefault, isArchived: false, createdAt: now, updatedAt: now })
    changed = true
  }
  if (changed) writeLocal(context, next)
}

export async function listContactSavedViews(context: ViewContext): Promise<ContactSavedView[]> {
  const client = getSupabaseClient()
  if (context.mode === 'supabase' && client && context.userId) {
    const rows = await loadSupabaseRows(context)
    if (rows) {
      const views = sortViews(rows, context.userId)
      const localMine = readLocal(context).filter((view) => view.createdBy === context.userId && view.isArchived)
      writeLocal(context, [...views, ...localMine])
      replaceSurfaceUniversalViews(context.workspaceId, 'contacts', [...views, ...localMine].map(contactSavedViewToUniversal))
      return views
    }
  }
  const views = sortViews(readLocal(context).filter((view) => !view.isArchived && (view.createdBy === context.userId || view.visibility === 'workspace')), context.userId)
  replaceSurfaceUniversalViews(context.workspaceId, 'contacts', views.map(contactSavedViewToUniversal))
  return views
}


export async function saveContactSavedView(context: ViewContext, input: WritableContactView): Promise<ContactSavedView> {
  const now = new Date().toISOString()
  const client = getSupabaseClient()
  if (context.mode === 'supabase' && client && context.userId) {
    if (input.isDefault) await (client as any).from('contact_saved_views').update({ is_default: false, updated_at: now }).eq('organization_id', context.workspaceId).eq('created_by', context.userId)
    const payload = {
      id: input.id, organization_id: context.workspaceId, created_by: context.userId, name: input.name, display: input.display, filters: input.filters,
      columns: input.columns, density: input.density, sort_key: input.sort, group_by: input.groupBy, visibility: input.visibility, is_default: input.isDefault,
      color: input.color, icon: input.icon, position: input.position, starter_key: input.starterKey, is_archived: input.isArchived, updated_at: now,
    }
    const { data, error } = await (client as any).from('contact_saved_views').upsert(payload).select('*').single()
    if (!error && data) {
      const saved = mapRow(data)
      const cached = readLocal(context).filter((item) => item.id !== saved.id && (!saved.isDefault || !item.isDefault))
      writeLocal(context, [saved, ...cached])
      saveUniversalView(contactSavedViewToUniversal(saved))
      return saved
    }
  }
  const current = readLocal(context)
  const previous = current.find((item) => item.id === input.id)
  const saved: ContactSavedView = { ...input, workspaceId: context.workspaceId, createdBy: context.userId, createdAt: previous?.createdAt ?? now, updatedAt: now }
  const next = current.filter((item) => item.id !== saved.id).map((item) => saved.isDefault && item.createdBy === context.userId ? { ...item, isDefault: false } : item)
  writeLocal(context, [saved, ...next])
  saveUniversalView(contactSavedViewToUniversal(saved))
  return saved
}

export async function deleteContactSavedView(context: ViewContext, view: ContactSavedView): Promise<void> {
  const client = getSupabaseClient()
  if (view.starterKey) {
    if (context.mode === 'supabase' && client && context.userId) await (client as any).from('contact_saved_views').update({ is_archived: true, is_default: false, updated_at: new Date().toISOString() }).eq('id', view.id).eq('organization_id', context.workspaceId).eq('created_by', context.userId)
    writeLocal(context, readLocal(context).map((item) => item.id === view.id ? { ...item, isArchived: true, isDefault: false } : item))
    archiveUniversalView(context.workspaceId, view.id, 'contacts')
    return
  }
  if (context.mode === 'supabase' && client && context.userId) await (client as any).from('contact_saved_views').delete().eq('id', view.id).eq('organization_id', context.workspaceId).eq('created_by', context.userId)
  writeLocal(context, readLocal(context).filter((item) => item.id !== view.id))
  removeUniversalView(context.workspaceId, view.id, 'contacts')
}


export async function reorderContactSavedViews(context: ViewContext, orderedOwnedIds: string[]): Promise<void> {
  const client = getSupabaseClient()
  if (context.mode === 'supabase' && client && context.userId) {
    for (let position = 0; position < orderedOwnedIds.length; position += 1) {
      await (client as any).from('contact_saved_views').update({ position, updated_at: new Date().toISOString() }).eq('id', orderedOwnedIds[position]).eq('organization_id', context.workspaceId).eq('created_by', context.userId)
    }
  }
  const positions = new Map(orderedOwnedIds.map((id, index) => [id, index]))
  writeLocal(context, readLocal(context).map((view) => positions.has(view.id) ? { ...view, position: positions.get(view.id) ?? view.position } : view))
  reorderUniversalViews(context.workspaceId, 'contacts', orderedOwnedIds)
}

