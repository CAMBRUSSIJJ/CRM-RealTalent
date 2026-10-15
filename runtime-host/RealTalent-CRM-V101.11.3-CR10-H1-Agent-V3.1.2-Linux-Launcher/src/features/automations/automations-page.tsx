import { NativeSelectionSelect } from '../../components/selection'
import {
  AlertTriangle, Bell, CheckCircle2, ClipboardCheck, Clock3, Copy, Eye, Filter, FlaskConical, Gauge, History,
  Inbox, Layers3, Mail, MessageCircle, Pencil, Play, Plus, RefreshCw, RotateCcw, Search, ShieldCheck, Sparkles, Trash2, Webhook, XCircle, Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppActions, useAppUi, useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { Modal } from '../../components/ui/modal'
import { StatusPill } from '../../components/ui/status-pill'
import { WorkspaceFilterMenu, WorkspaceViewStrip, type WorkspaceFilterField } from '../../components/workspace/workspace-filter-system'
import { formatDateTime } from '../../domain/formatters'
import type { AutomationRule, AutomationRun } from '../../domain/types'
import { copyTextToClipboard } from '../../lib/browser-actions'
import {
  AUTOMATION_RECIPES, automationHealth, automationRuleRisk, createAutomationRecipe, duplicateAutomationRuleInput, readAutomationGuard, suggestAutomationRecipes, triggerLabels,
  validateAutomationRule, visibleAutomationConditions, type AutomationSimulationResult,
} from '../../services/automation-workspace'
import { automationActivationReadiness, automationRuleFingerprint, recordAutomationPreflight } from '../../services/automation-readiness'
import { AutomationModal } from './automation-modal'
import { WebhookModal } from './webhook-modal'
import {
  cancelAutomationEvent, loadAutomationOperations, markContactDraft, markSellerNotification, retryAutomationEvent,
  retryFailedAutomationEvents, type AutomationOperationsState, type AutomationQueueStatus,
} from '../../services/automation-operations'
import {
  cancelWorkflowExecution, loadWorkflowRuntime, retryWorkflowExecution,
  type WorkflowExecutionRecord, type WorkflowRuntimeState,
} from '../../platform/workflows/workflow-runtime'
import {
  deleteWebhook, dispatchAutomationWebhook, loadWebhookState, maskWebhookUrl, saveWebhook,
  type AutomationWebhook, type WebhookInput, type WebhookState, type WebhookDeliveryStatus,
} from '../../services/automation-webhooks'

type AutomationTab = 'rules' | 'recipes' | 'webhooks' | 'operations' | 'runtime' | 'history'
type RuleFilter = 'all' | 'active' | 'paused' | 'simulation' | 'attention'

const runTone = (run: AutomationRun) => run.status === 'success' ? 'success' : run.status === 'failed' ? 'danger' : run.status === 'undone' ? 'warning' : 'info'
const runLabel = (run: AutomationRun) => run.status === 'success' ? run.output.simulated ? 'Simulação' : run.output.skippedReason ? 'Ignorada' : 'Sucesso' : run.status === 'failed' ? 'Falha' : run.status === 'undone' ? 'Desfeita' : 'Executando'
const queuePresentation: Record<AutomationQueueStatus, { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }> = {
  queued: { label: 'Na fila', tone: 'info' }, processing: { label: 'Processando', tone: 'warning' }, completed: { label: 'Concluído', tone: 'success' },
  failed: { label: 'Nova tentativa', tone: 'warning' }, cancelled: { label: 'Cancelado', tone: 'neutral' }, dead_letter: { label: 'Intervenção', tone: 'danger' },
}

export function AutomationsPage() {
  const { snapshot, currentWorkspace, canWrite, can } = useAppWorkspace()
  const { notify, confirmAction } = useAppUi()
  const { createAutomationRule, updateAutomationRule, deleteAutomationRule, simulateAutomationRule, runAutomationRule, runAutomationChecks, undoAutomationRun } = useAppActions()
  const [tab, setTab] = useState<AutomationTab>('rules')
  const [editing, setEditing] = useState<AutomationRule | null>(null)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testRule, setTestRule] = useState<AutomationRule | null>(null)
  const [testLeadId, setTestLeadId] = useState('')
  const [testResult, setTestResult] = useState<AutomationSimulationResult | null>(null)
  const [running, setRunning] = useState(false)
  const [checking, setChecking] = useState(false)
  const [search, setSearch] = useState('')
  const [ruleFilter, setRuleFilter] = useState<RuleFilter>('all')
  const [recipeCategory, setRecipeCategory] = useState('Todas')
  const [runFilter, setRunFilter] = useState('all')
  const [selectedRun, setSelectedRun] = useState<AutomationRun | null>(null)
  const [operations, setOperations] = useState<AutomationOperationsState>({ queue: [], notifications: [], drafts: [] })
  const [operationsLoading, setOperationsLoading] = useState(false)
  const [runtimeState, setRuntimeState] = useState<WorkflowRuntimeState>({ executions: [], steps: [] })
  const [runtimeLoading, setRuntimeLoading] = useState(false)
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowExecutionRecord | null>(null)
  const [queueFilter, setQueueFilter] = useState<'all' | AutomationQueueStatus>('all')
  const [webhookState, setWebhookState] = useState<WebhookState>({ endpoints: [], deliveries: [] })
  const [webhookLoading, setWebhookLoading] = useState(false)
  const [webhookSaving, setWebhookSaving] = useState(false)
  const [webhookTesting, setWebhookTesting] = useState(false)
  const [webhookOpen, setWebhookOpen] = useState(false)
  const [editingWebhook, setEditingWebhook] = useState<AutomationWebhook | null>(null)
  const [deliveryFilter, setDeliveryFilter] = useState<'all' | WebhookDeliveryStatus>('all')
  const [preflightRevision, setPreflightRevision] = useState(0)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const rules = snapshot?.automationRules ?? []
  const runs = snapshot?.automationRuns ?? []
  const health = snapshot ? automationHealth(snapshot) : { active: 0, simulation: 0, failures24h: 0, successRate: 100 }
  const failedRules = useMemo(() => rules.filter((rule) => validateAutomationRule(rule, snapshot?.stages ?? []).errors.length > 0).length, [rules, snapshot?.stages])
  const searchTerm = search.trim().toLocaleLowerCase('pt-BR')
  const filteredRules = useMemo(() => rules.filter((rule) => {
    const guard = readAutomationGuard(rule.conditions)
    const validation = validateAutomationRule(rule, snapshot?.stages ?? [])
    if (searchTerm && !`${rule.name} ${triggerLabels[rule.triggerType]}`.toLocaleLowerCase('pt-BR').includes(searchTerm)) return false
    if (ruleFilter === 'active' && !rule.enabled) return false
    if (ruleFilter === 'paused' && rule.enabled) return false
    if (ruleFilter === 'simulation' && guard.mode !== 'simulation') return false
    if (ruleFilter === 'attention' && !validation.errors.length && !validation.warnings.length) return false
    return true
  }), [ruleFilter, rules, searchTerm, snapshot?.stages])
  const recipeCategories = ['Todas', ...Array.from(new Set(AUTOMATION_RECIPES.map((recipe) => recipe.category)))]
  const filteredRecipes = AUTOMATION_RECIPES.filter((recipe) => recipeCategory === 'Todas' || recipe.category === recipeCategory)
  const suggestions = useMemo(() => snapshot ? suggestAutomationRecipes(snapshot) : [], [snapshot])
  const filteredRuns = runs.filter((run) => runFilter === 'all' || (runFilter === 'simulation' ? run.output.simulated : runFilter === 'skipped' ? run.output.skippedReason : run.status === runFilter))
  const historyStats = useMemo(() => ({
    success: runs.filter((run) => run.status === 'success' && !run.output.simulated && !run.output.skippedReason).length,
    failed: runs.filter((run) => run.status === 'failed').length,
    simulated: runs.filter((run) => Boolean(run.output.simulated)).length,
    skipped: runs.filter((run) => Boolean(run.output.skippedReason)).length,
  }), [runs])
  const activationReadiness = useMemo(() => new Map(rules.map((rule) => [rule.id, currentWorkspace ? automationActivationReadiness(currentWorkspace.id, rule, snapshot?.stages ?? []) : null])), [currentWorkspace, preflightRevision, rules, snapshot?.stages])
  const canManageQueue = can('manage', 'automation')
  const leadNames = useMemo(() => new Map((snapshot?.leads ?? []).map((lead) => [lead.id, `${lead.name}${lead.company ? ` · ${lead.company}` : ''}`])), [snapshot?.leads])
  const filteredQueue = operations.queue.filter((item) => queueFilter === 'all' || item.status === queueFilter)
  const queueAttention = operations.queue.filter((item) => ['failed', 'dead_letter'].includes(item.status)).length
  const queuePending = operations.queue.filter((item) => ['queued', 'processing'].includes(item.status)).length
  const runtimeWaiting = runtimeState.executions.filter((item) => item.status === 'waiting').length
  const runtimeAttention = runtimeState.executions.filter((item) => ['failed', 'retrying'].includes(item.status)).length
  const runtimeRunning = runtimeState.executions.filter((item) => ['queued', 'running'].includes(item.status)).length
  const unreadNotifications = operations.notifications.filter((item) => item.status === 'unread').length
  const readyDrafts = operations.drafts.filter((item) => item.status === 'ready').length
  const failedDeliveries = webhookState.deliveries.filter((item) => item.status === 'failed').length
  const filteredDeliveries = webhookState.deliveries.filter((item) => deliveryFilter === 'all' || item.status === deliveryFilter)
  const activeFilterCount = tab === 'rules' ? (ruleFilter === 'all' ? 0 : 1) : tab === 'recipes' ? (recipeCategory === 'Todas' ? 0 : 1) : tab === 'webhooks' ? (deliveryFilter === 'all' ? 0 : 1) : tab === 'operations' ? (queueFilter === 'all' ? 0 : 1) : tab === 'history' ? (runFilter === 'all' ? 0 : 1) : 0
  const clearContextFilter = () => { setRuleFilter('all'); setRecipeCategory('Todas'); setDeliveryFilter('all'); setQueueFilter('all'); setRunFilter('all') }
  const universalAutomationFilters: WorkspaceFilterField[] = tab === 'rules' ? [{ key: 'rule', label: 'Status', value: ruleFilter, allValue: 'all', allLabel: 'Todas', group: 'Regra', options: [{ value: 'active', label: 'Ativas' }, { value: 'paused', label: 'Pausadas' }, { value: 'simulation', label: 'Em simulação' }, { value: 'attention', label: 'Com alertas' }] }]
    : tab === 'recipes' ? [{ key: 'recipe', label: 'Categoria', value: recipeCategory, allValue: 'Todas', allLabel: 'Todas', group: 'Template', options: recipeCategories.filter((category) => category !== 'Todas').map((category) => ({ value: category, label: category })) }]
    : tab === 'webhooks' ? [{ key: 'delivery', label: 'Entrega', value: deliveryFilter, allValue: 'all', allLabel: 'Todos', group: 'Webhook', options: [{ value: 'pending', label: 'Pendente' }, { value: 'sending', label: 'Enviando' }, { value: 'success', label: 'Sucesso' }, { value: 'failed', label: 'Falha' }, { value: 'simulated', label: 'Simulado' }, { value: 'cancelled', label: 'Cancelado' }] }]
    : tab === 'operations' ? [{ key: 'queue', label: 'Fila', value: queueFilter, allValue: 'all', allLabel: 'Todos', group: 'Operação', options: Object.entries(queuePresentation).map(([value, item]) => ({ value, label: item.label })) }]
    : tab === 'history' ? [{ key: 'run', label: 'Execução', value: runFilter, allValue: 'all', allLabel: 'Todos', group: 'Histórico', options: [{ value: 'success', label: 'Sucesso' }, { value: 'failed', label: 'Falha' }, { value: 'simulation', label: 'Simulação' }, { value: 'skipped', label: 'Ignorada' }, { value: 'undone', label: 'Desfeita' }] }]
    : []
  const changeAutomationQuickFilter = (key: string, value: string) => {
    if (key === 'rule') setRuleFilter(value as RuleFilter)
    else if (key === 'recipe') setRecipeCategory(value)
    else if (key === 'delivery') setDeliveryFilter(value as typeof deliveryFilter)
    else if (key === 'queue') setQueueFilter(value as typeof queueFilter)
    else if (key === 'run') setRunFilter(value)
  }

  const refreshOperations = useCallback(async () => {
    if (!currentWorkspace) return
    setOperationsLoading(true)
    try { setOperations(await loadAutomationOperations(currentWorkspace.id, canManageQueue)) }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível carregar a operação.') }
    finally { setOperationsLoading(false) }
  }, [canManageQueue, currentWorkspace, notify])

  const refreshRuntime = useCallback(async () => {
    if (!currentWorkspace) return
    setRuntimeLoading(true)
    try { setRuntimeState(await loadWorkflowRuntime(currentWorkspace.id)) }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível carregar o Workflow Runtime 3.0.') }
    finally { setRuntimeLoading(false) }
  }, [currentWorkspace, notify])

  const refreshWebhooks = useCallback(async () => {
    if (!currentWorkspace) return
    setWebhookLoading(true)
    try { setWebhookState(await loadWebhookState(currentWorkspace.id)) }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível carregar os webhooks.') }
    finally { setWebhookLoading(false) }
  }, [currentWorkspace, notify])

  useEffect(() => { if (tab === 'operations') void refreshOperations() }, [refreshOperations, tab])
  useEffect(() => { if (tab === 'runtime') void refreshRuntime() }, [refreshRuntime, tab])
  useEffect(() => { if (currentWorkspace) void refreshWebhooks() }, [currentWorkspace, refreshWebhooks])

  const runOperation = async (operation: () => Promise<unknown>, success: string) => {
    try { await operation(); notify('success', success); await refreshOperations() }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível concluir a operação.') }
  }

  const runRuntimeOperation = async (operation: () => Promise<unknown>, success: string) => {
    try { await operation(); notify('success', success); await refreshRuntime() }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível concluir a operação do workflow.') }
  }

  const copyDraft = async (draftId: string, message: string) => {
    const copied = await copyTextToClipboard(message)
    if (!copied.ok) { notify('error', copied.reason ?? 'Não foi possível copiar a mensagem.'); return }
    try {
      if (currentWorkspace && canWrite) await markContactDraft(currentWorkspace.id, draftId)
      notify('success', 'Mensagem copiada e marcada como utilizada.')
      await refreshOperations()
    } catch { notify('error', 'A mensagem foi copiada, mas não foi possível marcar o rascunho como utilizado.') }
  }

  const save = async (input: Pick<AutomationRule, 'name' | 'enabled' | 'triggerType' | 'conditions' | 'actions'>) => {
    setSaving(true)
    try {
      if (editing) {
        const nextRule = { ...editing, ...input }
        const logicChanged = automationRuleFingerprint(editing) !== automationRuleFingerprint(nextRule)
        const nextMode = readAutomationGuard(input.conditions).mode
        const previousMode = readAutomationGuard(editing.conditions).mode
        const liveReadiness = currentWorkspace ? automationActivationReadiness(currentWorkspace.id, nextRule, snapshot?.stages ?? []) : null
        const shouldPause = editing.enabled && nextMode === 'live' && (logicChanged || previousMode !== 'live' || !liveReadiness?.ready)
        await updateAutomationRule(editing.id, { ...input, enabled: shouldPause ? false : input.enabled })
        if (shouldPause) notify('info', liveReadiness?.ready && !logicChanged ? 'A automação foi pausada para confirmar a mudança para execução real. Ative novamente quando estiver pronta.' : 'A lógica ou o modo real exige validação. A automação foi pausada até uma simulação aprovada.')
      } else {
        await createAutomationRule({ ...input, enabled: false })
        notify('info', 'Automação criada pausada. Simule com um lead antes de ativar.')
      }
      setPreflightRevision((value) => value + 1)
      setBuilderOpen(false); setEditing(null)
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível salvar a automação.') }
    finally { setSaving(false) }
  }

  const createRecipe = async (recipeId: string) => {
    try {
      await createAutomationRule(createAutomationRecipe(recipeId))
      setTab('rules')
      notify('success', 'Template adicionado em modo de simulação. Revise e teste antes de ativar a execução real.')
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível criar o template.') }
  }

  const duplicateRule = async (rule: AutomationRule) => {
    try {
      await createAutomationRule(duplicateAutomationRuleInput(rule))
      notify('success', 'Cópia criada pausada e em modo de simulação.')
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível duplicar a automação.') }
  }

  const toggleRule = async (rule: AutomationRule) => {
    if (rule.enabled) { await updateAutomationRule(rule.id, { enabled: false }); return }
    if (!currentWorkspace) return
    const readiness = automationActivationReadiness(currentWorkspace.id, rule, snapshot?.stages ?? [])
    if (!readiness.ready) {
      openTest(rule)
      notify('warning', readiness.reason)
      return
    }
    if (readAutomationGuard(rule.conditions).mode === 'live') {
      const confirmed = await confirmAction({ title: `Ativar “${rule.name}” em execução real?`, description: `${readiness.reason} A partir de agora os próximos eventos compatíveis poderão alterar dados do CRM.`, confirmLabel: 'Ativar execução real' })
      if (!confirmed) return
    }
    await updateAutomationRule(rule.id, { enabled: true })
  }

  const openTest = (rule: AutomationRule) => {
    setTestRule(rule); setTestLeadId(snapshot?.leads[0]?.id ?? ''); setTestResult(null)
  }

  const simulate = async () => {
    if (!testRule || !testLeadId) return
    setRunning(true)
    try {
      const result = await simulateAutomationRule(testRule.id, testLeadId)
      setTestResult(result)
      if (currentWorkspace) {
        recordAutomationPreflight(currentWorkspace.id, testRule, { leadId: testLeadId, leadName: result.leadName, matched: result.matched, warningCount: result.warnings.length })
        setPreflightRevision((value) => value + 1)
      }
      notify(result.matched ? 'success' : 'info', result.matched ? 'Simulação aprovada. A versão atual da regra está liberada para ativação real.' : 'Simulação concluída, mas esse contato não atende às condições.')
    }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Falha na simulação.') }
    finally { setRunning(false) }
  }

  const executeTest = async () => {
    if (!testRule || !testLeadId) return
    setRunning(true)
    try { await runAutomationRule(testRule.id, testLeadId); setTestRule(null); setTestResult(null) }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Falha no teste real.') }
    finally { setRunning(false) }
  }

  const runChecks = async () => {
    setChecking(true)
    try { await runAutomationChecks() }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Falha nas checagens.') }
    finally { setChecking(false) }
  }

  const persistWebhook = async (input: WebhookInput) => {
    if (!currentWorkspace) return
    setWebhookSaving(true)
    try {
      await saveWebhook(currentWorkspace.id, input, editingWebhook?.id)
      notify('success', editingWebhook ? 'Webhook atualizado.' : 'Webhook criado.')
      setWebhookOpen(false); setEditingWebhook(null); await refreshWebhooks()
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível salvar o webhook.') }
    finally { setWebhookSaving(false) }
  }

  const testWebhook = async (input: WebhookInput) => {
    if (!currentWorkspace) return
    setWebhookTesting(true)
    try {
      const saved = await saveWebhook(currentWorkspace.id, input, editingWebhook?.id)
      await dispatchAutomationWebhook({ workspaceId: currentWorkspace.id, webhookId: saved.id, runId: null, rule: null, lead: snapshot?.leads[0] ?? null, eventType: 'webhook.test', correlationId: `test:${Date.now()}`, test: true })
      notify('success', 'Configuração salva e teste registrado. Consulte o histórico de entregas.')
      setEditingWebhook(saved)
      await refreshWebhooks()
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Falha no teste do webhook.') }
    finally { setWebhookTesting(false) }
  }

  const removeWebhook = async (webhook: AutomationWebhook) => {
    if (!currentWorkspace) return
    if (!await confirmAction({ title: `Excluir o webhook “${webhook.name}”?`, description: 'As automações deixarão de enviar eventos para este destino.', confirmLabel: 'Excluir webhook', tone: 'danger' })) return
    try { await deleteWebhook(currentWorkspace.id, webhook.id); notify('success', 'Webhook removido.'); await refreshWebhooks() }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível remover o webhook.') }
  }

  return (
    <div className={`page-stack automations-page automations-page--professional automations-page-v10167 ${filtersOpen ? 'automations-page-v10167--filters-open' : ''}`}>
      <section className="workspace-page-header-v10167 automations-page-header-v10167">
        <div><span className="eyebrow"><ShieldCheck size={14} /> Automação comercial</span><h2>Automações</h2><p>Crie fluxos Quando → Se → Então, teste antes de ativar e acompanhe cada execução em um só workspace.</p></div>
        <div className="workspace-page-header-v10167__actions">{canWrite ? <><Button variant="secondary" size="sm" loading={checking} onClick={() => void runChecks()}><Clock3 size={16} /> Checagens</Button><Button size="sm" onClick={() => { setEditing(null); setBuilderOpen(true) }}><Plus size={16} /> Nova automação</Button></> : null}</div>
      </section>

      <section className="workspace-summary-strip-v10167 automation-health-grid automation-health-grid-v10167">
        <article className="automation-health-card"><span><Zap /></span><div><small>Regras ativas</small><strong>{health.active}</strong><em>{health.simulation} em simulação</em></div></article>
        <article className="automation-health-card"><span className="is-success"><Gauge /></span><div><small>Confiabilidade</small><strong>{health.successRate}%</strong><em>últimas execuções</em></div></article>
        <article className="automation-health-card"><span className={health.failures24h ? 'is-danger' : 'is-success'}><AlertTriangle /></span><div><small>Falhas em 24h</small><strong>{health.failures24h}</strong><em>{health.failures24h ? 'requer atenção' : 'operação estável'}</em></div></article>
        <article className="automation-health-card"><span className={failedRules ? 'is-warning' : 'is-success'}><ShieldCheck /></span><div><small>Validação</small><strong>{failedRules}</strong><em>{failedRules ? 'regra(s) com erro' : 'sem bloqueios'}</em></div></article>
      </section>

      <WorkspaceViewStrip items={[
        { id: 'rules', label: 'Regras', active: tab === 'rules', count: rules.length, icon: <Layers3 size={15}/>, accent: 'blue', onClick: () => setTab('rules') },
        { id: 'recipes', label: 'Templates', active: tab === 'recipes', count: AUTOMATION_RECIPES.length, icon: <Sparkles size={15}/>, accent: 'purple', onClick: () => setTab('recipes') },
        { id: 'webhooks', label: 'Webhooks', active: tab === 'webhooks', count: failedDeliveries || webhookState.endpoints.length, icon: <Webhook size={15}/>, accent: failedDeliveries ? 'red' : 'neutral', onClick: () => setTab('webhooks') },
        { id: 'operations', label: 'Operação', active: tab === 'operations', count: queueAttention + unreadNotifications + readyDrafts, icon: <Inbox size={15}/>, accent: queueAttention ? 'orange' : 'neutral', onClick: () => setTab('operations') },
        { id: 'runtime', label: 'Runtime', active: tab === 'runtime', count: runtimeAttention + runtimeWaiting + runtimeRunning, icon: <Gauge size={15}/>, accent: runtimeAttention ? 'red' : runtimeWaiting ? 'orange' : 'neutral', onClick: () => setTab('runtime') },
        { id: 'history', label: 'Histórico', active: tab === 'history', count: runs.length, icon: <History size={15}/>, onClick: () => setTab('history') },
      ]} />

      <section className="workspace-data-toolbar-v10167 automation-toolbar-v10167 workspace-command-bar-v10169">
        {tab === 'rules' ? <label className="search-field workspace-search-v10167"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar automação ou gatilho" /></label> : <div className="automation-toolbar-context-v10167"><strong>{tab === 'recipes' ? 'Templates de automação' : tab === 'webhooks' ? 'Webhooks e entregas' : tab === 'operations' ? 'Operação e processamento' : tab === 'runtime' ? 'Workflow Runtime 3.0' : 'Histórico de execuções'}</strong><small>Use filtros somente quando precisar refinar esta área.</small></div>}
        <div className="workspace-toolbar-actions-v10167"><WorkspaceFilterMenu workspaceKey={`automations:${currentWorkspace?.id ?? 'local'}:${tab}`} fields={universalAutomationFilters} activeCount={activeFilterCount} onOpenAdvanced={() => setFiltersOpen(true)} onClearAll={clearContextFilter} onChange={changeAutomationQuickFilter} /></div>
      </section>

      {activeFilterCount ? <div className="workspace-filter-chips-v10167 automation-filter-chips-v10167"><button type="button" onClick={clearContextFilter}>{tab === 'rules' ? `Exibir: ${ruleFilter === 'active' ? 'Ativas' : ruleFilter === 'paused' ? 'Pausadas' : ruleFilter === 'simulation' ? 'Em simulação' : 'Com alertas'}` : tab === 'recipes' ? `Categoria: ${recipeCategory}` : tab === 'webhooks' ? `Status: ${deliveryFilter}` : tab === 'operations' ? `Status: ${queueFilter}` : `Status: ${runFilter}`} ×</button><button className="is-clear" type="button" onClick={clearContextFilter}>Limpar</button></div> : null}
      {filtersOpen ? <aside className="workspace-settings-drawer-v10167 automation-filter-drawer-v10167" aria-label="Filtros de automação"><header><div><span>Automações</span><strong>Filtros de {tab === 'rules' ? 'regras' : tab === 'recipes' ? 'templates' : tab === 'webhooks' ? 'webhooks' : tab === 'operations' ? 'operação' : tab === 'runtime' ? 'runtime' : 'histórico'}</strong></div><button type="button" onClick={() => setFiltersOpen(false)} aria-label="Fechar filtros">×</button></header><div className="workspace-settings-drawer-v10167__body"><section><div className="workspace-settings-section-title-v10167"><strong>Refinar conteúdo</strong><span>O filtro muda conforme a área ativa sem ocupar a toolbar permanentemente.</span></div>{tab === 'rules' ? <label className="field"><span>Exibir regras</span><NativeSelectionSelect value={ruleFilter} onChange={(event) => setRuleFilter(event.target.value as RuleFilter)}><option value="all">Todas</option><option value="active">Ativas</option><option value="paused">Pausadas</option><option value="simulation">Em simulação</option><option value="attention">Com alertas</option></NativeSelectionSelect></label> : null}{tab === 'recipes' ? <label className="field"><span>Categoria</span><NativeSelectionSelect value={recipeCategory} onChange={(event) => setRecipeCategory(event.target.value)}>{recipeCategories.map((category) => <option key={category}>{category}</option>)}</NativeSelectionSelect></label> : null}{tab === 'webhooks' ? <label className="field"><span>Status de entrega</span><NativeSelectionSelect value={deliveryFilter} onChange={(event) => setDeliveryFilter(event.target.value as typeof deliveryFilter)}><option value="all">Todos</option><option value="pending">Pendente</option><option value="sending">Enviando</option><option value="success">Sucesso</option><option value="failed">Falha</option><option value="simulated">Simulado</option><option value="cancelled">Cancelado</option></NativeSelectionSelect></label> : null}{tab === 'operations' ? <label className="field"><span>Status da fila</span><NativeSelectionSelect value={queueFilter} onChange={(event) => setQueueFilter(event.target.value as typeof queueFilter)}><option value="all">Todos</option>{Object.entries(queuePresentation).map(([value, item]) => <option value={value} key={value}>{item.label}</option>)}</NativeSelectionSelect></label> : null}{tab === 'history' ? <label className="field"><span>Status da execução</span><NativeSelectionSelect value={runFilter} onChange={(event) => setRunFilter(event.target.value)}><option value="all">Todos</option><option value="success">Sucesso</option><option value="failed">Falha</option><option value="simulation">Simulação</option><option value="skipped">Ignorada</option><option value="undone">Desfeita</option></NativeSelectionSelect></label> : null}</section></div><footer><Button variant="secondary" onClick={clearContextFilter}>Limpar</Button><Button onClick={() => setFiltersOpen(false)}>Aplicar</Button></footer></aside> : null}

      {tab === 'rules' ? <>
        {suggestions.length ? <section className="automation-suggestions"><header><div><span className="eyebrow">Sugestões para sua operação</span><h3>Automações que podem reduzir trabalho manual</h3></div><Button size="sm" variant="secondary" onClick={() => setTab('recipes')}><Sparkles size={14} /> Ver todos os templates</Button></header><div>{suggestions.map((suggestion) => <article key={suggestion.recipeId}><span className={suggestion.priority === 'high' ? 'is-high' : ''}><Sparkles size={15} /></span><div><strong>{suggestion.title}</strong><p>{suggestion.reason}</p></div>{canWrite ? <Button size="sm" variant="secondary" onClick={() => void createRecipe(suggestion.recipeId)}>Usar</Button> : null}</article>)}</div></section> : null}
        <section className="automation-rule-grid">
          {filteredRules.map((rule) => {
            const guard = readAutomationGuard(rule.conditions)
            const validation = validateAutomationRule(rule, snapshot?.stages ?? [])
            const risk = automationRuleRisk(rule)
            const ruleRuns = runs.filter((run) => run.ruleId === rule.id)
            const lastRun = ruleRuns[0]
            return <article className="automation-rule-card" key={rule.id}>
              <header><span className={`automation-rule-card__icon ${rule.enabled ? 'is-enabled' : ''}`}><Zap size={18} /></span><div><div><strong>{rule.name}</strong><StatusPill tone={rule.enabled ? 'success' : 'neutral'}>{rule.enabled ? 'Ligada' : 'Pausada'}</StatusPill><StatusPill tone={guard.mode === 'live' ? 'info' : 'warning'}>{guard.mode === 'live' ? 'Execução real' : 'Simulação'}</StatusPill>{activationReadiness.get(rule.id) ? <StatusPill tone={activationReadiness.get(rule.id)?.ready ? 'success' : 'warning'}>{activationReadiness.get(rule.id)?.label}</StatusPill> : null}</div><p>{triggerLabels[rule.triggerType]}</p></div>{canWrite ? <button type="button" className="switch" aria-label={`${rule.enabled ? 'Pausar' : 'Ativar'} ${rule.name}`} aria-pressed={rule.enabled} onClick={() => void toggleRule(rule)}><span /></button> : null}</header>
              <div className="automation-rule-card__flow"><div><small>QUANDO</small><strong>{triggerLabels[rule.triggerType]}</strong></div><i>→</i><div><small>SE</small><strong>{visibleAutomationConditions(rule.conditions).length ? `${visibleAutomationConditions(rule.conditions).length} condição(ões)` : 'Sempre'}</strong></div><i>→</i><div><small>ENTÃO</small><strong>{rule.actions.length} ação(ões)</strong></div></div>
              <div className="automation-rule-card__safety"><span><ShieldCheck size={14} /> Risco {risk === 'low' ? 'baixo' : risk === 'medium' ? 'médio' : 'alto'}</span><span>{guard.cooldownHours ? `${guard.cooldownHours}h de intervalo` : 'sem intervalo'}</span><span>máx. {guard.maxRunsPerLeadPerDay}/lead/dia</span></div>
              {activationReadiness.get(rule.id) && guard.mode === 'live' && !activationReadiness.get(rule.id)?.ready ? <div className="automation-rule-card__preflight"><FlaskConical size={14} /><span>{activationReadiness.get(rule.id)?.reason}</span></div> : null}
              {validation.errors.length || validation.warnings.length ? <div className={`automation-rule-card__warning ${validation.errors.length ? 'is-error' : ''}`}><AlertTriangle size={14} /><span>{validation.errors[0] ?? validation.warnings[0]}</span></div> : null}
              <footer><div>{lastRun ? <><small>Última execução</small><strong>{formatDateTime(lastRun.startedAt)} · {runLabel(lastRun)}</strong></> : <><small>Ainda não executada</small><strong>Teste com um lead antes de ativar</strong></>}</div><div className="automation-rule-card__actions"><button type="button" className="automation-text-action" onClick={() => openTest(rule)}><FlaskConical size={15} /> Testar</button>{canWrite ? <><button type="button" className="automation-text-action" onClick={() => { setEditing(rule); setBuilderOpen(true) }}><Pencil size={15} /> Editar</button><button type="button" className="automation-text-action" onClick={() => void duplicateRule(rule)}><Copy size={15} /> Duplicar</button><button type="button" className="icon-button icon-button--danger" aria-label="Excluir automação" onClick={() => void (async () => { if (await confirmAction({ title: `Excluir “${rule.name}”?`, description: 'A regra será removida e não executará novamente.', confirmLabel: 'Excluir automação', tone: 'danger' })) await deleteAutomationRule(rule.id) })()}><Trash2 size={16} /></button></> : null}</div></footer>
            </article>
          })}
          {!filteredRules.length ? <div className="automation-empty-span"><EmptyState icon={Sparkles} title="Nenhuma regra encontrada" description="Ajuste os filtros, crie uma automação ou use um template pronto." /></div> : null}
        </section>
      </> : null}

      {tab === 'recipes' ? <section className="page-stack">
        <div className="automation-recipe-header"><div><span className="eyebrow">Modelos prontos</span><h3>Templates comerciais seguros</h3><p>Todas são adicionadas pausadas e em modo de simulação para revisão antes da execução real.</p></div></div>
        <div className="automation-recipe-grid">{filteredRecipes.map((recipe) => <article className="automation-recipe-card" key={recipe.id}><header><span><Sparkles size={18} /></span><em>{recipe.category}</em></header><h3>{recipe.name}</h3><p>{recipe.description}</p><div className="automation-recipe-flow"><span><small>QUANDO</small>{triggerLabels[recipe.triggerType]}</span><span><small>SE</small>{recipe.conditions.length ? `${recipe.conditions.length} condição(ões)` : 'Sempre'}</span><span><small>ENTÃO</small>{recipe.actions.length} ação(ões)</span></div>{canWrite ? <Button variant="secondary" onClick={() => void createRecipe(recipe.id)}><Plus size={15} /> Usar template</Button> : null}</article>)}</div>
      </section> : null}

      {tab === 'webhooks' ? <section className="automation-webhooks-page">
        <header className="automation-operations__header"><div><span className="eyebrow">Integrações externas</span><h3>Webhooks gerenciados</h3><p>Cadastre destinos, teste assinaturas e acompanhe cada entrega sem expor segredos no navegador.</p></div><div className="toolbar-card__actions"><Button variant="secondary" loading={webhookLoading} onClick={() => void refreshWebhooks()}><RefreshCw size={16} /> Atualizar</Button>{canManageQueue ? <Button onClick={() => { setEditingWebhook(null); setWebhookOpen(true) }}><Plus size={16} /> Novo webhook</Button> : null}</div></header>
        <div className="automation-webhook-grid">{webhookState.endpoints.map((webhook) => <article className="automation-webhook-card" key={webhook.id}><header><span className={webhook.enabled ? 'is-enabled' : ''}><Webhook size={18} /></span><div><strong>{webhook.name}</strong><small>{webhook.method} · {maskWebhookUrl(webhook.url)}</small></div><StatusPill tone={webhook.enabled ? 'success' : 'neutral'}>{webhook.enabled ? 'Ativo' : 'Pausado'}</StatusPill></header><div className="automation-webhook-meta"><span>{webhook.maxAttempts} tentativa(s)</span><span>{webhook.timeoutSeconds}s de timeout</span><span>{webhook.hasSecret ? 'Assinatura configurada' : 'Sem assinatura'}</span></div><footer><small>Atualizado em {formatDateTime(webhook.updatedAt)}</small>{canManageQueue ? <div><button type="button" className="icon-button" aria-label="Testar webhook" onClick={() => { setEditingWebhook(webhook); setWebhookOpen(true) }}><FlaskConical size={15} /></button><button type="button" className="icon-button" aria-label="Editar webhook" onClick={() => { setEditingWebhook(webhook); setWebhookOpen(true) }}><Pencil size={15} /></button><button type="button" className="icon-button icon-button--danger" aria-label="Excluir webhook" onClick={() => void removeWebhook(webhook)}><Trash2 size={15} /></button></div> : null}</footer></article>)}{!webhookState.endpoints.length ? <div className="automation-empty-span"><EmptyState icon={Webhook} title="Nenhum webhook cadastrado" description="Crie um destino, faça um teste e depois selecione a ação Enviar webhook em uma regra." /></div> : null}</div>
        <section className="panel automation-webhook-deliveries"><div className="panel__heading"><div><span className="eyebrow">Auditoria externa</span><h3>Histórico de entregas</h3></div></div>{filteredDeliveries.length ? <div className="automation-delivery-list">{filteredDeliveries.slice(0, 100).map((delivery) => { const endpoint = webhookState.endpoints.find((item) => item.id === delivery.webhookId); return <article key={delivery.id}><div><StatusPill tone={delivery.status === 'success' ? 'success' : delivery.status === 'failed' ? 'danger' : delivery.status === 'simulated' ? 'warning' : 'info'}>{delivery.status}</StatusPill><div><strong>{endpoint?.name ?? 'Webhook removido'}</strong><small>{delivery.eventType} · {delivery.leadId ? leadNames.get(delivery.leadId) ?? 'Contato relacionado' : 'Teste técnico'}</small></div></div><div><span>{delivery.attempts} tentativa(s)</span><time>{formatDateTime(delivery.finishedAt ?? delivery.createdAt)}</time>{delivery.errorMessage ? <small>{delivery.errorMessage}</small> : delivery.responseStatus ? <small>HTTP {delivery.responseStatus}</small> : null}</div></article> })}</div> : <EmptyState icon={CheckCircle2} title="Sem entregas registradas" description="Testes e envios automáticos aparecerão aqui com status, resposta e tentativas." />}</section>
      </section> : null}

      {tab === 'operations' ? <section className="automation-operations">
        <header className="automation-operations__header"><div><span className="eyebrow">Central operacional</span><h3>Fila, avisos e contatos preparados</h3><p>Acompanhe cada evento pós-captura e intervenha apenas quando necessário.</p></div><Button variant="secondary" loading={operationsLoading} onClick={() => void refreshOperations()}><RefreshCw size={16} /> Atualizar</Button></header>
        <div className="automation-operation-metrics">
          <article><span><Inbox /></span><div><small>Fila ativa</small><strong>{queuePending}</strong><em>aguardando ou processando</em></div></article>
          <article className={queueAttention ? 'has-danger' : ''}><span><AlertTriangle /></span><div><small>Requer atenção</small><strong>{queueAttention}</strong><em>falhas ou tentativas esgotadas</em></div></article>
          <article><span><Bell /></span><div><small>Avisos novos</small><strong>{unreadNotifications}</strong><em>para o vendedor</em></div></article>
          <article><span><ClipboardCheck /></span><div><small>Mensagens prontas</small><strong>{readyDrafts}</strong><em>aguardando confirmação</em></div></article>
        </div>

        <section className="panel automation-queue-panel">
          <div className="panel__heading"><div><span className="eyebrow">Processamento resiliente</span><h3>Fila de automação</h3></div><div className="automation-queue-actions">{queueAttention ? <Button size="sm" variant="secondary" disabled={!canManageQueue} onClick={() => currentWorkspace && void runOperation(() => retryFailedAutomationEvents(currentWorkspace.id), 'Eventos devolvidos à fila.')}><RotateCcw size={14} /> Reprocessar falhas</Button> : null}</div></div>
          {filteredQueue.length ? <div className="automation-queue-list">{filteredQueue.slice(0, 80).map((item) => <article key={item.id}><div><StatusPill tone={queuePresentation[item.status].tone}>{queuePresentation[item.status].label}</StatusPill><strong>{item.triggerType.replaceAll('_', ' ')}</strong><small>{item.leadId ? leadNames.get(item.leadId) ?? 'Contato não carregado' : item.entityId}</small></div><div><span>{item.attempts}/{item.maxAttempts} tentativa(s)</span><time>{formatDateTime(item.lastAttemptAt ?? item.createdAt)}</time>{item.lastError ? <small title={item.lastError}>{item.lastError}</small> : null}</div><div>{['failed', 'dead_letter', 'cancelled'].includes(item.status) ? <button type="button" className="icon-button" disabled={!canManageQueue} aria-label="Reprocessar evento" onClick={() => currentWorkspace && void runOperation(() => retryAutomationEvent(currentWorkspace.id, item.id), 'Evento devolvido à fila.')}><RotateCcw size={15} /></button> : null}{['queued', 'failed'].includes(item.status) ? <button type="button" className="icon-button icon-button--danger" disabled={!canManageQueue} aria-label="Cancelar evento" onClick={() => currentWorkspace && void runOperation(() => cancelAutomationEvent(currentWorkspace.id, item.id), 'Evento cancelado.')}><XCircle size={15} /></button> : null}</div></article>)}</div> : <EmptyState icon={CheckCircle2} title="Fila sem pendências" description="Novas capturas e eventos externos aparecerão aqui com tentativas, status e erro detalhado." />}
        </section>

        <div className="automation-operation-columns">
          <section className="panel automation-operation-list"><div className="panel__heading"><div><span className="eyebrow">Ação interna</span><h3>Avisos ao vendedor</h3></div><Bell size={19} /></div>{operations.notifications.length ? operations.notifications.slice(0, 30).map((item) => <article className={item.status === 'unread' ? 'is-unread' : ''} key={item.id}><span className={`operation-dot operation-dot--${item.severity}`} /><div><strong>{item.title}</strong><p>{item.body}</p><small>{item.leadId ? leadNames.get(item.leadId) ?? 'Contato relacionado' : 'Operação geral'} · {formatDateTime(item.createdAt)}</small></div>{item.status === 'unread' && canWrite ? <button type="button" className="icon-button" aria-label="Marcar aviso como lido" onClick={() => currentWorkspace && void runOperation(() => markSellerNotification(currentWorkspace.id, item.id), 'Aviso marcado como lido.')}><CheckCircle2 size={15} /></button> : null}</article>) : <EmptyState icon={Bell} title="Nenhum aviso" description="Alertas internos gerados pelas regras aparecerão aqui." />}</section>
          <section className="panel automation-operation-list"><div className="panel__heading"><div><span className="eyebrow">Envio assistido</span><h3>Mensagens preparadas</h3></div><MessageCircle size={19} /></div>{operations.drafts.length ? operations.drafts.slice(0, 30).map((item) => <article className={item.status === 'ready' ? 'is-unread' : ''} key={item.id}><span className="operation-channel">{item.channel === 'email' ? <Mail size={15} /> : <MessageCircle size={15} />}</span><div><strong>{item.subject || (item.channel === 'whatsapp' ? 'WhatsApp preparado' : 'Abordagem preparada')}</strong><p>{item.message}</p><small>{leadNames.get(item.leadId) ?? 'Contato relacionado'} · {item.status === 'ready' ? 'Pronta para revisar' : item.status === 'used' ? 'Utilizada' : 'Descartada'}</small></div>{item.status === 'ready' ? <button type="button" className="icon-button" aria-label="Copiar mensagem" onClick={() => void copyDraft(item.id, item.message)}><Copy size={15} /></button> : null}</article>) : <EmptyState icon={MessageCircle} title="Nenhuma mensagem preparada" description="Ações assistidas de WhatsApp e e-mail aparecerão aqui sem envio automático." />}</section>
        </div>
      </section> : null}

      {tab === 'runtime' ? <section className="automation-operations automation-runtime-v10195">
        <header className="automation-operations__header"><div><span className="eyebrow">Execução persistente</span><h3>Workflow Runtime 3.0</h3><p>Esperas, ramificações e retentativas continuam no servidor mesmo com o CRM fechado.</p></div><Button variant="secondary" loading={runtimeLoading} onClick={() => void refreshRuntime()}><RefreshCw size={16} /> Atualizar</Button></header>
        <div className="automation-operation-metrics">
          <article><span className="is-warning"><Clock3 size={17} /></span><div><small>Aguardando</small><strong>{runtimeWaiting}</strong></div></article>
          <article><span><Play size={17} /></span><div><small>Fila / executando</small><strong>{runtimeRunning}</strong></div></article>
          <article><span className={runtimeAttention ? 'is-danger' : 'is-success'}><AlertTriangle size={17} /></span><div><small>Retry / falha</small><strong>{runtimeAttention}</strong></div></article>
          <article><span className="is-success"><ShieldCheck size={17} /></span><div><small>Persistidas</small><strong>{runtimeState.executions.length}</strong></div></article>
        </div>
        <section className="panel automation-history-panel"><div className="panel__heading"><div><span className="eyebrow">Scheduler persistente</span><h3>Execuções do runtime</h3></div></div>
          {runtimeState.executions.length ? <div className="automation-history-table"><div className="automation-history-table__head"><span>Workflow</span><span>Próxima execução</span><span>Estado</span><span>Ações</span></div>{runtimeState.executions.slice(0, 100).map((execution) => { const rule = rules.find((item) => item.id === execution.ruleId); return <article key={execution.id}><div><span className={`run-dot run-dot--${execution.status === 'succeeded' ? 'success' : execution.status === 'failed' ? 'failed' : 'running'}`} /><div><strong>{rule?.name ?? 'Workflow persistente'}</strong><small>{execution.triggerType} · etapa {execution.currentStep + 1}</small></div></div><time>{formatDateTime(execution.nextRunAt)}</time><div><StatusPill tone={execution.status === 'succeeded' ? 'success' : execution.status === 'failed' ? 'danger' : execution.status === 'waiting' || execution.status === 'retrying' ? 'warning' : execution.status === 'cancelled' ? 'neutral' : 'info'}>{execution.status === 'waiting' ? 'Aguardando' : execution.status === 'retrying' ? 'Nova tentativa' : execution.status === 'succeeded' ? 'Concluído' : execution.status === 'failed' ? 'Falhou' : execution.status === 'cancelled' ? 'Cancelado' : execution.status === 'running' ? 'Executando' : 'Na fila'}</StatusPill><small>{execution.lastError ?? `${execution.attempts}/${execution.maxAttempts} tentativa(s)`}</small></div><div><button type="button" className="icon-button" aria-label="Ver workflow" onClick={() => setSelectedWorkflow(execution)}><Eye size={15} /></button>{canManageQueue && ['failed','cancelled'].includes(execution.status) ? <button type="button" className="icon-button" aria-label="Reprocessar workflow" onClick={() => void runRuntimeOperation(() => retryWorkflowExecution(execution.id), 'Workflow devolvido ao scheduler.')}><RotateCcw size={15} /></button> : null}{canManageQueue && ['queued','waiting','retrying'].includes(execution.status) ? <button type="button" className="icon-button icon-button--danger" aria-label="Cancelar workflow" onClick={() => void runRuntimeOperation(() => cancelWorkflowExecution(execution.id), 'Workflow cancelado.')}><XCircle size={15} /></button> : null}</div></article> })}</div> : <EmptyState icon={Gauge} title="Nenhuma execução persistente" description="Regras com Aguardar ou Condição/ramificação aparecerão aqui quando forem disparadas no workspace cloud." />}
        </section>
      </section> : null}

      {tab === 'history' ? <section className="panel automation-history-panel">
        <div className="automation-history-summary"><article><small>Sucesso real</small><strong>{historyStats.success}</strong></article><article className={historyStats.failed ? 'has-danger' : ''}><small>Falhas</small><strong>{historyStats.failed}</strong></article><article><small>Simulações</small><strong>{historyStats.simulated}</strong></article><article><small>Ignoradas por segurança</small><strong>{historyStats.skipped}</strong></article></div>
        <div className="panel__heading"><div><span className="eyebrow">Auditoria completa</span><h3>Execuções, falhas e restaurações</h3></div></div>
        {filteredRuns.length ? <div className="automation-history-table"><div className="automation-history-table__head"><span>Automação</span><span>Execução</span><span>Resultado</span><span>Ações</span></div>{filteredRuns.slice(0, 80).map((run) => <article key={run.id}><div><span className={`run-dot run-dot--${run.status}`} /><div><strong>{rules.find((rule) => rule.id === run.ruleId)?.name ?? 'Regra removida'}</strong><small>{triggerLabels[String(run.input.triggerType ?? 'manual') as keyof typeof triggerLabels] ?? 'Evento'}</small></div></div><time>{formatDateTime(run.startedAt)}</time><div><StatusPill tone={runTone(run)}>{runLabel(run)}</StatusPill><small>{run.output.message ?? run.errorMessage ?? run.eventKey}</small></div><div><button type="button" className="icon-button" aria-label="Ver detalhes" onClick={() => setSelectedRun(run)}><Eye size={15} /></button>{canWrite && run.status === 'success' && !run.output.simulated && (run.output.mutations?.length ?? 0) > 0 ? <button type="button" className="icon-button" aria-label="Desfazer execução" onClick={() => void undoAutomationRun(run.id)}><RotateCcw size={15} /></button> : null}</div></article>)}</div> : <EmptyState icon={History} title="Nenhuma execução" description="Simulações, testes e execuções aparecerão aqui com o resultado completo." />}
      </section> : null}

      <AutomationModal open={canWrite && builderOpen} rule={editing} stages={snapshot?.stages ?? []} webhooks={webhookState.endpoints} loading={saving} onClose={() => { setBuilderOpen(false); setEditing(null) }} onSubmit={save} />
      <WebhookModal open={canManageQueue && webhookOpen} webhook={editingWebhook} loading={webhookSaving} testing={webhookTesting} onClose={() => { setWebhookOpen(false); setEditingWebhook(null) }} onSave={persistWebhook} onTest={testWebhook} />
      <Modal open={Boolean(testRule)} title="Testar automação antes de ativar" subtitle={canWrite ? "A simulação não altera dados e, quando encontra um lead compatível, libera a versão atual para ativação real. O teste real altera o CRM e é opcional." : "A simulação não altera nenhum dado."} size="lg" onClose={() => { setTestRule(null); setTestResult(null) }} footer={<><Button variant="secondary" onClick={() => { setTestRule(null); setTestResult(null) }}>Fechar</Button><Button variant="secondary" loading={running} disabled={!testLeadId} onClick={() => void simulate()}><FlaskConical size={16} /> Simular sem alterar</Button>{canWrite ? <Button loading={running} disabled={!testLeadId || testResult?.matched === false} onClick={() => void executeTest()}><Play size={16} /> Teste real · altera CRM</Button> : null}</>}>
        <div className="automation-test-layout"><label className="form-field"><span>Contato para o teste</span><NativeSelectionSelect value={testLeadId} onChange={(event) => { setTestLeadId(event.target.value); setTestResult(null) }}><option value="">Selecione</option>{snapshot?.leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name} · {lead.company}</option>)}</NativeSelectionSelect></label>{testResult ? <section className={`automation-simulation-result ${testResult.matched ? 'is-matched' : 'is-unmatched'}`}><header>{testResult.matched ? <CheckCircle2 /> : <AlertTriangle />}<div><strong>{testResult.matched ? 'O contato atende às condições' : 'O contato não atende às condições'}</strong><span>{testResult.leadName} · {testResult.trigger}</span></div><StatusPill tone={testResult.mode === 'live' ? 'info' : 'warning'}>{testResult.mode === 'live' ? 'Regra real' : 'Regra em simulação'}</StatusPill></header><div className="automation-simulation-columns"><div><small>CONDIÇÕES</small>{testResult.conditionResults.length ? testResult.conditionResults.map((item) => <span key={item.label} className={item.matched ? 'is-ok' : 'is-fail'}>{item.matched ? '✓' : '×'} {item.label}</span>) : <span className="is-ok">✓ Sem condições adicionais</span>}</div><div><small>AÇÕES PREVISTAS</small>{testResult.actions.map((action) => <span key={action}>→ {action}</span>)}</div></div>{testResult.matched ? <div className="automation-preflight-certificate"><ShieldCheck size={15} /><span>Teste aprovado para a versão atual da regra. Se a lógica mudar, será necessário simular novamente.</span></div> : null}{testResult.warnings.length ? <div className="automation-simulation-warnings">{testResult.warnings.map((warning) => <span key={warning}><AlertTriangle size={13} /> {warning}</span>)}</div> : null}</section> : <div className="automation-test-placeholder"><FlaskConical size={28} /><strong>Escolha um contato e simule primeiro</strong><span>Você verá exatamente quais condições passam e quais ações seriam realizadas.</span></div>}</div>
      </Modal>
      <Modal open={Boolean(selectedWorkflow)} title="Workflow Runtime 3.0" subtitle={selectedWorkflow ? `${selectedWorkflow.triggerType} · ${selectedWorkflow.status}` : ''} size="lg" onClose={() => setSelectedWorkflow(null)} footer={<Button variant="secondary" onClick={() => setSelectedWorkflow(null)}>Fechar</Button>}>
        {selectedWorkflow ? <div className="automation-run-details"><div><span>Status</span><strong>{selectedWorkflow.status}</strong></div><div><span>Etapa atual</span><strong>{selectedWorkflow.currentStep + 1} · tentativa {selectedWorkflow.attempts}/{selectedWorkflow.maxAttempts}</strong></div><div><span>Próxima retomada</span><strong>{formatDateTime(selectedWorkflow.nextRunAt)}</strong></div><div><span>Idempotência</span><code>{selectedWorkflow.idempotencyKey}</code></div><div><span>Correlação</span><code>{selectedWorkflow.correlationId}</code></div>{selectedWorkflow.lastError ? <section className="is-warning"><small>ÚLTIMO ERRO</small><span><AlertTriangle size={12} /> {selectedWorkflow.lastError}</span></section> : null}<section><small>ETAPAS PERSISTIDAS</small>{runtimeState.steps.filter((step) => step.executionId === selectedWorkflow.id).map((step) => <span key={step.id}>#{step.stepIndex + 1} · {step.stepType} · {step.actionType ?? 'controle'} · {step.status}{step.scheduledFor ? ` · ${formatDateTime(step.scheduledFor)}` : ''}{step.errorMessage ? ` · ${step.errorMessage}` : ''}</span>)}</section></div> : null}
      </Modal>
      <Modal open={Boolean(selectedRun)} title="Detalhes da execução" subtitle={selectedRun ? formatDateTime(selectedRun.startedAt) : ''} onClose={() => setSelectedRun(null)} footer={<Button variant="secondary" onClick={() => setSelectedRun(null)}>Fechar</Button>}>
        {selectedRun ? <div className="automation-run-details"><div><span>Status</span><StatusPill tone={runTone(selectedRun)}>{runLabel(selectedRun)}</StatusPill></div><div><span>Mensagem</span><strong>{selectedRun.output.message ?? selectedRun.errorMessage ?? 'Sem mensagem'}</strong></div><div><span>Evento</span><code>{String(selectedRun.input.triggerType ?? selectedRun.eventKey)}</code></div><div><span>Correlação</span><code>{selectedRun.output.correlationId ?? String(selectedRun.input.correlationId ?? 'não disponível')}</code></div><div><span>Duração e cadeia</span><strong>{selectedRun.output.durationMs ?? 0} ms · profundidade {selectedRun.output.chainDepth ?? 0}</strong></div>{selectedRun.output.actionPreview?.length ? <section><small>AÇÕES PROCESSADAS</small>{selectedRun.output.actionPreview.map((item) => <span key={item}>→ {item}</span>)}</section> : null}{selectedRun.output.warnings?.length ? <section className="is-warning"><small>ALERTAS</small>{selectedRun.output.warnings.map((item) => <span key={item}><AlertTriangle size={12} /> {item}</span>)}</section> : null}</div> : null}
      </Modal>
    </div>
  )
}
