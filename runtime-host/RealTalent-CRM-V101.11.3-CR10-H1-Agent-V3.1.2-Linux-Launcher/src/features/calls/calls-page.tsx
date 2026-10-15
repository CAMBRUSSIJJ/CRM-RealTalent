import { NativeSelectionSelect } from '../../components/selection'
import { ArrowUpRight, CalendarClock, CheckSquare, Eye, History, PhoneCall, Play, RotateCcw, Search, Settings2, Sparkles, Square, Target, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAppActions, useAppNavigation, useAppUi, useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { StatusPill } from '../../components/ui/status-pill'
import { WorkspaceDisplayMenu, WorkspaceFilterChips, WorkspaceFilterMenu, WorkspaceViewStrip as FilterWorkspaceViewStrip, type WorkspaceFilterField } from '../../components/workspace/workspace-filter-system'
import { WorkspaceCommandBar, WorkspaceCommandGroup, WorkspacePageHeader, WorkspaceSummaryMetric, WorkspaceSummaryStrip, WorkspaceViewStrip } from '../../components/workspace/workspace-shell'
import { formatDateTime } from '../../domain/formatters'
import { nextRovingIndex } from '../../lib/keyboard-navigation'
import type { CallOutcome, CallRecord, LeadPriority } from '../../domain/types'
import { buildCallQueue, calculateCallPerformance, outcomeDefinition, outcomeLabel, type CallQueueBucket } from '../../services/call-workspace'
import { recommendCommercialAction } from '../../services/commercial-execution'
import { evaluateCallCoaching } from '../../services/coaching-engine'
import { callsForPeriod, type CallIntelligencePeriod } from '../../services/call-intelligence'
import { usePreferences } from '../settings/preferences-context'
import { CallDisplayPreferencesModal } from './call-display-preferences-modal'
import { readCallDisplayPreferences, saveCallDisplayPreferences, type CallDisplayPreferences } from '../../services/call-display-preferences'
import type { CallSessionConfig } from './call-session-config'
import { CallSessionPreparationModal } from './call-session-preparation-modal'
import { LazyCallWorkspaceModal } from './lazy-call-workspace-modal'
import { CallHistoryDetailModal } from './call-history-detail-modal'
import { CallsIntelligencePanel } from './calls-intelligence-panel'
import { CallsSettingsPanel } from './calls-settings-panel'

const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
const priorityLabel: Record<LeadPriority, string> = { urgent: 'Urgente', high: 'Alta', medium: 'Média', low: 'Baixa' }
const bucketLabel: Record<CallQueueBucket, string> = { all: 'Toda a fila', overdue: 'Atrasadas', today: 'Hoje', upcoming: 'Próximas', hot: 'Contatos quentes', proposal: 'Propostas', without_action: 'Sem próxima ação' }

type CallsView = 'operation' | 'history' | 'intelligence' | 'settings'
type HistoryPeriod = CallIntelligencePeriod

export function CallsPage() {
  const { snapshot, currentWorkspace, canWrite } = useAppWorkspace()
  const { navigate, routeContext, clearRouteContext } = useAppNavigation()
  const { notify, confirmAction } = useAppUi()
  const { deleteCall, resolveCallRecordingUrl, loadOlderCalls } = useAppActions()
  const { preferences } = usePreferences()
  const workspaceId = currentWorkspace?.id ?? snapshot?.workspace.id ?? 'default'
  const [view, setView] = useState<CallsView>('operation')
  const [query, setQuery] = useState('')
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)
  const [bucket, setBucket] = useState<CallQueueBucket>('all')
  const [priority, setPriority] = useState<'all' | LeadPriority>('all')
  const [stageFilter, setStageFilter] = useState('all')
  const [temperatureFilter, setTemperatureFilter] = useState<'all' | 'hot' | 'warm' | 'cold'>('all')
  const [attemptsFilter, setAttemptsFilter] = useState<'all' | '0' | '1-2' | '3+'>('all')
  const [lastOutcomeFilter, setLastOutcomeFilter] = useState<'all' | CallOutcome>('all')
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | CallOutcome>('all')
  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>('30d')
  const [selectedHistoryCall, setSelectedHistoryCall] = useState<CallRecord | null>(null)
  const [olderCallsLoading, setOlderCallsLoading] = useState(false)
  const [olderCallsExhausted, setOlderCallsExhausted] = useState(false)
  const [callOpen, setCallOpen] = useState(false)
  const [preparationOpen, setPreparationOpen] = useState(false)
  const [pendingLeadIds, setPendingLeadIds] = useState<string[]>([])
  const [pendingInitialLeadId, setPendingInitialLeadId] = useState('')
  const [sessionConfig, setSessionConfig] = useState<CallSessionConfig | null>(null)
  const [selectedQueueIds, setSelectedQueueIds] = useState<string[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [display, setDisplay] = useState<CallDisplayPreferences>(() => readCallDisplayPreferences(workspaceId))
  const [displayOpen, setDisplayOpen] = useState(false)

  useEffect(() => { setDisplay(readCallDisplayPreferences(workspaceId)); setOlderCallsExhausted(false) }, [workspaceId])

  const queue = useMemo(() => buildCallQueue(snapshot?.leads ?? [], snapshot?.calls ?? [], snapshot?.activities ?? [], snapshot?.stages ?? [], new Date(), snapshot?.contacts ?? []), [snapshot])
  const stats = useMemo(() => calculateCallPerformance(snapshot?.calls ?? []), [snapshot])
  const actionSuggestions = useMemo(() => new Map(queue.map((entry) => [entry.lead.id, recommendCommercialAction(entry.lead, entry.stage, snapshot?.calls ?? [], snapshot?.activities ?? [])])), [queue, snapshot?.activities, snapshot?.calls])
  const coachingReviews = useMemo(() => new Map((snapshot?.calls ?? []).map((call) => [call.id, evaluateCallCoaching({ call, lead: snapshot?.leads.find((lead) => lead.id === call.leadId), contacts: snapshot?.contacts ?? [], playbooks: snapshot?.playbooks ?? [] })])), [snapshot])

  const filteredQueue = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return queue.filter((entry) => {
      if (bucket !== 'all' && entry.bucket !== bucket) return false
      if (priority !== 'all' && entry.lead.priority !== priority) return false
      if (stageFilter !== 'all' && entry.lead.stageId !== stageFilter) return false
      if (temperatureFilter !== 'all' && entry.lead.temperature !== temperatureFilter) return false
      if (attemptsFilter === '0' && entry.attempts !== 0) return false
      if (attemptsFilter === '1-2' && (entry.attempts < 1 || entry.attempts > 2)) return false
      if (attemptsFilter === '3+' && entry.attempts < 3) return false
      if (lastOutcomeFilter !== 'all' && entry.lastCall?.outcome !== lastOutcomeFilter) return false
      if (!normalized) return true
      return `${entry.lead.name} ${entry.targetName} ${entry.lead.company} ${entry.targetPhone} ${entry.lead.city} ${entry.stage?.name ?? ''} ${entry.reason}`.toLowerCase().includes(normalized)
    })
  }, [attemptsFilter, bucket, lastOutcomeFilter, priority, query, queue, stageFilter, temperatureFilter])

  const history = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return callsForPeriod(snapshot?.calls ?? [], historyPeriod).filter((call) => {
      if (outcomeFilter !== 'all' && call.outcome !== outcomeFilter) return false
      const lead = snapshot?.leads.find((item) => item.id === call.leadId)
      return !normalized || `${lead?.name ?? ''} ${lead?.company ?? ''} ${call.notes} ${call.transcript} ${outcomeLabel(call.outcome)}`.toLowerCase().includes(normalized)
    }).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
  }, [historyPeriod, outcomeFilter, query, snapshot])

  const queueStats = useMemo(() => ({
    due: queue.filter((item) => item.bucket === 'today' || item.bucket === 'overdue').length,
    overdue: queue.filter((item) => item.bucket === 'overdue').length,
    hot: queue.filter((item) => item.lead.temperature === 'hot').length,
    callbacks: queue.filter((item) => item.lastCall?.outcome === 'callback_requested').length,
  }), [queue])


  const requestSession = (leadId = '', ids?: string[]) => {
    const baseIds = ids?.length ? ids : leadId ? [leadId, ...queue.filter((item) => item.lead.id !== leadId).map((item) => item.lead.id)] : filteredQueue.map((item) => item.lead.id)
    setPendingInitialLeadId(leadId || baseIds[0] || '')
    setPendingLeadIds([...new Set(baseIds)])
    setPreparationOpen(true)
  }

  const launchSession = (config: CallSessionConfig) => {
    setSessionConfig(config)
    setDisplay(config.display)
    saveCallDisplayPreferences(workspaceId, config.display)
    setPreparationOpen(false)
    setCallOpen(true)
  }

  useEffect(() => {
    if (routeContext.action !== 'start-call' || !routeContext.leadId || !snapshot?.leads.some((lead) => lead.id === routeContext.leadId)) return
    requestSession(routeContext.leadId, [routeContext.leadId])
    clearRouteContext(['leadId', 'action'])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeContext.action, routeContext.leadId, snapshot?.leads])

  const toggleQueueLead = (leadId: string) => setSelectedQueueIds((current) => current.includes(leadId) ? current.filter((id) => id !== leadId) : [...current, leadId])
  const allVisibleSelected = filteredQueue.length > 0 && filteredQueue.every((entry) => selectedQueueIds.includes(entry.lead.id))
  const selectVisible = () => setSelectedQueueIds((current) => {
    const visibleIds = new Set(filteredQueue.map((entry) => entry.lead.id))
    const allSelected = filteredQueue.length > 0 && filteredQueue.every((entry) => current.includes(entry.lead.id))
    return allSelected ? current.filter((id) => !visibleIds.has(id)) : [...new Set([...current, ...visibleIds])]
  })

  const loadPreviousHistory = async () => {
    if (olderCallsLoading || olderCallsExhausted) return
    setOlderCallsLoading(true)
    try {
      const loaded = await loadOlderCalls(200)
      if (loaded < 200) setOlderCallsExhausted(true)
      notify(loaded ? 'info' : 'success', loaded ? `${loaded} ligação(ões) antigas carregadas.` : 'Todo o histórico disponível já foi carregado.')
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível carregar o histórico anterior.') }
    finally { setOlderCallsLoading(false) }
  }

  const executeSuggestedAction = (leadId: string, kind: ReturnType<typeof recommendCommercialAction>['kind']) => {
    if (kind === 'prepare_proposal') { navigate('proposals', { leadId, action: 'create-proposal' }); return }
    if (kind === 'follow_proposal') { navigate('proposals', { leadId, action: 'follow-proposal' }); return }
    if (kind === 'schedule_meeting') { navigate('agenda', { leadId, action: 'create-meeting' }); return }
    if (kind === 'complete_contact' || kind === 'identify_decision_maker' || kind === 'review_lead') { navigate('leads', { leadId }); return }
    requestSession(leadId, [leadId])
  }

  const remove = async (id: string) => {
    const confirmed = await confirmAction({ title: 'Excluir ligação?', description: 'A ligação e a gravação associada serão removidas permanentemente.', confirmLabel: 'Excluir ligação', tone: 'danger', details: ['O histórico desta chamada deixará de aparecer no lead.', 'A gravação não poderá ser recuperada.'] })
    if (!confirmed) return
    setBusyId(id)
    try { await deleteCall(id); if (selectedHistoryCall?.id === id) setSelectedHistoryCall(null) } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível excluir.') } finally { setBusyId(null) }
  }

  const nextEntry = filteredQueue[0] ?? null
  const nextSuggestion = nextEntry ? actionSuggestions.get(nextEntry.lead.id) : null
  const historyPeriods: Array<[HistoryPeriod, string]> = [['today', 'Hoje'], ['7d', '7 dias'], ['30d', '30 dias'], ['all', 'Tudo']]
  const availableOutcomes = Object.values(snapshot?.calls.reduce((acc, call) => ({ ...acc, [call.outcome]: call.outcome }), {} as Record<string, CallOutcome>) ?? {})
  const activeOperationFilters = [bucket !== 'all', priority !== 'all', stageFilter !== 'all', temperatureFilter !== 'all', attemptsFilter !== 'all', lastOutcomeFilter !== 'all'].filter(Boolean).length
  const activeHistoryFilters = (outcomeFilter !== 'all' ? 1 : 0) + (historyPeriod !== '30d' ? 1 : 0)
  const universalOperationFilters: WorkspaceFilterField[] = [
    { key: 'bucket', label: 'Fila', value: bucket, allLabel: 'Toda a fila', group: 'Fila operacional', options: Object.entries(bucketLabel).filter(([value]) => value !== 'all').map(([value, label]) => ({ value, label })) },
    { key: 'priority', label: 'Prioridade', value: priority, allLabel: 'Todas', group: 'Qualificação', options: [{ value: 'urgent', label: 'Urgente' }, { value: 'high', label: 'Alta' }, { value: 'medium', label: 'Média' }, { value: 'low', label: 'Baixa' }] },
    { key: 'temperature', label: 'Temperatura', value: temperatureFilter, allLabel: 'Todas', group: 'Qualificação', options: [{ value: 'hot', label: 'Quente' }, { value: 'warm', label: 'Morno' }, { value: 'cold', label: 'Frio' }] },
    { key: 'stage', label: 'Etapa', value: stageFilter, allLabel: 'Todas as etapas', group: 'Negócio', options: [...(snapshot?.stages ?? [])].sort((a,b) => a.order-b.order).map((stage) => ({ value: stage.id, label: stage.name })) },
    { key: 'attempts', label: 'Tentativas', value: attemptsFilter, allLabel: 'Qualquer quantidade', group: 'Atividade', options: [{ value: '0', label: 'Nenhuma' }, { value: '1-2', label: '1 a 2' }, { value: '3+', label: '3 ou mais' }] },
    { key: 'lastOutcome', label: 'Último resultado', value: lastOutcomeFilter, allLabel: 'Qualquer resultado', group: 'Atividade', options: availableOutcomes.map((value) => ({ value, label: outcomeLabel(value) })) },
  ]
  const universalHistoryFilters: WorkspaceFilterField[] = [
    { key: 'outcome', label: 'Resultado', value: outcomeFilter, allLabel: 'Todos', group: 'Histórico', options: availableOutcomes.map((value) => ({ value, label: outcomeLabel(value) })) },
    { key: 'period', label: 'Período', value: historyPeriod, allValue: '30d', allLabel: '30 dias', group: 'Histórico', options: historyPeriods.filter(([value]) => value !== '30d').map(([value, label]) => ({ value, label })) },
  ]
  const changeOperationFilter = (key: string, value: string) => {
    if (key === 'bucket') setBucket(value as CallQueueBucket)
    else if (key === 'priority') setPriority(value as 'all' | LeadPriority)
    else if (key === 'stage') setStageFilter(value)
    else if (key === 'temperature') setTemperatureFilter(value as typeof temperatureFilter)
    else if (key === 'attempts') setAttemptsFilter(value as typeof attemptsFilter)
    else if (key === 'lastOutcome') setLastOutcomeFilter(value as 'all' | CallOutcome)
  }
  const clearOperationFilters = () => { setBucket('all'); setPriority('all'); setStageFilter('all'); setTemperatureFilter('all'); setAttemptsFilter('all'); setLastOutcomeFilter('all') }
  const clearHistoryFilters = () => { setOutcomeFilter('all'); setHistoryPeriod('30d') }
  const applyQueueView = (nextBucket: CallQueueBucket, nextOutcome: 'all' | CallOutcome = 'all') => { clearOperationFilters(); setBucket(nextBucket); setLastOutcomeFilter(nextOutcome) }
  const queueViewId = lastOutcomeFilter === 'callback_requested' ? 'callbacks' : bucket

  return <div className={`page-stack calls-page calls-page--professional calls-page--v69 calls-page-v10167 calls-page-v10171-structural calls-page-h20 ${moreFiltersOpen ? 'calls-page-v10167--filters-open' : ''}`}>
    <WorkspacePageHeader className="calls-page-header-h20" eyebrow="Execução por telefone" icon={PhoneCall} title="Ligações" description="Priorize, execute e aprenda com cada conversa sem trocar de contexto." actions={canWrite ? <><Button variant="secondary" size="sm" onClick={() => nextEntry && requestSession(nextEntry.lead.id, [nextEntry.lead.id])} disabled={!nextEntry}><PhoneCall size={16} /> Ligação avulsa</Button><Button size="sm" onClick={() => requestSession('', selectedQueueIds.length ? selectedQueueIds : filteredQueue.map((entry) => entry.lead.id))} disabled={!filteredQueue.length}><Play size={16} /> Começar ligações</Button></> : null} />

    <WorkspaceSummaryStrip className="calls-summary-strip-h20">
      <WorkspaceSummaryMetric label="Hoje" value={queueStats.due} meta="programadas ou vencidas" icon={CalendarClock} tone={queueStats.due ? 'brand' : 'neutral'} onClick={() => { setView('operation'); applyQueueView('today') }} />
      <WorkspaceSummaryMetric label="Atrasadas" value={queueStats.overdue} meta="precisam de atenção" icon={RotateCcw} tone={queueStats.overdue ? 'danger' : 'neutral'} onClick={() => { setView('operation'); applyQueueView('overdue') }} />
      <WorkspaceSummaryMetric label="Retornos" value={queueStats.callbacks} meta="pedidos pelo prospect" icon={RotateCcw} tone={queueStats.callbacks ? 'warning' : 'neutral'} onClick={() => { setView('operation'); applyQueueView('all', 'callback_requested') }} />
      <WorkspaceSummaryMetric label="Conexão" value={`${stats.answerRate}%`} meta={`${stats.today} realizadas hoje`} icon={Target} tone="success" />
    </WorkspaceSummaryStrip>

    {view === 'operation' ? <section className="panel calls-command-center-v10171">
      <div className="calls-command-center-v10171__next">
        <div className="calls-command-center-v10171__heading"><div><span className="eyebrow">Próximo da fila</span><h3>{nextEntry ? nextEntry.targetName : 'Fila concluída'}</h3><p>{nextEntry ? `${nextEntry.lead.company || nextEntry.lead.name} · ${nextEntry.reason}` : 'Não há contatos elegíveis na visualização atual.'}</p></div>{nextEntry ? <span className={`priority-chip priority-chip--${nextEntry.lead.priority}`}>{priorityLabel[nextEntry.lead.priority]}</span> : null}</div>
        {nextEntry ? <><div className="calls-command-center-v10171__meta"><span><PhoneCall size={14} /> {nextEntry.targetPhone}</span><span><Target size={14} /> {nextEntry.stage?.name ?? 'Sem etapa'}</span><span><RotateCcw size={14} /> {nextEntry.attempts} tentativa{nextEntry.attempts === 1 ? '' : 's'}</span></div>{nextSuggestion ? <div className={`calls-command-center-v10171__suggestion is-${nextSuggestion.urgency}`}><Sparkles size={14}/><span><small>Próxima melhor ação</small><strong>{nextSuggestion.label}</strong></span></div> : null}{canWrite ? <div className="calls-command-center-v10171__actions"><Button size="sm" onClick={() => requestSession(nextEntry.lead.id, [nextEntry.lead.id])}><PhoneCall size={15} /> Ligar agora</Button><Button size="sm" variant="secondary" onClick={() => navigate('leads', { leadId: nextEntry.lead.id })}><ArrowUpRight size={15} /> Abrir contato</Button></div> : null}</> : <EmptyState icon={PhoneCall} title="Nenhum contato aguardando" description="Ajuste os filtros ou cadastre uma próxima ação." />}
      </div>
      <div className="calls-command-center-v10171__kpis"><article><small>Hoje</small><strong>{queueStats.due}</strong><span>programadas ou vencidas</span></article><article><small>Atrasadas</small><strong>{queueStats.overdue}</strong><span>precisam de atenção</span></article><article><small>Retornos</small><strong>{queueStats.callbacks}</strong><span>pedidos pelo prospect</span></article><article><small>Conexão</small><strong>{stats.answerRate}%</strong><span>{stats.today} realizadas hoje</span></article></div>
    </section> : null}

    <WorkspaceViewStrip className="calls-area-view-strip-h20" value={view} onChange={setView} ariaLabel="Áreas de Ligações" items={[
      { id: 'operation', label: 'Operação', icon: Play },
      { id: 'history', label: 'Histórico', icon: History },
      { id: 'intelligence', label: 'Inteligência', icon: Sparkles },
      { id: 'settings', label: 'Configurações', icon: Settings2 },
    ] as const} />

    {view === 'operation' ? <>
      <FilterWorkspaceViewStrip items={[
        { id: 'all', label: 'Toda fila', active: queueViewId === 'all', count: queue.length, icon: <PhoneCall size={14}/>, onClick: () => applyQueueView('all') },
        { id: 'today', label: 'Hoje', active: queueViewId === 'today', count: queueStats.due, icon: <CalendarClock size={14}/>, accent: 'blue', onClick: () => applyQueueView('today') },
        { id: 'overdue', label: 'Atrasadas', active: queueViewId === 'overdue', count: queueStats.overdue, icon: <RotateCcw size={14}/>, accent: 'red', onClick: () => applyQueueView('overdue') },
        { id: 'callbacks', label: 'Retornos', active: queueViewId === 'callbacks', count: queueStats.callbacks, icon: <RotateCcw size={14}/>, accent: 'orange', onClick: () => applyQueueView('all', 'callback_requested') },
        { id: 'hot', label: 'Quentes', active: queueViewId === 'hot', count: queueStats.hot, icon: <Sparkles size={14}/>, accent: 'orange', onClick: () => applyQueueView('hot') },
        { id: 'proposal', label: 'Propostas', active: queueViewId === 'proposal', count: queue.filter((item) => item.bucket === 'proposal').length, icon: <Target size={14}/>, accent: 'purple', onClick: () => applyQueueView('proposal') },
      ]} />

      <WorkspaceCommandBar className="calls-operation-command-h20">
        <WorkspaceCommandGroup className="calls-search-group-h20"><label className="search-field workspace-search-v10167"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar contato, empresa, cidade ou etapa..." /></label></WorkspaceCommandGroup>
        <WorkspaceCommandGroup align="end"><WorkspaceFilterMenu workspaceKey={`calls-operation:${workspaceId}`} fields={universalOperationFilters} activeCount={activeOperationFilters} onOpenAdvanced={() => setMoreFiltersOpen(true)} onClearAll={clearOperationFilters} onChange={changeOperationFilter} /><WorkspaceDisplayMenu label="Exibição" value={display.queueDensity} onChange={(value) => { const next = { ...display, queueDensity: value === 'comfortable' ? 'comfortable' : 'compact' } as CallDisplayPreferences; setDisplay(next); saveCallDisplayPreferences(workspaceId, next) }} modes={[{ value: 'compact', label: 'Compacta', description: 'Mais contatos visíveis por tela.' }, { value: 'comfortable', label: 'Confortável', description: 'Mais espaço para contexto e ações.' }]} />{canWrite ? <Button variant="secondary" size="sm" onClick={selectVisible}>{allVisibleSelected ? <Square size={15} /> : <CheckSquare size={15} />} {selectedQueueIds.length ? selectedQueueIds.length === 1 ? '1 selecionado' : `${selectedQueueIds.length} selecionados` : 'Selecionar fila'}</Button> : null}</WorkspaceCommandGroup>
      </WorkspaceCommandBar>
      <WorkspaceFilterChips fields={universalOperationFilters} onChange={changeOperationFilter} onClearAll={clearOperationFilters} />
      {moreFiltersOpen ? <aside className="workspace-settings-drawer-v10167 calls-filter-drawer-v10167" aria-label="Filtros de ligações"><header><div><span>Ligações</span><strong>Filtros da fila</strong></div><button type="button" onClick={() => setMoreFiltersOpen(false)} aria-label="Fechar filtros">×</button></header><div className="workspace-settings-drawer-v10167__body"><section><div className="workspace-settings-section-title-v10167"><strong>Fila operacional</strong><span>O mesmo motor de filtros controla views, seleção e sessão.</span></div>{universalOperationFilters.map((field) => <label className="field" key={field.key}><span>{field.label}</span><NativeSelectionSelect value={field.value} onChange={(event) => changeOperationFilter(field.key, event.target.value)}><option value={field.allValue ?? 'all'}>{field.allLabel ?? 'Qualquer'}</option>{field.options.map((option) => <option key={`${field.key}-${option.value}`} value={option.value}>{option.label}</option>)}</NativeSelectionSelect></label>)}</section></div><footer><Button variant="secondary" onClick={clearOperationFilters}>Limpar</Button><Button onClick={() => setMoreFiltersOpen(false)}>Aplicar</Button></footer></aside> : null}

      <section className="calls-operations-layout calls-operations-layout--single"><div className="panel call-queue-panel call-queue-panel--professional"><div className="panel__heading"><div><span className="eyebrow">Prioridade RealTalent</span><h3>Fila operacional</h3><p>{filteredQueue.length === 1 ? '1 contato nesta visualização' : `${filteredQueue.length} contatos nesta visualização`}</p></div>{canWrite && selectedQueueIds.length ? <Button size="sm" onClick={() => requestSession(selectedQueueIds[0], selectedQueueIds)}><Play size={15} /> Preparar selecionados</Button> : null}</div>{filteredQueue.length ? <div className={`call-queue call-queue--professional call-queue--${display.queueDensity}`}>{filteredQueue.map((entry, index) => { const selected = selectedQueueIds.includes(entry.lead.id); const suggestion = actionSuggestions.get(entry.lead.id); return <article className={`call-queue-card ${selected ? 'is-selected' : ''}`} key={entry.lead.id}>{canWrite ? <button className="call-queue-card__check" type="button" onClick={() => toggleQueueLead(entry.lead.id)} aria-label={selected ? 'Remover da seleção' : 'Selecionar lead'}>{selected ? <CheckSquare size={17} /> : <Square size={17} />}</button> : null}<div className="call-queue-card__rank">{index + 1}</div><div className="call-queue-card__main"><div className="call-queue-card__headline"><div className="lead-cell"><span className="lead-cell__avatar">{entry.targetName.slice(0, 2).toUpperCase()}</span><div><strong>{entry.targetName}</strong><small>{entry.lead.company || entry.lead.name || 'Empresa não informada'} · {entry.lead.city || 'Cidade não informada'}</small></div></div><div className="call-queue-card__badges">{display.showQueueReason ? entry.attempts >= preferences.commercial.maxCallAttempts ? <StatusPill tone="danger">Limite de tentativas</StatusPill> : <StatusPill tone={entry.bucket === 'overdue' ? 'danger' : entry.lead.temperature === 'hot' ? 'warning' : 'info'}>{entry.reason}</StatusPill> : null}<span className={`priority-chip priority-chip--${entry.lead.priority}`}>{priorityLabel[entry.lead.priority]}</span></div></div><div className="call-queue-card__meta"><span><PhoneCall size={14} /> {entry.targetPhone}</span><span><RotateCcw size={14} /> {entry.attempts} {entry.attempts === 1 ? 'tentativa' : 'tentativas'}</span><span><CalendarClock size={14} /> {entry.dueAt ? formatDateTime(entry.dueAt) : 'Sem agendamento'}</span><span><Target size={14} /> {entry.stage?.name ?? 'Sem etapa'}</span></div>{suggestion ? <div className={`call-next-best-action call-next-best-action--${suggestion.urgency}`}><span><Sparkles size={14} /> Próxima melhor ação</span><strong>{suggestion.label}</strong><small>{suggestion.reason}</small></div> : null}{display.showLastCall ? entry.lastCall ? <p>Última ligação: <strong>{outcomeLabel(entry.lastCall.outcome)}</strong> · {formatDateTime(entry.lastCall.startedAt)}{entry.lastCall.notes ? ` — ${entry.lastCall.notes}` : ''}</p> : <p>Primeira tentativa registrada para este contato.</p> : null}</div>{canWrite ? <div className="call-queue-card__actions"><Button size="sm" onClick={() => suggestion ? executeSuggestedAction(entry.lead.id, suggestion.kind) : requestSession(entry.lead.id, [entry.lead.id])}>{suggestion?.kind === 'call_now' || suggestion?.kind === 'callback' || suggestion?.kind === 'reactivate' ? <PhoneCall size={15} /> : <ArrowUpRight size={15} />} {suggestion?.shortLabel ?? 'Ligar'}</Button></div> : null}</article> })}</div> : <EmptyState icon={PhoneCall} title="Nenhum contato nesta fila" description="Ajuste os filtros ou cadastre uma próxima ação para os contatos ativos." />}</div></section>
    </> : null}

    {view === 'history' ? <>
      <WorkspaceCommandBar className="calls-history-command-h20"><WorkspaceCommandGroup className="calls-search-group-h20"><label className="search-field workspace-search-v10167"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar no histórico..." /></label></WorkspaceCommandGroup><WorkspaceCommandGroup align="end"><WorkspaceFilterMenu workspaceKey={`calls-history:${workspaceId}`} fields={universalHistoryFilters} activeCount={activeHistoryFilters} onOpenAdvanced={() => setMoreFiltersOpen(true)} onClearAll={clearHistoryFilters} onChange={(key, value) => key === 'outcome' ? setOutcomeFilter(value as 'all' | CallOutcome) : setHistoryPeriod(value as HistoryPeriod)} /></WorkspaceCommandGroup></WorkspaceCommandBar>
      <WorkspaceFilterChips fields={universalHistoryFilters} onChange={(key, value) => key === 'outcome' ? setOutcomeFilter(value as 'all' | CallOutcome) : setHistoryPeriod(value as HistoryPeriod)} onClearAll={clearHistoryFilters} />
      {moreFiltersOpen ? <aside className="workspace-settings-drawer-v10167 calls-filter-drawer-v10167" aria-label="Filtros do histórico de ligações"><header><div><span>Ligações</span><strong>Filtros do histórico</strong></div><button type="button" onClick={() => setMoreFiltersOpen(false)} aria-label="Fechar filtros">×</button></header><div className="workspace-settings-drawer-v10167__body"><section><div className="workspace-settings-section-title-v10167"><strong>Histórico</strong><span>Escolha período e resultado sem ocupar a barra principal.</span></div><label className="field"><span>Resultado</span><NativeSelectionSelect value={outcomeFilter} onChange={(event) => setOutcomeFilter(event.target.value as 'all' | CallOutcome)}><option value="all">Todos</option>{availableOutcomes.map((value) => <option key={value} value={value}>{outcomeLabel(value)}</option>)}</NativeSelectionSelect></label><label className="field"><span>Período</span><NativeSelectionSelect value={historyPeriod} onChange={(event) => setHistoryPeriod(event.target.value as HistoryPeriod)}>{historyPeriods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelectionSelect></label></section></div><footer><Button variant="secondary" onClick={clearHistoryFilters}>Limpar</Button><Button onClick={() => setMoreFiltersOpen(false)}>Aplicar</Button></footer></aside> : null}
      <section className="panel data-panel calls-history-panel"><div className="data-panel__header"><div><span className="eyebrow">Histórico comercial</span><h3>Ligações realizadas</h3><p>{history.length === 1 ? '1 registro no período' : `${history.length} registros no período`}</p></div>{canWrite ? <Button size="sm" onClick={() => requestSession()}><PhoneCall size={16} /> Nova ligação</Button> : null}</div>{history.length ? <div className="call-history call-history--v69">{history.map((call) => { const lead = snapshot?.leads.find((item) => item.id === call.leadId); const definition = outcomeDefinition(call.outcome); const review = coachingReviews.get(call.id); return <article className="call-history__item call-history__item--v69" key={call.id}><div className="call-history__icon"><PhoneCall size={18} /></div><div className="call-history__content"><div><strong>{lead?.name ?? 'Contato removido'}</strong><StatusPill tone={definition.tone === 'neutral' ? 'info' : definition.tone}>{outcomeLabel(call.outcome)}</StatusPill>{review ? <span className={`call-coaching-score call-coaching-score--${review.grade}`}><Sparkles size={13}/>{review.score}/100</span> : null}</div><p>{call.notes || 'Sem anotações.'}</p><span>{formatDateTime(call.startedAt)} · {formatDuration(call.durationSeconds)} · {lead?.company || 'Empresa não informada'}</span></div><div className="call-history__actions"><Button size="sm" variant="secondary" onClick={() => setSelectedHistoryCall(call)}><Eye size={15} /> Abrir</Button>{canWrite ? <button className="icon-button call-icon-button call-icon-button--danger" type="button" disabled={busyId === call.id} onClick={() => void remove(call.id)} aria-label="Excluir ligação"><Trash2 size={17} /></button> : null}</div></article> })}</div> : <EmptyState icon={History} title="Nenhuma ligação encontrada" description="Ajuste o período ou comece uma sessão para criar o primeiro histórico." action={canWrite ? <Button onClick={() => requestSession()}><PhoneCall size={17} /> Nova ligação</Button> : undefined} />}{(snapshot?.calls.length ?? 0) >= 500 && !olderCallsExhausted ? <div className="calls-history-load-more"><Button variant="secondary" disabled={olderCallsLoading} onClick={() => void loadPreviousHistory()}>{olderCallsLoading ? <RotateCcw size={15} className="spin" /> : <History size={15} />} {olderCallsLoading ? 'Carregando…' : 'Carregar histórico anterior'}</Button></div> : null}</section>
    </> : null}

    {view === 'intelligence' ? <CallsIntelligencePanel calls={snapshot?.calls ?? []} leads={snapshot?.leads ?? []} contacts={snapshot?.contacts ?? []} playbooks={snapshot?.playbooks ?? []} stages={snapshot?.stages ?? []} /> : null}
    {view === 'settings' ? <CallsSettingsPanel workspaceId={workspaceId} onOpenDisplay={() => setDisplayOpen(true)} /> : null}

    <CallSessionPreparationModal open={canWrite && preparationOpen} leadIds={pendingLeadIds} initialLeadId={pendingInitialLeadId} onClose={() => setPreparationOpen(false)} onStart={launchSession} />
    <CallDisplayPreferencesModal open={displayOpen} value={display} onClose={() => setDisplayOpen(false)} onSave={(next) => { setDisplay(next); saveCallDisplayPreferences(workspaceId, next); setDisplayOpen(false) }} />
    <LazyCallWorkspaceModal open={canWrite && callOpen} config={sessionConfig} onClose={() => setCallOpen(false)} />
    <CallHistoryDetailModal open={Boolean(selectedHistoryCall)} call={selectedHistoryCall} lead={selectedHistoryCall ? snapshot?.leads.find((lead) => lead.id === selectedHistoryCall.leadId) ?? null : null} review={selectedHistoryCall ? coachingReviews.get(selectedHistoryCall.id) ?? null : null} canWrite={canWrite} onClose={() => setSelectedHistoryCall(null)} onOpenLead={() => { if (!selectedHistoryCall) return; navigate('leads', { leadId: selectedHistoryCall.leadId }); setSelectedHistoryCall(null) }} onCallAgain={() => { if (!selectedHistoryCall) return; const leadId = selectedHistoryCall.leadId; setSelectedHistoryCall(null); requestSession(leadId, [leadId]) }} onDelete={() => selectedHistoryCall && void remove(selectedHistoryCall.id)} resolveRecordingUrl={resolveCallRecordingUrl} />
  </div>
}
