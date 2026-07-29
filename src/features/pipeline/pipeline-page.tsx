import {
  AlertTriangle, Archive, ArrowLeft, ArrowRight, BarChart3, Bookmark, CalendarDays, Check, CheckCircle2, ChevronDown,
  ChevronLeft, ChevronRight, ChevronUp, Clock3, Columns3, Filter, GripVertical, LayoutGrid, List, MessageCircle,
  MoreHorizontal, PhoneCall, Plus, RotateCcw, Save, Search, Settings2, SlidersHorizontal, Tag, Trash2, TrendingUp, UserRound, UsersRound, X, Layers3,
} from 'lucide-react'
import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import { formatCurrency, formatDateTime } from '../../domain/formatters'
import type { ActivityType, Lead, PipelineStage } from '../../domain/types'
import { ActivityModal } from '../followups/activity-modal'
import { CadenceModal } from '../followups/cadence-modal'
import { CreateLeadModal } from '../leads/create-lead-modal'
import { EditLeadModal } from '../leads/edit-lead-modal'
import { useAuth } from '../auth/auth-context'
import {
  DEFAULT_CARD_FIELDS, loadPipelinePreferences, savePipelinePreferences, type PipelineCardField,
  type PipelineFiltersState, type PipelineHealthFilter, type PipelinePreferences, type PipelineSavedView, type PipelineSort,
  type PipelineViewMode,
} from './pipeline-preferences'
import { PipelineSettingsModal } from './pipeline-settings-modal'
import { StageModal } from './stage-modal'
import { usePreferences } from '../settings/preferences-context'
import { buildPipelineSignal, effectiveStagePolicy, forecastMonthKey, recommendedStagePolicy, type PipelineSignal } from '../../services/pipeline-intelligence'
import { SalesMessageModal } from './sales-message-modal'
import { buildPipelineCallStatus } from '../../services/pipeline-call-status'

const INITIAL_CARDS = 30
const DEFAULT_FILTERS: PipelineFiltersState = { query: '', temperature: 'all', priority: 'all', source: 'all', due: 'all', owner: 'all', health: 'all' }
const priorityLabels: Record<string, string> = { urgent: 'Urgente', high: 'Alta', medium: 'Média', low: 'Baixa' }
const healthLabels = { healthy: 'Saudável', attention: 'Atenção', critical: 'Risco crítico', no_action: 'Sem próxima ação', proposal_stale: 'Proposta sem retorno' } as const
const viewLabels: Record<PipelineViewMode, string> = { board: 'Kanban', list: 'Lista', forecast: 'Previsão', calendar: 'Calendário', funnel: 'Funil' }

const isDue = (value: string | null) => value ? new Date(value).getTime() <= new Date().setHours(23, 59, 59, 999) : false
const localDateInput = (date: Date) => {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return adjusted.toISOString().slice(0, 16)
}
const formatDateOnly = (value: string | null | undefined) => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(value)) : 'Sem previsão'
const phoneDigits = (lead: Lead) => lead.phone.replace(/\D/g, '')

function SummaryCard({ label, value, detail, tone = 'default' }: { label: string; value: string | number; detail?: string; tone?: 'default' | 'warning' | 'danger' | 'success' }) {
  return <div className={`pipeline-summary-card pipeline-summary-card--${tone}`}><span>{label}</span><strong>{value}</strong>{detail ? <small>{detail}</small> : null}</div>
}

