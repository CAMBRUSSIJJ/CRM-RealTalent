import {
  AlertTriangle, BarChart3, CalendarClock, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Edit3,
  ExternalLink, Flame, Kanban, Layers3, ListChecks, Mail, MessageCircle, PhoneCall, Play, Plus, Search, Send, Target,
  TimerReset, UserRound, UsersRound, XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { Modal } from '../../components/ui/modal'
import { StatusPill } from '../../components/ui/status-pill'
import { formatDateTime } from '../../domain/formatters'
import type { ActivityItem, Lead } from '../../domain/types'
import { channelLabel, outcomeLabel, readFollowupMetadata, stripFollowupMetadata, type FollowupChannel, type FollowupOutcome } from '../../services/followup-workspace'
import { ActivityModal } from './activity-modal'
import { CadenceModal } from './cadence-modal'
import { OutcomeModal } from './outcome-modal'

type Filter = 'queue' | 'overdue' | 'today' | 'upcoming' | 'completed' | 'all'
type ViewMode = 'queue' | 'board' | 'calendar' | 'cadences' | 'performance'
const typeLabels = { followup: 'Follow-up', call: 'Ligação', meeting: 'Reunião', note: 'Nota', stage_change: 'Etapa', email: 'E-mail', whatsapp: 'WhatsApp' }
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
const addDays = (date: Date, days: number) => { const next = new Date(date); next.setDate(next.getDate() + days); return next }
const dateKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
const instagramUrl = (lead: Lead | null) => {
  if (!lead) return ''
  const source = `${lead.notes} ${lead.source}`
  return source.match(/https?:\/\/(?:www\.)?instagram\.com\/[^\s,;]+/i)?.[0] ?? ''
}

interface EnrichedActivity {
  activity: ActivityItem
  lead: Lead | null
  due: Date | null
  overdue: boolean
  today: boolean
  channel: FollowupChannel
  description: string
  cadenceName: string
  stageName: string
  cadenceStep: string
  script: string
  score: number
}

const channelFromActivity = (activity: ActivityItem): FollowupChannel => activity.type === 'call' ? 'call' : activity.type === 'meeting' ? 'meeting' : 'task'
const toneForActivity = (activity: ActivityItem) => activity.type === 'meeting' ? 'info' : activity.type === 'call' ? 'warning' : activity.type === 'note' ? 'neutral' : 'success'

export function FollowupsPage() {
  const { snapshot, canWrite, completeActivity, updateActivity, notify, setRoute } = useApp()
  const [view, setView] = useState<ViewMode>('queue')
  const [filter, setFilter] = useState<Filter>('queue')
  const [query, setQuery] = useState('')
  const [stageId, setStageId] = useState('')
  const [priority, setPriority] = useState('')
  const [channel, setChannel] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [cadenceOpen, setCadenceOpen] = useState(false)
  const [cadenceLeadIds, setCadenceLeadIds] = useState<string[]>([])
  const [editing, setEditing] = useState<ActivityItem | null>(null)
  const [outcomeActivity, setOutcomeActivity] = useState<ActivityItem | null>(null)
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null)
  const [executionOpen, setExecutionOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const now = new Date()
  const nowMs = now.getTime()

  const enriched = useMemo<EnrichedActivity[]>(() => (snapshot?.activities ?? [])
    .filter((item) => item.type !== 'stage_change')
    .map((activity) => {
      const lead = snapshot?.leads.find((item) => item.id === activity.leadId) ?? null
      const due = activity.dueAt ? new Date(activity.dueAt) : null
      const meta = readFollowupMetadata(activity)
      const overdue = Boolean(!activity.completedAt && due && due.getTime() < nowMs && !sameDay(due, now))
      const today = Boolean(!activity.completedAt && due && sameDay(due, now))
      const urgency = overdue ? 100 : today ? 70 : due ? Math.max(0, 30 - Math.floor((due.getTime() - nowMs) / 86400000)) : 5
      const leadScore = lead?.priority === 'urgent' ? 35 : lead?.priority === 'high' ? 25 : lead?.priority === 'medium' ? 12 : 0
      const heatScore = lead?.temperature === 'hot' ? 25 : lead?.temperature === 'warm' ? 10 : 0
      return {
        activity, lead, due, overdue, today, channel: meta?.channel ?? channelFromActivity(activity), description: stripFollowupMetadata(activity.description),
        cadenceName: meta?.cadenceName ?? '', stageName: snapshot?.stages.find((stage) => stage.id === lead?.stageId)?.name ?? 'Sem etapa', cadenceStep: meta?.stepIndex && meta?.stepTotal ? `${meta.stepIndex}/${meta.stepTotal}` : '', script: meta?.script ?? '', score: urgency + leadScore + heatScore,
      }
    }), [nowMs, snapshot])

  const filteredActivities = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return enriched
      .filter((item) => !normalized || `${item.activity.title} ${item.description} ${item.lead?.name ?? ''} ${item.lead?.company ?? ''} ${item.cadenceName}`.toLowerCase().includes(normalized))
      .filter((item) => !stageId || item.lead?.stageId === stageId)
      .filter((item) => !priority || item.lead?.priority === priority)
      .filter((item) => !channel || item.channel === channel)
      .filter((item) => {
        if (filter === 'completed') return Boolean(item.activity.completedAt)
        if (filter === 'overdue') return item.overdue
        if (filter === 'today') return item.today
        if (filter === 'upcoming') return !item.activity.completedAt && item.due && item.due.getTime() > endOfDay(now).getTime()
        if (filter === 'queue') return !item.activity.completedAt && (!item.due || item.due.getTime() <= endOfDay(now).getTime())
        return true
      })
      .sort((a, b) => {
        if (Boolean(a.activity.completedAt) !== Boolean(b.activity.completedAt)) return a.activity.completedAt ? 1 : -1
        if (a.score !== b.score) return b.score - a.score
        if (!a.due) return 1; if (!b.due) return -1
        return a.due.getTime() - b.due.getTime()
      })
  }, [channel, enriched, filter, now, priority, query, stageId])

  const queue = useMemo(() => enriched.filter((item) => !item.activity.completedAt && (!item.due || item.due.getTime() <= endOfDay(now).getTime())).sort((a, b) => b.score - a.score), [enriched, now])

  const stats = useMemo(() => {
    const base = enriched
    const activeLeads = snapshot?.leads.filter((lead) => lead.status === 'active') ?? []
    const pendingLeadIds = new Set(base.filter((item) => !item.activity.completedAt && item.activity.leadId).map((item) => item.activity.leadId!))
    const withoutNext = activeLeads.filter((lead) => !pendingLeadIds.has(lead.id)).length
    const hotStalled = activeLeads.filter((lead) => lead.temperature === 'hot' && (!lead.nextActionAt || new Date(lead.nextActionAt).getTime() > addDays(now, 3).getTime())).length
    const proposalStageIds = new Set((snapshot?.stages ?? []).filter((stage) => stage.name.toLowerCase().includes('proposta')).map((stage) => stage.id))
    const proposals = activeLeads.filter((lead) => proposalStageIds.has(lead.stageId) && (!lead.nextActionAt || new Date(lead.nextActionAt).getTime() < nowMs)).length
    return {
      today: base.filter((item) => item.today).length,
      overdue: base.filter((item) => item.overdue).length,
      upcoming: base.filter((item) => !item.activity.completedAt && item.due && item.due.getTime() > endOfDay(now).getTime()).length,
      completed: base.filter((item) => item.activity.completedAt).length,
      withoutNext, hotStalled, proposals,
    }
  }, [enriched, now, nowMs, snapshot])

  const selectedActivity = enriched.find((item) => item.activity.id === selectedActivityId) ?? filteredActivities[0] ?? null
  useEffect(() => {
    if (selectedActivityId && !enriched.some((item) => item.activity.id === selectedActivityId)) setSelectedActivityId(null)
  }, [enriched, selectedActivityId])

  const cadenceGroups = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; category: string; activities: EnrichedActivity[]; leads: Set<string> }>()
    enriched.forEach((item) => {
      const meta = readFollowupMetadata(item.activity)
      if (meta?.kind !== 'cadence-step' || !meta.cadenceName) return
      const key = meta.cadenceId ?? meta.cadenceName
      const group = groups.get(key) ?? { id: key, name: meta.cadenceName, category: meta.cadenceCategory ?? 'Cadência', activities: [], leads: new Set<string>() }
      group.activities.push(item); if (item.activity.leadId) group.leads.add(item.activity.leadId); groups.set(key, group)
    })
    return [...groups.values()].sort((a, b) => b.activities.length - a.activities.length)
  }, [enriched])

  const performance = useMemo(() => {
    const since = addDays(now, -30).getTime()
    const recent = enriched.filter((item) => new Date(item.activity.completedAt ?? item.activity.createdAt).getTime() >= since)
    const results = recent.map((item) => ({ item, meta: readFollowupMetadata(item.activity) })).filter((entry) => entry.meta?.kind === 'result' && entry.meta.outcome)
    const outcomeCounts = (Object.keys(outcomeLabel) as FollowupOutcome[]).map((outcome) => ({ outcome, count: results.filter((entry) => entry.meta?.outcome === outcome).length })).filter((item) => item.count)
    const completed = recent.filter((item) => item.activity.completedAt && item.activity.type !== 'note').length
    const scheduled = recent.filter((item) => item.activity.type !== 'note').length
    const contacts = results.filter((entry) => ['answered', 'interested', 'proposal_requested', 'meeting_scheduled', 'won'].includes(entry.meta!.outcome!)).length
    const meetings = results.filter((entry) => entry.meta?.outcome === 'meeting_scheduled').length
    const proposals = results.filter((entry) => entry.meta?.outcome === 'proposal_requested').length
    const wins = results.filter((entry) => entry.meta?.outcome === 'won').length
    return { outcomeCounts, completed, scheduled, contacts, meetings, proposals, wins, completionRate: scheduled ? Math.round((completed / scheduled) * 100) : 0, contactRate: results.length ? Math.round((contacts / results.length) * 100) : 0 }
  }, [enriched, now])

  const toggle = async (activity: ActivityItem) => {
    if (!activity.completedAt) { setOutcomeActivity(activity); return }
    setBusyId(activity.id)
    try { await completeActivity(activity.id, false) }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível atualizar.') }
    finally { setBusyId(null) }
  }

  const bulkComplete = async () => {
    const targets = filteredActivities.filter((item) => selectedIds.includes(item.activity.id) && !item.activity.completedAt)
    if (!targets.length) return
    for (const item of targets) await completeActivity(item.activity.id, true)
    setSelectedIds([])
  }

  const bulkPostpone = async () => {
    const targets = filteredActivities.filter((item) => selectedIds.includes(item.activity.id) && !item.activity.completedAt)
    for (const item of targets) {
      const due = item.due ? addDays(item.due, 1) : addDays(now, 1)
      await updateActivity(item.activity.id, { dueAt: due.toISOString() })
    }
    setSelectedIds([])
  }

  const openCadence = (leadIds: string[] = []) => { setCadenceLeadIds(leadIds); setCadenceOpen(true) }
  const toggleSelection = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const allVisibleSelected = filteredActivities.length > 0 && filteredActivities.every((item) => selectedIds.includes(item.activity.id))

  return <div className="page-stack followups-page followups-page--professional">
    <section className="followup-command-bar">
      <div><span className="eyebrow">Central de execução comercial</span><h2>Follow-up sem lead esquecido</h2><p>A fila prioriza urgência, temperatura, etapa e ausência de próxima ação.</p></div>
      {canWrite ? <div className="followup-command-bar__actions"><Button variant="secondary" onClick={() => openCadence()}><Layers3 size={17} /> Iniciar cadência</Button><Button onClick={() => setExecutionOpen(true)} disabled={!queue.length}><Play size={17} /> Trabalhar fila ({queue.length})</Button></div> : null}
    </section>

    <section className="followup-alert-strip">
      <button type="button" onClick={() => { setView('queue'); setFilter('overdue') }}><TimerReset /><span><strong>{stats.overdue}</strong><small>vencidos</small></span></button>
      <button type="button" onClick={() => { setView('queue'); setFilter('today') }}><CalendarClock /><span><strong>{stats.today}</strong><small>para hoje</small></span></button>
      <button type="button" onClick={() => setRoute('leads')}><AlertTriangle /><span><strong>{stats.withoutNext}</strong><small>sem próxima ação</small></span></button>
      <button type="button" onClick={() => { setView('queue'); setPriority('urgent') }}><Flame /><span><strong>{stats.hotStalled}</strong><small>quentes parados</small></span></button>
      <button type="button" onClick={() => setRoute('pipeline')}><Target /><span><strong>{stats.proposals}</strong><small>propostas sem retorno</small></span></button>
    </section>

    <section className="followup-view-tabs">
      {([
        ['queue', 'Fila', ListChecks], ['board', 'Quadro', Kanban], ['calendar', 'Calendário', CalendarDays], ['cadences', 'Cadências', Layers3], ['performance', 'Desempenho', BarChart3],
      ] as const).map(([value, label, Icon]) => <button key={value} type="button" className={view === value ? 'is-active' : ''} onClick={() => setView(value)}><Icon size={17} /><span>{label}</span></button>)}
    </section>

    {['queue', 'board', 'calendar'].includes(view) ? <section className="toolbar-card followup-filter-bar">
      <label className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar atividade, lead, empresa ou cadência..." /></label>
      <select value={stageId} onChange={(event) => setStageId(event.target.value)}><option value="">Todas as etapas</option>{snapshot?.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select>
      <select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">Todas as prioridades</option><option value="urgent">Urgente</option><option value="high">Alta</option><option value="medium">Média</option><option value="low">Baixa</option></select>
      <select value={channel} onChange={(event) => setChannel(event.target.value)}><option value="">Todos os canais</option>{Object.entries(channelLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      {canWrite ? <Button variant="secondary" onClick={() => setCreateOpen(true)}><Plus size={16} /> Nova atividade</Button> : null}
    </section> : null}

    {view === 'queue' ? <>
      <section className="followup-filter-chips">
        {([['queue','Fila prioritária'],['overdue','Vencidos'],['today','Hoje'],['upcoming','Próximos'],['completed','Concluídos'],['all','Todos']] as [Filter,string][]).map(([value,label]) => <button type="button" key={value} className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>{label}<span>{value === 'overdue' ? stats.overdue : value === 'today' ? stats.today : value === 'upcoming' ? stats.upcoming : value === 'completed' ? stats.completed : ''}</span></button>)}
      </section>
      {canWrite && selectedIds.length ? <section className="followup-bulk-bar"><strong>{selectedIds.length} selecionada(s)</strong><div><Button size="sm" variant="secondary" onClick={() => void bulkPostpone()}><Clock3 size={15} /> Adiar +1 dia</Button><Button size="sm" variant="secondary" onClick={() => openCadence([...new Set(filteredActivities.filter((item) => selectedIds.includes(item.activity.id) && item.lead).map((item) => item.lead!.id))])}><Layers3 size={15} /> Inserir em cadência</Button><Button size="sm" onClick={() => void bulkComplete()}><CheckCircle2 size={15} /> Concluir</Button><Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>Limpar</Button></div></section> : null}
      <section className="followup-workspace-layout">
        <div className="panel followup-list-panel followup-list-panel--professional">
          <header className="followup-list-header">{canWrite ? <label className="followup-select-all"><input type="checkbox" checked={allVisibleSelected} onChange={() => setSelectedIds(allVisibleSelected ? [] : filteredActivities.map((item) => item.activity.id))} /><span /></label> : null}<div><h3>Fila comercial</h3><p>{filteredActivities.length} atividade(s) no filtro atual</p></div><span className="followup-priority-legend">Ordenada por prioridade</span></header>
          {filteredActivities.length ? <div className="followup-list">{filteredActivities.map((item) => <FollowupRow readOnly={!canWrite} key={item.activity.id} item={item} selected={selectedIds.includes(item.activity.id)} active={selectedActivity?.activity.id === item.activity.id} busy={busyId === item.activity.id} onSelect={() => setSelectedActivityId(item.activity.id)} onToggleSelect={() => toggleSelection(item.activity.id)} onToggle={() => void toggle(item.activity)} onEdit={() => item.activity.sourceType === 'manual' ? setEditing(item.activity) : item.activity.sourceType === 'calendar' ? setRoute('agenda') : setRoute('calls')} onOutcome={() => setOutcomeActivity(item.activity)} />)}</div> : <EmptyState icon={filter === 'completed' ? CheckCircle2 : XCircle} title="Nenhuma atividade encontrada" description="Crie um próximo contato, inicie uma cadência ou ajuste os filtros." action={canWrite ? <Button onClick={() => setCreateOpen(true)}><Plus size={17} /> Nova atividade</Button> : undefined} />}
        </div>
        <FollowupContext readOnly={!canWrite} item={selectedActivity} onOutcome={(activity) => setOutcomeActivity(activity)} onCadence={(leadId) => openCadence([leadId])} onEdit={(activity) => setEditing(activity)} onRoute={setRoute} />
      </section>
    </> : null}

    {view === 'board' ? <FollowupBoard items={filteredActivities} onSelect={(activity) => { setSelectedActivityId(activity.id); if (canWrite) setOutcomeActivity(activity) }} /> : null}
    {view === 'calendar' ? <FollowupCalendar items={filteredActivities} onSelect={(activity) => { setSelectedActivityId(activity.id); if (canWrite) setOutcomeActivity(activity) }} /> : null}
    {view === 'cadences' ? <CadenceDashboard readOnly={!canWrite} groups={cadenceGroups} onCreate={() => openCadence()} onSelectLead={(leadId) => { const activity = enriched.find((item) => item.activity.leadId === leadId && !item.activity.completedAt); if (activity) { setView('queue'); setSelectedActivityId(activity.activity.id) } }} /> : null}
    {view === 'performance' ? <PerformanceDashboard performance={performance} /> : null}

    <ActivityModal open={canWrite && createOpen} onClose={() => setCreateOpen(false)} />
    <ActivityModal open={canWrite && Boolean(editing)} activity={editing} onClose={() => setEditing(null)} />
    <CadenceModal open={canWrite && cadenceOpen} initialLeadIds={cadenceLeadIds} onClose={() => { setCadenceOpen(false); setCadenceLeadIds([]) }} />
    <OutcomeModal activity={canWrite ? outcomeActivity : null} onClose={() => setOutcomeActivity(null)} />
    <ExecutionWorkspace open={canWrite && executionOpen} queue={queue} onClose={() => setExecutionOpen(false)} onOutcome={(activity) => setOutcomeActivity(activity)} onRoute={setRoute} />
  </div>
}

function FollowupRow({ readOnly, item, selected, active, busy, onSelect, onToggleSelect, onToggle, onEdit, onOutcome }: { readOnly: boolean; item: EnrichedActivity; selected: boolean; active: boolean; busy: boolean; onSelect(): void; onToggleSelect(): void; onToggle(): void; onEdit(): void; onOutcome(): void }) {
  return <article className={`followup-row followup-row--professional ${item.activity.completedAt ? 'is-completed' : ''} ${active ? 'is-active' : ''}`} onClick={onSelect}>
    {!readOnly ? <label className="followup-row__select" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selected} onChange={onToggleSelect} /><span /></label> : null}
    {!readOnly ? <button className="followup-row__check" type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); onToggle() }} aria-label={item.activity.completedAt ? 'Reabrir atividade' : 'Registrar resultado'}>{item.activity.completedAt ? <Check size={18} /> : null}</button> : null}
    <div className="followup-row__body">
      <div className="followup-row__heading"><StatusPill tone={toneForActivity(item.activity)}>{channelLabel[item.channel]}</StatusPill>{item.cadenceName ? <span className="followup-cadence-chip"><Layers3 size={12} /> {item.cadenceName}{item.cadenceStep ? ` · ${item.cadenceStep}` : ''}</span> : null}{item.activity.sourceType !== 'manual' ? <small>Sincronizado</small> : null}</div>
      <strong>{item.activity.title}</strong>{item.description ? <p>{item.description}</p> : null}
      <div className="followup-row__meta"><span className={item.overdue ? 'text-danger' : ''}><Clock3 size={14} /> {formatDateTime(item.activity.dueAt)}</span><span><UserRound size={14} /> {item.lead?.name ?? 'Sem lead'}</span>{item.lead ? <span className={`followup-priority followup-priority--${item.lead.priority}`}>{item.lead.priority === 'urgent' ? 'Urgente' : item.lead.priority === 'high' ? 'Alta' : item.lead.priority === 'medium' ? 'Média' : 'Baixa'}</span> : null}</div>
    </div>
    {!readOnly ? <div className="followup-row__actions" onClick={(event) => event.stopPropagation()}>{!item.activity.completedAt ? <Button size="sm" onClick={onOutcome}>Registrar resultado</Button> : null}<button className="icon-button" type="button" onClick={onEdit} aria-label="Abrir atividade"><Edit3 size={17} /></button></div> : null}
  </article>
}

