import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, Gauge, Minus, ShieldAlert, Sparkles, Target, UsersRound } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { formatCurrency, formatDateTime } from '../../domain/formatters'
import { dealHealthTone, momentumLabel, type DealIntelligence } from '../../services/deal-intelligence'
import '../../styles/deal-intelligence-v10062.css'

interface Props {
  insight: DealIntelligence
  readOnly?: boolean
  compact?: boolean
  onExecute?(): void
  onOpenAccount?(): void
}

const MomentumIcon = ({ value }: { value: DealIntelligence['momentum'] }) => value === 'accelerating' ? <ArrowUpRight size={16} /> : value === 'cooling' ? <ArrowDownRight size={16} /> : <Minus size={16} />

export function DealHealthPanel({ insight, readOnly = false, compact = false, onExecute, onOpenAccount }: Props) {
  const tone = dealHealthTone(insight.healthLevel)
  return <section className={`deal-health-panel deal-health-panel--${tone} ${compact ? 'deal-health-panel--compact' : ''}`}>
    <header className="deal-health-panel__header">
      <div className="deal-health-panel__score"><span>Deal Health</span><strong>{insight.healthScore}<small>/100</small></strong><em>{insight.healthLabel}</em></div>
      <div className="deal-health-panel__headline">
        <div><span className="eyebrow"><Sparkles size={13} /> Inteligência do negócio</span><h3>{insight.lead.company || insight.lead.name}</h3><p>{insight.stage?.name ?? 'Sem etapa'} · {formatCurrency(insight.commercialValue)}</p></div>
        <span className={`deal-momentum deal-momentum--${insight.momentum}`}><MomentumIcon value={insight.momentum} /> {momentumLabel(insight.momentum)}</span>
      </div>
      <div className="deal-health-panel__probability">
        <span><small>Vendedor</small><strong>{insight.sellerProbability}%</strong></span>
        <ArrowRight size={15} />
        <span><small>RealTalent</small><strong>{insight.realTalentProbability}%</strong></span>
      </div>
    </header>

    {!compact ? <>
      <div className="deal-health-panel__metrics">
        <div><UsersRound size={16} /><span><small>Cobertura da conta</small><strong>{insight.accountCoverage}%</strong></span></div>
        <div><Target size={16} /><span><small>Relacionamento</small><strong>{insight.relationshipScore}%</strong></span></div>
        <div><Gauge size={16} /><span><small>Última interação</small><strong>{insight.lastInteractionAt ? formatDateTime(insight.lastInteractionAt) : 'Sem interação'}</strong></span></div>
        <div><ShieldAlert size={16} /><span><small>Riscos abertos</small><strong>{insight.risks.length}</strong></span></div>
      </div>

      <div className="deal-health-components">
        {insight.components.map((component) => <div className="deal-health-component" key={component.key}>
          <div><span>{component.label}</span><strong>{component.score}</strong></div>
          <span className="deal-health-component__track"><i style={{ width: `${component.score}%` }} /></span>
          <small>{component.reasons[0]} · peso {component.weight}%</small>
        </div>)}
      </div>

      <div className="deal-health-panel__signals">
        <div className="deal-risk-column">
          <h4><AlertTriangle size={16} /> Riscos</h4>
          {insight.risks.length ? insight.risks.slice(0, 4).map((risk) => <article key={risk.key} className={`deal-risk deal-risk--${risk.severity}`}><span /><div><strong>{risk.title}</strong><p>{risk.detail}</p><small>{risk.suggestedAction}</small></div></article>) : <div className="deal-signal-empty"><CheckCircle2 size={17} /> Nenhum risco relevante detectado.</div>}
        </div>
        <div className="deal-positive-column">
          <h4><CheckCircle2 size={16} /> Sinais positivos</h4>
          {insight.positiveSignals.length ? insight.positiveSignals.slice(0, 4).map((signal) => <article key={signal.key}><CheckCircle2 size={15} /><div><strong>{signal.label}</strong><p>{signal.detail}</p></div></article>) : <div className="deal-signal-empty">Ainda não há sinais positivos fortes registrados.</div>}
        </div>
      </div>
    </> : null}

    <div className="deal-next-best-action">
      <div><span>Próxima melhor ação</span><strong>{insight.nextBestAction.title}</strong><p>{insight.nextBestAction.explanation}</p><small>Objetivo: {insight.nextBestAction.objective}</small></div>
      <div>{onOpenAccount && ['map_stakeholder'].includes(insight.nextBestAction.kind) ? <Button size="sm" variant="secondary" onClick={onOpenAccount}><UsersRound size={15} /> Account 360</Button> : null}{!readOnly && onExecute ? <Button size="sm" onClick={onExecute}><Sparkles size={15} /> Executar</Button> : null}</div>
    </div>
  </section>
}
