import { NativeSelectionSelect } from '../../components/selection'
import '../../styles/calls-v10070.css'
import '../../styles/calls-ui-standard-v10071.css'
import '../../styles/calls-intelligence-workspace-v10072.css'
import '../../styles/calls-focus-simplification-v100731.css'
import '../../styles/calling-workspace-operational.css'
import {
  AlertTriangle,
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
import { providerLabel, readVoiceSettings, type VoiceSettings } from '../../services/voice-dialer'
import { recommendPlaybooks } from '../../services/coaching-engine'
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
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(() => readVoiceSettings(workspaceId))
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [playbookPickerOpen, setPlaybookPickerOpen] = useState(false)
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
    <Modal
      open={open}
      onClose={onClose}
      title="Preparar ligações"
      subtitle="Defina quem ligar, como ligar, qual roteiro usar e revise a sessão antes de começar."
      size="full"
      footer={<div className="call-preparation-wizard-footer-v10171">
        <div className="call-preparation-wizard-footer-v10171__left"><Button variant="ghost" onClick={onClose}>Cancelar</Button><span>{activeStepIndex + 1} de {PREPARATION_STEPS.length}</span></div>
        <span className="call-preparation-footer-summary">{orderedSessionLeads.length} contatos · {effectiveSessionPlaybook?.title || "Roteiro padrão"} · ~{estimatedMinutes} min</span>
        <div className="call-preparation-wizard-footer-v10171__actions">{activeStepIndex > 0 ? <Button variant="secondary" onClick={previousStep}>Voltar</Button> : null}{activeTab === 'review' ? <Button onClick={start} disabled={!orderedSessionLeads.length}><Play size={17} /> Começar ligações</Button> : <Button onClick={nextStep} disabled={activeTab === 'queue' && !orderedSessionLeads.length}>Continuar</Button>}</div>
      </div>}
    >
      <div className="call-preparation-v70 call-preparation-wizard-v10171">
        <header className="call-preparation-v70__hero call-preparation-wizard-v10171__hero">
          <div>
            <span className="eyebrow">RealTalent Calling</span>
            <h3>Prepare a sessão</h3>
            <p>Um passo por vez: escolha a fila, configure a ligação, defina o roteiro e revise antes de começar.</p>
          </div>
          <div className="call-preparation-v70__hero-kpis">
            <span><strong>{candidateLeads.length}</strong><small>recebidos</small></span>
            <span><strong>{callableCandidates.length}</strong><small>discáveis</small></span>
            <span><strong>{orderedSessionLeads.length}</strong><small>na sessão</small></span>
          </div>
        </header>

        <nav className="call-preparation-v70__tabs call-preparation-steps-v10171 call-tabs call-tabs--sub" role="tablist" aria-label="Preparação da sessão">
          <button type="button" role="tab" aria-selected={activeTab === 'queue'} className={`call-tab ${activeTab === 'queue' ? 'is-active' : ''}`} onClick={() => setActiveTab('queue')}><span className="call-preparation-step-number-v10171">1</span><ListOrdered size={16} /><span className="call-tab__label">Quem ligar</span><b className="call-tab__badge">{orderedSessionLeads.length}</b></button>
          <button type="button" role="tab" aria-selected={activeTab === 'settings'} className={`call-tab ${activeTab === 'settings' ? 'is-active' : ''}`} onClick={() => setActiveTab('settings')}><span className="call-preparation-step-number-v10171">2</span><Settings2 size={16} /><span className="call-tab__label">Como ligar</span></button>
          <button type="button" role="tab" aria-selected={activeTab === 'strategy'} className={`call-tab ${activeTab === 'strategy' ? 'is-active' : ''}`} onClick={() => setActiveTab('strategy')}><span className="call-preparation-step-number-v10171">3</span><Target size={16} /><span className="call-tab__label">Roteiro e objetivo</span></button>
          <button type="button" role="tab" aria-selected={activeTab === 'review'} className={`call-tab ${activeTab === 'review' ? 'is-active' : ''}`} onClick={() => setActiveTab('review')}><span className="call-preparation-step-number-v10171">4</span><Check size={16} /><span className="call-tab__label">Revisar</span></button>
        </nav>

        <div className={`call-preparation-v70__layout ${activeTab === 'review' ? 'call-preparation-v10171__layout--review' : ''}`}>
          <main className="call-preparation-v70__main">
            {activeTab === 'queue' ? <>
              <section className="call-preparation-v70__section call-preparation-v70__filters call-preparation-filter-engine-v10173">
                <div className="call-preparation-v70__section-head">
                  <div><span className="eyebrow">Construção da fila</span><h4>Quem entra nesta sessão</h4><p>Busque, filtre e selecione. Os critérios avançados ficam no mesmo Filter Engine do restante do CRM.</p></div>
                </div>
                <div className="call-preparation-filter-toolbar-v10173 workspace-command-bar-v10169">
                  <label className="call-preparation-v70__search workspace-command-search-v10169"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar lead, empresa, contato ou telefone..." /></label>
                  <div className="workspace-command-bar-v10169__actions">
                    <WorkspaceFilterMenu workspaceKey={`call-preparation:${workspaceId}`} fields={preparationFilterFields} activeCount={activePreparationFilters} onChange={changePreparationFilter} onClearAll={clearPreparationFilters} />
                    <WorkspaceSortMenu value={order} onChange={(value) => setOrder(value as QueueOrder)} options={[{ value: 'smart', label: 'Ordem inteligente', description: 'Prioriza urgência, atraso e temperatura.' }, { value: 'next_action', label: 'Próxima ação', description: 'Quem precisa de contato primeiro.' }, { value: 'name', label: 'Nome A–Z' }]} />
                    <Button variant="secondary" size="sm" onClick={toggleVisible}>{allVisibleSelected ? <Square size={15} /> : <CheckSquare size={15} />}{allVisibleSelected ? 'Remover visíveis' : 'Selecionar visíveis'}</Button>
                  </div>
                </div>
                <WorkspaceFilterChips fields={preparationFilterFields} onChange={changePreparationFilter} onClearAll={clearPreparationFilters} />
              </section>

              {(savedLists.length || saveListOpen) ? <section className="call-preparation-v70__saved">
                <div className="call-preparation-v70__saved-head"><span><BookmarkPlus size={15} /> Listas salvas</span>{!saveListOpen ? <Button variant="ghost" size="sm" onClick={() => setSaveListOpen(true)}><BookmarkPlus size={14} /> Salvar seleção atual</Button> : null}</div>
                {saveListOpen ? <div className="call-preparation-v70__save-form"><input value={saveListName} onChange={(event) => setSaveListName(event.target.value)} placeholder="Ex.: Retornos de hoje" autoFocus /><Button size="sm" onClick={saveCurrentList}><Check size={15} /> Salvar</Button><Button size="sm" variant="ghost" onClick={() => { setSaveListOpen(false); setSaveListName('') }}>Cancelar</Button></div> : null}
                {savedLists.length ? <div className="call-preparation-v70__saved-list">{savedLists.slice(0, 6).map((list) => <div key={list.id}><button type="button" onClick={() => applySavedList(list)}><strong>{list.name}</strong><small>{list.leadIds.length} contatos</small></button><button type="button" className="call-preparation-v70__saved-delete" onClick={() => removeSavedList(list.id)} aria-label={`Excluir lista ${list.name}`}><Trash2 size={14} /></button></div>)}</div> : null}
              </section> : <button type="button" className="call-preparation-v70__save-empty call-inline-action" onClick={() => setSaveListOpen(true)}><BookmarkPlus size={16} /> Salvar esta seleção como lista reutilizável</button>}

              <section className="call-preparation-v70__section call-preparation-v70__queue-section">
                <div className="call-preparation-v70__section-head">
                  <div><span className="eyebrow">Prévia operacional</span><h4>Fila de ligações</h4><p>{visibleLeads.length === 1 ? '1 contato encontrado' : `${visibleLeads.length} contatos encontrados`} · {selectedCallableLeads.length} selecionados</p></div>
                  <span className="call-preparation-v70__order-chip"><ListFilter size={14} /> {selectedCallableLeads.length} selecionado{selectedCallableLeads.length === 1 ? '' : 's'}</span>
                </div>
                <div className="call-preparation-v70__queue">
                  {visibleLeads.length ? visibleLeads.map((lead) => {
                    const target = leadTargets.get(lead.id)!
                    const contact = snapshot?.contacts.find((item) => item.id === target.contactId)
                    const health = callHealthByLead.get(lead.id)
                    const callable = Boolean(target.phone) && health?.status !== 'restricted'
                    const selected = selectedIds.includes(lead.id)
                    const flags = rowFlags(lead)
                    return <article key={lead.id} className={`call-preparation-v70__row ${selected ? 'is-selected' : ''} ${!callable ? 'is-disabled' : ''}`}>
                      <button type="button" className="call-preparation-v70__check call-selection-button" disabled={!callable} onClick={() => toggleLead(lead.id)} aria-label={selected ? 'Remover da sessão' : 'Adicionar à sessão'}>{selected ? <CheckSquare size={18} /> : <Square size={18} />}</button>
                      <div className="call-preparation-v70__identity"><span>{(target.name || lead.name).slice(0, 2).toUpperCase()}</span><div><strong>{target.name || lead.name}</strong><small>{lead.company || lead.name} · {lead.city || 'Cidade não informada'}{contact ? ` · ${decisionRoleLabels[contact.decisionRole]}` : ''}</small></div></div>
                      <div className="call-preparation-v70__row-context"><span className={`priority-chip priority-chip--${lead.priority}`}>{priorityLabel[lead.priority]}</span><span className={`call-preparation-v70__temperature is-${lead.temperature}`}>{temperatureLabel[lead.temperature]}</span><em>{reasonFor(lead)}</em></div>
                      <div className="call-preparation-v70__row-phone"><PhoneCall size={14} /><strong>{target.phone || (lead.doNotContact ? 'Bloqueado' : 'Sem telefone')}</strong>{health?.status === 'restricted' ? <small className="is-warning">Call Health: restrito</small> : health?.status === 'attention' ? <small>Call Health: revisar</small> : null}{flags.duplicate ? <small className="is-warning">Duplicado</small> : null}{flags.contactedToday ? <small>Contatado hoje</small> : null}{flags.meeting ? <small className="is-success">Reunião agendada</small> : null}</div>
                    </article>
                  }) : <div className="call-preparation-v70__empty"><Search size={20} /><strong>Nenhum contato com estes filtros</strong><span>Altere os filtros; sua seleção atual não será perdida.</span></div>}
                </div>
              </section>
            </> : null}

            {activeTab === 'strategy' ? <div className="call-preparation-v70__strategy-grid">
              <section className="call-preparation-v70__section">
                <div className="call-preparation-v70__section-head"><div><span className="eyebrow">Resultado desejado</span><h4>Objetivo comercial</h4><p>O Modo Foco adapta descoberta, coaching e próximo passo ao objetivo escolhido.</p></div></div>
                <label className="call-preparation-v70__field"><span>Objetivo da sessão</span><NativeSelectionSelect value={sessionObjective} onChange={(event) => setSessionObjective(event.target.value as CallSessionObjective)}>{CALL_SESSION_OBJECTIVES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</NativeSelectionSelect></label>
                <div className="call-preparation-v70__objective"><Sparkles size={18} /><div><strong>{objective.shortLabel}</strong><span>{objective.description}</span><small>Sinal de sucesso: {objective.successSignal}</small></div></div>
              </section>

              <section className="call-preparation-v70__section">
                <div className="call-preparation-v70__section-head"><div><span className="eyebrow">Ritmo da sessão</span><h4>Modo de execução</h4><p>Escolha entre contexto máximo por conversa ou velocidade assistida.</p></div></div>
                <div className="call-mode-picker call-mode-picker--v70" role="group" aria-label="Modo da sessão">
                  <button type="button" className={`call-choice-card ${sessionMode === 'focus' ? 'is-active' : ''}`} aria-pressed={sessionMode === 'focus'} onClick={() => setSessionMode('focus')}><Focus size={19} /><span><strong>Focus</strong><small>Máximo contexto antes de cada conversa.</small></span></button>
                  <button type="button" className={`call-choice-card ${sessionMode === 'power' ? 'is-active' : ''}`} aria-pressed={sessionMode === 'power'} onClick={() => setSessionMode('power')}><Gauge size={19} /><span><strong>Power assistido</strong><small>Prepara o próximo contato após o wrap-up.</small></span></button>
                </div>
                <p className="call-mode-description">{callModeDescription(sessionMode)}</p>
              </section>

              <section className="call-preparation-v70__section call-preparation-v70__strategy-wide">
                <div className="call-preparation-v70__section-head"><div><span className="eyebrow">Parâmetros comerciais</span><h4>Roteiro, ordem e meta</h4><p>Defina o padrão da sessão sem poluir a tela de ligação.</p></div></div>
                <div className="call-preparation-v70__strategy-fields">
                  <div className="call-preparation-v1012__route-card"><span>Roteiro da sessão</span><div><BookOpenText size={18}/><div><strong>{effectiveSessionPlaybook?.title || 'Roteiro padrão RealTalent'}</strong><small>{playbookId ? 'Escolha manual para esta sessão' : strategy.autoSelectPlaybook ? (automaticPlaybookRecommendation?.reasons?.join(' · ') || 'Selecionado automaticamente pelo contexto') : 'Padrão definido no Strategy Hub'}</small></div></div><div className="call-preparation-v1012__route-actions"><Button size="sm" variant="secondary" onClick={() => setPlaybookPickerOpen(true)}>Trocar roteiro</Button><Button size="sm" variant="ghost" onClick={() => { onClose(); navigate('playbooks', { filter: 'strategy' }) }}>Abrir estratégia</Button></div></div>
                  <label className="call-preparation-v70__field"><span>Ordem da fila</span><NativeSelectionSelect value={order} onChange={(event) => setOrder(event.target.value as QueueOrder)}><option value="smart">Prioridade inteligente</option><option value="next_action">Próxima ação</option><option value="name">Nome</option></NativeSelectionSelect></label>
                  <label className="call-preparation-v70__field"><span>Máximo da sessão</span><input type="number" min={1} max={100} value={maxSession} onChange={(event) => setMaxSession(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} /></label>
                  <section className="calling-h5__goal-panel">
                    <header><div><small>Meta da sessão</small><strong>Transforme a fila em um objetivo operacional claro</strong></div><Button size="sm" variant="secondary" onClick={() => { onClose(); navigate('goals') }}><Target size={15}/> Abrir Metas</Button></header>
                    <div className="calling-h5__goal-layout">
                      <div className="calling-h5__session-target"><span>Conversas nesta sessão</span><div><button type="button" onClick={() => setGoal(Math.max(1, effectiveGoal - 1))} aria-label="Diminuir meta">−</button><strong>{effectiveGoal}</strong><button type="button" onClick={() => setGoal(Math.min(Math.max(1, orderedSessionLeads.length), effectiveGoal + 1))} aria-label="Aumentar meta">+</button></div><small>de {orderedSessionLeads.length || 0} contatos na fila</small></div>
                      <div className="calling-h5__crm-goal"><label><span>Meta do CRM vinculada</span><NativeSelectionSelect value={linkedGoalId} onChange={(event) => setLinkedGoalId(event.target.value)}><option value="">Sem meta vinculada</option>{activeGoals.map((item) => <option key={item.id} value={item.id}>{goalMetricLabels[item.metric]} · {item.userName || 'Equipe'}</option>)}</NativeSelectionSelect></label>{linkedGoalInsight ? <div className="calling-h5__crm-goal-progress"><div><span>{goalMetricLabels[linkedGoalInsight.goal.metric]}</span><strong>{Math.round(linkedGoalInsight.value)} / {linkedGoalInsight.goal.targetValue}</strong><em>{linkedGoalInsight.percentage}%</em></div><div className="calling-h5__goal-track"><i style={{ width: `${Math.min(100, linkedGoalInsight.percentage)}%` }}/></div><small>Faltam {Math.round(linkedGoalInsight.remaining)} · ritmo necessário {linkedGoalInsight.dailyRequired.toFixed(1)}/dia · esta sessão atualiza essa meta automaticamente.</small></div> : <div className="calling-h5__goal-empty"><strong>Nenhuma meta comercial vinculada</strong><span>A sessão continua medindo conversas. Crie ou escolha uma meta na aba Metas para acompanhar o impacto no objetivo do período.</span></div>}</div>
                    </div>
                  </section>
                </div>
              </section>
            </div> : null}

            {activeTab === 'settings' ? <div className="call-preparation-v70__settings-grid">
              <section className="call-preparation-v70__section">
                <div className="call-preparation-v70__section-head"><div><span className="eyebrow">Automação controlada</span><h4>Comportamento entre ligações</h4><p>Automatize preparação e wrap-up, nunca o início da chamada.</p></div></div>
                <div className="call-execution-options call-execution-options--v70">
                  <button type="button" className={`call-execution-toggle ${smartWrap ? 'is-active' : ''}`} aria-pressed={smartWrap} onClick={() => setSmartWrap((value) => !value)}><span><strong>Wrap-up inteligente</strong><small>Sugere próximo passo de acordo com o resultado.</small></span><em>{smartWrap ? 'Ativo' : 'Desativado'}</em></button>
                  <button type="button" className={`call-execution-toggle fast-dial-toggle-v10182 ${fastDial ? 'is-active' : ''} ${voiceSettings.defaultProviderId === 'realtalent_connect' && voiceSettings.selectedDeviceId.startsWith('connect:phone:') ? '' : 'is-unavailable'}`} aria-pressed={fastDial} disabled={voiceSettings.defaultProviderId !== 'realtalent_connect' || !voiceSettings.selectedDeviceId.startsWith('connect:phone:')} onClick={() => { const next = !fastDial; setFastDial(next); if (!next) setAutoDispatchNext(false) }}><span><strong>One-Tap via RealTalent Connect</strong><small>Ao entrar no Modo Foco, envia a chamada imediatamente ao iPhone. Com o RealTalent Phone visível, o companion tenta abrir o discador sem botão intermediário; o iOS mantém apenas a confirmação final.</small></span><em>{fastDial ? 'Ativo' : 'Desativado'}</em></button>
                  {fastDial ? <button type="button" className={`call-execution-toggle ${autoDispatchNext ? 'is-active' : ''}`} aria-pressed={autoDispatchNext} onClick={() => setAutoDispatchNext((value) => !value)}><span><strong>Enviar o próximo contato automaticamente</strong><small>Depois de “Salvar e próximo”, carrega o lead seguinte e envia a chamada ao celular sem clicar em “Ligar agora”.</small></span><em>{autoDispatchNext ? 'Ativo' : 'Desativado'}</em></button> : null}
                  {fastDial && autoDispatchNext ? <label className="call-preparation-v70__field"><span>Intervalo antes de enviar ao celular</span><NativeSelectionSelect value={autoDispatchDelaySeconds} onChange={(event) => setAutoDispatchDelaySeconds(Number(event.target.value))}><option value={0}>Imediatamente</option><option value={1}>1 segundo</option><option value={2}>2 segundos</option><option value={3}>3 segundos</option></NativeSelectionSelect></label> : null}
                  <button type="button" className={`call-execution-toggle ${(sessionMode === 'power' || autoAdvance) ? 'is-active' : ''}`} aria-pressed={sessionMode === 'power' || autoAdvance} disabled={sessionMode === 'power'} onClick={() => setAutoAdvance((value) => !value)}><span><strong>Preparar próximo contato</strong><small>{fastDial && autoDispatchNext ? 'Carrega o próximo lead e prepara o envio automático ao RealTalent Phone.' : 'Carrega o próximo lead sem iniciar a chamada.'}</small></span><em>{(sessionMode === 'power' || autoAdvance) ? 'Ativo' : 'Desativado'}</em></button>
                  {(sessionMode === 'power' || autoAdvance) ? <label className="call-preparation-v70__field"><span>Intervalo de preparação</span><NativeSelectionSelect value={autoAdvanceSeconds} onChange={(event) => setAutoAdvanceSeconds(Number(event.target.value))}><option value={3}>3 segundos</option><option value={5}>5 segundos</option><option value={8}>8 segundos</option></NativeSelectionSelect></label> : null}
                </div>
              </section>

              <section className="call-preparation-v70__section call-preparation-v731__voice-settings">
                <div className="call-preparation-v70__section-head"><div><span className="eyebrow">RealTalent Voice</span><h4>Como as ligações serão realizadas</h4><p>Defina provedor, dispositivo e número de saída antes de entrar no Modo Foco.</p></div></div>
                <div className="call-preparation-v731__voice-summary"><div><small>Provedor</small><strong>{providerLabel(voiceSettings.defaultProviderId)}</strong></div><div><small>Dispositivo</small><strong>{voiceSettings.selectedDeviceId === 'external:system-dialer' ? 'Discador do sistema' : voiceSettings.selectedDeviceId || 'Padrão do provedor'}</strong></div><div><small>Número de saída</small><strong>{voiceSettings.outboundIdentities.find((item) => item.id === voiceSettings.selectedCallerId)?.label ?? 'Padrão do provedor'}</strong></div></div>
                <Button variant="secondary" onClick={() => setVoiceOpen(true)}><PhoneCall size={16}/> Configurar RealTalent Voice</Button>
              </section>

              <section className="call-preparation-v70__section">
                <div className="call-preparation-v70__section-head"><div><span className="eyebrow">Modo Foco</span><h4>O que aparece durante a conversa</h4><p>Modo Foco mostra somente o que ajuda a avançar. Ajuste o que fica visível durante a conversa.</p></div></div>
                <div className="call-display-summary call-display-summary--v70"><span>{display.showQueueSidebar ? 'Fila lateral' : 'Fila oculta'}</span><span>{display.showObjections ? 'Objeções' : 'Sem objeções'}</span><span>{display.showNotes ? 'Notas' : 'Sem notas'}</span><span>{display.showRecording ? 'Gravação' : 'Sem gravação'}</span></div>
                <Button variant="secondary" onClick={() => setDisplayOpen(true)}><Settings2 size={16} /> Personalizar tela da conversa</Button>
              </section>
            </div> : null}
          </main>

          {activeTab === 'review' ? <aside className="call-preparation-v70__summary call-preparation-v10171__review">
            <section className="call-preparation-v70__summary-card call-preparation-v70__summary-card--primary">
              <span className="eyebrow">Resumo da sessão</span>
              <div className="call-preparation-v70__summary-number"><strong>{orderedSessionLeads.length}</strong><span>contatos prontos</span></div>
              {(sessionStats.callbacks || sessionStats.overdue || sessionStats.hot || orderedSessionLeads.length > 3) ? <div className="call-preparation-v70__summary-grid">
                {orderedSessionLeads.length > 3 && sessionStats.newLeads ? <div><strong>{sessionStats.newLeads}</strong><span>novos</span></div> : null}
                {sessionStats.callbacks ? <div><strong>{sessionStats.callbacks}</strong><span>retornos</span></div> : null}
                {sessionStats.overdue ? <div><strong>{sessionStats.overdue}</strong><span>atrasados</span></div> : null}
                {sessionStats.hot ? <div><strong>{sessionStats.hot}</strong><span>quentes</span></div> : null}
              </div> : null}
              <div className="call-preparation-v70__time"><Clock3 size={16} /><span><strong>~{estimatedMinutes} min</strong><small>estimativa da sessão</small></span></div>
            </section>

            {(validation.missingPhone || validation.blocked || validation.duplicates || validation.contactedToday || validation.meetings) ? <section className="call-preparation-v70__summary-card">
              <div className="call-preparation-v70__summary-title"><AlertTriangle size={16} /><strong>Revisar fila</strong></div>
              <div className="call-preparation-v1012__warnings">{validation.missingPhone ? <span><b>{validation.missingPhone}</b> sem telefone</span> : null}{validation.blocked ? <span><b>{validation.blocked}</b> não contatar</span> : null}{validation.duplicates ? <span><b>{validation.duplicates}</b> duplicados</span> : null}{validation.contactedToday ? <span><b>{validation.contactedToday}</b> contatados hoje</span> : null}{validation.meetings ? <span><b>{validation.meetings}</b> com reunião futura</span> : null}</div>
            </section> : <section className="call-preparation-v70__summary-card call-preparation-v1012__ready"><Check size={18}/><div><strong>Fila pronta para ligar</strong><span>Nenhum bloqueio operacional detectado.</span></div></section>}

            {(healthSummary.attention || healthSummary.restricted) ? <section className="call-preparation-v70__summary-card">
              <div className="call-preparation-v70__summary-title"><Gauge size={16} /><strong>Call Health</strong></div>
              <div className="call-preparation-v72__health-summary"><div className="is-good"><strong>{healthSummary.good}</strong><span>prontos</span></div><div className="is-attention"><strong>{healthSummary.attention}</strong><span>revisar</span></div><div className="is-restricted"><strong>{healthSummary.restricted}</strong><span>restritos</span></div></div>
            </section> : null}

            {orderedSessionLeads.length > 1 ? <section className="call-preparation-v70__summary-card">
              <div className="call-preparation-v70__summary-title"><UsersRound size={16} /><strong>Próximo da fila</strong></div>
              {orderedSessionLeads[0] ? <div className="call-preparation-v70__next"><strong>{leadTargets.get(orderedSessionLeads[0].id)?.name || orderedSessionLeads[0].name}</strong><span>{orderedSessionLeads[0].company || 'Empresa não informada'}</span><small>{reasonFor(orderedSessionLeads[0])}</small></div> : null}
            </section> : null}

            <section className="call-preparation-v70__summary-card call-preparation-v10171__review-route"><div className="call-preparation-v70__summary-title"><BookOpenText size={16}/><strong>Roteiro e execução</strong></div><div><small>Roteiro</small><strong>{effectiveSessionPlaybook?.title || 'Roteiro padrão RealTalent'}</strong></div><div><small>Objetivo</small><strong>{objective.shortLabel}</strong></div><div><small>Modo</small><strong>{sessionMode === 'focus' ? 'Focus' : 'Power assistido'}</strong></div><div><small>Discagem</small><strong>{fastDial ? (autoDispatchNext ? 'One-Tap · fila automática' : 'One-Tap') : 'Assistida'}</strong></div></section>
          </aside> : null}
        </div>
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
