import { safeStorage } from '../../lib/storage'
import type { PipelineStagePolicy } from '../../services/pipeline-intelligence'
import { pipelineSavedViewToUniversal } from '../../platform/views/legacy-view-adapters'
import { replaceSurfaceUniversalViews } from '../../platform/views/view-store'

export type PipelineViewMode = 'board' | 'list' | 'forecast' | 'calendar' | 'funnel'
export type PipelineScope = 'mine' | 'team'
export type PipelineSort = 'deal_health_asc' | 'deal_probability_desc' | 'updated_desc' | 'next_action' | 'value_desc' | 'probability_desc' | 'close_date' | 'name'
export type PipelineHealthFilter = 'all' | 'strong' | 'healthy' | 'attention' | 'critical' | 'no_action' | 'proposal_stale'
export type PipelineCardField = 'company' | 'city' | 'owner' | 'priority' | 'value' | 'source' | 'tags' | 'nextAction' | 'stageAge' | 'lastInteraction' | 'attempts' | 'health'

export interface PipelineFiltersState {
  query: string
  stage: string
  temperature: string
  priority: string
  source: string
  due: string
  owner: string
  health: PipelineHealthFilter
}

export interface PipelineSavedView {
  id: string
  name: string
  filters: PipelineFiltersState
  viewMode: PipelineViewMode
  compact: boolean
  sort: PipelineSort
  scope?: PipelineScope
  position?: number
  isDefault?: boolean
  starterKey?: 'mine' | 'risk' | 'proposal' | 'no-action' | null
}

export type PipelineStageConfig = PipelineStagePolicy

export interface PipelinePreferences {
  cardFields: PipelineCardField[]
  collapsedStageIds: string[]
  savedViews: PipelineSavedView[]
  stageConfigs: Record<string, PipelineStageConfig>
  intelligenceCollapsed: boolean
  lastViewMode: PipelineViewMode
  compact: boolean
  savedViewsInitialized?: boolean
}


export const DEFAULT_PIPELINE_SAVED_VIEWS: PipelineSavedView[] = [
  { id: 'starter-mine', name: 'Meus negócios', filters: { query: '', stage: 'all', temperature: 'all', priority: 'all', source: 'all', due: 'all', owner: 'all', health: 'all' }, viewMode: 'board', compact: false, sort: 'updated_desc', scope: 'mine', position: 0, starterKey: 'mine' },
  { id: 'starter-risk', name: 'Em risco', filters: { query: '', stage: 'all', temperature: 'all', priority: 'all', source: 'all', due: 'all', owner: 'all', health: 'critical' }, viewMode: 'board', compact: false, sort: 'deal_health_asc', scope: 'team', position: 1, starterKey: 'risk' },
  { id: 'starter-proposal', name: 'Propostas sem retorno', filters: { query: '', stage: 'all', temperature: 'all', priority: 'all', source: 'all', due: 'all', owner: 'all', health: 'proposal_stale' }, viewMode: 'board', compact: false, sort: 'next_action', scope: 'team', position: 2, starterKey: 'proposal' },
  { id: 'starter-no-action', name: 'Sem próxima ação', filters: { query: '', stage: 'all', temperature: 'all', priority: 'all', source: 'all', due: 'none', owner: 'all', health: 'no_action' }, viewMode: 'board', compact: false, sort: 'updated_desc', scope: 'team', position: 3, starterKey: 'no-action' },
]

const LEGACY_DENSE_CARD_FIELDS: PipelineCardField[] = ['company', 'city', 'owner', 'priority', 'value', 'source', 'tags', 'nextAction', 'stageAge', 'health']
export const DEFAULT_CARD_FIELDS: PipelineCardField[] = ['company', 'owner', 'priority', 'value', 'nextAction', 'health']
const isLegacyDenseCardLayout = (fields: PipelineCardField[]) => fields.length === LEGACY_DENSE_CARD_FIELDS.length && LEGACY_DENSE_CARD_FIELDS.every((field, index) => fields[index] === field)
export const DEFAULT_STAGE_CONFIG: PipelineStageConfig = {
  maxDays: 7,
  requirePhone: false,
  requireValue: false,
  requireNextAction: true,
  preventSkipping: false,
  confirmBackward: true,
  instructions: '',
}

const keyFor = (workspaceId: string) => `realtalent-crm-v1008-pipeline:${workspaceId}`
const PIPELINE_VIEW_MODES: PipelineViewMode[] = ['board', 'list', 'forecast', 'calendar', 'funnel']

const syncUniversalPipelineViews = (workspaceId: string, views: PipelineSavedView[]) => {
  if (!workspaceId) return
  replaceSurfaceUniversalViews(workspaceId, 'pipeline', views.map((view) => pipelineSavedViewToUniversal(workspaceId, view)))
}

export const loadPipelinePreferences = (workspaceId: string): PipelinePreferences => {
  const fallback: PipelinePreferences = { cardFields: DEFAULT_CARD_FIELDS, collapsedStageIds: [], savedViews: DEFAULT_PIPELINE_SAVED_VIEWS.map((item) => ({ ...item, filters: { ...item.filters } })), stageConfigs: {}, intelligenceCollapsed: true, lastViewMode: 'board', compact: false, savedViewsInitialized: true }
  if (!workspaceId) return fallback
  try {
    const raw = safeStorage.getItem(keyFor(workspaceId))
    if (!raw) { syncUniversalPipelineViews(workspaceId, fallback.savedViews); return fallback }
    const parsed = JSON.parse(raw) as Partial<PipelinePreferences>
    const normalized: PipelinePreferences = {
      cardFields: Array.isArray(parsed.cardFields) && parsed.cardFields.length ? (isLegacyDenseCardLayout(parsed.cardFields) ? DEFAULT_CARD_FIELDS : parsed.cardFields) : DEFAULT_CARD_FIELDS,
      collapsedStageIds: Array.isArray(parsed.collapsedStageIds) ? parsed.collapsedStageIds : [],
      savedViews: Array.isArray(parsed.savedViews) && (parsed.savedViews.length || parsed.savedViewsInitialized === true) ? parsed.savedViews.map((item, index) => ({ ...item, position: Number.isFinite(Number(item.position)) ? Number(item.position) : index })) : DEFAULT_PIPELINE_SAVED_VIEWS.map((item) => ({ ...item, filters: { ...item.filters } })),
      stageConfigs: parsed.stageConfigs && typeof parsed.stageConfigs === 'object' ? parsed.stageConfigs : {},
      intelligenceCollapsed: parsed.intelligenceCollapsed !== false,
      lastViewMode: PIPELINE_VIEW_MODES.includes(parsed.lastViewMode as PipelineViewMode) ? parsed.lastViewMode as PipelineViewMode : 'board',
      compact: parsed.compact === true,
      savedViewsInitialized: true,
    }
    syncUniversalPipelineViews(workspaceId, normalized.savedViews)
    return normalized
  } catch {
    syncUniversalPipelineViews(workspaceId, fallback.savedViews)
    return fallback
  }
}


export const savePipelinePreferences = (workspaceId: string, preferences: PipelinePreferences): void => {
  if (!workspaceId) return
  safeStorage.setItem(keyFor(workspaceId), JSON.stringify(preferences))
  syncUniversalPipelineViews(workspaceId, preferences.savedViews)
}


export const getStageConfig = (preferences: PipelinePreferences, stageId: string): PipelineStageConfig => ({
  ...DEFAULT_STAGE_CONFIG,
  ...(preferences.stageConfigs[stageId] ?? {}),
})
