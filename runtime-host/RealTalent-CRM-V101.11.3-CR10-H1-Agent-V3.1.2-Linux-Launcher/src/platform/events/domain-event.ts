import type { SnapshotSlice } from '../../services/snapshot-refresh'

export type DomainEventSource = 'ui' | 'repository' | 'supabase' | 'communications-sse' | 'automation' | 'system' | 'broadcast'
export type DomainProjection = 'pipeline' | 'followups' | 'my-day' | 'communications' | 'notifications' | 'metrics'

export type DomainEventName =
  | 'commercial.record.created'
  | 'commercial.record.updated'
  | 'commercial.record.deleted'
  | 'commercial.structure.changed'
  | 'pipeline.opportunity.moved'
  | 'pipeline.structure.changed'
  | 'activity.created'
  | 'activity.updated'
  | 'activity.completed'
  | 'activity.deleted'
  | 'call.recorded'
  | 'call.deleted'
  | 'calendar.event.changed'
  | 'communication.changed'
  | 'proposal.changed'
  | 'buyer-room.changed'
  | 'revenue.changed'
  | 'goal.changed'
  | 'automation.changed'
  | 'realtime.table.changed'
  | 'workspace.snapshot.refreshed'

export interface DomainEvent<TPayload = Record<string, unknown>> {
  id: string
  name: DomainEventName
  workspaceId: string
  occurredAt: string
  source: DomainEventSource
  entityType?: string | null
  entityId?: string | null
  correlationId?: string | null
  causationId?: string | null
  revision?: number | null
  payload: TPayload
}

export interface DomainProjectionPlan {
  slices: SnapshotSlice[]
  projections: DomainProjection[]
}

let sequence = 0
const eventId = () => `evt-${Date.now().toString(36)}-${(++sequence).toString(36)}`

export const createDomainEvent = <TPayload extends Record<string, unknown> = Record<string, unknown>>(
  input: Omit<DomainEvent<TPayload>, 'id' | 'occurredAt' | 'payload'> & { id?: string; occurredAt?: string; payload?: TPayload },
): DomainEvent<TPayload> => ({
  ...input,
  id: input.id ?? eventId(),
  occurredAt: input.occurredAt ?? new Date().toISOString(),
  payload: input.payload ?? ({} as TPayload),
})
