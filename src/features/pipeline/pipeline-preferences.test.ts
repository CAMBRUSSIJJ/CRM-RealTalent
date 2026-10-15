import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CARD_FIELDS, DEFAULT_PIPELINE_SAVED_VIEWS, DEFAULT_STAGE_CONFIG, getStageConfig, loadPipelinePreferences, savePipelinePreferences } from './pipeline-preferences'

describe('pipeline preferences', () => {
  beforeEach(() => window.localStorage.clear())

  it('loads professional defaults for a new workspace', () => {
    const value = loadPipelinePreferences('workspace-new')
    expect(value.cardFields).toEqual(DEFAULT_CARD_FIELDS)
    expect(value.savedViews).toEqual(DEFAULT_PIPELINE_SAVED_VIEWS)
    expect(value.lastViewMode).toBe('board')
    expect(value.compact).toBe(false)
    expect(getStageConfig(value, 'stage-1')).toEqual(DEFAULT_STAGE_CONFIG)
  })

  it('persists card fields, saved views and stage rules by workspace', () => {
    savePipelinePreferences('workspace-a', {
      cardFields: ['owner', 'health'],
      collapsedStageIds: ['stage-1'],
      savedViews: [{
        id: 'view-1', name: 'Leads críticos', viewMode: 'list', compact: true, sort: 'next_action', scope: 'mine',
        filters: { query: '', stage: 'all', temperature: 'all', priority: 'all', source: 'all', due: 'all', owner: 'all', health: 'critical' },
      }],
      stageConfigs: { 'stage-1': { ...DEFAULT_STAGE_CONFIG, maxDays: 3, requirePhone: true } },
      intelligenceCollapsed: false,
      lastViewMode: 'forecast',
      compact: true,
    })
    const value = loadPipelinePreferences('workspace-a')
    expect(value.cardFields).toEqual(['owner', 'health'])
    expect(value.collapsedStageIds).toEqual(['stage-1'])
    expect(value.savedViews[0]?.name).toBe('Leads críticos')
    expect(value.savedViews[0]?.scope).toBe('mine')
    expect(value.lastViewMode).toBe('forecast')
    expect(value.compact).toBe(true)
    expect(getStageConfig(value, 'stage-1').maxDays).toBe(3)
    expect(getStageConfig(value, 'stage-1').requirePhone).toBe(true)
    expect(loadPipelinePreferences('workspace-b').savedViews).toEqual(DEFAULT_PIPELINE_SAVED_VIEWS)
  })

  it('keeps an intentionally empty saved-view list after the user removes starter views', () => {
    savePipelinePreferences('workspace-empty', {
      cardFields: DEFAULT_CARD_FIELDS,
      collapsedStageIds: [],
      savedViews: [],
      savedViewsInitialized: true,
      stageConfigs: {},
      intelligenceCollapsed: false,
      lastViewMode: 'board',
      compact: false,
    })
    expect(loadPipelinePreferences('workspace-empty').savedViews).toEqual([])
  })


  it('migrates the old dense default card layout to the consolidated default', () => {
    window.localStorage.setItem('realtalent-crm-v1008-pipeline:workspace-dense', JSON.stringify({
      cardFields: ['company', 'city', 'owner', 'priority', 'value', 'source', 'tags', 'nextAction', 'stageAge', 'health'],
      collapsedStageIds: [], savedViews: [], stageConfigs: {}, intelligenceCollapsed: false,
    }))
    expect(loadPipelinePreferences('workspace-dense').cardFields).toEqual(DEFAULT_CARD_FIELDS)
  })

  it('migrates older preferences without view state safely', () => {
    window.localStorage.setItem('realtalent-crm-v1008-pipeline:workspace-legacy', JSON.stringify({
      cardFields: ['company', 'value'], collapsedStageIds: [], savedViews: [], stageConfigs: {}, intelligenceCollapsed: true,
    }))
    const value = loadPipelinePreferences('workspace-legacy')
    expect(value.lastViewMode).toBe('board')
    expect(value.compact).toBe(false)
    expect(value.intelligenceCollapsed).toBe(true)
    expect(value.savedViews).toEqual(DEFAULT_PIPELINE_SAVED_VIEWS)
  })

})