function FollowupContext({ readOnly, item, onOutcome, onCadence, onEdit, onRoute }: { readOnly: boolean; item: EnrichedActivity | null; onOutcome(activity: ActivityItem): void; onCadence(leadId: string): void; onEdit(activity: ActivityItem): void; onRoute(route: 'calls' | 'agenda' | 'pipeline' | 'playbooks'): void }) {
  if (!item) return <aside className="panel followup-context-panel"><EmptyState icon={ListChecks} title="Selecione uma atividade" description="O contexto do lead, histórico e orientação aparecerão aqui." /></aside>
  const lead = item.lead
  const phone = lead?.phone.replace(/\D/g, '') ?? ''
  const whatsapp = phone ? (phone.startsWith('55') ? phone : `55${phone}`) : ''
  const instagram = instagramUrl(lead)
  return <aside className="panel followup-context-panel">
    <header><div><span className="eyebrow">Contexto do contato</span><h3>{lead?.name ?? 'Atividade sem lead'}</h3><p>{lead?.company || lead?.city || 'Cadastro sem empresa'}</p></div>{lead ? <span className={`temperature-badge temperature-badge--${lead.temperature}`}>{lead.temperature === 'hot' ? 'Quente' : lead.temperature === 'warm' ? 'Morno' : 'Frio'}</span> : null}</header>
    {lead ? <div className="followup-context-summary"><div><span>Etapa</span><strong>{item.stageName}</strong></div><div><span>Responsável</span><strong>{lead.ownerName || 'Não atribuído'}</strong></div><div><span>Próxima ação</span><strong>{formatDateTime(lead.nextActionAt)}</strong></div><div><span>Prioridade</span><strong>{lead.priority === 'urgent' ? 'Urgente' : lead.priority === 'high' ? 'Alta' : lead.priority === 'medium' ? 'Média' : 'Baixa'}</strong></div></div> : null}
    <section className="followup-context-action"><span className="eyebrow">Ação atual</span><h4>{item.activity.title}</h4><p>{item.description || 'Sem orientação registrada.'}</p>{item.script ? <div className="followup-script-box"><strong>Orientação sugerida</strong><p>{item.script}</p><Button size="sm" variant="ghost" onClick={() => onRoute('playbooks')}>Abrir Playbooks <ExternalLink size={14} /></Button></div> : null}</section>
    {!readOnly && lead ? <div className="followup-channel-actions"><a className={!phone ? 'is-disabled' : ''} href={phone ? `tel:${phone}` : undefined}><PhoneCall size={18} /><span>Ligar</span></a><a className={!whatsapp ? 'is-disabled' : ''} href={whatsapp ? `https://wa.me/${whatsapp}` : undefined} target="_blank" rel="noreferrer"><MessageCircle size={18} /><span>WhatsApp</span></a><a className={!lead.email ? 'is-disabled' : ''} href={lead.email ? `mailto:${lead.email}` : undefined}><Mail size={18} /><span>E-mail</span></a><a className={!instagram ? 'is-disabled' : ''} href={instagram || undefined} target="_blank" rel="noreferrer"><Send size={18} /><span>Instagram</span></a></div> : null}
    <div className="followup-context-buttons">{!readOnly ? <>{!item.activity.completedAt ? <Button onClick={() => onOutcome(item.activity)}><CheckCircle2 size={16} /> Registrar resultado</Button> : null}<Button variant="secondary" onClick={() => onEdit(item.activity)}><Edit3 size={16} /> Editar atividade</Button>{lead ? <Button variant="ghost" onClick={() => onCadence(lead.id)}><Layers3 size={16} /> Nova cadência</Button> : null}</> : null}{lead ? <Button variant="ghost" onClick={() => onRoute('pipeline')}><ExternalLink size={16} /> Ver Pipeline</Button> : null}</div>
  </aside>
}

