import type { FilterAst } from './filter-ast'
import { andFilter, condition, emptyFilterAst } from './filter-ast'
import type { ViewDefinition, ViewDisplayKind, ViewSortDefinition } from './view-definition'
import { createViewDefinition } from './view-definition'

export interface LegacyContactViewShape {
  id: string
  workspaceId: string
  createdBy: string
  name: string
  display: 'table' | 'board' | 'compact'
  filters: Record<string, string>
  columns: string[]
  density: 'comfortable' | 'compact'
  sort: string
  groupBy: 'stage'
  visibility: 'private' | 'workspace'
  isDefault: boolean
  position: number
  starterKey: string | null
  isArchived: boolean
  createdAt: string
  updatedAt: string
  color?: string
  icon?: string
}

export interface LegacyPipelineFiltersShape {
  query: string
  stage: string
  temperature: string
  priority: string
  source: string
  due: string
  owner: string
  health: string
}

export interface LegacyPipelineViewShape {
  id: string
  name: string
  filters: LegacyPipelineFiltersShape
  viewMode: 'board' | 'list' | 'forecast' | 'calendar' | 'funnel'
  compact: boolean
  sort: string
  scope?: 'mine' | 'team'
  position?: number
  isDefault?: boolean
  starterKey?: string | null
}

const active = (value: unknown) => value !== undefined && value !== null && value !== '' && value !== 'all'

const contactFilterAst = (filters: Record<string, string>): FilterAst => {
  const nodes: FilterAst[] = []
  if (active(filters.stage)) nodes.push(condition('stage', 'lead.stageId', 'eq', filters.stage))
  if (active(filters.temperature)) nodes.push(condition('temperature', 'lead.temperature', 'eq', filters.temperature))
  if (active(filters.priority)) nodes.push(condition('priority', 'lead.priority', 'eq', filters.priority))
  if (active(filters.status)) nodes.push(condition('status', 'lead.status', 'eq', filters.status))
  if (active(filters.source)) nodes.push(condition('source', 'lead.source', 'eq', filters.source))
  if (active(filters.city)) nodes.push(condition('city', 'lead.city', 'eq', filters.city))
  if (filters.owner === 'none') nodes.push(condition('owner-none', 'lead.ownerName', 'is_empty'))
  else if (active(filters.owner)) nodes.push(condition('owner', 'lead.ownerName', 'eq', filters.owner))
  if (active(filters.tag)) nodes.push(condition('tag', 'lead.tags', 'includes', filters.tag))
  if (filters.due === 'none') nodes.push(condition('due-none', 'lead.nextActionAt', 'is_empty'))
  if (filters.due === 'overdue') nodes.push(condition('due-overdue', 'lead.nextActionAt', 'before', '@now'))
  if (filters.due === 'due') nodes.push(condition('due', 'lead.nextActionAt', 'on_or_before', '@endOfToday'))
  if (filters.due === 'today') nodes.push(andFilter(
    condition('due-today-start', 'lead.nextActionAt', 'on_or_after', '@startOfToday'),
    condition('due-today-end', 'lead.nextActionAt', 'on_or_before', '@endOfToday'),
  ))
  if (filters.quality === 'new') nodes.push(condition('new-week', 'lead.createdAt', 'on_or_after', '@daysAgo:7'))
  if (filters.quality === 'stale') nodes.push(condition('stale-week', 'lead.__lastInteractionAt', 'before', '@daysAgo:7'))
  return nodes.length ? andFilter(...nodes) : emptyFilterAst()
}

const pipelineFilterAst = (filters: LegacyPipelineFiltersShape): FilterAst => {
  const nodes: FilterAst[] = []
  if (active(filters.query)) {
    nodes.push({ kind: 'group', id: 'query', operator: 'or', children: [
      condition('query-name', 'lead.name', 'contains', filters.query),
      condition('query-company', 'lead.company', 'contains', filters.query),
      condition('query-city', 'lead.city', 'contains', filters.query),
      condition('query-phone', 'lead.phone', 'contains', filters.query),
      condition('query-email', 'lead.email', 'contains', filters.query),
      condition('query-tag', 'lead.tags', 'contains', filters.query),
    ] })
  }
  if (active(filters.stage)) nodes.push(condition('stage', 'lead.stageId', 'eq', filters.stage))
  if (active(filters.temperature)) nodes.push(condition('temperature', 'lead.temperature', 'eq', filters.temperature))
  if (active(filters.priority)) nodes.push(condition('priority', 'lead.priority', 'eq', filters.priority))
  if (active(filters.source)) nodes.push(condition('source', 'lead.source', 'eq', filters.source))
  if (filters.owner === 'none') nodes.push(condition('owner-none', 'lead.ownerName', 'is_empty'))
  else if (active(filters.owner)) nodes.push(condition('owner', 'lead.ownerName', 'eq', filters.owner))
  if (filters.due === 'none') nodes.push(condition('due-none', 'lead.nextActionAt', 'is_empty'))
  if (filters.due === 'due') nodes.push(condition('due', 'lead.nextActionAt', 'on_or_before', '@endOfToday'))
  if (filters.health === 'no_action') nodes.push(condition('health-no-action', 'lead.nextActionAt', 'is_empty'))
  else if (filters.health === 'proposal_stale') nodes.push(condition('health-proposal-stale', 'lead.__proposalStale', 'eq', true))
  else if (active(filters.health)) nodes.push(condition('health', 'lead.__dealHealth', 'eq', filters.health))
  return nodes.length ? andFilter(...nodes) : emptyFilterAst()
}

