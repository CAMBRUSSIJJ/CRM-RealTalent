import type {
  ContactRecord,
  DecisionRole,
  Lead,
  Playbook,
  ProductRecord,
  WorkspaceSnapshot,
} from '../domain/types'
import { buildSalesAgentContext } from './realtalent-sales-intelligence-agent'

export type SalesCoachingConversationType = 'call' | 'meeting'

export interface SalesCoachingStakeholder {
  contactId: string
  name: string
  jobTitle: string
  decisionRole: DecisionRole
  influenceLevel: number
  relationshipStrength: string
  stance: string
  isPrimary: boolean
}

export interface SalesCoachingObjection {
  source: 'risk' | 'playbook' | 'product' | 'history'
  label: string
  responseAngle: string
}

export interface SalesCoachingPlan {
  leadId: string
  conversationType: SalesCoachingConversationType
  stageName: string
  objective: string
  opening: string
  coachingFocus: string
  agenda: string[]
  questions: string[]
  stakeholders: SalesCoachingStakeholder[]
  objections: SalesCoachingObjection[]
  proofPoints: string[]
  recentHistory: string[]
  successCriteria: string[]
  avoidPhrases: string[]
  matchedPlaybooks: string[]
  learningSummary: string
  grounding: string
  generatedAt: string
}

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const compact = (value: string, limit = 220) => value.replace(/\s+/g, ' ').trim().slice(0, limit)
const unique = (values: string[], limit = 12) => [...new Map(values.map((value) => [normalize(value), compact(value)])).values()].filter(Boolean).slice(0, limit)

const decisionRoleLabel: Record<DecisionRole, string> = {
  decision_maker: 'decisor',
  economic_buyer: 'comprador econômico',
  champion: 'champion',
  influencer: 'influenciador',
  technical_evaluator: 'avaliador técnico',
  finance: 'financeiro',
  procurement: 'compras',
  gatekeeper: 'gatekeeper',
  blocker: 'bloqueador',
  user: 'usuário',
  operational: 'operacional',
  unknown: 'papel não mapeado',
}

const rolePriority: Record<DecisionRole, number> = {
  decision_maker: 100,
  economic_buyer: 95,
  champion: 90,
  blocker: 88,
  procurement: 84,
  finance: 82,
  technical_evaluator: 78,
  influencer: 72,
  gatekeeper: 68,
  user: 55,
  operational: 50,
  unknown: 10,
}

const callOutcomeLabel: Record<string, string> = {
  answered: 'atendeu',
  no_answer: 'não atendeu',
  busy: 'ocupado',
  voicemail: 'caixa postal',
  callback_requested: 'pediu retorno',
  interested: 'demonstrou interesse',
  meeting_scheduled: 'reunião agendada',
  proposal_requested: 'solicitou proposta',
  proposal_sent: 'proposta enviada',
  wrong_person: 'contato incorreto',
  invalid_number: 'número inválido',
  not_interested: 'sem interesse',
  sale_completed: 'venda concluída',
  other: 'outro resultado',
}

const visibleLeadIdsForRecommendation = (lead: Lead, snapshot: WorkspaceSnapshot) => {
  if (snapshot.workspace.role === 'owner' || snapshot.workspace.role === 'admin') return new Set(snapshot.leads.map((item) => item.id))
  return new Set(snapshot.leads.filter((item) => item.ownerId === lead.ownerId).map((item) => item.id))
}

const stakeholdersForLead = (lead: Lead, snapshot: WorkspaceSnapshot): ContactRecord[] => snapshot.contacts
  .filter((contact) => contact.id === lead.primaryContactId || contact.leadIds.includes(lead.id) || Boolean(lead.companyId && contact.companyId === lead.companyId))
  .sort((a, b) => {
    const primary = Number(Boolean(b.isPrimary || b.id === lead.primaryContactId)) - Number(Boolean(a.isPrimary || a.id === lead.primaryContactId))
    if (primary) return primary
    const role = rolePriority[b.decisionRole] - rolePriority[a.decisionRole]
    if (role) return role
    return (b.influenceLevel ?? 0) - (a.influenceLevel ?? 0) || (b.relationshipScore ?? 0) - (a.relationshipScore ?? 0)
  })