function FollowupBoard({ items, onSelect }: { items: EnrichedActivity[]; onSelect(activity: ActivityItem): void }) {
  const now = new Date()
  const columns = [
    { id: 'overdue', label: 'Vencidos', items: items.filter((item) => item.overdue) },
    { id: 'today', label: 'Hoje', items: items.filter((item) => item.today) },
    { id: 'waiting', label: 'Sem data', items: items.filter((item) => !item.activity.completedAt && !item.due) },
    { id: 'upcoming', label: 'Próximos', items: items.filter((item) => !item.activity.completedAt && item.due && item.due.getTime() > endOfDay(now).getTime()) },
    { id: 'completed', label: 'Concluídos', items: items.filter((item) => item.activity.completedAt).slice(0, 30) },
  ]
  return <section className="followup-board">{columns.map((column) => <div className={`followup-board__column followup-board__column--${column.id}`} key={column.id}><header><strong>{column.label}</strong><span>{column.items.length}</span></header><div>{column.items.map((item) => <button type="button" key={item.activity.id} onClick={() => onSelect(item.activity)}><span><StatusPill tone={toneForActivity(item.activity)}>{channelLabel[item.channel]}</StatusPill>{item.cadenceStep ? <small>{item.cadenceStep}</small> : null}</span><strong>{item.activity.title}</strong><p>{item.lead?.name ?? 'Sem lead'}</p><footer><span><Clock3 size={13} /> {formatDateTime(item.activity.dueAt)}</span>{item.lead ? <span className={`priority-dot priority-dot--${item.lead.priority}`} /> : null}</footer></button>)}</div></div>)}</section>
}

