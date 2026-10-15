import type {
  ActivityItem,
  CalendarEvent,
  CallRecord,
  ContactRecord,
  Lead,
  OpportunityRecord,
  PipelineStage,
  ProposalRecord,
  WorkspaceSnapshot,
} from '../domain/types'
import { buildAccountIntelligence } from './account-intelligence'
import { readFollowupMetadata } from './followup-workspace'

const DAY = 86_400_000

export type DealHealthLevel = 'strong' | 'healthy' | 'attention' | 'critical'
export type DealMomentum = 'accelerating' | 'stable' | 'cooling'
export type DealRiskSeverity = 'critical' | 'high' | 'medium' | 'low'
export type DealActionKind = 'call' | 'followup' | 'meeting' | 'map_stakeholder' | 'proposal' | 'review_proposal' | 'update_close_date' | 'review'
export type DealComponentKey = 'activity' | 'stakeholders' | 'proposal' | 'nextStep' | 'timing' | 'engagement'

export interface DealIntelligenceWeights {
  activity: number
  stakeholders: number
  proposal: number
  nextStep: number
  timing: number
  engagement: number
}

export interface DealIntelligenceConfig {
  enabled: boolean
  weights: DealIntelligenceWeights
  staleDays: number
  proposalFollowupDays: number
  closingSoonDays: number
  highValueThreshold: number
  singleThreadThreshold: number
}

export const DEFAULT_DEAL_INTELLIGENCE_CONFIG: DealIntelligenceConfig = {
  enabled: true,
  weights: { activity: 20, stakeholders: 20, proposal: 15, nextStep: 20, timing: 10, engagement: 15 },
  staleDays: 7,
  proposalFollowupDays: 2,
  closingSoonDays: 7,
  highValueThreshold: 5_000,
  singleThreadThreshold: 5_000,
}

export interface DealHealthComponent {
  key: DealComponentKey
  label: string
  score: number
  weight: number
  contribution: number
  reasons: string[]
}

export interface DealRisk {
  key: string
  severity: DealRiskSeverity
  title: string
  detail: string
  impact: number
  suggestedAction: string
  source: 'activity' | 'stakeholder' | 'proposal' | 'timing' | 'pipeline' | 'engagement'
}

export interface DealPositiveSignal {
  key: string
  label: string
  detail: string
  impact: number
}

export interface DealNextBestAction {
  kind: DealActionKind
  title: string
  explanation: string
  objective: string
  route: 'leads' | 'pipeline' | 'proposals' | 'agenda' | 'calls'
  urgency: 'now' | 'today' | 'planned'
}

export interface DealIntelligence {
  lead: Lead
  opportunity: OpportunityRecord | null
  stage: PipelineStage | null
  proposal: ProposalRecord | null
  healthScore: number
  healthLevel: DealHealthLevel
  healthLabel: string
  sellerProbability: number
  realTalentProbability: number
  probabilityGap: number
  momentum: DealMomentum
  momentumScore: number
  accountCoverage: number
  relationshipScore: number
  components: DealHealthComponent[]
  risks: DealRisk[]
  positiveSignals: DealPositiveSignal[]
  nextBestAction: DealNextBestAction
  lastInteractionAt: string | null
  inactivityDays: number | null
  commercialValue: number
  expectedCloseAt: string | null
  stakeholderCount: number
  generatedAt: string
}

export interface DealPortfolio {
  deals: DealIntelligence[]
  priorities: DealIntelligence[]
  averageHealth: number
  activeValue: number
  predictedValue: number
  strong: number
  healthy: number
  attention: number
  critical: number
  atRiskValue: number
  criticalValue: number
  missingDecisionMaker: number
  proposalRisks: number
  noNextStep: number
  cooling: number
}

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(value)))
const validTime = (value: string | null | undefined) => {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}
const daysSince = (value: string | null | undefined, now: Date) => {
  const time = validTime(value)
  return time === null ? null : Math.max(0, Math.floor((now.getTime() - time) / DAY))
}
const daysUntil = (value: string | null | undefined, now: Date) => {
  const time = validTime(value)
  return time === null ? null : Math.ceil((time - now.getTime()) / DAY)
}
const latest = (values: Array<string | null | undefined>) => values
  .filter((value): value is string => Boolean(value) && validTime(value) !== null)
  .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null

const callsForLead = (snapshot: WorkspaceSnapshot, leadId: string) => snapshot.calls.filter((item) => item.leadId === leadId)
const activitiesForLead = (snapshot: WorkspaceSnapshot, leadId: string) => snapshot.activities.filter((item) => item.leadId === leadId)
const eventsForLead = (snapshot: WorkspaceSnapshot, leadId: string) => snapshot.events.filter((item) => item.leadId === leadId)

const interactionDate = (activity: ActivityItem) => activity.completedAt ?? activity.dueAt ?? activity.createdAt
const eventInteractionDate = (event: CalendarEvent) => event.status === 'completed' ? event.endsAt : event.startsAt
const callInteractionDate = (call: CallRecord) => call.endedAt ?? call.startedAt ?? call.createdAt

const interactionTimes = (snapshot: WorkspaceSnapshot, leadId: string) => [
  ...callsForLead(snapshot, leadId).map(callInteractionDate),
  ...activitiesForLead(snapshot, leadId).filter((item) => Boolean(item.completedAt)).map(interactionDate),
  ...eventsForLead(snapshot, leadId).filter((item) => item.status === 'completed').map(eventInteractionDate),
]

