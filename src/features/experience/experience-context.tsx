import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import type { AppRoute, WorkspaceRole } from '../../domain/types'
import type { Json } from '../../lib/supabase.types'
import { getSupabaseClient } from '../../lib/supabase'
import { safeStorage } from '../../lib/storage'
import { useApp } from '../../app/app-context'
import { useAuth } from '../auth/auth-context'
import { pageSectionRegistry } from './experience-registry'

export type ExperiencePreset = 'sdr' | 'seller' | 'closer' | 'manager' | 'executive' | 'admin' | 'custom'
export type ContentWidth = 'focused' | 'wide' | 'fluid'
export type FontScale = 'small' | 'medium' | 'large'
export type ContrastMode = 'standard' | 'high'
export type PageDensity = 'comfortable' | 'compact'
export type PageEmphasis = 'balanced' | 'focus'
export type PageDataScope = 'mine' | 'team'

export interface PageExperiencePreference {
  density: PageDensity
  emphasis: PageEmphasis
  hiddenSections: string[]
  sectionOrder: string[]
  dataScope: PageDataScope
}

export interface ExperiencePreferences {
  version: 2
  preset: ExperiencePreset
  global: {
    contentWidth: ContentWidth
    fontScale: FontScale
    contrast: ContrastMode
    reduceTransparency: boolean
    showPageSubtitle: boolean
    stickyTopbar: boolean
  }
  pages: Partial<Record<AppRoute, PageExperiencePreference>>
  notifications: {
    overdueActivities: boolean
    upcomingEvents: boolean
    proposalFollowups: boolean
    automationFailures: boolean
  }
}

const routeKeys = Object.keys(pageSectionRegistry) as AppRoute[]
const presetByRole: Record<WorkspaceRole, ExperiencePreset> = { owner: 'admin', admin: 'admin', member: 'seller', viewer: 'executive' }

const defaultPage = (route: AppRoute): PageExperiencePreference => ({
  density: 'comfortable',
  emphasis: 'balanced',
  hiddenSections: [],
  sectionOrder: pageSectionRegistry[route].map((section) => section.id),
  dataScope: 'mine',
})

export const createDefaultExperiencePreferences = (role: WorkspaceRole = 'member'): ExperiencePreferences => ({
  version: 2,
  preset: presetByRole[role],
  global: { contentWidth: 'wide', fontScale: 'medium', contrast: 'standard', reduceTransparency: false, showPageSubtitle: true, stickyTopbar: true },
  pages: Object.fromEntries(routeKeys.map((route) => [route, defaultPage(route)])) as Partial<Record<AppRoute, PageExperiencePreference>>,
  notifications: { overdueActivities: true, upcomingEvents: true, proposalFollowups: true, automationFailures: true },
})

const presetHidden: Partial<Record<ExperiencePreset, Partial<Record<AppRoute, string[]>>>> = {
  sdr: { dashboard: ['summary', 'insights'], pipeline: ['summary'], metrics: ['analysis'], proposals: ['summary'] },
  seller: { dashboard: ['score'] },
  closer: { dashboard: ['score'], prospecting: ['metrics', 'integration'], automations: ['health'] },
  manager: { dashboard: ['score'], leads: ['health'], calls: ['toolbar'], metrics: [] },
  executive: { dashboard: ['score', 'execution'], leads: ['views', 'filters'], followups: ['filters'], calls: ['toolbar', 'workspace'], prospecting: ['command', 'workspace'], automations: ['toolbar', 'content'] },
  admin: { dashboard: ['score'], calls: ['toolbar'] },
}

export const applyExperiencePreset = (preset: ExperiencePreset, role: WorkspaceRole = 'member'): ExperiencePreferences => {
  const base = createDefaultExperiencePreferences(role)
  const hidden = presetHidden[preset] ?? {}
  for (const route of routeKeys) {
    const page = base.pages[route] ?? defaultPage(route)
    base.pages[route] = { ...page, hiddenSections: hidden[route] ?? [] }
  }
  base.preset = preset
  if (preset === 'executive') {
    base.global.contentWidth = 'focused'
    base.global.fontScale = 'large'
  }
  if (preset === 'sdr') base.pages.calls = { ...(base.pages.calls ?? defaultPage('calls')), density: 'compact', emphasis: 'focus' }
  if (preset === 'manager') base.global.contentWidth = 'fluid'
  if (preset === 'admin') base.global.contentWidth = 'fluid'
  return base
}

