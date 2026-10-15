import { NativeSelectionSelect } from '../../components/selection'
import {
  AlertTriangle,
  Bell,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  MapPin,
  Phone,
  Plus,
  RotateCcw,
  Search,
  UserRound,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type DragEvent, type MouseEvent } from 'react'
import { useAppActions, useAppNavigation, useAppUi, useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { WorkspaceFilterMenu, type WorkspaceFilterField } from '../../components/workspace/workspace-filter-system'
import { WorkspaceCommandBar, WorkspaceCommandGroup, WorkspacePageHeader, WorkspaceSummaryMetric, WorkspaceSummaryStrip, WorkspaceViewStrip } from '../../components/workspace/workspace-shell'
import { contactBlockedMessage } from '../../services/contact-policy'
import { resolveLeadCallTarget } from '../../services/call-workspace'
import type { CalendarEvent, CalendarEventStatus, Lead } from '../../domain/types'
import {
  agendaCalendarLabel,
  agendaEventTypeLabel,
  agendaReminderLabel,
  agendaReminderMinutes,
  dayKey,
  eventsOverlap,
  inferAgendaCalendar,
  inferAgendaEventType,
  moveEventToDate,
  readAgendaMetadata,
  stripAgendaMetadata,
  type AgendaCalendar,
  type AgendaEventType,
} from '../../services/agenda-workspace'
import { EventModal } from './event-modal'
import { OutcomeModal } from '../followups/outcome-modal'
import { usePreferences } from '../settings/preferences-context'
import { LazyCallWorkspaceModal } from '../calls/lazy-call-workspace-modal'
import { buildQuickCallSessionConfig } from '../calls/call-session-config'

type View = 'month' | 'week' | 'day' | 'year'
type QuickFilter = '' | 'upcoming7' | 'conflicts' | 'overdue'
const dayNames = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const HOUR_HEIGHT = 64
const statusLabel: Record<CalendarEventStatus, string> = { confirmed: 'Confirmado', tentative: 'Aguardando confirmação', completed: 'Concluído', cancelled: 'Cancelado' }

const startOfDay = (date: Date) => { const value = new Date(date); value.setHours(0, 0, 0, 0); return value }
const endOfDay = (date: Date) => { const value = new Date(date); value.setHours(23, 59, 59, 999); return value }
const startOfWeek = (date: Date) => { const value = startOfDay(date); const day = value.getDay() || 7; value.setDate(value.getDate() - day + 1); return value }
const addDays = (date: Date, days: number) => { const value = new Date(date); value.setDate(value.getDate() + days); return value }
const sameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b)
const formatTime = (value: string) => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
const formatDay = (value: Date) => new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(value).replace('.', '')
const formatDate = (value: string) => new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date(value)).replace('.', '')
const formatLongDate = (value: string) => new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(value))
const minutesBetween = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000))

const eventPosition = (event: CalendarEvent, dayStart: number, dayEnd: number): CSSProperties => {
  if (event.allDay) return {}
  const starts = new Date(event.startsAt)
  const ends = new Date(event.endsAt)
  const startMinutes = Math.max(0, (starts.getHours() - dayStart) * 60 + starts.getMinutes())
  const endMinutes = Math.min((dayEnd - dayStart + 1) * 60, (ends.getHours() - dayStart) * 60 + ends.getMinutes())
  const duration = Math.max(30, endMinutes - startMinutes)
  return { top: `${(startMinutes / 60) * HOUR_HEIGHT}px`, height: `${Math.max(34, (duration / 60) * HOUR_HEIGHT - 4)}px` }
}

const currentTimePosition = (dayStart: number, dayEnd: number) => {
  const now = new Date()
  const minutes = (now.getHours() - dayStart) * 60 + now.getMinutes()
  if (minutes < 0 || minutes > (dayEnd - dayStart + 1) * 60) return null
  return `${(minutes / 60) * HOUR_HEIGHT}px`
}

