import '../../styles/calling-workspace-operational.css'
import { NativeSelectionSelect } from '../../components/selection'
import '../../styles/coaching-playbooks-v10065.css'
import '../../styles/playbooks-v10082.css'
import { BarChart3, BookOpenText, Check, CheckCircle2, ChevronLeft, ChevronRight, Clipboard, Filter, LayoutGrid, Lightbulb, ListChecks, MessageSquareWarning, Pencil, Phone, PlayCircle, Plus, Presentation, RotateCcw, Search, ShieldCheck, Sparkles, Target, Trash2, TrendingUp, Users, Workflow, WandSparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAppActions, useAppNavigation, useAppUi, useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { StatusPill } from '../../components/ui/status-pill'
import { WorkspaceDisplayMenu, WorkspaceFilterMenu, WorkspaceViewStrip, type WorkspaceFilterField } from '../../components/workspace/workspace-filter-system'
import type { Playbook, PlaybookExecutionMode, PlaybookKind, PlaybookObjective } from '../../domain/types'
import { copyTextToClipboard } from '../../lib/browser-actions'
import { buildTeamCoachingSummary, playbookCoverage } from '../../services/coaching-engine'
import { CALL_SESSION_OBJECTIVES } from '../../services/call-session-intelligence'
import { readCallingStrategyPreferences, saveCallingStrategyPreferences, type CallingStrategyPreferences } from '../../services/calling-strategy'
import { derivePlaybookSteps, executionModeLabels, playbookExecutionCoverage, recommendedExecutionMode } from '../../services/playbook-execution'
import { PlaybookModal } from './playbook-modal'
import { PlaybookStudioWorkspace } from './playbook-studio-workspace'
import { MindMapCanvas } from '../../components/visualization/mind-map-canvas'

const kindLabel: Record<PlaybookKind, string> = { script: 'Script', objection: 'Objeção', battlecard: 'Battlecard', checklist: 'Checklist' }
const kindIcon = (kind: PlaybookKind) => kind === 'objection' ? <MessageSquareWarning /> : kind === 'battlecard' ? <ShieldCheck /> : kind === 'checklist' ? <Target /> : <BookOpenText />
const modeIcon = (mode: PlaybookExecutionMode) => mode === 'checklist' ? <ListChecks size={16}/> : mode === 'call' ? <Phone size={16}/> : mode === 'meeting' ? <Users size={16}/> : <PlayCircle size={16}/>

type View = 'strategy' | 'library' | 'execution' | 'coaching'
type LibraryView = 'cards' | 'full' | 'mindmap' | 'flow'
type PlaybookSavedView = {
  id: string
  name: string
  libraryView: LibraryView
  filters: {
    kind: 'all' | PlaybookKind
    status: 'all' | 'active' | 'inactive'
    execution: 'all' | PlaybookExecutionMode
    context: 'all' | 'contextual' | 'general'
    stage: string
    objective: string
    temperature: 'all' | 'cold' | 'warm' | 'hot'
    segment: string
    persona: string
  }
}

function checklistStorageKey(workspaceId: string | undefined, playbookId: string) { return `realtalent.playbook-checklist.v10082.${workspaceId ?? 'local'}.${playbookId}` }
function libraryViewsStorageKey(workspaceId: string | undefined) { return `realtalent.playbooks.library-views.v10168.${workspaceId ?? 'local'}` }

export function PlaybooksPage() {
  const { snapshot, canWrite, currentWorkspace } = useAppWorkspace()
  const { routeContext, navigate, clearRouteContext } = useAppNavigation()
  const { notify, confirmAction, promptAction } = useAppUi()
  const { deletePlaybook } = useAppActions()
  const [view, setView] = useState<View>('library')
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'all' | PlaybookKind>('all')
  const [libraryView, setLibraryView] = useState<LibraryView>('cards')
  const [libraryFiltersOpen, setLibraryFiltersOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [executionFilter, setExecutionFilter] = useState<'all' | PlaybookExecutionMode>('all')
  const [contextFilter, setContextFilter] = useState<'all' | 'contextual' | 'general'>('all')
  const [stageFilter, setStageFilter] = useState('all')
  const [objectiveFilter, setObjectiveFilter] = useState('all')
  const [temperatureFilter, setTemperatureFilter] = useState<'all' | 'cold' | 'warm' | 'hot'>('all')
  const [segmentFilter, setSegmentFilter] = useState('all')
  const [personaFilter, setPersonaFilter] = useState('all')
  const [savedLibraryViews, setSavedLibraryViews] = useState<PlaybookSavedView[]>([])
  const [activeLibraryViewId, setActiveLibraryViewId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Playbook | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [studioOpen, setStudioOpen] = useState(false)
  const [studioEditing, setStudioEditing] = useState<Playbook | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string>('')
  const [executionMode, setExecutionMode] = useState<PlaybookExecutionMode>('step_by_step')
  const [stepIndex, setStepIndex] = useState(0)
  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({})
  const [strategy, setStrategy] = useState<CallingStrategyPreferences>(() => readCallingStrategyPreferences(currentWorkspace?.id ?? 'default'))

  const allPlaybooks = snapshot?.playbooks ?? []
  const activePlaybooks = useMemo(() => allPlaybooks.filter((item) => item.active), [allPlaybooks])
  const segmentOptions = useMemo(() => [...new Set(allPlaybooks.flatMap((item) => item.guidance?.segments ?? []))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [allPlaybooks])
  const personaOptions = useMemo(() => [...new Set(allPlaybooks.flatMap((item) => item.guidance?.personas ?? []))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [allPlaybooks])

  const universalPlaybookFilters = useMemo<WorkspaceFilterField[]>(() => [
    { key: 'stage', label: 'Etapa', value: stageFilter, allLabel: 'Todas', group: 'Contexto comercial', options: (snapshot?.stages ?? []).filter((item) => !item.isLost).sort((a, b) => a.order - b.order).map((item) => ({ value: item.id, label: item.name })) },
    { key: 'objective', label: 'Objetivo', value: objectiveFilter, allLabel: 'Todos', group: 'Contexto comercial', options: CALL_SESSION_OBJECTIVES.map((item) => ({ value: item.id, label: item.label })) },
    { key: 'temperature', label: 'Temperatura', value: temperatureFilter, allLabel: 'Todas', group: 'Contexto comercial', options: [{ value: 'cold', label: 'Frio' }, { value: 'warm', label: 'Morno' }, { value: 'hot', label: 'Quente' }] },
    { key: 'segment', label: 'Segmento', value: segmentFilter, allLabel: 'Todos', group: 'Público', options: segmentOptions.map((item) => ({ value: item, label: item })) },
    { key: 'persona', label: 'Persona', value: personaFilter, allLabel: 'Todas', group: 'Público', options: personaOptions.map((item) => ({ value: item, label: item })) },
    { key: 'kind', label: 'Tipo', value: kind, allLabel: 'Todos', group: 'Conteúdo', options: Object.entries(kindLabel).map(([value, label]) => ({ value, label })) },
    { key: 'status', label: 'Status', value: statusFilter, allLabel: 'Todos', group: 'Conteúdo', options: [{ value: 'active', label: 'Ativos' }, { value: 'inactive', label: 'Inativos' }] },
    { key: 'execution', label: 'Modo de execução', value: executionFilter, allLabel: 'Todos', group: 'Execução', options: Object.entries(executionModeLabels).map(([value, label]) => ({ value, label })) },
    { key: 'context', label: 'Contextualização', value: contextFilter, allLabel: 'Todas', group: 'Execução', options: [{ value: 'contextual', label: 'Com regras contextuais' }, { value: 'general', label: 'Uso geral' }] },
  ], [contextFilter, executionFilter, kind, objectiveFilter, personaFilter, personaOptions, segmentFilter, segmentOptions, snapshot?.stages, stageFilter, statusFilter, temperatureFilter])
  const playbooks = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return allPlaybooks.filter((item) => {
      const guidance = item.guidance ?? {}
      const modes = guidance.executionModes?.length ? guidance.executionModes : [recommendedExecutionMode(item)]
      const contextual = Boolean((guidance.objectives?.length ?? 0) + (guidance.stageIds?.length ?? 0) + (guidance.decisionRoles?.length ?? 0) + (guidance.outcomes?.length ?? 0) + (guidance.temperatures?.length ?? 0) + (guidance.segments?.length ?? 0) + (guidance.personas?.length ?? 0))
      const searchable = `${item.title} ${item.category} ${item.content} ${item.tags.join(' ')} ${guidance.coachingFocus ?? ''} ${(guidance.segments ?? []).join(' ')} ${(guidance.personas ?? []).join(' ')} ${(guidance.discoveryQuestions ?? []).join(' ')} ${(guidance.objectionPrompts ?? []).join(' ')} ${(guidance.successCriteria ?? []).join(' ')}`.toLowerCase()
      return (kind === 'all' || item.kind === kind)
        && (statusFilter === 'all' || (statusFilter === 'active' ? item.active : !item.active))
        && (executionFilter === 'all' || modes.includes(executionFilter))
        && (contextFilter === 'all' || (contextFilter === 'contextual' ? contextual : !contextual))
        && (stageFilter === 'all' || (guidance.stageIds ?? []).includes(stageFilter))
        && (objectiveFilter === 'all' || (guidance.objectives ?? []).includes(objectiveFilter as PlaybookObjective))
        && (temperatureFilter === 'all' || (guidance.temperatures ?? []).includes(temperatureFilter))
        && (segmentFilter === 'all' || (guidance.segments ?? []).includes(segmentFilter))
        && (personaFilter === 'all' || (guidance.personas ?? []).includes(personaFilter))
        && (!normalized || searchable.includes(normalized))
    })
  }, [allPlaybooks, contextFilter, executionFilter, kind, objectiveFilter, personaFilter, query, segmentFilter, stageFilter, statusFilter, temperatureFilter])
  const coaching = useMemo(() => buildTeamCoachingSummary({ calls: snapshot?.calls ?? [], leads: snapshot?.leads ?? [], contacts: snapshot?.contacts ?? [], playbooks: allPlaybooks }), [allPlaybooks, snapshot?.calls, snapshot?.contacts, snapshot?.leads])
  const coverage = useMemo(() => playbookCoverage(allPlaybooks, snapshot?.stages ?? []), [allPlaybooks, snapshot?.stages])
  const executionReady = useMemo(() => activePlaybooks.filter((item) => playbookExecutionCoverage(item).ready).length, [activePlaybooks])
  const selected = useMemo(() => activePlaybooks.find((item) => item.id === selectedId) ?? activePlaybooks[0] ?? null, [activePlaybooks, selectedId])
  const steps = useMemo(() => selected ? derivePlaybookSteps(selected) : [], [selected])
  const guidance = selected?.guidance ?? {}
  const availableModes = selected?.guidance?.executionModes?.length ? selected.guidance.executionModes : selected ? [recommendedExecutionMode(selected)] : ['step_by_step'] as PlaybookExecutionMode[]

  const scriptPlaybooks = useMemo(() => activePlaybooks.filter((item) => item.kind === 'script'), [activePlaybooks])
  const strategyDefaultPlaybook = scriptPlaybooks.find((item) => item.id === strategy.defaultPlaybookId) ?? null

  useEffect(() => {
    if (!selected && selectedId) setSelectedId('')
    if (selected && selected.id !== selectedId) setSelectedId(selected.id)
  }, [selected, selectedId])
  useEffect(() => {
    setStrategy(readCallingStrategyPreferences(currentWorkspace?.id ?? 'default'))
  }, [currentWorkspace?.id])
  useEffect(() => {
    try {
      const raw = localStorage.getItem(libraryViewsStorageKey(currentWorkspace?.id))
      const parsed = raw ? JSON.parse(raw) : []
      setSavedLibraryViews(Array.isArray(parsed) ? parsed : [])
    } catch { setSavedLibraryViews([]) }
  }, [currentWorkspace?.id])
  useEffect(() => {
    if (routeContext.filter !== 'strategy') return
    setView('strategy')
    clearRouteContext()
  }, [clearRouteContext, routeContext.filter])
  useEffect(() => {
    if (!selected) return
    const allowed = selected.guidance?.executionModes?.length ? selected.guidance.executionModes : [recommendedExecutionMode(selected)]
    if (!allowed.includes(executionMode)) setExecutionMode(allowed[0])
    setStepIndex(0)
    try {
      const saved = localStorage.getItem(checklistStorageKey(currentWorkspace?.id, selected.id))
      setCheckedSteps(saved ? JSON.parse(saved) : {})
    } catch { setCheckedSteps({}) }
  }, [currentWorkspace?.id, selected?.id])

  const copy = async (content: string) => {
    const result = await copyTextToClipboard(content)
    notify(result.ok ? 'success' : 'error', result.ok ? 'Texto copiado.' : (result.reason ?? 'Não foi possível copiar o texto.'))
  }

  const remove = async (playbook: Playbook) => {
    if (!await confirmAction({ title: `Excluir “${playbook.title}”?`, description: 'O conteúdo deixará de ficar disponível para a equipe.', confirmLabel: 'Excluir playbook', tone: 'danger' })) return
    await deletePlaybook(playbook.id)
  }

  const execute = (playbook: Playbook) => {
    setSelectedId(playbook.id)
    setExecutionMode(recommendedExecutionMode(playbook))
    setStepIndex(0)
    setView('execution')
  }

  const toggleChecklist = (id: string) => {
    if (!selected) return
    setCheckedSteps((current) => {
      const next = { ...current, [id]: !current[id] }
      try { localStorage.setItem(checklistStorageKey(currentWorkspace?.id, selected.id), JSON.stringify(next)) } catch { /* storage unavailable */ }
      return next
    })
  }

  const resetChecklist = () => {
    if (!selected) return
    setCheckedSteps({})
    try { localStorage.removeItem(checklistStorageKey(currentWorkspace?.id, selected.id)) } catch { /* storage unavailable */ }
  }

  const saveStrategy = () => {
    const next = saveCallingStrategyPreferences(currentWorkspace?.id ?? 'default', strategy)
    setStrategy(next)
    notify('success', 'Estratégia de prospecção salva e conectada ao Calling.')
  }

  const saveLibraryView = async () => {
    const name = (await promptAction({ title: 'Salvar visão da Biblioteca', description: 'Guarde filtros e formato de visualização para retornar a este recorte com um clique.', label: 'Nome da visão', confirmLabel: 'Salvar visão', placeholder: 'Ex.: Prospecção fria — donos' }))?.trim()
    if (!name) return
    const view: PlaybookSavedView = {
      id: `playbook-view-${Date.now()}`, name, libraryView,
      filters: { kind, status: statusFilter, execution: executionFilter, context: contextFilter, stage: stageFilter, objective: objectiveFilter, temperature: temperatureFilter, segment: segmentFilter, persona: personaFilter },
    }
    const next = [...savedLibraryViews, view].slice(-20)
    setSavedLibraryViews(next)
    try { localStorage.setItem(libraryViewsStorageKey(currentWorkspace?.id), JSON.stringify(next)) } catch { /* storage unavailable */ }
    setActiveLibraryViewId(view.id)
    notify('success', 'Exibição da Biblioteca salva.')
  }

  const applyLibraryView = (id: string) => {
    const view = savedLibraryViews.find((item) => item.id === id)
    if (!view) return
    setLibraryView(view.libraryView)
    setKind(view.filters.kind ?? 'all')
    setStatusFilter(view.filters.status ?? 'all')
    setExecutionFilter(view.filters.execution ?? 'all')
    setContextFilter(view.filters.context ?? 'all')
    setStageFilter(view.filters.stage ?? 'all')
    setObjectiveFilter(view.filters.objective ?? 'all')
    setTemperatureFilter(view.filters.temperature ?? 'all')
    setSegmentFilter(view.filters.segment ?? 'all')
    setPersonaFilter(view.filters.persona ?? 'all')
    setActiveLibraryViewId(view.id)
  }
  const persistLibraryViews = (next: PlaybookSavedView[]) => { setSavedLibraryViews(next); try { localStorage.setItem(libraryViewsStorageKey(currentWorkspace?.id), JSON.stringify(next)) } catch { /* storage unavailable */ } }
  const renameLibraryView = async (item: PlaybookSavedView) => { const name = (await promptAction({ title: 'Renomear exibição', description: 'Mantém filtros e modo de visualização.', label: 'Nome', initialValue: item.name, confirmLabel: 'Salvar nome' }))?.trim(); if (!name) return; persistLibraryViews(savedLibraryViews.map((viewItem) => viewItem.id === item.id ? { ...viewItem, name } : viewItem)) }
  const duplicateLibraryView = (item: PlaybookSavedView) => { const copy = { ...item, id: `playbook-view-${Date.now()}`, name: `${item.name} — cópia`, filters: { ...item.filters } }; persistLibraryViews([...savedLibraryViews, copy]); setActiveLibraryViewId(copy.id) }
  const deleteLibraryView = (id: string) => { persistLibraryViews(savedLibraryViews.filter((item) => item.id !== id)); if (activeLibraryViewId === id) setActiveLibraryViewId(null) }

  const activeLibraryFilters = [kind !== 'all', statusFilter !== 'all', executionFilter !== 'all', contextFilter !== 'all', stageFilter !== 'all', objectiveFilter !== 'all', temperatureFilter !== 'all', segmentFilter !== 'all', personaFilter !== 'all'].filter(Boolean).length
  const clearLibraryFilters = () => {
    setKind('all'); setStatusFilter('all'); setExecutionFilter('all'); setContextFilter('all')
    setStageFilter('all'); setObjectiveFilter('all'); setTemperatureFilter('all'); setSegmentFilter('all'); setPersonaFilter('all')
  }
  const objectiveLabel = (id: string) => CALL_SESSION_OBJECTIVES.find((item) => item.id === id)?.shortLabel ?? id
  const stageLabel = (id: string) => snapshot?.stages.find((item) => item.id === id)?.name ?? id
  const temperatureLabel: Record<'cold' | 'warm' | 'hot', string> = { cold: 'Frio', warm: 'Morno', hot: 'Quente' }

  if (canWrite && studioOpen) return <PlaybookStudioWorkspace playbook={studioEditing} onClose={() => { setStudioOpen(false); setStudioEditing(null) }} onSaved={(saved) => { setStudioEditing(saved); setSelectedId(saved.id) }} />

  return <div className="page-stack playbooks-page playbooks-page--coaching playbooks-page--v10082">
    <section className="playbooks-command-bar playbooks-command-bar--v10082">
      <div><span className="eyebrow">Strategy Hub · V101.2</span><h2>Estratégia e roteiros comerciais</h2><p>Defina o padrão da prospecção uma vez e deixe o Calling escolher o melhor roteiro sem perder o controle manual.</p></div>
      {canWrite ? <div className="playbooks-command-bar__actions"><Button variant="secondary" onClick={() => { setEditing(null); setModalOpen(true) }}><Pencil size={16}/> Editor clássico</Button><Button onClick={() => { setStudioEditing(null); setStudioOpen(true) }}><Workflow size={17} /> Novo playbook visual</Button></div> : null}
    </section>

    <nav className="playbooks-view-tabs" aria-label="Estratégia, roteiros, execução e coaching">
      <button type="button" className={view === 'strategy' ? 'is-active' : ''} onClick={() => setView('strategy')}><Workflow size={16}/> Estratégia</button>
      <button type="button" className={view === 'library' ? 'is-active' : ''} onClick={() => setView('library')}><BookOpenText size={16}/> Biblioteca <span>{allPlaybooks.length}</span></button>
      <button type="button" className={view === 'execution' ? 'is-active' : ''} onClick={() => setView('execution')}><PlayCircle size={16}/> Executar <span>{activePlaybooks.length}</span></button>
      <button type="button" className={view === 'coaching' ? 'is-active' : ''} onClick={() => setView('coaching')}><BarChart3 size={16}/> Coaching <span>{coaching.reviewedCalls}</span></button>
    </nav>

    {view === 'strategy' ? <section className="playbook-strategy-hub">
      <section className="panel playbook-strategy-hub__hero">
        <div><span className="eyebrow">Estratégia de prospecção</span><h3>Público → Objetivo → Roteiro → Conversa → Resultado</h3><p>O RealTalent usa este padrão ao preparar uma sessão. O vendedor pode trocar o roteiro antes de ligar sem alterar a estratégia da equipe.</p></div>
        <Button onClick={saveStrategy}><Check size={16}/> Salvar estratégia</Button>
      </section>
      <div className="playbook-strategy-hub__flow">
        <article className="panel"><small>1 · Público</small><strong>Contexto do contato</strong><p>Segmento, etapa, persona, temperatura e papel decisório vêm do CRM.</p></article>
        <article className="panel"><small>2 · Objetivo</small><strong>{CALL_SESSION_OBJECTIVES.find((item) => item.id === strategy.defaultObjective)?.shortLabel ?? 'Primeira reunião'}</strong><p>Define discovery, coaching e resultado esperado.</p></article>
        <article className="panel"><small>3 · Roteiro</small><strong>{strategy.autoSelectPlaybook ? 'Seleção automática' : strategyDefaultPlaybook?.title ?? 'Roteiro padrão RealTalent'}</strong><p>{strategy.autoSelectPlaybook ? 'O contexto escolhe o roteiro mais aderente.' : 'Este roteiro será sugerido como padrão da sessão.'}</p></article>
        <article className="panel"><small>4 · Execução</small><strong>{strategy.defaultSessionMode === 'focus' ? 'Focus' : 'Power assistido'}</strong><p>Controla o ritmo sem iniciar chamadas automaticamente.</p></article>
      </div>
      <section className="panel playbook-strategy-hub__settings">
        <div className="panel__heading"><div><span className="eyebrow">Padrão do time</span><h3>Como o Calling deve preparar a sessão</h3></div><WandSparkles size={20}/></div>
        <div className="playbook-strategy-hub__form">
          <label><span>Objetivo padrão</span><NativeSelectionSelect value={strategy.defaultObjective} onChange={(event) => setStrategy((current) => ({ ...current, defaultObjective: event.target.value as CallingStrategyPreferences['defaultObjective'] }))}>{CALL_SESSION_OBJECTIVES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</NativeSelectionSelect></label>
          <label><span>Modo padrão</span><NativeSelectionSelect value={strategy.defaultSessionMode} onChange={(event) => setStrategy((current) => ({ ...current, defaultSessionMode: event.target.value as CallingStrategyPreferences['defaultSessionMode'] }))}><option value="focus">Focus</option><option value="power">Power assistido</option></NativeSelectionSelect></label>
          <label className="playbook-strategy-hub__toggle"><input type="checkbox" checked={strategy.autoSelectPlaybook} onChange={(event) => setStrategy((current) => ({ ...current, autoSelectPlaybook: event.target.checked }))}/><span><strong>Selecionar roteiro automaticamente</strong><small>Usa contexto do contato e targeting configurado nos playbooks.</small></span></label>
          {!strategy.autoSelectPlaybook ? <label><span>Roteiro padrão</span><NativeSelectionSelect value={strategy.defaultPlaybookId} onChange={(event) => setStrategy((current) => ({ ...current, defaultPlaybookId: event.target.value }))}><option value="">Roteiro padrão RealTalent</option>{scriptPlaybooks.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</NativeSelectionSelect></label> : null}
        </div>
      </section>
      <section className="panel playbook-strategy-hub__during">
        <div><span className="eyebrow">Durante a ligação</span><h3>Informação progressiva, não painel lotado</h3><p>Essas preferências controlam o Modo Foco. Contexto, histórico e notas ficam sob demanda.</p></div>
        <div className="playbook-strategy-hub__toggles">
          <label><input type="checkbox" checked={strategy.showAssistantDuringCall} onChange={(event) => setStrategy((current) => ({ ...current, showAssistantDuringCall: event.target.checked }))}/><span>Mostrar Assistant</span></label>
          <label><input type="checkbox" checked={strategy.showHistoryOnDemand} onChange={(event) => setStrategy((current) => ({ ...current, showHistoryOnDemand: event.target.checked }))}/><span>Histórico sob demanda</span></label>
          <label><input type="checkbox" checked={strategy.autosaveNotes} onChange={(event) => setStrategy((current) => ({ ...current, autosaveNotes: event.target.checked }))}/><span>Autosave das anotações</span></label>
          <label><input type="checkbox" checked={strategy.healthAlertsOnly} onChange={(event) => setStrategy((current) => ({ ...current, healthAlertsOnly: event.target.checked }))}/><span>Call Health só quando houver alerta</span></label>
        </div>
      </section>
      <div className="playbook-strategy-hub__actions"><Button variant="secondary" onClick={() => setView('library')}><BookOpenText size={16}/> Ver biblioteca de roteiros</Button><Button variant="secondary" onClick={() => navigate('calls')}><Phone size={16}/> Abrir Ligações</Button></div>
    </section> : null}

    {view === 'library' ? <>
      <section className="playbook-summary-grid playbook-summary-grid--v65">
        <article className="panel playbook-summary"><BookOpenText /><div><strong>{coverage.active}</strong><span>roteiros ativos</span></div></article>
        <article className="panel playbook-summary"><Sparkles /><div><strong>{coverage.contextualRate}%</strong><span>contextualizados</span></div></article>
        <article className="panel playbook-summary"><Target /><div><strong>{coverage.stageCoverage}%</strong><span>cobertura do pipeline</span></div></article>
        <article className="panel playbook-summary"><PlayCircle /><div><strong>{executionReady}</strong><span>prontos para execução</span></div></article>
        <article className="panel playbook-summary"><MessageSquareWarning /><div><strong>{allPlaybooks.filter((item) => item.kind === 'objection').length}</strong><span>objeções estruturadas</span></div></article>
      </section>

      <WorkspaceViewStrip
        items={[
          { id: 'all', label: 'Todos os playbooks', active: kind === 'all' && statusFilter === 'all', favorite: true, accent: 'blue', icon: <BookOpenText size={14}/>, onClick: () => { setActiveLibraryViewId(null); setKind('all'); setStatusFilter('all') } },
          { id: 'scripts', label: 'Scripts', active: kind === 'script', accent: 'blue', icon: <Phone size={14}/>, onClick: () => { setActiveLibraryViewId(null); setKind('script') } },
          { id: 'objections', label: 'Objeções', active: kind === 'objection', accent: 'orange', icon: <MessageSquareWarning size={14}/>, onClick: () => { setActiveLibraryViewId(null); setKind('objection') } },
          { id: 'active', label: 'Ativos', active: statusFilter === 'active' && kind === 'all', accent: 'green', icon: <CheckCircle2 size={14}/>, onClick: () => { setActiveLibraryViewId(null); setKind('all'); setStatusFilter('active') } },
          ...savedLibraryViews.map((item) => ({ id: item.id, label: item.name, active: activeLibraryViewId === item.id, accent: 'purple' as const, icon: <Presentation size={14}/>, onClick: () => applyLibraryView(item.id), menu: [{ label: 'Renomear', onClick: () => void renameLibraryView(item) }, { label: 'Duplicar', onClick: () => duplicateLibraryView(item) }, { label: 'Excluir', danger: true, onClick: () => deleteLibraryView(item.id) }] })),
        ]}
        onAdd={() => void saveLibraryView()}
      />

      <section className="workspace-data-toolbar-v10167 playbook-library-toolbar-v10168 workspace-command-bar-v10169">
        <label className="search-field workspace-search-v10167"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar no conteúdo, segmento, persona, objeção ou tag..." /></label>
        <div className="workspace-toolbar-actions-v10167">
          <WorkspaceFilterMenu workspaceKey={`playbooks:${currentWorkspace?.id ?? 'local'}`} fields={universalPlaybookFilters} activeCount={activeLibraryFilters} onOpenAdvanced={() => setLibraryFiltersOpen(true)} onClearAll={clearLibraryFilters} onChange={(key, value) => { if (key === 'stage') setStageFilter(value); else if (key === 'objective') setObjectiveFilter(value); else if (key === 'temperature') setTemperatureFilter(value as typeof temperatureFilter); else if (key === 'segment') setSegmentFilter(value); else if (key === 'persona') setPersonaFilter(value); else if (key === 'kind') setKind(value as typeof kind); else if (key === 'status') setStatusFilter(value as typeof statusFilter); else if (key === 'execution') setExecutionFilter(value as typeof executionFilter); else if (key === 'context') setContextFilter(value as typeof contextFilter) }} />
          <WorkspaceDisplayMenu label="Exibição" value={libraryView} onChange={(value) => setLibraryView(value as typeof libraryView)} modes={[{ value: 'cards', label: 'Cards', icon: <LayoutGrid size={15}/>, description: 'Biblioteca visual e rápida.' }, { value: 'full', label: 'Texto completo', icon: <BookOpenText size={15}/>, description: 'Leitura contínua do roteiro.' }, { value: 'mindmap', label: 'Mapa mental', icon: <Workflow size={15}/>, description: 'Estrutura lógica do playbook.' }, { value: 'flow', label: 'Fluxo', icon: <ListChecks size={15}/>, description: 'Decisões e caminhos de execução.' }]} />
        </div>
      </section>


      {activeLibraryFilters ? <div className="workspace-filter-chips-v10167 playbook-filter-chips-v10168">
        {kind !== 'all' ? <button type="button" onClick={() => setKind('all')}>Tipo: {kindLabel[kind]} ×</button> : null}
        {statusFilter !== 'all' ? <button type="button" onClick={() => setStatusFilter('all')}>Status: {statusFilter === 'active' ? 'Ativos' : 'Inativos'} ×</button> : null}
        {executionFilter !== 'all' ? <button type="button" onClick={() => setExecutionFilter('all')}>Execução: {executionModeLabels[executionFilter]} ×</button> : null}
        {contextFilter !== 'all' ? <button type="button" onClick={() => setContextFilter('all')}>Contexto: {contextFilter === 'contextual' ? 'Contextualizados' : 'Uso geral'} ×</button> : null}
        {stageFilter !== 'all' ? <button type="button" onClick={() => setStageFilter('all')}>Etapa: {stageLabel(stageFilter)} ×</button> : null}
        {objectiveFilter !== 'all' ? <button type="button" onClick={() => setObjectiveFilter('all')}>Objetivo: {objectiveLabel(objectiveFilter)} ×</button> : null}
        {temperatureFilter !== 'all' ? <button type="button" onClick={() => setTemperatureFilter('all')}>Temperatura: {temperatureLabel[temperatureFilter]} ×</button> : null}
        {segmentFilter !== 'all' ? <button type="button" onClick={() => setSegmentFilter('all')}>Segmento: {segmentFilter} ×</button> : null}
        {personaFilter !== 'all' ? <button type="button" onClick={() => setPersonaFilter('all')}>Persona: {personaFilter} ×</button> : null}
        <button className="is-clear" type="button" onClick={clearLibraryFilters}>Limpar filtros</button>
      </div> : null}

      <section className="playbook-library-viewbar-v10168 pipeline-view-switcher-v10170-hidden" aria-hidden="true">
        <div><span>Visualização da biblioteca</span><small>O conteúdo é o mesmo; mude apenas a forma de estudar e trabalhar o roteiro.</small></div>
        <div className="workspace-view-tabs-v10167 playbook-library-views-v10168">
          <button type="button" className={libraryView === 'cards' ? 'is-active' : ''} onClick={() => setLibraryView('cards')}><LayoutGrid size={15}/> Cards</button>
          <button type="button" className={libraryView === 'full' ? 'is-active' : ''} onClick={() => setLibraryView('full')}><BookOpenText size={15}/> Texto completo</button>
          <button type="button" className={libraryView === 'mindmap' ? 'is-active' : ''} onClick={() => setLibraryView('mindmap')}><Workflow size={15}/> Mapa mental</button>
          <button type="button" className={libraryView === 'flow' ? 'is-active' : ''} onClick={() => setLibraryView('flow')}><ListChecks size={15}/> Fluxo</button>
        </div>
      </section>

      {libraryFiltersOpen ? <aside className="workspace-settings-drawer-v10167 playbook-filter-drawer-v10168" aria-label="Filtros de playbooks">
        <header><div><span>Biblioteca</span><strong>Filtros dos playbooks</strong></div><button type="button" onClick={() => setLibraryFiltersOpen(false)} aria-label="Fechar filtros">×</button></header>
        <div className="workspace-settings-drawer-v10167__body">
          <section><div className="workspace-settings-section-title-v10167"><strong>Contexto comercial</strong><span>Encontre o playbook pela situação do negócio em que ele deve ser utilizado.</span></div>
            <label className="field"><span>Etapa</span><NativeSelectionSelect value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}><option value="all">Todas as etapas</option>{(snapshot?.stages ?? []).filter((item) => !item.isLost).sort((a, b) => a.order - b.order).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</NativeSelectionSelect></label>
            <label className="field"><span>Objetivo</span><NativeSelectionSelect value={objectiveFilter} onChange={(event) => setObjectiveFilter(event.target.value)}><option value="all">Todos os objetivos</option>{CALL_SESSION_OBJECTIVES.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</NativeSelectionSelect></label>
            <label className="field"><span>Temperatura</span><NativeSelectionSelect value={temperatureFilter} onChange={(event) => setTemperatureFilter(event.target.value as typeof temperatureFilter)}><option value="all">Todas</option><option value="cold">Frio</option><option value="warm">Morno</option><option value="hot">Quente</option></NativeSelectionSelect></label>
          </section>
          <section><div className="workspace-settings-section-title-v10167"><strong>Público</strong><span>Restrinja por segmento ou persona configurados no targeting do roteiro.</span></div>
            <label className="field"><span>Segmento</span><NativeSelectionSelect value={segmentFilter} onChange={(event) => setSegmentFilter(event.target.value)}><option value="all">Todos os segmentos</option>{segmentOptions.map((item) => <option value={item} key={item}>{item}</option>)}</NativeSelectionSelect></label>
            <label className="field"><span>Persona</span><NativeSelectionSelect value={personaFilter} onChange={(event) => setPersonaFilter(event.target.value)}><option value="all">Todas as personas</option>{personaOptions.map((item) => <option value={item} key={item}>{item}</option>)}</NativeSelectionSelect></label>
          </section>
          <section><div className="workspace-settings-section-title-v10167"><strong>Conteúdo</strong><span>Encontre o roteiro pelo formato e estado da biblioteca.</span></div>
            <label className="field"><span>Tipo</span><NativeSelectionSelect value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="all">Todos os tipos</option>{Object.entries(kindLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelectionSelect></label>
            <label className="field"><span>Status</span><NativeSelectionSelect value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></NativeSelectionSelect></label>
          </section>
          <section><div className="workspace-settings-section-title-v10167"><strong>Execução e uso</strong><span>Filtre pelo canal/modo de execução e pela presença de regras contextuais.</span></div>
            <label className="field"><span>Canal / modo</span><NativeSelectionSelect value={executionFilter} onChange={(event) => setExecutionFilter(event.target.value as typeof executionFilter)}><option value="all">Todos os modos</option>{Object.entries(executionModeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</NativeSelectionSelect></label>
            <label className="field"><span>Contextualização</span><NativeSelectionSelect value={contextFilter} onChange={(event) => setContextFilter(event.target.value as typeof contextFilter)}><option value="all">Todos</option><option value="contextual">Com regras contextuais</option><option value="general">Uso geral</option></NativeSelectionSelect></label>
          </section>
        </div>
        <footer><Button variant="secondary" onClick={clearLibraryFilters}>Limpar filtros</Button><Button onClick={() => setLibraryFiltersOpen(false)}>Aplicar</Button></footer>
      </aside> : null}

      {playbooks.length && libraryView === 'cards' ? <section className="playbook-grid">{playbooks.map((playbook) => {
        const itemGuidance = playbook.guidance ?? {}
        const ruleCount = (itemGuidance.objectives?.length ?? 0) + (itemGuidance.stageIds?.length ?? 0) + (itemGuidance.decisionRoles?.length ?? 0) + (itemGuidance.outcomes?.length ?? 0) + (itemGuidance.temperatures?.length ?? 0) + (itemGuidance.segments?.length ?? 0) + (itemGuidance.personas?.length ?? 0)
        const modes = itemGuidance.executionModes?.length ? itemGuidance.executionModes : [recommendedExecutionMode(playbook)]
        return <article className={`panel playbook-card playbook-card--v10082 ${!playbook.active ? 'is-inactive' : ''}`} key={playbook.id}>
          <header><div className={`playbook-card__icon playbook-card__icon--${playbook.kind}`}>{kindIcon(playbook.kind)}</div><div><span className="eyebrow">{playbook.category || kindLabel[playbook.kind]}</span><h3>{playbook.title}</h3></div><StatusPill tone={playbook.active ? 'success' : 'warning'}>{playbook.active ? 'Ativo' : 'Inativo'}</StatusPill></header>
          <div className="playbook-card__context"><StatusPill tone={ruleCount ? 'info' : 'neutral'}>{ruleCount ? `${ruleCount} regras contextuais` : 'Uso geral'}</StatusPill>{itemGuidance.coachingFocus ? <span><Lightbulb size={14}/>{itemGuidance.coachingFocus}</span> : null}</div>
          <div className="playbook-mode-badges">{modes.map((mode) => <span key={mode}>{modeIcon(mode)} {executionModeLabels[mode]}</span>)}</div>
          {(itemGuidance.segments?.length || itemGuidance.personas?.length) ? <div className="playbook-targeting"><strong>Contexto</strong><span>{[...(itemGuidance.segments ?? []), ...(itemGuidance.personas ?? [])].join(' · ')}</span></div> : null}
          <p className={expandedId === playbook.id ? 'is-expanded' : ''}>{playbook.content}</p><button className="playbook-card__expand" type="button" onClick={() => setExpandedId((current) => current === playbook.id ? null : playbook.id)}>{expandedId === playbook.id ? 'Recolher conteúdo' : 'Ver conteúdo completo'}</button>
          {itemGuidance.successCriteria?.length ? <div className="playbook-card__criteria"><strong>Sucesso</strong>{itemGuidance.successCriteria.slice(0,3).map((item) => <span key={item}>✓ {item}</span>)}</div> : null}
          <div className="playbook-card__tags">{playbook.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          <footer><Button size="sm" onClick={() => execute(playbook)} disabled={!playbook.active}><PlayCircle size={15}/> Executar</Button>{canWrite ? <Button variant="secondary" size="sm" onClick={() => { setStudioEditing(playbook); setStudioOpen(true) }}><Workflow size={15}/> Studio</Button> : null}<Button variant="secondary" size="sm" onClick={() => void copy(playbook.content)}><Clipboard size={15} /> Copiar</Button>{canWrite ? <><button className="icon-button" type="button" aria-label={`Configurar ${playbook.title}`} onClick={() => { setEditing(playbook); setModalOpen(true) }}><Pencil size={16} /></button><button className="icon-button" type="button" aria-label={`Excluir ${playbook.title}`} onClick={() => void remove(playbook)}><Trash2 size={16} /></button></> : null}</footer>
        </article>
      })}</section> : null}

      {playbooks.length && libraryView === 'full' ? <section className="playbook-full-list-v10168">{playbooks.map((playbook) => {
        const g = playbook.guidance ?? {}
        const modes = g.executionModes?.length ? g.executionModes : [recommendedExecutionMode(playbook)]
        return <article className="panel playbook-full-document-v10168" key={playbook.id}>
          <header><div><span className="eyebrow">{playbook.category || kindLabel[playbook.kind]}</span><h2>{playbook.title}</h2><p>{g.coachingFocus || 'Roteiro operacional para orientar a conversa sem engessar o vendedor.'}</p></div><div><StatusPill tone={playbook.active ? 'success' : 'warning'}>{playbook.active ? 'Ativo' : 'Inativo'}</StatusPill><Button size="sm" onClick={() => execute(playbook)} disabled={!playbook.active}><PlayCircle size={15}/> Executar</Button></div></header>
          <div className="playbook-full-meta-v10168"><span><strong>Tipo</strong>{kindLabel[playbook.kind]}</span><span><strong>Execução</strong>{modes.map((mode) => executionModeLabels[mode]).join(' · ')}</span><span><strong>Público</strong>{[...(g.segments ?? []), ...(g.personas ?? [])].join(' · ') || 'Uso geral'}</span><span><strong>Objetivo</strong>{(g.objectives ?? []).map(objectiveLabel).join(' · ') || 'Adaptável'}</span></div>
          <section><span className="eyebrow">Roteiro principal</span><div className="playbook-full-prose-v10168">{playbook.content}</div></section>
          <div className="playbook-full-sections-v10168">
            <section><h3>Discovery</h3>{g.discoveryQuestions?.length ? <ol>{g.discoveryQuestions.map((item) => <li key={item}>{item}</li>)}</ol> : <p>Sem perguntas estruturadas.</p>}</section>
            <section><h3>Objeções</h3>{g.objectionPrompts?.length ? <ul>{g.objectionPrompts.map((item) => <li key={item}>{item}</li>)}</ul> : <p>Sem objeções estruturadas.</p>}</section>
            <section><h3>Critérios de sucesso</h3>{g.successCriteria?.length ? <ul>{g.successCriteria.map((item) => <li key={item}>✓ {item}</li>)}</ul> : <p>Sem critérios definidos.</p>}</section>
            <section><h3>Evitar</h3>{g.avoidPhrases?.length ? <ul>{g.avoidPhrases.map((item) => <li key={item}>{item}</li>)}</ul> : <p>Nenhuma orientação adicional.</p>}</section>
          </div>
          <footer><Button variant="secondary" size="sm" onClick={() => void copy(playbook.content)}><Clipboard size={15}/> Copiar roteiro</Button>{canWrite ? <Button variant="secondary" size="sm" onClick={() => { setEditing(playbook); setModalOpen(true) }}><Pencil size={15}/> Editar</Button> : null}</footer>
        </article>
      })}</section> : null}

      {playbooks.length && libraryView === 'mindmap' ? <section className="playbook-mindmap-list-v10168">{playbooks.map((playbook) => {
        const g = playbook.guidance ?? {}
        const modes = g.executionModes?.length ? g.executionModes : [recommendedExecutionMode(playbook)]
        const routeSteps = derivePlaybookSteps(playbook).filter((step) => step.kind === 'content').slice(0, 4)
        const audience = [...(g.segments ?? []), ...(g.personas ?? [])]
        const objectives = (g.objectives ?? []).map(objectiveLabel)
        const graph = g.conversationGraph
        const graphRoot = graph?.nodes.find((item) => item.id === graph.rootNodeId)
        const graphBranches = graph ? graph.edges.filter((edge) => edge.sourceId === graph.rootNodeId).map((edge, branchIndex) => {
          const child = graph.nodes.find((item) => item.id === edge.targetId)
          const grandchildren = child ? graph.edges.filter((childEdge) => childEdge.sourceId === child.id).map((childEdge) => graph.nodes.find((item) => item.id === childEdge.targetId)).filter(Boolean) : []
          return { id: `graph-${edge.id}`, title: edge.label || child?.title || `Caminho ${branchIndex + 1}`, description: child?.objective || 'caminho da conversa', items: [child, ...grandchildren].filter(Boolean).map((item, index) => ({ id: `graph-item-${item!.id}`, eyebrow: index === 0 ? 'Entrada' : 'Próximo', title: item!.title, description: item!.content })) }
        }) : []
        const branches = graphBranches.length ? graphBranches : [
          { id: 'audience', title: 'Público', description: 'para quem', items: (audience.length ? audience : ['Uso geral']).map((item, index) => ({ id: `audience-${index}`, title: item })) },
          { id: 'objectives', title: 'Objetivo', description: 'resultado esperado', items: (objectives.length ? objectives : ['Adaptável']).map((item, index) => ({ id: `objective-${index}`, title: item })) },
          { id: 'route', title: 'Roteiro', description: 'linha principal', items: (routeSteps.length ? routeSteps.map((step) => step.title) : [playbook.content.slice(0, 120) || 'Sem roteiro principal']).map((item, index) => ({ id: `route-${index}`, eyebrow: `Passo ${index + 1}`, title: item })) },
          { id: 'discovery', title: 'Discovery', description: 'perguntas', items: (g.discoveryQuestions?.length ? g.discoveryQuestions.slice(0, 4) : ['Sem perguntas estruturadas']).map((item, index) => ({ id: `discovery-${index}`, title: item })) },
          { id: 'objections', title: 'Objeções', description: 'caminhos de resposta', items: (g.objectionPrompts?.length ? g.objectionPrompts.slice(0, 4) : ['Sem objeções estruturadas']).map((item, index) => ({ id: `objection-${index}`, title: item })) },
          { id: 'success', title: 'Sucesso', description: 'como saber que avançou', items: (g.successCriteria?.length ? g.successCriteria.slice(0, 4) : ['Sem critérios definidos']).map((item, index) => ({ id: `success-${index}`, title: item })) },
          { id: 'execution', title: 'Execução', description: 'formas de usar', items: modes.map((mode) => ({ id: `mode-${mode}`, title: executionModeLabels[mode] })) },
        ]
        return <article className="panel playbook-mindmap-v10168 playbook-mindmap-v101113-h4" key={playbook.id}>
          <header><div><span className="eyebrow">Mapa mental</span><h3>{playbook.title}</h3><p>Leia a estratégia do centro para os ramos; cada ramo separa contexto, conversa e critério de avanço.</p></div><div>{canWrite ? <Button variant="secondary" size="sm" onClick={() => { setStudioEditing(playbook); setStudioOpen(true) }}><Workflow size={15}/> Editar mapa</Button> : null}<Button size="sm" onClick={() => execute(playbook)} disabled={!playbook.active}>Executar</Button></div></header>
          <MindMapCanvas ariaLabel={`Mapa mental do playbook ${playbook.title}`} rootEyebrow={playbook.category || kindLabel[playbook.kind]} rootTitle={graphRoot?.title || playbook.title} rootDescription={graphRoot?.content || g.coachingFocus || 'Roteiro operacional'} rootIcon={<Workflow size={18}/>} branches={branches}/>
        </article>
      })}</section> : null}

      {playbooks.length && libraryView === 'flow' ? <section className="playbook-flow-list-v10168">{playbooks.map((playbook) => {
        const flowSteps = derivePlaybookSteps(playbook)
        return <article className="panel playbook-flow-v10168" key={playbook.id}>
          <header><div><span className="eyebrow">Fluxo de execução</span><h3>{playbook.title}</h3><p>Veja a sequência do roteiro como processo de conversa.</p></div><Button size="sm" onClick={() => execute(playbook)} disabled={!playbook.active}><PlayCircle size={15}/> Executar</Button></header>
          <div className="playbook-flow-track-v10168">{flowSteps.length ? flowSteps.map((step, index) => <div className={`playbook-flow-node-v10168 playbook-flow-node-v10168--${step.kind}`} key={step.id}><span>{index + 1}</span><div><small>{step.kind === 'discovery' ? 'Discovery' : step.kind === 'objection' ? 'Objeção' : step.kind === 'success' ? 'Sucesso' : 'Roteiro'}</small><strong>{step.title}</strong><p>{step.content}</p></div>{index < flowSteps.length - 1 ? <i>→</i> : null}</div>) : <p className="activity-empty">Adicione conteúdo ao roteiro para gerar o fluxo.</p>}</div>
        </article>
      })}</section> : null}

      {!playbooks.length ? <EmptyState icon={BookOpenText} title="Nenhum roteiro encontrado" description="Ajuste os filtros ou crie scripts, objeções, battlecards e checklists com contexto de segmento, persona e etapa." action={canWrite ? <Button onClick={() => { setStudioEditing(null); setStudioOpen(true) }}><Workflow size={17} /> Criar playbook visual</Button> : undefined} /> : null}
    </> : null}

    {view === 'execution' ? (selected ? <section className="playbook-execution-shell">
      <aside className="panel playbook-execution-selector">
        <div className="panel__heading"><div><span className="eyebrow">Biblioteca ativa</span><h3>Escolha o roteiro</h3></div></div>
        <div className="playbook-execution-list">{activePlaybooks.map((item) => <button type="button" key={item.id} className={item.id === selected.id ? 'is-active' : ''} onClick={() => setSelectedId(item.id)}><span>{kindIcon(item.kind)}</span><div><strong>{item.title}</strong><small>{item.category || kindLabel[item.kind]}</small></div></button>)}</div>
      </aside>

      <div className="playbook-execution-main">
        <section className="panel playbook-execution-header">
          <div><span className="eyebrow">{selected.category || kindLabel[selected.kind]}</span><h2>{selected.title}</h2><p>{guidance.coachingFocus || 'Use o roteiro como guia. Adapte a conversa ao contexto real do cliente.'}</p></div>
          <div className="playbook-execution-modes">{availableModes.map((mode) => <button type="button" key={mode} className={executionMode === mode ? 'is-active' : ''} onClick={() => { setExecutionMode(mode); setStepIndex(0) }}>{modeIcon(mode)}<span>{executionModeLabels[mode]}</span></button>)}</div>
        </section>

        {executionMode === 'step_by_step' ? <section className="panel playbook-step-workspace">
          <div className="playbook-progress"><span>Passo {Math.min(stepIndex + 1, Math.max(steps.length, 1))} de {steps.length}</span><div><i style={{ width: `${steps.length ? ((stepIndex + 1) / steps.length) * 100 : 0}%` }} /></div></div>
          {steps[stepIndex] ? <article className={`playbook-step playbook-step--${steps[stepIndex].kind}`}><span className="eyebrow">{steps[stepIndex].kind === 'discovery' ? 'Pergunta de discovery' : steps[stepIndex].kind === 'objection' ? 'Preparação de objeção' : steps[stepIndex].kind === 'success' ? 'Critério de sucesso' : 'Roteiro'}</span><h3>{steps[stepIndex].title}</h3><p>{steps[stepIndex].content}</p></article> : <p className="activity-empty">Adicione conteúdo ao roteiro para iniciar.</p>}
          <div className="playbook-step-actions"><Button variant="secondary" disabled={stepIndex === 0} onClick={() => setStepIndex((current) => Math.max(0, current - 1))}><ChevronLeft size={16}/> Anterior</Button><Button variant="secondary" onClick={() => void copy(steps[stepIndex]?.content ?? selected.content)}><Clipboard size={16}/> Copiar etapa</Button><Button disabled={!steps.length || stepIndex >= steps.length - 1} onClick={() => setStepIndex((current) => Math.min(steps.length - 1, current + 1))}>Próximo <ChevronRight size={16}/></Button></div>
        </section> : null}

        {executionMode === 'checklist' ? <section className="panel playbook-checklist-workspace">
          <div className="panel__heading"><div><span className="eyebrow">Execução controlada</span><h3>Checklist do roteiro</h3></div><Button variant="secondary" size="sm" onClick={resetChecklist}><RotateCcw size={15}/> Reiniciar</Button></div>
          <div className="playbook-checklist-progress"><strong>{steps.filter((step) => checkedSteps[step.id]).length}/{steps.length}</strong><span>itens concluídos</span></div>
          <div className="playbook-checklist-items">{steps.map((step) => <button type="button" key={step.id} className={checkedSteps[step.id] ? 'is-done' : ''} onClick={() => toggleChecklist(step.id)}><span className="playbook-checkmark">{checkedSteps[step.id] ? <Check size={15}/> : null}</span><div><strong>{step.title}</strong><p>{step.content}</p></div></button>)}</div>
        </section> : null}

        {executionMode === 'call' ? <section className="playbook-conversation-grid">
          <article className="panel playbook-conversation-panel"><div className="panel__heading"><div><span className="eyebrow">Ligação</span><h3>Roteiro principal</h3></div><Phone size={19}/></div><div className="playbook-prose">{selected.content}</div></article>
          <article className="panel playbook-conversation-panel"><div className="panel__heading"><div><span className="eyebrow">Discovery</span><h3>Perguntas que não podem faltar</h3></div><Lightbulb size={19}/></div>{guidance.discoveryQuestions?.length ? <ol>{guidance.discoveryQuestions.map((item) => <li key={item}>{item}</li>)}</ol> : <p className="activity-empty">Nenhuma pergunta de discovery configurada.</p>}</article>
          <article className="panel playbook-conversation-panel"><div className="panel__heading"><div><span className="eyebrow">Objeções</span><h3>Antecipe resistências</h3></div><MessageSquareWarning size={19}/></div>{guidance.objectionPrompts?.length ? <ul>{guidance.objectionPrompts.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="activity-empty">Nenhuma objeção prioritária configurada.</p>}</article>
          <article className="panel playbook-conversation-panel"><div className="panel__heading"><div><span className="eyebrow">Fechamento</span><h3>Critérios de sucesso</h3></div><CheckCircle2 size={19}/></div>{guidance.successCriteria?.length ? <ul>{guidance.successCriteria.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="activity-empty">Defina os critérios de sucesso no editor.</p>}</article>
        </section> : null}

        {executionMode === 'meeting' ? <section className="playbook-meeting-grid">
          <article className="panel playbook-meeting-agenda"><div className="panel__heading"><div><span className="eyebrow">Reunião</span><h3>Agenda sugerida</h3></div><Presentation size={19}/></div>{guidance.meetingAgenda?.length ? <div className="playbook-agenda-list">{guidance.meetingAgenda.map((item, index) => <div key={item}><span>{index + 1}</span><strong>{item}</strong></div>)}</div> : <div className="playbook-prose">{selected.content}</div>}</article>
          <article className="panel playbook-meeting-notes"><span className="eyebrow">Perguntas de discovery</span><h3>Conduza a conversa</h3>{guidance.discoveryQuestions?.length ? <ol>{guidance.discoveryQuestions.map((item) => <li key={item}>{item}</li>)}</ol> : <p className="activity-empty">Adicione perguntas de discovery ao roteiro.</p>}</article>
          <article className="panel playbook-meeting-notes"><span className="eyebrow">Contexto ideal</span><h3>Para quem usar</h3><div className="playbook-context-grid"><div><small>Segmentos</small><strong>{guidance.segments?.join(', ') || 'Uso geral'}</strong></div><div><small>Personas</small><strong>{guidance.personas?.join(', ') || 'Todas'}</strong></div><div><small>Etapas</small><strong>{guidance.stageIds?.length ? `${guidance.stageIds.length} etapa(s) configurada(s)` : 'Qualquer etapa'}</strong></div></div></article>
          <article className="panel playbook-meeting-notes"><span className="eyebrow">Saída esperada</span><h3>Critérios de sucesso</h3>{guidance.successCriteria?.length ? <ul>{guidance.successCriteria.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="activity-empty">Defina o que caracteriza uma boa reunião.</p>}</article>
        </section> : null}
      </div>
    </section> : <EmptyState icon={PlayCircle} title="Nenhum roteiro ativo" description="Ative um roteiro para usar os modos Passo a passo, Checklist, Ligação e Reunião." />) : null}

    {view === 'coaching' ? <>
      <section className="coaching-kpi-grid">
        <article className="panel"><span>Score médio</span><strong>{coaching.averageScore || '—'}</strong><small>/100</small></article>
        <article className="panel"><span>Próximo passo</span><strong>{coaching.nextStepRate}%</strong><small>das ligações</small></article>
        <article className="panel"><span>Discovery</span><strong>{coaching.discoveryRate}%</strong><small>cobertura média</small></article>
        <article className="panel"><span>Avanço</span><strong>{coaching.meetingRate}%</strong><small>reunião/proposta/ganho</small></article>
        <article className="panel"><span>Objeções</span><strong>{coaching.objectionHandlingRate}%</strong><small>tratamento detectado</small></article>
      </section>
      {coaching.reviewedCalls ? <section className="coaching-dashboard-grid">
        <article className="panel coaching-panel"><div className="panel__heading"><div><span className="eyebrow">Execução</span><h3>Pontos fortes recorrentes</h3></div><TrendingUp size={20}/></div><div className="coaching-ranked-list">{coaching.topStrengths.length ? coaching.topStrengths.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.count}x</strong></div>) : <p className="activity-empty">Mais histórico é necessário para identificar padrões.</p>}</div></article>
        <article className="panel coaching-panel"><div className="panel__heading"><div><span className="eyebrow">Desenvolvimento</span><h3>Prioridades de coaching</h3></div><Target size={20}/></div><div className="coaching-ranked-list coaching-ranked-list--attention">{coaching.improvementAreas.length ? coaching.improvementAreas.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.count}x</strong></div>) : <p className="activity-empty">Nenhuma lacuna recorrente detectada.</p>}</div></article>
        <article className="panel coaching-panel coaching-panel--wide"><div className="panel__heading"><div><span className="eyebrow">Objeções</span><h3>O que aparece nas conversas</h3></div><MessageSquareWarning size={20}/></div>{coaching.objections.length ? <div className="coaching-objection-grid">{coaching.objections.map((item) => <div key={item.title}><strong>{item.title}</strong><span>{item.count} ocorrência{item.count === 1 ? '' : 's'}</span></div>)}</div> : <p className="activity-empty">Objeções registradas no Modo Foco aparecerão aqui para orientar novos roteiros.</p>}</article>
        <article className="panel coaching-panel coaching-panel--wide"><div className="panel__heading"><div><span className="eyebrow">Metodologia</span><h3>Score explicável, não caixa-preta</h3></div><Lightbulb size={20}/></div><p>O score utiliza resultado, profundidade de descoberta, próximo passo, stakeholders, tratamento de objeções, qualidade do registro e uso de playbook. Gravação ou transcrição não são obrigatórias e podem continuar sendo processadas pelo RealTalent Connect.</p></article>
      </section> : <EmptyState icon={BarChart3} title="Coaching aguardando histórico" description="Quando as ligações forem registradas, o RealTalent mostrará score, padrões, objeções e prioridades de desenvolvimento." />}
    </> : null}
    <PlaybookModal open={canWrite && modalOpen} playbook={editing} onClose={() => { setModalOpen(false); setEditing(null) }} />
  </div>
}
