import type { ActivityItem, AppRoute, Lead, LeadPriority, LeadTemperature, WorkspaceSnapshot } from '../domain/types'

export interface LeadScoringConfig {
  enabled: boolean
  autoReclassify: boolean
  weights: {
    profile: number
    behavior: number
    potential: number
  }
  thresholds: {
    medium: number
    high: number
    urgent: number
    warm: number
    hot: number
  }
  mediumValue: number
  highValue: number
  staleDays: number
  targetCities: string[]
  preferredSources: string[]
  idealTags: string[]
}

export type LeadScoreLevel = 'low' | 'medium' | 'high' | 'urgent'
export type LeadScoreCategoryKey = 'profile' | 'behavior' | 'potential'
export type LeadScoreAlertTone = 'info' | 'warning' | 'danger'
export type LeadScoreActionKind = 'call' | 'whatsapp' | 'followup' | 'meeting' | 'review' | 'data'

export interface LeadScoreCategory {
  key: LeadScoreCategoryKey
  label: string
  score: number
  weight: number
  reasons: string[]
}

export interface LeadScoreAlert {
  key: string
  tone: LeadScoreAlertTone
  label: string
  detail: string
}

export interface LeadNextBestAction {
  kind: LeadScoreActionKind
  title: string
  explanation: string
  dueAt: string | null
  route: AppRoute
}

export interface LeadScoreInsight {
  lead: Lead
  score: number
  level: LeadScoreLevel
  label: string
  reasons: string[]
  categories: LeadScoreCategory[]
  alerts: LeadScoreAlert[]
  nextBestAction: LeadNextBestAction
  recommendedPriority: LeadPriority
  recommendedTemperature: LeadTemperature
  classificationChanged: boolean
}

export interface LeadClassificationUpdate {
  leadId: string
  priority: LeadPriority
  temperature: LeadTemperature
  score: number
}

export const DEFAULT_LEAD_SCORING_CONFIG: LeadScoringConfig = {
  enabled: true,
  autoReclassify: true,
  weights: { profile: 30, behavior: 40, potential: 30 },
  thresholds: { medium: 35, high: 60, urgent: 80, warm: 40, hot: 70 },
  mediumValue: 3_000,
  highValue: 10_000,
  staleDays: 7,
  targetCities: [],
  preferredSources: ['Indicação', 'Evento', 'Garimpo'],
  idealTags: ['barbearia', 'salão', 'decisor', 'quente', 'reunião'],
}

const DAY = 86_400_000
const normalize = (value: string) => value.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const validPhone = (value: string) => value.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').length >= 10
const validEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value.trim())
const dateTime = (value: string | null | undefined) => {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}
const percent = (points: number, maximum: number) => maximum > 0 ? Math.max(0, Math.min(100, Math.round(points / maximum * 100))) : 0
const includesAny = (haystack: string[], needles: string[]) => {
  const normalizedHaystack = haystack.map(normalize)
  return needles.some((needle) => normalizedHaystack.some((item) => item === normalize(needle) || item.includes(normalize(needle))))
}
const labelForLevel = (level: LeadScoreLevel) => level === 'urgent' ? 'Prioridade crítica' : level === 'high' ? 'Prioridade alta' : level === 'medium' ? 'Prioridade média' : 'Prioridade baixa'

const category = (key: LeadScoreCategoryKey, score: number, weight: number, reasons: string[]): LeadScoreCategory => ({
  key,
  label: key === 'profile' ? 'Perfil' : key === 'behavior' ? 'Comportamento' : 'Potencial',
  score: Math.max(0, Math.min(100, Math.round(score))),
  weight,
  reasons: reasons.slice(0, 4),
})

const activityAction = (activity: ActivityItem, overdue: boolean): LeadNextBestAction => {
  if (activity.type === 'meeting') return { kind: 'meeting', title: overdue ? 'Reagendar ou concluir reunião' : 'Preparar reunião', explanation: overdue ? 'Existe uma reunião pendente fora do prazo.' : 'A reunião é o próximo compromisso registrado.', dueAt: activity.dueAt, route: 'agenda' }
  if (activity.type === 'call') return { kind: 'call', title: overdue ? 'Fazer ligação atrasada' : 'Realizar ligação programada', explanation: overdue ? 'A ligação planejada ainda não foi concluída.' : 'A ligação é a próxima atividade da rotina.', dueAt: activity.dueAt, route: 'calls' }
  return { kind: 'followup', title: overdue ? 'Executar follow-up atrasado' : 'Executar follow-up', explanation: overdue ? 'O retorno prometido passou da data.' : 'Este é o próximo passo programado no histórico.', dueAt: activity.dueAt, route: 'followups' }
}

