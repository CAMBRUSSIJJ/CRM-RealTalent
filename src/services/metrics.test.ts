import { describe, expect, it } from 'vitest'
import { DEMO_WORKSPACE, DEFAULT_STAGES } from '../domain/defaults'
import type { WorkspaceSnapshot } from '../domain/types'
import { calculateCommercialMetrics, getMetricValue, goalProgress } from './metrics'

const snapshot: WorkspaceSnapshot = {
  workspace: DEMO_WORKSPACE,
  stages: DEFAULT_STAGES,
  leads: [
    {
      id: 'lead-win', workspaceId: DEMO_WORKSPACE.id, name: 'Lead ganho', company: '', phone: '', email: '', city: '', source: 'Instagram',
      stageId: 'stage-won', status: 'won', temperature: 'hot', priority: 'high', ownerId: 'user-a', ownerName: 'A', value: 5000,
      nextActionAt: null, notes: '', tags: [], createdAt: '2026-07-02T10:00:00.000Z', updatedAt: '2026-07-10T10:00:00.000Z',
    },
    {
      id: 'lead-active', workspaceId: DEMO_WORKSPACE.id, name: 'Lead proposta', company: '', phone: '', email: '', city: '', source: 'Indicação',
      stageId: 'stage-proposal', status: 'active', temperature: 'warm', priority: 'medium', ownerId: 'user-b', ownerName: 'B', value: 3000,
      nextActionAt: null, notes: '', tags: [], createdAt: '2026-07-05T10:00:00.000Z', updatedAt: '2026-07-12T10:00:00.000Z',
    },
  ],
  activities: [
    {
      id: 'activity-followup', workspaceId: DEMO_WORKSPACE.id, leadId: 'lead-active', type: 'followup', title: 'Retorno', description: '',
      dueAt: '2026-07-08T10:00:00.000Z', completedAt: '2026-07-08T11:00:00.000Z', assignedTo: 'user-b', sourceType: 'manual', sourceId: null,
      createdAt: '2026-07-07T10:00:00.000Z', updatedAt: '2026-07-08T11:00:00.000Z',
    },
  ],
  calls: [
    {
      id: 'call-1', workspaceId: DEMO_WORKSPACE.id, leadId: 'lead-active', userId: 'user-b', outcome: 'answered', durationSeconds: 60,
      notes: '', transcript: '', recordingPath: null, startedAt: '2026-07-09T10:00:00.000Z', endedAt: '2026-07-09T10:01:00.000Z', createdAt: '2026-07-09T10:01:00.000Z',
    },
    {
      id: 'call-2', workspaceId: DEMO_WORKSPACE.id, leadId: 'lead-active', userId: 'user-b', outcome: 'no_answer', durationSeconds: 20,
      notes: '', transcript: '', recordingPath: null, startedAt: '2026-07-10T10:00:00.000Z', endedAt: '2026-07-10T10:00:20.000Z', createdAt: '2026-07-10T10:00:20.000Z',
    },
  ],
  events: [
    {
      id: 'event-1', workspaceId: DEMO_WORKSPACE.id, leadId: 'lead-win', title: 'Reunião', description: '', startsAt: '2026-07-06T10:00:00.000Z',
      endsAt: '2026-07-06T10:30:00.000Z', allDay: false, location: '', status: 'completed', assignedTo: 'user-a',
      createdAt: '2026-07-05T10:00:00.000Z', updatedAt: '2026-07-06T10:30:00.000Z',
    },
  ],
  playbooks: [], goals: [], automationRules: [], automationRuns: [], companies: [], contacts: [], opportunities: [], socialProfiles: [], products: [], proposals: [], revenueEntries: [],
}