const cleanStringList = (value: unknown, allowed: string[]) => Array.isArray(value)
  ? Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && allowed.includes(item))))
  : []

export const normalizeExperiencePreferences = (value: Partial<ExperiencePreferences> | null | undefined, role: WorkspaceRole = 'member'): ExperiencePreferences => {
  const defaults = createDefaultExperiencePreferences(role)
  if (!value || typeof value !== 'object') return defaults
  const preset: ExperiencePreset = ['sdr', 'seller', 'closer', 'manager', 'executive', 'admin', 'custom'].includes(String(value.preset)) ? value.preset as ExperiencePreset : defaults.preset
  const global = value.global ?? defaults.global
  const normalized: ExperiencePreferences = {
    version: 2,
    preset,
    global: {
      contentWidth: global.contentWidth === 'focused' || global.contentWidth === 'fluid' ? global.contentWidth : 'wide',
      fontScale: global.fontScale === 'small' || global.fontScale === 'large' ? global.fontScale : 'medium',
      contrast: global.contrast === 'high' ? 'high' : 'standard',
      reduceTransparency: Boolean(global.reduceTransparency),
      showPageSubtitle: global.showPageSubtitle !== false,
      stickyTopbar: global.stickyTopbar !== false,
    },
    pages: {},
    notifications: {
      overdueActivities: value.notifications?.overdueActivities !== false,
      upcomingEvents: value.notifications?.upcomingEvents !== false,
      proposalFollowups: value.notifications?.proposalFollowups !== false,
      automationFailures: value.notifications?.automationFailures !== false,
    },
  }
  for (const route of routeKeys) {
    const definitionIds = pageSectionRegistry[route].map((section) => section.id)
    const current = value.pages?.[route]
    const requestedOrder = cleanStringList(current?.sectionOrder, definitionIds)
    normalized.pages[route] = {
      density: current?.density === 'compact' ? 'compact' : 'comfortable',
      emphasis: current?.emphasis === 'focus' ? 'focus' : 'balanced',
      hiddenSections: cleanStringList(current?.hiddenSections, pageSectionRegistry[route].filter((section) => !section.required).map((section) => section.id)),
      sectionOrder: [...requestedOrder, ...definitionIds.filter((id) => !requestedOrder.includes(id))],
      dataScope: current?.dataScope === 'team' ? 'team' : 'mine',
    }
  }
  return normalized
}

interface ExperienceContextValue {
  preferences: ExperiencePreferences
  syncing: boolean
  lastSyncedAt: string | null
  updateGlobal(patch: Partial<ExperiencePreferences['global']>): void
  updateNotifications(patch: Partial<ExperiencePreferences['notifications']>): void
  updatePage(route: AppRoute, patch: Partial<PageExperiencePreference>): void
  setPreset(preset: ExperiencePreset): void
  resetPage(route: AppRoute): void
  resetAll(): void
}

const ExperienceContext = createContext<ExperienceContextValue | null>(null)
const STORAGE_PREFIX = 'realtalent-crm-v100-50-experience:'

