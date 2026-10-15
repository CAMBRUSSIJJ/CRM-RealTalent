import type { AppRoute } from '../domain/types'
import { crmCapabilityById } from './realtalent-crm-capabilities'
import type { CrmCapabilityArgument, CrmCapabilityPlan, CrmCapabilityPlanStep, CrmCapabilityPlanningContext, CrmCapabilityPlanningResult } from './realtalent-crm-capability-planner'

export interface CrmPendingCapability {
  version: '3.4'
  capabilityId: string
  capabilityTitle: string
  seed: string
  knownArgs: CrmCapabilityArgument[]
  missingSlots: string[]
  clarification: string
  currentRoute: AppRoute | null
  createdAt: string
}

interface SlotRule {
  key: string
  aliases: string[]
  question: string
  choices?: string[]
}

const target = (question: string, aliases = ['record_id', 'record_query']): SlotRule => ({ key: 'record', aliases, question })
const changes = (aliases: string[], question = 'O que você quer alterar?'): SlotRule => ({ key: 'changes', aliases, question })
const slot = (key: string, question: string, aliases: string[] = [key], choices?: string[]): SlotRule => ({ key, aliases, question, choices })

const RULES: Record<string, SlotRule[]> = {
  'agent.undo_last': [],
  'crm.query': [slot('object', 'Qual informação do CRM você quer consultar — contatos, empresas, oportunidades, propostas, atividades, agenda, metas, catálogo, automações ou receita?', ['object'], ['contatos', 'empresas', 'oportunidades', 'propostas', 'atividades', 'agenda', 'metas', 'catálogo', 'automações', 'receita'])],
  'navigation.open': [slot('route', 'Qual módulo do CRM você quer abrir?', ['route'])],
  'notifications.dismiss_all': [],
  'notifications.restore_all': [],

  'contacts.create': [slot('name', 'Qual é o nome do contato que você quer criar?')],
  'contacts.update': [target('Qual contato você quer alterar?', ['record_id', 'record_query', 'contact_id', 'contact_query']), changes(['name', 'phone', 'email', 'job_title', 'notes', 'decision_role', 'do_not_contact'])],
  'contacts.delete': [target('Qual contato você quer excluir?', ['record_id', 'record_query', 'contact_id', 'contact_query'])],
  'companies.create': [slot('name', 'Qual é o nome da empresa que você quer criar?')],
  'companies.update': [target('Qual empresa você quer alterar?'), changes(['name', 'legal_name', 'cnpj', 'website', 'segment', 'phone', 'city', 'state', 'status'])],

  'leads.create': [slot('name', 'Qual é o nome do lead ou contato comercial que você quer criar?')],
  'leads.update': [target('Qual lead ou oportunidade você quer alterar?', ['record_id', 'record_query', 'lead_id', 'lead_query']), changes(['priority', 'temperature', 'owner_id', 'owner_name', 'next_action_at', 'value', 'notes', 'status'])],
  'leads.delete': [target('Qual lead ou oportunidade você quer excluir?', ['record_id', 'record_query', 'lead_id', 'lead_query'])],

  'pipeline.move': [target('Qual oportunidade você quer mover?', ['record_id', 'record_query', 'lead_id', 'lead_query']), slot('stage', 'Para qual etapa do pipeline você quer mover?', ['stage_id', 'stage_query'])],
  'pipeline.mark_won': [target('Qual oportunidade você quer marcar como ganha?', ['record_id', 'record_query', 'lead_id', 'lead_query'])],
  'pipeline.mark_lost': [target('Qual oportunidade você quer marcar como perdida?', ['record_id', 'record_query', 'lead_id', 'lead_query'])],
  'pipeline.create_stage': [slot('name', 'Qual nome você quer dar à nova etapa do pipeline?')],
  'pipeline.update_stage': [target('Qual etapa do pipeline você quer alterar?', ['stage_id', 'stage_query']), changes(['name', 'probability', 'color', 'is_won', 'is_lost'])],
  'pipeline.delete_stage': [target('Qual etapa do pipeline você quer excluir?', ['stage_id', 'stage_query'])],

  'tasks.create': [slot('title', 'Qual é a tarefa que você quer criar?')],
  'tasks.complete': [target('Qual tarefa você quer concluir?')],
  'tasks.delete': [target('Qual tarefa você quer excluir?')],
  'activities.create_note': [target('Em qual contato ou lead você quer registrar a nota?', ['record_id', 'record_query', 'lead_id', 'lead_query', 'contact_id', 'contact_query']), slot('body', 'O que você quer registrar na nota?', ['body', 'title'])],
  'activities.create_followup': [target('Para qual contato ou lead é o follow-up?', ['record_id', 'record_query', 'lead_id', 'lead_query', 'contact_id', 'contact_query']), slot('title', 'Qual é o objetivo desse follow-up?'), slot('due_at', 'Para quando você quer esse follow-up?', ['due_at'])],
  'activities.complete': [target('Qual atividade ou follow-up você quer concluir?')],
  'activities.delete': [target('Qual atividade ou follow-up você quer excluir?')],

  'calendar.create': [slot('title', 'Qual compromisso você quer criar na Agenda?'), slot('starts_at', 'Qual é a data e o horário do compromisso?', ['starts_at'])],
  'calendar.update': [target('Qual compromisso da Agenda você quer alterar?'), changes(['title', 'description', 'starts_at', 'ends_at', 'location', 'assignee_id'])],
  'calendar.delete': [target('Qual compromisso da Agenda você quer excluir?')],

  'calls.log_outcome': [target('Para qual contato ou lead você quer registrar a ligação?', ['record_id', 'record_query', 'lead_id', 'lead_query', 'contact_id', 'contact_query']), slot('outcome', 'Qual foi o resultado da ligação?', ['outcome'], ['atendeu', 'sem resposta', 'ocupado', 'caixa postal', 'pediu retorno', 'interessado', 'reunião marcada', 'proposta solicitada', 'não interessado', 'venda concluída'])],
  'calls.open': [],
  'communications.open': [],
  'communications.send_email': [target('Para qual contato ou lead você quer enviar o e-mail?', ['record_id', 'record_query', 'lead_id', 'lead_query', 'contact_id', 'contact_query']), slot('subject', 'Qual é o assunto do e-mail?'), slot('body', 'Qual mensagem você quer enviar no e-mail?')],
  'communications.send_whatsapp': [target('Para qual contato ou lead você quer enviar a mensagem?', ['record_id', 'record_query', 'lead_id', 'lead_query', 'contact_id', 'contact_query']), slot('body', 'Qual mensagem você quer enviar pelo WhatsApp?')],

  'proposals.create': [target('Para qual lead ou oportunidade você quer criar a proposta?', ['lead_id', 'lead_query', 'record_id', 'record_query']), slot('product', 'Qual produto ou serviço deve entrar na proposta?', ['product_id', 'product_query'])],
  'proposals.update_status': [target('Qual proposta você quer atualizar?', ['proposal_id', 'record_id', 'record_query']), slot('status', 'Qual deve ser o novo status da proposta?', ['status'], ['rascunho', 'enviada', 'visualizada', 'aceita', 'rejeitada', 'expirada', 'cancelada'])],
  'proposals.make_official': [target('Qual proposta você quer definir como oficial?', ['proposal_id', 'record_id', 'record_query'])],
  'proposals.close_opportunity': [target('Qual proposta aceita deve fechar a oportunidade?', ['proposal_id', 'record_id', 'record_query'])],
  'proposals.delete': [target('Qual proposta você quer excluir?', ['proposal_id', 'record_id', 'record_query'])],

  'catalog.create_product': [slot('name', 'Qual é o nome do produto ou serviço?'), slot('price', 'Qual é o preço desse item?', ['price'])],
  'catalog.update_product': [target('Qual produto ou serviço do catálogo você quer alterar?'), changes(['name', 'description', 'category', 'price', 'status'])],
  'catalog.delete_product': [target('Qual produto ou serviço do catálogo você quer excluir?')],

  'goals.create': [slot('metric', 'Qual tipo de meta você quer criar?', ['metric'], ['ligações', 'contatos', 'follow-ups', 'reuniões', 'propostas', 'vendas', 'receita', 'novos leads']), slot('target_value', 'Qual é o valor ou quantidade da meta?', ['target_value']), slot('period', 'Para qual período é essa meta?', ['period_start', 'period_end'])],
  'goals.update': [target('Qual meta você quer alterar?'), changes(['target_value', 'period_start', 'period_end'])],
  'goals.delete': [target('Qual meta você quer excluir?')],

  'playbooks.create': [slot('title', 'Qual é o título do roteiro comercial?')],
  'playbooks.update': [target('Qual roteiro comercial você quer alterar?'), changes(['title', 'description'])],
  'playbooks.delete': [target('Qual roteiro comercial você quer excluir?')],

  'automations.toggle': [target('Qual automação você quer ativar ou desativar?')],
  'automations.run': [target('Qual automação você quer executar?'), slot('lead', 'Para qual contato ou lead a automação deve rodar?', ['lead_id', 'lead_query'])],
  'automations.delete': [target('Qual automação você quer excluir?')],

  'teams.invite': [slot('email', 'Qual é o e-mail da pessoa que você quer convidar?')],
  'teams.update_role': [target('Qual membro da equipe você quer alterar?', ['member_id', 'member_query']), slot('role', 'Qual função ou perfil esse membro deve ter?', ['role'])],
  'teams.remove_member': [target('Qual membro da equipe você quer remover?', ['member_id', 'member_query'])],

  'revenue.create': [slot('amount', 'Qual valor de receita você quer lançar?', ['amount'])],
  'revenue.update_status': [target('Qual lançamento de receita você quer atualizar?'), slot('status', 'Qual deve ser o novo status da receita?', ['status'], ['prevista', 'reconhecida', 'cancelada'])],

  'prospecting.search': [slot('segment', 'Que tipo de empresa você quer encontrar no Garimpo?', ['segment', 'use_icp']), slot('city', 'Em qual cidade ou região você quer procurar?', ['city'])],
  'prospecting.build_icp': [],
  'prospecting.rank': [],
  'prospecting.analyze': [],
  'prospecting.approve_top': [slot('quantity', 'Quantas das melhores empresas você quer aprovar?', ['quantity'])],
  'prospecting.discard_low': [slot('max_score', 'Até qual score você quer considerar baixa prioridade para descarte?', ['max_score'])],
  'prospecting.send_to_crm': [slot('quantity', 'Quantas empresas aprovadas você quer enviar para o CRM?', ['quantity'])],
  'prospecting.open': [],
  'settings.open': [],
}