const positiveOutcomes = new Set(['answered', 'callback_requested', 'interested', 'meeting_scheduled', 'proposal_requested', 'proposal_sent', 'sale_completed'])
const strongOutcomes = new Set(['interested', 'meeting_scheduled', 'proposal_requested', 'proposal_sent', 'sale_completed'])
const negativeOutcomes = new Set(['not_interested', 'wrong_person', 'invalid_number'])

const stageLooksLate = (stage: PipelineStage | null) => /proposta|negocia|decis|fech/i.test(stage?.name ?? '')
const stageLooksProposal = (stage: PipelineStage | null) => /proposta|orçamento/i.test(stage?.name ?? '')

const activeProposalForLead = (snapshot: WorkspaceSnapshot, leadId: string) => {
  const proposals = snapshot.proposals
    .filter((item) => item.leadId === leadId && item.isCurrentVersion && !['rejected', 'cancelled'].includes(item.status))
    .sort((a, b) => Number(b.isOfficial) - Number(a.isOfficial) || b.version - a.version || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  return proposals[0] ?? null
}

const contactsForLead = (snapshot: WorkspaceSnapshot, lead: Lead): ContactRecord[] => {
  const direct = snapshot.contacts.filter((contact) => contact.leadIds.includes(lead.id))
  const byCompany = lead.companyId ? snapshot.contacts.filter((contact) => contact.companyId === lead.companyId) : []
  return Array.from(new Map([...direct, ...byCompany].map((contact) => [contact.id, contact])).values())
}

const hasRole = (contacts: ContactRecord[], roles: ContactRecord['decisionRole'][]) => contacts.some((contact) => roles.includes(contact.decisionRole) && !contact.doNotContact)

const commercialOpportunity = (snapshot: WorkspaceSnapshot, lead: Lead) => snapshot.opportunities.find((item) => item.leadId === lead.id) ?? null

const commercialValueFor = (lead: Lead, opportunity: OpportunityRecord | null, proposal: ProposalRecord | null) => Math.max(0, proposal?.totalContractValue ?? opportunity?.value ?? lead.value ?? 0)
const sellerProbabilityFor = (stage: PipelineStage | null, opportunity: OpportunityRecord | null) => clamp(opportunity?.probability ?? stage?.probability ?? 0)
const expectedCloseFor = (lead: Lead, opportunity: OpportunityRecord | null, proposal: ProposalRecord | null) => opportunity?.expectedCloseAt ?? proposal?.expectedCloseAt ?? lead.expectedCloseAt ?? null

const activityComponent = (snapshot: WorkspaceSnapshot, lead: Lead, now: Date, config: DealIntelligenceConfig): Omit<DealHealthComponent, 'weight' | 'contribution'> => {
  const dates = interactionTimes(snapshot, lead.id)
  const lastInteractionAt = latest(dates)
  const idle = daysSince(lastInteractionAt, now)
  const recentCut = now.getTime() - 14 * DAY
  const recent = dates.filter((value) => new Date(value).getTime() >= recentCut).length
  let score = 45
  const reasons: string[] = []
  if (idle === null) { score = 20; reasons.push('Nenhuma interação concluída registrada.') }
  else if (idle <= 1) { score = 100; reasons.push('Interação registrada nas últimas 24 horas.') }
  else if (idle <= 3) { score = 88; reasons.push(`Última interação há ${idle} dias.`) }
  else if (idle <= config.staleDays) { score = 68; reasons.push(`Última interação há ${idle} dias.`) }
  else if (idle <= config.staleDays * 2) { score = 35; reasons.push(`Negócio sem interação há ${idle} dias.`) }
  else { score = 10; reasons.push(`Negócio parado há ${idle} dias.`) }
  if (recent >= 3) { score += 8; reasons.push(`${recent} interações concluídas nos últimos 14 dias.`) }
  return { key: 'activity', label: 'Atividade', score: clamp(score), reasons }
}

const stakeholderComponent = (snapshot: WorkspaceSnapshot, lead: Lead, contacts: ContactRecord[], now: Date): Omit<DealHealthComponent, 'weight' | 'contribution'> & { coverage: number; relationship: number } => {
  const relationships = lead.companyId ? snapshot.contactRelationships.filter((item) => item.companyId === lead.companyId) : []
  const account = buildAccountIntelligence(lead, contacts, relationships, snapshot)
  const reasons = [...account.strengths.slice(0, 2), ...account.warnings.slice(0, 2)]
  const recentContactBonus = contacts.some((contact) => {
    const idle = daysSince(contact.lastContactAt, now)
    return idle !== null && idle <= 14
  }) ? 5 : 0
  return {
    key: 'stakeholders',
    label: 'Stakeholders',
    score: clamp(account.coverageScore * 0.68 + account.relationshipScore * 0.32 + recentContactBonus),
    reasons: reasons.length ? reasons : ['Buying committee ainda não possui cobertura suficiente.'],
    coverage: account.coverageScore,
    relationship: account.relationshipScore,
  }
}

const proposalComponent = (lead: Lead, stage: PipelineStage | null, proposal: ProposalRecord | null, now: Date, config: DealIntelligenceConfig): Omit<DealHealthComponent, 'weight' | 'contribution'> => {
  const reasons: string[] = []
  if (!proposal) {
    if (stageLooksProposal(stage)) return { key: 'proposal', label: 'Proposta', score: 18, reasons: ['Etapa de proposta sem proposta atual vinculada.'] }
    return { key: 'proposal', label: 'Proposta', score: 58, reasons: ['Ainda não é necessária uma proposta nesta etapa.'] }
  }
  const base: Record<ProposalRecord['status'], number> = { draft: 48, sent: 66, viewed: 82, accepted: 100, rejected: 5, expired: 12, cancelled: 5 }
  let score = base[proposal.status]
  if (proposal.status === 'viewed' && proposal.viewedAt) {
    const viewedDays = daysSince(proposal.viewedAt, now) ?? 0
    if (viewedDays >= config.proposalFollowupDays) { score -= Math.min(32, 8 + viewedDays * 4); reasons.push(`Proposta visualizada há ${viewedDays} dias sem avanço registrado.`) }
    else reasons.push('Proposta visualizada recentemente.')
  } else if (proposal.status === 'sent') reasons.push('Proposta enviada aguardando visualização/resposta.')
  else if (proposal.status === 'draft') reasons.push('Proposta ainda está em rascunho.')
  else if (proposal.status === 'accepted') reasons.push('Proposta aceita.')
  else if (proposal.status === 'expired') reasons.push('Proposta expirada.')
  const validDays = daysUntil(proposal.validUntil, now)
  if (validDays !== null && validDays >= 0 && validDays <= 3 && !['accepted', 'rejected', 'cancelled'].includes(proposal.status)) { score -= 12; reasons.push(`Validade termina em ${validDays} dia(s).`) }
  if (proposal.isOfficial) { score += 4; reasons.push('Versão oficial definida.') }
  return { key: 'proposal', label: 'Proposta', score: clamp(score), reasons }
}

const nextStepComponent = (snapshot: WorkspaceSnapshot, lead: Lead, now: Date): Omit<DealHealthComponent, 'weight' | 'contribution'> => {
  const pendingActivities = activitiesForLead(snapshot, lead.id).filter((item) => {
    if (item.completedAt || ['cancelled', 'superseded'].includes(item.resolutionStatus ?? '') || !item.dueAt) return false
    const meta = readFollowupMetadata(item)
    if (meta?.kind !== 'cadence-step' || meta.cadenceState !== 'paused') return true
    return Boolean(meta.resumeAt && new Date(meta.resumeAt).getTime() <= now.getTime())
  })
  const futureEvents = eventsForLead(snapshot, lead.id).filter((item) => item.status !== 'cancelled' && new Date(item.startsAt).getTime() >= now.getTime())
  const candidates = [lead.nextActionAt, ...pendingActivities.map((item) => item.dueAt), ...futureEvents.map((item) => item.startsAt)].filter((value): value is string => Boolean(value))
  if (!candidates.length) return { key: 'nextStep', label: 'Próximo passo', score: 18, reasons: ['Nenhuma próxima ação com data está registrada.'] }
  const next = [...candidates].sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0]
  const deltaDays = daysUntil(next, now)
  const nextTime = validTime(next)
  if (deltaDays === null || nextTime === null) return { key: 'nextStep', label: 'Próximo passo', score: 30, reasons: ['Próxima ação com data inválida.'] }
  if (nextTime < now.getTime()) { const overdueDays = Math.max(1, Math.ceil((now.getTime() - nextTime) / DAY)); return { key: 'nextStep', label: 'Próximo passo', score: 0, reasons: [`Próxima ação vencida há ${overdueDays} dia(s).`] } }
  if (deltaDays <= 2) return { key: 'nextStep', label: 'Próximo passo', score: 100, reasons: [`Próxima ação confirmada em até ${Math.max(0, deltaDays)} dia(s).`] }
  if (deltaDays <= 7) return { key: 'nextStep', label: 'Próximo passo', score: 88, reasons: [`Próxima ação prevista em ${deltaDays} dias.`] }
  if (deltaDays <= 14) return { key: 'nextStep', label: 'Próximo passo', score: 70, reasons: [`Próxima ação prevista em ${deltaDays} dias.`] }
  return { key: 'nextStep', label: 'Próximo passo', score: 52, reasons: [`Próxima ação distante: ${deltaDays} dias.`] }
}

