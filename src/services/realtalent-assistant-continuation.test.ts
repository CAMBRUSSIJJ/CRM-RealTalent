import { describe, expect, it } from 'vitest'
import type { AssistantAnswer } from './realtalent-assistant'
import { resolveAssistantRecommendationContinuation } from './realtalent-assistant-continuation'
import { realTalentAiGateway } from './realtalent-ai-gateway'
import { DEFAULT_STAGES, DEMO_ACTIVITIES, DEMO_AUTOMATION_RULES, DEMO_AUTOMATION_RUNS, DEMO_CALLS, DEMO_COMPANIES, DEMO_CONTACT_RELATIONSHIPS, DEMO_CONTACTS, DEMO_EVENTS, DEMO_GOALS, DEMO_LEADS, DEMO_OPPORTUNITIES, DEMO_PLAYBOOKS, DEMO_PRODUCTS, DEMO_PROPOSALS, DEMO_REVENUE_ENTRIES, DEMO_SOCIAL_PROFILES, DEMO_WORKSPACE } from '../domain/defaults'
import type { WorkspaceSnapshot } from '../domain/types'

const answer = (suggestion: AssistantAnswer['executionSuggestion']): AssistantAnswer => ({
  id: 'test', intent: 'prepare_call', title: 'Live Sales Coach', text: 'Próximo movimento.', items: [], facts: [], suggestedPrompts: [], executionSuggestion: suggestion, generatedAt: '2026-10-16T12:00:00.000Z',
})

const snapshot: WorkspaceSnapshot = { workspace: DEMO_WORKSPACE, stages: DEFAULT_STAGES, leads: DEMO_LEADS, activities: DEMO_ACTIVITIES, calls: DEMO_CALLS, events: DEMO_EVENTS, playbooks: DEMO_PLAYBOOKS, goals: DEMO_GOALS, automationRules: DEMO_AUTOMATION_RULES, automationRuns: DEMO_AUTOMATION_RUNS, companies: DEMO_COMPANIES, contacts: DEMO_CONTACTS, contactRelationships: DEMO_CONTACT_RELATIONSHIPS, opportunities: DEMO_OPPORTUNITIES, socialProfiles: DEMO_SOCIAL_PROFILES, products: DEMO_PRODUCTS, proposals: DEMO_PROPOSALS, revenueEntries: DEMO_REVENUE_ENTRIES }
const lead = DEMO_LEADS[0]

describe('Assistant recommendation continuation', () => {
  it.each(['faça isso', 'faz isso', 'execute isso', 'pode fazer', 'sim, faça isso'])('transforma confirmação curta em pedido operacional explícito: %s', (reply) => {
    const prompt = resolveAssistantRecommendationContinuation(reply, answer({ capabilityId: 'proposals.create', label: 'Criar proposta', seed: 'Crie uma proposta para Acme.' }))
    expect(prompt).toContain('Crie uma proposta para Acme.')
    expect(prompt).toContain('proposals.create')
  })

  it('não captura uma nova pergunta do usuário', () => {
    expect(resolveAssistantRecommendationContinuation('qual pergunta faço agora?', answer({ capabilityId: 'proposals.create', label: 'Criar proposta', seed: 'Crie uma proposta para Acme.' }))).toBeNull()
  })

  it('não captura confirmação genérica quando não existe sugestão executável', () => {
    expect(resolveAssistantRecommendationContinuation('faça isso', answer(null))).toBeNull()
  })

  it('continua "faça isso" até a próxima informação obrigatória sem executar proposta incompleta', async () => {
    const previous = answer({ capabilityId: 'proposals.create', label: 'Validar critérios antes da proposta', seed: `Crie uma proposta para ${lead.company || lead.name}.` })
    const prompt = resolveAssistantRecommendationContinuation('faça isso', previous)
    expect(prompt).toBeTruthy()
    const result = await realTalentAiGateway.answer(prompt!, snapshot, { previousLeadIds: [lead.id], currentUserId: lead.ownerId, now: new Date('2026-10-16T13:00:00.000Z') })
    expect(result.answer.pendingCapability?.capabilityId).toBe('proposals.create')
    expect(result.answer.pendingCapability?.missingSlots).toContain('product')
    expect(result.answer.plan).toBeUndefined()
    expect(result.answer.text).toMatch(/produto|serviço/i)
  })

})
