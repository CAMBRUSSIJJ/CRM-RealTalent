import type { ContactRecord, ContactRelationship, Lead, OpportunityRecord } from '../domain/types'

/**
 * V101.5.1: relation resolvers never use null === null as a business relationship.
 * Explicit lead links are always accepted; account links are accepted only when the lead has a real companyId.
 */
export const contactsForLead = (lead: Lead, contacts: ContactRecord[]): ContactRecord[] => {
  const related = contacts.filter((contact) =>
    contact.leadIds.includes(lead.id) || Boolean(lead.companyId && contact.companyId === lead.companyId),
  )
  return Array.from(new Map(related.map((contact) => [contact.id, contact])).values())
}

export const relationshipsForLead = (lead: Lead, relationships: ContactRelationship[]): ContactRelationship[] =>
  lead.companyId ? relationships.filter((relationship) => relationship.companyId === lead.companyId) : []

export const opportunitiesForLead = (lead: Lead, opportunities: OpportunityRecord[]): OpportunityRecord[] =>
  opportunities.filter((opportunity) => opportunity.leadId === lead.id || Boolean(lead.companyId && opportunity.companyId === lead.companyId))
