import type { Lead, WorkspaceSnapshot } from '../domain/types'
import { safeStorage } from '../lib/storage'
import { buildDealIntelligence, type DealActionKind, type DealMomentum } from './deal-intelligence'
import type { CrmCapabilityPlanStep } from './realtalent-crm-capability-planner'
import type { CrmExecutionReceipt } from './realtalent-crm-execution-truth'

const PENDING_PREFIX = 'realtalent:sales-learning-pending:v1:'
const OUTCOME_PREFIX = 'realtalent:sales-learning-outcomes:v1:'
const MAX_PENDING = 30
const MAX_OUTCOMES = 160
const MAX_PENDING_AGE_MS = 21 * 86_400_000

export type SalesLearningOutcomeKind = 'positive' | 'negative' | 'corrected'

interface SalesLearningState {
  status: Lead['status']
  stageId: string | null
  stageName: string
  stageOrder: number | null
  healthScore: number
  healthLevel: string
  realTalentProbability: number
  momentum: DealMomentum
  momentumScore: number
  accountCoverage: number
  stakeholderCount: number
  proposalStatus: string | null
  nextStepHealthy: boolean
  riskKeys: string[]
  severeRiskKeys: string[]
}

export interface PendingSalesRecommendation {
  id: string
  workspaceId: string
  recommendationPlanId: string
  sourceCapabilityId: 'sales.analyze_deal' | 'sales.next_best_action'
  leadId: string
  prompt: string
  actionKind: DealActionKind
  actionTitle: string
  actionRoute: string
  riskKeys: string[]
  baseline: SalesLearningState
  recommendedAt: string
  actionPlanId?: string
  actionPrompt?: string
  actionCapabilityIds: string[]
  linkedAt?: string
  observedReceiptIds: string[]
}

export interface SalesLearningOutcome {
  id: string
  workspaceId: string
  recommendationId: string
  leadId: string
  recommendationCapabilityId: PendingSalesRecommendation['sourceCapabilityId']
  recommendedAction: DealActionKind
  riskKeys: string[]
  healthLevel: string
  momentum: DealMomentum
  stageName: string
  outcome: SalesLearningOutcomeKind
  outcomeScore: number
  healthDelta: number
  probabilityDelta: number
  momentumDelta: number
  stageDelta: number
  executedCapabilities: string[]
  evidence: string[]
  receiptId: string
  createdAt: string
  correction?: string
}

const pendingKey = (workspaceId: string) => `${PENDING_PREFIX}${workspaceId}`
const outcomeKey = (workspaceId: string) => `${OUTCOME_PREFIX}${workspaceId}`
const compact = (value: unknown, max = 500) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
const redact = (value: string) => compact(value, 700)
  .replace(/\bsk-[a-z0-9_-]{12,}\b/gi, '[redacted]')
  .replace(/\bBearer\s+[a-z0-9._~+\/-]{12,}\b/gi, 'Bearer [redacted]')
  .replace(/\b(senha|password|api[_ -]?key|secret|token)\s*[:=]\s*\S+/gi, '$1=[redacted]')

const readArray = <T>(key: string): T[] => {
  try {
    const parsed = JSON.parse(safeStorage.getItem(key) ?? '[]') as unknown
    return Array.isArray(parsed) ? parsed as T[] : []
  } catch { return [] }
}
const readPending = (workspaceId: string) => readArray<PendingSalesRecommendation>(pendingKey(workspaceId))
const savePending = (workspaceId: string, rows: PendingSalesRecommendation[]) => safeStorage.setItem(pendingKey(workspaceId), JSON.stringify(rows.slice(-MAX_PENDING)))
const readOutcomes = (workspaceId: string) => readArray<SalesLearningOutcome>(outcomeKey(workspaceId))
const saveOutcomes = (workspaceId: string, rows: SalesLearningOutcome[]) => safeStorage.setItem(outcomeKey(workspaceId), JSON.stringify(rows.slice(-MAX_OUTCOMES)))

