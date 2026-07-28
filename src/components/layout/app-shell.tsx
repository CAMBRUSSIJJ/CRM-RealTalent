import { useEffect, type PropsWithChildren } from 'react'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'
import { MobileNav } from './mobile-nav'
import { ToastRegion } from '../ui/toast-region'
import { Eye } from 'lucide-react'
import { useApp } from '../../app/app-context'
import { AgendaReminderWatcher } from '../../features/agenda/agenda-reminder-watcher'
import { recordDiagnostic } from '../../lib/diagnostics'

export function AppShell({ children }: PropsWithChildren) {
  const { currentWorkspace, route } = useApp()
  const readOnly = currentWorkspace?.role === 'viewer'
  useEffect(() => {
    const error = (event: ErrorEvent) => recordDiagnostic({ severity: 'error', source: 'janela', message: event.message || 'Erro não tratado', route, workspaceId: currentWorkspace?.id ?? null })
    const rejection = (event: PromiseRejectionEvent) => recordDiagnostic({ severity: 'error', source: 'promessa', message: event.reason instanceof Error ? event.reason.message : String(event.reason ?? 'Falha assíncrona'), route, workspaceId: currentWorkspace?.id ?? null })
    const offline = () => recordDiagnostic({ severity: 'warning', source: 'conectividade', message: 'O navegador ficou sem conexão.', route, workspaceId: currentWorkspace?.id ?? null })
    window.addEventListener('error', error); window.addEventListener('unhandledrejection', rejection); window.addEventListener('offline', offline)
    return () => { window.removeEventListener('error', error); window.removeEventListener('unhandledrejection', rejection); window.removeEventListener('offline', offline) }
  }, [currentWorkspace?.id, route])
  return (
    <div className={`app-shell ${readOnly ? 'app-shell--read-only' : ''}`}>
      <Sidebar />
      <div className="app-shell__main">
        <Topbar />
        {readOnly ? <div className="read-only-banner"><Eye size={16} /><span><strong>Modo somente leitura.</strong> Você pode consultar e exportar dados, mas as alterações estão bloqueadas para este perfil.</span></div> : null}
        <main className="app-content">{children}</main>
      </div>
      <MobileNav />
      <AgendaReminderWatcher />
      <ToastRegion />
    </div>
  )
}
