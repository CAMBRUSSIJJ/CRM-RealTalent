import { NativeSelectionSelect } from '../../components/selection'
import { Crosshair, Funnel, Layers3, Settings2, Target, TrendingUp } from 'lucide-react'
import { useMemo, useState, type CSSProperties } from 'react'
import { Button } from '../../components/ui/button'
import { StatusPill } from '../../components/ui/status-pill'
import { formatCurrency } from '../../domain/formatters'
import type { Lead, PipelineStage } from '../../domain/types'
import type { calculateFunnelIntelligence } from '../../services/metrics'

type FunnelItem = ReturnType<typeof calculateFunnelIntelligence>[number]

interface VisualFunnelProps {
  items: FunnelItem[]
  leads: Lead[]
  selectedStageId: string | null
  onSelectStage(stageId: string): void
  onEditStage(stage: PipelineStage): void
  onOpenLead(leadId: string): void
  onOpenPipeline(): void
}

const percent = (value: number) => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value)}%`

export function VisualFunnel({ items, leads, selectedStageId, onSelectStage, onEditStage, onOpenLead, onOpenPipeline }: VisualFunnelProps) {
  const [hoveredStageId, setHoveredStageId] = useState<string | null>(null)
  const [widthMode, setWidthMode] = useState<'volume' | 'value'>('volume')
  const activeStageId = hoveredStageId ?? selectedStageId ?? items[0]?.stage.id ?? null
  const active = items.find((item) => item.stage.id === activeStageId) ?? items[0] ?? null
  const maxReached = Math.max(1, ...items.map((item) => item.reachedCount))
  const maxValue = Math.max(1, ...items.map((item) => item.value))
  const activeLeads = useMemo(
    () => active ? leads.filter((lead) => lead.stageId === active.stage.id).sort((a, b) => b.value - a.value) : [],
    [active, leads],
  )

  if (!items.length) return <section className="panel metrics-visual-funnel metrics-visual-funnel--empty"><Funnel /><h3>Funil sem etapas</h3><p>Configure as etapas do Pipeline para visualizar conversão, valor e velocidade.</p><Button onClick={onOpenPipeline}>Abrir Pipeline</Button></section>

  return <section className="panel metrics-visual-funnel metrics-visual-funnel-v10171">
    <header className="metrics-visual-funnel__header metrics-visual-funnel-v10171__header">
      <div>
        <span className="eyebrow"><Funnel size={14} /> Funil comercial</span>
        <h3>Volume e conversão por etapa</h3>
        <p>Compare as etapas sem esconder os números. Clique em uma linha para abrir o diagnóstico no painel lateral.</p>
      </div>
      <div className="metrics-visual-funnel__actions metrics-visual-funnel__actions-v10171">
        <label className="metrics-funnel-width-mode-v10171"><span>Largura por</span><NativeSelectionSelect value={widthMode} onChange={(event) => setWidthMode(event.target.value as 'volume' | 'value')}><option value="volume">Quantidade de negócios</option><option value="value">Valor atual</option></NativeSelectionSelect></label>
        <Button size="sm" variant="secondary" onClick={() => active && onEditStage(active.stage)} disabled={!active}><Settings2 size={15} /> Editar etapa</Button>
        <Button size="sm" variant="secondary" onClick={onOpenPipeline}><Layers3 size={15} /> Abrir Pipeline</Button>
      </div>
    </header>

    <div className="metrics-visual-funnel__workspace metrics-visual-funnel-v10171__workspace">
      <div className="metrics-funnel-bars-v10171" role="list" aria-label="Etapas do funil comercial">
        <div className="metrics-funnel-bars-v10171__head" aria-hidden="true"><span>Etapa</span><span>Representação</span><span>Atual</span><span>Conversão</span></div>
        {items.map((item, index) => {
          const metricValue = widthMode === 'volume' ? item.reachedCount : item.value
          const metricMax = widthMode === 'volume' ? maxReached : maxValue
          const width = Math.max(5, Math.min(100, metricValue / metricMax * 100))
          const isActive = active?.stage.id === item.stage.id
          const style = { '--funnel-stage-color': item.stage.color, '--funnel-stage-width': `${width}%` } as CSSProperties
          return <button
            type="button"
            className={`metrics-funnel-bars-v10171__row${isActive ? ' is-active' : ''}`}
            style={style}
            key={item.stage.id}
            role="listitem"
            onMouseEnter={() => setHoveredStageId(item.stage.id)}
            onMouseLeave={() => setHoveredStageId(null)}
            onFocus={() => setHoveredStageId(item.stage.id)}
            onBlur={() => setHoveredStageId(null)}
            onClick={() => onSelectStage(item.stage.id)}
            aria-pressed={selectedStageId === item.stage.id}
            title={`${item.stage.name}: ${item.reachedCount} alcançaram · ${item.count} agora · ${percent(item.conversionFromPrevious)} conversão · ${formatCurrency(item.value)}`}
          >
            <span className="metrics-funnel-bars-v10171__identity"><i>{index + 1}</i><b>{item.stage.name}</b></span>
            <span className="metrics-funnel-bars-v10171__track"><i /></span>
            <span className="metrics-funnel-bars-v10171__value"><strong>{widthMode === 'volume' ? item.count : formatCurrency(item.value)}</strong><small>{widthMode === 'volume' ? `${item.reachedCount} alcançaram` : `${item.count} negócio(s)`}</small></span>
            <span className="metrics-funnel-bars-v10171__conversion"><strong>{percent(item.conversionFromPrevious)}</strong><small>{item.avgDays.toFixed(1)} dias</small></span>
          </button>
        })}
      </div>

      {active ? <aside className="metrics-visual-funnel__detail metrics-visual-funnel-v10171__detail" aria-live="polite">
        <div className="metrics-visual-funnel__detail-title">
          <span style={{ background: active.stage.color }} />
          <div><small>Etapa em foco</small><h4>{active.stage.name}</h4></div>
        </div>
        <div className="metrics-visual-funnel__detail-grid">
          <article><Crosshair /><span><small>Na etapa</small><strong>{active.count}</strong></span></article>
          <article><TrendingUp /><span><small>Conversão</small><strong>{percent(active.conversionFromPrevious)}</strong></span></article>
          <article><Target /><span><small>Probabilidade</small><strong>{active.stage.probability}%</strong></span></article>
          <article><Layers3 /><span><small>Valor atual</small><strong>{formatCurrency(active.value)}</strong></span></article>
        </div>
        <div className="metrics-visual-funnel__health">
          <div><span>Tempo médio</span><strong>{active.avgDays.toFixed(1)} dias</strong></div>
          <div><span>Oportunidades paradas</span><StatusPill tone={active.stalled ? 'warning' : 'success'}>{active.stalled ? `${active.stalled} em risco` : 'Saudável'}</StatusPill></div>
        </div>
        <div className="metrics-visual-funnel__lead-list">
          <div className="metrics-visual-funnel__lead-list-head"><strong>Negócios nesta etapa</strong><span>{activeLeads.length}</span></div>
          {activeLeads.length ? activeLeads.slice(0, 5).map((lead) => <button type="button" key={lead.id} onClick={() => onOpenLead(lead.id)}>
            <span><strong>{lead.company || lead.name}</strong><small>{lead.ownerName || 'Sem responsável'}</small></span>
            <b>{formatCurrency(lead.value)}</b>
          </button>) : <p>Nenhum negócio está atualmente nesta etapa.</p>}
        </div>
      </aside> : null}
    </div>
  </section>
}
