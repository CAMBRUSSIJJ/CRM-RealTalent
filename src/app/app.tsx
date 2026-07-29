import { lazy, Suspense } from 'react'
import { AppShell } from '../components/layout/app-shell'
import { useApp } from './app-context'
import { useAuth } from '../features/auth/auth-context'
import { AuthPage } from '../features/auth/auth-page'
import { LoaderCircle, RefreshCw, Zap } from 'lucide-react'
import { Button } from '../components/ui/button'
import { WorkspaceOnboarding } from '../features/workspaces/workspace-onboarding'
import { LocalOnboarding } from '../features/onboarding/local-onboarding'
import { isLocalSetupPending } from '../lib/local-experience'
import { configurationError } from '../lib/env'
import { PageExperienceBoundary } from '../features/experience/page-experience-boundary'

const DashboardPage = lazy(() => import('../features/dashboard/dashboard-page').then((module) => ({ default: module.DashboardPage })))
const LeadsPage = lazy(() => import('../features/leads/leads-page').then((module) => ({ default: module.LeadsPage })))
const CommercialMapPage = lazy(() => import('../features/commercial-map/commercial-map-page').then((module) => ({ default: module.CommercialMapPage })))
const PipelinePage = lazy(() => import('../features/pipeline/pipeline-page').then((module) => ({ default: module.PipelinePage })))
const FollowupsPage = lazy(() => import('../features/followups/followups-page').then((module) => ({ default: module.FollowupsPage })))
const CallsPage = lazy(() => import('../features/calls/calls-page').then((module) => ({ default: module.CallsPage })))
const ProposalsPage = lazy(() => import('../features/proposals/proposals-page').then((module) => ({ default: module.ProposalsPage })))
const AgendaPage = lazy(() => import('../features/agenda/agenda-page').then((module) => ({ default: module.AgendaPage })))
const PlaybooksPage = lazy(() => import('../features/playbooks/playbooks-page').then((module) => ({ default: module.PlaybooksPage })))
const GoalsPage = lazy(() => import('../features/goals/goals-page').then((module) => ({ default: module.GoalsPage })))
const AutomationsPage = lazy(() => import('../features/automations/automations-page').then((module) => ({ default: module.AutomationsPage })))
const MetricsPage = lazy(() => import('../features/metrics/metrics-page').then((module) => ({ default: module.MetricsPage })))
const ProspectingPage = lazy(() => import('../features/prospecting/prospecting-page').then((module) => ({ default: module.ProspectingPage })))
const SettingsPage = lazy(() => import('../features/settings/settings-page').then((module) => ({ default: module.SettingsPage })))
const ModulePlaceholder = lazy(() => import('../features/modules/module-placeholder').then((module) => ({ default: module.ModulePlaceholder })))

function RouteContent() {
  const { route } = useApp()
  let content
  if (route === 'dashboard') content = <DashboardPage />
  else if (route === 'leads') content = <LeadsPage />
  else if (route === 'commercial-map') content = <CommercialMapPage />
  else if (route === 'pipeline') content = <PipelinePage />
  else if (route === 'followups') content = <FollowupsPage />
  else if (route === 'calls') content = <CallsPage />
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

const LoadingModule = () => <div className="module-loading"><LoaderCircle className="spin" /><span>Carregando módulo...</span></div>

export function App() {
  const { user, loading: authLoading, mode, recoveryMode } = useAuth()
  const { loading, error, currentWorkspace, workspaces, reinitialize } = useApp()

  if (configurationError) return <div className="fatal-state"><h1>Ambiente não configurado</h1><p>{configurationError}</p><p>O modo local não foi ativado automaticamente para evitar perda ou divergência de dados.</p></div>
  if (authLoading) return <div className="boot-screen"><span><Zap size={28} fill="currentColor" /></span><LoaderCircle className="spin" /><p>Validando sua sessão...</p></div>
  if (mode === 'supabase' && (!user || recoveryMode)) return <AuthPage />
  if (loading) return <div className="boot-screen"><span><Zap size={28} fill="currentColor" /></span><LoaderCircle className="spin" /><p>Carregando workspace...</p></div>
  if (error) return <div className="fatal-state"><h1>Não foi possível abrir o CRM</h1><p>{error}</p><Button onClick={() => window.location.reload()}><RefreshCw size={17} /> Tentar novamente</Button></div>

  if (mode === 'local' && isLocalSetupPending()) return <LocalOnboarding onComplete={reinitialize} />

  if (mode === 'supabase' && user && !currentWorkspace && workspaces.length === 0) return <WorkspaceOnboarding />

  return <AppShell><Suspense fallback={<LoadingModule />}><RouteContent /></Suspense></AppShell>
}
