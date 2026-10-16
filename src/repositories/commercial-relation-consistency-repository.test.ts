import { describe, expect, it, vi } from 'vitest'
import type { CrmRepository, NewCalendarEventInput } from './crm-repository'
import { resolveCalendarCommercialRelation, withCommercialRelationConsistency } from './commercial-relation-consistency-repository'

const event = (patch: Partial<NewCalendarEventInput> = {}): NewCalendarEventInput => ({
  workspaceId: 'workspace-1', leadId: null, contactId: 'contact-1', title: 'Reunião com Camila', description: '',
  startsAt: '2026-10-16T17:00:00.000Z', endsAt: '2026-10-16T17:30:00.000Z', allDay: false,
  location: '', status: 'confirmed', assignedTo: 'user-1',
  ...patch,
})

const repository = (patch: Partial<CrmRepository> = {}) => ({
  mode: 'local',
  listContacts: vi.fn(async () => [{ id: 'contact-1', leadIds: ['lead-1'] }]),
  listLeads: vi.fn(async () => []),
  createCalendarEvent: vi.fn(async (input: NewCalendarEventInput) => ({ id: 'event-1', createdAt: '', updatedAt: '', ...input })),
  ...patch,
} as unknown as CrmRepository)

describe('calendar commercial relation consistency', () => {
  it('derives leadId from ContactRecord.leadIds', async () => {
    const linked = await resolveCalendarCommercialRelation(repository(), event())
    expect(linked.leadId).toBe('lead-1')
  })

  it('falls back to the primary-contact relation when contact.leadIds is empty', async () => {
    const repo = repository({
      listContacts: vi.fn(async () => [{ id: 'contact-1', leadIds: [] }] as any),
      listLeads: vi.fn(async () => [{ id: 'lead-2', primaryContactId: 'contact-1' }] as any),
    })
    expect((await resolveCalendarCommercialRelation(repo, event())).leadId).toBe('lead-2')
  })

  it('preserves an explicit lead selected by the caller', async () => {
    const repo = repository()
    const linked = await resolveCalendarCommercialRelation(repo, event({ leadId: 'lead-explicit' }))
    expect(linked.leadId).toBe('lead-explicit')
    expect(repo.listContacts).not.toHaveBeenCalled()
  })

  it('applies the relation repair before persistence', async () => {
    const repo = repository()
    const wrapped = withCommercialRelationConsistency(repo)
    await wrapped.createCalendarEvent(event())
    expect(repo.createCalendarEvent).toHaveBeenCalledWith(expect.objectContaining({ contactId: 'contact-1', leadId: 'lead-1' }))
  })
})
