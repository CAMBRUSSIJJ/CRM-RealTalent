import type {
  AutomationAction,
  AutomationActionType,
  AutomationCondition,
  AutomationConditionField,
  AutomationConditionOperator,
  AutomationGuard,
  AutomationRule,
  AutomationRun,
  AutomationTriggerType,
  Lead,
  PipelineStage,
  WorkspaceSnapshot,
} from '../domain/types'
import { createId } from '../lib/id'

export const AUTOMATION_GUARD_FIELD = 'automation_guard' as const

export const DEFAULT_AUTOMATION_GUARD: AutomationGuard = {
  mode: 'simulation',
  cooldownHours: 12,
  maxRunsPerLeadPerDay: 2,
  maxActionsPerRun: 8,
  stopOnError: true,
  preventDuplicates: true,
  maxChainDepth: 4,
  loopWindowMinutes: 10,
}

export const triggerLabels: Record<AutomationTriggerType, string> = {
  lead_created: 'Lead criado',
  lead_imported: 'Lead importado',
  stage_changed: 'Mudança de etapa',
  activity_completed: 'Atividade concluída',
  activity_overdue: 'Atividade vencida',
  call_outcome: 'Resultado de ligação',
  meeting_scheduled: 'Reunião marcada',
  meeting_cancelled: 'Reunião cancelada',
  proposal_sent: 'Proposta enviada',
  date_reached: 'Data ou horário alcançado',
  lead_stale: 'Lead sem movimentação',
  goal_at_risk: 'Meta em risco',
  opportunity_won: 'Oportunidade ganha',
  opportunity_lost: 'Oportunidade perdida',
  manual: 'Execução manual',
}

export const conditionFieldLabels: Record<Exclude<AutomationConditionField, 'automation_guard'>, string> = {
  status: 'Status do lead',
  temperature: 'Temperatura',
  priority: 'Prioridade',
  stage_id: 'Etapa do Pipeline',
  source: 'Origem',
  city: 'Cidade',
  call_outcome: 'Resultado da ligação',
  owner_name: 'Responsável',
  tag: 'Tags',
  value: 'Valor da oportunidade',
  days_without_contact: 'Dias sem contato real',
  has_next_action: 'Possui próxima ação',
  attempt_count: 'Quantidade de tentativas',
  event_status: 'Status do evento',
  activity_type: 'Tipo da atividade',
}

export const operatorLabels: Record<AutomationConditionOperator, string> = {
  equals: 'é igual a',
  not_equals: 'é diferente de',
  contains: 'contém',
  not_contains: 'não contém',
  greater_than: 'é maior que',
  less_than: 'é menor que',
  is_empty: 'está vazio',
  is_not_empty: 'não está vazio',
}

export const actionLabels: Record<AutomationActionType, string> = {
  create_followup: 'Criar follow-up',
  create_call: 'Criar ligação',
  create_meeting: 'Criar reunião na Agenda',
  add_tag: 'Adicionar tag',
  remove_tag: 'Remover tag',
  set_priority: 'Alterar prioridade',
  set_temperature: 'Alterar temperatura',
  assign_owner: 'Atribuir responsável',
  move_stage: 'Mover etapa',
  start_cadence: 'Iniciar cadência',
  end_cadence: 'Encerrar cadência',
  create_note: 'Criar nota',
  internal_alert: 'Gerar alerta interno',
  mark_lost: 'Marcar como perdido',
  assisted_whatsapp: 'Preparar WhatsApp assistido',
  assisted_email: 'Preparar e-mail assistido',
  send_webhook: 'Enviar webhook',
}

const safeNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function readAutomationGuard(conditions: AutomationCondition[]): AutomationGuard {
  const condition = conditions.find((item) => item.field === AUTOMATION_GUARD_FIELD)
  if (!condition?.value) return { ...DEFAULT_AUTOMATION_GUARD, mode: 'simulation' }
  try {
    const parsed = JSON.parse(condition.value) as Partial<AutomationGuard>
    return {
      mode: parsed.mode === 'live' ? 'live' : 'simulation',
      cooldownHours: Math.max(0, safeNumber(parsed.cooldownHours, DEFAULT_AUTOMATION_GUARD.cooldownHours)),
      maxRunsPerLeadPerDay: Math.max(1, safeNumber(parsed.maxRunsPerLeadPerDay, DEFAULT_AUTOMATION_GUARD.maxRunsPerLeadPerDay)),
      maxActionsPerRun: Math.max(1, safeNumber(parsed.maxActionsPerRun, DEFAULT_AUTOMATION_GUARD.maxActionsPerRun)),
      stopOnError: parsed.stopOnError !== false,
      preventDuplicates: parsed.preventDuplicates !== false,
      maxChainDepth: Math.max(1, safeNumber(parsed.maxChainDepth, DEFAULT_AUTOMATION_GUARD.maxChainDepth)),
      loopWindowMinutes: Math.max(1, safeNumber(parsed.loopWindowMinutes, DEFAULT_AUTOMATION_GUARD.loopWindowMinutes)),
    }
  } catch {
    return { ...DEFAULT_AUTOMATION_GUARD, mode: 'simulation' }
  }
}

export function visibleAutomationConditions(conditions: AutomationCondition[]) {
  return conditions.filter((item) => item.field !== AUTOMATION_GUARD_FIELD)
}

export function withAutomationGuard(conditions: AutomationCondition[], guard: AutomationGuard) {
  return [
    ...visibleAutomationConditions(conditions),
    { id: createId('guard'), field: AUTOMATION_GUARD_FIELD, operator: 'equals', value: JSON.stringify(guard) } satisfies AutomationCondition,
  ]
}

export function automationRuleRisk(rule: Pick<AutomationRule, 'triggerType' | 'conditions' | 'actions'>) {
  const guard = readAutomationGuard(rule.conditions)
  let score = 0
  if (rule.actions.length >= 5) score += 2
  if (['lead_created', 'stage_changed', 'call_outcome', 'activity_completed'].includes(rule.triggerType)) score += 1
  if (rule.actions.some((action) => ['move_stage', 'mark_lost', 'end_cadence', 'send_webhook'].includes(action.type))) score += 2
  if (!visibleAutomationConditions(rule.conditions).length) score += 2
  if (guard.mode === 'simulation') score -= 2
  if (guard.cooldownHours >= 12) score -= 1
  return score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low'
}

export interface AutomationValidation {
  errors: string[]
  warnings: string[]
  risk: 'low' | 'medium' | 'high'
}

export function validateAutomationRule(rule: Pick<AutomationRule, 'name' | 'triggerType' | 'conditions' | 'actions'>, stages: PipelineStage[]): AutomationValidation {
  const errors: string[] = []
  const warnings: string[] = []
  const guard = readAutomationGuard(rule.conditions)
  const conditions = visibleAutomationConditions(rule.conditions)
  if (!rule.name.trim()) errors.push('Informe um nome para a automação.')
  if (!rule.actions.length) errors.push('Adicione pelo menos uma ação.')
  if (rule.actions.length > guard.maxActionsPerRun) errors.push(`A regra possui ${rule.actions.length} ações, acima do limite configurado de ${guard.maxActionsPerRun}.`)
  if (!conditions.length) warnings.push('A regra não possui condições e poderá atingir todos os leads do gatilho.')
  for (const action of rule.actions) {
    if (['move_stage'].includes(action.type) && !stages.some((stage) => stage.id === action.value)) errors.push('Uma ação aponta para uma etapa que não existe mais.')
    if (['add_tag', 'remove_tag', 'create_followup', 'create_call', 'create_meeting', 'create_note', 'internal_alert', 'start_cadence', 'assisted_whatsapp', 'assisted_email', 'send_webhook'].includes(action.type) && !action.value.trim()) errors.push(`${actionLabels[action.type]} precisa de um título ou valor.`)
  }
  if (rule.triggerType === 'stage_changed' && rule.actions.some((action) => action.type === 'move_stage') && !conditions.some((condition) => condition.field === 'stage_id')) warnings.push('Mover etapa após qualquer mudança pode criar um fluxo difícil de controlar. Adicione uma condição de etapa.')
  if (rule.triggerType === 'opportunity_lost' && rule.actions.some((action) => action.type === 'mark_lost')) warnings.push('A oportunidade já estará perdida quando este gatilho ocorrer.')
  const webhookIndex = rule.actions.findIndex((action) => action.type === 'send_webhook')
  if (webhookIndex >= 0 && webhookIndex !== rule.actions.length - 1) errors.push('O webhook deve ser a última ação da regra para evitar envios externos antes da conclusão das alterações internas.')
  if (rule.actions.filter((action) => action.type === 'send_webhook').length > 1) errors.push('Use apenas um webhook por regra. Crie regras separadas para destinos diferentes.')
  if (rule.triggerType === 'stage_changed' && rule.actions.some((action) => action.type === 'move_stage')) warnings.push('Esta combinação pode reativar a própria regra. A profundidade e a janela anti-loop serão aplicadas.')
  if (guard.maxChainDepth > 8) warnings.push('Profundidade de cadeia acima de 8 pode dificultar a auditoria.')
  if (guard.loopWindowMinutes < 2) warnings.push('A janela anti-loop abaixo de 2 minutos oferece pouca proteção contra ciclos rápidos.')
  if (guard.mode === 'live' && guard.cooldownHours === 0) warnings.push('A automação está ativa sem intervalo de segurança entre execuções.')
  if (!guard.preventDuplicates) warnings.push('A prevenção de tarefas duplicadas está desativada.')
  return { errors: Array.from(new Set(errors)), warnings: Array.from(new Set(warnings)), risk: automationRuleRisk(rule) }
}

