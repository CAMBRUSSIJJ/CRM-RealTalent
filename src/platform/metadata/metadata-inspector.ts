import type { WorkspaceSnapshot } from '../../domain/types'
import { fieldRegistry } from './field-registry'
import { objectRegistry } from './object-registry'
import { relationRegistry } from './relation-registry'
import { inspectWorkspaceMetadata } from '../validation/metadata-validator'
import { getLatestMetadataInspection } from '../records/workspace-snapshot-adapter'

export const inspectMetadataFoundation = (snapshot?: WorkspaceSnapshot) => ({
  version: '101.9.0' as const,
  objects: objectRegistry.list(),
  fields: fieldRegistry.list(),
  relations: relationRegistry.list(),
  snapshot: snapshot ? inspectWorkspaceMetadata(snapshot) : getLatestMetadataInspection(),
})

declare global {
  interface Window {
    __REALTALENT_METADATA__?: {
      version: '101.9.0'
      inspect: () => ReturnType<typeof inspectMetadataFoundation>
    }
  }
}

export const installMetadataInspector = () => {
  if (typeof window === 'undefined') return
  window.__REALTALENT_METADATA__ = {
    version: '101.9.0',
    inspect: () => inspectMetadataFoundation(),
  }
}
