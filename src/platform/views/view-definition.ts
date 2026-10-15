import type { CoreObjectKey, FieldKind } from '../metadata/types'
import type { FilterAst } from './filter-ast'

export type ViewDisplayKind = 'table' | 'list' | 'kanban' | 'calendar' | 'forecast' | 'funnel' | 'cards' | 'compact'
export type ViewVisibility = 'personal' | 'workspace'
export type ViewSortDirection = 'asc' | 'desc'
export type ViewNullOrder = 'first' | 'last'

export interface ViewColumnDefinition {
  fieldId: string
  visible: boolean
  width?: number
  position: number
}

export interface ViewSortDefinition {
  fieldId: string
  direction: ViewSortDirection
  nulls?: ViewNullOrder
  strategy?: 'auto' | 'text' | 'number' | 'date' | 'custom'
  legacyKey?: string
}

export interface ViewGroupDefinition {
  fieldId: string
  direction?: ViewSortDirection
  emptyLabel?: string
  legacyKey?: string
}

export interface ViewDerivedFieldDefinition {
  id: string
  label: string
  kind: FieldKind
  description?: string
}

export interface ViewDefinition {
  schemaVersion: '101.9.1'
  id: string
  workspaceId: string
  objectKey: CoreObjectKey
  surface: 'contacts' | 'pipeline' | string
  name: string
  display: ViewDisplayKind
  visibility: ViewVisibility
  ownerId: string | null
  filters: FilterAst
  columns: ViewColumnDefinition[]
  sort: ViewSortDefinition[]
  grouping: ViewGroupDefinition[]
  derivedFields?: ViewDerivedFieldDefinition[]
  position: number
  isDefault: boolean
  isArchived: boolean
  createdAt: string
  updatedAt: string
  extensions?: Record<string, unknown>
}

export type WritableViewDefinition = Omit<ViewDefinition, 'schemaVersion' | 'createdAt' | 'updatedAt'> & {
  createdAt?: string
  updatedAt?: string
}

export const createViewDefinition = (input: WritableViewDefinition): ViewDefinition => {
  const now = new Date().toISOString()
  return {
    ...input,
    schemaVersion: '101.9.1',
    columns: [...input.columns].sort((a, b) => a.position - b.position),
    sort: [...input.sort],
    grouping: [...input.grouping],
    derivedFields: input.derivedFields ? [...input.derivedFields] : undefined,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    extensions: input.extensions ? { ...input.extensions } : undefined,
  }
}
