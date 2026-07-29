import type { ActivityItem, CallOutcome, CallRecord, Lead, PipelineStage } from '../domain/types'

export type CommercialActionKind = 'call_now' | 'callback' | 'schedule_meeting' | 'prepare_proposal' | 'follow_proposal' | 'complete_contact' | 'identify_decision_maker' | 'reactivate' | 'review_lead'

export interface CommercialActionSuggestion {
  kind: CommercialActionKind
  label: string
  shortLabel: string
  reason: string
  urgency: 'critical' | 'high' | 'normal' | 'low'
  score: number
  dueAt: string | null
}

export interface WrapRecommendation {
  title: string
  description: string
  actionLabel: string
  scheduleRecommended: boolean
  closesLead: boolean
  checklist: string[]
}

const noContactOutcomes: CallOutcome[] = ['no_answer', 'busy', 'voicemail']
const positiveOutcomes: CallOutcome[] = ['interested', 'meeting_scheduled', 'proposal_requested', 'proposal_sent', 'sale_completed']

const isOverdue = (value: string | null | undefined, now: Date) => Boolean(value && new Date(value).getTime() < now.getTime())
const hoursBetween = (from: string | null | undefined, now: Date) => from ? Math.max(0, (now.getTime() - new Date(from).getTime()) / 3_600_000) : 0

