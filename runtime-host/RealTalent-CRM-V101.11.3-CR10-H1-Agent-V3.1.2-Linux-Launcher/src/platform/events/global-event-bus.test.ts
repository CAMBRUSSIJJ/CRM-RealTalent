import { describe, expect, it, vi } from 'vitest'
import { createDomainEvent } from './domain-event'
import { GlobalDomainEventBus } from './event-bus'
import { createEventRefreshCoordinator } from './event-refresh-coordinator'

describe('V101.9.4 Global Event Bus', () => {
  it('deduplica o mesmo evento por workspace + id e atualiza projeções uma única vez', async () => {
    const bus = new GlobalDomainEventBus()
    const handler = vi.fn()
    bus.subscribe('*', handler)
    const event = createDomainEvent({ id: 'evt-fixed', name: 'pipeline.opportunity.moved', workspaceId: 'ws-1', source: 'ui', payload: {} })

    await bus.publish(event, { broadcast: false })
    await bus.publish(event, { broadcast: false })

    const inspection = bus.inspect()
    expect(handler).toHaveBeenCalledTimes(1)
    expect(inspection.published).toBe(1)
    expect(inspection.deduplicated).toBe(1)
    expect(inspection.projectionRevisions.pipeline).toBe(1)
    expect(inspection.projectionRevisions.notifications).toBe(1)
    expect(inspection.projectionRevisions.metrics).toBe(1)
  })

  it('consolida os slices afetados antes de executar o refresh', async () => {
    const refreshSlices = vi.fn(async () => undefined)
    const coordinator = createEventRefreshCoordinator({ workspaceId: 'ws-1', refreshSlices })

    await coordinator.onEvent(createDomainEvent({ id: 'call-1', name: 'call.recorded', workspaceId: 'ws-1', source: 'repository', payload: {} }))

    expect(refreshSlices).toHaveBeenCalledTimes(1)
    expect(refreshSlices.mock.calls[0][0]).toEqual(expect.arrayContaining(['calls', 'activities', 'events', 'commercial', 'automationRuns']))
    expect(refreshSlices.mock.calls[0][1]).toBe('ws-1')
    coordinator.dispose()
  })

  it('ignora evento de outro workspace no coordenador', async () => {
    const refreshSlices = vi.fn(async () => undefined)
    const coordinator = createEventRefreshCoordinator({ workspaceId: 'ws-1', refreshSlices })

    await coordinator.onEvent(createDomainEvent({ id: 'foreign', name: 'commercial.record.updated', workspaceId: 'ws-2', source: 'repository', payload: {} }))

    expect(refreshSlices).not.toHaveBeenCalled()
    coordinator.dispose()
  })
})
