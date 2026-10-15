import { safeStorage } from '../lib/storage'

export const LEAD_WORKSPACE_PREFERENCES_SCHEMA = 'realtalent.lead.workspace.preferences.v1015' as const

export type LeadWorkspaceMode = 'focus' | 'complete'

export interface LeadWorkspacePreferencesV1015 {
  schema: typeof LEAD_WORKSPACE_PREFERENCES_SCHEMA
  mode: LeadWorkspaceMode
  strategyExpanded: boolean
  detailsExpanded: boolean
  updatedAt: string
}

const keyFor = (workspaceId: string) => `realtalent:${workspaceId || 'default'}:lead-workspace:v1015`

const defaults = (): LeadWorkspacePreferencesV1015 => ({
  schema: LEAD_WORKSPACE_PREFERENCES_SCHEMA,
  mode: 'focus',
  strategyExpanded: false,
  detailsExpanded: false,
  updatedAt: new Date(0).toISOString(),
})

export function readLeadWorkspacePreferences(workspaceId: string): LeadWorkspacePreferencesV1015 {
  const fallback = defaults()
  try {
    const raw = safeStorage.getItem(keyFor(workspaceId))
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<LeadWorkspacePreferencesV1015>
    return {
      schema: LEAD_WORKSPACE_PREFERENCES_SCHEMA,
      mode: parsed.mode === 'complete' ? 'complete' : 'focus',
      strategyExpanded: parsed.strategyExpanded === true,
      detailsExpanded: parsed.detailsExpanded === true,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : fallback.updatedAt,
    }
  } catch {
    return fallback
  }
}

export function saveLeadWorkspacePreferences(workspaceId: string, patch: Partial<Pick<LeadWorkspacePreferencesV1015, 'mode' | 'strategyExpanded' | 'detailsExpanded'>>): LeadWorkspacePreferencesV1015 {
  const current = readLeadWorkspacePreferences(workspaceId)
  const next: LeadWorkspacePreferencesV1015 = {
    ...current,
    ...patch,
    schema: LEAD_WORKSPACE_PREFERENCES_SCHEMA,
    mode: patch.mode === 'complete' ? 'complete' : patch.mode === 'focus' ? 'focus' : current.mode,
    updatedAt: new Date().toISOString(),
  }
  safeStorage.setItem(keyFor(workspaceId), JSON.stringify(next))
  return next
}
