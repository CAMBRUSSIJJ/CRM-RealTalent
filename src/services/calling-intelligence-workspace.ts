import type {
  ActivityItem,
  CalendarEvent,
  CallRecord,
  ContactRecord,
  Lead,
  PipelineStage,
  ProposalRecord,
} from '../domain/types'
import { callSessionObjective, type CallSessionObjective, type DiscoveryChecklistItem } from './call-session-intelligence'
import { outcomeLabel, resolveLeadCallTarget } from './call-workspace'

export type CallHealthStatus = 'good' | 'attention' | 'restricted'
export type CallHealthTone = 'success' | 'info' | 'warning' | 'danger'

export interface CallHealthCheck {
  id: 'phone' | 'permission' | 'frequency' | 'today' | 'duplicate' | 'meeting' | 'history'
  label: string
  detail: string
  tone: CallHealthTone
  blocking?: boolean
}

export interface CallHealthResult {
  status: CallHealthStatus
  score: number
  label: string
  recommendation: string
  checks: CallHealthCheck[]
  targetPhone: string
  attempts72h: number
  attempts7d: number
}

export interface PreCallBrief {
  headline: string
  objective: string
  lastInteraction: string
  lastInteractionAt: string | null
  opportunity: string
  context: string[]
  signals: string[]
  recommendedQuestion: string
  recommendedApproach: string
}

export type LiveSignalId =
  | 'pain'
  | 'impact'
  | 'competitor'
  | 'decision_maker'
  | 'budget'
  | 'timing'
  | 'existing_solution'
  | 'interest'
  | 'price'
  | 'next_step'
  | 'objection'

export interface LiveConversationSignal {
  id: LiveSignalId
  label: string
  excerpt: string
  confidence: number
  tone: 'neutral' | 'info' | 'warning' | 'success'
}

export interface NextBestQuestion {
  category: string
  question: string
  reason: string
  priority: 'high' | 'medium'
}

const normalizePhone = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '')
const withinHours = (iso: string, now: Date, hours: number) => now.getTime() - new Date(iso).getTime() <= hours * 3_600_000
const sameDay = (iso: string, now: Date) => new Date(iso).toDateString() === now.toDateString()
const truncate = (value: string, length = 132) => value.length > length ? `${value.slice(0, length - 1).trim()}…` : value

const signalDefinitions: Array<{
  id: LiveSignalId
  label: string
  tone: LiveConversationSignal['tone']
  patterns: RegExp[]
}> = [
  { id: 'pain', label: 'Dor', tone: 'warning', patterns: [/\b(dor|problema|dificuldade|gargalo|desafio|perde|perdemos|perdeu|perdendo|perda|falha|retrabalho)\b/i, /cliente[s]? (some|somem|não volta|não retorn)/i, /horário[s]? (vazio|ocioso)/i] },
  { id: 'impact', label: 'Impacto', tone: 'warning', patterns: [/\b(perda|prejuízo|impacto|receita|faturamento|tempo perdido|custo)\b/i, /deixa de (vender|faturar|atender)/i] },
  { id: 'competitor', label: 'Concorrente', tone: 'info', patterns: [/\b(concorrente|outra empresa|outro fornecedor|alternativa)\b/i, /\b(booksy|trinks|simples agenda|agenda pro|salonized)\b/i] },
  { id: 'decision_maker', label: 'Decisão', tone: 'info', patterns: [/\b(decide|decisão|decisor|aprova|aprovação|sócio|sócia|dono|dona|proprietário|proprietária|financeiro)\b/i] },
  { id: 'budget', label: 'Orçamento', tone: 'info', patterns: [/\b(orçamento|budget|investimento|verba|faixa de valor|aprovar valor)\b/i] },
  { id: 'timing', label: 'Timing', tone: 'info', patterns: [/\b(prazo|urgente|urgência|esta semana|semana que vem|este mês|mês que vem|quando|até sexta|até segunda)\b/i] },
  { id: 'existing_solution', label: 'Solução atual', tone: 'neutral', patterns: [/\b(já (tenho|temos|uso|usamos)|sistema atual|processo atual|outro sistema|outra ferramenta|planilha|agenda|whatsapp)\b/i] },
  { id: 'interest', label: 'Interesse', tone: 'success', patterns: [/\b(faz sentido|tenho interesse|tem interesse|quero entender|quero saber|gostei|vamos avançar|podemos marcar|pode agendar)\b/i] },
  { id: 'price', label: 'Preço', tone: 'info', patterns: [/\b(preço|valor|quanto custa|mensalidade|plano|caro|barato)\b/i] },
  { id: 'next_step', label: 'Próximo passo', tone: 'success', patterns: [/\b(reunião|agendar|agenda|retorno|retornar|proposta|enviar|próximo passo|combinado)\b/i] },
  { id: 'objection', label: 'Objeção', tone: 'warning', patterns: [/\b(não tenho tempo|sem tempo|não tenho interesse|não interessa|manda no whatsapp|me manda no whatsapp|já tenho sistema|está caro|muito caro|não quero trocar)\b/i] },
]

