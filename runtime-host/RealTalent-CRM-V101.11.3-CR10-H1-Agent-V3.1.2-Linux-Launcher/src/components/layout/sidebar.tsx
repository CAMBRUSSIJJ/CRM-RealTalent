import { ChevronDown, LogOut, MoreHorizontal, PanelLeft, Settings } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAppNavigation, useAppWorkspace } from '../../app/app-context'
import { useAuth } from '../../features/auth/auth-context'
import { usePreferences } from '../../features/settings/preferences-context'
import { initials } from '../../domain/formatters'
import { navigationItems, routeAccessResource, type NavigationGroup } from './navigation'

const GROUPS: NavigationGroup[] = ['Operação', 'Estratégia', 'Sistema']

export function Sidebar() {
  const { preferences, savePreferences } = usePreferences()
  const [collapsed, setCollapsed] = useState(preferences.appearance.sidebar === 'compact')
  const [secondaryOpen, setSecondaryOpen] = useState(preferences.appearance.sidebarOpenSecondary)
  const { route, setRoute } = useAppNavigation()
  const { canTeamAccess } = useAppWorkspace()
  const { user, signOut } = useAuth()
  const orderedItems = useMemo(() => preferences.navigation.order
    .map((itemRoute) => navigationItems.find((item) => item.route === itemRoute))
    .filter((item): item is (typeof navigationItems)[number] => Boolean(item))
    .filter((item) => item.route !== 'settings')
    .filter((item) => preferences.navigation.visibleRoutes.includes(item.route))
    .filter((item) => { const resource = routeAccessResource(item.route); return !resource || canTeamAccess('view', resource) }), [canTeamAccess, preferences.navigation])
  const primaryItems = useMemo(() => orderedItems.filter((item) => preferences.navigation.primaryRoutes.includes(item.route)), [orderedItems, preferences.navigation.primaryRoutes])
  const secondaryItems = useMemo(() => orderedItems.filter((item) => !preferences.navigation.primaryRoutes.includes(item.route)), [orderedItems, preferences.navigation.primaryRoutes])
  const groupedItems = useMemo(() => GROUPS.map((group) => ({ group, items: primaryItems.filter((item) => item.group === group) })).filter((section) => section.items.length), [primaryItems])

  useEffect(() => { setCollapsed(preferences.appearance.sidebar === 'compact') }, [preferences.appearance.sidebar])
  useEffect(() => { setSecondaryOpen(preferences.appearance.sidebarOpenSecondary || secondaryItems.some((item) => item.route === route)) }, [preferences.appearance.sidebarOpenSecondary, route, secondaryItems])

  const toggleSidebar = () => {
    const nextCollapsed = !collapsed
    setCollapsed(nextCollapsed)
    savePreferences({ ...preferences, appearance: { ...preferences.appearance, sidebar: nextCollapsed ? 'compact' : 'expanded' } })
  }

  const toggleSecondary = () => {
    const nextOpen = !secondaryOpen
    setSecondaryOpen(nextOpen)
    savePreferences({ ...preferences, appearance: { ...preferences.appearance, sidebarOpenSecondary: nextOpen } })
  }

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''} ${preferences.appearance.sidebar === 'auto' ? 'sidebar--auto' : ''} ${preferences.appearance.sidebarShowBrand ? '' : 'sidebar--hide-brand'} ${preferences.appearance.sidebarShowGroups ? '' : 'sidebar--hide-groups'} ${preferences.appearance.sidebarShowProfile ? '' : 'sidebar--hide-profile'}`} data-sidebar-mode={preferences.appearance.sidebar} data-sidebar-width={preferences.appearance.sidebarWidth}>
      <div className="sidebar__brand">
        <div className="sidebar__logo">{preferences.company.logoDataUrl ? <img src={preferences.company.logoDataUrl} alt="Logo" /> : <span aria-hidden="true">RT</span>}</div>
        <div className="sidebar__brand-copy"><strong>{preferences.company.name || 'RealTalent'}</strong><span>CRM</span></div>
      </div>
      <nav className="sidebar__nav" aria-label="Navegação principal">
        {groupedItems.map(({ group, items }) => (
          <div className="sidebar__group" key={group}>
            {preferences.appearance.sidebarShowGroups ? <span className="sidebar__group-label">{group}</span> : null}
            {items.map(({ route: itemRoute, label, icon: Icon }) => {
              const customLabel = preferences.navigation.labels[itemRoute]?.trim() || label
              return <button key={itemRoute} type="button" className={`sidebar__item ${route === itemRoute ? 'is-active' : ''}`} onClick={() => setRoute(itemRoute)} aria-current={route === itemRoute ? 'page' : undefined} title={customLabel}>
                <Icon size={19} /><span>{customLabel}</span>
              </button>
            })}
          </div>
        ))}
        {secondaryItems.length ? <div className="sidebar__group sidebar__group--secondary">
          <button className={`sidebar__more-toggle ${secondaryOpen ? 'is-open' : ''}`} type="button" onClick={toggleSecondary} aria-expanded={secondaryOpen} aria-controls="sidebar-secondary-tools" title="Mais ferramentas">
            <MoreHorizontal size={19}/><span>Mais ferramentas</span><ChevronDown className="sidebar__more-chevron" size={15}/>
          </button>
          {secondaryOpen ? <div id="sidebar-secondary-tools" className="sidebar__secondary-tools">{secondaryItems.map(({ route: itemRoute, label, icon: Icon }) => {
            const customLabel = preferences.navigation.labels[itemRoute]?.trim() || label
            return <button key={itemRoute} type="button" className={`sidebar__item ${route === itemRoute ? 'is-active' : ''}`} onClick={() => setRoute(itemRoute)} aria-current={route === itemRoute ? 'page' : undefined} title={customLabel}>
              <Icon size={19}/><span>{customLabel}</span>
            </button>
          })}</div> : null}
        </div> : null}
      </nav>
      <div className="sidebar__footer">
        {canTeamAccess('view','settings') ? <button className={`sidebar__item sidebar__settings ${route === 'settings' ? 'is-active' : ''}`} type="button" onClick={() => setRoute('settings')} aria-current={route === 'settings' ? 'page' : undefined} title="Configurações"><Settings size={19} /><span>Configurações</span></button> : null}
        {preferences.appearance.sidebarShowProfile ? <button className="sidebar__profile" type="button" onClick={() => setRoute('settings')} title={user?.displayName ?? 'Usuário'}>
          <span className="avatar avatar--small">{initials(user?.displayName ?? 'Usuário')}</span>
          <span className="sidebar__profile-copy"><strong>{user?.displayName ?? 'Usuário'}</strong><small>{user?.email ?? ''}</small></span>
        </button> : null}
        <button className="sidebar__item sidebar__logout" type="button" onClick={() => void signOut()} title="Sair da conta"><LogOut size={19} /><span>Sair da conta</span></button>
        <button className="sidebar__collapse" type="button" onClick={toggleSidebar} aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'} title={collapsed ? 'Expandir menu' : 'Recolher menu'}><PanelLeft size={18} /></button>
      </div>
    </aside>
  )
}
