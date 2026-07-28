import type { CallDisplayPreferences } from './call-display-preferences'

export interface CallSessionConfig {
  leadIds: string[]
  initialLeadId: string
  deviceId: string
  playbookId: string
  sessionGoal: number
  display: CallDisplayPreferences
}
