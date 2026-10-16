import type { Lead, WorkspaceSnapshot } from '../domain/types'
import type { DealActionKind } from './deal-intelligence'
import { listSalesLearningOutcomes, type SalesLearningOutcome } from './realtalent-sales-learning-engine'

export type SalesLearningEvidenceStrength = 'insufficient' | 'emerging' | 'reliable'
export type SalesLearningPatternDimension = 'action' | 'stage' | 'risk' | 'source' | 'segment' | 'temperature' | 'priority'

export interface SalesPortfolioLearningFilters {
  stageQuery?: string
  riskQuery?: string
  actionQuery?: string
  sourceQuery?: string
  segmentQuery?: string
  minSamples?: number
  limit?: number
  visibleLeadIds?: Set<string>
}

export interface SalesLearningPattern {
  dimension: SalesLearningPatternDimension
  key: string
  label: string
  samples: number
  positive: number
  negative: number
  successRate: number
  adjustedSuccessRate: number
  averageOutcomeScore: number
  averageHealthDelta: number
  averageProbabilityDelta: number
  strength: SalesLearningEvidenceStrength
}

export interface SalesActionPattern extends SalesLearningPattern {
  action: string
  contextLabel: string
}

export interface SalesPortfolioLearningAnalysis {
  samples: number
  positive: number
  negative: number
  successRate: number
  correctedIgnored: number
  minSamples: number
  actionPatterns: SalesLearningPattern[]
  stagePatterns: SalesLearningPattern[]
  riskPatterns: SalesLearningPattern[]
  sourcePatterns: SalesLearningPattern[]
  segmentPatterns: SalesLearningPattern[]
  temperaturePatterns: SalesLearningPattern[]
  priorityPatterns: SalesLearningPattern[]
  stageActionPatterns: SalesActionPattern[]
  riskActionPatterns: SalesActionPattern[]
  profileActionPatterns: SalesActionPattern[]
}

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const actionLabels: Record<string, string> = {
  call: 'Ligação',
  followup: 'Follow-up',
  meeting: 'Reunião',
  map_stakeholder: 'Mapear stakeholder/decisor',
  proposal: 'Enviar proposta',
  review_proposal: 'Revisar proposta',
  update_close_date: 'Atualizar fechamento',
  review: 'Revisar oportunidade',
}

const strengthFor = (samples: number): SalesLearningEvidenceStrength => samples >= 5 ? 'reliable' : samples >= 3 ? 'emerging' : 'insufficient'
const round = (value: number, digits = 0) => Number(value.toFixed(digits))
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
const adjustedRate = (positive: number, samples: number) => samples ? ((positive + 1.5) / (samples + 3)) * 100 : 0

const labelForDimension = (dimension: SalesLearningPatternDimension, key: string) => {
  if (dimension === 'action') return actionLabels[key] ?? key
  if (dimension === 'temperature') return ({ hot: 'Quente', warm: 'Morno', cold: 'Frio' } as Record<string, string>)[key] ?? key
  if (dimension === 'priority') return ({ urgent: 'Urgente', high: 'Alta', medium: 'Média', low: 'Baixa' } as Record<string, string>)[key] ?? key
  return key
}

const leadProfile = (lead: Lead | undefined, snapshot: WorkspaceSnapshot) => {
  const company = lead?.companyId ? snapshot.companies.find((item) => item.id === lead.companyId) : null
  return {
    source: lead?.source?.trim() || '',
    segment: company?.segment?.trim() || '',
    temperature: lead?.temperature || '',
    priority: lead?.priority || '',
  }
}

const matches = (value: string, query?: string) => !query?.trim() || normalize(value).includes(normalize(query)) || normalize(query).includes(normalize(value))

const filterOutcomes = (outcomes: SalesLearningOutcome[], snapshot: WorkspaceSnapshot, filters: SalesPortfolioLearningFilters) => {
  const leadById = new Map(snapshot.leads.map((lead) => [lead.id, lead]))
  return outcomes.filter((item) => {
    if (item.outcome !== 'positive' && item.outcome !== 'negative') return false
    if (filters.visibleLeadIds && !filters.visibleLeadIds.has(item.leadId)) return false
    if (!matches(item.stageName, filters.stageQuery)) return false
    if (!matches(item.recommendedAction, filters.actionQuery) && !matches(actionLabels[item.recommendedAction] ?? '', filters.actionQuery)) return false
    if (filters.riskQuery && !item.riskKeys.some((risk) => matches(risk, filters.riskQuery))) return false
    const profile = leadProfile(leadById.get(item.leadId), snapshot)
    if (!matches(profile.source, filters.sourceQuery)) return false
    if (!matches(profile.segment, filters.segmentQuery)) return false
    return true
  })
}

