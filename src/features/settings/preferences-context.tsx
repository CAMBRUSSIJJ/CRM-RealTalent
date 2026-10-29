import { createContext, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import type { AppRoute, LeadPriority, LeadTemperature } from '../../domain/types'
import { safeStorage } from '../../lib/storage'
import { getSupabaseClient } from '../../lib/supabase'
import type { Json } from '../../lib/supabase.types'
import { useAppActions, useAppWorkspace } from '../../app/app-context'
import { navigationItems } from '../../components/layout/navigation'
import type { PipelineStagePolicy } from '../../services/pipeline-intelligence'
import { DEFAULT_LEAD_SCORING_CONFIG, buildAutomaticReclassification, type LeadScoringConfig } from '../../services/lead-scoring'
import { DEFAULT_DEAL_INTELLIGENCE_CONFIG, type DealIntelligenceConfig } from '../../services/deal-intelligence'
import { DEFAULT_APPEARANCE_PRESET, appearanceColorsForPreset, isHexColor, mixHex, resolveAppearanceTheme, type AppearanceColorPreset } from '../../platform/design-system/appearance-theme'

export type ThemePreference = 'light' | 'dark' | 'system'
export type DensityPreference = 'comfortable' | 'compact'
export type SidebarPreference = 'expanded' | 'compact' | 'auto'
export type SidebarWidthPreference = 'comfortable' | 'wide'

export interface CrmPreferences {
  version: 2
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
    sidebarWidth: SidebarWidthPreference
    sidebarShowBrand: boolean
    sidebarShowGroups: boolean
    sidebarShowProfile: boolean
    sidebarOpenSecondary: boolean
    reduceMotion: boolean
    colorPreset: AppearanceColorPreset
    accentColor: string
    topbarColor: string
    sidebarColor: string
    canvasColor: string
    surfaceColor: string
  }
  navigation: {
    visibleRoutes: AppRoute[]
    order: AppRoute[]
    labels: Partial<Record<AppRoute, string>>
    primaryRoutes: AppRoute[]
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
    leadScoring: LeadScoringConfig
    dealIntelligence: DealIntelligenceConfig
  }
  integrations: {
    extensionEnabled: boolean
    endpointUrl: string
    inboxKey: string
    assistedWhatsapp: boolean
    assistedInstagram: boolean
    assistedFacebook: boolean
    assistedLinkedin: boolean
    assistedEmail: boolean
    whatsappMode: 'assisted' | 'official'
    whatsappCountryCode: string
    whatsappRegisterActivity: boolean
    whatsappUseLeadOwnerName: boolean
    whatsappOfficialAccountId: string
  }
  security: {
    confirmCriticalActions: boolean
    autoBackupReminder: boolean
    auditRetentionDays: number
  }
}

const DEFAULT_ROUTES = navigationItems.map((item) => item.route)

export const createDefaultPreferences = (companyName = 'RealTalent'): CrmPreferences => ({
  version: 2,
  company: {
    name: companyName,
    logoDataUrl: '',
    accentColor: '#2f59db',
    navigationColor: '#17264a',
    timezone: 'America/Sao_Paulo',
    locale: 'pt-BR',
  },
  appearance: { theme: 'light', density: 'comfortable', sidebar: 'expanded', sidebarWidth: 'wide', sidebarShowBrand: true, sidebarShowGroups: true, sidebarShowProfile: true, sidebarOpenSecondary: false, reduceMotion: false, colorPreset: DEFAULT_APPEARANCE_PRESET, ...appearanceColorsForPreset(DEFAULT_APPEARANCE_PRESET) },
  navigation: { visibleRoutes: [...DEFAULT_ROUTES], order: [...DEFAULT_ROUTES], labels: {}, primaryRoutes: navigationItems.filter((item) => item.priority === 'primary').map((item) => item.route) },
  commercial: {
    businessDays: [1, 2, 3, 4, 5], businessStart: '08:30', businessEnd: '18:00', defaultFollowupDays: 2,
    firstContactSlaMinutes: 30, staleLeadDays: 7, proposalFollowupDays: 3,
    maxCallAttempts: 5, meetingReminderMinutes: 30, defaultLeadPriority: 'medium', defaultLeadTemperature: 'warm',
    lossReasons: ['Sem interesse', 'Preço', 'Sem orçamento', 'Escolheu concorrente', 'Não respondeu', 'Momento inadequado'],
    tags: ['Quente', 'Indicação', 'Retorno', 'Evento', 'Proposta'],
    activityTypes: ['Ligação', 'Follow-up', 'Reunião', 'Proposta', 'Tarefa interna'],
    pipelineStagePolicies: {}, requireNextActionForActiveLeads: true, leadScoring: DEFAULT_LEAD_SCORING_CONFIG, dealIntelligence: DEFAULT_DEAL_INTELLIGENCE_CONFIG,
  },
  integrations: { extensionEnabled: true, endpointUrl: '', inboxKey: 'realtalent-extension-inbox-v1', assistedWhatsapp: true, assistedInstagram: true, assistedFacebook: true, assistedLinkedin: true, assistedEmail: true, whatsappMode: 'assisted', whatsappCountryCode: '55', whatsappRegisterActivity: true, whatsappUseLeadOwnerName: true, whatsappOfficialAccountId: '' },
  security: { confirmCriticalActions: true, autoBackupReminder: true, auditRetentionDays: 180 },
})

