import type { WorkspaceSnapshot } from '../../domain/types'
import type { CanonicalCommercialInspection } from '../canonical/types'
import { canonicalizeWorkspaceSnapshot } from '../canonical/canonical-record-graph'
import type { MetadataInspection } from '../metadata/types'
import { inspectWorkspaceMetadata } from '../validation/metadata-validator'

let latestInspection: MetadataInspection | null = null
let latestCanonicalInspection: CanonicalCommercialInspection | null = null

/**
 * Adapter de compatibilidade do ciclo V101.9.x.
 * V101.9.3 torna Pessoa/Empresa/Oportunidade as autoridades canônicas e devolve
 * o Lead como projection compatível para a UI existente, sem alterar o shape do WorkspaceSnapshot.
 */
export const adaptWorkspaceSnapshotWithMetadata = (snapshot: WorkspaceSnapshot): WorkspaceSnapshot => {
  const canonical = canonicalizeWorkspaceSnapshot(snapshot)
  latestCanonicalInspection = canonical.inspection
  latestInspection = inspectWorkspaceMetadata(canonical.snapshot)
  return canonical.snapshot
}

export const getLatestMetadataInspection = () => latestInspection
export const getLatestCanonicalInspection = () => latestCanonicalInspection
