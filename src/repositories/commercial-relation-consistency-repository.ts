import type { CrmRepository, NewCalendarEventInput } from './crm-repository'

const withLinkedLead = async (repository: CrmRepository, input: NewCalendarEventInput): Promise<NewCalendarEventInput> => {
  if (input.leadId || !input.contactId) return input

  const contacts = await repository.listContacts(input.workspaceId)
  const contact = contacts.find((item) => item.id === input.contactId)
  if (!contact) return input

  const leadIds = contact.leadIds ?? []
  if (leadIds.length) return { ...input, leadId: leadIds[0] }

  const leads = await repository.listLeads(input.workspaceId)
  const linkedLead = leads.find((lead) => lead.primaryContactId === contact.id)
  return linkedLead ? { ...input, leadId: linkedLead.id } : input
}

/**
 * Keeps cross-module commercial relations consistent at the repository boundary.
 * A calendar event created from a Contact must also carry its linked Lead whenever
 * that relationship is known, otherwise Agenda can see it while Meu Dia/timeline
 * cannot. The wrapper is intentionally persistence-neutral and works in local and
 * Supabase modes.
 */
export const withCommercialRelationConsistency = (repository: CrmRepository): CrmRepository => new Proxy(repository, {
  get(target, property, receiver) {
    if (property === 'createCalendarEvent') {
      return async (input: NewCalendarEventInput) => target.createCalendarEvent(await withLinkedLead(target, input))
    }
    const value = Reflect.get(target, property, receiver)
    return typeof value === 'function' ? value.bind(target) : value
  },
})

export const resolveCalendarCommercialRelation = withLinkedLead