const validHex = (value: unknown, fallback: string) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
const validTime = (value: unknown, fallback: string) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback
const cleanList = (value: unknown, fallback: string[]) => Array.isArray(value) ? Array.from(new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))).slice(0, 100) : fallback
const clampInteger = (value: unknown, minimum: number, maximum: number, fallback: number) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(minimum, Math.min(maximum, Math.round(numeric))) : fallback
}
const normalizeLeadScoring = (value: unknown): LeadScoringConfig => {
  const defaults = DEFAULT_LEAD_SCORING_CONFIG
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults
  const raw = value as Partial<LeadScoringConfig>
  const weights = raw.weights ?? defaults.weights
  const thresholds = raw.thresholds ?? defaults.thresholds
  const medium = clampInteger(thresholds.medium, 1, 90, defaults.thresholds.medium)
  const high = Math.max(medium + 1, clampInteger(thresholds.high, 2, 95, defaults.thresholds.high))
  const urgent = Math.max(high + 1, clampInteger(thresholds.urgent, 3, 100, defaults.thresholds.urgent))
  const warm = clampInteger(thresholds.warm, 1, 95, defaults.thresholds.warm)
  const hot = Math.max(warm + 1, clampInteger(thresholds.hot, 2, 100, defaults.thresholds.hot))
  return {
    enabled: raw.enabled !== false,
    autoReclassify: raw.autoReclassify !== false,
    weights: {
      profile: clampInteger(weights.profile, 0, 100, defaults.weights.profile),
      behavior: clampInteger(weights.behavior, 0, 100, defaults.weights.behavior),
      potential: clampInteger(weights.potential, 0, 100, defaults.weights.potential),
    },
    thresholds: { medium, high, urgent, warm, hot },
    mediumValue: clampInteger(raw.mediumValue, 0, 100_000_000, defaults.mediumValue),
    highValue: Math.max(clampInteger(raw.mediumValue, 0, 100_000_000, defaults.mediumValue), clampInteger(raw.highValue, 0, 100_000_000, defaults.highValue)),
    staleDays: clampInteger(raw.staleDays, 1, 180, defaults.staleDays),
    targetCities: cleanList(raw.targetCities, defaults.targetCities),
    preferredSources: cleanList(raw.preferredSources, defaults.preferredSources),
    idealTags: cleanList(raw.idealTags, defaults.idealTags),
  }
}


