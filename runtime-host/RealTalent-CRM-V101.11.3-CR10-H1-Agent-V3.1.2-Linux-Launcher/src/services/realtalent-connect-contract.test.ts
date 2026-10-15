import { describe, expect, it } from 'vitest'
import { normalizeRealTalentConnectSignal, REALTALENT_CONNECT_SIGNAL_SCHEMA } from './realtalent-connect-contract'

describe('RealTalent Connect signal contract', () => {
  it('normaliza um payload válido sem confiar em campos arbitrários', () => {
    const signal = normalizeRealTalentConnectSignal({
      schema: REALTALENT_CONNECT_SIGNAL_SCHEMA,
      source: 'realtalent-connect',
      workspaceId: 'workspace-1',
      leadId: 'lead-1',
      callId: 'call-1',
      occurredAt: '2026-09-15T13:00:00.000Z',
      summary: 'Cliente pediu proposta.',
      pains: ['No-show'],
      objections: ['Já possui sistema'],
      buyingSignals: ['Perguntou preço'],
      risks: [],
      participants: [{ name: 'Carlos', role: 'Decisor' }],
      nextAction: { type: 'proposal', title: 'Enviar proposta', confidence: 0.9 },
    })
    expect(signal?.leadId).toBe('lead-1')
    expect(signal?.nextAction?.type).toBe('proposal')
    expect(signal?.buyingSignals).toEqual(['Perguntou preço'])
  })

  it('rejeita payload sem contrato/versionamento', () => {
    expect(normalizeRealTalentConnectSignal({ leadId: 'lead-1' })).toBeNull()
  })
})
