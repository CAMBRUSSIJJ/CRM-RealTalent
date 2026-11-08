import { NativeSelectionSelect } from '../../components/selection'
import '../../styles/calls-v10070.css'
import '../../styles/calls-ui-standard-v10071.css'
import '../../styles/calls-intelligence-workspace-v10072.css'
import '../../styles/calls-focus-simplification-v100731.css'
import '../../styles/calling-workspace-operational.css'
import './call-setup-reference.css'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileText,
  X,
  BookmarkPlus,
  BookOpenText,
  CalendarCheck2,
  Check,
  CheckSquare,
  Clock3,
  Focus,
  Gauge,
  ListFilter,
  ListOrdered,
  PhoneCall,
  Play,
  Search,
  Settings2,
  Sparkles,
  Square,
  Target,
  Trash2,
  UsersRound,
  WandSparkles,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAppNavigation, useAppUi, useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import { WorkspaceFilterChips, WorkspaceFilterMenu, WorkspaceSortMenu, type WorkspaceFilterField } from '../../components/workspace/workspace-filter-system'
import { decisionRoleLabels } from '../../services/account-intelligence'
import type { Lead, LeadPriority, LeadTemperature } from '../../domain/types'
import { CallDisplayPreferencesModal } from './call-display-preferences-modal'
import { readCallDisplayPreferences, saveCallDisplayPreferences, type CallDisplayPreferences } from '../../services/call-display-preferences'
import { CALL_SESSION_OBJECTIVES, callModeDescription, inferCallSessionObjective, type CallSessionMode, type CallSessionObjective } from '../../services/call-session-intelligence'
import { resolveLeadCallTarget } from '../../services/call-workspace'
import { buildCallHealth } from '../../services/calling-intelligence-workspace'
import { discoverVoiceDevices, probeVoiceProviders, providerLabel, readVoiceSettings, type VoiceSettings } from '../../services/voice-dialer'
import { recommendPlaybooks } from '../../services/coaching-engine'
import { CALL_APPROACHES, callApproachEntries, classifyCallApproach, recommendApproachPlaybook, type CallApproachType } from './call-session-approaches'
import { readCallingStrategyPreferences, type CallingStrategyPreferences } from '../../services/calling-strategy'
import { getGoalInsight, localDateKey } from '../../services/goals-workspace'
import { goalMetricLabels } from '../../services/metrics'
import type { CallSessionConfig } from './call-session-config'
import { VoiceDialerSettingsModal } from './voice-dialer-settings-modal'

type QueueOrder = 'smart' | 'name' | 'next_action'
type PreparationTab = 'queue' | 'settings' | 'strategy' | 'review'
type SelectFilter = 'all' | string
const PREPARATION_STEPS: PreparationTab[] = ['queue', 'settings', 'strategy', 'review']

type SavedCallList = {
  id: string
  name: string
  leadIds: string[]
  createdAt: string
}

const priorityLabel: Record<LeadPriority, string> = { urgent: 'Urgente', high: 'Alta', medium: 'Média', low: 'Baixa' }
const temperatureLabel: Record<LeadTemperature, string> = { hot: 'Quente', warm: 'Morno', cold: 'Frio' }

const normalizePhone = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '')
const sameDay = (iso: string, now: Date) => new Date(iso).toDateString() === now.toDateString()

function readSavedLists(workspaceId: string): SavedCallList[] {
  try {
    const raw = localStorage.getItem(`realtalent:call-lists:${workspaceId}`)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((item): item is SavedCallList => Boolean(item?.id && item?.name && Array.isArray(item?.leadIds))) : []
  } catch { return [] }
}

function persistSavedLists(workspaceId: string, lists: SavedCallList[]) {
  try { localStorage.setItem(`realtalent:call-lists:${workspaceId}`, JSON.stringify(lists.slice(0, 12))) } catch { /* storage indisponível */ }
}