export function describeAutomationAction(action: AutomationAction, stages: PipelineStage[]) {
  const stage = stages.find((item) => item.id === action.value)
  const delay = Math.max(0, Number(action.delayDays ?? 0))
  if (action.type === 'move_stage') return `Mover para ${stage?.name ?? 'etapa removida'}`
  if (action.type === 'mark_lost') return 'Mover para a etapa de perda e encerrar o fluxo'
  if (action.type === 'set_priority') return `Definir prioridade como ${action.value}`
  if (action.type === 'set_temperature') return `Definir temperatura como ${action.value}`
  if (action.type === 'create_meeting') return `Criar reunião “${action.value}” em ${delay} dia(s)`
  if (['create_followup', 'create_call'].includes(action.type)) return `${actionLabels[action.type]} “${action.value}” em ${delay} dia(s)`
  if (action.type === 'start_cadence') return `Iniciar cadência “${action.value}” com três contatos estruturados`
  if (action.type === 'end_cadence') return 'Concluir atividades pendentes da cadência atual'
  if (action.type === 'assisted_whatsapp' || action.type === 'assisted_email') return `${actionLabels[action.type]} com a mensagem “${action.value}”`
  if (action.type === 'send_webhook') return `Enviar evento para o webhook configurado`
  return `${actionLabels[action.type]}${action.value ? `: ${action.value}` : ''}`
}

export interface AutomationSimulationResult {
  matched: boolean
  leadName: string
  trigger: string
  conditionResults: Array<{ label: string; matched: boolean }>
  actions: string[]
  warnings: string[]
  mode: AutomationGuard['mode']
}

export interface AutomationRecipeDefinition {
  id: string
  category: 'Entrada' | 'Contato' | 'Pipeline' | 'Agenda' | 'Retenção' | 'Integrações'
  name: string
  description: string
  triggerType: AutomationTriggerType
  conditions: Array<Omit<AutomationCondition, 'id'>>
  actions: Array<Omit<AutomationAction, 'id'>>
}