const hasArg = (step: CrmCapabilityPlanStep, aliases: string[]) => aliases.some((name) => step.args.some((arg) => arg.name === name && arg.value.trim()))

const targetCanUseRouteContext = (capabilityId: string, context: CrmCapabilityPlanningContext) => {
  if (context.focusLeadId && [
    'leads.update','leads.delete','pipeline.move','pipeline.mark_won','pipeline.mark_lost','activities.create_note','activities.create_followup','calls.log_outcome','calls.open','communications.open','communications.send_email','communications.send_whatsapp','proposals.create','automations.run',
  ].includes(capabilityId)) return true
  if (context.focusProposalId && ['proposals.update_status','proposals.make_official','proposals.close_opportunity','proposals.delete'].includes(capabilityId)) return true
  return false
}

const injectRouteContext = (step: CrmCapabilityPlanStep, context: CrmCapabilityPlanningContext): CrmCapabilityPlanStep => {
  if (context.focusLeadId && !hasArg(step, ['record_id','record_query','lead_id','lead_query','contact_id','contact_query'])) {
    if (['leads.update','leads.delete','pipeline.move','pipeline.mark_won','pipeline.mark_lost','activities.create_note','activities.create_followup','calls.log_outcome','calls.open','communications.open','communications.send_email','communications.send_whatsapp','proposals.create','automations.run'].includes(step.capabilityId)) {
      return { ...step, args: [...step.args, { name: 'lead_id', value: context.focusLeadId }] }
    }
  }
  if (context.focusProposalId && !hasArg(step, ['proposal_id','record_id','record_query']) && ['proposals.update_status','proposals.make_official','proposals.close_opportunity','proposals.delete'].includes(step.capabilityId)) {
    return { ...step, args: [...step.args, { name: 'proposal_id', value: context.focusProposalId }] }
  }
  return step
}

