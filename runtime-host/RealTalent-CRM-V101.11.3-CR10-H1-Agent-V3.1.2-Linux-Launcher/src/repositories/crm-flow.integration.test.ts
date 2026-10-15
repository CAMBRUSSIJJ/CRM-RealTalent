import { beforeEach, describe, expect, it } from 'vitest'
import { DEMO_WORKSPACE } from '../domain/defaults'
import { LocalCrmRepository } from './local-crm-repository'

describe('fluxo comercial consolidado V100.21', () => {
  beforeEach(() => localStorage.clear())

  it('mantém Lead, Pipeline, Follow-up, Ligação e Agenda sincronizados', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    const lead = await repository.createLead({
      workspaceId: DEMO_WORKSPACE.id, name: 'Fluxo Integrado', company: 'Empresa Fluxo', phone: '51988887777', email: 'fluxo@empresa.com',
      city: 'Canoas', source: 'Teste integrado', stageId: 'stage-new', status: 'active', temperature: 'hot', priority: 'high',
      ownerId: null, ownerName: 'Equipe', value: 6500, nextActionAt: null, notes: '', tags: ['integração'],
    })
    const followup = await repository.createActivity({
      workspaceId: DEMO_WORKSPACE.id, leadId: lead.id, type: 'followup', title: 'Retorno integrado', description: '',
      dueAt: '2026-08-03T13:00:00.000Z', completedAt: null, assignedTo: null, sourceType: 'manual', sourceId: null,
    })
    await repository.moveLead(lead.id, 'stage-proposal')
    const call = await repository.createCall({
      workspaceId: DEMO_WORKSPACE.id, leadId: lead.id, userId: null, outcome: 'proposal_requested', durationSeconds: 120,
      notes: 'Solicitou proposta', transcript: '', recordingPath: null, startedAt: '2026-08-01T14:00:00.000Z', endedAt: '2026-08-01T14:02:00.000Z',
    })
    const event = await repository.createCalendarEvent({
      workspaceId: DEMO_WORKSPACE.id, leadId: lead.id, title: 'Reunião de proposta', description: '', startsAt: '2026-08-02T15:00:00.000Z',
      endsAt: '2026-08-02T15:30:00.000Z', allDay: false, location: 'Meet', status: 'confirmed', assignedTo: null,
    })

    const snapshot = await repository.getSnapshot(DEMO_WORKSPACE.id)
    const integrated = snapshot.leads.find((item) => item.id === lead.id)
    expect(integrated?.stageId).toBe('stage-proposal')
    expect(integrated?.nextActionAt).toBe(event.startsAt)
    expect(snapshot.activities.some((item) => item.id === followup.id)).toBe(true)
    expect(snapshot.activities.some((item) => item.sourceType === 'call' && item.sourceId === call.id)).toBe(true)
    expect(snapshot.activities.some((item) => item.sourceType === 'calendar' && item.sourceId === event.id)).toBe(true)
  })

  it('remove dependências do lead sem deixar ligações ou atividades órfãs', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    const lead = await repository.createLead({
      workspaceId: DEMO_WORKSPACE.id, name: 'Lead removível', company: '', phone: '', email: '', city: '', source: 'Teste', stageId: 'stage-new',
      status: 'active', temperature: 'warm', priority: 'medium', ownerId: null, ownerName: 'Equipe', value: 0, nextActionAt: null, notes: '', tags: [],
    })
    await repository.createActivity({ workspaceId: DEMO_WORKSPACE.id, leadId: lead.id, type: 'followup', title: 'Retorno', description: '', dueAt: '2026-08-04T13:00:00.000Z', completedAt: null, assignedTo: null, sourceType: 'manual', sourceId: null })
    await repository.createCall({ workspaceId: DEMO_WORKSPACE.id, leadId: lead.id, userId: null, outcome: 'no_answer', durationSeconds: 0, notes: '', transcript: '', recordingPath: null, startedAt: '2026-08-01T14:00:00.000Z', endedAt: '2026-08-01T14:00:00.000Z' })
    const event = await repository.createCalendarEvent({ workspaceId: DEMO_WORKSPACE.id, leadId: lead.id, title: 'Reunião', description: '', startsAt: '2026-08-05T15:00:00.000Z', endsAt: '2026-08-05T15:30:00.000Z', allDay: false, location: '', status: 'confirmed', assignedTo: null })

    await repository.deleteLead(lead.id)
    const snapshot = await repository.getSnapshot(DEMO_WORKSPACE.id)
    expect(snapshot.leads.some((item) => item.id === lead.id)).toBe(false)
    expect(snapshot.calls.some((item) => item.leadId === lead.id)).toBe(false)
    expect(snapshot.activities.some((item) => item.leadId === lead.id)).toBe(false)
    expect(snapshot.events.find((item) => item.id === event.id)?.leadId).toBeNull()
  })
})
