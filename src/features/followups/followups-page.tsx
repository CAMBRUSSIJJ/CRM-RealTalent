import { NativeSelectionSelect } from '../../components/selection'
import {
  AlertTriangle, BarChart3, CalendarClock, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Edit3,
  Bookmark, ExternalLink, Kanban, Layers3, ListChecks, Mail, MessageCircle, PhoneCall, Play, Plus, Search, Send, Target,
  UserRound, UsersRound, XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAppActions, useAppNavigation, useAppUi, useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { Modal } from '../../components/ui/modal'
import { StatusPill } from '../../components/ui/status-pill'
import { WorkspaceFilterMenu, type WorkspaceFilterField } from '../../components/workspace/workspace-filter-system'
import { WorkspacePageHeader, WorkspaceSummaryMetric, WorkspaceSummaryStrip, WorkspaceViewStrip } from '../../components/workspace/workspace-shell'
import { formatDateTime } from '../../domain/formatters'
import { isKeyboardActivationKey } from '../../lib/keyboard-navigation'
import type { ActivityItem, ContactRecord, Lead } from '../../domain/types'
import { channelLabel, outcomeLabel, readFollowupMetadata, stripFollowupMetadata, type FollowupChannel, type FollowupOutcome } from '../../services/followup-workspace'
import { contactBlockedMessage } from '../../services/contact-policy'
import { cadenceChannelAvailable, summarizeCadenceEnrollments, type CadenceEnrollmentSummary } from '../../services/sales-engagement'
import { resolveLeadCallTarget } from '../../services/call-workspace'
import { ActivityModal } from './activity-modal'
import { CadenceModal } from './cadence-modal'
import { OutcomeModal } from './outcome-modal'
import { LazyCallWorkspaceModal } from '../calls/lazy-call-workspace-modal'
import { buildQuickCallSessionConfig } from '../calls/call-session-config'
import { usePreferences } from '../settings/preferences-context'
import { SalesMessageModal } from '../pipeline/sales-message-modal'

type Filter = 'queue' | 'overdue' | 'today' | 'upcoming' | 'completed' | 'all'
type ViewMode = 'queue' | 'board' | 'calendar' | 'cadences' | 'performance'
const typeLabels = { followup: 'Follow-up', call: 'Ligação', meeting: 'Reunião', note: 'Nota', stage_change: 'Etapa', email: 'E-mail', whatsapp: 'WhatsApp' }
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
const addDays = (date: Date, days: number) => { const next = new Date(date); next.setDate(next.getDate() + days); return next }
const nextBusinessDay = (date: Date, businessDays: number[], businessStart: string, businessEnd: string) => {
  const allowed = businessDays.length ? businessDays : [1, 2, 3, 4, 5]
  const next = addDays(date, 1)
  while (!allowed.includes(next.getDay())) next.setDate(next.getDate() + 1)
  const parseClock = (value: string, fallback: number) => { const [hour, minute] = value.split(':').map(Number); return Number.isFinite(hour) && Number.isFinite(minute) ? (hour * 60) + minute : fallback }
  const open = parseClock(businessStart, 8 * 60 + 30)
  const close = Math.max(open + 1, parseClock(businessEnd, 18 * 60))
  const original = (date.getHours() * 60) + date.getMinutes()
  const minute = Math.min(Math.max(original, open), close - 1)
  next.setHours(Math.floor(minute / 60), minute % 60, 0, 0)
  return next
}
const dateKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
type QuickRescheduleMode = 'later' | 'tomorrow' | 'next-business'
const parseClockMinutes = (value: string, fallback: number) => {
  const [hour, minute] = value.split(':').map(Number)
  return Number.isFinite(hour) && Number.isFinite(minute) ? (hour * 60) + minute : fallback
}
const clampToBusinessWindow = (date: Date, businessStart: string, businessEnd: string) => {
  const next = new Date(date)
  const open = parseClockMinutes(businessStart, 8 * 60 + 30)
  const close = Math.max(open + 1, parseClockMinutes(businessEnd, 18 * 60))
  const minute = (next.getHours() * 60) + next.getMinutes()
  const clamped = Math.min(Math.max(minute, open), close - 1)
  next.setHours(Math.floor(clamped / 60), clamped % 60, 0, 0)
  return next
}
const quickRescheduleDate = (mode: QuickRescheduleMode, now: Date, businessDays: number[], businessStart: string, businessEnd: string) => {
  const allowed = businessDays.length ? businessDays : [1, 2, 3, 4, 5]
  if (mode === 'next-business') return nextBusinessDay(now, allowed, businessStart, businessEnd)
  if (mode === 'tomorrow') {
    const next = addDays(now, 1)
    while (!allowed.includes(next.getDay())) next.setDate(next.getDate() + 1)
    return clampToBusinessWindow(next, businessStart, businessEnd)
  }
  const later = addDays(now, 0)
  later.setHours(later.getHours() + 2)
  const close = Math.max(parseClockMinutes(businessStart, 8 * 60 + 30) + 1, parseClockMinutes(businessEnd, 18 * 60))
  const minute = (later.getHours() * 60) + later.getMinutes()
  if (!allowed.includes(later.getDay()) || minute >= close) return nextBusinessDay(now, allowed, businessStart, businessEnd)
  return clampToBusinessWindow(later, businessStart, businessEnd)
}
const followupTimingLabel = (item: EnrichedActivity, reference = new Date()) => {
  if (item.activity.completedAt) return item.activity.resolutionStatus === 'superseded' ? 'Encerrada por avanço' : 'Concluída'
  if (!item.due) return 'Sem data definida'
  if (item.overdue) {
    const hours = Math.max(1, Math.floor((reference.getTime() - item.due.getTime()) / 3600000))
    return hours < 24 ? `Atrasado há ${hours}h` : `Atrasado há ${Math.floor(hours / 24)}d`
  }
  if (item.today) return `Hoje · ${item.due.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  const tomorrow = addDays(startOfDay(reference), 1)
  if (sameDay(item.due, tomorrow)) return `Amanhã · ${item.due.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  return formatDateTime(item.activity.dueAt)
}
const followupTimingTone = (item: EnrichedActivity) => item.activity.completedAt ? 'completed' : item.overdue ? 'overdue' : item.today ? 'today' : item.due ? 'upcoming' : 'unscheduled'
const compactFollowupDescription = (value: string, max = 150) => {
  const clean = value.replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  return clean.length > max ? `${clean.slice(0, Math.max(0, max - 1)).trimEnd()}…` : clean
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
  paused: boolean
  executionMode: 'manual' | 'assisted'
}

const channelFromActivity = (activity: ActivityItem): FollowupChannel => activity.type === 'call' ? 'call' : activity.type === 'meeting' ? 'meeting' : 'task'
const toneForActivity = (activity: ActivityItem) => activity.type === 'meeting' ? 'info' : activity.type === 'call' ? 'warning' : activity.type === 'note' ? 'neutral' : 'success'

type FollowupSavedView = { id: string; name: string; filter: Filter; view: 'queue' | 'board' | 'calendar'; stageId: string; priority: string; channel: string; owner: string; hotStalledOnly: boolean }

export function FollowupsPage() {
  const { snapshot, canWrite } = useAppWorkspace()
  const { setRoute, routeContext } = useAppNavigation()
  const { notify, promptAction } = useAppUi()
  const { completeActivity, updateActivity, updateCadenceState } = useAppActions()
  const { preferences } = usePreferences()
  const [view, setView] = useState<ViewMode>('queue')
  const [filter, setFilter] = useState<Filter>('queue')
  const [query, setQuery] = useState('')
  const [stageId, setStageId] = useState('')
  const [priority, setPriority] = useState('')
  const [hotStalledOnly, setHotStalledOnly] = useState(false)
  const [channel, setChannel] = useState('')
  const [owner, setOwner] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [cadenceOpen, setCadenceOpen] = useState(false)
  const [cadenceLeadIds, setCadenceLeadIds] = useState<string[]>([])
  const [editing, setEditing] = useState<ActivityItem | null>(null)
  const [outcomeActivity, setOutcomeActivity] = useState<ActivityItem | null>(null)
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null)
  const [executionOpen, setExecutionOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [callLead, setCallLead] = useState<Lead | null>(null)
  const [messageLead, setMessageLead] = useState<Lead | null>(null)
  const [savedViews, setSavedViews] = useState<FollowupSavedView[]>([])
  const [activeSavedViewId, setActiveSavedViewId] = useState<string | null>(null)
  const now = new Date()
  const nowMs = now.getTime()
  const savedViewsKey = `realtalent.followups.views.v10168.${snapshot?.workspace.id ?? 'local'}`

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(savedViewsKey) || '[]') as FollowupSavedView[]
      setSavedViews(Array.isArray(parsed) ? parsed : [])
    } catch { setSavedViews([]) }
  }, [savedViewsKey])

  const enriched = useMemo<EnrichedActivity[]>(() => {
    const seenSources = new Set<string>()
    return (snapshot?.activities ?? [])
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
          paused: meta?.kind === 'cadence-step' && meta.cadenceState === 'paused' && (!meta.resumeAt || new Date(meta.resumeAt).getTime() > nowMs), executionMode: meta?.executionMode ?? 'manual',
        }
      })
      .filter((item) => {
        const sourceId = item.activity.sourceId?.trim()
        if (!sourceId || item.activity.sourceType === 'manual') return true
        const key = `${item.activity.sourceType}:${sourceId}`
        if (seenSources.has(key)) return false
        seenSources.add(key)
        return true
      })
  }, [nowMs, snapshot])

  const filteredActivities = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return enriched
      .filter((item) => !normalized || `${item.activity.title} ${item.description} ${item.lead?.name ?? ''} ${item.lead?.company ?? ''} ${item.cadenceName}`.toLowerCase().includes(normalized))
      .filter((item) => !stageId || item.lead?.stageId === stageId)
      .filter((item) => !priority || item.lead?.priority === priority)
      .filter((item) => !hotStalledOnly || Boolean(item.lead?.temperature === 'hot' && (!item.lead.nextActionAt || new Date(item.lead.nextActionAt).getTime() > addDays(now, 3).getTime())))
      .filter((item) => !channel || item.channel === channel)
      .filter((item) => !owner || item.lead?.ownerName === owner)
      .filter((item) => filter === 'all' || filter === 'completed' || !item.paused)
      .filter((item) => {
        if (filter === 'completed') return Boolean(item.activity.completedAt && (item.activity.resolutionStatus ?? 'completed') === 'completed')
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
  }, [channel, enriched, filter, hotStalledOnly, now, owner, priority, query, stageId])

  const queue = useMemo(() => enriched.filter((item) => !item.paused && !item.activity.completedAt && (!item.due || item.due.getTime() <= endOfDay(now).getTime())).sort((a, b) => b.score - a.score), [enriched, now])

  const stats = useMemo(() => {
    const base = enriched
    const actionableBase = base.filter((item) => !item.paused)
    const activeLeads = snapshot?.leads.filter((lead) => lead.status === 'active') ?? []
    const pendingLeadIds = new Set(base.filter((item) => !item.activity.completedAt && item.activity.leadId).map((item) => item.activity.leadId!))
    const withoutNext = activeLeads.filter((lead) => !pendingLeadIds.has(lead.id)).length
    const hotStalled = activeLeads.filter((lead) => lead.temperature === 'hot' && (!lead.nextActionAt || new Date(lead.nextActionAt).getTime() > addDays(now, 3).getTime())).length
    const proposalStageIds = new Set((snapshot?.stages ?? []).filter((stage) => stage.name.toLowerCase().includes('proposta')).map((stage) => stage.id))
    const proposals = activeLeads.filter((lead) => proposalStageIds.has(lead.stageId) && (!lead.nextActionAt || new Date(lead.nextActionAt).getTime() < nowMs)).length
    return {
      today: actionableBase.filter((item) => item.today).length,
      overdue: actionableBase.filter((item) => item.overdue).length,
      upcoming: actionableBase.filter((item) => !item.activity.completedAt && item.due && item.due.getTime() > endOfDay(now).getTime()).length,
      completed: base.filter((item) => item.activity.completedAt && (item.activity.resolutionStatus ?? 'completed') === 'completed').length,
      withoutNext, hotStalled, proposals,
    }
  }, [enriched, now, nowMs, snapshot])

  const selectedActivity = enriched.find((item) => item.activity.id === selectedActivityId) ?? filteredActivities[0] ?? null
  useEffect(() => { if (routeContext.activityId && enriched.some((item) => item.activity.id === routeContext.activityId)) { setView('queue'); setSelectedActivityId(routeContext.activityId) } }, [enriched, routeContext.activityId])
  useEffect(() => {
    if (selectedActivityId && !enriched.some((item) => item.activity.id === selectedActivityId)) setSelectedActivityId(null)
  }, [enriched, selectedActivityId])

  const owners = useMemo<string[]>(() => Array.from(new Set<string>((snapshot?.leads ?? []).map((lead) => lead.ownerName?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, 'pt-BR')), [snapshot])

  const universalFollowupFilters = useMemo<WorkspaceFilterField[]>(() => [
    { key: 'stageId', label: 'Etapa', value: stageId, allValue: '', allLabel: 'Todas', group: 'Contexto comercial', options: (snapshot?.stages ?? []).map((stage) => ({ value: stage.id, label: stage.name })) },
    { key: 'priority', label: 'Prioridade', value: priority, allValue: '', allLabel: 'Todas', group: 'Contexto comercial', options: [{ value: 'urgent', label: 'Urgente' }, { value: 'high', label: 'Alta' }, { value: 'medium', label: 'Média' }, { value: 'low', label: 'Baixa' }] },
    { key: 'channel', label: 'Canal', value: channel, allValue: '', allLabel: 'Todos', group: 'Atividade', options: Object.entries(channelLabel).map(([value, label]) => ({ value, label })) },
    { key: 'owner', label: 'Responsável', value: owner, allValue: '', allLabel: 'Todos', group: 'Contexto comercial', options: owners.map((item) => ({ value: item, label: item })) },
    { key: 'hotStalledOnly', label: 'Contatos quentes parados', value: hotStalledOnly ? 'yes' : '', allValue: '', allLabel: 'Todos', group: 'Inteligência', options: [{ value: 'yes', label: 'Somente quentes parados', count: stats.hotStalled }] },
  ], [channel, hotStalledOnly, owner, owners, priority, snapshot?.stages, stageId, stats.hotStalled])

  const cadenceEnrollments = useMemo(() => summarizeCadenceEnrollments(snapshot?.activities ?? [], snapshot?.leads ?? []), [snapshot])
  const cadenceGroups = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; category: string; activities: EnrichedActivity[]; leads: Set<string>; enrollments: CadenceEnrollmentSummary[] }>()
    enriched.forEach((item) => {
      const meta = readFollowupMetadata(item.activity)
      if (meta?.kind !== 'cadence-step' || !meta.cadenceName) return
      const key = meta.cadenceId ?? meta.cadenceName
      const group = groups.get(key) ?? { id: key, name: meta.cadenceName, category: meta.cadenceCategory ?? 'Cadência', activities: [], leads: new Set<string>(), enrollments: cadenceEnrollments.filter((entry) => entry.cadenceId === key) }
      group.activities.push(item); if (item.activity.leadId) group.leads.add(item.activity.leadId); groups.set(key, group)
    })
    return [...groups.values()].sort((a, b) => b.activities.length - a.activities.length)
  }, [cadenceEnrollments, enriched])

  const performance = useMemo(() => {
    const since = addDays(now, -30).getTime()
    const recent = enriched.filter((item) => new Date(item.activity.completedAt ?? item.activity.createdAt).getTime() >= since)
    const results = recent.map((item) => ({ item, meta: readFollowupMetadata(item.activity) })).filter((entry) => entry.meta?.kind === 'result' && entry.meta.outcome)
    const outcomeCounts = (Object.keys(outcomeLabel) as FollowupOutcome[]).map((outcome) => ({ outcome, count: results.filter((entry) => entry.meta?.outcome === outcome).length })).filter((item) => item.count)
    const completed = recent.filter((item) => item.activity.completedAt && (item.activity.resolutionStatus ?? 'completed') === 'completed' && item.activity.type !== 'note').length
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
    const commercial = targets.filter((item) => ['call', 'followup', 'meeting'].includes(item.activity.type))
    if (commercial.length) {
      notify('info', `${commercial.length} atividade(s) comercial(is) precisam de resultado individual. Selecione uma delas e use “Registrar resultado”.`)
      if (commercial.length === 1) setOutcomeActivity(commercial[0].activity)
      return
    }
    for (const item of targets) await completeActivity(item.activity.id, true)
    setSelectedIds([])
  }

  const bulkPostpone = async () => {
    const targets = filteredActivities.filter((item) => selectedIds.includes(item.activity.id) && !item.activity.completedAt)
    for (const item of targets) {
      const due = nextBusinessDay(item.due ?? now, preferences.commercial.businessDays, preferences.commercial.businessStart, preferences.commercial.businessEnd)
      await updateActivity(item.activity.id, { dueAt: due.toISOString() })
    }
    setSelectedIds([])
  }

  const quickReschedule = async (activity: ActivityItem, mode: QuickRescheduleMode) => {
    setBusyId(activity.id)
    try {
      const due = quickRescheduleDate(mode, new Date(), preferences.commercial.businessDays, preferences.commercial.businessStart, preferences.commercial.businessEnd)
      await updateActivity(activity.id, { dueAt: due.toISOString() })
      notify('success', `Follow-up reagendado para ${formatDateTime(due.toISOString())}.`)
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Não foi possível reagendar o follow-up.')
    } finally {
      setBusyId(null)
    }
  }

  const openCadence = (leadIds: string[] = []) => { setCadenceLeadIds(leadIds); setCadenceOpen(true) }
  const toggleSelection = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const allVisibleSelected = filteredActivities.length > 0 && filteredActivities.every((item) => selectedIds.includes(item.activity.id))
  const activeAdvancedFilters = [stageId, priority, channel, owner].filter(Boolean).length + (hotStalledOnly ? 1 : 0)
  const clearAdvancedFilters = () => { setStageId(''); setPriority(''); setChannel(''); setOwner(''); setHotStalledOnly(false) }
  const saveCurrentView = async () => {
    const name = (await promptAction({ title: 'Salvar visão de Follow-ups', description: 'Guarde o recorte atual para voltar a esta fila com um clique.', label: 'Nome da visão', confirmLabel: 'Salvar visão', placeholder: 'Ex.: Minha fila de propostas' }))?.trim()
    if (!name) return
    const next: FollowupSavedView = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, filter, view: ['queue', 'board', 'calendar'].includes(view) ? view as FollowupSavedView['view'] : 'queue', stageId, priority, channel, owner, hotStalledOnly }
    const updated = [...savedViews, next]
    setSavedViews(updated)
    try { localStorage.setItem(savedViewsKey, JSON.stringify(updated)) } catch { /* storage indisponível */ }
    setActiveSavedViewId(next.id)
    notify('success', 'Exibição de Follow-ups salva.')
  }
  const applySavedView = (id: string) => {
    const saved = savedViews.find((item) => item.id === id)
    if (!saved) return
    setFilter(saved.filter); setView(saved.view); setStageId(saved.stageId); setPriority(saved.priority); setChannel(saved.channel); setOwner(saved.owner); setHotStalledOnly(saved.hotStalledOnly); setActiveSavedViewId(saved.id)
  }
  const persistFollowupViews = (next: FollowupSavedView[]) => { setSavedViews(next); try { localStorage.setItem(savedViewsKey, JSON.stringify(next)) } catch { /* storage indisponível */ } }
  const renameSavedView = async (item: FollowupSavedView) => { const name = (await promptAction({ title: 'Renomear exibição', description: 'Os filtros e o formato permanecem os mesmos.', label: 'Nome', initialValue: item.name, confirmLabel: 'Salvar nome' }))?.trim(); if (!name) return; persistFollowupViews(savedViews.map((viewItem) => viewItem.id === item.id ? { ...viewItem, name } : viewItem)) }
  const duplicateSavedView = (item: FollowupSavedView) => { const copy = { ...item, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: `${item.name} — cópia` }; persistFollowupViews([...savedViews, copy]); setActiveSavedViewId(copy.id) }
  const deleteSavedView = (id: string) => { persistFollowupViews(savedViews.filter((item) => item.id !== id)); if (activeSavedViewId === id) setActiveSavedViewId(null) }

  return <div className={`page-stack followups-page followups-page--professional followups-page-v10167 ${filtersOpen ? 'followups-page-v10167--filters-open' : ''}`}>
    <WorkspacePageHeader className="followup-page-header-v10167" eyebrow="Execução comercial" icon={Target} title="Central de follow-ups" description="Priorize próximos contatos, execute a fila e mantenha cada oportunidade com uma próxima ação clara." actions={canWrite ? <><Button variant="secondary" onClick={() => openCadence()}><Layers3 size={16} /> Cadência</Button><Button onClick={() => setExecutionOpen(true)} disabled={!queue.length}><Play size={16} /> Trabalhar fila ({queue.length})</Button></> : null} />

    <WorkspaceSummaryStrip className="followup-summary-strip-v10167">
      <WorkspaceSummaryMetric icon={AlertTriangle} label="Vencidos" value={stats.overdue} meta="Exigem ação" tone={stats.overdue ? 'danger' : 'neutral'} onClick={() => { setView('queue'); setFilter('overdue') }} />
      <WorkspaceSummaryMetric icon={CalendarClock} label="Hoje" value={stats.today} meta="Prazo no dia" tone="brand" onClick={() => { setView('queue'); setFilter('today') }} />
      <WorkspaceSummaryMetric icon={Clock3} label="Próximos" value={stats.upcoming} meta="Agendados" onClick={() => { setView('queue'); setFilter('upcoming') }} />
      <WorkspaceSummaryMetric icon={CheckCircle2} label="Concluídos" value={stats.completed} meta="Resolvidos" tone="success" onClick={() => { setView('queue'); setFilter('completed') }} />
      <WorkspaceSummaryMetric icon={Target} label="Sem próxima ação" value={stats.withoutNext} meta="Oportunidades ativas" tone={stats.withoutNext ? 'warning' : 'neutral'} />
    </WorkspaceSummaryStrip>

    <WorkspaceViewStrip className="followup-navigation-v10168 followup-view-strip-h20" value={view} onChange={setView} ariaLabel="Visualização dos follow-ups" items={[
      { id:'queue', label:'Fila', icon:ListChecks, badge:queue.length || undefined }, { id:'board', label:'Quadro', icon:Kanban }, { id:'calendar', label:'Calendário', icon:CalendarDays },
      { id:'cadences', label:'Cadências', icon:Layers3 }, { id:'performance', label:'Desempenho', icon:BarChart3 },
    ] as const} />

    {['queue', 'board', 'calendar'].includes(view) ? <>
      <section className="followup-focus-toolbar">
        <div className="followup-focus-status" aria-label="Situação dos follow-ups">
          <button type="button" className={filter === 'queue' ? 'is-active' : ''} onClick={() => { setActiveSavedViewId(null); setView('queue'); setFilter('queue') }}><Target size={13}/> Fila</button>
          <button type="button" className={filter === 'overdue' ? 'is-active is-danger' : ''} onClick={() => { setActiveSavedViewId(null); setView('queue'); setFilter('overdue') }}><AlertTriangle size={13}/> Vencidos <b>{stats.overdue}</b></button>
          <button type="button" className={filter === 'today' ? 'is-active' : ''} onClick={() => { setActiveSavedViewId(null); setView('queue'); setFilter('today') }}><CalendarClock size={13}/> Hoje <b>{stats.today}</b></button>
          <button type="button" className={filter === 'upcoming' ? 'is-active' : ''} onClick={() => { setActiveSavedViewId(null); setView('queue'); setFilter('upcoming') }}><Clock3 size={13}/> Próximos <b>{stats.upcoming}</b></button>
          <button type="button" className={filter === 'completed' ? 'is-active' : ''} onClick={() => { setActiveSavedViewId(null); setView('queue'); setFilter('completed') }}><CheckCircle2 size={13}/> Concluídos <b>{stats.completed}</b></button>
        </div>
        <div className="followup-focus-controls">
          <label className="followup-focus-search"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar follow-up ou contato…" /></label>
          <WorkspaceFilterMenu workspaceKey={`followups:${snapshot?.workspace.id ?? 'local'}`} fields={universalFollowupFilters} activeCount={activeAdvancedFilters} onOpenAdvanced={() => setFiltersOpen(true)} onClearAll={clearAdvancedFilters} onChange={(key, value) => { if (key === 'stageId') setStageId(value); else if (key === 'priority') { setPriority(value); setHotStalledOnly(false) } else if (key === 'channel') setChannel(value); else if (key === 'owner') setOwner(value); else if (key === 'hotStalledOnly') setHotStalledOnly(value === 'yes') }} />
          <details className="followup-saved-views-menu"><summary><Bookmark size={14}/> Exibições{savedViews.length ? <b>{savedViews.length}</b> : null}</summary><div>{savedViews.map((item) => <div className="followup-saved-view" key={item.id}><button type="button" className={activeSavedViewId === item.id ? 'is-active' : ''} onClick={() => applySavedView(item.id)}>{item.name}</button><button type="button" onClick={() => void renameSavedView(item)} aria-label={`Renomear ${item.name}`}>✎</button><button type="button" onClick={() => duplicateSavedView(item)} aria-label={`Duplicar ${item.name}`}>⧉</button><button type="button" className="is-danger" onClick={() => deleteSavedView(item.id)} aria-label={`Excluir ${item.name}`}>×</button></div>)}<button type="button" className="followup-save-view" onClick={() => void saveCurrentView()}>+ Salvar exibição atual</button></div></details>
          {canWrite ? <Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={15}/> Nova atividade</Button> : null}
        </div>
      </section>

      {activeAdvancedFilters ? <div className="workspace-filter-chips-v10167 followup-active-filters-v10167">
        {stageId ? <button type="button" onClick={() => setStageId('')}>Etapa: {snapshot?.stages.find((stage) => stage.id === stageId)?.name ?? 'Selecionada'} ×</button> : null}
        {priority ? <button type="button" onClick={() => setPriority('')}>Prioridade: {priority === 'urgent' ? 'Urgente' : priority === 'high' ? 'Alta' : priority === 'medium' ? 'Média' : 'Baixa'} ×</button> : null}
        {channel ? <button type="button" onClick={() => setChannel('')}>Canal: {channelLabel[channel as FollowupChannel]} ×</button> : null}
        {owner ? <button type="button" onClick={() => setOwner('')}>Responsável: {owner} ×</button> : null}
        {hotStalledOnly ? <button type="button" onClick={() => setHotStalledOnly(false)}>Quentes parados ×</button> : null}
        <button className="is-clear" type="button" onClick={clearAdvancedFilters}>Limpar</button>
      </div> : null}
      {filtersOpen ? <aside className="workspace-settings-drawer-v10167 followup-filter-drawer-v10167" aria-label="Filtros de follow-ups">
        <header><div><span>Follow-ups</span><strong>Filtros da fila</strong></div><button type="button" onClick={() => setFiltersOpen(false)} aria-label="Fechar filtros">×</button></header>
        <div className="workspace-settings-drawer-v10167__body">
          <section><div className="workspace-settings-section-title-v10167"><strong>Contexto comercial</strong><span>Refine a fila sem ocupar espaço permanente na tela.</span></div>
            <label className="field"><span>Etapa</span><NativeSelectionSelect value={stageId} onChange={(event) => setStageId(event.target.value)}><option value="">Todas as etapas</option>{snapshot?.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</NativeSelectionSelect></label>
            <label className="field"><span>Prioridade</span><NativeSelectionSelect value={priority} onChange={(event) => { setPriority(event.target.value); setHotStalledOnly(false) }}><option value="">Todas</option><option value="urgent">Urgente</option><option value="high">Alta</option><option value="medium">Média</option><option value="low">Baixa</option></NativeSelectionSelect></label>
            <label className="field"><span>Canal</span><NativeSelectionSelect value={channel} onChange={(event) => setChannel(event.target.value)}><option value="">Todos os canais</option>{Object.entries(channelLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelectionSelect></label>
            <label className="field"><span>Responsável</span><NativeSelectionSelect value={owner} onChange={(event) => setOwner(event.target.value)}><option value="">Todos os responsáveis</option>{owners.map((value) => <option key={value} value={value}>{value}</option>)}</NativeSelectionSelect></label>
          </section>
          <section><div className="workspace-settings-section-title-v10167"><strong>Atalhos</strong><span>Use filtros rápidos para situações que exigem ação.</span></div><div className="workspace-quick-filter-grid-v10167"><button type="button" className={hotStalledOnly ? 'is-active' : ''} onClick={() => setHotStalledOnly((current) => !current)}>Contatos quentes parados <span>{stats.hotStalled}</span></button><button type="button" className={filter === 'overdue' ? 'is-active' : ''} onClick={() => { setView('queue'); setFilter('overdue') }}>Vencidos <span>{stats.overdue}</span></button></div></section>
        </div>
        <footer><Button variant="secondary" onClick={clearAdvancedFilters}>Limpar filtros</Button><Button onClick={() => setFiltersOpen(false)}>Aplicar</Button></footer>
      </aside> : null}
    </> : null}

    {view === 'queue' ? <>
      {canWrite && selectedIds.length ? <section className="followup-bulk-bar"><strong>{selectedIds.length} selecionada(s)</strong><div><Button size="sm" variant="secondary" onClick={() => void bulkPostpone()}><Clock3 size={15} /> Próximo dia útil</Button><Button size="sm" variant="secondary" onClick={() => openCadence([...new Set(filteredActivities.filter((item) => selectedIds.includes(item.activity.id) && item.lead).map((item) => item.lead!.id))])}><Layers3 size={15} /> Inserir em cadência</Button><Button size="sm" onClick={() => void bulkComplete()}><CheckCircle2 size={15} /> Concluir</Button><Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>Limpar</Button></div></section> : null}
      <section className="followup-workspace-layout">
        <div className="panel followup-list-panel followup-list-panel--professional">
          <header className="followup-list-header">{canWrite ? <label className="followup-select-all"><input type="checkbox" checked={allVisibleSelected} onChange={() => setSelectedIds(allVisibleSelected ? [] : filteredActivities.map((item) => item.activity.id))} /><span /></label> : null}<div><h3>Fila comercial</h3><p>{filteredActivities.length} atividade(s) no filtro atual</p></div><span className="followup-priority-legend">Ordenada por prioridade</span></header>
          {filteredActivities.length ? <div className="followup-list">{filteredActivities.map((item) => <FollowupRow readOnly={!canWrite} key={item.activity.id} item={item} selected={selectedIds.includes(item.activity.id)} active={selectedActivity?.activity.id === item.activity.id} busy={busyId === item.activity.id} onSelect={() => setSelectedActivityId(item.activity.id)} onToggleSelect={() => toggleSelection(item.activity.id)} onToggle={() => void toggle(item.activity)} onEdit={() => item.activity.sourceType === 'manual' ? setEditing(item.activity) : item.activity.sourceType === 'calendar' ? setRoute('agenda') : setRoute('calls')} onOutcome={() => setOutcomeActivity(item.activity)} onReschedule={(mode) => void quickReschedule(item.activity, mode)} />)}</div> : <EmptyState icon={filter === 'completed' ? CheckCircle2 : XCircle} title="Nenhuma atividade encontrada" description="Crie um próximo contato, inicie uma cadência ou ajuste os filtros." action={canWrite ? <Button onClick={() => setCreateOpen(true)}><Plus size={17} /> Nova atividade</Button> : undefined} />}
        </div>
        <FollowupContext readOnly={!canWrite} item={selectedActivity} contacts={snapshot?.contacts ?? []} busy={Boolean(selectedActivity && busyId === selectedActivity.activity.id)} onCall={(lead) => setCallLead(lead)} onWhatsApp={(lead) => setMessageLead(lead)} onOutcome={(activity) => setOutcomeActivity(activity)} onCadence={(leadId) => openCadence([leadId])} onEdit={(activity) => setEditing(activity)} onReschedule={(activity, mode) => void quickReschedule(activity, mode)} onRoute={setRoute} />
      </section>
    </> : null}

    {view === 'board' ? <FollowupBoard items={filteredActivities} onSelect={(activity) => { setSelectedActivityId(activity.id); if (canWrite) setOutcomeActivity(activity) }} /> : null}
    {view === 'calendar' ? <FollowupCalendar items={filteredActivities} onSelect={(activity) => { setSelectedActivityId(activity.id); if (canWrite) setOutcomeActivity(activity) }} /> : null}
    {view === 'cadences' ? <CadenceDashboard readOnly={!canWrite} groups={cadenceGroups} onCreate={() => openCadence()} onState={(cadenceId, action) => void updateCadenceState(cadenceId, action)} onSelectLead={(leadId) => { const activity = enriched.find((item) => item.activity.leadId === leadId && !item.activity.completedAt && !item.paused); if (activity) { setView('queue'); setSelectedActivityId(activity.activity.id) } }} /> : null}
    {view === 'performance' ? <PerformanceDashboard performance={performance} /> : null}

    <ActivityModal open={canWrite && createOpen} onClose={() => setCreateOpen(false)} />
    <ActivityModal open={canWrite && Boolean(editing)} activity={editing} onClose={() => setEditing(null)} />
    <CadenceModal open={canWrite && cadenceOpen} initialLeadIds={cadenceLeadIds} onClose={() => { setCadenceOpen(false); setCadenceLeadIds([]) }} />
    <OutcomeModal activity={canWrite ? outcomeActivity : null} onClose={() => setOutcomeActivity(null)} />
    <ExecutionWorkspace open={canWrite && executionOpen} queue={queue} contacts={snapshot?.contacts ?? []} onClose={() => setExecutionOpen(false)} onCall={(lead) => { setExecutionOpen(false); setCallLead(lead) }} onWhatsApp={(lead) => { setExecutionOpen(false); setMessageLead(lead) }} onOutcome={(activity) => setOutcomeActivity(activity)} onRoute={setRoute} />
    <LazyCallWorkspaceModal open={canWrite && Boolean(callLead)} config={callLead ? buildQuickCallSessionConfig({ snapshot, initialLeadId: callLead.id, leadIds: [callLead.id] }) : null} onClose={() => setCallLead(null)} />
    <SalesMessageModal lead={messageLead} templatePurpose="followup" stageName={snapshot?.stages.find((stage) => stage.id === messageLead?.stageId)?.name ?? 'Follow-up'} open={canWrite && Boolean(messageLead)} onClose={() => setMessageLead(null)} />
  </div>
}

function FollowupRow({ readOnly, item, selected, active, busy, onSelect, onToggleSelect, onToggle, onEdit, onOutcome, onReschedule }: { readOnly: boolean; item: EnrichedActivity; selected: boolean; active: boolean; busy: boolean; onSelect(): void; onToggleSelect(): void; onToggle(): void; onEdit(): void; onOutcome(): void; onReschedule(mode: QuickRescheduleMode): void }) {
  const timingTone = followupTimingTone(item)
  const summary = compactFollowupDescription(item.description)
  return <article className={`followup-row followup-row--professional followup-row--focus followup-row--${timingTone} ${item.activity.completedAt ? (item.activity.resolutionStatus === 'superseded' ? 'is-superseded' : 'is-completed') : ''} ${active ? 'is-active' : ''}`}>
    {!readOnly ? <label className="followup-row__select" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selected} onChange={onToggleSelect} /><span /></label> : null}
    {!readOnly ? <button className="followup-row__check" type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); onToggle() }} aria-label={item.activity.completedAt ? 'Reabrir atividade' : 'Registrar resultado'}>{item.activity.completedAt ? <Check size={18} /> : null}</button> : null}
    <div className="followup-row__body followup-row__open" role="button" tabIndex={0} aria-pressed={active} onClick={onSelect} onKeyDown={(event) => { if (isKeyboardActivationKey(event.key)) { event.preventDefault(); onSelect() } }}>
      <div className="followup-row__heading"><span className={`followup-timing-chip followup-timing-chip--${timingTone}`}><Clock3 size={12} /> {followupTimingLabel(item)}</span><StatusPill tone={toneForActivity(item.activity)}>{channelLabel[item.channel]}</StatusPill>{item.cadenceName ? <span className="followup-cadence-chip"><Layers3 size={12} /> {item.cadenceName}{item.cadenceStep ? ` · ${item.cadenceStep}` : ''}</span> : null}{item.activity.resolutionStatus === 'superseded' ? <small className="followup-resolution-note">Encerrada por avanço</small> : null}</div>
      <strong>{item.activity.title}</strong>
      {summary ? <p className="followup-row__summary">{summary}</p> : null}
      <div className="followup-row__identity"><span><UserRound size={14} /> <b>{item.lead?.name ?? 'Sem contato'}</b>{item.lead?.company ? ` · ${item.lead.company}` : ''}</span><span><UsersRound size={14} /> {item.lead?.ownerName || 'Não atribuído'}</span></div>
    </div>
    {!readOnly ? <div className="followup-row__actions followup-row__actions--focus" onClick={(event) => event.stopPropagation()}>{!item.activity.completedAt ? <Button size="sm" onClick={onOutcome}>Registrar resultado</Button> : null}<details className="followup-row-more"><summary aria-label="Mais ações">•••</summary><div>{!item.activity.completedAt ? <><button type="button" disabled={busy} onClick={() => onReschedule('later')}>Reagendar +2 horas</button><button type="button" disabled={busy} onClick={() => onReschedule('tomorrow')}>Reagendar amanhã útil</button><button type="button" disabled={busy} onClick={() => onReschedule('next-business')}>Próximo dia útil</button></> : null}<button type="button" onClick={onEdit}>Editar / abrir atividade</button></div></details></div> : null}
  </article>
}