const stateFor = (lead: Lead, snapshot: WorkspaceSnapshot, now = new Date()): SalesLearningState => {
  const insight = buildDealIntelligence(lead, snapshot, undefined, now)
  const severeRiskKeys = insight.risks.filter((risk) => risk.severity === 'critical' || risk.severity === 'high').map((risk) => risk.key)
  return {
    status: lead.status,
    stageId: insight.stage?.id ?? null,
    stageName: insight.stage?.name ?? '',
    stageOrder: insight.stage?.order ?? null,
    healthScore: insight.healthScore,
    healthLevel: insight.healthLevel,
    realTalentProbability: insight.realTalentProbability,
    momentum: insight.momentum,
    momentumScore: insight.momentumScore,
    accountCoverage: insight.accountCoverage,
    stakeholderCount: insight.stakeholderCount,
    proposalStatus: insight.proposal?.status ?? null,
    nextStepHealthy: !insight.risks.some((risk) => risk.key === 'no-next-step' || risk.key === 'overdue-next-step'),
    riskKeys: insight.risks.map((risk) => risk.key).slice(0, 12),
    severeRiskKeys: severeRiskKeys.slice(0, 12),
  }
}

const bestLead = (snapshot: WorkspaceSnapshot, rawQuery: string, focusLeadId?: string | null): Lead | null => {
  if (focusLeadId) {
    const focused = snapshot.leads.find((lead) => lead.id === focusLeadId)
    if (focused && !rawQuery.trim()) return focused
  }
  const q = normalize(rawQuery)
  if (!q) return focusLeadId ? snapshot.leads.find((lead) => lead.id === focusLeadId) ?? null : null
  let best: { lead: Lead; score: number } | null = null
  for (const lead of snapshot.leads) {
    const fields = [lead.id, lead.name, lead.company, lead.email, lead.phone].filter(Boolean).map((value) => normalize(String(value)))
    let score = 0
    for (const field of fields) {
      if (field === q) score = Math.max(score, 100)
      else if (field.startsWith(q) || q.startsWith(field)) score = Math.max(score, 85)
      else if (field.includes(q) || q.includes(field)) score = Math.max(score, 72)
      else {
        const tokens = q.split(' ').filter((token) => token.length >= 2)
        const matched = tokens.filter((token) => field.includes(token)).length
        score = Math.max(score, tokens.length ? Math.round(matched / tokens.length * 60) : 0)
      }
    }
    if (!best || score > best.score) best = { lead, score }
  }
  return best && best.score >= 35 ? best.lead : null
}

const arg = (step: CrmCapabilityPlanStep, name: string) => step.args.find((item) => item.name === name)?.value.trim() ?? ''
const leadFromRecommendationStep = (step: CrmCapabilityPlanStep, snapshot: WorkspaceSnapshot, focusLeadId?: string | null) => bestLead(snapshot, arg(step, 'record_query') || arg(step, 'lead_query') || arg(step, 'record_id'), focusLeadId)

const leadIdsForMutationPlan = (steps: CrmCapabilityPlanStep[], snapshot: WorkspaceSnapshot, focusLeadId?: string | null) => {
  const ids = new Set<string>()
  const addLeadQuery = (value: string) => {
    for (const query of value.split(/[;,\n]+/).map((item) => item.trim()).filter(Boolean)) {
      const lead = bestLead(snapshot, query, null)
      if (lead) ids.add(lead.id)
    }
  }
  for (const step of steps) {
    if (step.risk === 'read') continue
    for (const key of ['record_id','record_query','lead_query','primary_query','duplicate_query','record_queries']) {
      const value = arg(step, key)
      if (value) addLeadQuery(value)
    }
    const proposalQuery = arg(step, 'proposal_query')
    if (proposalQuery) {
      const q = normalize(proposalQuery)
      const proposal = snapshot.proposals.find((item) => [item.id, item.title, item.proposalNumber].some((value) => normalize(String(value ?? '')).includes(q)))
      if (proposal) ids.add(proposal.leadId)
    }
    const contactQuery = arg(step, 'contact_query')
    if (contactQuery) {
      const q = normalize(contactQuery)
      const contact = snapshot.contacts.find((item) => [item.id, item.name, item.email, item.phone].some((value) => normalize(String(value ?? '')).includes(q)))
      for (const leadId of contact?.leadIds ?? []) ids.add(leadId)
    }
  }
  if (!ids.size && focusLeadId && snapshot.leads.some((lead) => lead.id === focusLeadId)) ids.add(focusLeadId)
  return ids
}

