import {
  ArrowRight,
  CalendarCheck2,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Flame,
  History,
  ListTodo,
  MessageCircle,
  PhoneCall,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  TriangleAlert,
  UserRoundPlus,
  UsersRound,
  WalletCards,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAppActions, useAppNavigation, useAppUi, useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { FilterSelection } from '../../components/selection'
import { formatCurrency, formatDateTime } from '../../domain/formatters'
import type { Lead } from '../../domain/types'
import { goalMetricLabels, goalProgress } from '../../services/metrics'
import { contactBlockedMessage } from '../../services/contact-policy'
import { resolveLeadCallTarget } from '../../services/call-workspace'
import { buildLeadScoreBoard, type LeadScoreInsight } from '../../services/lead-scoring'
import { buildWorkdayQueue, type WorkdayItem, type WorkdayReason } from '../../services/workday'
import { buildDealPortfolio, type DealIntelligence } from '../../services/deal-intelligence'
import { calculateRevenueIntelligence } from '../../services/revenue-intelligence'
import { readFollowupMetadata } from '../../services/followup-workspace'
import { DealPortfolioPanel } from '../deal-intelligence/deal-portfolio-panel'
import { DealHealthPanel } from '../deal-intelligence/deal-health-panel'
import { usePreferences } from '../settings/preferences-context'
import { LazyCallWorkspaceModal } from '../calls/lazy-call-workspace-modal'
import { buildQuickCallSessionConfig } from '../calls/call-session-config'
import { ActivityModal } from '../followups/activity-modal'
import { EditLeadModal } from '../leads/edit-lead-modal'
import { useAuth } from '../auth/auth-context'
import { useExperience } from '../experience/experience-context'
import { SalesMessageModal } from '../pipeline/sales-message-modal'

const startOfDay = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const dayDiff = (newer: Date, older: Date) => Math.floor((newer.getTime() - older.getTime()) / 86_400_000)
const sameDay = (first: Date, second: Date) => first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate()
const normalizeContact = (value: string) => value.toLowerCase().replace(/\D/g, '')

export function DashboardPage() {
  const { snapshot } = useAppWorkspace()
  const { setRoute, navigate } = useAppNavigation()
  const { notify } = useAppUi()
  const { refresh } = useAppActions()
  const { preferences: settingsPreferences } = usePreferences()
  const { preferences: experiencePreferences, updatePage } = useExperience()
  const { user } = useAuth()
  const [showMobileRoutine, setShowMobileRoutine] = useState(false)
  const [queueFilter, setQueueFilter] = useState<'all' | WorkdayReason>('all')
  const [dayTab, setDayTab] = useState<'overview' | 'meetings' | 'tasks' | 'deals' | 'metrics' | 'activities'>('overview')
  const [glanceOpen, setGlanceOpen] = useState(false)
  const queueScope = experiencePreferences.pages.dashboard?.dataScope ?? 'mine'
  const setQueueScope = (scope: 'mine' | 'team') => updatePage('dashboard', { dataScope: scope })
  const [callLead, setCallLead] = useState<Lead | null>(null)
  const [activityLead, setActivityLead] = useState<Lead | null>(null)
  const [editingLead, setEditingLead] = useState<Lead | null>(null)
  const [messageLead, setMessageLead] = useState<Lead | null>(null)

  useEffect(() => {
    const updateVisibility = () => setShowMobileRoutine(window.scrollY > 420)
    updateVisibility()
    window.addEventListener('scroll', updateVisibility, { passive: true })
    return () => window.removeEventListener('scroll', updateVisibility)
  }, [])

  const dashboard = useMemo(() => {
    const now = new Date()
    const todayStart = startOfDay(now)
    const leads = snapshot?.leads ?? []
    const activities = snapshot?.activities ?? []
    const calls = snapshot?.calls ?? []
    const goals = snapshot?.goals ?? []
    const stages = snapshot?.stages ?? []
    const activeLeads = leads.filter((lead) => lead.status === 'active')
    const pendingActivities = activities.filter((activity) => { if (!activity.dueAt || activity.completedAt || ['cancelled', 'superseded'].includes(activity.resolutionStatus ?? '')) return false; const meta = readFollowupMetadata(activity); return !(meta?.kind === 'cadence-step' && meta.cadenceState === 'paused' && (!meta.resumeAt || new Date(meta.resumeAt).getTime() > now.getTime())) })
    const overdueActivities = pendingActivities.filter((activity) => new Date(activity.dueAt!) < todayStart)
    const workday = snapshot ? buildWorkdayQueue(snapshot, settingsPreferences.commercial, now, queueScope === 'mine' ? user?.id : undefined) : { items: [], breached: 0, dueToday: 0, stale: 0, noAction: 0 }
    const scoreBoard = snapshot ? buildLeadScoreBoard(snapshot, settingsPreferences.commercial.leadScoring, now, queueScope === 'mine' ? user?.id : undefined) : []
    const dealPortfolio = snapshot && settingsPreferences.commercial.dealIntelligence.enabled ? buildDealPortfolio(snapshot, settingsPreferences.commercial.dealIntelligence, now, queueScope === 'mine' ? user?.id : undefined) : null
    const revenueIntelligence = snapshot ? calculateRevenueIntelligence(snapshot, now, queueScope === 'mine' ? user?.id : undefined) : null
    const recommended = scoreBoard[0] ?? null
    const scoreAlerts = scoreBoard.reduce((sum, item) => sum + item.alerts.length, 0)
    const criticalScores = scoreBoard.filter((item) => item.level === 'urgent').length
    const highScores = scoreBoard.filter((item) => item.level === 'high' || item.level === 'urgent').length
    const averageScore = scoreBoard.length ? Math.round(scoreBoard.reduce((sum, item) => sum + item.score, 0) / scoreBoard.length) : 0

    const proposalStages = new Set(stages.filter((stage) => /proposta|negocia|decis/i.test(stage.name)).map((stage) => stage.id))
    const stale = activeLeads.filter((lead) => dayDiff(now, new Date(lead.updatedAt)) >= 7)
    const proposalsWaiting = activeLeads.filter((lead) => proposalStages.has(lead.stageId) && dayDiff(now, new Date(lead.updatedAt)) >= 5)
    const hotWithoutAction = activeLeads.filter((lead) => lead.temperature === 'hot' && !lead.nextActionAt)
    const overdueLeadIds = new Set(overdueActivities.map((activity) => activity.leadId).filter(Boolean))
    const overdueLeads = activeLeads.filter((lead) => overdueLeadIds.has(lead.id))
    const riskLeads = Array.from(new Map([...stale, ...proposalsWaiting, ...hotWithoutAction, ...overdueLeads].map((lead) => [lead.id, lead])).values())

    const currentGoal = goals
      .filter((goal) => new Date(`${goal.periodStart}T00:00:00`) <= now && new Date(`${goal.periodEnd}T23:59:59`) >= now)
      .sort((a, b) => (a.metric === 'revenue' ? -1 : b.metric === 'revenue' ? 1 : a.periodEnd.localeCompare(b.periodEnd)))[0] ?? null
    const currentGoalProgress = snapshot && currentGoal
      ? goalProgress(snapshot, currentGoal.metric, currentGoal.targetValue, currentGoal.periodStart, currentGoal.periodEnd, currentGoal.userId)
      : null
    const daysRemaining = currentGoal ? Math.max(0, dayDiff(new Date(`${currentGoal.periodEnd}T23:59:59`), now)) : 0

    const recentSevenStart = new Date(todayStart); recentSevenStart.setDate(recentSevenStart.getDate() - 6)
    const previousSevenStart = new Date(recentSevenStart); previousSevenStart.setDate(previousSevenStart.getDate() - 7)
    const newThisWeek = leads.filter((lead) => new Date(lead.createdAt) >= recentSevenStart).length
    const newPreviousWeek = leads.filter((lead) => {
      const created = new Date(lead.createdAt)
      return created >= previousSevenStart && created < recentSevenStart
    }).length
    const leadTrend = newThisWeek - newPreviousWeek


    const latestLeads = [...activeLeads].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 3)
    const pipelineValue = activeLeads.reduce((sum, lead) => sum + lead.value, 0)
    const weightedPipeline = activeLeads.reduce((sum, lead) => {
      const probability = stages.find((stage) => stage.id === lead.stageId)?.probability ?? 0
      return sum + lead.value * probability / 100
    }, 0)
    const contactsToday = calls.filter((call) => sameDay(new Date(call.startedAt), now) && ['answered', 'callback_requested', 'interested', 'meeting_scheduled', 'proposal_requested', 'proposal_sent', 'sale_completed'].includes(call.outcome)).length
    const activitiesToday = pendingActivities.filter((activity) => activity.dueAt && sameDay(new Date(activity.dueAt), now)).length
    const meetingsToday = pendingActivities.filter((activity) => activity.type === 'meeting' && activity.dueAt && sameDay(new Date(activity.dueAt), now)).length
    const riskValue = riskLeads.reduce((sum, lead) => sum + lead.value, 0)

    return {
      activeLeads,
      pipelineValue,
      weightedPipeline,
      recommended,
      riskLeads,
      stale,
      proposalsWaiting,
      hotWithoutAction,
      overdueLeads,
      currentGoal,
      currentGoalProgress,
      daysRemaining,
      leadTrend,
      latestLeads,
      contactsToday,
      activitiesToday,
      meetingsToday,
      riskValue,
      workday,
      scoreBoard,
      scoreAlerts,
      criticalScores,
      highScores,
      averageScore,
      dealPortfolio,
      revenueIntelligence,
    }
  }, [queueScope, settingsPreferences.commercial, snapshot, user?.id])

  const greeting = new Date().getHours() >= 18 ? 'Boa noite' : new Date().getHours() >= 12 ? 'Boa tarde' : 'Bom dia'
  const firstName = user?.displayName?.trim().split(/\s+/)[0] || ''
  const todayLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date())
  const recommendedLead = dashboard.recommended?.lead ?? null

  const openWhatsApp = (lead = recommendedLead) => {
    const blocked = contactBlockedMessage(lead, 'whatsapp')
    if (blocked) { notify('info', blocked); return }
    const phone = lead?.phone ? normalizeContact(lead.phone) : ''
    if (!phone || !lead) { notify('info', 'Este contato não possui telefone cadastrado.'); return }
    setMessageLead(lead)
  }

  const filteredWorkday = dashboard.workday.items.filter((item) => queueFilter === 'all' || item.reasons.includes(queueFilter))
  const openCall = (lead: Lead) => {
    const blocked = contactBlockedMessage(lead, 'call')
    if (blocked) { notify('info', blocked); return false }
    const target = resolveLeadCallTarget(lead, snapshot?.contacts ?? [])
    if (!target.phone) { notify('info', 'Nenhum telefone disponível para contato nesta conta.'); return false }
    setCallLead(lead)
    return true
  }

  const runScoreAction = (item: LeadScoreInsight) => {
    const action = item.nextBestAction
    if (action.kind === 'call') { openCall(item.lead); return }
    if (action.kind === 'whatsapp') { openWhatsApp(item.lead); return }
    if (action.kind === 'followup') { setActivityLead(item.lead); return }
    if (action.kind === 'data' || action.kind === 'review') { setEditingLead(item.lead); return }
    setRoute(action.route)
  }
  const runWorkdayItem = (item: WorkdayItem) => {
    if (item.action === 'call') openCall(item.lead)
    else if (item.action === 'whatsapp') openWhatsApp(item.lead)
    else if (item.action === 'meeting') navigate('agenda', { leadId: item.lead.id, action: 'create-meeting' })
    else if (item.action === 'review' || item.action === 'data') setEditingLead(item.lead)
    else setActivityLead(item.lead)
  }

  const runDealAction = (deal: DealIntelligence) => {
    const action = deal.nextBestAction
    if (action.kind === 'call') { openCall(deal.lead); return }
    if (action.kind === 'followup') { setActivityLead(deal.lead); return }
    if (action.kind === 'meeting') { navigate('agenda', { leadId: deal.lead.id, action: 'create-meeting' }); return }
    if (action.kind === 'map_stakeholder') { navigate('leads', { leadId: deal.lead.id, action: 'account360' }); return }
    if (action.kind === 'proposal') { navigate('proposals', { leadId: deal.lead.id, action: 'create-proposal' }); return }
    if (action.kind === 'review_proposal' && deal.proposal) { navigate('proposals', { leadId: deal.lead.id, proposalId: deal.proposal.id }); return }
    navigate('pipeline', { leadId: deal.lead.id })
  }

  return (
    <div className="page-stack dashboard-v10051">
      <section className={`myday-v1016 ${glanceOpen ? 'is-glance-open-v10173' : 'is-glance-collapsed-v10173'}`}>
        <div className="myday-v1016__main">
          <header className="myday-v1016__hero">
            <div><span className="eyebrow"><Sparkles size={15}/> {todayLabel}</span><h2>{greeting}{firstName ? `, ${firstName}` : ''}.</h2><p>Seu pipeline tem próximos passos prontos. Comece pelo que move receita e relacionamento hoje.</p></div>
            <div><Button disabled={!dashboard.workday.items.length} onClick={() => dashboard.workday.items[0] && runWorkdayItem(dashboard.workday.items[0])}><Zap size={17}/> Começar próxima ação</Button><button className={`icon-action ${glanceOpen ? 'is-active' : ''}`} type="button" title={glanceOpen ? 'Ocultar resumo do dia' : 'Abrir resumo do dia'} aria-pressed={glanceOpen} onClick={() => setGlanceOpen((current) => !current)}><History size={18}/></button><button className="icon-action" type="button" title="Atualizar prioridades" onClick={() => void refresh()}><RefreshCw size={18}/></button></div>
          </header>
          <div className="myday-selection-strip-v101105" aria-label="Escopo do Meu Dia"><span>Escopo</span><FilterSelection label="Escopo" value={queueScope} onValueChange={(value) => setQueueScope(value as 'mine' | 'team')} options={[{ value: 'mine', label: 'Meus itens' }, { value: 'team', label: 'Equipe' }]} /></div>

          <div className="myday-v1016__starters">
            <button type="button" onClick={() => navigate('leads', { action: 'create-lead' })}><span><UserRoundPlus size={18}/></span><div><strong>Criar um novo contato</strong><small>Adicione uma pessoa e já defina responsável, etapa e próxima ação.</small></div><ArrowRight size={16}/></button>
            <button type="button" disabled={!dashboard.workday.items.length} onClick={() => dashboard.workday.items[0] && runWorkdayItem(dashboard.workday.items[0])}><span><Zap size={18}/></span><div><strong>Executar a prioridade mais importante</strong><small>{dashboard.workday.items[0]?.title ?? 'Nenhuma prioridade crítica agora.'}</small></div><ArrowRight size={16}/></button>
          </div>

          <div className="myday-v1016__cards">
            <button type="button" onClick={() => setRoute('agenda')}><CalendarCheck2 size={18}/><strong>Preparação para reunião</strong><span>{dashboard.meetingsToday ? `${dashboard.meetingsToday} reunião(ões) hoje` : 'Nenhuma reunião hoje'}</span></button>
            <button type="button" onClick={() => setRoute('followups')}><ListTodo size={18}/><strong>Follow-ups e tarefas</strong><span>{dashboard.activitiesToday} atividade(s) previstas</span></button>
            <button type="button" onClick={() => setRoute('calls')}><PhoneCall size={18}/><strong>Contatos do dia</strong><span>{dashboard.contactsToday} interação(ões) concluída(s)</span></button>
          </div>

          <section className="health-strip" aria-label="Resumo do dia">
            <button type="button" className="health-item" onClick={() => setRoute('followups')}><span className="health-item__icon"><ListTodo size={19}/></span><span><small>Prioridades</small><strong>{dashboard.workday.items.length}</strong><em>{dashboard.workday.dueToday} vencem hoje</em></span><ChevronRight size={16}/></button>
            <button type="button" className={`health-item ${dashboard.workday.breached ? 'health-item--danger' : ''}`} onClick={() => setRoute('followups')}><span className="health-item__icon"><Clock3 size={19}/></span><span><small>Em atraso</small><strong>{dashboard.workday.breached}</strong><em>{dashboard.workday.breached ? 'Resolver primeiro' : 'Nenhum SLA vencido'}</em></span><ChevronRight size={16}/></button>
            <button type="button" className="health-item" onClick={() => setRoute('pipeline')}><span className="health-item__icon"><CircleDollarSign size={19}/></span><span><small>Pipeline</small><strong>{formatCurrency(dashboard.pipelineValue)}</strong><em>{formatCurrency(dashboard.riskValue)} em risco</em></span><ChevronRight size={16}/></button>
            <button type="button" className="health-item" onClick={() => setRoute('goals')}><span className="health-item__icon"><Target size={19}/></span><span><small>Meta atual</small><strong>{dashboard.currentGoalProgress?.percentage ?? 0}%</strong><em>{dashboard.currentGoal ? `${dashboard.daysRemaining} dias restantes` : 'Configure uma meta'}</em></span><ChevronRight size={16}/></button>
          </section>
        </div>

        {glanceOpen ? <aside className="myday-v1016__glance">
          <header><h3>Seu dia em um relance</h3><span>{todayLabel}</span></header>
          <nav aria-label="Resumo do dia">{([['overview','Visão geral'],['meetings','Reuniões'],['tasks','Tarefas'],['deals','Negócios'],['metrics','Métrica'],['activities','Atividades']] as const).map(([id,label]) => <button type="button" key={id} className={dayTab===id?'is-active':''} onClick={() => setDayTab(id)}>{label}</button>)}</nav>
          {dayTab === 'overview' ? <div className="myday-v1016__glance-stats"><div><strong>{dashboard.meetingsToday}</strong><span>Reuniões</span></div><div><strong>{dashboard.activitiesToday}</strong><span>Tarefas que vencem hoje</span></div><div><strong>{dashboard.contactsToday}</strong><span>Atividades concluídas</span></div></div> : null}
          {dayTab === 'meetings' ? <div className="myday-v1016__glance-list">{snapshot?.events.filter((item) => item.status !== 'cancelled' && sameDay(new Date(item.startsAt), new Date())).slice(0,6).map((item) => <button type="button" key={item.id} onClick={() => navigate('agenda', { eventId: item.id })}><CalendarCheck2 size={15}/><span><strong>{item.title}</strong><small>{formatDateTime(item.startsAt)}</small></span></button>)}{!dashboard.meetingsToday ? <p>Nenhuma reunião programada para hoje.</p> : null}</div> : null}
          {dayTab === 'tasks' ? <div className="myday-v1016__glance-list">{dashboard.workday.items.slice(0,6).map((item) => <button type="button" key={item.id} onClick={() => runWorkdayItem(item)}><ListTodo size={15}/><span><strong>{item.title}</strong><small>{item.lead.name}</small></span></button>)}</div> : null}
          {dayTab === 'deals' ? <div className="myday-v1016__glance-stats"><div><strong>{formatCurrency(dashboard.pipelineValue)}</strong><span>Pipeline ativo</span></div><div><strong>{formatCurrency(dashboard.weightedPipeline)}</strong><span>Previsão ponderada</span></div><div><strong>{dashboard.riskLeads.length}</strong><span>Negócios em atenção</span></div></div> : null}
          {dayTab === 'metrics' ? <div className="myday-v1016__glance-stats"><div><strong>{dashboard.currentGoalProgress?.percentage ?? 0}%</strong><span>Meta atual</span></div><div><strong>{dashboard.averageScore}</strong><span>Score médio</span></div><div><strong>{dashboard.highScores}</strong><span>Alta prioridade</span></div></div> : null}
          {dayTab === 'activities' ? <div className="myday-v1016__glance-list">{(snapshot?.activities ?? []).filter((item) => sameDay(new Date(item.completedAt ?? item.createdAt), new Date())).sort((a,b) => new Date(b.completedAt ?? b.createdAt).getTime() - new Date(a.completedAt ?? a.createdAt).getTime()).slice(0,6).map((item) => <button type="button" key={item.id} onClick={() => item.leadId ? navigate('leads', { leadId: item.leadId, action: 'contact-record' }) : setRoute('followups')}><CheckCircle2 size={15}/><span><strong>{item.title}</strong><small>{item.completedAt ? `Concluída ${formatDateTime(item.completedAt)}` : formatDateTime(item.createdAt)}</small></span></button>)}{!(snapshot?.activities ?? []).some((item) => sameDay(new Date(item.completedAt ?? item.createdAt), new Date())) ? <p>Nenhuma atividade registrada hoje.</p> : null}</div> : null}
        </aside> : null}
      </section>


      {/* V101.6.2: Meu Dia bloqueado. Analytics profundos permanecem nos módulos especializados. */}
      <LazyCallWorkspaceModal open={Boolean(callLead)} config={callLead ? buildQuickCallSessionConfig({ snapshot, initialLeadId: callLead.id, leadIds: filteredWorkday.map((item) => item.lead.id) }) : null} onClose={() => setCallLead(null)} />
      <ActivityModal open={Boolean(activityLead)} initialLeadId={activityLead?.id ?? ''} initialType="followup" initialTitle={activityLead ? `Retomar contato — ${activityLead.name}` : ''} onClose={() => setActivityLead(null)} />
      <EditLeadModal lead={editingLead} open={Boolean(editingLead)} onClose={() => setEditingLead(null)} />
      <SalesMessageModal lead={messageLead} stageName={snapshot?.stages.find((stage) => stage.id === messageLead?.stageId)?.name ?? 'Meu Dia'} open={Boolean(messageLead)} onClose={() => setMessageLead(null)} />
    </div>
  )
}