export function AgendaPage() {
  const { snapshot, canWrite } = useAppWorkspace()
  const { setRoute, navigate, routeContext, clearRouteContext } = useAppNavigation()
  const { notify } = useAppUi()
  const { createActivity, updateCalendarEvent } = useAppActions()
  const { preferences } = usePreferences()
  const dayStart = Number(preferences.commercial.businessStart.split(':')[0]) || 8
  const [endHour, endMinute] = preferences.commercial.businessEnd.split(':').map(Number)
  const dayEnd = Math.max(dayStart + 1, (Number.isFinite(endHour) ? endHour : 18) + (endMinute > 0 ? 1 : 0))
  const hours = useMemo(() => Array.from({ length: dayEnd - dayStart + 1 }, (_, index) => dayStart + index), [dayEnd, dayStart])
  const [view, setView] = useState<View>('month')
  const [cursor, setCursor] = useState(new Date())
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [calendarFilter, setCalendarFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [createDate, setCreateDate] = useState<Date | null>(null)
  const [editing, setEditing] = useState<CalendarEvent | null>(null)
  const [outcomeEventId, setOutcomeEventId] = useState<string | null>(null)
  const [outcomeActivityId, setOutcomeActivityId] = useState<string | null>(null)
  const [callLead, setCallLead] = useState<Lead | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(() => typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
  const [nowTick, setNowTick] = useState(Date.now())

  useEffect(() => {
    if (routeContext.eventId && snapshot?.events.some((event) => event.id === routeContext.eventId)) setSelectedId(routeContext.eventId)
    if (routeContext.action === 'create-meeting') setCreateDate(new Date())
  }, [routeContext.action, routeContext.eventId, snapshot?.events])

  const ownerMap = useMemo(() => {
    const map = new Map<string, string>()
    snapshot?.leads.forEach((lead) => { if (lead.ownerId && lead.ownerName) map.set(lead.ownerId, lead.ownerName) })
    return map
  }, [snapshot])

  const owners = useMemo(() => [...ownerMap.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [ownerMap])

  const allEvents = useMemo(() => [...(snapshot?.events ?? [])].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()), [snapshot])
  const conflictIds = useMemo(() => {
    const ids = new Set<string>()
    const active = allEvents.filter((event) => !['cancelled', 'completed'].includes(event.status) && new Date(event.endsAt).getTime() >= nowTick)
    active.forEach((event, index) => {
      active.slice(index + 1).forEach((candidate) => {
        if (event.assignedTo && candidate.assignedTo && event.assignedTo !== candidate.assignedTo) return
        if (eventsOverlap(event, candidate)) { ids.add(event.id); ids.add(candidate.id) }
      })
    })
    return ids
  }, [allEvents, nowTick])
  const filteredEvents = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const todayEndMs = endOfDay(new Date(nowTick)).getTime()
    const nextWeekMs = addDays(endOfDay(new Date(nowTick)), 7).getTime()
    return allEvents.filter((event) => {
      const lead = snapshot?.leads.find((item) => item.id === event.leadId)
      const type = inferAgendaEventType(event)
      const calendar = inferAgendaCalendar(event)
      const startsAt = new Date(event.startsAt).getTime()
      const endsAt = new Date(event.endsAt).getTime()
      const matchesQuick = quickFilter === 'upcoming7'
        ? !['cancelled', 'completed'].includes(event.status) && startsAt > todayEndMs && startsAt <= nextWeekMs
        : quickFilter === 'conflicts'
          ? conflictIds.has(event.id)
          : quickFilter === 'overdue'
            ? !['cancelled', 'completed'].includes(event.status) && endsAt < nowTick
            : true
      return matchesQuick
        && (!normalized || `${event.title} ${stripAgendaMetadata(event.description)} ${event.location} ${lead?.name ?? ''} ${lead?.company ?? ''}`.toLowerCase().includes(normalized))
        && (!typeFilter || type === typeFilter)
        && (!calendarFilter || calendar === calendarFilter)
        && (!statusFilter || event.status === statusFilter)
        && (!ownerFilter || event.assignedTo === ownerFilter)
    })
  }, [allEvents, calendarFilter, conflictIds, nowTick, ownerFilter, query, quickFilter, snapshot, statusFilter, typeFilter])

  const monthDays = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const gridStart = startOfWeek(first)
    return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))
  }, [cursor])
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(cursor), index)), [cursor])
  const selectedEvents = filteredEvents.filter((event) => sameDay(new Date(event.startsAt), cursor))
  const selectedEvent = allEvents.find((event) => event.id === selectedId) ?? null
  const outcomeEvent = allEvents.find((event) => event.id === outcomeEventId) ?? null
  const outcomeActivity = snapshot?.activities.find((activity) => activity.id === outcomeActivityId)
    ?? snapshot?.activities.find((activity) => activity.sourceType === 'calendar' && activity.sourceId === outcomeEventId)
    ?? null
  const todayStart = startOfDay(new Date(nowTick))
  const todayEnd = endOfDay(new Date(nowTick))

  const stats = useMemo(() => {
    const nextWeek = addDays(todayEnd, 7).getTime()
    return {
      today: allEvents.filter((event) => event.status !== 'cancelled' && new Date(event.startsAt).getTime() >= todayStart.getTime() && new Date(event.startsAt).getTime() <= todayEnd.getTime()).length,
      upcoming: allEvents.filter((event) => !['cancelled', 'completed'].includes(event.status) && new Date(event.startsAt).getTime() > todayEnd.getTime() && new Date(event.startsAt).getTime() <= nextWeek).length,
      tentative: allEvents.filter((event) => event.status === 'tentative' && new Date(event.startsAt).getTime() >= todayStart.getTime()).length,
      overdue: allEvents.filter((event) => !['cancelled', 'completed'].includes(event.status) && new Date(event.endsAt).getTime() < nowTick).length,
      conflicts: conflictIds.size,
    }
  }, [allEvents, conflictIds.size, nowTick, todayEnd, todayStart])
  const activeFilterCount = [typeFilter, calendarFilter, statusFilter, ownerFilter, quickFilter].filter(Boolean).length
  const universalAgendaFilters: WorkspaceFilterField[] = [
    { key: 'quick', label: 'Atalho', value: quickFilter, allValue: '', allLabel: 'Qualquer período', group: 'Atalhos', options: [{ value: 'upcoming7', label: 'Próximos 7 dias' }, { value: 'conflicts', label: 'Conflitos' }, { value: 'overdue', label: 'Não concluídos' }] },
    { key: 'type', label: 'Tipo', value: typeFilter, allValue: '', allLabel: 'Todos', group: 'Evento', options: (Object.keys(agendaEventTypeLabel) as AgendaEventType[]).map((item) => ({ value: item, label: agendaEventTypeLabel[item] })) },
    { key: 'calendar', label: 'Agenda', value: calendarFilter, allValue: '', allLabel: 'Todas', group: 'Evento', options: (Object.keys(agendaCalendarLabel) as AgendaCalendar[]).map((item) => ({ value: item, label: agendaCalendarLabel[item] })) },
    { key: 'status', label: 'Status', value: statusFilter, allValue: '', allLabel: 'Todos', group: 'Evento', options: (Object.keys(statusLabel) as CalendarEventStatus[]).map((item) => ({ value: item, label: statusLabel[item] })) },
    { key: 'owner', label: 'Responsável', value: ownerFilter, allValue: '', allLabel: 'Todos', group: 'Responsabilidade', options: owners.map((owner) => ({ value: owner.id, label: owner.name })) },
  ]
  const changeAgendaQuickFilter = (key: string, value: string) => {
    if (key === 'quick') { setQuickFilter(value as QuickFilter); if (value) setStatusFilter('') }
    else if (key === 'type') setTypeFilter(value)
    else if (key === 'calendar') setCalendarFilter(value)
    else if (key === 'status') { setQuickFilter(''); setStatusFilter(value) }
    else if (key === 'owner') setOwnerFilter(value)
  }

  const availableSlots = useMemo(() => {
    const dayEvents = allEvents.filter((event) => !event.allDay && event.status !== 'cancelled' && sameDay(new Date(event.startsAt), cursor))
    const slots: Date[] = []
    for (let hour = dayStart; hour < dayEnd; hour += 1) {
      for (const minute of [0, 30]) {
        const start = new Date(cursor); start.setHours(hour, minute, 0, 0)
        const end = new Date(start); end.setMinutes(end.getMinutes() + 30)
        if (start.getTime() < Date.now() && sameDay(start, new Date())) continue
        if (!dayEvents.some((event) => eventsOverlap({ startsAt: start.toISOString(), endsAt: end.toISOString(), allDay: false, status: 'confirmed' }, event))) slots.push(start)
      }
      if (slots.length >= 6) break
    }
    return slots
  }, [allEvents, cursor, dayEnd, dayStart])

  const upcoming = useMemo(() => allEvents.filter((event) => !['cancelled', 'completed'].includes(event.status) && new Date(event.startsAt).getTime() >= nowTick).slice(0, 6), [allEvents, nowTick])

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  const enableNotifications = async () => {
    if (typeof Notification === 'undefined') { notify('info', 'Este navegador não oferece notificações da Agenda.'); return }
    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
    notify(permission === 'granted' ? 'success' : 'info', permission === 'granted' ? 'Lembretes da Agenda ativados.' : 'A permissão de notificações não foi concedida.')
  }

  const move = (direction: number) => {
    const next = new Date(cursor)
    if (view === 'year') next.setFullYear(next.getFullYear() + direction)
    else if (view === 'month') next.setMonth(next.getMonth() + direction)
    else if (view === 'week') next.setDate(next.getDate() + 7 * direction)
    else next.setDate(next.getDate() + direction)
    setCursor(next)
  }

  const title = view === 'year'
    ? String(cursor.getFullYear())
    : view === 'month'
      ? new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(cursor)
      : view === 'week'
        ? `${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(weekDays[0])} — ${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(weekDays[6])}`
        : new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(cursor)

  const openCreate = (date = cursor) => {
    const next = new Date(date)
    if (next.getHours() === 0 && next.getMinutes() === 0) next.setHours(9)
    setCreateDate(next)
  }

  const pointToDate = (day: Date, bounds: DOMRect, clientY: number) => {
    const minutesFromStart = Math.max(0, Math.min((dayEnd - dayStart) * 60, ((clientY - bounds.top) / HOUR_HEIGHT) * 60))
    const roundedMinutes = Math.round(minutesFromStart / 15) * 15
    const next = new Date(day)
    next.setHours(dayStart + Math.floor(roundedMinutes / 60), roundedMinutes % 60, 0, 0)
    return next
  }

  const createFromTimeline = (day: Date, event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('.timeline-event')) return
    setCursor(day)
    setCreateDate(pointToDate(day, event.currentTarget.getBoundingClientRect(), event.clientY))
  }

  const dragEvent = (eventId: string, event: DragEvent<HTMLElement>) => {
    setDraggingId(eventId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', eventId)
  }

  const reschedule = useCallback(async (eventId: string, target: Date) => {
    const event = allEvents.find((item) => item.id === eventId)
    if (!event) return
    try {
      await updateCalendarEvent(event.id, moveEventToDate(event, target))
      setSelectedId(event.id)
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Não foi possível reagendar.')
    } finally {
      setDraggingId(null)
    }
  }, [allEvents, notify, updateCalendarEvent])

  const dropOnDay = (day: Date, event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    const eventId = event.dataTransfer.getData('text/plain') || draggingId
    const source = allEvents.find((item) => item.id === eventId)
    if (!source || !eventId) return
    const target = new Date(day)
    const sourceStart = new Date(source.startsAt)
    target.setHours(sourceStart.getHours(), sourceStart.getMinutes(), 0, 0)
    void reschedule(eventId, target)
  }

  const dropOnTimeline = (day: Date, event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const eventId = event.dataTransfer.getData('text/plain') || draggingId
    if (!eventId) return
    const target = pointToDate(day, event.currentTarget.getBoundingClientRect(), event.clientY)
    void reschedule(eventId, target)
  }

  const quickStatus = async (event: CalendarEvent, status: CalendarEventStatus) => {
    if (status === 'completed' && event.leadId) {
      const activity = snapshot?.activities.find((item) => item.sourceType === 'calendar' && item.sourceId === event.id)
      if (activity && !activity.completedAt && activity.resolutionStatus !== 'completed') {
        setOutcomeActivityId(activity.id)
        setOutcomeEventId(event.id)
        return
      }
      if (!activity) {
        try {
          const created = await createActivity({
            leadId: event.leadId,
            contactId: event.contactId ?? null,
            type: 'meeting',
            title: `Registrar resultado · ${event.title || 'Reunião'}`,
            description: stripAgendaMetadata(event.description) || 'Resultado comercial solicitado ao concluir compromisso da Agenda.',
            dueAt: event.startsAt,
            completedAt: null,
            resolutionStatus: 'pending',
            resolutionReason: null,
            originEventKey: `calendar:${event.id}`,
            purpose: 'meeting_outcome',
            assignedTo: event.assignedTo ?? null,
          })
          setOutcomeActivityId(created.id)
          setOutcomeEventId(event.id)
          return
        } catch (error) {
          notify('error', error instanceof Error ? error.message : 'Não foi possível preparar o registro do resultado da reunião.')
          return
        }
      }
    }
    try { await updateCalendarEvent(event.id, { status }); setSelectedId(event.id) }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível atualizar o compromisso.') }
  }

  const clearFilters = () => { setQuery(''); setTypeFilter(''); setCalendarFilter(''); setStatusFilter(''); setOwnerFilter(''); setQuickFilter('') }
  const currentLine = currentTimePosition(dayStart, dayEnd)

  const renderEventButton = (event: CalendarEvent, compact = false) => {
    const type = inferAgendaEventType(event)
    const lead = snapshot?.leads.find((item) => item.id === event.leadId)
    return <button
      type="button"
      draggable={canWrite}
      className={`${compact ? 'calendar-event' : 'timeline-event'} ${compact ? `calendar-event--${event.status}` : `timeline-event--${event.status}`} agenda-event--${type} ${conflictIds.has(event.id) ? 'has-conflict' : ''} ${selectedId === event.id ? 'is-selected' : ''}`}
      style={compact ? undefined : eventPosition(event, dayStart, dayEnd)}
      key={event.id}
      onDragStart={(drag) => { if (canWrite) dragEvent(event.id, drag) }}
      onDragEnd={() => { if (canWrite) setDraggingId(null) }}
      onClick={(click) => { click.stopPropagation(); setSelectedId(event.id) }}
      onDoubleClick={(click) => { click.stopPropagation(); if (canWrite) setEditing(event) }}
    >
      <small>{event.allDay ? 'Dia todo' : compact ? formatTime(event.startsAt) : `${formatTime(event.startsAt)}${view === 'day' ? ` — ${formatTime(event.endsAt)}` : ''}`}</small>
      <strong>{event.title}</strong>
      {!compact ? <span>{lead?.name ?? agendaEventTypeLabel[type]}{event.location ? ` · ${event.location}` : ''}</span> : null}
      {conflictIds.has(event.id) ? <AlertTriangle className="agenda-event-conflict-icon" size={12} /> : null}
    </button>
  }

  return <div className={`page-stack agenda-page agenda-page--professional agenda-page-v10166 agenda-page-h20 ${filtersOpen ? 'agenda-page-v10166--filters-open' : ''}`}>
    <WorkspacePageHeader className="agenda-page-header-h20" eyebrow="Agenda comercial" title="Agenda" description="Compromissos, reuniões, ligações, tarefas e retornos em um único calendário operacional." icon={CalendarDays} actions={canWrite ? <Button onClick={() => openCreate()}><Plus size={17} /> Novo evento</Button> : null} />

    <WorkspaceSummaryStrip className="agenda-summary-strip-h20">
      <WorkspaceSummaryMetric label="Hoje" value={stats.today} meta="Compromissos do dia" icon={CalendarCheck2} tone="brand" active={view === 'day' && sameDay(cursor, new Date()) && !quickFilter} onClick={() => { setQuickFilter(''); setCursor(new Date()); setView('day') }} />
      <WorkspaceSummaryMetric label="Próximos 7 dias" value={stats.upcoming} meta="Agenda futura" icon={RotateCcw} tone="success" active={quickFilter === 'upcoming7'} onClick={() => { setQuickFilter('upcoming7'); setStatusFilter(''); setCursor(new Date()); setView('week') }} />
      <WorkspaceSummaryMetric label="Conflitos" value={stats.conflicts} meta="Horários sobrepostos" icon={AlertTriangle} tone={stats.conflicts ? 'warning' : 'success'} active={quickFilter === 'conflicts'} onClick={() => { setQuickFilter('conflicts'); setStatusFilter(''); setFiltersOpen(true) }} />
      <WorkspaceSummaryMetric label="Não concluídos" value={stats.overdue} meta="Eventos vencidos" icon={XCircle} tone={stats.overdue ? 'danger' : 'success'} active={quickFilter === 'overdue'} onClick={() => { setQuickFilter('overdue'); setStatusFilter(''); setFiltersOpen(true) }} />
    </WorkspaceSummaryStrip>

    <WorkspaceViewStrip className="agenda-period-view-strip-h20" value={view} onChange={setView} ariaLabel="Período da Agenda" items={[
      { id: 'year', label: 'Ano', icon: CalendarDays },
      { id: 'month', label: 'Mês', icon: CalendarCheck2 },
      { id: 'week', label: 'Semana', icon: RotateCcw },
      { id: 'day', label: 'Dia', icon: Clock3 },
    ] as const} />

    <WorkspaceCommandBar className="agenda-toolbar agenda-toolbar--professional agenda-toolbar-v10166 agenda-command-bar-h20">
      <WorkspaceCommandGroup className="agenda-toolbar__date">
        <Button variant="secondary" size="sm" onClick={() => setCursor(new Date())}>Hoje</Button>
        <button className="icon-button" type="button" onClick={() => move(-1)} aria-label="Anterior"><ChevronLeft size={18} /></button>
        <button className="icon-button" type="button" onClick={() => move(1)} aria-label="Próximo"><ChevronRight size={18} /></button>
        <strong>{title}</strong>
      </WorkspaceCommandGroup>
      <WorkspaceCommandGroup align="end" className="agenda-toolbar-v10166__actions">
        <label className="search-field search-field--small workspace-search-v10166"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar na agenda" /></label>
        <WorkspaceFilterMenu workspaceKey={`agenda:${snapshot?.workspace.id ?? 'local'}`} fields={universalAgendaFilters} activeCount={activeFilterCount} onOpenAdvanced={() => setFiltersOpen(true)} onClearAll={clearFilters} onChange={changeAgendaQuickFilter} />
        {notificationPermission !== 'granted' ? <Button variant="secondary" size="sm" onClick={() => void enableNotifications()}><Bell size={16} /> Lembretes</Button> : null}
        <Button variant="secondary" size="sm" onClick={() => navigate('settings', { filter: 'calendar' })}><ExternalLink size={16} /> Integrações</Button>
      </WorkspaceCommandGroup>
    </WorkspaceCommandBar>


    {activeFilterCount ? <div className="workspace-filter-chips-v10166 agenda-filter-chips-v10166">
      {quickFilter ? <button type="button" onClick={() => setQuickFilter('')}>{quickFilter === 'upcoming7' ? 'Próximos 7 dias' : quickFilter === 'conflicts' ? 'Conflitos' : 'Não concluídos'} ×</button> : null}
      {typeFilter ? <button type="button" onClick={() => setTypeFilter('')}>Tipo: {agendaEventTypeLabel[typeFilter as AgendaEventType]} ×</button> : null}
      {calendarFilter ? <button type="button" onClick={() => setCalendarFilter('')}>Agenda: {agendaCalendarLabel[calendarFilter as AgendaCalendar]} ×</button> : null}
      {statusFilter ? <button type="button" onClick={() => setStatusFilter('')}>Status: {statusLabel[statusFilter as CalendarEventStatus]} ×</button> : null}
      {ownerFilter ? <button type="button" onClick={() => setOwnerFilter('')}>Responsável: {ownerMap.get(ownerFilter) ?? 'Selecionado'} ×</button> : null}
      <button type="button" className="is-clear" onClick={clearFilters}>Limpar</button>
    </div> : null}

    {filtersOpen ? <aside className="workspace-settings-drawer-v10166 agenda-filter-drawer-v10166" aria-label="Filtros da agenda">
      <header><div><span>Agenda</span><strong>Filtros</strong></div><button type="button" onClick={() => setFiltersOpen(false)} aria-label="Fechar filtros">×</button></header>
      <div className="workspace-settings-drawer-v10166__body">
        <section><div className="workspace-settings-section-title-v10166"><strong>Atalhos</strong><span>Encontre rapidamente os compromissos que pedem atenção.</span></div><div className="workspace-quick-filter-grid-v10166">
          <button type="button" className={quickFilter === 'upcoming7' ? 'is-active' : ''} onClick={() => { setQuickFilter(quickFilter === 'upcoming7' ? '' : 'upcoming7'); setStatusFilter('') }}>Próximos 7 dias <span>{stats.upcoming}</span></button>
          <button type="button" className={statusFilter === 'tentative' ? 'is-active' : ''} onClick={() => { setQuickFilter(''); setStatusFilter(statusFilter === 'tentative' ? '' : 'tentative') }}>Aguardando confirmação <span>{stats.tentative}</span></button>
          <button type="button" className={quickFilter === 'conflicts' ? 'is-active' : ''} onClick={() => { setQuickFilter(quickFilter === 'conflicts' ? '' : 'conflicts'); setStatusFilter('') }}>Conflitos <span>{stats.conflicts}</span></button>
          <button type="button" className={quickFilter === 'overdue' ? 'is-active' : ''} onClick={() => { setQuickFilter(quickFilter === 'overdue' ? '' : 'overdue'); setStatusFilter('') }}>Não concluídos <span>{stats.overdue}</span></button>
        </div></section>
        <section><div className="workspace-settings-section-title-v10166"><strong>Refinar agenda</strong><span>Combine propriedades para reduzir o calendário ao contexto necessário.</span></div>
          <label className="field"><span>Tipo</span><NativeSelectionSelect value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">Todos</option>{(Object.keys(agendaEventTypeLabel) as AgendaEventType[]).map((item) => <option key={item} value={item}>{agendaEventTypeLabel[item]}</option>)}</NativeSelectionSelect></label>
          <label className="field"><span>Agenda</span><NativeSelectionSelect value={calendarFilter} onChange={(event) => setCalendarFilter(event.target.value)}><option value="">Todas</option>{(Object.keys(agendaCalendarLabel) as AgendaCalendar[]).map((item) => <option key={item} value={item}>{agendaCalendarLabel[item]}</option>)}</NativeSelectionSelect></label>
          <label className="field"><span>Status</span><NativeSelectionSelect value={statusFilter} onChange={(event) => { setQuickFilter(''); setStatusFilter(event.target.value) }}><option value="">Todos</option>{(Object.keys(statusLabel) as CalendarEventStatus[]).map((item) => <option key={item} value={item}>{statusLabel[item]}</option>)}</NativeSelectionSelect></label>
          <label className="field"><span>Responsável</span><NativeSelectionSelect value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}><option value="">Todos</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</NativeSelectionSelect></label>
        </section>
      </div>
      <footer><Button variant="secondary" onClick={clearFilters}>Limpar filtros</Button><Button onClick={() => setFiltersOpen(false)}>Concluir</Button></footer>
    </aside> : null}

    <section className="agenda-workspace-layout">
      <main className="agenda-workspace-main">
        {view === 'year' ? <section className="agenda-year-grid">{Array.from({ length: 12 }, (_, month) => {
          const monthDate = new Date(cursor.getFullYear(), month, 1)
          const gridStart = startOfWeek(monthDate)
          const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))
          const monthEvents = filteredEvents.filter((event) => new Date(event.startsAt).getFullYear() === cursor.getFullYear() && new Date(event.startsAt).getMonth() === month)
          return <button type="button" className="agenda-year-month panel" key={month} onClick={() => { setCursor(monthDate); setView('month') }}><header><strong>{new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(monthDate)}</strong><span>{monthEvents.length} evento(s)</span></header><div className="agenda-year-weekdays">{dayNames.map((day) => <small key={day}>{day.slice(0, 1)}</small>)}</div><div className="agenda-year-days">{days.map((day) => { const count = monthEvents.filter((event) => sameDay(new Date(event.startsAt), day)).length; return <span key={day.toISOString()} className={`${day.getMonth() !== month ? 'is-outside' : ''} ${sameDay(day, new Date()) ? 'is-today' : ''} ${count ? 'has-events' : ''}`}>{day.getDate()}{count ? <i>{Math.min(count, 9)}</i> : null}</span> })}</div></button>
        })}</section> : null}

        {view === 'month' ? <section className="panel calendar-month calendar-month--professional"><div className="calendar-month__weekdays">{dayNames.map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-month__grid">{monthDays.map((day) => {
          const dayEvents = filteredEvents.filter((event) => sameDay(new Date(event.startsAt), day))
          return <div role="button" tabIndex={0} className={`calendar-day ${day.getMonth() !== cursor.getMonth() ? 'is-outside' : ''} ${sameDay(day, new Date()) ? 'is-today' : ''}`} key={day.toISOString()} onDragOver={(event) => { if (canWrite) event.preventDefault() }} onDrop={(event) => { if (canWrite) dropOnDay(day, event) }} onClick={() => { setCursor(day); if (canWrite) openCreate(day) }} onKeyDown={(keyEvent) => { if (keyEvent.key === 'Enter' || keyEvent.key === ' ') { keyEvent.preventDefault(); setCursor(day); if (canWrite) openCreate(day) } }}><header><span>{day.getDate()}</span>{dayEvents.length ? <small>{dayEvents.length}</small> : null}</header><div>{dayEvents.slice(0, 4).map((event) => renderEventButton(event, true))}{dayEvents.length > 4 ? <button type="button" className="calendar-more" onClick={(click) => { click.stopPropagation(); setCursor(day); setView('day') }}>+{dayEvents.length - 4} compromisso(s)</button> : null}</div></div>
        })}</div></section> : null}

        {view === 'week' ? <section className="panel calendar-week-pro calendar-week-pro--professional">
          <div className="calendar-week-pro__header"><span className="calendar-week-pro__corner">Horário</span>{weekDays.map((day) => <button type="button" key={day.toISOString()} className={sameDay(day, new Date()) ? 'is-today' : ''} onClick={() => { setCursor(day); setView('day') }}><span>{formatDay(day)}</span><strong>{day.getDate()}</strong><small>{filteredEvents.filter((event) => sameDay(new Date(event.startsAt), day)).length} evento(s)</small></button>)}</div>
          <div className="calendar-week-pro__all-day"><span>Dia todo</span>{weekDays.map((day) => <div key={day.toISOString()} onDragOver={(event) => { if (canWrite) event.preventDefault() }} onDrop={(event) => { if (canWrite) dropOnDay(day, event) }}>{filteredEvents.filter((event) => event.allDay && sameDay(new Date(event.startsAt), day)).slice(0, 3).map((event) => <button type="button" draggable={canWrite} className={`all-day-event all-day-event--${event.status} agenda-event--${inferAgendaEventType(event)}`} key={event.id} onDragStart={(drag) => { if (canWrite) dragEvent(event.id, drag) }} onClick={() => setSelectedId(event.id)} onDoubleClick={() => { if (canWrite) setEditing(event) }}>{event.title}</button>)}</div>)}</div>
          <div className="calendar-week-pro__body">
            <div className="calendar-time-axis">{hours.map((hour) => <span key={hour}>{String(hour).padStart(2, '0')}:00</span>)}</div>
            {weekDays.map((day) => <div className={`calendar-timeline-day ${sameDay(day, new Date()) ? 'is-today' : ''}`} style={{ height: `${(dayEnd - dayStart + 1) * HOUR_HEIGHT}px` }} key={day.toISOString()} onDragOver={(event) => { if (canWrite) event.preventDefault() }} onDrop={(event) => { if (canWrite) dropOnTimeline(day, event) }} onClick={(event) => { if (canWrite) createFromTimeline(day, event) }}>{hours.map((hour) => <span className="calendar-hour-line" style={{ top: `${(hour - dayStart) * HOUR_HEIGHT}px` }} key={hour} />)}{sameDay(day, new Date()) && currentLine ? <span className="agenda-now-line" style={{ top: currentLine }} /> : null}{filteredEvents.filter((event) => !event.allDay && sameDay(new Date(event.startsAt), day)).map((event) => renderEventButton(event))}</div>)}
          </div>
        </section> : null}

        {view === 'day' ? <section className="panel day-timeline-pro day-timeline-pro--professional">
          <div className="panel__heading"><div><span className="eyebrow">Agenda do dia</span><h3>{selectedEvents.length} compromisso(s) · {formatLongDate(cursor.toISOString())}</h3></div>{canWrite ? <Button size="sm" onClick={() => openCreate(cursor)}><Plus size={16} /> Adicionar</Button> : null}</div>
          {selectedEvents.some((event) => event.allDay) ? <div className="day-all-day-events"><span>Dia todo</span><div>{selectedEvents.filter((event) => event.allDay).map((event) => <button type="button" draggable={canWrite} className={`all-day-event all-day-event--${event.status} agenda-event--${inferAgendaEventType(event)}`} key={event.id} onDragStart={(drag) => { if (canWrite) dragEvent(event.id, drag) }} onClick={() => setSelectedId(event.id)} onDoubleClick={() => { if (canWrite) setEditing(event) }}>{event.title}</button>)}</div></div> : null}
          <div className="day-timeline-pro__grid"><div className="calendar-time-axis">{hours.map((hour) => <span key={hour}>{String(hour).padStart(2, '0')}:00</span>)}</div><div className="calendar-timeline-day calendar-timeline-day--single" style={{ height: `${(dayEnd - dayStart + 1) * HOUR_HEIGHT}px` }} onDragOver={(event) => { if (canWrite) event.preventDefault() }} onDrop={(event) => { if (canWrite) dropOnTimeline(cursor, event) }} onClick={(event) => { if (canWrite) createFromTimeline(cursor, event) }}>{hours.map((hour) => <span className="calendar-hour-line" style={{ top: `${(hour - dayStart) * HOUR_HEIGHT}px` }} key={hour} />)}{sameDay(cursor, new Date()) && currentLine ? <span className="agenda-now-line" style={{ top: currentLine }} /> : null}{selectedEvents.filter((event) => !event.allDay).map((event) => renderEventButton(event))}</div></div>
        </section> : null}
      </main>

      <aside className="panel agenda-inspector">
        {selectedEvent ? (() => {
          const type = inferAgendaEventType(selectedEvent)
          const calendar = inferAgendaCalendar(selectedEvent)
          const lead = snapshot?.leads.find((item) => item.id === selectedEvent.leadId)
          const stage = snapshot?.stages.find((item) => item.id === lead?.stageId)
          const metadata = readAgendaMetadata(selectedEvent)
          const callTarget = lead ? resolveLeadCallTarget(lead, snapshot?.contacts ?? []) : null
          const eventConflicts = allEvents.filter((item) => item.id !== selectedEvent.id && !['cancelled', 'completed'].includes(item.status) && new Date(item.endsAt).getTime() >= nowTick && eventsOverlap(selectedEvent, item))
          return <>
            <header className="agenda-inspector__header"><div><span className={`agenda-type-badge agenda-type-badge--${type}`}>{agendaEventTypeLabel[type]}</span><span className={`agenda-status-badge agenda-status-badge--${selectedEvent.status}`}>{statusLabel[selectedEvent.status]}</span></div><button className="icon-button" type="button" onClick={() => { setSelectedId(null); if (routeContext.eventId) clearRouteContext(['eventId']) }} aria-label="Fechar detalhes"><XCircle size={18} /></button></header>
            <h3>{selectedEvent.title}</h3>
            <div className="agenda-inspector__time"><CalendarDays size={17} /><div><strong>{formatLongDate(selectedEvent.startsAt)}</strong><span>{selectedEvent.allDay ? 'Dia inteiro' : `${formatTime(selectedEvent.startsAt)} — ${formatTime(selectedEvent.endsAt)} · ${minutesBetween(new Date(selectedEvent.startsAt), new Date(selectedEvent.endsAt))} min`}</span></div></div>
            {lead ? <button type="button" className="agenda-lead-link" onClick={() => lead && navigate('leads', { leadId: lead.id })}><UserRound size={17} /><div><strong>{lead.name}</strong><span>{lead.company || lead.city || 'Contato relacionado'}{stage ? ` · ${stage.name}` : ''}</span></div><ExternalLink size={14} /></button> : null}
            {selectedEvent.location ? <a className="agenda-location-link" href={selectedEvent.location.startsWith('http') ? selectedEvent.location : undefined} target="_blank" rel="noreferrer"><MapPin size={17} /><span>{selectedEvent.location}</span>{selectedEvent.location.startsWith('http') ? <ExternalLink size={14} /> : null}</a> : null}
            {stripAgendaMetadata(selectedEvent.description) ? <div className="agenda-inspector__description"><span>Pauta e contexto</span><p>{stripAgendaMetadata(selectedEvent.description)}</p></div> : null}
            <dl className="agenda-inspector__meta"><div><dt>Agenda</dt><dd>{agendaCalendarLabel[calendar]}</dd></div><div><dt>Responsável</dt><dd>{selectedEvent.assignedTo ? ownerMap.get(selectedEvent.assignedTo) ?? 'Membro da equipe' : 'Não definido'}</dd></div><div><dt>Lembrete</dt><dd>{agendaReminderLabel(agendaReminderMinutes(selectedEvent))}</dd></div>{metadata?.recurrenceId ? <div><dt>Série</dt><dd>{metadata.recurrenceIndex}/{metadata.recurrenceTotal}</dd></div> : null}</dl>
            {eventConflicts.length ? <div className="agenda-conflict-list"><AlertTriangle size={17} /><div><strong>Conflito de horário</strong><span>{eventConflicts.slice(0, 3).map((item) => item.title).join(', ')}</span></div></div> : null}
            {canWrite ? <div className="agenda-inspector__actions"><Button variant="secondary" onClick={() => setEditing(selectedEvent)}>Editar</Button>{selectedEvent.status !== 'confirmed' ? <Button variant="secondary" onClick={() => void quickStatus(selectedEvent, 'confirmed')}><CalendarCheck2 size={16} /> Confirmar</Button> : null}{selectedEvent.status !== 'completed' ? <Button onClick={() => void quickStatus(selectedEvent, 'completed')}><CheckCircle2 size={16} /> Concluir</Button> : null}{selectedEvent.status !== 'cancelled' ? <Button variant="danger" onClick={() => void quickStatus(selectedEvent, 'cancelled')}><XCircle size={16} /> Cancelar</Button> : null}</div> : null}
            {canWrite && lead && callTarget?.phone ? <button type="button" className={`agenda-call-action ${lead.doNotContact ? 'is-disabled' : ''}`} disabled={lead.doNotContact} onClick={() => { const blocked = contactBlockedMessage(lead, 'call'); if (blocked) { notify('info', blocked); return }; setCallLead(lead) }} title={lead.doNotContact ? (contactBlockedMessage(lead, 'call') ?? undefined) : 'Abrir Central de Ligações'}><Phone size={17} /> {lead.doNotContact ? `Contato bloqueado — ${lead.name}` : `Ligar para ${callTarget.name}`}</button> : null}
          </>
        })() : <>
          <span className="eyebrow">Visão do dia</span><h3>{formatLongDate(cursor.toISOString())}</h3>
          <div className="agenda-inspector-summary"><div><strong>{selectedEvents.filter((event) => event.status !== 'cancelled').length}</strong><span>compromissos</span></div><div><strong>{availableSlots.length}</strong><span>horários livres</span></div></div>
          <section className="agenda-free-slots"><header><div><Clock3 size={16} /><strong>Próximos horários livres</strong></div><small>30 minutos</small></header>{availableSlots.length ? <div>{availableSlots.map((slot) => <button type="button" key={slot.toISOString()} onClick={() => openCreate(slot)}>{new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(slot)}<Plus size={14} /></button>)}</div> : <p>Não há horários livres no período comercial.</p>}</section>
          <section className="agenda-upcoming-list"><header><strong>Próximos compromissos</strong><span>{upcoming.length}</span></header>{upcoming.map((event) => <button type="button" key={event.id} onClick={() => setSelectedId(event.id)}><span className={`agenda-type-dot agenda-type-dot--${inferAgendaEventType(event)}`} /><div><strong>{event.title}</strong><small>{formatDate(event.startsAt)} · {formatTime(event.startsAt)}</small></div></button>)}</section>
        </>}
      </aside>
    </section>

    <EventModal open={canWrite && Boolean(createDate)} initialDate={createDate} initialLeadId={routeContext.action === 'create-meeting' ? routeContext.leadId ?? '' : ''} onClose={() => { setCreateDate(null); if (routeContext.action === 'create-meeting') clearRouteContext(['action', 'leadId']) }} />
    <EventModal open={canWrite && Boolean(editing)} event={editing} onClose={() => setEditing(null)} />
    <OutcomeModal mode="meeting" activity={canWrite ? outcomeActivity : null} onClose={() => { setOutcomeEventId(null); setOutcomeActivityId(null) }} onFinished={async () => { if (outcomeEvent) { await updateCalendarEvent(outcomeEvent.id, { status: 'completed' }); setSelectedId(outcomeEvent.id) } setOutcomeActivityId(null) }} />
    <LazyCallWorkspaceModal open={Boolean(callLead)} config={callLead ? buildQuickCallSessionConfig({ snapshot, initialLeadId: callLead.id, leadIds: [callLead.id] }) : null} onClose={() => setCallLead(null)} />
  </div>
}