export function ExperienceProvider({ children }: PropsWithChildren) {
  const { currentWorkspace } = useApp()
  const { user, mode } = useAuth()
  const workspaceId = currentWorkspace?.id ?? 'default'
  const role = currentWorkspace?.role ?? 'member'
  const storageKey = `${STORAGE_PREFIX}${workspaceId}:${user?.id ?? 'anonymous'}`
  const [preferences, setPreferences] = useState<ExperiencePreferences>(() => {
    try {
      const raw = safeStorage.getItem(storageKey)
      return normalizeExperiencePreferences(raw ? JSON.parse(raw) as Partial<ExperiencePreferences> : null, role)
    } catch { return createDefaultExperiencePreferences(role) }
  })
  const [syncing, setSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [remoteReady, setRemoteReady] = useState(mode !== 'supabase')
  const hydratedKey = useRef('')
  const saveTimer = useRef<number | null>(null)

  useEffect(() => {
    let local = createDefaultExperiencePreferences(role)
    try {
      const raw = safeStorage.getItem(storageKey)
      local = normalizeExperiencePreferences(raw ? JSON.parse(raw) as Partial<ExperiencePreferences> : null, role)
    } catch { /* preferência local inválida é substituída pelo padrão seguro */ }
    setPreferences(local)
    setRemoteReady(mode !== 'supabase')
    hydratedKey.current = storageKey
  }, [mode, role, storageKey])

  useEffect(() => {
    const client = getSupabaseClient()
    if (mode !== 'supabase' || !client || !user?.id || !currentWorkspace?.id) return
    let cancelled = false
    setSyncing(true)
    void client.from('user_experience_preferences').select('preferences, updated_at').eq('organization_id', currentWorkspace.id).eq('user_id', user.id).maybeSingle().then(({ data, error }) => {
      if (cancelled) return
      setSyncing(false)
      setRemoteReady(true)
      if (error || !data?.preferences) return
      const remote = normalizeExperiencePreferences(data.preferences as Partial<ExperiencePreferences>, role)
      safeStorage.setItem(storageKey, JSON.stringify(remote))
      setPreferences(remote)
      setLastSyncedAt(data.updated_at ?? new Date().toISOString())
    })
    return () => { cancelled = true }
  }, [currentWorkspace?.id, mode, role, storageKey, user?.id])

  useEffect(() => {
    if (hydratedKey.current !== storageKey) return
    safeStorage.setItem(storageKey, JSON.stringify(preferences))
    const root = document.documentElement
    root.dataset.experienceWidth = preferences.global.contentWidth
    root.dataset.fontScale = preferences.global.fontScale
    root.dataset.contrast = preferences.global.contrast
    root.dataset.reduceTransparency = String(preferences.global.reduceTransparency)
    root.dataset.stickyTopbar = String(preferences.global.stickyTopbar)
    root.dataset.showPageSubtitle = String(preferences.global.showPageSubtitle)

    const client = getSupabaseClient()
    if (mode !== 'supabase' || !client || !user?.id || !currentWorkspace?.id) return
    if (!remoteReady) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      setSyncing(true)
      const payload = JSON.parse(JSON.stringify(preferences)) as Json
      void client.from('user_experience_preferences').upsert({ organization_id: currentWorkspace.id, user_id: user.id, preferences: payload, updated_at: new Date().toISOString() }).then(({ error }) => {
        setSyncing(false)
        if (!error) setLastSyncedAt(new Date().toISOString())
      })
    }, 500)
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current) }
  }, [currentWorkspace?.id, mode, preferences, remoteReady, storageKey, user?.id])

  const setNormalized = useCallback((next: ExperiencePreferences) => setPreferences(normalizeExperiencePreferences(next, role)), [role])

  const value = useMemo<ExperienceContextValue>(() => ({
    preferences,
    syncing,
    lastSyncedAt,
    updateGlobal(patch) { setNormalized({ ...preferences, preset: 'custom', global: { ...preferences.global, ...patch } }) },
    updateNotifications(patch) { setNormalized({ ...preferences, notifications: { ...preferences.notifications, ...patch } }) },
    updatePage(route, patch) {
      const current = preferences.pages[route] ?? defaultPage(route)
      setNormalized({ ...preferences, preset: 'custom', pages: { ...preferences.pages, [route]: { ...current, ...patch } } })
    },
    setPreset(preset) { setNormalized(applyExperiencePreset(preset, role)) },
    resetPage(route) { setNormalized({ ...preferences, preset: 'custom', pages: { ...preferences.pages, [route]: defaultPage(route) } }) },
    resetAll() { setNormalized(createDefaultExperiencePreferences(role)) },
  }), [lastSyncedAt, preferences, role, setNormalized, syncing])

  return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>
}

export function useExperience() {
  const context = useContext(ExperienceContext)
  if (!context) throw new Error('useExperience deve ser usado dentro de ExperienceProvider.')
  return context
}
