import type { CallSessionMode, CallSessionObjective } from './call-session-intelligence'

export const CALLING_STRATEGY_SCHEMA = 'realtalent.calling.strategy.v1' as const

export interface CallingStrategyPreferences {
  schema: typeof CALLING_STRATEGY_SCHEMA
  autoSelectPlaybook: boolean
  defaultPlaybookId: string
  defaultObjective: CallSessionObjective
  defaultSessionMode: CallSessionMode
  showAssistantDuringCall: boolean
  showHistoryOnDemand: boolean
  autosaveNotes: boolean
  healthAlertsOnly: boolean
}

const storageKey = (workspaceId: string) => `realtalent:${workspaceId}:calling-strategy:v1`

export function defaultCallingStrategyPreferences(): CallingStrategyPreferences {
  return {
    schema: CALLING_STRATEGY_SCHEMA,
    autoSelectPlaybook: true,
    defaultPlaybookId: '',
    defaultObjective: 'first_meeting',
    defaultSessionMode: 'focus',
    showAssistantDuringCall: true,
    showHistoryOnDemand: true,
    autosaveNotes: true,
    healthAlertsOnly: true,
  }
}

export function normalizeCallingStrategyPreferences(value: unknown): CallingStrategyPreferences {
  const fallback = defaultCallingStrategyPreferences()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback
  const raw = value as Partial<CallingStrategyPreferences>
  const objectives = new Set<CallSessionObjective>(['first_meeting', 'qualify', 'recover_opportunity', 'proposal_followup', 'identify_decision_maker'])
  const modes = new Set<CallSessionMode>(['focus', 'power'])
  return {
    schema: CALLING_STRATEGY_SCHEMA,
    autoSelectPlaybook: raw.autoSelectPlaybook !== false,
    defaultPlaybookId: typeof raw.defaultPlaybookId === 'string' ? raw.defaultPlaybookId.slice(0, 180) : '',
    defaultObjective: objectives.has(raw.defaultObjective as CallSessionObjective) ? raw.defaultObjective as CallSessionObjective : fallback.defaultObjective,
    defaultSessionMode: modes.has(raw.defaultSessionMode as CallSessionMode) ? raw.defaultSessionMode as CallSessionMode : fallback.defaultSessionMode,
    showAssistantDuringCall: raw.showAssistantDuringCall !== false,
    showHistoryOnDemand: raw.showHistoryOnDemand !== false,
    autosaveNotes: raw.autosaveNotes !== false,
    healthAlertsOnly: raw.healthAlertsOnly !== false,
  }
}

export function readCallingStrategyPreferences(workspaceId: string): CallingStrategyPreferences {
  try {
    const raw = window.localStorage.getItem(storageKey(workspaceId))
    return raw ? normalizeCallingStrategyPreferences(JSON.parse(raw)) : defaultCallingStrategyPreferences()
  } catch {
    return defaultCallingStrategyPreferences()
  }
}

export function saveCallingStrategyPreferences(workspaceId: string, value: CallingStrategyPreferences) {
  const normalized = normalizeCallingStrategyPreferences(value)
  try { window.localStorage.setItem(storageKey(workspaceId), JSON.stringify(normalized)) } catch { /* storage indisponível */ }
  return normalized
}

const noteDraftKey = (workspaceId: string, leadId: string) => `realtalent:${workspaceId}:call-note-draft:v1012:${leadId}`

export function readCallNoteDraft(workspaceId: string, leadId: string) {
  if (!leadId) return ''
  try { return window.localStorage.getItem(noteDraftKey(workspaceId, leadId)) ?? '' } catch { return '' }
}

export function saveCallNoteDraft(workspaceId: string, leadId: string, value: string) {
  if (!leadId) return
  try {
    if (value.trim()) window.localStorage.setItem(noteDraftKey(workspaceId, leadId), value)
    else window.localStorage.removeItem(noteDraftKey(workspaceId, leadId))
  } catch { /* storage indisponível */ }
}

export function clearCallNoteDraft(workspaceId: string, leadId: string) {
  if (!leadId) return
  try { window.localStorage.removeItem(noteDraftKey(workspaceId, leadId)) } catch { /* storage indisponível */ }
}
