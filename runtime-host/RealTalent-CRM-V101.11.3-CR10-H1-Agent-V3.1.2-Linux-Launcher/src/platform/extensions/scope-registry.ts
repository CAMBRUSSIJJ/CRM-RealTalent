import { extensionRegistry } from './extension-registry'

export const listRegisteredIntegrationScopes = () => {
  const seen = new Map<string, { id: string; label: string; permissionAction: 'read' | 'execute' | 'manage' | 'configure'; extensionIds: string[] }>()
  for (const manifest of extensionRegistry.list()) {
    for (const scope of manifest.scopes) {
      const current = seen.get(scope.id)
      if (current) { if (!current.extensionIds.includes(manifest.id)) current.extensionIds.push(manifest.id); continue }
      seen.set(scope.id, { id: scope.id, label: scope.label, permissionAction: scope.permissionAction, extensionIds: [manifest.id] })
    }
  }
  return [...seen.values()]
}