function FollowupContext({ readOnly, item, contacts, busy, onCall, onWhatsApp, onOutcome, onCadence, onEdit, onReschedule, onRoute }: { readOnly: boolean; item: EnrichedActivity | null; contacts: ContactRecord[]; busy: boolean; onCall(lead: Lead): void; onWhatsApp(lead: Lead): void; onOutcome(activity: ActivityItem): void; onCadence(leadId: string): void; onEdit(activity: ActivityItem): void; onReschedule(activity: ActivityItem, mode: QuickRescheduleMode): void; onRoute(route: 'calls' | 'agenda' | 'pipeline' | 'playbooks'): void }) {
  if (!item) return <aside className="panel followup-context-panel followup-context-panel--focus"><EmptyState icon={ListChecks} title="Selecione uma atividade" description="O essencial do contato e da próxima ação aparecerá aqui." /></aside>
  const lead = item.lead
  const resolvedTarget = lead ? resolveLeadCallTarget(lead, contacts) : null
  const targetContact = resolvedTarget?.contactId ? contacts.find((contact) => contact.id === resolvedTarget.contactId) ?? null : null
  const phone = resolvedTarget?.phone.replace(/\D/g, '') ?? ''
  const email = targetContact?.email?.trim() || lead?.email || ''
  const summary = compactFollowupDescription(item.description, 220)
  return <aside className="panel followup-context-panel followup-context-panel--focus">
    <header><div><span className="eyebrow">Contato</span><h3>{lead?.name ?? 'Atividade sem lead'}</h3><p>{lead?.company || lead?.city || 'Cadastro sem empresa'}</p></div>{lead ? <span className={`temperature-badge temperature-badge--${lead.temperature}`}>{lead.temperature === 'hot' ? 'Quente' : lead.temperature === 'warm' ? 'Morno' : 'Frio'}</span> : null}</header>
    <div className={`followup-context-timing followup-context-timing--${followupTimingTone(item)}`}><Clock3 size={16} /><span><small>Prazo</small><strong>{followupTimingLabel(item)}</strong></span></div>
    {lead ? <div className="followup-context-summary followup-context-summary--focus"><div><span>Etapa</span><strong>{item.stageName}</strong></div><div><span>Responsável</span><strong>{lead.ownerName || 'Não atribuído'}</strong></div><div><span>Próxima ação</span><strong>{formatDateTime(lead.nextActionAt)}</strong></div><div><span>Prioridade</span><strong>{lead.priority === 'urgent' ? 'Urgente' : lead.priority === 'high' ? 'Alta' : lead.priority === 'medium' ? 'Média' : 'Baixa'}</strong></div></div> : null}
    <section className="followup-context-action followup-context-action--focus"><span className="eyebrow">Ação atual</span><h4>{item.activity.title}</h4>{summary ? <p>{summary}</p> : null}{item.script ? <details className="followup-context-guidance"><summary>Ver orientação</summary><div><p>{item.script}</p><button type="button" onClick={() => onRoute('playbooks')}>Abrir Playbooks <ExternalLink size={13}/></button></div></details> : null}</section>
    {!readOnly && lead ? <div className="followup-channel-actions followup-channel-actions--focus"><button type="button" className={!phone || lead.doNotContact ? 'is-disabled' : ''} disabled={!phone || lead.doNotContact} onClick={() => onCall(lead)} title={lead.doNotContact ? (contactBlockedMessage(lead, 'call') ?? undefined) : `Ligar para ${resolvedTarget?.name || lead.name}`}><PhoneCall size={17}/><span>Ligar</span></button><button type="button" className={!phone || lead.doNotContact ? 'is-disabled' : ''} disabled={!phone || lead.doNotContact} onClick={() => onWhatsApp(lead)} title={lead.doNotContact ? (contactBlockedMessage(lead, 'whatsapp') ?? undefined) : undefined}><MessageCircle size={17}/><span>WhatsApp</span></button><a className={!email || lead.doNotContact ? 'is-disabled' : ''} href={email && !lead.doNotContact ? `mailto:${email}` : undefined} title={lead.doNotContact ? (contactBlockedMessage(lead, 'email') ?? undefined) : undefined}><Mail size={17}/><span>E-mail</span></a></div> : null}
    {!readOnly ? <div className="followup-context-primary">{!item.activity.completedAt ? <Button onClick={() => onOutcome(item.activity)}><CheckCircle2 size={16}/> Registrar resultado</Button> : null}<details className="followup-context-menu"><summary><Clock3 size={14}/> Reagendar</summary><div><button type="button" disabled={busy} onClick={() => onReschedule(item.activity, 'later')}>+2 horas</button><button type="button" disabled={busy} onClick={() => onReschedule(item.activity, 'tomorrow')}>Amanhã útil</button><button type="button" disabled={busy} onClick={() => onReschedule(item.activity, 'next-business')}>Próximo útil</button></div></details><details className="followup-context-menu"><summary>Mais</summary><div><button type="button" onClick={() => onEdit(item.activity)}>Editar atividade</button>{lead ? <button type="button" onClick={() => onCadence(lead.id)}>Nova cadência</button> : null}{lead ? <button type="button" onClick={() => onRoute('pipeline')}>Ver Pipeline</button> : null}</div></details></div> : lead ? <Button variant="ghost" onClick={() => onRoute('pipeline')}>Ver Pipeline</Button> : null}
  </aside>
}

