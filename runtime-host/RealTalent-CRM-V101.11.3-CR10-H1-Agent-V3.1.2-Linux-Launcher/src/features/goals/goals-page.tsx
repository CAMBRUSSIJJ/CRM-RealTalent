import { NativeSelectionSelect } from '../../components/selection'
import {
  AlertTriangle, ArrowRight, BarChart3, CalendarDays, CheckCircle2, CircleDollarSign, Gauge, Pencil, PhoneCall,
  Plus, RotateCcw, Sparkles, Target, Trash2, TrendingUp, UserRound, UsersRound, Zap,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAppActions, useAppUi, useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { StatusPill } from '../../components/ui/status-pill'
import { WorkspaceAdvancedFilterDrawer, WorkspaceCommandBar, WorkspaceFilterMenu, WorkspaceViewStrip, type WorkspaceFilterField } from '../../components/workspace/workspace-filter-system'
import type { Goal, GoalMetric, WorkspaceMember } from '../../domain/types'
import { formatCurrency } from '../../domain/formatters'
import { goalMetricLabels, goalMetricUnits } from '../../services/metrics'
import { loadWorkManagement, type WorkManagementSnapshot } from '../../services/work-management'
import { buildRoutinePlan, getGoalInsight, localDateKey, type GoalInsight, type RoutineActivityInput } from '../../services/goals-workspace'
import { GoalModal } from './goal-modal'
import { RoutineModal } from './routine-modal'

const formatNumber = (value: number, digits = 0) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(value)
const formatValue = (goal: Goal, value: number, digits = 0) => goalMetricUnits[goal.metric] === 'currency' ? formatCurrency(value) : formatNumber(value, digits)
const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR')
const metricIcons: Record<GoalMetric, typeof PhoneCall> = {
  calls: PhoneCall,
  contacts: UsersRound,
  followups: Zap,
  meetings: CalendarDays,
  proposals: BarChart3,
  wins: CheckCircle2,
  revenue: CircleDollarSign,
  new_leads: UserRound,
}

const paceLabel = (insight: GoalInsight) => insight.percentage >= 100 ? 'Atingida' : insight.pace === 'at_risk' ? 'Em risco' : insight.pace === 'attention' ? 'Atenção' : 'No ritmo'
const paceTone = (insight: GoalInsight) => insight.percentage >= 100 ? 'success' : insight.pace === 'at_risk' ? 'danger' : insight.pace === 'attention' ? 'warning' : 'info'
type GoalsView = 'overview' | 'team' | 'history'
type HealthFilter = 'all' | 'achieved' | 'on_track' | 'attention' | 'at_risk' | 'projected_miss'

const healthMatches = (insight: GoalInsight, filter: HealthFilter) => {
  if (filter === 'all') return true
  if (filter === 'achieved') return insight.percentage >= 100
  if (filter === 'projected_miss') return insight.percentage < 100 && !insight.projectedToHit
  return insight.percentage < 100 && insight.pace === filter
}

const sortInsights = (items: GoalInsight[]) => [...items].sort((a, b) => {
  const rank = (item: GoalInsight) => item.percentage >= 100 ? 3 : item.pace === 'at_risk' ? 0 : item.pace === 'attention' ? 1 : 2
  return rank(a) - rank(b) || a.forecastPercentage - b.forecastPercentage || a.goal.periodEnd.localeCompare(b.goal.periodEnd)
})

const preferenceKey = (workspaceId: string) => `realtalent:${workspaceId}:goals-view:v2`

export function GoalsPage() {
  const { snapshot, currentWorkspace, currentUserId, repositoryMode, canTeamAccess, canTeamAccessRecord } = useAppWorkspace()
  const { notify, confirmAction } = useAppUi()
  const { createGoal, updateGoal, deleteGoal, createActivities, listWorkspaceMembers } = useAppActions()
  const [modalOpen, setModalOpen] = useState(false)
  const [routineOpen, setRoutineOpen] = useState(false)
  const [editing, setEditing] = useState<Goal | null>(null)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [workManagement, setWorkManagement] = useState<WorkManagementSnapshot>({ teams: [], memberships: [], tasks: [], relations: [], checklistItems: [], comments: [] })
  const [view, setView] = useState<GoalsView>('overview')
  const [ownerFilter, setOwnerFilter] = useState('all')
  const [metricFilter, setMetricFilter] = useState<'all' | GoalMetric>('all')
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all')
  const [query, setQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const today = localDateKey()

  useEffect(() => {
    let active = true
    void listWorkspaceMembers().then((items) => { if (active) setMembers(items) }).catch(() => { if (active) setMembers([]) })
    return () => { active = false }
  }, [currentWorkspace?.id, listWorkspaceMembers])


  useEffect(() => {
    if (!currentWorkspace?.id) return
    let active = true
    void loadWorkManagement(repositoryMode, currentWorkspace.id).then((data) => { if (active) setWorkManagement(data) }).catch(() => undefined)
    return () => { active = false }
  }, [currentWorkspace?.id, repositoryMode])

  const memberIdsForGoal = (goal: Goal) => goal.scope === 'team' && goal.teamId ? workManagement.memberships.filter((membership) => membership.teamId === goal.teamId).map((membership) => membership.userId) : undefined

  useEffect(() => {
    if (!currentWorkspace?.id || typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(preferenceKey(currentWorkspace.id))
      if (!raw) return
      const stored = JSON.parse(raw) as Partial<{ view: GoalsView; ownerFilter: string; metricFilter: 'all' | GoalMetric; healthFilter: HealthFilter }>
      if (stored.view && ['overview', 'team', 'history'].includes(stored.view)) setView(stored.view)
      if (stored.ownerFilter) setOwnerFilter(stored.ownerFilter)
      if (stored.metricFilter) setMetricFilter(stored.metricFilter)
      if (stored.healthFilter) setHealthFilter(stored.healthFilter)
    } catch { /* preferências locais inválidas não impedem a tela */ }
  }, [currentWorkspace?.id])

  useEffect(() => {
    if (!currentWorkspace?.id || typeof window === 'undefined') return
    try { window.localStorage.setItem(preferenceKey(currentWorkspace.id), JSON.stringify({ view, ownerFilter, metricFilter, healthFilter })) } catch { /* armazenamento indisponível */ }
  }, [currentWorkspace?.id, healthFilter, metricFilter, ownerFilter, view])

  const canGoalCreate = canTeamAccess('create','goals')
  const canGoalEdit = canTeamAccess('edit','goals')
  const canGoalDelete = canTeamAccess('delete','goals')
  const canGoalAssign = canTeamAccess('assign','goals')
  const allGoals = useMemo(() => (snapshot?.goals ?? []).filter((goal) => canTeamAccessRecord('goals', goal.scope === 'team' ? null : goal.userId, goal.teamId ?? null)), [snapshot?.goals, canTeamAccessRecord])
  const activeGoals = useMemo(() => allGoals.filter((goal) => goal.periodStart <= today && goal.periodEnd >= today), [allGoals, today])
  const historyGoals = useMemo(() => allGoals.filter((goal) => goal.periodEnd < today).sort((a, b) => b.periodEnd.localeCompare(a.periodEnd)), [allGoals, today])
  const activeInsights = useMemo(() => snapshot ? activeGoals.map((goal) => getGoalInsight(snapshot, goal, new Date(), { userIds: memberIdsForGoal(goal) })) : [], [activeGoals, snapshot, workManagement.memberships])
  const historyInsights = useMemo(() => snapshot ? historyGoals.map((goal) => getGoalInsight(snapshot, goal, new Date(), { userIds: memberIdsForGoal(goal) })) : [], [historyGoals, snapshot, workManagement.memberships])
  const sourceInsights = view === 'history' ? historyInsights : activeInsights
  const insights = useMemo(() => sortInsights(sourceInsights.filter((insight) => {
    const ownerMatches = ownerFilter === 'all' || (ownerFilter === 'team' ? (insight.goal.scope ?? (insight.goal.userId ? 'user' : 'workspace')) === 'team' : ownerFilter === 'workspace' ? (insight.goal.scope ?? (insight.goal.userId ? 'user' : 'workspace')) === 'workspace' : insight.goal.userId === ownerFilter)
    const metricMatches = metricFilter === 'all' || insight.goal.metric === metricFilter
    const normalized = query.trim().toLocaleLowerCase('pt-BR')
    const queryMatches = !normalized || `${goalMetricLabels[insight.goal.metric]} ${insight.goal.userName || 'Equipe'} ${insight.goal.periodStart} ${insight.goal.periodEnd}`.toLocaleLowerCase('pt-BR').includes(normalized)
    return ownerMatches && metricMatches && queryMatches && healthMatches(insight, healthFilter)
  })), [healthFilter, metricFilter, ownerFilter, query, sourceInsights])
  const routinePlan = useMemo(() => snapshot ? buildRoutinePlan(snapshot, activeGoals) : null, [activeGoals, snapshot])

  const achieved = insights.filter((item) => item.percentage >= 100).length
  const atRisk = insights.filter((item) => item.pace === 'at_risk' && item.percentage < 100).length
  const average = insights.length ? Math.round(insights.reduce((sum, item) => sum + Math.min(item.percentage, 100), 0) / insights.length) : 0
  const projected = insights.filter((item) => item.projectedToHit).length

  const groupedByOwner = useMemo(() => {
    const groups = new Map<string, GoalInsight[]>()
    insights.forEach((insight) => {
      const name = insight.goal.userName || 'Equipe'
      const list = groups.get(name) ?? []
      list.push(insight); groups.set(name, list)
    })
    return [...groups.entries()].map(([name, items]) => ({
      name,
      items,
      average: Math.round(items.reduce((sum, item) => sum + Math.min(100, item.percentage), 0) / Math.max(1, items.length)),
      atRisk: items.filter((item) => item.pace === 'at_risk' && item.percentage < 100).length,
      achieved: items.filter((item) => item.percentage >= 100).length,
      projected: items.filter((item) => item.projectedToHit).length,
    })).sort((a, b) => b.average - a.average)
  }, [insights])

  const save = async (input: Parameters<typeof createGoal>[0]) => {
    setSaving(true)
    try {
      if (editing) await updateGoal(editing.id, input); else await createGoal(input)
      setModalOpen(false); setEditing(null)
      notify('success', editing ? 'Meta atualizada.' : 'Meta criada e adicionada ao acompanhamento.')
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível salvar a meta.') }
    finally { setSaving(false) }
  }

  const remove = async (goal: Goal) => {
    if (!await confirmAction({ title: 'Remover meta?', description: `A meta “${goalMetricLabels[goal.metric]}” deixará de aparecer no acompanhamento da equipe.`, confirmLabel: 'Remover meta', tone: 'danger' })) return
    try { await deleteGoal(goal.id) } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível remover.') }
  }

  const generateRoutine = async (inputs: RoutineActivityInput[]) => {
    setGenerating(true)
    try {
      await createActivities(inputs)
      setRoutineOpen(false)
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível gerar a rotina.') }
    finally { setGenerating(false) }
  }

  const resetFilters = () => { setOwnerFilter('all'); setMetricFilter('all'); setHealthFilter('all') }

  const activeFilterCount = (ownerFilter !== 'all' ? 1 : 0) + (metricFilter !== 'all' ? 1 : 0) + (healthFilter !== 'all' ? 1 : 0)
  const universalGoalFilters: WorkspaceFilterField[] = [
    { key: 'owner', label: 'Responsável', value: ownerFilter, allLabel: 'Todos', group: 'Escopo', options: [{ value: 'workspace', label: 'Workspace' }, { value: 'team', label: 'Equipes' }, ...members.map((member) => ({ value: member.userId, label: member.displayName }))] },
    { key: 'metric', label: 'Métrica', value: metricFilter, allLabel: 'Todas', group: 'Resultado', options: Object.entries(goalMetricLabels).map(([value, label]) => ({ value, label })) },
    { key: 'health', label: 'Saúde', value: healthFilter, allLabel: 'Todas', group: 'Resultado', options: [{ value: 'achieved', label: 'Atingidas' }, { value: 'on_track', label: 'No ritmo' }, { value: 'attention', label: 'Atenção' }, { value: 'at_risk', label: 'Em risco' }, { value: 'projected_miss', label: 'Projeção abaixo da meta' }] },
  ]

  if (!snapshot || !routinePlan) return null

  return (
    <div className="page-stack goals-page goals-page--professional goals-page--v10080">
      <section className="workspace-page-header-v10167">
        <div><span className="eyebrow"><Target size={14} /> Gestão por resultado</span><h2>Metas e ritmo comercial</h2><p>Acompanhe resultado, ritmo esperado, projeção de atingimento e esforço necessário até o fim do período.</p></div>
      </section>

      <WorkspaceViewStrip items={[
        { id: 'overview', label: 'Visão geral', active: view === 'overview', favorite: true, accent: 'blue', icon: <Gauge size={14}/>, onClick: () => setView('overview') },
        { id: 'team', label: 'Equipe', active: view === 'team', accent: 'blue', icon: <UsersRound size={14}/>, onClick: () => setView('team') },
        { id: 'history', label: 'Histórico', active: view === 'history', accent: 'neutral', icon: <CalendarDays size={14}/>, onClick: () => setView('history') },
      ]}/>

      <WorkspaceCommandBar query={query} onQueryChange={setQuery} placeholder="Buscar meta, responsável ou período..." actions={<>
        <WorkspaceFilterMenu workspaceKey={`goals:${currentWorkspace?.id ?? 'local'}`} fields={universalGoalFilters} activeCount={activeFilterCount} onOpenAdvanced={() => setFiltersOpen(true)} onClearAll={resetFilters} onChange={(key, value) => { if (key === 'owner') setOwnerFilter(value); else if (key === 'metric') setMetricFilter(value as 'all' | GoalMetric); else setHealthFilter(value as HealthFilter) }} />
        {canGoalCreate ? <><Button variant="secondary" disabled={!activeGoals.length} onClick={() => setRoutineOpen(true)}><Sparkles size={17} /> Gerar rotina do dia</Button><Button onClick={() => { setEditing(null); setModalOpen(true) }}><Plus size={17} /> Nova meta</Button></> : null}
      </>} />



      {filtersOpen ? <WorkspaceAdvancedFilterDrawer eyebrow="Metas" title="Filtros de metas" description="Use a mesma lógica de propriedades rápidas e filtros avançados do restante do CRM." onClose={() => setFiltersOpen(false)} onClear={resetFilters}>
        <section><div className="workspace-settings-section-title-v10167"><strong>Escopo e resultado</strong><span>Os filtros afetam cartões, ritmo, projeção e visão da equipe.</span></div>
          <label className="field"><span>Responsável</span><NativeSelectionSelect value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}><option value="all">Todos</option><option value="workspace">Workspace</option><option value="team">Equipes</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}</NativeSelectionSelect></label>
          <label className="field"><span>Métrica</span><NativeSelectionSelect value={metricFilter} onChange={(event) => setMetricFilter(event.target.value as 'all' | GoalMetric)}><option value="all">Todas as métricas</option>{Object.entries(goalMetricLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelectionSelect></label>
          <label className="field"><span>Saúde</span><NativeSelectionSelect value={healthFilter} onChange={(event) => setHealthFilter(event.target.value as HealthFilter)}><option value="all">Todas</option><option value="achieved">Atingidas</option><option value="on_track">No ritmo</option><option value="attention">Atenção</option><option value="at_risk">Em risco</option><option value="projected_miss">Projeção abaixo da meta</option></NativeSelectionSelect></label>
        </section>
      </WorkspaceAdvancedFilterDrawer> : null}


      {view !== 'team' ? <>
        <section className="metric-grid metric-grid--compact goals-metric-grid">
          <article className="metric-card"><span className="metric-card__icon"><Gauge /></span><div><small>Progresso médio</small><strong>{average}%</strong><span>{view === 'history' ? 'Metas encerradas filtradas' : 'Realizado sobre objetivo'}</span></div></article>
          <article className="metric-card"><span className="metric-card__icon metric-card__icon--green"><TrendingUp /></span><div><small>Projetadas para atingir</small><strong>{projected}</strong><span>{insights.length ? `${Math.round(projected / insights.length * 100)}% das metas filtradas` : 'Sem metas no filtro'}</span></div></article>
          <article className="metric-card"><span className="metric-card__icon metric-card__icon--orange"><AlertTriangle /></span><div><small>Em risco</small><strong>{atRisk}</strong><span>Abaixo do ritmo esperado</span></div></article>
          <article className="metric-card"><span className="metric-card__icon metric-card__icon--purple"><CheckCircle2 /></span><div><small>Atingidas</small><strong>{achieved}</strong><span>100% ou mais</span></div></article>
        </section>

        {view === 'overview' && activeGoals.length ? <section className="goals-strategy-panel">
          <div className="goals-strategy-panel__main"><span className="goals-strategy-panel__icon"><Sparkles size={22} /></span><div><span className="eyebrow">Ritmo recomendado para hoje</span><h3>{routinePlan.calls} ligações e {routinePlan.followups} follow-ups</h3><p>Para reduzir os gaps atuais, a operação precisa buscar aproximadamente <strong>{routinePlan.contacts} contatos</strong>, <strong>{routinePlan.meetings} reuniões</strong> e <strong>{routinePlan.proposals} propostas</strong> por dia útil.</p></div></div>
          <div className="goals-strategy-panel__numbers"><div><small>Fechamentos/dia</small><strong>{routinePlan.wins}</strong></div><div><small>Receita/dia</small><strong>{formatCurrency(routinePlan.revenue)}</strong></div><div><small>Dias úteis restantes</small><strong>{routinePlan.workdaysRemaining}</strong></div></div>
          {canGoalCreate ? <Button onClick={() => setRoutineOpen(true)}>Montar fila <ArrowRight size={16} /></Button> : null}
        </section> : null}

        {insights.length ? <section className="goals-grid goals-grid--professional">{insights.map((insight) => { const inScope = canTeamAccessRecord('goals', insight.goal.scope === 'team' ? null : insight.goal.userId, insight.goal.teamId ?? null); return <GoalCard key={insight.goal.id} insight={insight} canEdit={canGoalEdit && inScope} canDelete={canGoalDelete && inScope} onEdit={() => { setEditing(insight.goal); setModalOpen(true) }} onRemove={() => void remove(insight.goal)} /> })}</section> : <EmptyState icon={Target} title={view === 'history' ? 'Nenhuma meta encerrada neste filtro' : 'Nenhuma meta ativa neste filtro'} description={view === 'history' ? 'Altere os filtros para consultar outras metas encerradas.' : 'Crie uma meta ou limpe os filtros para voltar ao acompanhamento geral.'} />}
      </> : <TeamGoals groups={groupedByOwner} />}

      <GoalModal open={canGoalCreate && modalOpen} goal={editing} members={canGoalAssign ? members : members.filter((member) => member.userId === currentUserId)} teams={canGoalAssign ? workManagement.teams : workManagement.teams.filter((team) => workManagement.memberships.some((membership) => membership.teamId === team.id && membership.userId === currentUserId))} memberships={workManagement.memberships} loading={saving} onClose={() => { setModalOpen(false); setEditing(null) }} onSubmit={save} />
      <RoutineModal open={canGoalCreate && routineOpen} snapshot={snapshot} plan={routinePlan} loading={generating} onClose={() => setRoutineOpen(false)} onGenerate={generateRoutine} />
    </div>
  )
}

function GoalCard({ insight, canEdit, canDelete, onEdit, onRemove }: { insight: GoalInsight; canEdit: boolean; canDelete: boolean; onEdit(): void; onRemove(): void }) {
  const { goal } = insight
  const Icon = metricIcons[goal.metric]
  const paceDelta = Math.abs(insight.paceGap)
  const previousDelta = insight.previousDeltaPercentage
  return <article className={`goal-card goal-card--professional goal-card--${insight.pace}`}>
    <header><div className="goal-card__identity"><span className="goal-card__metric-icon"><Icon size={18} /></span><div><span className="eyebrow">{goal.teamName || goal.userName} · {(goal.scope ?? (goal.userId ? 'user' : 'workspace')) === 'team' ? 'Equipe' : (goal.scope ?? (goal.userId ? 'user' : 'workspace')) === 'user' ? 'Individual' : 'Workspace'}</span><h3>{goalMetricLabels[goal.metric]}</h3></div></div><StatusPill tone={paceTone(insight)}>{paceLabel(insight)}</StatusPill></header>
    <div className="goal-card__headline"><div><small>Realizado</small><strong>{formatValue(goal, insight.value)}</strong></div><span>de {formatValue(goal, goal.targetValue)}</span></div>
    <div className="progress-track goal-card__progress"><span style={{ width: `${Math.min(100, insight.percentage)}%` }} /></div>
    <div className="goal-card__progress-label"><strong>{insight.percentage}% concluído</strong><span>Ritmo esperado: {insight.expectedPercentage}% · {paceDelta < 0.01 ? 'no ponto' : `${formatValue(goal, paceDelta, 1)} ${insight.paceGap >= 0 ? 'acima' : 'abaixo'}`}</span></div>
    <div className="goal-card__forecast-grid goal-card__forecast-grid--v10080">
      <div><small>Falta</small><strong>{formatValue(goal, insight.remaining)}</strong><span>{insight.workdaysRemaining} dia(s) útil(eis)</span></div>
      <div><small>Necessário/dia</small><strong>{formatValue(goal, insight.dailyRequired, 1)}</strong><span>para chegar a 100%</span></div>
      <div><small>Projeção final</small><strong>{formatValue(goal, insight.forecast)}</strong><span className={insight.projectedToHit ? 'is-positive' : 'is-negative'}>{insight.forecastPercentage}% da meta</span></div>
      <div><small>Vs. período anterior</small><strong>{formatValue(goal, insight.previousValue)}</strong><span className={previousDelta === null ? '' : previousDelta >= 0 ? 'is-positive' : 'is-negative'}>{previousDelta === null ? 'Sem base comparável' : `${previousDelta >= 0 ? '+' : ''}${previousDelta}% no mesmo ponto`}</span></div>
    </div>
    <footer><span><CalendarDays size={14} /> {dateLabel(goal.periodStart)} — {dateLabel(goal.periodEnd)} · {insight.workdaysElapsed}/{insight.workdaysTotal} dias úteis</span>{canEdit || canDelete ? <div>{canEdit ? <button type="button" className="icon-button" aria-label="Editar meta" onClick={onEdit}><Pencil size={16} /></button> : null}{canDelete ? <button type="button" className="icon-button icon-button--danger" aria-label="Excluir meta" onClick={onRemove}><Trash2 size={16} /></button> : null}</div> : null}</footer>
  </article>
}

function TeamGoals({ groups }: { groups: Array<{ name: string; items: GoalInsight[]; average: number; atRisk: number; achieved: number; projected: number }> }) {
  if (!groups.length) return <EmptyState icon={UsersRound} title="Nenhuma meta atribuída neste filtro" description="Limpe os filtros ou crie metas para a equipe e responsáveis específicos." />
  return <section className="team-goals-panel">
    <header><div><span className="eyebrow"><UsersRound size={14} /> Desempenho por responsável</span><h3>Visão da equipe</h3></div><span>{groups.length} responsável(is)</span></header>
    <div className="team-goals-table team-goals-table--v10080">
      <div className="team-goals-table__head"><span>Responsável</span><span>Metas</span><span>Atingidas</span><span>Em risco</span><span>Projetadas</span><span>Progresso médio</span></div>
      {groups.map((group) => <article key={group.name}><div className="team-goals-table__owner"><span>{group.name.slice(0, 1).toUpperCase()}</span><div><strong>{group.name}</strong><small>{group.items.map((item) => goalMetricLabels[item.goal.metric]).join(' · ')}</small></div></div><strong>{group.items.length}</strong><strong>{group.achieved}</strong><strong className={group.atRisk ? 'is-danger' : ''}>{group.atRisk}</strong><strong>{group.projected}</strong><div className="team-goals-table__progress"><div><span style={{ width: `${Math.min(100, group.average)}%` }} /></div><strong>{group.average}%</strong></div></article>)}
    </div>
  </section>
}
