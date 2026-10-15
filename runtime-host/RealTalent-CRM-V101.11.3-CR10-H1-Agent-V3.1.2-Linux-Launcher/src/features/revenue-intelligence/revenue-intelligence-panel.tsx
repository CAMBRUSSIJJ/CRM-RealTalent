import '../../styles/revenue-intelligence-v10081.css'
import { useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowLeft, ArrowRight, BadgeDollarSign, CalendarRange,
  CircleDollarSign, Gauge, PackageSearch, ShieldCheck, Target, TrendingUp, Trophy, UsersRound, Waypoints,
} from 'lucide-react'
import type { ProposalRecord, WorkspaceSnapshot } from '../../domain/types'
import { formatCurrency } from '../../domain/formatters'
import { StatusPill } from '../../components/ui/status-pill'
import { calculateRevenueIntelligence, type RevenueDealProjection, type RevenueForecastRiskSeverity } from '../../services/revenue-intelligence'
import { calculateRevenueSeries } from '../../services/revenue-forecast'
import { useExperience } from '../experience/experience-context'

const monthRef = (offset: number) => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + offset, 1, 12, 0, 0, 0)
}
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value)) : 'Sem data'
const percent = (value: number | null) => value === null ? '—' : `${Math.round(value)}%`
const signedPercent = (value: number | null) => value === null ? 'Sem base anterior' : `${value >= 0 ? '+' : ''}${Math.round(value)}% vs. mês anterior`
const multiple = (value: number | null) => value === null ? '—' : !Number.isFinite(value) ? 'Meta atingida' : `${value.toFixed(1)}×`
const categoryLabel = (value: string) => value === 'best_case' ? 'Best Case' : value === 'commit' ? 'Commit' : value === 'closed' ? 'Fechado' : value === 'omitted' ? 'Fora' : 'Pipeline'
const confidenceLabel = (value: string) => value === 'high' ? 'Alta' : value === 'medium' ? 'Média' : 'Baixa'
const riskTone = (severity: RevenueForecastRiskSeverity) => severity === 'critical' ? 'danger' : severity === 'high' ? 'warning' : severity === 'medium' ? 'info' : 'neutral'
const momentumLabel = (value: RevenueDealProjection['momentum']) => value === 'accelerating' ? 'Acelerando' : value === 'cooling' ? 'Esfriando' : 'Estável'
const forecastSectionIds = ['forecast-command', 'forecast-definitions', 'forecast-kpis', 'forecast-scenarios', 'forecast-coverage', 'forecast-risks', 'forecast-owners', 'forecast-breakdowns', 'forecast-conversion', 'forecast-deals'] as const
type ForecastSectionId = (typeof forecastSectionIds)[number]
type ForecastPreset = 'executive' | 'sales' | 'revenue' | 'complete'
const forecastPresets: Record<ForecastPreset, ReadonlySet<ForecastSectionId>> = {
  executive: new Set<ForecastSectionId>(['forecast-command', 'forecast-kpis', 'forecast-scenarios', 'forecast-coverage', 'forecast-risks', 'forecast-owners']),
  sales: new Set<ForecastSectionId>(['forecast-command', 'forecast-kpis', 'forecast-risks', 'forecast-owners', 'forecast-deals']),
  revenue: new Set<ForecastSectionId>(['forecast-command', 'forecast-definitions', 'forecast-kpis', 'forecast-coverage', 'forecast-breakdowns', 'forecast-conversion']),
  complete: new Set<ForecastSectionId>(forecastSectionIds),
}

interface RevenueIntelligencePanelProps {
  snapshot: WorkspaceSnapshot
  onOpenProposal?(proposal: ProposalRecord): void
}

