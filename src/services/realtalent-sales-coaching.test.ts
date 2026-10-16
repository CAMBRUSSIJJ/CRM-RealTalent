import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STAGES,
  DEMO_ACTIVITIES,
  DEMO_AUTOMATION_RULES,
  DEMO_AUTOMATION_RUNS,
  DEMO_CALLS,
  DEMO_COMPANIES,
  DEMO_CONTACT_RELATIONSHIPS,
  DEMO_CONTACTS,
  DEMO_EVENTS,
  DEMO_GOALS,
  DEMO_LEADS,
  DEMO_OPPORTUNITIES,
  DEMO_PLAYBOOKS,
  DEMO_PRODUCTS,
  DEMO_PROPOSALS,
  DEMO_REVENUE_ENTRIES,
  DEMO_SOCIAL_PROFILES,
  DEMO_WORKSPACE,
} from '../domain/defaults'
import type { WorkspaceSnapshot } from '../domain/types'
import { REALTALENT_UNIVERSAL_CAPABILITIES } from './realtalent-crm-universal-registry'
import { realTalentAiGateway } from './realtalent-ai-gateway'
import { buildSalesCoachingPlan, formatSalesCoachingPlan } from './realtalent-sales-coaching'

const baseSnapshot: WorkspaceSnapshot = {
  workspace: DEMO_WORKSPACE,
  stages: DEFAULT_STAGES,
  leads: DEMO_LEADS,
  activities: DEMO_ACTIVITIES,
  calls: DEMO_CALLS,
  events: DEMO_EVENTS,
  playbooks: DEMO_PLAYBOOKS,
  goals: DEMO_GOALS,
  automationRules: DEMO_AUTOMATION_RULES,
  automationRuns: DEMO_AUTOMATION_RUNS,
  companies: DEMO_COMPANIES,
  contacts: DEMO_CONTACTS,
  contactRelationships: DEMO_CONTACT_RELATIONSHIPS,
  opportunities: DEMO_OPPORTUNITIES,
  socialProfiles: DEMO_SOCIAL_PROFILES,
  products: DEMO_PRODUCTS,
  proposals: DEMO_PROPOSALS,
  revenueEntries: DEMO_REVENUE_ENTRIES,
}

const now = new Date('2026-10-16T12:00:00.000Z')

