import { NativeSelectionSelect } from '../../components/selection'
import { ArrowDown, ArrowUp, Eye, EyeOff, LayoutGrid, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAppNavigation } from '../../app/app-context'
import { navigationItems, routeTitles } from '../../components/layout/navigation'
import { Button } from '../../components/ui/button'
import type { AppRoute } from '../../domain/types'
import { pageSectionRegistry, type ExperienceBlockSize } from '../experience/experience-registry'
import { useExperience } from '../experience/experience-context'

const editableRoutes = navigationItems.map((item) => item.route).filter((route) => route !== 'settings')

const groupName = (sectionId: string) => sectionId.startsWith('forecast-') ? 'Forecast' : sectionId.startsWith('catalog-') ? 'Catálogo' : 'Página'

const sizeLabels: Record<ExperienceBlockSize, string> = { s: 'Pequeno', m: 'Médio', l: 'Amplo', full: 'Linha inteira' }

const dashboardSmartSizes: Record<string, ExperienceBlockSize> = {
  hero: 'full', health: 'full', score: 'full', execution: 'full', intelligence: 'full', summary: 'm', insights: 'm',
}

export function PagePersonalizationSettings() {
  const { setRoute, navigate } = useAppNavigation()
  const experience = useExperience()
  const [selectedRoute, setSelectedRoute] = useState<AppRoute>('dashboard')
  const page = experience.preferences.pages[selectedRoute]
  const definitions = pageSectionRegistry[selectedRoute]
  const orderedDefinitions = useMemo(() => {
    if (!page) return definitions
    return page.sectionOrder.map((id) => definitions.find((section) => section.id === id)).filter((section): section is (typeof definitions)[number] => Boolean(section))
  }, [definitions, page])

  if (!page) return null

  const move = (id: string, direction: -1 | 1) => {
    const order = [...page.sectionOrder]
    const index = order.indexOf(id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= order.length) return
    ;[order[index], order[target]] = [order[target], order[index]]
    experience.updatePage(selectedRoute, { sectionOrder: order })
  }

  const toggleSection = (id: string, required?: boolean) => {
    if (required) return
    const hidden = page.hiddenSections.includes(id)
    experience.updatePage(selectedRoute, { hiddenSections: hidden ? page.hiddenSections.filter((item) => item !== id) : [...page.hiddenSections, id] })
  }

  const openPage = () => {
    if (selectedRoute === 'proposals') navigate('proposals', { action: 'forecast' })
    else setRoute(selectedRoute)
  }

  const setSectionSize = (id: string, size: ExperienceBlockSize) => {
    experience.updatePage(selectedRoute, { sectionSizes: { ...page.sectionSizes, [id]: size } })
  }

  const organizeSmart = () => {
    if (selectedRoute !== 'dashboard') return
    experience.updatePage('dashboard', {
      sectionOrder: definitions.map((section) => section.id),
      sectionSizes: { ...page.sectionSizes, ...dashboardSmartSizes },
    })
  }

  return <div className="page-personalization-settings">
    <article className="panel page-personalization-settings__picker">
      <div className="panel__heading"><div><span className="eyebrow">Central de páginas</span><h3>Escolha o que cada tela deve mostrar</h3><p>O layout é individual por usuário. O CRM preserva os blocos essenciais e salva suas escolhas automaticamente.</p></div><LayoutGrid size={22}/></div>
      <div className="page-personalization-route-grid">
        {editableRoutes.map((route) => {
          const item = navigationItems.find((candidate) => candidate.route === route)
          if (!item) return null
          const Icon = item.icon
          return <button type="button" key={route} className={selectedRoute === route ? 'is-active' : ''} onClick={() => setSelectedRoute(route)}><Icon size={17}/><span><strong>{routeTitles[route].title}</strong><small>{routeTitles[route].subtitle}</small></span></button>
        })}
      </div>
    </article>

    <article className="panel page-personalization-settings__editor">
      <div className="panel__heading"><div><span className="eyebrow">{routeTitles[selectedRoute].title}</span><h3>Composição da página</h3><p>Mostre, oculte e reorganize os blocos. No Meu Dia, o Layout Studio também permite escolher tamanhos seguros em uma grade de 12 colunas.</p></div><div className="page-personalization-heading-actions">{selectedRoute === 'dashboard' ? <Button size="sm" variant="secondary" onClick={organizeSmart}><LayoutGrid size={15}/> Organizar automaticamente</Button> : null}<Button size="sm" variant="secondary" onClick={openPage}>Abrir página</Button></div></div>

      <div className="page-personalization-controls">
        <label><span>Densidade</span><NativeSelectionSelect value={page.density} onChange={(event) => experience.updatePage(selectedRoute, { density: event.target.value as 'comfortable' | 'compact' })}><option value="comfortable">Confortável</option><option value="compact">Compacta</option></NativeSelectionSelect></label>
        <label><span>Ênfase</span><NativeSelectionSelect value={page.emphasis} onChange={(event) => experience.updatePage(selectedRoute, { emphasis: event.target.value as 'balanced' | 'focus' })}><option value="balanced">Equilibrada</option><option value="focus">Modo foco</option></NativeSelectionSelect></label>
        {selectedRoute === 'dashboard' ? <label><span>Dados</span><NativeSelectionSelect value={page.dataScope} onChange={(event) => experience.updatePage(selectedRoute, { dataScope: event.target.value as 'mine' | 'team' })}><option value="mine">Meus contatos</option><option value="team">Equipe</option></NativeSelectionSelect></label> : null}
      </div>

      <div className="page-personalization-section-list">
        {orderedDefinitions.map((section, index) => {
          const visible = !page.hiddenSections.includes(section.id)
          return <div key={section.id} className={`page-personalization-section ${visible ? '' : 'is-hidden'}`}>
            <span className="page-personalization-section__group">{groupName(section.id)}</span>
            <button type="button" className="page-personalization-section__visibility" disabled={section.required} onClick={() => toggleSection(section.id, section.required)} aria-label={visible ? `Ocultar ${section.label}` : `Mostrar ${section.label}`}>{visible ? <Eye size={16}/> : <EyeOff size={16}/>}</button>
            <div><strong>{section.label}{section.required ? <em>Essencial</em> : null}</strong><small>{section.description}</small>{section.sizeOptions?.length ? <div className="page-personalization-section__sizes" aria-label={`Tamanho de ${section.label}`}>{section.sizeOptions.map((size) => <button key={size} type="button" className={(page.sectionSizes?.[section.id] ?? section.defaultSize ?? 'full') === size ? 'is-active' : ''} onClick={() => setSectionSize(section.id, size)}>{sizeLabels[size]}</button>)}</div> : null}</div>
            <div className="page-personalization-section__order"><button type="button" className="icon-button" disabled={index === 0} onClick={() => move(section.id, -1)} aria-label={`Mover ${section.label} para cima`}><ArrowUp size={15}/></button><button type="button" className="icon-button" disabled={index === orderedDefinitions.length - 1} onClick={() => move(section.id, 1)} aria-label={`Mover ${section.label} para baixo`}><ArrowDown size={15}/></button></div>
          </div>
        })}
      </div>

      <div className="settings-actions"><Button variant="secondary" onClick={() => experience.resetPage(selectedRoute)}><RotateCcw size={16}/> Restaurar esta página</Button></div>
    </article>
  </div>
}
