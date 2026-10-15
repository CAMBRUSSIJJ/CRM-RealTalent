import { describe, expect, it } from 'vitest'
import type { CallRecord } from '../domain/types'
import { buildCallIntelligence, callsForPeriod } from './call-intelligence'

const call = (id: string, outcome: CallRecord['outcome'], startedAt = '2026-09-15T10:00:00.000Z'): CallRecord => ({
  id,
  workspaceId: 'w1',
  leadId: 'l1',
  contactId: null,
  userId: null,
  outcome,
  durationSeconds: 120,
  notes: 'dor: agenda; próximo passo: retorno',
  transcript: '',
  recordingPath: null,
  recordingUrl: null,
  consentAt: null,
  startedAt,
  endedAt: startedAt,
  createdAt: startedAt,
})

describe('call intelligence', () => {
  it('builds the calling funnel without mutating CRM data', () => {
    const result = buildCallIntelligence({
      calls: [
        call('1', 'no_answer'),
        call('2', 'answered'),
        call('3', 'interested'),
        call('4', 'meeting_scheduled'),
        call('5', 'proposal_sent'),
        call('6', 'sale_completed'),
      ],
      leads: [], contacts: [], playbooks: [], stages: [], period: 'all',
    })
    expect(result.totals.attempts).toBe(6)
    expect(result.totals.conversations).toBe(5)
    expect(result.totals.meetings).toBe(1)
    expect(result.totals.proposals).toBe(2)
    expect(result.totals.wins).toBe(1)
    expect(result.funnel.map((step) => step.label)).toEqual(['Tentativas', 'Conversas', 'Qualificados', 'Reuniões', 'Propostas', 'Vendas'])
  })

  it('filters a rolling period from the local day boundary', () => {
    const now = new Date('2026-09-15T15:00:00.000Z')
    const calls = [call('today', 'answered', '2026-09-15T10:00:00.000Z'), call('old', 'answered', '2026-08-01T10:00:00.000Z')]
    expect(callsForPeriod(calls, 'today', now).map((item) => item.id)).toContain('today')
    expect(callsForPeriod(calls, '30d', now).map((item) => item.id)).not.toContain('old')
  })
})
