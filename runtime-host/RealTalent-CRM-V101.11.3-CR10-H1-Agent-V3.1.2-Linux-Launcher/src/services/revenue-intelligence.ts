import type { ForecastCategory, Goal, WorkspaceSnapshot } from '../domain/types'
import { buildDealIntelligence, type DealIntelligence } from './deal-intelligence'
import { calculateRevenueForecast } from './revenue-forecast'

const DAY = 86_400_000

export type RevenueForecastScenario = 'commit' | 'realtalent' | 'best_case' | 'pipeline'
export type RevenueForecastRiskSeverity = 'critical' | 'high' | 'medium' | 'low'
export type RevenueForecastConfidence = 'high' | 'medium' | 'low'

export interface RevenueDealProjection {
  leadId: string
  opportunityId: string | null
  proposalId: string | null
  companyName: string
  contactName: string
  ownerId: string | null
  ownerName: string
  value: number
  expectedCloseAt: string | null
  manualCategory: ForecastCategory
  suggestedCategory: Exclude<ForecastCategory, 'closed' | 'omitted'>
  sellerProbability: number
  realTalentProbability: number
  healthScore: number
  momentum: DealIntelligence['momentum']
  expectedContribution: number
  confidenceScore: number
  atRisk: boolean
  flags: string[]
  nextBestAction: string
}

export interface RevenueForecastRisk {
  key: string
  severity: RevenueForecastRiskSeverity
  title: string
  detail: string
  value?: number
  suggestedAction: string
}

export interface RevenueOwnerForecast {
  ownerId: string | null
  ownerName: string
  deals: number
  pipeline: number
  commit: number
  bestCase: number
  expected: number
  bookings: number
  recognizedRevenue: number
  atRisk: number
  averageHealth: number
  goalTarget: number
  gapToGoal: number
  attainment: number
}

export interface RevenueForecastScenarioSummary {
  scenario: RevenueForecastScenario
  label: string
  value: number
  description: string
}

export interface RevenueDimensionPerformance {
  key: string
  label: string
  deals: number
  openPipeline: number
  expectedForecast: number
  bookings: number
  recognizedRevenue: number
}

export interface RevenueProductPerformance extends RevenueDimensionPerformance {
  productId: string | null
}

export interface RevenueIntelligence {
  targetMonth: string
  monthLabel: string
  goalTarget: number
  closedBookings: number
  recognizedRevenue: number
  scheduledRevenue: number
  previousRecognizedRevenue: number
  recognizedRevenueDeltaPercent: number | null
  recognizedMrr: number
  activeMrrForecast: number
  openPipeline: number
  weightedOpenPipeline: number
  realTalentExpectedOpenPipeline: number
  sellerWeightedForecast: number
  commitForecast: number
  realTalentForecast: number
  bestCaseForecast: number
  fullPipelineForecast: number
  gapToGoal: number
  remainingGoal: number
  pipelineCoverage: number | null
  expectedAttainment: number | null
  requiredWinRate: number | null
  averageDealSize: number
  averageWonTicket: number
  closedWonDeals: number
  closedLostDeals: number
  winRate: number | null
  dealsNeeded: number
  forecastConfidenceScore: number
  forecastConfidence: RevenueForecastConfidence
  atRiskValue: number
  undatedValue: number
  undatedDeals: number
  suggestedCategoryChanges: number
  scenarios: RevenueForecastScenarioSummary[]
  deals: RevenueDealProjection[]
  owners: RevenueOwnerForecast[]
  sources: RevenueDimensionPerformance[]
  products: RevenueProductPerformance[]
  unlinkedRevenue: number
  risks: RevenueForecastRisk[]
  generatedAt: string
}

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(value)))
const validDate = (value: string | null | undefined) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
const monthKey = (value: Date | string | null | undefined) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7)
  const date = value instanceof Date ? value : validDate(value)
  if (!date) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}
