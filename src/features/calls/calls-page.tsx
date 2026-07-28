import { BarChart3, CalendarClock, CheckSquare, Clock3, Headphones, History, Mic, PhoneCall, Play, RotateCcw, Search, Settings2, Square, Target, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { StatusPill } from '../../components/ui/status-pill'
import { formatDateTime } from '../../domain/formatters'
import type { CallOutcome, LeadPriority } from '../../domain/types'
import { buildCallQueue, calculateCallPerformance, outcomeDefinition, outcomeLabel, type CallQueueBucket } from '../../services/call-workspace'
import { usePreferences } from '../settings/preferences-context'
import { CallDisplayPreferencesModal } from './call-display-preferences-modal'
import { readCallDisplayPreferences, saveCallDisplayPreferences, type CallDisplayPreferences } from '../../services/call-display-preferences'
import type { CallSessionConfig } from './call-session-config'
import { CallSessionPreparationModal } from './call-session-preparation-modal'
import { CallWorkspaceModal } from './call-workspace-modal'

const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
const priorityLabel: Record<LeadPriority, string> = { urgent: 'Urgente', high: 'Alta', medium: 'Média', low: 'Baixa' }
const bucketLabel: Record<CallQueueBucket, string> = { all: 'Toda a fila', overdue: 'Atrasadas', today: 'Hoje', upcoming: 'Próximas', hot: 'Leads quentes', proposal: 'Propostas', without_action: 'Sem próxima ação' }

type CallsView = 'queue' | 'history' | 'performance'

export function CallsPage() {
  const { snapshot, currentWorkspace, canWrite, deleteCall, notify } = useApp()
  const { preferences } = usePreferences()
  const workspaceId = currentWorkspace?.id ?? snapshot?.workspace.id ?? 'default'
  const [view, setView] = useState<CallsView>('queue')
  const [query, setQuery] = useState('')
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)
  const [bucket, setBucket] = useState<CallQueueBucket>('all')
  const [priority, setPriority] = useState<'all' | LeadPriority>('all')
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | CallOutcome>('all')
  const [callOpen, setCallOpen] = useState(false)
  const [preparationOpen, setPreparationOpen] = useState(false)
  const [pendingLeadIds, setPendingLeadIds] = useState<string[]>([])
  const [pendingInitialLeadId, setPendingInitialLeadId] = useState('')
  const [sessionConfig, setSessionConfig] = useState<CallSessionConfig | null>(null)
  const [selectedQueueIds, setSelectedQueueIds] = useState<string[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [display, setDisplay] = useState<CallDisplayPreferences>(() => readCallDisplayPreferences(workspaceId))
  const [displayOpen, setDisplayOpen] = useState(false)

  useEffect(() => { setDisplay(readCallDisplayPreferences(workspaceId)) }, [workspaceId])

  const queue = useMemo(() => buildCallQueue(snapshot?.leads ?? [], snapshot?.calls ?? [], snapshot?.activities ?? [], snapshot?.stages ?? []), [snapshot])
  const stats = useMemo(() => calculateCallPerformance(snapshot?.calls ?? []), [snapshot])

  const filteredQueue = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return queue.filter((entry) => {
      if (bucket !== 'all' && entry.bucket !== bucket) return false
      if (priority !== 'all' && entry.lead.priority !== priority) return false
      if (!normalized) return true
      return `${entry.lead.name} ${entry.lead.company} ${entry.lead.phone} ${entry.lead.city} ${entry.stage?.name ?? ''} ${entry.reason}`.toLowerCase().includes(normalized)
    })
  }, [bucket, priority, query, queue])

  const history = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return (snapshot?.calls ?? []).filter((call) => {
      if (outcomeFilter !== 'all' && call.outcome !== outcomeFilter) return false
      const lead = snapshot?.leads.find((item) => item.id === call.leadId)
      return !normalized || `${lead?.name ?? ''} ${lead?.company ?? ''} ${call.notes} ${call.transcript} ${outcomeLabel(call.outcome)}`.toLowerCase().includes(normalized)
    }).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
  }, [outcomeFilter, query, snapshot])

  const outcomeDistribution = useMemo(() => {
    const counts = new Map<CallOutcome, number>()
    ;(snapshot?.calls ?? []).forEach((call) => counts.set(call.outcome, (counts.get(call.outcome) ?? 0) + 1))
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [snapshot])

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

  const toggleQueueLead = (leadId: string) => setSelectedQueueIds((current) => current.includes(leadId) ? current.filter((id) => id !== leadId) : [...current, leadId])
  const selectVisible = () => setSelectedQueueIds((current) => current.length === filteredQueue.length && filteredQueue.every((entry) => current.includes(entry.lead.id)) ? [] : filteredQueue.map((entry) => entry.lead.id))

  const remove = async (id: string) => {
    if (!window.confirm('Excluir esta ligação e a gravação associada?')) return
    setBusyId(id)
    try { await deleteCall(id) } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível excluir.') } finally { setBusyId(null) }
  }

  return <div className="page-stack calls-page calls-page--professional">
    <section className="calls-command-bar">
      <div>
        <span className="eyebrow">Central de ligações</span>
        <h2>Fila, sessão e resultado</h2>
        <p>Prepare a sessão, execute uma ligação por vez e registre o próximo passo.</p>
      </div>
      <div className="calls-command-bar__actions">
        <Button variant="ghost" onClick={() => setDisplayOpen(true)}><Settings2 size={17} /> Personalizar</Button>
        {canWrite ? <><Button variant="secondary" onClick={() => filteredQueue[0] && requestSession(filteredQueue[0].lead.id, [filteredQueue[0].lead.id])} disabled={!filteredQueue.length}><PhoneCall size={17} /> Ligação avulsa</Button>
        <Button onClick={() => requestSession('', selectedQueueIds.length ? selectedQueueIds : filteredQueue.map((entry) => entry.lead.id))} disabled={!filteredQueue.length}><Play size={17} /> Começar sessão</Button></> : null}
      </div>
    </section>

    {display.showSummaryStrip ? <section className="calls-summary-strip" aria-label="Resumo das ligações">
      <span><PhoneCall size={16} /><strong>{stats.today}</strong> realizadas hoje</span>
      <span><CalendarClock size={16} /><strong>{queue.filter((item) => item.bucket === 'today' || item.bucket === 'overdue').length}</strong> aguardando</span>
      <span><Headphones size={16} /><strong>{stats.answerRate}%</strong> atendidas</span>
      <span><Target size={16} /><strong>{stats.meetings}</strong> reuniões</span>
      <span><Clock3 size={16} /><strong>{formatDuration(stats.averageDuration)}</strong> média</span>
    </section> : null}

    <section className="calls-view-tabs" aria-label="Visualizações de ligações">
      <button type="button" className={view === 'queue' ? 'is-active' : ''} onClick={() => setView('queue')}><CalendarClock size={16} /> Fila <span>{queue.length}</span></button>
      <button type="button" className={view === 'history' ? 'is-active' : ''} onClick={() => setView('history')}><History size={16} /> Histórico <span>{snapshot?.calls.length ?? 0}</span></button>
      <button type="button" className={view === 'performance' ? 'is-active' : ''} onClick={() => setView('performance')}><BarChart3 size={16} /> Desempenho</button>
    </section>

    {view !== 'performance' ? <section className="toolbar-card toolbar-card--wrap calls-toolbar">
      <div className="toolbar-card__filters">
        <label className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={view === 'queue' ? 'Buscar lead, empresa, cidade ou etapa...' : 'Buscar no histórico...'} /></label>
        {view === 'queue' ? <>
          <label className="compact-select"><span>Fila</span><select value={bucket} onChange={(event) => setBucket(event.target.value as CallQueueBucket)}>{Object.entries(bucketLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {moreFiltersOpen ? <label className="compact-select"><span>Prioridade</span><select value={priority} onChange={(event) => setPriority(event.target.value as 'all' | LeadPriority)}><option value="all">Todas</option><option value="urgent">Urgente</option><option value="high">Alta</option><option value="medium">Média</option><option value="low">Baixa</option></select></label> : null}
        </> : <label className="compact-select"><span>Resultado</span><select value={outcomeFilter} onChange={(event) => setOutcomeFilter(event.target.value as 'all' | CallOutcome)}><option value="all">Todos</option>{Object.values(snapshot?.calls.reduce((acc, call) => ({ ...acc, [call.outcome]: call.outcome }), {} as Record<string, CallOutcome>) ?? {}).map((value) => <option key={value} value={value}>{outcomeLabel(value)}</option>)}</select></label>}
      </div>
      <div className="toolbar-card__actions">
        {view === 'queue' ? <Button variant="ghost" size="sm" onClick={() => setMoreFiltersOpen((value) => !value)}>{moreFiltersOpen ? 'Menos filtros' : 'Mais filtros'}</Button> : null}
        {view === 'queue' && canWrite ? <Button variant="secondary" size="sm" onClick={selectVisible}>{selectedQueueIds.length && selectedQueueIds.length === filteredQueue.length ? <Square size={15} /> : <CheckSquare size={15} />} {selectedQueueIds.length ? selectedQueueIds.length === 1 ? '1 selecionado' : `${selectedQueueIds.length} selecionados` : 'Selecionar fila'}</Button> : null}
      </div>
    </section> : null}

    {view === 'queue' ? <section className="calls-operations-layout calls-operations-layout--single">
      <div className="panel call-queue-panel call-queue-panel--professional">
        <div className="panel__heading"><div><span className="eyebrow">Prioridade automática</span><h3>Fila de ligação</h3><p>{filteredQueue.length === 1 ? '1 contato nesta visualização' : `${filteredQueue.length} contatos nesta visualização`}</p></div>{canWrite && selectedQueueIds.length ? <Button size="sm" onClick={() => requestSession(selectedQueueIds[0], selectedQueueIds)}><Play size={15} /> Preparar selecionados</Button> : null}</div>
        {filteredQueue.length ? <div className={`call-queue call-queue--professional call-queue--${display.queueDensity}`}>{filteredQueue.map((entry, index) => {
          const selected = selectedQueueIds.includes(entry.lead.id)
          return <article className={`call-queue-card ${selected ? 'is-selected' : ''}`} key={entry.lead.id}>
            {canWrite ? <button className="call-queue-card__check" type="button" onClick={() => toggleQueueLead(entry.lead.id)} aria-label={selected ? 'Remover da seleção' : 'Selecionar lead'}>{selected ? <CheckSquare size={17} /> : <Square size={17} />}</button> : null}
            <div className="call-queue-card__rank">{index + 1}</div>
            <div className="call-queue-card__main">
              <div className="call-queue-card__headline"><div className="lead-cell"><span className="lead-cell__avatar">{entry.lead.name.slice(0, 2).toUpperCase()}</span><div><strong>{entry.lead.name}</strong><small>{entry.lead.company || 'Empresa não informada'} · {entry.lead.city || 'Cidade não informada'}</small></div></div><div className="call-queue-card__badges">{display.showQueueReason ? entry.attempts >= preferences.commercial.maxCallAttempts ? <StatusPill tone="danger">Limite de tentativas</StatusPill> : <StatusPill tone={entry.bucket === 'overdue' ? 'danger' : entry.lead.temperature === 'hot' ? 'warning' : 'info'}>{entry.reason}</StatusPill> : null}<span className={`priority-chip priority-chip--${entry.lead.priority}`}>{priorityLabel[entry.lead.priority]}</span></div></div>
              <div className="call-queue-card__meta"><span><PhoneCall size={14} /> {entry.lead.phone}</span><span><RotateCcw size={14} /> {entry.attempts} {entry.attempts === 1 ? 'tentativa' : 'tentativas'}</span><span><CalendarClock size={14} /> {entry.dueAt ? formatDateTime(entry.dueAt) : 'Sem agendamento'}</span><span><Target size={14} /> {entry.stage?.name ?? 'Sem etapa'}</span></div>
              {display.showLastCall ? entry.lastCall ? <p>Última ligação: <strong>{outcomeLabel(entry.lastCall.outcome)}</strong> · {formatDateTime(entry.lastCall.startedAt)}{entry.lastCall.notes ? ` — ${entry.lastCall.notes}` : ''}</p> : <p>Primeira tentativa registrada para este lead.</p> : null}
            </div>
            {canWrite ? <div className="call-queue-card__actions"><Button size="sm" onClick={() => requestSession(entry.lead.id, [entry.lead.id])}><PhoneCall size={15} /> Ligar</Button></div> : null}
          </article>
        })}</div> : <EmptyState icon={PhoneCall} title="Nenhum lead nesta fila" description="Ajuste os filtros ou cadastre uma próxima ação para os leads ativos." />}
      </div>
    </section> : null}

    {view === 'history' ? <section className="panel data-panel"><div className="data-panel__header"><div><h3>Histórico de ligações</h3><p>{history.length === 1 ? '1 registro' : `${history.length} registros`}</p></div></div>{history.length ? <div className="call-history">{history.map((call) => {
      const lead = snapshot?.leads.find((item) => item.id === call.leadId)
      const definition = outcomeDefinition(call.outcome)
      return <article className="call-history__item" key={call.id}><div className="call-history__icon"><PhoneCall size={18} /></div><div className="call-history__content"><div><strong>{lead?.name ?? 'Lead removido'}</strong><StatusPill tone={definition.tone === 'neutral' ? 'info' : definition.tone}>{outcomeLabel(call.outcome)}</StatusPill></div><p>{call.notes || 'Sem anotações.'}</p><span>{formatDateTime(call.startedAt)} · {formatDuration(call.durationSeconds)} · {lead?.company || 'Empresa não informada'}</span>{call.transcript ? <details><summary>Ver transcrição</summary><p>{call.transcript}</p></details> : null}{call.recordingUrl ? <audio src={call.recordingUrl} controls preload="none" /> : null}</div>{canWrite ? <button className="icon-button" type="button" disabled={busyId === call.id} onClick={() => void remove(call.id)} aria-label="Excluir ligação"><Trash2 size={17} /></button> : null}</article>
    })}</div> : <EmptyState icon={PhoneCall} title="Nenhuma ligação encontrada" description="Comece uma sessão para criar o primeiro histórico." action={canWrite ? <Button onClick={() => requestSession()}><PhoneCall size={17} /> Nova ligação</Button> : undefined} />}</section> : null}

    {view === 'performance' ? <section className="calls-performance-grid">
      <article className="panel calls-performance-card"><span className="eyebrow">Eficiência</span><h3>Resumo da operação</h3><div className="calls-performance-kpis"><div><small>Tempo médio</small><strong>{formatDuration(stats.averageDuration)}</strong></div><div><small>Melhor horário</small><strong>{stats.bestHour === null ? 'Sem dados' : `${String(stats.bestHour).padStart(2, '0')}:00`}</strong></div><div><small>Gravações</small><strong>{stats.recordings}</strong></div><div><small>Fila total</small><strong>{queue.length}</strong></div></div></article>
      <article className="panel calls-performance-card"><span className="eyebrow">Resultados</span><h3>Distribuição das ligações</h3>{outcomeDistribution.length ? <div className="calls-outcome-bars">{outcomeDistribution.map(([result, count]) => { const percent = (snapshot?.calls.length ?? 0) ? Math.round((count / (snapshot?.calls.length ?? 1)) * 100) : 0; return <div key={result}><span>{outcomeLabel(result)}</span><div><i style={{ width: `${percent}%` }} /></div><strong>{count}</strong></div> })}</div> : <p className="activity-empty">Ainda não há dados suficientes.</p>}</article>
      <article className="panel calls-performance-card calls-performance-card--wide"><span className="eyebrow">Diagnóstico</span><h3>Leitura rápida da rotina</h3><div className="calls-diagnosis-grid"><div><Headphones size={20} /><strong>{stats.answerRate >= 35 ? 'Boa taxa de contato' : 'Taxa de contato pode melhorar'}</strong><p>{stats.answerRate >= 35 ? 'Mantenha a priorização e compare horários para ampliar as conversas.' : 'Teste horários diferentes e revise os dados de telefone antes de aumentar o volume.'}</p></div><div><Target size={20} /><strong>{stats.meetingRate >= 20 ? 'Conversas avançando' : 'Reforce o fechamento para reunião'}</strong><p>{stats.meetingRate >= 20 ? 'O roteiro está convertendo conversas em próximos passos.' : 'Use perguntas de diagnóstico e encerre cada conversa com uma proposta clara de agenda.'}</p></div><div><Mic size={20} /><strong>Qualidade registrada</strong><p>{stats.recordings ? 'Existem chamadas com gravação para revisão e treinamento.' : 'Ative gravação somente com consentimento para apoiar análise e treinamento.'}</p></div></div></article>
    </section> : null}

    <CallSessionPreparationModal open={canWrite && preparationOpen} leadIds={pendingLeadIds} initialLeadId={pendingInitialLeadId} onClose={() => setPreparationOpen(false)} onStart={launchSession} />
    <CallDisplayPreferencesModal open={displayOpen} value={display} onClose={() => setDisplayOpen(false)} onSave={(next) => { setDisplay(next); saveCallDisplayPreferences(workspaceId, next); setDisplayOpen(false) }} />
    <CallWorkspaceModal open={canWrite && callOpen} config={sessionConfig} onClose={() => setCallOpen(false)} />
  </div>
}
