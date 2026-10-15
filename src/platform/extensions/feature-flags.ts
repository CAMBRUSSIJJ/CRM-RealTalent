import { extensionRegistry, requireExtensionManifest } from './extension-registry'

const runtimeOverrides = new Map<string, boolean>()
const featureKey = (extensionId: string, key: string) => `${extensionId}:${key}`

export const isExtensionFeatureEnabled = (extensionId: string, key: string, overrides?: Record<string, boolean>) => {
  const flag = requireExtensionManifest(extensionId).featureFlags.find((item) => item.key === key)
  if (!flag) return false
  const compound = featureKey(extensionId, key)
  if (overrides && compound in overrides) return Boolean(overrides[compound])
  if (runtimeOverrides.has(compound)) return Boolean(runtimeOverrides.get(compound))
  return flag.defaultEnabled
}

export const setExtensionFeatureOverride = (extensionId: string, key: string, enabled: boolean | null) => {
  requireExtensionManifest(extensionId)
  const compound = featureKey(extensionId, key)
  if (enabled === null) runtimeOverrides.delete(compound)
  else runtimeOverrides.set(compound, enabled)
}

export const inspectExtensionFeatureFlags = () => extensionRegistry.list().flatMap((manifest) => manifest.featureFlags.map((flag) => ({ extensionId: manifest.id, key: flag.key, enabled: isExtensionFeatureEnabled(manifest.id, flag.key) })))
