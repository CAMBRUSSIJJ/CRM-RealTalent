import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useApp } from '../../app/app-context'

export function ToastRegion() {
  const { toasts, dismissToast, notify } = useApp()
  return (
    <div className="toast-region" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => {
        const Icon = toast.type === 'success' ? CheckCircle2 : toast.type === 'error' ? AlertCircle : Info
        const style = { '--toast-duration': `${toast.duration}ms` } as CSSProperties
        const runAction = async () => {
          dismissToast(toast.id)
          try { await toast.action?.run() }
          catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível concluir a ação.') }
        }
        return (
          <div className={`toast toast--${toast.type} ${toast.closing ? 'is-closing' : ''}`} style={style} key={toast.id} role="status">
            <Icon size={18} aria-hidden="true" />
            <span className="toast__message">{toast.message}</span>
            {toast.action ? <button className="toast__action" type="button" onClick={() => void runAction()}>{toast.action.label}</button> : null}
            <button className="toast__close" type="button" onClick={() => dismissToast(toast.id)} aria-label="Fechar notificação"><X size={14} /></button>
            <span className="toast__timer" aria-hidden="true" />
          </div>
        )
      })}
    </div>
  )
}