export const AUTOMATION_RECIPES: AutomationRecipeDefinition[] = [
  {
    id: 'extension-lead-intake', category: 'Integrações', name: 'Lead da extensão pronto para contato',
    description: 'Identifica leads importados pela Extensão RealTalent, aplica uma etiqueta e cria a primeira abordagem. Começa pausada e em simulação.', triggerType: 'lead_imported',
    conditions: [{ field: 'source', operator: 'contains', value: 'Extensão RealTalent' }, { field: 'status', operator: 'equals', value: 'active' }],
    actions: [{ type: 'add_tag', value: 'Origem: Extensão' }, { type: 'create_followup', value: 'Validar e realizar primeiro contato', delayHours: 1 }],
  },
  {
    id: 'new-lead-first-action', category: 'Entrada', name: 'Novo lead com primeira ação',
    description: 'Adiciona tag de entrada e cria o primeiro follow-up no mesmo dia.', triggerType: 'lead_created',
    conditions: [{ field: 'status', operator: 'equals', value: 'active' }],
    actions: [{ type: 'add_tag', value: 'Novo lead' }, { type: 'create_followup', value: 'Realizar primeiro contato', delayDays: 0 }],
  },
  {
    id: 'new-lead-cadence', category: 'Entrada', name: 'Cadência automática de primeiro contato',
    description: 'Prepara uma sequência de três contatos para todo novo lead ativo. A receita começa em simulação para revisão segura.', triggerType: 'lead_created',
    conditions: [{ field: 'status', operator: 'equals', value: 'active' }],
    actions: [{ type: 'start_cadence', value: 'Cadência de primeiro contato' }],
  },
  {
    id: 'hot-lead', category: 'Entrada', name: 'Lead quente sem espera',
    description: 'Eleva a prioridade e gera contato imediato para oportunidades quentes.', triggerType: 'lead_created',
    conditions: [{ field: 'temperature', operator: 'equals', value: 'hot' }],
    actions: [{ type: 'set_priority', value: 'urgent' }, { type: 'create_call', value: 'Ligar para lead quente', delayDays: 0 }],
  },
  {
    id: 'no-answer', category: 'Contato', name: 'Retorno após não atender',
    description: 'Cria nova tentativa no próximo dia útil depois de uma ligação sem resposta.', triggerType: 'call_outcome',
    conditions: [{ field: 'call_outcome', operator: 'equals', value: 'no_answer' }],
    actions: [{ type: 'create_call', value: 'Nova tentativa de ligação', delayDays: 1 }, { type: 'add_tag', value: 'Sem atendimento' }],
  },
  {
    id: 'proposal-followup', category: 'Pipeline', name: 'Retorno após proposta',
    description: 'Cria acompanhamento e reforça prioridade quando a proposta é enviada.', triggerType: 'proposal_sent',
    conditions: [{ field: 'status', operator: 'equals', value: 'active' }],
    actions: [{ type: 'create_followup', value: 'Confirmar recebimento da proposta', delayDays: 1 }, { type: 'set_priority', value: 'high' }],
  },
  {
    id: 'meeting-confirmation', category: 'Agenda', name: 'Confirmar reunião',
    description: 'Cria uma tarefa de confirmação antes da reunião marcada.', triggerType: 'meeting_scheduled',
    conditions: [{ field: 'status', operator: 'equals', value: 'active' }],
    actions: [{ type: 'create_followup', value: 'Confirmar presença na reunião', delayDays: 0 }, { type: 'add_tag', value: 'Reunião marcada' }],
  },
  {
    id: 'meeting-cancelled', category: 'Agenda', name: 'Recuperar reunião cancelada',
    description: 'Cria retorno comercial e alerta interno quando uma reunião é cancelada.', triggerType: 'meeting_cancelled',
    conditions: [{ field: 'status', operator: 'equals', value: 'active' }],
    actions: [{ type: 'create_followup', value: 'Reagendar reunião cancelada', delayDays: 1 }, { type: 'internal_alert', value: 'Reunião cancelada precisa de recuperação' }],
  },
  {
    id: 'stale-hot-lead', category: 'Retenção', name: 'Lead quente parado',
    description: 'Escala a prioridade e cria alerta quando um lead quente fica sem movimentação.', triggerType: 'lead_stale',
    conditions: [{ field: 'temperature', operator: 'equals', value: 'hot' }, { field: 'days_without_contact', operator: 'greater_than', value: '3' }],
    actions: [{ type: 'set_priority', value: 'urgent' }, { type: 'internal_alert', value: 'Lead quente parado' }, { type: 'create_call', value: 'Retomar lead quente', delayDays: 0 }],
  },
  {
    id: 'missing-next-action', category: 'Retenção', name: 'Negócio sem próxima ação',
    description: 'Cria tarefa imediata e alerta interno quando uma oportunidade ativa fica sem próximo passo.', triggerType: 'lead_stale',
    conditions: [{ field: 'status', operator: 'equals', value: 'active' }, { field: 'has_next_action', operator: 'equals', value: 'false' }],
    actions: [{ type: 'create_followup', value: 'Definir próximo passo comercial', delayDays: 0 }, { type: 'internal_alert', value: 'Oportunidade ativa sem próxima ação' }],
  },
  {
    id: 'overdue-activity', category: 'Retenção', name: 'Atividade vencida',
    description: 'Aumenta a prioridade e registra alerta para atividades fora do prazo.', triggerType: 'activity_overdue',
    conditions: [{ field: 'status', operator: 'equals', value: 'active' }],
    actions: [{ type: 'set_priority', value: 'high' }, { type: 'internal_alert', value: 'Atividade comercial vencida' }],
  },
  {
    id: 'goal-risk', category: 'Retenção', name: 'Meta em risco',
    description: 'Gera um alerta interno quando o ritmo realizado fica muito abaixo do esperado.', triggerType: 'goal_at_risk',
    conditions: [],
    actions: [{ type: 'internal_alert', value: 'Meta comercial em risco: revisar rotina e volume de atividades' }],
  },
  {
    id: 'won-cleanup', category: 'Pipeline', name: 'Venda concluída',
    description: 'Encerra cadências, adiciona tag de cliente e registra nota de fechamento.', triggerType: 'opportunity_won',
    conditions: [{ field: 'status', operator: 'equals', value: 'won' }],
    actions: [{ type: 'end_cadence', value: '' }, { type: 'add_tag', value: 'Cliente' }, { type: 'create_note', value: 'Oportunidade concluída; tarefas pendentes encerradas.' }],
  },
  {
    id: 'lost-reason', category: 'Pipeline', name: 'Perda registrada',
    description: 'Encerra cadências e cria registro interno para análise de perdas.', triggerType: 'opportunity_lost',
    conditions: [{ field: 'status', operator: 'equals', value: 'lost' }],
    actions: [{ type: 'end_cadence', value: '' }, { type: 'add_tag', value: 'Analisar perda' }, { type: 'create_note', value: 'Oportunidade perdida; revisar motivo e origem.' }],
  },
]