const relevantProducts = (lead: Lead, snapshot: WorkspaceSnapshot): ProductRecord[] => {
  const proposals = snapshot.proposals
    .filter((proposal) => proposal.leadId === lead.id || Boolean(lead.opportunityId && proposal.opportunityId === lead.opportunityId))
    .sort((a, b) => Number(Boolean(b.isCurrentVersion)) - Number(Boolean(a.isCurrentVersion)) || b.version - a.version)
  const productIds = new Set(proposals.flatMap((proposal) => proposal.items.map((item) => item.productId).filter((id): id is string => Boolean(id))))
  return snapshot.products.filter((product) => productIds.has(product.id))
}

const targetObjective = (lead: Lead, snapshot: WorkspaceSnapshot) => {
  const risks = buildSalesAgentContext(lead, snapshot).risks.map((risk) => risk.key)
  if (risks.includes('missing-decision-maker') || risks.includes('single-threaded')) return 'identify_decision_maker' as const
  if (risks.some((risk) => ['proposal-missing', 'proposal-draft', 'proposal-stale'].includes(risk))) return 'proposal_followup' as const
  if (risks.some((risk) => ['stale', 'stale-critical', 'close-overdue'].includes(risk))) return 'recover_opportunity' as const
  const stage = snapshot.stages.find((item) => item.id === lead.stageId)
  if (stage && stage.order <= 1) return 'qualify' as const
  return 'first_meeting' as const
}

const playbookScore = (
  playbook: Playbook,
  lead: Lead,
  snapshot: WorkspaceSnapshot,
  stakeholders: ContactRecord[],
  conversationType: SalesCoachingConversationType,
  objective: ReturnType<typeof targetObjective>,
) => {
  if (!playbook.active || !playbook.guidance) return -100
  const guidance = playbook.guidance
  let score = 0
  if (guidance.stageIds?.length) score += guidance.stageIds.includes(lead.stageId) ? 5 : -3
  if (guidance.executionModes?.length) score += guidance.executionModes.includes(conversationType) ? 5 : -2
  if (guidance.objectives?.length) score += guidance.objectives.includes(objective) ? 4 : -1
  if (guidance.decisionRoles?.length) score += stakeholders.some((contact) => guidance.decisionRoles?.includes(contact.decisionRole)) ? 3 : -1
  if (guidance.temperatures?.length) score += guidance.temperatures.includes(lead.temperature) ? 2 : -1
  const company = lead.companyId ? snapshot.companies.find((item) => item.id === lead.companyId) : null
  if (guidance.segments?.length && company?.segment) score += guidance.segments.some((segment) => normalize(segment) === normalize(company.segment)) ? 3 : -1
  return score
}

