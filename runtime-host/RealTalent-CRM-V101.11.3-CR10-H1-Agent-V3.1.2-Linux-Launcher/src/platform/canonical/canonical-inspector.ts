import type { WorkspaceSnapshot } from '../../domain/types'
import { canonicalizeWorkspaceSnapshot } from './canonical-record-graph'
import { getLatestCanonicalInspection } from '../records/workspace-snapshot-adapter'

export const inspectCanonicalCommercialModel = (snapshot?: WorkspaceSnapshot) => snapshot
  ? canonicalizeWorkspaceSnapshot(snapshot).inspection
  : getLatestCanonicalInspection()

declare global {
  interface Window {
    __REALTALENT_CANONICAL__?: {
      version: '101.9.3'
      inspect: () => ReturnType<typeof inspectCanonicalCommercialModel>
    }
  }
}

export const installCanonicalCommercialInspector = () => {
  if (typeof window === 'undefined') return
  window.__REALTALENT_CANONICAL__ = { version: '101.9.3', inspect: () => inspectCanonicalCommercialModel() }
}
