import { designTokens } from './tokens'

export type DesignPrimitiveId =
  | 'button'
  | 'icon-button'
  | 'input'
  | 'select'
  | 'combobox'
  | 'multi-select'
  | 'entity-picker'
  | 'filter-select'
  | 'checkbox'
  | 'selection-toolbar'
  | 'textarea'
  | 'tabs'
  | 'drawer'
  | 'dialog'
  | 'data-grid'
  | 'surface'
  | 'empty-state'

export interface DesignPrimitiveDefinition {
  id: DesignPrimitiveId
  component: string
  className: string
  status: 'canonical' | 'bridge'
  replaces: string[]
}

const primitives: DesignPrimitiveDefinition[] = [
  { id: 'button', component: 'Button', className: 'rt-button', status: 'canonical', replaces: ['button', 'button--*'] },
  { id: 'icon-button', component: 'IconButton', className: 'rt-icon-button', status: 'canonical', replaces: ['icon-button', 'rt-surface-icon-button-v10172'] },
  { id: 'input', component: 'Input', className: 'rt-input', status: 'canonical', replaces: ['field input', 'search-field input'] },
  { id: 'select', component: 'Select', className: 'rt-select', status: 'canonical', replaces: ['field select', 'select-field select'] },
  { id: 'combobox', component: 'SelectionSelect', className: 'rt-selection-v101105', status: 'canonical', replaces: ['searchable select', 'large enum picker'] },
  { id: 'multi-select', component: 'MultiSelection', className: 'rt-selection-v101105', status: 'canonical', replaces: ['multi chip select', 'checkbox dropdown'] },
  { id: 'entity-picker', component: 'EntityPicker', className: 'rt-selection-v101105', status: 'canonical', replaces: ['lead picker', 'company picker', 'owner picker'] },
  { id: 'filter-select', component: 'FilterSelection', className: 'rt-filter-selection-v101105', status: 'canonical', replaces: ['inline filter select'] },
  { id: 'checkbox', component: 'SelectionCheckbox', className: 'rt-checkbox-v101105', status: 'canonical', replaces: ['input[type=checkbox]'] },
  { id: 'selection-toolbar', component: 'SelectionToolbar', className: 'rt-selection-toolbar-v101105', status: 'canonical', replaces: ['bulk-bar', 'pipeline-bulk-bar', 'prospecting-bulkbar'] },
  { id: 'textarea', component: 'Textarea', className: 'rt-textarea', status: 'canonical', replaces: ['field textarea'] },
  { id: 'tabs', component: 'Tabs', className: 'rt-tabs', status: 'canonical', replaces: ['lead-view-tabs', 'rt-segmented-v10172'] },
  { id: 'drawer', component: 'Drawer', className: 'rt-drawer', status: 'canonical', replaces: ['lead-drawer', 'rt-drawer-v10172'] },
  { id: 'dialog', component: 'Modal', className: 'rt-dialog', status: 'canonical', replaces: ['modal'] },
  { id: 'data-grid', component: 'DataGrid', className: 'rt-data-grid', status: 'canonical', replaces: ['data-table'] },
  { id: 'surface', component: 'Surface', className: 'rt-surface', status: 'canonical', replaces: ['panel', 'toolbar-card', 'data-panel'] },
  { id: 'empty-state', component: 'EmptyState', className: 'rt-empty-state', status: 'canonical', replaces: ['empty-state'] },
]

export function listDesignPrimitives() { return primitives.map((item) => ({ ...item, replaces: [...item.replaces] })) }
export function getDesignPrimitive(id: DesignPrimitiveId) { return primitives.find((item) => item.id === id) ?? null }

export function inspectDesignSystem() {
  return {
    version: '101.10.5',
    referenceSurfaces: ['Meu Dia', 'Contatos'],
    tokens: designTokens,
    primitives: listDesignPrimitives(),
    strategy: 'canonical-last + legacy-bridge',
  }
}

export function installDesignSystemInspector() {
  if (typeof window === 'undefined') return
  ;(window as Window & { __REALTALENT_DESIGN_SYSTEM__?: { inspect: typeof inspectDesignSystem; primitives: typeof listDesignPrimitives } }).__REALTALENT_DESIGN_SYSTEM__ = {
    inspect: inspectDesignSystem,
    primitives: listDesignPrimitives,
  }
}
