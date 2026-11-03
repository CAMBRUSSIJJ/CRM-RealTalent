import { Bell, CircleHelp, HardDrive, Plus, RefreshCw, Search, SlidersHorizontal, Sparkles } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { activeOverlayCount } from '../../app/overlay-manager'
import { useAppActions, useAppNavigation, useAppWorkspace } from '../../app/app-context'
import { Button } from '../ui/button'
import { Input } from '../ui/form-controls'
import { CreateLeadModal } from '../../features/leads/create-lead-modal'
import { routeTitles } from './navigation'
import { WorkspaceSwitcher } from '../../features/workspaces/workspace-switcher'
import { usePreferences } from '../../features/settings/preferences-context'
import { QuickHelpModal } from '../../features/help/quick-help-modal'
import { PageCustomizationDrawer } from '../../features/experience/page-customization-drawer'
import { NotificationCenter } from '../../features/experience/notification-center'
import { useExperience } from '../../features/experience/experience-context'
import { buildNotificationAlerts } from '../../services/notification-engine'
import { NOTIFICATION_STATE_EVENT } from '../../services/notification-state'
import { globalSearchKindLabel, searchWorkspace, type GlobalSearchResult } from '../../services/global-search'
import { GlobalSearchPopover } from './global-search-popover'

const AssistantDrawer = lazy(() => import('../../features/assistant/assistant-drawer').then((module) => ({ default: module.AssistantDrawer })))

