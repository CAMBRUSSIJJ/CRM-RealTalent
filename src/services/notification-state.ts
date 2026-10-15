import { safeStorage } from '../lib/storage'

export const NOTIFICATION_STATE_EVENT = 'realtalent:notifications-changed'
const PREFIX = 'realtalent:notification-state:v32:'
const MAX_DISMISSED = 1200

export interface NotificationUiState {
  dismissedIds: string[]
  updatedAt: string
}

const storageKey = (workspaceId: string) => `${PREFIX}${workspaceId}`

const normalizeState = (value: unknown): NotificationUiState => {
  const source = value && typeof value === 'object' ? value as Partial<NotificationUiState> : {}
  return {
    dismissedIds: Array.isArray(source.dismissedIds) ? [...new Set(source.dismissedIds.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())))].slice(-MAX_DISMISSED) : [],
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : new Date(0).toISOString(),
  }
}

export function loadNotificationUiState(workspaceId: string): NotificationUiState {
  if (!workspaceId) return normalizeState(null)
  try { return normalizeState(JSON.parse(safeStorage.getItem(storageKey(workspaceId)) ?? '{}')) }
  catch { return normalizeState(null) }
}

const emit = (workspaceId: string) => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(NOTIFICATION_STATE_EVENT, { detail: { workspaceId } }))
}

const save = (workspaceId: string, state: NotificationUiState) => {
  safeStorage.setItem(storageKey(workspaceId), JSON.stringify(normalizeState(state)))
  emit(workspaceId)
}

export function dismissedNotificationIds(workspaceId: string): Set<string> {
  return new Set(loadNotificationUiState(workspaceId).dismissedIds)
}

export function dismissNotifications(workspaceId: string, ids: string[]): number {
  const current = loadNotificationUiState(workspaceId)
  const merged = [...new Set([...current.dismissedIds, ...ids.filter(Boolean)])].slice(-MAX_DISMISSED)
  save(workspaceId, { dismissedIds: merged, updatedAt: new Date().toISOString() })
  return Math.max(0, merged.length - current.dismissedIds.length)
}

export function restoreDismissedNotifications(workspaceId: string): number {
  const current = loadNotificationUiState(workspaceId)
  const count = current.dismissedIds.length
  save(workspaceId, { dismissedIds: [], updatedAt: new Date().toISOString() })
  return count
}

export function isNotificationDismissed(workspaceId: string, notificationId: string): boolean {
  return dismissedNotificationIds(workspaceId).has(notificationId)
}

export function replaceDismissedNotifications(workspaceId: string, ids: string[]): void {
  save(workspaceId, { dismissedIds: [...new Set(ids.filter(Boolean))].slice(-MAX_DISMISSED), updatedAt: new Date().toISOString() })
}
