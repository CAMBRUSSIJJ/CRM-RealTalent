import type { CompanyRecord, ContactRecord, Lead, OpportunityRecord } from '../../domain/types'

export type CoreObjectKey = 'lead' | 'contact' | 'company' | 'opportunity'
export type CoreRecord = Lead | ContactRecord | CompanyRecord | OpportunityRecord
export type FieldKind = 'id' | 'text' | 'number' | 'boolean' | 'date' | 'enum' | 'relation' | 'relation-list' | 'tags'
export type RelationCardinality = 'one' | 'many'

export interface ObjectDefinition<TRecord extends CoreRecord = CoreRecord> {
  key: CoreObjectKey
  label: string
  pluralLabel: string
  sourceCollection: 'leads' | 'contacts' | 'companies' | 'opportunities'
  idField: keyof TRecord & string
  workspaceField: keyof TRecord & string
  primaryLabelField: keyof TRecord & string
  adapterId: string
  legacy: boolean
  authority?: 'canonical' | 'legacy-projection'
}

export interface FieldDefinition {
  id: string
  objectKey: CoreObjectKey
  field: string
  label: string
  kind: FieldKind
  required?: boolean
  nullable?: boolean
  relationId?: string
  enumValues?: readonly string[]
}

export interface RelationDefinition {
  id: string
  label: string
  fromObject: CoreObjectKey
  fromField: string
  toObject: CoreObjectKey
  cardinality: RelationCardinality
  nullable?: boolean
  inverseRelationId?: string
}

export interface PlatformRecord<TLegacy extends CoreRecord = CoreRecord> {
  objectKey: CoreObjectKey
  id: string
  workspaceId: string
  label: string
  attributes: Record<string, unknown>
  relationIds: Record<string, string | string[] | null>
  legacy: TLegacy
}

export type MetadataIssueSeverity = 'error' | 'warning'
export type MetadataIssueCode =
  | 'invalid_id'
  | 'duplicate_id'
  | 'workspace_mismatch'
  | 'missing_relation'
  | 'relation_workspace_mismatch'
  | 'invalid_relation_value'

export interface MetadataIssue {
  severity: MetadataIssueSeverity
  code: MetadataIssueCode
  objectKey: CoreObjectKey
  recordId: string
  field?: string
  relationId?: string
  value?: unknown
  message: string
}

export interface MetadataInspection {
  version: '101.9.0'
  objectCount: number
  fieldCount: number
  relationCount: number
  recordCounts: Record<CoreObjectKey, number>
  issues: MetadataIssue[]
  errorCount: number
  warningCount: number
}
