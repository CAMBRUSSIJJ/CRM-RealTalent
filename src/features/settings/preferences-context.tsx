import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import type { AppRoute, LeadPriority, LeadTemperature } from '../../domain/types'
import { safeStorage } from '../../lib/storage'
import { getSupabaseClient } from '../../lib/supabase'
import type { Json } from '../../lib/supabase.types'
import { useApp } from '../../app/app-context'
import { navigationItems } from '../../components/layout/navigation'
import type { PipelineStagePolicy } from '../../services/pipeline-intelligence'

export type ThemePreference = 'light' | 'dark' | 'system'
export type DensityPreference = 'comfortable' | 'compact'
export type SidebarPreference = 'expanded' | 'compact'

export interface CrmPreferences {
  version: 1
  company: {
    name: string
    logoDataUrl: string
    accentColor: string
    navigationColor: string
    timezone: string
    locale: string
  }
  appearance: {
    theme: ThemePreference
    density: DensityPreference
    sidebar: SidebarPreference
    reduceMotion: boolean
  }
  navigation: {
    visibleRoutes: AppRoute[]
    order: AppRoute[]
    labels: Partial<Record<AppRoute, string>>
  }
  commercial: {
    businessDays: number[]
    businessStart: string
    businessEnd: string
    defaultFollowupDays: number
    firstContactSlaMinutes: number
    staleLeadDays: number
    proposalFollowupDays: number
    maxCallAttempts: number
    meetingReminderMinutes: number
    defaultLeadPriority: LeadPriority
    defaultLeadTemperature: LeadTemperature
    lossReasons: string[]
    tags: string[]
    activityTypes: string[]
    pipelineStagePolicies: Record<string, PipelineStagePolicy>
    requireNextActionForActiveLeads: boolean
  }
  integrations: {
    extensionEnabled: boolean
    endpointUrl: string
    inboxKey: string
    assistedWhatsapp: boolean
    assistedInstagram: boolean
    assistedEmail: boolean
  }
  security: {
    confirmCriticalActions: boolean
    autoBackupReminder: boolean
    auditRetentionDays: number
  }
}

const DEFAULT_ROUTES = navigationItems.map((item) => item.route)

export const createDefaultPreferences = (companyName = 'RealTalent'): CrmPreferences => ({
  version: 1,
  company: {
    name: companyName,
    logoDataUrl: '',
    accentColor: '#2f59db',
    navigationColor: '#17264a',
    timezone: 'America/Sao_Paulo',
    locale: 'pt-BR',
  },
  appearance: { theme: 'light', density: 'comfortable', sidebar: 'expanded', reduceMotion: false },
  navigation: { visibleRoutes: [...DEFAULT_ROUTES], order: [...DEFAULT_ROUTES], labels: {} },
  commercial: {
    businessDays: [1, 2, 3, 4, 5], businessStart: '08:30', businessEnd: '18:00', defaultFollowupDays: 2,
    firstContactSlaMinutes: 30, staleLeadDays: 7, proposalFollowupDays: 3,
    maxCallAttempts: 5, meetingReminderMinutes: 30, defaultLeadPriority: 'medium', defaultLeadTemperature: 'warm',
    lossReasons: ['Sem interesse', 'Preço', 'Sem orçamento', 'Escolheu concorrente', 'Não respondeu', 'Momento inadequado'],
    tags: ['Quente', 'Indicação', 'Retorno', 'Evento', 'Proposta'],
    activityTypes: ['Ligação', 'Follow-up', 'Reunião', 'Proposta', 'Tarefa interna'],
    pipelineStagePolicies: {}, requireNextActionForActiveLeads: true,
  },
  integrations: { extensionEnabled: true, endpointUrl: '', inboxKey: 'realtalent-extension-inbox-v1', assistedWhatsapp: true, assistedInstagram: true, assistedEmail: true },
  security: { confirmCriticalActions: true, autoBackupReminder: true, auditRetentionDays: 180 },
})

const validHex = (value: unknown, fallback: string) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
const validTime = (value: unknown, fallback: string) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback
const cleanList = (value: unknown, fallback: string[]) => Array.isArray(value) ? Array.from(new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))).slice(0, 100) : fallback
const clampInteger = (value: unknown, minimum: number, maximum: number, fallback: number) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(minimum, Math.min(maximum, Math.round(numeric))) : fallback
}
const normalizeStagePolicies = (value: unknown): Record<string, PipelineStagePolicy> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const policies: Record<string, PipelineStagePolicy> = {}
  for (const [stageId, raw] of Object.entries(value).slice(0, 100)) {
    if (!stageId || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const item = raw as Partial<PipelineStagePolicy>
    policies[stageId.slice(0, 120)] = {
      maxDays: clampInteger(item.maxDays, 1, 365, 7),
      requirePhone: Boolean(item.requirePhone), requireValue: Boolean(item.requireValue), requireNextAction: item.requireNextAction !== false,
      preventSkipping: Boolean(item.preventSkipping), confirmBackward: item.confirmBackward !== false,
      instructions: typeof item.instructions === 'string' ? item.instructions.trim().slice(0, 500) : '',
    }
  }
  return policies
}

