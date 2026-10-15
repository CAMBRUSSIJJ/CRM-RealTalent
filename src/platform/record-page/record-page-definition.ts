import type { CoreObjectKey } from '../metadata/types'

export type RecordPageWidgetKind =
  | 'identity'
  | 'fields'
  | 'timeline'
  | 'related-records'
  | 'quick-actions'
  | 'communication'
  | 'notes'
  | 'custom'

export type RecordPageRegion = 'left' | 'main' | 'right'

export interface RecordPageWidgetDefinition {
  id: string
  kind: RecordPageWidgetKind
  title: string
  region: RecordPageRegion
  fieldIds?: string[]
  relationIds?: string[]
  tabIds?: string[]
  config?: Record<string, unknown>
}

export interface RecordPageTabDefinition {
  id: string
  label: string
  widgetIds: string[]
}

export interface RecordPageDefinition {
  schemaVersion: '101.9.2'
  id: string
  surface: string
  label: string
  canonicalObjectKey: CoreObjectKey
  acceptedObjectKeys: CoreObjectKey[]
  defaultTabId: string
  tabs: RecordPageTabDefinition[]
  widgets: RecordPageWidgetDefinition[]
  layout: {
    left: string[]
    main: string[]
    right: string[]
  }
  extensions?: Record<string, unknown>
}

export interface RecordPageRecordRef {
  objectKey: CoreObjectKey
  id: string
  workspaceId: string
  label: string
}

export interface RecordPageRuntimeModel {
  definitionId: string
  surface: string
  canonicalObjectKey: CoreObjectKey
  source: RecordPageRecordRef
  canonical: RecordPageRecordRef | null
  relationCounts: Record<string, number>
  diagnostics: Array<{
    severity: 'warning' | 'error'
    code: string
    message: string
  }>
}

export const createRecordPageDefinition = (
  input: Omit<RecordPageDefinition, 'schemaVersion'>,
): RecordPageDefinition => ({
  ...input,
  schemaVersion: '101.9.2',
  tabs: input.tabs.map((tab) => ({ ...tab, widgetIds: [...tab.widgetIds] })),
  widgets: input.widgets.map((widget) => ({
    ...widget,
    fieldIds: widget.fieldIds ? [...widget.fieldIds] : undefined,
    relationIds: widget.relationIds ? [...widget.relationIds] : undefined,
    tabIds: widget.tabIds ? [...widget.tabIds] : undefined,
    config: widget.config ? { ...widget.config } : undefined,
  })),
  layout: {
    left: [...input.layout.left],
    main: [...input.layout.main],
    right: [...input.layout.right],
  },
  extensions: input.extensions ? { ...input.extensions } : undefined,
})
