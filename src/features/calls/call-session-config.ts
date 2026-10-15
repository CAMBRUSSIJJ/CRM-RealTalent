import { readCallDisplayPreferences, type CallDisplayPreferences } from '../../services/call-display-preferences'
import { inferCallSessionObjective, type CallSessionMode, type CallSessionObjective } from '../../services/call-session-intelligence'
import { recommendPlaybooks } from '../../services/coaching-engine'
import { readCallingStrategyPreferences } from '../../services/calling-strategy'
import { readVoiceSettings } from '../../services/voice-dialer'
import type { WorkspaceSnapshot } from '../../domain/types'

export interface CallSessionConfig {
  leadIds: string[]
  initialLeadId: string
  playbookId: string
  sessionGoal: number
  linkedGoalId: string
  sessionMode: CallSessionMode
  sessionObjective: CallSessionObjective
  autoAdvance: boolean
  autoAdvanceSeconds: number
  smartWrap: boolean
  fastDial: boolean
  autoDispatchNext: boolean
  autoDispatchDelaySeconds: number
  display: CallDisplayPreferences
}


export interface QuickCallSessionInput {
  snapshot: WorkspaceSnapshot | null | undefined
  workspaceId?: string
  initialLeadId: string
  leadIds?: string[]
  playbookId?: string
  sessionObjective?: CallSessionObjective
}

/**
 * Builds the canonical configuration used when a call is launched from outside
 * the Calls page. Keeping this in one place prevents Leads, Pipeline, Agenda,
 * Follow-ups and Dashboard from drifting from the CallWorkspaceModal contract.
 */
export function buildQuickCallSessionConfig(input: QuickCallSessionInput): CallSessionConfig {
  const allIds = [input.initialLeadId, ...(input.leadIds ?? [])].filter(Boolean)
  const leadIds = [...new Set(allIds)].filter((id) => input.snapshot?.leads.some((lead) => lead.id === id) ?? true)
  const initialLeadId = leadIds.includes(input.initialLeadId) ? input.initialLeadId : (leadIds[0] ?? '')
  const lead = input.snapshot?.leads.find((item) => item.id === initialLeadId)
  const workspaceId = input.workspaceId ?? input.snapshot?.workspace.id ?? 'default'
  const strategy = readCallingStrategyPreferences(workspaceId)
  const voice = readVoiceSettings(workspaceId)
  const connectPhoneReady = voice.defaultProviderId === 'realtalent_connect' && voice.selectedDeviceId.startsWith('connect:phone:')
  const sessionObjective = input.sessionObjective ?? (lead ? inferCallSessionObjective(lead, input.snapshot) : strategy.defaultObjective)
  const activeScripts = input.snapshot?.playbooks.filter((item) => item.kind === 'script' && item.active) ?? []
  const requestedPlaybook = input.playbookId ? activeScripts.find((item) => item.id === input.playbookId) : null
  const configuredPlaybook = strategy.defaultPlaybookId ? activeScripts.find((item) => item.id === strategy.defaultPlaybookId) : null
  const contextualPlaybook = lead && strategy.autoSelectPlaybook
    ? recommendPlaybooks(activeScripts, { objective: sessionObjective, stageId: lead.stageId, decisionRole: lead.decisionRole ?? null, temperature: lead.temperature, kind: 'script' })[0]?.playbook ?? null
    : null
  const playbookId = requestedPlaybook?.id ?? contextualPlaybook?.id ?? configuredPlaybook?.id ?? activeScripts[0]?.id ?? ''
  const today = new Date().toISOString().slice(0, 10)
  const linkedGoal = input.snapshot?.goals.find((goal) => goal.periodStart <= today && goal.periodEnd >= today && ['calls', 'contacts', 'meetings', 'proposals'].includes(goal.metric)) ?? null
  return {
    leadIds,
    initialLeadId,
    playbookId,
    sessionGoal: Math.max(1, Math.ceil(Math.max(leadIds.length, 1) * 0.4)),
    linkedGoalId: linkedGoal?.id ?? '',
    sessionMode: strategy.defaultSessionMode,
    sessionObjective,
    autoAdvance: false,
    autoAdvanceSeconds: 5,
    smartWrap: true,
    fastDial: connectPhoneReady,
    autoDispatchNext: connectPhoneReady,
    autoDispatchDelaySeconds: 1,
    display: readCallDisplayPreferences(input.workspaceId ?? input.snapshot?.workspace.id ?? 'default'),
  }
}
