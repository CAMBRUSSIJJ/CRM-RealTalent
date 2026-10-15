import { useEffect, type PropsWithChildren } from 'react'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'
import { MobileNav } from './mobile-nav'
import { ToastRegion } from '../ui/toast-region'
import { ActionDialogCenter } from '../ui/action-dialog-center'
import { Eye } from 'lucide-react'
import { useAppNavigation, useAppWorkspace } from '../../app/app-context'
import { BrowserNotificationWatcher } from '../../features/experience/browser-notification-watcher'
import { recordDiagnostic } from '../../lib/diagnostics'
import { GuidedTourOverlay } from '../../features/help/guided-tour-overlay'
import { routeTitles } from './navigation'

export function AppShell({ children }: PropsWithChildren) {
  const { currentWorkspace, canWrite } = useAppWorkspace()
  const { route } = useAppNavigation()
  const readOnly = !canWrite
  useEffect(() => {
    const meta = routeTitles[route]
    document.title = `${meta.title} · RealTalent CRM`
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [route])
  useEffect(() => {
    const error = (event: ErrorEvent) => recordDiagnostic({ severity: 'error', source: 'janela', message: event.message || 'Erro não tratado', route, workspaceId: currentWorkspace?.id ?? null })
    const rejection = (event: PromiseRejectionEvent) => recordDiagnostic({ severity: 'error', source: 'promessa', message: event.reason instanceof Error ? event.reason.message : String(event.reason ?? 'Falha assíncrona'), route, workspaceId: currentWorkspace?.id ?? null })
    const offline = () => recordDiagnostic({ severity: 'warning', source: 'conectividade', message: 'O navegador ficou sem conexão.', route, workspaceId: currentWorkspace?.id ?? null })
    window.addEventListener('error', error); window.addEventListener('unhandledrejection', rejection); window.addEventListener('offline', offline)
    return () => { window.removeEventListener('error', error); window.removeEventListener('unhandledrejection', rejection); window.removeEventListener('offline', offline) }
  }, [currentWorkspace?.id, route])
  return (
    <div className={`app-shell app-shell--route-${route} ${readOnly ? 'app-shell--read-only' : ''}`} data-route={route}>
      <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
      <Sidebar />
      <div className="app-shell__main">
        <Topbar />
        {readOnly ? <div className="read-only-banner"><Eye size={16} /><span><strong>Modo somente leitura.</strong> Você pode consultar e exportar dados, mas as alterações estão bloqueadas para este perfil.</span></div> : null}
        <main id="main-content" className="app-content" tabIndex={-1}>{children}</main>
      </div>
      <MobileNav />
      <BrowserNotificationWatcher />
      <ToastRegion />
      <ActionDialogCenter />
      <GuidedTourOverlay />
    </div>
  )
}
