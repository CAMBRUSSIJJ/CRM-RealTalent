import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STAGES, DEMO_ACTIVITIES, DEMO_AUTOMATION_RULES, DEMO_AUTOMATION_RUNS, DEMO_CALLS, DEMO_COMPANIES, DEMO_CONTACTS,
  DEMO_EVENTS, DEMO_GOALS, DEMO_LEADS, DEMO_OPPORTUNITIES, DEMO_PLAYBOOKS, DEMO_SOCIAL_PROFILES, DEMO_WORKSPACE,
} from '../domain/defaults'
import type { Lead, WorkspaceSnapshot } from '../domain/types'
import { buildDataQualityIssues, dataQualitySummary, deriveCommercialStructure } from './commercial-structure'

const snapshot = (): WorkspaceSnapshot => ({
  workspace: DEMO_WORKSPACE, stages: DEFAULT_STAGES, leads: DEMO_LEADS, activities: DEMO_ACTIVITIES, calls: DEMO_CALLS, events: DEMO_EVENTS,
  playbooks: DEMO_PLAYBOOKS, goals: DEMO_GOALS, automationRules: DEMO_AUTOMATION_RULES, automationRuns: DEMO_AUTOMATION_RUNS,
  companies: DEMO_COMPANIES, contacts: DEMO_CONTACTS, opportunities: DEMO_OPPORTUNITIES, socialProfiles: DEMO_SOCIAL_PROFILES,
})

describe('estrutura comercial e qualidade de dados', () => {
  it('separa empresa, pessoa, oportunidade e perfis sem duplicar vínculos', () => {
    const data = snapshot()
    const result = deriveCommercialStructure(data.leads, data)
    expect(result.companies).toHaveLength(4)
    expect(result.contacts).toHaveLength(4)
    expect(result.opportunities).toHaveLength(4)
    expect(result.leadLinks).toHaveLength(4)
    expect(result.socialProfiles.length).toBeGreaterThanOrEqual(4)
  })

  it('detecta duplicidade multicanal por CNPJ ou perfil social', () => {
    const data = snapshot()
    const duplicate: Lead = { ...data.leads[0], id: 'lead-alpha-copy', phone: '', email: '', companyId: null, primaryContactId: null, opportunityId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    const next = { ...data, leads: [...data.leads, duplicate] }
    const issues = buildDataQualityIssues(next)
    expect(issues.some((item) => item.category === 'duplicate' && item.leadIds.includes(duplicate.id))).toBe(true)
  })

  it('prioriza bloqueio de contato como pendência crítica', () => {
    const data = snapshot()
    const blocked = { ...data.leads[1], doNotContact: true, doNotContactReason: 'Solicitação do contato', consentStatus: 'opted_out' as const }
    const next = { ...data, leads: data.leads.map((lead) => lead.id === blocked.id ? blocked : lead) }
    const summary = dataQualitySummary(next)
    expect(summary.critical).toBeGreaterThan(0)
    expect(summary.issues.some((item) => item.title === 'Contato bloqueado')).toBe(true)
  })
  it('mantém pessoas diferentes da mesma empresa sem sugerir fusão de leads', () => {
    const data = snapshot()
    const base = data.leads[0]
    const secondContact: Lead = { ...base, id: 'lead-alpha-second-contact', name: 'Outra Pessoa', phone: '51988887777', email: 'outra@alpha.com.br', companyId: null, primaryContactId: null, opportunityId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    const next = { ...data, leads: [base, secondContact] }
    const result = deriveCommercialStructure(next.leads, { companies: [], contacts: [], opportunities: [], socialProfiles: [] })
    const issues = buildDataQualityIssues({ ...next, companies: result.companies, contacts: result.contacts, opportunities: result.opportunities, socialProfiles: result.socialProfiles, leads: next.leads.map((lead) => { const link = result.leadLinks.find((item) => item.leadId === lead.id)!; return { ...lead, companyId: link.companyId, primaryContactId: link.contactId, opportunityId: link.opportunityId } }) })
    expect(result.companies).toHaveLength(1)
    expect(result.contacts).toHaveLength(2)
    expect(issues.some((item) => item.category === 'duplicate')).toBe(false)
  })

})
