import { describe, expect, it } from 'vitest'
import { OUTBOUND_CALL_STEPS, outboundStepById, renderOutboundText } from './outbound-call-playbook'

describe('outbound call playbook', () => {
  it('maintains a complete ordered flow', () => {
    expect(OUTBOUND_CALL_STEPS).toHaveLength(9)
    expect(OUTBOUND_CALL_STEPS.map((step) => step.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(outboundStepById('diagnosis').phase).toBe('Diagnóstico')
  })

  it('renders lead and discovery tokens', () => {
    expect(renderOutboundText('Olá, [Nome do Lead]. Dor: [Dor principal].', {
      'Nome do Lead': 'João',
      'Dor principal': 'faltas',
    })).toBe('Olá, João. Dor: faltas.')
  })

  it('keeps every next step reference valid', () => {
    const ids = new Set(OUTBOUND_CALL_STEPS.map((step) => step.id))
    for (const step of OUTBOUND_CALL_STEPS) {
      for (const action of step.actions) {
        if (action.nextStepId) expect(ids.has(action.nextStepId)).toBe(true)
      }
    }
  })
})
