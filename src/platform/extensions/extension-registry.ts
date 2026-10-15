import { builtinExtensionManifests } from './builtin-extensions'
import type { ExtensionManifest, ExtensionProviderId, OAuthExtensionProviderId } from './types'

class ExtensionRegistry {
  private readonly manifests = new Map<string, ExtensionManifest>()
  private readonly providers = new Map<ExtensionProviderId, string>()

  register(input: ExtensionManifest) {
    if (this.manifests.has(input.id)) throw new Error(`Extensão já registrada: ${input.id}`)
    if (this.providers.has(input.providerId)) throw new Error(`Provider já registrado: ${input.providerId}`)
    const manifest: ExtensionManifest = Object.freeze({
      ...input,
      scopes: Object.freeze([...input.scopes]),
      capabilities: Object.freeze([...input.capabilities]),
      jobs: Object.freeze([...input.jobs]),
      commands: Object.freeze([...input.commands]),
      featureFlags: Object.freeze([...input.featureFlags]),
      lifecycleHooks: Object.freeze([...input.lifecycleHooks]),
      metadata: input.metadata ? Object.freeze({ ...input.metadata }) : undefined,
    }) as ExtensionManifest
    this.manifests.set(manifest.id, manifest)
    this.providers.set(manifest.providerId, manifest.id)
    return manifest
  }

  get(id: string) { return this.manifests.get(id) ?? null }
  getByProvider(providerId: ExtensionProviderId) { const id = this.providers.get(providerId); return id ? this.get(id) : null }
  list() { return [...this.manifests.values()] }
  listOAuth() { return this.list().filter((item): item is ExtensionManifest & { oauthProvider: OAuthExtensionProviderId } => Boolean(item.oauthProvider)) }
}

export const extensionRegistry = new ExtensionRegistry()
for (const manifest of builtinExtensionManifests) extensionRegistry.register(manifest)

export const requireExtensionManifest = (id: string) => {
  const manifest = extensionRegistry.get(id)
  if (!manifest) throw new Error(`Extensão não registrada: ${id}`)
  return manifest
}

export const requireProviderManifest = (providerId: ExtensionProviderId) => {
  const manifest = extensionRegistry.getByProvider(providerId)
  if (!manifest) throw new Error(`Provider não registrado: ${providerId}`)
  return manifest
}

export const listOAuthExtensionManifests = () => extensionRegistry.listOAuth()
export const providerManifest = (provider: OAuthExtensionProviderId) => requireProviderManifest(provider)
export const providerExtensionId = (provider: OAuthExtensionProviderId) => providerManifest(provider).id
