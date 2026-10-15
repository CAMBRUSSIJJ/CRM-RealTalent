import { MoreHorizontal, Settings, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { navigationItems, routeAccessResource } from './navigation'
import { useAppNavigation, useAppWorkspace } from '../../app/app-context'
import { usePreferences } from '../../features/settings/preferences-context'

const preferredPrimaryRoutes = ['dashboard', 'leads', 'pipeline', 'tasks']

export function MobileNav() {
  const { route, setRoute } = useAppNavigation()
  const { canTeamAccess } = useAppWorkspace()
  const { preferences } = usePreferences()
  const [open, setOpen] = useState(false)
  const visibleItems = useMemo(() => preferences.navigation.order
    .map((itemRoute) => navigationItems.find((item) => item.route === itemRoute))
    .filter((item): item is (typeof navigationItems)[number] => Boolean(item))
    .filter((item) => item.route !== 'settings')
    .filter((item) => preferences.navigation.visibleRoutes.includes(item.route))
    .filter((item) => { const resource = routeAccessResource(item.route); return !resource || canTeamAccess('view', resource) }), [canTeamAccess, preferences.navigation])
  const primaryItems = useMemo(() => visibleItems.filter((item) => preferredPrimaryRoutes.includes(item.route)).slice(0, 4), [visibleItems])
  const secondaryItems = useMemo(() => visibleItems.filter((item) => !primaryItems.some((primary) => primary.route === item.route)), [primaryItems, visibleItems])
  const secondaryActive = secondaryItems.some((item) => item.route === route)

  useEffect(() => { setOpen(false) }, [route])
  const labelFor = (item: (typeof navigationItems)[number]) => preferences.navigation.labels[item.route]?.trim() || item.label

  return (
    <>
      {open ? <div className="mobile-more-backdrop" onClick={() => setOpen(false)} aria-hidden="true" /> : null}
      {open ? <section className="mobile-more-menu" aria-label="Mais opções de navegação">
        <header><div><strong>Mais áreas</strong><span>Acesse os outros módulos do CRM</span></div><button type="button" onClick={() => setOpen(false)} aria-label="Fechar"><X size={20} /></button></header>
        <div>{secondaryItems.map((item) => <button key={item.route} type="button" className={route === item.route ? 'is-active' : ''} aria-current={route === item.route ? 'page' : undefined} onClick={() => setRoute(item.route)}><item.icon size={20} /><span>{labelFor(item)}</span></button>)}{canTeamAccess('view','settings') ? <button type="button" className={`mobile-more-menu__settings ${route === 'settings' ? 'is-active' : ''}`} aria-current={route === 'settings' ? 'page' : undefined} onClick={() => setRoute('settings')}><Settings size={20}/><span>Configurações</span></button> : null}</div>
      </section> : null}
      <nav className="mobile-nav" aria-label="Navegação móvel">
        {primaryItems.map((item) => <button key={item.route} type="button" className={route === item.route ? 'is-active' : ''} aria-current={route === item.route ? 'page' : undefined} onClick={() => setRoute(item.route)}><item.icon size={20} /><span>{labelFor(item)}</span></button>)}
        {secondaryItems.length ? <button type="button" className={open || secondaryActive ? 'is-active' : ''} onClick={() => setOpen((value) => !value)}><MoreHorizontal size={21} /><span>Mais</span></button> : null}
      </nav>
    </>
  )
}