const ruleSatisfied = (step: CrmCapabilityPlanStep, rule: SlotRule) => {
  if (rule.key === 'period') return hasArg(step, ['period_start']) && hasArg(step, ['period_end'])
  if (step.capabilityId === 'prospecting.search' && rule.key === 'segment') {
    if (hasArg(step, ['segment'])) return true
    const useIcp = step.args.find((item) => item.name === 'use_icp')?.value.trim().toLowerCase() ?? ''
    return ['1','true','yes','sim'].includes(useIcp)
  }
  return hasArg(step, rule.aliases)
}

const missingForStep = (step: CrmCapabilityPlanStep, context: CrmCapabilityPlanningContext): SlotRule[] => {
  const rules = RULES[step.capabilityId] ?? []
  return rules.filter((rule) => {
    if (rule.key === 'record' && targetCanUseRouteContext(step.capabilityId, context)) return false
    return !ruleSatisfied(step, rule)
  })
}

const questionFor = (rule: SlotRule) => rule.choices?.length
  ? `${rule.question} ${rule.choices.join(', ')} ou outra opção.`
  : rule.question

export const crmCapabilitySlotRulesForModel = (capabilityId: string) => (RULES[capabilityId] ?? []).map((rule) => ({
  key: rule.key,
  accepts: [...rule.aliases],
  question: rule.question,
  choices: rule.choices ?? [],
}))

