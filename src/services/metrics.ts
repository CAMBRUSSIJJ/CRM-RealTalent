import type { CallOutcome, GoalMetric, Lead, WorkspaceSnapshot } from '../domain/types'

export const goalMetricLabels: Record<GoalMetric, string> = {
  calls: 'Ligações realizadas',
  contacts: 'Contatos efetivos',
  followups: 'Follow-ups concluídos',
  meetings: 'Reuniões realizadas',
  proposals: 'Propostas enviadas',
  wins: 'Negócios fechados',
  revenue: 'Receita fechada',
  new_leads: 'Novos leads',
}

export const goalMetricUnits: Record<GoalMetric, 'number' | 'currency'> = {
  calls: 'number', contacts: 'number', followups: 'number', meetings: 'number', proposals: 'number', wins: 'number', revenue: 'currency', new_leads: 'number',
}

const contactOutcomes: CallOutcome[] = ['answered', 'callback_requested', 'interested', 'meeting_scheduled', 'proposal_requested', 'proposal_sent', 'sale_completed']
const proposalOutcomes: CallOutcome[] = ['proposal_requested', 'proposal_sent']
const positiveOutcomes: CallOutcome[] = ['interested', 'meeting_scheduled', 'proposal_requested', 'proposal_sent', 'sale_completed']

const asStart = (value: string) => new Date(`${value}T00:00:00`)
const asEnd = (value: string) => new Date(`${value}T23:59:59.999`)
const dateOnly = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
const inRange = (value: string | null, start: Date, end: Date) => {
  if (!value) return false
  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && date >= start && date <= end
}
const ownerMatches = (ownerId: string | null, userId: string | null) => !userId || ownerId === userId
const safeRate = (value: number, total: number) => total > 0 ? Math.max(0, Math.min(100, value / total * 100)) : 0
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
const differenceInDays = (from: string, to = new Date()) => Math.max(0, (to.getTime() - new Date(from).getTime()) / 86_400_000)
const differenceInHours = (from: string, to: string) => Math.max(0, (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000)

export function getMetricValue(snapshot: WorkspaceSnapshot, metric: GoalMetric, periodStart: string, periodEnd: string, userId: string | null = null): number {
  const start = asStart(periodStart)
  const end = asEnd(periodEnd)
  if (metric === 'calls') return snapshot.calls.filter((call) => ownerMatches(call.userId, userId) && inRange(call.startedAt, start, end)).length
  if (metric === 'contacts') return snapshot.calls.filter((call) => ownerMatches(call.userId, userId) && inRange(call.startedAt, start, end) && contactOutcomes.includes(call.outcome)).length
  if (metric === 'followups') return snapshot.activities.filter((activity) => ownerMatches(activity.assignedTo, userId) && activity.type === 'followup' && inRange(activity.completedAt, start, end)).length
  if (metric === 'meetings') return snapshot.events.filter((event) => ownerMatches(event.assignedTo, userId) && event.status === 'completed' && inRange(event.endsAt, start, end)).length
  if (metric === 'proposals') {
    const ids = new Set(snapshot.calls.filter((call) => ownerMatches(call.userId, userId) && proposalOutcomes.includes(call.outcome) && inRange(call.startedAt, start, end)).map((call) => call.leadId))
    const proposalStages = new Set(snapshot.stages.filter((stage) => /proposta|negocia/i.test(stage.name)).map((stage) => stage.id))
    snapshot.leads.filter((lead) => ownerMatches(lead.ownerId, userId) && proposalStages.has(lead.stageId) && inRange(lead.updatedAt, start, end)).forEach((lead) => ids.add(lead.id))
    return ids.size
  }
  if (metric === 'wins') return snapshot.leads.filter((lead) => ownerMatches(lead.ownerId, userId) && lead.status === 'won' && inRange(lead.updatedAt, start, end)).length
  if (metric === 'revenue') return snapshot.leads.filter((lead) => ownerMatches(lead.ownerId, userId) && lead.status === 'won' && inRange(lead.updatedAt, start, end)).reduce((sum, lead) => sum + lead.value, 0)
  return snapshot.leads.filter((lead) => ownerMatches(lead.ownerId, userId) && inRange(lead.createdAt, start, end)).length
}

export function goalProgress(snapshot: WorkspaceSnapshot, metric: GoalMetric, targetValue: number, periodStart: string, periodEnd: string, userId: string | null = null): { value: number; percentage: number; expected: number; pace: 'on_track' | 'attention' | 'at_risk' } {
  const value = getMetricValue(snapshot, metric, periodStart, periodEnd, userId)
  const percentage = targetValue > 0 ? Math.min(999, Math.round((value / targetValue) * 100)) : 0
  const start = asStart(periodStart).getTime()
  const end = asEnd(periodEnd).getTime()
  const now = Date.now()
  const elapsed = end <= start ? 1 : Math.max(0, Math.min(1, (now - start) / (end - start)))
  const expected = targetValue * elapsed
  const pace = expected <= 0 ? 'on_track' : value >= expected ? 'on_track' : value >= expected * 0.75 ? 'attention' : 'at_risk'
  return { value, percentage, expected, pace }
}

export interface MetricsRange { start: string; end: string; label: string }
export const createMetricsRange = (days: number): MetricsRange => {
  const end = new Date(); const start = new Date(end); start.setDate(start.getDate() - Math.max(0, days - 1))
  return { start: dateOnly(start), end: dateOnly(end), label: `${days} dias` }
}

export const createPreviousMetricsRange = (range: MetricsRange): MetricsRange => {
  const start = asStart(range.start)
  const end = asEnd(range.end)
  const duration = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1)
  const previousEnd = new Date(start); previousEnd.setDate(previousEnd.getDate() - 1)
  const previousStart = new Date(previousEnd); previousStart.setDate(previousStart.getDate() - duration + 1)
  return { start: dateOnly(previousStart), end: dateOnly(previousEnd), label: `${duration} dias anteriores` }
}

