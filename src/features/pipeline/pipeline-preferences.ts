import { safeStorage } from '../../lib/storage'
import type { PipelineStagePolicy } from '../../services/pipeline-intelligence'

export type PipelineViewMode = 'board' | 'list' | 'forecast' | 'calendar' | 'funnel'
export type PipelineSort = 'updated_desc' | 'next_action' | 'value_desc' | 'name'
export type PipelineHealthFilter = 'all' | 'healthy' | 'attention' | 'critical' | 'no_action' | 'proposal_stale'
export type PipelineCardField = 'company' | 'city' | 'owner' | 'priority' | 'value' | 'source' | 'tags' | 'nextAction' | 'stageAge' | 'lastInteraction' | 'attempts' | 'health'

export interface PipelineFiltersState {
  query: string
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
}

export type PipelineStageConfig = PipelineStagePolicy

export interface PipelinePreferences {
  cardFields: PipelineCardField[]
  collapsedStageIds: string[]
  savedViews: PipelineSavedView[]
  stageConfigs: Record<string, PipelineStageConfig>
}

export const DEFAULT_CARD_FIELDS: PipelineCardField[] = ['company', 'city', 'owner', 'priority', 'value', 'source', 'tags', 'nextAction', 'stageAge', 'health']
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

export const loadPipelinePreferences = (workspaceId: string): PipelinePreferences => {
  const fallback: PipelinePreferences = { cardFields: DEFAULT_CARD_FIELDS, collapsedStageIds: [], savedViews: [], stageConfigs: {} }
  if (!workspaceId) return fallback
  try {
    const raw = safeStorage.getItem(keyFor(workspaceId))
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<PipelinePreferences>
    return {
      cardFields: Array.isArray(parsed.cardFields) && parsed.cardFields.length ? parsed.cardFields : DEFAULT_CARD_FIELDS,
      collapsedStageIds: Array.isArray(parsed.collapsedStageIds) ? parsed.collapsedStageIds : [],
      savedViews: Array.isArray(parsed.savedViews) ? parsed.savedViews : [],
      stageConfigs: parsed.stageConfigs && typeof parsed.stageConfigs === 'object' ? parsed.stageConfigs : {},
    }
  } catch {
    return fallback
  }
}

export const savePipelinePreferences = (workspaceId: string, preferences: PipelinePreferences): void => {
  if (!workspaceId) return
  safeStorage.setItem(keyFor(workspaceId), JSON.stringify(preferences))
}

export const getStageConfig = (preferences: PipelinePreferences, stageId: string): PipelineStageConfig => ({
  ...DEFAULT_STAGE_CONFIG,
  ...(preferences.stageConfigs[stageId] ?? {}),
})
