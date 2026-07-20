import {
  AlertTriangle, ArrowRight, BarChart3, CalendarDays, CheckCircle2, CircleDollarSign, Gauge, Pencil, PhoneCall,
  Plus, Sparkles, Target, Trash2, TrendingUp, UserRound, UsersRound, Zap,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { StatusPill } from '../../components/ui/status-pill'
import type { Goal, GoalMetric, WorkspaceMember } from '../../domain/types'
import { formatCurrency } from '../../domain/formatters'
import { goalMetricLabels, goalMetricUnits } from '../../services/metrics'
import { buildRoutinePlan, getGoalInsight, type GoalInsight, type RoutineActivityInput } from '../../services/goals-workspace'
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

export function GoalsPage() {
  const { snapshot, currentWorkspace, createGoal, updateGoal, deleteGoal, createActivities, listWorkspaceMembers, notify, canWrite } = useApp()
  const [modalOpen, setModalOpen] = useState(false)
  const [routineOpen, setRoutineOpen] = useState(false)
  const [editing, setEditing] = useState<Goal | null>(null)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [view, setView] = useState<'overview' | 'team' | 'history'>('overview')
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    let active = true
    void listWorkspaceMembers().then((items) => { if (active) setMembers(items) }).catch(() => { if (active) setMembers([]) })
    return () => { active = false }
  }, [currentWorkspace?.id, listWorkspaceMembers])

  const allGoals = snapshot?.goals ?? []
  const activeGoals = useMemo(() => allGoals.filter((goal) => goal.periodStart <= today && goal.periodEnd >= today), [allGoals, today])
  const historyGoals = useMemo(() => allGoals.filter((goal) => goal.periodEnd < today).sort((a, b) => b.periodEnd.localeCompare(a.periodEnd)), [allGoals, today])
  const insights = useMemo(() => (view === 'history' ? historyGoals : activeGoals).map((goal) => getGoalInsight(snapshot!, goal)), [activeGoals, historyGoals, snapshot, view])
  const routinePlan = useMemo(() => buildRoutinePlan(snapshot!, activeGoals), [activeGoals, snapshot])

  const achieved = insights.filter((item) => item.percentage >= 100).length
  const atRisk = insights.filter((item) => item.pace === 'at_risk' && item.percentage < 100).length
  const average = insights.length ? Math.round(insights.reduce((sum, item) => sum + Math.min(item.percentage, 100), 0) / insights.length) : 0
  const forecast = insights.length ? Math.round(insights.reduce((sum, item) => sum + Math.min(item.forecastPercentage, 200), 0) / insights.length) : 0

  const groupedByOwner = useMemo(() => {
    const groups = new Map<string, GoalInsight[]>()
    activeGoals.map((goal) => getGoalInsight(snapshot!, goal)).forEach((insight) => {
      const list = groups.get(insight.goal.userName) ?? []
      list.push(insight); groups.set(insight.goal.userName, list)
    })
    return [...groups.entries()].map(([name, items]) => ({
      name,
      items,
      average: Math.round(items.reduce((sum, item) => sum + Math.min(100, item.percentage), 0) / Math.max(1, items.length)),
      atRisk: items.filter((item) => item.pace === 'at_risk' && item.percentage < 100).length,
      achieved: items.filter((item) => item.percentage >= 100).length,
    })).sort((a, b) => b.average - a.average)
  }, [activeGoals, snapshot])

  const save = async (input: Parameters<typeof createGoal>[0]) => {
    setSaving(true)
    try {
      if (editing) await updateGoal(editing.id, input); else await createGoal(input)
      setModalOpen(false); setEditing(null)
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível salvar a meta.') }
    finally { setSaving(false) }
  }

  const remove = async (goal: Goal) => {
    if (!window.confirm(`Remover a meta “${goalMetricLabels[goal.metric]}”?`)) return
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

  if (!snapshot) return null

  return (
    <div className="page-stack goals-page goals-page--professional">
      <section className="toolbar-card goals-command-bar">
        <div className="goals-command-bar__heading"><span className="eyebrow"><Target size={14} /> Gestão por resultado</span><h2>Metas e rotina comercial</h2><p>Transforme objetivos em ritmo diário, previsão de fechamento e ações reais para a equipe.</p></div>
        <div className="goals-command-bar__actions">{canWrite ? <>
          <Button variant="secondary" disabled={!activeGoals.length} onClick={() => setRoutineOpen(true)}><Sparkles size={17} /> Gerar rotina do dia</Button>
          <Button onClick={() => { setEditing(null); setModalOpen(true) }}><Plus size={17} /> Nova meta</Button>
        </> : null}</div>
      </section>

      <section className="goals-view-tabs" aria-label="Visualizações de metas">
        <button type="button" className={view === 'overview' ? 'is-active' : ''} onClick={() => setView('overview')}><Gauge size={16} /> Visão geral</button>
        <button type="button" className={view === 'team' ? 'is-active' : ''} onClick={() => setView('team')}><UsersRound size={16} /> Equipe</button>
        <button type="button" className={view === 'history' ? 'is-active' : ''} onClick={() => setView('history')}><CalendarDays size={16} /> Histórico</button>
      </section>

      {view !== 'team' ? <>
        <section className="metric-grid metric-grid--compact goals-metric-grid">
          <article className="metric-card"><span className="metric-card__icon"><Gauge /></span><div><small>Progresso médio</small><strong>{average}%</strong><span>{view === 'history' ? 'Metas encerradas' : 'Metas do período'}</span></div></article>
          <article className="metric-card"><span className="metric-card__icon metric-card__icon--green"><CheckCircle2 /></span><div><small>Atingidas</small><strong>{achieved}</strong><span>100% ou mais</span></div></article>
          <article className="metric-card"><span className="metric-card__icon metric-card__icon--orange"><AlertTriangle /></span><div><small>Em risco</small><strong>{atRisk}</strong><span>Abaixo do ritmo esperado</span></div></article>
          <article className="metric-card"><span className="metric-card__icon metric-card__icon--purple"><TrendingUp /></span><div><small>Previsão média</small><strong>{forecast}%</strong><span>Projeção até o fim</span></div></article>
        </section>

        {view === 'overview' && activeGoals.length ? <section className="goals-strategy-panel">
          <div className="goals-strategy-panel__main"><span className="goals-strategy-panel__icon"><Sparkles size={22} /></span><div><span className="eyebrow">Ritmo recomendado para hoje</span><h3>{routinePlan.calls} ligações e {routinePlan.followups} follow-ups</h3><p>Com o desempenho atual, a operação precisa buscar aproximadamente <strong>{routinePlan.contacts} contatos</strong>, <strong>{routinePlan.meetings} reuniões</strong> e <strong>{routinePlan.proposals} propostas</strong> por dia útil.</p></div></div>
          <div className="goals-strategy-panel__numbers"><div><small>Fechamentos/dia</small><strong>{routinePlan.wins}</strong></div><div><small>Receita/dia</small><strong>{formatCurrency(routinePlan.revenue)}</strong></div><div><small>Dias úteis restantes</small><strong>{routinePlan.workdaysRemaining}</strong></div></div>
          {canWrite ? <Button onClick={() => setRoutineOpen(true)}>Montar fila <ArrowRight size={16} /></Button> : null}
        </section> : null}

        {insights.length ? <section className="goals-grid goals-grid--professional">{insights.map((insight) => <GoalCard key={insight.goal.id} insight={insight} readOnly={!canWrite} onEdit={() => { setEditing(insight.goal); setModalOpen(true) }} onRemove={() => void remove(insight.goal)} />)}</section> : <EmptyState icon={Target} title={view === 'history' ? 'Nenhuma meta encerrada' : 'Nenhuma meta ativa'} description={view === 'history' ? 'O histórico aparecerá quando o período das metas terminar.' : 'Crie metas diárias, semanais ou mensais para acompanhar ritmo e resultado.'} action={view === 'overview' && canWrite ? <Button onClick={() => setModalOpen(true)}><Plus size={17} /> Criar primeira meta</Button> : undefined} />}
      </> : <TeamGoals groups={groupedByOwner} />}

      <GoalModal open={canWrite && modalOpen} goal={editing} members={members} loading={saving} onClose={() => { setModalOpen(false); setEditing(null) }} onSubmit={save} />
      <RoutineModal open={canWrite && routineOpen} snapshot={snapshot} plan={routinePlan} loading={generating} onClose={() => setRoutineOpen(false)} onGenerate={generateRoutine} />
    </div>
  )
}

function GoalCard({ insight, readOnly, onEdit, onRemove }: { insight: GoalInsight; readOnly: boolean; onEdit(): void; onRemove(): void }) {
  const { goal } = insight
  const Icon = metricIcons[goal.metric]
  return <article className={`goal-card goal-card--professional goal-card--${insight.pace}`}>
    <header><div className="goal-card__identity"><span className="goal-card__metric-icon"><Icon size={18} /></span><div><span className="eyebrow">{goal.userName}</span><h3>{goalMetricLabels[goal.metric]}</h3></div></div><StatusPill tone={paceTone(insight)}>{paceLabel(insight)}</StatusPill></header>
    <div className="goal-card__headline"><div><small>Realizado</small><strong>{formatValue(goal, insight.value)}</strong></div><span>de {formatValue(goal, goal.targetValue)}</span></div>
    <div className="progress-track goal-card__progress"><span style={{ width: `${Math.min(100, insight.percentage)}%` }} /></div>
    <div className="goal-card__progress-label"><strong>{insight.percentage}% concluído</strong><span>Esperado agora: {formatValue(goal, insight.expected)}</span></div>
    <div className="goal-card__forecast-grid">
      <div><small>Falta</small><strong>{formatValue(goal, insight.remaining)}</strong></div>
      <div><small>Necessário/dia</small><strong>{formatValue(goal, insight.dailyRequired, 1)}</strong></div>
      <div><small>Previsão final</small><strong>{formatValue(goal, insight.forecast)}</strong><span>{insight.forecastPercentage}% da meta</span></div>
    </div>
    <footer><span><CalendarDays size={14} /> {dateLabel(goal.periodStart)} — {dateLabel(goal.periodEnd)}</span>{!readOnly ? <div><button className="icon-button" aria-label="Editar meta" onClick={onEdit}><Pencil size={16} /></button><button className="icon-button icon-button--danger" aria-label="Excluir meta" onClick={onRemove}><Trash2 size={16} /></button></div> : null}</footer>
  </article>
}

function TeamGoals({ groups }: { groups: Array<{ name: string; items: GoalInsight[]; average: number; atRisk: number; achieved: number }> }) {
  if (!groups.length) return <EmptyState icon={UsersRound} title="Nenhuma meta atribuída" description="Crie metas para a equipe ou para responsáveis específicos." />
  return <section className="team-goals-panel">
    <header><div><span className="eyebrow"><UsersRound size={14} /> Desempenho por responsável</span><h3>Visão da equipe</h3></div><span>{groups.length} responsável(is)</span></header>
    <div className="team-goals-table">
      <div className="team-goals-table__head"><span>Responsável</span><span>Metas</span><span>Atingidas</span><span>Em risco</span><span>Progresso médio</span></div>
      {groups.map((group) => <article key={group.name}><div className="team-goals-table__owner"><span>{group.name.slice(0, 1).toUpperCase()}</span><div><strong>{group.name}</strong><small>{group.items.map((item) => goalMetricLabels[item.goal.metric]).join(' · ')}</small></div></div><strong>{group.items.length}</strong><strong>{group.achieved}</strong><strong className={group.atRisk ? 'is-danger' : ''}>{group.atRisk}</strong><div className="team-goals-table__progress"><div><span style={{ width: `${Math.min(100, group.average)}%` }} /></div><strong>{group.average}%</strong></div></article>)}
    </div>
  </section>
}