const recommendationSteps = (steps: CrmCapabilityPlanStep[]) => steps.filter((step): step is CrmCapabilityPlanStep & { capabilityId: PendingSalesRecommendation['sourceCapabilityId'] } => step.capabilityId === 'sales.analyze_deal' || step.capabilityId === 'sales.next_best_action')

export const stageSalesRecommendationsFromPlan = (
  workspaceId: string,
  prompt: string,
  plan: { id: string; steps: CrmCapabilityPlanStep[] },
  snapshot: WorkspaceSnapshot,
  focusLeadId?: string | null,
) => {
  if (!workspaceId || !plan.id) return 0
  let rows = readPending(workspaceId).filter((item) => Date.now() - new Date(item.recommendedAt).getTime() <= MAX_PENDING_AGE_MS)
  let created = 0
  for (const step of recommendationSteps(plan.steps)) {
    const lead = leadFromRecommendationStep(step, snapshot, focusLeadId)
    if (!lead) continue
    const insight = buildDealIntelligence(lead, snapshot)
    rows = rows.filter((item) => item.recommendationPlanId !== plan.id && !(item.leadId === lead.id && !item.actionPlanId))
    rows.push({
      id: `sales-rec:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      workspaceId,
      recommendationPlanId: plan.id,
      sourceCapabilityId: step.capabilityId,
      leadId: lead.id,
      prompt: redact(prompt),
      actionKind: insight.nextBestAction.kind,
      actionTitle: compact(insight.nextBestAction.title, 160),
      actionRoute: insight.nextBestAction.route,
      riskKeys: insight.risks.map((risk) => risk.key).slice(0, 12),
      baseline: stateFor(lead, snapshot),
      recommendedAt: new Date().toISOString(),
      actionCapabilityIds: [],
      observedReceiptIds: [],
    })
    created += 1
  }
  savePending(workspaceId, rows)
  return created
}

export const linkSalesRecommendationToActionPlan = (
  workspaceId: string,
  prompt: string,
  plan: { id: string; steps: CrmCapabilityPlanStep[] },
  snapshot: WorkspaceSnapshot,
  focusLeadId?: string | null,
) => {
  const writeSteps = plan.steps.filter((step) => step.risk !== 'read')
  if (!workspaceId || !plan.id || !writeSteps.length) return null
  const rows = readPending(workspaceId).filter((item) => Date.now() - new Date(item.recommendedAt).getTime() <= MAX_PENDING_AGE_MS)
  if (!rows.length) return null
  const leadIds = leadIdsForMutationPlan(writeSteps, snapshot, focusLeadId)
  const anaphoric = /\b(faca isso|faz isso|pode fazer|execute|executa|crie isso|crie essa|agende isso|agende essa|sim|pode)\b/.test(normalize(prompt))
  const candidates = rows.filter((item) => leadIds.has(item.leadId))
  const chosen = [...(candidates.length ? candidates : (leadIds.size === 0 && anaphoric && rows.length === 1 ? rows : []))]
    .sort((a, b) => b.recommendedAt.localeCompare(a.recommendedAt))[0]
  if (!chosen) return null
  const index = rows.findIndex((item) => item.id === chosen.id)
  rows[index] = {
    ...chosen,
    actionPlanId: plan.id,
    actionPrompt: redact(prompt),
    actionCapabilityIds: [...new Set(writeSteps.map((step) => step.capabilityId))],
    linkedAt: new Date().toISOString(),
  }
  savePending(workspaceId, rows)
  return rows[index]
}

const momentumRank: Record<DealMomentum, number> = { cooling: 0, stable: 1, accelerating: 2 }
const proposalRank: Record<string, number> = { draft: 1, sent: 2, viewed: 3, accepted: 4, rejected: 0, expired: 0, cancelled: 0 }

const evaluateOutcome = (baseline: SalesLearningState, current: SalesLearningState) => {
  let score = 0
  const evidence: string[] = []
  const healthDelta = current.healthScore - baseline.healthScore
  const probabilityDelta = current.realTalentProbability - baseline.realTalentProbability
  const momentumDelta = momentumRank[current.momentum] - momentumRank[baseline.momentum]
  const stageDelta = current.stageOrder !== null && baseline.stageOrder !== null ? current.stageOrder - baseline.stageOrder : 0

  if (current.status === 'won' && baseline.status !== 'won') { score += 100; evidence.push('oportunidade marcada como ganha') }
  if (current.status === 'lost' && baseline.status !== 'lost') { score -= 100; evidence.push('oportunidade marcada como perdida') }
  if (stageDelta > 0) { score += 35; evidence.push('oportunidade avançou de etapa') }
  else if (stageDelta < 0) { score -= 25; evidence.push('oportunidade regrediu de etapa') }
  if (healthDelta >= 8) { score += 22; evidence.push(`Deal Health melhorou ${healthDelta} ponto(s)`) }
  else if (healthDelta <= -8) { score -= 22; evidence.push(`Deal Health caiu ${Math.abs(healthDelta)} ponto(s)`) }
  if (probabilityDelta >= 8) { score += 20; evidence.push(`probabilidade RealTalent subiu ${probabilityDelta} p.p.`) }
  else if (probabilityDelta <= -8) { score -= 20; evidence.push(`probabilidade RealTalent caiu ${Math.abs(probabilityDelta)} p.p.`) }
  if (momentumDelta > 0) { score += 14; evidence.push('momentum comercial melhorou') }
  else if (momentumDelta < 0) { score -= 14; evidence.push('momentum comercial piorou') }

  const currentSevere = new Set(current.severeRiskKeys)
  const baselineSevere = new Set(baseline.severeRiskKeys)
  const removedSevere = baseline.severeRiskKeys.filter((key) => !currentSevere.has(key)).length
  const addedSevere = current.severeRiskKeys.filter((key) => !baselineSevere.has(key)).length
  if (removedSevere) { score += Math.min(24, removedSevere * 8); evidence.push(`${removedSevere} risco(s) alto/crítico removido(s)`) }
  if (addedSevere) { score -= Math.min(24, addedSevere * 8); evidence.push(`${addedSevere} novo(s) risco(s) alto/crítico`) }

  if (!baseline.nextStepHealthy && current.nextStepHealthy) { score += 14; evidence.push('próximo passo comercial passou a estar saudável') }
  if (current.accountCoverage - baseline.accountCoverage >= 10) { score += 12; evidence.push('cobertura de stakeholders melhorou') }
  if (current.stakeholderCount > baseline.stakeholderCount) { score += 8; evidence.push('novo stakeholder foi mapeado') }
  const proposalDelta = (proposalRank[current.proposalStatus ?? ''] ?? 0) - (proposalRank[baseline.proposalStatus ?? ''] ?? 0)
  if (proposalDelta > 0) { score += 16; evidence.push('proposta avançou de estado') }
  else if (proposalDelta < 0) { score -= 16; evidence.push('proposta regrediu ou encerrou negativamente') }

  const outcome: 'positive' | 'negative' | 'neutral' = current.status === 'lost' || score <= -25 ? 'negative' : score >= 20 ? 'positive' : 'neutral'
  return { outcome, score, evidence, healthDelta, probabilityDelta, momentumDelta, stageDelta }
}

export const syncSalesLearningFromReceipt = (workspaceId: string, receipt: CrmExecutionReceipt | null | undefined, snapshot: WorkspaceSnapshot) => {
  if (!workspaceId || !receipt || receipt.workspaceId !== workspaceId || receipt.status !== 'verified') return 0
  const verifiedWrites = receipt.steps.filter((step) => step.risk !== 'read' && step.status === 'verified')
  if (!verifiedWrites.length) return 0
  let pending = readPending(workspaceId).filter((item) => Date.now() - new Date(item.recommendedAt).getTime() <= MAX_PENDING_AGE_MS)
  const outcomes = readOutcomes(workspaceId)
  let learned = 0
  for (let index = 0; index < pending.length; index += 1) {
    const recommendation = pending[index]
    if (recommendation.actionPlanId !== receipt.planId || recommendation.observedReceiptIds.includes(receipt.id)) continue
    const lead = snapshot.leads.find((item) => item.id === recommendation.leadId)
    if (!lead) continue
    const evaluation = evaluateOutcome(recommendation.baseline, stateFor(lead, snapshot))
    if (evaluation.outcome === 'neutral') {
      pending[index] = { ...recommendation, observedReceiptIds: [...recommendation.observedReceiptIds, receipt.id].slice(-8) }
      continue
    }
    if (!outcomes.some((item) => item.recommendationId === recommendation.id && item.receiptId === receipt.id)) {
      outcomes.push({
        id: `sales-outcome:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        workspaceId,
        recommendationId: recommendation.id,
        leadId: recommendation.leadId,
        recommendationCapabilityId: recommendation.sourceCapabilityId,
        recommendedAction: recommendation.actionKind,
        riskKeys: recommendation.riskKeys,
        healthLevel: recommendation.baseline.healthLevel,
        momentum: recommendation.baseline.momentum,
        stageName: recommendation.baseline.stageName,
        outcome: evaluation.outcome,
        outcomeScore: evaluation.score,
        healthDelta: evaluation.healthDelta,
        probabilityDelta: evaluation.probabilityDelta,
        momentumDelta: evaluation.momentumDelta,
        stageDelta: evaluation.stageDelta,
        executedCapabilities: [...new Set(verifiedWrites.map((step) => step.capabilityId))],
        evidence: evaluation.evidence.slice(0, 8),
        receiptId: receipt.id,
        createdAt: new Date().toISOString(),
      })
      learned += 1
    }
    pending[index] = { ...recommendation, observedReceiptIds: [...recommendation.observedReceiptIds, receipt.id].slice(-8) }
  }
  const finalized = new Set(outcomes.filter((item) => item.outcome === 'positive' || item.outcome === 'negative').map((item) => item.recommendationId))
  pending = pending.filter((item) => !finalized.has(item.id))
  savePending(workspaceId, pending)
  saveOutcomes(workspaceId, outcomes)
  return learned
}

