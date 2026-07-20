import { describe, expect, it } from 'vitest'
import { DEFAULT_STAGES, DEMO_AUTOMATION_RULES } from '../domain/defaults'
import {
  AUTOMATION_RECIPES, DEFAULT_AUTOMATION_GUARD, automationRuleRisk, createAutomationRecipe, readAutomationGuard,
  validateAutomationRule, visibleAutomationConditions, withAutomationGuard,
} from './automation-workspace'

describe('automation workspace', () => {
  it('persiste e recupera as proteções dentro das condições JSON', () => {
    const conditions = withAutomationGuard([], { ...DEFAULT_AUTOMATION_GUARD, mode: 'live', cooldownHours: 24 })
    expect(readAutomationGuard(conditions).mode).toBe('live')
    expect(readAutomationGuard(conditions).cooldownHours).toBe(24)
    expect(visibleAutomationConditions(conditions)).toHaveLength(0)
  })

  it('mantém regras antigas sem configuração em simulação segura', () => {
    const guard = readAutomationGuard(DEMO_AUTOMATION_RULES[0].conditions)
    expect(guard.mode).toBe('simulation')
    expect(guard.preventDuplicates).toBe(true)
  })

  it('cria receitas pausadas e em modo de simulação', () => {
    const recipe = createAutomationRecipe(AUTOMATION_RECIPES[0].id)
    expect(recipe.enabled).toBe(false)
    expect(readAutomationGuard(recipe.conditions).mode).toBe('simulation')
    expect(recipe.actions.length).toBeGreaterThan(0)
  })

  it('oferece cadência inicial e recuperação de negócio sem próxima ação', () => {
    const cadence = createAutomationRecipe('new-lead-cadence')
    const missingAction = createAutomationRecipe('missing-next-action')
    expect(cadence.actions.some((action) => action.type === 'start_cadence')).toBe(true)
    expect(visibleAutomationConditions(missingAction.conditions)).toContainEqual(expect.objectContaining({ field: 'has_next_action', value: 'false' }))
  })

  it('oferece uma receita segura para leads recebidos da extensão', () => {
    const recipe = createAutomationRecipe('extension-lead-intake')
    expect(recipe.triggerType).toBe('lead_imported')
    expect(recipe.enabled).toBe(false)
    expect(visibleAutomationConditions(recipe.conditions)).toContainEqual(expect.objectContaining({ field: 'source', operator: 'contains' }))
    expect(readAutomationGuard(recipe.conditions).mode).toBe('simulation')
  })

  it('bloqueia etapas removidas e excesso de ações', () => {
    const recipe = createAutomationRecipe('new-lead-first-action')
    const invalid = {
      ...recipe,
      name: 'Inválida',
      actions: [...recipe.actions, { id: 'move', type: 'move_stage' as const, value: 'missing-stage' }],
      conditions: withAutomationGuard(visibleAutomationConditions(recipe.conditions), { ...DEFAULT_AUTOMATION_GUARD, maxActionsPerRun: 1 }),
    }
    const validation = validateAutomationRule(invalid, DEFAULT_STAGES)
    expect(validation.errors.length).toBeGreaterThanOrEqual(2)
  })

  it('classifica risco maior para mudanças de etapa sem condição', () => {
    const recipe = createAutomationRecipe('new-lead-first-action')
    const risky = { ...recipe, triggerType: 'stage_changed' as const, actions: [{ id: 'move', type: 'move_stage' as const, value: DEFAULT_STAGES[1].id }], conditions: withAutomationGuard([], { ...DEFAULT_AUTOMATION_GUARD, mode: 'live', cooldownHours: 0 }) }
    expect(automationRuleRisk(risky)).toBe('high')
  })
})
