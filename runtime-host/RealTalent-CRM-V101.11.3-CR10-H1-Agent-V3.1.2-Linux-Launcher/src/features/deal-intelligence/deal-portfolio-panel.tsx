import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, CircleDollarSign, Minus, ShieldAlert, Sparkles, UserRoundX, WalletCards } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { formatCurrency } from '../../domain/formatters'
import { momentumLabel, type DealIntelligence, type DealPortfolio } from '../../services/deal-intelligence'
import '../../styles/deal-intelligence-v10062.css'

interface Props {
  portfolio: DealPortfolio
  title?: string
  maxItems?: number
  onOpen(deal: DealIntelligence): void
  onExecute?(deal: DealIntelligence): void
}

const MomentumIcon = ({ value }: { value: DealIntelligence['momentum'] }) => value === 'accelerating' ? <ArrowUpRight size={15} /> : value === 'cooling' ? <ArrowDownRight size={15} /> : <Minus size={15} />

export function DealPortfolioPanel({ portfolio, title = 'Pipeline Intelligence', maxItems = 5, onOpen, onExecute }: Props) {
  return <section className="deal-portfolio-panel">
    <div className="deal-portfolio-kpis">
      <article><span><Sparkles size={16} /> Saúde média</span><strong>{portfolio.averageHealth}</strong><small>{portfolio.critical} crítico(s) · {portfolio.attention} em atenção</small></article>
      <article className={portfolio.atRiskValue ? 'is-warning' : ''}><span><ShieldAlert size={16} /> Valor em risco</span><strong>{formatCurrency(portfolio.atRiskValue)}</strong><small>{portfolio.criticalValue ? `${formatCurrency(portfolio.criticalValue)} críticos` : 'sem valor crítico'}</small></article>
      <article><span><CircleDollarSign size={16} /> Forecast RealTalent</span><strong>{formatCurrency(portfolio.predictedValue)}</strong><small>de {formatCurrency(portfolio.activeValue)} ativos</small></article>
      <article className={portfolio.missingDecisionMaker ? 'is-warning' : ''}><span><UserRoundX size={16} /> Sem decisor</span><strong>{portfolio.missingDecisionMaker}</strong><small>{portfolio.noNextStep} sem próximo passo</small></article>
    </div>

    <article className="panel deal-priority-panel">
      <header><div><span className="eyebrow"><Sparkles size={13} /> {title}</span><h3>Negócios que exigem atenção</h3></div><span className="deal-priority-panel__count">{portfolio.priorities.length}</span></header>
      <div className="deal-priority-list">
        {portfolio.priorities.slice(0, maxItems).map((deal, index) => <div className={`deal-priority-row deal-priority-row--${deal.healthLevel}`} key={deal.lead.id}>
          <span className="deal-priority-rank">{index + 1}</span>
          <button type="button" className="deal-priority-row__main" onClick={() => onOpen(deal)}>
            <span><strong>{deal.lead.name}</strong><small>{deal.lead.company || deal.stage?.name || 'Oportunidade'}</small></span>
            <span className="deal-priority-health"><b>{deal.healthScore}</b><small>{deal.healthLabel}</small></span>
            <span className={`deal-momentum deal-momentum--${deal.momentum}`}><MomentumIcon value={deal.momentum} /> {momentumLabel(deal.momentum)}</span>
            <span><strong>{formatCurrency(deal.commercialValue)}</strong><small>{deal.risks[0]?.title ?? 'Sem risco crítico'}</small></span>
          </button>
          {onExecute ? <Button size="sm" variant={deal.nextBestAction.urgency === 'now' ? 'primary' : 'secondary'} onClick={() => onExecute(deal)}>{deal.nextBestAction.title}<ArrowRight size={14} /></Button> : <button type="button" className="icon-button" onClick={() => onOpen(deal)} aria-label={`Abrir ${deal.lead.name}`}><ArrowRight size={16} /></button>}
        </div>)}
        {!portfolio.priorities.length ? <div className="deal-portfolio-empty"><CheckCircle2 size={22} /><strong>Nenhum negócio ativo</strong><span>O Deal Intelligence aparece assim que houver oportunidades em andamento.</span></div> : null}
      </div>
      <footer><span><WalletCards size={15} /> {portfolio.cooling} negócio(s) esfriando</span><span><AlertTriangle size={15} /> {portfolio.proposalRisks} risco(s) de proposta</span></footer>
    </article>
  </section>
}
