import type { AppRoute, WorkspaceSnapshot } from '../domain/types'
import { buildCommercialMemory, type CommercialMemoryFact } from './realtalent-ai-memory'
import { enabledAiTools } from './realtalent-ai-tools'

export interface RealTalentAiContextEnvelope {
  version: 'realtalent-ai-context/1.0'
  workspaceId: string
  route?: AppRoute
  focusLeadId?: string
  focusProposalId?: string
  generatedAt: string
  memory: CommercialMemoryFact[]
  dataPolicy: {
    sourceOfTruth: 'crm-snapshot'
    sendsExternally: false
    includesSecrets: false
    writeAuthority: false
  }
  toolIds: string[]
  counts: { leads: number; contacts: number; activities: number; calls: number; events: number; proposals: number }
}

export interface RealTalentAiContextInput { focusLeadId?: string; focusProposalId?: string; currentRoute?: AppRoute; now?: Date }

export const buildRealTalentAiContext = (snapshot: WorkspaceSnapshot, input: RealTalentAiContextInput = {}): RealTalentAiContextEnvelope => {
  const now = input.now ?? new Date()
  let leadId = input.focusLeadId
  if (!leadId && input.focusProposalId) leadId = snapshot.proposals.find((item) => item.id === input.focusProposalId)?.leadId
  const lead = leadId ? snapshot.leads.find((item) => item.id === leadId) : undefined
  return {
    version: 'realtalent-ai-context/1.0',
    workspaceId: snapshot.workspace.id,
    route: input.currentRoute,
    focusLeadId: lead?.id,
    focusProposalId: input.focusProposalId,
    generatedAt: now.toISOString(),
    memory: lead ? buildCommercialMemory(snapshot, lead, now) : [],
    dataPolicy: { sourceOfTruth: 'crm-snapshot', sendsExternally: false, includesSecrets: false, writeAuthority: false },
    toolIds: enabledAiTools().map((tool) => tool.id),
    counts: {
      leads: snapshot.leads.length,
      contacts: snapshot.contacts.length,
      activities: snapshot.activities.length,
      calls: snapshot.calls.length,
      events: snapshot.events.length,
      proposals: snapshot.proposals.length,
    },
  }
}
