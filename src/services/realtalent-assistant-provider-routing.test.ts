import { beforeEach, describe, expect, it, vi } from 'vitest'

const { planMock, semanticMock } = vi.hoisted(() => ({
  planMock: vi.fn(),
  semanticMock: vi.fn(),
}))

vi.mock('./realtalent-crm-capability-runtime-client', () => ({
  planCrmCapabilitiesViaAgent: (...args: unknown[]) => planMock(...args),
}))

vi.mock('./realtalent-semantic-language-client', () => ({
  interpretSalesLanguage: (...args: unknown[]) => semanticMock(...args),
}))

import { hybridRealTalentAssistantProvider } from './realtalent-assistant-provider'

const snapshot = {
  workspace: { id: 'workspace-test', name: 'Teste' },
  leads: [], contacts: [], companies: [], opportunities: [], proposals: [], activities: [], events: [], goals: [], products: [], stages: [],
  playbooks: [], automationRules: [], revenueEntries: [], calls: [],
} as any

describe('RealTalent Assistant — firewall operacional', () => {
  beforeEach(() => {
    planMock.mockReset()
    semanticMock.mockReset()
    planMock.mockResolvedValue(null)
    semanticMock.mockResolvedValue({
      decision: 'execute',
      provider: 'ollama',
      model: 'qwen3:4b',
      interpretation: {
        intent: 'best_contacts',
        confidence: 0.99,
        needs_clarification: false,
        clarification: '',
        entities: {},
      },
    })
  })

  it('nunca transforma o pedido real de meta em melhores contatos quando o planner falha', async () => {
    const result = await hybridRealTalentAssistantProvider.answer(
      'faça meta de 40 ligações para amanhã',
      snapshot,
      { currentRoute: 'goals', now: new Date('2026-10-15T19:30:00-03:00') },
    )

    expect(result.answer.intent).toBe('crm_capability')
    expect(result.answer.plan?.kind).toBe('crm_capabilities')
    if (result.answer.plan?.kind !== 'crm_capabilities') throw new Error('Plano de capability esperado')
    expect(result.answer.plan.steps[0]?.capabilityId).toBe('goals.create')
    expect(result.answer.title.toLowerCase()).not.toContain('contatos')
    expect(semanticMock).not.toHaveBeenCalled()
  })

  it('falha fechado em outra ação operacional em vez de responder com análise não relacionada', async () => {
    const result = await hybridRealTalentAssistantProvider.answer(
      'marque uma reunião amanhã às 14h com cliente oculto',
      snapshot,
      { currentRoute: 'goals', now: new Date('2026-10-15T19:30:00-03:00') },
    )

    expect(result.answer.intent).toBe('crm_capability')
    expect(result.answer.title).toBe('Ação não executada')
    expect(result.answer.text).toContain('Não vou substituir seu pedido por outra ação ou análise')
    expect(semanticMock).not.toHaveBeenCalled()
  })
})
