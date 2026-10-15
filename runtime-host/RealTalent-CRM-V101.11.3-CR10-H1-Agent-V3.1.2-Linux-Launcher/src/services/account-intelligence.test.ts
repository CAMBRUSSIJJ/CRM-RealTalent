import { describe, expect, it } from 'vitest'
import { DEMO_CONTACT_RELATIONSHIPS, DEMO_CONTACTS, DEMO_LEADS } from '../domain/defaults'
import { buildAccountIntelligence, contactInteractionSummary, decisionRoleLabels } from './account-intelligence'

const snapshot = {
  workspace: { id: 'demo-workspace', name: 'Demo', slug: 'demo', role: 'owner' as const, createdAt: new Date().toISOString() },
  stages: [], leads: DEMO_LEADS, activities: [], calls: [], events: [], playbooks: [], goals: [], automationRules: [], automationRuns: [], companies: [], contacts: DEMO_CONTACTS, contactRelationships: DEMO_CONTACT_RELATIONSHIPS, opportunities: [], socialProfiles: [], products: [], proposals: [], revenueEntries: [],
}

describe('account intelligence', () => {
  it('recognizes expanded buying committee roles', () => {
    expect(decisionRoleLabels.economic_buyer).toBe('Decisor econômico')
    expect(decisionRoleLabels.champion).toBe('Champion')
  })

  it('scores an account with multiple mapped stakeholders better than an unmapped account', () => {
    const alpha = DEMO_LEADS.find((lead) => lead.id === 'lead-alpha')!
    const alphaContacts = DEMO_CONTACTS.filter((contact) => contact.companyId === alpha.companyId)
    const alphaRelations = DEMO_CONTACT_RELATIONSHIPS.filter((relation) => relation.companyId === alpha.companyId)
    const strong = buildAccountIntelligence(alpha, alphaContacts, alphaRelations, snapshot)
    const weak = buildAccountIntelligence(alpha, [alphaContacts[0]], [], snapshot)
    expect(strong.coverageScore).toBeGreaterThan(weak.coverageScore)
    expect(strong.totalContacts).toBe(3)
  })

  it('attributes interactions to the real stakeholder when contactId is present', () => {
    const mariana = DEMO_CONTACTS.find((contact) => contact.id === 'contact-alpha-mariana')!
    const carlos = DEMO_CONTACTS.find((contact) => contact.id === 'contact-alpha')!
    const directSnapshot = {
      ...snapshot,
      calls: [{ id: 'call-mariana', workspaceId: 'demo-workspace', leadId: 'lead-alpha', contactId: mariana.id, userId: 'local-user', outcome: 'answered' as const, durationSeconds: 120, notes: '', transcript: '', recordingPath: null, recordingUrl: null, consentAt: null, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), createdAt: new Date().toISOString() }],
    }
    expect(contactInteractionSummary(mariana, directSnapshot).calls).toBe(1)
    expect(contactInteractionSummary(carlos, directSnapshot).calls).toBe(0)
  })

})
