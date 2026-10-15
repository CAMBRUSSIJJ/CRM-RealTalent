import type { Lead, WorkspaceSnapshot } from '../../domain/types'
import { resolveCanonicalCommercialLink } from '../canonical/canonical-record-graph'
import { contactAdapter, leadAdapter } from '../records/core-adapters'
import { contactPersonRecordPageDefinition } from './record-page-registry'
import type { RecordPageRecordRef, RecordPageRuntimeModel } from './record-page-definition'

const ref = (record: ReturnType<typeof leadAdapter.toPlatformRecord> | ReturnType<typeof contactAdapter.toPlatformRecord>): RecordPageRecordRef => ({
  objectKey: record.objectKey,
  id: record.id,
  workspaceId: record.workspaceId,
  label: record.label,
})

export const buildContactPersonRecordPageModel = (
  lead: Lead,
  snapshot: WorkspaceSnapshot,
): RecordPageRuntimeModel => {
  const source = leadAdapter.toPlatformRecord(lead)
  const link = resolveCanonicalCommercialLink(lead.id, snapshot)
  const primaryContact = link?.personId ? snapshot.contacts.find((contact) => contact.id === link.personId) ?? null : null
  const canonical = primaryContact ? contactAdapter.toPlatformRecord(primaryContact) : null
  const companyCount = link?.companyId && snapshot.companies.some((company) => company.id === link.companyId) ? 1 : 0
  const relatedContacts = snapshot.contacts.filter((contact) => contact.leadIds.includes(lead.id) || (link?.companyId && contact.companyId === link.companyId)).length
  const relatedOpportunities = snapshot.opportunities.filter((opportunity) => opportunity.leadId === lead.id || opportunity.id === link?.opportunityId).length
  const diagnostics: RecordPageRuntimeModel['diagnostics'] = []

  if (!canonical) diagnostics.push({
    severity: 'warning',
    code: 'legacy_lead_source',
    message: 'Pessoa canônica ainda não foi resolvida; a ficha está usando a projection comercial legada.',
  })
  if (lead.workspaceId !== snapshot.workspace.id) diagnostics.push({
    severity: 'error',
    code: 'workspace_mismatch',
    message: 'O registro não pertence ao workspace carregado.',
  })

  return {
    definitionId: contactPersonRecordPageDefinition.id,
    surface: contactPersonRecordPageDefinition.surface,
    canonicalObjectKey: contactPersonRecordPageDefinition.canonicalObjectKey,
    source: ref(source),
    canonical: canonical ? ref(canonical) : null,
    relationCounts: {
      company: companyCount,
      contacts: relatedContacts,
      opportunities: relatedOpportunities,
      activities: snapshot.activities.filter((item) => item.leadId === lead.id).length,
      calls: snapshot.calls.filter((item) => item.leadId === lead.id).length,
      events: snapshot.events.filter((item) => item.leadId === lead.id).length,
    },
    diagnostics,
  }
}