const timingComponent = (lead: Lead, stage: PipelineStage | null, expectedCloseAt: string | null, now: Date, config: DealIntelligenceConfig): Omit<DealHealthComponent, 'weight' | 'contribution'> => {
  const closeDays = daysUntil(expectedCloseAt, now)
  const updatedDays = daysSince(lead.updatedAt, now) ?? 0
  const reasons: string[] = []
  let score = 72
  if (closeDays === null) { score = stageLooksLate(stage) ? 36 : 62; reasons.push('Previsão de fechamento ainda não definida.') }
  else if (closeDays < 0) { score = 0; reasons.push(`Previsão de fechamento vencida há ${Math.abs(closeDays)} dia(s).`) }
  else if (closeDays <= config.closingSoonDays) { score = 78; reasons.push(`Fechamento previsto em ${closeDays} dia(s).`) }
  else if (closeDays <= 30) { score = 94; reasons.push(`Fechamento previsto para os próximos ${closeDays} dias.`) }
  else if (closeDays <= 90) { score = 82; reasons.push(`Fechamento previsto em ${closeDays} dias.`) }
  else { score = 65; reasons.push('Fechamento projetado para horizonte longo.') }
  if (updatedDays > config.staleDays * 2) { score -= 18; reasons.push('Oportunidade está há muito tempo sem atualização.') }
  return { key: 'timing', label: 'Timing', score: clamp(score), reasons }
}

