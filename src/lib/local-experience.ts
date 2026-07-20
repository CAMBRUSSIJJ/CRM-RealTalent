import { safeStorage } from './storage'

export type LocalExperienceMode = 'demo' | 'clean'

export interface LocalExperienceProfile {
  displayName: string
  email: string
}

export interface LocalExperienceInput extends LocalExperienceProfile {
  companyName: string
  mode: LocalExperienceMode
}

export const LOCAL_SETUP_COMPLETE_KEY = 'realtalent-crm-v100-local-setup-complete'
export const LOCAL_SETUP_PENDING_KEY = 'realtalent-crm-v100-local-setup-pending'
export const LOCAL_PROFILE_KEY = 'realtalent-crm-v100-local-profile'
export const LOCAL_ACTIVE_WORKSPACE_KEY = 'realtalent-crm-v100-active-workspace'

const normalizeProfile = (value: Partial<LocalExperienceProfile> | null | undefined): LocalExperienceProfile => ({
  displayName: value?.displayName?.trim() || 'Usuário local',
  email: value?.email?.trim().toLowerCase() || 'usuario@local.crm',
})

export const readLocalProfile = (): LocalExperienceProfile => {
  const raw = safeStorage.getItem(LOCAL_PROFILE_KEY)
  if (!raw) return normalizeProfile(null)
  try { return normalizeProfile(JSON.parse(raw) as Partial<LocalExperienceProfile>) }
  catch { return normalizeProfile(null) }
}

export const writeLocalProfile = (profile: Partial<LocalExperienceProfile>) => {
  safeStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(normalizeProfile(profile)))
}

export const markLocalSetupPending = () => {
  if (!safeStorage.getItem(LOCAL_SETUP_COMPLETE_KEY)) safeStorage.setItem(LOCAL_SETUP_PENDING_KEY, '1')
}

export const isLocalSetupPending = () => safeStorage.getItem(LOCAL_SETUP_PENDING_KEY) === '1'

export const completeLocalSetup = () => {
  safeStorage.setItem(LOCAL_SETUP_COMPLETE_KEY, '1')
  safeStorage.removeItem(LOCAL_SETUP_PENDING_KEY)
}

export const reopenLocalSetup = () => {
  safeStorage.removeItem(LOCAL_SETUP_COMPLETE_KEY)
  safeStorage.setItem(LOCAL_SETUP_PENDING_KEY, '1')
}