export const normalizePreferences = (value: Partial<CrmPreferences> | null | undefined, companyName: string): CrmPreferences => {
  const defaults = createDefaultPreferences(companyName)
  if (!value || typeof value !== 'object') return defaults
  const requestedOrder = Array.isArray(value.navigation?.order)
    ? value.navigation.order.filter((route): route is AppRoute => DEFAULT_ROUTES.includes(route as AppRoute))
    : []
  const order = [...new Set([...requestedOrder, ...DEFAULT_ROUTES])]
  const visible = Array.isArray(value.navigation?.visibleRoutes)
    ? [...new Set(value.navigation.visibleRoutes.filter((route): route is AppRoute => DEFAULT_ROUTES.includes(route as AppRoute)))]
    : [...defaults.navigation.visibleRoutes]
  if (!visible.includes('dashboard')) visible.unshift('dashboard')
  if (!visible.includes('settings')) visible.push('settings')
  const company: Partial<CrmPreferences['company']> = value.company ?? {}
  const appearance: Partial<CrmPreferences['appearance']> = value.appearance ?? {}
  const commercial: Partial<CrmPreferences['commercial']> = value.commercial ?? {}
  const integrations: Partial<CrmPreferences['integrations']> = value.integrations ?? {}
  const security: Partial<CrmPreferences['security']> = value.security ?? {}
  const businessDays = Array.isArray(commercial.businessDays)
    ? [...new Set(commercial.businessDays.map(Number).filter((day: number) => Number.isInteger(day) && day >= 0 && day <= 6))]
    : defaults.commercial.businessDays
  return {
    ...defaults,
    version: 1,
    company: {
      ...defaults.company, ...company,
      name: typeof company.name === 'string' && company.name.trim() ? company.name.trim().slice(0, 80) : defaults.company.name,
      logoDataUrl: typeof company.logoDataUrl === 'string' && (/^data:image\/(png|jpeg|webp|svg\+xml);/i.test(company.logoDataUrl) || company.logoDataUrl === '') && company.logoDataUrl.length <= 1_700_000 ? company.logoDataUrl : '',
      accentColor: validHex(company.accentColor, defaults.company.accentColor),
      navigationColor: validHex(company.navigationColor, defaults.company.navigationColor),
      timezone: typeof company.timezone === 'string' && company.timezone.trim() ? company.timezone.trim().slice(0, 80) : defaults.company.timezone,
      locale: typeof company.locale === 'string' && company.locale.trim() ? company.locale.trim().slice(0, 20) : defaults.company.locale,
    },
    appearance: {
      theme: appearance.theme === 'dark' || appearance.theme === 'system' ? appearance.theme : 'light',
      density: appearance.density === 'compact' ? 'compact' : 'comfortable',
      sidebar: appearance.sidebar === 'compact' ? 'compact' : 'expanded',
      reduceMotion: Boolean(appearance.reduceMotion),
    },
    navigation: { ...defaults.navigation, order, visibleRoutes: visible, labels: { ...defaults.navigation.labels, ...value.navigation?.labels } },
    commercial: {
      ...defaults.commercial, ...commercial, businessDays: businessDays.length ? businessDays : defaults.commercial.businessDays,
      businessStart: validTime(commercial.businessStart, defaults.commercial.businessStart),
      businessEnd: validTime(commercial.businessEnd, defaults.commercial.businessEnd),
      defaultFollowupDays: clampInteger(commercial.defaultFollowupDays, 0, 365, defaults.commercial.defaultFollowupDays),
      firstContactSlaMinutes: clampInteger(commercial.firstContactSlaMinutes, 5, 1440, defaults.commercial.firstContactSlaMinutes),
      staleLeadDays: clampInteger(commercial.staleLeadDays, 1, 90, defaults.commercial.staleLeadDays),
      proposalFollowupDays: clampInteger(commercial.proposalFollowupDays, 1, 30, defaults.commercial.proposalFollowupDays),
      maxCallAttempts: clampInteger(commercial.maxCallAttempts, 1, 50, defaults.commercial.maxCallAttempts),
      meetingReminderMinutes: clampInteger(commercial.meetingReminderMinutes, 0, 10_080, defaults.commercial.meetingReminderMinutes),
      defaultLeadPriority: ['low', 'medium', 'high', 'urgent'].includes(String(commercial.defaultLeadPriority)) ? commercial.defaultLeadPriority! : defaults.commercial.defaultLeadPriority,
      defaultLeadTemperature: ['cold', 'warm', 'hot'].includes(String(commercial.defaultLeadTemperature)) ? commercial.defaultLeadTemperature! : defaults.commercial.defaultLeadTemperature,
      lossReasons: cleanList(commercial.lossReasons, defaults.commercial.lossReasons),
      tags: cleanList(commercial.tags, defaults.commercial.tags),
      activityTypes: cleanList(commercial.activityTypes, defaults.commercial.activityTypes),
      pipelineStagePolicies: normalizeStagePolicies(commercial.pipelineStagePolicies),
      requireNextActionForActiveLeads: commercial.requireNextActionForActiveLeads !== false,
    },
    integrations: {
      ...defaults.integrations, ...integrations, extensionEnabled: Boolean(integrations.extensionEnabled),
      endpointUrl: typeof integrations.endpointUrl === 'string' ? integrations.endpointUrl.trim().slice(0, 500) : '',
      inboxKey: typeof integrations.inboxKey === 'string' && integrations.inboxKey.trim() ? integrations.inboxKey.trim().slice(0, 120) : defaults.integrations.inboxKey,
      assistedWhatsapp: integrations.assistedWhatsapp !== false, assistedInstagram: integrations.assistedInstagram !== false, assistedEmail: integrations.assistedEmail !== false,
    },
    security: {
      confirmCriticalActions: security.confirmCriticalActions !== false, autoBackupReminder: security.autoBackupReminder !== false,
      auditRetentionDays: clampInteger(security.auditRetentionDays, 7, 3650, defaults.security.auditRetentionDays),
    },
  }
}

