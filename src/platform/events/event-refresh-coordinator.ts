import type { DomainEvent } from './domain-event'
import { projectionPlanForEvent } from './event-projections'
import type { SnapshotSlice } from '../../services/snapshot-refresh'

export interface EventRefreshCoordinatorOptions {
  workspaceId: string
  refreshSlices(slices: SnapshotSlice[], workspaceId: string): Promise<void>
  debounceMs?: number
}

export const createEventRefreshCoordinator = (options: EventRefreshCoordinatorOptions) => {
  const pending = new Set<SnapshotSlice>()
  let timer: number | null = null
  let inflight: Promise<void> | null = null
  let rerun = false

  const flush = async () => {
    if (timer !== null && typeof window !== 'undefined') window.clearTimeout(timer)
    timer = null
    if (!pending.size) return
    if (inflight) { rerun = true; await inflight; return }
    const slices = [...pending]
    pending.clear()
    inflight = options.refreshSlices(slices, options.workspaceId)
    try { await inflight } finally { inflight = null }
    if (rerun || pending.size) { rerun = false; await flush() }
  }

  const onEvent = async (event: DomainEvent) => {
    if (event.workspaceId !== options.workspaceId) return
    const { slices } = projectionPlanForEvent(event)
    slices.forEach((slice) => pending.add(slice))
    if (!pending.size) return
    if (event.source === 'ui' || event.source === 'repository' || event.source === 'automation') {
      await flush()
      return
    }
    if (typeof window === 'undefined') { await flush(); return }
    if (timer !== null) window.clearTimeout(timer)
    timer = window.setTimeout(() => { void flush() }, options.debounceMs ?? 180)
  }

  const dispose = () => { if (timer !== null && typeof window !== 'undefined') window.clearTimeout(timer); timer = null; pending.clear() }
  return { onEvent, flush, dispose }
}
