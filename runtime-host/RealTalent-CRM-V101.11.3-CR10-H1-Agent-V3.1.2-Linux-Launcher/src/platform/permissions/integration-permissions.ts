import type { WorkspaceRole } from '../../domain/types'
import type { ConnectedAccount } from '../../services/integration-framework'
import { can, canUseIntegrationScope } from './permission-engine'
import type { PermissionSubject } from './types'

export interface IntegrationAccessSubject extends PermissionSubject { userId: string | null; role: WorkspaceRole }

export const canAccessConnectedAccount = (subject: IntegrationAccessSubject, account: ConnectedAccount) => {
  if (!can(subject, { action: 'execute', resource: 'integration' }) && !can(subject, { action: 'manage', resource: 'integration' })) return false
  if (account.workspaceId !== subject.workspaceId) return false
  if (account.accessMode === 'organization') return true
  if (account.accessMode === 'personal') return Boolean(subject.userId && account.ownerUserId === subject.userId)
  if (account.allowedUserIds.includes(subject.userId ?? '')) return true
  if (account.allowedRoles.includes(subject.role)) return true
  return account.accessMode === 'shared' && subject.role !== 'viewer'
}

export const integrationScopeDecision = (subject: IntegrationAccessSubject, account: ConnectedAccount, scope: string) => ({
  accountAllowed: canAccessConnectedAccount(subject, account),
  scopeGrantedByProvider: account.scopes.includes(scope),
  scopeAllowedByRole: canUseIntegrationScope(subject, scope),
  allowed: canAccessConnectedAccount(subject, account) && account.scopes.includes(scope) && canUseIntegrationScope(subject, scope),
})
