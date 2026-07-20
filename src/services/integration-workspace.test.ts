import { beforeEach, describe, expect, it } from 'vitest'
import {
  defaultExtensionConfig, findExtensionConfig, loadIntegrationWorkspace, normalizeExtensionConfig,
  recordLocalIntegrationEvent, saveExtensionConnection,
} from './integration-workspace'

describe('integration workspace', () => {
  beforeEach(() => localStorage.clear())

  it('normaliza destino, limites e etiquetas sem aceitar valores arbitrários', () => {
    const config = normalizeExtensionConfig({
      destination: 'crm', duplicatePolicy: 'delete', priority: 'impossible', temperature: 'hot',
      nextActionDelayHours: 9999, tags: [' Extensão ', 'Extensão', '', 42], defaultStageId: ' stage-1 ', prepareEmail: true,
    })
    expect(config.destination).toBe('crm')
    expect(config.duplicatePolicy).toBe('skip')
    expect(config.priority).toBe('medium')
    expect(config.temperature).toBe('hot')
    expect(config.nextActionDelayHours).toBe(720)
    expect(config.tags).toEqual(['Extensão'])
    expect(config.defaultStageId).toBe('stage-1')
    expect(config.prepareWhatsApp).toBe(true)
    expect(config.prepareEmail).toBe(true)
  })

  it('persiste configuração e histórico da caixa local por workspace', async () => {
    const workspaceId = crypto.randomUUID()
    const config = { ...defaultExtensionConfig('stage-1'), destination: 'crm' as const, tags: ['Extensão RealTalent', 'Entrada'] }
    await saveExtensionConnection(workspaceId, config)
    recordLocalIntegrationEvent(workspaceId, 3)
    const state = await loadIntegrationWorkspace(workspaceId)
    expect(findExtensionConfig(state, defaultExtensionConfig()).defaultStageId).toBe('stage-1')
    expect(state.connections[0]).toMatchObject({ provider: 'extension', status: 'connected', receivedCount: 3 })
    expect(state.events[0]).toMatchObject({ provider: 'extension', itemCount: 3, status: 'processed' })
  })
})