const engagementComponent = (snapshot: WorkspaceSnapshot, lead: Lead, proposal: ProposalRecord | null, now: Date): Omit<DealHealthComponent, 'weight' | 'contribution'> => {
  const calls = callsForLead(snapshot, lead.id)
  const last30 = now.getTime() - 30 * DAY
  const recentCalls = calls.filter((item) => new Date(item.startedAt).getTime() >= last30)
  const positive = recentCalls.filter((item) => positiveOutcomes.has(item.outcome)).length
  const strong = recentCalls.filter((item) => strongOutcomes.has(item.outcome)).length
  const negative = recentCalls.filter((item) => negativeOutcomes.has(item.outcome)).length
  const completedMeetings = eventsForLead(snapshot, lead.id).filter((item) => item.status === 'completed' && /reuni|demo|diagn/i.test(item.title)).length
  const futureMeetings = eventsForLead(snapshot, lead.id).filter((item) => item.status === 'confirmed' && new Date(item.startsAt).getTime() >= now.getTime()).length
  let score = 45 + Math.min(24, positive * 6) + Math.min(18, strong * 6) + Math.min(12, completedMeetings * 4) + Math.min(10, futureMeetings * 5) - Math.min(35, negative * 12)
  const reasons: string[] = []
  if (strong) reasons.push(`${strong} sinal(is) forte(s) de interesse em ligações recentes.`)
  else if (positive) reasons.push(`${positive} contato(s) positivo(s) nos últimos 30 dias.`)
  if (futureMeetings) reasons.push(`${futureMeetings} reunião(ões) futura(s) confirmada(s).`)
  if (proposal?.viewedAt) { score += 8; reasons.push('Proposta foi visualizada.') }
  const buyerRoom = (snapshot.buyerRooms ?? []).find((room) => room.leadId === lead.id && room.status !== 'archived')
  if (buyerRoom?.viewCount) { score += 8; reasons.push(`Buyer Room aberta ${buyerRoom.viewCount} vez(es) pelo comprador.`) }
  if (buyerRoom?.steps.length) {
    const progress = Math.round(buyerRoom.steps.filter((step) => step.status === 'completed').length / buyerRoom.steps.length * 100)
    if (progress >= 75) { score += 10; reasons.push(`Plano compartilhado está ${progress}% concluído.`) }
    else if (progress >= 40) { score += 5; reasons.push(`Plano compartilhado avançou para ${progress}%.`) }
  }
  if (negative) reasons.push(`${negative} sinal(is) negativo(s) recente(s).`)
  if (!reasons.length) reasons.push('Poucos sinais de engajamento registrados.')
  return { key: 'engagement', label: 'Engajamento', score: clamp(score), reasons }
}

const weightedComponents = (raw: Array<Omit<DealHealthComponent, 'weight' | 'contribution'>>, weights: DealIntelligenceWeights) => {
  const weightByKey = weights as Record<DealComponentKey, number>
  const totalWeight = Math.max(1, raw.reduce((sum, item) => sum + Math.max(0, Number(weightByKey[item.key] ?? 0)), 0))
  return raw.map((item): DealHealthComponent => {
    const weight = Math.max(0, Number(weightByKey[item.key] ?? 0))
    return { ...item, weight, contribution: Math.round(item.score * weight / totalWeight) }
  })
}

const healthLevelFor = (score: number): DealHealthLevel => score >= 82 ? 'strong' : score >= 68 ? 'healthy' : score >= 48 ? 'attention' : 'critical'
const healthLabelFor = (level: DealHealthLevel) => level === 'strong' ? 'Forte' : level === 'healthy' ? 'Saudável' : level === 'attention' ? 'Atenção' : 'Crítico'

const buildMomentum = (snapshot: WorkspaceSnapshot, lead: Lead, proposal: ProposalRecord | null, now: Date, inactivityDays: number | null): { momentum: DealMomentum; score: number } => {
  const nowTime = now.getTime()
  const recentStart = nowTime - 7 * DAY
  const previousStart = nowTime - 14 * DAY
  const dates = interactionTimes(snapshot, lead.id).map((value) => new Date(value).getTime()).filter(Number.isFinite)
  const recent = dates.filter((time) => time >= recentStart).length
  const previous = dates.filter((time) => time >= previousStart && time < recentStart).length
  const recentStrong = callsForLead(snapshot, lead.id).filter((item) => new Date(item.startedAt).getTime() >= recentStart && strongOutcomes.has(item.outcome)).length
  const upcomingMeetings = eventsForLead(snapshot, lead.id).filter((item) => item.status === 'confirmed' && new Date(item.startsAt).getTime() >= nowTime && new Date(item.startsAt).getTime() <= nowTime + 14 * DAY).length
  const recentProposalSignal = Boolean(proposal && [proposal.sentAt, proposal.viewedAt, proposal.acceptedAt].some((value) => {
    const time = validTime(value)
    return time !== null && time >= recentStart
  }))
  let score = 50 + (recent - previous) * 9 + recentStrong * 7 + upcomingMeetings * 8 + (recentProposalSignal ? 10 : 0)
  if (inactivityDays !== null && inactivityDays >= 7) score -= Math.min(35, inactivityDays * 3)
  score = clamp(score)
  const momentum: DealMomentum = score >= 66 ? 'accelerating' : score <= 40 ? 'cooling' : 'stable'
  return { momentum, score }
}