export function RevenueIntelligencePanel({ snapshot, onOpenProposal }: RevenueIntelligencePanelProps) {
  const experience = useExperience()
  const [monthOffset, setMonthOffset] = useState(0)
  const [dealFilter, setDealFilter] = useState<'all' | 'risk' | 'drift'>('all')
  const reference = useMemo(() => monthRef(monthOffset), [monthOffset])
  const intelligence = useMemo(() => calculateRevenueIntelligence(snapshot, reference), [reference, snapshot])
  const series = useMemo(() => calculateRevenueSeries(snapshot, 6, reference), [reference, snapshot])
  const maxSeries = Math.max(1, ...series.flatMap((item) => [item.recognized, item.forecast]))
  const filteredDeals = intelligence.deals.filter((deal) => dealFilter === 'all' || (dealFilter === 'risk' ? deal.atRisk : deal.manualCategory !== deal.suggestedCategory))

  const openDeal = (deal: RevenueDealProjection) => {
    if (!deal.proposalId || !onOpenProposal) return
    const proposal = snapshot.proposals.find((item) => item.id === deal.proposalId)
    if (proposal) onOpenProposal(proposal)
  }
  const applyForecastPreset = (preset: ForecastPreset) => {
    const page = experience.preferences.pages.proposals
    const preserved = (page?.hiddenSections ?? []).filter((id) => !forecastSectionIds.includes(id as ForecastSectionId))
    const hiddenForecast = forecastSectionIds.filter((id) => !forecastPresets[preset].has(id))
    experience.updatePage('proposals', { hiddenSections: [...preserved, ...hiddenForecast] })
  }

  return <div className="revenue-intelligence-v10081 product-revenue-forecast-v10097">
    <section className="ri-command">
      <div>
        <span className="eyebrow"><TrendingUp size={14}/> Revenue Intelligence</span>
        <h3>Forecast executivo e cobertura de meta</h3>
        <p>Separe bookings, receita reconhecida e cenários futuros usando Deal Health, momentum e probabilidade RealTalent.</p>
      </div>
      <div className="ri-command__controls-v10097">
        <div className="forecast-presets-v10097" aria-label="Visões rápidas do Forecast"><small>Visão</small><div><button type="button" onClick={() => applyForecastPreset('executive')}>Executivo</button><button type="button" onClick={() => applyForecastPreset('sales')}>Vendas</button><button type="button" onClick={() => applyForecastPreset('revenue')}>Receita</button><button type="button" onClick={() => applyForecastPreset('complete')}>Completa</button></div><span>Refine em Configurações → Páginas.</span></div>
        <div className="ri-month-control" aria-label="Período do forecast">
          <button type="button" aria-label="Mês anterior" onClick={() => setMonthOffset((value) => value - 1)}><ArrowLeft size={16}/></button>
          <div><small>Período</small><strong>{intelligence.monthLabel}</strong></div>
          <button type="button" aria-label="Próximo mês" onClick={() => setMonthOffset((value) => value + 1)}><ArrowRight size={16}/></button>
          {monthOffset !== 0 ? <button type="button" className="ri-month-control__today" onClick={() => setMonthOffset(0)}>Atual</button> : null}
        </div>
      </div>
    </section>

    <section className="ri-definition-strip" aria-label="Definições de receita">
      <div><strong>Receita realizada</strong><span>Valor reconhecido na competência. É histórico contábil/comercial, não previsão.</span></div>
      <div><strong>Bookings</strong><span>TCV dos negócios ganhos no período. Fechar uma venda não reconhece receita automaticamente.</span></div>
      <div><strong>Pipeline ponderado</strong><span>Pipeline aberto × probabilidade informada pelo vendedor.</span></div>
      <div><strong>Forecast RealTalent</strong><span>Bookings + contribuição esperada dos negócios usando sinais de Deal Intelligence.</span></div>
    </section>

    <section className="ri-kpi-grid ri-kpi-grid--six">
      <article><span className="ri-kpi-icon ri-kpi-icon--green"><CircleDollarSign/></span><div><small>Receita realizada</small><strong>{formatCurrency(intelligence.recognizedRevenue)}</strong><em>{signedPercent(intelligence.recognizedRevenueDeltaPercent)}</em></div></article>
      <article><span className="ri-kpi-icon"><CalendarRange/></span><div><small>Receita prevista cadastrada</small><strong>{formatCurrency(intelligence.scheduledRevenue)}</strong><em>lançamentos de competência ainda não reconhecidos</em></div></article>
      <article><span className="ri-kpi-icon ri-kpi-icon--green"><BadgeDollarSign/></span><div><small>Bookings fechados</small><strong>{formatCurrency(intelligence.closedBookings)}</strong><em>{intelligence.closedWonDeals} negócio(s) ganho(s) no período</em></div></article>
      <article><span className="ri-kpi-icon ri-kpi-icon--purple"><Gauge/></span><div><small>Pipeline ponderado</small><strong>{formatCurrency(intelligence.weightedOpenPipeline)}</strong><em>probabilidade comercial sobre o pipeline aberto</em></div></article>
      <article><span className="ri-kpi-icon ri-kpi-icon--blue"><TrendingUp/></span><div><small>Forecast RealTalent</small><strong>{formatCurrency(intelligence.realTalentForecast)}</strong><em>{formatCurrency(intelligence.realTalentExpectedOpenPipeline)} esperado no pipeline aberto</em></div></article>
      <article className={intelligence.gapToGoal > 0 ? 'is-warning' : ''}><span className="ri-kpi-icon ri-kpi-icon--orange"><Target/></span><div><small>Meta comercial · gap esperado</small><strong>{intelligence.goalTarget ? formatCurrency(intelligence.gapToGoal) : 'Sem meta'}</strong><em>{intelligence.goalTarget ? `${percent(intelligence.expectedAttainment)} de atingimento projetado` : 'Configure uma meta de receita'}</em></div></article>
    </section>

    <section className="ri-scenarios" aria-label="Cenários de forecast">
      {intelligence.scenarios.map((scenario) => <article key={scenario.scenario} className={`ri-scenario ri-scenario--${scenario.scenario}`}>
        <span>{scenario.label}</span><strong>{formatCurrency(scenario.value)}</strong><p>{scenario.description}</p>
        {intelligence.goalTarget ? <div><i style={{ width: `${Math.min(100, scenario.value / intelligence.goalTarget * 100)}%` }}/></div> : null}
      </article>)}
    </section>

    <section className="ri-two-columns">
      <article className="panel ri-coverage-card">
        <header><div><span className="eyebrow"><Target size={14}/> Pipeline Coverage</span><h3>Capacidade de bater a meta</h3></div><StatusPill tone={intelligence.pipelineCoverage !== null && Number.isFinite(intelligence.pipelineCoverage) && intelligence.pipelineCoverage < 2 ? 'warning' : 'success'}>{multiple(intelligence.pipelineCoverage)}</StatusPill></header>
        <div className="ri-coverage-main"><div><small>Pipeline aberto no mês</small><strong>{formatCurrency(intelligence.openPipeline)}</strong></div><div><small>Valor ainda necessário</small><strong>{intelligence.goalTarget ? formatCurrency(intelligence.remainingGoal) : '—'}</strong></div></div>
        <div className="ri-coverage-details">
          <div><small>Win rate necessário</small><strong>{percent(intelligence.requiredWinRate)}</strong></div>
          <div><small>Ticket médio aberto</small><strong>{formatCurrency(intelligence.averageDealSize)}</strong></div>
          <div><small>Ticket médio ganho</small><strong>{formatCurrency(intelligence.averageWonTicket)}</strong></div>
          <div><small>Win rate encerrados</small><strong>{percent(intelligence.winRate)}</strong><span>{intelligence.closedWonDeals} ganhos · {intelligence.closedLostDeals} perdidos</span></div>
          <div><small>Valor em risco</small><strong>{formatCurrency(intelligence.atRiskValue)}</strong></div>
          <div><small>Sem data</small><strong>{intelligence.undatedDeals}</strong><span>{formatCurrency(intelligence.undatedValue)}</span></div>
          <div><small>Confiança do forecast</small><strong>{intelligence.forecastConfidenceScore}/100</strong><span>{confidenceLabel(intelligence.forecastConfidence)}</span></div>
        </div>
      </article>

      <article className="panel ri-revenue-card">
        <header><div><span className="eyebrow"><CircleDollarSign size={14}/> Revenue realization</span><h3>Receita reconhecida e recorrência</h3></div><StatusPill tone="info">{intelligence.targetMonth}</StatusPill></header>
        <div className="ri-revenue-values">
          <div><small>Receita reconhecida</small><strong>{formatCurrency(intelligence.recognizedRevenue)}</strong><span>{signedPercent(intelligence.recognizedRevenueDeltaPercent)}</span></div>
          <div><small>Receita prevista registrada</small><strong>{formatCurrency(intelligence.scheduledRevenue)}</strong><span>competências futuras/pendentes do mês</span></div>
          <div><small>MRR reconhecido</small><strong>{formatCurrency(intelligence.recognizedMrr)}</strong><span>base recorrente ativa</span></div>
          <div><small>MRR ativo + previsto</small><strong>{formatCurrency(intelligence.activeMrrForecast)}</strong><span>visão prospectiva</span></div>
        </div>
        <div className="ri-revenue-series">{series.map((item) => <article key={item.month}><span>{item.month}</span><div><i className="is-recognized" style={{ height: `${Math.max(4, item.recognized / maxSeries * 100)}%` }} title={`Reconhecido ${formatCurrency(item.recognized)}`}/><i className="is-forecast" style={{ height: `${Math.max(4, item.forecast / maxSeries * 100)}%` }} title={`Forecast ${formatCurrency(item.forecast)}`}/></div></article>)}</div>
      </article>
    </section>

    <section className="panel ri-risk-panel">
      <header><div><span className="eyebrow"><AlertTriangle size={14}/> Forecast risks</span><h3>O que pode derrubar a previsão</h3></div><span>{intelligence.risks.length} alerta(s)</span></header>
      {intelligence.risks.length ? <div className="ri-risk-list">{intelligence.risks.map((risk) => <article key={risk.key}><StatusPill tone={riskTone(risk.severity)}>{risk.severity === 'critical' ? 'Crítico' : risk.severity === 'high' ? 'Alto' : risk.severity === 'medium' ? 'Médio' : 'Baixo'}</StatusPill><div><strong>{risk.title}</strong><p>{risk.detail}</p><small>Próxima ação: {risk.suggestedAction}</small></div>{risk.value !== undefined ? <strong>{formatCurrency(risk.value)}</strong> : null}</article>)}</div> : <div className="ri-empty-success"><ShieldCheck size={20}/><div><strong>Forecast sem alerta estrutural</strong><span>Os sinais atuais não indicam risco relevante de cobertura ou qualidade.</span></div></div>}
    </section>

    <section className="panel ri-owner-panel">
      <header><div><span className="eyebrow"><UsersRound size={14}/> Forecast por responsável</span><h3>Contribuição da equipe</h3></div><span>{intelligence.owners.length} responsável(is)</span></header>
      {intelligence.owners.length ? <div className="ri-owner-table">
        <div className="ri-owner-table__head"><span>Responsável</span><span>Negócios</span><span>Pipeline</span><span>Expected</span><span>Bookings</span><span>Receita</span><span>Em risco</span><span>Health</span></div>
        {intelligence.owners.map((owner) => <article key={`${owner.ownerId ?? 'none'}:${owner.ownerName}`}><div><strong>{owner.ownerName}</strong>{owner.goalTarget ? <small>Meta {formatCurrency(owner.goalTarget)} · {Math.round(owner.attainment)}%</small> : <small>Sem meta individual</small>}</div><strong>{owner.deals}</strong><span>{formatCurrency(owner.pipeline)}</span><span>{formatCurrency(owner.expected)}</span><span>{formatCurrency(owner.bookings)}</span><span>{formatCurrency(owner.recognizedRevenue)}</span><span className={owner.atRisk ? 'is-danger' : ''}>{formatCurrency(owner.atRisk)}</span><span>{owner.averageHealth}/100</span></article>)}
      </div> : <div className="ri-empty-success"><UsersRound size={20}/><div><strong>Sem negócios previstos no período</strong><span>Defina datas de fechamento para distribuir o forecast por responsável.</span></div></div>}
    </section>

    <section className="ri-breakdown-grid">
      <article className="panel ri-breakdown-panel">
        <header><div><span className="eyebrow"><Waypoints size={14}/> Receita por origem</span><h3>Origem comercial e contribuição</h3></div><span>{intelligence.sources.length} origem(ns)</span></header>
        {intelligence.sources.length ? <div className="ri-breakdown-list">{intelligence.sources.slice(0, 8).map((source) => <article key={source.key}><div><strong>{source.label}</strong><small>{Math.round(source.deals)} negócio(s) no forecast</small></div><span><small>Receita</small><strong>{formatCurrency(source.recognizedRevenue)}</strong></span><span><small>Bookings</small><strong>{formatCurrency(source.bookings)}</strong></span><span><small>Expected</small><strong>{formatCurrency(source.expectedForecast)}</strong></span></article>)}</div> : <div className="ri-empty-success"><Waypoints size={20}/><div><strong>Sem origem suficiente para análise</strong><span>Vincule origem aos contatos para medir aquisição até receita.</span></div></div>}
      </article>
      <article className="panel ri-breakdown-panel">
        <header><div><span className="eyebrow"><PackageSearch size={14}/> Receita por produto</span><h3>Mix comercial do período</h3></div><span>{intelligence.products.length} item(ns)</span></header>
        {intelligence.products.length ? <div className="ri-breakdown-list">{intelligence.products.map((product) => <article key={product.key}><div><strong>{product.label}</strong><small>{product.productId ? 'Item do catálogo' : 'Item manual / sem vínculo'}</small></div><span><small>Receita</small><strong>{formatCurrency(product.recognizedRevenue)}</strong></span><span><small>Bookings</small><strong>{formatCurrency(product.bookings)}</strong></span><span><small>Expected</small><strong>{formatCurrency(product.expectedForecast)}</strong></span></article>)}</div> : <div className="ri-empty-success"><PackageSearch size={20}/><div><strong>Sem produto suficiente para análise</strong><span>Use itens do catálogo nas propostas para formar o mix de receita.</span></div></div>}
      </article>
    </section>

    <section className="panel ri-conversion-panel">
      <header><div><span className="eyebrow"><Trophy size={14}/> Conversão comercial</span><h3>Negócios encerrados no período</h3></div><StatusPill tone={intelligence.winRate !== null && intelligence.winRate >= 40 ? 'success' : intelligence.winRate === null ? 'neutral' : 'warning'}>{percent(intelligence.winRate)}</StatusPill></header>
      <div className="ri-conversion-values"><div><small>Ganhos</small><strong>{intelligence.closedWonDeals}</strong></div><div><small>Perdidos</small><strong>{intelligence.closedLostDeals}</strong></div><div><small>Ticket médio ganho</small><strong>{formatCurrency(intelligence.averageWonTicket)}</strong></div><div><small>Receita sem vínculo</small><strong>{formatCurrency(intelligence.unlinkedRevenue)}</strong></div></div>
      <p>A taxa considera negócios marcados como ganhos ou perdidos no mês. Quando não existe uma data explícita de perda, a atualização do lead é usada como referência operacional.</p>
    </section>

    <section className="panel ri-deals-panel">
      <header><div><span className="eyebrow"><CalendarRange size={14}/> Forecast inspection</span><h3>Negócios que formam a previsão</h3></div><div className="ri-deal-filters"><button type="button" className={dealFilter === 'all' ? 'is-active' : ''} onClick={() => setDealFilter('all')}>Todos {intelligence.deals.length}</button><button type="button" className={dealFilter === 'risk' ? 'is-active' : ''} onClick={() => setDealFilter('risk')}>Em risco {intelligence.deals.filter((item) => item.atRisk).length}</button><button type="button" className={dealFilter === 'drift' ? 'is-active' : ''} onClick={() => setDealFilter('drift')}>Revisar categoria {intelligence.suggestedCategoryChanges}</button></div></header>
      {filteredDeals.length ? <div className="ri-deals-table">
        <div className="ri-deals-table__head"><span>Negócio</span><span>Fechamento</span><span>Forecast</span><span>Probabilidade</span><span>Health</span><span>Contribuição esperada</span></div>
        {filteredDeals.map((deal) => <button type="button" key={deal.leadId} onClick={() => openDeal(deal)} disabled={!deal.proposalId || !onOpenProposal}>
          <span className="ri-deal-identity"><strong>{deal.companyName}</strong><small>{deal.ownerName} · {momentumLabel(deal.momentum)}</small>{deal.flags[0] ? <em>{deal.flags[0]}</em> : null}</span>
          <span>{formatDate(deal.expectedCloseAt)}</span>
          <span className={deal.manualCategory !== deal.suggestedCategory ? 'is-drift' : ''}><strong>{categoryLabel(deal.suggestedCategory)}</strong><small>Manual: {categoryLabel(deal.manualCategory)}</small></span>
          <span><strong>{deal.realTalentProbability}%</strong><small>Vendedor {deal.sellerProbability}%</small></span>
          <span className={deal.atRisk ? 'is-danger' : ''}><strong>{deal.healthScore}/100</strong><small>Conf. {deal.confidenceScore}</small></span>
          <span><strong>{formatCurrency(deal.expectedContribution)}</strong><small>de {formatCurrency(deal.value)}</small></span>
        </button>)}
      </div> : <div className="ri-empty-success"><ShieldCheck size={20}/><div><strong>Nenhum negócio neste filtro</strong><span>Altere o filtro ou selecione outro mês.</span></div></div>}
    </section>
  </div>
}
