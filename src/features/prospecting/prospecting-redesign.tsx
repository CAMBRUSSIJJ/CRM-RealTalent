import { ArrowRight, CheckCircle2, MapPinned, Pause, Play, Plus, Search, ShieldCheck, Sparkles, Upload, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { ProspectingAgentHealth, ProspectingAgentJob, ProspectingAreaMode, ProspectingCategoryMode } from '../../services/prospecting-linux-agent'

export type ProspectingRedesignTab = 'search' | 'results' | 'history'

interface ProspectingRedesignShellProps {
  activeTab: ProspectingRedesignTab
  reviewCount: number
  sentCount: number
  suggestionSegment?: string
  suggestionCity?: string
  canCreate: boolean
  onImport(): void
  onNewSearch(): void
  onUseSuggestion(): void
  onSearchTab(): void
  onReviewTab(): void
  onCrm(): void
  onHistoryTab(): void
  children: ReactNode
}

export function ProspectingRedesignShell(props: ProspectingRedesignShellProps) {
  const [showSuggestion, setShowSuggestion] = useState(true)
  const suggestion = [props.suggestionSegment, props.suggestionCity].filter(Boolean).join(' em ')

  return <section className="prospecting-redesign-v4" aria-label="Garimpo">
    <header className="prospecting-redesign-v4__header">
      <div>
        <span className="prospecting-redesign-v4__eyebrow">PROSPECÇÃO TERRITORIAL</span>
        <h1>Garimpo</h1>
        <p>Encontre empresas em uma região, valide as melhores e leve só o que faz sentido para a sua operação.</p>
      </div>
      {props.canCreate ? <div className="prospecting-redesign-v4__header-actions">
        <button type="button" className="prospecting-redesign-v4__button" onClick={props.onImport}><Upload size={16}/> Importar</button>
        <button type="button" className="prospecting-redesign-v4__button is-primary" onClick={props.onNewSearch}><Plus size={16}/> Nova busca</button>
      </div> : null}
    </header>

    {showSuggestion && suggestion ? <div className="prospecting-redesign-v4__suggestion">
      <Sparkles size={18}/>
      <div><strong>Sugestão da IA:</strong> comece por {suggestion}, com base nos registros da sua carteira.</div>
      <button type="button" className="prospecting-redesign-v4__button is-small" onClick={props.onUseSuggestion}>Usar na busca</button>
      <button type="button" className="prospecting-redesign-v4__icon-button" aria-label="Dispensar sugestão" onClick={() => setShowSuggestion(false)}><X size={17}/></button>
    </div> : null}

    <nav className="prospecting-redesign-v4__tabs" aria-label="Etapas do Garimpo">
      <button type="button" className={props.activeTab === 'search' ? 'is-active' : ''} onClick={props.onSearchTab}><span>1</span>Buscar</button>
      <button type="button" className={props.activeTab === 'results' ? 'is-active' : ''} onClick={props.onReviewTab}><span>2</span>Revisar<em>{props.reviewCount}</em></button>
      <button type="button" onClick={props.onCrm}><span>3</span>No CRM<em>{props.sentCount}</em></button>
      <button type="button" className={`is-history ${props.activeTab === 'history' ? 'is-active' : ''}`} onClick={props.onHistoryTab}>Histórico</button>
    </nav>

    {props.children}
  </section>
}

interface ProspectingRedesignSearchProps {
  segment: string
  city: string
  quantity: number
  categoryMode: ProspectingCategoryMode
  areaMode: ProspectingAreaMode
  radiusKm: number
  canEdit: boolean
  agentBusy: boolean
  agentHealth: ProspectingAgentHealth | null
  job: ProspectingAgentJob | null
  baseTotal: number
  sentCount: number
  readyCount: number
  attentionCount: number
  mapPanel: ReactNode
  onSegment(value: string): void
  onCity(value: string): void
  onQuantity(value: number): void
  onCategoryMode(value: ProspectingCategoryMode): void
  onAreaMode(value: ProspectingAreaMode): void
  onRadiusKm(value: number): void
  onStart(): void
  onControl(action: 'pause' | 'resume' | 'cancel'): void
  onDetails(): void
}

const statusLabel: Record<ProspectingAgentJob['status'], string> = {
  queued: 'Preparando', running: 'Buscando', paused: 'Pausado', completed: 'Concluído', cancelled: 'Cancelado', failed: 'Erro',
}

export function ProspectingRedesignSearch(props: ProspectingRedesignSearchProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const active = Boolean(props.job && ['queued', 'running', 'paused'].includes(props.job.status))
  const found = props.job?.stats.unique ?? 0
  const ready = props.job?.processing?.ready ?? props.readyCount
  const attention = props.job?.processing?.attention ?? props.attentionCount
  const target = props.job?.input.targetQuantity ?? props.quantity
  const coverage = props.job?.coverage?.successfulTerritoryPercent ?? props.job?.coverage?.territoryPercent
  const executionFinished = Boolean(props.job && ['completed', 'failed', 'cancelled'].includes(props.job.status))
  const progress = executionFinished ? 100 : Math.max(0, Math.min(99, Math.round((found / Math.max(1, target)) * 100)))
  const coverageLabel = coverage == null ? 'não medida' : `${Math.round(coverage)}%`
  const coverageFailed = Number(props.job?.coverage?.failedCells ?? 0) > 0
  const currentActivity = props.job?.runtime?.phaseLabel || props.job?.message || 'Pronto para iniciar uma nova busca.'
  // SearchSession canônica: durante uma execução, título, território, mapa e status leem o input imutável do job.
  const sessionSegment = props.job?.input.segment || props.segment
  const sessionCity = props.job?.input.regions?.join('; ') || props.city
  const sessionAreaMode = props.job?.input.areaMode || props.areaMode
  const sessionRadiusKm = props.job?.input.radiusKm ?? props.radiusKm
  const currentRegion = props.job?.runtime?.currentRegion || props.job?.progress.currentRegion || sessionCity || 'Região principal'
  const sourceLabel = props.job?.runtime?.currentSource || props.job?.progress.currentSource || 'Web pública + OpenStreetMap'
  const areaLabel = props.areaMode === 'city' ? 'Cidade inteira' : props.areaMode === 'neighborhoods' ? 'Bairros' : props.areaMode === 'map' ? 'Área desenhada' : `Raio de ${props.radiusKm} km`
  const sessionAreaLabel = sessionAreaMode === 'city' ? 'Cidade inteira' : sessionAreaMode === 'neighborhoods' ? 'Bairros' : sessionAreaMode === 'map' ? 'Área desenhada' : `Raio de ${sessionRadiusKm} km`
  const canStart = props.canEdit && !props.agentBusy && !active && Boolean(props.segment.trim() && props.city.trim())
  const raw = props.job?.processing?.raw ?? props.job?.stats.discovered ?? 0
  const rejected = (props.job?.runtime?.counters.rejectedCategory ?? 0) + (props.job?.runtime?.counters.rejectedLocation ?? 0) + (props.job?.stats.webRejectedDocuments ?? 0)
  const duplicates = props.job?.runtime?.counters.duplicates ?? props.job?.stats.duplicates ?? 0
  const semanticPlanner = props.job?.plan?.semanticPlan?.planner || ''


  return <div className="prospecting-redesign-v4__grid">
    <div className="prospecting-redesign-v4__left">
      <section className={`prospecting-redesign-v4__execution ${active ? 'is-active' : ''}`}>
        <div className="prospecting-redesign-v4__execution-head">
          <span>Execução atual{props.job ? ` · ${props.job.id.slice(0, 8)}` : ''}</span>
          <em className={`is-${props.job?.status ?? 'idle'}`}>{props.job ? statusLabel[props.job.status] : 'Pronto'}</em>
        </div>
        <h2>{sessionSegment || 'Nova prospecção'} · {sessionCity || 'Defina a região'}</h2>
        <div className="prospecting-redesign-v4__progress-row"><div><span style={{ width: `${progress}%` }}/></div><strong>{progress}%</strong></div>
        <p>{props.job?.stats.queries ?? 0} consultas · {sourceLabel}{semanticPlanner ? ` · plano IA ${semanticPlanner}` : ''}</p>
        <div className="prospecting-redesign-v4__now"><i/><span><strong>Agora:</strong> {currentActivity}{currentRegion ? ` · ${currentRegion}` : ''}</span></div>
        <div className="prospecting-redesign-v4__execution-metrics">
          <div><strong>{found}</strong><span>Encontradas agora</span></div>
          <div className="is-ready"><strong>{ready}</strong><span>Prontas agora</span></div>
          <div className="is-attention"><strong>{attention}</strong><span>Precisam atenção</span></div>
        </div>
        <small>{raw} bruto(s) · {rejected} filtrado(s) · {duplicates} duplicidade(s) · <span aria-label="Base total">Base total {props.baseTotal}</span> · {props.sentCount} enviadas ao CRM</small>
        <div className="prospecting-redesign-v4__execution-actions">
          <button type="button" className="prospecting-redesign-v4__button" onClick={props.onDetails}>Ver detalhes</button>
          {props.job?.status === 'running' ? <button type="button" className="prospecting-redesign-v4__button" disabled={props.agentBusy} onClick={() => props.onControl('pause')}><Pause size={15}/> Pausar</button> : null}
          {props.job?.status === 'paused' ? <button type="button" className="prospecting-redesign-v4__button" disabled={props.agentBusy} onClick={() => props.onControl('resume')}><Play size={15}/> Continuar</button> : null}
          {active ? <button type="button" className="prospecting-redesign-v4__cancel" disabled={props.agentBusy} onClick={() => props.onControl('cancel')}>Cancelar</button> : null}
        </div>
      </section>

      <section className="prospecting-redesign-v4__search-card">
        <h2>Nova busca</h2>
        <label><span>O que você procura?</span><div className="prospecting-redesign-v4__input-wrap"><input id="prospecting-linux-segment" value={props.segment} onChange={(event) => props.onSegment(event.target.value)} placeholder="Ex.: Barbearias" disabled={!props.canEdit || active}/>{props.segment ? <button type="button" aria-label="Limpar" onClick={() => props.onSegment('')}><X size={16}/></button> : null}</div></label>
        <label><span>Onde?</span><div className="prospecting-redesign-v4__input-wrap"><input id="prospecting-linux-regions" value={props.city} onChange={(event) => props.onCity(event.target.value)} placeholder="Ex.: Rio Grande, RS" disabled={!props.canEdit || active}/>{props.city ? <button type="button" aria-label="Limpar" onClick={() => props.onCity('')}><X size={16}/></button> : null}</div></label>
        <label><span>Área da busca</span><div className="prospecting-redesign-v4__readout"><MapPinned size={15}/>{areaLabel}</div></label>
        <div className={`prospecting-redesign-v4__scope-note ${props.categoryMode === 'exact' ? 'is-exact' : 'is-related'}`}><ShieldCheck size={16}/><span><strong>{props.categoryMode === 'exact' ? 'Alta precisão:' : 'Correspondência relacionada:'}</strong> {props.categoryMode === 'exact' ? `prioriza e valida ${props.segment || 'empresas do segmento'} dentro de ${props.city || 'sua região'}; listas, diretórios e locais fora do território são filtrados antes da revisão.` : 'inclui categorias comercialmente próximas para ampliar a cobertura.'}</span></div>
        <button type="button" className="prospecting-redesign-v4__advanced-trigger" onClick={() => setAdvancedOpen((value) => !value)}>Opções avançadas <ArrowRight size={15} className={advancedOpen ? 'is-open' : ''}/></button>
        {advancedOpen ? <div className="prospecting-redesign-v4__advanced">
          <label><span>Quantidade</span><select value={props.quantity} onChange={(event) => props.onQuantity(Number(event.target.value))} disabled={!props.canEdit || active}>{[20,40,60,80,100].map((value) => <option key={value} value={value}>{value} empresas</option>)}</select></label>
          <label><span>Correspondência</span><select value={props.categoryMode} onChange={(event) => props.onCategoryMode(event.target.value as ProspectingCategoryMode)} disabled={!props.canEdit || active}><option value="exact">Exata</option><option value="related">Relacionada</option></select></label>
          <label><span>Território</span><select value={props.areaMode} onChange={(event) => props.onAreaMode(event.target.value as ProspectingAreaMode)} disabled={!props.canEdit || active}><option value="city">Cidade inteira</option><option value="neighborhoods">Bairros</option><option value="radius">Raio</option><option value="map">Área desenhada</option></select></label>
          {props.areaMode === 'radius' ? <label><span>Raio</span><input type="number" min={1} max={100} value={props.radiusKm} onChange={(event) => props.onRadiusKm(Math.max(1, Number(event.target.value) || 1))} disabled={!props.canEdit || active}/></label> : null}
          <div className="prospecting-redesign-v4__engine-status"><i className={props.agentHealth?.ok ? 'is-ok' : ''}/>{props.agentHealth?.ok ? `Serviço do Garimpo ativo · V${props.agentHealth.version}` : 'Serviço do Garimpo será verificado ao iniciar'}</div>
        </div> : null}
        <button type="button" className="prospecting-redesign-v4__button is-primary is-start" disabled={!canStart} onClick={props.onStart}><Search size={16}/>{active ? 'Busca em andamento' : props.agentBusy ? 'Iniciando…' : 'Iniciar busca'}</button>
      </section>
    </div>

    <section className="prospecting-redesign-v4__map prospecting-redesign-v4__map-live" aria-label={`Território da execução em ${sessionCity || 'sua região'}`}>
      <div className="prospecting-redesign-v4__map-live-content">{props.mapPanel}</div>
      <div className={`prospecting-redesign-v4__map-status ${coverageFailed ? 'is-warning' : ''}`}>
        {props.job ? <><CheckCircle2 size={17}/><strong>{found} empresa(s) identificada(s).</strong><span> Execução {executionFinished ? 'encerrada' : 'em andamento'} · cobertura territorial {coverageLabel}{coverageFailed ? ' · fonte territorial com falha parcial' : ''}.</span></> : <><MapPinned size={17}/><strong>Defina a área real da busca.</strong><span> Carregue a cidade e ajuste o raio ou desenhe o território diretamente no mapa.</span></>}
      </div>
    </section>
  </div>
}
