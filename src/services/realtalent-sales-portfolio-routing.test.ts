import { describe, expect, it } from 'vitest'
import { localCapabilityFallback } from './realtalent-crm-capability-planner'

const capabilityFor = (prompt: string) => localCapabilityFallback(prompt, {})?.plan.steps[0]?.capabilityId ?? null

describe('RealTalent Agent — portfolio natural language routing', () => {
  it.each([
    ['quem eu devo ligar hoje?', 'sales.call_priorities'],
    ['quais oportunidades devo priorizar agora?', 'sales.prioritize_pipeline'],
    ['quais negócios estão esfriando?', 'sales.cooling_deals'],
    ['mostre oportunidades perdendo momentum', 'sales.cooling_deals'],
    ['quais negócios estão sem decisor?', 'sales.missing_decision_maker'],
    ['mostre negócios em risco no pipeline', 'sales.at_risk_deals'],
    ['quais oportunidades estão críticas?', 'sales.at_risk_deals'],
    ['quais negócios provavelmente não fecham este mês?', 'sales.closing_risk_this_month'],
  ])('entende %s', (prompt, expected) => {
    expect(capabilityFor(prompt)).toBe(expected)
  })

  it('não transforma pergunta sem intenção de carteira em ranking comercial', () => {
    expect(capabilityFor('qual é o telefone do Carlos?')).not.toBe('sales.prioritize_pipeline')
  })
})