const buildPositiveSignals = (snapshot: WorkspaceSnapshot, lead: Lead, contacts: ContactRecord[], proposal: ProposalRecord | null, lastInteractionAt: string | null, now: Date): DealPositiveSignal[] => {
  const signals: DealPositiveSignal[] = []
  const idle = daysSince(lastInteractionAt, now)
  if (idle !== null && idle <= 3) signals.push({ key: 'recent-activity', label: 'Atividade recente', detail: `Última interação há ${idle} dia(s).`, impact: 10 })
  if (hasRole(contacts, ['champion'])) signals.push({ key: 'champion', label: 'Champion identificado', detail: 'Há uma pessoa favorável capaz de impulsionar o negócio internamente.', impact: 12 })
  if (hasRole(contacts, ['decision_maker', 'economic_buyer'])) signals.push({ key: 'decision', label: 'Decisor identificado', detail: 'O processo decisório possui cobertura explícita.', impact: 12 })
  if (proposal?.status === 'viewed') signals.push({ key: 'proposal-viewed', label: 'Proposta visualizada', detail: 'O comprador abriu a proposta oficial.', impact: 10 })
  if (proposal?.status === 'accepted') signals.push({ key: 'proposal-accepted', label: 'Proposta aceita', detail: 'Há aceite comercial registrado.', impact: 25 })
  if (eventsForLead(snapshot, lead.id).some((item) => item.status === 'confirmed' && new Date(item.startsAt).getTime() >= now.getTime())) signals.push({ key: 'meeting', label: 'Reunião futura', detail: 'Existe compromisso futuro confirmado na agenda.', impact: 10 })
  if (callsForLead(snapshot, lead.id).some((item) => strongOutcomes.has(item.outcome) && (daysSince(item.startedAt, now) ?? 999) <= 14)) signals.push({ key: 'buying-signal', label: 'Sinal de compra', detail: 'Ligação recente registrou interesse, reunião ou solicitação de proposta.', impact: 12 })
  const buyerRoom = (snapshot.buyerRooms ?? []).find((room) => room.leadId === lead.id && room.status !== 'archived')
  if (buyerRoom?.viewCount) signals.push({ key: 'buyer-room-opened', label: 'Buyer Room acessada', detail: `Comprador abriu o espaço compartilhado ${buyerRoom.viewCount} vez(es).`, impact: 10 })
  if (buyerRoom?.steps.length) {
    const progress = Math.round(buyerRoom.steps.filter((step) => step.status === 'completed').length / buyerRoom.steps.length * 100)
    if (progress >= 50) signals.push({ key: 'mutual-plan-progress', label: 'Plano conjunto avançando', detail: `Mutual Action Plan está ${progress}% concluído.`, impact: Math.min(16, 8 + Math.round(progress / 20)) })
  }
  return signals.sort((a, b) => b.impact - a.impact)
}

