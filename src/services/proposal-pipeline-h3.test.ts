import { describe, expect, it } from 'vitest'
import { resolveProposalInitialLeadId, validateProposalStepOne } from './proposal-pipeline'

describe('V101.9.9-H3 proposal wizard recovery', () => {
  it('does not let an empty initialLeadId hide the first real opportunity', () => {
    expect(resolveProposalInitialLeadId(null, '', 'lead-alpha')).toBe('lead-alpha')
  })
  it('prefers the proposal lead when editing', () => expect(resolveProposalInitialLeadId('lead-proposal', 'lead-route', 'lead-first')).toBe('lead-proposal'))
  it('accepts the populated first step shown in the UI', () => {
    const result = validateProposalStepOne({ leadId: 'lead-alpha', availableLeadIds: ['lead-alpha'], title: 'Proposta comercial', forecastCategory: 'pipeline', probability: '30' })
    expect(result.valid).toBe(true); expect(result.message).toBe('')
  })
  it('explains why the CTA is blocked', () => {
    expect(validateProposalStepOne({ leadId: '', availableLeadIds: ['lead-alpha'], title: 'Proposta comercial', forecastCategory: 'pipeline', probability: 30 }).message).toContain('Selecione')
    expect(validateProposalStepOne({ leadId: 'lead-alpha', availableLeadIds: ['lead-alpha'], title: 'Proposta', forecastCategory: 'pipeline', probability: 130 }).message).toContain('100%')
  })
})
