import { NativeSelectionSelect } from '../../components/selection'
import { AlertTriangle, Plus, Save, ShieldCheck, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import type { AutomationAction, AutomationCondition, AutomationGuard, AutomationRule, AutomationTriggerType, PipelineStage } from '../../domain/types'
import { createId } from '../../lib/id'
import type { AutomationWebhook } from '../../services/automation-webhooks'
import {
  actionHelp,
  actionLabels,
  conditionFieldHelp,
  conditionFieldLabels,
  DEFAULT_AUTOMATION_GUARD,
  operatorLabels,
  readAutomationGuard,
  triggerHelp,
  triggerLabels,
  validateAutomationRule,
  visibleAutomationConditions,
  withAutomationGuard,
} from '../../services/automation-workspace'

const blankCondition = (): AutomationCondition => ({ id: createId('condition'), field: 'temperature', operator: 'equals', value: 'hot' })
const blankAction = (): AutomationAction => ({ id: createId('action'), type: 'create_followup', value: 'Follow-up automático', delayDays: 1 })

interface AutomationModalProps {
  open: boolean
  rule: AutomationRule | null
  stages: PipelineStage[]
  webhooks: AutomationWebhook[]
  loading?: boolean
  onClose(): void
  onSubmit(input: Pick<AutomationRule, 'name' | 'enabled' | 'triggerType' | 'conditions' | 'actions'>): Promise<void>
}

function ConditionValue({ condition, stages, onChange }: { condition: AutomationCondition; stages: PipelineStage[]; onChange(value: string): void }) {
  if (['is_empty', 'is_not_empty'].includes(condition.operator)) return <span className="automation-no-value">Sem valor adicional</span>
  if (condition.field === 'temperature') return <NativeSelectionSelect aria-label="Valor da condição" value={condition.value} onChange={(event) => onChange(event.target.value)}><option value="cold">Frio</option><option value="warm">Morno</option><option value="hot">Quente</option></NativeSelectionSelect>
  if (condition.field === 'priority') return <NativeSelectionSelect aria-label="Valor da condição" value={condition.value} onChange={(event) => onChange(event.target.value)}><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option><option value="urgent">Urgente</option></NativeSelectionSelect>
  if (condition.field === 'status') return <NativeSelectionSelect aria-label="Valor da condição" value={condition.value} onChange={(event) => onChange(event.target.value)}><option value="active">Ativo</option><option value="won">Ganho</option><option value="lost">Perdido</option><option value="archived">Arquivado</option></NativeSelectionSelect>
  if (condition.field === 'stage_id') return <NativeSelectionSelect aria-label="Valor da condição" value={condition.value} onChange={(event) => onChange(event.target.value)}>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</NativeSelectionSelect>
  if (condition.field === 'call_outcome') return <NativeSelectionSelect aria-label="Valor da condição" value={condition.value} onChange={(event) => onChange(event.target.value)}><option value="answered">Atendeu</option><option value="no_answer">Não atendeu</option><option value="busy">Ocupado</option><option value="voicemail">Caixa postal</option><option value="callback_requested">Pediu retorno</option><option value="interested">Demonstrou interesse</option><option value="meeting_scheduled">Reunião marcada</option><option value="proposal_requested">Solicitou proposta</option><option value="proposal_sent">Proposta enviada</option><option value="wrong_person">Pessoa errada</option><option value="invalid_number">Número inválido</option><option value="not_interested">Sem interesse</option><option value="sale_completed">Venda concluída</option></NativeSelectionSelect>
  if (condition.field === 'has_next_action') return <NativeSelectionSelect aria-label="Valor da condição" value={condition.value} onChange={(event) => onChange(event.target.value)}><option value="true">Sim</option><option value="false">Não</option></NativeSelectionSelect>
  if (condition.field === 'event_status') return <NativeSelectionSelect aria-label="Valor da condição" value={condition.value} onChange={(event) => onChange(event.target.value)}><option value="confirmed">Confirmado</option><option value="tentative">Provisório</option><option value="completed">Concluído</option><option value="cancelled">Cancelado</option></NativeSelectionSelect>
  if (condition.field === 'activity_type') return <NativeSelectionSelect aria-label="Valor da condição" value={condition.value} onChange={(event) => onChange(event.target.value)}><option value="call">Ligação</option><option value="followup">Follow-up</option><option value="meeting">Reunião</option><option value="note">Nota</option><option value="stage_change">Mudança de etapa</option></NativeSelectionSelect>
  if (['value', 'days_without_contact', 'attempt_count'].includes(condition.field)) return <input aria-label="Valor da condição" type="number" min="0" value={condition.value} onChange={(event) => onChange(event.target.value)} />
  return <input aria-label="Valor da condição" value={condition.value} onChange={(event) => onChange(event.target.value)} placeholder={condition.field === 'city' ? 'Ex.: Canoas' : condition.field === 'tag' ? 'Ex.: Lead quente' : 'Informe o valor'} />
}

function initialActionValue(type: AutomationAction['type'], stages: PipelineStage[], webhooks: AutomationWebhook[]) {
  if (type === 'move_stage') return stages[0]?.id ?? ''
  if (type === 'set_priority') return 'medium'
  if (type === 'set_temperature') return 'warm'
  if (type === 'mark_lost' || type === 'end_cadence') return ''
  if (type === 'create_meeting') return 'Reunião comercial'
  if (type === 'create_call') return 'Realizar ligação'
  if (type === 'create_followup') return 'Follow-up automático'
  if (type === 'start_cadence') return 'Cadência de prospecção'
  if (type === 'send_webhook') return webhooks.find((item) => item.enabled)?.id ?? webhooks[0]?.id ?? ''
  if (type === 'wait' || type === 'branch_if') return ''
  return ''
}

function ActionValue({ action, stages, webhooks, onChange }: { action: AutomationAction; stages: PipelineStage[]; webhooks: AutomationWebhook[]; onChange(input: Partial<AutomationAction>): void }) {
  if (action.type === 'set_priority') return <NativeSelectionSelect aria-label="Valor da ação" value={action.value} onChange={(event) => onChange({ value: event.target.value })}><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option><option value="urgent">Urgente</option></NativeSelectionSelect>
  if (action.type === 'set_temperature') return <NativeSelectionSelect aria-label="Valor da ação" value={action.value} onChange={(event) => onChange({ value: event.target.value })}><option value="cold">Frio</option><option value="warm">Morno</option><option value="hot">Quente</option></NativeSelectionSelect>
  if (action.type === 'move_stage') return <NativeSelectionSelect aria-label="Valor da ação" value={action.value} onChange={(event) => onChange({ value: event.target.value })}>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</NativeSelectionSelect>
  if (action.type === 'mark_lost' || action.type === 'end_cadence') return <span className="automation-no-value">Ação automática sem valor adicional</span>
  if (action.type === 'send_webhook') return webhooks.length ? <NativeSelectionSelect aria-label="Webhook de destino" value={action.value} onChange={(event) => onChange({ value: event.target.value })}><option value="">Selecione o webhook</option>{webhooks.map((webhook) => <option key={webhook.id} value={webhook.id}>{webhook.name}{webhook.enabled ? '' : ' · pausado'}</option>)}</NativeSelectionSelect> : <span className="automation-no-value automation-no-value--warning">Cadastre um webhook na aba Webhooks antes de usar esta ação.</span>
  if (action.type === 'wait') return <div className="automation-action-value automation-action-value--runtime"><label><span>Dias</span><input aria-label="Dias de espera" type="number" min="0" max="365" value={action.delayDays ?? 0} onChange={(event) => onChange({ delayDays: Number(event.target.value) })} /></label><label><span>Horas</span><input aria-label="Horas de espera" type="number" min="0" max="23" value={action.delayHours ?? 0} onChange={(event) => onChange({ delayHours: Number(event.target.value) })} /></label><label><span>Minutos</span><input aria-label="Minutos de espera" type="number" min="0" max="59" value={action.delayMinutes ?? 0} onChange={(event) => onChange({ delayMinutes: Number(event.target.value) })} /></label></div>
  if (action.type === 'branch_if') return <div className="automation-action-value automation-action-value--runtime"><NativeSelectionSelect aria-label="Campo da ramificação" value={action.branchField ?? 'status'} onChange={(event) => onChange({ branchField: event.target.value as NonNullable<AutomationAction['branchField']> })}>{Object.entries(conditionFieldLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelectionSelect><NativeSelectionSelect aria-label="Operador da ramificação" value={action.branchOperator ?? 'equals'} onChange={(event) => onChange({ branchOperator: event.target.value as NonNullable<AutomationAction['branchOperator']> })}>{Object.entries(operatorLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelectionSelect>{!['is_empty', 'is_not_empty'].includes(action.branchOperator ?? 'equals') ? <input aria-label="Valor da ramificação" value={action.branchValue ?? ''} onChange={(event) => onChange({ branchValue: event.target.value })} placeholder="Valor esperado" /> : <span className="automation-no-value">Sem valor adicional</span>}<label><span>Se falso, pular</span><input aria-label="Etapas a pular" type="number" min="1" max="20" value={action.branchSkip ?? 1} onChange={(event) => onChange({ branchSkip: Number(event.target.value) })} /></label></div>
  const delayed = ['create_followup', 'create_call', 'create_meeting'].includes(action.type)
  return <div className="automation-action-value">
    <input aria-label="Valor da ação" value={action.value} onChange={(event) => onChange({ value: event.target.value })} placeholder={action.type === 'add_tag' || action.type === 'remove_tag' ? 'Nome da tag' : action.type === 'assign_owner' ? 'Nome do responsável' : action.type === 'assisted_whatsapp' || action.type === 'assisted_email' ? 'Mensagem ou assunto' : 'Título ou descrição'} />
    {delayed ? <label><span>Prazo em dias</span><input aria-label="Prazo em dias" type="number" min="0" max="365" value={action.delayDays ?? 0} onChange={(event) => onChange({ delayDays: Number(event.target.value) })} /></label> : null}
    {action.type === 'create_meeting' ? <label><span>Duração</span><NativeSelectionSelect aria-label="Duração da reunião" value={action.durationMinutes ?? 30} onChange={(event) => onChange({ durationMinutes: Number(event.target.value) })}><option value="15">15 min</option><option value="30">30 min</option><option value="45">45 min</option><option value="60">60 min</option></NativeSelectionSelect></label> : null}
  </div>
}

export function AutomationModal({ open, rule, stages, webhooks, loading = false, onClose, onSubmit }: AutomationModalProps) {
  const [name, setName] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [triggerType, setTriggerType] = useState<AutomationTriggerType>('lead_created')
  const [conditions, setConditions] = useState<AutomationCondition[]>([])
  const [actions, setActions] = useState<AutomationAction[]>([blankAction()])
  const [guard, setGuard] = useState<AutomationGuard>(DEFAULT_AUTOMATION_GUARD)

  useEffect(() => {
    if (!open) return
    setName(rule?.name ?? '')
    setEnabled(rule?.enabled ?? false)
    setTriggerType(rule?.triggerType ?? 'lead_created')
    setConditions(rule ? visibleAutomationConditions(rule.conditions).map((item) => ({ ...item })) : [])
    setActions(rule?.actions.length ? rule.actions.map((item) => ({ ...item })) : [blankAction()])
    setGuard(rule ? readAutomationGuard(rule.conditions) : DEFAULT_AUTOMATION_GUARD)
  }, [open, rule])

  const fullConditions = useMemo(() => withAutomationGuard(conditions, guard), [conditions, guard])
  const validation = useMemo(() => validateAutomationRule({ name, triggerType, conditions: fullConditions, actions }, stages), [actions, fullConditions, name, stages, triggerType])

  const updateCondition = (id: string, patch: Partial<AutomationCondition>) => setConditions((current) => current.map((item) => item.id === id ? {
    ...item, ...patch,
    ...(patch.field ? { value: patch.field === 'stage_id' ? stages[0]?.id ?? '' : patch.field === 'call_outcome' ? 'answered' : patch.field === 'temperature' ? 'hot' : patch.field === 'priority' ? 'medium' : patch.field === 'status' ? 'active' : patch.field === 'has_next_action' ? 'true' : patch.field === 'event_status' ? 'confirmed' : patch.field === 'activity_type' ? 'followup' : ['value', 'days_without_contact', 'attempt_count'].includes(patch.field) ? '0' : '' } : {}),
  } : item))
  const updateAction = (id: string, patch: Partial<AutomationAction>) => setActions((current) => current.map((item) => item.id === id ? {
    ...item, ...patch,
    ...(patch.type ? {
      value: initialActionValue(patch.type, stages, webhooks),
      delayDays: ['create_followup', 'create_call', 'create_meeting'].includes(patch.type) ? 0 : patch.type === 'wait' ? 0 : undefined,
      delayHours: patch.type === 'wait' ? 0 : undefined, delayMinutes: patch.type === 'wait' ? 5 : undefined,
      durationMinutes: patch.type === 'create_meeting' ? 30 : undefined,
      branchField: patch.type === 'branch_if' ? 'status' : undefined, branchOperator: patch.type === 'branch_if' ? 'equals' : undefined, branchValue: patch.type === 'branch_if' ? 'active' : undefined, branchSkip: patch.type === 'branch_if' ? 1 : undefined,
    } : {}),
  } : item))

  const submit = () => {
    if (validation.errors.length) return
    void onSubmit({ name: name.trim(), enabled, triggerType, conditions: fullConditions, actions })
  }

  return (
    <Modal open={open} title={rule ? 'Editar automação' : 'Nova automação'} subtitle="Crie em linguagem simples: Quando → Se → Então. Regras novas são salvas pausadas para você testar antes de ativar." size="lg" onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={loading} disabled={Boolean(validation.errors.length)} onClick={submit}><Save size={16} /> {rule ? 'Salvar alterações' : 'Salvar pausada'}</Button></>}>
      <div className="automation-builder automation-builder--professional automation-builder--guided">
        <div className="form-grid">
          <label className="form-field form-field--full"><span>Nome da automação</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Retorno após não atender" /></label>
        </div>

        <section className="automation-builder-flow" aria-label="Fluxo da automação">
          <article className="is-primary"><span>1</span><small>QUANDO</small><strong>{triggerLabels[triggerType]}</strong><p>{triggerHelp[triggerType]}</p></article>
          <i>→</i>
          <article><span>2</span><small>SE</small><strong>{conditions.length ? `${conditions.length} condição(ões)` : 'Sem filtro adicional'}</strong><p>{conditions.length ? 'A regra só continua quando todas as condições abaixo forem verdadeiras.' : 'Opcional: sem condições, qualquer lead que gerar o gatilho seguirá para as ações.'}</p></article>
          <i>→</i>
          <article><span>3</span><small>ENTÃO</small><strong>{actions.length} ação(ões)</strong><p>As ações serão processadas na ordem em que aparecem.</p></article>
        </section>

        <section className="builder-section builder-section--guided"><header><div><span className="eyebrow">1 · Quando</span><h3>O que inicia esta automação?</h3><p>Escolha o evento que dispara a regra.</p></div></header>
          <label className="form-field form-field--full"><span>Gatilho</span><NativeSelectionSelect value={triggerType} onChange={(event) => setTriggerType(event.target.value as AutomationTriggerType)}>{Object.entries(triggerLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelectionSelect><small className="automation-field-help">{triggerHelp[triggerType]}</small></label>
        </section>

        <section className="builder-section builder-section--guided"><header><div><span className="eyebrow">2 · Se · opcional</span><h3>Quais condições precisam ser verdadeiras?</h3><p>Use condições somente quando precisar restringir quem entra no fluxo.</p></div><Button size="sm" variant="secondary" onClick={() => setConditions((current) => [...current, blankCondition()])}><Plus size={15} /> Adicionar condição</Button></header>
          {conditions.length ? <div className="builder-rows">{conditions.map((condition) => <div className="builder-row-wrap" key={condition.id}><div className="builder-row"><NativeSelectionSelect aria-label="Campo da condição" value={condition.field} onChange={(event) => updateCondition(condition.id, { field: event.target.value as AutomationCondition['field'] })}>{Object.entries(conditionFieldLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelectionSelect><NativeSelectionSelect aria-label="Operador" value={condition.operator} onChange={(event) => updateCondition(condition.id, { operator: event.target.value as AutomationCondition['operator'] })}>{Object.entries(operatorLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelectionSelect><ConditionValue condition={condition} stages={stages} onChange={(value) => updateCondition(condition.id, { value })} /><button type="button" className="icon-button icon-button--danger" aria-label="Remover condição" onClick={() => setConditions((current) => current.filter((item) => item.id !== condition.id))}><Trash2 size={16} /></button></div><small className="automation-field-help">{conditionFieldHelp[condition.field as Exclude<AutomationCondition['field'], 'automation_guard'>] ?? 'Condição de segurança interna.'}</small></div>)}</div> : <div className="automation-empty-condition"><strong>Sem condições adicionais</strong><span>O gatilho será suficiente para iniciar o fluxo. Adicione uma condição se quiser restringir a automação.</span></div>}
        </section>

        <section className="builder-section builder-section--guided"><header><div><span className="eyebrow">3 · Então</span><h3>O que o CRM deve fazer?</h3><p>As ações são executadas de cima para baixo.</p></div><Button size="sm" variant="secondary" onClick={() => setActions((current) => [...current, blankAction()])}><Plus size={15} /> Adicionar ação</Button></header>
          <div className="builder-rows">{actions.map((action) => <div className="builder-row-wrap" key={action.id}><div className="builder-row builder-row--action"><NativeSelectionSelect aria-label="Tipo da ação" value={action.type} onChange={(event) => updateAction(action.id, { type: event.target.value as AutomationAction['type'] })}>{Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelectionSelect><ActionValue action={action} stages={stages} webhooks={webhooks} onChange={(patch) => updateAction(action.id, patch)} /><button type="button" className="icon-button icon-button--danger" aria-label="Remover ação" disabled={actions.length === 1} onClick={() => setActions((current) => current.filter((item) => item.id !== action.id))}><Trash2 size={16} /></button></div><small className="automation-field-help">{actionHelp[action.type]}</small></div>)}</div>
        </section>

        <section className="builder-section automation-safety-section builder-section--guided"><header><div><span className="eyebrow"><ShieldCheck size={13} /> 4 · Testar e ativar</span><h3>Escolha como a regra deve operar</h3><p>Use Simulação enquanto estiver ajustando. Execução real exige um teste válido antes da ativação.</p></div><span className={`automation-risk automation-risk--${validation.risk}`}>Risco {validation.risk === 'low' ? 'baixo' : validation.risk === 'medium' ? 'médio' : 'alto'}</span></header>
          <div className="automation-mode-choice">
            <label className={guard.mode === 'simulation' ? 'is-active' : ''}><input type="radio" name="automation-mode" value="simulation" checked={guard.mode === 'simulation'} onChange={() => setGuard((current) => ({ ...current, mode: 'simulation' }))} /><span><strong>Simulação</strong><small>Processa gatilhos e registra o que faria, sem alterar dados.</small></span></label>
            <label className={guard.mode === 'live' ? 'is-active' : ''}><input type="radio" name="automation-mode" value="live" checked={guard.mode === 'live'} onChange={() => setGuard((current) => ({ ...current, mode: 'live' }))} /><span><strong>Execução real</strong><small>Altera o CRM. Depois de salvar, faça um teste aprovado antes de ligar.</small></span></label>
          </div>
          <div className="automation-save-state"><ShieldCheck size={16} /><span>{rule ? (enabled ? 'Esta regra está ligada. Se a lógica mudar, o CRM irá pausá-la até um novo teste.' : 'Esta regra permanecerá pausada até você ativá-la na lista.') : 'A nova automação será criada pausada, mesmo que o modo escolhido seja Execução real.'}</span></div>
          <details className="automation-advanced-safety"><summary>Configurações avançadas de segurança</summary><div className="automation-safety-grid">
            <label className="form-field"><span>Intervalo entre execuções</span><NativeSelectionSelect value={guard.cooldownHours} onChange={(event) => setGuard((current) => ({ ...current, cooldownHours: Number(event.target.value) }))}><option value="0">Sem intervalo</option><option value="1">1 hora</option><option value="6">6 horas</option><option value="12">12 horas</option><option value="24">24 horas</option><option value="72">3 dias</option></NativeSelectionSelect></label>
            <label className="form-field"><span>Limite por lead/dia</span><input type="number" min="1" max="20" value={guard.maxRunsPerLeadPerDay} onChange={(event) => setGuard((current) => ({ ...current, maxRunsPerLeadPerDay: Number(event.target.value) }))} /></label>
            <label className="form-field"><span>Máximo de ações por execução</span><input type="number" min="1" max="20" value={guard.maxActionsPerRun} onChange={(event) => setGuard((current) => ({ ...current, maxActionsPerRun: Number(event.target.value) }))} /></label>
            <label className="form-field"><span>Profundidade máxima da cadeia</span><input type="number" min="1" max="12" value={guard.maxChainDepth} onChange={(event) => setGuard((current) => ({ ...current, maxChainDepth: Number(event.target.value) }))} /></label>
            <label className="form-field"><span>Janela anti-loop</span><NativeSelectionSelect value={guard.loopWindowMinutes} onChange={(event) => setGuard((current) => ({ ...current, loopWindowMinutes: Number(event.target.value) }))}><option value="2">2 minutos</option><option value="5">5 minutos</option><option value="10">10 minutos</option><option value="30">30 minutos</option><option value="60">1 hora</option></NativeSelectionSelect></label>
            <label className="toggle-field"><input type="checkbox" checked={guard.preventDuplicates} onChange={(event) => setGuard((current) => ({ ...current, preventDuplicates: event.target.checked }))} /><span><strong>Evitar duplicidades</strong><small>Não recria tarefas iguais para o mesmo dia.</small></span></label>
            <label className="toggle-field"><input type="checkbox" checked={guard.stopOnError} onChange={(event) => setGuard((current) => ({ ...current, stopOnError: event.target.checked }))} /><span><strong>Parar em caso de erro</strong><small>Impede ações seguintes quando uma etapa falhar.</small></span></label>
          </div></details>
        </section>

        {validation.errors.length || validation.warnings.length ? <section className={`automation-validation ${validation.errors.length ? 'automation-validation--error' : ''}`}><AlertTriangle size={17} /><div>{validation.errors.map((message) => <strong key={message}>{message}</strong>)}{validation.warnings.map((message) => <span key={message}>{message}</span>)}</div></section> : null}
      </div>
    </Modal>
  )
}

export { triggerLabels }