const overlap = (left: string[], right: string[]) => {
  const a = new Set(left); const b = new Set(right)
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const item of a) if (b.has(item)) shared += 1
  return shared / new Set([...a, ...b]).size
}

const relevantOutcomes = (workspaceId: string, lead: Lead, snapshot: WorkspaceSnapshot) => {
  const insight = buildDealIntelligence(lead, snapshot)
  const risks = insight.risks.map((risk) => risk.key)
  return readOutcomes(workspaceId)
    .filter((item) => item.outcome !== 'corrected')
    .map((item) => {
      const actionMatch = item.recommendedAction === insight.nextBestAction.kind ? 0.38 : 0
      const riskMatch = overlap(item.riskKeys, risks) * 0.38
      const healthMatch = item.healthLevel === insight.healthLevel ? 0.10 : 0
      const momentumMatch = item.momentum === insight.momentum ? 0.08 : 0
      const stageMatch = normalize(item.stageName) === normalize(insight.stage?.name ?? '') ? 0.06 : 0
      return { ...item, relevance: actionMatch + riskMatch + healthMatch + momentumMatch + stageMatch }
    })
    .filter((item) => item.relevance >= 0.35)
    .sort((a, b) => b.relevance - a.relevance || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12)
}

export const formatSalesLearningContextForLead = (workspaceId: string, lead: Lead, snapshot: WorkspaceSnapshot) => {
  const insight = buildDealIntelligence(lead, snapshot)
  const ranked = relevantOutcomes(workspaceId, lead, snapshot)
  if (!ranked.length) return ''
  const positives = ranked.filter((item) => item.outcome === 'positive')
  const negatives = ranked.filter((item) => item.outcome === 'negative')
  const weightedPositive = positives.reduce((sum, item) => sum + item.relevance, 0)
  const weightedNegative = negatives.reduce((sum, item) => sum + item.relevance, 0)
  const totalWeight = weightedPositive + weightedNegative
  const confidence = totalWeight ? weightedPositive / totalWeight : 0
  const lines = [
    'APRENDIZADO COMERCIAL REALTALENT — evidência histórica auxiliar; sinais atuais do negócio continuam tendo prioridade.',
    `[RT_SALES_LEARNING action=${insight.nextBestAction.kind} positive=${positives.length} negative=${negatives.length} confidence=${confidence.toFixed(3)}]`,
  ]
  if (positives.length) {
    const evidence = [...new Set(positives.flatMap((item) => item.evidence))].slice(0, 4).join('; ')
    lines.push(`PADRÃO POSITIVO: em ${positives.length} contexto(s) semelhante(s), a recomendação ${insight.nextBestAction.kind} foi seguida por avanço verificado no CRM${evidence ? ` (${evidence})` : ''}.`)
  }
  if (negatives.length) lines.push(`CAUTELA: ${negatives.length} contexto(s) semelhante(s) terminou(aram) com deterioração verificada; trate a recomendação como hipótese e priorize os riscos atuais.`)
  lines.push('Nunca reutilize nomes, valores, datas ou identificadores dos casos históricos; use somente o padrão comercial agregado.')
  return lines.join('\n').slice(0, 1800)
}