const monthBounds = (reference: Date) => ({
  start: new Date(reference.getFullYear(), reference.getMonth(), 1, 0, 0, 0, 0),
  end: new Date(reference.getFullYear(), reference.getMonth() + 1, 0, 23, 59, 59, 999),
})
const overlapsMonth = (goal: Goal, reference: Date) => {
  const { start, end } = monthBounds(reference)
  const goalStart = validDate(`${goal.periodStart}T00:00:00`)
  const goalEnd = validDate(`${goal.periodEnd}T23:59:59`)
  return Boolean(goalStart && goalEnd && goalStart <= end && goalEnd >= start)
}
const goalFor = (snapshot: WorkspaceSnapshot, reference: Date, ownerId: string | null) => {
  const candidates = snapshot.goals
    .filter((goal) => goal.metric === 'revenue' && goal.userId === ownerId && overlapsMonth(goal, reference))
    .sort((a, b) => {
      const aDays = Math.max(1, Math.ceil((new Date(`${a.periodEnd}T23:59:59`).getTime() - new Date(`${a.periodStart}T00:00:00`).getTime()) / DAY))
      const bDays = Math.max(1, Math.ceil((new Date(`${b.periodEnd}T23:59:59`).getTime() - new Date(`${b.periodStart}T00:00:00`).getTime()) / DAY))
      return bDays - aDays || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
  return candidates[0]?.targetValue ?? 0
}

const ownerNameFor = (deal: DealIntelligence) => deal.lead.ownerName?.trim() || 'Não atribuído'
const manualCategoryFor = (deal: DealIntelligence): ForecastCategory => deal.opportunity?.forecastCategory ?? deal.proposal?.forecastCategory ?? 'pipeline'
const isCritical = (deal: DealIntelligence) => deal.risks.some((risk) => risk.severity === 'critical')

export const suggestedRevenueCategory = (deal: DealIntelligence): RevenueDealProjection['suggestedCategory'] => {
  if (deal.realTalentProbability >= 80 && deal.healthScore >= 65 && deal.momentum !== 'cooling' && !isCritical(deal)) return 'commit'
  if (deal.realTalentProbability >= 55 && deal.healthScore >= 45 && !isCritical(deal)) return 'best_case'
  return 'pipeline'
}

const confidenceForDeal = (deal: DealIntelligence) => {
  let score = deal.healthScore * 0.45
  score += deal.expectedCloseAt ? 15 : 0
  score += deal.proposal ? 12 : 0
  score += Math.min(15, deal.accountCoverage * 0.15)
  score += deal.nextBestAction.urgency === 'planned' ? 8 : deal.nextBestAction.urgency === 'today' ? 5 : 2
  score += deal.momentum === 'accelerating' ? 5 : deal.momentum === 'stable' ? 3 : 0
  return clamp(score)
}

const projectionForDeal = (deal: DealIntelligence): RevenueDealProjection => {
  const manualCategory = manualCategoryFor(deal)
  const suggestedCategory = suggestedRevenueCategory(deal)
  const flags: string[] = []
  if (!deal.expectedCloseAt) flags.push('Sem data de fechamento')
  if (manualCategory !== suggestedCategory && manualCategory !== 'omitted') flags.push(`Categoria sugerida: ${suggestedCategory === 'best_case' ? 'Best Case' : suggestedCategory === 'commit' ? 'Commit' : 'Pipeline'}`)
  if (Math.abs(deal.probabilityGap) >= 20) flags.push(`Probabilidade divergente em ${Math.abs(deal.probabilityGap)} p.p.`)
  if (deal.momentum === 'cooling') flags.push('Momentum esfriando')
  if (deal.healthLevel === 'critical' || deal.healthLevel === 'attention') flags.push(`Deal Health ${deal.healthScore}/100`)
  return {
    leadId: deal.lead.id,
    opportunityId: deal.opportunity?.id ?? null,
    proposalId: deal.proposal?.id ?? null,
    companyName: deal.lead.company || deal.lead.name,
    contactName: deal.lead.name,
    ownerId: deal.lead.ownerId,
    ownerName: ownerNameFor(deal),
    value: deal.commercialValue,
    expectedCloseAt: deal.expectedCloseAt,
    manualCategory,
    suggestedCategory,
    sellerProbability: deal.sellerProbability,
    realTalentProbability: deal.realTalentProbability,
    healthScore: deal.healthScore,
    momentum: deal.momentum,
    expectedContribution: deal.commercialValue * deal.realTalentProbability / 100,
    confidenceScore: confidenceForDeal(deal),
    atRisk: deal.healthLevel === 'critical' || deal.healthLevel === 'attention' || deal.momentum === 'cooling' || isCritical(deal),
    flags,
    nextBestAction: deal.nextBestAction.title,
  }
}

const wonBookingValue = (snapshot: WorkspaceSnapshot, reference: Date, ownerId?: string | null) => {
  const target = monthKey(reference)
  return snapshot.leads.filter((lead) => lead.status === 'won' && (!ownerId || lead.ownerId === ownerId)).reduce((sum, lead) => {
    const opportunity = snapshot.opportunities.find((item) => item.leadId === lead.id) ?? null
    const proposal = snapshot.proposals
      .filter((item) => item.leadId === lead.id && item.isCurrentVersion)
      .sort((a, b) => Number(b.isOfficial) - Number(a.isOfficial) || b.version - a.version)[0] ?? null
    const closeAt = proposal?.closedWonAt ?? opportunity?.closedWonAt ?? lead.updatedAt
    if (monthKey(closeAt) !== target) return sum
    return sum + Math.max(0, proposal?.totalContractValue ?? opportunity?.value ?? lead.value ?? 0)
  }, 0)
}

const forecastRisk = (severity: RevenueForecastRiskSeverity, key: string, title: string, detail: string, suggestedAction: string, value?: number): RevenueForecastRisk => ({ severity, key, title, detail, suggestedAction, value })

const ownerForecasts = (
  snapshot: WorkspaceSnapshot,
  projections: RevenueDealProjection[],
  closedByOwner: Map<string, number>,
  recognizedByOwner: Map<string, number>,
  reference: Date,
): RevenueOwnerForecast[] => {
  const groups = new Map<string, RevenueDealProjection[]>()
  projections.forEach((deal) => {
    const key = deal.ownerId ?? `name:${deal.ownerName}`
    groups.set(key, [...(groups.get(key) ?? []), deal])
  })
  for (const key of new Set([...closedByOwner.keys(), ...recognizedByOwner.keys()])) if (!groups.has(key)) groups.set(key, [])
  return [...groups.entries()].map(([key, deals]) => {
    const ownerId = key.startsWith('name:') ? null : key
    const ownerName = deals[0]?.ownerName
      ?? snapshot.leads.find((lead) => lead.ownerId === ownerId)?.ownerName
      ?? (key.startsWith('name:') ? key.slice(5) : 'Responsável')
    const closed = closedByOwner.get(key) ?? 0
    const recognizedRevenue = recognizedByOwner.get(key) ?? 0
    const open = deals.filter((deal) => deal.manualCategory !== 'omitted')
    const pipeline = open.reduce((sum, deal) => sum + deal.value, 0)
    const commit = closed + open.filter((deal) => deal.suggestedCategory === 'commit').reduce((sum, deal) => sum + deal.value, 0)
    const bestCase = commit + open.filter((deal) => deal.suggestedCategory === 'best_case').reduce((sum, deal) => sum + deal.value, 0)
    const expected = closed + open.reduce((sum, deal) => sum + deal.expectedContribution, 0)
    const atRisk = open.filter((deal) => deal.atRisk).reduce((sum, deal) => sum + deal.value, 0)
    const averageHealth = open.length ? Math.round(open.reduce((sum, deal) => sum + deal.healthScore, 0) / open.length) : 100
    const goalTarget = ownerId ? goalFor(snapshot, reference, ownerId) : 0
    const gapToGoal = goalTarget ? Math.max(0, goalTarget - expected) : 0
    const attainment = goalTarget ? expected / goalTarget * 100 : 0
    return { ownerId, ownerName, deals: open.length, pipeline, commit, bestCase, expected, bookings: closed, recognizedRevenue, atRisk, averageHealth, goalTarget, gapToGoal, attainment }
  }).sort((a, b) => b.expected - a.expected || b.pipeline - a.pipeline)
}

const closedOutcomeSummary = (snapshot: WorkspaceSnapshot, reference: Date, ownerId?: string | null) => {
  const target = monthKey(reference)
  let won = 0
  let lost = 0
  snapshot.leads.filter((lead) => !ownerId || lead.ownerId === ownerId).forEach((lead) => {
    if (!['won', 'lost'].includes(lead.status)) return
    const opportunity = snapshot.opportunities.find((item) => item.leadId === lead.id) ?? null
    const proposal = snapshot.proposals.filter((item) => item.leadId === lead.id && item.isCurrentVersion).sort((a, b) => Number(b.isOfficial) - Number(a.isOfficial) || b.version - a.version)[0] ?? null
    const closedAt = lead.status === 'won' ? proposal?.closedWonAt ?? opportunity?.closedWonAt ?? lead.updatedAt : lead.updatedAt
    if (monthKey(closedAt) !== target) return
    if (lead.status === 'won') won += 1
    else lost += 1
  })
  return { won, lost, winRate: won + lost > 0 ? won / (won + lost) * 100 : null }
}

const leadForRevenueEntry = (snapshot: WorkspaceSnapshot, entry: WorkspaceSnapshot['revenueEntries'][number]) => {
  if (entry.leadId) return snapshot.leads.find((lead) => lead.id === entry.leadId) ?? null
  if (entry.proposalId) {
    const proposal = snapshot.proposals.find((item) => item.id === entry.proposalId)
    if (proposal) return snapshot.leads.find((lead) => lead.id === proposal.leadId) ?? null
  }
  if (entry.opportunityId) {
    const opportunity = snapshot.opportunities.find((item) => item.id === entry.opportunityId)
    if (opportunity) return snapshot.leads.find((lead) => lead.id === opportunity.leadId) ?? null
  }
  return null
}

const sourcePerformance = (
  snapshot: WorkspaceSnapshot,
  projections: RevenueDealProjection[],
  reference: Date,
  recognizedEntries: WorkspaceSnapshot['revenueEntries'],
): RevenueDimensionPerformance[] => {
  const target = monthKey(reference)
  const rows = new Map<string, RevenueDimensionPerformance>()
  const ensure = (label: string) => {
    const key = label.trim() || 'Sem origem'
    const existing = rows.get(key)
    if (existing) return existing
    const row = { key, label: key, deals: 0, openPipeline: 0, expectedForecast: 0, bookings: 0, recognizedRevenue: 0 }
    rows.set(key, row)
    return row
  }
  projections.filter((deal) => deal.manualCategory !== 'omitted').forEach((deal) => {
    const lead = snapshot.leads.find((item) => item.id === deal.leadId)
    const row = ensure(lead?.source || 'Sem origem')
    row.deals += 1
    row.openPipeline += deal.value
    row.expectedForecast += deal.expectedContribution
  })
  snapshot.leads.filter((lead) => lead.status === 'won').forEach((lead) => {
    const opportunity = snapshot.opportunities.find((item) => item.leadId === lead.id) ?? null
    const proposal = snapshot.proposals.filter((item) => item.leadId === lead.id && item.isCurrentVersion).sort((a, b) => Number(b.isOfficial) - Number(a.isOfficial) || b.version - a.version)[0] ?? null
    const closedAt = proposal?.closedWonAt ?? opportunity?.closedWonAt ?? lead.updatedAt
    if (monthKey(closedAt) !== target) return
    ensure(lead.source || 'Sem origem').bookings += Math.max(0, proposal?.totalContractValue ?? opportunity?.value ?? lead.value ?? 0)
  })
  recognizedEntries.forEach((entry) => {
    const lead = leadForRevenueEntry(snapshot, entry)
    ensure(lead?.source || 'Sem origem').recognizedRevenue += Math.max(0, entry.amount)
  })
  return [...rows.values()].sort((a, b) => b.recognizedRevenue - a.recognizedRevenue || b.bookings - a.bookings || b.expectedForecast - a.expectedForecast)
}

const productPerformance = (
  snapshot: WorkspaceSnapshot,
  projections: RevenueDealProjection[],
  reference: Date,
  recognizedEntries: WorkspaceSnapshot['revenueEntries'],
): RevenueProductPerformance[] => {
  const target = monthKey(reference)
  const rows = new Map<string, RevenueProductPerformance>()
  const ensure = (productId: string | null, label: string) => {
    const key = productId ?? `manual:${label || 'Sem produto vinculado'}`
    const existing = rows.get(key)
    if (existing) return existing
    const row = { key, productId, label: label || 'Sem produto vinculado', deals: 0, openPipeline: 0, expectedForecast: 0, bookings: 0, recognizedRevenue: 0 }
    rows.set(key, row)
    return row
  }
  const itemTcv = (item: WorkspaceSnapshot['proposals'][number]['items'][number], termMonths: number) => item.billingType === 'recurring' ? item.recurringMonthlyTotal * Math.max(1, termMonths) : item.lineTotal
  projections.filter((deal) => deal.manualCategory !== 'omitted').forEach((deal) => {
    const proposal = deal.proposalId ? snapshot.proposals.find((item) => item.id === deal.proposalId) : null
    if (!proposal?.items.length) {
      const row = ensure(null, 'Sem produto vinculado')
      row.deals += 1; row.openPipeline += deal.value; row.expectedForecast += deal.expectedContribution
      return
    }
    const weights = proposal.items.map((item) => ({ item, value: itemTcv(item, proposal.contractTermMonths) }))
    const total = weights.reduce((sum, current) => sum + current.value, 0) || 1
    weights.forEach(({ item, value }) => {
      const row = ensure(item.productId, item.name)
      const share = value / total
      row.deals += share
      row.openPipeline += deal.value * share
      row.expectedForecast += deal.expectedContribution * share
    })
  })
  snapshot.proposals.filter((proposal) => proposal.isCurrentVersion && proposal.isOfficial && proposal.closedWonAt && monthKey(proposal.closedWonAt) === target).forEach((proposal) => {
    if (!proposal.items.length) return
    proposal.items.forEach((item) => ensure(item.productId, item.name).bookings += itemTcv(item, proposal.contractTermMonths))
  })
  recognizedEntries.forEach((entry) => {
    const proposal = entry.proposalId ? snapshot.proposals.find((item) => item.id === entry.proposalId) : null
    if (!proposal?.items.length) {
      ensure(null, 'Sem produto vinculado').recognizedRevenue += Math.max(0, entry.amount)
      return
    }
    const eligible = proposal.items.map((item) => ({ item, value: entry.revenueType === 'recurring' ? item.recurringMonthlyTotal : item.billingType === 'one_time' ? item.lineTotal : 0 })).filter((current) => current.value > 0)
    const base = eligible.length ? eligible : proposal.items.map((item) => ({ item, value: item.lineTotal }))
    const total = base.reduce((sum, current) => sum + current.value, 0) || 1
    base.forEach(({ item, value }) => ensure(item.productId, item.name).recognizedRevenue += Math.max(0, entry.amount) * value / total)
  })
  return [...rows.values()].sort((a, b) => b.recognizedRevenue - a.recognizedRevenue || b.bookings - a.bookings || b.expectedForecast - a.expectedForecast).slice(0, 8)
}

export function calculateRevenueIntelligence(snapshot: WorkspaceSnapshot, reference = new Date(), ownerId?: string | null): RevenueIntelligence {
  const now = new Date()
  const targetMonth = monthKey(reference)
  const baseForecast = calculateRevenueForecast(snapshot, reference)
  const allActive = snapshot.leads
    .filter((lead) => lead.status === 'active' && (!ownerId || lead.ownerId === ownerId))
    .map((lead) => buildDealIntelligence(lead, snapshot, undefined, now))
    .filter((deal) => deal.commercialValue > 0)
  const allProjections = allActive.map(projectionForDeal)
  const undated = allProjections.filter((deal) => !deal.expectedCloseAt && deal.manualCategory !== 'omitted')
  const deals = allProjections
    .filter((deal) => deal.expectedCloseAt && monthKey(deal.expectedCloseAt) === targetMonth)
    .sort((a, b) => b.expectedContribution - a.expectedContribution || b.value - a.value)
  const included = deals.filter((deal) => deal.manualCategory !== 'omitted')
  const recognizedEntries = snapshot.revenueEntries.filter((entry) => entry.status === 'recognized' && monthKey(entry.competenceDate || entry.recognizedAt) === targetMonth && (!ownerId || entry.ownerId === ownerId))
  const scheduledEntries = snapshot.revenueEntries.filter((entry) => entry.status === 'forecast' && monthKey(entry.competenceDate || entry.recognizedAt) === targetMonth && (!ownerId || entry.ownerId === ownerId))
  const previousReference = new Date(reference.getFullYear(), reference.getMonth() - 1, 1, 12, 0, 0, 0)
  const previousRecognizedRevenue = calculateRevenueForecast(snapshot, previousReference).closedRevenue
  const scheduledRevenue = scheduledEntries.reduce((sum, entry) => sum + Math.max(0, entry.amount), 0)
  const recognizedRevenueDeltaPercent = previousRecognizedRevenue > 0 ? (baseForecast.closedRevenue - previousRecognizedRevenue) / previousRecognizedRevenue * 100 : baseForecast.closedRevenue > 0 ? 100 : null
  const unlinkedRevenue = recognizedEntries.filter((entry) => !leadForRevenueEntry(snapshot, entry)).reduce((sum, entry) => sum + Math.max(0, entry.amount), 0)

  const closedBookings = wonBookingValue(snapshot, reference, ownerId)
  const openPipeline = included.reduce((sum, deal) => sum + deal.value, 0)
  const weightedOpenPipeline = included.reduce((sum, deal) => sum + deal.value * deal.sellerProbability / 100, 0)
  const realTalentExpectedOpenPipeline = included.reduce((sum, deal) => sum + deal.expectedContribution, 0)
  const sellerWeightedForecast = closedBookings + weightedOpenPipeline
  const commitForecast = closedBookings + included.filter((deal) => deal.suggestedCategory === 'commit').reduce((sum, deal) => sum + deal.value, 0)
  const realTalentForecast = closedBookings + included.reduce((sum, deal) => sum + deal.expectedContribution, 0)
  const rawBestCaseForecast = commitForecast + included.filter((deal) => deal.suggestedCategory !== 'commit' && deal.realTalentProbability >= 40 && deal.healthScore >= 35).reduce((sum, deal) => sum + deal.value, 0)
  const bestCaseForecast = Math.max(commitForecast, realTalentForecast, rawBestCaseForecast)
  const fullPipelineForecast = closedBookings + openPipeline
  const atRiskValue = included.filter((deal) => deal.atRisk).reduce((sum, deal) => sum + deal.value, 0)
  const undatedValue = undated.reduce((sum, deal) => sum + deal.value, 0)

  const goalTarget = ownerId ? goalFor(snapshot, reference, ownerId) : goalFor(snapshot, reference, null)
  const remainingGoal = Math.max(0, goalTarget - closedBookings)
  const gapToGoal = Math.max(0, goalTarget - realTalentForecast)
  const pipelineCoverage = goalTarget > 0 && remainingGoal > 0 ? openPipeline / remainingGoal : goalTarget > 0 ? Infinity : null
  const expectedAttainment = goalTarget > 0 ? realTalentForecast / goalTarget * 100 : null
  const requiredWinRate = remainingGoal > 0 && openPipeline > 0 ? remainingGoal / openPipeline * 100 : remainingGoal <= 0 ? 0 : null
  const averageDealSize = included.length ? openPipeline / included.length : 0
  const outcomes = closedOutcomeSummary(snapshot, reference, ownerId)
  const averageWonTicket = outcomes.won > 0 ? closedBookings / outcomes.won : 0
  const dealsNeeded = gapToGoal > 0 && averageDealSize > 0 ? Math.ceil(gapToGoal / averageDealSize) : 0
  const weightedConfidenceBase = included.reduce((sum, deal) => sum + deal.confidenceScore * deal.value, 0)
  const forecastConfidenceScore = included.length && openPipeline > 0 ? clamp(weightedConfidenceBase / openPipeline) : closedBookings > 0 ? 100 : 0
  const forecastConfidence: RevenueForecastConfidence = forecastConfidenceScore >= 75 ? 'high' : forecastConfidenceScore >= 50 ? 'medium' : 'low'
  const suggestedCategoryChanges = included.filter((deal) => deal.manualCategory !== deal.suggestedCategory).length

  const closedByOwner = new Map<string, number>()
  snapshot.leads.filter((lead) => lead.status === 'won' && (!ownerId || lead.ownerId === ownerId)).forEach((lead) => {
    const opportunity = snapshot.opportunities.find((item) => item.leadId === lead.id) ?? null
    const proposal = snapshot.proposals.filter((item) => item.leadId === lead.id && item.isCurrentVersion).sort((a, b) => Number(b.isOfficial) - Number(a.isOfficial))[0] ?? null
    const closeAt = proposal?.closedWonAt ?? opportunity?.closedWonAt ?? lead.updatedAt
    if (monthKey(closeAt) !== targetMonth) return
    const key = lead.ownerId ?? `name:${lead.ownerName?.trim() || 'Não atribuído'}`
    closedByOwner.set(key, (closedByOwner.get(key) ?? 0) + Math.max(0, proposal?.totalContractValue ?? opportunity?.value ?? lead.value ?? 0))
  })

  const recognizedByOwner = new Map<string, number>()
  recognizedEntries.forEach((entry) => {
    const lead = leadForRevenueEntry(snapshot, entry)
    const key = entry.ownerId ?? lead?.ownerId ?? `name:${lead?.ownerName?.trim() || 'Não atribuído'}`
    recognizedByOwner.set(key, (recognizedByOwner.get(key) ?? 0) + Math.max(0, entry.amount))
  })

  const risks: RevenueForecastRisk[] = []
  if (goalTarget > 0 && gapToGoal > 0) risks.push(forecastRisk(gapToGoal / goalTarget >= 0.4 ? 'critical' : 'high', 'goal-gap', 'Forecast abaixo da meta', `O forecast RealTalent cobre ${Math.round(expectedAttainment ?? 0)}% da meta e ainda faltam ${Math.round(gapToGoal)} em valor esperado.`, 'Revisar cobertura e criar plano para os negócios de maior contribuição.', gapToGoal))
  if (pipelineCoverage !== null && Number.isFinite(pipelineCoverage) && pipelineCoverage < 2) risks.push(forecastRisk(pipelineCoverage < 1 ? 'critical' : 'high', 'low-coverage', 'Cobertura de pipeline insuficiente', `Há ${pipelineCoverage.toFixed(1)}× de pipeline para o valor ainda necessário.`, 'Aumentar geração de pipeline ou elevar conversão nos negócios existentes.', openPipeline))
  if (undated.length) risks.push(forecastRisk('medium', 'undated-deals', 'Negócios sem data de fechamento', `${undated.length} negócio(s), somando ${Math.round(undatedValue)}, não entram em nenhum mês do forecast.`, 'Revisar expected close date dos negócios sem previsão.', undatedValue))
  if (unlinkedRevenue > 0) risks.push(forecastRisk('medium', 'unlinked-revenue', 'Receita sem vínculo comercial', `${Math.round(unlinkedRevenue)} em receita reconhecida não possui lead, oportunidade ou proposta identificável.`, 'Vincular o lançamento ao negócio de origem para habilitar análise por vendedor, origem e produto.', unlinkedRevenue))
  const weakCommit = included.filter((deal) => deal.manualCategory === 'commit' && (deal.realTalentProbability < 65 || deal.healthScore < 55 || deal.momentum === 'cooling'))
  if (weakCommit.length) risks.push(forecastRisk('high', 'weak-commit', 'Commit com sinais fracos', `${weakCommit.length} negócio(s) marcado(s) como Commit não possuem sinais suficientes para sustentar a previsão.`, 'Revisar categoria ou resolver riscos antes da forecast call.', weakCommit.reduce((sum, deal) => sum + deal.value, 0)))
  if (suggestedCategoryChanges) risks.push(forecastRisk('medium', 'category-drift', 'Categorias de forecast desalinhadas', `${suggestedCategoryChanges} negócio(s) possuem categoria manual diferente da categoria sugerida pelos sinais atuais.`, 'Revisar Deal Health, probabilidade e categoria com o responsável.'))
  if (atRiskValue > 0 && atRiskValue >= openPipeline * 0.35) risks.push(forecastRisk('high', 'risk-concentration', 'Muito valor do mês está em risco', `${Math.round(openPipeline ? atRiskValue / openPipeline * 100 : 0)}% do pipeline do mês está em atenção/crítico ou esfriando.`, 'Trabalhar os maiores riscos antes de aumentar o commit.', atRiskValue))
  const largest = included[0]
  if (largest && realTalentForecast > 0 && largest.expectedContribution / realTalentForecast >= 0.4) risks.push(forecastRisk('medium', 'concentration', 'Forecast concentrado em um negócio', `${largest.companyName} representa ${Math.round(largest.expectedContribution / realTalentForecast * 100)}% do forecast esperado.`, 'Criar cobertura adicional para reduzir dependência de um único fechamento.', largest.value))

  const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(reference)
  const scenarios: RevenueForecastScenarioSummary[] = [
    { scenario: 'commit', label: 'Commit RealTalent', value: commitForecast, description: 'Fechado + negócios com sinais fortes suficientes para compromisso.' },
    { scenario: 'realtalent', label: 'Forecast RealTalent', value: realTalentForecast, description: 'Valor esperado usando a probabilidade RealTalent negócio a negócio.' },
    { scenario: 'best_case', label: 'Best Case', value: bestCaseForecast, description: 'Commit + oportunidades com chance real de fechar no período.' },
    { scenario: 'pipeline', label: 'Pipeline total', value: fullPipelineForecast, description: 'Todo o valor com fechamento previsto no período.' },
  ]

  return {
    targetMonth,
    monthLabel,
    goalTarget,
    closedBookings,
    recognizedRevenue: baseForecast.closedRevenue,
    scheduledRevenue,
    previousRecognizedRevenue,
    recognizedRevenueDeltaPercent,
    recognizedMrr: baseForecast.recognizedMrr,
    activeMrrForecast: baseForecast.activeMrrForecast,
    openPipeline,
    weightedOpenPipeline,
    realTalentExpectedOpenPipeline,
    sellerWeightedForecast,
    commitForecast,
    realTalentForecast,
    bestCaseForecast,
    fullPipelineForecast,
    gapToGoal,
    remainingGoal,
    pipelineCoverage,
    expectedAttainment,
    requiredWinRate,
    averageDealSize,
    averageWonTicket,
    closedWonDeals: outcomes.won,
    closedLostDeals: outcomes.lost,
    winRate: outcomes.winRate,
    dealsNeeded,
    forecastConfidenceScore,
    forecastConfidence,
    atRiskValue,
    undatedValue,
    undatedDeals: undated.length,
    suggestedCategoryChanges,
    scenarios,
    deals,
    owners: ownerForecasts(snapshot, included, closedByOwner, recognizedByOwner, reference),
    sources: sourcePerformance(snapshot, included, reference, recognizedEntries),
    products: productPerformance(snapshot, included, reference, recognizedEntries),
    unlinkedRevenue,
    risks: risks.sort((a, b) => ({ critical: 4, high: 3, medium: 2, low: 1 }[b.severity] - { critical: 4, high: 3, medium: 2, low: 1 }[a.severity])),
    generatedAt: now.toISOString(),
  }
}
