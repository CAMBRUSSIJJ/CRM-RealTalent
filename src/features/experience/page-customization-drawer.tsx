import { ArrowDown, ArrowUp, Check, EyeOff, LayoutDashboard, RotateCcw, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import type { AppRoute } from '../../domain/types'
import { Button } from '../../components/ui/button'
import { routeTitles } from '../../components/layout/navigation'
import { useExperience, type ExperiencePreset } from './experience-context'
import { pageSectionRegistry } from './experience-registry'
import { useOverlayDialog } from '../../app/use-overlay-dialog'

const presetLabels: Array<{ id: ExperiencePreset; label: string; detail: string }> = [
  { id: 'sdr', label: 'SDR', detail: 'Fila, prospecção e volume.' },
  { id: 'seller', label: 'Vendedor', detail: 'Visão equilibrada da carteira.' },
  { id: 'closer', label: 'Closer', detail: 'Pipeline, propostas e fechamento.' },
  { id: 'manager', label: 'Gerente', detail: 'Equipe, forecast e desempenho.' },
  { id: 'executive', label: 'Executivo', detail: 'Indicadores e decisões.' },
  { id: 'admin', label: 'Administrador', detail: 'Configuração e operação ampla.' },
]

export function PageCustomizationDrawer({ route, open, onClose }: { route: AppRoute; open: boolean; onClose(): void }) {
  const { preferences, syncing, lastSyncedAt, updateGlobal, updatePage, setPreset, resetPage, resetAll } = useExperience()
  const page = preferences.pages[route]
  const sections = pageSectionRegistry[route]

  useOverlayDialog(open, `experience-drawer:${route}`, onClose)

  if (!open || !page) return null

  const move = (id: string, direction: -1 | 1) => {
    const order = [...page.sectionOrder]
    const index = order.indexOf(id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= order.length) return
    ;[order[index], order[target]] = [order[target], order[index]]
    updatePage(route, { sectionOrder: order })
  }

  const dashboardLayout = (() => {
    if (route !== 'dashboard') return null
    const hidden = [...page.hiddenSections].sort()
    const sameHidden = (expected: string[]) => hidden.length === expected.length && expected.every((id) => hidden.includes(id))
    if (sameHidden(['score', 'intelligence', 'summary', 'insights'])) return 'essential' as const
    if (sameHidden(['score'])) return 'balanced' as const
    if (!hidden.length) return 'complete' as const
    return 'custom' as const
  })()

  const applyDashboardLayout = (layout: 'essential' | 'balanced' | 'complete') => {
    if (route !== 'dashboard') return
    const optional = sections.filter((section) => !section.required).map((section) => section.id)
    const hiddenSections = layout === 'essential'
      ? optional.filter((id) => ['score', 'intelligence', 'summary', 'insights'].includes(id))
      : layout === 'balanced' ? ['score'] : []
    const preferredOrder = ['hero', 'health', 'score', 'execution', 'intelligence', 'summary', 'insights']
    updatePage(route, { hiddenSections, sectionOrder: preferredOrder.filter((id) => page.sectionOrder.includes(id)) })
  }

  const intelligencePlacement = (() => {
    if (route !== 'dashboard') return 'custom' as const
    if (page.hiddenSections.includes('intelligence')) return 'hidden' as const
    const intelligenceIndex = page.sectionOrder.indexOf('intelligence')
    const healthIndex = page.sectionOrder.indexOf('health')
    const executionIndex = page.sectionOrder.indexOf('execution')
    const summaryIndex = page.sectionOrder.indexOf('summary')
    if (intelligenceIndex === healthIndex + 1) return 'after-health' as const
    if (intelligenceIndex === executionIndex + 1) return 'after-execution' as const
    if (intelligenceIndex === summaryIndex + 1) return 'after-summary' as const
    return 'custom' as const
  })()

  const placeIntelligence = (placement: 'after-health' | 'after-execution' | 'after-summary' | 'hidden') => {
    if (route !== 'dashboard') return
    if (placement === 'hidden') {
      updatePage(route, { hiddenSections: Array.from(new Set([...page.hiddenSections, 'intelligence'])) })
      return
    }
    const anchor = placement === 'after-health' ? 'health' : placement === 'after-summary' ? 'summary' : 'execution'
    const nextOrder = page.sectionOrder.filter((id) => id !== 'intelligence')
    const anchorIndex = nextOrder.indexOf(anchor)
    nextOrder.splice(anchorIndex >= 0 ? anchorIndex + 1 : nextOrder.length, 0, 'intelligence')
    updatePage(route, {
      sectionOrder: nextOrder,
      hiddenSections: page.hiddenSections.filter((id) => id !== 'intelligence'),
    })
  }

  return <div className="experience-drawer-layer" role="presentation">
    <button className="experience-drawer-backdrop" type="button" aria-label="Fechar personalização" onClick={onClose} />
    <aside className="experience-drawer" data-overlay-id={`experience-drawer:${route}`} role="dialog" aria-modal="true" aria-label={`Personalizar ${routeTitles[route].title}`}>
      <header className="experience-drawer__header">
        <div><span><SlidersHorizontal size={16} /> Personalizar visualização</span><h2>{routeTitles[route].title}</h2><p>As escolhas são individuais e acompanham seu usuário.</p></div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><X size={19} /></button>
      </header>

      <div className="experience-drawer__scroll">
        <section className="experience-config-section">
          <div className="experience-config-section__heading"><div><span className="eyebrow"><Sparkles size={13} /> Perfil de trabalho</span><h3>Experiência por função</h3></div>{preferences.preset === 'custom' ? <span className="experience-custom-badge">Personalizado</span> : null}</div>
          <div className="experience-preset-grid">{presetLabels.map((preset) => <button type="button" key={preset.id} className={preferences.preset === preset.id ? 'is-active' : ''} onClick={() => setPreset(preset.id)}><span>{preferences.preset === preset.id ? <Check size={15} /> : <LayoutDashboard size={15} />}</span><strong>{preset.label}</strong><small>{preset.detail}</small></button>)}</div>
        </section>

        <section className="experience-config-section">
          <div className="experience-config-section__heading"><div><span className="eyebrow">Estrutura global</span><h3>Conforto de leitura</h3></div></div>
          <div className="experience-segmented"><span>Largura</span>{(['focused', 'wide', 'fluid'] as const).map((value) => <button type="button" key={value} className={preferences.global.contentWidth === value ? 'is-active' : ''} onClick={() => updateGlobal({ contentWidth: value })}>{value === 'focused' ? 'Focada' : value === 'wide' ? 'Ampla' : 'Fluida'}</button>)}</div>
          <div className="experience-segmented"><span>Fonte</span>{(['small', 'medium', 'large'] as const).map((value) => <button type="button" key={value} className={preferences.global.fontScale === value ? 'is-active' : ''} onClick={() => updateGlobal({ fontScale: value })}>{value === 'small' ? 'Menor' : value === 'medium' ? 'Padrão' : 'Maior'}</button>)}</div>
          <div className="experience-choice-row"><label><input type="checkbox" checked={preferences.global.showPageSubtitle} onChange={(event) => updateGlobal({ showPageSubtitle: event.target.checked })} /><span><strong>Mostrar subtítulo da página</strong><small>Mantém o contexto abaixo do título.</small></span></label><label><input type="checkbox" checked={preferences.global.stickyTopbar} onChange={(event) => updateGlobal({ stickyTopbar: event.target.checked })} /><span><strong>Barra superior fixa</strong><small>Mantém busca e ações acessíveis.</small></span></label><label><input type="checkbox" checked={preferences.global.reduceTransparency} onChange={(event) => updateGlobal({ reduceTransparency: event.target.checked })} /><span><strong>Reduzir transparência</strong><small>Melhora a leitura em telas com baixo contraste.</small></span></label><label><input type="checkbox" checked={preferences.global.contrast === 'high'} onChange={(event) => updateGlobal({ contrast: event.target.checked ? 'high' : 'standard' })} /><span><strong>Contraste reforçado</strong><small>Realça bordas, textos e foco do teclado.</small></span></label></div>
        </section>

        {route === 'dashboard' ? <section className="experience-config-section dashboard-personalization">
          <div className="experience-config-section__heading"><div><span className="eyebrow"><LayoutDashboard size={13} /> Meu Dia</span><h3>Composição rápida</h3><p>Escolha uma base pronta e refine os blocos abaixo. As mudanças aparecem imediatamente.</p></div></div>
          <div className="dashboard-layout-presets">
            <button type="button" className={dashboardLayout === 'essential' ? 'is-active' : ''} onClick={() => applyDashboardLayout('essential')}><strong>Essencial</strong><small>Saúde + execução. Menos distrações.</small></button>
            <button type="button" className={dashboardLayout === 'balanced' ? 'is-active' : ''} onClick={() => applyDashboardLayout('balanced')}><strong>Equilibrado</strong><small>Operação completa sem excesso de sinais.</small></button>
            <button type="button" className={dashboardLayout === 'complete' ? 'is-active' : ''} onClick={() => applyDashboardLayout('complete')}><strong>Completo</strong><small>Todos os blocos disponíveis.</small></button>
          </div>
          <div className="dashboard-intelligence-placement">
            <div><span className="eyebrow"><Sparkles size={13} /> Visualização inteligente</span><strong>Onde mostrar o Deal Intelligence?</strong><small>O bloco aparece quando o Deal Intelligence estiver ativado em Configurações.</small></div>
            <div className="dashboard-intelligence-placement__buttons">
              <button type="button" className={intelligencePlacement === 'after-health' ? 'is-active' : ''} onClick={() => placeIntelligence('after-health')}>Após saúde</button>
              <button type="button" className={intelligencePlacement === 'after-execution' ? 'is-active' : ''} onClick={() => placeIntelligence('after-execution')}>Após execução</button>
              <button type="button" className={intelligencePlacement === 'after-summary' ? 'is-active' : ''} onClick={() => placeIntelligence('after-summary')}>Após resumo</button>
              <button type="button" className={intelligencePlacement === 'hidden' ? 'is-active is-danger' : ''} onClick={() => placeIntelligence('hidden')}><EyeOff size={14} /> Ocultar</button>
            </div>
          </div>
        </section> : null}

        <section className="experience-config-section">
          <div className="experience-config-section__heading"><div><span className="eyebrow">Esta página</span><h3>Densidade e foco</h3></div></div>
          <div className="experience-segmented"><span>Densidade</span>{(['comfortable', 'compact'] as const).map((value) => <button type="button" key={value} className={page.density === value ? 'is-active' : ''} onClick={() => updatePage(route, { density: value })}>{value === 'comfortable' ? 'Confortável' : 'Compacta'}</button>)}</div>
          <div className="experience-segmented"><span>Ênfase</span>{(['balanced', 'focus'] as const).map((value) => <button type="button" key={value} className={page.emphasis === value ? 'is-active' : ''} onClick={() => updatePage(route, { emphasis: value })}>{value === 'balanced' ? 'Equilibrada' : 'Modo foco'}</button>)}</div>
          {route === 'dashboard' ? <div className="experience-segmented experience-segmented--two"><span>Escopo</span>{(['mine', 'team'] as const).map((value) => <button type="button" key={value} className={page.dataScope === value ? 'is-active' : ''} onClick={() => updatePage(route, { dataScope: value })}>{value === 'mine' ? 'Meus contatos' : 'Equipe'}</button>)}</div> : null}
        </section>

        <section className="experience-config-section">
          <div className="experience-config-section__heading"><div><span className="eyebrow">Componentes</span><h3>Mostrar e organizar</h3><p>Áreas essenciais permanecem protegidas.</p></div></div>
          <div className="experience-section-list">{page.sectionOrder.map((id, index) => {
            const section = sections.find((item) => item.id === id)
            if (!section) return null
            const visible = !page.hiddenSections.includes(id)
            return <article key={id} className={visible ? '' : 'is-hidden'}><label><input type="checkbox" disabled={section.required} checked={visible} onChange={() => updatePage(route, { hiddenSections: visible ? [...page.hiddenSections, id] : page.hiddenSections.filter((item) => item !== id) })} /><span><strong>{section.label}{section.required ? <em>Essencial</em> : null}</strong><small>{section.description}</small></span></label><div><button type="button" className="icon-button" disabled={index === 0} onClick={() => move(id, -1)} aria-label={`Mover ${section.label} para cima`}><ArrowUp size={15} /></button><button type="button" className="icon-button" disabled={index === page.sectionOrder.length - 1} onClick={() => move(id, 1)} aria-label={`Mover ${section.label} para baixo`}><ArrowDown size={15} /></button></div></article>
          })}</div>
        </section>
      </div>

      <footer className="experience-drawer__footer">
        <div><span className={syncing ? 'is-syncing' : 'is-synced'}>{syncing ? 'Sincronizando...' : lastSyncedAt ? 'Preferências sincronizadas' : 'Preferências salvas neste dispositivo'}</span></div>
        <Button variant="ghost" size="sm" onClick={() => resetPage(route)}><RotateCcw size={15} /> Restaurar página</Button>
        <Button variant="secondary" size="sm" onClick={resetAll}>Restaurar tudo</Button>
      </footer>
    </aside>
  </div>
}