const buildNextBestAction = (
  lead: Lead,
  snapshot: WorkspaceSnapshot,
  now: Date,
  score: number,
  proposalStage: boolean,
  lastInteractionAt: number | null,
): LeadNextBestAction => {
  const nowTime = now.getTime()
  const pending = snapshot.activities
    .filter((item) => item.leadId === lead.id && !item.completedAt && item.dueAt && item.type !== 'note' && item.type !== 'stage_change')
    .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''))
  const overdue = pending.find((item) => (dateTime(item.dueAt) ?? Number.POSITIVE_INFINITY) < nowTime)
  if (overdue) return activityAction(overdue, true)
  const next = pending[0]
  if (next && (dateTime(next.dueAt) ?? Number.POSITIVE_INFINITY) <= nowTime + DAY) return activityAction(next, false)

  const leadCalls = snapshot.calls.filter((call) => call.leadId === lead.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  const lastCall = leadCalls[0]
  if (!validPhone(lead.phone) && !validEmail(lead.email)) return { kind: 'data', title: 'Completar dados de contato', explanation: 'Não há telefone ou e-mail válido para executar a abordagem.', dueAt: null, route: 'leads' }
  if (lastCall?.outcome === 'callback_requested') return { kind: 'call', title: 'Retornar conforme combinado', explanation: 'O último resultado registrado foi um pedido de retorno.', dueAt: lead.nextActionAt, route: 'calls' }
  if (proposalStage || ['proposal_requested', 'proposal_sent'].includes(lastCall?.outcome ?? '')) return { kind: 'followup', title: 'Acompanhar proposta', explanation: 'A oportunidade está em proposta ou negociação e precisa de continuidade.', dueAt: lead.nextActionAt, route: 'followups' }
  const hasContact = leadCalls.some((call) => ['answered', 'callback_requested', 'interested', 'meeting_scheduled', 'proposal_requested', 'proposal_sent', 'sale_completed'].includes(call.outcome))
    || snapshot.activities.some((item) => item.leadId === lead.id && item.completedAt && item.type !== 'note' && item.type !== 'stage_change')
  if (!hasContact) return validPhone(lead.phone)
    ? { kind: 'call', title: 'Fazer primeiro contato', explanation: 'Ainda não existe interação comercial concluída com este lead.', dueAt: lead.nextActionAt, route: 'calls' }
    : { kind: 'whatsapp', title: 'Iniciar contato assistido', explanation: 'O lead ainda não recebeu uma abordagem registrada.', dueAt: lead.nextActionAt, route: 'leads' }
  if (score >= 70 && validPhone(lead.phone)) return { kind: 'call', title: 'Ligar enquanto o interesse está alto', explanation: 'Perfil, comportamento e potencial colocam este lead entre as maiores prioridades.', dueAt: lead.nextActionAt, route: 'calls' }
  if (!lead.nextActionAt) return { kind: 'followup', title: 'Definir próxima ação', explanation: 'O negócio está ativo, mas não possui um próximo passo programado.', dueAt: null, route: 'followups' }
  if (lastInteractionAt !== null && nowTime - lastInteractionAt >= 7 * DAY) return { kind: 'followup', title: 'Reativar oportunidade', explanation: 'O lead está há vários dias sem uma interação comercial.', dueAt: lead.nextActionAt, route: 'followups' }
  return { kind: 'review', title: 'Revisar oportunidade', explanation: 'Confira o contexto e confirme se a próxima ação continua adequada.', dueAt: lead.nextActionAt, route: 'pipeline' }
}