export function validateAndEnrichCapabilitySlots(result: CrmCapabilityPlanningResult, context: CrmCapabilityPlanningContext): CrmCapabilityPlanningResult {
  const enrichedSteps = result.plan.steps.map((step) => injectRouteContext(step, context))
  const plan: CrmCapabilityPlan = { ...result.plan, steps: enrichedSteps }
  for (const step of enrichedSteps) {
    const missing = missingForStep(step, context)
    if (!missing.length) continue
    const knownArgs = step.args.filter((arg) => arg.value.trim())
    const first = missing[0]
    return {
      ...result,
      decision: 'clarify',
      plan: {
        ...plan,
        confidence: Math.max(plan.confidence, 0.8),
        needsClarification: true,
        clarification: questionFor(first),
        pendingCapabilityId: step.capabilityId,
        missingSlots: missing.map((item) => item.key),
        knownArgs,
      },
    }
  }
  return { ...result, plan }
}

export function pendingCapabilityFromPlan(plan: CrmCapabilityPlan, seed: string, context: CrmCapabilityPlanningContext): CrmPendingCapability | null {
  if (!plan.needsClarification) return null
  const capabilityId = plan.pendingCapabilityId || plan.steps[0]?.capabilityId || '__pending_intent__'
  const definition = crmCapabilityById(capabilityId)
  const step = plan.steps.find((item) => item.capabilityId === capabilityId) ?? plan.steps[0]
  const knownArgs = plan.knownArgs?.length ? plan.knownArgs : step?.args ?? []
  return {
    version: '3.4',
    capabilityId,
    capabilityTitle: definition?.title || 'Ação em andamento no CRM',
    seed: seed.trim().slice(0, 5000),
    knownArgs: knownArgs.filter((item) => item.value.trim()).slice(0, 24),
    missingSlots: (plan.missingSlots?.length ? plan.missingSlots : ['clarification']).slice(0, 12),
    clarification: plan.clarification || 'Qual informação está faltando para concluir esta ação?',
    currentRoute: context.currentRoute ?? null,
    createdAt: new Date().toISOString(),
  }
}

export function genericPendingIntent(seed: string, clarification: string, context: CrmCapabilityPlanningContext, label = 'Ação em andamento no CRM'): CrmPendingCapability {
  return {
    version: '3.4',
    capabilityId: '__pending_intent__',
    capabilityTitle: label,
    seed: seed.trim().slice(0, 5000),
    knownArgs: [],
    missingSlots: ['clarification'],
    clarification: clarification || 'Qual informação está faltando para concluir esta ação?',
    currentRoute: context.currentRoute ?? null,
    createdAt: new Date().toISOString(),
  }
}

export function pendingCapabilityContext(pending: CrmPendingCapability | null | undefined) {
  if (!pending) return null
  return {
    capabilityId: pending.capabilityId,
    capabilityTitle: pending.capabilityTitle,
    originalRequest: pending.seed,
    knownArgs: pending.knownArgs,
    missingSlots: pending.missingSlots,
    clarification: pending.clarification,
  }
}

export function continuationPrompt(pending: CrmPendingCapability, reply: string) {
  const compactKnown = pending.knownArgs.map((item) => `${item.name}=${item.value}`).join(', ')
  return [
    pending.seed,
    compactKnown ? `Dados já entendidos: ${compactKnown}.` : '',
    `Resposta do usuário à clarificação “${pending.clarification}”: ${reply.trim()}.`,
    `Continue a mesma ação ${pending.capabilityId}; preserve tudo que já foi entendido e preencha apenas o que faltava.`,
  ].filter(Boolean).join(' ')
}

export function crmClarificationSuggestions(capabilityId: string, missingSlot?: string) {
  const rule = (RULES[capabilityId] ?? []).find((item) => !missingSlot || item.key === missingSlot)
  return (rule?.choices ?? []).slice(0, 8)
}
