import type { CallOutcome, CallRecord, ContactRecord, DecisionRole, Lead, LeadTemperature, PipelineStage, Playbook, PlaybookKind, PlaybookObjective } from '../domain/types'

export type CoachingDimensionId = 'outcome' | 'discovery' | 'next_step' | 'stakeholder' | 'objection' | 'documentation' | 'playbook'

export interface CoachingDimension {
  id: CoachingDimensionId
  label: string
  score: number
  weight: number
  evidence: string
}

export interface CallCoachingReview {
  callId: string
  score: number
  grade: 'excellent' | 'good' | 'attention' | 'critical'
  dimensions: CoachingDimension[]
  strengths: string[]
  improvements: string[]
  objectionTitles: string[]
  nextStepDetected: boolean
  discoverySignals: number
}

export interface TeamCoachingSummary {
  reviewedCalls: number
  averageScore: number
  excellentCalls: number
  meetingRate: number
  nextStepRate: number
  objectionHandlingRate: number
  discoveryRate: number
  topStrengths: Array<{ label: string; count: number }>
  improvementAreas: Array<{ label: string; count: number }>
  objections: Array<{ title: string; count: number }>
}

export interface PlaybookRecommendationContext {
  objective?: PlaybookObjective | null
  stageId?: string | null
  outcome?: CallOutcome | null
  decisionRole?: DecisionRole | null
  temperature?: LeadTemperature | null
  kind?: PlaybookKind | null
}

export interface PlaybookRecommendation {
  playbook: Playbook
  score: number
  reasons: string[]
}

const outcomeScore: Record<CallOutcome, number> = {
  answered: 62,
  no_answer: 35,
  busy: 38,
  voicemail: 42,
  callback_requested: 72,
  interested: 82,
  meeting_scheduled: 100,
  proposal_requested: 96,
  proposal_sent: 92,
  wrong_person: 55,
  invalid_number: 28,
  not_interested: 48,
  sale_completed: 100,
  other: 58,
}

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)))
const normalizedText = (...values: Array<string | null | undefined>) => values.filter(Boolean).join(' ').toLowerCase()
const has = (text: string, expression: RegExp) => expression.test(text)

const discoveryExpressions = [
  /dor|problema|desafio|gargalo|dificuldade|perde|falta|cancelamento|no-show/,
  /impact|receita|custo|tempo|horas|dinheiro|cliente|preju[íi]zo/,
  /sistema|processo atual|whatsapp|agenda|planilha|ferramenta/,
  /decisor|decis[aã]o|aprova|s[oó]cio|financeiro|respons[aá]vel/,
  /or[cç]amento|budget|investimento|pre[cç]o|valor/,
  /prazo|timing|quando|m[eê]s|semana|urgente|implanta/,
]

const nextStepExpression = /pr[oó]ximo passo|reuni[aã]o|retorno|follow[- ]?up|proposta|ligar|agend|enviar|demonstr/ 
const objectionMarker = /obje[cç][aã]o\s*[—:-]\s*([^.;\n]+)/gi