const sentenceAround = (text: string, index: number) => {
  const before = Math.max(text.lastIndexOf('.', index), text.lastIndexOf('\n', index), text.lastIndexOf('?', index - 1), text.lastIndexOf('!', index - 1))
  const candidates = [text.indexOf('.', index), text.indexOf('\n', index), text.indexOf('?', index), text.indexOf('!', index)].filter((value) => value >= 0)
  const after = candidates.length ? Math.min(...candidates) : text.length
  return truncate(text.slice(Math.max(0, before + 1), Math.min(text.length, after + 1)).trim(), 118)
}

export function analyzeLiveConversation(text: string): LiveConversationSignal[] {
  const source = text.replace(/\s+/g, ' ').trim()
  if (!source) return []
  return signalDefinitions.flatMap((definition) => {
    let best: { excerpt: string; confidence: number } | null = null
    for (const pattern of definition.patterns) {
      const match = pattern.exec(source)
      if (!match || typeof match.index !== 'number') continue
      const confidence = Math.min(96, 72 + Math.max(0, match[0].split(/\s+/).length - 1) * 6)
      if (!best || confidence > best.confidence) best = { excerpt: sentenceAround(source, match.index), confidence }
    }
    return best ? [{ id: definition.id, label: definition.label, excerpt: best.excerpt, confidence: best.confidence, tone: definition.tone }] : []
  })
}

