import { ChevronsLeft, ChevronsRight, LogOut, Zap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../../app/app-context'
import { useAuth } from '../../features/auth/auth-context'
import { usePreferences } from '../../features/settings/preferences-context'
import { APP_VERSION_LABEL } from '../../lib/app-version'
import { initials } from '../../domain/formatters'
import { navigationItems, type NavigationGroup } from './navigation'

const GROUPS: NavigationGroup[] = ['Operação', 'Estratégia', 'Sistema']

export function Sidebar() {
  const { preferences, savePreferences } = usePreferences()
  const [collapsed, setCollapsed] = useState(preferences.appearance.sidebar === 'compact')
  const { route, setRoute } = useApp()
  const { user, signOut, mode } = useAuth()
  const orderedItems = useMemo(() => preferences.navigation.order
    .map((itemRoute) => navigationItems.find((item) => item.route === itemRoute))
    .filter((item): item is (typeof navigationItems)[number] => Boolean(item))
    .filter((item) => preferences.navigation.visibleRoutes.includes(item.route)), [preferences.navigation])
  const groupedItems = useMemo(() => GROUPS.map((group) => ({ group, items: orderedItems.filter((item) => item.group === group) })).filter((section) => section.items.length), [orderedItems])

  useEffect(() => { setCollapsed(preferences.appearance.sidebar === 'compact') }, [preferences.appearance.sidebar])

  const toggleSidebar = () => {
    const nextCollapsed = !collapsed
    setCollapsed(nextCollapsed)
    savePreferences({ ...preferences, appearance: { ...preferences.appearance, sidebar: nextCollapsed ? 'compact' : 'expanded' } })
  }

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
      <div className="sidebar__brand">
        <div className="sidebar__logo">{preferences.company.logoDataUrl ? <img src={preferences.company.logoDataUrl} alt="Logo" /> : <Zap size={20} fill="currentColor" />}</div>
        <div className="sidebar__brand-copy"><strong>{preferences.company.name || 'RealTalent'}</strong><span>CRM {APP_VERSION_LABEL}</span></div>
      </div>
      <nav className="sidebar__nav" aria-label="Navegação principal">
        {groupedItems.map(({ group, items }) => (
          <div className="sidebar__group" key={group}>
            <span className="sidebar__group-label">{group}</span>
            {items.map(({ route: itemRoute, label, icon: Icon }) => {
              const customLabel = preferences.navigation.labels[itemRoute]?.trim() || label
              return <button key={itemRoute} type="button" className={`sidebar__item ${route === itemRoute ? 'is-active' : ''}`} onClick={() => setRoute(itemRoute)} title={collapsed ? customLabel : undefined}>
                <Icon size={19} /><span>{customLabel}</span>
              </button>
            })}
          </div>
        ))}
      </nav>
      <div className="sidebar__footer">
        <button className="sidebar__profile" type="button" onClick={() => setRoute('settings')}>
          <span className="avatar avatar--small">{initials(user?.displayName ?? 'Usuário')}</span>
          <span className="sidebar__profile-copy"><strong>{user?.displayName ?? 'Usuário'}</strong><small>{user?.email ?? ''}</small></span>
        </button>
        {mode === 'supabase' ? <button className="sidebar__item" type="button" onClick={() => void signOut()} title="Sair"><LogOut size={19} /><span>Sair</span></button> : null}
        <button className="sidebar__collapse" type="button" onClick={toggleSidebar} aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}>{collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}</button>
      </div>
    </aside>
  )
}