export interface MetricsFilters {
  ownerId?: string | null
  source?: string | null
}

const filterSnapshot = (snapshot: WorkspaceSnapshot, filters: MetricsFilters = {}) => {
  const leads = snapshot.leads.filter((lead) => (!filters.ownerId || lead.ownerId === filters.ownerId) && (!filters.source || (lead.source || 'Não informada') === filters.source))
  const leadIds = new Set(leads.map((lead) => lead.id))
  return {
    leads,
    calls: snapshot.calls.filter((call) => leadIds.has(call.leadId) && (!filters.ownerId || call.userId === filters.ownerId)),
    activities: snapshot.activities.filter((activity) => !activity.leadId || leadIds.has(activity.leadId)),
    events: snapshot.events.filter((event) => !event.leadId || leadIds.has(event.leadId)),
  }
}

export function calculateCommercialMetrics(snapshot: WorkspaceSnapshot, startValue: string, endValue: string, filters: MetricsFilters = {}) {
  const start = asStart(startValue); const end = asEnd(endValue)
  const scoped = filterSnapshot(snapshot, filters)
  const leads = scoped.leads.filter((lead) => inRange(lead.createdAt, start, end))
  const calls = scoped.calls.filter((call) => inRange(call.startedAt, start, end))
  const contacts = calls.filter((call) => contactOutcomes.includes(call.outcome))
  const meetings = scoped.events.filter((event) => event.status !== 'cancelled' && inRange(event.startsAt, start, end))
  const completedMeetings = meetings.filter((event) => event.status === 'completed')
  const wins = scoped.leads.filter((lead) => lead.status === 'won' && inRange(lead.updatedAt, start, end))
  const losses = scoped.leads.filter((lead) => lead.status === 'lost' && inRange(lead.updatedAt, start, end))
  const proposals = (() => {
    const ids = new Set(calls.filter((call) => proposalOutcomes.includes(call.outcome)).map((call) => call.leadId))
    const proposalStages = new Set(snapshot.stages.filter((stage) => /proposta|negocia/i.test(stage.name)).map((stage) => stage.id))
    scoped.leads.filter((lead) => proposalStages.has(lead.stageId) && inRange(lead.updatedAt, start, end)).forEach((lead) => ids.add(lead.id))
    return ids.size
  })()
  const revenue = wins.reduce((sum, lead) => sum + lead.value, 0)
  const activeLeads = scoped.leads.filter((lead) => lead.status === 'active')
  const activePipeline = activeLeads.reduce((sum, lead) => sum + lead.value, 0)
  const weightedPipeline = activeLeads.reduce((sum, lead) => {
    const probability = snapshot.stages.find((stage) => stage.id === lead.stageId)?.probability ?? 0
    return sum + lead.value * probability / 100
  }, 0)
  // Conversão por coorte: somente leads criados no período entram no
  // numerador e denominador. Vendas antigas fechadas agora continuam em
  // receita/ganhos do período, mas não podem gerar taxas acima de 100%.
  const cohortWins = leads.filter((lead) => lead.status === 'won')
  const conversion = safeRate(cohortWins.length, leads.length)
  const contactRate = safeRate(contacts.length, calls.length)
  const winRate = safeRate(wins.length, wins.length + losses.length)
  const meetingShowRate = safeRate(completedMeetings.length, meetings.length)
  const proposalAcceptanceRate = safeRate(wins.length, proposals)
  const averageTicket = wins.length ? revenue / wins.length : 0
  const averageCallDuration = average(calls.filter((call) => call.durationSeconds > 0).map((call) => call.durationSeconds))
  return { leads, cohortWins, calls, contacts, meetings, completedMeetings, wins, losses, proposals, revenue, activePipeline, weightedPipeline, conversion, contactRate, winRate, meetingShowRate, proposalAcceptanceRate, averageTicket, averageCallDuration }
}