const matchedPlaybooks = (
  lead: Lead,
  snapshot: WorkspaceSnapshot,
  stakeholders: ContactRecord[],
  conversationType: SalesCoachingConversationType,
) => {
  const objective = targetObjective(lead, snapshot)
  return snapshot.playbooks
    .map((playbook) => ({ playbook, score: playbookScore(playbook, lead, snapshot, stakeholders, conversationType, objective) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.playbook.updatedAt.localeCompare(a.playbook.updatedAt))
    .slice(0, 3)
    .map((item) => item.playbook)
}

const riskQuestions = (riskKeys: string[]) => {
  const questions: string[] = []
  const has = (key: string) => riskKeys.includes(key)
  if (has('missing-decision-maker')) questions.push('Quem aprova esta decisão e o que essa pessoa precisa enxergar para avançar?')
  if (has('single-threaded')) questions.push('Além do contato atual, quem mais precisa participar para a decisão não depender de uma única pessoa?')
  if (has('overdue-next-step') || has('no-next-step')) questions.push('Qual próximo compromisso concreto podemos definir agora, com responsável e data?')
  if (has('stale') || has('stale-critical')) questions.push('O que mudou desde a última interação e o que hoje impede este tema de avançar?')
  if (has('blocker')) questions.push('Qual preocupação ou resistência está impedindo o avanço e quem precisa ser envolvido para resolvê-la?')
  if (has('proposal-missing') || has('proposal-draft')) questions.push('Quais critérios de escopo, valor e decisão ainda precisam estar claros antes de formalizar a proposta?')
  if (has('probability-gap')) questions.push('Quais evidências concretas sustentam a confiança atual de fechamento?')
  if (has('close-overdue') || has('close-soon-risk')) questions.push('Qual evento real define a data de decisão e o que precisa acontecer antes dele?')
  return questions
}

const recentHistory = (lead: Lead, snapshot: WorkspaceSnapshot) => {
  const activityRows = snapshot.activities
    .filter((activity) => activity.leadId === lead.id)
    .map((activity) => ({
      at: activity.completedAt || activity.updatedAt || activity.createdAt,
      text: `${activity.type}: ${activity.title}${activity.description ? ` — ${compact(activity.description, 150)}` : ''}`,
    }))
  const callRows = snapshot.calls
    .filter((call) => call.leadId === lead.id)
    .map((call) => ({
      at: call.endedAt || call.startedAt,
      text: `ligação: ${callOutcomeLabel[call.outcome] || call.outcome}${call.notes ? ` — ${compact(call.notes, 150)}` : ''}`,
    }))
  return [...activityRows, ...callRows]
    .filter((item) => Boolean(item.at))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 6)
    .map((item) => `${String(item.at).slice(0, 10).split('-').reverse().join('/')}: ${item.text}`)
}

const historyObjections = (lead: Lead, snapshot: WorkspaceSnapshot): SalesCoachingObjection[] => {
  const lastCalls = snapshot.calls.filter((call) => call.leadId === lead.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 5)
  const objections: SalesCoachingObjection[] = []
  if (lastCalls.some((call) => call.outcome === 'not_interested')) objections.push({
    source: 'history',
    label: 'Houve registro anterior de falta de interesse.',
    responseAngle: 'Não rebata. Pergunte o que motivou a falta de interesse e valide se o contexto mudou antes de apresentar valor.',
  })
  if (lastCalls.some((call) => call.outcome === 'wrong_person')) objections.push({
    source: 'history',
    label: 'Já houve contato com pessoa sem papel adequado na decisão.',
    responseAngle: 'Use a conversa para identificar o decisor, comprador econômico ou influenciador correto antes de aprofundar a proposta.',
  })
  if (lastCalls.some((call) => call.outcome === 'callback_requested')) objections.push({
    source: 'history',
    label: 'O histórico registra pedido de retorno.',
    responseAngle: 'Abra contextualizando o compromisso anterior e confirme se o momento continua válido antes de avançar.',
  })
  return objections
}

const defaultAgenda = (conversationType: SalesCoachingConversationType) => conversationType === 'meeting'
  ? ['Alinhar o objetivo da reunião.', 'Atualizar diagnóstico e impacto do problema.', 'Validar stakeholders, critérios e processo de decisão.', 'Fechar próximos compromissos, responsáveis e datas.']
  : ['Contextualizar o motivo da ligação.', 'Atualizar problema, impacto e prioridade.', 'Validar processo de decisão e stakeholders.', 'Sair com um próximo passo concreto.']

const openingFor = (lead: Lead, conversationType: SalesCoachingConversationType, stageName: string) => conversationType === 'meeting'
  ? `“Quero usar esta conversa para entender o que mudou desde o último contato, validar o que ainda precisa ser resolvido na etapa ${stageName} e sair com próximos passos objetivos. Faz sentido?”`
  : `“Quero ser direto: estou retomando o contexto de ${lead.company || lead.name}, entender o que mudou e confirmar se ainda existe um próximo passo real. Posso fazer algumas perguntas rápidas?”`

export const inferSalesCoachingConversationType = (value: string, recommendedKind = ''): SalesCoachingConversationType => {
  const text = normalize(value)
  if (/\b(reuniao|meeting|call de reuniao)\b/.test(text)) return 'meeting'
  if (/\b(ligacao|ligar|telefon|call)\b/.test(text)) return 'call'
  return recommendedKind === 'meeting' ? 'meeting' : 'call'
}

export const buildSalesCoachingPlan = (
  lead: Lead,
  snapshot: WorkspaceSnapshot,
  requestedType = '',
  now = new Date(),
): SalesCoachingPlan => {
  const sales = buildSalesAgentContext(lead, snapshot, now)
  const conversationType = inferSalesCoachingConversationType(requestedType, sales.nextBestAction.kind)
  const stakeholders = stakeholdersForLead(lead, snapshot)
  const playbooks = matchedPlaybooks(lead, snapshot, stakeholders, conversationType)
  const products = relevantProducts(lead, snapshot)
  const riskKeys = sales.risks.map((risk) => risk.key)
  const playbookQuestions = playbooks.flatMap((playbook) => playbook.guidance?.discoveryQuestions ?? [])
  const productQuestions = products.flatMap((product) => product.discoveryQuestions ?? [])
  const questions = unique([
    ...riskQuestions(riskKeys),
    ...playbookQuestions,
    ...productQuestions,
    'Qual problema tem maior prioridade hoje e qual impacto ele gera se nada mudar?',
    'Como a decisão será tomada, por quem e com quais critérios?',
    'O que precisa acontecer para este negócio avançar para a próxima etapa?',
  ], 8)

  const riskObjections: SalesCoachingObjection[] = sales.risks
    .filter((risk) => risk.severity === 'critical' || risk.severity === 'high')
    .slice(0, 3)
    .map((risk) => ({ source: 'risk', label: risk.title, responseAngle: risk.suggestedAction }))
  const playbookObjections: SalesCoachingObjection[] = playbooks.flatMap((playbook) => (playbook.guidance?.objectionPrompts ?? []).map((prompt) => ({
    source: 'playbook' as const,
    label: compact(prompt, 180),
    responseAngle: 'Valide a objeção com uma pergunta, confirme o critério por trás dela e responda apenas com evidência registrada no CRM.',
  })))
  const productObjections: SalesCoachingObjection[] = products.flatMap((product) => (product.objectionNotes ?? []).map((note) => ({
    source: 'product' as const,
    label: compact(note, 180),
    responseAngle: `Use somente a proposta de valor, benefícios e provas cadastradas para ${product.name}; não prometa capacidade não registrada.`,
  })))
  const objections = [...riskObjections, ...historyObjections(lead, snapshot), ...playbookObjections, ...productObjections]
    .filter((item, index, rows) => rows.findIndex((candidate) => normalize(candidate.label) === normalize(item.label)) === index)
    .slice(0, 6)

  const playbookAgenda = conversationType === 'meeting' ? playbooks.flatMap((playbook) => playbook.guidance?.meetingAgenda ?? []) : []
  const successCriteria = unique([
    sales.nextBestAction.objective,
    ...playbooks.flatMap((playbook) => playbook.guidance?.successCriteria ?? []),
    ...(riskKeys.includes('missing-decision-maker') ? ['Sair com o decisor ou comprador econômico identificado.'] : []),
    ...(riskKeys.includes('overdue-next-step') || riskKeys.includes('no-next-step') ? ['Registrar próximo passo, responsável e data antes de encerrar.'] : []),
  ], 6)
  const proofPoints = unique(products.flatMap((product) => product.salesProofs ?? []), 6)
  const avoidPhrases = unique(playbooks.flatMap((playbook) => playbook.guidance?.avoidPhrases ?? []), 6)
  const coachingFocus = unique(playbooks.map((playbook) => playbook.guidance?.coachingFocus ?? '').filter(Boolean), 3).join(' | ')
    || `Conduzir a conversa para ${sales.nextBestAction.objective.toLowerCase()}, sem ignorar os riscos atuais do negócio.`
  const learningSummary = sales.learning.samples >= 3
    ? `${sales.learning.samples} caso(s) comparáveis; taxa ajustada ${sales.learning.adjustedSuccessRate}%; ajuste ${sales.learning.adjustment >= 0 ? '+' : ''}${sales.learning.adjustment}. ${sales.learning.actionChanged ? 'O histórico confiável alterou a ação sugerida dentro dos guardrails.' : 'O histórico apenas ajustou a confiança; os sinais atuais continuam prioritários.'}`
    : 'Amostra histórica insuficiente; o coaching usa principalmente sinais atuais, Playbooks e conhecimento comercial cadastrado.'

  return {
    leadId: lead.id,
    conversationType,
    stageName: sales.commercial.stage?.name ?? 'sem etapa definida',
    objective: sales.nextBestAction.objective,
    opening: openingFor(lead, conversationType, sales.commercial.stage?.name ?? 'atual'),
    coachingFocus,
    agenda: unique(playbookAgenda.length ? playbookAgenda : defaultAgenda(conversationType), 6),
    questions,
    stakeholders: stakeholders.slice(0, 8).map((contact) => ({
      contactId: contact.id,
      name: contact.name,
      jobTitle: contact.jobTitle,
      decisionRole: contact.decisionRole,
      influenceLevel: contact.influenceLevel,
      relationshipStrength: contact.relationshipStrength ?? 'unknown',
      stance: contact.stance ?? 'unknown',
      isPrimary: Boolean(contact.isPrimary || contact.id === lead.primaryContactId),
    })),
    objections,
    proofPoints,
    recentHistory: recentHistory(lead, snapshot),
    successCriteria,
    avoidPhrases,
    matchedPlaybooks: playbooks.map((playbook) => playbook.title),
    learningSummary,
    grounding: 'Coaching prescritivo baseado somente em sinais atuais do CRM, histórico registrado, Playbooks aplicáveis, catálogo vinculado e aprendizado agregado verificado. Objeções, provas, datas, pessoas e capacidades não registradas não devem ser inventadas.',
    generatedAt: now.toISOString(),
  }
}

const list = (items: string[], empty: string) => items.length ? items.map((item, index) => `${index + 1}. ${item}`).join('\n') : empty

export const formatSalesCoachingPlan = (
  lead: Lead,
  snapshot: WorkspaceSnapshot,
  requestedType = '',
  now = new Date(),
) => {
  const plan = buildSalesCoachingPlan(lead, snapshot, requestedType, now)
  const stakeholderText = plan.stakeholders.length
    ? plan.stakeholders.map((contact) => `${contact.name}${contact.jobTitle ? ` · ${contact.jobTitle}` : ''} · ${decisionRoleLabel[contact.decisionRole]} · relação ${contact.relationshipStrength} · postura ${contact.stance}`).join(' | ')
    : 'Nenhum stakeholder estruturado foi encontrado; trate o mapeamento de decisão como lacuna a validar.'
  const objectionText = plan.objections.length
    ? plan.objections.map((item) => `${item.label} → ${item.responseAngle}`).join(' | ')
    : 'Nenhuma objeção registrada foi encontrada. Não presuma uma objeção específica; investigue primeiro.'
  return [
    `Coaching para ${lead.company || lead.name} · ${plan.conversationType === 'meeting' ? 'reunião' : 'ligação'} · etapa ${plan.stageName}.`,
    `Objetivo mínimo: ${plan.objective}`,
    `Foco de coaching: ${plan.coachingFocus}`,
    `Abertura sugerida: ${plan.opening}`,
    `Agenda:\n${list(plan.agenda, 'Sem agenda estruturada cadastrada.')}`,
    `Perguntas prioritárias:\n${list(plan.questions, 'Sem perguntas específicas registradas.')}`,
    `Stakeholders: ${stakeholderText}`,
    `Objeções/riscos para preparar: ${objectionText}`,
    `Provas comerciais cadastradas: ${plan.proofPoints.length ? plan.proofPoints.join(' | ') : 'nenhuma prova específica vinculada à proposta atual.'}`,
    `Histórico recente:\n${list(plan.recentHistory, 'Ainda não há histórico recente registrado para este negócio.')}`,
    `Critérios de sucesso:\n${list(plan.successCriteria, plan.objective)}`,
    `Evite: ${plan.avoidPhrases.length ? plan.avoidPhrases.join(' | ') : 'não há frases proibidas cadastradas no Playbook aplicável.'}`,
    `Aprendizado da carteira: ${plan.learningSummary}`,
    `Base de verdade: ${plan.grounding}`,
  ].join('\n')
}