export function buildCallHealth(input: {
  lead: Lead
  contact?: ContactRecord | null
  contacts: ContactRecord[]
  allLeads: Lead[]
  calls: CallRecord[]
  events: CalendarEvent[]
  now?: Date
}): CallHealthResult {
  const now = input.now ?? new Date()
  const target = input.contact?.phone?.trim()
    ? { phone: input.contact.phone.trim(), contactId: input.contact.id, name: input.contact.name }
    : resolveLeadCallTarget(input.lead, input.contacts)
  const digits = normalizePhone(target.phone)
  const leadCalls = input.calls.filter((call) => call.leadId === input.lead.id).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
  const attempts72h = leadCalls.filter((call) => withinHours(call.startedAt, now, 72)).length
  const attempts7d = leadCalls.filter((call) => withinHours(call.startedAt, now, 24 * 7)).length
  const contactedToday = leadCalls.some((call) => sameDay(call.startedAt, now))
  const futureMeeting = input.events
    .filter((event) => event.leadId === input.lead.id && ['confirmed', 'tentative'].includes(event.status) && new Date(event.startsAt).getTime() >= now.getTime())
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0]
  const duplicates = digits
    ? input.allLeads.filter((lead) => lead.id !== input.lead.id && normalizePhone(resolveLeadCallTarget(lead, input.contacts).phone) === digits).length
    : 0
  const lastCall = leadCalls[0]
  const contactRestricted = Boolean(input.contact?.doNotContact || input.contact?.consentStatus === 'opted_out')
  const leadRestricted = Boolean(input.lead.doNotContact || input.lead.consentStatus === 'opted_out')
  const validPhone = digits.length >= 10 && digits.length <= 15

  const checks: CallHealthCheck[] = []
  checks.push(validPhone
    ? { id: 'phone', label: 'Telefone', detail: 'Formato discável identificado.', tone: 'success' }
    : { id: 'phone', label: 'Telefone', detail: digits ? 'Formato do número precisa de revisão.' : 'Nenhum telefone discável encontrado.', tone: 'danger', blocking: true })
  checks.push(leadRestricted || contactRestricted
    ? { id: 'permission', label: 'Permissão', detail: 'Contato marcado como não contatar ou opt-out.', tone: 'danger', blocking: true }
    : { id: 'permission', label: 'Permissão', detail: 'Nenhum bloqueio comercial registrado.', tone: 'success' })
  if (attempts72h >= 5) checks.push({ id: 'frequency', label: 'Frequência', detail: `${attempts72h} tentativas nas últimas 72h. Reduza a cadência antes de insistir.`, tone: 'warning' })
  else if (attempts72h >= 3) checks.push({ id: 'frequency', label: 'Frequência', detail: `${attempts72h} tentativas nas últimas 72h. Revise a abordagem.`, tone: 'warning' })
  else checks.push({ id: 'frequency', label: 'Frequência', detail: `${attempts72h} tentativa(s) nas últimas 72h.`, tone: 'success' })
  if (contactedToday) checks.push({ id: 'today', label: 'Contato hoje', detail: 'Já houve tentativa hoje.', tone: 'warning' })
  if (duplicates) checks.push({ id: 'duplicate', label: 'Duplicidade', detail: `${duplicates} outro(s) lead(s) usam o mesmo telefone.`, tone: 'warning' })
  if (futureMeeting) checks.push({ id: 'meeting', label: 'Reunião futura', detail: `Já existe compromisso agendado para ${new Date(futureMeeting.startsAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.`, tone: 'info' })
  if (lastCall?.outcome === 'invalid_number') checks.push({ id: 'history', label: 'Histórico do número', detail: 'A última tentativa foi registrada como número inválido.', tone: 'warning' })
  else if (lastCall) checks.push({ id: 'history', label: 'Última tentativa', detail: `${outcomeLabel(lastCall.outcome)} · ${new Date(lastCall.startedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.`, tone: 'info' })

  const restricted = checks.some((item) => item.blocking)
  const attention = checks.some((item) => item.tone === 'warning') || Boolean(futureMeeting)
  const scorePenalty = checks.reduce((sum, item) => sum + (item.blocking ? 45 : item.tone === 'warning' ? 12 : item.tone === 'info' ? 3 : 0), 0)
  const score = Math.max(0, Math.min(100, 100 - scorePenalty))
  const status: CallHealthStatus = restricted ? 'restricted' : attention ? 'attention' : 'good'
  return {
    status,
    score,
    label: status === 'good' ? 'Bom para ligar' : status === 'attention' ? 'Revisar antes de ligar' : 'Não ligar agora',
    recommendation: restricted
      ? 'Corrija o telefone ou a permissão antes de iniciar a tentativa.'
      : futureMeeting
        ? 'Há uma reunião futura. Confirme se esta ligação ainda é necessária.'
        : attempts72h >= 5
          ? 'Considere espaçar a cadência e trocar o canal antes de uma nova tentativa.'
          : contactedToday
            ? 'Se não houver urgência, evite uma segunda tentativa no mesmo dia.'
            : 'Contato elegível para a sessão atual.',
    checks,
    targetPhone: target.phone,
    attempts72h,
    attempts7d,
  }
}

const latestInteraction = (calls: CallRecord[], activities: ActivityItem[], leadId: string) => {
  const callRows = calls.filter((call) => call.leadId === leadId).map((call) => ({
    at: call.startedAt,
    label: `Ligação · ${outcomeLabel(call.outcome)}`,
    text: call.notes || call.transcript || '',
  }))
  const activityRows = activities.filter((activity) => activity.leadId === leadId).map((activity) => ({
    at: activity.completedAt ?? activity.updatedAt ?? activity.createdAt,
    label: activity.title || activity.type,
    text: activity.description || '',
  }))
  return [...callRows, ...activityRows].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0] ?? null
}