export function CallSessionPreparationModal({ open, leadIds, initialLeadId, onClose, onStart }: {
  open: boolean
  leadIds: string[]
  initialLeadId?: string
  onClose(): void
  onStart(config: CallSessionConfig): void
}) {
  const { snapshot, currentWorkspace } = useAppWorkspace()
  const { navigate } = useAppNavigation()
  const { notify } = useAppUi()
  const workspaceId = currentWorkspace?.id ?? snapshot?.workspace.id ?? 'default'
  const activeGoals = useMemo(() => {
    if (!snapshot) return []
    const today = localDateKey()
    const relevant = new Set(['calls', 'contacts', 'meetings', 'proposals'])
    return snapshot.goals.filter((item) => item.periodStart <= today && item.periodEnd >= today && relevant.has(item.metric))
  }, [snapshot])

  const [activeTab, setActiveTab] = useState<PreparationTab>('queue')
  const [playbookId, setPlaybookId] = useState('')
  const [goal, setGoal] = useState(1)
  const [linkedGoalId, setLinkedGoalId] = useState('')
  const [maxSession, setMaxSession] = useState(20)
  const [order, setOrder] = useState<QueueOrder>('smart')
  const [autoAdvance, setAutoAdvance] = useState(true)
  const [autoAdvanceSeconds, setAutoAdvanceSeconds] = useState(3)
  const [smartWrap, setSmartWrap] = useState(true)
  const [fastDial, setFastDial] = useState(false)
  const [autoDispatchNext, setAutoDispatchNext] = useState(false)
  const [autoDispatchDelaySeconds, setAutoDispatchDelaySeconds] = useState(1)
  const [sessionMode, setSessionMode] = useState<CallSessionMode>('focus')
  const [sessionObjective, setSessionObjective] = useState<CallSessionObjective>('first_meeting')
  const [display, setDisplay] = useState<CallDisplayPreferences>(() => readCallDisplayPreferences(workspaceId))
  const [displayOpen, setDisplayOpen] = useState(false)
  const [approachOverrides, setApproachOverrides] = useState<Record<string, CallApproachType>>({})
  const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false)
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(() => readVoiceSettings(workspaceId))
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [voiceReadiness, setVoiceReadiness] = useState<'idle' | 'checking' | 'ready' | 'offline'>('idle')
  const [playbookPickerOpen, setPlaybookPickerOpen] = useState(false)
  useEffect(() => {
    if (!open || activeTab !== 'review' || !fastDial) { setVoiceReadiness('idle'); return }
    let active = true
    setVoiceReadiness('checking')
    void (async () => {
      try {
        const providers = await probeVoiceProviders(voiceSettings)
        const connect = providers.find((item) => item.id === 'realtalent_connect')
        const devices = await discoverVoiceDevices(providers, voiceSettings, workspaceId)
        const selected = devices.find((item) => item.id === voiceSettings.selectedDeviceId)
        if (active) setVoiceReadiness(connect?.state === 'available' && Boolean(selected?.available) ? 'ready' : 'offline')
      } catch {
        if (active) setVoiceReadiness('offline')
      }
    })()
    return () => { active = false }
  }, [activeTab, fastDial, open, voiceSettings, workspaceId])
  const [strategy, setStrategy] = useState<CallingStrategyPreferences>(() => readCallingStrategyPreferences(workspaceId))
  const activeGoalInsights = useMemo(() => activeGoals.map((item) => getGoalInsight(snapshot!, item)), [activeGoals, snapshot])
  const linkedGoalInsight = useMemo(() => activeGoalInsights.find((item) => item.goal.id === linkedGoalId) ?? null, [activeGoalInsights, linkedGoalId])

  const [query, setQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<SelectFilter>('all')
  const [segmentFilter, setSegmentFilter] = useState<SelectFilter>('all')
  const [cityFilter, setCityFilter] = useState<SelectFilter>('all')
  const [stageFilter, setStageFilter] = useState<SelectFilter>('all')
  const [priorityFilter, setPriorityFilter] = useState<'all' | LeadPriority>('all')
  const [temperatureFilter, setTemperatureFilter] = useState<'all' | LeadTemperature>('all')
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const [savedLists, setSavedLists] = useState<SavedCallList[]>(() => readSavedLists(workspaceId))
  const [saveListOpen, setSaveListOpen] = useState(false)
  const [saveListName, setSaveListName] = useState('')

  useEffect(() => {
    if (!open) return
    if (!linkedGoalId && activeGoals.length) setLinkedGoalId(activeGoals[0].id)
  }, [activeGoals, linkedGoalId, open])

  useEffect(() => {
    if (!open) return
    const next = readVoiceSettings(workspaceId)
    setVoiceSettings(next)
    const connectPhoneReady = next.defaultProviderId === 'realtalent_connect' && next.selectedDeviceId.startsWith('connect:phone:')
    setFastDial(connectPhoneReady)
    setAutoDispatchNext(connectPhoneReady)
    setAutoDispatchDelaySeconds(1)
  }, [open, workspaceId])

  const candidateLeads = useMemo(() => {
    const uniqueIds = [...new Set(leadIds)]
    return uniqueIds
      .map((id) => snapshot?.leads.find((lead) => lead.id === id))
      .filter((lead): lead is Lead => Boolean(lead && lead.status === 'active'))
  }, [leadIds, snapshot?.leads])

  const leadTargets = useMemo(() => new Map(candidateLeads.map((lead) => [lead.id, resolveLeadCallTarget(lead, snapshot?.contacts ?? [])])), [candidateLeads, snapshot?.contacts])
  const callHealthByLead = useMemo(() => new Map(candidateLeads.map((lead) => {
    const target = leadTargets.get(lead.id)
    const contact = target?.contactId ? snapshot?.contacts.find((item) => item.id === target.contactId) ?? null : null
    return [lead.id, buildCallHealth({ lead, contact, contacts: snapshot?.contacts ?? [], allLeads: snapshot?.leads ?? [], calls: snapshot?.calls ?? [], events: snapshot?.events ?? [] })]
  })), [candidateLeads, leadTargets, snapshot?.calls, snapshot?.contacts, snapshot?.events, snapshot?.leads])
  const callableCandidates = useMemo(() => candidateLeads.filter((lead) => Boolean(leadTargets.get(lead.id)?.phone) && callHealthByLead.get(lead.id)?.status !== 'restricted'), [callHealthByLead, candidateLeads, leadTargets])

  const segmentFor = (lead: Lead) => snapshot?.companies.find((company) => company.id === lead.companyId)?.segment?.trim() || ''
  const stageFor = (lead: Lead) => snapshot?.stages.find((stage) => stage.id === lead.stageId)?.name ?? 'Sem etapa'

  const options = useMemo(() => {
    const unique = (items: string[]) => [...new Set(items.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    return {
      sources: unique(candidateLeads.map((lead) => lead.source?.trim() || 'Sem origem')),
      segments: unique(candidateLeads.map(segmentFor)),
      cities: unique(candidateLeads.map((lead) => lead.city?.trim() || 'Sem cidade')),
      stages: unique(candidateLeads.map(stageFor)),
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateLeads, snapshot?.companies, snapshot?.stages])

  const preparationFilterFields = useMemo<WorkspaceFilterField[]>(() => [
    { key: 'source', label: 'Origem', value: sourceFilter, group: 'Contato', kind: 'enum', allLabel: 'Todas as origens', options: options.sources.map((value) => ({ value, label: value })) },
    { key: 'segment', label: 'Segmento', value: segmentFilter, group: 'Conta', kind: 'enum', allLabel: 'Todos os segmentos', options: options.segments.map((value) => ({ value, label: value })) },
    { key: 'city', label: 'Cidade', value: cityFilter, group: 'Localização', kind: 'enum', allLabel: 'Todas as cidades', options: options.cities.map((value) => ({ value, label: value })) },
    { key: 'stage', label: 'Etapa', value: stageFilter, group: 'Negócio', kind: 'enum', allLabel: 'Todas as etapas', options: options.stages.map((value) => ({ value, label: value })) },
    { key: 'priority', label: 'Prioridade', value: priorityFilter, group: 'Qualificação', kind: 'enum', allLabel: 'Todas as prioridades', options: [{ value: 'urgent', label: 'Urgente' }, { value: 'high', label: 'Alta' }, { value: 'medium', label: 'Média' }, { value: 'low', label: 'Baixa' }] },
    { key: 'temperature', label: 'Temperatura', value: temperatureFilter, group: 'Qualificação', kind: 'enum', allLabel: 'Todas as temperaturas', options: [{ value: 'hot', label: 'Quente' }, { value: 'warm', label: 'Morno' }, { value: 'cold', label: 'Frio' }] },
  ], [cityFilter, options.cities, options.segments, options.sources, options.stages, priorityFilter, segmentFilter, sourceFilter, stageFilter, temperatureFilter])
  const activePreparationFilters = preparationFilterFields.filter((field) => field.value !== (field.allValue ?? 'all') && field.value !== '').length
  const changePreparationFilter = (key: string, value: string) => {
    if (key === 'source') setSourceFilter(value)
    else if (key === 'segment') setSegmentFilter(value)
    else if (key === 'city') setCityFilter(value)
    else if (key === 'stage') setStageFilter(value)
    else if (key === 'priority') setPriorityFilter(value as 'all' | LeadPriority)
    else if (key === 'temperature') setTemperatureFilter(value as 'all' | LeadTemperature)
  }
  const clearPreparationFilters = () => { setSourceFilter('all'); setSegmentFilter('all'); setCityFilter('all'); setStageFilter('all'); setPriorityFilter('all'); setTemperatureFilter('all') }

  const phoneCounts = useMemo(() => {
    const counts = new Map<string, number>()
    callableCandidates.forEach((lead) => {
      const phone = normalizePhone(leadTargets.get(lead.id)?.phone)
      if (phone) counts.set(phone, (counts.get(phone) ?? 0) + 1)
    })
    return counts
  }, [callableCandidates, leadTargets])

  const validation = useMemo(() => {
    const now = new Date()
    const calls = snapshot?.calls ?? []
    const events = snapshot?.events ?? []
    const blocked = candidateLeads.filter((lead) => lead.doNotContact).length
    const missingPhone = candidateLeads.filter((lead) => !lead.doNotContact && !leadTargets.get(lead.id)?.phone).length
    const duplicates = callableCandidates.filter((lead) => (phoneCounts.get(normalizePhone(leadTargets.get(lead.id)?.phone)) ?? 0) > 1).length
    const contactedToday = callableCandidates.filter((lead) => calls.some((call) => call.leadId === lead.id && sameDay(call.startedAt, now))).length
    const meetings = callableCandidates.filter((lead) => events.some((event) => event.leadId === lead.id && ['confirmed', 'tentative'].includes(event.status) && new Date(event.startsAt).getTime() >= now.getTime())).length
    return { blocked, missingPhone, duplicates, contactedToday, meetings }
  }, [callableCandidates, candidateLeads, leadTargets, phoneCounts, snapshot?.calls, snapshot?.events])

  const visibleLeads = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return candidateLeads.filter((lead) => {
      const source = lead.source?.trim() || 'Sem origem'
      const segment = segmentFor(lead)
      const city = lead.city?.trim() || 'Sem cidade'
      const stage = stageFor(lead)
      const target = leadTargets.get(lead.id)
      if (sourceFilter !== 'all' && source !== sourceFilter) return false
      if (segmentFilter !== 'all' && segment !== segmentFilter) return false
      if (cityFilter !== 'all' && city !== cityFilter) return false
      if (stageFilter !== 'all' && stage !== stageFilter) return false
      if (priorityFilter !== 'all' && lead.priority !== priorityFilter) return false
      if (temperatureFilter !== 'all' && lead.temperature !== temperatureFilter) return false
      if (!normalized) return true
      return `${lead.name} ${lead.company} ${target?.name ?? ''} ${target?.phone ?? ''} ${source} ${segment} ${city} ${stage}`.toLowerCase().includes(normalized)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateLeads, cityFilter, leadTargets, priorityFilter, query, segmentFilter, sourceFilter, stageFilter, temperatureFilter, snapshot?.companies, snapshot?.stages])

  const selectedCallableLeads = useMemo(() => callableCandidates.filter((lead) => selectedIds.includes(lead.id)), [callableCandidates, selectedIds])
  const healthSummary = useMemo(() => candidateLeads.reduce((summary, lead) => { const status = callHealthByLead.get(lead.id)?.status ?? 'attention'; summary[status] += 1; return summary }, { good: 0, attention: 0, restricted: 0 }), [callHealthByLead, candidateLeads])

  const orderedSessionLeads = useMemo(() => {
    const sorted = [...selectedCallableLeads]
    if (order === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    if (order === 'next_action') sorted.sort((a, b) => (a.nextActionAt ?? '9999').localeCompare(b.nextActionAt ?? '9999'))
    if (order === 'smart') sorted.sort((a, b) => {
      const urgency = (lead: Lead) => (lead.priority === 'urgent' ? 4 : lead.priority === 'high' ? 3 : lead.priority === 'medium' ? 2 : 1)
        + (lead.nextActionAt && new Date(lead.nextActionAt).getTime() < Date.now() ? 3 : 0)
        + (lead.temperature === 'hot' ? 2 : lead.temperature === 'warm' ? 1 : 0)
      return urgency(b) - urgency(a)
    })
    return sorted.slice(0, Math.max(1, Math.min(maxSession, 100)))
  }, [maxSession, order, selectedCallableLeads])

  const activeSessionPlaybooks = useMemo(() => (snapshot?.playbooks ?? []).filter((item) => item.kind === 'script' && item.active), [snapshot?.playbooks])
  const automaticPlaybookRecommendation = useMemo(() => {
    const lead = orderedSessionLeads[0] ?? candidateLeads.find((item) => item.id === initialLeadId) ?? candidateLeads[0]
    if (!lead) return null
    const target = leadTargets.get(lead.id)
    const contact = target?.contactId ? snapshot?.contacts.find((item) => item.id === target.contactId) ?? null : null
    return recommendPlaybooks(snapshot?.playbooks ?? [], {
      objective: sessionObjective,
      stageId: lead.stageId,
      decisionRole: contact?.decisionRole ?? lead.decisionRole ?? null,
      temperature: lead.temperature,
      kind: 'script',
    })[0] ?? null
  }, [candidateLeads, initialLeadId, leadTargets, orderedSessionLeads, sessionObjective, snapshot?.contacts, snapshot?.playbooks])
  const effectiveSessionPlaybookId = playbookId || (strategy.autoSelectPlaybook ? automaticPlaybookRecommendation?.playbook.id : strategy.defaultPlaybookId) || ''
  const effectiveSessionPlaybook = activeSessionPlaybooks.find((item) => item.id === effectiveSessionPlaybookId) ?? null

  const approachFor = (lead: Lead): CallApproachType => {
    const manual = approachOverrides[lead.id]
    if (manual) return manual
    const activities = (snapshot?.activities ?? []).filter((item) => item.leadId === lead.id)
    const events = (snapshot?.events ?? []).filter((item) => item.leadId === lead.id)
    return classifyCallApproach({
      lead,
      calls: snapshot?.calls ?? [],
      activityDates: [...activities.map((item) => item.completedAt || item.createdAt), ...events.map((item) => item.startsAt)],
      proposalExists: (snapshot?.proposals ?? []).some((item) => item.leadId === lead.id),
    })
  }
  const playbookFor = (lead: Lead) => {
    const latest = (snapshot?.calls ?? []).filter((call) => call.leadId === lead.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
    const recommended = recommendApproachPlaybook({ lead, approach: approachFor(lead), objective: sessionObjective, playbooks: snapshot?.playbooks ?? [], lastOutcome: latest?.outcome ?? null })
    // Explicit session playbook choice has precedence, otherwise recommend individually.
    return (playbookId ? activeSessionPlaybooks.find((item) => item.id === playbookId) : null) ?? recommended ?? effectiveSessionPlaybook
  }
  const setLeadApproach = (leadId: string, approach: CallApproachType) => {
    setApproachOverrides((current) => {
      const next = { ...current, [leadId]: approach }
      try { localStorage.setItem(`realtalent:call-approaches:${workspaceId}`, JSON.stringify(next)) } catch { /* optional workspace preference */ }
      return next
    })
  }

  const estimatedMinutes = Math.max(0, Math.round(orderedSessionLeads.length * 2.5))
  const suggestedGoal = Math.max(1, Math.min(orderedSessionLeads.length || 1, Math.ceil(orderedSessionLeads.length * .4)))
  const effectiveGoal = Math.max(1, Math.min(goal, orderedSessionLeads.length || 1))
  const objective = CALL_SESSION_OBJECTIVES.find((item) => item.id === sessionObjective) ?? CALL_SESSION_OBJECTIVES[0]

  const sessionStats = useMemo(() => {
    const now = new Date()
    const calls = snapshot?.calls ?? []
    return {
      newLeads: orderedSessionLeads.filter((lead) => !calls.some((call) => call.leadId === lead.id)).length,
      callbacks: orderedSessionLeads.filter((lead) => calls.filter((call) => call.leadId === lead.id).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0]?.outcome === 'callback_requested').length,
      overdue: orderedSessionLeads.filter((lead) => Boolean(lead.nextActionAt && new Date(lead.nextActionAt).getTime() < now.getTime())).length,
      hot: orderedSessionLeads.filter((lead) => lead.temperature === 'hot').length,
    }
  }, [orderedSessionLeads, snapshot?.calls])

  useEffect(() => {
    if (!open) return
    setActiveTab('queue')
    setDisplay(readCallDisplayPreferences(workspaceId))
    try { setApproachOverrides(JSON.parse(localStorage.getItem(`realtalent:call-approaches:${workspaceId}`) || '{}') as Record<string, CallApproachType>) } catch { setApproachOverrides({}) }
    setAdvancedSettingsOpen(false)
    setSavedLists(readSavedLists(workspaceId))
    setQuery('')
    setSourceFilter('all')
    setSegmentFilter('all')
    setCityFilter('all')
    setStageFilter('all')
    setPriorityFilter('all')
    setTemperatureFilter('all')
    setSaveListOpen(false)
    setSaveListName('')
    setOrder('smart')
    const savedStrategy = readCallingStrategyPreferences(workspaceId)
    setStrategy(savedStrategy)
    setSessionMode(savedStrategy.defaultSessionMode)
    setSessionObjective(savedStrategy.defaultObjective)
    setPlaybookId(savedStrategy.autoSelectPlaybook ? '' : savedStrategy.defaultPlaybookId)
    const validIds = callableCandidates.map((lead) => lead.id)
    setSelectedIds(validIds)
    const queueSize = Math.max(1, Math.min(validIds.length || 1, 100))
    setMaxSession(queueSize)
    setGoal(Math.max(1, Math.ceil(queueSize * .4)))
    const initialLead = snapshot?.leads.find((lead) => lead.id === (initialLeadId || leadIds[0]))
    if (initialLead && savedStrategy.defaultObjective === 'first_meeting') setSessionObjective(inferCallSessionObjective(initialLead, snapshot))
  // candidateLeads intentionally included so a just-refreshed snapshot initializes the real eligible set.
  }, [callableCandidates, candidateLeads, initialLeadId, leadIds, open, snapshot, workspaceId])

  const reasonFor = (lead: Lead) => {
    if (lead.nextActionAt && new Date(lead.nextActionAt).getTime() < Date.now()) return 'Retorno atrasado'
    const lastCall = (snapshot?.calls ?? []).filter((call) => call.leadId === lead.id).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0]
    if (lastCall?.outcome === 'callback_requested') return 'Retorno solicitado'
    if (lead.temperature === 'hot') return 'Lead quente'
    return stageFor(lead)
  }

  const rowFlags = (lead: Lead) => {
    const phone = normalizePhone(leadTargets.get(lead.id)?.phone)
    const now = new Date()
    return {
      duplicate: Boolean(phone && (phoneCounts.get(phone) ?? 0) > 1),
      contactedToday: (snapshot?.calls ?? []).some((call) => call.leadId === lead.id && sameDay(call.startedAt, now)),
      meeting: (snapshot?.events ?? []).some((event) => event.leadId === lead.id && ['confirmed', 'tentative'].includes(event.status) && new Date(event.startsAt).getTime() >= now.getTime()),
    }
  }

  const toggleLead = (leadId: string) => setSelectedIds((current) => current.includes(leadId) ? current.filter((id) => id !== leadId) : [...current, leadId])
  const callableVisibleIds = visibleLeads.filter((lead) => Boolean(leadTargets.get(lead.id)?.phone) && callHealthByLead.get(lead.id)?.status !== 'restricted').map((lead) => lead.id)
  const allVisibleSelected = callableVisibleIds.length > 0 && callableVisibleIds.every((id) => selectedIds.includes(id))
  const toggleVisible = () => setSelectedIds((current) => {
    if (allVisibleSelected) return current.filter((id) => !callableVisibleIds.includes(id))
    return [...new Set([...current, ...callableVisibleIds])]
  })

  const saveCurrentList = () => {
    const name = saveListName.trim()
    if (!name) { notify('info', 'Digite um nome para salvar esta lista.'); return }
    if (!selectedCallableLeads.length) { notify('error', 'Selecione pelo menos um contato com telefone válido.'); return }
    const next: SavedCallList[] = [{ id: `call-list-${Date.now()}`, name, leadIds: selectedCallableLeads.map((lead) => lead.id), createdAt: new Date().toISOString() }, ...savedLists].slice(0, 12)
    setSavedLists(next)
    persistSavedLists(workspaceId, next)
    setSaveListName('')
    setSaveListOpen(false)
    notify('success', `Lista “${name}” salva.`)
  }

  const applySavedList = (list: SavedCallList) => {
    const available = new Set(callableCandidates.map((lead) => lead.id))
    const ids = list.leadIds.filter((id) => available.has(id))
    setSelectedIds(ids)
    setMaxSession(Math.max(1, Math.min(ids.length || 1, 100)))
    setGoal(Math.max(1, Math.ceil(Math.max(ids.length, 1) * .4)))
    notify(ids.length ? 'success' : 'info', ids.length ? `${ids.length} contatos carregados da lista “${list.name}”.` : `Nenhum contato da lista “${list.name}” está disponível nesta fila.`)
  }

  const removeSavedList = (id: string) => {
    const next = savedLists.filter((list) => list.id !== id)
    setSavedLists(next)
    persistSavedLists(workspaceId, next)
  }

  const start = () => {
    if (!orderedSessionLeads.length) { notify('error', 'Selecione ao menos um contato com telefone válido para começar.'); return }
    saveCallDisplayPreferences(workspaceId, display)
    const preferred = initialLeadId && orderedSessionLeads.some((lead) => lead.id === initialLeadId) ? initialLeadId : orderedSessionLeads[0].id
    onStart({
      leadIds: orderedSessionLeads.map((lead) => lead.id),
      initialLeadId: preferred,
      playbookId: effectiveSessionPlaybookId,
      playbookByLeadId: Object.fromEntries(orderedSessionLeads.map((lead) => [lead.id, playbookFor(lead)?.id || effectiveSessionPlaybookId])),
      sessionGoal: effectiveGoal,
      linkedGoalId,
      sessionMode,
      sessionObjective,
      autoAdvance: sessionMode === 'power' ? true : autoAdvance,
      autoAdvanceSeconds,
      smartWrap,
      fastDial,
      autoDispatchNext: fastDial && autoDispatchNext,
      autoDispatchDelaySeconds,
      display,
    })
  }
  const activeStepIndex = PREPARATION_STEPS.indexOf(activeTab)
  const previousStep = () => setActiveTab(PREPARATION_STEPS[Math.max(0, activeStepIndex - 1)] ?? 'queue')
  const nextStep = () => setActiveTab(PREPARATION_STEPS[Math.min(PREPARATION_STEPS.length - 1, activeStepIndex + 1)] ?? 'review')


  return <>
    <Modal open={open} onClose={onClose} title="Preparar Sessão" className="rt-setup-modal" size="full">
      <div className="rt-setup-wizard" data-realtalent-setup-ui="reference-exact-v1">
        <header className="rt-setup-wizard__header">
          <div className="rt-setup-wizard__header-row">
            <h1>Preparar Sessão</h1>
            <div className="rt-setup-wizard__header-right"><span>Etapa {activeStepIndex + 1} de 4</span><button type="button" aria-label="Fechar preparação" onClick={onClose}><X size={19}/></button></div>
          </div>
          <nav className="rt-setup-wizard__steps" aria-label="Etapas de preparação">
            {PREPARATION_STEPS.map((step, idx) => {
              const StepIcon = [UsersRound, Settings2, Target, Check][idx]
              return <div className="rt-setup-wizard__step-group" key={step}>
                <button type="button" onClick={() => setActiveTab(step)} className={'rt-setup-wizard__step' + (idx === activeStepIndex ? ' is-active' : idx < activeStepIndex ? ' is-done' : '')} aria-current={idx === activeStepIndex ? 'step' : undefined}>
                  <StepIcon size={16}/>{['Quem ligar', 'Como ligar', 'Roteiro e objetivo', 'Revisar'][idx]}
                </button>
                {idx < PREPARATION_STEPS.length - 1 ? <i className={idx < activeStepIndex ? 'is-done' : ''} /> : null}
              </div>
            })}
          </nav>
        </header>

        <div className="rt-setup-wizard__body" key={activeTab}>
          {activeTab === 'queue' ? <section className="rt-setup-step">
            <div className="rt-setup-step__heading">
              <h2>Quem entra nesta sessão</h2>
              <p>O CRM classificou os contatos e sugeriu a melhor abordagem individual.</p>
            </div>
            <div className="rt-setup-table-shell">
              <div className="rt-setup-queue-toolbar">
                <label className="rt-setup-search"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar lead, empresa..." /></label>
                <details className="rt-setup-queue-filters">
                  <summary><SlidersHorizontal size={17}/> Filtros</summary>
                  <div className="rt-setup-queue-filters__menu">
                    <WorkspaceFilterMenu workspaceKey={'call-setup:' + workspaceId} fields={preparationFilterFields} activeCount={activePreparationFilters} onChange={changePreparationFilter} onClearAll={clearPreparationFilters}/>
                    <WorkspaceSortMenu value={order} onChange={(value) => setOrder(value as QueueOrder)} options={[{value:'smart',label:'Prioridade inteligente'},{value:'next_action',label:'Próxima ação'},{value:'name',label:'Nome A–Z'}]}/>
                    <WorkspaceFilterChips fields={preparationFilterFields} onChange={changePreparationFilter} onClearAll={clearPreparationFilters}/>
                  </div>
                </details>
              </div>
              <div className="rt-setup-table-scroll">
                <table className="rt-setup-table">
                  <thead><tr>
                    <th className="is-check"><input type="checkbox" aria-label={allVisibleSelected ? 'Remover visíveis' : 'Selecionar visíveis'} checked={allVisibleSelected} onChange={toggleVisible}/></th>
                    <th>Contato e Empresa</th><th>Tipo de Abordagem</th><th>Playbook Recomendado</th>
                  </tr></thead>
                  <tbody>{visibleLeads.map((lead) => {
                    const target = leadTargets.get(lead.id)
                    const health = callHealthByLead.get(lead.id)
                    const callable = Boolean(target?.phone) && health?.status !== 'restricted'
                    const selected = selectedIds.includes(lead.id)
                    const approach = approachFor(lead)
                    const recommended = playbookFor(lead)
                    return <tr key={lead.id} className={selected ? 'is-selected' : ''}>
                      <td><input type="checkbox" checked={selected} disabled={!callable} onChange={() => toggleLead(lead.id)} aria-label={'Selecionar ' + (target?.name || lead.name)}/></td>
                      <td><strong>{target?.name || lead.name}</strong><small>{lead.company || lead.name}{!callable ? ' · Telefone indisponível' : ''}</small></td>
                      <td><select className={'rt-setup-approach is-' + approach} value={approach} aria-label={'Tipo de abordagem de ' + lead.name} onChange={(event) => setLeadApproach(lead.id, event.target.value as CallApproachType)}>
                        {callApproachEntries.map(([id, definition]) => <option key={id} value={id}>{definition.label}</option>)}
                      </select></td>
                      <td><span className="rt-setup-playbook"><FileText size={16}/>{recommended?.title || 'Nenhum roteiro disponível'}</span></td>
                    </tr>
                  })}</tbody>
                </table>
              </div>
              {!visibleLeads.length ? <p className="rt-setup-empty">Nenhum contato encontrado. Ajuste os filtros.</p> : null}
            </div>
            <div className="rt-setup-queue-meta">
              <span>{orderedSessionLeads.length} contato(s) selecionado(s) · {callableCandidates.length} discáveis</span>
              <details>
                <summary><BookmarkPlus size={15}/> Listas salvas e seleção</summary>
                <div className="rt-setup-saved">
                  {savedLists.map((list) => <div key={list.id}><button type="button" onClick={() => applySavedList(list)}>{list.name} · {list.leadIds.length} contatos</button><button type="button" aria-label={'Excluir ' + list.name} onClick={() => removeSavedList(list.id)}><Trash2 size={14}/></button></div>)}
                  {saveListOpen ? <div><input aria-label="Nome da lista" placeholder="Nome da lista" value={saveListName} onChange={(event) => setSaveListName(event.target.value)}/><button type="button" onClick={saveCurrentList}>Salvar lista</button></div> : <button type="button" onClick={() => setSaveListOpen(true)}>Salvar seleção atual</button>}
                </div>
              </details>
            </div>
          </section> : null}

          {activeTab === 'settings' ? <section className="rt-setup-step">
            <div className="rt-setup-step__heading"><h2>Comportamento entre ligações</h2><p>Automatize o trabalho manual e configure sua interface de foco.</p></div>
            <div className="rt-setup-settings-grid">
              <div className="rt-setup-switches">
                <button type="button" className="rt-setup-switch-card" aria-pressed={smartWrap} onClick={() => setSmartWrap(!smartWrap)}>
                  <span><strong>Wrap-up inteligente</strong><small>Sugere o próximo passo de acordo com o resultado da ligação.</small></span><i className={smartWrap ? 'is-on' : ''}/>
                </button>
                <button type="button" className="rt-setup-switch-card" aria-pressed={fastDial} disabled={voiceSettings.defaultProviderId !== 'realtalent_connect' || !voiceSettings.selectedDeviceId.startsWith('connect:phone:')} onClick={() => { setFastDial(!fastDial); if (fastDial) setAutoDispatchNext(false) }}>
                  <span><strong>One-Tap via RealTalent Connect</strong><small>{voiceSettings.defaultProviderId === 'realtalent_connect' && voiceSettings.selectedDeviceId.startsWith('connect:phone:') ? 'Aciona a chamada no celular sem clicar em “Ligar agora”.' : 'Conecte um RealTalent Phone para habilitar One-Tap.'}</small></span><i className={fastDial ? 'is-on' : ''}/>
                </button>
              </div>
              <aside className="rt-setup-focus-card">
                <Focus size={42}/><h3>Modo Foco</h3>
                <p>Ajuste os painéis visíveis durante a sua ligação para evitar distrações.</p>
                <button type="button" onClick={() => setDisplayOpen(true)}>Personalizar tela da conversa</button>
              </aside>
            </div>
            <details className="rt-setup-advanced">
              <summary><Settings2 size={16}/> Configurações adicionais de telefonia e cadência</summary>
              <div className="rt-setup-advanced__inner">
                <div className="rt-setup-voice-info"><strong>RealTalent Voice</strong><span>Provedor: {providerLabel(voiceSettings.defaultProviderId)}</span><span>Dispositivo: {voiceSettings.selectedDeviceId === 'external:system-dialer' ? 'Discador do sistema' : voiceSettings.selectedDeviceId || 'Padrão do provedor'}</span><Button size="sm" variant="secondary" onClick={() => setVoiceOpen(true)}>Configurar RealTalent Voice</Button></div>
                <button type="button" className="rt-setup-switch-card" aria-pressed={sessionMode === 'power' || autoAdvance} disabled={sessionMode === 'power'} onClick={() => setAutoAdvance(!autoAdvance)}><span><strong>Preparar próximo contato</strong><small>Carrega o lead seguinte após registrar o resultado.</small></span><i className={(sessionMode === 'power' || autoAdvance) ? 'is-on' : ''}/></button>
                {(sessionMode === 'power' || autoAdvance) ? <label>Intervalo da preparação <select value={autoAdvanceSeconds} onChange={(event) => setAutoAdvanceSeconds(Number(event.target.value))}><option value={3}>3 segundos</option><option value={5}>5 segundos</option><option value={8}>8 segundos</option></select></label> : null}
                {fastDial ? <button type="button" className="rt-setup-switch-card" aria-pressed={autoDispatchNext} onClick={() => setAutoDispatchNext(!autoDispatchNext)}><span><strong>Enviar próximo contato automaticamente</strong><small>Exige RealTalent Phone disponível e conectado.</small></span><i className={autoDispatchNext ? 'is-on' : ''}/></button> : null}
                {fastDial && autoDispatchNext ? <label>Intervalo de envio <select value={autoDispatchDelaySeconds} onChange={(event) => setAutoDispatchDelaySeconds(Number(event.target.value))}><option value={0}>Imediatamente</option><option value={1}>1 segundo</option><option value={2}>2 segundos</option></select></label> : null}
              </div>
            </details>
          </section> : null}

          {activeTab === 'strategy' ? <section className="rt-setup-step rt-setup-step--strategy">
            <div className="rt-setup-step__heading"><h2>Estratégia da Sessão</h2><p>Defina o objetivo macro e como o sistema deve conduzir a cadência.</p></div>
            <div className="rt-setup-objective">
              <label htmlFor="rt-setup-objective">1. Objetivo Comercial</label>
              <select id="rt-setup-objective" value={sessionObjective} onChange={(event) => setSessionObjective(event.target.value as CallSessionObjective)}>
                {CALL_SESSION_OBJECTIVES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
              <p>O CRM priorizará os playbooks recomendados no Passo 1 baseados neste objetivo macro.</p>
            </div>
            <div className="rt-setup-mode">
              <h3>2. Estratégia de Execução (Modo)</h3>
              <div className="rt-setup-mode-grid">
                <button type="button" className={sessionMode === 'focus' ? 'is-active' : ''} aria-pressed={sessionMode === 'focus'} onClick={() => setSessionMode('focus')}>
                  {sessionMode === 'focus' ? <span className="rt-setup-mode-check"><Check size={13}/></span> : null}
                  <Focus size={25}/><strong>Focus</strong><small>Máximo contexto antes de cada conversa. Um lead por vez. Ideal para vendas complexas.</small>
                </button>
                <button type="button" className={sessionMode === 'power' ? 'is-active' : ''} aria-pressed={sessionMode === 'power'} onClick={() => setSessionMode('power')}>
                  {sessionMode === 'power' ? <span className="rt-setup-mode-check"><Check size={13}/></span> : null}
                  <Gauge size={25}/><strong>Power assistido</strong><small>Prepara o próximo contato imediatamente após o wrap-up. Foco em volume.</small>
                </button>
              </div>
            </div>
            <div className="rt-setup-strategy-bottom">
              <label>Organização da Fila <select value={order} onChange={(event) => setOrder(event.target.value as QueueOrder)}><option value="smart">Prioridade inteligente</option><option value="next_action">Próxima ação</option><option value="name">Ordem alfabética</option></select></label>
              <i/>
              <div><span>Meta da Sessão (Conversas)</span><div className="rt-setup-goal-buttons"><button type="button" onClick={() => setGoal(Math.max(1, effectiveGoal - 1))} aria-label="Diminuir meta">−</button><strong>{effectiveGoal}</strong><button type="button" onClick={() => setGoal(Math.min(Math.max(1, orderedSessionLeads.length), effectiveGoal + 1))} aria-label="Aumentar meta">+</button></div></div>
            </div>
            <details className="rt-setup-advanced">
              <summary><BookOpenText size={16}/> Roteiro padrão, limite e meta vinculada</summary>
              <div className="rt-setup-advanced__inner">
                <p>Os roteiros são sugeridos por contato. Use a seleção manual apenas quando quiser um único roteiro para a sessão.</p>
                <div className="rt-setup-voice-info"><strong>Roteiro da sessão</strong><span>{playbookId ? effectiveSessionPlaybook?.title || 'Roteiro padrão' : 'Seleção individual automática'}</span><Button size="sm" variant="secondary" onClick={() => setPlaybookPickerOpen(true)}>Trocar roteiro</Button></div>
                <label>Máximo da sessão <input type="number" min={1} max={100} value={maxSession} onChange={(event) => setMaxSession(Math.max(1, Math.min(100, Number(event.target.value) || 1)))}/></label>
                <label>Meta do CRM vinculada <select value={linkedGoalId} onChange={(event) => setLinkedGoalId(event.target.value)}><option value="">Sem meta vinculada</option>{activeGoals.map((item) => <option key={item.id} value={item.id}>{goalMetricLabels[item.metric]} · {item.userName || 'Equipe'}</option>)}</select></label>
                {linkedGoalInsight ? <p>{goalMetricLabels[linkedGoalInsight.goal.metric]}: {Math.round(linkedGoalInsight.value)} / {linkedGoalInsight.goal.targetValue} ({linkedGoalInsight.percentage}%)</p> : null}
              </div>
            </details>
          </section> : null}

          {activeTab === 'review' ? <section className="rt-setup-step">
            <div className="rt-setup-step__heading"><h2>Revisão Operacional</h2><p>Confirme a estratégia individual antes de entrar no Modo Foco.</p></div>
            <div className="rt-setup-review-grid">
              <div className="rt-setup-review-left">
                <div className="rt-setup-prepared">
                  <div><h3>Sessão Preparada</h3><p>{orderedSessionLeads.length} contatos selecionados</p></div>
                  <div><span>Meta: {effectiveGoal} conversas</span><strong><Clock3 size={16}/> Est. {estimatedMinutes} min</strong></div>
                </div>
                <div className="rt-setup-review-table-shell"><table className="rt-setup-table rt-setup-review-table">
                  <thead><tr><th>Contato</th><th>Tipo</th><th>Roteiro Atribuído</th></tr></thead>
                  <tbody>{orderedSessionLeads.map((lead) => <tr key={lead.id}>
                    <td><strong>{leadTargets.get(lead.id)?.name || lead.name}</strong></td>
                    <td><span className={'rt-setup-type-chip is-' + approachFor(lead)}>{CALL_APPROACHES[approachFor(lead)].label}</span></td>
                    <td>{playbookFor(lead)?.title || 'Sem playbook configurado'}</td>
                  </tr>)}</tbody>
                </table></div>
              </div>
              <aside className="rt-setup-review-right">
                <div className="rt-setup-config-summary">
                  <h4>Configurações</h4>
                  <dl><div><dt>Objetivo</dt><dd>{objective.shortLabel}</dd></div><div><dt>Modo</dt><dd>{sessionMode === 'focus' ? 'Focus' : 'Power assistido'}</dd></div><div><dt>Canal</dt><dd>{providerLabel(voiceSettings.defaultProviderId)}</dd></div></dl>
                </div>
                {(() => {
                  const issues = [
                    ...orderedSessionLeads.filter((lead) => rowFlags(lead).contactedToday).map((lead) => (leadTargets.get(lead.id)?.name || lead.name) + ' já foi contatado hoje.'),
                    ...orderedSessionLeads.filter((lead) => rowFlags(lead).duplicate).map((lead) => (leadTargets.get(lead.id)?.name || lead.name) + ' possui telefone duplicado.'),
                    ...(fastDial && voiceReadiness !== 'ready' ? ['RealTalent Phone ainda não está confirmado como online. O One-Tap permanecerá pausado.'] : []),
                  ]
                  return <div className={'rt-setup-validation' + (issues.length ? ' is-warning' : ' is-good')}>
                    <h4>{issues.length ? <AlertTriangle size={17}/> : <Check size={17}/>} {issues.length ? 'Atenção Requerida' : 'Pronto para iniciar'}</h4>
                    {issues.length ? issues.slice(0, 4).map((issue, idx) => <p key={idx}>{issue}</p>) : <p>Os contatos selecionados possuem telefone disponível. A conexão do provedor é verificada separadamente.</p>}
                  </div>
                })()}
                {orderedSessionLeads[0] ? <div className="rt-setup-next"><strong>Primeiro contato</strong><span>{leadTargets.get(orderedSessionLeads[0].id)?.name || orderedSessionLeads[0].name}</span></div> : null}
              </aside>
            </div>
          </section> : null}
        </div>

        <footer className="rt-setup-wizard__footer">
          <button type="button" className="rt-setup-link" onClick={onClose}>Cancelar</button>
          <div>
            {activeStepIndex > 0 ? <button type="button" className="rt-setup-back" onClick={previousStep}><ChevronLeft size={17}/> Voltar</button> : null}
            {activeTab !== 'review' ? <button type="button" className="rt-setup-primary" disabled={activeTab === 'queue' && !orderedSessionLeads.length} onClick={nextStep}>Continuar <ChevronRight size={17}/></button> : <button type="button" className="rt-setup-primary" disabled={!orderedSessionLeads.length} onClick={start}><PhoneCall size={17}/> Começar ligações</button>}
          </div>
        </footer>
      </div>
    </Modal>
    <Modal open={playbookPickerOpen} title="Escolher roteiro da prospecção" subtitle="Troque somente esta sessão ou volte para a seleção automática do Strategy Hub." size="lg" onClose={() => setPlaybookPickerOpen(false)} footer={<><Button variant="ghost" onClick={() => setPlaybookPickerOpen(false)}>Fechar</Button><span className="modal__footer-spacer"/><Button variant="secondary" onClick={() => { setPlaybookPickerOpen(false); onClose(); navigate('playbooks', { filter: 'strategy' }) }}><WandSparkles size={16}/> Configurar estratégia</Button></>}>
      <div className="call-preparation-v1012__route-picker">
        <button type="button" className={!playbookId ? 'is-active' : ''} onClick={() => { setPlaybookId(''); setPlaybookPickerOpen(false) }}><Sparkles size={18}/><div><strong>{strategy.autoSelectPlaybook ? 'Seleção automática' : 'Usar padrão do Strategy Hub'}</strong><span>{strategy.autoSelectPlaybook ? 'O RealTalent usa contexto, objetivo, etapa e papel decisório.' : (activeSessionPlaybooks.find((item) => item.id === strategy.defaultPlaybookId)?.title || 'Roteiro padrão RealTalent')}</span></div></button>
        {activeSessionPlaybooks.map((item) => { const recommended = automaticPlaybookRecommendation?.playbook.id === item.id; return <button type="button" key={item.id} className={playbookId === item.id ? 'is-active' : ''} onClick={() => { setPlaybookId(item.id); setPlaybookPickerOpen(false) }}><BookOpenText size={18}/><div><strong>{item.title}{recommended ? ' · recomendado' : ''}</strong><span>{item.guidance?.coachingFocus || item.category || 'Roteiro comercial'}</span><small>{item.guidance?.segments?.length ? item.guidance.segments.join(' · ') : 'Uso geral'}</small></div></button> })}
      </div>
    </Modal>
    <CallDisplayPreferencesModal open={displayOpen} value={display} onClose={() => setDisplayOpen(false)} onSave={(next) => { setDisplay(next); setDisplayOpen(false) }} />
    <VoiceDialerSettingsModal
      open={voiceOpen}
      workspaceId={workspaceId}
      value={voiceSettings}
      onClose={() => setVoiceOpen(false)}
      onSave={(next) => {
        setVoiceSettings(next)
        const connectPhoneReady = next.defaultProviderId === 'realtalent_connect' && next.selectedDeviceId.startsWith('connect:phone:')
        setFastDial(connectPhoneReady)
        setAutoDispatchNext(connectPhoneReady)
        if (connectPhoneReady) setAutoDispatchDelaySeconds(1)
        setVoiceOpen(false)
      }}
    />
  </>
}
