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
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { formatCurrency, formatDateTime } from '../../domain/formatters'
import type { Lead } from '../../domain/types'
import { goalMetricLabels, goalProgress } from '../../services/metrics'
import { buildLeadScoreBoard, type LeadScoreInsight } from '../../services/lead-scoring'
import { buildWorkdayQueue, type WorkdayItem, type WorkdayReason } from '../../services/workday'
import { usePreferences } from '../settings/preferences-context'
import { CallWorkspaceModal } from '../calls/call-workspace-modal'
import { ActivityModal } from '../followups/activity-modal'
import { EditLeadModal } from '../leads/edit-lead-modal'
import { useAuth } from '../auth/auth-context'
import { useExperience } from '../experience/experience-context'

const startOfDay = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const dayDiff = (newer: Date, older: Date) => Math.floor((newer.getTime() - older.getTime()) / 86_400_000)
const sameDay = (first: Date, second: Date) => first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate()
const normalizeContact = (value: string) => value.toLowerCase().replace(/\D/g, '')

export function DashboardPage() {
  const { snapshot, setRoute, notify, refresh } = useApp()
  const { preferences: settingsPreferences } = usePreferences()
  const { preferences: experiencePreferences, updatePage } = useExperience()
  const { user } = useAuth()
  const [showMobileRoutine, setShowMobileRoutine] = useState(false)
  const [queueFilter, setQueueFilter] = useState<'all' | WorkdayReason>('all')
  const queueScope = experiencePreferences.pages.dashboard?.dataScope ?? 'mine'
  const setQueueScope = (scope: 'mine' | 'team') => updatePage('dashboard', { dataScope: scope })
  const [callLead, setCallLead] = useState<Lead | null>(null)
  const [activityLead, setActivityLead] = useState<Lead | null>(null)
  const [editingLead, setEditingLead] = useState<Lead | null>(null)

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
    const pendingActivities = activities.filter((activity) => activity.dueAt && !activity.completedAt)
    const overdueActivities = pendingActivities.filter((activity) => new Date(activity.dueAt!) < todayStart)
    const workday = snapshot ? buildWorkdayQueue(snapshot, settingsPreferences.commercial, now, queueScope === 'mine' ? user?.id : undefined) : { items: [], breached: 0, dueToday: 0, stale: 0, noAction: 0 }
    const scoreBoard = snapshot ? buildLeadScoreBoard(snapshot, settingsPreferences.commercial.leadScoring, now, queueScope === 'mine' ? user?.id : undefined) : []
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
    }
  }, [queueScope, settingsPreferences.commercial, snapshot, user?.id])

  const greeting = new Date().getHours() >= 18 ? 'Boa noite' : new Date().getHours() >= 12 ? 'Boa tarde' : 'Bom dia'
  const firstName = user?.displayName?.trim().split(/\s+/)[0] || ''
  const todayLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date())
  const recommendedLead = dashboard.recommended?.lead ?? null
  const recommendedPhone = recommendedLead?.phone ? normalizeContact(recommendedLead.phone) : ''

  const openWhatsApp = (lead = recommendedLead) => {
    const phone = lead?.phone ? normalizeContact(lead.phone) : ''
    if (!phone) { notify('info', 'Este lead não possui telefone cadastrado.'); return }
    window.open(`https://wa.me/55${phone.replace(/^55/, '')}?text=${encodeURIComponent(`Olá, ${lead?.name}! Tudo bem?`)}`, '_blank', 'noopener,noreferrer')
  }

  const filteredWorkday = dashboard.workday.items.filter((item) => queueFilter === 'all' || item.reasons.includes(queueFilter))
  const runScoreAction = (item: LeadScoreInsight) => {
    const action = item.nextBestAction
    if (action.kind === 'call' && item.lead.phone) { setCallLead(item.lead); return }
    if (action.kind === 'whatsapp') { openWhatsApp(item.lead); return }
    if (action.kind === 'followup') { setActivityLead(item.lead); return }
    if (action.kind === 'data' || action.kind === 'review') { setEditingLead(item.lead); return }
    setRoute(action.route)
  }
  const runWorkdayItem = (item: WorkdayItem) => {
    if (item.action === 'call' && item.lead.phone) setCallLead(item.lead)
    else if (item.action === 'whatsapp') openWhatsApp(item.lead)
    else if (item.action === 'meeting') setRoute('agenda')
    else if (item.action === 'review' || item.action === 'data') setEditingLead(item.lead)
    else setActivityLead(item.lead)
  }

  return (
    <div className="page-stack dashboard-v10051">
      <section className="workday-hero">
        <div className="workday-hero__content">
          <span className="eyebrow"><Sparkles size={15} /> {todayLabel}</span>
          <h2>{greeting}{firstName ? `, ${firstName}` : ''}.</h2>
          <p>
            {dashboard.workday.breached
              ? <>Existem <strong>{dashboard.workday.breached} {dashboard.workday.breached === 1 ? 'prioridade vencida' : 'prioridades vencidas'}</strong> para resolver e <strong>{formatCurrency(dashboard.riskValue)}</strong> em oportunidades que pedem atenção.</>
              : <>Sua operação está em dia. Há <strong>{dashboard.workday.items.length} prioridades</strong> na fila e <strong>{dashboard.activitiesToday} atividades</strong> previstas para hoje.</>}
          </p>
        </div>
        <div className="workday-hero__actions">
          <Button size="lg" disabled={!dashboard.workday.items.length} onClick={() => dashboard.workday.items[0] && runWorkdayItem(dashboard.workday.items[0])}><Zap size={18} /> Começar próxima ação</Button>
          <button className="icon-action" type="button" title="Atualizar prioridades" onClick={() => void refresh()}><RefreshCw size={18} /></button>
        </div>
      </section>

      <section className="health-strip" aria-label="Resumo do dia">
        <button type="button" className="health-item" onClick={() => setRoute('followups')}>
          <span className="health-item__icon"><ListTodo size={19} /></span>
          <span><small>Prioridades</small><strong>{dashboard.workday.items.length}</strong><em>{dashboard.workday.dueToday} vencem hoje</em></span>
          <ChevronRight size={16} />
        </button>
        <button type="button" className={`health-item ${dashboard.workday.breached ? 'health-item--danger' : ''}`} onClick={() => setQueueFilter('sla')}>
          <span className="health-item__icon"><Clock3 size={19} /></span>
          <span><small>Em atraso</small><strong>{dashboard.workday.breached}</strong><em>{dashboard.workday.breached ? 'Resolver primeiro' : 'Nenhum SLA vencido'}</em></span>
          <ChevronRight size={16} />
        </button>
        <button type="button" className="health-item" onClick={() => setRoute('calls')}>
          <span className="health-item__icon"><PhoneCall size={19} /></span>
          <span><small>Contatos hoje</small><strong>{dashboard.contactsToday}</strong><em>{dashboard.meetingsToday} {dashboard.meetingsToday === 1 ? 'reunião' : 'reuniões'} hoje</em></span>
          <ChevronRight size={16} />
        </button>
        <button type="button" className="health-item" onClick={() => setRoute('goals')}>
          <span className="health-item__icon"><Target size={19} /></span>
          <span><small>Meta atual</small><strong>{dashboard.currentGoalProgress?.percentage ?? 0}%</strong><em>{dashboard.currentGoal ? `${dashboard.daysRemaining} dias restantes` : 'Configure uma meta'}</em></span>
          <ChevronRight size={16} />
        </button>
      </section>

      <section className="lead-score-overview portfolio-signal-bar" aria-label="Inteligência da carteira">
        <button type="button" onClick={() => setRoute('leads')}><span>Score médio da carteira</span><strong>{dashboard.averageScore}</strong><small>de 100 pontos</small></button>
        <button type="button" onClick={() => setRoute('leads')}><span>Prioridade alta</span><strong>{dashboard.highScores}</strong><small>leads para trabalhar primeiro</small></button>
        <button type="button" className={dashboard.criticalScores ? 'is-critical' : ''} onClick={() => setRoute('leads')}><span>Críticos agora</span><strong>{dashboard.criticalScores}</strong><small>{dashboard.criticalScores ? 'ação imediata recomendada' : 'nenhum lead crítico'}</small></button>
        <button type="button" className={dashboard.scoreAlerts ? 'has-alerts' : ''} onClick={() => setRoute('leads')}><span>Alertas de qualidade</span><strong>{dashboard.scoreAlerts}</strong><small>riscos e dados a revisar</small></button>
      </section>

      <section className="dashboard-execution-grid">
        <article className="panel next-action-card">
          <div className="panel__heading">
            <div><span className="eyebrow"><Sparkles size={13} /> Próxima ação recomendada</span><h3>{recommendedLead?.name ?? 'Nenhuma prioridade encontrada'}</h3></div>
            {dashboard.recommended ? <span className="priority-score">{dashboard.recommended.score}<small>/100</small></span> : <Target size={24} />}
          </div>
          {recommendedLead && dashboard.recommended ? (
            <>
              <div className="next-action-card__identity">
                <span className="lead-avatar">{recommendedLead.name.slice(0, 2).toUpperCase()}</span>
                <div><strong>{recommendedLead.company || 'Empresa não informada'}</strong><span>{recommendedLead.city || 'Cidade não informada'} · {recommendedLead.ownerName || 'Sem responsável'}</span></div>
                <span className={`temperature-badge temperature-badge--${recommendedLead.temperature}`}><Flame size={13} /> {recommendedLead.temperature === 'hot' ? 'Quente' : recommendedLead.temperature === 'warm' ? 'Morno' : 'Frio'}</span>
              </div>
              <div className="recommendation-reason">
                <Zap size={17} />
                <div><strong>Por que agir agora</strong><span>{dashboard.recommended.reasons.slice(0, 3).join(' · ') || dashboard.recommended.nextBestAction.explanation}</span></div>
              </div>
              <dl className="next-action-details">
                <div><dt>Próxima melhor ação</dt><dd>{dashboard.recommended.nextBestAction.title}</dd></div>
                <div><dt>Valor</dt><dd>{formatCurrency(recommendedLead.value)}</dd></div>
                <div><dt>Prioridade</dt><dd>{recommendedLead.priority === 'urgent' ? 'Urgente' : recommendedLead.priority === 'high' ? 'Alta' : recommendedLead.priority === 'medium' ? 'Média' : 'Baixa'}</dd></div>
              </dl>
              <div className="next-action-card__actions">
                <Button onClick={() => runScoreAction(dashboard.recommended!)}><Zap size={17} /> {dashboard.recommended.nextBestAction.title}</Button>
                <Button variant="secondary" onClick={() => openWhatsApp()}><MessageCircle size={17} /> WhatsApp</Button>
                <Button variant="ghost" onClick={() => setEditingLead(recommendedLead)}>Abrir ficha <ArrowRight size={16} /></Button>
              </div>
            </>
          ) : <div className="dashboard-empty"><CheckCircle2 size={28} /><strong>Nenhuma ação urgente</strong><span>Cadastre próximas ações nos leads para receber recomendações.</span><Button variant="secondary" onClick={() => setRoute('leads')}>Abrir Leads</Button></div>}
        </article>

        <article className="panel work-queue-card">
          <div className="panel__heading">
            <div><span className="eyebrow"><ListTodo size={13} /> Prioridades do dia</span><h3>Fila inteligente</h3></div>
            <button className="text-button" type="button" onClick={() => setQueueFilter('all')}>Limpar filtro</button>
          </div>
          <div className="workday-filters" aria-label="Filtros da fila">
            {([['all', 'Tudo'], ['sla', 'SLA'], ['today', 'Hoje'], ['proposal', 'Propostas'], ['stale', 'Parados'], ['no_action', 'Sem ação']] as const).map(([id, label]) => <button type="button" key={id} className={queueFilter === id ? 'is-active' : ''} onClick={() => setQueueFilter(id)}>{label}</button>)}
          </div>
          <div className="workday-scope" aria-label="Responsável da fila"><span>Exibindo</span><button type="button" className={queueScope === 'mine' ? 'is-active' : ''} onClick={() => setQueueScope('mine')}>Meus leads</button><button type="button" className={queueScope === 'team' ? 'is-active' : ''} onClick={() => setQueueScope('team')}>Toda a equipe</button></div>
          <div className="work-queue-list">
            {filteredWorkday.length ? filteredWorkday.slice(0, 7).map((item) => (
              <div className={`work-queue-row ${item.slaState === 'breached' ? 'work-queue-row--overdue' : ''}`} key={item.id}>
                <span className="work-queue-row__time">{item.slaState === 'breached' ? 'SLA' : item.score}</span>
                <span className="work-queue-row__marker work-queue-row__marker--activity" />
                <div><strong>{item.lead.name} · {item.title}</strong><small>{item.explanation}</small><span className={`queue-score queue-score--${item.insight.level}`}>Score {item.score} · {item.insight.label}</span></div>
                <button className="queue-open" type="button" title="Executar recomendação" onClick={() => runWorkdayItem(item)}><ChevronRight size={16} /></button>
              </div>
            )) : <div className="dashboard-empty dashboard-empty--compact"><CheckCircle2 size={26} /><strong>Nenhuma prioridade neste filtro</strong><span>A fila se atualiza conforme os contatos e próximas ações.</span></div>}
          </div>
          <Button className="work-queue-card__routine" variant="secondary" disabled={!filteredWorkday.length} onClick={() => filteredWorkday[0] && runWorkdayItem(filteredWorkday[0])}><Zap size={17} /> Executar próxima prioridade</Button>
        </article>
      </section>

      <section className="commercial-summary-grid">
        <article className="panel compact-panel pipeline-health-card">
          <div className="panel__heading"><div><span className="eyebrow">Saúde do funil</span><h3>Pipeline em risco</h3></div><TriangleAlert size={21} /></div>
          <div className="risk-list">
            <button type="button" onClick={() => setRoute('pipeline')}><span className="risk-dot risk-dot--red" /><span><strong>{dashboard.overdueLeads.length} leads com ação vencida</strong><small>Retornos que passaram da data</small></span><ChevronRight size={16} /></button>
            <button type="button" onClick={() => setRoute('pipeline')}><span className="risk-dot risk-dot--orange" /><span><strong>{dashboard.proposalsWaiting.length} propostas sem movimento</strong><small>Há cinco dias ou mais sem atualização</small></span><ChevronRight size={16} /></button>
            <button type="button" onClick={() => setRoute('pipeline')}><span className="risk-dot risk-dot--blue" /><span><strong>{dashboard.hotWithoutAction.length} leads quentes sem ação</strong><small>Potencial alto sem próximo passo</small></span><ChevronRight size={16} /></button>
            <button type="button" onClick={() => setRoute('pipeline')}><span className="risk-dot" /><span><strong>{dashboard.stale.length} negócios parados</strong><small>Sete dias ou mais sem atualização</small></span><ChevronRight size={16} /></button>
          </div>
          <div className="pipeline-values"><span><small>Pipeline ativo</small><strong>{formatCurrency(dashboard.pipelineValue)}</strong></span><span><small>Previsão ponderada</small><strong>{formatCurrency(dashboard.weightedPipeline)}</strong></span></div>
        </article>

        <article className="panel compact-panel goal-card-dashboard">
          <div className="panel__heading"><div><span className="eyebrow">Desempenho</span><h3>Meta atual</h3></div><Target size={21} /></div>
          {dashboard.currentGoal && dashboard.currentGoalProgress ? (
            <>
              <div className="goal-dashboard-head"><div><strong>{goalMetricLabels[dashboard.currentGoal.metric]}</strong><span>{dashboard.currentGoal.userName || 'Equipe'}</span></div><strong>{dashboard.currentGoalProgress.percentage}%</strong></div>
              <div className="goal-progress-track"><span style={{ width: `${Math.min(100, dashboard.currentGoalProgress.percentage)}%` }} /></div>
              <div className="goal-dashboard-values"><span><small>Realizado</small><strong>{dashboard.currentGoal.metric === 'revenue' ? formatCurrency(dashboard.currentGoalProgress.value) : dashboard.currentGoalProgress.value}</strong></span><span><small>Meta</small><strong>{dashboard.currentGoal.metric === 'revenue' ? formatCurrency(dashboard.currentGoal.targetValue) : dashboard.currentGoal.targetValue}</strong></span></div>
              <div className={`pace-message pace-message--${dashboard.currentGoalProgress.pace}`}><CircleDollarSign size={17} /><span>{dashboard.currentGoalProgress.pace === 'on_track' ? 'Você está no ritmo esperado.' : dashboard.currentGoalProgress.pace === 'attention' ? 'A meta exige atenção para recuperar o ritmo.' : 'O ritmo atual está abaixo do necessário.'}</span></div>
              <button className="panel-link" type="button" onClick={() => setRoute('goals')}>Analisar todas as metas <ArrowRight size={15} /></button>
            </>
          ) : <div className="dashboard-empty"><Target size={27} /><strong>Nenhuma meta ativa</strong><span>Crie uma meta para acompanhar o ritmo comercial.</span><Button variant="secondary" onClick={() => setRoute('goals')}>Criar meta</Button></div>}
        </article>

      </section>

      <section className="dashboard-bottom-grid">
        <article className="panel compact-panel dashboard-quick-actions">
          <div className="panel__heading"><div><span className="eyebrow"><Zap size={13} /> Acesso rápido</span><h3>Ações comerciais</h3></div></div>
          <div className="quick-action-grid">
            <button type="button" onClick={() => setRoute('leads')}><span><UserRoundPlus size={19} /></span><strong>Novo lead</strong><small>Adicionar oportunidade</small></button>
            <button type="button" onClick={() => setRoute('calls')}><span><PhoneCall size={19} /></span><strong>Iniciar ligações</strong><small>Abrir fila comercial</small></button>
            <button type="button" onClick={() => setRoute('agenda')}><span><CalendarCheck2 size={19} /></span><strong>Criar reunião</strong><small>Organizar compromisso</small></button>
            <button type="button" onClick={() => setRoute('pipeline')}><span><WalletCards size={19} /></span><strong>Abrir Pipeline</strong><small>Revisar oportunidades</small></button>
          </div>
        </article>

        <article className="panel compact-panel dashboard-continuity">
          <div className="panel__heading"><div><span className="eyebrow"><History size={13} /> Continuidade</span><h3>Continue de onde parou</h3></div><span className="today-contact-badge"><UsersRound size={14} /> {dashboard.contactsToday} contatos hoje</span></div>
          <div className="recent-work-list">
            {dashboard.latestLeads.length ? dashboard.latestLeads.map((lead) => (
              <button type="button" key={lead.id} onClick={() => setRoute('leads')}>
                <span className="lead-avatar lead-avatar--small">{lead.name.slice(0, 2).toUpperCase()}</span>
                <span><strong>{lead.name}</strong><small>{lead.company || 'Empresa não informada'} · atualizado {formatDateTime(lead.updatedAt)}</small></span>
                <ChevronRight size={16} />
              </button>
            )) : <div className="dashboard-empty dashboard-empty--compact"><UsersRound size={25} /><strong>Nenhum lead ativo</strong><span>Cadastre o primeiro lead para iniciar a operação.</span></div>}
          </div>
        </article>
      </section>

      {showMobileRoutine ? <button className="mobile-routine-button" type="button" onClick={() => filteredWorkday[0] && runWorkdayItem(filteredWorkday[0])}><Zap size={18} /> Iniciar próxima ação</button> : null}
      <CallWorkspaceModal open={Boolean(callLead)} initialLeadId={callLead?.id ?? ''} queueLeadIds={filteredWorkday.map((item) => item.lead.id)} onClose={() => setCallLead(null)} />
      <ActivityModal open={Boolean(activityLead)} initialLeadId={activityLead?.id ?? ''} initialType="followup" initialTitle={activityLead ? `Retomar contato — ${activityLead.name}` : ''} onClose={() => setActivityLead(null)} />
      <EditLeadModal lead={editingLead} open={Boolean(editingLead)} onClose={() => setEditingLead(null)} />
    </div>
  )
}
