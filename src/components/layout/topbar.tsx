import { Bell, CircleHelp, HardDrive, Plus, RefreshCw, Search, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useApp } from '../../app/app-context'
import type { Lead } from '../../domain/types'
import { Button } from '../ui/button'
import { CreateLeadModal } from '../../features/leads/create-lead-modal'
import { EditLeadModal } from '../../features/leads/edit-lead-modal'
import { routeTitles } from './navigation'
import { WorkspaceSwitcher } from '../../features/workspaces/workspace-switcher'
import { usePreferences } from '../../features/settings/preferences-context'
import { QuickHelpModal } from '../../features/help/quick-help-modal'
import { PageCustomizationDrawer } from '../../features/experience/page-customization-drawer'
import { NotificationCenter } from '../../features/experience/notification-center'
import { useExperience } from '../../features/experience/experience-context'

export function Topbar() {
  const { route, refresh, repositoryMode, setRoute, snapshot, currentWorkspace } = useApp()
  const { preferences } = usePreferences()
  const { preferences: experiencePreferences } = useExperience()
  const [leadModalOpen, setLeadModalOpen] = useState(false)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [search, setSearch] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [customizationOpen, setCustomizationOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const baseMeta = routeTitles[route]
  const meta = { ...baseMeta, title: preferences.navigation.labels[route]?.trim() || baseMeta.title }
  const notificationCount = useMemo(() => {
    if (!snapshot) return 0
    const now = Date.now()
    const nextDay = now + 24 * 60 * 60 * 1000
    const nextThreeDays = now + 3 * 24 * 60 * 60 * 1000
    const overdue = experiencePreferences.notifications.overdueActivities ? snapshot.activities.filter((activity) => !activity.completedAt && activity.dueAt && new Date(activity.dueAt).getTime() <= now).length : 0
    const upcoming = experiencePreferences.notifications.upcomingEvents ? snapshot.events.filter((event) => event.status !== 'cancelled' && new Date(event.startsAt).getTime() >= now && new Date(event.startsAt).getTime() <= nextDay).length : 0
    const proposals = experiencePreferences.notifications.proposalFollowups ? snapshot.proposals.filter((proposal) => (proposal.status === 'sent' || proposal.status === 'viewed') && proposal.expectedCloseAt && new Date(proposal.expectedCloseAt).getTime() <= nextThreeDays).length : 0
    const failed = experiencePreferences.notifications.automationFailures ? snapshot.automationRuns.filter((run) => run.status === 'failed').length : 0
    return overdue + upcoming + proposals + failed
  }, [experiencePreferences.notifications, snapshot])
  const searchResults = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query || !snapshot) return []
    return snapshot.leads.filter((lead) => `${lead.name} ${lead.company} ${lead.phone} ${lead.email} ${lead.city}`.toLowerCase().includes(query)).slice(0, 6)
  }, [search, snapshot])

  return (
    <>
      <header className="topbar">
        <div className="topbar__inner">
          <div className="topbar__title">
            <h1>{meta.title}</h1>
            <p>{meta.subtitle}</p>
          </div>
          <div className="topbar__actions">
            <WorkspaceSwitcher />
            <div className="global-search-wrap">
              <label className={`global-search ${searchFocused ? 'is-focused' : ''}`}>
                <Search size={18} />
                <input value={search} onFocus={() => setSearchFocused(true)} onBlur={() => window.setTimeout(() => setSearchFocused(false), 150)} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar leads" />
                {search ? <span>{searchResults.length}</span> : null}
              </label>
              {searchFocused && search.trim() ? <div className="global-search-results">
                <div className="global-search-results__heading"><strong>Resultados</strong><span>{searchResults.length ? `Até ${searchResults.length} encontrados` : 'Nenhum lead encontrado'}</span></div>
                {searchResults.map((lead) => <button type="button" key={lead.id} onMouseDown={(event) => event.preventDefault()} onClick={() => { setSelectedLead(lead); setSearchFocused(false) }}>
                  <span className="lead-cell__avatar">{lead.name.slice(0, 2).toUpperCase()}</span>
                  <span><strong>{lead.name}</strong><small>{lead.company || lead.city || 'Sem empresa'} · {lead.phone || 'Sem telefone'}</small></span>
                </button>)}
                <button className="global-search-results__all" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setRoute('leads'); setSearchFocused(false) }}>Abrir base de leads</button>
              </div> : null}
            </div>
            {repositoryMode === 'local' ? <span className="local-mode-badge" title="Os dados ficam salvos apenas neste navegador"><HardDrive size={14} /> <span>Modo local</span></span> : null}
            <button className="icon-button topbar__customize" type="button" aria-label="Personalizar visualização" title="Personalizar visualização" onClick={() => setCustomizationOpen(true)}><SlidersHorizontal size={19} /></button>
            <button className="icon-button topbar__help" type="button" aria-label="Abrir guia rápido" onClick={() => setHelpOpen(true)}><CircleHelp size={19} /></button>
            <Button variant="secondary" className="topbar__refresh" onClick={() => void refresh()} aria-label="Atualizar dados"><RefreshCw size={17} /></Button>
            {currentWorkspace?.role !== 'viewer' && route !== 'leads' ? <Button onClick={() => { setRoute('leads'); setLeadModalOpen(true) }}><Plus size={18} /> Novo lead</Button> : null}
            <button className="icon-button icon-button--notification" type="button" aria-label="Abrir central de notificações" onClick={() => setNotificationsOpen(true)}><Bell size={20} />{notificationCount ? <span>{notificationCount > 99 ? '99+' : notificationCount}</span> : null}</button>
          </div>
        </div>
      </header>
      <CreateLeadModal open={leadModalOpen} onClose={() => setLeadModalOpen(false)} />
      <EditLeadModal lead={selectedLead} open={Boolean(selectedLead)} onClose={() => setSelectedLead(null)} />
      <QuickHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <PageCustomizationDrawer route={route} open={customizationOpen} onClose={() => setCustomizationOpen(false)} />
      <NotificationCenter open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </>
  )
}
