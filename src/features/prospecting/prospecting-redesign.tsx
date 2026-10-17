import { ArrowRight, Building2, CheckCircle2, MapPinned, Pause, Play, Plus, Search, ShieldCheck, Sparkles, Upload, X } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
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
  const progress = Math.max(0, Math.min(100, Math.round(coverage ?? (props.job?.status === 'completed' ? 100 : (found / Math.max(1, target)) * 100))))
  const currentActivity = props.job?.runtime?.phaseLabel || props.job?.message || 'Pronto para iniciar uma nova busca.'
  const currentRegion = props.job?.runtime?.currentRegion || props.job?.progress.currentRegion || props.city || 'Região principal'
  const sourceLabel = props.job?.runtime?.currentSource || props.job?.progress.currentSource || 'OpenStreetMap + Web'
  const areaLabel = props.areaMode === 'city' ? 'Cidade inteira' : props.areaMode === 'neighborhoods' ? 'Bairros' : props.areaMode === 'map' ? 'Área desenhada' : `Raio de ${props.radiusKm} km`
  const canStart = props.canEdit && !props.agentBusy && !active && Boolean(props.segment.trim() && props.city.trim())

  const markers = useMemo(() => Array.from({ length: Math.min(12, Math.max(0, found)) }, (_, index) => ({
    left: 18 + ((index * 19) % 68),
    top: 24 + ((index * 23) % 50),
  })), [found])

  return <div className="prospecting-redesign-v4__grid">
    <div className="prospecting-redesign-v4__left">
      <section className={`prospecting-redesign-v4__execution ${active ? 'is-active' : ''}`}>
        <div className="prospecting-redesign-v4__execution-head">
          <span>Execução atual{props.job ? ` · ${props.job.id.slice(0, 8)}` : ''}</span>
          <em className={`is-${props.job?.status ?? 'idle'}`}>{props.job ? statusLabel[props.job.status] : 'Pronto'}</em>
        </div>
        <h2>{props.segment || 'Nova prospecção'} · {props.city || 'Defina a região'}</h2>
        <div className="prospecting-redesign-v4__progress-row"><div><span style={{ width: `${progress}%` }}/></div><strong>{progress}%</strong></div>
        <p>{props.job?.stats.queries ?? 0} consultas · {sourceLabel}</p>
        <div className="prospecting-redesign-v4__now"><i/><span><strong>Agora:</strong> {currentActivity}{currentRegion ? ` · ${currentRegion}` : ''}</span></div>
        <div className="prospecting-redesign-v4__execution-metrics">
          <div><strong>{found}</strong><span>Encontradas</span></div>
          <div className="is-ready"><strong>{ready}</strong><span>Prontas</span></div>
          <div className="is-attention"><strong>{attention}</strong><span>Precisam atenção</span></div>
        </div>
        <small>Base total {props.baseTotal} · {props.sentCount} enviadas ao CRM</small>
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
        <div className={`prospecting-redesign-v4__scope-note ${props.categoryMode === 'exact' ? 'is-exact' : 'is-related'}`}><ShieldCheck size={16}/><span><strong>{props.categoryMode === 'exact' ? 'Correspondência exata:' : 'Correspondência relacionada:'}</strong> {props.categoryMode === 'exact' ? `só ${props.segment || 'empresas do segmento'} dentro de ${props.city || 'sua região'} entram nos resultados.` : 'inclui categorias comercialmente próximas para ampliar a cobertura.'}</span></div>
        <button type="button" className="prospecting-redesign-v4__advanced-trigger" onClick={() => setAdvancedOpen((value) => !value)}>Opções avançadas <ArrowRight size={15} className={advancedOpen ? 'is-open' : ''}/></button>
        {advancedOpen ? <div className="prospecting-redesign-v4__advanced">
          <label><span>Quantidade</span><select value={props.quantity} onChange={(event) => props.onQuantity(Number(event.target.value))} disabled={!props.canEdit || active}>{[20,40,60,80,100].map((value) => <option key={value} value={value}>{value} empresas</option>)}</select></label>
          <label><span>Correspondência</span><select value={props.categoryMode} onChange={(event) => props.onCategoryMode(event.target.value as ProspectingCategoryMode)} disabled={!props.canEdit || active}><option value="exact">Exata</option><option value="related">Relacionada</option></select></label>
          <label><span>Território</span><select value={props.areaMode} onChange={(event) => props.onAreaMode(event.target.value as ProspectingAreaMode)} disabled={!props.canEdit || active}><option value="city">Cidade inteira</option><option value="neighborhoods">Bairros</option><option value="radius">Raio</option><option value="map">Área desenhada</option></select></label>
          {props.areaMode === 'radius' ? <label><span>Raio</span><input type="number" min={1} max={100} value={props.radiusKm} onChange={(event) => props.onRadiusKm(Math.max(1, Number(event.target.value) || 1))} disabled={!props.canEdit || active}/></label> : null}
          <div className="prospecting-redesign-v4__engine-status"><i className={props.agentHealth?.ok ? 'is-ok' : ''}/>{props.agentHealth?.ok ? `Motor local ativo · V${props.agentHealth.version}` : 'Motor local será verificado ao iniciar'}</div>
        </div> : null}
        <button type="button" className="prospecting-redesign-v4__button is-primary is-start" disabled={!canStart} onClick={props.onStart}><Search size={16}/>{active ? 'Busca em andamento' : props.agentBusy ? 'Iniciando…' : 'Iniciar busca'}</button>
      </section>
    </div>

    <section className="prospecting-redesign-v4__map" aria-label={`Prévia do território de busca em ${props.city || 'sua região'}`}>
      <svg viewBox="0 0 800 700" preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true">
        <rect width="800" height="700" className="prospecting-redesign-v4__map-ground"/>
        <path d="M0 520 C120 470 220 560 340 540 C470 520 560 600 800 560 L800 700 L0 700 Z" className="prospecting-redesign-v4__map-water"/>
        <g className="prospecting-redesign-v4__roads is-major"><path d="M-10 180 L810 120"/><path d="M-10 330 L810 300"/><path d="M140 -10 L190 710"/><path d="M430 -10 L400 710"/><path d="M650 -10 L700 710"/></g>
        <g className="prospecting-redesign-v4__roads"><path d="M-10 90 L810 60 M-10 250 L810 215 M-10 420 L810 380 M60 -10 L90 710 M290 -10 L270 710 M540 -10 L560 710"/></g>
        <path d="M90 130 L720 105 L745 470 L560 520 L330 500 L110 440 Z" className="prospecting-redesign-v4__territory"/>
      </svg>
      {markers.map((marker, index) => <span key={index} className="prospecting-redesign-v4__marker" style={{ left: `${marker.left}%`, top: `${marker.top}%` }}><Building2 size={12}/></span>)}
      <div className="prospecting-redesign-v4__map-labels"><span>Área: {areaLabel.toLowerCase()}</span><span>{props.city || 'Defina a região'}</span></div>
      <div className="prospecting-redesign-v4__zoom"><button type="button" aria-label="Aproximar">+</button><button type="button" aria-label="Afastar">−</button></div>
      <div className="prospecting-redesign-v4__map-status">{found ? <><CheckCircle2 size={17}/><strong>{found} empresa(s) encontrada(s).</strong><span> Os resultados aparecem no mapa durante a execução.</span></> : <><strong>Aguardando os primeiros resultados.</strong><span> As empresas aparecem aqui no mapa assim que forem encontradas.</span></>}</div>
    </section>
  </div>
}