const contactSort = (legacy: string): ViewSortDefinition[] => {
  if (legacy === 'name') return [{ fieldId: 'lead.name', direction: 'asc', strategy: 'text', legacyKey: legacy }]
  if (legacy === 'value-desc') return [{ fieldId: 'lead.value', direction: 'desc', strategy: 'number', legacyKey: legacy }]
  if (legacy === 'next-action') return [{ fieldId: 'lead.nextActionAt', direction: 'asc', nulls: 'last', strategy: 'date', legacyKey: legacy }]
  if (legacy === 'created-desc') return [{ fieldId: 'lead.createdAt', direction: 'desc', strategy: 'date', legacyKey: legacy }]
  if (legacy === 'priority') return [{ fieldId: 'lead.__commercialScore', direction: 'desc', strategy: 'number', legacyKey: legacy }]
  if (legacy.startsWith('custom:')) return [{ fieldId: `lead.__${legacy}`, direction: legacy.endsWith(':desc') ? 'desc' : 'asc', strategy: 'custom', legacyKey: legacy }]
  return [{ fieldId: 'lead.updatedAt', direction: 'desc', strategy: 'date', legacyKey: legacy || 'updated-desc' }]
}

const pipelineSort = (legacy: string): ViewSortDefinition[] => {
  if (legacy === 'deal_health_asc') return [{ fieldId: 'lead.__dealHealthScore', direction: 'asc', strategy: 'number', legacyKey: legacy }]
  if (legacy === 'deal_probability_desc') return [{ fieldId: 'lead.__realTalentProbability', direction: 'desc', strategy: 'number', legacyKey: legacy }]
  if (legacy === 'value_desc') return [{ fieldId: 'lead.value', direction: 'desc', strategy: 'number', legacyKey: legacy }]
  if (legacy === 'probability_desc') return [{ fieldId: 'lead.__probability', direction: 'desc', strategy: 'number', legacyKey: legacy }]
  if (legacy === 'close_date') return [{ fieldId: 'lead.expectedCloseAt', direction: 'asc', nulls: 'last', strategy: 'date', legacyKey: legacy }]
  if (legacy === 'name') return [{ fieldId: 'lead.name', direction: 'asc', strategy: 'text', legacyKey: legacy }]
  if (legacy === 'next_action') return [{ fieldId: 'lead.nextActionAt', direction: 'asc', nulls: 'last', strategy: 'date', legacyKey: legacy }]
  return [{ fieldId: 'lead.updatedAt', direction: 'desc', strategy: 'date', legacyKey: legacy || 'updated_desc' }]
}

const contactDisplay = (display: LegacyContactViewShape['display']): ViewDisplayKind => display === 'board' ? 'kanban' : display === 'compact' ? 'compact' : 'table'
const pipelineDisplay = (display: LegacyPipelineViewShape['viewMode']): ViewDisplayKind => display === 'board' ? 'kanban' : display

export const contactSavedViewToUniversal = (view: LegacyContactViewShape): ViewDefinition => createViewDefinition({
  id: view.id,
  workspaceId: view.workspaceId,
  objectKey: 'lead',
  surface: 'contacts',
  name: view.name,
  display: contactDisplay(view.display),
  visibility: view.visibility === 'workspace' ? 'workspace' : 'personal',
  ownerId: view.createdBy || null,
  filters: contactFilterAst(view.filters),
  columns: view.columns.map((fieldId, position) => ({ fieldId, visible: true, position })),
  sort: contactSort(view.sort),
  grouping: view.groupBy === 'stage' ? [{ fieldId: 'lead.stageId', legacyKey: 'stage' }] : [],
  derivedFields: [
    { id: 'lead.__lastInteractionAt', label: 'Última interação', kind: 'date' },
    { id: 'lead.__commercialScore', label: 'Score comercial', kind: 'number' },
  ],
  position: view.position,
  isDefault: view.isDefault,
  isArchived: view.isArchived,
  createdAt: view.createdAt,
  updatedAt: view.updatedAt,
  extensions: {
    legacySurface: 'contacts-v10161', legacyFilters: { ...view.filters }, density: view.density,
    starterKey: view.starterKey, color: view.color, icon: view.icon,
  },
})

export const pipelineSavedViewToUniversal = (
  workspaceId: string,
  view: LegacyPipelineViewShape,
  ownerId: string | null = null,
): ViewDefinition => createViewDefinition({
  id: view.id,
  workspaceId,
  objectKey: 'lead',
  surface: 'pipeline',
  name: view.name,
  display: pipelineDisplay(view.viewMode),
  visibility: 'personal',
  ownerId,
  filters: pipelineFilterAst(view.filters),
  columns: [],
  sort: pipelineSort(view.sort),
  grouping: view.viewMode === 'board' ? [{ fieldId: 'lead.stageId', legacyKey: 'stage' }] : [],
  derivedFields: [
    { id: 'lead.__dealHealth', label: 'Deal Health', kind: 'enum' },
    { id: 'lead.__dealHealthScore', label: 'Deal Health Score', kind: 'number' },
    { id: 'lead.__realTalentProbability', label: 'Probabilidade RealTalent', kind: 'number' },
    { id: 'lead.__probability', label: 'Probabilidade', kind: 'number' },
    { id: 'lead.__proposalStale', label: 'Proposta estagnada', kind: 'boolean' },
  ],
  position: view.position ?? 100,
  isDefault: Boolean(view.isDefault),
  isArchived: false,
  extensions: {
    legacySurface: 'pipeline-v1008', legacyFilters: { ...view.filters }, compact: view.compact,
    scope: view.scope ?? 'team', starterKey: view.starterKey ?? null,
  },
})