const buildPattern = (
  dimension: SalesLearningPatternDimension,
  key: string,
  rows: SalesLearningOutcome[],
  label = labelForDimension(dimension, key),
): SalesLearningPattern => {
  const positive = rows.filter((item) => item.outcome === 'positive').length
  const samples = rows.length
  return {
    dimension,
    key,
    label,
    samples,
    positive,
    negative: samples - positive,
    successRate: samples ? round((positive / samples) * 100, 1) : 0,
    adjustedSuccessRate: round(adjustedRate(positive, samples), 1),
    averageOutcomeScore: round(average(rows.map((item) => item.outcomeScore)), 1),
    averageHealthDelta: round(average(rows.map((item) => item.healthDelta)), 1),
    averageProbabilityDelta: round(average(rows.map((item) => item.probabilityDelta)), 1),
    strength: strengthFor(samples),
  }
}

const rankPatterns = <T extends SalesLearningPattern>(rows: T[], limit: number) => {
  const strengthRank: Record<SalesLearningEvidenceStrength, number> = { reliable: 3, emerging: 2, insufficient: 1 }
  return rows.sort((a, b) =>
    strengthRank[b.strength] - strengthRank[a.strength]
    || b.adjustedSuccessRate - a.adjustedSuccessRate
    || b.samples - a.samples
    || b.averageOutcomeScore - a.averageOutcomeScore,
  ).slice(0, limit)
}

const groupBy = (
  outcomes: SalesLearningOutcome[],
  dimension: SalesLearningPatternDimension,
  keys: (outcome: SalesLearningOutcome) => string[],
  limit: number,
) => {
  const grouped = new Map<string, SalesLearningOutcome[]>()
  for (const outcome of outcomes) for (const key of keys(outcome).map((item) => item.trim()).filter(Boolean)) {
    const current = grouped.get(key) ?? []
    current.push(outcome)
    grouped.set(key, current)
  }
  return rankPatterns([...grouped.entries()].map(([key, rows]) => buildPattern(dimension, key, rows)), limit)
}

const combinationPatterns = (
  outcomes: SalesLearningOutcome[],
  snapshot: WorkspaceSnapshot,
  context: 'stage' | 'risk' | 'profile',
  limit: number,
): SalesActionPattern[] => {
  const leadById = new Map(snapshot.leads.map((lead) => [lead.id, lead]))
  const grouped = new Map<string, { action: string; contextLabel: string; rows: SalesLearningOutcome[] }>()
  const push = (outcome: SalesLearningOutcome, contextLabel: string) => {
    if (!contextLabel.trim()) return
    const key = `${contextLabel}::${outcome.recommendedAction}`
    const current = grouped.get(key) ?? { action: outcome.recommendedAction, contextLabel, rows: [] }
    current.rows.push(outcome)
    grouped.set(key, current)
  }
  for (const outcome of outcomes) {
    if (context === 'stage') push(outcome, outcome.stageName)
    if (context === 'risk') for (const risk of outcome.riskKeys) push(outcome, risk)
    if (context === 'profile') {
      const profile = leadProfile(leadById.get(outcome.leadId), snapshot)
      if (profile.segment) push(outcome, `segmento ${profile.segment}`)
      else if (profile.source) push(outcome, `origem ${profile.source}`)
      else if (profile.temperature) push(outcome, `temperatura ${profile.temperature}`)
    }
  }
  return rankPatterns([...grouped.values()].map(({ action, contextLabel, rows }) => ({
    ...buildPattern('action', action, rows, actionLabels[action] ?? action),
    action,
    contextLabel,
  })), limit)
}

export const analyzeSalesPortfolioOutcomes = (
  outcomes: SalesLearningOutcome[],
  snapshot: WorkspaceSnapshot,
  filters: SalesPortfolioLearningFilters = {},
): SalesPortfolioLearningAnalysis => {
  const limit = Math.max(3, Math.min(20, filters.limit ?? 8))
  const minSamples = Math.max(2, Math.min(20, filters.minSamples ?? 3))
  const rows = filterOutcomes(outcomes, snapshot, filters)
  const leadById = new Map(snapshot.leads.map((lead) => [lead.id, lead]))
  const positive = rows.filter((item) => item.outcome === 'positive').length
  const patternsFromLead = (dimension: 'source' | 'segment' | 'temperature' | 'priority') => groupBy(rows, dimension, (outcome) => {
    const profile = leadProfile(leadById.get(outcome.leadId), snapshot)
    return profile[dimension] ? [profile[dimension]] : []
  }, limit)

  return {
    samples: rows.length,
    positive,
    negative: rows.length - positive,
    successRate: rows.length ? round((positive / rows.length) * 100, 1) : 0,
    correctedIgnored: outcomes.filter((item) => item.outcome === 'corrected').length,
    minSamples,
    actionPatterns: groupBy(rows, 'action', (item) => [item.recommendedAction], limit),
    stagePatterns: groupBy(rows, 'stage', (item) => [item.stageName], limit),
    riskPatterns: groupBy(rows, 'risk', (item) => item.riskKeys, limit),
    sourcePatterns: patternsFromLead('source'),
    segmentPatterns: patternsFromLead('segment'),
    temperaturePatterns: patternsFromLead('temperature'),
    priorityPatterns: patternsFromLead('priority'),
    stageActionPatterns: combinationPatterns(rows, snapshot, 'stage', limit * 2),
    riskActionPatterns: combinationPatterns(rows, snapshot, 'risk', limit * 2),
    profileActionPatterns: combinationPatterns(rows, snapshot, 'profile', limit * 2),
  }
}