export interface MetricComparison {
  current: number
  previous: number
  delta: number
  direction: 'up' | 'down' | 'stable'
}

export const compareMetric = (current: number, previous: number): MetricComparison => {
  const delta = previous === 0 ? (current === 0 ? 0 : 100) : (current - previous) / Math.abs(previous) * 100
  return { current, previous, delta, direction: Math.abs(delta) < 0.05 ? 'stable' : delta > 0 ? 'up' : 'down' }
}

const stageEntryDate = (snapshot: WorkspaceSnapshot, lead: Lead) => {
  const stageChanges = snapshot.activities
    .filter((activity) => activity.leadId === lead.id && activity.type === 'stage_change' && activity.createdAt <= lead.updatedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return stageChanges[0]?.createdAt ?? lead.updatedAt ?? lead.createdAt
}

export function calculateFunnelIntelligence(snapshot: WorkspaceSnapshot, filters: MetricsFilters = {}) {
  const scoped = filterSnapshot(snapshot, filters)
  const orderedStages = [...snapshot.stages].sort((a, b) => a.order - b.order)
  const totalValue = scoped.leads.reduce((sum, lead) => sum + lead.value, 0)
  const now = new Date()
  return orderedStages.map((stage, index) => {
    const stageLeads = scoped.leads.filter((lead) => lead.stageId === stage.id)
    const previousStage = orderedStages[index - 1]
    const previousReachedCount = index === 0 ? scoped.leads.length : scoped.leads.filter((lead) => {
      const leadStage = snapshot.stages.find((item) => item.id === lead.stageId)
      return Boolean(leadStage && previousStage && leadStage.order >= previousStage.order)
    }).length
    const reachedCount = scoped.leads.filter((lead) => {
      const leadStage = snapshot.stages.find((item) => item.id === lead.stageId)
      return Boolean(leadStage && leadStage.order >= stage.order)
    }).length
    const avgDays = average(stageLeads.map((lead) => differenceInDays(stageEntryDate(snapshot, lead), now)))
    const stalled = stageLeads.filter((lead) => differenceInDays(stageEntryDate(snapshot, lead), now) >= 7 && lead.status === 'active').length
    const value = stageLeads.reduce((sum, lead) => sum + lead.value, 0)
    return {
      stage,
      count: stageLeads.length,
      reachedCount,
      value,
      share: safeRate(value, totalValue),
      conversionFromPrevious: index === 0 ? 100 : safeRate(reachedCount, previousReachedCount),
      avgDays,
      stalled,
    }
  })
}

export function calculateTrend(snapshot: WorkspaceSnapshot, range: MetricsRange, filters: MetricsFilters = {}, bucketCount = 6) {
  const start = asStart(range.start)
  const end = asEnd(range.end)
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1)
  const bucketDays = Math.max(1, Math.ceil(totalDays / bucketCount))
  const buckets = []
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + bucketDays)) {
    const bucketStart = new Date(cursor)
    const bucketEnd = new Date(cursor); bucketEnd.setDate(bucketEnd.getDate() + bucketDays - 1)
    if (bucketEnd > end) bucketEnd.setTime(end.getTime())
    const data = calculateCommercialMetrics(snapshot, dateOnly(bucketStart), dateOnly(bucketEnd), filters)
    buckets.push({
      label: totalDays <= 14 ? bucketStart.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : bucketStart.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', ''),
      leads: data.leads.length,
      calls: data.calls.length,
      contacts: data.contacts.length,
      wins: data.wins.length,
      revenue: data.revenue,
    })
  }
  return buckets
}

