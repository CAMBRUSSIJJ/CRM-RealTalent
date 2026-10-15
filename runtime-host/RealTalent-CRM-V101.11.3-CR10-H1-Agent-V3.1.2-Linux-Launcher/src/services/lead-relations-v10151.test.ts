import { describe, expect, it } from 'vitest'
import type { ContactRecord, Lead, OpportunityRecord } from '../domain/types'
import { contactsForLead, opportunitiesForLead } from './lead-relations-v10151'

const lead = (overrides: Partial<Lead> = {}): Lead => ({
  id: 'lead-a', workspaceId: 'ws', name: 'Lead A', company: 'A', phone: '', email: '', city: '', postalCode: '', street: '', addressNumber: '', complement: '', district: '', state: '', country: 'Brasil', formattedAddress: '', latitude: null, longitude: null, geocodeStatus: 'incomplete', geocodePrecision: 'unknown', geocodeProvider: null, geocodePlaceId: null, geocodedAt: null, geocodeError: null, source: 'Manual', sourceDetail: '', sourceUrl: '', capturedAt: new Date(0).toISOString(), consentStatus: 'unknown', doNotContact: false, doNotContactReason: '', companyId: null, primaryContactId: null, opportunityId: null, cnpj: '', website: '', instagramUrl: '', linkedinUrl: '', facebookUrl: '', jobTitle: '', decisionRole: 'unknown', influenceLevel: 0, stageId: 'stage', status: 'active', temperature: 'cold', priority: 'medium', ownerId: null, ownerName: 'Equipe', value: 0, nextActionAt: null, lastContactAt: null, expectedCloseAt: null, notes: '', tags: [], createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), ...overrides,
})
const contact = (id: string, companyId: string | null, leadIds: string[] = []): ContactRecord => ({ id, workspaceId: 'ws', companyId, name: id, jobTitle: '', phone: '', email: '', decisionRole: 'unknown', influenceLevel: 0, relationshipStrength: 'unknown', relationshipScore: 0, stance: 'unknown', relationshipOwnerId: null, relationshipOwnerName: '', lastContactAt: null, nextActionAt: null, notes: '', isPrimary: false, consentStatus: 'unknown', doNotContact: false, doNotContactReason: '', leadIds, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() })

describe('lead relation resolver V101.5.1', () => {
  it('does not group unrelated orphan contacts through null company ids', () => {
    const result = contactsForLead(lead(), [contact('direct', null, ['lead-a']), contact('other-orphan', null, ['lead-b'])])
    expect(result.map((item) => item.id)).toEqual(['direct'])
  })

  it('combines explicit lead contacts and account contacts without duplicates', () => {
    const result = contactsForLead(lead({ companyId: 'company-a' }), [contact('direct', null, ['lead-a']), contact('account', 'company-a'), contact('both', 'company-a', ['lead-a']), contact('other', 'company-b')])
    expect(result.map((item) => item.id).sort()).toEqual(['account', 'both', 'direct'])
  })

  it('does not group unrelated opportunities through null company ids', () => {
    const opportunities = [
      { id: 'own', workspaceId: 'ws', companyId: null, primaryContactId: null, leadId: 'lead-a', title: 'Own', stageId: 'stage', status: 'active', value: 0, ownerId: null, expectedCloseAt: null, forecastCategory: 'pipeline', probability: 0, officialProposalId: null, closedWonAt: null, createdAt: '', updatedAt: '' },
      { id: 'other', workspaceId: 'ws', companyId: null, primaryContactId: null, leadId: 'lead-b', title: 'Other', stageId: 'stage', status: 'active', value: 0, ownerId: null, expectedCloseAt: null, forecastCategory: 'pipeline', probability: 0, officialProposalId: null, closedWonAt: null, createdAt: '', updatedAt: '' },
    ] as OpportunityRecord[]
    expect(opportunitiesForLead(lead(), opportunities).map((item) => item.id)).toEqual(['own'])
  })
})
