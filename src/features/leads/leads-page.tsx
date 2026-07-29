import {
  AlertCircle, Archive, CalendarClock, CheckSquare, Columns3, Download, Filter, Flame, Gauge, LayoutGrid, List, MoreHorizontal,
  MessageCircle, PhoneCall, Plus, RefreshCw, Save, Search, SlidersHorizontal, Tag, Trash2, Upload, UsersRound, X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { StatusPill } from '../../components/ui/status-pill'
import { formatCurrency, formatDateTime, initials } from '../../domain/formatters'
import type { ActivityType, Lead, LeadPriority, LeadStatus, LeadTemperature } from '../../domain/types'
import { safeStorage } from '../../lib/storage'
import { findDuplicateMatches, latestLeadInteractionAt } from '../../services/lead-intelligence'
import { leadScoreInsight } from '../../services/lead-scoring'
import { leadsToCsv } from '../../services/lead-csv'
import { EventModal } from '../agenda/event-modal'
import { CallWorkspaceModal } from '../calls/call-workspace-modal'
import { ActivityModal } from '../followups/activity-modal'
import { CreateLeadModal } from './create-lead-modal'
import { EditLeadModal } from './edit-lead-modal'
import { LeadDetailsDrawer } from './lead-details-drawer'
import { usePreferences } from '../settings/preferences-context'

const temperatureLabel = { cold: 'Frio', warm: 'Morno', hot: 'Quente' }
const priorityLabel = { low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente' }
const statusLabel = { active: 'Ativo', won: 'Ganho', lost: 'Perdido', archived: 'Arquivado' }
const PAGE_SIZE = 25
const PREFERENCES_KEY = 'realtalent-crm-v10020-leads-preferences'
const SAVED_VIEWS_KEY = 'realtalent-crm-v10020-leads-saved-views'
const workspaceKey = (prefix: string, workspaceId: string) => `${prefix}:${workspaceId || 'default'}`

const isTodayOrOverdue = (value: string | null) => value ? new Date(value).getTime() <= new Date().setHours(23, 59, 59, 999) : false
const isOverdue = (value: string | null) => value ? new Date(value).getTime() < Date.now() : false
const recentDays = (value: string, days: number) => new Date(value).getTime() >= Date.now() - days * 86_400_000

type ViewMode = 'table' | 'cards'
type Density = 'comfortable' | 'compact'
type LeadColumn = 'contact' | 'score' | 'stage' | 'status' | 'temperature' | 'owner' | 'nextAction' | 'value' | 'source' | 'lastActivity'
type DueFilter = 'all' | 'due' | 'overdue' | 'today' | 'none'
type QualityFilter = 'all' | 'stale' | 'new'

interface LeadFilters {
  stage: string
  temperature: string
  priority: string
  status: string
  source: string
  city: string
  owner: string
  due: DueFilter
  quality: QualityFilter
  tag: string
  sort: string
}

interface SavedView {
  id: string
  name: string
  filters: LeadFilters
}

const defaultFilters: LeadFilters = {
  stage: 'all', temperature: 'all', priority: 'all', status: 'all', source: 'all', city: 'all', owner: 'all', due: 'all', quality: 'all', tag: 'all', sort: 'updated-desc',
}
const defaultColumns: LeadColumn[] = ['contact', 'score', 'stage', 'temperature', 'owner', 'nextAction', 'value']
const columnLabels: Record<LeadColumn, string> = {
  contact: 'Contato', score: 'Lead Score', stage: 'Etapa', status: 'Status', temperature: 'Temperatura', owner: 'Responsável', nextAction: 'Próxima ação', value: 'Valor', source: 'Origem', lastActivity: 'Última atividade',
}

const readPreferences = (workspaceId: string): { view: ViewMode; density: Density; columns: LeadColumn[] } => {
  try {
    const stored = JSON.parse(safeStorage.getItem(workspaceKey(PREFERENCES_KEY, workspaceId)) ?? '{}') as Partial<{ view: ViewMode; density: Density; columns: LeadColumn[] }>
    return {
      view: stored.view === 'cards' ? 'cards' : 'table', density: stored.density === 'compact' ? 'compact' : 'comfortable',
      columns: Array.isArray(stored.columns) && stored.columns.length ? stored.columns.filter((item): item is LeadColumn => item in columnLabels) : defaultColumns,
    }
  } catch { return { view: 'table', density: 'comfortable', columns: defaultColumns } }
}

const readSavedViews = (workspaceId: string): SavedView[] => {
  try {
    const stored = JSON.parse(safeStorage.getItem(workspaceKey(SAVED_VIEWS_KEY, workspaceId)) ?? '[]')
    return Array.isArray(stored) ? stored : []
  } catch { return [] }
}

export function LeadsPage() {
  const { snapshot, canWrite, importLeadFile, bulkUpdateLeads, bulkDeleteLeads, updateLead, createActivity, notify, confirmAction, promptAction } = useApp()
  const { preferences: crmPreferences } = usePreferences()
  const workspaceId = snapshot?.workspace.id ?? 'default'
  const preferences = useMemo(() => readPreferences(workspaceId), [workspaceId])
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<LeadFilters>(defaultFilters)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Lead | null>(null)
  const [drawerLeadId, setDrawerLeadId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>(preferences.view)
  const [mobileView, setMobileView] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches)
  const [density, setDensity] = useState<Density>(preferences.density)
  const [visibleColumns, setVisibleColumns] = useState<LeadColumn[]>(preferences.columns)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => readSavedViews(workspaceId))
  const [activeView, setActiveView] = useState('all')
  const [activityLead, setActivityLead] = useState<Lead | null>(null)
  const [activityType, setActivityType] = useState<ActivityType>('followup')
  const [eventLead, setEventLead] = useState<Lead | null>(null)
  const [callLead, setCallLead] = useState<Lead | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const allLeads = snapshot?.leads ?? []
  const duplicateMatches = useMemo(() => findDuplicateMatches(allLeads), [allLeads])
  const sources = useMemo(() => [...new Set(allLeads.map((lead) => lead.source).filter(Boolean))].sort(), [allLeads])
  const cities = useMemo(() => [...new Set(allLeads.map((lead) => lead.city).filter(Boolean))].sort(), [allLeads])
  const owners = useMemo(() => [...new Set(allLeads.map((lead) => lead.ownerName).filter(Boolean))].sort(), [allLeads])
  const tags = useMemo(() => [...new Set(allLeads.flatMap((lead) => lead.tags).filter(Boolean))].sort(), [allLeads])
  const drawerLead = drawerLeadId ? allLeads.find((lead) => lead.id === drawerLeadId) ?? null : null

  const lastInteraction = useMemo(() => new Map(allLeads.map((lead) => [lead.id, latestLeadInteractionAt(lead, snapshot?.activities ?? [], snapshot?.calls ?? [], snapshot?.events ?? [])])), [allLeads, snapshot])
  const scoreByLead = useMemo(() => new Map(snapshot ? snapshot.leads.map((lead) => [lead.id, leadScoreInsight(lead, snapshot, crmPreferences.commercial.leadScoring)]) : []), [crmPreferences.commercial.leadScoring, snapshot])

  const stats = useMemo(() => ({
    total: allLeads.filter((lead) => lead.status === 'active').length,
    newLeads: allLeads.filter((lead) => recentDays(lead.createdAt, 7)).length,
    due: allLeads.filter((lead) => lead.status === 'active' && isTodayOrOverdue(lead.nextActionAt)).length,
    noAction: allLeads.filter((lead) => lead.status === 'active' && !lead.nextActionAt).length,
  }), [allLeads])

  const leads = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const filtered = allLeads.filter((lead) => {
      const haystack = `${lead.name} ${lead.company} ${lead.phone} ${lead.email} ${lead.city} ${lead.source} ${lead.ownerName} ${lead.notes} ${lead.tags.join(' ')}`.toLowerCase()
      const interactionAt = lastInteraction.get(lead.id) ?? lead.updatedAt
      return (!normalizedQuery || haystack.includes(normalizedQuery))
        && (filters.stage === 'all' || lead.stageId === filters.stage)
        && (filters.temperature === 'all' || lead.temperature === filters.temperature)
        && (filters.priority === 'all' || lead.priority === filters.priority)
        && (filters.status === 'all' || lead.status === filters.status)
        && (filters.source === 'all' || lead.source === filters.source)
        && (filters.city === 'all' || lead.city === filters.city)
        && (filters.owner === 'all' || (filters.owner === 'none' ? !lead.ownerName : lead.ownerName === filters.owner))
        && (filters.tag === 'all' || lead.tags.includes(filters.tag))
        && (filters.due === 'all'
          || (filters.due === 'due' && isTodayOrOverdue(lead.nextActionAt))
          || (filters.due === 'overdue' && isOverdue(lead.nextActionAt))
          || (filters.due === 'today' && lead.nextActionAt && new Date(lead.nextActionAt).toDateString() === new Date().toDateString())
          || (filters.due === 'none' && !lead.nextActionAt))
        && (filters.quality === 'all'
          || (filters.quality === 'stale' && !recentDays(interactionAt, 7))
          || (filters.quality === 'new' && recentDays(lead.createdAt, 7)))
    })
    return filtered.sort((a, b) => {
      if (filters.sort === 'name') return a.name.localeCompare(b.name, 'pt-BR')
      if (filters.sort === 'value-desc') return b.value - a.value
      if (filters.sort === 'next-action') return (a.nextActionAt ?? '9999').localeCompare(b.nextActionAt ?? '9999')
      if (filters.sort === 'created-desc') return b.createdAt.localeCompare(a.createdAt)
      if (filters.sort === 'priority') return (scoreByLead.get(b.id)?.score ?? 0) - (scoreByLead.get(a.id)?.score ?? 0)
      return b.updatedAt.localeCompare(a.updatedAt)
    })
  }, [allLeads, filters, lastInteraction, query, scoreByLead])

  const totalPages = Math.max(1, Math.ceil(leads.length / PAGE_SIZE))
  const pageLeads = leads.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const pageIds = pageLeads.map((lead) => lead.id)
  const pageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id))

  useEffect(() => { setPage(1) }, [filters, query])
  useEffect(() => { if (page > totalPages) setPage(totalPages) }, [page, totalPages])
  useEffect(() => { setSelected((current) => new Set([...current].filter((id) => allLeads.some((lead) => lead.id === id)))) }, [allLeads])
  useEffect(() => {
    const media = window.matchMedia('(max-width: 720px)')
    const update = () => setMobileView(media.matches)
    update(); media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    const next = readPreferences(workspaceId)
    setViewMode(next.view); setDensity(next.density); setVisibleColumns(next.columns)
    setSavedViews(readSavedViews(workspaceId)); setActiveView('all')
  }, [workspaceId])
  useEffect(() => {
    safeStorage.setItem(workspaceKey(PREFERENCES_KEY, workspaceId), JSON.stringify({ view: viewMode, density, columns: visibleColumns }))
  }, [density, viewMode, visibleColumns, workspaceId])
  useEffect(() => { safeStorage.setItem(workspaceKey(SAVED_VIEWS_KEY, workspaceId), JSON.stringify(savedViews)) }, [savedViews, workspaceId])

  const updateFilters = (patch: Partial<LeadFilters>) => { setFilters((current) => ({ ...current, ...patch })); setActiveView('custom') }
  const resetFilters = () => { setQuery(''); setFilters(defaultFilters); setActiveView('all') }
  const hasFilters = Boolean(query || Object.entries(filters).some(([key, value]) => value !== defaultFilters[key as keyof LeadFilters]))

  const applyBuiltInView = (id: string) => {
    setQuery('')
    if (id === 'hot') setFilters({ ...defaultFilters, status: 'active', temperature: 'hot', sort: 'priority' })
    else if (id === 'due') setFilters({ ...defaultFilters, status: 'active', due: 'due', sort: 'next-action' })
    else if (id === 'no-action') setFilters({ ...defaultFilters, status: 'active', due: 'none' })
    else setFilters(defaultFilters)
    setActiveView(id)
  }

  const applySavedView = (view: SavedView) => { setQuery(''); setFilters(view.filters); setActiveView(view.id) }
  const saveCurrentView = async () => {
    const name = (await promptAction({ title: 'Salvar visualização', description: 'Dê um nome para reutilizar esta combinação de filtros.', label: 'Nome da visualização', initialValue: 'Minha visualização', confirmLabel: 'Salvar visualização', placeholder: 'Ex.: Leads quentes de São Paulo' }))?.trim()
    if (!name) return
    const view: SavedView = { id: `saved-${Date.now()}`, name, filters }
    setSavedViews((current) => [...current, view]); setActiveView(view.id); notify('success', 'Visualização salva para este navegador.')
  }
  const removeSavedView = (event: MouseEvent, id: string) => {
    event.stopPropagation(); setSavedViews((current) => current.filter((view) => view.id !== id)); if (activeView === id) applyBuiltInView('all')
  }

  const downloadCsv = () => {
    if (!snapshot) return
    const chosen = selected.size ? snapshot.leads.filter((lead) => selected.has(lead.id)) : leads
    const blob = new Blob([leadsToCsv(chosen, snapshot.stages)], { type: 'text/csv;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob); link.download = selected.size ? 'leads-selecionados-v100-7.csv' : 'leads-filtrados-v100-7.csv'; link.click(); URL.revokeObjectURL(link.href)
    notify('success', `${chosen.length} lead(s) exportado(s).`)
  }

  const importFile = async (file?: File) => {
    if (!file) return
    setBusy(true)
    try {
      const result = await importLeadFile(file)
      if (result.warnings.length) notify('info', `${result.warnings.length} aviso(s) durante a importação.`)
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Falha na importação.') }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const updateSelected = async (input: Parameters<typeof bulkUpdateLeads>[1]) => {
    if (!selected.size) return
    setBusy(true)
    try { await bulkUpdateLeads([...selected], input); setSelected(new Set()) }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Falha na ação em massa.') }
    finally { setBusy(false) }
  }

  const addTagSelected = async () => {
    const tag = (await promptAction({ title: 'Adicionar tag', description: `A tag será adicionada a ${selected.size} lead(s) selecionado(s).`, label: 'Nome da tag', confirmLabel: 'Adicionar tag', placeholder: 'Ex.: Prioridade comercial' }))?.trim()
    if (!tag || !selected.size) return
    setBusy(true)
    try {
      const chosen = allLeads.filter((lead) => selected.has(lead.id))
      await Promise.all(chosen.map((lead) => updateLead(lead.id, { tags: Array.from(new Set([...lead.tags, tag])) })))
      setSelected(new Set()); notify('success', `Tag adicionada a ${chosen.length} lead(s).`)
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível adicionar a tag.') }
    finally { setBusy(false) }
  }

  const createFollowupsSelected = async () => {
    if (!selected.size) return
    const due = new Date(); due.setDate(due.getDate() + 1); due.setHours(9, 0, 0, 0)
    setBusy(true)
    try {
      const chosen = allLeads.filter((lead) => selected.has(lead.id))
      await Promise.all(chosen.map((lead) => createActivity({ leadId: lead.id, type: 'followup', title: `Retomar contato — ${lead.name}`, description: 'Follow-up criado pela ação em massa da base de leads.', dueAt: due.toISOString(), completedAt: null, assignedTo: lead.ownerId })))
      setSelected(new Set()); notify('success', `${chosen.length} follow-up(s) criado(s) para amanhã às 9h.`)
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível criar os follow-ups.') }
    finally { setBusy(false) }
  }

  const removeSelected = async () => {
    if (!selected.size) return
    if (!await confirmAction({ title: `Excluir ${selected.size} lead(s)?`, description: 'Os cadastros selecionados serão removidos permanentemente da base.', confirmLabel: 'Excluir leads', tone: 'danger', details: ['Esta ação não pode ser desfeita.', 'Considere arquivar quando precisar preservar o histórico.'] })) return
    setBusy(true)
    try { await bulkDeleteLeads([...selected]); setSelected(new Set()) }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Falha ao excluir leads.') }
    finally { setBusy(false) }
  }

  const togglePage = () => setSelected((current) => {
    const next = new Set(current); pageIds.forEach((id) => pageSelected ? next.delete(id) : next.add(id)); return next
  })
  const toggleColumn = (column: LeadColumn) => setVisibleColumns((current) => current.includes(column) ? current.filter((item) => item !== column) : [...current, column])
  const openActivity = (lead: Lead, type: ActivityType = 'followup') => { setActivityLead(lead); setActivityType(type) }
  const openWhatsApp = (lead: Lead) => {
    const digits = lead.phone.replace(/\D/g, '')
    if (!digits) { notify('info', 'Cadastre um telefone antes de abrir o WhatsApp.'); return }
    const number = digits.startsWith('55') ? digits : `55${digits}`
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(`Olá, ${lead.name}! Tudo bem?`)}`, '_blank', 'noopener,noreferrer')
  }

  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; clear(): void }[] = []
    if (filters.stage !== 'all') chips.push({ key: 'stage', label: snapshot?.stages.find((item) => item.id === filters.stage)?.name ?? 'Etapa', clear: () => updateFilters({ stage: 'all' }) })
    if (filters.temperature !== 'all') chips.push({ key: 'temperature', label: temperatureLabel[filters.temperature as LeadTemperature], clear: () => updateFilters({ temperature: 'all' }) })
    if (filters.priority !== 'all') chips.push({ key: 'priority', label: `Prioridade ${priorityLabel[filters.priority as LeadPriority]}`, clear: () => updateFilters({ priority: 'all' }) })
    if (filters.status !== 'all') chips.push({ key: 'status', label: statusLabel[filters.status as LeadStatus], clear: () => updateFilters({ status: 'all' }) })
    if (filters.source !== 'all') chips.push({ key: 'source', label: filters.source, clear: () => updateFilters({ source: 'all' }) })
    if (filters.city !== 'all') chips.push({ key: 'city', label: filters.city, clear: () => updateFilters({ city: 'all' }) })
    if (filters.owner !== 'all') chips.push({ key: 'owner', label: filters.owner === 'none' ? 'Sem responsável' : filters.owner, clear: () => updateFilters({ owner: 'all' }) })
    if (filters.tag !== 'all') chips.push({ key: 'tag', label: `#${filters.tag}`, clear: () => updateFilters({ tag: 'all' }) })
    if (filters.due !== 'all') chips.push({ key: 'due', label: filters.due === 'none' ? 'Sem próxima ação' : filters.due === 'overdue' ? 'Atrasados' : filters.due === 'today' ? 'Hoje' : 'Vencidos ou hoje', clear: () => updateFilters({ due: 'all' }) })
    if (filters.quality !== 'all') chips.push({ key: 'quality', label: filters.quality === 'stale' ? 'Sem interação há 7 dias' : 'Novos na semana', clear: () => updateFilters({ quality: 'all' }) })
    return chips
  }, [filters, snapshot])


  return (
    <div className={`page-stack leads-v107 leads-v107--${density}`}>
      <section className="lead-health-strip">
        <button type="button" className={activeView === 'all' ? 'is-active' : ''} onClick={() => applyBuiltInView('all')}><span><UsersRound /></span><div><small>Leads ativos</small><strong>{stats.total}</strong><em>Base comercial</em></div></button>
        <button type="button" className={activeView === 'due' ? 'is-active' : ''} onClick={() => applyBuiltInView('due')}><span className="is-orange"><CalendarClock /></span><div><small>Precisam de ação</small><strong>{stats.due}</strong><em>Vencidos ou hoje</em></div></button>
        <button type="button" className={activeView === 'no-action' ? 'is-active' : ''} onClick={() => applyBuiltInView('no-action')}><span className="is-red"><AlertCircle /></span><div><small>Sem próxima ação</small><strong>{stats.noAction}</strong><em>Risco de esquecimento</em></div></button>
        <button type="button" className={activeView === 'new' ? 'is-active' : ''} onClick={() => { setFilters({ ...defaultFilters, quality: 'new', sort: 'created-desc' }); setActiveView('new') }}><span className="is-green"><Plus /></span><div><small>Novos em 7 dias</small><strong>{stats.newLeads}</strong><em>Entradas recentes</em></div></button>
      </section>


      <section className="lead-view-tabs" aria-label="Visualizações de leads">
        <div className="lead-view-tabs__scroll">
          {[
            ['all', 'Todos'], ['hot', 'Leads quentes'], ['due', 'Retornos pendentes'], ['no-action', 'Sem próxima ação'],
          ].map(([id, label]) => <button key={id} type="button" className={activeView === id ? 'is-active' : ''} onClick={() => applyBuiltInView(id)}>{label}</button>)}
          {savedViews.map((view) => <button key={view.id} type="button" className={activeView === view.id ? 'is-active lead-view-tabs__saved' : 'lead-view-tabs__saved'} onClick={() => applySavedView(view)}>{view.name}<X size={13} onClick={(event) => removeSavedView(event, view.id)} /></button>)}
        </div>
        <Button size="sm" variant="ghost" onClick={() => void saveCurrentView()}><Save size={15} /> Salvar visualização</Button>
      </section>

      <section className="toolbar-card toolbar-card--wrap leads-toolbar">
        <div className="toolbar-card__filters">
          <label className="search-field leads-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nome, empresa, telefone, e-mail, cidade, tag..." /></label>
          <Button variant={filtersOpen || hasFilters ? 'secondary' : 'ghost'} onClick={() => setFiltersOpen((value) => !value)}><Filter size={17} /> Filtros {activeFilterChips.length ? `(${activeFilterChips.length})` : ''}</Button>
          {hasFilters ? <Button variant="ghost" onClick={resetFilters}><X size={16} /> Limpar</Button> : null}
        </div>
        <div className="toolbar-card__actions">
          <input ref={fileRef} type="file" accept="application/json,.json,text/csv,.csv" hidden onChange={(event) => void importFile(event.target.files?.[0])} />
          <div className="lead-view-toggle" aria-label="Formato da lista"><button type="button" className={viewMode === 'table' ? 'is-active' : ''} onClick={() => setViewMode('table')} title="Tabela"><List size={17} /></button><button type="button" className={viewMode === 'cards' ? 'is-active' : ''} onClick={() => setViewMode('cards')} title="Cartões"><LayoutGrid size={17} /></button></div>
          <div className="lead-columns-wrap">
            <Button variant="secondary" onClick={() => setColumnsOpen((value) => !value)}><Columns3 size={17} /> Colunas</Button>
            {columnsOpen ? <div className="lead-columns-menu"><div><strong>Personalizar tabela</strong><button type="button" onClick={() => setColumnsOpen(false)}><X size={15} /></button></div>{(Object.keys(columnLabels) as LeadColumn[]).map((column) => <label key={column}><input type="checkbox" checked={visibleColumns.includes(column)} onChange={() => toggleColumn(column)} /><span>{columnLabels[column]}</span></label>)}<div className="lead-columns-menu__density"><span>Densidade</span><button type="button" className={density === 'comfortable' ? 'is-active' : ''} onClick={() => setDensity('comfortable')}>Confortável</button><button type="button" className={density === 'compact' ? 'is-active' : ''} onClick={() => setDensity('compact')}>Compacta</button></div><button type="button" className="lead-columns-menu__reset" onClick={() => { setVisibleColumns(defaultColumns); setDensity('comfortable') }}>Restaurar padrão</button></div> : null}
          </div>
          <div className="lead-secondary-actions">
            {canWrite ? <Button variant="secondary" loading={busy} onClick={() => fileRef.current?.click()}><Upload size={17} /> Importar</Button> : null}
            <Button variant="secondary" onClick={downloadCsv}><Download size={17} /> Exportar</Button>
          </div>
          {canWrite ? <Button onClick={() => setCreateOpen(true)}><Plus size={17} /> Novo lead</Button> : null}
        </div>
      </section>

      {filtersOpen ? <section className="panel advanced-filters leads-advanced-filters">
        <label className="field"><span>Etapa</span><select value={filters.stage} onChange={(event) => updateFilters({ stage: event.target.value })}><option value="all">Todas</option>{snapshot?.stages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="field"><span>Temperatura</span><select value={filters.temperature} onChange={(event) => updateFilters({ temperature: event.target.value })}><option value="all">Todas</option><option value="hot">Quente</option><option value="warm">Morno</option><option value="cold">Frio</option></select></label>
        <label className="field"><span>Prioridade</span><select value={filters.priority} onChange={(event) => updateFilters({ priority: event.target.value })}><option value="all">Todas</option><option value="urgent">Urgente</option><option value="high">Alta</option><option value="medium">Média</option><option value="low">Baixa</option></select></label>
        <label className="field"><span>Status</span><select value={filters.status} onChange={(event) => updateFilters({ status: event.target.value })}><option value="all">Todos</option><option value="active">Ativos</option><option value="won">Ganhos</option><option value="lost">Perdidos</option><option value="archived">Arquivados</option></select></label>
        <label className="field"><span>Responsável</span><select value={filters.owner} onChange={(event) => updateFilters({ owner: event.target.value })}><option value="all">Todos</option><option value="none">Sem responsável</option>{owners.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="field"><span>Origem</span><select value={filters.source} onChange={(event) => updateFilters({ source: event.target.value })}><option value="all">Todas</option>{sources.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="field"><span>Cidade</span><select value={filters.city} onChange={(event) => updateFilters({ city: event.target.value })}><option value="all">Todas</option>{cities.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="field"><span>Tag</span><select value={filters.tag} onChange={(event) => updateFilters({ tag: event.target.value })}><option value="all">Todas</option>{tags.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="field"><span>Próxima ação</span><select value={filters.due} onChange={(event) => updateFilters({ due: event.target.value as DueFilter })}><option value="all">Qualquer data</option><option value="overdue">Somente atrasados</option><option value="today">Hoje</option><option value="due">Atrasados ou hoje</option><option value="none">Sem próxima ação</option></select></label>
        <label className="field"><span>Recência</span><select value={filters.quality} onChange={(event) => updateFilters({ quality: event.target.value as QualityFilter })}><option value="all">Todos os cadastros</option><option value="stale">Sem interação há 7 dias</option><option value="new">Novos na semana</option></select></label>
        <label className="field"><span>Ordenar</span><select value={filters.sort} onChange={(event) => updateFilters({ sort: event.target.value })}><option value="updated-desc">Atualizados recentemente</option><option value="priority">Maior prioridade comercial</option><option value="created-desc">Mais novos</option><option value="name">Nome A–Z</option><option value="value-desc">Maior valor</option><option value="next-action">Próxima ação</option></select></label>
      </section> : null}

      {activeFilterChips.length ? <section className="lead-filter-chips"><span><SlidersHorizontal size={15} /> Filtros aplicados</span>{activeFilterChips.map((chip) => <button key={chip.key} type="button" onClick={chip.clear}>{chip.label}<X size={13} /></button>)}</section> : null}

      {selected.size ? <section className="bulk-bar leads-bulk-bar" aria-label="Ações em massa">
        <div><CheckSquare size={18} /><strong>{selected.size} selecionado(s)</strong><button type="button" onClick={() => setSelected(new Set())}>Limpar seleção</button></div>
        <div>
          <label className="compact-select"><span>Mover</span><select defaultValue="" disabled={busy} onChange={(event) => { if (event.target.value) void updateSelected({ stageId: event.target.value }); event.target.value = '' }}><option value="">Escolher etapa</option>{snapshot?.stages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="compact-select"><span>Prioridade</span><select defaultValue="" disabled={busy} onChange={(event) => { if (event.target.value) void updateSelected({ priority: event.target.value as LeadPriority }); event.target.value = '' }}><option value="">Alterar</option><option value="urgent">Urgente</option><option value="high">Alta</option><option value="medium">Média</option><option value="low">Baixa</option></select></label>
          <Button variant="secondary" disabled={busy} onClick={() => void addTagSelected()}><Tag size={16} /> Adicionar tag</Button>
          <Button variant="secondary" disabled={busy} onClick={() => void createFollowupsSelected()}><RefreshCw size={16} /> Follow-up amanhã</Button>
          <Button variant="secondary" disabled={busy} onClick={() => void updateSelected({ status: 'archived' as LeadStatus })}><Archive size={16} /> Arquivar</Button>
          <Button variant="danger" disabled={busy} onClick={() => void removeSelected()}><Trash2 size={16} /> Excluir</Button>
        </div>
      </section> : null}

      <section className="panel data-panel leads-data-panel">
        <div className="data-panel__header"><div><h3>Base de leads</h3><p>{leads.length} de {allLeads.length} registros • página {page} de {totalPages}</p></div><div className="leads-data-panel__summary"><span><Gauge size={14} /> {leads.filter((lead) => (scoreByLead.get(lead.id)?.score ?? 0) >= crmPreferences.commercial.leadScoring.thresholds.high).length} prioritários</span><span><Flame size={14} /> {leads.filter((lead) => lead.temperature === 'hot').length} quentes</span></div></div>
        {leads.length ? <>
          {(mobileView ? 'cards' : viewMode) === 'table' ? <div className="table-scroll leads-table-scroll">
            <table className="data-table leads-table">
              <thead><tr>{canWrite ? <th className="selection-cell"><input type="checkbox" checked={pageSelected} onChange={togglePage} aria-label="Selecionar página" /></th> : null}{visibleColumns.map((column) => <th key={column} className={`lead-column lead-column--${column}`}>{columnLabels[column]}</th>)}<th aria-label="Ações" /></tr></thead>
              <tbody>{pageLeads.map((lead) => {
                const leadStage = snapshot?.stages.find((item) => item.id === lead.stageId)
                const insight = scoreByLead.get(lead.id)!
                const lastAt = lastInteraction.get(lead.id) ?? lead.updatedAt
                return <tr key={lead.id} className={`${selected.has(lead.id) ? 'is-selected' : ''} ${isOverdue(lead.nextActionAt) ? 'is-overdue' : ''}`} onClick={() => setDrawerLeadId(lead.id)}>
                  {canWrite ? <td className="selection-cell" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selected.has(lead.id)} onChange={() => setSelected((current) => { const next = new Set(current); next.has(lead.id) ? next.delete(lead.id) : next.add(lead.id); return next })} aria-label={`Selecionar ${lead.name}`} /></td> : null}
                  {visibleColumns.includes('contact') ? <td className="lead-column lead-column--contact"><div className="lead-cell lead-cell--professional"><span className="lead-cell__avatar">{initials(lead.name)}</span><div><span className="lead-name-line"><strong>{lead.name}</strong></span><small>{lead.company || lead.city || 'Sem empresa informada'}</small><span className={`lead-priority-inline lead-priority-inline--${insight.level}`}>{insight.label}</span></div></div></td> : null}
                  {visibleColumns.includes('score') ? <td className="lead-column lead-column--score"><span className={`lead-score-badge lead-score-badge--${insight.level}`}><strong>{insight.score}</strong><small>/100</small></span><small>{insight.categories.map((item) => `${item.label} ${item.score}`).join(' · ')}</small></td> : null}
                  {visibleColumns.includes('stage') ? <td className="lead-column lead-column--stage"><span className="stage-chip" style={{ '--stage-color': leadStage?.color ?? '#64748b' } as CSSProperties}>{leadStage?.name ?? 'Sem etapa'}</span></td> : null}
                  {visibleColumns.includes('status') ? <td className="lead-column lead-column--status"><StatusPill tone={lead.status === 'won' ? 'success' : lead.status === 'lost' ? 'danger' : lead.status === 'archived' ? 'neutral' : 'info'}>{statusLabel[lead.status]}</StatusPill></td> : null}
                  {visibleColumns.includes('temperature') ? <td className="lead-column lead-column--temperature"><StatusPill tone={lead.temperature === 'hot' ? 'danger' : lead.temperature === 'warm' ? 'warning' : 'neutral'}>{temperatureLabel[lead.temperature]}</StatusPill><small>{priorityLabel[lead.priority]}</small></td> : null}
                  {visibleColumns.includes('owner') ? <td className="lead-column lead-column--owner"><strong className="table-primary">{lead.ownerName || 'Sem responsável'}</strong><small>{lead.city || 'Sem cidade'}</small></td> : null}
                  {visibleColumns.includes('nextAction') ? <td className="lead-column lead-column--nextAction"><strong className={isTodayOrOverdue(lead.nextActionAt) ? 'table-primary text-danger' : 'table-primary'}>{formatDateTime(lead.nextActionAt)}</strong><small>{lead.nextActionAt ? (isOverdue(lead.nextActionAt) ? 'Atrasada' : 'Programada') : 'Defina o próximo passo'}</small></td> : null}
                  {visibleColumns.includes('value') ? <td className="lead-column lead-column--value"><strong>{formatCurrency(lead.value)}</strong></td> : null}
                  {visibleColumns.includes('source') ? <td className="lead-column lead-column--source"><strong className="table-primary">{lead.source || 'Não informada'}</strong><small>{lead.tags.slice(0, 2).join(' · ') || 'Sem tags'}</small></td> : null}
                  {visibleColumns.includes('lastActivity') ? <td className="lead-column lead-column--lastActivity"><strong className="table-primary">{formatDateTime(lastAt)}</strong><small>{recentDays(lastAt, 7) ? 'Atividade recente' : 'Sem interação há 7+ dias'}</small></td> : null}
                  <td onClick={(event) => event.stopPropagation()}><div className="lead-row-actions">{canWrite ? <><button type="button" disabled={!lead.phone} onClick={() => setCallLead(lead)} aria-label={`Ligar para ${lead.name}`} title="Ligar"><PhoneCall size={16} /></button><button type="button" disabled={!lead.phone} onClick={() => openWhatsApp(lead)} aria-label={`WhatsApp de ${lead.name}`} title="WhatsApp"><MessageCircle size={16} /></button><button type="button" onClick={() => openActivity(lead)} aria-label={`Criar follow-up para ${lead.name}`} title="Criar follow-up"><CalendarClock size={16} /></button></> : null}<button type="button" onClick={() => setDrawerLeadId(lead.id)} aria-label={`Abrir ${lead.name}`} title="Abrir ficha"><MoreHorizontal size={18} /></button></div></td>
                </tr>
              })}</tbody>
            </table>
          </div> : <div className="lead-card-grid">{pageLeads.map((lead) => {
            const stageItem = snapshot?.stages.find((item) => item.id === lead.stageId)
            const insight = scoreByLead.get(lead.id)!
            return <article key={lead.id} className={`lead-base-card ${selected.has(lead.id) ? 'is-selected' : ''}`} onClick={() => setDrawerLeadId(lead.id)}>
              <div className="lead-base-card__top">{canWrite ? <input type="checkbox" checked={selected.has(lead.id)} onClick={(event) => event.stopPropagation()} onChange={() => setSelected((current) => { const next = new Set(current); next.has(lead.id) ? next.delete(lead.id) : next.add(lead.id); return next })} aria-label={`Selecionar ${lead.name}`} /> : null}<span className="lead-cell__avatar">{initials(lead.name)}</span><div><span><strong>{lead.name}</strong></span><small>{lead.company || lead.city || 'Sem empresa'}</small></div><button type="button" onClick={(event) => { event.stopPropagation(); setDrawerLeadId(lead.id) }} aria-label="Abrir ficha"><MoreHorizontal size={18} /></button></div>
              <div className="lead-base-card__status"><span className="stage-chip" style={{ '--stage-color': stageItem?.color ?? '#64748b' } as CSSProperties}>{stageItem?.name ?? 'Sem etapa'}</span><StatusPill tone={lead.temperature === 'hot' ? 'danger' : lead.temperature === 'warm' ? 'warning' : 'neutral'}>{temperatureLabel[lead.temperature]}</StatusPill><span className={`lead-priority-inline lead-priority-inline--${insight.level}`}>{insight.label}</span><span className={`lead-score-badge lead-score-badge--${insight.level}`}><strong>{insight.score}</strong><small>/100</small></span></div>
              <div className="lead-base-card__details"><div><small>Telefone</small><strong>{lead.phone || 'Não informado'}</strong></div><div><small>Responsável</small><strong>{lead.ownerName || 'Não atribuído'}</strong></div><div><small>Próxima ação</small><strong className={isTodayOrOverdue(lead.nextActionAt) ? 'text-danger' : ''}>{formatDateTime(lead.nextActionAt)}</strong></div><div><small>Valor</small><strong>{formatCurrency(lead.value)}</strong></div></div>
              {canWrite ? <div className="lead-base-card__actions"><Button size="sm" disabled={!lead.phone} onClick={(event) => { event.stopPropagation(); setCallLead(lead) }}><PhoneCall size={15} /> Ligar</Button><Button size="sm" variant="secondary" disabled={!lead.phone} onClick={(event) => { event.stopPropagation(); openWhatsApp(lead) }}>WhatsApp</Button><Button size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); openActivity(lead) }}>Follow-up</Button></div> : null}
            </article>
          })}</div>}
          <div className="pagination"><Button variant="ghost" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Anterior</Button><span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, leads.length)} de {leads.length}</span><Button variant="ghost" disabled={page === totalPages} onClick={() => setPage((value) => value + 1)}>Próxima</Button></div>
        </> : <EmptyState icon={UsersRound} title="Nenhum lead encontrado" description={hasFilters ? 'Nenhum registro corresponde à busca e aos filtros selecionados.' : 'Adicione manualmente ou importe sua base comercial.'} action={canWrite ? <Button onClick={() => setCreateOpen(true)}><Plus size={17} /> Novo lead</Button> : undefined} />}
      </section>

      <CreateLeadModal open={canWrite && createOpen} onClose={() => setCreateOpen(false)} />
      <EditLeadModal lead={editing} open={canWrite && Boolean(editing)} onClose={() => setEditing(null)} />
      <LeadDetailsDrawer readOnly={!canWrite} lead={drawerLead} duplicateMatches={duplicateMatches} onClose={() => setDrawerLeadId(null)} onEdit={(lead) => setEditing(lead)} onActivity={openActivity} onEvent={setEventLead} onCall={setCallLead} onOpenDuplicate={(lead) => setDrawerLeadId(lead.id)} />
      <ActivityModal open={canWrite && Boolean(activityLead)} initialLeadId={activityLead?.id} initialType={activityType} initialTitle={activityLead ? `${activityType === 'note' ? 'Nota' : activityType === 'meeting' ? 'Reunião' : activityType === 'call' ? 'Ligação' : 'Retomar contato'} — ${activityLead.name}` : ''} onClose={() => setActivityLead(null)} />
      <EventModal open={canWrite && Boolean(eventLead)} initialLeadId={eventLead?.id} onClose={() => setEventLead(null)} />
      <CallWorkspaceModal open={canWrite && Boolean(callLead)} initialLeadId={callLead?.id ?? ''} onClose={() => setCallLead(null)} />
    </div>
  )
}