export function calculateOwnerPerformance(snapshot: WorkspaceSnapshot, range: MetricsRange) {
  const owners = new Map<string, { id: string; name: string }>()
  snapshot.leads.forEach((lead) => { if (lead.ownerId) owners.set(lead.ownerId, { id: lead.ownerId, name: lead.ownerName || 'Sem nome' }) })
  return [...owners.values()].map((owner) => {
    const data = calculateCommercialMetrics(snapshot, range.start, range.end, { ownerId: owner.id })
    const activeValue = snapshot.leads.filter((lead) => lead.ownerId === owner.id && lead.status === 'active').reduce((sum, lead) => sum + lead.value, 0)
    const score = Math.round(data.contacts.length * 2 + data.completedMeetings.length * 5 + data.proposals * 7 + data.wins.length * 20)
    return { ...owner, ...data, activeValue, score }
  }).sort((a, b) => b.score - a.score)
}

export function calculateSourcePerformance(snapshot: WorkspaceSnapshot, range: MetricsRange, filters: MetricsFilters = {}) {
  const sources = [...new Set(snapshot.leads.map((lead) => lead.source || 'Não informada'))]
  return sources.map((source) => {
    const data = calculateCommercialMetrics(snapshot, range.start, range.end, { ...filters, source })
    return {
      source,
      leads: data.leads.length,
      totalLeads: data.leads.length,
      wins: data.wins.length,
      conversion: data.conversion,
      revenue: data.revenue,
    }
  }).sort((a, b) => b.revenue - a.revenue || b.totalLeads - a.totalLeads)
}

