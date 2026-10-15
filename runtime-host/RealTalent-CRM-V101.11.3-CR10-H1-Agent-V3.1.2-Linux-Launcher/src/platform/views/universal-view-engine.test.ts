import { describe, expect, it } from 'vitest'
import { DEMO_LEADS } from '../../domain/defaults'
import { leadAdapter } from '../records/core-adapters'
import { andFilter, condition } from './filter-ast'
import { contactSavedViewToUniversal, pipelineSavedViewToUniversal } from './legacy-view-adapters'
import { createViewDefinition } from './view-definition'
import { listUniversalViews, readUniversalViews, removeUniversalView, replaceSurfaceUniversalViews, saveUniversalView } from './view-store'
import { defaultPlatformRecordResolver, executeView } from './view-engine'

const records = DEMO_LEADS.map(leadAdapter.toPlatformRecord)

describe('V101.9.1 Universal View Engine', () => {
  it('executa AND/OR/NOT sobre PlatformRecord sem alterar os registros', () => {
    const before = JSON.stringify(DEMO_LEADS)
    const view = createViewDefinition({
      id: 'test-filter', workspaceId: DEMO_LEADS[0].workspaceId, objectKey: 'lead', surface: 'test', name: 'Filtro', display: 'table', visibility: 'personal', ownerId: null,
      filters: andFilter(
        { kind: 'group', id: 'hot-or-high', operator: 'or', children: [condition('hot', 'lead.temperature', 'eq', 'hot'), condition('high', 'lead.priority', 'eq', 'high')] },
        { kind: 'not', id: 'not-archived', child: condition('archived', 'lead.status', 'eq', 'archived') },
      ),
      columns: [], sort: [{ fieldId: 'lead.name', direction: 'asc' }], grouping: [], position: 0, isDefault: false, isArchived: false,
    })
    const result = executeView(view, records, defaultPlatformRecordResolver)
    expect(result.records.length).toBeGreaterThan(0)
    expect(result.records.every((record) => record.legacy.status !== 'archived')).toBe(true)
    expect(JSON.stringify(DEMO_LEADS)).toBe(before)
  })

  it('valida tipos de campo e agrupa por metadata', () => {
    const view = createViewDefinition({
      id: 'test-group', workspaceId: DEMO_LEADS[0].workspaceId, objectKey: 'lead', surface: 'test', name: 'Grupo', display: 'kanban', visibility: 'workspace', ownerId: null,
      filters: condition('active', 'lead.status', 'eq', 'active'), columns: [], sort: [{ fieldId: 'lead.value', direction: 'desc' }], grouping: [{ fieldId: 'lead.stageId' }], position: 0, isDefault: false, isArchived: false,
    })
    const result = executeView(view, records, defaultPlatformRecordResolver)
    expect(result.diagnostics.filter((issue) => issue.severity === 'error')).toHaveLength(0)
    expect(result.groups.length).toBeGreaterThan(0)
    expect(result.records.map((record) => record.legacy.value)).toEqual([...result.records].map((record) => record.legacy.value).sort((a,b) => b-a))
  })

  it('converte views legadas de Contatos para ViewDefinition 101.9.1', () => {
    const view = contactSavedViewToUniversal({
      id: 'contact-view', workspaceId: 'ws', createdBy: 'user', name: 'Quentes', display: 'board', filters: { temperature: 'hot', status: 'active', due: 'all' }, columns: ['contact','stage'], density: 'comfortable', sort: 'updated-desc', groupBy: 'stage', visibility: 'private', isDefault: true, position: 1, starterKey: 'hot', isArchived: false, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
    })
    expect(view.schemaVersion).toBe('101.9.1')
    expect(view.surface).toBe('contacts')
    expect(view.display).toBe('kanban')
    expect(view.visibility).toBe('personal')
    expect(view.grouping[0]?.fieldId).toBe('lead.stageId')
  })

  it('converte Pipeline preservando modos avançados e filtros derivados', () => {
    const view = pipelineSavedViewToUniversal('ws', { id: 'pipeline-risk', name: 'Risco', filters: { query: '', stage: 'all', temperature: 'all', priority: 'all', source: 'all', due: 'all', owner: 'all', health: 'critical' }, viewMode: 'forecast', compact: false, sort: 'deal_health_asc', scope: 'team', position: 2, isDefault: false, starterKey: 'risk' })
    expect(view.surface).toBe('pipeline')
    expect(view.display).toBe('forecast')
    expect(view.derivedFields?.some((field) => field.id === 'lead.__dealHealth')).toBe(true)
    expect(view.extensions?.scope).toBe('team')
  })

  it('isola IDs iguais entre superfícies e substitui projeções sem deixar views órfãs', () => {
    const workspaceId = `ws-view-store-${Date.now()}`
    const baseView = {
      id: 'same-id', workspaceId, objectKey: 'lead' as const, name: 'Mesmo ID', display: 'table' as const,
      visibility: 'personal' as const, ownerId: null, filters: andFilter(), columns: [], sort: [], grouping: [],
      position: 0, isDefault: false, isArchived: false,
    }
    saveUniversalView(createViewDefinition({ ...baseView, surface: 'contacts' }))
    saveUniversalView(createViewDefinition({ ...baseView, surface: 'pipeline', display: 'kanban' }))
    expect(readUniversalViews(workspaceId)).toHaveLength(2)

    replaceSurfaceUniversalViews(workspaceId, 'pipeline', [createViewDefinition({ ...baseView, id: 'pipeline-new', surface: 'pipeline', display: 'kanban' })])
    expect(readUniversalViews(workspaceId).map((view) => `${view.surface}:${view.id}`).sort()).toEqual(['contacts:same-id', 'pipeline:pipeline-new'])

    removeUniversalView(workspaceId, 'same-id', 'contacts')
    expect(listUniversalViews({ workspaceId, surface: 'contacts' })).toHaveLength(0)
    expect(listUniversalViews({ workspaceId, surface: 'pipeline' })).toHaveLength(1)
  })

})