const latestProposal = (proposals: ProposalRecord[], leadId: string) => proposals
  .filter((proposal) => proposal.leadId === leadId && !['rejected', 'expired', 'cancelled'].includes(proposal.status))
  .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null

export function buildPreCallBrief(input: {
  lead: Lead
  contact?: ContactRecord | null
  contacts: ContactRecord[]
  calls: CallRecord[]
  activities: ActivityItem[]
  proposals: ProposalRecord[]
  stage?: PipelineStage | null
  objective: CallSessionObjective
}): PreCallBrief {
  const interaction = latestInteraction(input.calls, input.activities, input.lead.id)
  const proposal = latestProposal(input.proposals, input.lead.id)
  const objective = callSessionObjective(input.objective)
  const priorText = [input.lead.notes, ...input.calls.filter((call) => call.leadId === input.lead.id).slice(-4).flatMap((call) => [call.notes, call.transcript])].filter(Boolean).join(' ')
  const priorSignals = analyzeLiveConversation(priorText)
  const lastCall = input.calls.filter((call) => call.leadId === input.lead.id).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0]
  const decisionMaker = input.contacts.find((contact) => ['decision_maker', 'economic_buyer'].includes(contact.decisionRole))
  const context: string[] = []
  if (input.stage?.name) context.push(`Etapa: ${input.stage.name}`)
  if (input.lead.value > 0) context.push(`Valor potencial: ${input.lead.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`)
  if (decisionMaker) context.push(`Decisor mapeado: ${decisionMaker.name}`)
  if (proposal) context.push(`Proposta ${proposal.status}: ${proposal.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`)
  if (input.lead.temperature === 'hot') context.push('Lead quente')
  if (input.lead.priority === 'urgent' || input.lead.priority === 'high') context.push(`Prioridade ${input.lead.priority === 'urgent' ? 'urgente' : 'alta'}`)

  let question = 'O que mudou desde o nosso último contato e qual é a prioridade agora?'
  let approach = 'Retome o contexto em uma frase, confirme a prioridade e avance para uma pergunta aberta.'
  if (!lastCall) {
    question = 'Como vocês lidam hoje com esse processo e onde ainda existe mais trabalho manual ou perda de oportunidade?'
    approach = 'Primeiro contato: gere contexto rápido e investigue o processo atual antes de apresentar solução.'
  } else if (lastCall.outcome === 'callback_requested') {
    question = 'Da última vez você pediu que eu retomasse o contato. O que faz mais sentido resolver primeiro hoje?'
    approach = 'Respeite o combinado do retorno e evite reiniciar a conversa do zero.'
  } else if (proposal) {
    question = 'Depois de olhar a proposta, o que ainda precisa ficar claro para vocês conseguirem decidir o próximo passo?'
    approach = 'Não reapresente tudo. Descubra objeção, stakeholder faltante e critério de decisão.'
  } else if (input.objective === 'identify_decision_maker') {
    question = 'Além de você, quem costuma participar ou aprovar uma decisão como essa?'
    approach = 'Mapeie influência e aprovação sem transformar a conversa em interrogatório.'
  } else if (input.objective === 'qualify') {
    question = 'Qual problema hoje tem impacto suficiente para vocês realmente quererem mudar alguma coisa?'
    approach = 'Busque dor, impacto, processo atual, decisão e timing antes de avançar.'
  } else if (input.objective === 'recover_opportunity') {
    question = 'Esse tema continua sendo prioridade ou alguma coisa mudou desde a última conversa?'
    approach = 'Revalide prioridade e contexto antes de tentar reativar a oportunidade.'
  }

  return {
    headline: `${input.contact?.name || input.lead.name}${input.lead.company ? ` · ${input.lead.company}` : ''}`,
    objective: `${objective.shortLabel} — ${objective.successSignal}`,
    lastInteraction: interaction ? `${interaction.label}${interaction.text ? ` · ${truncate(interaction.text, 120)}` : ''}` : 'Nenhuma interação registrada.',
    lastInteractionAt: interaction?.at ?? null,
    opportunity: proposal ? `${proposal.title} · ${proposal.status}` : input.lead.value > 0 ? `Oportunidade estimada em ${input.lead.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : 'Sem proposta ativa.',
    context: context.slice(0, 5),
    signals: priorSignals.slice(0, 5).map((signal) => signal.label),
    recommendedQuestion: question,
    recommendedApproach: approach,
  }
}

const QUESTION_LIBRARY: Record<DiscoveryChecklistItem['id'], (context: { mainPain: string; objective: CallSessionObjective }) => NextBestQuestion> = {
  pain: () => ({ category: 'Problema', question: 'Qual problema hoje mais incomoda ou faz vocês perderem tempo, clientes ou oportunidades?', reason: 'A dor ainda não está clara. Sem ela, qualquer proposta de valor fica genérica.', priority: 'high' }),
  impact: ({ mainPain }) => ({ category: 'Impacto', question: mainPain.trim() ? `Quando ${mainPain.trim()} acontece, qual é a consequência prática para a operação ou para a receita?` : 'Quando esse problema acontece, qual é a consequência prática para a operação ou para a receita?', reason: 'Quantificar ou qualificar o impacto ajuda a separar curiosidade de prioridade real.', priority: 'high' }),
  current_process: () => ({ category: 'Processo atual', question: 'Como vocês resolvem isso hoje e o que ainda continua dando trabalho?', reason: 'Entender o processo atual evita atacar uma solução que já funciona e revela gaps concretos.', priority: 'high' }),
  decision: () => ({ category: 'Decisão', question: 'Além de você, quem precisa participar ou aprovar uma mudança como essa?', reason: 'O processo de decisão ainda não está mapeado.', priority: 'high' }),
  budget: () => ({ category: 'Investimento', question: 'Quando esse tipo de melhoria faz sentido, como vocês costumam avaliar e aprovar o investimento?', reason: 'A pergunta explora viabilidade sem pressionar por um número cedo demais.', priority: 'medium' }),
  timing: () => ({ category: 'Timing', question: 'Existe algum prazo ou evento que faria esse tema precisar estar resolvido?', reason: 'Timing diferencia uma necessidade ativa de algo sem prioridade definida.', priority: 'medium' }),
  next_step: ({ objective }) => ({ category: 'Próximo passo', question: objective === 'proposal_followup' ? 'O que precisa acontecer para vocês conseguirem tomar uma decisão sobre a proposta?' : 'Qual seria o próximo passo mais útil depois desta conversa?', reason: 'Toda boa ligação precisa terminar com um avanço explícito ou uma decisão clara.', priority: 'high' }),
}

export function recommendNextBestQuestion(input: {
  checklist: DiscoveryChecklistItem[]
  mainPain: string
  objective: CallSessionObjective
  liveSignals: LiveConversationSignal[]
}): NextBestQuestion {
  const signalIds = new Set(input.liveSignals.map((signal) => signal.id))
  const preferredOrder: DiscoveryChecklistItem['id'][] = ['pain', 'current_process', 'impact', 'decision', 'timing', 'budget', 'next_step']
  const missing = preferredOrder.find((id) => {
    const checklistItem = input.checklist.find((item) => item.id === id)
    if (checklistItem?.complete) return false
    if (id === 'pain' && signalIds.has('pain')) return false
    if (id === 'impact' && signalIds.has('impact')) return false
    if (id === 'current_process' && signalIds.has('existing_solution')) return false
    if (id === 'decision' && signalIds.has('decision_maker')) return false
    if (id === 'budget' && (signalIds.has('budget') || signalIds.has('price'))) return false
    if (id === 'timing' && signalIds.has('timing')) return false
    if (id === 'next_step' && signalIds.has('next_step')) return false
    return true
  }) ?? 'next_step'
  return QUESTION_LIBRARY[missing]({ mainPain: input.mainPain, objective: input.objective })
}
