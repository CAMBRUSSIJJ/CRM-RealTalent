import { describe, expect, it } from 'vitest'
import { buildCommercialCallPlan, resolveCommercialStage, shouldClosePendingActivity } from './commercial-action-engine'
import type { PipelineStage } from '../domain/types'

const stages: PipelineStage[] = [
  { id: 'new', workspaceId: 'w', name: 'Novo lead', order: 1, color: '#000', probability: 10, isWon: false, isLost: false },
  { id: 'proposal', workspaceId: 'w', name: 'Proposta', order: 2, color: '#000', probability: 60, isWon: false, isLost: false },
  { id: 'won', workspaceId: 'w', name: 'Fechado', order: 3, color: '#000', probability: 100, isWon: true, isLost: false },
  { id: 'lost', workspaceId: 'w', name: 'Perdido', order: 4, color: '#000', probability: 0, isWon: false, isLost: true },
]

describe('commercial action engine', () => {
  it('requires a next step for outcomes that promise a return', () => {
    expect(() => buildCommercialCallPlan({ outcome: 'callback_requested', scheduleNext: false, nextAt: null })).toThrow(/agendamento/i)
  })

  it('creates a meeting plan and pauses prospecting activities', () => {
    const plan = buildCommercialCallPlan({ outcome: 'meeting_scheduled', scheduleNext: true, nextAt: '2026-07-24T15:00:00.000Z' })
    expect(plan.nextStepKind).toBe('meeting')
    expect(plan.pendingActivityPolicy).toBe('close_prospecting')
  })

  it('maps commercial outcomes to the expected pipeline stages', () => {
    expect(resolveCommercialStage(stages, 'w', 'proposal')?.id).toBe('proposal')
    expect(resolveCommercialStage(stages, 'w', 'won')?.id).toBe('won')
    expect(resolveCommercialStage(stages, 'w', 'lost')?.id).toBe('lost')
  })

  it('closes only the activities covered by each policy', () => {
    expect(shouldClosePendingActivity('call', 'close_calls')).toBe(true)
    expect(shouldClosePendingActivity('followup', 'close_calls')).toBe(false)
    expect(shouldClosePendingActivity('followup', 'close_prospecting')).toBe(true)
    expect(shouldClosePendingActivity('meeting', 'close_prospecting')).toBe(false)
  })
})
