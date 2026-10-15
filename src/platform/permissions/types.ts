import type { WorkspaceRole } from '../../domain/types'
import type { CoreObjectKey } from '../metadata/types'

export type PermissionAction = 'read' | 'create' | 'update' | 'delete' | 'export' | 'manage' | 'execute' | 'share' | 'configure'
export type PermissionResource = CoreObjectKey | 'activity' | 'call' | 'calendar' | 'playbook' | 'product' | 'proposal' | 'revenue' | 'goal' | 'automation' | 'integration' | 'workspace' | 'settings' | 'audit'
export type PermissionEffect = 'allow' | 'deny'

export interface PermissionSubject {
  workspaceId: string
  userId: string | null
  role: WorkspaceRole
}

export interface PermissionRequest {
  action: PermissionAction
  resource: PermissionResource
  field?: string
  integrationScope?: string
}

export interface PermissionRule {
  id: string
  roles: WorkspaceRole[]
  action: PermissionAction | '*'
  resource: PermissionResource | '*'
  fields?: string[]
  integrationScopes?: string[]
  effect: PermissionEffect
  reason: string
  priority?: number
}

export interface PermissionDecision {
  allowed: boolean
  ruleId: string
  reason: string
  request: PermissionRequest
  role: WorkspaceRole
}

export interface PermissionInspection {
  version: '101.9.6'
  role: WorkspaceRole
  permissions: Array<{ resource: PermissionResource; actions: PermissionAction[] }>
  deniedSensitiveFields: string[]
  integrationScopes: Array<{ scope: string; allowed: boolean }>
}
