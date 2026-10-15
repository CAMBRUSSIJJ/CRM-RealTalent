import { lazy, Suspense, useEffect, useState } from 'react'
import { AppShell } from '../components/layout/app-shell'
import { useAppActions, useAppNavigation, useAppWorkspace } from './app-context'
import { useAuth } from '../features/auth/auth-context'
import { AuthPage } from '../features/auth/auth-page'
import { AlertTriangle, LoaderCircle, LockKeyhole, RefreshCw, Settings2 } from 'lucide-react'
import { Button } from '../components/ui/button'
import { WorkspaceOnboarding } from '../features/workspaces/workspace-onboarding'
import { LocalOnboarding } from '../features/onboarding/local-onboarding'
import { isLocalSetupPending } from '../lib/local-experience'
import { configurationError } from '../lib/env'
import { PageExperienceBoundary } from '../features/experience/page-experience-boundary'
import { VoiceInboundWatcher } from '../features/calls/voice-inbound-watcher'
import { BrandSplash } from '../features/auth/brand-splash'
import { routeAccessResource } from '../components/layout/navigation'
import { markCommercialRouteReady, markCommercialRouteStart } from '../lib/commercial-observability'

const DashboardPage = lazy(() => import('../features/dashboard/dashboard-page').then((module) => ({ default: module.DashboardPage })))
const LeadsPage = lazy(() => import('../features/leads/leads-page').then((module) => ({ default: module.LeadsPage })))
const CommercialMapPage = lazy(() => import('../features/commercial-map/commercial-map-page').then((module) => ({ default: module.CommercialMapPage })))
const PipelinePage = lazy(() => import('../features/pipeline/pipeline-page').then((module) => ({ default: module.PipelinePage })))
const TasksPage = lazy(() => import('../features/tasks/tasks-page').then((module) => ({ default: module.TasksPage })))
const TeamsPage = lazy(() => import('../features/teams/teams-page').then((module) => ({ default: module.TeamsPage })))
const FollowupsPage = lazy(() => import('../features/followups/followups-page').then((module) => ({ default: module.FollowupsPage })))
const CallsPage = lazy(() => import('../features/calls/calls-page').then((module) => ({ default: module.CallsPage })))
const CommunicationsPage = lazy(() => import('../features/communications/communications-page').then((module) => ({ default: module.CommunicationsPage })))
const ProposalsPage = lazy(() => import('../features/proposals/proposals-page').then((module) => ({ default: module.ProposalsPage })))
const AgendaPage = lazy(() => import('../features/agenda/agenda-page').then((module) => ({ default: module.AgendaPage })))
const PlaybooksPage = lazy(() => import('../features/playbooks/playbooks-page').then((module) => ({ default: module.PlaybooksPage })))
const GoalsPage = lazy(() => import('../features/goals/goals-page').then((module) => ({ default: module.GoalsPage })))
const AutomationsPage = lazy(() => import('../features/automations/automations-page').then((module) => ({ default: module.AutomationsPage })))
const MetricsPage = lazy(() => import('../features/metrics/metrics-page').then((module) => ({ default: module.MetricsPage })))
const ProspectingPage = lazy(() => import('../features/prospecting/prospecting-page').then((module) => ({ default: module.ProspectingPage })))
const SettingsPage = lazy(() => import('../features/settings/settings-page').then((module) => ({ default: module.SettingsPage })))
const ModulePlaceholder = lazy(() => import('../features/modules/module-placeholder').then((module) => ({ default: module.ModulePlaceholder })))
const BuyerRoomPublicPage = lazy(() => import('../features/proposals/buyer-room-public-page').then((module) => ({ default: module.BuyerRoomPublicPage })))

const commercialPrefetchers: Partial<Record<string, () => Promise<unknown>>> = {
  leads: () => import('../features/leads/leads-page'),
  proposals: () => import('../features/proposals/proposals-page'),
  prospecting: () => import('../features/prospecting/prospecting-page'),
}
const prefetchedCommercialRoutes = new Set<string>()
export const prefetchCommercialRoute = (route: string) => {
  if (prefetchedCommercialRoutes.has(route)) return
  const prefetch = commercialPrefetchers[route]
  if (!prefetch) return
  prefetchedCommercialRoutes.add(route)
  const run = () => { void prefetch().catch(() => prefetchedCommercialRoutes.delete(route)) }
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 1800 })
  else globalThis.setTimeout(run, 350)
}