const normalizeDealIntelligence = (value: unknown): DealIntelligenceConfig => {
  const defaults = DEFAULT_DEAL_INTELLIGENCE_CONFIG
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults
  const raw = value as Partial<DealIntelligenceConfig>
  const weights = raw.weights ?? defaults.weights
  return {
    enabled: raw.enabled !== false,
    weights: {
      activity: clampInteger(weights.activity, 0, 100, defaults.weights.activity),
      stakeholders: clampInteger(weights.stakeholders, 0, 100, defaults.weights.stakeholders),
      proposal: clampInteger(weights.proposal, 0, 100, defaults.weights.proposal),
      nextStep: clampInteger(weights.nextStep, 0, 100, defaults.weights.nextStep),
      timing: clampInteger(weights.timing, 0, 100, defaults.weights.timing),
      engagement: clampInteger(weights.engagement, 0, 100, defaults.weights.engagement),
    },
    staleDays: clampInteger(raw.staleDays, 1, 90, defaults.staleDays),
    proposalFollowupDays: clampInteger(raw.proposalFollowupDays, 1, 30, defaults.proposalFollowupDays),
    closingSoonDays: clampInteger(raw.closingSoonDays, 1, 30, defaults.closingSoonDays),
    highValueThreshold: clampInteger(raw.highValueThreshold, 0, 100_000_000, defaults.highValueThreshold),
    singleThreadThreshold: clampInteger(raw.singleThreadThreshold, 0, 100_000_000, defaults.singleThreadThreshold),
  }
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
  if ((value.version ?? 1) < 2) {
    for (const route of ['tasks', 'teams'] as AppRoute[]) if (!visible.includes(route)) visible.push(route)
  }
  if (!visible.includes('dashboard')) visible.unshift('dashboard')
  if (!visible.includes('settings')) visible.push('settings')
  const requestedPrimary = Array.isArray(value.navigation?.primaryRoutes)
    ? value.navigation.primaryRoutes.filter((route): route is AppRoute => visible.includes(route as AppRoute))
    : defaults.navigation.primaryRoutes.filter((route) => visible.includes(route))
  const primaryRoutes = [...new Set(requestedPrimary)]
  if (!primaryRoutes.includes('settings')) primaryRoutes.push('settings')
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
    version: 2,
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
      sidebar: appearance.sidebar === 'compact' || appearance.sidebar === 'auto' ? appearance.sidebar : 'expanded',
      sidebarWidth: appearance.sidebarWidth === 'comfortable' ? 'comfortable' : 'wide',
      sidebarShowBrand: appearance.sidebarShowBrand !== false,
      sidebarShowGroups: appearance.sidebarShowGroups !== false,
      sidebarShowProfile: appearance.sidebarShowProfile !== false,
      sidebarOpenSecondary: Boolean(appearance.sidebarOpenSecondary),
      reduceMotion: Boolean(appearance.reduceMotion),
      colorPreset: ['realtalent', 'minimal', 'graphite', 'blue', 'green', 'sand', 'custom'].includes(String(appearance.colorPreset)) ? appearance.colorPreset as AppearanceColorPreset : defaults.appearance.colorPreset,
      accentColor: isHexColor(appearance.accentColor) ? appearance.accentColor.toUpperCase() : defaults.appearance.accentColor,
      topbarColor: isHexColor(appearance.topbarColor) ? appearance.topbarColor.toUpperCase() : defaults.appearance.topbarColor,
      sidebarColor: isHexColor(appearance.sidebarColor) ? appearance.sidebarColor.toUpperCase() : defaults.appearance.sidebarColor,
      canvasColor: isHexColor(appearance.canvasColor) ? appearance.canvasColor.toUpperCase() : defaults.appearance.canvasColor,
      surfaceColor: isHexColor(appearance.surfaceColor) ? appearance.surfaceColor.toUpperCase() : defaults.appearance.surfaceColor,
    },
    navigation: { ...defaults.navigation, order, visibleRoutes: visible, labels: { ...defaults.navigation.labels, ...value.navigation?.labels }, primaryRoutes },
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
      leadScoring: normalizeLeadScoring(commercial.leadScoring),
      dealIntelligence: normalizeDealIntelligence(commercial.dealIntelligence),
    },
    integrations: {
      ...defaults.integrations, ...integrations, extensionEnabled: Boolean(integrations.extensionEnabled),
      endpointUrl: typeof integrations.endpointUrl === 'string' ? integrations.endpointUrl.trim().slice(0, 500) : '',
      inboxKey: typeof integrations.inboxKey === 'string' && integrations.inboxKey.trim() ? integrations.inboxKey.trim().slice(0, 120) : defaults.integrations.inboxKey,
      assistedWhatsapp: integrations.assistedWhatsapp !== false, assistedInstagram: integrations.assistedInstagram !== false, assistedFacebook: integrations.assistedFacebook !== false, assistedLinkedin: integrations.assistedLinkedin !== false, assistedEmail: integrations.assistedEmail !== false,
      whatsappMode: integrations.whatsappMode === 'official' ? 'official' : 'assisted',
      whatsappCountryCode: typeof integrations.whatsappCountryCode === 'string' && integrations.whatsappCountryCode.replace(/\D/g, '').length ? integrations.whatsappCountryCode.replace(/\D/g, '').slice(0, 4) : defaults.integrations.whatsappCountryCode,
      whatsappRegisterActivity: integrations.whatsappRegisterActivity !== false, whatsappUseLeadOwnerName: integrations.whatsappUseLeadOwnerName !== false,
      whatsappOfficialAccountId: typeof integrations.whatsappOfficialAccountId === 'string' ? integrations.whatsappOfficialAccountId.trim().slice(0, 120) : '',
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
  /** Waits for remote confirmation before committing shared settings locally. */
  savePreferencesChecked(next: CrmPreferences): Promise<void>
  resetPreferencesChecked(): Promise<void>
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null)
const STORAGE_PREFIX = 'realtalent-crm-v100-preferences:'

