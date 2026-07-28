import { describe, expect, it } from 'vitest'
import { DEFAULT_LEAD_SCORING_CONFIG, buildAutomaticReclassification, buildLeadScoreBoard, leadScoreInsight } from './lead-scoring'
import { DEMO_ACTIVITIES, DEMO_CALLS, DEMO_EVENTS, DEMO_GOALS, DEMO_LEADS, DEMO_PLAYBOOKS, DEMO_WORKSPACE, DEFAULT_STAGES } from '../domain/defaults'
import type { WorkspaceSnapshot } from '../domain/types'

const snapshot: WorkspaceSnapshot = {
  workspace: DEMO_WORKSPACE,
  leads: DEMO_LEADS,
  stages: DEFAULT_STAGES,
  activities: DEMO_ACTIVITIES,
  calls: DEMO_CALLS,
  events: DEMO_EVENTS,
  playbooks: DEMO_PLAYBOOKS,
  goals: DEMO_GOALS,
  automationRules: [],
  automationRuns: [], companies: [], contacts: [], opportunities: [], socialProfiles: [],
}

describe('Lead Score V100.35', () => {
  it('calcula categorias e explica o score', () => {
    const insight = leadScoreInsight(DEMO_LEADS[0], snapshot, DEFAULT_LEAD_SCORING_CONFIG, new Date('2026-07-16T15:00:00.000Z'))
    expect(insight.score).toBeGreaterThan(40)
    expect(insight.categories).toHaveLength(3)
    expect(insight.reasons.length).toBeGreaterThan(0)
    expect(insight.nextBestAction.title).toBeTruthy()
  })

  it('ordena a fila pela maior prioridade', () => {
    const board = buildLeadScoreBoard(snapshot, DEFAULT_LEAD_SCORING_CONFIG, new Date('2026-07-16T15:00:00.000Z'))
    expect(board).toHaveLength(DEMO_LEADS.length)
    expect(board[0].score).toBeGreaterThanOrEqual(board.at(-1)!.score)
  })

  it('gera reclassificações somente quando necessário', () => {
    const updates = buildAutomaticReclassification(snapshot, DEFAULT_LEAD_SCORING_CONFIG, new Date('2026-07-16T15:00:00.000Z'))
    expect(updates.every((item) => ['low', 'medium', 'high', 'urgent'].includes(item.priority))).toBe(true)
  })
})
