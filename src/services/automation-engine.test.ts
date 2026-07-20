import { describe, expect, it } from 'vitest'
import { DEMO_LEADS } from '../domain/defaults'
import type { AutomationCondition } from '../domain/types'
import { automationEventKey, conditionMatches, ruleMatches, type AutomationEvent } from './automation-engine'
import { withAutomationGuard, DEFAULT_AUTOMATION_GUARD } from './automation-workspace'

const hotLead = DEMO_LEADS.find((lead) => lead.temperature === 'hot')!
const event: AutomationEvent = { triggerType: 'lead_created', entityId: hotLead.id, lead: hotLead, attemptCount: 3 }

describe('automation engine', () => {
  it('avalia operadores textuais e numéricos', () => {
    const equals: AutomationCondition = { id: '1', field: 'temperature', operator: 'equals', value: 'HOT' }
    const notEquals: AutomationCondition = { id: '2', field: 'city', operator: 'not_equals', value: 'Porto Alegre' }
    const contains: AutomationCondition = { id: '3', field: 'source', operator: 'contains', value: 'insta' }
    const greater: AutomationCondition = { id: '4', field: 'attempt_count', operator: 'greater_than', value: '2' }
    const tags: AutomationCondition = { id: '5', field: 'tag', operator: 'contains', value: hotLead.tags[0] ?? '' }
    expect(conditionMatches(equals, event)).toBe(true)
    expect(conditionMatches(notEquals, event)).toBe(true)
    expect(conditionMatches(contains, event)).toBe(true)
    expect(conditionMatches(greater, event)).toBe(true)
    expect(conditionMatches(tags, event)).toBe(true)
  })

  it('ignora a condição reservada de segurança', () => {
    const rule = {
      id: 'rule', workspaceId: hotLead.workspaceId, name: 'Teste', enabled: true, triggerType: 'lead_created' as const,
      conditions: withAutomationGuard([{ id: '1', field: 'temperature', operator: 'equals', value: 'hot' }], DEFAULT_AUTOMATION_GUARD),
      actions: [], createdBy: null, createdAt: '', updatedAt: '',
    }
    expect(ruleMatches(rule, event)).toBe(true)
  })

  it('gera uma chave idempotente estável', () => {
    expect(automationEventKey('rule-1', event)).toBe(`rule-1:lead_created:${hotLead.id}`)
    expect(automationEventKey('rule-1', event)).toBe(automationEventKey('rule-1', event))
  })
})