export function PipelinePage() {
  const { snapshot, canWrite, moveLead, bulkMoveLeads, bulkUpdateLeads, bulkAddLeadTag, createActivities, notify, confirmAction, promptAction } = useApp()
  const { preferences: crmPreferences } = usePreferences()
  const { user } = useAuth()
  const workspaceId = snapshot?.workspace.id ?? ''
  const [filters, setFilters] = useState<PipelineFiltersState>(DEFAULT_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [compact, setCompact] = useState(false)
  const [viewMode, setViewMode] = useState<PipelineViewMode>('board')
  const [sort, setSort] = useState<PipelineSort>('updated_desc')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [createStageId, setCreateStageId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Lead | null>(null)
  const [stageEditing, setStageEditing] = useState<PipelineStage | null | 'new'>(null)
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({})
  const [preferences, setPreferences] = useState<PipelinePreferences>({ cardFields: DEFAULT_CARD_FIELDS, collapsedStageIds: [], savedViews: [], stageConfigs: {} })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [activityLead, setActivityLead] = useState<Lead | null>(null)
  const [activityType, setActivityType] = useState<ActivityType>('followup')
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [bulkBusy, setBulkBusy] = useState(false)
  const [lossRequest, setLossRequest] = useState<{ leadName: string; resolve(value: string | null): void } | null>(null)
  const [lossReason, setLossReason] = useState('')
  const [scope, setScope] = useState<'mine' | 'team'>('team')
  const [listPage, setListPage] = useState(1)
  const [listPageSize, setListPageSize] = useState(20)
  const [cadenceLeadIds, setCadenceLeadIds] = useState<string[]>([])
  const [messageLead, setMessageLead] = useState<Lead | null>(null)

  useEffect(() => {
    if (!workspaceId) return
    setPreferences(loadPipelinePreferences(workspaceId))
    setSelectedIds([])
    setScope('team')
  }, [snapshot?.workspace.role, workspaceId])

  const persistPreferences = (updater: (current: PipelinePreferences) => PipelinePreferences) => {
    setPreferences((current) => {
      const next = updater(current)
      savePipelinePreferences(workspaceId, next)
      return next
    })
  }

  const canManageStages = snapshot?.workspace.role === 'owner' || snapshot?.workspace.role === 'admin'
  const canSeeTeam = true
  const sources = useMemo(() => [...new Set((snapshot?.leads ?? []).map((lead) => lead.source).filter(Boolean))].sort(), [snapshot?.leads])
  const owners = useMemo(() => [...new Set((snapshot?.leads ?? []).map((lead) => lead.ownerName).filter(Boolean))].sort(), [snapshot?.leads])

  const stagePolicies = useMemo(() => new Map((snapshot?.stages ?? []).map((stage, index) => [stage.id, effectiveStagePolicy(recommendedStagePolicy(stage, index, snapshot?.stages.length ?? 1), preferences.stageConfigs[stage.id], crmPreferences.commercial.pipelineStagePolicies[stage.id])])), [crmPreferences.commercial.pipelineStagePolicies, preferences.stageConfigs, snapshot?.stages])

  const opportunityByLead = useMemo(() => new Map((snapshot?.opportunities ?? []).map((opportunity) => [opportunity.leadId, opportunity])), [snapshot?.opportunities])
  const officialProposalByLead = useMemo(() => {
    const result = new Map<string, NonNullable<typeof snapshot>['proposals'][number]>()
    for (const proposal of snapshot?.proposals ?? []) {
      if (!proposal.isOfficial || !proposal.isCurrentVersion || ['rejected', 'cancelled', 'expired'].includes(proposal.status)) continue
      result.set(proposal.leadId, proposal)
    }
    return result
  }, [snapshot?.proposals])
  const commercialValue = (lead: Lead) => officialProposalByLead.get(lead.id)?.totalContractValue ?? opportunityByLead.get(lead.id)?.value ?? lead.value
  const commercialMrr = (lead: Lead) => officialProposalByLead.get(lead.id)?.recurringMonthlyTotal ?? 0
  const commercialProbability = (lead: Lead) => Math.min(100, Math.max(0, opportunityByLead.get(lead.id)?.probability ?? snapshot?.stages.find((stage) => stage.id === lead.stageId)?.probability ?? 0))
  const commercialCloseAt = (lead: Lead) => opportunityByLead.get(lead.id)?.expectedCloseAt ?? officialProposalByLead.get(lead.id)?.expectedCloseAt ?? lead.expectedCloseAt

  const signals = useMemo(() => {
    const result = new Map<string, PipelineSignal>()
    if (!snapshot) return result
    for (const lead of snapshot.leads) {
      const stage = snapshot.stages.find((item) => item.id === lead.stageId)
      const policy = stagePolicies.get(lead.stageId) ?? recommendedStagePolicy(stage)
      result.set(lead.id, buildPipelineSignal(lead, stage, snapshot, policy))
    }
    return result
  }, [snapshot, stagePolicies])

  const filtered = useMemo(() => {
    const normalized = filters.query.trim().toLowerCase()
    const items = (snapshot?.leads ?? []).filter((lead) => {
      const signal = signals.get(lead.id)
      const matchesSearch = !normalized || `${lead.name} ${lead.company} ${lead.city} ${lead.phone} ${lead.email} ${lead.tags.join(' ')}`.toLowerCase().includes(normalized)
      const isMine = Boolean(user && (lead.ownerId === user.id || lead.ownerName.trim().toLocaleLowerCase('pt-BR') === user.displayName.trim().toLocaleLowerCase('pt-BR')))
      return (scope === 'team' || isMine) && matchesSearch
        && (filters.temperature === 'all' || lead.temperature === filters.temperature)
        && (filters.priority === 'all' || lead.priority === filters.priority)
        && (filters.source === 'all' || lead.source === filters.source)
        && (filters.owner === 'all' || lead.ownerName === filters.owner)
        && (filters.due === 'all' || (filters.due === 'due' ? isDue(lead.nextActionAt) : !lead.nextActionAt))
        && (filters.health === 'all' || signal?.health === filters.health)
    })
    return [...items].sort((a, b) => {
      if (sort === 'value_desc') return commercialValue(b) - commercialValue(a)
      if (sort === 'close_date') return (commercialCloseAt(a) ? new Date(commercialCloseAt(a)!).getTime() : Number.MAX_SAFE_INTEGER) - (commercialCloseAt(b) ? new Date(commercialCloseAt(b)!).getTime() : Number.MAX_SAFE_INTEGER)
      if (sort === 'probability_desc') return commercialProbability(b) - commercialProbability(a)
      if (sort === 'name') return a.name.localeCompare(b.name, 'pt-BR')
      if (sort === 'next_action') return (a.nextActionAt ? new Date(a.nextActionAt).getTime() : Number.MAX_SAFE_INTEGER) - (b.nextActionAt ? new Date(b.nextActionAt).getTime() : Number.MAX_SAFE_INTEGER)
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
  }, [filters, scope, signals, snapshot?.leads, sort, user, officialProposalByLead, opportunityByLead, snapshot?.stages])

  const totals = useMemo(() => {
    const active = filtered.filter((lead) => lead.status === 'active')
    const won = filtered.filter((lead) => lead.status === 'won')
    const lost = filtered.filter((lead) => lead.status === 'lost')
    const attention = active.filter((lead) => signals.get(lead.id)?.health === 'attention').length
    const critical = active.filter((lead) => signals.get(lead.id)?.health === 'critical').length
    const noAction = active.filter((lead) => !lead.nextActionAt).length
    const proposalStale = active.filter((lead) => {
      const stage = snapshot?.stages.find((item) => item.id === lead.stageId)
      const signal = signals.get(lead.id)
      return Boolean(signal && /proposta|orçamento/i.test(stage?.name ?? '') && signal.stageAge > (stagePolicies.get(lead.stageId)?.maxDays ?? 3))
    }).length
    const forecastCoverage = active.length ? Math.round(active.filter((lead) => commercialCloseAt(lead)).length / active.length * 100) : 0
    const ticket = won.length ? won.reduce((sum, lead) => sum + commercialValue(lead), 0) / won.length : active.length ? active.reduce((sum, lead) => sum + commercialValue(lead), 0) / active.length : 0
    return {
      count: active.length,
      value: active.reduce((sum, lead) => sum + commercialValue(lead), 0),
      weighted: active.reduce((sum, lead) => sum + commercialValue(lead) * commercialProbability(lead) / 100, 0),
      attention, critical, noAction, proposalStale, forecastCoverage, ticket,
      conversion: won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : 0,
    }
  }, [filtered, signals, snapshot?.stages, stagePolicies, officialProposalByLead, opportunityByLead])

  const hasFilters = filters.query !== '' || Object.entries(filters).some(([key, value]) => key !== 'query' && value !== 'all')
  const resetFilters = () => setFilters(DEFAULT_FILTERS)
  const selectedLeads = useMemo(() => (snapshot?.leads ?? []).filter((lead) => selectedIds.includes(lead.id)), [selectedIds, snapshot?.leads])
  const listTotalPages = Math.max(1, Math.ceil(filtered.length / listPageSize))
  const listSafePage = Math.min(listPage, listTotalPages)
  const pagedFiltered = filtered.slice((listSafePage - 1) * listPageSize, listSafePage * listPageSize)
  useEffect(() => { setListPage(1) }, [filters, scope, sort, listPageSize])

  const validateMove = async (lead: Lead, target: PipelineStage): Promise<boolean> => {
    const config = stagePolicies.get(target.id) ?? recommendedStagePolicy(target)
    const currentIndex = snapshot?.stages.findIndex((stage) => stage.id === lead.stageId) ?? -1
    const targetIndex = snapshot?.stages.findIndex((stage) => stage.id === target.id) ?? -1
    if (config.requirePhone && !lead.phone.trim()) { notify('error', `Preencha o telefone de ${lead.name} antes de mover para ${target.name}.`); return false }
    if (config.requireValue && lead.value <= 0) { notify('error', `Informe o valor de ${lead.name} antes de mover para ${target.name}.`); return false }
    if ((config.requireNextAction || (crmPreferences.commercial.requireNextActionForActiveLeads && !target.isWon && !target.isLost)) && !lead.nextActionAt) { notify('error', `Defina a próxima ação de ${lead.name} antes de mover para ${target.name}.`); return false }
    if (config.preventSkipping && currentIndex >= 0 && targetIndex > currentIndex + 1) { notify('error', `A etapa ${target.name} não permite saltos. Avance uma etapa por vez.`); return false }
    if (config.confirmBackward && currentIndex >= 0 && targetIndex >= 0 && targetIndex < currentIndex && !await confirmAction({ title: `Retroceder ${lead.name}?`, description: `A oportunidade voltará para a etapa “${target.name}”.`, confirmLabel: 'Retroceder etapa', tone: 'warning' })) return false
    return true
  }

  const requestLossReason = (leadName: string) => new Promise<string | null>((resolve) => {
    setLossReason(crmPreferences.commercial.lossReasons[0] ?? '')
    setLossRequest({ leadName, resolve })
  })
  const closeLossReason = (value: string | null) => {
    lossRequest?.resolve(value)
    setLossRequest(null)
  }

  const guardedMove = async (lead: Lead, stageId: string) => {
    if (lead.stageId === stageId) return true
    const target = snapshot?.stages.find((stage) => stage.id === stageId)
    if (!target || !await validateMove(lead, target)) return false
    let lossReason: string | null = null
    if (target.isLost) {
      lossReason = await requestLossReason(lead.name)
      if (lossReason === null) return false
    }
    await moveLead(lead.id, stageId, lossReason)
    return true
  }

  const drop = async (event: DragEvent, stageId: string) => {
    event.preventDefault()
    const leadId = event.dataTransfer.getData('text/lead-id') || draggingId
    setDraggingId(null); setDropTargetId(null)
    const lead = snapshot?.leads.find((item) => item.id === leadId)
    if (!lead) return
    try { await guardedMove(lead, stageId) } catch (error) { notify('error', error instanceof Error ? error.message : 'Falha ao mover lead.') }
  }

  const toggleSelected = (leadId: string) => setSelectedIds((current) => current.includes(leadId) ? current.filter((id) => id !== leadId) : [...current, leadId])
  const toggleAllVisible = () => setSelectedIds((current) => filtered.every((lead) => current.includes(lead.id)) ? current.filter((id) => !filtered.some((lead) => lead.id === id)) : [...new Set([...current, ...filtered.map((lead) => lead.id)])])

  const runBulk = async (action: 'priority' | 'tag' | 'archive' | 'followup', value?: string) => {
    if (!selectedIds.length) return
    setBulkBusy(true)
    try {
      if (action === 'priority' && value) await bulkUpdateLeads(selectedIds, { priority: value as Lead['priority'] })
      if (action === 'tag') {
        const tag = (await promptAction({ title: 'Adicionar tag', description: `A tag será aplicada a ${selectedIds.length} oportunidade(s).`, label: 'Nome da tag', confirmLabel: 'Adicionar tag', placeholder: 'Ex.: Follow-up prioritário' }))?.trim()
        if (!tag) return
        await bulkAddLeadTag(selectedIds, tag)
      }
      if (action === 'archive') {
        if (!await confirmAction({ title: `Arquivar ${selectedIds.length} oportunidade(s)?`, description: 'Elas sairão do Pipeline ativo, mantendo o histórico comercial.', confirmLabel: 'Arquivar oportunidades', tone: 'warning' })) return
        const previous = selectedLeads.map((lead) => ({ id: lead.id, status: lead.status }))
        await bulkUpdateLeads(selectedIds, { status: 'archived' })
        notify('info', `${selectedIds.length} oportunidade(s) arquivada(s).`, { action: { label: 'Desfazer', run: async () => { for (const item of previous) await bulkUpdateLeads([item.id], { status: item.status }) } } })
      }
      if (action === 'followup') {
        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(9, 0, 0, 0)
        const raw = await promptAction({ title: 'Criar follow-up em massa', description: `Defina quando os ${selectedIds.length} follow-ups devem entrar na fila.`, label: 'Data e horário', initialValue: localDateInput(tomorrow), inputType: 'datetime-local', confirmLabel: 'Criar follow-ups' })
        if (!raw) return
        const date = new Date(raw)
        if (Number.isNaN(date.getTime())) { notify('error', 'Data inválida.'); return }
        await createActivities(selectedLeads.map((lead) => ({ leadId: lead.id, type: 'followup', title: 'Follow-up comercial', description: 'Criado em massa pelo Pipeline.', dueAt: date.toISOString(), completedAt: null, assignedTo: lead.ownerId })))
      }
      setSelectedIds([])
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível concluir a ação em massa.') }
    finally { setBulkBusy(false) }
  }

  const bulkMove = async (stageId: string) => {
    if (!stageId || !selectedLeads.length) return
    setBulkBusy(true)
    try {
      const target = snapshot?.stages.find((stage) => stage.id === stageId)
      if (!target) throw new Error('Etapa não encontrada.')
      for (const lead of selectedLeads) {
        if (lead.stageId !== stageId && !await validateMove(lead, target)) return
      }
      let lossReason: string | null = null
      if (target.isLost) {
        lossReason = await requestLossReason(`${selectedLeads.length} oportunidades`)
        if (lossReason === null) return
      }
      const movableIds = selectedLeads.filter((lead) => lead.stageId !== stageId).map((lead) => lead.id)
      if (!movableIds.length) return
      await bulkMoveLeads(movableIds, stageId, lossReason)
      setSelectedIds([])
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Falha na movimentação em massa.') }
    finally { setBulkBusy(false) }
  }

  const saveView = async () => {
    const name = (await promptAction({ title: 'Salvar visão do Pipeline', description: 'Dê um nome para reutilizar os filtros e o modo de visualização atuais.', label: 'Nome da visão', confirmLabel: 'Salvar visão', placeholder: 'Ex.: Propostas em risco' }))?.trim()
    if (!name) return
    const saved: PipelineSavedView = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, filters, viewMode, compact, sort }
    persistPreferences((current) => ({ ...current, savedViews: [...current.savedViews, saved] }))
    notify('success', 'Visualização salva.')
  }
  const applySavedView = (id: string) => {
    const saved = preferences.savedViews.find((item) => item.id === id)
    if (!saved) return
    setFilters(saved.filters); setViewMode(saved.viewMode); setCompact(saved.compact); setSort(saved.sort)
  }
  const deleteSavedView = (id: string) => persistPreferences((current) => ({ ...current, savedViews: current.savedViews.filter((item) => item.id !== id) }))
  const toggleStageCollapse = (stageId: string) => persistPreferences((current) => ({ ...current, collapsedStageIds: current.collapsedStageIds.includes(stageId) ? current.collapsedStageIds.filter((id) => id !== stageId) : [...current.collapsedStageIds, stageId] }))
  const openActivity = (lead: Lead, type: ActivityType) => { setActivityLead(lead); setActivityType(type) }

  const cardField = (field: PipelineCardField) => preferences.cardFields.includes(field)

  const renderCard = (lead: Lead) => {
    const signal = signals.get(lead.id)
    const selected = selectedIds.includes(lead.id)
    const callStatus = buildPipelineCallStatus(lead.id, snapshot?.calls ?? [], snapshot?.activities ?? [])
    const callStatusTitle = [
      callStatus.detail,
      callStatus.lastCallAt ? `Última ligação: ${formatDateTime(callStatus.lastCallAt)}` : '',
      callStatus.nextCallAt ? `Próxima ligação: ${formatDateTime(callStatus.nextCallAt)}` : '',
    ].filter(Boolean).join(' · ')
    return <article
      draggable={canWrite} className={`pipeline-card-v1008 ${draggingId === lead.id ? 'is-dragging' : ''} ${selected ? 'is-selected' : ''}`} key={lead.id}
      onDragStart={(event) => { if (!canWrite) { event.preventDefault(); return }; setDraggingId(lead.id); event.dataTransfer.setData('text/lead-id', lead.id); event.dataTransfer.effectAllowed = 'move' }}
      onDragEnd={() => { setDraggingId(null); setDropTargetId(null) }}
    >
      <div className="pipeline-card-v1008__top">
        {canWrite ? <button className={`pipeline-select ${selected ? 'is-selected' : ''}`} type="button" onClick={() => toggleSelected(lead.id)} aria-label={selected ? 'Desmarcar oportunidade' : 'Selecionar oportunidade'}>{selected ? <Check size={13} /> : null}</button> : null}
        <span className={`temperature-dot temperature-dot--${lead.temperature}`} />
        {cardField('source') ? <small>{lead.source || 'Sem origem'}</small> : <small />}
        <GripVertical size={15} />
      </div>
      <button type="button" className="pipeline-card-v1008__main" onClick={() => { if (canWrite) setEditing(lead) }}>
        <div className="pipeline-card-v1008__title"><h4>{lead.name}</h4>{cardField('priority') ? <span className={`pipeline-priority pipeline-priority--${lead.priority}`}>{priorityLabels[lead.priority]}</span> : null}</div>
        {cardField('company') && lead.company ? <p>{lead.company}</p> : null}
        {cardField('city') && lead.city ? <p className="pipeline-card-v1008__muted">{lead.city}</p> : null}
        {cardField('owner') ? <span className="pipeline-card-v1008__owner">Responsável: {lead.ownerName || 'Não atribuído'}</span> : null}
        <span className={`pipeline-call-status pipeline-call-status--${callStatus.tone}`} title={callStatusTitle}>
          <i aria-hidden="true" />
          <strong>{callStatus.label}</strong>
          {callStatus.nextCallAt ? <small>{formatDateTime(callStatus.nextCallAt)}</small> : null}
        </span>
        {cardField('health') && signal ? <span className={`pipeline-health pipeline-health--${signal.health}`} title={signal.healthReason}>{healthLabels[signal.health]}</span> : null}
        {cardField('tags') && lead.tags.length ? <div className="pipeline-card-v1008__tags">{lead.tags.slice(0, compact ? 1 : 3).map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
        <div className="pipeline-card-v1008__facts">
          {cardField('stageAge') && signal ? <span><Clock3 size={12} /> {signal.stageAge}d na etapa</span> : null}
          {cardField('attempts') && signal ? <span><PhoneCall size={12} /> {signal.attempts} tentativa(s)</span> : null}
          {cardField('lastInteraction') && signal ? <span>Último contato: {formatDateTime(signal.lastInteractionAt)}</span> : null}
        </div>
        {(cardField('value') || cardField('nextAction')) ? <div className="pipeline-card-v1008__meta">
          {cardField('value') ? <strong>{formatCurrency(commercialValue(lead))}</strong> : <span />}
          {cardField('nextAction') ? <span className={isDue(lead.nextActionAt) ? 'text-danger pipeline-card-v1008__due' : ''}>{isDue(lead.nextActionAt) ? 'Ação vencida · ' : ''}{formatDateTime(lead.nextActionAt)}</span> : null}
        </div> : null}
      </button>
      {canWrite ? <div className="pipeline-card-v1008__actions">
        <button type="button" disabled={!lead.phone} onClick={() => { if (lead.phone) window.location.href = `tel:${phoneDigits(lead)}` }} title="Ligar"><PhoneCall size={14} /></button>
        <button type="button" onClick={() => setMessageLead(lead)} title="Mensagem e roteiro por etapa"><MessageCircle size={14} /></button>
        <button type="button" onClick={() => openActivity(lead, 'followup')} title="Criar follow-up"><Clock3 size={14} /></button>
        <button type="button" onClick={() => setCadenceLeadIds([lead.id])} title="Iniciar cadência"><Layers3 size={14} /></button>
        <button type="button" onClick={() => setEditing(lead)} title="Abrir ficha"><ArrowRight size={14} /></button>
      </div> : null}
    </article>
  }

  const renderBoard = () => <section className="pipeline-board pipeline-board-v1008" aria-label="Pipeline de vendas">
    {snapshot?.stages.map((stage) => {
      const stageLeads = filtered.filter((lead) => lead.stageId === stage.id)
      const stageValue = stageLeads.reduce((sum, lead) => sum + commercialValue(lead), 0)
      const visible = visibleCounts[stage.id] ?? INITIAL_CARDS
      const visibleLeads = stageLeads.slice(0, visible)
      const collapsed = preferences.collapsedStageIds.includes(stage.id)
      const config = stagePolicies.get(stage.id) ?? recommendedStagePolicy(stage)
      return <article className={`pipeline-column pipeline-column-v1008 ${collapsed ? 'is-collapsed' : ''} ${stage.isWon ? 'pipeline-column--won' : ''} ${stage.isLost ? 'pipeline-column--lost' : ''} ${dropTargetId === stage.id ? 'is-drop-target' : ''}`} key={stage.id} onDragEnter={() => { if (canWrite) setDropTargetId(stage.id) }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTargetId(null) }} onDragOver={(event) => { if (canWrite) event.preventDefault() }} onDrop={(event) => { if (canWrite) void drop(event, stage.id) }}>
        <header className="pipeline-column-v1008__header">
          <div className="pipeline-column-v1008__identity"><span className="pipeline-column__dot" style={{ background: stage.color }} /><strong>{stage.name}</strong><span>{stageLeads.length}</span></div>
          <div className="pipeline-column-v1008__controls">
            <button className="icon-button" type="button" onClick={() => toggleStageCollapse(stage.id)} aria-label={collapsed ? `Expandir ${stage.name}` : `Recolher ${stage.name}`}>{collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}</button>
            {canManageStages ? <button className="icon-button" type="button" onClick={() => setStageEditing(stage)} aria-label={`Configurar ${stage.name}`}><MoreHorizontal size={17} /></button> : null}
          </div>
        </header>
        {collapsed ? <div className="pipeline-column-v1008__collapsed"><strong>{stageLeads.length}</strong><span>{formatCurrency(stageValue)}</span></div> : <>
          <div className="pipeline-column-v1008__value"><span>{formatCurrency(stageValue)}</span><small>{stage.probability}% prob. · limite {config.maxDays}d</small></div>
          {config.instructions ? <div className="pipeline-stage-instruction">{config.instructions}</div> : null}
          <div className="pipeline-column__cards">
            {visibleLeads.map(renderCard)}
            {!stageLeads.length ? <div className="pipeline-column__empty">Arraste uma oportunidade para esta etapa</div> : null}
            {visible < stageLeads.length ? <button type="button" className="pipeline-load-more" onClick={() => setVisibleCounts((current) => ({ ...current, [stage.id]: visible + INITIAL_CARDS }))}>Carregar mais {Math.min(INITIAL_CARDS, stageLeads.length - visible)}</button> : null}
          </div>
          {canWrite ? <button type="button" className="pipeline-column__add" onClick={() => setCreateStageId(stage.id)}><Plus size={16} /> Adicionar lead</button> : null}
        </>}
      </article>
    })}
  </section>

  const renderList = () => <section className="panel pipeline-list-view">
    <div className="pipeline-table-wrap"><table className="pipeline-table pipeline-table--commercial"><thead><tr>
      <th><button type="button" className={`pipeline-select ${pagedFiltered.length && pagedFiltered.every((lead) => selectedIds.includes(lead.id)) ? 'is-selected' : ''}`} onClick={() => setSelectedIds((current) => pagedFiltered.every((lead) => current.includes(lead.id)) ? current.filter((id) => !pagedFiltered.some((lead) => lead.id === id)) : [...new Set([...current, ...pagedFiltered.map((lead) => lead.id)])])}>{pagedFiltered.length && pagedFiltered.every((lead) => selectedIds.includes(lead.id)) ? <Check size={13} /> : null}</button></th>
      <th>Oportunidade</th><th>Etapa</th><th>Proposta oficial</th><th>Saúde</th><th>Responsável</th><th>Fechamento</th><th>Prob.</th><th>TCV</th><th>MRR</th><th>Ponderado</th><th>Próxima ação</th><th>Tempo</th><th />
    </tr></thead><tbody>{pagedFiltered.map((lead) => {
      const stage = snapshot?.stages.find((item) => item.id === lead.stageId)
      const signal = signals.get(lead.id)
      const proposal = officialProposalByLead.get(lead.id)
      const probability = commercialProbability(lead)
      const value = commercialValue(lead)
      return <tr key={lead.id} className={selectedIds.includes(lead.id) ? 'is-selected' : ''}>
        <td><button type="button" className={`pipeline-select ${selectedIds.includes(lead.id) ? 'is-selected' : ''}`} onClick={() => toggleSelected(lead.id)}>{selectedIds.includes(lead.id) ? <Check size={13} /> : null}</button></td>
        <td><button type="button" className="pipeline-table__lead" onClick={() => setEditing(lead)}><strong>{lead.name}</strong><small>{lead.company || lead.city || 'Sem empresa'}</small></button></td>
        <td><span className="pipeline-stage-chip"><i style={{ background: stage?.color }} />{stage?.name ?? 'Sem etapa'}</span></td>
        <td>{proposal ? <span className="pipeline-proposal-cell"><strong>{proposal.proposalNumber} · v{proposal.version}</strong><small>{proposal.status === 'accepted' ? 'Aceite registrado' : proposal.status === 'sent' ? 'Enviada' : proposal.status === 'viewed' ? 'Visualizada' : 'Em elaboração'}</small></span> : <span className="pipeline-table-muted">Sem proposta oficial</span>}</td>
        <td>{signal ? <span className={`pipeline-health pipeline-health--${signal.health}`}>{healthLabels[signal.health]}</span> : null}</td>
        <td>{lead.ownerName || 'Não atribuído'}</td>
        <td>{formatDateOnly(commercialCloseAt(lead))}</td>
        <td><strong>{probability}%</strong></td>
        <td><strong>{formatCurrency(value)}</strong></td>
        <td><strong>{formatCurrency(commercialMrr(lead))}</strong></td>
        <td><strong>{formatCurrency(value * probability / 100)}</strong></td>
        <td className={isDue(lead.nextActionAt) ? 'text-danger' : ''}>{formatDateTime(lead.nextActionAt)}</td><td>{signal?.stageAge ?? 0}d</td>
        <td><Button size="sm" variant="ghost" onClick={() => setEditing(lead)}>Abrir</Button></td>
      </tr>
    })}</tbody></table></div>
    {!filtered.length ? <div className="pipeline-empty-view"><Search size={26} /><strong>Nenhuma oportunidade encontrada</strong><span>Ajuste os filtros ou crie um novo lead.</span></div> : null}
    {filtered.length ? <footer className="pipeline-list-pagination"><span>{filtered.length} oportunidade(s)</span><label>Por página <select value={listPageSize} onChange={(event) => setListPageSize(Number(event.target.value))}><option value="10">10</option><option value="20">20</option><option value="50">50</option></select></label><Button size="sm" variant="secondary" disabled={listSafePage <= 1} onClick={() => setListPage((value) => Math.max(1, value - 1))}>Anterior</Button><strong>{listSafePage} / {listTotalPages}</strong><Button size="sm" variant="secondary" disabled={listSafePage >= listTotalPages} onClick={() => setListPage((value) => Math.min(listTotalPages, value + 1))}>Próxima</Button></footer> : null}
  </section>

  const forecastGroups = useMemo(() => {
    const groups = new Map<string, { label: string; leads: Lead[] }>()
    for (const lead of filtered.filter((item) => item.status === 'active')) {
      const closeAt = commercialCloseAt(lead)
      const key = closeAt?.slice(0, 7) ?? 'missing'
      const current = groups.get(key) ?? { label: forecastMonthKey(closeAt), leads: [] }
      groups.set(key, { ...current, leads: [...current.leads, lead] })
    }
    return [...groups.entries()].sort(([a], [b]) => a === 'missing' ? 1 : b === 'missing' ? -1 : a.localeCompare(b))
  }, [filtered, officialProposalByLead, opportunityByLead])

  const renderForecast = () => <section className="pipeline-forecast-view">
    {forecastGroups.map(([key, group]) => {
      const { label, leads } = group
      const total = leads.reduce((sum, lead) => sum + commercialValue(lead), 0)
      const weighted = leads.reduce((sum, lead) => sum + commercialValue(lead) * commercialProbability(lead) / 100, 0)
      return <article className="panel pipeline-forecast-group" key={key}><header><div><span>Fechamento esperado</span><h3>{label}</h3></div><div><small>Valor aberto</small><strong>{formatCurrency(total)}</strong></div><div><small>Previsão ponderada</small><strong>{formatCurrency(weighted)}</strong></div><span className="pipeline-forecast-count">{leads.length}</span></header><div className="pipeline-forecast-items">{leads.map((lead) => {
        const stage = snapshot?.stages.find((item) => item.id === lead.stageId)
        const signal = signals.get(lead.id)
        return <button type="button" key={lead.id} onClick={() => setEditing(lead)}><span className="pipeline-stage-chip"><i style={{ background: stage?.color }} />{stage?.name}</span><span><strong>{lead.name}</strong><small>{lead.company || lead.ownerName}</small></span>{signal ? <span className={`pipeline-health pipeline-health--${signal.health}`}>{healthLabels[signal.health]}</span> : null}<strong>{formatCurrency(commercialValue(lead))}</strong><small>{commercialProbability(lead)}% · {formatDateOnly(commercialCloseAt(lead))}</small></button>
      })}</div></article>
    })}
    {!forecastGroups.length ? <div className="panel pipeline-empty-view"><TrendingUp size={28} /><strong>Sem oportunidades para previsão</strong><span>Defina a previsão de fechamento nos negócios ativos.</span></div> : null}
  </section>

  const calendarCells = useMemo(() => {
    const year = calendarMonth.getFullYear(); const month = calendarMonth.getMonth()
    const firstWeekday = new Date(year, month, 1).getDay()
    const days = new Date(year, month + 1, 0).getDate()
    const cells: Array<Date | null> = Array.from({ length: firstWeekday }, () => null)
    for (let day = 1; day <= days; day += 1) cells.push(new Date(year, month, day))
    while (cells.length % 7) cells.push(null)
    return cells
  }, [calendarMonth])

  const renderCalendar = () => <section className="panel pipeline-calendar-view">
    <header className="pipeline-calendar-header"><div><span>Próximas ações do Pipeline</span><h3>{new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(calendarMonth)}</h3></div><div><Button size="sm" variant="ghost" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}><ChevronLeft size={16} /></Button><Button size="sm" variant="secondary" onClick={() => setCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Hoje</Button><Button size="sm" variant="ghost" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}><ChevronRight size={16} /></Button></div></header>
    <div className="pipeline-calendar-weekdays">{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="pipeline-calendar-grid">{calendarCells.map((date, index) => {
      if (!date) return <div className="is-empty" key={`empty-${index}`} />
      const items = filtered.filter((lead) => lead.nextActionAt && new Date(lead.nextActionAt).toDateString() === date.toDateString())
      const today = date.toDateString() === new Date().toDateString()
      return <div className={today ? 'is-today' : ''} key={date.toISOString()}><span className="pipeline-calendar-day">{date.getDate()}</span>{items.slice(0, 4).map((lead) => <button type="button" key={lead.id} onClick={() => setEditing(lead)}><i className={`temperature-dot temperature-dot--${lead.temperature}`} /><span>{lead.name}</span><small>{new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(lead.nextActionAt!))}</small></button>)}{items.length > 4 ? <small className="pipeline-calendar-more">+{items.length - 4} ações</small> : null}</div>
    })}</div>
  </section>

  const renderFunnel = () => {
    const stages = snapshot?.stages ?? []
    const maxCount = Math.max(1, ...stages.map((stage) => filtered.filter((lead) => lead.stageId === stage.id).length))
    return <section className="panel pipeline-funnel-view"><header><div><span>Conversão por etapa</span><h3>Funil comercial</h3></div><strong>{totals.conversion}%<small> conversão final</small></strong></header><div className="pipeline-funnel-list">{stages.map((stage, index) => {
      const leads = filtered.filter((lead) => lead.stageId === stage.id)
      const previousCount = index ? filtered.filter((lead) => lead.stageId === stages[index - 1]?.id).length : leads.length
      const conversion = previousCount ? Math.min(100, Math.round((leads.length / previousCount) * 100)) : 0
      const value = leads.reduce((sum, lead) => sum + commercialValue(lead), 0)
      return <article key={stage.id}><div className="pipeline-funnel-label"><span><i style={{ background: stage.color }} /><strong>{stage.name}</strong></span><small>{leads.length} oportunidades · {formatCurrency(value)}</small></div><div className="pipeline-funnel-bar"><span style={{ width: `${Math.max(8, (leads.length / maxCount) * 100)}%`, background: stage.color }} /></div><div className="pipeline-funnel-metrics"><strong>{leads.length ? Math.round(leads.reduce((sum, lead) => sum + commercialProbability(lead), 0) / leads.length) : stage.probability}% prob. média</strong>{index ? <span>{conversion}% da etapa anterior</span> : <span>Entrada do funil</span>}</div></article>
    })}</div></section>
  }

  return <div className={`page-stack pipeline-page pipeline-page-v1008 ${compact ? 'pipeline-page--compact' : ''}`}>
    <section className="pipeline-summary-v1008">
      <SummaryCard label="Oportunidades ativas" value={totals.count} detail="Negócios em andamento" />
      <SummaryCard label="Valor do Pipeline" value={formatCurrency(totals.value)} detail="Total aberto" />
      <SummaryCard label="Previsão ponderada" value={formatCurrency(totals.weighted)} detail={`${totals.forecastCoverage}% com fechamento previsto`} />
      <SummaryCard label="Sem próxima ação" value={totals.noAction} detail="Precisam de planejamento" tone={totals.noAction ? 'warning' : 'success'} />
      <SummaryCard label="Propostas sem retorno" value={totals.proposalStale} detail="Acima do prazo da etapa" tone={totals.proposalStale ? 'danger' : 'success'} />
      <SummaryCard label="Conversão / ticket" value={`${totals.conversion}%`} detail={`Ticket ${formatCurrency(totals.ticket)}`} tone="success" />
    </section>

    {totals.noAction || totals.proposalStale || totals.critical || totals.attention ? <section className="pipeline-action-center" aria-label="Prioridades comerciais">
      <div><AlertTriangle size={18} /><span><strong>Fila de atenção</strong><small>Abra o recorte e resolva os negócios que mais precisam de ação.</small></span></div>
      <div>
        {totals.noAction ? <button type="button" onClick={() => setFilters((current) => ({ ...current, health: 'no_action' }))}>{totals.noAction} sem próxima ação</button> : null}
        {totals.proposalStale ? <button type="button" onClick={() => setFilters((current) => ({ ...current, health: 'proposal_stale' }))}>{totals.proposalStale} proposta(s) sem retorno</button> : null}
        {totals.critical ? <button type="button" onClick={() => setFilters((current) => ({ ...current, health: 'critical' }))}>{totals.critical} em risco crítico</button> : null}
        {totals.attention ? <button type="button" onClick={() => setFilters((current) => ({ ...current, health: 'attention' }))}>{totals.attention} pedem atenção</button> : null}
      </div>
    </section> : null}

    <section className="toolbar-card toolbar-card--wrap pipeline-toolbar-v1008">
      <div className="toolbar-card__filters">
        <label className="search-field"><Search size={18} /><input value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} placeholder="Buscar no Pipeline" /></label>
        <Button variant={filtersOpen || hasFilters ? 'secondary' : 'ghost'} onClick={() => setFiltersOpen((value) => !value)}><SlidersHorizontal size={17} /> Filtros {hasFilters ? 'ativos' : ''}</Button>
        {hasFilters ? <Button variant="ghost" onClick={resetFilters}><X size={16} /> Limpar</Button> : null}
        <select className="pipeline-saved-select" defaultValue="" onChange={(event) => { applySavedView(event.target.value); event.currentTarget.value = '' }}><option value="">Visualizações salvas</option>{preferences.savedViews.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
      </div>
      <div className="toolbar-card__actions">
        <Button variant="ghost" onClick={() => void saveView()}><Bookmark size={16} /> Salvar visão</Button>
        <Button variant="secondary" onClick={() => setSettingsOpen(true)}><Settings2 size={17} /> Cards</Button>
        <Button variant="secondary" onClick={() => setCompact((value) => !value)}><Columns3 size={17} /> {compact ? 'Confortável' : 'Compacto'}</Button>
        {canManageStages && canWrite ? <Button variant="secondary" onClick={() => setStageEditing('new')}><Plus size={17} /> Nova etapa</Button> : null}
        {canWrite ? <Button onClick={() => setCreateStageId(snapshot?.stages[0]?.id ?? '')}><Plus size={17} /> Novo lead</Button> : null}
      </div>
    </section>

    <section className="pipeline-view-switcher">
      {([['board', LayoutGrid], ['list', List], ['forecast', TrendingUp], ['calendar', CalendarDays], ['funnel', BarChart3]] as const).map(([mode, Icon]) => <button type="button" key={mode} className={viewMode === mode ? 'is-active' : ''} onClick={() => setViewMode(mode)}><Icon size={16} />{viewLabels[mode]}</button>)}
      <span className="pipeline-view-switcher__spacer" />
      <div className="pipeline-scope-switcher"><button type="button" className={scope === 'mine' ? 'is-active' : ''} onClick={() => setScope('mine')}><UserRound size={15} /> Meus negócios</button>{canSeeTeam ? <button type="button" className={scope === 'team' ? 'is-active' : ''} onClick={() => setScope('team')}><UsersRound size={15} /> Todos os negócios</button> : null}</div>
      <label>Ordenar<select value={sort} onChange={(event) => setSort(event.target.value as PipelineSort)}><option value="updated_desc">Atualização recente</option><option value="next_action">Próxima ação</option><option value="value_desc">Maior TCV</option><option value="probability_desc">Maior probabilidade</option><option value="close_date">Fechamento mais próximo</option><option value="name">Nome</option></select></label>
    </section>

    {filtersOpen ? <section className="panel advanced-filters advanced-filters--pipeline advanced-filters-v1008">
      <label className="field"><span>Temperatura</span><select value={filters.temperature} onChange={(event) => setFilters((current) => ({ ...current, temperature: event.target.value }))}><option value="all">Todas</option><option value="hot">Quente</option><option value="warm">Morno</option><option value="cold">Frio</option></select></label>
      <label className="field"><span>Prioridade</span><select value={filters.priority} onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value }))}><option value="all">Todas</option><option value="urgent">Urgente</option><option value="high">Alta</option><option value="medium">Média</option><option value="low">Baixa</option></select></label>
      <label className="field"><span>Origem</span><select value={filters.source} onChange={(event) => setFilters((current) => ({ ...current, source: event.target.value }))}><option value="all">Todas</option>{sources.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="field"><span>Responsável</span><select value={filters.owner} onChange={(event) => setFilters((current) => ({ ...current, owner: event.target.value }))}><option value="all">Todos</option>{owners.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="field"><span>Próxima ação</span><select value={filters.due} onChange={(event) => setFilters((current) => ({ ...current, due: event.target.value }))}><option value="all">Qualquer data</option><option value="due">Vencida ou hoje</option><option value="none">Sem próxima ação</option></select></label>
      <label className="field"><span>Saúde comercial</span><select value={filters.health} onChange={(event) => setFilters((current) => ({ ...current, health: event.target.value as PipelineHealthFilter }))}><option value="all">Todas</option><option value="healthy">Saudável</option><option value="attention">Atenção</option><option value="critical">Risco crítico</option><option value="no_action">Sem próxima ação</option><option value="proposal_stale">Proposta sem retorno</option></select></label>
    </section> : null}

    {preferences.savedViews.length ? <section className="pipeline-saved-strip"><span>Visões salvas</span>{preferences.savedViews.map((item) => <div key={item.id}><button type="button" onClick={() => applySavedView(item.id)}><Bookmark size={13} />{item.name}</button><button type="button" onClick={() => deleteSavedView(item.id)} aria-label={`Excluir ${item.name}`}><X size={13} /></button></div>)}</section> : null}

    {canWrite && selectedIds.length ? <section className="pipeline-bulk-bar"><div><CheckCircle2 size={18} /><strong>{selectedIds.length} selecionada(s)</strong><button type="button" onClick={() => setSelectedIds([])}>Limpar seleção</button></div><div>
      <select disabled={bulkBusy} defaultValue="" onChange={(event) => { void bulkMove(event.target.value); event.currentTarget.value = '' }}><option value="">Mover para etapa...</option>{snapshot?.stages.map((stage) => <option value={stage.id} key={stage.id}>{stage.name}</option>)}</select>
      <select disabled={bulkBusy} defaultValue="" onChange={(event) => { void runBulk('priority', event.target.value); event.currentTarget.value = '' }}><option value="">Alterar prioridade...</option><option value="urgent">Urgente</option><option value="high">Alta</option><option value="medium">Média</option><option value="low">Baixa</option></select>
      <Button size="sm" variant="secondary" disabled={bulkBusy} onClick={() => void runBulk('tag')}><Tag size={15} /> Adicionar tag</Button>
      <Button size="sm" variant="secondary" disabled={bulkBusy} onClick={() => void runBulk('followup')}><Clock3 size={15} /> Criar follow-up</Button>
      <Button size="sm" variant="secondary" disabled={bulkBusy} onClick={() => setCadenceLeadIds([...selectedIds])}><Layers3 size={15} /> Iniciar cadência</Button>
      <Button size="sm" variant="danger" disabled={bulkBusy} onClick={() => void runBulk('archive')}><Archive size={15} /> Arquivar</Button>
    </div></section> : null}

    {viewMode === 'board' ? renderBoard() : null}
    {viewMode === 'list' ? renderList() : null}
    {viewMode === 'forecast' ? renderForecast() : null}
    {viewMode === 'calendar' ? renderCalendar() : null}
    {viewMode === 'funnel' ? renderFunnel() : null}

    <CreateLeadModal open={canWrite && createStageId !== null} initialStageId={createStageId ?? undefined} onClose={() => setCreateStageId(null)} />
    <EditLeadModal lead={editing} open={canWrite && Boolean(editing)} onClose={() => setEditing(null)} />
    <ActivityModal open={canWrite && Boolean(activityLead)} initialLeadId={activityLead?.id} initialType={activityType} initialTitle={activityType === 'meeting' ? 'Reunião comercial' : 'Follow-up comercial'} onClose={() => setActivityLead(null)} />
    <CadenceModal open={canWrite && cadenceLeadIds.length > 0} initialLeadIds={cadenceLeadIds} onClose={() => setCadenceLeadIds([])} />
    <SalesMessageModal lead={messageLead} stageName={snapshot?.stages.find((stage) => stage.id === messageLead?.stageId)?.name ?? 'Pipeline'} open={Boolean(messageLead)} onClose={() => setMessageLead(null)} />
    <PipelineSettingsModal open={settingsOpen} value={preferences.cardFields} onClose={() => setSettingsOpen(false)} onSave={(cardFields) => persistPreferences((current) => ({ ...current, cardFields }))} />
    <StageModal open={canWrite && stageEditing !== null} stage={stageEditing === 'new' ? null : stageEditing} leadCount={stageEditing && stageEditing !== 'new' ? (snapshot?.leads.filter((lead) => lead.stageId === stageEditing.id).length ?? 0) : 0} workspaceId={workspaceId} stageIndex={stageEditing && stageEditing !== 'new' ? (snapshot?.stages.findIndex((stage) => stage.id === stageEditing.id) ?? 0) : (snapshot?.stages.length ?? 0)} stageTotal={snapshot?.stages.length ?? 1} onClose={() => { setStageEditing(null); setPreferences(loadPipelinePreferences(workspaceId)) }} />
    <Modal open={Boolean(lossRequest)} title="Registrar motivo da perda" subtitle={lossRequest ? `${lossRequest.leadName} será movido para uma etapa perdida.` : undefined} size="sm" onClose={() => closeLossReason(null)} footer={<><Button variant="secondary" onClick={() => closeLossReason(null)}>Cancelar</Button><Button disabled={!lossReason.trim()} onClick={() => closeLossReason(lossReason.trim())}><Check size={16} /> Confirmar perda</Button></>}>
      <label className="field"><span>Motivo *</span><input autoFocus list="crm-loss-reasons" value={lossReason} onChange={(event) => setLossReason(event.target.value)} placeholder="Selecione ou descreva o motivo" /><datalist id="crm-loss-reasons">{crmPreferences.commercial.lossReasons.map((reason) => <option value={reason} key={reason} />)}</datalist><small>Este registro alimenta o relatório de perdas e os playbooks comerciais.</small></label>
    </Modal>
  </div>
}
