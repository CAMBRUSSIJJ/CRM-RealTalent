import type { WorkspaceRole } from '../../domain/types'
import { inspectPermissions } from './permission-engine'

export const installPermissionInspector = () => {
  if (typeof window === 'undefined') return
  ;(window as typeof window & { __REALTALENT_PERMISSIONS__?: unknown }).__REALTALENT_PERMISSIONS__ = Object.freeze({
    inspect(role: WorkspaceRole = 'member') { return inspectPermissions(role) },
  })
}
