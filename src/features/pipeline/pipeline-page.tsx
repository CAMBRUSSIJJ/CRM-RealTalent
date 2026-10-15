import {
  AlertTriangle, Archive, ArrowRight, BarChart3, Bookmark, CalendarDays, Check, CheckCircle2, ChevronDown,
  ChevronLeft, ChevronRight, ChevronUp, Clock3, Columns3, FileText, GripVertical, LayoutGrid, List, Mail, MessageCircle,
  MoreHorizontal, PhoneCall, Plus, Search, Sparkles, Tag, TrendingUp, UserRound, UsersRound, Layers3,
} from 'lucide-react'
import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { useAppActions, useAppNavigation, useAppUi, useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { SelectionSelect, SelectionToolbar } from '../../components/selection'
import { Modal } from '../../components/ui/modal'
import { WorkspaceDisplayMenu, WorkspaceFilterMenu, WorkspaceSortMenu, WorkspaceViewStrip as FilterWorkspaceViewStrip, type WorkspaceFilterField } from '../../components/workspace/workspace-filter-system'
import { WorkspaceCommandBar, WorkspacePageHeader, WorkspaceSummaryMetric, WorkspaceSummaryStrip } from '../../components/workspace/workspace-shell'
import { formatCurrency, formatDateTime } from '../../domain/formatters'
import type { ActivityType, Lead, PipelineStage } from '../../domain/types'
import { ActivityModal } from '../followups/activity-modal'
import { CadenceModal } from '../followups/cadence-modal'
import { CreateLeadModal } from '../leads/create-lead-modal'
import { EditLeadModal } from '../leads/edit-lead-modal'
import { LeadDetailsDrawer } from '../leads/lead-details-drawer'
import { useAuth } from '../auth/auth-context'
import {
  DEFAULT_CARD_FIELDS, loadPipelinePreferences, savePipelinePreferences,
  type PipelineFiltersState, type PipelineHealthFilter, type PipelinePreferences, type PipelineSavedView, type PipelineScope, type PipelineSort,
  type PipelineViewMode,
} from './pipeline-preferences'
import { StageModal } from './stage-modal'
import { usePreferences } from '../settings/preferences-context'
import { buildPipelineSignal, effectiveStagePolicy, forecastMonthKey, recommendedStagePolicy, type PipelineSignal } from '../../services/pipeline-intelligence'
import { SalesMessageModal } from './sales-message-modal'
import { LazyCallWorkspaceModal } from '../calls/lazy-call-workspace-modal'
import { buildQuickCallSessionConfig } from '../calls/call-session-config'
import { buildPipelineCallStatus } from '../../services/pipeline-call-status'
import { contactBlockedMessage } from '../../services/contact-policy'
import { resolveLeadCallTarget } from '../../services/call-workspace'
import { buildDealPortfolio, type DealIntelligence } from '../../services/deal-intelligence'
import { calculateRevenueIntelligence } from '../../services/revenue-intelligence'
import { DealPortfolioPanel } from '../deal-intelligence/deal-portfolio-panel'
import { DealInspectorModal } from '../deal-intelligence/deal-inspector-modal'

const INITIAL_CARDS = 30
const DEFAULT_FILTERS: PipelineFiltersState = { query: '', stage: 'all', temperature: 'all', priority: 'all', source: 'all', due: 'all', owner: 'all', health: 'all' }
const priorityLabels: Record<string, string> = { urgent: 'Urgente', high: 'Alta', medium: 'Média', low: 'Baixa' }
const healthLabels = { healthy: 'Saudável', attention: 'Atenção', critical: 'Risco crítico', no_action: 'Sem próxima ação', proposal_stale: 'Proposta sem retorno' } as const
const viewLabels: Record<PipelineViewMode, string> = { board: 'Kanban', list: 'Lista', forecast: 'Previsão', calendar: 'Calendário', funnel: 'Funil' }
const isDue = (value: string | null) => value ? new Date(value).getTime() <= new Date().setHours(23, 59, 59, 999) : false
const localDateInput = (date: Date) => {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return adjusted.toISOString().slice(0, 16)
}
const formatDateOnly = (value: string | null | undefined) => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(value)) : 'Sem previsão'

