import { extensionCommandRegistry } from './command-registry'
import { extensionRegistry } from './extension-registry'
import { inspectExtensionFeatureFlags } from './feature-flags'
import { extensionLifecycle } from './lifecycle'
import type { ExtensionRegistryInspection } from './types'

export const inspectExtensionRegistry = (): ExtensionRegistryInspection => ({
  version: '101.9.7',
  manifests: extensionRegistry.list(),
  providers: extensionRegistry.list().map((manifest) => ({ providerId: manifest.providerId, extensionId: manifest.id, label: manifest.label, kind: manifest.kind })),
  commands: extensionCommandRegistry.list(),
  featureFlags: inspectExtensionFeatureFlags(),
  lifecycle: { hooks: ['beforeConnect', 'afterConnect', 'beforeSync', 'afterSync', 'onError', 'onEnable', 'onDisable'], recentEvents: extensionLifecycle.history() },
})

export const installExtensionRegistryInspector = () => {
  if (typeof window === 'undefined') return
  ;(window as typeof window & { __REALTALENT_EXTENSIONS__?: unknown }).__REALTALENT_EXTENSIONS__ = Object.freeze({
    inspect: inspectExtensionRegistry,
    get: (id: string) => extensionRegistry.get(id),
    provider: (providerId: Parameters<typeof extensionRegistry.getByProvider>[0]) => extensionRegistry.getByProvider(providerId),
    commands: () => extensionCommandRegistry.list(),
    lifecycle: () => extensionLifecycle.history(),
  })
}
