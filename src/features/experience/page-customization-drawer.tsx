import { ArrowDown, ArrowUp, Check, LayoutDashboard, RotateCcw, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { useEffect } from 'react'
import type { AppRoute } from '../../domain/types'
import { Button } from '../../components/ui/button'
import { routeTitles } from '../../components/layout/navigation'
import { useExperience, type ExperiencePreset } from './experience-context'
import { pageSectionRegistry } from './experience-registry'

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

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, open])

  if (!open || !page) return null

  const move = (id: string, direction: -1 | 1) => {
    const order = [...page.sectionOrder]
    const index = order.indexOf(id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= order.length) return
    ;[order[index], order[target]] = [order[target], order[index]]
    updatePage(route, { sectionOrder: order })
  }

  return <div className="experience-drawer-layer" role="presentation">
    <button className="experience-drawer-backdrop" type="button" aria-label="Fechar personalização" onClick={onClose} />
    <aside className="experience-drawer" role="dialog" aria-modal="true" aria-label={`Personalizar ${routeTitles[route].title}`}>
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

        <section className="experience-config-section">
          <div className="experience-config-section__heading"><div><span className="eyebrow">Esta página</span><h3>Densidade e foco</h3></div></div>
          <div className="experience-segmented"><span>Densidade</span>{(['comfortable', 'compact'] as const).map((value) => <button type="button" key={value} className={page.density === value ? 'is-active' : ''} onClick={() => updatePage(route, { density: value })}>{value === 'comfortable' ? 'Confortável' : 'Compacta'}</button>)}</div>
          <div className="experience-segmented"><span>Ênfase</span>{(['balanced', 'focus'] as const).map((value) => <button type="button" key={value} className={page.emphasis === value ? 'is-active' : ''} onClick={() => updatePage(route, { emphasis: value })}>{value === 'balanced' ? 'Equilibrada' : 'Modo foco'}</button>)}</div>
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