export function Topbar() {
  const { repositoryMode, snapshot, currentWorkspace, can } = useAppWorkspace()
  const { route, setRoute, navigate } = useAppNavigation()
  const { refresh } = useAppActions()
  const { preferences } = usePreferences()
  const { preferences: experiencePreferences } = useExperience()
  const [leadModalOpen, setLeadModalOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchWrapRef = useRef<HTMLDivElement>(null)
  const [highlightedResult, setHighlightedResult] = useState(0)
  const [helpOpen, setHelpOpen] = useState(false)
  const [customizationOpen, setCustomizationOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [assistantPrompt, setAssistantPrompt] = useState('')
  const [notificationRevision, setNotificationRevision] = useState(0)
  const baseMeta = routeTitles[route]
  const meta = { ...baseMeta, title: preferences.navigation.labels[route]?.trim() || baseMeta.title }
  const notificationCount = useMemo(() => {
    if (!snapshot || !experiencePreferences.notifications.inAppEnabled) return 0
    return buildNotificationAlerts(snapshot, experiencePreferences.notifications, { staleLeadDays: preferences.commercial.staleLeadDays }).length
  }, [experiencePreferences.notifications, notificationRevision, preferences.commercial.staleLeadDays, snapshot])
  const openAssistant = () => {
    if (activeOverlayCount() > 0) return
    setCustomizationOpen(false); setNotificationsOpen(false); setAssistantOpen(true)
  }
  const openCustomization = () => { setAssistantOpen(false); setNotificationsOpen(false); setCustomizationOpen(true) }
  const openNotifications = () => { setAssistantOpen(false); setCustomizationOpen(false); setNotificationsOpen(true) }

  useEffect(() => {
    const onNotificationState = () => setNotificationRevision((value) => value + 1)
    window.addEventListener(NOTIFICATION_STATE_EVENT, onNotificationState)
    return () => window.removeEventListener(NOTIFICATION_STATE_EVENT, onNotificationState)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault()
        if (activeOverlayCount() > 0 && !assistantOpen) return
        setCustomizationOpen(false); setNotificationsOpen(false); setAssistantPrompt(''); setAssistantOpen((current) => !current)
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (activeOverlayCount() > 0) return
        searchInputRef.current?.focus()
        setSearchFocused(true)
      }
      if (event.key === 'Escape' && document.activeElement === searchInputRef.current) {
        setSearchFocused(false)
        searchInputRef.current?.blur()
      }
    }
    const onAssistantOpen = (event: Event) => {
      const prompt = (event as CustomEvent<{ prompt?: string }>).detail?.prompt ?? ''
      setCustomizationOpen(false); setNotificationsOpen(false); setHelpOpen(false); setAssistantPrompt(prompt); setAssistantOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('crm:assistant-open', onAssistantOpen)
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('crm:assistant-open', onAssistantOpen) }
  }, [assistantOpen])

  const searchResults = useMemo(() => searchWorkspace(search, snapshot, 10), [search, snapshot])
  const groupedSearchResults = useMemo(() => {
    const groups: Array<{ key: string; label: string; items: GlobalSearchResult[] }> = []
    for (const result of searchResults) {
      const label = globalSearchKindLabel[result.kind]
      const key = result.kind === 'lead' || result.kind === 'contact' ? 'contact' : result.kind
      const existing = groups.find((group) => group.key === key)
      if (existing) existing.items.push(result)
      else groups.push({ key, label: key === 'contact' ? 'Contatos' : label, items: [result] })
    }
    return groups
  }, [searchResults])
  const flatSearchResults = groupedSearchResults.flatMap((group) => group.items)
  const openSearchResult = (result: GlobalSearchResult) => {
    if (result.kind === 'lead') {
      const lead = snapshot?.leads.find((item) => `lead:${item.id}` === result.id)
      if (lead) navigate('leads', { leadId: lead.id, action: 'contact-record' })
      else navigate(result.route, result.context)
    } else navigate(result.route, result.context)
    setSearchFocused(false)
    setSearch('')
  }

  return (
    <>
      <header className="topbar global-appbar-v10162">
        <div className="global-appbar-v10162__inner">
          <div className="global-appbar-v10162__left">
            <div className="global-search-wrap" ref={searchWrapRef}>
              <label className={`global-search ${searchFocused ? 'is-focused' : ''}`}>
                <Search size={17} />
                <Input ref={searchInputRef} value={search} role="combobox" aria-autocomplete="list" aria-haspopup="listbox"
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => window.setTimeout(() => setSearchFocused(false), 150)}
                  onChange={(event) => { setSearch(event.target.value); setHighlightedResult(0) }}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                      if (!flatSearchResults.length) return
                      event.preventDefault()
                      setHighlightedResult((index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + flatSearchResults.length) % flatSearchResults.length)
                    } else if (event.key === 'Enter' && flatSearchResults.length) {
                      event.preventDefault()
                      openSearchResult(flatSearchResults[Math.min(highlightedResult, flatSearchResults.length - 1)])
                    } else if (event.key === 'Escape') {
                      event.preventDefault()
                      setSearchFocused(false)
                      searchInputRef.current?.blur()
                    }
                  }}
                  placeholder="Encontrar no RealTalent · Ctrl/⌘ K"
                  aria-label="Busca global no CRM"
                  aria-expanded={searchFocused && Boolean(search.trim())}
                  aria-controls="global-search-results"
                  aria-activedescendant={searchFocused && flatSearchResults.length ? 'rt-global-find-result-' + Math.min(highlightedResult, flatSearchResults.length - 1) : undefined} />
                {search ? <span>{searchResults.length}</span> : null}
              </label>
              {searchFocused && search.trim() ? <GlobalSearchPopover
                anchorRef={searchWrapRef}
                query={search}
                groups={groupedSearchResults}
                total={searchResults.length}
                activeIndex={highlightedResult}
                onOpen={openSearchResult}
                onClose={() => setSearchFocused(false)}
                onAllContacts={() => { setRoute('leads'); setSearchFocused(false); setSearch('') }}
              /> : null}
            </div>
            <button className="global-appbar-v10162__assistant" type="button" onClick={openAssistant} title="RealTalent Assistant · Ctrl/⌘ + J"><Sparkles size={16} /><span>RealTalent Assistant</span></button>
          </div>

          <div className="global-appbar-v10162__right">
            <span className="global-appbar-v10162__context" title={meta.subtitle}>{meta.title}</span>
            {repositoryMode === 'local' ? <span className="local-mode-badge" title="Os dados ficam salvos apenas neste navegador"><HardDrive size={14} /><span>Local</span></span> : null}
            {can('create', 'contact') ? <button className="icon-button" type="button" aria-label="Criar novo contato" title="Novo contato" onClick={() => { setRoute('leads'); setLeadModalOpen(true) }}><Plus size={18} /></button> : null}
            <button className="icon-button topbar__refresh" type="button" onClick={() => void refresh()} aria-label="Atualizar dados" title="Atualizar"><RefreshCw size={17} /></button>
            <button className="icon-button topbar__help" type="button" aria-label="Abrir guia rápido" title="Ajuda" onClick={() => setHelpOpen(true)}><CircleHelp size={18} /></button>
            {route !== 'dashboard' ? <button className="icon-button topbar__customize" type="button" aria-label="Personalizar visualização" title="Personalizar visualização" onClick={openCustomization}><SlidersHorizontal size={18} /></button> : null}
            <button className="icon-button icon-button--notification" type="button" aria-label="Abrir central de notificações" title="Notificações" onClick={openNotifications}><Bell size={18} />{notificationCount ? <span>{notificationCount > 99 ? '99+' : notificationCount}</span> : null}</button>
            <WorkspaceSwitcher />
          </div>
        </div>
      </header>
      <CreateLeadModal open={leadModalOpen} onClose={() => setLeadModalOpen(false)} />
      <QuickHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <PageCustomizationDrawer route={route} open={customizationOpen} onClose={() => setCustomizationOpen(false)} />
      <NotificationCenter open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
      {assistantOpen ? <Suspense fallback={null}><AssistantDrawer open={assistantOpen} initialPrompt={assistantPrompt} onClose={() => { setAssistantOpen(false); setAssistantPrompt('') }} /></Suspense> : null}
    </>
  )
}