export const leadScoreInsight = (
  lead: Lead,
  snapshot: WorkspaceSnapshot,
  config: LeadScoringConfig = DEFAULT_LEAD_SCORING_CONFIG,
  now = new Date(),
): LeadScoreInsight => {
  if (lead.status !== 'active' || !config.enabled) {
    const nextBestAction: LeadNextBestAction = { kind: 'review', title: 'Sem ação prioritária', explanation: lead.status === 'active' ? 'O Lead Score está desativado nas configurações.' : 'O lead está fora da operação ativa.', dueAt: lead.nextActionAt, route: 'leads' }
    return { lead, score: 0, level: 'low', label: 'Sem prioridade', reasons: [nextBestAction.explanation], categories: [category('profile', 0, config.weights.profile, []), category('behavior', 0, config.weights.behavior, []), category('potential', 0, config.weights.potential, [])], alerts: [], nextBestAction, recommendedPriority: 'low', recommendedTemperature: 'cold', classificationChanged: false }
  }

  const nowTime = now.getTime()
  const stages = new Map(snapshot.stages.map((item) => [item.id, item]))
  const stage = stages.get(lead.stageId)
  const leadActivities = snapshot.activities.filter((item) => item.leadId === lead.id)
  const leadCalls = snapshot.calls.filter((item) => item.leadId === lead.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  const leadEvents = snapshot.events.filter((item) => item.leadId === lead.id)
  const interactionTimes = [
    ...leadCalls.map((item) => item.endedAt ?? item.startedAt ?? item.createdAt),
    ...leadActivities.filter((item) => item.completedAt).map((item) => item.completedAt!),
    ...leadEvents.filter((item) => item.status === 'completed').map((item) => item.endsAt),
  ].map(dateTime).filter((value): value is number => value !== null)
  const lastInteractionAt = interactionTimes.length ? Math.max(...interactionTimes) : null
  const idleDays = lastInteractionAt === null ? Math.max(0, Math.floor((nowTime - (dateTime(lead.createdAt) ?? nowTime)) / DAY)) : Math.max(0, Math.floor((nowTime - lastInteractionAt) / DAY))

  let profilePoints = 0
  let profileMax = 0
  const profileReasons: string[] = []
  const addProfile = (points: number, max: number, reason?: string) => { profileMax += max; profilePoints += Math.max(0, Math.min(max, points)); if (reason && points > 0) profileReasons.push(reason) }
  addProfile(validPhone(lead.phone) ? 16 : 0, 16, validPhone(lead.phone) ? 'telefone válido' : undefined)
  addProfile(validEmail(lead.email) ? 8 : 0, 8, validEmail(lead.email) ? 'e-mail válido' : undefined)
  addProfile([lead.company, lead.city, lead.source, lead.ownerName].filter((value) => value.trim()).length * 4, 16, [lead.company, lead.city, lead.source, lead.ownerName].every((value) => value.trim()) ? 'cadastro comercial completo' : undefined)
  addProfile(lead.street && lead.addressNumber ? 5 : lead.formattedAddress ? 3 : 0, 5, lead.street && lead.addressNumber ? 'endereço estruturado' : undefined)
  if (config.idealTags.length) addProfile(includesAny(lead.tags, config.idealTags) ? 25 : 0, 25, includesAny(lead.tags, config.idealTags) ? 'aderência ao perfil ideal' : undefined)
  if (config.targetCities.length) addProfile(includesAny([lead.city], config.targetCities) ? 15 : 0, 15, includesAny([lead.city], config.targetCities) ? 'cidade prioritária' : undefined)
  if (config.preferredSources.length) addProfile(includesAny([lead.source], config.preferredSources) ? 10 : 0, 10, includesAny([lead.source], config.preferredSources) ? 'origem de alta qualidade' : undefined)
  const decisorText = normalize(`${lead.name} ${lead.notes} ${lead.tags.join(' ')}`)
  addProfile(/decisor|dono|socio|proprietario|gestor/.test(decisorText) ? 10 : 0, 10, /decisor|dono|socio|proprietario|gestor/.test(decisorText) ? 'decisor identificado' : undefined)
  const profileScore = percent(profilePoints, profileMax)

  let behaviorPoints = 0
  const behaviorReasons: string[] = []
  const lastCall = leadCalls[0]
  if (lastCall && ['answered', 'callback_requested', 'interested', 'meeting_scheduled', 'proposal_requested', 'proposal_sent', 'sale_completed'].includes(lastCall.outcome)) { behaviorPoints += 24; behaviorReasons.push('resposta comercial recente') }
  if (lastCall && ['interested', 'meeting_scheduled', 'proposal_requested', 'proposal_sent', 'sale_completed'].includes(lastCall.outcome)) { behaviorPoints += 18; behaviorReasons.push('sinal claro de interesse') }
  if (leadEvents.some((item) => item.status !== 'cancelled' && (dateTime(item.startsAt) ?? 0) >= nowTime - 30 * DAY)) { behaviorPoints += 16; behaviorReasons.push('reunião registrada') }
  if (leadCalls.some((item) => ['proposal_requested', 'proposal_sent'].includes(item.outcome)) || /proposta|negocia/i.test(stage?.name ?? '')) { behaviorPoints += 15; behaviorReasons.push('avanço para proposta ou negociação') }
  if (lastInteractionAt !== null && nowTime - lastInteractionAt <= 3 * DAY) { behaviorPoints += 12; behaviorReasons.push('interação nos últimos 3 dias') }
  else if (lastInteractionAt !== null && nowTime - lastInteractionAt <= 7 * DAY) { behaviorPoints += 7; behaviorReasons.push('interação recente') }
  const nextActionTime = dateTime(lead.nextActionAt)
  if (nextActionTime !== null && nextActionTime < nowTime) { behaviorPoints += 15; behaviorReasons.push('próxima ação vencida') }
  else if (nextActionTime !== null && nextActionTime <= nowTime + DAY) { behaviorPoints += 8; behaviorReasons.push('ação programada para as próximas 24 horas') }
  else if (nextActionTime === null) { behaviorPoints += 4; behaviorReasons.push('negócio ativo sem próxima ação') }
  const noAnswerCount = leadCalls.slice(0, 5).filter((item) => ['no_answer', 'busy', 'voicemail'].includes(item.outcome)).length
  if (noAnswerCount >= 3) behaviorPoints -= 12
  if (idleDays >= config.staleDays * 2) behaviorPoints -= 20
  else if (idleDays >= config.staleDays) behaviorPoints -= 10
  const behaviorScore = Math.max(0, Math.min(100, Math.round(behaviorPoints)))

  let potentialPoints = 0
  const potentialReasons: string[] = []
  const stageProbability = Math.max(0, Math.min(100, stage?.probability ?? 0))
  potentialPoints += stageProbability * 0.45
  if (stageProbability >= 65) potentialReasons.push('etapa avançada do Pipeline')
  if (lead.value >= config.highValue) { potentialPoints += 35; potentialReasons.push('alto valor potencial') }
  else if (lead.value >= config.mediumValue) { potentialPoints += 22; potentialReasons.push('valor relevante') }
  else if (lead.value > 0) potentialPoints += 8
  const expectedClose = dateTime(lead.expectedCloseAt ? `${lead.expectedCloseAt}T12:00:00` : null)
  if (expectedClose !== null) {
    const daysToClose = Math.ceil((expectedClose - nowTime) / DAY)
    if (daysToClose >= 0 && daysToClose <= 14) { potentialPoints += 15; potentialReasons.push('fechamento previsto em até 14 dias') }
    else if (daysToClose > 14 && daysToClose <= 30) { potentialPoints += 9; potentialReasons.push('fechamento previsto neste mês') }
  }
  const potentialText = normalize(`${lead.notes} ${lead.tags.join(' ')}`)
  if (/expansao|unidades|multiunidade|urgente|proposta|orcamento/.test(potentialText)) { potentialPoints += 5; potentialReasons.push('sinal adicional de potencial') }
  const potentialScore = Math.max(0, Math.min(100, Math.round(potentialPoints)))

  const totalWeight = Math.max(1, config.weights.profile + config.weights.behavior + config.weights.potential)
  const score = Math.max(0, Math.min(100, Math.round((profileScore * config.weights.profile + behaviorScore * config.weights.behavior + potentialScore * config.weights.potential) / totalWeight)))
  const level: LeadScoreLevel = score >= config.thresholds.urgent ? 'urgent' : score >= config.thresholds.high ? 'high' : score >= config.thresholds.medium ? 'medium' : 'low'
  const recommendedPriority: LeadPriority = level
  const recommendedTemperature: LeadTemperature = score >= config.thresholds.hot ? 'hot' : score >= config.thresholds.warm ? 'warm' : 'cold'
  const proposalStage = /proposta|negocia|decis/i.test(stage?.name ?? '')
  const nextBestAction = buildNextBestAction(lead, snapshot, now, score, proposalStage, lastInteractionAt)

  const alerts: LeadScoreAlert[] = []
  if (score >= config.thresholds.urgent) alerts.push({ key: 'critical_score', tone: 'danger', label: 'Prioridade crítica', detail: 'Este lead está entre as maiores oportunidades da fila.' })
  if (nextActionTime !== null && nextActionTime < nowTime) alerts.push({ key: 'overdue', tone: 'danger', label: 'Ação vencida', detail: 'O retorno programado já passou da data.' })
  if (nextActionTime === null) alerts.push({ key: 'no_action', tone: 'warning', label: 'Sem próxima ação', detail: 'Defina um próximo passo para evitar perda de continuidade.' })
  if (proposalStage && idleDays >= config.staleDays) alerts.push({ key: 'proposal_stale', tone: 'warning', label: 'Proposta parada', detail: `A oportunidade está há ${idleDays} dias sem interação.` })
  else if (idleDays >= config.staleDays) alerts.push({ key: 'stale', tone: 'warning', label: 'Lead parado', detail: `Não há interação registrada há ${idleDays} dias.` })
  if (noAnswerCount >= 3) alerts.push({ key: 'attempts', tone: 'warning', label: 'Muitas tentativas sem resposta', detail: `${noAnswerCount} das últimas tentativas não tiveram atendimento.` })
  if (!lead.ownerId && !lead.ownerName) alerts.push({ key: 'owner', tone: 'warning', label: 'Sem responsável', detail: 'A oportunidade precisa ser atribuída a alguém.' })
  if (!validPhone(lead.phone) && !validEmail(lead.email)) alerts.push({ key: 'contact', tone: 'danger', label: 'Sem canal válido', detail: 'Complete telefone ou e-mail antes da abordagem.' })
  const classificationChanged = lead.priority !== recommendedPriority || lead.temperature !== recommendedTemperature
  if (config.autoReclassify && classificationChanged) alerts.push({ key: 'reclassification', tone: 'info', label: 'Reclassificação automática', detail: `Recomendação: prioridade ${labelForLevel(level).replace('Prioridade ', '').toLocaleLowerCase('pt-BR')} e temperatura ${recommendedTemperature === 'hot' ? 'quente' : recommendedTemperature === 'warm' ? 'morna' : 'fria'}.` })

  const categories = [category('profile', profileScore, config.weights.profile, profileReasons), category('behavior', behaviorScore, config.weights.behavior, behaviorReasons), category('potential', potentialScore, config.weights.potential, potentialReasons)]
  const reasons = categories.flatMap((item) => item.reasons.map((reason) => `${item.label}: ${reason}`)).slice(0, 5)
  return { lead, score, level, label: labelForLevel(level), reasons, categories, alerts: alerts.slice(0, 5), nextBestAction, recommendedPriority, recommendedTemperature, classificationChanged }
}

export const buildLeadScoreBoard = (snapshot: WorkspaceSnapshot, config: LeadScoringConfig, now = new Date(), ownerId?: string | null) => snapshot.leads
  .filter((lead) => lead.status === 'active' && (!ownerId || lead.ownerId === ownerId))
  .map((lead) => leadScoreInsight(lead, snapshot, config, now))
  .sort((a, b) => b.score - a.score || (a.nextBestAction.dueAt ?? '9999').localeCompare(b.nextBestAction.dueAt ?? '9999'))

export const buildAutomaticReclassification = (snapshot: WorkspaceSnapshot, config: LeadScoringConfig, now = new Date()): LeadClassificationUpdate[] => {
  if (!config.enabled || !config.autoReclassify) return []
  return buildLeadScoreBoard(snapshot, config, now)
    .filter((item) => item.classificationChanged)
    .map((item) => ({ leadId: item.lead.id, priority: item.recommendedPriority, temperature: item.recommendedTemperature, score: item.score }))
}
