import { describe, expect, it } from 'vitest'
import { validateAgentCapabilityEnvelope } from './realtalent-crm-capability-runtime-client'
const step = (id: string, capabilityId = 'goals.create') => ({
  id, capabilityId, title: 'Criar meta', reason: 'pedido explícito', risk: 'read',
  args: [{ name: 'metric', value: 'calls' }, { name: 'target_value', value: '20' }],
})
const raw = (steps: unknown[], confidence = 0.95, needsClarification = false) => ({
  steps, version: '4.0', goal: 'Executar instruções', confidence, needsClarification,
  pendingCapabilityId: '', missingSlots: [], knownArgs: [], clarification: '',
})
describe('Agent V4 – multi-step plan integrity', () => {
  it('permite duas operações nativas conhecidas e toma risco do catálogo, não do modelo', () => {
    const result = validateAgentCapabilityEnvelope(raw([step('goal'), step('second', 'sales.prioritize_pipeline')]), 'execute')
    expect(result?.plan.steps).toHaveLength(2)
    expect(result?.plan.steps[0].risk).not.toBe('read')
    expect(result?.plan.steps[1].risk).toBe('read')
  })
  it('rejeita plano parcialmente inválido sem executar passos restantes', () => {
    expect(validateAgentCapabilityEnvelope(raw([step('valid'), step('unknown', 'fake.delete_everything')]), 'execute')).toBeNull()
    expect(validateAgentCapabilityEnvelope(raw([]), 'execute')).toBeNull()
    expect(validateAgentCapabilityEnvelope(raw(Array.from({length:9},(_,i)=>step(String(i)))), 'execute')).toBeNull()
  })
  it('rejeita passos duplicados, intenção inválida e mutações sem confiança suficiente', () => {
    expect(validateAgentCapabilityEnvelope(raw([step('same'), step('same')]), 'execute')).toBeNull()
    expect(validateAgentCapabilityEnvelope(raw([step('one')]), 'invalid')).toBeNull()
    expect(validateAgentCapabilityEnvelope(raw([step('one')],0.22), 'execute')).toBeNull()
  })
  it('não apresenta conclusão parcial quando foram solicitadas duas ações explícitas', () => {
    const prompt = 'crie uma tarefa e agende um retorno amanhã'
    expect(validateAgentCapabilityEnvelope(raw([step('one')]), 'execute', prompt)).toBeNull()
    const accepted = validateAgentCapabilityEnvelope(raw([step('one'), step('two','calendar.create')]), 'execute', prompt)
    expect(accepted?.plan.steps).toHaveLength(2)
  })
  it('não aceita executar plano ainda marcado como pendente', () => {
    expect(validateAgentCapabilityEnvelope(raw([step('one')],0.98,true), 'execute')).toBeNull()
  })
})