function RouteContent() {
  const { route } = useAppNavigation()
  const { canTeamAccess } = useAppWorkspace()
  const requiredResource = routeAccessResource(route)
  if (requiredResource && !canTeamAccess('view', requiredResource)) return <section className="fatal-state access-denied-h22"><LockKeyhole size={30}/><h1>Acesso restrito</h1><p>Seu perfil não possui permissão para visualizar esta área.</p></section>
  let content
  if (route === 'dashboard') content = <DashboardPage />
  else if (route === 'leads') content = <LeadsPage />
  else if (route === 'commercial-map') content = <CommercialMapPage />
  else if (route === 'pipeline') content = <PipelinePage />
  else if (route === 'tasks') content = <TasksPage />
  else if (route === 'teams') content = <TeamsPage />
  else if (route === 'followups') content = <FollowupsPage />
  else if (route === 'calls') content = <CallsPage />
  else if (route === 'communications') content = <CommunicationsPage />
  else if (route === 'proposals') content = <ProposalsPage />
  else if (route === 'agenda') content = <AgendaPage />
  else if (route === 'playbooks') content = <PlaybooksPage />
  else if (route === 'goals') content = <GoalsPage />
  else if (route === 'automations') content = <AutomationsPage />
  else if (route === 'metrics') content = <MetricsPage />
  else if (route === 'prospecting') content = <ProspectingPage />
  else if (route === 'settings') content = <SettingsPage />
  else content = <ModulePlaceholder route={route} />
  return <PageExperienceBoundary route={route}>{content}</PageExperienceBoundary>
}

function CommercialRoutePerformanceObserver({ routeDataLoading }: { routeDataLoading: boolean }) {
  const { route } = useAppNavigation()
  const { currentWorkspace } = useAppWorkspace()
  useEffect(() => {
    markCommercialRouteStart(route)
  }, [route])
  useEffect(() => {
    if (routeDataLoading) return
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => markCommercialRouteReady(route, currentWorkspace?.id ?? null))
    })
    return () => window.cancelAnimationFrame(frame)
  }, [currentWorkspace?.id, route, routeDataLoading])
  return null
}

function LoadingModule() {
  const [slow, setSlow] = useState(false)
  useEffect(() => { const timer = window.setTimeout(() => setSlow(true), 8000); return () => window.clearTimeout(timer) }, [])
  if (!slow) return <div className="module-loading module-loading-v10167"><LoaderCircle className="spin" /><span>Carregando módulo...</span><small>Preparando a área de trabalho.</small></div>
  return <div className="module-loading module-loading-v10167 module-loading-v10167--slow" role="alert"><AlertTriangle /><strong>Este módulo está demorando para abrir</strong><p>Você pode tentar novamente ou abrir o diagnóstico do CRM para verificar conexão e runtime.</p><div><Button onClick={() => window.location.reload()}><RefreshCw size={16}/> Tentar novamente</Button><Button variant="secondary" onClick={() => { window.location.hash = '#/settings' }}><Settings2 size={16}/> Abrir diagnóstico</Button></div></div>
}

function CommercialIdlePrefetch() {
  const { route } = useAppNavigation()
  useEffect(() => {
    const likelyNext = route === 'dashboard' ? ['leads', 'pipeline'] : route === 'leads' ? ['pipeline', 'proposals'] : route === 'pipeline' ? ['proposals'] : []
    for (const next of likelyNext) prefetchCommercialRoute(next)
  }, [route])
  return null
}

export function App() {
  const { user, loading: authLoading, mode, recoveryMode } = useAuth()
  const { loading, routeDataLoading, error, currentWorkspace, workspaces } = useAppWorkspace()
  const { reinitialize } = useAppActions()
  const [minimumIntroComplete, setMinimumIntroComplete] = useState(false)
  const [introComplete, setIntroComplete] = useState(false)
  const buyerRoomToken = new URLSearchParams(window.location.search).get('buyer-room')

  useEffect(() => {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const timer = window.setTimeout(() => setMinimumIntroComplete(true), reducedMotion ? 180 : 1450)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!minimumIntroComplete || authLoading || introComplete) return
    const doc = document as Document & { startViewTransition?: (callback: () => void) => { finished: Promise<void> } }
    if (doc.startViewTransition && !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)) {
      doc.startViewTransition(() => setIntroComplete(true))
    } else {
      setIntroComplete(true)
    }
  }, [authLoading, introComplete, minimumIntroComplete])

  if (buyerRoomToken) return <Suspense fallback={<LoadingModule/>}><BuyerRoomPublicPage token={buyerRoomToken}/></Suspense>
  if (configurationError) return <div className="fatal-state"><h1>Ambiente não configurado</h1><p>{configurationError}</p><p>O modo local não foi ativado automaticamente para evitar perda ou divergência de dados.</p></div>
  if (!introComplete) return <BrandSplash message={authLoading ? 'Validando sua sessão...' : 'Preparando seu CRM...'} />
  if (!user || recoveryMode) return <AuthPage />
  if (loading) return <BrandSplash message="Carregando seu workspace..." />
  if (error) return <div className="fatal-state"><h1>Não foi possível abrir o CRM</h1><p>{error}</p><Button onClick={() => window.location.reload()}><RefreshCw size={17} /> Tentar novamente</Button></div>

  if (mode === 'local' && isLocalSetupPending()) return <LocalOnboarding onComplete={reinitialize} />

  if (mode === 'supabase' && user && !currentWorkspace && workspaces.length === 0) return <WorkspaceOnboarding />

  return <AppShell><CommercialRoutePerformanceObserver routeDataLoading={routeDataLoading}/><CommercialIdlePrefetch/>{routeDataLoading ? <LoadingModule /> : <Suspense fallback={<LoadingModule />}><RouteContent /></Suspense>}<VoiceInboundWatcher /></AppShell>
}
