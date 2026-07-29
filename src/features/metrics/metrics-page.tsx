import {
  Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, CalendarCheck2, ChartNoAxesCombined,
  CircleDollarSign, Clock3, Contact, Crosshair, Download, Filter, Flag, Funnel, Gauge, Goal, Layers3, LineChart, PhoneCall,
  PieChart, Printer, RotateCcw, SearchCheck, Target, TrendingDown, TrendingUp, Trophy, UsersRound,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useApp } from '../../app/app-context'
import { StatusPill } from '../../components/ui/status-pill'
import { Button } from '../../components/ui/button'
import { formatCurrency } from '../../domain/formatters'
import {
  calculateActivityIntelligence, calculateCommercialMetrics, calculateForecast, calculateFunnelIntelligence, calculateLossAnalysis,
  calculateOwnerPerformance, calculateSourcePerformance, calculateTrend, compareMetric, createMetricsRange, createPreviousMetricsRange,
  generateMetricsAlerts, goalMetricLabels, goalMetricUnits, goalProgress, type MetricComparison, type MetricsAlert,
} from '../../services/metrics'

type MetricsTab = 'overview' | 'funnel' | 'losses' | 'activities' | 'forecast'

const percent = (value: number) => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value)}%`
const integer = (value: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value)
const duration = (seconds: number) => seconds >= 60 ? `${Math.floor(seconds / 60)}min ${Math.round(seconds % 60)}s` : `${Math.round(seconds)}s`
const hours = (value: number) => value >= 24 ? `${(value / 24).toFixed(1)} dias` : `${value.toFixed(1)}h`

const outcomeNames: Record<string, string> = {
  answered: 'Atendeu', no_answer: 'Não atendeu', busy: 'Ocupado', voicemail: 'Caixa postal', callback_requested: 'Pediu retorno',
  interested: 'Demonstrou interesse', meeting_scheduled: 'Reunião marcada', proposal_requested: 'Solicitou proposta', proposal_sent: 'Proposta enviada',
  wrong_person: 'Pessoa errada', invalid_number: 'Número inválido', not_interested: 'Sem interesse', sale_completed: 'Venda concluída', other: 'Outro',
}

function ComparisonBadge({ comparison, inverse = false }: { comparison: MetricComparison; inverse?: boolean }) {
  const improved = comparison.direction === 'stable' ? null : inverse ? comparison.direction === 'down' : comparison.direction === 'up'
  const tone = improved === null ? 'neutral' : improved ? 'success' : 'danger'
  const Icon = comparison.direction === 'up' ? ArrowUpRight : comparison.direction === 'down' ? ArrowDownRight : ArrowRight
  return <StatusPill tone={tone}><Icon size={12} /> {Math.abs(comparison.delta).toFixed(0)}% vs. anterior</StatusPill>
}

function AlertIcon({ alert }: { alert: MetricsAlert }) {
  if (alert.tone === 'positive') return <SearchCheck />
  if (alert.tone === 'critical') return <AlertTriangle />
  if (alert.tone === 'warning') return <Flag />
  return <ChartNoAxesCombined />
}

export function MetricsPage() {
  const { snapshot, notify } = useApp()
  const [days, setDays] = useState(30)
  const [tab, setTab] = useState<MetricsTab>('overview')
  const [ownerId, setOwnerId] = useState('')
  const [source, setSource] = useState('')

  const range = useMemo(() => createMetricsRange(days), [days])
  const previousRange = useMemo(() => createPreviousMetricsRange(range), [range])
  const filters = useMemo(() => ({ ownerId: ownerId || null, source: source || null }), [ownerId, source])
  const current = useMemo(() => calculateCommercialMetrics(snapshot!, range.start, range.end, filters), [filters, range.end, range.start, snapshot])
  const previous = useMemo(() => calculateCommercialMetrics(snapshot!, previousRange.start, previousRange.end, filters), [filters, previousRange.end, previousRange.start, snapshot])
  const funnel = useMemo(() => calculateFunnelIntelligence(snapshot!, filters), [filters, snapshot])
  const losses = useMemo(() => calculateLossAnalysis(snapshot!, range, filters), [filters, range, snapshot])
  const activity = useMemo(() => calculateActivityIntelligence(snapshot!, range, filters), [filters, range, snapshot])
  const forecast = useMemo(() => calculateForecast(snapshot!, range, filters), [filters, range, snapshot])
  const alerts = useMemo(() => generateMetricsAlerts(snapshot!, range, filters), [filters, range, snapshot])
  const trend = useMemo(() => calculateTrend(snapshot!, range, filters), [filters, range, snapshot])
  const owners = useMemo(() => calculateOwnerPerformance(snapshot!, range), [range, snapshot])
  const sources = useMemo(() => calculateSourcePerformance(snapshot!, range, ownerId ? { ownerId } : {}), [ownerId, range, snapshot])
  const sourceOptions = useMemo(() => [...new Set((snapshot?.leads ?? []).map((lead) => lead.source || 'Não informada'))].sort(), [snapshot?.leads])
  const ownerOptions = useMemo(() => [...new Map((snapshot?.leads ?? []).filter((lead) => lead.ownerId).map((lead) => [lead.ownerId!, { id: lead.ownerId!, name: lead.ownerName || 'Sem nome' }])).values()], [snapshot?.leads])
  const outcomes = useMemo(() => Object.entries(current.calls.reduce<Record<string, number>>((acc, call) => ({ ...acc, [call.outcome]: (acc[call.outcome] ?? 0) + 1 }), {})).map(([key, count]) => ({ key, label: outcomeNames[key] ?? key, count })).sort((a, b) => b.count - a.count), [current.calls])
  const activeGoals = useMemo(() => (snapshot?.goals ?? []).filter((goal) => new Date(`${goal.periodEnd}T23:59:59`) >= new Date() && (!ownerId || goal.userId === ownerId)), [ownerId, snapshot?.goals])

  const comparisons = useMemo(() => ({
    leads: compareMetric(current.leads.length, previous.leads.length),
    revenue: compareMetric(current.revenue, previous.revenue),
    contactRate: compareMetric(current.contactRate, previous.contactRate),
    conversion: compareMetric(current.conversion, previous.conversion),
    calls: compareMetric(current.calls.length, previous.calls.length),
    meetings: compareMetric(current.completedMeetings.length, previous.completedMeetings.length),
    proposals: compareMetric(current.proposals, previous.proposals),
    winRate: compareMetric(current.winRate, previous.winRate),
  }), [current, previous])

  const downloadReport = () => {
    const ownerName = ownerOptions.find((owner) => owner.id === ownerId)?.name ?? 'Toda a equipe'
    const rows: Array<Array<string | number>> = [
      ['RELATÓRIO COMERCIAL', snapshot?.workspace.name ?? 'Workspace'],
      ['Período', `${range.start} a ${range.end}`], ['Responsável', ownerName], ['Origem', source || 'Todas as origens'], [],
      ['INDICADORES', 'Valor'], ['Novos leads', current.leads.length], ['Ligações', current.calls.length], ['Contatos efetivos', current.contacts.length],
      ['Reuniões realizadas', current.completedMeetings.length], ['Propostas', current.proposals], ['Vendas fechadas', current.wins.length],
      ['Receita fechada', current.revenue], ['Conversão da coorte (%)', current.conversion.toFixed(1)], ['Taxa de contato (%)', current.contactRate.toFixed(1)],
      ['Taxa de ganho (%)', current.winRate.toFixed(1)], ['Pipeline ativo', current.activePipeline], ['Previsão ponderada', current.weightedPipeline], [],
      ['ORIGENS', 'Leads', 'Vendas', 'Conversão (%)', 'Receita'],
      ...sources.map((item) => [item.source, item.totalLeads, item.wins, item.conversion.toFixed(1), item.revenue]), [],
      ['ALERTAS', 'Recomendação'], ...alerts.map((alert) => [alert.title, alert.description]),
    ]
    const cell = (value: string | number) => {
      const text = String(value)
      const neutralized = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text
      return `"${neutralized.replaceAll('"', '""')}"`
    }
    const blob = new Blob([`\uFEFF${rows.map((row) => row.map(cell).join(';')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = `relatorio-comercial-${range.start}-${range.end}.csv`; anchor.click()
    URL.revokeObjectURL(url)
    notify('success', 'Relatório comercial exportado com os filtros atuais.')
  }

  const maxTrend = Math.max(1, ...trend.map((item) => Math.max(item.leads, item.contacts, item.wins)))
  const maxOutcome = Math.max(1, ...outcomes.map((item) => item.count))
  const maxLoss = Math.max(1, ...losses.map((item) => item.count))
  const maxSource = Math.max(1, ...sources.map((item) => item.totalLeads))
  const maxFunnel = Math.max(1, ...funnel.map((item) => item.reachedCount))

  return (
    <div className="page-stack metrics-page metrics-page--intelligence">
      <section className="metrics-command-bar">
        <div>
          <span className="eyebrow"><BarChart3 size={14} /> Inteligência comercial</span>
          <h2>Métricas que orientam a operação</h2>
          <p>Compare períodos, encontre gargalos e transforme os dados do CRM em prioridades comerciais.</p>
        </div>
        <div className="metrics-command-bar__filters">
          <label><span><UsersRound size={13} /> Responsável</span><select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}><option value="">Toda a equipe</option>{ownerOptions.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label>
          <label><span><Filter size={13} /> Origem</span><select value={source} onChange={(event) => setSource(event.target.value)}><option value="">Todas as origens</option>{sourceOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span><CalendarCheck2 size={13} /> Período</span><select value={days} onChange={(event) => setDays(Number(event.target.value))}><option value="7">7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option><option value="180">180 dias</option><option value="365">12 meses</option></select></label>
          <div className="metrics-report-actions"><Button size="sm" variant="secondary" onClick={() => { setOwnerId(''); setSource(''); setDays(30) }}><RotateCcw size={15} /> Limpar</Button><Button size="sm" variant="secondary" onClick={() => window.print()}><Printer size={15} /> PDF</Button><Button size="sm" onClick={downloadReport}><Download size={15} /> Exportar relatório</Button></div>
        </div>
      </section>

      <nav className="metrics-view-tabs" aria-label="Áreas de métricas">
        <button className={tab === 'overview' ? 'is-active' : ''} onClick={() => setTab('overview')}><Gauge /> Visão executiva</button>
        <button className={tab === 'funnel' ? 'is-active' : ''} onClick={() => setTab('funnel')}><Funnel /> Funil</button>
        <button className={tab === 'losses' ? 'is-active' : ''} onClick={() => setTab('losses')}><TrendingDown /> Perdas</button>
        <button className={tab === 'activities' ? 'is-active' : ''} onClick={() => setTab('activities')}><Activity /> Atividades</button>
        <button className={tab === 'forecast' ? 'is-active' : ''} onClick={() => setTab('forecast')}><LineChart /> Previsão</button>
      </nav>

      {tab === 'overview' ? <>
        <section className="metric-grid metrics-executive-grid">
          <article className="metric-card metric-card--priority"><span className="metric-card__icon"><UsersRound /></span><div><small>Novos leads</small><strong>{current.leads.length}</strong><ComparisonBadge comparison={comparisons.leads} /></div></article>
          <article className="metric-card"><span className="metric-card__icon metric-card__icon--green"><CircleDollarSign /></span><div><small>Receita fechada</small><strong>{formatCurrency(current.revenue)}</strong><ComparisonBadge comparison={comparisons.revenue} /></div></article>
          <article className="metric-card"><span className="metric-card__icon metric-card__icon--orange"><Contact /></span><div><small>Taxa de contato</small><strong>{percent(current.contactRate)}</strong><ComparisonBadge comparison={comparisons.contactRate} /></div></article>
          <article className="metric-card"><span className="metric-card__icon metric-card__icon--purple"><Target /></span><div><small>Conversão de leads</small><strong>{percent(current.conversion)}</strong><ComparisonBadge comparison={comparisons.conversion} /></div></article>
        </section>

        <section className="metrics-kpi-strip">
          <article><span><PhoneCall /></span><div><small>Ligações</small><strong>{current.calls.length}</strong></div><ComparisonBadge comparison={comparisons.calls} /></article>
          <article><span><CalendarCheck2 /></span><div><small>Reuniões realizadas</small><strong>{current.completedMeetings.length}</strong></div><ComparisonBadge comparison={comparisons.meetings} /></article>
          <article><span><Layers3 /></span><div><small>Propostas</small><strong>{current.proposals}</strong></div><ComparisonBadge comparison={comparisons.proposals} /></article>
          <article><span><Trophy /></span><div><small>Taxa de ganho</small><strong>{percent(current.winRate)}</strong></div><ComparisonBadge comparison={comparisons.winRate} /></article>
        </section>

        <section className="metrics-overview-grid">
          <article className="panel metrics-trend-panel">
            <div className="panel__heading"><div><span className="eyebrow">Evolução do período</span><h3>Geração e avanço comercial</h3></div><ChartNoAxesCombined size={21} /></div>
            <div className="metrics-legend"><span><i className="is-leads" /> Leads</span><span><i className="is-contacts" /> Contatos</span><span><i className="is-wins" /> Vendas</span></div>
            <div className="metrics-column-chart">{trend.map((item) => <div className="metrics-column-chart__group" key={item.label}><div><i className="is-leads" style={{ height: `${Math.max(3, item.leads / maxTrend * 100)}%` }} title={`${item.leads} leads`} /><i className="is-contacts" style={{ height: `${Math.max(3, item.contacts / maxTrend * 100)}%` }} title={`${item.contacts} contatos`} /><i className="is-wins" style={{ height: `${Math.max(3, item.wins / maxTrend * 100)}%` }} title={`${item.wins} vendas`} /></div><span>{item.label}</span></div>)}</div>
          </article>

          <article className="panel metrics-alert-panel">
            <div className="panel__heading"><div><span className="eyebrow">Alertas inteligentes</span><h3>O que exige atenção agora</h3></div><AlertTriangle size={21} /></div>
            <div className="metrics-alert-list">{alerts.map((alert) => <article className={`metrics-alert metrics-alert--${alert.tone}`} key={alert.id}><span><AlertIcon alert={alert} /></span><div><strong>{alert.title}</strong><p>{alert.description}</p></div></article>)}</div>
          </article>
        </section>

        <section className="metrics-overview-grid">
          <article className="panel">
            <div className="panel__heading"><div><span className="eyebrow">Origem dos melhores leads</span><h3>Qualidade por canal</h3></div><PieChart size={21} /></div>
            {sources.length ? <div className="metrics-source-table">{sources.slice(0, 6).map((item) => <div key={item.source}><div><strong>{item.source}</strong><small>{item.totalLeads} leads · {item.wins} venda(s)</small></div><div className="metrics-source-table__bar"><i style={{ width: `${Math.max(3, item.totalLeads / maxSource * 100)}%` }} /></div><span>{percent(item.conversion)}</span><b>{formatCurrency(item.revenue)}</b></div>)}</div> : <p className="empty-copy">Nenhuma origem encontrada.</p>}
          </article>

          <article className="panel">
            <div className="panel__heading"><div><span className="eyebrow">Desempenho por responsável</span><h3>Produtividade e resultado</h3></div><UsersRound size={21} /></div>
            {owners.length ? <div className="metrics-owner-list">{owners.slice(0, 6).map((owner, index) => <article key={owner.id}><span>{index + 1}</span><div><strong>{owner.name}</strong><small>{owner.contacts.length} contatos · {owner.completedMeetings.length} reuniões · {owner.proposals} propostas</small></div><div><b>{formatCurrency(owner.revenue)}</b><small>{percent(owner.winRate)} ganho</small></div></article>)}</div> : <p className="empty-copy">Nenhum responsável com dados no período.</p>}
          </article>
        </section>
      </> : null}

      {tab === 'funnel' ? <>
        <section className="metrics-summary-banner"><div><span><Funnel /></span><div><small>Pipeline ativo</small><strong>{formatCurrency(current.activePipeline)}</strong></div></div><div><small>Previsão ponderada</small><strong>{formatCurrency(current.weightedPipeline)}</strong></div><div><small>Leads parados</small><strong>{funnel.reduce((sum, item) => sum + item.stalled, 0)}</strong></div><div><small>Tempo médio ativo</small><strong>{funnel.length ? `${averageNumber(funnel.map((item) => item.avgDays)).toFixed(1)} dias` : '0 dias'}</strong></div></section>
        <section className="panel metrics-funnel-professional">
          <div className="panel__heading"><div><span className="eyebrow">Funil comercial</span><h3>Volume, conversão e velocidade por etapa</h3></div><Funnel size={21} /></div>
          <div className="metrics-funnel-head"><span>Etapa</span><span>Volume alcançado</span><span>Conversão</span><span>Tempo médio</span><span>Em risco</span></div>
          <div className="metrics-funnel-list">{funnel.map((item) => <article key={item.stage.id}><div><i style={{ background: item.stage.color }} /><span><strong>{item.stage.name}</strong><small>{item.count} atual · {formatCurrency(item.value)}</small></span></div><div className="metrics-funnel-volume"><span><i style={{ width: `${Math.max(4, item.reachedCount / maxFunnel * 100)}%`, background: item.stage.color }} /></span><b>{item.reachedCount}</b></div><strong>{percent(item.conversionFromPrevious)}</strong><strong>{item.avgDays.toFixed(1)} dias</strong><StatusPill tone={item.stalled ? 'warning' : 'success'}>{item.stalled ? `${item.stalled} parado(s)` : 'Saudável'}</StatusPill></article>)}</div>
        </section>
        <section className="metrics-overview-grid"><article className="panel"><div className="panel__heading"><div><span className="eyebrow">Gargalos</span><h3>Etapas que acumulam oportunidades</h3></div><Clock3 /></div><div className="metrics-risk-list">{[...funnel].sort((a, b) => b.avgDays - a.avgDays).slice(0, 5).map((item) => <div key={item.stage.id}><span style={{ background: item.stage.color }} /><div><strong>{item.stage.name}</strong><small>{item.count} lead(s) na etapa</small></div><b>{item.avgDays.toFixed(1)} dias</b></div>)}</div></article><article className="panel metrics-diagnosis"><div className="panel__heading"><div><span className="eyebrow">Leitura do funil</span><h3>Interpretação operacional</h3></div><Crosshair /></div><ul><li><strong>Maior concentração:</strong> {[...funnel].sort((a, b) => b.count - a.count)[0]?.stage.name ?? 'Sem dados'}.</li><li><strong>Maior tempo parado:</strong> {[...funnel].sort((a, b) => b.avgDays - a.avgDays)[0]?.stage.name ?? 'Sem dados'}.</li><li><strong>Conversão final:</strong> {percent(current.winRate)} entre negócios encerrados.</li><li><strong>Receita ponderada:</strong> {formatCurrency(current.weightedPipeline)} considerando a probabilidade de cada etapa.</li></ul></article></section>
      </> : null}

      {tab === 'losses' ? <>
        <section className="metric-grid metrics-executive-grid"><article className="metric-card"><span className="metric-card__icon metric-card__icon--red"><TrendingDown /></span><div><small>Negócios perdidos</small><strong>{current.losses.length}</strong><span>{range.label}</span></div></article><article className="metric-card"><span className="metric-card__icon metric-card__icon--orange"><CircleDollarSign /></span><div><small>Receita perdida</small><strong>{formatCurrency(current.losses.reduce((sum, lead) => sum + lead.value, 0))}</strong><span>Valor potencial não convertido</span></div></article><article className="metric-card"><span className="metric-card__icon metric-card__icon--purple"><Trophy /></span><div><small>Taxa de ganho</small><strong>{percent(current.winRate)}</strong><ComparisonBadge comparison={comparisons.winRate} /></div></article><article className="metric-card"><span className="metric-card__icon"><Layers3 /></span><div><small>Aceite de propostas</small><strong>{percent(current.proposalAcceptanceRate)}</strong><span>{current.wins.length} venda(s) / {current.proposals} proposta(s)</span></div></article></section>
        <section className="metrics-overview-grid"><article className="panel"><div className="panel__heading"><div><span className="eyebrow">Motivos de perda</span><h3>Onde a receita está escapando</h3></div><TrendingDown /></div>{losses.length ? <div className="metrics-loss-list">{losses.map((item) => <div key={item.reason}><div><span>{item.reason}</span><strong>{item.count}</strong></div><div><i style={{ width: `${item.count / maxLoss * 100}%` }} /></div><small>{percent(item.share)} · {formatCurrency(item.value)}</small></div>)}</div> : <div className="metrics-empty-success"><Trophy /><strong>Nenhuma perda registrada</strong><p>Não há negócios perdidos no período e nos filtros selecionados.</p></div>}</article><article className="panel metrics-diagnosis"><div className="panel__heading"><div><span className="eyebrow">Qualidade do registro</span><h3>Diagnóstico das perdas</h3></div><SearchCheck /></div><ul><li><strong>Motivo mais recorrente:</strong> {losses[0]?.reason ?? 'não identificado'}.</li><li><strong>Sem motivo registrado:</strong> {losses.find((item) => item.reason === 'Sem motivo registrado')?.count ?? 0} negócio(s).</li><li><strong>Ação recomendada:</strong> torne o motivo obrigatório ao marcar um lead como perdido.</li><li><strong>Uso estratégico:</strong> conecte objeções, playbooks e mensagens aos motivos mais frequentes.</li></ul></article></section>
      </> : null}

      {tab === 'activities' ? <>
        <section className="metric-grid metrics-executive-grid"><article className="metric-card"><span className="metric-card__icon"><PhoneCall /></span><div><small>Ligações realizadas</small><strong>{current.calls.length}</strong><ComparisonBadge comparison={comparisons.calls} /></div></article><article className="metric-card"><span className="metric-card__icon metric-card__icon--green"><Contact /></span><div><small>Contatos efetivos</small><strong>{current.contacts.length}</strong><span>{percent(current.contactRate)} das tentativas</span></div></article><article className="metric-card"><span className="metric-card__icon metric-card__icon--orange"><CalendarCheck2 /></span><div><small>Reuniões realizadas</small><strong>{current.completedMeetings.length}</strong><span>{percent(current.meetingShowRate)} de comparecimento</span></div></article><article className="metric-card"><span className="metric-card__icon metric-card__icon--purple"><Clock3 /></span><div><small>Duração média</small><strong>{duration(current.averageCallDuration)}</strong><span>Por ligação registrada</span></div></article></section>
        <section className="metrics-overview-grid"><article className="panel"><div className="panel__heading"><div><span className="eyebrow">Resultados das ligações</span><h3>Efetividade por desfecho</h3></div><PhoneCall /></div>{outcomes.length ? <div className="outcome-list metrics-outcome-list">{outcomes.map((item) => <div key={item.key}><span>{item.label}</span><strong>{item.count}</strong><div><i style={{ width: `${item.count / maxOutcome * 100}%` }} /></div></div>)}</div> : <p className="empty-copy">Nenhuma ligação no período selecionado.</p>}</article><article className="panel"><div className="panel__heading"><div><span className="eyebrow">Melhor momento para contato</span><h3>Dia, horário e velocidade</h3></div><Clock3 /></div><div className="metrics-best-time"><article><span><CalendarCheck2 /></span><div><small>Melhor dia</small><strong>{activity.bestDay?.label ?? 'Sem dados'}</strong><p>{activity.bestDay ? `${percent(activity.bestDay.rate)} de contato em ${activity.bestDay.attempts} tentativa(s)` : 'Registre mais ligações para gerar esta leitura.'}</p></div></article><article><span><Clock3 /></span><div><small>Melhor horário</small><strong>{activity.bestHour?.label ?? 'Sem dados'}</strong><p>{activity.bestHour ? `${percent(activity.bestHour.rate)} de contato em ${activity.bestHour.attempts} tentativa(s)` : 'Ainda não há volume suficiente.'}</p></div></article><article><span><Gauge /></span><div><small>Tempo até primeiro contato</small><strong>{activity.avgResponseHours ? hours(activity.avgResponseHours) : 'Sem dados'}</strong><p>Tempo médio entre a entrada do lead e o primeiro contato efetivo.</p></div></article></div></article></section>
        <section className="metrics-summary-banner metrics-summary-banner--activities"><div><span><Activity /></span><div><small>Follow-ups concluídos</small><strong>{activity.completedFollowups.length}</strong></div></div><div><small>Atividades vencidas</small><strong>{activity.overdue.length}</strong></div><div><small>Chamadas positivas</small><strong>{activity.positiveCalls.length}</strong></div><div><small>Taxa de contato</small><strong>{percent(current.contactRate)}</strong></div></section>
      </> : null}

      {tab === 'forecast' ? <>
        <section className="metrics-forecast-hero"><div><span className="eyebrow"><LineChart size={14} /> Previsão comercial</span><h2>{formatCurrency(forecast.projectedRevenue)}</h2><p>Projeção de receita para o período com base no realizado, ritmo atual e probabilidade do Pipeline.</p><div><StatusPill tone="info">{forecast.projectedWins} venda(s) projetada(s)</StatusPill><StatusPill tone={forecast.projectedRevenue >= forecast.currentRevenue + forecast.weightedByStage * .7 ? 'success' : 'warning'}>{formatCurrency(forecast.currentRevenue)} já realizado</StatusPill></div></div><ChartNoAxesCombined /></section>
        <section className="metrics-forecast-grid"><article><span><Trophy /></span><small>Realizado</small><strong>{formatCurrency(forecast.currentRevenue)}</strong><p>Receita já conquistada no período.</p></article><article><span><Gauge /></span><small>Ritmo atual</small><strong>{formatCurrency(forecast.runRateRevenue)}</strong><p>Projeção mantendo o ritmo observado.</p></article><article><span><Target /></span><small>Previsão ponderada</small><strong>{formatCurrency(forecast.weightedByStage)}</strong><p>Pipeline ajustado pelas probabilidades das etapas.</p></article><article><span><Flag /></span><small>Comprometido</small><strong>{formatCurrency(forecast.committed)}</strong><p>Oportunidades com probabilidade de 75% ou mais.</p></article><article><span><TrendingUp /></span><small>Cenário otimista</small><strong>{formatCurrency(forecast.optimistic + forecast.currentRevenue)}</strong><p>Todo o Pipeline ativo convertido.</p></article></section>
        <section className="metrics-overview-grid"><article className="panel"><div className="panel__heading"><div><span className="eyebrow">Acompanhamento das metas</span><h3>Ritmo e risco do período</h3></div><Goal /></div>{activeGoals.length ? <div className="metrics-goal-list">{activeGoals.map((goal) => { const progress = goalProgress(snapshot!, goal.metric, goal.targetValue, goal.periodStart, goal.periodEnd, goal.userId); const formattedValue = goalMetricUnits[goal.metric] === 'currency' ? formatCurrency(progress.value) : integer(progress.value); const formattedTarget = goalMetricUnits[goal.metric] === 'currency' ? formatCurrency(goal.targetValue) : integer(goal.targetValue); return <article key={goal.id}><div><strong>{goalMetricLabels[goal.metric]}</strong><small>{goal.userName || 'Equipe'} · {formattedValue} de {formattedTarget}</small></div><div className="metrics-goal-list__track"><i style={{ width: `${Math.min(100, progress.percentage)}%` }} /></div><StatusPill tone={progress.pace === 'on_track' ? 'success' : progress.pace === 'attention' ? 'warning' : 'danger'}>{progress.percentage}%</StatusPill></article> })}</div> : <p className="empty-copy">Nenhuma meta ativa para o filtro selecionado.</p>}</article><article className="panel metrics-diagnosis"><div className="panel__heading"><div><span className="eyebrow">Leitura da previsão</span><h3>Cenário para decisão</h3></div><Crosshair /></div><ul><li><strong>Receita projetada:</strong> {formatCurrency(forecast.projectedRevenue)} no fechamento do período.</li><li><strong>Pipeline ponderado:</strong> {formatCurrency(forecast.weightedByStage)} com base na probabilidade atual.</li><li><strong>Oportunidades maduras:</strong> {formatCurrency(forecast.committed)} em etapas com 75% ou mais de chance.</li><li><strong>Próxima ação:</strong> priorize propostas sem retorno e oportunidades paradas nas etapas finais.</li></ul></article></section>
      </> : null}
    </div>
  )
}

const averageNumber = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