export function recommendCommercialAction(
  lead: Lead,
  stage: PipelineStage | null,
  calls: CallRecord[],
  activities: ActivityItem[],
  now = new Date(),
): CommercialActionSuggestion {
  const leadCalls = calls.filter((call) => call.leadId === lead.id).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
  const lastCall = leadCalls[0] ?? null
  const pendingActivities = activities.filter((activity) => activity.leadId === lead.id && !activity.completedAt)
  const pendingMeeting = pendingActivities.find((activity) => activity.type === 'meeting')
  const pendingCall = pendingActivities.find((activity) => activity.type === 'call')
  const stageName = (stage?.name ?? '').toLowerCase()
  const dueAt = pendingCall?.dueAt ?? lead.nextActionAt ?? null
  const overdueHours = hoursBetween(dueAt, now)

  if (!lead.phone.trim()) {
    return { kind: 'complete_contact', label: 'Completar telefone antes de prosseguir', shortLabel: 'Completar contato', reason: 'O lead está ativo, mas não possui um telefone utilizável.', urgency: 'high', score: 96, dueAt: null }
  }

  if (lastCall?.outcome === 'wrong_person' || lead.decisionRole === 'influencer' || lead.decisionRole === 'user') {
    return { kind: 'identify_decision_maker', label: 'Identificar o decisor correto', shortLabel: 'Buscar decisor', reason: 'O contato atual pode não ter autonomia para avançar a oportunidade.', urgency: 'high', score: 92, dueAt }
  }

  if (lastCall?.outcome === 'proposal_requested') {
    return { kind: 'prepare_proposal', label: 'Preparar e enviar a proposta', shortLabel: 'Preparar proposta', reason: 'A última conversa terminou com solicitação explícita de proposta.', urgency: 'critical', score: 100, dueAt }
  }

  if (lastCall?.outcome === 'proposal_sent' || stageName.includes('proposta')) {
    return { kind: 'follow_proposal', label: 'Fazer follow-up da proposta', shortLabel: 'Follow-up proposta', reason: 'A oportunidade está em proposta e precisa de confirmação, objeção ou decisão.', urgency: isOverdue(dueAt, now) ? 'critical' : 'high', score: 95 + Math.min(5, Math.round(overdueHours / 12)), dueAt }
  }

  if (pendingMeeting || lastCall?.outcome === 'meeting_scheduled') {
    return { kind: 'schedule_meeting', label: pendingMeeting ? 'Confirmar a reunião agendada' : 'Registrar e confirmar a reunião', shortLabel: 'Confirmar reunião', reason: 'Existe um próximo passo de reunião que precisa ser protegido.', urgency: pendingMeeting?.dueAt && isOverdue(pendingMeeting.dueAt, now) ? 'critical' : 'normal', score: 90, dueAt: pendingMeeting?.dueAt ?? dueAt }
  }

  if (lastCall?.outcome === 'callback_requested') {
    return { kind: 'callback', label: 'Retornar no horário combinado', shortLabel: 'Retornar agora', reason: 'O lead pediu um novo contato; cumprir o horário aumenta a confiança.', urgency: isOverdue(dueAt, now) ? 'critical' : 'high', score: 98, dueAt }
  }

  if (lastCall && noContactOutcomes.includes(lastCall.outcome)) {
    return { kind: 'callback', label: 'Tentar novamente em outro horário', shortLabel: 'Nova tentativa', reason: `A última tentativa terminou como ${lastCall.outcome === 'busy' ? 'ocupado' : lastCall.outcome === 'voicemail' ? 'caixa postal' : 'não atendeu'}.`, urgency: isOverdue(dueAt, now) ? 'critical' : 'normal', score: 82 + Math.min(12, Math.round(overdueHours / 8)), dueAt }
  }

  if (lastCall && positiveOutcomes.includes(lastCall.outcome)) {
    return { kind: 'schedule_meeting', label: 'Definir o próximo compromisso', shortLabel: 'Agendar próximo passo', reason: 'A conversa avançou e não deve terminar sem data, responsável e objetivo.', urgency: 'high', score: 91, dueAt }
  }

  if (lead.lastContactAt && hoursBetween(lead.lastContactAt, now) > 24 * 14) {
    return { kind: 'reactivate', label: 'Reativar a oportunidade', shortLabel: 'Reativar lead', reason: 'O lead está ativo, mas ficou mais de 14 dias sem contato registrado.', urgency: 'high', score: 88, dueAt }
  }

  if (isOverdue(dueAt, now)) {
    return { kind: 'call_now', label: 'Ligar agora', shortLabel: 'Ligar agora', reason: `A próxima ação está atrasada há ${Math.max(1, Math.round(overdueHours))}h.`, urgency: overdueHours >= 24 ? 'critical' : 'high', score: 90 + Math.min(10, Math.round(overdueHours / 12)), dueAt }
  }

  if (lead.temperature === 'hot' || lead.priority === 'urgent') {
    return { kind: 'call_now', label: 'Ligar enquanto o interesse está alto', shortLabel: 'Ligar agora', reason: 'Temperatura ou prioridade indicam uma janela comercial curta.', urgency: 'critical', score: 96, dueAt }
  }

  if (!lead.nextActionAt) {
    return { kind: 'review_lead', label: 'Definir a próxima ação', shortLabel: 'Definir ação', reason: 'O lead está ativo, mas não possui um próximo passo registrado.', urgency: 'normal', score: 74, dueAt: null }
  }

  return { kind: 'call_now', label: 'Executar a próxima ligação', shortLabel: 'Ligar', reason: 'A oportunidade está pronta para a próxima tentativa planejada.', urgency: 'normal', score: 70, dueAt }
}

