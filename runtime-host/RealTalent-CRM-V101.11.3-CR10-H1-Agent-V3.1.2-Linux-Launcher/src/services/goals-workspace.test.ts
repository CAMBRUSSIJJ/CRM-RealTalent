import { describe, expect, it } from 'vitest'
import { DEMO_ACTIVITIES, DEMO_CALLS, DEMO_EVENTS, DEMO_GOALS, DEMO_LEADS, DEFAULT_STAGES, DEMO_WORKSPACE } from '../domain/defaults'
import type { WorkspaceSnapshot } from '../domain/types'
import { buildRoutineActivities, buildRoutinePlan, countBusinessDays, getGoalInsight, getGoalPeriodBounds, localDateKey } from './goals-workspace'

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
  automationRuns: [], companies: [], contacts: [], contactRelationships: [], opportunities: [], socialProfiles: [], products: [], proposals: [], revenueEntries: [],
}

describe('goals workspace', () => {
  it('counts only business days', () => {
    expect(countBusinessDays('2026-07-20', '2026-07-24')).toBe(5)
    expect(countBusinessDays('2026-07-18', '2026-07-19')).toBe(0)
    expect(countBusinessDays('2026-07-18', '2026-07-19', [0, 6])).toBe(2)
  })

  it('uses local date keys instead of UTC date slicing', () => {
    const date = new Date(2026, 8, 20, 23, 30, 0)
    expect(localDateKey(date)).toBe('2026-09-20')
  })

  it('creates quarter and year goal periods', () => {
    const base = new Date(2026, 8, 20, 12, 0, 0)
    expect(getGoalPeriodBounds('quarter', base)).toEqual({ start: '2026-07-01', end: '2026-09-30' })
    expect(getGoalPeriodBounds('year', base)).toEqual({ start: '2026-01-01', end: '2026-12-31' })
  })

  it('builds a workday-aware insight with projection and previous-period comparison', () => {
    const insight = getGoalInsight(snapshot, DEMO_GOALS[0], new Date('2026-07-20T12:00:00'))
    expect(insight.dailyRequired).toBeGreaterThanOrEqual(0)
    expect(insight.forecastPercentage).toBeGreaterThanOrEqual(0)
    expect(insight.workdaysTotal).toBeGreaterThanOrEqual(insight.workdaysElapsed)
    expect(typeof insight.projectedToHit).toBe('boolean')
    expect(insight.previousPeriodStart <= insight.previousPeriodEnd).toBe(true)
  })

  it('creates a daily funnel plan and avoids duplicate routine tasks', () => {
    const plan = buildRoutinePlan(snapshot, DEMO_GOALS, new Date('2026-07-20T12:00:00'))
    expect(plan.calls).toBeGreaterThanOrEqual(0)
    const tasks = buildRoutineActivities(snapshot, plan, 2, 1, new Date('2026-07-20T12:00:00'))
    expect(tasks.length).toBeLessThanOrEqual(3)
    expect(tasks.every((task) => task.title.includes('Rotina de metas'))).toBe(true)
  })
})