describe('RealTalent Agent — Sales Coaching V1', () => {
  it('monta um plano grounded com objetivo, agenda, perguntas e critérios de sucesso', () => {
    const lead = DEMO_LEADS[0]
    const plan = buildSalesCoachingPlan(lead, baseSnapshot, 'ligação', now)

    expect(plan.leadId).toBe(lead.id)
    expect(plan.conversationType).toBe('call')
    expect(plan.objective.length).toBeGreaterThan(0)
    expect(plan.agenda.length).toBeGreaterThanOrEqual(3)
    expect(plan.questions.length).toBeGreaterThanOrEqual(3)
    expect(plan.successCriteria.length).toBeGreaterThanOrEqual(1)
    expect(plan.grounding).toContain('não devem ser inventadas')
    expect(plan.generatedAt).toBe(now.toISOString())
  })

  it('usa stakeholder, Playbook e conhecimento do produto quando estão realmente vinculados', () => {
    const lead = DEMO_LEADS[0]
    const contact = {
      ...DEMO_CONTACTS[0],
      id: 'contact-coaching-economic-buyer',
      companyId: lead.companyId ?? DEMO_CONTACTS[0].companyId,
      leadIds: [lead.id],
      name: 'Comprador Econômico Teste',
      decisionRole: 'economic_buyer' as const,
      relationshipStrength: 'strong' as const,
      stance: 'supportive' as const,
      influenceLevel: 95,
    }
    const playbook = {
      ...DEMO_PLAYBOOKS[0],
      id: 'playbook-coaching-grounded',
      title: 'Playbook Coaching Grounded',
      active: true,
      guidance: {
        ...(DEMO_PLAYBOOKS[0].guidance ?? {}),
        stageIds: [lead.stageId],
        executionModes: ['call' as const],
        decisionRoles: ['economic_buyer' as const],
        temperatures: [lead.temperature],
        coachingFocus: 'Validar impacto financeiro e processo de decisão.',
        discoveryQuestions: ['Qual impacto financeiro é prioritário para a decisão?'],
        objectionPrompts: ['O investimento precisa ser justificado internamente.'],
        successCriteria: ['Confirmar critério econômico de decisão.'],
        avoidPhrases: ['Isso é barato.'],
      },
    }
    const sourceProduct = DEMO_PRODUCTS[0]
    const sourceProposal = DEMO_PROPOSALS[0]
    const sourceItem = sourceProposal.items[0]
    expect(sourceItem).toBeTruthy()
    const product = {
      ...sourceProduct,
      id: 'product-coaching-grounded',
      discoveryQuestions: ['Qual evidência de retorno seria suficiente?'],
      objectionNotes: ['O cliente pode pedir comprovação de retorno.'],
      salesProofs: ['Case cadastrado de redução de tempo operacional.'],
    }
    const proposal = {
      ...sourceProposal,
      id: 'proposal-coaching-grounded',
      leadId: lead.id,
      opportunityId: lead.opportunityId ?? sourceProposal.opportunityId,
      isCurrentVersion: true,
      items: [{ ...sourceItem!, productId: product.id }],
    }
    const snapshot: WorkspaceSnapshot = {
      ...baseSnapshot,
      contacts: [...baseSnapshot.contacts, contact],
      playbooks: [...baseSnapshot.playbooks, playbook],
      products: [...baseSnapshot.products, product],
      proposals: [...baseSnapshot.proposals, proposal],
    }

    const plan = buildSalesCoachingPlan(lead, snapshot, 'ligação', now)
    expect(plan.stakeholders.some((item) => item.contactId === contact.id && item.decisionRole === 'economic_buyer')).toBe(true)
    expect(plan.matchedPlaybooks).toContain(playbook.title)
    expect(plan.questions).toContain('Qual impacto financeiro é prioritário para a decisão?')
    expect(plan.questions).toContain('Qual evidência de retorno seria suficiente?')
    expect(plan.proofPoints).toContain('Case cadastrado de redução de tempo operacional.')
    expect(plan.objections.some((item) => item.label.includes('comprovação de retorno'))).toBe(true)
    expect(plan.avoidPhrases).toContain('Isso é barato.')
  })

  it('não fabrica objeção específica quando o CRM não oferece evidência', () => {
    const lead = { ...DEMO_LEADS[0], id: 'lead-coaching-clean', primaryContactId: null, companyId: null, opportunityId: null }
    const snapshot: WorkspaceSnapshot = {
      ...baseSnapshot,
      leads: [lead],
      contacts: [],
      activities: [],
      calls: [],
      playbooks: [],
      proposals: [],
      products: [],
      opportunities: [],
    }

    const plan = buildSalesCoachingPlan(lead, snapshot, 'reunião', now)
    const text = formatSalesCoachingPlan(lead, snapshot, 'reunião', now)
    expect(plan.objections.every((item) => item.source === 'risk')).toBe(true)
    expect(plan.objections.some((item) => /preço|concorrente|desconto/i.test(item.label))).toBe(false)
    expect(text).toContain('não devem ser inventadas')
  })

  it('publica a capacidade como leitura segura no catálogo universal', () => {
    const capability = REALTALENT_UNIVERSAL_CAPABILITIES.find((item) => item.id === 'sales.coach_conversation')
    expect(capability).toMatchObject({ action: 'read', risk: 'read', execution: 'native', permissionAction: 'view' })
    expect(capability?.argumentHints).toEqual(expect.arrayContaining(['record_query', 'conversation_type']))
  })

  it('intercepta linguagem natural de coaching sem enviar dados para provedor externo', async () => {
    const lead = DEMO_LEADS[0]
    const result = await realTalentAiGateway.answer(`me prepare para a ligação com ${lead.company || lead.name}`, baseSnapshot, { now, focusLeadId: lead.id })

    expect(result.trace.providerId).toBe('sales-coaching:grounded-v1')
    expect(result.trace.sendsDataExternally).toBe(false)
    expect(result.answer.intent).toBe('prepare_call')
    expect(result.answer.text).toContain('Perguntas prioritárias:')
    expect(result.answer.text).toContain('Base de verdade:')
  })
})
