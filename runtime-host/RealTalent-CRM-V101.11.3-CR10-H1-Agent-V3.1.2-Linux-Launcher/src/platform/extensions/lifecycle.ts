import { createUuid } from '../../lib/id'
import { requireExtensionManifest } from './extension-registry'
import type { ExtensionLifecycleEvent, ExtensionLifecycleHookName } from './types'

type LifecycleListener = (event: ExtensionLifecycleEvent) => void | Promise<void>
const listeners = new Map<ExtensionLifecycleHookName, Set<LifecycleListener>>()
const history: ExtensionLifecycleEvent[] = []
const HISTORY_LIMIT = 100

export const extensionLifecycle = Object.freeze({
  on(hook: ExtensionLifecycleHookName, listener: LifecycleListener) {
    const set = listeners.get(hook) ?? new Set<LifecycleListener>()
    set.add(listener); listeners.set(hook, set)
    return () => { set.delete(listener) }
  },
  async emit(extensionId: string, hook: ExtensionLifecycleHookName, payload: Record<string, unknown> = {}, context: { workspaceId?: string; accountId?: string } = {}) {
    const manifest = requireExtensionManifest(extensionId)
    if (!manifest.lifecycleHooks.includes(hook)) return null
    const event: ExtensionLifecycleEvent = { id: createUuid(), extensionId, hook, workspaceId: context.workspaceId, accountId: context.accountId, timestamp: new Date().toISOString(), payload: { ...payload } }
    history.unshift(event); if (history.length > HISTORY_LIMIT) history.length = HISTORY_LIMIT
    await Promise.allSettled([...(listeners.get(hook) ?? [])].map((listener) => Promise.resolve(listener(event))))
    return event
  },
  history: () => [...history],
  clear: () => { history.length = 0 },
})
