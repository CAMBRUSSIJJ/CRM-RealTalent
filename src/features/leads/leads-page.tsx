import '../../styles/account-360.css'
import '../../styles/lead-experience-v10060.css'
import {
  AlertCircle, Archive, CalendarClock, CheckSquare, Columns3, Download, Filter, Flame, Gauge, LayoutGrid, List, MoreHorizontal,
  ArrowUpDown, Briefcase, MessageCircle, PhoneCall, Plus, RefreshCw, Search, Settings2, SlidersHorizontal, Star, Tag, Target, Trash2, Upload, UsersRound, X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useAppActions, useAppNavigation, useAppUi, useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { NativeSelectionSelect, SelectionCheckbox, SelectionSelect, SelectionToolbar } from '../../components/selection'
import { DataGrid } from '../../components/ui/data-grid'
import { EmptyState } from '../../components/ui/empty-state'
import { StatusPill } from '../../components/ui/status-pill'
import { WorkspaceFilterMenu, WorkspaceSortMenu, type WorkspaceFilterField } from '../../components/workspace/workspace-filter-system'
import { WorkspaceCommandBar, WorkspaceCommandGroup, WorkspacePageHeader, WorkspaceSummaryMetric, WorkspaceSummaryStrip } from '../../components/workspace/workspace-shell'
import { formatCurrency, formatDateTime, initials } from '../../domain/formatters'
import type { ActivityType, Lead, LeadPriority, LeadStatus, LeadTemperature } from '../../domain/types'
import { safeStorage } from '../../lib/storage'
import { findDuplicateMatches, latestLeadInteractionAt } from '../../services/lead-intelligence'
import { leadScoreInsight } from '../../services/lead-scoring'
import { leadsToCsv } from '../../services/lead-csv'
import { contactBlockedMessage } from '../../services/contact-policy'
import { canViewSensitiveField } from '../../services/team-access-control'
import { requireExportApproval } from '../../services/team-governance'
import { resolveLeadCallTarget } from '../../services/call-workspace'
import { EventModal } from '../agenda/event-modal'
import { LazyCallWorkspaceModal } from '../calls/lazy-call-workspace-modal'
import { buildQuickCallSessionConfig } from '../calls/call-session-config'
import { ActivityModal } from '../followups/activity-modal'
import { CreateLeadModal, type LeadCreateNextAction } from './create-lead-modal'
import { EditLeadModal } from './edit-lead-modal'
import { LeadDetailsDrawer, type LeadCallLaunchOptions } from './lead-details-drawer'
import { usePreferences } from '../settings/preferences-context'
import { useAuth } from '../auth/auth-context'
import { CONTACT_VIEW_COLORS, CONTACT_VIEW_ICONS, deleteContactSavedView, ensureContactStarterViews, listContactSavedViews, reorderContactSavedViews, saveContactSavedView, type ContactSavedView, type ContactSavedViewDisplay, type ContactSavedViewIcon, type ContactSavedViewVisibility, type ContactStarterViewKey } from '../../services/contact-saved-views-v10161'
import { SalesMessageModal } from '../pipeline/sales-message-modal'
import { ContactRecordPage } from './contact-record-page'
import { customColumnId, customPropertyIdFromColumn, deleteContactCustomProperty, formatContactCustomValue, listContactCustomProperties, listContactCustomValues, saveContactCustomProperty, setContactCustomValue, type ContactCustomProperty, type ContactCustomPropertyType, type ContactCustomValueMap, type ContactCustomPropertyValue } from '../../services/contact-custom-properties-v10165'

const temperatureLabel = { cold: 'Frio', warm: 'Morno', hot: 'Quente' }
const priorityLabel = { low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente' }
const statusLabel = { active: 'Ativo', won: 'Ganho', lost: 'Perdido', archived: 'Arquivado' }
const PAGE_SIZE = 25
const PREFERENCES_KEY = 'realtalent-crm-v10020-leads-preferences'
const workspaceKey = (prefix: string, workspaceId: string) => `${prefix}:${workspaceId || 'default'}`

const isTodayOrOverdue = (value: string | null) => value ? new Date(value).getTime() <= new Date().setHours(23, 59, 59, 999) : false
const isOverdue = (value: string | null) => value ? new Date(value).getTime() < Date.now() : false
const recentDays = (value: string, days: number) => new Date(value).getTime() >= Date.now() - days * 86_400_000

type ViewMode = 'table' | 'cards' | 'board'
type Density = 'comfortable' | 'compact'
type FixedLeadColumn = 'contact' | 'score' | 'stage' | 'status' | 'temperature' | 'owner' | 'nextAction' | 'value' | 'source' | 'lastActivity'
type LeadColumn = FixedLeadColumn | `custom:${string}`
type DueFilter = 'all' | 'due' | 'overdue' | 'today' | 'none'
type QualityFilter = 'all' | 'stale' | 'new'
type ContactFilterKey = Exclude<keyof LeadFilters, 'sort'>
type ViewSettingsSection = 'overview' | 'filters' | 'sort' | 'columns' | 'properties'

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

type SavedViewDisplay = ContactSavedViewDisplay
type SavedView = ContactSavedView

const defaultFilters: LeadFilters = {
  stage: 'all', temperature: 'all', priority: 'all', status: 'all', source: 'all', city: 'all', owner: 'all', due: 'all', quality: 'all', tag: 'all', sort: 'updated-desc',
}
const defaultColumns: LeadColumn[] = ['contact', 'score', 'stage', 'temperature', 'owner', 'nextAction', 'value']
const columnLabels: Record<FixedLeadColumn, string> = {
  contact: 'Contato', score: 'Score comercial', stage: 'Etapa', status: 'Status', temperature: 'Temperatura', owner: 'Responsável', nextAction: 'Próxima ação', value: 'Valor', source: 'Origem', lastActivity: 'Última atividade',
}

const contactFilterLabels: Record<ContactFilterKey, string> = {
  stage: 'Etapa', temperature: 'Temperatura', priority: 'Prioridade', status: 'Status', source: 'Origem', city: 'Cidade', owner: 'Responsável', due: 'Próxima ação', quality: 'Recência', tag: 'Tag',
}
const contactFilterKeys = Object.keys(contactFilterLabels) as ContactFilterKey[]

const contactViewIcon = (icon: ContactSavedViewIcon, size = 14) => {
  if (icon === 'flame') return <Flame size={size}/>
  if (icon === 'clock') return <CalendarClock size={size}/>
  if (icon === 'alert') return <AlertCircle size={size}/>
  if (icon === 'star') return <Star size={size}/>
  if (icon === 'target') return <Target size={size}/>
  if (icon === 'briefcase') return <Briefcase size={size}/>
  if (icon === 'board') return <Columns3 size={size}/>
  if (icon === 'list') return <SlidersHorizontal size={size}/>
  if (icon === 'table') return <List size={size}/>
  return <UsersRound size={size}/>
}

const contactViewIconLabel: Record<ContactSavedViewIcon, string> = {
  users: 'Contatos', flame: 'Quente', clock: 'Prazo', alert: 'Atenção', star: 'Favorita', target: 'Meta', briefcase: 'Comercial', table: 'Tabela', board: 'Quadro', list: 'Lista',
}

const readPreferences = (workspaceId: string): { view: ViewMode; density: Density; columns: LeadColumn[] } => {
  try {
    const stored = JSON.parse(safeStorage.getItem(workspaceKey(PREFERENCES_KEY, workspaceId)) ?? '{}') as Partial<{ view: ViewMode; density: Density; columns: LeadColumn[] }>
    return {
      view: stored.view === 'cards' ? 'cards' : stored.view === 'board' ? 'board' : 'table', density: stored.density === 'compact' ? 'compact' : 'comfortable',
      columns: Array.isArray(stored.columns) && stored.columns.length ? stored.columns.filter((item): item is LeadColumn => item in columnLabels || String(item).startsWith('custom:')) : defaultColumns,
    }
  } catch { return { view: 'table', density: 'comfortable', columns: defaultColumns } }
}


export function LeadsPage() {
  const { snapshot: rawSnapshot, repositoryMode, currentWorkspace, teamAccess, canTeamAccess, canTeamAccessRecord } = useAppWorkspace()
  const { routeContext, clearRouteContext, navigate } = useAppNavigation()
  const { notify, confirmAction, promptAction } = useAppUi()
  const { importLeadFile, bulkUpdateLeads, bulkDeleteLeads, updateLead, createActivity } = useAppActions()
  const { preferences: crmPreferences } = usePreferences()
  const { user } = useAuth()
  const canContactView = canTeamAccess('view','contacts')
  const canContactCreate = canTeamAccess('create','contacts')
  const canContactEdit = canTeamAccess('edit','contacts')
  const canContactDelete = canTeamAccess('delete','contacts')
  const canContactExport = canTeamAccess('export','contacts')
  const canCommunicate = canTeamAccess('edit','communications')
  const canViewPhone = canViewSensitiveField(teamAccess,'contact_phone')
  const canViewEmail = canViewSensitiveField(teamAccess,'contact_email')
  const canViewDealValue = canViewSensitiveField(teamAccess,'deal_value')
  const snapshot = useMemo(() => {
    if (!rawSnapshot) return null
    if (!canContactView) return { ...rawSnapshot, leads: [], contacts: [], companies: [], opportunities: [], activities: [], calls: [], events: [] }
    const leads = rawSnapshot.leads.filter((lead) => canTeamAccessRecord('contacts', lead.ownerId))
    const leadIds = new Set(leads.map((lead) => lead.id))
    const contacts = rawSnapshot.contacts.filter((contact) => canTeamAccessRecord('contacts', contact.relationshipOwnerId) || contact.leadIds.some((id) => leadIds.has(id)))
    const contactIds = new Set(contacts.map((contact) => contact.id))
    const companyIds = new Set([...leads.map((lead)=>lead.companyId).filter(Boolean), ...contacts.map((contact)=>contact.companyId).filter(Boolean)] as string[])
    return { ...rawSnapshot, leads, contacts, companies: rawSnapshot.companies.filter((company)=>companyIds.has(company.id)), opportunities: rawSnapshot.opportunities.filter((item)=>leadIds.has(item.leadId)), activities: rawSnapshot.activities.filter((item)=>Boolean(item.leadId && leadIds.has(item.leadId))), calls: rawSnapshot.calls.filter((item)=>leadIds.has(item.leadId)), events: rawSnapshot.events.filter((item)=>!item.leadId || leadIds.has(item.leadId)) }
  }, [canContactView, canTeamAccessRecord, rawSnapshot])
  const workspaceId = snapshot?.workspace.id ?? rawSnapshot?.workspace.id ?? 'default'
  const propertyContext = useMemo(() => ({ mode: repositoryMode, workspaceId, userId: user?.id ?? 'anonymous' } as const), [repositoryMode, user?.id, workspaceId])
  const preferences = useMemo(() => readPreferences(workspaceId), [workspaceId])
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<LeadFilters>(defaultFilters)
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false)
  const [viewSettingsSection, setViewSettingsSection] = useState<ViewSettingsSection>('overview')
  const [filterEditorKeys, setFilterEditorKeys] = useState<ContactFilterKey[]>([])
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
  const [viewCreatorOpen, setViewCreatorOpen] = useState(false)
  const [viewDraftId, setViewDraftId] = useState<string | null>(null)
  const [viewDraftDisplay, setViewDraftDisplay] = useState<SavedViewDisplay | null>(null)
  const [viewDraftName, setViewDraftName] = useState('')
  const [viewDraftVisibility, setViewDraftVisibility] = useState<ContactSavedViewVisibility>('private')
  const [viewDraftDefault, setViewDraftDefault] = useState(false)
  const [viewDraftColumns, setViewDraftColumns] = useState<LeadColumn[]>(preferences.columns)
  const [viewDraftColor, setViewDraftColor] = useState<string>(CONTACT_VIEW_COLORS[0])
  const [viewDraftIcon, setViewDraftIcon] = useState<ContactSavedViewIcon>('table')
  const [viewDraftSort, setViewDraftSort] = useState(defaultFilters.sort)
  const [viewDraftFilters, setViewDraftFilters] = useState<Record<string,string>>({ ...defaultFilters })
  const [viewDraftPosition, setViewDraftPosition] = useState(0)
  const [viewDraftStarterKey, setViewDraftStarterKey] = useState<ContactStarterViewKey | null>(null)
  const [settingsName, setSettingsName] = useState('')
  const [settingsColor, setSettingsColor] = useState<string>(CONTACT_VIEW_COLORS[0])
  const [settingsIcon, setSettingsIcon] = useState<ContactSavedViewIcon>('table')
  const [settingsVisibility, setSettingsVisibility] = useState<ContactSavedViewVisibility>('private')
  const [viewMenuId, setViewMenuId] = useState<string | null>(null)
  const [savedViews, setSavedViews] = useState<SavedView[]>([])
  const [customProperties, setCustomProperties] = useState<ContactCustomProperty[]>([])
  const [customValues, setCustomValues] = useState<ContactCustomValueMap>({})
  const [customFilters, setCustomFilters] = useState<Record<string,string>>({})
  const [customFilterEditorIds, setCustomFilterEditorIds] = useState<string[]>([])
  const [propertyDraftId, setPropertyDraftId] = useState<string | null>(null)
  const [propertyDraftName, setPropertyDraftName] = useState('')
  const [propertyDraftType, setPropertyDraftType] = useState<ContactCustomPropertyType>('text')
  const [propertyDraftOptions, setPropertyDraftOptions] = useState('')
  const [activeView, setActiveView] = useState('custom')
  const [dragViewId, setDragViewId] = useState<string | null>(null)
  const [activityLead, setActivityLead] = useState<Lead | null>(null)
  const [activityType, setActivityType] = useState<ActivityType>('followup')
  const [eventLead, setEventLead] = useState<Lead | null>(null)
  const [callLead, setCallLead] = useState<Lead | null>(null)
  const [callLaunchOptions, setCallLaunchOptions] = useState<LeadCallLaunchOptions | undefined>(undefined)
  const [messageLead, setMessageLead] = useState<Lead | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const openCall = (lead: Lead, options?: LeadCallLaunchOptions) => {
    setCallLaunchOptions(options)
    setCallLead(lead)
  }

  const closeCall = () => {
    setCallLead(null)
    setCallLaunchOptions(undefined)
  }

  const handleLeadCreated = (lead: Lead, action: LeadCreateNextAction) => {
    if (action === 'open') navigate('leads', { leadId: lead.id, action: 'contact-record' })
    else if (action === 'call') openCall(lead)
    else if (action === 'followup') { setActivityLead(lead); setActivityType('followup') }
  }


  useEffect(() => {
    if (routeContext.leadId && routeContext.action !== 'contact-record' && snapshot?.leads.some((lead) => lead.id === routeContext.leadId)) setDrawerLeadId(routeContext.leadId)
    if (routeContext.action === 'contact-record') setDrawerLeadId(null)
    if (routeContext.action === 'create-lead') setCreateOpen(true)
  }, [routeContext.action, routeContext.leadId, snapshot?.leads])

  const allLeads = snapshot?.leads ?? []
  const duplicateMatches = useMemo(() => findDuplicateMatches(allLeads), [allLeads])
  const sources = useMemo(() => [...new Set(allLeads.map((lead) => lead.source).filter(Boolean))].sort(), [allLeads])
  const cities = useMemo(() => [...new Set(allLeads.map((lead) => lead.city).filter(Boolean))].sort(), [allLeads])
  const owners = useMemo(() => [...new Set(allLeads.map((lead) => lead.ownerName).filter(Boolean))].sort(), [allLeads])
  const tags = useMemo(() => [...new Set(allLeads.flatMap((lead) => lead.tags).filter(Boolean))].sort(), [allLeads])
  const customPropertyById = useMemo(() => new Map(customProperties.map((property) => [property.id, property])), [customProperties])
  const columnLabel = (column: LeadColumn) => { const propertyId = customPropertyIdFromColumn(column); return propertyId ? customPropertyById.get(propertyId)?.name ?? 'Propriedade' : columnLabels[column as FixedLeadColumn] }
  const validViewColumn = (column: string): column is LeadColumn => column in columnLabels || column.startsWith('custom:')
  const drawerLead = drawerLeadId ? allLeads.find((lead) => lead.id === drawerLeadId) ?? null : null
  const recordLead = routeContext.action === 'contact-record' && routeContext.leadId ? allLeads.find((lead) => lead.id === routeContext.leadId) ?? null : null

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
      const customSearch = Object.values(customValues[lead.id] ?? {}).map((value) => String(value ?? '')).join(' ')
      const haystack = `${lead.name} ${lead.company} ${canViewPhone?lead.phone:''} ${canViewEmail?lead.email:''} ${lead.city} ${lead.source} ${lead.ownerName} ${lead.notes} ${lead.tags.join(' ')} ${customSearch}`.toLowerCase()
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
        && Object.entries(customFilters).every(([propertyId, expected]) => {
          if (!expected) return true
          const property = customPropertyById.get(propertyId)
          const actual = customValues[lead.id]?.[propertyId]
          if (!property) return true
          if (property.type === 'checkbox') return String(Boolean(actual)) === expected
          if (property.type === 'number' || property.type === 'currency') return Number(actual) === Number(expected)
          if (property.type === 'select' || property.type === 'date') return String(actual ?? '') === expected
          return String(actual ?? '').toLocaleLowerCase('pt-BR').includes(expected.toLocaleLowerCase('pt-BR'))
        })
    })
    return filtered.sort((a, b) => {
      if (filters.sort === 'name') return a.name.localeCompare(b.name, 'pt-BR')
      if (filters.sort === 'value-desc') return b.value - a.value
      if (filters.sort === 'next-action') return (a.nextActionAt ?? '9999').localeCompare(b.nextActionAt ?? '9999')
      if (filters.sort === 'created-desc') return b.createdAt.localeCompare(a.createdAt)
      if (filters.sort === 'priority') return (scoreByLead.get(b.id)?.score ?? 0) - (scoreByLead.get(a.id)?.score ?? 0)
      if (filters.sort.startsWith('custom:')) {
        const [, propertyId, direction = 'asc'] = filters.sort.split(':')
        const property = customPropertyById.get(propertyId)
        if (property) {
          const left = customValues[a.id]?.[propertyId], right = customValues[b.id]?.[propertyId]
          const compare = property.type === 'number' || property.type === 'currency' ? Number(left ?? Number.POSITIVE_INFINITY) - Number(right ?? Number.POSITIVE_INFINITY) : String(left ?? '￿').localeCompare(String(right ?? '￿'), 'pt-BR')
          return direction === 'desc' ? -compare : compare
        }
      }
      return b.updatedAt.localeCompare(a.updatedAt)
    })
  }, [allLeads, customFilters, customPropertyById, customValues, filters, lastInteraction, query, scoreByLead])

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
    setViewMode(next.view); setDensity(next.density); setVisibleColumns(next.columns); setViewDraftColumns(next.columns); setActiveView('custom')
    let cancelled = false
    const userId = user?.id ?? 'anonymous'
    const context = { mode: repositoryMode, workspaceId, userId } as const
    void (async () => {
      const [properties, values] = await Promise.all([listContactCustomProperties(context), listContactCustomValues(context)])
      if (cancelled) return
      setCustomProperties(properties); setCustomValues(values)
      await ensureContactStarterViews(context)
      const views = await listContactSavedViews(context)
      if (cancelled) return
      setSavedViews(views)
      const preferred = views.find((view) => view.isDefault && view.createdBy === userId) ?? views.find((view) => view.starterKey === 'all' && view.createdBy === userId) ?? views[0]
      if (!preferred) return
      setFilters({ ...defaultFilters, ...(preferred.filters as Partial<LeadFilters>), sort: preferred.sort || String(preferred.filters.sort ?? 'updated-desc') })
      setVisibleColumns(preferred.columns.filter(validViewColumn))
      setDensity(preferred.density)
      setViewMode(preferred.display === 'board' ? 'board' : preferred.display === 'compact' ? 'cards' : 'table')
      setActiveView(preferred.id)
    })()
    return () => { cancelled = true }
  }, [repositoryMode, user?.id, workspaceId])
  useEffect(() => {
    safeStorage.setItem(workspaceKey(PREFERENCES_KEY, workspaceId), JSON.stringify({ view: viewMode, density, columns: visibleColumns }))
  }, [density, viewMode, visibleColumns, workspaceId])

  const updateFilters = (patch: Partial<LeadFilters>) => { setFilters((current) => ({ ...current, ...patch })) }
  const resetFilters = () => { setQuery(''); setFilters(defaultFilters); setCustomFilters({}) }
  const hasFilters = Boolean(query || Object.values(customFilters).some(Boolean) || Object.entries(filters).some(([key, value]) => value !== defaultFilters[key as keyof LeadFilters]))

  const activeSavedView = savedViews.find((view) => view.id === activeView) ?? null
  const activeViewOwned = Boolean(activeSavedView && (repositoryMode !== 'supabase' || activeSavedView.createdBy === (user?.id ?? 'anonymous')))

  useEffect(() => {
    if (!activeSavedView) return
    setSettingsName(activeSavedView.name)
    setSettingsColor(activeSavedView.color)
    setSettingsIcon(activeSavedView.icon)
    setSettingsVisibility(activeSavedView.visibility)
  }, [activeSavedView?.id, activeSavedView?.updatedAt])

  const currentActiveFilterKeys = () => contactFilterKeys.filter((key) => filters[key] !== defaultFilters[key])
  const openViewSettings = (section: ViewSettingsSection = 'overview') => {
    setViewSettingsSection(section)
    setFilterEditorKeys(currentActiveFilterKeys())
    setCustomFilterEditorIds(Object.keys(customFilters).filter((id) => customFilters[id]))
    setViewSettingsOpen(true)
    setViewMenuId(null)
  }

  const applySavedView = (view: SavedView) => {
    setQuery('')
    const nextCustomFilters: Record<string,string> = {}
    for (const [key, value] of Object.entries(view.filters)) if (key.startsWith('custom:')) nextCustomFilters[key.slice(7)] = String(value)
    setCustomFilters(nextCustomFilters)
    setFilters({ ...defaultFilters, ...(view.filters as Partial<LeadFilters>), sort: view.sort || String(view.filters.sort ?? 'updated-desc') })
    setVisibleColumns(view.columns.filter(validViewColumn))
    setActiveView(view.id)
    setDensity(view.density)
    setViewMode(view.display === 'board' ? 'board' : view.display === 'compact' ? 'cards' : 'table')
  }

  const applyStarterView = (starterKey: ContactStarterViewKey) => {
    const starter = savedViews.find((view) => view.starterKey === starterKey)
    if (starter) { applySavedView(starter); return }
    setQuery('')
    if (starterKey === 'hot') setFilters({ ...defaultFilters, status: 'active', temperature: 'hot', sort: 'priority' })
    else if (starterKey === 'due') setFilters({ ...defaultFilters, status: 'active', due: 'due', sort: 'next-action' })
    else if (starterKey === 'no-action') setFilters({ ...defaultFilters, status: 'active', due: 'none' })
    else setFilters(defaultFilters)
    setActiveView('custom')
  }

  const resetViewDraft = () => {
    setViewDraftId(null); setViewDraftDisplay(null); setViewDraftName(''); setViewDraftVisibility('private'); setViewDraftDefault(false)
    setViewDraftColumns([...visibleColumns]); setViewDraftColor(CONTACT_VIEW_COLORS[0]); setViewDraftIcon('table'); setViewDraftSort(filters.sort)
    setViewDraftFilters({ ...filters }); setViewDraftPosition(0); setViewDraftStarterKey(null)
  }

  const beginCreateSavedView = (display: SavedViewDisplay) => {
    const ownPositions = savedViews.filter((view) => view.createdBy === (user?.id ?? 'anonymous')).map((view) => view.position)
    setViewDraftId(null); setViewDraftDisplay(display)
    setViewDraftName('')
    setViewDraftVisibility('private'); setViewDraftDefault(false); setViewDraftColumns([...visibleColumns])
    setViewDraftColor(display === 'board' ? '#6f5bd3' : CONTACT_VIEW_COLORS[0]); setViewDraftIcon(display === 'board' ? 'board' : display === 'compact' ? 'list' : 'table')
    setViewDraftSort(filters.sort); setViewDraftFilters({ ...filters }); setViewDraftPosition((ownPositions.length ? Math.max(...ownPositions) : -1) + 1); setViewDraftStarterKey(null)
  }

  const beginEditSavedView = (view: SavedView) => {
    if (repositoryMode === 'supabase' && view.createdBy !== user?.id) { notify('info', 'Somente o autor pode configurar esta exibição compartilhada. Duplique-a para criar sua própria versão.'); return }
    setViewDraftId(view.id); setViewDraftDisplay(view.display); setViewDraftName(view.name); setViewDraftVisibility(view.visibility); setViewDraftDefault(view.isDefault)
    setViewDraftColumns(view.columns.filter(validViewColumn)); setViewDraftColor(view.color); setViewDraftIcon(view.icon)
    setViewDraftSort(view.sort); setViewDraftFilters({ ...view.filters }); setViewDraftPosition(view.position); setViewDraftStarterKey(view.starterKey)
    setViewCreatorOpen(true); setViewMenuId(null)
  }

  const saveViewDraft = async () => {
    if (!viewDraftDisplay || !viewDraftName.trim()) return
    const userId = user?.id ?? 'anonymous'
    const context = { mode: repositoryMode, workspaceId, userId } as const
    const id = viewDraftId ?? (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const saved = await saveContactSavedView(context, {
      id, name: viewDraftName.trim(), display: viewDraftDisplay, filters: { ...viewDraftFilters, ...Object.fromEntries(Object.entries(customFilters).filter(([,value]) => value).map(([id,value]) => [`custom:${id}`, value])), sort: viewDraftSort }, columns: viewDraftColumns,
      density: viewDraftDisplay === 'compact' ? 'compact' : density, sort: viewDraftSort, groupBy: 'stage', visibility: viewDraftVisibility,
      isDefault: viewDraftDefault, color: viewDraftColor, icon: viewDraftIcon, position: viewDraftPosition, starterKey: viewDraftStarterKey, isArchived: false,
    })
    const views = await listContactSavedViews(context)
    setSavedViews(views); applySavedView(saved); setViewCreatorOpen(false); resetViewDraft()
    notify('success', viewDraftId ? `Exibição “${saved.name}” atualizada.` : `Exibição “${saved.name}” criada${saved.visibility === 'workspace' ? ' para o workspace' : ''}.`)
  }

  // Nome mantido para retrocompatibilidade dos contratos V101.6.0/V101.6.1.
  const createSavedView = saveViewDraft

  const removeSavedView = async (view: SavedView) => {
    const userId = user?.id ?? 'anonymous'
    if (view.starterKey === 'all') { notify('info', 'A exibição “Todos os contatos” é a base estrutural e não pode ser excluída.'); return }
    if (savedViews.length <= 1) { notify('info', 'Mantenha pelo menos uma exibição em Contatos.'); return }
    if (repositoryMode === 'supabase' && view.createdBy !== user?.id) { notify('info', 'Somente o autor pode excluir uma exibição compartilhada. Duplique-a para criar sua própria versão.'); return }
    const context = { mode: repositoryMode, workspaceId, userId } as const
    await deleteContactSavedView(context, view)
    const views = await listContactSavedViews(context)
    setSavedViews(views); setViewMenuId(null)
    if (activeView === view.id) {
      const next = views.find((item) => item.isDefault && item.createdBy === userId) ?? views[0]
      if (next) applySavedView(next)
      else { setFilters(defaultFilters); setActiveView('custom') }
    }
  }

  const renameSavedView = async (view: SavedView) => {
    if (repositoryMode === 'supabase' && view.createdBy !== user?.id) { notify('info', 'Somente o autor pode renomear esta exibição compartilhada.'); return }
    const name = (await promptAction({ title: 'Renomear exibição', description: 'Atualize o nome desta exibição sem alterar seus filtros, colunas ou formato.', label: 'Nome', initialValue: view.name, confirmLabel: 'Salvar nome' }))?.trim()
    if (!name) return
    const saved = await saveContactSavedView({ mode: repositoryMode, workspaceId, userId: user?.id ?? 'anonymous' }, { ...view, name })
    setSavedViews((current) => current.map((item) => item.id === saved.id ? saved : item)); setViewMenuId(null)
  }

  const duplicateSavedView = async (view: SavedView) => {
    const userId = user?.id ?? 'anonymous'
    const ownPositions = savedViews.filter((item) => item.createdBy === userId).map((item) => item.position)
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const saved = await saveContactSavedView({ mode: repositoryMode, workspaceId, userId }, { ...view, id, name: `${view.name} — cópia`, visibility: 'private', isDefault: false, position: (ownPositions.length ? Math.max(...ownPositions) : -1) + 1, starterKey: null, isArchived: false })
    const views = await listContactSavedViews({ mode: repositoryMode, workspaceId, userId })
    setSavedViews(views); setViewMenuId(null); applySavedView(saved); notify('success', 'Exibição duplicada.')
  }

  const setDefaultSavedView = async (view: SavedView) => {
    const userId = user?.id ?? 'anonymous'
    const isOwned = repositoryMode !== 'supabase' || view.createdBy === userId
    const id = isOwned ? view.id : (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const ownPositions = savedViews.filter((item) => item.createdBy === userId).map((item) => item.position)
    const saved = await saveContactSavedView({ mode: repositoryMode, workspaceId, userId }, { ...view, id, name: isOwned ? view.name : `${view.name} — minha`, visibility: isOwned ? view.visibility : 'private', isDefault: true, position: isOwned ? view.position : (ownPositions.length ? Math.max(...ownPositions) : -1) + 1, starterKey: isOwned ? view.starterKey : null, isArchived: false })
    const views = await listContactSavedViews({ mode: repositoryMode, workspaceId, userId })
    setSavedViews(views); setViewMenuId(null); applySavedView(saved); notify('success', isOwned ? 'Exibição padrão atualizada.' : 'Uma cópia pessoal foi criada e definida como padrão.')
  }

  const saveCurrentStateToView = async (view: SavedView) => {
    if (repositoryMode === 'supabase' && view.createdBy !== user?.id) { notify('info', 'Duplique uma exibição compartilhada para salvar alterações próprias.'); return }
    const saved = await saveContactSavedView({ mode: repositoryMode, workspaceId, userId: user?.id ?? 'anonymous' }, {
      ...view, filters: { ...filters, ...Object.fromEntries(Object.entries(customFilters).filter(([,value]) => value).map(([id,value]) => [`custom:${id}`, value])) }, columns: visibleColumns, density, sort: filters.sort, display: viewMode === 'board' ? 'board' : viewMode === 'cards' ? 'compact' : 'table',
    })
    setSavedViews((current) => current.map((item) => item.id === saved.id ? saved : item)); setViewMenuId(null); setActiveView(saved.id)
    notify('success', 'Alterações salvas nesta exibição.')
  }

  const saveActiveViewSettings = async () => {
    if (!activeSavedView) { notify('info', 'Escolha uma exibição salva antes de salvar configurações.'); return }
    if (!activeViewOwned) { notify('info', 'Esta exibição é compartilhada por outra pessoa. Duplique-a para editar.'); return }
    const saved = await saveContactSavedView({ mode: repositoryMode, workspaceId, userId: user?.id ?? 'anonymous' }, {
      ...activeSavedView,
      name: settingsName.trim() || activeSavedView.name,
      color: settingsColor,
      icon: settingsIcon,
      visibility: settingsVisibility,
      filters: { ...filters, ...Object.fromEntries(Object.entries(customFilters).filter(([,value]) => value).map(([id,value]) => [`custom:${id}`, value])) },
      columns: visibleColumns,
      density,
      sort: filters.sort,
      display: viewMode === 'board' ? 'board' : viewMode === 'cards' ? 'compact' : 'table',
    })
    setSavedViews((current) => current.map((item) => item.id === saved.id ? saved : item))
    setActiveView(saved.id)
    notify('success', `Exibição “${saved.name}” atualizada.`)
  }

  const resetActiveViewSettings = () => {
    if (!activeSavedView) return
    applySavedView(activeSavedView)
    setSettingsName(activeSavedView.name); setSettingsColor(activeSavedView.color); setSettingsIcon(activeSavedView.icon); setSettingsVisibility(activeSavedView.visibility)
    setFilterEditorKeys(contactFilterKeys.filter((key) => (activeSavedView.filters[key] ?? defaultFilters[key]) !== defaultFilters[key]))
    setCustomFilterEditorIds(Object.keys(activeSavedView.filters).filter((key) => key.startsWith('custom:')).map((key) => key.slice(7)))
    notify('info', 'Alterações não salvas foram descartadas.')
  }

  const changeViewDisplay = (display: SavedViewDisplay) => {
    setViewMode(display === 'board' ? 'board' : display === 'compact' ? 'cards' : 'table')
    if (display === 'compact') setDensity('compact')
  }

  const addFilterEditorKey = (key: ContactFilterKey) => {
    setFilterEditorKeys((current) => current.includes(key) ? current : [...current, key])
  }
  const removeFilterEditorKey = (key: ContactFilterKey) => {
    setFilterEditorKeys((current) => current.filter((item) => item !== key))
    setFilters((current) => ({ ...current, [key]: defaultFilters[key] } as LeadFilters))
  }
  const setFilterValue = (key: ContactFilterKey, value: string) => setFilters((current) => ({ ...current, [key]: value } as LeadFilters))

  const resetPropertyDraft = () => { setPropertyDraftId(null); setPropertyDraftName(''); setPropertyDraftType('text'); setPropertyDraftOptions('') }
  const editCustomProperty = (property: ContactCustomProperty) => { setPropertyDraftId(property.id); setPropertyDraftName(property.name); setPropertyDraftType(property.type); setPropertyDraftOptions(property.options.join('\n')); setViewSettingsSection('properties') }
  const persistCustomProperty = async () => {
    try {
      const property = await saveContactCustomProperty(propertyContext, { id: propertyDraftId ?? undefined, name: propertyDraftName, type: propertyDraftType, options: propertyDraftOptions.split(/[,\n]/).map((item) => item.trim()).filter(Boolean) })
      const properties = await listContactCustomProperties(propertyContext)
      setCustomProperties(properties)
      if (!propertyDraftId) { const column = customColumnId(property.id) as LeadColumn; setVisibleColumns((current) => current.includes(column) ? current : [...current, column]) }
      resetPropertyDraft(); notify('success', propertyDraftId ? 'Propriedade atualizada.' : 'Propriedade criada e adicionada à exibição.')
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível salvar a propriedade.') }
  }
  const removeCustomProperty = async (property: ContactCustomProperty) => {
    if (!await confirmAction({ title: `Excluir propriedade “${property.name}”?`, description: 'O campo será removido da base e os valores associados serão apagados.', confirmLabel: 'Excluir propriedade', tone: 'danger', details: ['Esta ação afeta todas as exibições do workspace.', 'Os valores desta propriedade não poderão ser recuperados.'] })) return
    try {
      await deleteContactCustomProperty(propertyContext, property.id)
      const column = customColumnId(property.id) as LeadColumn
      setCustomProperties((current) => current.filter((item) => item.id !== property.id)); setVisibleColumns((current) => current.filter((item) => item !== column)); setViewDraftColumns((current) => current.filter((item) => item !== column)); setCustomFilters((current) => { const next = { ...current }; delete next[property.id]; return next }); setCustomFilterEditorIds((current) => current.filter((id) => id !== property.id)); resetPropertyDraft(); notify('success', 'Propriedade excluída.')
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível excluir a propriedade.') }
  }
  const persistCustomValue = async (leadId: string, property: ContactCustomProperty, value: ContactCustomPropertyValue) => {
    setCustomValues((current) => ({ ...current, [leadId]: { ...(current[leadId] ?? {}), [property.id]: value } }))
    try { await setContactCustomValue(propertyContext, leadId, property.id, value) } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível salvar o valor.'); setCustomValues(await listContactCustomValues(propertyContext)) }
  }
  const renderCustomPropertyEditor = (lead: Lead, property: ContactCustomProperty) => {
    const value = customValues[lead.id]?.[property.id]
    if (!canContactEdit) return <span>{formatContactCustomValue(property, value)}</span>
    if (property.type === 'checkbox') return <input className="contact-custom-cell-v10165__checkbox" type="checkbox" checked={value === true} onChange={(event) => void persistCustomValue(lead.id, property, event.target.checked)} aria-label={`${property.name} de ${lead.name}`} />
    if (property.type === 'select') return <NativeSelectionSelect className="contact-custom-cell-v10165__input" value={String(value ?? '')} onChange={(event) => void persistCustomValue(lead.id, property, event.target.value || null)}><option value="">—</option>{property.options.map((option) => <option key={option} value={option}>{option}</option>)}</NativeSelectionSelect>
    if (property.type === 'date') return <input className="contact-custom-cell-v10165__input" type="date" value={String(value ?? '')} onChange={(event) => void persistCustomValue(lead.id, property, event.target.value || null)} />
    if (property.type === 'number' || property.type === 'currency') return <input className="contact-custom-cell-v10165__input contact-custom-cell-v10165__input--number" type="number" step={property.type === 'currency' ? '0.01' : 'any'} value={value == null ? '' : String(value)} placeholder="—" onChange={(event) => void persistCustomValue(lead.id, property, event.target.value === '' ? null : Number(event.target.value))} />
    return <input className="contact-custom-cell-v10165__input" value={String(value ?? '')} placeholder="—" onChange={(event) => void persistCustomValue(lead.id, property, event.target.value || null)} />
  }

  const moveSavedView = async (view: SavedView, direction: -1 | 1) => {
    const userId = user?.id ?? 'anonymous'
    if (repositoryMode === 'supabase' && view.createdBy !== userId) { notify('info', 'Duplique uma exibição compartilhada para reorganizá-la na sua área.'); return }
    const owned = savedViews.filter((item) => item.createdBy === userId).sort((a,b) => a.position-b.position)
    const index = owned.findIndex((item) => item.id === view.id); const target = index + direction
    if (index < 0 || target < 0 || target >= owned.length) return
    const reordered = [...owned]; const [moving] = reordered.splice(index,1); reordered.splice(target,0,moving)
    const context = { mode: repositoryMode, workspaceId, userId } as const
    await reorderContactSavedViews(context, reordered.map((item) => item.id))
    setSavedViews(await listContactSavedViews(context)); setViewMenuId(null)
  }

  const dropSavedView = async (target: SavedView) => {
    const userId = user?.id ?? 'anonymous'
    if (!dragViewId || dragViewId === target.id || target.createdBy !== userId) { setDragViewId(null); return }
    const owned = savedViews.filter((item) => item.createdBy === userId).sort((a,b) => a.position-b.position)
    const from = owned.findIndex((item) => item.id === dragViewId), to = owned.findIndex((item) => item.id === target.id)
    if (from < 0 || to < 0) { setDragViewId(null); return }
    const reordered = [...owned]; const [moving] = reordered.splice(from,1); reordered.splice(to,0,moving)
    const context = { mode: repositoryMode, workspaceId, userId } as const
    await reorderContactSavedViews(context, reordered.map((item) => item.id))
    setSavedViews(await listContactSavedViews(context)); setDragViewId(null)
  }

  const downloadCsv = async () => {
    if (!snapshot || !currentWorkspace) return
    const chosen = selected.size ? snapshot.leads.filter((lead) => selected.has(lead.id)) : leads
    const approved = await requireExportApproval(repositoryMode,currentWorkspace.id,teamAccess,{userName:user?.displayName ?? user?.email ?? 'Usuário',resource:'contacts',entityType:'contacts_export',count:chosen.length})
    if (!approved) { notify('warning','Exportação enviada para aprovação. Assim que um gestor aprovar, repita a exportação.'); return }
    const sanitized = chosen.map((lead)=>({...lead,phone:canViewPhone?lead.phone:'',email:canViewEmail?lead.email:'',value:canViewDealValue?lead.value:0}))
    const blob = new Blob([leadsToCsv(sanitized, snapshot.stages)], { type: 'text/csv;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob); link.download = selected.size ? 'contatos-selecionados-v101-6.csv' : 'contatos-filtrados-v101-6.csv'; link.click(); URL.revokeObjectURL(link.href)
    notify('success', `${chosen.length} contato(s) exportado(s). Campos ocultos pelo perfil não foram incluídos.`)
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
    const tag = (await promptAction({ title: 'Adicionar tag', description: `A tag será adicionada a ${selected.size} contato(s) selecionado(s).`, label: 'Nome da tag', confirmLabel: 'Adicionar tag', placeholder: 'Ex.: Prioridade comercial' }))?.trim()
    if (!tag || !selected.size) return
    setBusy(true)
    try {
      const chosen = allLeads.filter((lead) => selected.has(lead.id))
      await Promise.all(chosen.map((lead) => updateLead(lead.id, { tags: Array.from(new Set([...lead.tags, tag])) })))
      setSelected(new Set()); notify('success', `Tag adicionada a ${chosen.length} contato(s).`)
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível adicionar a tag.') }
    finally { setBusy(false) }
  }

  const createFollowupsSelected = async () => {
    if (!selected.size) return
    const due = new Date(); due.setDate(due.getDate() + 1); due.setHours(9, 0, 0, 0)
    setBusy(true)
    try {
      const chosen = allLeads.filter((lead) => selected.has(lead.id))
      await Promise.all(chosen.map((lead) => createActivity({ leadId: lead.id, type: 'followup', title: `Retomar contato — ${lead.name}`, description: 'Follow-up criado pela ação em massa da base de contatos.', dueAt: due.toISOString(), completedAt: null, assignedTo: lead.ownerId })))
      setSelected(new Set()); notify('success', `${chosen.length} follow-up(s) criado(s) para amanhã às 9h.`)
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível criar os follow-ups.') }
    finally { setBusy(false) }
  }

  const removeSelected = async () => {
    if (!selected.size) return
    if (!await confirmAction({ title: `Excluir ${selected.size} contato(s)?`, description: 'Os cadastros selecionados serão removidos permanentemente da base.', confirmLabel: 'Excluir contatos', tone: 'danger', details: ['Esta ação não pode ser desfeita.', 'Considere arquivar quando precisar preservar o histórico.'] })) return
    setBusy(true)
    try { await bulkDeleteLeads([...selected]); setSelected(new Set()) }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Falha ao excluir contatos.') }
    finally { setBusy(false) }
  }

  const togglePage = () => setSelected((current) => {
    const next = new Set(current); pageIds.forEach((id) => pageSelected ? next.delete(id) : next.add(id)); return next
  })
  const toggleColumn = (column: LeadColumn) => setVisibleColumns((current) => current.includes(column) ? current.filter((item) => item !== column) : [...current, column])
  const openActivity = (lead: Lead, type: ActivityType = 'followup') => { setActivityLead(lead); setActivityType(type) }
  const openWhatsApp = (lead: Lead) => {
    const blocked = contactBlockedMessage(lead, 'whatsapp')
    if (blocked) { notify('info', blocked); return }
    const target = resolveLeadCallTarget(lead, snapshot?.contacts ?? [])
    if (!target.phone.replace(/\D/g, '')) { notify('info', 'Nenhum telefone disponível para contato nesta conta.'); return }
    setMessageLead(lead)
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
    for (const [propertyId, value] of Object.entries(customFilters)) {
      if (!value) continue
      const property = customPropertyById.get(propertyId)
      if (property) chips.push({ key: `custom:${propertyId}`, label: `${property.name}: ${property.type === 'checkbox' ? (value === 'true' ? 'Sim' : 'Não') : value}`, clear: () => setCustomFilters((current) => ({ ...current, [propertyId]: '' })) })
    }
    return chips
  }, [customFilters, customPropertyById, filters, snapshot])

  const universalContactFilters = useMemo<WorkspaceFilterField[]>(() => [
    { key: 'stage', label: 'Etapa', value: filters.stage, allLabel: 'Todas', group: 'Propriedades do contato', options: (snapshot?.stages ?? []).map((stage) => ({ value: stage.id, label: stage.name })) },
    { key: 'owner', label: 'Responsável', value: filters.owner, allLabel: 'Todos', group: 'Propriedades do contato', options: [{ value: 'none', label: 'Sem responsável' }, ...owners.map((item) => ({ value: item, label: item }))] },
    { key: 'temperature', label: 'Temperatura', value: filters.temperature, allLabel: 'Todas', group: 'Qualificação', options: [{ value: 'hot', label: 'Quente' }, { value: 'warm', label: 'Morno' }, { value: 'cold', label: 'Frio' }] },
    { key: 'priority', label: 'Prioridade', value: filters.priority, allLabel: 'Todas', group: 'Qualificação', options: [{ value: 'urgent', label: 'Urgente' }, { value: 'high', label: 'Alta' }, { value: 'medium', label: 'Média' }, { value: 'low', label: 'Baixa' }] },
    { key: 'status', label: 'Status do lead', value: filters.status, allLabel: 'Todos', group: 'Qualificação', options: [{ value: 'active', label: 'Ativo' }, { value: 'won', label: 'Ganho' }, { value: 'lost', label: 'Perdido' }, { value: 'archived', label: 'Arquivado' }] },
    { key: 'source', label: 'Origem', value: filters.source, allLabel: 'Todas', group: 'Aquisição', options: sources.map((item) => ({ value: item, label: item })) },
    { key: 'city', label: 'Cidade', value: filters.city, allLabel: 'Todas', group: 'Localização', options: cities.map((item) => ({ value: item, label: item })) },
    { key: 'due', label: 'Próxima ação', value: filters.due, allLabel: 'Qualquer data', group: 'Atividade', options: [{ value: 'overdue', label: 'Atrasada' }, { value: 'today', label: 'Hoje' }, { value: 'due', label: 'Atrasada ou hoje' }, { value: 'none', label: 'Sem próxima ação' }] },
    { key: 'quality', label: 'Recência', value: filters.quality, allLabel: 'Qualquer', group: 'Atividade', options: [{ value: 'stale', label: 'Sem interação há 7 dias' }, { value: 'new', label: 'Novos na semana' }] },
    { key: 'tag', label: 'Tag', value: filters.tag, allLabel: 'Todas', group: 'Propriedades do contato', options: tags.map((item) => ({ value: item, label: item })) },
  ], [cities, filters, owners, snapshot?.stages, sources, tags])

  const renderFilterEditorControl = (key: ContactFilterKey) => {
    if (key === 'stage') return <NativeSelectionSelect value={filters.stage} onChange={(event) => setFilterValue(key, event.target.value)}><option value="all">Qualquer etapa</option>{snapshot?.stages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelectionSelect>
    if (key === 'temperature') return <NativeSelectionSelect value={filters.temperature} onChange={(event) => setFilterValue(key, event.target.value)}><option value="all">Qualquer temperatura</option><option value="hot">Quente</option><option value="warm">Morno</option><option value="cold">Frio</option></NativeSelectionSelect>
    if (key === 'priority') return <NativeSelectionSelect value={filters.priority} onChange={(event) => setFilterValue(key, event.target.value)}><option value="all">Qualquer prioridade</option><option value="urgent">Urgente</option><option value="high">Alta</option><option value="medium">Média</option><option value="low">Baixa</option></NativeSelectionSelect>
    if (key === 'status') return <NativeSelectionSelect value={filters.status} onChange={(event) => setFilterValue(key, event.target.value)}><option value="all">Qualquer status</option><option value="active">Ativo</option><option value="won">Ganho</option><option value="lost">Perdido</option><option value="archived">Arquivado</option></NativeSelectionSelect>
    if (key === 'owner') return <NativeSelectionSelect value={filters.owner} onChange={(event) => setFilterValue(key, event.target.value)}><option value="all">Qualquer responsável</option><option value="none">Sem responsável</option>{owners.map((item) => <option key={item} value={item}>{item}</option>)}</NativeSelectionSelect>
    if (key === 'source') return <NativeSelectionSelect value={filters.source} onChange={(event) => setFilterValue(key, event.target.value)}><option value="all">Qualquer origem</option>{sources.map((item) => <option key={item} value={item}>{item}</option>)}</NativeSelectionSelect>
    if (key === 'city') return <NativeSelectionSelect value={filters.city} onChange={(event) => setFilterValue(key, event.target.value)}><option value="all">Qualquer cidade</option>{cities.map((item) => <option key={item} value={item}>{item}</option>)}</NativeSelectionSelect>
    if (key === 'tag') return <NativeSelectionSelect value={filters.tag} onChange={(event) => setFilterValue(key, event.target.value)}><option value="all">Qualquer tag</option>{tags.map((item) => <option key={item} value={item}>{item}</option>)}</NativeSelectionSelect>
    if (key === 'due') return <NativeSelectionSelect value={filters.due} onChange={(event) => setFilterValue(key, event.target.value)}><option value="all">Qualquer data</option><option value="overdue">Atrasada</option><option value="today">Hoje</option><option value="due">Atrasada ou hoje</option><option value="none">Sem próxima ação</option></NativeSelectionSelect>
    return <NativeSelectionSelect value={filters.quality} onChange={(event) => setFilterValue(key, event.target.value)}><option value="all">Qualquer recência</option><option value="stale">Sem interação há 7 dias</option><option value="new">Novos na semana</option></NativeSelectionSelect>
  }

  if (recordLead) return <ContactRecordPage lead={recordLead} onBack={() => clearRouteContext(['leadId', 'action'])} />

  return (
    <div className={`page-stack leads-v107 contacts-page-h20 leads-v107--${density} ${viewSettingsOpen ? 'contact-view-settings-open-v10164' : ''}`}>
      <WorkspacePageHeader className="contacts-page-header-h20" eyebrow="Base comercial" title="Contatos" description="Pessoas, empresas, prioridade comercial e próximas ações em uma única base operacional." icon={UsersRound} actions={canContactCreate ? <Button onClick={() => setCreateOpen(true)}><Plus size={17} /> Novo contato</Button> : null} />

      <WorkspaceSummaryStrip className="contacts-summary-strip-h20">
        <WorkspaceSummaryMetric label="Contatos ativos" value={stats.total} meta="Base comercial" icon={UsersRound} tone="brand" active={activeView === savedViews.find((view) => view.starterKey === 'all')?.id} onClick={() => applyStarterView('all')} />
        <WorkspaceSummaryMetric label="Precisam de ação" value={stats.due} meta="Vencidos ou hoje" icon={CalendarClock} tone={stats.due ? 'warning' : 'success'} active={activeView === savedViews.find((view) => view.starterKey === 'due')?.id} onClick={() => applyStarterView('due')} />
        <WorkspaceSummaryMetric label="Sem próxima ação" value={stats.noAction} meta="Risco de esquecimento" icon={AlertCircle} tone={stats.noAction ? 'danger' : 'success'} active={activeView === savedViews.find((view) => view.starterKey === 'no-action')?.id} onClick={() => applyStarterView('no-action')} />
        <WorkspaceSummaryMetric label="Novos em 7 dias" value={stats.newLeads} meta="Entradas recentes" icon={Plus} tone="success" active={filters.quality === 'new' && activeView === 'custom'} onClick={() => { setFilters({ ...defaultFilters, quality: 'new', sort: 'created-desc' }); setActiveView('custom') }} />
      </WorkspaceSummaryStrip>

      <section className="lead-view-tabs contact-view-tabs-v1016 contact-view-tabs-v10163" aria-label="Visualizações de contatos">
        <div className="lead-view-tabs__scroll contact-view-tabs-v10163__scroll">
          {savedViews.map((view) => {
            const owned = repositoryMode !== 'supabase' || view.createdBy === (user?.id ?? 'anonymous')
            return <div
              className={`contact-saved-view-v10161 contact-saved-view-v10163 ${activeView === view.id ? 'is-active' : ''}`}
              key={view.id}
              style={{ '--contact-view-color': view.color } as CSSProperties}
              draggable={owned}
              onDragStart={() => owned && setDragViewId(view.id)}
              onDragEnd={() => setDragViewId(null)}
              onDragOver={(event) => { if (owned && dragViewId) event.preventDefault() }}
              onDrop={() => void dropSavedView(view)}
            >
              <button type="button" className={activeView === view.id ? 'is-active' : ''} onClick={() => applySavedView(view)} title={owned ? 'Arraste para reordenar' : 'Exibição compartilhada'}>
                <span className="contact-saved-view-v10163__icon" aria-hidden="true">{contactViewIcon(view.icon)}</span>
                <span className="contact-saved-view-v10163__name">{view.name}</span>
                {view.isDefault && view.createdBy === (user?.id ?? 'anonymous') ? <Star size={11} className="contact-saved-view-v10163__default" aria-label="Exibição padrão"/> : null}
                {view.visibility === 'workspace' ? <span className="contact-view-scope-v10161">Workspace</span> : null}
              </button>
              <button type="button" className="contact-saved-view-v10161__menu-trigger" aria-label={`Gerenciar ${view.name}`} onClick={() => setViewMenuId((current) => current === view.id ? null : view.id)}><MoreHorizontal size={14}/></button>
              {viewMenuId === view.id ? <div className="contact-saved-view-v10161__menu contact-saved-view-v10163__menu">
                <button type="button" onClick={() => { applySavedView(view); openViewSettings('overview') }}>Configurar exibição</button>
                <button type="button" onClick={() => void saveCurrentStateToView(view)}>Salvar alterações atuais</button>
                <button type="button" onClick={() => void setDefaultSavedView(view)}>Definir como padrão</button>
                <button type="button" onClick={() => void renameSavedView(view)}>Renomear</button>
                <button type="button" onClick={() => void duplicateSavedView(view)}>Duplicar</button>
                {owned ? <><button type="button" onClick={() => void moveSavedView(view, -1)}>Mover para esquerda</button><button type="button" onClick={() => void moveSavedView(view, 1)}>Mover para direita</button></> : null}
                {view.starterKey !== 'all' ? <button type="button" className="is-danger" onClick={() => void removeSavedView(view)}>Excluir</button> : null}
              </div> : null}
            </div>
          })}
        </div>
        <div className="contact-view-creator-v1016">
          <Button size="sm" variant="ghost" onClick={() => { if (viewCreatorOpen) { setViewCreatorOpen(false); resetViewDraft() } else { beginCreateSavedView(viewMode === 'board' ? 'board' : viewMode === 'cards' ? 'compact' : 'table'); setViewCreatorOpen(true) } }} aria-expanded={viewCreatorOpen}><Plus size={15} /> Nova exibição</Button>
          {viewCreatorOpen ? <div className="contact-view-creator-v1016__popover contact-view-creator-v10163__popover">
            <div className="contact-view-creator-v1016__heading"><div><strong>{viewDraftId ? 'Configurar exibição' : 'Criar nova exibição'}</strong><span>{viewDraftId ? 'A aparência e os filtros pertencem à própria exibição.' : 'A nova exibição começa com os filtros, ordenação e formato que estão na tela agora.'}</span></div><button type="button" onClick={() => { setViewCreatorOpen(false); resetViewDraft() }} aria-label="Fechar"><X size={15}/></button></div>
            {false && !viewDraftDisplay ? <div className="contact-view-creator-v1016__cards">
              <button type="button" onClick={() => beginCreateSavedView('table')}><span><List size={20}/></span><strong>Tabela</strong><small>Colunas, filtros e ordenação para operação detalhada.</small></button>
              <button type="button" onClick={() => beginCreateSavedView('board')}><span><Columns3 size={20}/></span><strong>Quadro</strong><small>Cards agrupados por etapa comercial.</small></button>
              <button type="button" onClick={() => beginCreateSavedView('compact')}><span><SlidersHorizontal size={20}/></span><strong>Lista compacta</strong><small>Mais contatos visíveis com a mesma informação essencial.</small></button>
            </div> : <div className="contact-view-creator-v10161__config contact-view-creator-v10163__config">
              <div className="contact-view-creator-v10161__config-head"><div><strong>{viewDraftId ? viewDraftName || 'Exibição' : `Configurar ${viewDraftDisplay === 'board' ? 'Quadro' : viewDraftDisplay === 'compact' ? 'Lista compacta' : 'Tabela'}`}</strong><span>Nome, cor, ícone e tipo podem ser alterados a qualquer momento.</span></div>{!viewDraftId ? <Button size="sm" variant="ghost" onClick={() => setViewDraftDisplay(null)}>Trocar formato</Button> : null}</div>
              <div className="contact-view-creator-v10161__grid">
                <label className="field field--wide"><span>Nome da exibição</span><input autoFocus value={viewDraftName} onChange={(event) => setViewDraftName(event.target.value)} placeholder="Ex.: Contatos prioritários" /></label>
                <div className="contact-view-creator-v10163__appearance field--wide"><span>Cor</span><div className="contact-view-creator-v10163__colors">{CONTACT_VIEW_COLORS.map((color) => <button key={color} type="button" className={viewDraftColor === color ? 'is-active' : ''} style={{ '--contact-view-color': color } as CSSProperties} onClick={() => setViewDraftColor(color)} aria-label={`Usar cor ${color}`}><span /></button>)}</div></div>
                <div className="contact-view-creator-v10163__appearance field--wide"><span>Ícone</span><div className="contact-view-creator-v10163__icons">{CONTACT_VIEW_ICONS.map((icon) => <button key={icon} type="button" className={viewDraftIcon === icon ? 'is-active' : ''} onClick={() => setViewDraftIcon(icon)} title={contactViewIconLabel[icon]} aria-label={`Ícone ${contactViewIconLabel[icon]}`}>{contactViewIcon(icon,16)}</button>)}</div></div>
                <div className="contact-view-creator-v10163__appearance field--wide"><span>Tipo de exibição</span><div className="contact-view-creator-v10163__types"><button type="button" className={viewDraftDisplay === 'table' ? 'is-active' : ''} onClick={() => setViewDraftDisplay('table')}><List size={15}/> Tabela</button><button type="button" className={viewDraftDisplay === 'board' ? 'is-active' : ''} onClick={() => setViewDraftDisplay('board')}><Columns3 size={15}/> Quadro</button><button type="button" className={viewDraftDisplay === 'compact' ? 'is-active' : ''} onClick={() => setViewDraftDisplay('compact')}><SlidersHorizontal size={15}/> Lista compacta</button></div></div>
                <label className="field"><span>Ordenação</span><NativeSelectionSelect value={viewDraftSort} onChange={(event) => setViewDraftSort(event.target.value)}><option value="updated-desc">Atualização recente</option><option value="priority">Maior prioridade</option><option value="created-desc">Mais novos</option><option value="name">Nome A–Z</option><option value="value-desc">Maior valor</option><option value="next-action">Próxima ação</option>{customProperties.flatMap((property) => [<option key={`${property.id}-asc`} value={`custom:${property.id}:asc`}>{property.name} ↑</option>, <option key={`${property.id}-desc`} value={`custom:${property.id}:desc`}>{property.name} ↓</option>])}</NativeSelectionSelect></label>
                <label className="field"><span>Visibilidade</span><NativeSelectionSelect value={viewDraftVisibility} onChange={(event) => setViewDraftVisibility(event.target.value as ContactSavedViewVisibility)}><option value="private">Somente eu</option><option value="workspace">Workspace</option></NativeSelectionSelect></label>
                {viewDraftDisplay !== 'board' ? <div className="contact-view-creator-v10161__columns"><strong>Colunas desta exibição</strong>{(Object.keys(columnLabels) as FixedLeadColumn[]).map((column) => <label key={column}><input type="checkbox" checked={viewDraftColumns.includes(column)} onChange={() => setViewDraftColumns((current) => current.includes(column) ? current.filter((item) => item !== column) : [...current, column])}/><span>{columnLabels[column]}</span></label>)}{customProperties.map((property) => { const column = customColumnId(property.id) as LeadColumn; return <label key={column}><input type="checkbox" checked={viewDraftColumns.includes(column)} onChange={() => setViewDraftColumns((current) => current.includes(column) ? current.filter((item) => item !== column) : [...current, column])}/><span>{property.name}</span></label> })}</div> : null}
                <div className="contact-view-creator-v10161__flags"><label><input type="checkbox" checked={viewDraftDefault} onChange={(event) => setViewDraftDefault(event.target.checked)}/><span>Abrir esta exibição por padrão</span></label><span className="contact-view-scope-v10161">Agrupamento: etapa comercial</span></div>
              </div>
              <div className="contact-view-creator-v10161__footer"><Button size="sm" variant="secondary" onClick={() => { setViewCreatorOpen(false); resetViewDraft() }}>Cancelar</Button><Button size="sm" disabled={!viewDraftName.trim()} onClick={() => void createSavedView()}>{viewDraftId ? 'Salvar alterações' : 'Criar exibição'}</Button></div>
            </div>}
          </div> : null}
        </div>
      </section>

      <WorkspaceCommandBar className="leads-toolbar contact-data-toolbar-v10164 workspace-command-bar-v10169 contacts-command-bar-h20">
        <WorkspaceCommandGroup className="toolbar-card__filters">
          <label className="search-field leads-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nome, empresa, telefone, e-mail, cidade, tag..." /></label>
          <WorkspaceFilterMenu workspaceKey={`contacts:${workspaceId}`} fields={universalContactFilters} activeCount={activeFilterChips.length} onChange={(key, value) => updateFilters({ [key]: value } as Partial<LeadFilters>)} onClearAll={resetFilters} onOpenAdvanced={() => openViewSettings('filters')} />
          <WorkspaceSortMenu value={filters.sort} onChange={(value) => updateFilters({ sort: value })} options={[{ value: 'updated-desc', label: 'Atualização recente', description: 'Últimos registros atualizados primeiro.' }, { value: 'priority', label: 'Maior prioridade', description: 'Score comercial mais alto primeiro.' }, { value: 'created-desc', label: 'Mais novos', description: 'Contatos criados mais recentemente.' }, { value: 'name', label: 'Nome A–Z' }, { value: 'value-desc', label: 'Maior valor' }, { value: 'next-action', label: 'Próxima ação', description: 'Ações mais próximas primeiro.' }, ...customProperties.flatMap((property) => [{ value: `custom:${property.id}:asc`, label: `${property.name} ↑` }, { value: `custom:${property.id}:desc`, label: `${property.name} ↓` }])]} />
          {hasFilters ? <Button variant="ghost" onClick={resetFilters}><X size={16} /> Limpar</Button> : null}
        </WorkspaceCommandGroup>
        <WorkspaceCommandGroup align="end" className="toolbar-card__actions">
          <input ref={fileRef} type="file" accept="application/json,.json,text/csv,.csv" hidden onChange={(event) => void importFile(event.target.files?.[0])} />
          <Button variant="secondary" onClick={() => openViewSettings('overview')} aria-expanded={viewSettingsOpen}><Settings2 size={17} /> Exibição</Button>
          <div className="lead-secondary-actions">
            {canContactCreate ? <Button variant="secondary" loading={busy} onClick={() => fileRef.current?.click()}><Upload size={17} /> Importar</Button> : null}
            {canContactExport ? <Button variant="secondary" onClick={downloadCsv}><Download size={17} /> Exportar</Button> : null}
          </div>
        </WorkspaceCommandGroup>
      </WorkspaceCommandBar>


      {activeFilterChips.length ? <section className="lead-filter-chips"><span><SlidersHorizontal size={15} /> Filtros aplicados</span>{activeFilterChips.map((chip) => <button key={chip.key} type="button" onClick={chip.clear}>{chip.label}<X size={13} /></button>)}</section> : null}

      <SelectionToolbar count={selected.size} label="contatos selecionados" onClear={() => setSelected(new Set())}><SelectionSelect size="sm" value="" placeholder="Mover para etapa..." disabled={busy} onValueChange={(value) => { if (value) void updateSelected({ stageId: value }) }} options={(snapshot?.stages ?? []).map((item) => ({ value: item.id, label: item.name }))} /><SelectionSelect size="sm" value="" placeholder="Alterar prioridade..." disabled={busy} onValueChange={(value) => { if (value) void updateSelected({ priority: value as LeadPriority }) }} options={[{ value: 'urgent', label: '!! Urgente' }, { value: 'high', label: '↑ Alta' }, { value: 'medium', label: '– Média' }, { value: 'low', label: '↓ Baixa' }]} /><Button variant="secondary" disabled={busy} onClick={() => void addTagSelected()}><Tag size={16} /> Adicionar tag</Button><Button variant="secondary" disabled={busy} onClick={() => void createFollowupsSelected()}><RefreshCw size={16} /> Follow-up amanhã</Button><Button variant="secondary" disabled={busy} onClick={() => void updateSelected({ status: 'archived' as LeadStatus })}><Archive size={16} /> Arquivar</Button>{canContactDelete ? <Button variant="danger" disabled={busy} onClick={() => void removeSelected()}><Trash2 size={16} /> Excluir</Button> : null}</SelectionToolbar>

      <section className="panel data-panel leads-data-panel">
        <div className="data-panel__header"><div><h3>Base de contatos</h3><p>{leads.length} de {allLeads.length} registros • página {page} de {totalPages}</p></div><div className="leads-data-panel__summary"><span><Gauge size={14} /> {leads.filter((lead) => (scoreByLead.get(lead.id)?.score ?? 0) >= crmPreferences.commercial.leadScoring.thresholds.high).length} prioritários</span><span><Flame size={14} /> {leads.filter((lead) => lead.temperature === 'hot').length} quentes</span></div></div>
        {leads.length ? <>
          {(mobileView ? 'cards' : viewMode) === 'table' ? <div className="table-scroll leads-table-scroll">
            <DataGrid className="leads-table">
              <thead><tr>{canContactEdit ? <th className="selection-cell"><SelectionCheckbox checked={pageSelected} indeterminate={!pageSelected && selected.size > 0} onCheckedChange={togglePage} ariaLabel="Selecionar página" /></th> : null}{visibleColumns.map((column) => <th key={column} className={`lead-column ${column.startsWith('custom:') ? 'lead-column--custom' : `lead-column--${column}`}`}>{columnLabel(column)}</th>)}<th aria-label="Ações" /></tr></thead>
              <tbody>{pageLeads.map((lead) => {
                const leadStage = snapshot?.stages.find((item) => item.id === lead.stageId)
                const insight = scoreByLead.get(lead.id)!
                const lastAt = lastInteraction.get(lead.id) ?? lead.updatedAt
                return <tr key={lead.id} className={`${selected.has(lead.id) ? 'is-selected' : ''} ${isOverdue(lead.nextActionAt) ? 'is-overdue' : ''}`}>
                  {canContactEdit ? <td className="selection-cell" onClick={(event) => event.stopPropagation()}><SelectionCheckbox checked={selected.has(lead.id)} onCheckedChange={() => setSelected((current) => { const next = new Set(current); next.has(lead.id) ? next.delete(lead.id) : next.add(lead.id); return next })} ariaLabel={`Selecionar ${lead.name}`} /></td> : null}
                  {visibleColumns.includes('contact') ? <td className="lead-column lead-column--contact"><button type="button" className="lead-table-open" onClick={() => navigate('leads', { leadId: lead.id, action: 'contact-record' })} aria-label={`Abrir registro completo de ${lead.name}`}><span className="lead-cell lead-cell--professional"><span className="lead-cell__avatar">{initials(lead.name)}</span><span><span className="lead-name-line"><strong>{lead.name}</strong></span><small>{lead.company || lead.city || 'Sem empresa informada'}</small><span className={`lead-priority-inline lead-priority-inline--${insight.level}`}>{insight.label}</span></span></span></button></td> : null}
                  {visibleColumns.includes('score') ? <td className="lead-column lead-column--score"><span className={`lead-score-badge lead-score-badge--${insight.level}`}><strong>{insight.score}</strong><small>/100</small></span><small>{insight.categories.map((item) => `${item.label} ${item.score}`).join(' · ')}</small></td> : null}
                  {visibleColumns.includes('stage') ? <td className="lead-column lead-column--stage"><span className="stage-chip" style={{ '--stage-color': leadStage?.color ?? '#64748b' } as CSSProperties}>{leadStage?.name ?? 'Sem etapa'}</span></td> : null}
                  {visibleColumns.includes('status') ? <td className="lead-column lead-column--status"><StatusPill tone={lead.status === 'won' ? 'success' : lead.status === 'lost' ? 'danger' : lead.status === 'archived' ? 'neutral' : 'info'}>{statusLabel[lead.status]}</StatusPill></td> : null}
                  {visibleColumns.includes('temperature') ? <td className="lead-column lead-column--temperature"><StatusPill tone={lead.temperature === 'hot' ? 'danger' : lead.temperature === 'warm' ? 'warning' : 'neutral'}>{temperatureLabel[lead.temperature]}</StatusPill><small>{priorityLabel[lead.priority]}</small></td> : null}
                  {visibleColumns.includes('owner') ? <td className="lead-column lead-column--owner"><strong className="table-primary">{lead.ownerName || 'Sem responsável'}</strong><small>{lead.city || 'Sem cidade'}</small></td> : null}
                  {visibleColumns.includes('nextAction') ? <td className="lead-column lead-column--nextAction"><strong className={isTodayOrOverdue(lead.nextActionAt) ? 'table-primary text-danger' : 'table-primary'}>{formatDateTime(lead.nextActionAt)}</strong><small>{lead.nextActionAt ? (isOverdue(lead.nextActionAt) ? 'Atrasada' : 'Programada') : 'Defina o próximo passo'}</small></td> : null}
                  {visibleColumns.includes('value') ? <td className="lead-column lead-column--value"><strong>{canViewDealValue?formatCurrency(lead.value):'Restrito'}</strong></td> : null}
                  {visibleColumns.includes('source') ? <td className="lead-column lead-column--source"><strong className="table-primary">{lead.source || 'Não informada'}</strong><small>{lead.tags.slice(0, 2).join(' · ') || 'Sem tags'}</small></td> : null}
                  {visibleColumns.includes('lastActivity') ? <td className="lead-column lead-column--lastActivity"><strong className="table-primary">{formatDateTime(lastAt)}</strong><small>{recentDays(lastAt, 7) ? 'Atividade recente' : 'Sem interação há 7+ dias'}</small></td> : null}
                  {visibleColumns.filter((column) => column.startsWith('custom:')).map((column) => { const propertyId = customPropertyIdFromColumn(column); const property = propertyId ? customPropertyById.get(propertyId) : null; return property ? <td key={column} className="lead-column lead-column--custom contact-custom-cell-v10165" onClick={(event) => event.stopPropagation()}>{renderCustomPropertyEditor(lead, property)}</td> : null })}
                  <td onClick={(event) => event.stopPropagation()}><div className="lead-row-actions">{canContactEdit && canCommunicate ? <><button type="button" disabled={!canViewPhone || !resolveLeadCallTarget(lead, snapshot?.contacts ?? []).phone} onClick={() => openCall(lead)} aria-label={`Ligar para ${lead.name}`} title="Ligar"><PhoneCall size={16} /></button><button type="button" disabled={!canViewPhone || !resolveLeadCallTarget(lead, snapshot?.contacts ?? []).phone} onClick={() => openWhatsApp(lead)} aria-label={`WhatsApp de ${lead.name}`} title="WhatsApp"><MessageCircle size={16} /></button><button type="button" onClick={() => openActivity(lead)} aria-label={`Criar follow-up para ${lead.name}`} title="Criar follow-up"><CalendarClock size={16} /></button></> : null}<button type="button" onClick={() => setDrawerLeadId(lead.id)} aria-label={`Abrir ${lead.name}`} title="Visualização rápida"><MoreHorizontal size={18} /></button></div></td>
                </tr>
              })}</tbody>
            </DataGrid>
          </div> : (!mobileView && viewMode === 'board') ? <div className="contact-board-v1016">{(snapshot?.stages ?? []).filter((stage) => !stage.isLost).sort((a,b) => a.order-b.order).map((stage) => {
            const stageLeads = leads.filter((lead) => lead.stageId === stage.id)
            return <section key={stage.id} className="contact-board-v1016__column">
              <header><span className="contact-board-v1016__dot" style={{ background: stage.color }}/><strong>{stage.name}</strong><em>{stageLeads.length}</em></header>
              <div>{stageLeads.map((lead) => { const insight = scoreByLead.get(lead.id)!; return <article key={lead.id} className="contact-board-v1016__card">
                <button type="button" className="contact-board-v1016__open" onClick={() => navigate('leads', { leadId: lead.id, action: 'contact-record' })}><span className="lead-cell__avatar">{initials(lead.name)}</span><span><strong>{lead.name}</strong><small>{lead.company || 'Sem empresa'}</small></span></button>
                <div className="contact-board-v1016__meta"><span className={`lead-score-badge lead-score-badge--${insight.level}`}><strong>{insight.score}</strong><small>/100</small></span><StatusPill tone={lead.temperature === 'hot' ? 'danger' : lead.temperature === 'warm' ? 'warning' : 'neutral'}>{temperatureLabel[lead.temperature]}</StatusPill></div>
                <dl><div><dt>Próxima ação</dt><dd>{formatDateTime(lead.nextActionAt)}</dd></div><div><dt>Responsável</dt><dd>{lead.ownerName || 'Sem responsável'}</dd></div><div><dt>Valor</dt><dd>{canViewDealValue?formatCurrency(lead.value):'Restrito pelo perfil'}</dd></div></dl>
                <footer><button type="button" onClick={() => setDrawerLeadId(lead.id)}>Visualização rápida</button>{canContactEdit ? <button type="button" onClick={() => openActivity(lead)}>Follow-up</button> : null}</footer>
              </article>})}{!stageLeads.length ? <div className="contact-board-v1016__empty">Nenhum contato nesta etapa</div> : null}</div>
            </section>
          })}</div> : <div className="lead-card-grid">{pageLeads.map((lead) => {
            const stageItem = snapshot?.stages.find((item) => item.id === lead.stageId)
            const insight = scoreByLead.get(lead.id)!
            return <article key={lead.id} className={`lead-base-card ${selected.has(lead.id) ? 'is-selected' : ''}`}>
              <div className="lead-base-card__top">{canContactEdit ? <SelectionCheckbox checked={selected.has(lead.id)} onCheckedChange={() => setSelected((current) => { const next = new Set(current); next.has(lead.id) ? next.delete(lead.id) : next.add(lead.id); return next })} ariaLabel={`Selecionar ${lead.name}`} /> : null}<button type="button" className="lead-card-open-identity" onClick={() => navigate('leads', { leadId: lead.id, action: 'contact-record' })} aria-label={`Abrir registro completo de ${lead.name}`}><span className="lead-cell__avatar">{initials(lead.name)}</span><span className="lead-card-open-copy"><strong>{lead.name}</strong><small>{lead.company || lead.city || 'Sem empresa'}</small></span></button><button type="button" onClick={() => setDrawerLeadId(lead.id)} aria-label={`Visualização rápida de ${lead.name}`}><MoreHorizontal size={18} /></button></div>
              <div className="lead-base-card__status"><span className="stage-chip" style={{ '--stage-color': stageItem?.color ?? '#64748b' } as CSSProperties}>{stageItem?.name ?? 'Sem etapa'}</span><StatusPill tone={lead.temperature === 'hot' ? 'danger' : lead.temperature === 'warm' ? 'warning' : 'neutral'}>{temperatureLabel[lead.temperature]}</StatusPill><span className={`lead-priority-inline lead-priority-inline--${insight.level}`}>{insight.label}</span><span className={`lead-score-badge lead-score-badge--${insight.level}`}><strong>{insight.score}</strong><small>/100</small></span></div>
              <div className="lead-base-card__details"><div><small>Telefone</small><strong>{canViewPhone?(lead.phone || 'Não informado'):'Restrito pelo perfil'}</strong></div><div><small>Responsável</small><strong>{lead.ownerName || 'Não atribuído'}</strong></div><div><small>Próxima ação</small><strong className={isTodayOrOverdue(lead.nextActionAt) ? 'text-danger' : ''}>{formatDateTime(lead.nextActionAt)}</strong></div><div><small>Valor</small><strong>{canViewDealValue?formatCurrency(lead.value):'Restrito pelo perfil'}</strong></div></div>
              {canContactEdit && canCommunicate ? <div className="lead-base-card__actions"><Button size="sm" disabled={!canViewPhone || !resolveLeadCallTarget(lead, snapshot?.contacts ?? []).phone} onClick={(event) => { event.stopPropagation(); openCall(lead) }}><PhoneCall size={15} /> Ligar</Button><Button size="sm" variant="secondary" disabled={!canViewPhone || !resolveLeadCallTarget(lead, snapshot?.contacts ?? []).phone} onClick={(event) => { event.stopPropagation(); openWhatsApp(lead) }}>WhatsApp</Button><Button size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); openActivity(lead) }}>Follow-up</Button></div> : null}
            </article>
          })}</div>}
          <div className="pagination"><Button variant="ghost" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Anterior</Button><span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, leads.length)} de {leads.length}</span><Button variant="ghost" disabled={page === totalPages} onClick={() => setPage((value) => value + 1)}>Próxima</Button></div>
        </> : <EmptyState icon={UsersRound} title="Nenhum contato encontrado" description={hasFilters ? 'Nenhum registro corresponde à busca e aos filtros selecionados.' : 'Adicione manualmente ou importe sua base de contatos.'} action={canContactCreate ? <Button onClick={() => setCreateOpen(true)}><Plus size={17} /> Novo contato</Button> : undefined} />}
      </section>

      {viewSettingsOpen ? <aside className="contact-view-settings-v10164" role="complementary" aria-label="Configurações da exibição">
        <header className="contact-view-settings-v10164__header">
          <div><span>Exibir configurações</span><strong>{activeSavedView?.name ?? 'Exibição temporária'}</strong></div>
          <button type="button" onClick={() => setViewSettingsOpen(false)} aria-label="Fechar configurações"><X size={18}/></button>
        </header>
        <nav className="contact-view-settings-v10164__nav" aria-label="Seções das configurações">
          <button type="button" className={viewSettingsSection === 'overview' ? 'is-active' : ''} onClick={() => setViewSettingsSection('overview')}><Settings2 size={15}/> Exibição</button>
          <button type="button" className={viewSettingsSection === 'filters' ? 'is-active' : ''} onClick={() => { setFilterEditorKeys(currentActiveFilterKeys()); setViewSettingsSection('filters') }}><Filter size={15}/> Filtros <span>{activeFilterChips.length}</span></button>
          <button type="button" className={viewSettingsSection === 'sort' ? 'is-active' : ''} onClick={() => setViewSettingsSection('sort')}><ArrowUpDown size={15}/> Classificar</button>
          <button type="button" className={viewSettingsSection === 'columns' ? 'is-active' : ''} onClick={() => setViewSettingsSection('columns')}><Columns3 size={15}/> Colunas</button>
          <button type="button" className={viewSettingsSection === 'properties' ? 'is-active' : ''} onClick={() => setViewSettingsSection('properties')}><Tag size={15}/> Propriedades <span>{customProperties.length}</span></button>
        </nav>
        <div className="contact-view-settings-v10164__body">
          {!activeSavedView ? <div className="contact-view-settings-v10164__notice"><strong>Exibição temporária</strong><p>Escolha uma view salva ou crie uma nova para persistir estas configurações.</p><Button size="sm" onClick={() => { setViewSettingsOpen(false); beginCreateSavedView(viewMode === 'board' ? 'board' : viewMode === 'cards' ? 'compact' : 'table'); setViewCreatorOpen(true) }}><Plus size={15}/> Nova exibição</Button></div> : null}
          {viewSettingsSection === 'overview' ? <>
            <section className="contact-view-settings-v10164__section">
              <div className="contact-view-settings-v10164__section-title"><strong>Identidade</strong><span>Nome, cor e ícone desta view.</span></div>
              <label className="field"><span>Nome</span><input value={settingsName} disabled={!activeViewOwned} onChange={(event) => setSettingsName(event.target.value)} /></label>
              <div className="contact-view-settings-v10164__colors"><span>Cor</span><div>{CONTACT_VIEW_COLORS.map((color) => <button key={color} type="button" disabled={!activeViewOwned} className={settingsColor === color ? 'is-active' : ''} style={{ '--contact-view-color': color } as CSSProperties} onClick={() => setSettingsColor(color)} aria-label={`Usar cor ${color}`}><i/></button>)}</div></div>
              <div className="contact-view-settings-v10164__icons"><span>Ícone</span><div>{CONTACT_VIEW_ICONS.map((icon) => <button key={icon} type="button" disabled={!activeViewOwned} className={settingsIcon === icon ? 'is-active' : ''} onClick={() => setSettingsIcon(icon)} title={contactViewIconLabel[icon]}>{contactViewIcon(icon,15)}</button>)}</div></div>
            </section>
            <section className="contact-view-settings-v10164__section">
              <div className="contact-view-settings-v10164__section-title"><strong>Tipo de exibição</strong><span>A base continua a mesma; muda apenas a forma de trabalhar.</span></div>
              <div className="contact-view-settings-v10164__types" role="group" aria-label="Tipo de exibição">
                <button type="button" className={viewMode === 'table' ? 'is-active' : ''} onClick={() => changeViewDisplay('table')}><List size={16}/><span>Tabela</span></button>
                <button type="button" className={viewMode === 'board' ? 'is-active' : ''} onClick={() => changeViewDisplay('board')}><Columns3 size={16}/><span>Quadro</span></button>
                <button type="button" className={viewMode === 'cards' ? 'is-active' : ''} onClick={() => changeViewDisplay('compact')}><SlidersHorizontal size={16}/><span>Lista compacta</span></button>
              </div>
            </section>
            <section className="contact-view-settings-v10164__section">
              <div className="contact-view-settings-v10164__section-title"><strong>Compartilhamento</strong><span>Controle quem pode usar esta exibição.</span></div>
              <label className="field"><span>Visibilidade</span><SelectionSelect disabled={!activeViewOwned} value={settingsVisibility} onValueChange={(value) => setSettingsVisibility(value as ContactSavedViewVisibility)} options={[{ value: 'private', label: 'Somente eu' }, { value: 'workspace', label: 'Workspace' }]} /></label>
              {!activeViewOwned && activeSavedView ? <p className="contact-view-settings-v10164__helper">Esta view é compartilhada por outra pessoa. Duplique-a para editar.</p> : null}
            </section>
          </> : null}
          {viewSettingsSection === 'filters' ? <section className="contact-view-settings-v10164__section contact-view-settings-v10164__filters">
            <div className="contact-view-settings-v10164__section-title"><strong>Filtros</strong><span>Escolha a propriedade e depois o valor. A tabela responde imediatamente.</span></div>
            {filterEditorKeys.map((key) => <div className="contact-filter-row-v10164" key={key}>
              <div><strong>{contactFilterLabels[key]}</strong><span>{key === 'due' || key === 'quality' ? 'condição' : 'é'}</span></div>
              {renderFilterEditorControl(key)}
              <button type="button" onClick={() => removeFilterEditorKey(key)} aria-label={`Remover filtro ${contactFilterLabels[key]}`}><X size={14}/></button>
            </div>)}
            <label className="contact-filter-add-v10164"><Plus size={15}/><NativeSelectionSelect value="" onChange={(event) => { const key = event.target.value as ContactFilterKey; if (key) addFilterEditorKey(key) }}><option value="">Adicionar filtro</option>{contactFilterKeys.filter((key) => !filterEditorKeys.includes(key)).map((key) => <option key={key} value={key}>{contactFilterLabels[key]}</option>)}</NativeSelectionSelect></label>
            {customFilterEditorIds.map((propertyId) => { const property = customPropertyById.get(propertyId); if (!property) return null; return <div className="contact-filter-row-v10164 contact-custom-filter-row-v10165" key={`custom-${propertyId}`}><div><strong>{property.name}</strong><span>personalizada</span></div>{property.type === 'checkbox' ? <NativeSelectionSelect value={customFilters[propertyId] ?? ''} onChange={(event) => setCustomFilters((current) => ({ ...current, [propertyId]: event.target.value }))}><option value="">Qualquer</option><option value="true">Sim</option><option value="false">Não</option></NativeSelectionSelect> : property.type === 'select' ? <NativeSelectionSelect value={customFilters[propertyId] ?? ''} onChange={(event) => setCustomFilters((current) => ({ ...current, [propertyId]: event.target.value }))}><option value="">Qualquer valor</option>{property.options.map((option) => <option key={option} value={option}>{option}</option>)}</NativeSelectionSelect> : <input type={property.type === 'date' ? 'date' : property.type === 'number' || property.type === 'currency' ? 'number' : 'text'} value={customFilters[propertyId] ?? ''} placeholder={property.type === 'text' ? 'Contém...' : 'Valor'} onChange={(event) => setCustomFilters((current) => ({ ...current, [propertyId]: event.target.value }))}/>}<button type="button" onClick={() => { setCustomFilterEditorIds((current) => current.filter((id) => id !== propertyId)); setCustomFilters((current) => ({ ...current, [propertyId]: '' })) }} aria-label={`Remover filtro ${property.name}`}><X size={14}/></button></div> })}
            {customProperties.some((property) => !customFilterEditorIds.includes(property.id)) ? <label className="contact-filter-add-v10164 contact-filter-add-v10165"><Plus size={15}/><NativeSelectionSelect value="" onChange={(event) => { const propertyId = event.target.value; if (propertyId) setCustomFilterEditorIds((current) => current.includes(propertyId) ? current : [...current, propertyId]) }}><option value="">Adicionar propriedade personalizada</option>{customProperties.filter((property) => !customFilterEditorIds.includes(property.id)).map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</NativeSelectionSelect></label> : null}
            {filterEditorKeys.length || customFilterEditorIds.length ? <Button size="sm" variant="ghost" onClick={() => { setFilterEditorKeys([]); setCustomFilterEditorIds([]); setCustomFilters({}); setFilters((current) => ({ ...current, ...defaultFilters, sort: current.sort })) }}>Limpar filtros da view</Button> : null}
          </section> : null}
          {viewSettingsSection === 'sort' ? <section className="contact-view-settings-v10164__section">
            <div className="contact-view-settings-v10164__section-title"><strong>Classificar por</strong><span>Defina a ordem dos contatos nesta exibição.</span></div>
            <label className="field"><span>Ordenação</span><SelectionSelect value={filters.sort} onValueChange={(value) => updateFilters({ sort: value })} searchable options={[{ value: 'updated-desc', label: 'Atualização recente' }, { value: 'priority', label: 'Maior prioridade' }, { value: 'created-desc', label: 'Mais novos' }, { value: 'name', label: 'Nome A–Z' }, { value: 'value-desc', label: 'Maior valor' }, { value: 'next-action', label: 'Próxima ação' }, ...customProperties.flatMap((property) => [{ value: `custom:${property.id}:asc`, label: `${property.name} ↑` }, { value: `custom:${property.id}:desc`, label: `${property.name} ↓` }])]} /></label>
            <div className="contact-view-settings-v10164__sort-summary"><ArrowUpDown size={16}/><span>{filters.sort === 'priority' ? 'Score comercial, maior primeiro' : filters.sort === 'created-desc' ? 'Data de criação, mais recente primeiro' : filters.sort === 'name' ? 'Nome, ordem alfabética' : filters.sort === 'value-desc' ? 'Valor, maior primeiro' : filters.sort === 'next-action' ? 'Próxima ação, mais próxima primeiro' : 'Última atualização, mais recente primeiro'}</span></div>
          </section> : null}
          {viewSettingsSection === 'columns' ? <section className="contact-view-settings-v10164__section">
            <div className="contact-view-settings-v10164__section-title"><strong>Configurações da tabela</strong><span>Mostre somente as propriedades úteis para esta view.</span></div>
            {viewMode !== 'board' ? <div className="contact-view-settings-v10164__columns">{(Object.keys(columnLabels) as FixedLeadColumn[]).map((column) => <label key={column}><input type="checkbox" checked={visibleColumns.includes(column)} onChange={() => toggleColumn(column)}/><span>{columnLabels[column]}</span></label>)}{customProperties.map((property) => { const column = customColumnId(property.id) as LeadColumn; return <label key={column}><input type="checkbox" checked={visibleColumns.includes(column)} onChange={() => toggleColumn(column)}/><span>{property.name}</span></label> })}</div> : <div className="contact-view-settings-v10164__notice"><strong>Quadro por etapa</strong><p>Os cards são agrupados pela etapa comercial e mostram contexto essencial do contato.</p></div>}
            <div className="contact-view-settings-v10164__density"><span>Densidade</span><div><button type="button" className={density === 'comfortable' ? 'is-active' : ''} onClick={() => setDensity('comfortable')}>Confortável</button><button type="button" className={density === 'compact' ? 'is-active' : ''} onClick={() => setDensity('compact')}>Compacta</button></div></div>
            <Button size="sm" variant="ghost" onClick={() => { setVisibleColumns(defaultColumns); setDensity('comfortable') }}>Restaurar colunas padrão</Button>
          </section> : null}
          {viewSettingsSection === 'properties' ? <section className="contact-view-settings-v10164__section contact-custom-properties-v10165">
            <div className="contact-view-settings-v10164__section-title"><strong>Propriedades personalizadas</strong><span>Crie campos do workspace e use-os como coluna, filtro e ordenação.</span></div>
            <div className="contact-custom-properties-v10165__list">{customProperties.length ? customProperties.map((property) => <article key={property.id}><div><strong>{property.name}</strong><span>{property.type === 'text' ? 'Texto' : property.type === 'number' ? 'Número' : property.type === 'currency' ? 'Moeda' : property.type === 'date' ? 'Data' : property.type === 'checkbox' ? 'Checkbox' : 'Seleção'}{property.type === 'select' && property.options.length ? ` · ${property.options.length} opções` : ''}</span></div><div><button type="button" onClick={() => editCustomProperty(property)}>Editar</button><button type="button" className="is-danger" onClick={() => void removeCustomProperty(property)}>Excluir</button></div></article>) : <p>Nenhuma propriedade personalizada criada.</p>}</div>
            <div className="contact-custom-properties-v10165__editor"><strong>{propertyDraftId ? 'Editar propriedade' : 'Nova propriedade'}</strong><label className="field"><span>Nome</span><input value={propertyDraftName} onChange={(event) => setPropertyDraftName(event.target.value)} placeholder="Ex.: Potencial mensal" /></label><label className="field"><span>Tipo</span><SelectionSelect value={propertyDraftType} onValueChange={(value) => setPropertyDraftType(value as ContactCustomPropertyType)} options={[{ value: 'text', label: 'Texto' }, { value: 'number', label: 'Número' }, { value: 'currency', label: 'Moeda' }, { value: 'date', label: 'Data' }, { value: 'checkbox', label: 'Checkbox' }, { value: 'select', label: 'Seleção' }]} /></label>{propertyDraftType === 'select' ? <label className="field"><span>Opções</span><textarea rows={4} value={propertyDraftOptions} onChange={(event) => setPropertyDraftOptions(event.target.value)} placeholder={'Alta\nMédia\nBaixa'} /></label> : null}<div><Button size="sm" disabled={!propertyDraftName.trim()} onClick={() => void persistCustomProperty()}>{propertyDraftId ? 'Salvar propriedade' : 'Criar propriedade'}</Button>{propertyDraftId ? <Button size="sm" variant="ghost" onClick={resetPropertyDraft}>Cancelar</Button> : null}</div></div>
          </section> : null}
        </div>
        <footer className="contact-view-settings-v10164__footer">
          {activeSavedView ? <>
            <div className="contact-view-settings-v10164__footer-main"><Button size="sm" disabled={!activeViewOwned || !settingsName.trim()} onClick={() => void saveActiveViewSettings()}>Salvar alterações</Button><Button size="sm" variant="secondary" onClick={resetActiveViewSettings}>Restaurar</Button></div>
            <div className="contact-view-settings-v10164__footer-actions"><button type="button" onClick={() => void setDefaultSavedView(activeSavedView)}>Definir como padrão</button><button type="button" onClick={() => void duplicateSavedView(activeSavedView)}>Duplicar exibição</button>{activeViewOwned && activeSavedView.starterKey !== 'all' ? <button type="button" className="is-danger" onClick={() => void removeSavedView(activeSavedView)}>Excluir exibição</button> : null}</div>
          </> : null}
        </footer>
      </aside> : null}

      <CreateLeadModal open={canContactCreate && createOpen} onCreated={handleLeadCreated} onClose={() => { setCreateOpen(false); if (routeContext.action === 'create-lead') clearRouteContext(['action']) }} />
      <EditLeadModal lead={editing} open={canContactEdit && Boolean(editing)} onClose={() => setEditing(null)} />
      <LeadDetailsDrawer readOnly={!canContactEdit} openAccountOnMount={routeContext.action === 'account360'} lead={drawerLead} duplicateMatches={duplicateMatches} onClose={() => { setDrawerLeadId(null); if (routeContext.leadId || routeContext.action === 'account360') clearRouteContext(['leadId', 'action']) }} onEdit={(lead) => setEditing(lead)} onActivity={openActivity} onEvent={setEventLead} onCall={openCall} onOpenDuplicate={(lead) => setDrawerLeadId(lead.id)} />
      <ActivityModal open={canContactEdit && Boolean(activityLead)} initialLeadId={activityLead?.id} initialType={activityType} initialTitle={activityLead ? `${activityType === 'note' ? 'Nota' : activityType === 'meeting' ? 'Reunião' : activityType === 'call' ? 'Ligação' : 'Retomar contato'} — ${activityLead.name}` : ''} onClose={() => setActivityLead(null)} />
      <EventModal open={canContactEdit && Boolean(eventLead)} initialLeadId={eventLead?.id} onClose={() => setEventLead(null)} />
      <LazyCallWorkspaceModal open={canContactEdit && Boolean(callLead)} config={callLead ? buildQuickCallSessionConfig({ snapshot, initialLeadId: callLead.id, playbookId: callLaunchOptions?.playbookId, sessionObjective: callLaunchOptions?.sessionObjective }) : null} onClose={closeCall} />
      <SalesMessageModal lead={messageLead} stageName={snapshot?.stages.find((item) => item.id === messageLead?.stageId)?.name ?? 'Contatos'} open={canContactEdit && Boolean(messageLead)} onClose={() => setMessageLead(null)} />
    </div>
  )
}
