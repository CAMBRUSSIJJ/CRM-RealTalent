import { beforeEach, describe, expect, it } from 'vitest'
import { DEMO_WORKSPACE } from '../domain/defaults'
import { LocalCrmRepository } from '../repositories/local-crm-repository'
import { buildUnifiedTimeline, loadCommunicationEvents, sendOfficialCommunication } from './communications'

describe('comunicações oficiais V100.42', () => {
  beforeEach(() => localStorage.clear())
  it('registra envio local idempotente na timeline do lead', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    const snapshot = await repository.getSnapshot(DEMO_WORKSPACE.id)
    const lead = snapshot.leads[0]
    const event = await sendOfficialCommunication({ workspaceId: DEMO_WORKSPACE.id, leadId: lead.id, accountId: null, channel: 'email', recipient: lead.email || 'teste@empresa.com', subject: 'Apresentação', body: 'Mensagem comercial', idempotencyKey: 'test-email-1' })
    expect(event.status).toBe('queued')
    const events = await loadCommunicationEvents(DEMO_WORKSPACE.id, lead.id)
    expect(events).toHaveLength(1)
    const timeline = buildUnifiedTimeline(snapshot, events, lead.id)
    expect(timeline.some((item) => item.channel === 'email' && item.description === 'Mensagem comercial')).toBe(true)
  })

  it('combina atividades, ligações, agenda e mensagens em ordem cronológica', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    const snapshot = await repository.getSnapshot(DEMO_WORKSPACE.id)
    const lead = snapshot.leads[0]
    const timeline = buildUnifiedTimeline(snapshot, [], lead.id)
    expect(timeline.length).toBeGreaterThan(0)
    for (let index = 1; index < timeline.length; index += 1) expect(new Date(timeline[index - 1].date).getTime()).toBeGreaterThanOrEqual(new Date(timeline[index].date).getTime())
  })
})