const buildRisks = ({
  snapshot, lead, stage, proposal, contacts, healthScore, realTalentProbability, sellerProbability, commercialValue, expectedCloseAt, lastInteractionAt, config, now,
}: {
  snapshot: WorkspaceSnapshot
  lead: Lead
  stage: PipelineStage | null
  proposal: ProposalRecord | null
  contacts: ContactRecord[]
  healthScore: number
  realTalentProbability: number
  sellerProbability: number
  commercialValue: number
  expectedCloseAt: string | null
  lastInteractionAt: string | null
  config: DealIntelligenceConfig
  now: Date
}): DealRisk[] => {
  const risks: DealRisk[] = []
  const idle = daysSince(lastInteractionAt, now)
  const nextDays = daysUntil(lead.nextActionAt, now)
  const nextTime = validTime(lead.nextActionAt)
  const closeDays = daysUntil(expectedCloseAt, now)
  const hasDecision = hasRole(contacts, ['decision_maker', 'economic_buyer'])
  const activeContacts = contacts.filter((contact) => !contact.doNotContact)
  const add = (risk: DealRisk) => risks.push(risk)

  if (!lead.nextActionAt) add({ key: 'no-next-step', severity: 'high', title: 'Sem próximo passo', detail: 'Oportunidade ativa sem próxima ação com data.', impact: 16, suggestedAction: 'Definir follow-up ou reunião', source: 'pipeline' })
  else if (nextTime !== null && nextTime < now.getTime()) { const overdueDays = Math.max(1, Math.ceil((now.getTime() - nextTime) / DAY)); add({ key: 'overdue-next-step', severity: 'critical', title: 'Próxima ação vencida', detail: `A próxima ação venceu há ${overdueDays} dia(s).`, impact: 24, suggestedAction: 'Executar contato agora', source: 'activity' }) }

  if (idle === null) add({ key: 'never-contacted', severity: 'high', title: 'Sem interação concluída', detail: 'Ainda não há contato concluído registrado para este negócio.', impact: 16, suggestedAction: 'Realizar primeiro contato', source: 'activity' })
  else if (idle >= config.staleDays * 2) add({ key: 'stale-critical', severity: 'critical', title: 'Negócio parado', detail: `Sem interação há ${idle} dias.`, impact: 24, suggestedAction: 'Retomar contato ou revisar qualificação', source: 'activity' })
  else if (idle >= config.staleDays) add({ key: 'stale', severity: 'high', title: 'Engajamento esfriando', detail: `Sem interação há ${idle} dias.`, impact: 15, suggestedAction: 'Fazer follow-up', source: 'engagement' })

  if (!hasDecision && (commercialValue >= config.highValueThreshold || stageLooksLate(stage))) add({ key: 'missing-decision-maker', severity: 'high', title: 'Decisor não identificado', detail: 'O negócio avançou sem decisor econômico/final mapeado.', impact: 18, suggestedAction: 'Mapear decisor no Account 360', source: 'stakeholder' })
  if (activeContacts.length <= 1 && commercialValue >= config.singleThreadThreshold) add({ key: 'single-threaded', severity: 'medium', title: 'Relacionamento concentrado', detail: 'Negócio de valor relevante depende de apenas um stakeholder.', impact: 10, suggestedAction: 'Abrir novos relacionamentos na conta', source: 'stakeholder' })
  if (contacts.some((contact) => contact.decisionRole === 'blocker' || contact.stance === 'opposed')) add({ key: 'blocker', severity: 'high', title: 'Stakeholder contrário', detail: 'Existe pessoa mapeada como bloqueadora ou com postura contrária.', impact: 15, suggestedAction: 'Construir plano de influência', source: 'stakeholder' })

  if (stageLooksProposal(stage) && !proposal) add({ key: 'proposal-missing', severity: 'high', title: 'Proposta não criada', detail: 'Oportunidade está em etapa de proposta sem documento atual.', impact: 18, suggestedAction: 'Criar proposta', source: 'proposal' })
  if (proposal?.status === 'draft' && stageLooksLate(stage)) add({ key: 'proposal-draft', severity: 'medium', title: 'Proposta ainda em rascunho', detail: 'O negócio avançou, mas a proposta ainda não foi enviada.', impact: 10, suggestedAction: 'Revisar e enviar proposta', source: 'proposal' })
  if (proposal?.status === 'viewed' && proposal.viewedAt) {
    const viewedDays = daysSince(proposal.viewedAt, now) ?? 0
    const interactionAfterView = lastInteractionAt && new Date(lastInteractionAt).getTime() > new Date(proposal.viewedAt).getTime()
    if (viewedDays >= config.proposalFollowupDays && !interactionAfterView) add({ key: 'proposal-viewed-no-response', severity: 'high', title: 'Proposta visualizada sem retorno', detail: `Visualizada há ${viewedDays} dia(s) e sem interação posterior registrada.`, impact: 18, suggestedAction: 'Fazer follow-up com objetivo de decisão', source: 'proposal' })
  }
  const validityDays = daysUntil(proposal?.validUntil, now)
  if (proposal && validityDays !== null && validityDays >= 0 && validityDays <= 3 && !['accepted', 'rejected', 'cancelled'].includes(proposal.status)) add({ key: 'proposal-expiring', severity: 'high', title: 'Proposta perto do vencimento', detail: `Validade termina em ${validityDays} dia(s).`, impact: 14, suggestedAction: 'Confirmar decisão antes do vencimento', source: 'proposal' })

  const buyerRoom = (snapshot.buyerRooms ?? []).find((room) => room.leadId === lead.id && room.status !== 'archived')
  if (buyerRoom?.shareEnabled && buyerRoom.viewCount === 0) {
    const sharedAt = [...buyerRoom.activity].reverse().find((event) => event.type === 'shared')?.occurredAt ?? buyerRoom.updatedAt
    const sharedDays = daysSince(sharedAt, now) ?? 0
    if (sharedDays >= 2) add({ key: 'buyer-room-not-opened', severity: 'medium', title: 'Buyer Room ainda não aberta', detail: `Espaço compartilhado há ${sharedDays} dia(s) sem abertura do comprador.`, impact: 10, suggestedAction: 'Confirmar recebimento do link', source: 'engagement' })
  }
  const blockedBuyerStep = buyerRoom?.steps.find((step) => step.status === 'blocked' && ['buyer','shared'].includes(step.owner))
  if (blockedBuyerStep) add({ key: 'buyer-room-blocked', severity: 'high', title: 'Plano de fechamento bloqueado', detail: `A etapa “${blockedBuyerStep.title}” está bloqueada no Mutual Action Plan.`, impact: 16, suggestedAction: 'Destravar dependência com o comprador', source: 'engagement' })

  if (closeDays !== null && closeDays < 0) add({ key: 'close-overdue', severity: 'critical', title: 'Fechamento previsto vencido', detail: `A previsão de fechamento passou há ${Math.abs(closeDays)} dia(s).`, impact: 24, suggestedAction: 'Revisar data e realidade do negócio', source: 'timing' })
  else if (closeDays !== null && closeDays <= config.closingSoonDays && healthScore < 68) add({ key: 'close-soon-risk', severity: 'high', title: 'Fechamento próximo com saúde baixa', detail: `Fechamento previsto em ${closeDays} dia(s), mas Deal Health está em ${healthScore}.`, impact: 18, suggestedAction: 'Revisar riscos antes de comprometer forecast', source: 'timing' })

  if (sellerProbability - realTalentProbability >= 20) add({ key: 'probability-gap', severity: 'medium', title: 'Probabilidade otimista', detail: `Vendedor registra ${sellerProbability}%, enquanto sinais atuais sustentam ${realTalentProbability}%.`, impact: 12, suggestedAction: 'Revisar forecast e remover riscos abertos', source: 'pipeline' })

  return risks.sort((a, b) => {
    const order: Record<DealRiskSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 }
    return order[b.severity] - order[a.severity] || b.impact - a.impact
  })
}

