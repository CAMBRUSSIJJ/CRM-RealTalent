import { filterOperatorsForKind } from './filter-ast'
import { listUniversalViews, readUniversalViews } from './view-store'

export const inspectUniversalViews = (workspaceId?: string, ownerId?: string | null) => {
  const views = workspaceId ? listUniversalViews({ workspaceId, ownerId, includeArchived: true }) : []
  return {
    version: '101.9.1' as const,
    workspaceId: workspaceId ?? null,
    viewCount: views.length,
    surfaces: [...new Set(views.map((view) => view.surface))],
    views,
    operators: {
      text: filterOperatorsForKind('text'),
      number: filterOperatorsForKind('number'),
      date: filterOperatorsForKind('date'),
      enum: filterOperatorsForKind('enum'),
      tags: filterOperatorsForKind('tags'),
    },
  }
}

declare global {
  interface Window {
    __REALTALENT_VIEWS__?: {
      version: '101.9.1'
      inspect: (workspaceId?: string, ownerId?: string | null) => ReturnType<typeof inspectUniversalViews>
      raw: (workspaceId: string) => ReturnType<typeof readUniversalViews>
    }
  }
}

export const installUniversalViewInspector = () => {
  if (typeof window === 'undefined') return
  window.__REALTALENT_VIEWS__ = {
    version: '101.9.1',
    inspect: (workspaceId, ownerId) => inspectUniversalViews(workspaceId, ownerId),
    raw: (workspaceId) => readUniversalViews(workspaceId),
  }
}
