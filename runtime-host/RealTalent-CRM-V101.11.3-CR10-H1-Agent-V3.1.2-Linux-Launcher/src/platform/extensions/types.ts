export type ExtensionKind = 'oauth' | 'voice' | 'browser-extension' | 'native'
export type ExtensionProviderId = 'google' | 'microsoft' | 'meta' | 'whatsapp_cloud' | 'realtalent_connect' | 'realtalent_capture'
export type OAuthExtensionProviderId = Extract<ExtensionProviderId, 'google' | 'microsoft' | 'meta' | 'whatsapp_cloud'>
export type ExtensionLifecycleHookName = 'beforeConnect' | 'afterConnect' | 'beforeSync' | 'afterSync' | 'onError' | 'onEnable' | 'onDisable'
export type ExtensionPermissionAction = 'read' | 'execute' | 'manage' | 'configure'

export interface ExtensionScopeDefinition {
  id: string
  label: string
  permissionAction: ExtensionPermissionAction
  description?: string
}

export interface ExtensionCapabilityDefinition {
  id: string
  label: string
  description?: string
}

export interface ExtensionJobDefinition {
  id: string
  label: string
  default?: boolean
}

export interface ExtensionCommandDefinition {
  id: string
  label: string
  description?: string
  action: ExtensionPermissionAction
  resource: 'integration' | 'call'
  capability?: string
  requiredScopes?: string[]
  jobType?: string
}

export interface ExtensionFeatureFlagDefinition {
  key: string
  label: string
  description?: string
  defaultEnabled: boolean
}

export interface ExtensionManifest {
  id: string
  schemaVersion: '101.9.7'
  version: string
  label: string
  description: string
  kind: ExtensionKind
  providerId: ExtensionProviderId
  oauthProvider?: OAuthExtensionProviderId
  enabledByDefault: boolean
  scopes: ExtensionScopeDefinition[]
  capabilities: ExtensionCapabilityDefinition[]
  jobs: ExtensionJobDefinition[]
  commands: ExtensionCommandDefinition[]
  featureFlags: ExtensionFeatureFlagDefinition[]
  lifecycleHooks: ExtensionLifecycleHookName[]
  metadata?: Record<string, unknown>
}

export interface ExtensionLifecycleEvent {
  id: string
  extensionId: string
  hook: ExtensionLifecycleHookName
  workspaceId?: string
  accountId?: string
  timestamp: string
  payload: Record<string, unknown>
}

export interface ExtensionRegistryInspection {
  version: '101.9.7'
  manifests: ExtensionManifest[]
  providers: Array<{ providerId: ExtensionProviderId; extensionId: string; label: string; kind: ExtensionKind }>
  commands: ExtensionCommandDefinition[]
  featureFlags: Array<{ extensionId: string; key: string; enabled: boolean }>
  lifecycle: { hooks: ExtensionLifecycleHookName[]; recentEvents: ExtensionLifecycleEvent[] }
}
