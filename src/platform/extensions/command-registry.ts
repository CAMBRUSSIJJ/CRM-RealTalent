import { extensionRegistry, requireExtensionManifest, requireProviderManifest } from './extension-registry'
import type { ExtensionCommandDefinition, ExtensionProviderId } from './types'

const commandMap = new Map<string, { extensionId: string; command: ExtensionCommandDefinition }>()
for (const manifest of extensionRegistry.list()) {
  for (const command of manifest.commands) {
    if (commandMap.has(command.id)) throw new Error(`Comando duplicado no Extension Registry: ${command.id}`)
    commandMap.set(command.id, { extensionId: manifest.id, command })
  }
}

export const extensionCommandRegistry = Object.freeze({
  list: () => [...commandMap.values()].map((value) => ({ extensionId: value.extensionId, ...value.command })),
  get: (id: string) => commandMap.get(id) ?? null,
  forExtension: (extensionId: string) => requireExtensionManifest(extensionId).commands,
  forProvider: (providerId: ExtensionProviderId) => requireProviderManifest(providerId).commands,
})

export const assertExtensionCommand = (id: string) => {
  const entry = commandMap.get(id)
  if (!entry) throw new Error(`Comando não registrado: ${id}`)
  return entry
}

export const commandForJob = (providerId: ExtensionProviderId, jobType: string) => requireProviderManifest(providerId).commands.find((command) => command.jobType === jobType) ?? null