interface PreferencesContextValue {
  preferences: CrmPreferences
  savePreferences(next: CrmPreferences): void
  resetPreferences(): void
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null)
const STORAGE_PREFIX = 'realtalent-crm-v100-preferences:'

const readPreferences = (workspaceId: string, companyName: string) => {
  try {
    const raw = safeStorage.getItem(`${STORAGE_PREFIX}${workspaceId}`)
    return normalizePreferences(raw ? JSON.parse(raw) as Partial<CrmPreferences> : null, companyName)
  } catch { return createDefaultPreferences(companyName) }
}

const applyPreferences = (preferences: CrmPreferences) => {
  const root = document.documentElement
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
  const effectiveTheme = preferences.appearance.theme === 'system' ? (systemDark ? 'dark' : 'light') : preferences.appearance.theme
  root.dataset.theme = effectiveTheme
  root.dataset.density = preferences.appearance.density
  root.dataset.reduceMotion = String(preferences.appearance.reduceMotion)
  root.style.setProperty('--blue', preferences.company.accentColor)
  root.style.setProperty('--blue-2', preferences.company.accentColor)
  root.style.setProperty('--navy', preferences.company.navigationColor)
  root.style.setProperty('--navy-2', preferences.company.navigationColor)
}

export function PreferencesProvider({ children }: PropsWithChildren) {
  const { currentWorkspace } = useApp()
  const workspaceId = currentWorkspace?.id ?? 'default'
  const companyName = currentWorkspace?.name ?? 'RealTalent'
  const [preferences, setPreferences] = useState(() => readPreferences(workspaceId, companyName))

  useEffect(() => { setPreferences(readPreferences(workspaceId, companyName)) }, [workspaceId, companyName])
  useEffect(() => {
    const supabase = getSupabaseClient()
    if (!supabase || !currentWorkspace?.id) return
    let cancelled = false
    void supabase.from('organization_settings').select('settings').eq('organization_id', workspaceId).maybeSingle().then(({ data, error }) => {
      if (cancelled || error || !data?.settings) return
      const remote = normalizePreferences(data.settings as Partial<CrmPreferences>, companyName)
      safeStorage.setItem(`${STORAGE_PREFIX}${workspaceId}`, JSON.stringify(remote))
      setPreferences(remote)
    })
    return () => { cancelled = true }
  }, [companyName, currentWorkspace?.id, workspaceId])
  useEffect(() => {
    applyPreferences(preferences)
    if (preferences.appearance.theme !== 'system') return
    const query = window.matchMedia?.('(prefers-color-scheme: dark)')
    const listener = () => applyPreferences(preferences)
    query?.addEventListener?.('change', listener)
    return () => query?.removeEventListener?.('change', listener)
  }, [preferences])

  const value = useMemo<PreferencesContextValue>(() => ({
    preferences,
    savePreferences(next) {
      const normalized = normalizePreferences(next, companyName)
      safeStorage.setItem(`${STORAGE_PREFIX}${workspaceId}`, JSON.stringify(normalized))
      setPreferences(normalized)
      const supabase = getSupabaseClient()
      if (supabase && (currentWorkspace?.role === 'owner' || currentWorkspace?.role === 'admin')) {
        const settings = JSON.parse(JSON.stringify(normalized)) as Json
        void supabase.from('organization_settings').upsert({ organization_id: workspaceId, settings }).then(({ error }) => {
          if (error) console.warn('Não foi possível sincronizar as preferências do workspace.', error.message)
        })
      }
    },
    resetPreferences() {
      const defaults = createDefaultPreferences(companyName)
      safeStorage.removeItem(`${STORAGE_PREFIX}${workspaceId}`)
      setPreferences(defaults)
    },
  }), [companyName, currentWorkspace?.role, preferences, workspaceId])

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePreferences() {
  const context = useContext(PreferencesContext)
  if (!context) throw new Error('usePreferences deve ser usado dentro de PreferencesProvider.')
  return context
}
