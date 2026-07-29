import {
  AlertTriangle, Bell, CheckCircle2, ClipboardCheck, Clock3, Copy, Eye, Filter, FlaskConical, Gauge, History,
  Inbox, Layers3, Mail, MessageCircle, Pencil, Play, Plus, RefreshCw, RotateCcw, Search, ShieldCheck, Sparkles, Trash2, Webhook, XCircle, Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { Modal } from '../../components/ui/modal'
import { StatusPill } from '../../components/ui/status-pill'
import { formatDateTime } from '../../domain/formatters'
import type { AutomationRule, AutomationRun } from '../../domain/types'
import {
  AUTOMATION_RECIPES, automationHealth, automationRuleRisk, createAutomationRecipe, readAutomationGuard, triggerLabels,
  validateAutomationRule, visibleAutomationConditions, type AutomationSimulationResult,
} from '../../services/automation-workspace'
import { AutomationModal } from './automation-modal'
import { WebhookModal } from './webhook-modal'
import {
  cancelAutomationEvent, loadAutomationOperations, markContactDraft, markSellerNotification, retryAutomationEvent,
  retryFailedAutomationEvents, type AutomationOperationsState, type AutomationQueueStatus,
} from '../../services/automation-operations'
import {
  deleteWebhook, dispatchAutomationWebhook, loadWebhookState, maskWebhookUrl, saveWebhook,
  type AutomationWebhook, type WebhookInput, type WebhookState, type WebhookDeliveryStatus,
} from '../../services/automation-webhooks'

type AutomationTab = 'rules' | 'recipes' | 'webhooks' | 'operations' | 'history'
type RuleFilter = 'all' | 'active' | 'paused' | 'simulation' | 'attention'

const runTone = (run: AutomationRun) => run.status === 'success' ? 'success' : run.status === 'failed' ? 'danger' : run.status === 'undone' ? 'warning' : 'info'
const runLabel = (run: AutomationRun) => run.status === 'success' ? run.output.simulated ? 'Simulação' : run.output.skippedReason ? 'Ignorada' : 'Sucesso' : run.status === 'failed' ? 'Falha' : run.status === 'undone' ? 'Desfeita' : 'Executando'
const queuePresentation: Record<AutomationQueueStatus, { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }> = {
  queued: { label: 'Na fila', tone: 'info' }, processing: { label: 'Processando', tone: 'warning' }, completed: { label: 'Concluído', tone: 'success' },
  failed: { label: 'Nova tentativa', tone: 'warning' }, cancelled: { label: 'Cancelado', tone: 'neutral' }, dead_letter: { label: 'Intervenção', tone: 'danger' },
}

export function AutomationsPage() {
  const {
    snapshot, currentWorkspace, createAutomationRule, updateAutomationRule, deleteAutomationRule, simulateAutomationRule, runAutomationRule,
    runAutomationChecks, undoAutomationRun, notify, canWrite, confirmAction,
  } = useApp()
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
  const [queueFilter, setQueueFilter] = useState<'all' | AutomationQueueStatus>('all')
  const [webhookState, setWebhookState] = useState<WebhookState>({ endpoints: [], deliveries: [] })
  const [webhookLoading, setWebhookLoading] = useState(false)
  const [webhookSaving, setWebhookSaving] = useState(false)
  const [webhookTesting, setWebhookTesting] = useState(false)
  const [webhookOpen, setWebhookOpen] = useState(false)
  const [editingWebhook, setEditingWebhook] = useState<AutomationWebhook | null>(null)
  const [deliveryFilter, setDeliveryFilter] = useState<'all' | WebhookDeliveryStatus>('all')

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
  const filteredRuns = runs.filter((run) => runFilter === 'all' || (runFilter === 'simulation' ? run.output.simulated : runFilter === 'skipped' ? run.output.skippedReason : run.status === runFilter))
  const canManageQueue = currentWorkspace?.role === 'owner' || currentWorkspace?.role === 'admin'
  const leadNames = useMemo(() => new Map((snapshot?.leads ?? []).map((lead) => [lead.id, `${lead.name}${lead.company ? ` · ${lead.company}` : ''}`])), [snapshot?.leads])
  const filteredQueue = operations.queue.filter((item) => queueFilter === 'all' || item.status === queueFilter)
  const queueAttention = operations.queue.filter((item) => ['failed', 'dead_letter'].includes(item.status)).length
  const queuePending = operations.queue.filter((item) => ['queued', 'processing'].includes(item.status)).length
  const unreadNotifications = operations.notifications.filter((item) => item.status === 'unread').length
  const readyDrafts = operations.drafts.filter((item) => item.status === 'ready').length
  const failedDeliveries = webhookState.deliveries.filter((item) => item.status === 'failed').length
  const filteredDeliveries = webhookState.deliveries.filter((item) => deliveryFilter === 'all' || item.status === deliveryFilter)

  const refreshOperations = useCallback(async () => {
    if (!currentWorkspace) return
    setOperationsLoading(true)
    try { setOperations(await loadAutomationOperations(currentWorkspace.id, currentWorkspace.role === 'owner' || currentWorkspace.role === 'admin')) }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível carregar a operação.') }
    finally { setOperationsLoading(false) }
  }, [currentWorkspace, notify])

  const refreshWebhooks = useCallback(async () => {
    if (!currentWorkspace) return
    setWebhookLoading(true)
    try { setWebhookState(await loadWebhookState(currentWorkspace.id)) }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível carregar os webhooks.') }
    finally { setWebhookLoading(false) }
  }, [currentWorkspace, notify])

  useEffect(() => { if (tab === 'operations') void refreshOperations() }, [refreshOperations, tab])
  useEffect(() => { if (currentWorkspace) void refreshWebhooks() }, [currentWorkspace, refreshWebhooks])

  const runOperation = async (operation: () => Promise<unknown>, success: string) => {
    try { await operation(); notify('success', success); await refreshOperations() }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível concluir a operação.') }
  }

  const copyDraft = async (draftId: string, message: string) => {
    try {
      await navigator.clipboard.writeText(message)
      if (currentWorkspace && canWrite) await markContactDraft(currentWorkspace.id, draftId)
      notify('success', 'Mensagem copiada e marcada como utilizada.')
      await refreshOperations()
    } catch { notify('error', 'Não foi possível copiar a mensagem.') }
  }

  const save = async (input: Pick<AutomationRule, 'name' | 'enabled' | 'triggerType' | 'conditions' | 'actions'>) => {
    setSaving(true)
    try {
      if (editing) await updateAutomationRule(editing.id, input)
      else await createAutomationRule(input)
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

  const openTest = (rule: AutomationRule) => {
    setTestRule(rule); setTestLeadId(snapshot?.leads[0]?.id ?? ''); setTestResult(null)
  }

  const simulate = async () => {
    if (!testRule || !testLeadId) return
    setRunning(true)
    try { setTestResult(await simulateAutomationRule(testRule.id, testLeadId)) }
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
    <div className="page-stack automations-page automations-page--professional">
      <section className="toolbar-card automations-toolbar">
        <div><span className="eyebrow"><ShieldCheck size={14} /> Motor comercial seguro</span><h2>Automações Comerciais</h2><p>Construa fluxos de gatilho, condições e ações com simulação, limites, auditoria e restauração.</p></div>
        <div className="toolbar-card__actions">{canWrite ? <><Button variant="secondary" loading={checking} onClick={() => void runChecks()}><Clock3 size={17} /> Executar checagens</Button><Button onClick={() => { setEditing(null); setBuilderOpen(true) }}><Plus size={17} /> Nova automação</Button></> : null}</div>
      </section>

      <section className="automation-health-grid">
        <article className="automation-health-card"><span><Zap /></span><div><small>Regras ativas</small><strong>{health.active}</strong><em>{health.simulation} em simulação</em></div></article>
        <article className="automation-health-card"><span className="is-success"><Gauge /></span><div><small>Confiabilidade</small><strong>{health.successRate}%</strong><em>últimas execuções</em></div></article>
        <article className="automation-health-card"><span className={health.failures24h ? 'is-danger' : 'is-success'}><AlertTriangle /></span><div><small>Falhas em 24h</small><strong>{health.failures24h}</strong><em>{health.failures24h ? 'requer atenção' : 'operação estável'}</em></div></article>
        <article className="automation-health-card"><span className={failedRules ? 'is-warning' : 'is-success'}><ShieldCheck /></span><div><small>Validação</small><strong>{failedRules}</strong><em>{failedRules ? 'regra(s) com erro' : 'sem bloqueios'}</em></div></article>
      </section>

      <nav className="automation-tabs" aria-label="Áreas de automação">
        <button className={tab === 'rules' ? 'is-active' : ''} onClick={() => setTab('rules')}><Layers3 size={16} /> Regras <span>{rules.length}</span></button>
        <button className={tab === 'recipes' ? 'is-active' : ''} onClick={() => setTab('recipes')}><Sparkles size={16} /> Templates <span>{AUTOMATION_RECIPES.length}</span></button><button className={tab === 'webhooks' ? 'is-active' : ''} onClick={() => setTab('webhooks')}><Webhook size={16} /> Webhooks <span>{failedDeliveries || webhookState.endpoints.length}</span></button>
        <button className={tab === 'operations' ? 'is-active' : ''} onClick={() => setTab('operations')}><Inbox size={16} /> Operação <span>{queueAttention + unreadNotifications + readyDrafts}</span></button>
        <button className={tab === 'history' ? 'is-active' : ''} onClick={() => setTab('history')}><History size={16} /> Histórico <span>{runs.length}</span></button>
      </nav>

      {tab === 'rules' ? <>
        <section className="automation-filterbar">
          <label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar automação ou gatilho" /></label>
          <label className="compact-select"><Filter size={15} /><span>Exibir</span><select value={ruleFilter} onChange={(event) => setRuleFilter(event.target.value as RuleFilter)}><option value="all">Todas</option><option value="active">Ativas</option><option value="paused">Pausadas</option><option value="simulation">Em simulação</option><option value="attention">Com alertas</option></select></label>
        </section>
        <section className="automation-rule-grid">
          {filteredRules.map((rule) => {
            const guard = readAutomationGuard(rule.conditions)
            const validation = validateAutomationRule(rule, snapshot?.stages ?? [])
            const risk = automationRuleRisk(rule)
            const ruleRuns = runs.filter((run) => run.ruleId === rule.id)
            const lastRun = ruleRuns[0]
            return <article className="automation-rule-card" key={rule.id}>
              <header><span className={`automation-rule-card__icon ${rule.enabled ? 'is-enabled' : ''}`}><Zap size={18} /></span><div><div><strong>{rule.name}</strong><StatusPill tone={rule.enabled ? 'success' : 'neutral'}>{rule.enabled ? 'Ligada' : 'Pausada'}</StatusPill><StatusPill tone={guard.mode === 'live' ? 'info' : 'warning'}>{guard.mode === 'live' ? 'Execução real' : 'Simulação'}</StatusPill></div><p>{triggerLabels[rule.triggerType]}</p></div>{canWrite ? <button className="switch" aria-label={`${rule.enabled ? 'Pausar' : 'Ativar'} ${rule.name}`} aria-pressed={rule.enabled} onClick={() => void updateAutomationRule(rule.id, { enabled: !rule.enabled })}><span /></button> : null}</header>
              <div className="automation-rule-card__flow"><div><small>QUANDO</small><strong>{triggerLabels[rule.triggerType]}</strong></div><i>→</i><div><small>SE</small><strong>{visibleAutomationConditions(rule.conditions).length} condição(ões)</strong></div><i>→</i><div><small>FAZER</small><strong>{rule.actions.length} ação(ões)</strong></div></div>
              <div className="automation-rule-card__safety"><span><ShieldCheck size={14} /> Risco {risk === 'low' ? 'baixo' : risk === 'medium' ? 'médio' : 'alto'}</span><span>{guard.cooldownHours ? `${guard.cooldownHours}h de intervalo` : 'sem intervalo'}</span><span>máx. {guard.maxRunsPerLeadPerDay}/lead/dia</span></div>
              {validation.errors.length || validation.warnings.length ? <div className={`automation-rule-card__warning ${validation.errors.length ? 'is-error' : ''}`}><AlertTriangle size={14} /><span>{validation.errors[0] ?? validation.warnings[0]}</span></div> : null}
              <footer><div>{lastRun ? <><small>Última execução</small><strong>{formatDateTime(lastRun.startedAt)} · {runLabel(lastRun)}</strong></> : <><small>Ainda não executada</small><strong>Teste com um lead antes de ativar</strong></>}</div><div><button className="icon-button" aria-label="Simular automação" onClick={() => openTest(rule)}><FlaskConical size={16} /></button>{canWrite ? <><button className="icon-button" aria-label="Editar automação" onClick={() => { setEditing(rule); setBuilderOpen(true) }}><Pencil size={16} /></button><button className="icon-button icon-button--danger" aria-label="Excluir automação" onClick={() => void (async () => { if (await confirmAction({ title: `Excluir “${rule.name}”?`, description: 'A regra será removida e não executará novamente.', confirmLabel: 'Excluir automação', tone: 'danger' })) await deleteAutomationRule(rule.id) })()}><Trash2 size={16} /></button></> : null}</div></footer>
            </article>
          })}
          {!filteredRules.length ? <div className="automation-empty-span"><EmptyState icon={Sparkles} title="Nenhuma regra encontrada" description="Ajuste os filtros, crie uma automação ou use um template pronto." /></div> : null}
        </section>
      </> : null}

      {tab === 'recipes' ? <section className="page-stack">
        <div className="automation-recipe-header"><div><span className="eyebrow">Modelos prontos</span><h3>Templates comerciais seguros</h3><p>Todas são adicionadas pausadas e em modo de simulação para revisão antes da execução real.</p></div><label className="compact-select"><Filter size={15} /><span>Categoria</span><select value={recipeCategory} onChange={(event) => setRecipeCategory(event.target.value)}>{recipeCategories.map((category) => <option key={category}>{category}</option>)}</select></label></div>
        <div className="automation-recipe-grid">{filteredRecipes.map((recipe) => <article className="automation-recipe-card" key={recipe.id}><header><span><Sparkles size={18} /></span><em>{recipe.category}</em></header><h3>{recipe.name}</h3><p>{recipe.description}</p><div><span><Zap size={13} /> {triggerLabels[recipe.triggerType]}</span><span>{recipe.actions.length} ações</span></div>{canWrite ? <Button variant="secondary" onClick={() => void createRecipe(recipe.id)}><Plus size={15} /> Usar template</Button> : null}</article>)}</div>
      </section> : null}

      {tab === 'webhooks' ? <section className="automation-webhooks-page">
        <header className="automation-operations__header"><div><span className="eyebrow">Integrações externas</span><h3>Webhooks gerenciados</h3><p>Cadastre destinos, teste assinaturas e acompanhe cada entrega sem expor segredos no navegador.</p></div><div className="toolbar-card__actions"><Button variant="secondary" loading={webhookLoading} onClick={() => void refreshWebhooks()}><RefreshCw size={16} /> Atualizar</Button>{canManageQueue ? <Button onClick={() => { setEditingWebhook(null); setWebhookOpen(true) }}><Plus size={16} /> Novo webhook</Button> : null}</div></header>
        <div className="automation-webhook-grid">{webhookState.endpoints.map((webhook) => <article className="automation-webhook-card" key={webhook.id}><header><span className={webhook.enabled ? 'is-enabled' : ''}><Webhook size={18} /></span><div><strong>{webhook.name}</strong><small>{webhook.method} · {maskWebhookUrl(webhook.url)}</small></div><StatusPill tone={webhook.enabled ? 'success' : 'neutral'}>{webhook.enabled ? 'Ativo' : 'Pausado'}</StatusPill></header><div className="automation-webhook-meta"><span>{webhook.maxAttempts} tentativa(s)</span><span>{webhook.timeoutSeconds}s de timeout</span><span>{webhook.hasSecret ? 'Assinatura configurada' : 'Sem assinatura'}</span></div><footer><small>Atualizado em {formatDateTime(webhook.updatedAt)}</small>{canManageQueue ? <div><button className="icon-button" aria-label="Testar webhook" onClick={() => { setEditingWebhook(webhook); setWebhookOpen(true) }}><FlaskConical size={15} /></button><button className="icon-button" aria-label="Editar webhook" onClick={() => { setEditingWebhook(webhook); setWebhookOpen(true) }}><Pencil size={15} /></button><button className="icon-button icon-button--danger" aria-label="Excluir webhook" onClick={() => void removeWebhook(webhook)}><Trash2 size={15} /></button></div> : null}</footer></article>)}{!webhookState.endpoints.length ? <div className="automation-empty-span"><EmptyState icon={Webhook} title="Nenhum webhook cadastrado" description="Crie um destino, faça um teste e depois selecione a ação Enviar webhook em uma regra." /></div> : null}</div>
        <section className="panel automation-webhook-deliveries"><div className="panel__heading"><div><span className="eyebrow">Auditoria externa</span><h3>Histórico de entregas</h3></div><label className="compact-select"><Filter size={14} /><span>Status</span><select value={deliveryFilter} onChange={(event) => setDeliveryFilter(event.target.value as typeof deliveryFilter)}><option value="all">Todos</option><option value="pending">Pendente</option><option value="sending">Enviando</option><option value="success">Sucesso</option><option value="failed">Falha</option><option value="simulated">Simulado</option><option value="cancelled">Cancelado</option></select></label></div>{filteredDeliveries.length ? <div className="automation-delivery-list">{filteredDeliveries.slice(0, 100).map((delivery) => { const endpoint = webhookState.endpoints.find((item) => item.id === delivery.webhookId); return <article key={delivery.id}><div><StatusPill tone={delivery.status === 'success' ? 'success' : delivery.status === 'failed' ? 'danger' : delivery.status === 'simulated' ? 'warning' : 'info'}>{delivery.status}</StatusPill><div><strong>{endpoint?.name ?? 'Webhook removido'}</strong><small>{delivery.eventType} · {delivery.leadId ? leadNames.get(delivery.leadId) ?? 'Lead relacionado' : 'Teste técnico'}</small></div></div><div><span>{delivery.attempts} tentativa(s)</span><time>{formatDateTime(delivery.finishedAt ?? delivery.createdAt)}</time>{delivery.errorMessage ? <small>{delivery.errorMessage}</small> : delivery.responseStatus ? <small>HTTP {delivery.responseStatus}</small> : null}</div></article> })}</div> : <EmptyState icon={CheckCircle2} title="Sem entregas registradas" description="Testes e envios automáticos aparecerão aqui com status, resposta e tentativas." />}</section>
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
          <div className="panel__heading"><div><span className="eyebrow">Processamento resiliente</span><h3>Fila de automação</h3></div><div className="automation-queue-actions"><label className="compact-select"><Filter size={14} /><span>Status</span><select value={queueFilter} onChange={(event) => setQueueFilter(event.target.value as typeof queueFilter)}><option value="all">Todos</option>{Object.entries(queuePresentation).map(([value, item]) => <option value={value} key={value}>{item.label}</option>)}</select></label>{queueAttention ? <Button size="sm" variant="secondary" disabled={!canManageQueue} onClick={() => currentWorkspace && void runOperation(() => retryFailedAutomationEvents(currentWorkspace.id), 'Eventos devolvidos à fila.')}><RotateCcw size={14} /> Reprocessar falhas</Button> : null}</div></div>
          {filteredQueue.length ? <div className="automation-queue-list">{filteredQueue.slice(0, 80).map((item) => <article key={item.id}><div><StatusPill tone={queuePresentation[item.status].tone}>{queuePresentation[item.status].label}</StatusPill><strong>{item.triggerType.replaceAll('_', ' ')}</strong><small>{item.leadId ? leadNames.get(item.leadId) ?? 'Lead não carregado' : item.entityId}</small></div><div><span>{item.attempts}/{item.maxAttempts} tentativa(s)</span><time>{formatDateTime(item.lastAttemptAt ?? item.createdAt)}</time>{item.lastError ? <small title={item.lastError}>{item.lastError}</small> : null}</div><div>{['failed', 'dead_letter', 'cancelled'].includes(item.status) ? <button className="icon-button" disabled={!canManageQueue} aria-label="Reprocessar evento" onClick={() => currentWorkspace && void runOperation(() => retryAutomationEvent(currentWorkspace.id, item.id), 'Evento devolvido à fila.')}><RotateCcw size={15} /></button> : null}{['queued', 'failed'].includes(item.status) ? <button className="icon-button icon-button--danger" disabled={!canManageQueue} aria-label="Cancelar evento" onClick={() => currentWorkspace && void runOperation(() => cancelAutomationEvent(currentWorkspace.id, item.id), 'Evento cancelado.')}><XCircle size={15} /></button> : null}</div></article>)}</div> : <EmptyState icon={CheckCircle2} title="Fila sem pendências" description="Novas capturas e eventos externos aparecerão aqui com tentativas, status e erro detalhado." />}
        </section>

        <div className="automation-operation-columns">
          <section className="panel automation-operation-list"><div className="panel__heading"><div><span className="eyebrow">Ação interna</span><h3>Avisos ao vendedor</h3></div><Bell size={19} /></div>{operations.notifications.length ? operations.notifications.slice(0, 30).map((item) => <article className={item.status === 'unread' ? 'is-unread' : ''} key={item.id}><span className={`operation-dot operation-dot--${item.severity}`} /><div><strong>{item.title}</strong><p>{item.body}</p><small>{item.leadId ? leadNames.get(item.leadId) ?? 'Lead relacionado' : 'Operação geral'} · {formatDateTime(item.createdAt)}</small></div>{item.status === 'unread' && canWrite ? <button className="icon-button" aria-label="Marcar aviso como lido" onClick={() => currentWorkspace && void runOperation(() => markSellerNotification(currentWorkspace.id, item.id), 'Aviso marcado como lido.')}><CheckCircle2 size={15} /></button> : null}</article>) : <EmptyState icon={Bell} title="Nenhum aviso" description="Alertas internos gerados pelas regras aparecerão aqui." />}</section>
          <section className="panel automation-operation-list"><div className="panel__heading"><div><span className="eyebrow">Envio assistido</span><h3>Mensagens preparadas</h3></div><MessageCircle size={19} /></div>{operations.drafts.length ? operations.drafts.slice(0, 30).map((item) => <article className={item.status === 'ready' ? 'is-unread' : ''} key={item.id}><span className="operation-channel">{item.channel === 'email' ? <Mail size={15} /> : <MessageCircle size={15} />}</span><div><strong>{item.subject || (item.channel === 'whatsapp' ? 'WhatsApp preparado' : 'Abordagem preparada')}</strong><p>{item.message}</p><small>{leadNames.get(item.leadId) ?? 'Lead relacionado'} · {item.status === 'ready' ? 'Pronta para revisar' : item.status === 'used' ? 'Utilizada' : 'Descartada'}</small></div>{item.status === 'ready' ? <button className="icon-button" aria-label="Copiar mensagem" onClick={() => void copyDraft(item.id, item.message)}><Copy size={15} /></button> : null}</article>) : <EmptyState icon={MessageCircle} title="Nenhuma mensagem preparada" description="Ações assistidas de WhatsApp e e-mail aparecerão aqui sem envio automático." />}</section>
        </div>
      </section> : null}

      {tab === 'history' ? <section className="panel automation-history-panel">
        <div className="panel__heading"><div><span className="eyebrow">Auditoria completa</span><h3>Execuções, falhas e restaurações</h3></div><label className="compact-select"><Filter size={15} /><span>Status</span><select value={runFilter} onChange={(event) => setRunFilter(event.target.value)}><option value="all">Todos</option><option value="success">Sucesso</option><option value="failed">Falha</option><option value="simulation">Simulação</option><option value="skipped">Ignorada</option><option value="undone">Desfeita</option></select></label></div>
        {filteredRuns.length ? <div className="automation-history-table"><div className="automation-history-table__head"><span>Automação</span><span>Execução</span><span>Resultado</span><span>Ações</span></div>{filteredRuns.slice(0, 80).map((run) => <article key={run.id}><div><span className={`run-dot run-dot--${run.status}`} /><div><strong>{rules.find((rule) => rule.id === run.ruleId)?.name ?? 'Regra removida'}</strong><small>{triggerLabels[String(run.input.triggerType ?? 'manual') as keyof typeof triggerLabels] ?? 'Evento'}</small></div></div><time>{formatDateTime(run.startedAt)}</time><div><StatusPill tone={runTone(run)}>{runLabel(run)}</StatusPill><small>{run.output.message ?? run.errorMessage ?? run.eventKey}</small></div><div><button className="icon-button" aria-label="Ver detalhes" onClick={() => setSelectedRun(run)}><Eye size={15} /></button>{canWrite && run.status === 'success' && !run.output.simulated && (run.output.mutations?.length ?? 0) > 0 ? <button className="icon-button" aria-label="Desfazer execução" onClick={() => void undoAutomationRun(run.id)}><RotateCcw size={15} /></button> : null}</div></article>)}</div> : <EmptyState icon={History} title="Nenhuma execução" description="Simulações, testes e execuções aparecerão aqui com o resultado completo." />}
      </section> : null}

      <AutomationModal open={canWrite && builderOpen} rule={editing} stages={snapshot?.stages ?? []} webhooks={webhookState.endpoints} loading={saving} onClose={() => { setBuilderOpen(false); setEditing(null) }} onSubmit={save} />
      <WebhookModal open={canManageQueue && webhookOpen} webhook={editingWebhook} loading={webhookSaving} testing={webhookTesting} onClose={() => { setWebhookOpen(false); setEditingWebhook(null) }} onSave={persistWebhook} onTest={testWebhook} />
      <Modal open={Boolean(testRule)} title="Simular e testar automação" subtitle={canWrite ? "A simulação não altera nenhum dado. O teste real executa as ações e registra uma transação reversível." : "A simulação não altera nenhum dado."} size="lg" onClose={() => { setTestRule(null); setTestResult(null) }} footer={<><Button variant="secondary" onClick={() => { setTestRule(null); setTestResult(null) }}>Fechar</Button><Button variant="secondary" loading={running} disabled={!testLeadId} onClick={() => void simulate()}><FlaskConical size={16} /> Simular sem alterar</Button>{canWrite ? <Button loading={running} disabled={!testLeadId || testResult?.matched === false} onClick={() => void executeTest()}><Play size={16} /> Executar teste real</Button> : null}</>}>
        <div className="automation-test-layout"><label className="form-field"><span>Lead para o teste</span><select value={testLeadId} onChange={(event) => { setTestLeadId(event.target.value); setTestResult(null) }}><option value="">Selecione</option>{snapshot?.leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name} · {lead.company}</option>)}</select></label>{testResult ? <section className={`automation-simulation-result ${testResult.matched ? 'is-matched' : 'is-unmatched'}`}><header>{testResult.matched ? <CheckCircle2 /> : <AlertTriangle />}<div><strong>{testResult.matched ? 'O lead atende às condições' : 'O lead não atende às condições'}</strong><span>{testResult.leadName} · {testResult.trigger}</span></div><StatusPill tone={testResult.mode === 'live' ? 'info' : 'warning'}>{testResult.mode === 'live' ? 'Regra real' : 'Regra em simulação'}</StatusPill></header><div className="automation-simulation-columns"><div><small>CONDIÇÕES</small>{testResult.conditionResults.length ? testResult.conditionResults.map((item) => <span key={item.label} className={item.matched ? 'is-ok' : 'is-fail'}>{item.matched ? '✓' : '×'} {item.label}</span>) : <span className="is-ok">✓ Sem condições adicionais</span>}</div><div><small>AÇÕES PREVISTAS</small>{testResult.actions.map((action) => <span key={action}>→ {action}</span>)}</div></div>{testResult.warnings.length ? <div className="automation-simulation-warnings">{testResult.warnings.map((warning) => <span key={warning}><AlertTriangle size={13} /> {warning}</span>)}</div> : null}</section> : <div className="automation-test-placeholder"><FlaskConical size={28} /><strong>Escolha um lead e simule primeiro</strong><span>Você verá exatamente quais condições passam e quais ações seriam realizadas.</span></div>}</div>
      </Modal>
      <Modal open={Boolean(selectedRun)} title="Detalhes da execução" subtitle={selectedRun ? formatDateTime(selectedRun.startedAt) : ''} onClose={() => setSelectedRun(null)} footer={<Button variant="secondary" onClick={() => setSelectedRun(null)}>Fechar</Button>}>
        {selectedRun ? <div className="automation-run-details"><div><span>Status</span><StatusPill tone={runTone(selectedRun)}>{runLabel(selectedRun)}</StatusPill></div><div><span>Mensagem</span><strong>{selectedRun.output.message ?? selectedRun.errorMessage ?? 'Sem mensagem'}</strong></div><div><span>Evento</span><code>{String(selectedRun.input.triggerType ?? selectedRun.eventKey)}</code></div><div><span>Correlação</span><code>{selectedRun.output.correlationId ?? String(selectedRun.input.correlationId ?? 'não disponível')}</code></div><div><span>Duração e cadeia</span><strong>{selectedRun.output.durationMs ?? 0} ms · profundidade {selectedRun.output.chainDepth ?? 0}</strong></div>{selectedRun.output.actionPreview?.length ? <section><small>AÇÕES PROCESSADAS</small>{selectedRun.output.actionPreview.map((item) => <span key={item}>→ {item}</span>)}</section> : null}{selectedRun.output.warnings?.length ? <section className="is-warning"><small>ALERTAS</small>{selectedRun.output.warnings.map((item) => <span key={item}><AlertTriangle size={12} /> {item}</span>)}</section> : null}</div> : null}
      </Modal>
    </div>
  )
}