const chooseNextBestAction = ({
  lead, stage, proposal, contacts, risks, commercialValue, now,
}: {
  lead: Lead
  stage: PipelineStage | null
  proposal: ProposalRecord | null
  contacts: ContactRecord[]
  risks: DealRisk[]
  commercialValue: number
  now: Date
}): DealNextBestAction => {
  const riskKeys = new Set(risks.map((risk) => risk.key))
  const criticalRisk = risks.find((risk) => risk.severity === 'critical')
  if (riskKeys.has('overdue-next-step') || riskKeys.has('stale-critical') || riskKeys.has('stale') || riskKeys.has('proposal-viewed-no-response')) {
    return { kind: lead.phone ? 'call' : 'followup', title: lead.phone ? 'Ligar agora' : 'Criar follow-up', explanation: criticalRisk?.detail ?? risks.find((risk) => ['stale', 'proposal-viewed-no-response'].includes(risk.key))?.detail ?? 'O negócio precisa de retomada.', objective: riskKeys.has('proposal-viewed-no-response') ? 'Confirmar avaliação da proposta e processo de decisão.' : 'Restabelecer contato e confirmar próximo passo.', route: lead.phone ? 'calls' : 'leads', urgency: 'now' }
  }
  if (riskKeys.has('buyer-room-blocked')) return { kind: 'review_proposal', title: 'Destravar plano do comprador', explanation: risks.find((risk) => risk.key === 'buyer-room-blocked')?.detail ?? 'Há dependência bloqueada no Mutual Action Plan.', objective: 'Resolver a dependência e atualizar o próximo compromisso conjunto.', route: 'proposals', urgency: 'today' }
  if (riskKeys.has('buyer-room-not-opened')) return { kind: 'followup', title: 'Confirmar acesso à Buyer Room', explanation: risks.find((risk) => risk.key === 'buyer-room-not-opened')?.detail ?? 'O comprador ainda não acessou o espaço compartilhado.', objective: 'Confirmar recebimento e orientar o comprador ao plano compartilhado.', route: 'proposals', urgency: 'today' }
  if (riskKeys.has('missing-decision-maker') || riskKeys.has('single-threaded')) return { kind: 'map_stakeholder', title: 'Mapear decisor', explanation: 'A cobertura da conta é insuficiente para sustentar o avanço do negócio.', objective: 'Identificar quem aprova e reduzir dependência de um único contato.', route: 'leads', urgency: 'today' }
  if (riskKeys.has('proposal-missing')) return { kind: 'proposal', title: 'Criar proposta', explanation: 'A oportunidade já está em etapa comercial que exige proposta.', objective: 'Formalizar escopo, valor e próximo passo da negociação.', route: 'proposals', urgency: 'today' }
  if (riskKeys.has('proposal-draft')) return { kind: 'review_proposal', title: 'Revisar e enviar proposta', explanation: 'Existe proposta em rascunho para um negócio que já avançou.', objective: 'Finalizar condições e enviar a versão oficial.', route: 'proposals', urgency: 'today' }
  if (riskKeys.has('close-overdue') || riskKeys.has('close-soon-risk') || riskKeys.has('probability-gap')) return { kind: 'update_close_date', title: 'Revisar oportunidade', explanation: 'Data/probabilidade não estão alinhadas aos sinais atuais.', objective: 'Atualizar previsão, riscos e compromisso de fechamento.', route: 'pipeline', urgency: 'today' }
  if (!lead.nextActionAt) return { kind: lead.phone ? 'call' : 'followup', title: lead.phone ? 'Definir próximo passo em ligação' : 'Criar próximo passo', explanation: 'O negócio está ativo sem uma próxima ação claramente datada.', objective: 'Sair do contato com compromisso e data definidos.', route: lead.phone ? 'calls' : 'leads', urgency: 'today' }
  const nextDays = daysUntil(lead.nextActionAt, now)
  if (nextDays !== null && nextDays <= 1 && lead.phone) return { kind: 'call', title: 'Executar contato planejado', explanation: 'A próxima ação do negócio vence agora.', objective: 'Cumprir o compromisso e registrar o resultado.', route: 'calls', urgency: 'now' }
  if (proposal?.status === 'sent') return { kind: 'followup', title: 'Acompanhar proposta', explanation: 'A proposta foi enviada e ainda não há visualização registrada.', objective: 'Confirmar recebimento e combinar data de retorno.', route: 'proposals', urgency: 'planned' }
  if (contacts.length === 0 && commercialValue > 0) return { kind: 'map_stakeholder', title: 'Mapear stakeholders', explanation: 'A conta ainda não possui pessoas estruturadas no Account 360.', objective: 'Identificar decisão, influência e operação.', route: 'leads', urgency: 'planned' }
  if (stageLooksLate(stage) && proposal?.status === 'viewed') return { kind: 'followup', title: 'Conduzir decisão', explanation: 'A proposta já foi vista e o negócio está em etapa avançada.', objective: 'Remover objeções e confirmar caminho para fechamento.', route: 'proposals', urgency: 'planned' }
  return { kind: lead.phone ? 'call' : 'review', title: lead.phone ? 'Manter cadência de contato' : 'Revisar oportunidade', explanation: 'Não há risco crítico; mantenha o negócio avançando com próximo passo explícito.', objective: 'Preservar momentum e confirmar critérios de avanço.', route: lead.phone ? 'calls' : 'pipeline', urgency: 'planned' }
}

