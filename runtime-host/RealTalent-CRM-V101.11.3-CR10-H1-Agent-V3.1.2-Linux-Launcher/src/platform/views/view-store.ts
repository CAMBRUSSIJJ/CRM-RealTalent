import { safeStorage } from '../../lib/storage'
import type { ViewDefinition, WritableViewDefinition } from './view-definition'
import { createViewDefinition } from './view-definition'

const PREFIX = 'realtalent.universal-views.v10191:'
const keyFor = (workspaceId: string) => `${PREFIX}${workspaceId || 'default'}`

const sameIdentity = (left: Pick<ViewDefinition, 'surface' | 'id'>, right: Pick<ViewDefinition, 'surface' | 'id'>) => left.surface === right.surface && left.id === right.id

const normalize = (raw: unknown): ViewDefinition[] => {
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is ViewDefinition => Boolean(item && typeof item === 'object' && (item as ViewDefinition).schemaVersion === '101.9.1'))
}

export const readUniversalViews = (workspaceId: string): ViewDefinition[] => {
  try { return normalize(JSON.parse(safeStorage.getItem(keyFor(workspaceId)) ?? '[]')) }
  catch { return [] }
}

const writeUniversalViews = (workspaceId: string, views: ViewDefinition[]) => {
  safeStorage.setItem(keyFor(workspaceId), JSON.stringify(views))
}

export const listUniversalViews = (context: { workspaceId: string; ownerId?: string | null; surface?: string; includeArchived?: boolean }): ViewDefinition[] => {
  const ownerId = context.ownerId ?? null
  return readUniversalViews(context.workspaceId)
    .filter((view) => !context.surface || view.surface === context.surface)
    .filter((view) => context.includeArchived || !view.isArchived)
    .filter((view) => view.visibility === 'workspace' || !ownerId || view.ownerId === ownerId || view.ownerId === null)
    .sort((a, b) => a.position - b.position || a.updatedAt.localeCompare(b.updatedAt))
}

export const saveUniversalView = (input: WritableViewDefinition | ViewDefinition): ViewDefinition => {
  const current = readUniversalViews(input.workspaceId)
  const previous = current.find((view) => sameIdentity(view, input))
  const saved = createViewDefinition({
    ...input,
    createdAt: previous?.createdAt ?? input.createdAt,
    updatedAt: new Date().toISOString(),
  })
  const next = current
    .filter((view) => !sameIdentity(view, saved))
    .map((view) => saved.isDefault && view.surface === saved.surface && view.ownerId === saved.ownerId ? { ...view, isDefault: false } : view)
  writeUniversalViews(saved.workspaceId, [saved, ...next])
  return saved
}

export const removeUniversalView = (workspaceId: string, id: string, surface?: string) => {
  writeUniversalViews(workspaceId, readUniversalViews(workspaceId).filter((view) => !(view.id === id && (!surface || view.surface === surface))))
}

export const archiveUniversalView = (workspaceId: string, id: string, surface?: string) => {
  writeUniversalViews(workspaceId, readUniversalViews(workspaceId).map((view) => view.id === id && (!surface || view.surface === surface) ? { ...view, isArchived: true, isDefault: false, updatedAt: new Date().toISOString() } : view))
}

export const reorderUniversalViews = (workspaceId: string, surface: string, orderedIds: string[]) => {
  const positions = new Map(orderedIds.map((id, index) => [id, index]))
  writeUniversalViews(workspaceId, readUniversalViews(workspaceId).map((view) => view.surface === surface && positions.has(view.id) ? { ...view, position: positions.get(view.id) ?? view.position, updatedAt: new Date().toISOString() } : view))
}

export const replaceSurfaceUniversalViews = (workspaceId: string, surface: string, views: ViewDefinition[]) => {
  const untouched = readUniversalViews(workspaceId).filter((view) => view.surface !== surface)
  writeUniversalViews(workspaceId, [...views, ...untouched])
}
