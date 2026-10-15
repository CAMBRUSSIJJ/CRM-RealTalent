import { lazy, Suspense } from 'react'
import type { CallSessionConfig } from './call-session-config'

const CallWorkspaceModal = lazy(() => import('./call-workspace-modal').then((module) => ({ default: module.CallWorkspaceModal })))

interface LazyCallWorkspaceModalProps {
  open: boolean
  config: CallSessionConfig | null
  onClose(): void
}

/**
 * Keeps the calling workspace and its dedicated CSS outside the initial route chunk.
 * The heavy module is requested only when a seller actually opens a call session.
 */
export function LazyCallWorkspaceModal(props: LazyCallWorkspaceModalProps) {
  if (!props.open) return null
  return (
    <Suspense fallback={<div className="call-workspace-lazy-fallback" role="status" aria-live="polite">Preparando espaço de ligação…</div>}>
      <CallWorkspaceModal {...props} />
    </Suspense>
  )
}