function extractObjections(text: string, playbooks: Playbook[]) {
  const found = new Set<string>()
  let match: RegExpExecArray | null
  const marker = new RegExp(objectionMarker.source, 'gi')
  while ((match = marker.exec(text))) if (match[1]?.trim()) found.add(match[1].trim())
  for (const playbook of playbooks.filter((item) => item.kind === 'objection')) {
    const title = playbook.title.toLowerCase().replace(/[“”"']/g, '').trim()
    if (title && text.includes(title)) found.add(playbook.title.replace(/[“”"]/g, ''))
  }
  return [...found]
}

export function evaluateCallCoaching(input: { call: CallRecord; lead?: Lead | null; contacts?: ContactRecord[]; playbooks?: Playbook[] }): CallCoachingReview {
  const { call, lead } = input
  const contacts = input.contacts ?? []
  const playbooks = input.playbooks ?? []
  const text = normalizedText(call.notes, call.transcript)
  const discoverySignals = discoveryExpressions.filter((expression) => has(text, expression)).length
  const nextStepDetected = ['callback_requested', 'meeting_scheduled', 'proposal_requested', 'proposal_sent', 'sale_completed'].includes(call.outcome)
    || has(text, nextStepExpression)
    || Boolean(lead?.nextActionAt && new Date(lead.nextActionAt).getTime() >= new Date(call.startedAt).getTime())
  const stakeholderMapped = Boolean(call.contactId)
    || contacts.some((contact) => contact.leadIds.includes(call.leadId) && ['decision_maker', 'economic_buyer', 'champion'].includes(contact.decisionRole))
    || has(text, /decisor|champion|financeiro|s[oó]cio|propriet[aá]rio/)
  const objections = extractObjections(text, playbooks)
  const objectionMentioned = objections.length > 0 || has(text, /obje[cç][aã]o|sem interesse|j[aá] tenho|caro|pre[cç]o|tempo agora/)
  const objectionHandled = !objectionMentioned || has(text, /resposta utilizada|pergunta de diagn[oó]stico|diagnostic|entender.*motivo|explor/) || objections.length > 0
  const documented = call.notes.trim().length >= 80
  const transcriptRich = call.transcript.trim().length >= 140
  const playbookUsed = /etapa do roteiro:|material complementar:|roteiro —/.test(text)

  const dimensions: CoachingDimension[] = [
    { id: 'outcome', label: 'Resultado', score: outcomeScore[call.outcome], weight: 22, evidence: `Resultado registrado: ${call.outcome.replaceAll('_', ' ')}` },
    { id: 'discovery', label: 'Descoberta', score: clamp((discoverySignals / discoveryExpressions.length) * 100), weight: 20, evidence: `${discoverySignals}/${discoveryExpressions.length} sinais de descoberta encontrados` },
    { id: 'next_step', label: 'Próximo passo', score: nextStepDetected ? 100 : 30, weight: 20, evidence: nextStepDetected ? 'Próximo passo explícito encontrado' : 'Conversa sem próximo passo claramente registrado' },
    { id: 'stakeholder', label: 'Stakeholder', score: stakeholderMapped ? 92 : 45, weight: 12, evidence: stakeholderMapped ? 'Pessoa/processo decisório mapeado' : 'Sem evidência suficiente de stakeholder' },
    { id: 'objection', label: 'Objeções', score: objectionHandled ? (objectionMentioned ? 92 : 72) : 38, weight: 10, evidence: objectionMentioned ? (objectionHandled ? 'Objeção registrada e tratada' : 'Objeção sem tratamento claro') : 'Nenhuma objeção relevante registrada' },
    { id: 'documentation', label: 'Registro', score: documented && transcriptRich ? 100 : documented ? 82 : transcriptRich ? 76 : call.notes.trim().length >= 25 ? 58 : 35, weight: 9, evidence: documented || transcriptRich ? 'Contexto suficiente para revisão' : 'Registro curto para coaching' },
    { id: 'playbook', label: 'Playbook', score: playbookUsed ? 95 : 55, weight: 7, evidence: playbookUsed ? 'Roteiro/material da equipe registrado' : 'Sem evidência de uso de playbook' },
  ]
  const score = clamp(dimensions.reduce((sum, item) => sum + item.score * item.weight, 0) / dimensions.reduce((sum, item) => sum + item.weight, 0))
  const ranked = [...dimensions].sort((a, b) => b.score - a.score)
  const weakest = [...dimensions].sort((a, b) => a.score - b.score)
  const strengths = ranked.filter((item) => item.score >= 78).slice(0, 3).map((item) => `${item.label}: ${item.evidence}`)
  const improvements = weakest.filter((item) => item.score < 75).slice(0, 3).map((item) => {
    if (item.id === 'next_step') return 'Finalize a conversa com uma ação, responsável e data claros.'
    if (item.id === 'discovery') return 'Explore problema, impacto, processo atual, decisão, investimento e timing antes de apresentar solução.'
    if (item.id === 'stakeholder') return 'Mapeie quem usa, influencia, aprova e controla orçamento nesta conta.'
    if (item.id === 'objection') return 'Diagnostique a causa da objeção antes de responder e registre como ela foi tratada.'
    if (item.id === 'documentation') return 'Registre contexto, dor, objeções e combinado final para tornar o histórico acionável.'
    if (item.id === 'playbook') return 'Use o roteiro contextual da equipe para manter consistência sem robotizar a conversa.'
    return 'Revise o resultado da abordagem e tente criar um avanço comercial concreto.'
  })

  return {
    callId: call.id,
    score,
    grade: score >= 85 ? 'excellent' : score >= 70 ? 'good' : score >= 55 ? 'attention' : 'critical',
    dimensions,
    strengths,
    improvements,
    objectionTitles: objections,
    nextStepDetected,
    discoverySignals,
  }
}

export function buildTeamCoachingSummary(input: { calls: CallRecord[]; leads: Lead[]; contacts: ContactRecord[]; playbooks: Playbook[] }): TeamCoachingSummary {
  const reviews = input.calls.map((call) => evaluateCallCoaching({ call, lead: input.leads.find((lead) => lead.id === call.leadId), contacts: input.contacts, playbooks: input.playbooks }))
  if (!reviews.length) return { reviewedCalls: 0, averageScore: 0, excellentCalls: 0, meetingRate: 0, nextStepRate: 0, objectionHandlingRate: 0, discoveryRate: 0, topStrengths: [], improvementAreas: [], objections: [] }
  const strengths = new Map<string, number>()
  const improvements = new Map<string, number>()
  const objections = new Map<string, number>()
  reviews.forEach((review) => {
    review.strengths.forEach((item) => { const label = item.split(':')[0]; strengths.set(label, (strengths.get(label) ?? 0) + 1) })
    review.improvements.forEach((item) => improvements.set(item, (improvements.get(item) ?? 0) + 1))
    review.objectionTitles.forEach((item) => objections.set(item, (objections.get(item) ?? 0) + 1))
  })
  const meetings = input.calls.filter((call) => ['meeting_scheduled', 'proposal_requested', 'proposal_sent', 'sale_completed'].includes(call.outcome)).length
  const objectionCalls = reviews.filter((review) => review.objectionTitles.length > 0)
  return {
    reviewedCalls: reviews.length,
    averageScore: clamp(reviews.reduce((sum, item) => sum + item.score, 0) / reviews.length),
    excellentCalls: reviews.filter((item) => item.grade === 'excellent').length,
    meetingRate: clamp((meetings / reviews.length) * 100),
    nextStepRate: clamp((reviews.filter((item) => item.nextStepDetected).length / reviews.length) * 100),
    objectionHandlingRate: objectionCalls.length ? clamp((objectionCalls.filter((review) => review.dimensions.find((item) => item.id === 'objection')!.score >= 75).length / objectionCalls.length) * 100) : 100,
    discoveryRate: clamp((reviews.reduce((sum, item) => sum + item.discoverySignals / discoveryExpressions.length, 0) / reviews.length) * 100),
    topStrengths: [...strengths.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 4),
    improvementAreas: [...improvements.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 4),
    objections: [...objections.entries()].map(([title, count]) => ({ title, count })).sort((a, b) => b.count - a.count).slice(0, 8),
  }
}

export function recommendPlaybooks(playbooks: Playbook[], context: PlaybookRecommendationContext): PlaybookRecommendation[] {
  return playbooks.filter((item) => item.active && (!context.kind || item.kind === context.kind)).map((playbook) => {
    const guidance = playbook.guidance ?? {}
    let score = 20
    const reasons: string[] = []
    const scoreDimension = <T extends string>(values: T[] | undefined, current: T | null | undefined, points: number, label: string) => {
      if (!values?.length) return
      if (current && values.includes(current)) { score += points; reasons.push(label) }
      else score -= Math.round(points * 0.6)
    }
    scoreDimension(guidance.objectives, context.objective, 30, 'objetivo da ligação')
    scoreDimension(guidance.stageIds, context.stageId, 22, 'etapa do pipeline')
    scoreDimension(guidance.decisionRoles, context.decisionRole, 16, 'persona/stakeholder')
    scoreDimension(guidance.outcomes, context.outcome, 12, 'resultado da conversa')
    scoreDimension(guidance.temperatures, context.temperature, 10, 'temperatura do lead')
    if (!Object.values(guidance).some((value) => Array.isArray(value) ? value.length : Boolean(value))) reasons.push('uso geral')
    return { playbook, score: clamp(score), reasons }
  }).sort((a, b) => b.score - a.score || a.playbook.title.localeCompare(b.playbook.title, 'pt-BR'))
}

export function playbookCoverage(playbooks: Playbook[], stages: PipelineStage[]) {
  const active = playbooks.filter((item) => item.active)
  const contextual = active.filter((item) => {
    const guidance = item.guidance ?? {}
    return Boolean(guidance.objectives?.length || guidance.stageIds?.length || guidance.decisionRoles?.length || guidance.outcomes?.length || guidance.temperatures?.length)
  })
  const coveredStages = new Set(contextual.flatMap((item) => item.guidance?.stageIds ?? []))
  return {
    active: active.length,
    contextual: contextual.length,
    contextualRate: active.length ? Math.round((contextual.length / active.length) * 100) : 0,
    stageCoverage: stages.length ? Math.round((stages.filter((stage) => coveredStages.has(stage.id)).length / stages.length) * 100) : 0,
  }
}