const lossReasonForLead = (snapshot: WorkspaceSnapshot, lead: Lead) => {
  const explicit = [...lead.notes.matchAll(/\[Motivo da perda\]\s*([^\n\r]+)/gi)].at(-1)?.[1]?.trim()
  if (explicit && !/^não informado$/i.test(explicit)) return explicit.slice(0, 120)
  const text = `${lead.notes} ${lead.tags.join(' ')}`.toLowerCase()
  if (/preço|valor|caro|orçamento/.test(text)) return 'Preço ou orçamento'
  if (/concorr|outro sistema|já tem sistema/.test(text)) return 'Concorrente ou sistema atual'
  if (/tempo|momento|depois|sem prioridade/.test(text)) return 'Sem prioridade no momento'
  const lastCall = snapshot.calls.filter((call) => call.leadId === lead.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
  if (lastCall?.outcome === 'not_interested') return 'Sem interesse'
  if (lastCall?.outcome === 'invalid_number') return 'Contato inválido'
  if (lastCall?.outcome === 'wrong_person') return 'Não era o decisor'
  return 'Sem motivo registrado'
}

export function calculateLossAnalysis(snapshot: WorkspaceSnapshot, range: MetricsRange, filters: MetricsFilters = {}) {
  const scoped = filterSnapshot(snapshot, filters)
  const start = asStart(range.start); const end = asEnd(range.end)
  const losses = scoped.leads.filter((lead) => lead.status === 'lost' && inRange(lead.updatedAt, start, end))
  const grouped = losses.reduce<Record<string, { count: number; value: number }>>((acc, lead) => {
    const reason = lossReasonForLead(snapshot, lead)
    const current = acc[reason] ?? { count: 0, value: 0 }
    acc[reason] = { count: current.count + 1, value: current.value + lead.value }
    return acc
  }, {})
  return Object.entries(grouped).map(([reason, values]) => ({ reason, ...values, share: safeRate(values.count, losses.length) })).sort((a, b) => b.count - a.count)
}

export function calculateActivityIntelligence(snapshot: WorkspaceSnapshot, range: MetricsRange, filters: MetricsFilters = {}) {
  const start = asStart(range.start); const end = asEnd(range.end)
  const scoped = filterSnapshot(snapshot, filters)
  const calls = scoped.calls.filter((call) => inRange(call.startedAt, start, end))
  const completedFollowups = scoped.activities.filter((activity) => activity.type === 'followup' && inRange(activity.completedAt, start, end))
  const overdue = scoped.activities.filter((activity) => activity.dueAt && !activity.completedAt && new Date(activity.dueAt) < new Date())
  const callsByWeekday = new Map<number, { attempts: number; contacts: number }>()
  const callsByHour = new Map<number, { attempts: number; contacts: number }>()
  calls.forEach((call) => {
    const date = new Date(call.startedAt)
    const weekday = date.getDay(); const hour = date.getHours()
    const dayData = callsByWeekday.get(weekday) ?? { attempts: 0, contacts: 0 }
    dayData.attempts += 1; if (contactOutcomes.includes(call.outcome)) dayData.contacts += 1; callsByWeekday.set(weekday, dayData)
    const hourData = callsByHour.get(hour) ?? { attempts: 0, contacts: 0 }
    hourData.attempts += 1; if (contactOutcomes.includes(call.outcome)) hourData.contacts += 1; callsByHour.set(hour, hourData)
  })
  const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
  const bestDayEntry = [...callsByWeekday.entries()].sort((a, b) => safeRate(b[1].contacts, b[1].attempts) - safeRate(a[1].contacts, a[1].attempts) || b[1].contacts - a[1].contacts)[0]
  const bestHourEntry = [...callsByHour.entries()].sort((a, b) => safeRate(b[1].contacts, b[1].attempts) - safeRate(a[1].contacts, a[1].attempts) || b[1].contacts - a[1].contacts)[0]
  const avgResponseHours = average(scoped.leads.map((lead) => {
    const firstCall = scoped.calls.filter((call) => call.leadId === lead.id && contactOutcomes.includes(call.outcome)).sort((a, b) => a.startedAt.localeCompare(b.startedAt))[0]
    return firstCall ? differenceInHours(lead.createdAt, firstCall.startedAt) : -1
  }).filter((value) => value >= 0))
  return {
    calls,
    completedFollowups,
    overdue,
    positiveCalls: calls.filter((call) => positiveOutcomes.includes(call.outcome)),
    bestDay: bestDayEntry ? { label: dayNames[bestDayEntry[0]], rate: safeRate(bestDayEntry[1].contacts, bestDayEntry[1].attempts), attempts: bestDayEntry[1].attempts } : null,
    bestHour: bestHourEntry ? { label: `${String(bestHourEntry[0]).padStart(2, '0')}:00`, rate: safeRate(bestHourEntry[1].contacts, bestHourEntry[1].attempts), attempts: bestHourEntry[1].attempts } : null,
    avgResponseHours,
  }
}

export function calculateForecast(snapshot: WorkspaceSnapshot, range: MetricsRange, filters: MetricsFilters = {}) {
  const data = calculateCommercialMetrics(snapshot, range.start, range.end, filters)
  const active = filterSnapshot(snapshot, filters).leads.filter((lead) => lead.status === 'active')
  const weightedByStage = active.reduce((sum, lead) => {
    const probability = snapshot.stages.find((stage) => stage.id === lead.stageId)?.probability ?? 0
    return sum + lead.value * probability / 100
  }, 0)
  const optimistic = active.reduce((sum, lead) => sum + lead.value, 0)
  const committedStageIds = new Set(snapshot.stages.filter((stage) => stage.probability >= 75 && !stage.isWon && !stage.isLost).map((stage) => stage.id))
  const committed = active.filter((lead) => committedStageIds.has(lead.stageId)).reduce((sum, lead) => sum + lead.value, 0)
  const start = asStart(range.start); const end = asEnd(range.end)
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1)
  const elapsedDays = Math.max(1, Math.min(totalDays, Math.round((Math.min(Date.now(), end.getTime()) - start.getTime()) / 86_400_000) + 1))
  const runRateRevenue = data.revenue / elapsedDays * totalDays
  const projectedRevenue = Math.max(data.revenue, Math.round((runRateRevenue + data.revenue + weightedByStage) / 2))
  const projectedWins = data.averageTicket > 0 ? Math.max(data.wins.length, Math.round(projectedRevenue / data.averageTicket)) : data.wins.length
  return { currentRevenue: data.revenue, weightedByStage, committed, optimistic, runRateRevenue, projectedRevenue, projectedWins }
}