function FollowupBoard({ items, onSelect }: { items: EnrichedActivity[]; onSelect(activity: ActivityItem): void }) {
  const now = new Date()
  const columns = [
    { id: 'overdue', label: 'Vencidos', items: items.filter((item) => item.overdue) },
    { id: 'today', label: 'Hoje', items: items.filter((item) => item.today) },
    { id: 'waiting', label: 'Sem data', items: items.filter((item) => !item.activity.completedAt && !item.due) },
    { id: 'upcoming', label: 'Próximos', items: items.filter((item) => !item.activity.completedAt && item.due && item.due.getTime() > endOfDay(now).getTime()) },
    { id: 'completed', label: 'Concluídos', items: items.filter((item) => item.activity.completedAt && (item.activity.resolutionStatus ?? 'completed') === 'completed').slice(0, 30) },
  ]
  return <section className="followup-board">{columns.map((column) => <div className={`followup-board__column followup-board__column--${column.id}`} key={column.id}><header><strong>{column.label}</strong><span>{column.items.length}</span></header><div>{column.items.map((item) => <button type="button" key={item.activity.id} onClick={() => onSelect(item.activity)}><span><StatusPill tone={toneForActivity(item.activity)}>{channelLabel[item.channel]}</StatusPill><small className={`followup-board__timing followup-board__timing--${followupTimingTone(item)}`}>{followupTimingLabel(item)}</small></span><strong>{item.activity.title}</strong><p>{item.lead?.name ?? 'Sem lead'}{item.lead?.company ? ` · ${item.lead.company}` : ''}</p>{item.cadenceName ? <small className="followup-board__cadence"><Layers3 size={11} /> {item.cadenceName}{item.cadenceStep ? ` · ${item.cadenceStep}` : ''}</small> : null}<footer><span><UsersRound size={13} /> {item.lead?.ownerName || 'Não atribuído'}</span>{item.lead ? <span className={`priority-dot priority-dot--${item.lead.priority}`} title={`Prioridade ${item.lead.priority}`} /> : null}</footer></button>)}</div></div>)}</section>
}