describe('métricas comerciais V100.3', () => {
  it('calcula métricas por período e responsável', () => {
    expect(getMetricValue(snapshot, 'calls', '2026-07-01', '2026-07-31')).toBe(2)
    expect(getMetricValue(snapshot, 'contacts', '2026-07-01', '2026-07-31')).toBe(1)
    expect(getMetricValue(snapshot, 'followups', '2026-07-01', '2026-07-31', 'user-b')).toBe(1)
    expect(getMetricValue(snapshot, 'meetings', '2026-07-01', '2026-07-31', 'user-a')).toBe(1)
    expect(getMetricValue(snapshot, 'wins', '2026-07-01', '2026-07-31')).toBe(1)
    expect(getMetricValue(snapshot, 'revenue', '2026-07-01', '2026-07-31')).toBe(5000)
    expect(getMetricValue(snapshot, 'new_leads', '2026-07-01', '2026-07-31')).toBe(2)
  })

  it('calcula funil, receita, contato e previsão ponderada', () => {
    const metrics = calculateCommercialMetrics(snapshot, '2026-07-01', '2026-07-31')
    expect(metrics.leads).toHaveLength(2)
    expect(metrics.calls).toHaveLength(2)
    expect(metrics.contacts).toHaveLength(1)
    expect(metrics.revenue).toBe(5000)
    expect(metrics.activePipeline).toBe(3000)
    expect(metrics.weightedPipeline).toBe(1950)
    expect(metrics.contactRate).toBe(50)
    expect(metrics.averageTicket).toBe(5000)
    expect(metrics.conversion).toBe(50)
  })

  it('não mistura venda antiga com a coorte de leads novos', () => {
    const oldWin = { ...snapshot.leads[0], id: 'old-win', createdAt: '2025-01-01T10:00:00.000Z', updatedAt: '2026-07-11T10:00:00.000Z' }
    const metrics = calculateCommercialMetrics({ ...snapshot, leads: [...snapshot.leads, oldWin] }, '2026-07-01', '2026-07-31')
    expect(metrics.wins).toHaveLength(2)
    expect(metrics.conversion).toBe(50)
  })

  it('calcula progresso sem ultrapassar o limite visual', () => {
    const progress = goalProgress(snapshot, 'calls', 1, '2026-07-01', '2026-07-31')
    expect(progress.value).toBe(2)
    expect(progress.percentage).toBe(200)
    expect(['on_track', 'attention', 'at_risk']).toContain(progress.pace)
  })
})

describe('inteligência comercial V100.13', () => {
  it('cria período anterior com a mesma duração', async () => {
    const { createPreviousMetricsRange } = await import('./metrics')
    expect(createPreviousMetricsRange({ start: '2026-07-01', end: '2026-07-10', label: '10 dias' })).toEqual({ start: '2026-06-21', end: '2026-06-30', label: '10 dias anteriores' })
  })

  it('calcula comparação percentual inclusive quando a base é zero', async () => {
    const { compareMetric } = await import('./metrics')
    expect(compareMetric(15, 10)).toMatchObject({ delta: 50, direction: 'up' })
    expect(compareMetric(0, 0)).toMatchObject({ delta: 0, direction: 'stable' })
    expect(compareMetric(4, 0)).toMatchObject({ delta: 100, direction: 'up' })
  })

  it('analisa funil, perdas, atividades e previsão sem alterar o snapshot', async () => {
    const { calculateActivityIntelligence, calculateForecast, calculateFunnelIntelligence, calculateLossAnalysis } = await import('./metrics')
    const before = JSON.stringify(snapshot)
    const funnel = calculateFunnelIntelligence(snapshot)
    const losses = calculateLossAnalysis(snapshot, { start: '2026-07-01', end: '2026-07-31', label: 'Julho' })
    const activity = calculateActivityIntelligence(snapshot, { start: '2026-07-01', end: '2026-07-31', label: 'Julho' })
    const forecast = calculateForecast(snapshot, { start: '2026-07-01', end: '2026-07-31', label: 'Julho' })
    expect(funnel.find((item) => item.stage.id === 'stage-proposal')?.count).toBe(1)
    expect(losses).toEqual([])
    expect(activity.calls).toHaveLength(2)
    expect(forecast.weightedByStage).toBe(1950)
    expect(forecast.optimistic).toBe(3000)
    expect(JSON.stringify(snapshot)).toBe(before)
  })

  it('gera série temporal e desempenho por origem', async () => {
    const { calculateSourcePerformance, calculateTrend } = await import('./metrics')
    const range = { start: '2026-07-01', end: '2026-07-31', label: '31 dias' }
    const trend = calculateTrend(snapshot, range)
    const sources = calculateSourcePerformance(snapshot, range)
    expect(trend.length).toBeGreaterThan(0)
    expect(trend.reduce((sum, item) => sum + item.leads, 0)).toBe(2)
    expect(sources.find((item) => item.source === 'Instagram')?.revenue).toBe(5000)
  })
})
