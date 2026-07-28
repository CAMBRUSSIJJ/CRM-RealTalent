import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useApp } from '../../app/app-context'

export function ToastRegion() {
  const { toasts } = useApp()
  return (
    <div className="toast-region" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => {
        const Icon = toast.type === 'success' ? CheckCircle2 : toast.type === 'error' ? AlertCircle : Info
        return (
          <div className={`toast toast--${toast.type}`} key={toast.id}>
            <Icon size={18} />
            <span>{toast.message}</span>
            <X size={14} aria-hidden="true" />
          </div>
        )
      })}
    </div>
  )
}