function FollowupCalendar({ items, onSelect }: { items: EnrichedActivity[]; onSelect(activity: ActivityItem): void }) {
  const [offset, setOffset] = useState(0)
  const start = addDays(startOfDay(new Date()), offset * 7)
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index))
  return <section className="panel followup-calendar"><header><div><span className="eyebrow">Agenda de contatos</span><h3>{start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })} — {days[6].toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</h3></div><div><button className="icon-button" type="button" onClick={() => setOffset((value) => value - 1)}><ChevronLeft size={18} /></button><Button size="sm" variant="ghost" onClick={() => setOffset(0)}>Hoje</Button><button className="icon-button" type="button" onClick={() => setOffset((value) => value + 1)}><ChevronRight size={18} /></button></div></header><div className="followup-calendar__grid">{days.map((day) => { const dayItems = items.filter((item) => item.due && dateKey(item.due) === dateKey(day)); return <div key={dateKey(day)} className={sameDay(day, new Date()) ? 'is-today' : ''}><header><span>{day.toLocaleDateString('pt-BR', { weekday: 'short' })}</span><strong>{day.getDate()}</strong><small>{dayItems.length}</small></header><section>{dayItems.map((item) => <button type="button" key={item.activity.id} onClick={() => onSelect(item.activity)}><span>{item.due?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span><strong>{item.activity.title}</strong><small>{item.lead?.name ?? 'Sem lead'} · {channelLabel[item.channel]}</small><small className="followup-calendar__owner">{item.lead?.ownerName || 'Não atribuído'}{item.cadenceStep ? ` · Cadência ${item.cadenceStep}` : ''}</small></button>)}</section></div> })}</div></section>
}

function CadenceDashboard({ readOnly, groups, onCreate, onSelectLead, onState }: { readOnly: boolean; groups: { id: string; name: string; category: string; activities: EnrichedActivity[]; leads: Set<string>; enrollments: CadenceEnrollmentSummary[] }[]; onCreate(): void; onSelectLead(leadId: string): void; onState(cadenceId: string, action: 'pause' | 'resume' | 'stop'): void }) {
  return <div className="cadence-dashboard"><section className="cadence-dashboard__hero"><div><span className="eyebrow">Sales Engagement</span><h2>Cadências multicanal em execução</h2><p>Respostas retiram o lead da sequência, pedidos de retorno pausam o fluxo e tentativas sem resposta seguem automaticamente para a próxima etapa.</p></div>{!readOnly ? <Button onClick={onCreate}><Plus size={17} /> Iniciar cadência</Button> : null}</section>{groups.length ? <section className="cadence-dashboard__grid">{groups.map((group) => {
    const completed = group.activities.filter((item) => item.activity.completedAt && (item.activity.resolutionStatus ?? 'completed') === 'completed').length
    const active = group.enrollments.filter((item) => item.state === 'active').length
    const paused = group.enrollments.filter((item) => item.state === 'paused').length
    const stopped = group.enrollments.filter((item) => item.state === 'stopped').length
    const completedEnrollments = group.enrollments.filter((item) => item.state === 'completed').length
    const replies = group.enrollments.filter((item) => item.response).length
    const responseRate = group.enrollments.length ? Math.round((replies / group.enrollments.length) * 100) : 0
    const rate = group.activities.length ? Math.round((completed / group.activities.length) * 100) : 0
    const next = group.activities.filter((item) => !item.paused && !item.activity.completedAt && (item.activity.resolutionStatus ?? 'pending') === 'pending' && item.due).sort((a, b) => a.due!.getTime() - b.due!.getTime())[0]
    return <article className="cadence-monitor-card cadence-monitor-card--engagement" key={group.id}><header><span><Layers3 size={19} /></span><div><small>{group.category}</small><h3>{group.name}</h3></div><StatusPill tone={responseRate >= 30 ? 'success' : responseRate ? 'warning' : 'info'}>{responseRate}% resposta</StatusPill></header><div className="cadence-monitor-card__metrics cadence-monitor-card__metrics--engagement"><div><strong>{active}</strong><span>ativas</span></div><div><strong>{paused}</strong><span>pausadas</span></div><div><strong>{stopped}</strong><span>saíram</span></div><div><strong>{completedEnrollments}</strong><span>concluídas</span></div></div><div className="cadence-monitor-card__progress"><span style={{ width: `${rate}%` }} /></div><footer><span><Clock3 size={14} /> {next ? `Próxima: ${formatDateTime(next.activity.dueAt)}` : active ? 'Sem próxima etapa datada' : 'Sem execuções ativas'}</span>{next?.activity.leadId ? <button type="button" onClick={() => onSelectLead(next.activity.leadId!)}>Abrir lead <ChevronRight size={14} /></button> : null}</footer>{!readOnly ? <div className="cadence-monitor-card__controls"><Button size="sm" variant="secondary" onClick={() => onState(group.id, 'pause')}>Pausar</Button><Button size="sm" variant="secondary" onClick={() => onState(group.id, 'resume')}>Retomar</Button><Button size="sm" variant="ghost" onClick={() => onState(group.id, 'stop')}>Encerrar</Button></div> : null}</article>
  })}</section> : <EmptyState icon={Layers3} title="Nenhuma cadência iniciada" description="Crie uma sequência com ligação, WhatsApp, e-mail, LinkedIn, reunião e tarefas manuais." action={!readOnly ? <Button onClick={onCreate}><Plus size={17} /> Iniciar primeira cadência</Button> : undefined} />}</div>
}

function PerformanceDashboard({ performance }: { performance: { outcomeCounts: { outcome: FollowupOutcome; count: number }[]; completed: number; scheduled: number; contacts: number; meetings: number; proposals: number; wins: number; completionRate: number; contactRate: number } }) {
  const max = Math.max(1, ...performance.outcomeCounts.map((item) => item.count))
  return <div className="performance-dashboard"><section className="performance-summary-grid"><article><span>Execução</span><strong>{performance.completionRate}%</strong><small>{performance.completed} de {performance.scheduled} atividades</small></article><article><span>Contato efetivo</span><strong>{performance.contactRate}%</strong><small>{performance.contacts} respostas úteis</small></article><article><span>Reuniões</span><strong>{performance.meetings}</strong><small>últimos 30 dias</small></article><article><span>Propostas</span><strong>{performance.proposals}</strong><small>solicitações registradas</small></article><article><span>Vendas</span><strong>{performance.wins}</strong><small>resultados ganhos</small></article></section><section className="performance-layout"><div className="panel performance-results"><header><div><span className="eyebrow">Resultados registrados</span><h3>Conversão por desfecho</h3></div><span>Últimos 30 dias</span></header>{performance.outcomeCounts.length ? <div className="performance-bars">{performance.outcomeCounts.map((item) => <div key={item.outcome}><span>{outcomeLabel[item.outcome]}</span><div><i style={{ width: `${Math.max(5, (item.count / max) * 100)}%` }} /></div><strong>{item.count}</strong></div>)}</div> : <EmptyState icon={BarChart3} title="Ainda não há resultados suficientes" description="Ao concluir contatos pelo botão Registrar resultado, as métricas serão preenchidas automaticamente." />}</div><aside className="panel performance-diagnosis"><span className="eyebrow">Leitura comercial</span><h3>O que acompanhar</h3><ul><li>Execução abaixo de 80% indica fila acumulada ou carga mal distribuída.</li><li>Contato efetivo baixo exige revisão de canal, horário e qualidade dos dados.</li><li>Muitas propostas sem reunião sugerem qualificação superficial.</li><li>Registre sempre o resultado para comparar cadências e responsáveis.</li></ul></aside></section></div>
}

function ExecutionWorkspace({ open, queue, contacts, onClose, onCall, onWhatsApp, onOutcome, onRoute }: { open: boolean; queue: EnrichedActivity[]; contacts: ContactRecord[]; onClose(): void; onCall(lead: Lead): void; onWhatsApp(lead: Lead): void; onOutcome(activity: ActivityItem): void; onRoute(route: 'calls' | 'agenda' | 'pipeline' | 'playbooks'): void }) {
  const [index, setIndex] = useState(0)
  useEffect(() => { if (open) setIndex(0) }, [open])
  useEffect(() => { if (index >= queue.length && queue.length) setIndex(queue.length - 1) }, [index, queue.length])
  const current = queue[index] ?? null
  const lead = current?.lead ?? null
  const resolvedTarget = lead ? resolveLeadCallTarget(lead, contacts) : null
  const targetContact = resolvedTarget?.contactId ? contacts.find((contact) => contact.id === resolvedTarget.contactId) ?? null : null
  const phone = resolvedTarget?.phone.replace(/\D/g, '') ?? ''
  const email = targetContact?.email?.trim() || lead?.email || ''
  const linkedin = lead?.linkedinUrl?.trim() || ''
  const instagram = lead?.instagramUrl?.trim() || ''
  const assistedMessage = current?.executionMode === 'assisted' ? current.script.trim() : ''
  const emailHref = email && !lead?.doNotContact ? `mailto:${email}?subject=${encodeURIComponent(current?.activity.title ?? 'Contato')}${assistedMessage ? `&body=${encodeURIComponent(assistedMessage)}` : ''}` : undefined
  return <Modal open={open} onClose={onClose} title="Modo de execução" subtitle={queue.length ? `${index + 1} de ${queue.length} atividades prioritárias` : 'Fila concluída'} size="lg" footer={<><Button variant="ghost" disabled={index <= 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}><ChevronLeft size={16} /> Anterior</Button><span className="modal__footer-spacer" /><Button variant="secondary" onClick={onClose}>Fechar</Button><Button variant="secondary" disabled={index >= queue.length - 1} onClick={() => setIndex((value) => Math.min(queue.length - 1, value + 1))}>Próximo <ChevronRight size={16} /></Button>{current ? <Button onClick={() => onOutcome(current.activity)}><CheckCircle2 size={16} /> Registrar resultado</Button> : null}</>}>
    {current ? <div className="execution-workspace"><section className="execution-lead-card"><div><span className="execution-lead-card__avatar">{lead?.name.slice(0, 2).toUpperCase() ?? '—'}</span><span><small>Lead atual</small><h3>{lead?.name ?? 'Sem lead vinculado'}</h3><p>{lead?.company || lead?.city || 'Sem empresa'} · {lead?.ownerName || 'Sem responsável'}</p></span></div>{lead ? <div><StatusPill tone={lead.temperature === 'hot' ? 'danger' : lead.temperature === 'warm' ? 'warning' : 'info'}>{lead.temperature === 'hot' ? 'Quente' : lead.temperature === 'warm' ? 'Morno' : 'Frio'}</StatusPill><StatusPill tone="neutral">{lead.priority === 'urgent' ? 'Urgente' : lead.priority === 'high' ? 'Alta' : lead.priority === 'medium' ? 'Média' : 'Baixa'}</StatusPill></div> : null}</section><div className="execution-workspace__grid"><section className="execution-action-card"><span className="eyebrow">Objetivo da etapa</span><h2>{current.activity.title}</h2><p>{current.description || 'Execute o contato e registre o que aconteceu.'}</p><div className="execution-action-meta"><span><Clock3 size={15} /> {formatDateTime(current.activity.dueAt)}</span><span><Layers3 size={15} /> {current.cadenceName || 'Atividade avulsa'} {current.cadenceStep ? `· ${current.cadenceStep}` : ''}</span></div><div className="engagement-execution-status"><StatusPill tone={current.executionMode === 'assisted' ? 'success' : 'neutral'}>{current.executionMode === 'assisted' ? 'Execução assistida' : 'Execução manual'}</StatusPill><span>{cadenceChannelAvailable(lead, current.channel) ? `Canal ${channelLabel[current.channel]} disponível` : `Canal ${channelLabel[current.channel]} sem dados suficientes`}</span></div>{current.script ? <div className="execution-script"><span>Script ou orientação</span><p>{current.script}</p><button type="button" onClick={() => onRoute('playbooks')}>Consultar Playbooks <ExternalLink size={14} /></button></div> : null}<div className="execution-channel-grid"><button type="button" className={!phone || lead?.doNotContact ? 'is-disabled' : ''} disabled={!lead || !phone || lead.doNotContact} onClick={() => lead && onCall(lead)} title={lead?.doNotContact ? (contactBlockedMessage(lead, 'call') ?? undefined) : undefined}><PhoneCall size={21} /><strong>Ligar</strong><span>{lead?.doNotContact ? 'Contato bloqueado' : resolvedTarget?.name ? `Abrir ${resolvedTarget.name}` : 'Abrir Central de Ligações'}</span></button><button type="button" className={!phone || lead?.doNotContact ? 'is-disabled' : ''} disabled={!lead || !phone || lead.doNotContact} onClick={() => lead && onWhatsApp(lead)} title={lead?.doNotContact ? (contactBlockedMessage(lead, 'whatsapp') ?? undefined) : undefined}><MessageCircle size={21} /><strong>WhatsApp</strong><span>{lead?.doNotContact ? 'Contato bloqueado' : assistedMessage ? 'Mensagem preparada' : 'Abrir compositor'}</span></button><a className={!email || lead?.doNotContact ? 'is-disabled' : ''} href={emailHref} title={lead?.doNotContact ? (contactBlockedMessage(lead, 'email') ?? undefined) : undefined}><Mail size={21} /><strong>E-mail</strong><span>{lead?.doNotContact ? 'Contato bloqueado' : assistedMessage ? 'Mensagem preparada' : 'Nova mensagem'}</span></a><a className={!linkedin || lead?.doNotContact ? 'is-disabled' : ''} href={linkedin && !lead?.doNotContact ? linkedin : undefined} target="_blank" rel="noreferrer"><Send size={21} /><strong>LinkedIn</strong><span>{linkedin ? 'Abrir perfil' : 'Perfil ausente'}</span></a><a className={!instagram || lead?.doNotContact ? 'is-disabled' : ''} href={instagram && !lead?.doNotContact ? instagram : undefined} target="_blank" rel="noreferrer"><Send size={21} /><strong>Instagram</strong><span>{instagram ? 'Abrir perfil' : 'Perfil ausente'}</span></a><button type="button" onClick={() => onRoute(current.activity.type === 'meeting' ? 'agenda' : 'calls')}><ExternalLink size={21} /><strong>Abrir módulo</strong><span>{current.activity.type === 'meeting' ? 'Agenda' : 'Ligações'}</span></button></div></section><aside className="execution-checklist"><span className="eyebrow">Antes de avançar</span><h3>Checklist obrigatório</h3><ol><li>Revise o histórico e o objetivo.</li><li>Execute o contato no canal previsto.</li><li>Registre objeções e acordos.</li><li>Defina o resultado real.</li><li>Programe a próxima ação.</li></ol><div><strong>{queue.length - index}</strong><span>itens restantes na fila</span></div></aside></div></div> : <EmptyState icon={CheckCircle2} title="Fila concluída" description="Não existem atividades vencidas ou previstas para hoje." />}
  </Modal>
}
