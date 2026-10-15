import type { WorkspaceRole } from '../../domain/types'
import { objectRegistry } from '../metadata/object-registry'
import { listRegisteredIntegrationScopes } from '../extensions'
import { permissionRegistry } from './permission-registry'
import type { PermissionAction, PermissionDecision, PermissionInspection, PermissionRequest, PermissionResource, PermissionSubject } from './types'

const actions: PermissionAction[] = ['read', 'create', 'update', 'delete', 'export', 'manage', 'execute', 'share', 'configure']
const resources: PermissionResource[] = ['lead', 'contact', 'company', 'opportunity', 'activity', 'call', 'calendar', 'playbook', 'product', 'proposal', 'revenue', 'goal', 'automation', 'integration', 'workspace', 'settings', 'audit']

const scopePolicy: Record<string, PermissionRequest> = Object.fromEntries(
  listRegisteredIntegrationScopes().map((scope) => [scope.id, { action: scope.permissionAction, resource: 'integration', integrationScope: scope.id } satisfies PermissionRequest]),
)


const matches = (rule: ReturnType<typeof permissionRegistry.list>[number], subject: PermissionSubject, request: PermissionRequest) => {
  if (!rule.roles.includes(subject.role)) return false
  if (rule.action !== '*' && rule.action !== request.action) return false
  if (rule.resource !== '*' && rule.resource !== request.resource) return false
  if (rule.fields?.length && (!request.field || !rule.fields.includes(request.field))) return false
  if (rule.integrationScopes?.length && (!request.integrationScope || !rule.integrationScopes.includes(request.integrationScope))) return false
  return true
}

export const decidePermission = (subject: PermissionSubject, request: PermissionRequest): PermissionDecision => {
  const rule = permissionRegistry.list().find((candidate) => matches(candidate, subject, request))
  if (!rule) return { allowed: false, ruleId: 'implicit-deny', reason: 'Nenhuma política concedeu esta operação.', request, role: subject.role }
  return { allowed: rule.effect === 'allow', ruleId: rule.id, reason: rule.reason, request, role: subject.role }
}

export const can = (subject: PermissionSubject, request: PermissionRequest) => decidePermission(subject, request).allowed

export const assertPermission = (subject: PermissionSubject, request: PermissionRequest) => {
  const decision = decidePermission(subject, request)
  if (!decision.allowed) throw new Error(`Permissão negada: ${decision.reason}`)
  return decision
}

export const assertFieldWrite = (subject: PermissionSubject, resource: PermissionResource, fields: string[]) => {
  assertPermission(subject, { action: 'update', resource })
  for (const field of fields) assertPermission(subject, { action: 'update', resource, field })
}

export const canUseIntegrationScope = (subject: PermissionSubject, scope: string) => can(subject, scopePolicy[scope] ?? { action: 'execute', resource: 'integration', integrationScope: scope })

export const inspectPermissions = (role: WorkspaceRole, workspaceId = 'inspection'): PermissionInspection => {
  const subject: PermissionSubject = { workspaceId, userId: null, role }
  const permissions = resources.map((resource) => ({ resource, actions: actions.filter((action) => can(subject, { action, resource })) }))
  const deniedSensitiveFields = objectRegistry.list().flatMap((object) => ['id', 'workspaceId', 'createdAt', 'updatedAt'].filter((field) => !can(subject, { action: 'update', resource: object.key, field })).map((field) => `${object.key}.${field}`))
  const scopes = Object.keys(scopePolicy)
  return { version: '101.9.6', role, permissions, deniedSensitiveFields, integrationScopes: scopes.map((scope) => ({ scope, allowed: canUseIntegrationScope(subject, scope) })) }
}
