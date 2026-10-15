import type { CompanyRecord, ContactRecord, Lead, OpportunityRecord, WorkspaceSnapshot } from '../../domain/types'
import { fieldRegistry } from '../metadata/field-registry'
import { objectRegistry } from '../metadata/object-registry'
import { relationRegistry } from '../metadata/relation-registry'
import type { CoreObjectKey, CoreRecord, PlatformRecord } from '../metadata/types'

const recordValue = (record: CoreRecord, field: string): unknown => (record as unknown as Record<string, unknown>)[field]

const toPlatformRecord = <TRecord extends CoreRecord>(objectKey: CoreObjectKey, record: TRecord): PlatformRecord<TRecord> => {
  const definition = objectRegistry.get(objectKey)
  const attributes: Record<string, unknown> = {}
  const relationIds: Record<string, string | string[] | null> = {}

  for (const field of fieldRegistry.list(objectKey)) {
    const value = recordValue(record, field.field)
    if (field.kind === 'relation' || field.kind === 'relation-list') relationIds[field.field] = (value ?? null) as string | string[] | null
    else attributes[field.field] = value
  }

  return {
    objectKey,
    id: String(recordValue(record, definition.idField) ?? ''),
    workspaceId: String(recordValue(record, definition.workspaceField) ?? ''),
    label: String(recordValue(record, definition.primaryLabelField) ?? ''),
    attributes,
    relationIds,
    legacy: record,
  }
}

export const leadAdapter = { id: 'lead-v10193', toPlatformRecord: (record: Lead) => toPlatformRecord('lead', record), toLegacyRecord: (record: PlatformRecord<Lead>) => record.legacy }
export const contactAdapter = { id: 'contact-v10193', toPlatformRecord: (record: ContactRecord) => toPlatformRecord('contact', record), toLegacyRecord: (record: PlatformRecord<ContactRecord>) => record.legacy }
export const companyAdapter = { id: 'company-v10193', toPlatformRecord: (record: CompanyRecord) => toPlatformRecord('company', record), toLegacyRecord: (record: PlatformRecord<CompanyRecord>) => record.legacy }
export const opportunityAdapter = { id: 'opportunity-v10193', toPlatformRecord: (record: OpportunityRecord) => toPlatformRecord('opportunity', record), toLegacyRecord: (record: PlatformRecord<OpportunityRecord>) => record.legacy }

export const workspaceSnapshotToPlatformRecords = (snapshot: WorkspaceSnapshot): Record<CoreObjectKey, PlatformRecord[]> => ({
  lead: snapshot.leads.map(leadAdapter.toPlatformRecord),
  contact: snapshot.contacts.map(contactAdapter.toPlatformRecord),
  company: snapshot.companies.map(companyAdapter.toPlatformRecord),
  opportunity: snapshot.opportunities.map(opportunityAdapter.toPlatformRecord),
})

export const metadataFoundation = Object.freeze({ objectRegistry, fieldRegistry, relationRegistry, leadAdapter, contactAdapter, companyAdapter, opportunityAdapter })