const readPreferences = (workspaceId: string, companyName: string) => {
  try {
    const raw = safeStorage.getItem(`${STORAGE_PREFIX}${workspaceId}`)
    return normalizePreferences(raw ? JSON.parse(raw) as Partial<CrmPreferences> : null, companyName)
  } catch { return createDefaultPreferences(companyName) }
}

export const applyPreferences = (preferences: CrmPreferences) => {
  const root = document.documentElement
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
  const effectiveTheme = preferences.appearance.theme === 'system' ? (systemDark ? 'dark' : 'light') : preferences.appearance.theme
  const resolved = resolveAppearanceTheme(preferences.appearance, effectiveTheme)
  root.dataset.theme = effectiveTheme
  root.dataset.density = preferences.appearance.density
  root.dataset.reduceMotion = String(preferences.appearance.reduceMotion)
  root.dataset.sidebarMode = preferences.appearance.sidebar
  root.dataset.sidebarWidth = preferences.appearance.sidebarWidth
  root.dataset.sidebarBrand = String(preferences.appearance.sidebarShowBrand)
  root.dataset.sidebarGroups = String(preferences.appearance.sidebarShowGroups)
  root.dataset.sidebarProfile = String(preferences.appearance.sidebarShowProfile)
  root.dataset.appearancePreset = preferences.appearance.colorPreset
  root.style.setProperty('--rt-sidebar-width-expanded', preferences.appearance.sidebarWidth === 'comfortable' ? '224px' : '252px')
  root.style.setProperty('--rt-sidebar-width-compact', '82px')
  const brandHover = mixHex(resolved.accentColor, '#000000', 0.12)
  const brandStrong = mixHex(resolved.accentColor, '#17213A', 0.30)
  root.style.setProperty('--rt-color-brand', resolved.accentColor)
  root.style.setProperty('--rt-color-brand-hover', brandHover)
  root.style.setProperty('--rt-color-brand-strong', brandStrong)
  root.style.setProperty('--rt-color-brand-soft', resolved.accentSoftColor)
  root.style.setProperty('--rt-color-canvas', resolved.canvasColor)
  root.style.setProperty('--rt-color-surface', resolved.surfaceColor)
  root.style.setProperty('--rt-color-surface-soft', resolved.surfaceSoftColor)
  root.style.setProperty('--rt-color-surface-subtle', resolved.surfaceSubtleColor)
  root.style.setProperty('--rt-color-text', resolved.contentTextColor)
  root.style.setProperty('--rt-color-text-2', resolved.contentMutedColor)
  root.style.setProperty('--rt-color-muted', resolved.contentMutedColor)
  root.style.setProperty('--rt-color-border', resolved.borderColor)
  root.style.setProperty('--rt-color-border-strong', resolved.borderColor)
  root.style.setProperty('--rt-shell-topbar', resolved.topbarColor)
  root.style.setProperty('--rt-shell-topbar-text', resolved.topbarTextColor)
  root.style.setProperty('--rt-shell-topbar-muted', resolved.topbarMutedColor)
  root.style.setProperty('--rt-shell-topbar-control', resolved.topbarControlColor)
  root.style.setProperty('--rt-shell-topbar-border', resolved.topbarBorderColor)
  root.style.setProperty('--rt-shell-sidebar', resolved.sidebarColor)
  root.style.setProperty('--rt-shell-sidebar-text', resolved.sidebarTextColor)
  root.style.setProperty('--rt-shell-sidebar-muted', resolved.sidebarMutedColor)
  root.style.setProperty('--rt-shell-sidebar-border', resolved.sidebarBorderColor)
  root.style.setProperty('--rt-shell-sidebar-active', resolved.activeSurfaceColor)
  root.style.setProperty('--rt-shell-sidebar-active-text', resolved.activeTextColor)
  root.style.setProperty('--rt-primary', resolved.accentColor)
  root.style.setProperty('--rt-primary-soft', resolved.accentSoftColor)
  root.style.setProperty('--blue', resolved.accentColor)
  root.style.setProperty('--blue-2', brandHover)
  root.style.setProperty('--blue-soft', resolved.accentSoftColor)
  root.style.setProperty('--accent', resolved.accentColor)
  root.style.setProperty('--accent-soft', resolved.accentSoftColor)
  root.style.setProperty('--primary', resolved.accentColor)
  root.style.setProperty('--primary-soft', resolved.accentSoftColor)
  root.style.setProperty('--navy', resolved.topbarColor)
  root.style.setProperty('--navy-2', resolved.topbarColor)
}