function FollowupCalendar({ items, onSelect }: { items: EnrichedActivity[]; onSelect(activity: ActivityItem): void }) {
  const [offset, setOffset] = useState(0)
  const start = addDays(startOfDay(new Date()), offset * 7)
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index))
  return <section className="panel followup-calendar"><header><div><span className="eyebrow">Agenda de contatos</span><h3>{start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })} — {days[6].toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</h3></div><div><button className="icon-button" type="button" onClick={() => setOffset((value) => value - 1)}><ChevronLeft size={18} /></button><Button size="sm" variant="ghost" onClick={() => setOffset(0)}>Hoje</Button><button className="icon-button" type="button" onClick={() => setOffset((value) => value + 1)}><ChevronRight size={18} /></button></div></header><div className="followup-calendar__grid">{days.map((day) => { const dayItems = items.filter((item) => item.due && dateKey(item.due) === dateKey(day)); return <div key={dateKey(day)} className={sameDay(day, new Date()) ? 'is-today' : ''}><header><span>{day.toLocaleDateString('pt-BR', { weekday: 'short' })}</span><strong>{day.getDate()}</strong><small>{dayItems.length}</small></header><section>{dayItems.map((item) => <button type="button" key={item.activity.id} onClick={() => onSelect(item.activity)}><span>{item.due?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span><strong>{item.activity.title}</strong><small>{item.lead?.name ?? 'Sem lead'} · {channelLabel[item.channel]}</small></button>)}</section></div> })}</div></section>
}

function CadenceDashboard({ readOnly, groups, onCreate, onSelectLead }: { readOnly: boolean; groups: { id: string; name: string; category: string; activities: EnrichedActivity[]; leads: Set<string> }[]; onCreate(): void; onSelectLead(leadId: string): void }) {
  return <div className="cadence-dashboard"><section className="cadence-dashboard__hero"><div><span className="eyebrow">Cadências ativas</span><h2>Sequências comerciais em execução</h2><p>Acompanhe adesão, avanço e gargalos por estratégia.</p></div>{!readOnly ? <Button onClick={onCreate}><Plus size={17} /> Iniciar cadência</Button> : null}</section>{groups.length ? <section className="cadence-dashboard__grid">{groups.map((group) => { const completed = group.activities.filter((item) => item.activity.completedAt).length; const rate = group.activities.length ? Math.round((completed / group.activities.length) * 100) : 0; const next = group.activities.filter((item) => !item.activity.completedAt && item.due).sort((a, b) => a.due!.getTime() - b.due!.getTime())[0]; return <article className="cadence-monitor-card" key={group.id}><header><span><Layers3 size={19} /></span><div><small>{group.category}</small><h3>{group.name}</h3></div><StatusPill tone={rate >= 70 ? 'success' : rate >= 35 ? 'warning' : 'info'}>{rate}%</StatusPill></header><div className="cadence-monitor-card__metrics"><div><strong>{group.leads.size}</strong><span>leads</span></div><div><strong>{group.activities.length - completed}</strong><span>pendentes</span></div><div><strong>{completed}</strong><span>concluídas</span></div></div><div className="cadence-monitor-card__progress"><span style={{ width: `${rate}%` }} /></div><footer><span><Clock3 size={14} /> {next ? `Próxima: ${formatDateTime(next.activity.dueAt)}` : 'Sequência concluída'}</span>{next?.activity.leadId ? <button type="button" onClick={() => onSelectLead(next.activity.leadId!)}>Abrir lead <ChevronRight size={14} /></button> : null}</footer></article>})}</section> : <EmptyState icon={Layers3} title="Nenhuma cadência iniciada" description="Use modelos de prospecção, proposta, reativação, reunião ou pós-venda." action={!readOnly ? <Button onClick={onCreate}><Plus size={17} /> Iniciar primeira cadência</Button> : undefined} />}</div>
}

function PerformanceDashboard({ performance }: { performance: { outcomeCounts: { outcome: FollowupOutcome; count: number }[]; completed: number; scheduled: number; contacts: number; meetings: number; proposals: number; wins: number; completionRate: number; contactRate: number } }) {
  const max = Math.max(1, ...performance.outcomeCounts.map((item) => item.count))
  return <div className="performance-dashboard"><section className="performance-summary-grid"><article><span>Execução</span><strong>{performance.completionRate}%</strong><small>{performance.completed} de {performance.scheduled} atividades</small></article><article><span>Contato efetivo</span><strong>{performance.contactRate}%</strong><small>{performance.contacts} respostas úteis</small></article><article><span>Reuniões</span><strong>{performance.meetings}</strong><small>últimos 30 dias</small></article><article><span>Propostas</span><strong>{performance.proposals}</strong><small>solicitações registradas</small></article><article><span>Vendas</span><strong>{performance.wins}</strong><small>resultados ganhos</small></article></section><section className="performance-layout"><div className="panel performance-results"><header><div><span className="eyebrow">Resultados registrados</span><h3>Conversão por desfecho</h3></div><span>Últimos 30 dias</span></header>{performance.outcomeCounts.length ? <div className="performance-bars">{performance.outcomeCounts.map((item) => <div key={item.outcome}><span>{outcomeLabel[item.outcome]}</span><div><i style={{ width: `${Math.max(5, (item.count / max) * 100)}%` }} /></div><strong>{item.count}</strong></div>)}</div> : <EmptyState icon={BarChart3} title="Ainda não há resultados suficientes" description="Ao concluir contatos pelo botão Registrar resultado, as métricas serão preenchidas automaticamente." />}</div><aside className="panel performance-diagnosis"><span className="eyebrow">Leitura comercial</span><h3>O que acompanhar</h3><ul><li>Execução abaixo de 80% indica fila acumulada ou carga mal distribuída.</li><li>Contato efetivo baixo exige revisão de canal, horário e qualidade dos dados.</li><li>Muitas propostas sem reunião sugerem qualificação superficial.</li><li>Registre sempre o resultado para comparar cadências e responsáveis.</li></ul></aside></section></div>
}

function ExecutionWorkspace({ open, queue, onClose, onOutcome, onRoute }: { open: boolean; queue: EnrichedActivity[]; onClose(): void; onOutcome(activity: ActivityItem): void; onRoute(route: 'calls' | 'agenda' | 'pipeline' | 'playbooks'): void }) {
  const [index, setIndex] = useState(0)
  useEffect(() => { if (open) setIndex(0) }, [open])
  useEffect(() => { if (index >= queue.length && queue.length) setIndex(queue.length - 1) }, [index, queue.length])
  const current = queue[index] ?? null
  const lead = current?.lead ?? null
  const phone = lead?.phone.replace(/\D/g, '') ?? ''
  const whatsapp = phone ? (phone.startsWith('55') ? phone : `55${phone}`) : ''
  return <Modal open={open} onClose={onClose} title="Modo de execução" subtitle={queue.length ? `${index + 1} de ${queue.length} atividades prioritárias` : 'Fila concluída'} size="lg" footer={<><Button variant="ghost" disabled={index <= 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}><ChevronLeft size={16} /> Anterior</Button><span className="modal__footer-spacer" /><Button variant="secondary" onClick={onClose}>Fechar</Button><Button variant="secondary" disabled={index >= queue.length - 1} onClick={() => setIndex((value) => Math.min(queue.length - 1, value + 1))}>Próximo <ChevronRight size={16} /></Button>{current ? <Button onClick={() => onOutcome(current.activity)}><CheckCircle2 size={16} /> Registrar resultado</Button> : null}</>}>
    {current ? <div className="execution-workspace"><section className="execution-lead-card"><div><span className="execution-lead-card__avatar">{lead?.name.slice(0, 2).toUpperCase() ?? '—'}</span><span><small>Lead atual</small><h3>{lead?.name ?? 'Sem lead vinculado'}</h3><p>{lead?.company || lead?.city || 'Sem empresa'} · {lead?.ownerName || 'Sem responsável'}</p></span></div>{lead ? <div><StatusPill tone={lead.temperature === 'hot' ? 'danger' : lead.temperature === 'warm' ? 'warning' : 'info'}>{lead.temperature === 'hot' ? 'Quente' : lead.temperature === 'warm' ? 'Morno' : 'Frio'}</StatusPill><StatusPill tone="neutral">{lead.priority === 'urgent' ? 'Urgente' : lead.priority === 'high' ? 'Alta' : lead.priority === 'medium' ? 'Média' : 'Baixa'}</StatusPill></div> : null}</section><div className="execution-workspace__grid"><section className="execution-action-card"><span className="eyebrow">Objetivo da etapa</span><h2>{current.activity.title}</h2><p>{current.description || 'Execute o contato e registre o que aconteceu.'}</p><div className="execution-action-meta"><span><Clock3 size={15} /> {formatDateTime(current.activity.dueAt)}</span><span><Layers3 size={15} /> {current.cadenceName || 'Atividade avulsa'} {current.cadenceStep ? `· ${current.cadenceStep}` : ''}</span></div>{current.script ? <div className="execution-script"><span>Script ou orientação</span><p>{current.script}</p><button type="button" onClick={() => onRoute('playbooks')}>Consultar Playbooks <ExternalLink size={14} /></button></div> : null}<div className="execution-channel-grid"><a className={!phone ? 'is-disabled' : ''} href={phone ? `tel:${phone}` : undefined}><PhoneCall size={21} /><strong>Ligar</strong><span>Abrir discador</span></a><a className={!whatsapp ? 'is-disabled' : ''} href={whatsapp ? `https://wa.me/${whatsapp}` : undefined} target="_blank" rel="noreferrer"><MessageCircle size={21} /><strong>WhatsApp</strong><span>Abrir conversa</span></a><a className={!lead?.email ? 'is-disabled' : ''} href={lead?.email ? `mailto:${lead.email}` : undefined}><Mail size={21} /><strong>E-mail</strong><span>Nova mensagem</span></a><button type="button" onClick={() => onRoute(current.activity.type === 'meeting' ? 'agenda' : 'calls')}><ExternalLink size={21} /><strong>Abrir módulo</strong><span>{current.activity.type === 'meeting' ? 'Agenda' : 'Ligações'}</span></button></div></section><aside className="execution-checklist"><span className="eyebrow">Antes de avançar</span><h3>Checklist obrigatório</h3><ol><li>Revise o histórico e o objetivo.</li><li>Execute o contato no canal previsto.</li><li>Registre objeções e acordos.</li><li>Defina o resultado real.</li><li>Programe a próxima ação.</li></ol><div><strong>{queue.length - index}</strong><span>itens restantes na fila</span></div></aside></div></div> : <EmptyState icon={CheckCircle2} title="Fila concluída" description="Não existem atividades vencidas ou previstas para hoje." />}
  </Modal>
}