export const buildDealIntelligence = (lead: Lead, snapshot: WorkspaceSnapshot, config: DealIntelligenceConfig = DEFAULT_DEAL_INTELLIGENCE_CONFIG, now = new Date()): DealIntelligence => {
  const stage = snapshot.stages.find((item) => item.id === lead.stageId) ?? null
  const opportunity = commercialOpportunity(snapshot, lead)
  const proposal = activeProposalForLead(snapshot, lead.id)
  const contacts = contactsForLead(snapshot, lead)
  const commercialValue = commercialValueFor(lead, opportunity, proposal)
  const expectedCloseAt = expectedCloseFor(lead, opportunity, proposal)
  const dates = interactionTimes(snapshot, lead.id)
  const lastInteractionAt = latest(dates)
  const inactivityDays = daysSince(lastInteractionAt, now)
  const stakeholder = stakeholderComponent(snapshot, lead, contacts, now)
  const rawComponents: Array<Omit<DealHealthComponent, 'weight' | 'contribution'>> = [
    activityComponent(snapshot, lead, now, config),
    { key: stakeholder.key, label: stakeholder.label, score: stakeholder.score, reasons: stakeholder.reasons },
    proposalComponent(lead, stage, proposal, now, config),
    nextStepComponent(snapshot, lead, now),
    timingComponent(lead, stage, expectedCloseAt, now, config),
    engagementComponent(snapshot, lead, proposal, now),
  ]
  const components = weightedComponents(rawComponents, config.weights)
  const healthScore = clamp(components.reduce((sum, component) => sum + component.contribution, 0))
  const healthLevel = healthLevelFor(healthScore)
  const sellerProbability = sellerProbabilityFor(stage, opportunity)
  let realTalentProbability = clamp(healthScore * 0.68 + sellerProbability * 0.32)
  if (proposal?.status === 'accepted') realTalentProbability = Math.max(realTalentProbability, 95)
  if (proposal?.status === 'rejected' || lead.status === 'lost') realTalentProbability = 0
  if (lead.status === 'won') realTalentProbability = 100
  const positiveSignals = buildPositiveSignals(snapshot, lead, contacts, proposal, lastInteractionAt, now)
  const risks = buildRisks({ snapshot, lead, stage, proposal, contacts, healthScore, realTalentProbability, sellerProbability, commercialValue, expectedCloseAt, lastInteractionAt, config, now })
  const momentum = buildMomentum(snapshot, lead, proposal, now, inactivityDays)
  const nextBestAction = chooseNextBestAction({ lead, stage, proposal, contacts, risks, commercialValue, now })
  return {
    lead,
    opportunity,
    stage,
    proposal,
    healthScore,
    healthLevel,
    healthLabel: healthLabelFor(healthLevel),
    sellerProbability,
    realTalentProbability,
    probabilityGap: sellerProbability - realTalentProbability,
    momentum: momentum.momentum,
    momentumScore: momentum.score,
    accountCoverage: stakeholder.coverage,
    relationshipScore: stakeholder.relationship,
    components,
    risks,
    positiveSignals,
    nextBestAction,
    lastInteractionAt,
    inactivityDays,
    commercialValue,
    expectedCloseAt,
    stakeholderCount: contacts.filter((contact) => !contact.doNotContact).length,
    generatedAt: now.toISOString(),
  }
}

const priorityScore = (deal: DealIntelligence) => {
  const severity = deal.risks.reduce((sum, risk) => sum + (risk.severity === 'critical' ? 28 : risk.severity === 'high' ? 18 : risk.severity === 'medium' ? 9 : 3), 0)
  const valueBoost = Math.min(24, Math.log10(Math.max(10, deal.commercialValue)) * 5)
  const healthPenalty = 100 - deal.healthScore
  const urgency = deal.nextBestAction.urgency === 'now' ? 24 : deal.nextBestAction.urgency === 'today' ? 12 : 0
  return severity + valueBoost + healthPenalty * 0.45 + urgency
}

export const buildDealPortfolio = (snapshot: WorkspaceSnapshot, config: DealIntelligenceConfig = DEFAULT_DEAL_INTELLIGENCE_CONFIG, now = new Date(), ownerId?: string | null): DealPortfolio => {
  const deals = snapshot.leads
    .filter((lead) => lead.status === 'active' && (!ownerId || lead.ownerId === ownerId))
    .map((lead) => buildDealIntelligence(lead, snapshot, config, now))
  const priorities = [...deals].sort((a, b) => priorityScore(b) - priorityScore(a) || b.commercialValue - a.commercialValue)
  const activeValue = deals.reduce((sum, deal) => sum + deal.commercialValue, 0)
  const predictedValue = deals.reduce((sum, deal) => sum + deal.commercialValue * deal.realTalentProbability / 100, 0)
  const atRisk = deals.filter((deal) => deal.healthLevel === 'attention' || deal.healthLevel === 'critical')
  return {
    deals,
    priorities,
    averageHealth: deals.length ? Math.round(deals.reduce((sum, deal) => sum + deal.healthScore, 0) / deals.length) : 0,
    activeValue,
    predictedValue,
    strong: deals.filter((deal) => deal.healthLevel === 'strong').length,
    healthy: deals.filter((deal) => deal.healthLevel === 'healthy').length,
    attention: deals.filter((deal) => deal.healthLevel === 'attention').length,
    critical: deals.filter((deal) => deal.healthLevel === 'critical').length,
    atRiskValue: atRisk.reduce((sum, deal) => sum + deal.commercialValue, 0),
    criticalValue: deals.filter((deal) => deal.healthLevel === 'critical').reduce((sum, deal) => sum + deal.commercialValue, 0),
    missingDecisionMaker: deals.filter((deal) => deal.risks.some((risk) => risk.key === 'missing-decision-maker')).length,
    proposalRisks: deals.filter((deal) => deal.risks.some((risk) => risk.source === 'proposal' && ['critical', 'high'].includes(risk.severity))).length,
    noNextStep: deals.filter((deal) => deal.risks.some((risk) => ['no-next-step', 'overdue-next-step'].includes(risk.key))).length,
    cooling: deals.filter((deal) => deal.momentum === 'cooling').length,
  }
}

export const dealHealthTone = (level: DealHealthLevel) => level === 'strong' ? 'success' : level === 'healthy' ? 'info' : level === 'attention' ? 'warning' : 'danger'
export const momentumLabel = (momentum: DealMomentum) => momentum === 'accelerating' ? 'Acelerando' : momentum === 'cooling' ? 'Esfriando' : 'Estável'
