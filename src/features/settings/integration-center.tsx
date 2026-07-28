import type { WorkspaceMember } from '../../domain/types'
import type { CrmPreferences } from './preferences-context'
import { IntegrationFrameworkPanel } from './integration-framework-panel'

interface IntegrationCenterProps {
  preferences: CrmPreferences['integrations']
  members: WorkspaceMember[]
  onPreferencesChange(patch: Partial<CrmPreferences['integrations']>): void
}

export function IntegrationCenter(props: IntegrationCenterProps) {
  return <IntegrationFrameworkPanel {...props} />
}
