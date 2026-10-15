import type { WorkspaceSnapshot } from '../../domain/types'
import { fieldRegistry } from '../metadata/field-registry'
import { objectRegistry } from '../metadata/object-registry'
import { relationRegistry } from '../metadata/relation-registry'
import type { CoreObjectKey, MetadataInspection, MetadataIssue, PlatformRecord } from '../metadata/types'
import { workspaceSnapshotToPlatformRecords } from '../records/core-adapters'

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/
export const isMetadataSafeId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200 && SAFE_ID.test(value)

const targetIndex = (records: Record<CoreObjectKey, PlatformRecord[]>) => Object.fromEntries(
  objectRegistry.list().map((object) => [object.key, new Map(records[object.key].map((record) => [record.id, record]))]),
) as Record<CoreObjectKey, Map<string, PlatformRecord>>

const relationValues = (value: string | string[] | null | undefined): string[] => value == null ? [] : Array.isArray(value) ? value : [value]

export const inspectWorkspaceMetadata = (snapshot: WorkspaceSnapshot): MetadataInspection => {
  const records = workspaceSnapshotToPlatformRecords(snapshot)
  const indexes = targetIndex(records)
  const issues: MetadataIssue[] = []

  for (const object of objectRegistry.list()) {
    const seen = new Set<string>()
    for (const record of records[object.key]) {
      if (!isMetadataSafeId(record.id)) issues.push({ severity: 'error', code: 'invalid_id', objectKey: object.key, recordId: record.id, value: record.id, message: `${object.label}: ID inválido ou vazio.` })
      if (seen.has(record.id)) issues.push({ severity: 'error', code: 'duplicate_id', objectKey: object.key, recordId: record.id, value: record.id, message: `${object.label}: ID duplicado ${record.id}.` })
      seen.add(record.id)
      if (record.workspaceId !== snapshot.workspace.id) issues.push({ severity: 'error', code: 'workspace_mismatch', objectKey: object.key, recordId: record.id, field: 'workspaceId', value: record.workspaceId, message: `${object.label} ${record.id}: workspace não corresponde ao snapshot ativo.` })
    }
  }

  for (const relation of relationRegistry.list()) {
    for (const record of records[relation.fromObject]) {
      const raw = record.relationIds[relation.fromField]
      if (raw == null || raw === '') {
        if (!relation.nullable && relation.cardinality === 'one') issues.push({ severity: 'warning', code: 'missing_relation', objectKey: relation.fromObject, recordId: record.id, field: relation.fromField, relationId: relation.id, value: raw, message: `${relation.label}: relação obrigatória vazia.` })
        continue
      }
      if (relation.cardinality === 'many' && !Array.isArray(raw)) {
        issues.push({ severity: 'warning', code: 'invalid_relation_value', objectKey: relation.fromObject, recordId: record.id, field: relation.fromField, relationId: relation.id, value: raw, message: `${relation.label}: esperado array de IDs.` })
        continue
      }
      for (const targetId of relationValues(raw)) {
        if (!isMetadataSafeId(targetId)) {
          issues.push({ severity: 'warning', code: 'invalid_relation_value', objectKey: relation.fromObject, recordId: record.id, field: relation.fromField, relationId: relation.id, value: targetId, message: `${relation.label}: ID relacionado inválido.` })
          continue
        }
        const target = indexes[relation.toObject].get(targetId)
        if (!target) {
          issues.push({ severity: 'warning', code: 'missing_relation', objectKey: relation.fromObject, recordId: record.id, field: relation.fromField, relationId: relation.id, value: targetId, message: `${relation.label}: alvo ${targetId} não encontrado.` })
          continue
        }
        if (target.workspaceId !== record.workspaceId) issues.push({ severity: 'error', code: 'relation_workspace_mismatch', objectKey: relation.fromObject, recordId: record.id, field: relation.fromField, relationId: relation.id, value: targetId, message: `${relation.label}: relação cruza workspaces.` })
      }
    }
  }

  const recordCounts = Object.fromEntries((['lead', 'contact', 'company', 'opportunity'] as CoreObjectKey[]).map((key) => [key, records[key].length])) as Record<CoreObjectKey, number>
  return {
    version: '101.9.0',
    objectCount: objectRegistry.list().length,
    fieldCount: fieldRegistry.list().length,
    relationCount: relationRegistry.list().length,
    recordCounts,
    issues,
    errorCount: issues.filter((issue) => issue.severity === 'error').length,
    warningCount: issues.filter((issue) => issue.severity === 'warning').length,
  }
}