export function PipelinePage() {
  const { snapshot: rawSnapshot, can, canTeamAccess, canTeamAccessRecord } = useAppWorkspace()
  const { setRoute, navigate, routeContext, clearRouteContext } = useAppNavigation()
  const { notify, confirmAction, promptAction } = useAppUi()
  const { moveLead, bulkMoveLeads, bulkUpdateLeads, bulkAddLeadTag, createActivities, completeActivity } = useAppActions()
  const { preferences: crmPreferences } = usePreferences()
  const { user } = useAuth()
  const canPipelineView = canTeamAccess('view', 'pipeline')
  const canPipelineCreate = canTeamAccess('create', 'pipeline')
  const canPipelineEdit = canTeamAccess('edit', 'pipeline')
  const canPipelineDelete = canTeamAccess('delete', 'pipeline')
  const canCommunicate = canTeamAccess('view', 'communications')
  const snapshot = useMemo(() => {
    if (!rawSnapshot) return null
    if (!canPipelineView) return { ...rawSnapshot, leads: [], opportunities: [], proposals: [], activities: [], calls: [], events: [] }
    const leads = rawSnapshot.leads.filter((lead) => canTeamAccessRecord('pipeline', lead.ownerId))
    const leadIds = new Set(leads.map((lead) => lead.id))
    return {
      ...rawSnapshot,
      leads,
      opportunities: rawSnapshot.opportunities.filter((item) => leadIds.has(item.leadId)),
      proposals: rawSnapshot.proposals.filter((item) => leadIds.has(item.leadId)),
      activities: rawSnapshot.activities.filter((item) => !item.leadId || leadIds.has(item.leadId)),
      calls: rawSnapshot.calls.filter((item) => leadIds.has(item.leadId)),
      events: rawSnapshot.events.filter((item) => !item.leadId || leadIds.has(item.leadId)),
    }
  }, [canPipelineView, canTeamAccessRecord, rawSnapshot])
  const workspaceId = snapshot?.workspace.id ?? rawSnapshot?.workspace.id ?? ''
  const [filters, setFilters] = useState<PipelineFiltersState>(DEFAULT_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [compact, setCompact] = useState(false)
  const [viewMode, setViewMode] = useState<PipelineViewMode>('board')
  const [sort, setSort] = useState<PipelineSort>('updated_desc')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [createStageId, setCreateStageId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Lead | null>(null)
  const [viewing, setViewing] = useState<Lead | null>(null)
  const [stageEditing, setStageEditing] = useState<PipelineStage | null | 'new'>(null)
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({})
  const [preferences, setPreferences] = useState<PipelinePreferences>({ cardFields: DEFAULT_CARD_FIELDS, collapsedStageIds: [], savedViews: [], stageConfigs: {}, intelligenceCollapsed: false, lastViewMode: 'board', compact: false, savedViewsInitialized: false })
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [activityLead, setActivityLead] = useState<Lead | null>(null)
  const [activityType, setActivityType] = useState<ActivityType>('followup')
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [bulkBusy, setBulkBusy] = useState(false)
  const [lossRequest, setLossRequest] = useState<{ leadName: string; resolve(value: string | null): void } | null>(null)
  const [lossReason, setLossReason] = useState('')
  const [scope, setScope] = useState<PipelineScope>('team')
  const [listPage, setListPage] = useState(1)
  const [listPageSize, setListPageSize] = useState(20)
  const [cadenceLeadIds, setCadenceLeadIds] = useState<string[]>([])
  const [messageLead, setMessageLead] = useState<Lead | null>(null)
  const [callLead, setCallLead] = useState<Lead | null>(null)
  const [inspectingLeadId, setInspectingLeadId] = useState<string | null>(null)
  const [activeSavedViewId, setActiveSavedViewId] = useState<string | null>(null)
  const [quickSlice, setQuickSlice] = useState<'all' | 'risk' | 'no_action' | 'overdue'>('all')

  useEffect(() => {
    if (!workspaceId) return
    const loaded = loadPipelinePreferences(workspaceId)
    setPreferences(loaded)
    setViewMode(loaded.lastViewMode)
    setCompact(loaded.compact)
    setSelectedIds([])
    setScope('team')
    setActiveSavedViewId(null)
    setQuickSlice('all')
  }, [snapshot?.workspace.role, workspaceId])

  const persistPreferences = (updater: (current: PipelinePreferences) => PipelinePreferences) => {
    setPreferences((current) => {
      const next = updater(current)
      savePipelinePreferences(workspaceId, next)
      return next
    })
  }

  const selectViewMode = (mode: PipelineViewMode, preserveSavedView = false) => {
    setViewMode(mode)
    if (!preserveSavedView) setActiveSavedViewId(null)
    persistPreferences((current) => ({ ...current, lastViewMode: mode }))
  }
  const toggleDensity = () => {
    const next = !compact
    setCompact(next)
    persistPreferences((current) => ({ ...current, compact: next }))
  }

  const canManageStages = can('manage', 'opportunity')
  const canSeeTeam = true
  const sources = useMemo(() => [...new Set((snapshot?.leads ?? []).map((lead) => lead.source).filter(Boolean))].sort(), [snapshot?.leads])
  const owners = useMemo(() => [...new Set((snapshot?.leads ?? []).map((lead) => lead.ownerName).filter(Boolean))].sort(), [snapshot?.leads])

  const universalPipelineFilters = useMemo<WorkspaceFilterField[]>(() => [
    { key: 'stage', label: 'Etapa', value: filters.stage, allLabel: 'Todas', group: 'Negócio', options: (snapshot?.stages ?? []).map((stage) => ({ value: stage.id, label: stage.name })) },
    { key: 'owner', label: 'Responsável', value: filters.owner, allLabel: 'Todos', group: 'Negócio', options: owners.map((item) => ({ value: item, label: item })) },
    { key: 'source', label: 'Origem', value: filters.source, allLabel: 'Todas', group: 'Negócio', options: sources.map((item) => ({ value: item, label: item })) },
    { key: 'temperature', label: 'Temperatura', value: filters.temperature, allLabel: 'Todas', group: 'Qualificação', options: [{ value: 'hot', label: 'Quente' }, { value: 'warm', label: 'Morno' }, { value: 'cold', label: 'Frio' }] },
    { key: 'priority', label: 'Prioridade', value: filters.priority, allLabel: 'Todas', group: 'Qualificação', options: [{ value: 'urgent', label: 'Urgente' }, { value: 'high', label: 'Alta' }, { value: 'medium', label: 'Média' }, { value: 'low', label: 'Baixa' }] },
    { key: 'health', label: 'Deal Health', value: filters.health, allLabel: 'Todos', group: 'Inteligência', options: [{ value: 'strong', label: 'Forte' }, { value: 'healthy', label: 'Saudável' }, { value: 'attention', label: 'Atenção' }, { value: 'critical', label: 'Crítico' }, { value: 'no_action', label: 'Sem próxima ação' }, { value: 'proposal_stale', label: 'Proposta sem retorno' }] },
    { key: 'due', label: 'Próxima ação', value: filters.due, allLabel: 'Qualquer data', group: 'Atividade', options: [{ value: 'due', label: 'Vencida ou hoje' }, { value: 'none', label: 'Sem próxima ação' }] },
  ], [filters, owners, snapshot?.stages, sources])

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

  const dealPortfolio = useMemo(() => snapshot && crmPreferences.commercial.dealIntelligence.enabled
    ? buildDealPortfolio(snapshot, crmPreferences.commercial.dealIntelligence, new Date(), scope === 'mine' ? user?.id : undefined)
    : null, [crmPreferences.commercial.dealIntelligence, scope, snapshot, user?.id])
  const revenueIntelligence = useMemo(() => snapshot ? calculateRevenueIntelligence(snapshot, new Date(), scope === 'mine' ? (user?.id ?? '__no-user__') : null) : null, [scope, snapshot, user?.id])
  const dealByLead = useMemo(() => new Map((dealPortfolio?.deals ?? []).map((deal) => [deal.lead.id, deal])), [dealPortfolio])
  const inspectingDeal = inspectingLeadId ? dealByLead.get(inspectingLeadId) ?? null : null

  useEffect(() => {
    if (routeContext.leadId && snapshot?.leads.some((lead) => lead.id === routeContext.leadId)) {
      if (routeContext.action === 'deal-inspector') setInspectingLeadId(routeContext.leadId)
      else setViewing(snapshot.leads.find((lead) => lead.id === routeContext.leadId) ?? null)
      clearRouteContext(['leadId', 'action'])
    }
    if (routeContext.filter === 'no-action') {
      setFilters((current) => ({ ...current, due: 'none' }))
      clearRouteContext(['filter'])
    }
  }, [clearRouteContext, routeContext.action, routeContext.filter, routeContext.leadId, snapshot?.leads])

  const filtered = useMemo(() => {
    const normalized = filters.query.trim().toLowerCase()
    const items = (snapshot?.leads ?? []).filter((lead) => {
      const signal = signals.get(lead.id)
      const matchesSearch = !normalized || `${lead.name} ${lead.company} ${lead.city} ${lead.phone} ${lead.email} ${lead.tags.join(' ')}`.toLowerCase().includes(normalized)
      const isMine = Boolean(user && (lead.ownerId === user.id || lead.ownerName.trim().toLocaleLowerCase('pt-BR') === user.displayName.trim().toLocaleLowerCase('pt-BR')))
      const deal = dealByLead.get(lead.id)
      const health = deal?.healthLevel ?? signal?.health
      const proposalRisk = deal ? deal.risks.some((risk) => risk.source === 'proposal') : signal?.health === 'proposal_stale'
      const overdue = Boolean(lead.nextActionAt && new Date(lead.nextActionAt).getTime() < new Date().setHours(0, 0, 0, 0))
      const quickSliceMatch = quickSlice === 'all' || (quickSlice === 'risk' ? health === 'critical' || proposalRisk : quickSlice === 'no_action' ? !lead.nextActionAt : overdue)
      return (scope === 'team' || isMine) && matchesSearch && quickSliceMatch
        && (filters.stage === 'all' || lead.stageId === filters.stage)
        && (filters.temperature === 'all' || lead.temperature === filters.temperature)
        && (filters.priority === 'all' || lead.priority === filters.priority)
        && (filters.source === 'all' || lead.source === filters.source)
        && (filters.owner === 'all' || lead.ownerName === filters.owner)
        && (filters.due === 'all' || (filters.due === 'due' ? isDue(lead.nextActionAt) : !lead.nextActionAt))
        && (() => {
          if (filters.health === 'all') return true
          const deal = dealByLead.get(lead.id)
          if (filters.health === 'no_action') return !lead.nextActionAt
          if (filters.health === 'proposal_stale') return deal ? deal.risks.some((risk) => risk.source === 'proposal') : signal?.health === 'proposal_stale'
          return deal ? deal.healthLevel === filters.health : signal?.health === filters.health
        })()
    })
    return [...items].sort((a, b) => {
      if (sort === 'deal_health_asc') return (dealByLead.get(a.id)?.healthScore ?? 101) - (dealByLead.get(b.id)?.healthScore ?? 101)
      if (sort === 'deal_probability_desc') return (dealByLead.get(b.id)?.realTalentProbability ?? 0) - (dealByLead.get(a.id)?.realTalentProbability ?? 0)
      if (sort === 'value_desc') return commercialValue(b) - commercialValue(a)
      if (sort === 'close_date') return (commercialCloseAt(a) ? new Date(commercialCloseAt(a)!).getTime() : Number.MAX_SAFE_INTEGER) - (commercialCloseAt(b) ? new Date(commercialCloseAt(b)!).getTime() : Number.MAX_SAFE_INTEGER)
      if (sort === 'probability_desc') return commercialProbability(b) - commercialProbability(a)
      if (sort === 'name') return a.name.localeCompare(b.name, 'pt-BR')
      if (sort === 'next_action') return (a.nextActionAt ? new Date(a.nextActionAt).getTime() : Number.MAX_SAFE_INTEGER) - (b.nextActionAt ? new Date(b.nextActionAt).getTime() : Number.MAX_SAFE_INTEGER)
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
  }, [dealByLead, filters, quickSlice, scope, signals, snapshot?.leads, sort, user, officialProposalByLead, opportunityByLead, snapshot?.stages])

  const kpiBaseLeads = useMemo(() => (snapshot?.leads ?? []).filter((lead) => {
    if (lead.status !== 'active') return false
    if (scope === 'team') return true
    return Boolean(user && (lead.ownerId === user.id || lead.ownerName.trim().toLocaleLowerCase('pt-BR') === user.displayName.trim().toLocaleLowerCase('pt-BR')))
  }), [scope, snapshot?.leads, user])
  const kpiTotals = useMemo(() => {
    const riskIds = new Set<string>()
    let noAction = 0; let overdue = 0
    for (const lead of kpiBaseLeads) {
      const deal = dealByLead.get(lead.id); const signal = signals.get(lead.id)
      const health = deal?.healthLevel ?? signal?.health
      const proposalRisk = deal ? deal.risks.some((risk) => risk.source === 'proposal') : signal?.health === 'proposal_stale'
      if (health === 'critical' || proposalRisk) riskIds.add(lead.id)
      if (!lead.nextActionAt) noAction += 1
      if (lead.nextActionAt && new Date(lead.nextActionAt).getTime() < new Date().setHours(0, 0, 0, 0)) overdue += 1
    }
    return {
      count: kpiBaseLeads.length,
      value: kpiBaseLeads.reduce((sum, lead) => sum + commercialValue(lead), 0),
      weighted: kpiBaseLeads.reduce((sum, lead) => sum + commercialValue(lead) * commercialProbability(lead) / 100, 0),
      risk: riskIds.size, noAction, overdue,
    }
  }, [dealByLead, kpiBaseLeads, signals, officialProposalByLead, opportunityByLead, snapshot?.stages])
  const activateQuickSlice = (slice: 'all' | 'risk' | 'no_action' | 'overdue', nextScope: PipelineScope = scope) => {
    setActiveSavedViewId(null); setScope(nextScope); setQuickSlice(slice); setFilters(DEFAULT_FILTERS); setSort(slice === 'risk' ? 'deal_health_asc' : slice === 'overdue' ? 'next_action' : 'updated_desc'); selectViewMode('board')
  }

  const totals = useMemo(() => {
    const active = filtered.filter((lead) => lead.status === 'active')
    const won = filtered.filter((lead) => lead.status === 'won')
    const lost = filtered.filter((lead) => lead.status === 'lost')
    const attention = active.filter((lead) => (dealByLead.get(lead.id)?.healthLevel ?? signals.get(lead.id)?.health) === 'attention').length
    const critical = active.filter((lead) => (dealByLead.get(lead.id)?.healthLevel ?? signals.get(lead.id)?.health) === 'critical').length
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
  }, [dealByLead, filtered, signals, snapshot?.stages, stagePolicies, officialProposalByLead, opportunityByLead])

  const activeFilterCount = Object.entries(filters).filter(([key, value]) => key !== 'query' && value !== 'all').length
  const resetFilters = () => { setFilters(DEFAULT_FILTERS); setActiveSavedViewId(null); setQuickSlice('all') }
  const clearPipelineFilter = (key: keyof PipelineFiltersState) => { setActiveSavedViewId(null); setQuickSlice('all'); setFilters((current) => ({ ...current, [key]: key === 'query' ? '' : 'all' })) }
  const pipelineFilterChips = [
    filters.stage !== 'all' ? { key: 'stage' as const, label: `Etapa: ${snapshot?.stages.find((stage) => stage.id === filters.stage)?.name ?? 'Selecionada'}` } : null,
    filters.temperature !== 'all' ? { key: 'temperature' as const, label: `Temperatura: ${filters.temperature === 'hot' ? 'Quente' : filters.temperature === 'warm' ? 'Morno' : 'Frio'}` } : null,
    filters.priority !== 'all' ? { key: 'priority' as const, label: `Prioridade: ${priorityLabels[filters.priority] ?? filters.priority}` } : null,
    filters.source !== 'all' ? { key: 'source' as const, label: `Origem: ${filters.source}` } : null,
    filters.owner !== 'all' ? { key: 'owner' as const, label: `Responsável: ${filters.owner}` } : null,
    filters.due !== 'all' ? { key: 'due' as const, label: filters.due === 'due' ? 'Próxima ação: vencida/hoje' : 'Sem próxima ação' } : null,
    filters.health !== 'all' ? { key: 'health' as const, label: `Deal Health: ${healthLabels[filters.health as keyof typeof healthLabels] ?? filters.health}` } : null,
  ].filter(Boolean) as Array<{ key: keyof PipelineFiltersState; label: string }>
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
    try { await guardedMove(lead, stageId) } catch (error) { notify('error', error instanceof Error ? error.message : 'Falha ao mover oportunidade.') }
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
    const name = (await promptAction({ title: 'Nova exibição do Pipeline', description: 'A exibição será criada com os filtros, modo, ordenação e escopo que estão na tela agora.', label: 'Nome da exibição', confirmLabel: 'Criar exibição', placeholder: 'Ex.: Propostas em risco' }))?.trim()
    if (!name) return
    const nextPosition = preferences.savedViews.reduce((max, item) => Math.max(max, item.position ?? 0), -1) + 1
    const saved: PipelineSavedView = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, filters: { ...filters }, viewMode, compact, sort, scope, position: nextPosition, isDefault: false, starterKey: null }
    persistPreferences((current) => ({ ...current, savedViews: [...current.savedViews, saved], savedViewsInitialized: true }))
    setActiveSavedViewId(saved.id)
    notify('success', `Exibição “${name}” criada.`)
  }
  const applySavedView = (id: string) => {
    const saved = preferences.savedViews.find((item) => item.id === id)
    if (!saved) return
    setQuickSlice('all'); setFilters({ ...DEFAULT_FILTERS, ...saved.filters }); setViewMode(saved.viewMode); setCompact(saved.compact); setSort(saved.sort); setScope(saved.scope ?? 'team'); setActiveSavedViewId(saved.id)
    persistPreferences((current) => ({ ...current, lastViewMode: saved.viewMode, compact: saved.compact }))
  }
  const deleteSavedView = (id: string) => {
    persistPreferences((current) => ({ ...current, savedViews: current.savedViews.filter((item) => item.id !== id), savedViewsInitialized: true }))
    if (activeSavedViewId === id) setActiveSavedViewId(null)
  }
  const renameSavedView = async (view: PipelineSavedView) => {
    const name = (await promptAction({ title: 'Renomear exibição', description: 'O nome muda sem alterar os filtros ou o modo de exibição.', label: 'Nome', initialValue: view.name, confirmLabel: 'Salvar nome' }))?.trim()
    if (!name) return
    persistPreferences((current) => ({ ...current, savedViews: current.savedViews.map((item) => item.id === view.id ? { ...item, name } : item) }))
  }
  const duplicateSavedView = (view: PipelineSavedView) => {
    const nextPosition = preferences.savedViews.reduce((max, item) => Math.max(max, item.position ?? 0), -1) + 1
    const copy: PipelineSavedView = { ...view, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: `${view.name} — cópia`, position: nextPosition, isDefault: false, starterKey: null, filters: { ...view.filters } }
    persistPreferences((current) => ({ ...current, savedViews: [...current.savedViews, copy], savedViewsInitialized: true }))
    setFilters({ ...DEFAULT_FILTERS, ...copy.filters }); setViewMode(copy.viewMode); setCompact(copy.compact); setSort(copy.sort); setScope(copy.scope ?? 'team'); setActiveSavedViewId(copy.id)
  }
  const moveSavedView = (view: PipelineSavedView, direction: -1 | 1) => {
    const ordered = [...preferences.savedViews].sort((a,b) => (a.position ?? 0) - (b.position ?? 0))
    const index = ordered.findIndex((item) => item.id === view.id); const target = index + direction
    if (index < 0 || target < 0 || target >= ordered.length) return
    const reordered = [...ordered]; const [moving] = reordered.splice(index,1); reordered.splice(target,0,moving)
    persistPreferences((current) => ({ ...current, savedViews: reordered.map((item, position) => ({ ...item, position })), savedViewsInitialized: true }))
  }
  const setDefaultSavedView = (view: PipelineSavedView) => {
    persistPreferences((current) => ({ ...current, savedViews: current.savedViews.map((item) => ({ ...item, isDefault: item.id === view.id })), savedViewsInitialized: true }))
    notify('success', `“${view.name}” será a exibição padrão do Pipeline.`)
  }
  const toggleStageCollapse = (stageId: string) => persistPreferences((current) => ({ ...current, collapsedStageIds: current.collapsedStageIds.includes(stageId) ? current.collapsedStageIds.filter((id) => id !== stageId) : [...current.collapsedStageIds, stageId] }))
  const openActivity = (lead: Lead, type: ActivityType) => { setActivityLead(lead); setActivityType(type) }
  const openPipelineCall = (lead: Lead) => {
    const blocked = contactBlockedMessage(lead, 'call')
    if (blocked) { notify('info', blocked); return }
    if (!resolveLeadCallTarget(lead, snapshot?.contacts ?? []).phone) { notify('info', 'Cadastre um telefone antes de iniciar a ligação.'); return }
    setCallLead(lead)
  }
  const openPipelineProposal = (lead: Lead) => {
    const proposal = officialProposalByLead.get(lead.id)
    if (proposal) { navigate('proposals', { leadId: lead.id, proposalId: proposal.id }); return }
    if (!canPipelineEdit) { notify('info', 'Esta oportunidade ainda não possui proposta oficial.'); return }
    navigate('proposals', { leadId: lead.id, action: 'create-proposal' })
  }
  const completeNextPipelineActivity = async (lead: Lead) => {
    const next = (snapshot?.activities ?? []).filter((activity) => activity.leadId === lead.id && !activity.completedAt && !['cancelled', 'superseded'].includes(activity.resolutionStatus ?? '')).sort((a, b) => (a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER) - (b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER))[0]
    if (!next) { notify('info', 'Esta oportunidade não possui tarefa pendente para concluir.'); return }
    try { await completeActivity(next.id, true) } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível concluir a próxima tarefa.') }
  }
  const renderQuickActions = (lead: Lead, variant: 'card' | 'table' = 'card') => {
    const hasPhone = Boolean(resolveLeadCallTarget(lead, snapshot?.contacts ?? []).phone)
    const callBlocked = Boolean(contactBlockedMessage(lead, 'call'))
    const hasProposal = officialProposalByLead.has(lead.id)
    if (variant === 'card') return <div className="pipeline-quick-actions pipeline-quick-actions--card pipeline-card-hover-actions" aria-label={`Ações rápidas de ${lead.name}`}>
      {canPipelineEdit && canCommunicate ? <button type="button" disabled={!hasPhone || callBlocked} onClick={() => openPipelineCall(lead)} title={callBlocked ? (contactBlockedMessage(lead, 'call') ?? 'Contato bloqueado') : hasPhone ? 'Ligar' : 'Telefone não cadastrado'}><PhoneCall size={15} /><span>Ligar</span></button> : null}
      <button type="button" onClick={() => setMessageLead(lead)} title="Mensagem / e-mail"><Mail size={15} /><span>Mensagem</span></button>
      {canPipelineEdit ? <button type="button" onClick={() => void completeNextPipelineActivity(lead)} title="Concluir próxima tarefa"><CheckCircle2 size={15} /><span>Concluir tarefa</span></button> : null}
    </div>
    return <div className="pipeline-quick-actions pipeline-quick-actions--table" aria-label={`Ações rápidas de ${lead.name}`}>
      {canPipelineEdit && canCommunicate ? <button type="button" disabled={!hasPhone || callBlocked} onClick={() => openPipelineCall(lead)} title={callBlocked ? (contactBlockedMessage(lead, 'call') ?? 'Contato bloqueado') : hasPhone ? 'Abrir Central de Ligações' : 'Telefone não cadastrado'}><PhoneCall size={14} /><span>Ligar</span></button> : null}
      <button type="button" onClick={() => setMessageLead(lead)} title="Preparar mensagem e roteiro"><MessageCircle size={14} /><span>Mensagem</span></button>
      {canPipelineEdit ? <button type="button" onClick={() => openActivity(lead, 'followup')} title="Criar follow-up"><Clock3 size={14} /><span>Follow-up</span></button> : null}
      <button type="button" disabled={!hasProposal && !canPipelineEdit} onClick={() => openPipelineProposal(lead)} title={hasProposal ? 'Abrir proposta oficial' : 'Criar proposta'}><FileText size={14} /><span>Proposta</span></button>
      {canPipelineEdit ? <button type="button" className="pipeline-quick-actions__secondary" onClick={() => setCadenceLeadIds([lead.id])} title="Iniciar cadência"><Layers3 size={14} /><span>Cadência</span></button> : null}
      <button type="button" onClick={() => setViewing(lead)} title="Abrir ficha comercial"><ArrowRight size={14} /><span>Abrir</span></button>
    </div>
  }
  const runDealAction = (deal: DealIntelligence) => {
    const action = deal.nextBestAction
    if (action.kind === 'call') { const blocked = contactBlockedMessage(deal.lead, 'call'); if (blocked) { notify('info', blocked); return }; setCallLead(deal.lead); return }
    if (action.kind === 'followup') { openActivity(deal.lead, 'followup'); return }
    if (action.kind === 'meeting') { openActivity(deal.lead, 'meeting'); return }
    if (action.kind === 'map_stakeholder') { navigate('leads', { leadId: deal.lead.id, action: 'account360' }); return }
    if (action.kind === 'proposal') { navigate('proposals', { leadId: deal.lead.id, action: 'create-proposal' }); return }
    if (action.kind === 'review_proposal' && deal.proposal) { navigate('proposals', { leadId: deal.lead.id, proposalId: deal.proposal.id }); return }
    setViewing(deal.lead)
  }


  const renderCard = (lead: Lead) => {
    const signal = signals.get(lead.id)
    const deal = dealByLead.get(lead.id)
    const selected = selectedIds.includes(lead.id)
    const overdue = Boolean(lead.nextActionAt && new Date(lead.nextActionAt).getTime() < new Date().setHours(0, 0, 0, 0))
    const rotting = overdue || deal?.healthLevel === 'critical' || signal?.health === 'critical' ? 'critical' : deal?.healthLevel === 'attention' || deal?.momentum === 'cooling' || (deal?.inactivityDays ?? signal?.stageAge ?? 0) >= 7 ? 'warning' : 'healthy'
    const nextActionLabel = !lead.nextActionAt ? 'Sem próxima ação' : (() => {
      const date = new Date(lead.nextActionAt); const now = new Date(); const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
      const day = date.toDateString() === now.toDateString() ? 'Hoje' : date.toDateString() === tomorrow.toDateString() ? 'Amanhã' : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date).replace('.', '')
      return `${day} · ${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date)}`
    })()
    return <article
      draggable={canPipelineEdit} className={`pipeline-card-v1008 pipeline-card-v101113 pipeline-card-v101113--${rotting} ${draggingId === lead.id ? 'is-dragging' : ''} ${selected ? 'is-selected' : ''}`} key={lead.id}
      onDragStart={(event) => { if (!canPipelineEdit) { event.preventDefault(); return }; setDraggingId(lead.id); event.dataTransfer.setData('text/lead-id', lead.id); event.dataTransfer.effectAllowed = 'move' }}
      onDragEnd={() => { setDraggingId(null); setDropTargetId(null) }}
    >
      <div className="pipeline-card-v101113__chrome">
        {canPipelineEdit ? <button className={`pipeline-select ${selected ? 'is-selected' : ''}`} type="button" onClick={() => toggleSelected(lead.id)} aria-label={selected ? 'Desmarcar oportunidade' : 'Selecionar oportunidade'}>{selected ? <Check size={13} /> : null}</button> : null}
        <span className={`pipeline-rotting-indicator pipeline-rotting-indicator--${rotting}`} title={rotting === 'critical' ? 'Negócio exige ação imediata' : rotting === 'warning' ? 'Negócio começando a estagnar' : 'Negócio saudável'} />
        <GripVertical size={15} />
      </div>
      <button type="button" className="pipeline-card-v1008__main pipeline-card-v101113__main" onClick={() => setViewing(lead)}>
        <h4>{opportunityByLead.get(lead.id)?.title ?? `${lead.company || lead.name} — oportunidade`}</h4>
        <p>{lead.name}{lead.company && lead.company !== lead.name ? ` · ${lead.company}` : ''}</p>
        <div className="pipeline-card-v101113__footer"><strong>{formatCurrency(commercialValue(lead))}</strong><span className={`${overdue ? 'is-overdue' : ''} ${!lead.nextActionAt ? 'is-missing' : ''}`}><Clock3 size={12}/>{nextActionLabel}</span></div>
      </button>
      {renderQuickActions(lead, 'card')}
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
      return <article className={`pipeline-column pipeline-column-v1008 ${collapsed ? 'is-collapsed' : ''} ${stage.isWon ? 'pipeline-column--won' : ''} ${stage.isLost ? 'pipeline-column--lost' : ''} ${dropTargetId === stage.id ? 'is-drop-target' : ''}`} key={stage.id} onDragEnter={() => { if (canPipelineEdit) setDropTargetId(stage.id) }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTargetId(null) }} onDragOver={(event) => { if (canPipelineEdit) event.preventDefault() }} onDrop={(event) => { if (canPipelineEdit) void drop(event, stage.id) }}>
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
          {canPipelineCreate ? <button type="button" className="pipeline-column__add" onClick={() => setCreateStageId(stage.id)}><Plus size={16} /> Adicionar oportunidade</button> : null}
        </>}
      </article>
    })}
  </section>

  const renderList = () => <section className="panel pipeline-list-view">
    <div className="pipeline-table-wrap"><table className="pipeline-table pipeline-table--commercial"><thead><tr>
      <th><button type="button" className={`pipeline-select ${pagedFiltered.length && pagedFiltered.every((lead) => selectedIds.includes(lead.id)) ? 'is-selected' : ''}`} onClick={() => setSelectedIds((current) => pagedFiltered.every((lead) => current.includes(lead.id)) ? current.filter((id) => !pagedFiltered.some((lead) => lead.id === id)) : [...new Set([...current, ...pagedFiltered.map((lead) => lead.id)])])}>{pagedFiltered.length && pagedFiltered.every((lead) => selectedIds.includes(lead.id)) ? <Check size={13} /> : null}</button></th>
      <th>Oportunidade</th><th>Etapa</th><th>Proposta oficial</th><th>Deal Health</th><th>Responsável</th><th>Fechamento</th><th>Prob. Vendedor → RT</th><th>TCV</th><th>MRR</th><th>Ponderado</th><th>Próxima ação</th><th>Tempo</th><th>Ações</th>
    </tr></thead><tbody>{pagedFiltered.map((lead) => {
      const stage = snapshot?.stages.find((item) => item.id === lead.stageId)
      const signal = signals.get(lead.id)
      const deal = dealByLead.get(lead.id)
      const proposal = officialProposalByLead.get(lead.id)
      const probability = commercialProbability(lead)
      const value = commercialValue(lead)
      return <tr key={lead.id} className={selectedIds.includes(lead.id) ? 'is-selected' : ''}>
        <td><button type="button" className={`pipeline-select ${selectedIds.includes(lead.id) ? 'is-selected' : ''}`} onClick={() => toggleSelected(lead.id)}>{selectedIds.includes(lead.id) ? <Check size={13} /> : null}</button></td>
        <td><button type="button" className="pipeline-table__lead" onClick={() => setViewing(lead)}><strong>{lead.name}</strong><small>{lead.company || lead.city || 'Sem empresa'}</small></button></td>
        <td><span className="pipeline-stage-chip"><i style={{ background: stage?.color }} />{stage?.name ?? 'Sem etapa'}</span></td>
        <td>{proposal ? <span className="pipeline-proposal-cell"><strong>{proposal.proposalNumber} · v{proposal.version}</strong><small>{proposal.status === 'accepted' ? 'Aceite registrado' : proposal.status === 'sent' ? 'Enviada' : proposal.status === 'viewed' ? 'Visualizada' : 'Em elaboração'}</small></span> : <span className="pipeline-table-muted">Sem proposta oficial</span>}</td>
        <td>{deal ? <button type="button" className={`pipeline-health pipeline-health--${deal.healthLevel === 'strong' ? 'healthy' : deal.healthLevel}`} onClick={() => setInspectingLeadId(lead.id)}>{deal.healthScore} · {deal.healthLabel}</button> : signal ? <span className={`pipeline-health pipeline-health--${signal.health}`}>{healthLabels[signal.health]}</span> : null}</td>
        <td>{lead.ownerName || 'Não atribuído'}</td>
        <td>{formatDateOnly(commercialCloseAt(lead))}</td>
        <td><strong>{probability}% → {deal?.realTalentProbability ?? probability}%</strong></td>
        <td><strong>{formatCurrency(value)}</strong></td>
        <td><strong>{formatCurrency(commercialMrr(lead))}</strong></td>
        <td><strong>{formatCurrency(value * probability / 100)}</strong></td>
        <td className={isDue(lead.nextActionAt) ? 'text-danger' : ''}>{formatDateTime(lead.nextActionAt)}</td><td>{signal?.stageAge ?? 0}d</td>
        <td>{renderQuickActions(lead, 'table')}</td>
      </tr>
    })}</tbody></table></div>
    {!filtered.length ? <div className="pipeline-empty-view"><Search size={26} /><strong>Nenhuma oportunidade encontrada</strong><span>Ajuste os filtros ou crie uma nova oportunidade.</span></div> : null}
    {filtered.length ? <footer className="pipeline-list-pagination"><span>{filtered.length} oportunidade(s)</span><label>Por página <SelectionSelect size="sm" value={String(listPageSize)} onValueChange={(value) => setListPageSize(Number(value))} options={[10, 20, 50].map((value) => ({ value: String(value), label: String(value) }))} /></label><Button size="sm" variant="secondary" disabled={listSafePage <= 1} onClick={() => setListPage((value) => Math.max(1, value - 1))}>Anterior</Button><strong>{listSafePage} / {listTotalPages}</strong><Button size="sm" variant="secondary" disabled={listSafePage >= listTotalPages} onClick={() => setListPage((value) => Math.min(listTotalPages, value + 1))}>Próxima</Button></footer> : null}
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
        return <div className="pipeline-forecast-row" key={lead.id}><button className="pipeline-forecast-row__main" type="button" onClick={() => setViewing(lead)}><span className="pipeline-stage-chip"><i style={{ background: stage?.color }} />{stage?.name}</span><span><strong>{lead.name}</strong><small>{lead.company || lead.ownerName}</small></span>{signal ? <span className={`pipeline-health pipeline-health--${signal.health}`}>{healthLabels[signal.health]}</span> : null}<strong>{formatCurrency(commercialValue(lead))}</strong><small>{commercialProbability(lead)}% · {formatDateOnly(commercialCloseAt(lead))}</small></button>{renderQuickActions(lead, 'table')}</div>
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
      return <div className={today ? 'is-today' : ''} key={date.toISOString()}><span className="pipeline-calendar-day">{date.getDate()}</span>{items.slice(0, 4).map((lead) => <button type="button" key={lead.id} onClick={() => setViewing(lead)}><i className={`temperature-dot temperature-dot--${lead.temperature}`} /><span>{lead.name}</span><small>{new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(lead.nextActionAt!))}</small></button>)}{items.length > 4 ? <small className="pipeline-calendar-more">+{items.length - 4} ações</small> : null}</div>
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

  return <div className={`page-stack pipeline-page pipeline-page-v1008 pipeline-page-h20 ${compact ? 'pipeline-page--compact' : ''}`}>
    <WorkspacePageHeader className="pipeline-page-header-h20" eyebrow="Execução comercial" title="Pipeline" description="Oportunidades, risco, forecast e próximas ações em um único fluxo de trabalho." icon={TrendingUp} actions={canPipelineCreate ? <Button className="pipeline-new-opportunity-v101113" onClick={() => setCreateStageId(snapshot?.stages[0]?.id ?? '')}><Plus size={17} /> Nova oportunidade</Button> : null} />

    <WorkspaceSummaryStrip className="pipeline-summary-strip-h20">
      <WorkspaceSummaryMetric label="Oportunidades" value={kpiTotals.count} meta={scope === 'mine' ? 'Minhas oportunidades ativas' : 'Negócios ativos'} icon={UsersRound} tone="brand" active={viewMode === 'board' && quickSlice === 'all' && activeSavedViewId === null} onClick={() => activateQuickSlice('all')} />
      <WorkspaceSummaryMetric label="Valor do Pipeline" value={formatCurrency(kpiTotals.value)} meta={revenueIntelligence?.goalTarget ? `Meta ${formatCurrency(revenueIntelligence.goalTarget)}` : 'Total aberto'} icon={BarChart3} tone="brand" progress={revenueIntelligence?.goalTarget ? kpiTotals.value / revenueIntelligence.goalTarget * 100 : null} progressLabel={revenueIntelligence?.goalTarget ? `${Math.round(kpiTotals.value / revenueIntelligence.goalTarget * 100)}% da meta` : undefined} onClick={() => activateQuickSlice('all')} />
      <WorkspaceSummaryMetric label="Forecast RealTalent" value={formatCurrency(revenueIntelligence?.realTalentForecast ?? dealPortfolio?.predictedValue ?? kpiTotals.weighted)} meta={revenueIntelligence?.goalTarget ? `Meta ${formatCurrency(revenueIntelligence.goalTarget)}` : dealPortfolio ? `Saúde média ${dealPortfolio.averageHealth}/100` : 'Previsão ponderada'} icon={TrendingUp} tone="brand" progress={revenueIntelligence?.expectedAttainment ?? null} progressLabel={revenueIntelligence?.expectedAttainment !== null && revenueIntelligence?.expectedAttainment !== undefined ? `${Math.round(revenueIntelligence.expectedAttainment)}% da meta` : undefined} active={viewMode === 'forecast'} onClick={() => { setQuickSlice('all'); setActiveSavedViewId(null); selectViewMode('forecast') }} />
      <WorkspaceSummaryMetric label="Em risco" value={kpiTotals.risk} meta="Fila que pede atenção" icon={AlertTriangle} tone={kpiTotals.risk ? 'danger' : 'success'} active={quickSlice === 'risk'} onClick={() => activateQuickSlice('risk')} />
      <WorkspaceSummaryMetric label="Sem próxima ação" value={kpiTotals.noAction} meta="Precisam de planejamento" icon={Clock3} tone={kpiTotals.noAction ? 'warning' : 'success'} active={quickSlice === 'no_action'} onClick={() => activateQuickSlice('no_action')} />
    </WorkspaceSummaryStrip>

    {dealPortfolio ? <section className={`pipeline-intelligence-shell ${preferences.intelligenceCollapsed ? 'is-collapsed' : ''}`} aria-label="Pipeline Intelligence">
      <header className="pipeline-intelligence-shell__header">
        <div className="pipeline-intelligence-shell__title"><span><Sparkles size={15} /> Pipeline Intelligence</span><strong>{preferences.intelligenceCollapsed ? 'Resumo inteligente do funil' : 'Saúde, risco e próximas melhores ações'}</strong></div>
        <div className="pipeline-intelligence-shell__summary">
          <span><small>Saúde</small><b>{dealPortfolio.averageHealth}/100</b></span>
          <span><small>Em risco</small><b>{formatCurrency(dealPortfolio.atRiskValue)}</b></span>
          <span><small>Forecast</small><b>{formatCurrency(dealPortfolio.predictedValue)}</b></span>
          <span><small>Prioridades</small><b>{dealPortfolio.priorities.length}</b></span>
        </div>
        <button type="button" className="pipeline-intelligence-shell__toggle" aria-expanded={!preferences.intelligenceCollapsed} onClick={() => persistPreferences((current) => ({ ...current, intelligenceCollapsed: !current.intelligenceCollapsed }))}>
          {preferences.intelligenceCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          {preferences.intelligenceCollapsed ? 'Expandir' : 'Recolher'}
        </button>
      </header>
      {!preferences.intelligenceCollapsed ? <div className="pipeline-intelligence-shell__content"><DealPortfolioPanel portfolio={dealPortfolio} title="Prioridades comerciais" maxItems={4} onOpen={(deal) => setInspectingLeadId(deal.lead.id)} onExecute={runDealAction} />{totals.noAction || totals.proposalStale || totals.critical || totals.attention ? <section className="pipeline-action-center pipeline-action-center--inside-intelligence" aria-label="Prioridades comerciais"><div><AlertTriangle size={18} /><span><strong>Recortes que pedem ação</strong><small>Use um recorte para transformar o diagnóstico em fila de trabalho.</small></span></div><div>{totals.noAction ? <button type="button" onClick={() => setFilters((current) => ({ ...current, health: 'no_action' }))}>{totals.noAction} sem próxima ação</button> : null}{totals.proposalStale ? <button type="button" onClick={() => setFilters((current) => ({ ...current, health: 'proposal_stale' }))}>{totals.proposalStale} proposta(s) sem retorno</button> : null}{totals.critical ? <button type="button" onClick={() => setFilters((current) => ({ ...current, health: 'critical' }))}>{totals.critical} em risco crítico</button> : null}{totals.attention ? <button type="button" onClick={() => setFilters((current) => ({ ...current, health: 'attention' }))}>{totals.attention} pedem atenção</button> : null}</div></section> : null}</div> : null}
    </section> : null}

    <WorkspaceCommandBar className="pipeline-single-action-bar-v101113 pipeline-command-bar-h20" aria-label="Centro de comando do Pipeline">
      <FilterWorkspaceViewStrip
        items={[
          { id: 'all', label: 'Todos', count: scope === 'team' ? kpiTotals.count : (snapshot?.leads ?? []).filter((lead) => lead.status === 'active').length, active: activeSavedViewId === null && scope === 'team' && quickSlice === 'all', favorite: true, accent: 'blue', icon: <UsersRound size={14}/>, onClick: () => activateQuickSlice('all', 'team') },
          { id: 'mine', label: 'Meus negócios', count: (snapshot?.leads ?? []).filter((lead) => lead.status === 'active' && user && (lead.ownerId === user.id || lead.ownerName.trim().toLocaleLowerCase('pt-BR') === user.displayName.trim().toLocaleLowerCase('pt-BR'))).length, active: activeSavedViewId === null && scope === 'mine' && quickSlice === 'all', accent: 'blue', icon: <UserRound size={14}/>, onClick: () => activateQuickSlice('all', 'mine') },
          { id: 'risk', label: 'Em risco', count: kpiTotals.risk, active: activeSavedViewId === null && quickSlice === 'risk', accent: 'red', icon: <AlertTriangle size={14}/>, onClick: () => activateQuickSlice('risk') },
          { id: 'no-action', label: 'Sem ação', count: kpiTotals.noAction, active: activeSavedViewId === null && quickSlice === 'no_action', accent: 'orange', icon: <Clock3 size={14}/>, onClick: () => activateQuickSlice('no_action') },
          { id: 'overdue', label: 'Atrasadas', count: kpiTotals.overdue, active: activeSavedViewId === null && quickSlice === 'overdue', accent: 'orange', icon: <CalendarDays size={14}/>, onClick: () => activateQuickSlice('overdue') },
          ...[...preferences.savedViews].filter((item) => !item.starterKey).sort((a,b) => (a.position ?? 0) - (b.position ?? 0)).map((item) => ({ id: item.id, label: item.name, active: activeSavedViewId === item.id, favorite: item.isDefault, accent: 'purple' as const, icon: <Bookmark size={14}/>, onClick: () => applySavedView(item.id), menu: [
            { label: 'Renomear', onClick: () => void renameSavedView(item) },
            { label: 'Duplicar', onClick: () => duplicateSavedView(item) },
            { label: 'Definir como padrão', onClick: () => setDefaultSavedView(item) },
            { label: 'Mover para esquerda', onClick: () => moveSavedView(item, -1) },
            { label: 'Mover para direita', onClick: () => moveSavedView(item, 1) },
            { label: 'Excluir exibição', danger: true, onClick: () => deleteSavedView(item.id) },
          ] })),
        ]}
        onAdd={() => void saveView()} addLabel="Salvar visão"
      />
      <label className="search-field workspace-search-v10167 pipeline-command-search-v101113"><Search size={18} /><input value={filters.query} onChange={(event) => { setActiveSavedViewId(null); setFilters((current) => ({ ...current, query: event.target.value })) }} placeholder="Buscar oportunidade..." /></label>
      <div className="pipeline-command-actions-v101113">
        <WorkspaceFilterMenu workspaceKey={`pipeline:${workspaceId}`} fields={universalPipelineFilters} activeCount={activeFilterCount} onChange={(key, value) => { setActiveSavedViewId(null); setQuickSlice('all'); setFilters((current) => ({ ...current, [key]: value })) }} onClearAll={() => { setActiveSavedViewId(null); resetFilters() }} onOpenAdvanced={() => setFiltersOpen(true)} />
        <WorkspaceSortMenu value={sort} onChange={(value) => { setActiveSavedViewId(null); setSort(value as PipelineSort) }} options={[{ value: 'deal_health_asc', label: 'Maior risco', description: 'Deal Health mais crítico primeiro.' }, { value: 'deal_probability_desc', label: 'Maior probabilidade RealTalent' }, { value: 'updated_desc', label: 'Atualização recente' }, { value: 'next_action', label: 'Próxima ação' }, { value: 'value_desc', label: 'Maior TCV' }, { value: 'probability_desc', label: 'Probabilidade do vendedor' }, { value: 'close_date', label: 'Fechamento mais próximo' }, { value: 'name', label: 'Nome' }]} />
        <WorkspaceDisplayMenu label="Exibição" value={viewMode} onChange={(value) => selectViewMode(value as PipelineViewMode)} modes={[{ value: 'board', label: 'Kanban', icon: <LayoutGrid size={15}/>, description: 'Execução por etapa.' }, { value: 'list', label: 'Lista', icon: <List size={15}/>, description: 'Operação densa e seleção em massa.' }, { value: 'forecast', label: 'Previsão', icon: <TrendingUp size={15}/>, description: 'Receita por fechamento esperado.' }, { value: 'calendar', label: 'Calendário', icon: <CalendarDays size={15}/>, description: 'Próximas ações por data.' }, { value: 'funnel', label: 'Funil', icon: <BarChart3 size={15}/>, description: 'Conversão e gargalos por etapa.' }]} />
        <button type="button" className={`pipeline-density-toggle-v101113 ${compact ? 'is-active' : ''}`} onClick={toggleDensity} title="Alternar densidade do Kanban"><Columns3 size={16}/><span>{compact ? 'Compacta' : 'Confortável'}</span></button>
        <details className="rt-overflow-menu"><summary aria-label="Mais ações do Pipeline" title="Mais ações"><MoreHorizontal size={18} /></summary><div className="rt-overflow-menu__panel">{canManageStages && canPipelineEdit ? <button type="button" onClick={() => setStageEditing('new')}><Plus size={17} /><span><strong>Nova etapa</strong><small>Editar estrutura do funil comercial</small></span></button> : null}</div></details>
      </div>
    </WorkspaceCommandBar>


    {pipelineFilterChips.length ? <div className="workspace-filter-chips-v10167 pipeline-filter-chips-v10168">{pipelineFilterChips.map((chip) => <button type="button" key={chip.key} onClick={() => clearPipelineFilter(chip.key)}>{chip.label} ×</button>)}<button className="is-clear" type="button" onClick={resetFilters}>Limpar filtros</button></div> : null}

    <section className="pipeline-view-switcher pipeline-view-switcher-v10170-hidden" aria-hidden="true">
      {([['board', LayoutGrid], ['list', List], ['forecast', TrendingUp], ['calendar', CalendarDays], ['funnel', BarChart3]] as const).map(([mode, Icon]) => <button type="button" key={mode} className={viewMode === mode ? 'is-active' : ''} onClick={() => selectViewMode(mode)}><Icon size={16} />{viewLabels[mode]}</button>)}
      <span className="pipeline-view-switcher__spacer" />
      <div className="pipeline-scope-switcher"><button type="button" className={scope === 'mine' ? 'is-active' : ''} onClick={() => setScope('mine')}><UserRound size={15} /> Meus negócios</button>{canSeeTeam ? <button type="button" className={scope === 'team' ? 'is-active' : ''} onClick={() => setScope('team')}><UsersRound size={15} /> Todos os negócios</button> : null}</div>
      <label>Ordenar<SelectionSelect size="sm" value={sort} onValueChange={(value) => setSort(value as PipelineSort)} options={[{ value: 'deal_health_asc', label: 'Maior risco / menor Deal Health' }, { value: 'deal_probability_desc', label: 'Maior probabilidade RealTalent' }, { value: 'updated_desc', label: 'Atualização recente' }, { value: 'next_action', label: 'Próxima ação' }, { value: 'value_desc', label: 'Maior TCV' }, { value: 'probability_desc', label: 'Maior probabilidade do vendedor' }, { value: 'close_date', label: 'Fechamento mais próximo' }, { value: 'name', label: 'Nome' }]} /></label>
    </section>


    {filtersOpen ? <aside className="workspace-settings-drawer-v10167 pipeline-filter-drawer-v10168" aria-label="Filtros do Pipeline">
      <header><div><span>Pipeline</span><strong>Filtros comerciais</strong></div><button type="button" onClick={() => setFiltersOpen(false)} aria-label="Fechar filtros">×</button></header>
      <div className="workspace-settings-drawer-v10167__body">
        <section><div className="workspace-settings-section-title-v10167"><strong>Funil e responsabilidade</strong><span>Defina o recorte de negócio antes de analisar risco ou prazo.</span></div>
          <label className="field"><span>Etapa</span><SelectionSelect value={filters.stage} onValueChange={(value) => setFilters((current) => ({ ...current, stage: value }))} options={[{ value: 'all', label: 'Todas as etapas' }, ...(snapshot?.stages ?? []).map((stage) => ({ value: stage.id, label: stage.name }))]} /></label>
          <label className="field"><span>Responsável</span><SelectionSelect value={filters.owner} onValueChange={(value) => setFilters((current) => ({ ...current, owner: value }))} searchable options={[{ value: 'all', label: 'Todos' }, ...owners.map((item) => ({ value: item, label: item }))]} /></label>
          <label className="field"><span>Origem</span><SelectionSelect value={filters.source} onValueChange={(value) => setFilters((current) => ({ ...current, source: value }))} searchable options={[{ value: 'all', label: 'Todas' }, ...sources.map((item) => ({ value: item, label: item }))]} /></label>
        </section>
        <section><div className="workspace-settings-section-title-v10167"><strong>Prioridade e saúde</strong><span>Combine sinais comerciais sem lotar a barra principal.</span></div>
          <label className="field"><span>Temperatura</span><SelectionSelect value={filters.temperature} onValueChange={(value) => setFilters((current) => ({ ...current, temperature: value }))} options={[{ value: 'all', label: 'Todas' }, { value: 'hot', label: 'Quente' }, { value: 'warm', label: 'Morno' }, { value: 'cold', label: 'Frio' }]} /></label>
          <label className="field"><span>Prioridade</span><SelectionSelect value={filters.priority} onValueChange={(value) => setFilters((current) => ({ ...current, priority: value }))} options={[{ value: 'all', label: 'Todas' }, { value: 'urgent', label: '!! Urgente' }, { value: 'high', label: '↑ Alta' }, { value: 'medium', label: '– Média' }, { value: 'low', label: '↓ Baixa' }]} /></label>
          <label className="field"><span>Deal Health</span><SelectionSelect value={filters.health} onValueChange={(value) => setFilters((current) => ({ ...current, health: value as PipelineHealthFilter }))} options={[{ value: 'all', label: 'Todas' }, { value: 'strong', label: 'Forte' }, { value: 'healthy', label: 'Saudável' }, { value: 'attention', label: 'Atenção' }, { value: 'critical', label: 'Crítico' }, { value: 'no_action', label: 'Sem próxima ação' }, { value: 'proposal_stale', label: 'Risco de proposta' }]} /></label>
          <label className="field"><span>Próxima ação</span><SelectionSelect value={filters.due} onValueChange={(value) => setFilters((current) => ({ ...current, due: value }))} options={[{ value: 'all', label: 'Qualquer data' }, { value: 'due', label: 'Vencida ou hoje' }, { value: 'none', label: 'Sem próxima ação' }]} /></label>
        </section>
      </div>
      <footer><Button variant="secondary" onClick={resetFilters}>Limpar filtros</Button><Button onClick={() => setFiltersOpen(false)}>Aplicar</Button></footer>
    </aside> : null}

    {canPipelineEdit ? <SelectionToolbar count={selectedIds.length} label="oportunidades selecionadas" onClear={() => setSelectedIds([])}><SelectionSelect size="sm" disabled={bulkBusy} value="" placeholder="Mover para etapa..." onValueChange={(value) => { if (value) void bulkMove(value) }} options={(snapshot?.stages ?? []).map((stage) => ({ value: stage.id, label: stage.name }))} /><SelectionSelect size="sm" disabled={bulkBusy} value="" placeholder="Alterar prioridade..." onValueChange={(value) => { if (value) void runBulk('priority', value) }} options={[{ value: 'urgent', label: '!! Urgente' }, { value: 'high', label: '↑ Alta' }, { value: 'medium', label: '– Média' }, { value: 'low', label: '↓ Baixa' }]} /><Button size="sm" variant="secondary" disabled={bulkBusy} onClick={() => void runBulk('tag')}><Tag size={15} /> Adicionar tag</Button><Button size="sm" variant="secondary" disabled={bulkBusy} onClick={() => void runBulk('followup')}><Clock3 size={15} /> Criar follow-up</Button><Button size="sm" variant="secondary" disabled={bulkBusy} onClick={() => setCadenceLeadIds([...selectedIds])}><Layers3 size={15} /> Iniciar cadência</Button>{canPipelineDelete ? <Button size="sm" variant="danger" disabled={bulkBusy} onClick={() => void runBulk('archive')}><Archive size={15} /> Arquivar</Button> : null}</SelectionToolbar> : null}

    {viewMode === 'board' ? renderBoard() : null}
    {viewMode === 'list' ? renderList() : null}
    {viewMode === 'forecast' ? renderForecast() : null}
    {viewMode === 'calendar' ? renderCalendar() : null}
    {viewMode === 'funnel' ? renderFunnel() : null}

    <DealInspectorModal open={Boolean(inspectingDeal)} insight={inspectingDeal} snapshot={snapshot} readOnly={!canPipelineEdit} onClose={() => setInspectingLeadId(null)} onExecute={runDealAction} onOpenAccount={(deal) => { setInspectingLeadId(null); navigate('leads', { leadId: deal.lead.id, action: 'account360' }) }} onOpenLead={(deal) => { setInspectingLeadId(null); setViewing(deal.lead) }} />
    <CreateLeadModal mode="opportunity" open={canPipelineCreate && createStageId !== null} initialStageId={createStageId ?? undefined} onClose={() => setCreateStageId(null)} />
    <LeadDetailsDrawer readOnly={!canPipelineEdit} lead={viewing} duplicateMatches={[]} onClose={() => setViewing(null)} onEdit={(lead) => { setViewing(null); setEditing(lead) }} onActivity={(lead, type = 'followup') => { setViewing(null); setActivityLead(lead); setActivityType(type) }} onEvent={(lead) => { setViewing(null); setActivityLead(lead); setActivityType('meeting') }} onCall={(lead) => { setViewing(null); setCallLead(lead) }} onOpenDuplicate={() => undefined} />
    <EditLeadModal lead={editing} open={canPipelineEdit && Boolean(editing)} onClose={() => setEditing(null)} />
    <ActivityModal open={canPipelineEdit && Boolean(activityLead)} initialLeadId={activityLead?.id} initialType={activityType} initialTitle={activityType === 'meeting' ? 'Reunião comercial' : 'Follow-up comercial'} onClose={() => setActivityLead(null)} />
    <CadenceModal open={canPipelineEdit && cadenceLeadIds.length > 0} initialLeadIds={cadenceLeadIds} onClose={() => setCadenceLeadIds([])} />
    <SalesMessageModal lead={messageLead} stageName={snapshot?.stages.find((stage) => stage.id === messageLead?.stageId)?.name ?? 'Pipeline'} open={Boolean(messageLead)} onClose={() => setMessageLead(null)} />
    <LazyCallWorkspaceModal open={Boolean(callLead)} config={callLead ? buildQuickCallSessionConfig({ snapshot, initialLeadId: callLead.id, leadIds: [callLead.id] }) : null} onClose={() => setCallLead(null)} />
    <StageModal open={canPipelineEdit && stageEditing !== null} stage={stageEditing === 'new' ? null : stageEditing} leadCount={stageEditing && stageEditing !== 'new' ? (snapshot?.leads.filter((lead) => lead.stageId === stageEditing.id).length ?? 0) : 0} workspaceId={workspaceId} stageIndex={stageEditing && stageEditing !== 'new' ? (snapshot?.stages.findIndex((stage) => stage.id === stageEditing.id) ?? 0) : (snapshot?.stages.length ?? 0)} stageTotal={snapshot?.stages.length ?? 1} onClose={() => { setStageEditing(null); setPreferences(loadPipelinePreferences(workspaceId)) }} />
    <Modal open={Boolean(lossRequest)} title="Registrar motivo da perda" subtitle={lossRequest ? `${lossRequest.leadName} será movido para uma etapa perdida.` : undefined} size="sm" onClose={() => closeLossReason(null)} footer={<><Button variant="secondary" onClick={() => closeLossReason(null)}>Cancelar</Button><Button disabled={!lossReason.trim()} onClick={() => closeLossReason(lossReason.trim())}><Check size={16} /> Confirmar perda</Button></>}>
      <label className="field"><span>Motivo *</span><input autoFocus list="crm-loss-reasons" value={lossReason} onChange={(event) => setLossReason(event.target.value)} placeholder="Selecione ou descreva o motivo" /><datalist id="crm-loss-reasons">{crmPreferences.commercial.lossReasons.map((reason) => <option value={reason} key={reason} />)}</datalist><small>Este registro alimenta o relatório de perdas e os playbooks comerciais.</small></label>
    </Modal>
  </div>
}
