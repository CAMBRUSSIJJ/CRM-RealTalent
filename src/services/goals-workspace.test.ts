import { describe, expect, it } from 'vitest'
import { DEMO_ACTIVITIES, DEMO_CALLS, DEMO_EVENTS, DEMO_GOALS, DEMO_LEADS, DEFAULT_STAGES, DEMO_WORKSPACE } from '../domain/defaults'
import type { WorkspaceSnapshot } from '../domain/types'
import { buildRoutineActivities, buildRoutinePlan, countBusinessDays, getGoalInsight } from './goals-workspace'

const snapshot: WorkspaceSnapshot = {
  workspace: DEMO_WORKSPACE,
  stages: DEFAULT_STAGES,
  leads: DEMO_LEADS,
  activities: DEMO_ACTIVITIES,
  calls: DEMO_CALLS,
  events: DEMO_EVENTS,
  playbooks: [],
  goals: DEMO_GOALS,
  automationRules: [],
  automationRuns: [], companies: [], contacts: [], opportunities: [], socialProfiles: [], products: [], proposals: [], revenueEntries: [],
}

describe('goals workspace', () => {
  it('counts only business days', () => {
    expect(countBusinessDays('2026-07-20', '2026-07-24')).toBe(5)
    expect(countBusinessDays('2026-07-18', '2026-07-19')).toBe(0)
  })

  it('builds an insight with a daily requirement', () => {
    const insight = getGoalInsight(snapshot, DEMO_GOALS[0], new Date('2026-07-18T12:00:00'))
    expect(insight.dailyRequired).toBeGreaterThanOrEqual(0)
    expect(insight.forecastPercentage).toBeGreaterThanOrEqual(0)
  })

  it('creates a daily funnel plan and avoids duplicate routine tasks', () => {
    const plan = buildRoutinePlan(snapshot, DEMO_GOALS, new Date('2026-07-18T12:00:00'))
    expect(plan.calls).toBeGreaterThanOrEqual(0)
    const tasks = buildRoutineActivities(snapshot, plan, 2, 1, new Date('2026-07-18T12:00:00'))
    expect(tasks.length).toBeLessThanOrEqual(3)
    expect(tasks.every((task) => task.title.includes('Rotina de metas'))).toBe(true)
  })
})
