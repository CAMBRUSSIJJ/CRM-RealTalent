import { describe, expect, it } from 'vitest'
import type { ActivityItem } from '../domain/types'
import { appendFollowupMetadata } from './followup-workspace'
import { buildCadenceOutcomePatches, buildCadenceStatePatches, decideCadenceAfterOutcome } from './sales-engagement'

const activity = (id: string, step: number, dueAt: string): ActivityItem => ({
  id, workspaceId: 'w1', leadId: 'l1', type: 'followup', title: `Etapa ${step}`,
  description: appendFollowupMetadata('Contato', { version: 1, kind: 'cadence-step', cadenceId: 'c1', enrollmentId: 'c1:l1', cadenceName: 'Outbound', stepIndex: step, stepTotal: 3, channel: 'whatsapp', cadenceState: 'active' }),
  dueAt, completedAt: null, resolutionStatus: 'pending', assignedTo: null, sourceType: 'manual', sourceId: 'c1', createdAt: dueAt, updatedAt: dueAt,
})

describe('Sales Engagement', () => {
  it('continua a cadência quando não houve resposta', () => {
    expect(decideCadenceAfterOutcome('no_response').action).toBe('continue')
  })

  it('pausa quando o lead pede retorno', () => {
    expect(decideCadenceAfterOutcome('callback_requested').action).toBe('pause')
  })

  it('encerra quando existe resposta útil', () => {
    expect(decideCadenceAfterOutcome('interested').action).toBe('stop')
    expect(decideCadenceAfterOutcome('meeting_scheduled').action).toBe('stop')
    expect(decideCadenceAfterOutcome('proposal_requested').action).toBe('stop')
  })

  it('cancela apenas etapas futuras da mesma inscrição', () => {
    const first = activity('a1', 1, '2026-09-15T12:00:00.000Z')
    const second = activity('a2', 2, '2026-09-17T12:00:00.000Z')
    const patches = buildCadenceOutcomePatches([first, second], first, 'interested')
    expect(patches).toHaveLength(1)
    expect(patches[0].id).toBe('a2')
    expect(patches[0].resolutionStatus).toBe('superseded')
  })

  it('permite pausar e retomar uma cadência sem concluir atividades', () => {
    const items = [activity('a1', 1, '2026-09-15T12:00:00.000Z'), activity('a2', 2, '2026-09-17T12:00:00.000Z')]
    const pause = buildCadenceStatePatches(items, 'c1', 'pause')
    const resume = buildCadenceStatePatches(items, 'c1', 'resume')
    expect(pause.every((item) => item.resolutionStatus === undefined)).toBe(true)
    expect(resume.every((item) => item.resolutionStatus === undefined)).toBe(true)
  })
})