export interface MetricsAlert {
  id: string
  tone: 'critical' | 'warning' | 'positive' | 'info'
  title: string
  description: string
  area: 'pipeline' | 'activity' | 'conversion' | 'goals' | 'acquisition'
}

export function generateMetricsAlerts(snapshot: WorkspaceSnapshot, range: MetricsRange, filters: MetricsFilters = {}): MetricsAlert[] {
  const previousRange = createPreviousMetricsRange(range)
  const current = calculateCommercialMetrics(snapshot, range.start, range.end, filters)
  const previous = calculateCommercialMetrics(snapshot, previousRange.start, previousRange.end, filters)
  const activity = calculateActivityIntelligence(snapshot, range, filters)
  const funnel = calculateFunnelIntelligence(snapshot, filters)
  const sources = calculateSourcePerformance(snapshot, range, filters)
  const alerts: MetricsAlert[] = []
  if (previous.contactRate > 0 && current.contactRate < previous.contactRate * 0.8) alerts.push({ id: 'contact-drop', tone: 'critical', title: 'Taxa de contato caiu', description: `A taxa está ${Math.abs(compareMetric(current.contactRate, previous.contactRate).delta).toFixed(0)}% abaixo do período anterior. Revise lista, horário e abordagem.`, area: 'activity' })
  if (previous.conversion > 0 && current.conversion < previous.conversion * 0.8) alerts.push({ id: 'conversion-drop', tone: 'critical', title: 'Conversão perdeu força', description: 'O avanço para vendas ficou abaixo do período anterior. Verifique propostas, negociação e objeções.', area: 'conversion' })
  const stalled = funnel.reduce((sum, stage) => sum + stage.stalled, 0)
  if (stalled > 0) alerts.push({ id: 'stalled', tone: stalled >= 5 ? 'critical' : 'warning', title: `${stalled} lead(s) parado(s)`, description: 'Existem oportunidades ativas sem movimentação há sete dias ou mais.', area: 'pipeline' })
  if (activity.overdue.length > 0) alerts.push({ id: 'overdue', tone: activity.overdue.length >= 5 ? 'critical' : 'warning', title: `${activity.overdue.length} atividade(s) vencida(s)`, description: 'Atrasos aumentam o risco de perda e precisam voltar para a rotina comercial.', area: 'activity' })
  const proposalStageIds = new Set(snapshot.stages.filter((stage) => /proposta|negocia/i.test(stage.name)).map((stage) => stage.id))
  const scopedLeads = filterSnapshot(snapshot, filters).leads
  const proposalsWithoutAction = scopedLeads.filter((lead) => lead.status === 'active' && proposalStageIds.has(lead.stageId) && (!lead.nextActionAt || new Date(lead.nextActionAt) < new Date())).length
  if (proposalsWithoutAction > 0) alerts.push({ id: 'proposal-no-action', tone: 'warning', title: 'Propostas sem retorno planejado', description: `${proposalsWithoutAction} oportunidade(s) em proposta ou negociação estão sem próxima ação válida.`, area: 'pipeline' })
  const lowQualitySource = sources.filter((source) => source.totalLeads >= 3).sort((a, b) => a.conversion - b.conversion)[0]
  if (lowQualitySource && lowQualitySource.conversion < 10) alerts.push({ id: 'low-source', tone: 'info', title: `Origem ${lowQualitySource.source} com baixa conversão`, description: 'Avalie qualidade dos leads, segmentação e esforço investido nesse canal.', area: 'acquisition' })
  const activeGoals = snapshot.goals.filter((goal) => asEnd(goal.periodEnd) >= new Date() && (!filters.ownerId || goal.userId === filters.ownerId))
  const atRisk = activeGoals.filter((goal) => goalProgress(snapshot, goal.metric, goal.targetValue, goal.periodStart, goal.periodEnd, goal.userId).pace === 'at_risk')
  if (atRisk.length > 0) alerts.push({ id: 'goals-risk', tone: 'critical', title: `${atRisk.length} meta(s) em risco`, description: 'O ritmo atual está abaixo de 75% do esperado para o período.', area: 'goals' })
  if (!alerts.length) alerts.push({ id: 'healthy', tone: 'positive', title: 'Operação comercial saudável', description: 'Nenhum risco relevante foi identificado no período selecionado.', area: 'conversion' })
  return alerts.slice(0, 6)
}