export const formatSalesLearningContextForPrompt = (workspaceId: string, prompt: string, snapshot: WorkspaceSnapshot, focusLeadId?: string | null) => {
  const focused = focusLeadId ? snapshot.leads.find((lead) => lead.id === focusLeadId) ?? null : null
  const lead = focused ?? bestLead(snapshot, prompt, null)
  return lead ? formatSalesLearningContextForLead(workspaceId, lead, snapshot) : ''
}

export const recordSalesLearningCorrection = (workspaceId: string, correctionText: string) => {
  const pending = readPending(workspaceId)
  const latestPending = [...pending].sort((a, b) => b.recommendedAt.localeCompare(a.recommendedAt))[0]
  if (latestPending) savePending(workspaceId, pending.filter((item) => item.id !== latestPending.id))
  const outcomes = readOutcomes(workspaceId)
  const latestPositive = [...outcomes].filter((item) => item.outcome === 'positive').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  if (latestPositive) {
    const index = outcomes.findIndex((item) => item.id === latestPositive.id)
    outcomes[index] = { ...latestPositive, outcome: 'corrected', correction: redact(correctionText) }
    saveOutcomes(workspaceId, outcomes)
  }
  return Boolean(latestPending || latestPositive)
}

export const listPendingSalesRecommendations = (workspaceId: string) => readPending(workspaceId)
export const listSalesLearningOutcomes = (workspaceId: string) => readOutcomes(workspaceId)
export const salesLearningStats = (workspaceId: string) => {
  const outcomes = readOutcomes(workspaceId)
  return {
    pending: readPending(workspaceId).length,
    total: outcomes.length,
    positive: outcomes.filter((item) => item.outcome === 'positive').length,
    negative: outcomes.filter((item) => item.outcome === 'negative').length,
    corrected: outcomes.filter((item) => item.outcome === 'corrected').length,
  }
}
export const clearSalesLearning = (workspaceId: string) => {
  safeStorage.removeItem(pendingKey(workspaceId))
  safeStorage.removeItem(outcomeKey(workspaceId))
}