export const analyzeSalesPortfolioLearning = (
  workspaceId: string,
  snapshot: WorkspaceSnapshot,
  filters: SalesPortfolioLearningFilters = {},
) => analyzeSalesPortfolioOutcomes(listSalesLearningOutcomes(workspaceId), snapshot, filters)

const strengthLabel: Record<SalesLearningEvidenceStrength, string> = {
  reliable: 'evidência consistente',
  emerging: 'padrão emergente',
  insufficient: 'amostra pequena',
}

const patternLine = (item: SalesLearningPattern) => `${item.label}: ${item.positive}/${item.samples} positivos (${item.successRate}%), ${strengthLabel[item.strength]}; ΔHealth médio ${item.averageHealthDelta >= 0 ? '+' : ''}${item.averageHealthDelta}; ΔProb. ${item.averageProbabilityDelta >= 0 ? '+' : ''}${item.averageProbabilityDelta} p.p.`

export const formatSalesPortfolioLearningSummary = (
  workspaceId: string,
  snapshot: WorkspaceSnapshot,
  filters: SalesPortfolioLearningFilters = {},
) => {
  const analysis = analyzeSalesPortfolioLearning(workspaceId, snapshot, filters)
  if (!analysis.samples) return 'Ainda não há resultados comerciais verificados suficientes neste escopo para formar aprendizado de carteira. A RealTalent só aprende depois de recomendação + ação executada + readback confirmado no CRM.'
  const eligibleActions = analysis.actionPatterns.filter((item) => item.samples >= analysis.minSamples)
  const eligibleStageActions = analysis.stageActionPatterns.filter((item) => item.samples >= analysis.minSamples)
  const eligibleRiskActions = analysis.riskActionPatterns.filter((item) => item.samples >= analysis.minSamples)
  const eligibleProfiles = analysis.profileActionPatterns.filter((item) => item.samples >= analysis.minSamples)
  const lines = [
    `Aprendizado comercial da carteira: ${analysis.samples} resultado(s) verificado(s), ${analysis.positive} positivo(s), ${analysis.negative} negativo(s), taxa observada ${analysis.successRate}%.`,
    analysis.samples < analysis.minSamples ? `Amostra ainda pequena: preciso de pelo menos ${analysis.minSamples} resultados comparáveis antes de tratar um padrão como utilizável.` : 'Os padrões abaixo são auxiliares; o estado atual de cada oportunidade continua tendo prioridade.',
  ]
  if (eligibleActions.length) lines.push(`Ações com melhor evidência: ${eligibleActions.slice(0, 4).map(patternLine).join(' | ')}`)
  if (eligibleStageActions.length) lines.push(`Por etapa: ${eligibleStageActions.slice(0, 4).map((item) => `${item.contextLabel} → ${patternLine(item)}`).join(' | ')}`)
  if (eligibleRiskActions.length) lines.push(`Por risco: ${eligibleRiskActions.slice(0, 4).map((item) => `${item.contextLabel} → ${patternLine(item)}`).join(' | ')}`)
  if (eligibleProfiles.length) lines.push(`Por perfil: ${eligibleProfiles.slice(0, 4).map((item) => `${item.contextLabel} → ${patternLine(item)}`).join(' | ')}`)
  if (!eligibleActions.length) lines.push(`Há ${analysis.samples} evidência(s), mas nenhuma ação atingiu ainda a amostra mínima de ${analysis.minSamples} caso(s).`)
  lines.push('Não use estes números como causalidade garantida: eles representam associação histórica verificada dentro do CRM e devem ser combinados com Deal Health, riscos e contexto atual.')
  return lines.join('\n')
}

export const formatSalesActionEffectiveness = (
  workspaceId: string,
  snapshot: WorkspaceSnapshot,
  filters: SalesPortfolioLearningFilters = {},
) => {
  const analysis = analyzeSalesPortfolioLearning(workspaceId, snapshot, filters)
  if (!analysis.samples) return 'Não há resultados verificados suficientes para comparar ações comerciais neste recorte.'
  const ranked = analysis.actionPatterns
  const qualified = ranked.filter((item) => item.samples >= analysis.minSamples)
  const chosen = qualified.length ? qualified : ranked
  const context = [filters.stageQuery && `etapa ${filters.stageQuery}`, filters.riskQuery && `risco ${filters.riskQuery}`, filters.sourceQuery && `origem ${filters.sourceQuery}`, filters.segmentQuery && `segmento ${filters.segmentQuery}`].filter(Boolean).join(', ')
  return [
    `Comparação de eficácia${context ? ` para ${context}` : ''}: ${analysis.samples} resultado(s) verificado(s).`,
    ...chosen.slice(0, 6).map((item, index) => `${index + 1}. ${patternLine(item)}`),
    qualified.length ? `Ranking prioriza ações com pelo menos ${analysis.minSamples} casos e usa taxa ajustada para reduzir o efeito de amostras pequenas.` : `Nenhuma ação atingiu ${analysis.minSamples} casos ainda; ranking provisório e não conclusivo.`,
  ].join('\n')
}
