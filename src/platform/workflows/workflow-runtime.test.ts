import { describe, expect, it } from 'vitest'
import type { AutomationAction, AutomationRule } from '../../domain/types'
import { describeWorkflowControl, workflowControlCondition, workflowRuntimeRequired, workflowWaitMilliseconds } from './workflow-runtime'

const rule = (actions: AutomationAction[]) => ({ actions }) as Pick<AutomationRule, 'actions'>

describe('V101.9.5 Workflow Runtime 3.0', () => {
  it('só exige runtime persistente para controles de fluxo', () => {
    expect(workflowRuntimeRequired(rule([{ id: '1', type: 'create_task', value: 'Follow-up' } as AutomationAction]))).toBe(false)
    expect(workflowRuntimeRequired(rule([{ id: '2', type: 'wait', delayMinutes: 5 } as AutomationAction]))).toBe(true)
    expect(workflowRuntimeRequired(rule([{ id: '3', type: 'branch_if', branchField: 'status', branchOperator: 'equals', branchValue: 'active' } as AutomationAction]))).toBe(true)
  })

  it('converte espera em duração determinística', () => {
    expect(workflowWaitMilliseconds({ id: 'wait', type: 'wait', delayDays: 1, delayHours: 2, delayMinutes: 3 } as AutomationAction)).toBe(((24 + 2) * 60 + 3) * 60_000)
  })

  it('transforma branch em condição compatível com o engine existente', () => {
    expect(workflowControlCondition({ id: 'branch', type: 'branch_if', branchField: 'temperature', branchOperator: 'equals', branchValue: 'hot', branchSkip: 2 } as AutomationAction)).toMatchObject({ field: 'temperature', operator: 'equals', value: 'hot' })
  })

  it('descreve controles de fluxo para inspector e UI', () => {
    expect(describeWorkflowControl({ id: 'wait', type: 'wait', delayHours: 2 } as AutomationAction)).toContain('2h')
    expect(describeWorkflowControl({ id: 'branch', type: 'branch_if', branchField: 'status', branchOperator: 'equals', branchValue: 'active', branchSkip: 3 } as AutomationAction)).toContain('pular 3 etapa')
  })
})