export function createAutomationRecipe(recipeId: string) {
  const recipe = AUTOMATION_RECIPES.find((item) => item.id === recipeId)
  if (!recipe) throw new Error('Receita não encontrada.')
  return {
    name: recipe.name,
    enabled: false,
    triggerType: recipe.triggerType,
    conditions: withAutomationGuard(recipe.conditions.map((condition) => ({ ...condition, id: createId('condition') })), DEFAULT_AUTOMATION_GUARD),
    actions: recipe.actions.map((action) => ({ ...action, id: createId('action') })),
  }
}

export function automationSuccessRate(runs: AutomationRun[]) {
  const completed = runs.filter((run) => ['success', 'failed'].includes(run.status))
  if (!completed.length) return 100
  return Math.round((completed.filter((run) => run.status === 'success').length / completed.length) * 100)
}

export function automationRunForLeadToday(runs: AutomationRun[], ruleId: string, leadId: string, now = new Date()) {
  const start = new Date(now); start.setHours(0, 0, 0, 0)
  return runs.filter((run) => run.ruleId === ruleId && run.input.leadId === leadId && new Date(run.startedAt) >= start && run.status !== 'undone')
}

export function latestAutomationRunForLead(runs: AutomationRun[], ruleId: string, leadId: string) {
  return runs
    .filter((run) => run.ruleId === ruleId && run.input.leadId === leadId && run.status !== 'undone')
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0] ?? null
}

export function automationHealth(snapshot: WorkspaceSnapshot) {
  const runs = snapshot.automationRuns
  const active = snapshot.automationRules.filter((rule) => rule.enabled)
  const simulation = active.filter((rule) => readAutomationGuard(rule.conditions).mode === 'simulation').length
  const failures24h = runs.filter((run) => run.status === 'failed' && Date.now() - new Date(run.startedAt).getTime() <= 86_400_000).length
  const successRate = automationSuccessRate(runs.filter((run) => Date.now() - new Date(run.startedAt).getTime() <= 30 * 86_400_000))
  return { active: active.length, simulation, failures24h, successRate }
}

export function leadAttemptCount(snapshot: WorkspaceSnapshot, lead: Lead) {
  return snapshot.calls.filter((call) => call.leadId === lead.id).length
}
