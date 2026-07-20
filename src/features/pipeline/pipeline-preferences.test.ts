import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CARD_FIELDS, DEFAULT_STAGE_CONFIG, getStageConfig, loadPipelinePreferences, savePipelinePreferences } from './pipeline-preferences'

describe('pipeline preferences', () => {
  beforeEach(() => window.localStorage.clear())

  it('loads professional defaults for a new workspace', () => {
    const value = loadPipelinePreferences('workspace-new')
    expect(value.cardFields).toEqual(DEFAULT_CARD_FIELDS)
    expect(value.savedViews).toEqual([])
    expect(getStageConfig(value, 'stage-1')).toEqual(DEFAULT_STAGE_CONFIG)
  })

  it('persists card fields, saved views and stage rules by workspace', () => {
    savePipelinePreferences('workspace-a', {
      cardFields: ['owner', 'health'],
      collapsedStageIds: ['stage-1'],
      savedViews: [{
        id: 'view-1', name: 'Leads críticos', viewMode: 'list', compact: true, sort: 'next_action',
        filters: { query: '', temperature: 'all', priority: 'all', source: 'all', due: 'all', owner: 'all', health: 'critical' },
      }],
      stageConfigs: { 'stage-1': { ...DEFAULT_STAGE_CONFIG, maxDays: 3, requirePhone: true } },
    })
    const value = loadPipelinePreferences('workspace-a')
    expect(value.cardFields).toEqual(['owner', 'health'])
    expect(value.collapsedStageIds).toEqual(['stage-1'])
    expect(value.savedViews[0]?.name).toBe('Leads críticos')
    expect(getStageConfig(value, 'stage-1').maxDays).toBe(3)
    expect(getStageConfig(value, 'stage-1').requirePhone).toBe(true)
    expect(loadPipelinePreferences('workspace-b').savedViews).toEqual([])
  })
})