export function buildWrapRecommendation(outcome: CallOutcome, discovery: { decisionMaker?: string; currentSystem?: string; mainPain?: string; bestTime?: string }, notes: string): WrapRecommendation {
  const capturedContext = [discovery.decisionMaker, discovery.currentSystem, discovery.mainPain, discovery.bestTime, notes.trim()].filter(Boolean).length
  const contextChecklist = capturedContext >= 3 ? [] : ['Registrar dor, contexto e critério de decisão antes de salvar.']

  switch (outcome) {
    case 'no_answer':
    case 'busy':
    case 'voicemail':
      return { title: 'Nova tentativa com contexto', description: 'Agende outro horário e preserve o histórico para evitar repetição mecânica.', actionLabel: 'Agendar nova tentativa', scheduleRecommended: true, closesLead: false, checklist: ['Variar o horário da próxima ligação.', ...contextChecklist] }
    case 'callback_requested':
      return { title: 'Compromisso de retorno', description: discovery.bestTime ? `Use o horário informado: ${discovery.bestTime}.` : 'Registre o horário combinado para que o retorno seja pontual.', actionLabel: 'Confirmar retorno', scheduleRecommended: true, closesLead: false, checklist: ['Confirmar data e horário com o lead.', ...contextChecklist] }
    case 'interested':
      return { title: 'Converter interesse em compromisso', description: 'Transforme o interesse em reunião, demonstração ou tarefa com data definida.', actionLabel: 'Agendar próximo passo', scheduleRecommended: true, closesLead: false, checklist: ['Definir objetivo do próximo encontro.', 'Registrar quem participará.', ...contextChecklist] }
    case 'meeting_scheduled':
      return { title: 'Proteger a reunião', description: 'Confirme agenda, participantes, objetivo e material necessário.', actionLabel: 'Criar compromisso', scheduleRecommended: true, closesLead: false, checklist: ['Adicionar pauta curta.', 'Confirmar decisor ou influenciadores.', ...contextChecklist] }
    case 'proposal_requested':
      return { title: 'Preparar proposta oficial', description: 'Registre escopo, problema, valor e prazo para que a proposta seja objetiva.', actionLabel: 'Criar tarefa de proposta', scheduleRecommended: true, closesLead: false, checklist: ['Confirmar escopo e critério de decisão.', 'Definir prazo de envio.', ...contextChecklist] }
    case 'proposal_sent':
      return { title: 'Follow-up da proposta', description: 'Agende uma conversa para revisar dúvidas e obter decisão, não apenas “cobrar retorno”.', actionLabel: 'Agendar revisão', scheduleRecommended: true, closesLead: false, checklist: ['Definir data de decisão.', 'Registrar objeções previstas.', ...contextChecklist] }
    case 'wrong_person':
      return { title: 'Mapear o decisor', description: 'Mantenha o contato como influenciador e crie a próxima ação para localizar o responsável.', actionLabel: 'Buscar decisor', scheduleRecommended: true, closesLead: false, checklist: ['Registrar nome ou cargo do decisor.', ...contextChecklist] }
    case 'invalid_number':
      return { title: 'Corrigir os dados do lead', description: 'Não programe novas chamadas antes de validar outro telefone ou canal.', actionLabel: 'Completar contato', scheduleRecommended: false, closesLead: false, checklist: ['Validar WhatsApp, site, Instagram ou telefone alternativo.'] }
    case 'not_interested':
      return { title: 'Encerrar com motivo claro', description: 'Registre a razão da perda para melhorar segmentação, roteiro e cadência.', actionLabel: 'Marcar como perdido', scheduleRecommended: false, closesLead: true, checklist: ['Registrar o motivo real da recusa.'] }
    case 'sale_completed':
      return { title: 'Iniciar o pós-venda', description: 'Conclua a oportunidade e garanta a primeira ação de onboarding ou relacionamento.', actionLabel: 'Marcar como ganho', scheduleRecommended: false, closesLead: true, checklist: ['Confirmar responsável pelo pós-venda.', 'Registrar próximo marco do cliente.'] }
    default:
      return { title: 'Registrar um próximo passo verificável', description: 'Toda conversa deve terminar com ação, responsável e data quando a oportunidade continuar aberta.', actionLabel: 'Definir próxima ação', scheduleRecommended: outcome !== 'answered', closesLead: false, checklist: contextChecklist }
  }
}

export function buildStructuredCallSummary(input: { notes: string; transcript: string; discovery: { decisionMaker?: string; currentSystem?: string; mainPain?: string; bestTime?: string }; outcomeLabel: string }) {
  const lines = [
    `Resultado: ${input.outcomeLabel}.`,
    input.discovery.decisionMaker ? `Decisor: ${input.discovery.decisionMaker}.` : '',
    input.discovery.currentSystem ? `Cenário atual: ${input.discovery.currentSystem}.` : '',
    input.discovery.mainPain ? `Dor principal: ${input.discovery.mainPain}.` : '',
    input.discovery.bestTime ? `Horário informado: ${input.discovery.bestTime}.` : '',
    input.notes.trim() ? `Observações: ${input.notes.trim()}` : '',
    !input.notes.trim() && input.transcript.trim() ? `Trecho registrado: ${input.transcript.trim().slice(0, 320)}${input.transcript.trim().length > 320 ? '…' : ''}` : '',
  ].filter(Boolean)
  return lines.join('\n')
}