export function PreferencesProvider({ children }: PropsWithChildren) {
  const { currentWorkspace, snapshot, canWrite, can } = useAppWorkspace()
  const { reclassifyLeads } = useAppActions()
  const workspaceId = currentWorkspace?.id ?? 'default'
  const companyName = currentWorkspace?.name ?? 'RealTalent'
  const [preferences, setPreferences] = useState(() => readPreferences(workspaceId, companyName))
  const reclassificationSignature = useRef('')

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
    if (!snapshot || !canWrite || !preferences.commercial.leadScoring.enabled || !preferences.commercial.leadScoring.autoReclassify) {
      reclassificationSignature.current = ''
      return
    }
    const updates = buildAutomaticReclassification(snapshot, preferences.commercial.leadScoring)
    if (!updates.length) {
      reclassificationSignature.current = ''
      return
    }
    const signature = updates.map((item) => `${item.leadId}:${item.priority}:${item.temperature}`).sort().join('|')
    if (signature === reclassificationSignature.current) return
    reclassificationSignature.current = signature
    void reclassifyLeads(updates, true).catch((error) => {
      reclassificationSignature.current = ''
      console.warn('Não foi possível aplicar a reclassificação automática do Lead Score.', error)
    })
  }, [canWrite, preferences.commercial.leadScoring, reclassifyLeads, snapshot])

  useEffect(() => {
    applyPreferences(preferences)
    if (preferences.appearance.theme !== 'system') return
    const query = window.matchMedia?.('(prefers-color-scheme: dark)')
    const listener = () => applyPreferences(preferences)
    query?.addEventListener?.('change', listener)
    return () => query?.removeEventListener?.('change', listener)
  }, [preferences])

  const saveChecked=async(next:CrmPreferences)=>{
    const normalized=normalizePreferences(next,companyName)
    const supabase=getSupabaseClient()
    if(supabase&&currentWorkspace?.id){
      if(!can('configure','settings'))throw Error('Você não tem permissão para configurar este workspace.')
      const settings=JSON.parse(JSON.stringify(normalized)) as Json
      const {error}=await supabase.from('organization_settings').upsert({organization_id:workspaceId,settings})
      if(error)throw Error('As configurações não foram sincronizadas: '+error.message)
    }
    safeStorage.setItem(`${STORAGE_PREFIX}${workspaceId}`,JSON.stringify(normalized))
    setPreferences(normalized)
  }

  const value = useMemo<PreferencesContextValue>(() => ({
    preferences,
    savePreferences(next) {
      const normalized = normalizePreferences(next, companyName)
      safeStorage.setItem(`${STORAGE_PREFIX}${workspaceId}`, JSON.stringify(normalized))
      setPreferences(normalized)
      const supabase = getSupabaseClient()
      if (supabase && can('configure', 'settings')) {
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
    savePreferencesChecked:saveChecked,
    resetPreferencesChecked:()=>saveChecked(createDefaultPreferences(companyName)),
  }), [can, companyName, preferences, workspaceId, currentWorkspace?.id])

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePreferences() {
  const context = useContext(PreferencesContext)
  if (!context) throw new Error('usePreferences deve ser usado dentro de PreferencesProvider.')
  return context
}
