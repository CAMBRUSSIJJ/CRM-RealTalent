import type { DomainProjection } from './domain-event'
import type { SnapshotSlice } from '../../services/snapshot-refresh'
import { createDomainEvent } from './domain-event'
import { domainEventBus } from './event-bus'

const tablePlan: Record<string, { slice: SnapshotSlice; projections: DomainProjection[] }> = {
  leads: { slice: 'commercial', projections: ['pipeline', 'followups', 'my-day', 'communications', 'notifications', 'metrics'] },
  companies: { slice: 'commercial', projections: ['pipeline', 'my-day', 'communications', 'metrics'] },
  contacts: { slice: 'commercial', projections: ['my-day', 'communications', 'notifications'] },
  contact_relationships: { slice: 'commercial', projections: ['communications'] },
  opportunities: { slice: 'commercial', projections: ['pipeline', 'my-day', 'notifications', 'metrics'] },
  social_profiles: { slice: 'commercial', projections: ['communications'] },
  pipeline_stages: { slice: 'stages', projections: ['pipeline', 'my-day', 'metrics'] },
  activities: { slice: 'activities', projections: ['followups', 'my-day', 'notifications', 'metrics'] },
  calls: { slice: 'calls', projections: ['followups', 'my-day', 'communications', 'metrics'] },
  calendar_events: { slice: 'events', projections: ['followups', 'my-day', 'notifications', 'metrics'] },
  playbooks: { slice: 'playbooks', projections: [] },
  products: { slice: 'products', projections: [] },
  sales_proposals: { slice: 'proposals', projections: ['pipeline', 'my-day', 'communications', 'notifications', 'metrics'] },
  sales_proposal_items: { slice: 'proposals', projections: ['pipeline', 'metrics'] },
  revenue_entries: { slice: 'revenue', projections: ['pipeline', 'my-day', 'notifications', 'metrics'] },
  goals: { slice: 'goals', projections: ['my-day', 'notifications', 'metrics'] },
  automation_rules: { slice: 'automationRules', projections: ['my-day'] },
  automation_runs: { slice: 'automationRuns', projections: ['my-day', 'notifications'] },
  workflow_executions: { slice: 'automationRuns', projections: ['my-day', 'notifications', 'metrics'] },
  workflow_step_runs: { slice: 'automationRuns', projections: ['notifications'] },
}

export const publishRealtimeTableChange = (workspaceId: string, table: string, eventType = '*') => {
  const mapping = tablePlan[table]
  if (!mapping) return Promise.resolve(null)
  return domainEventBus.publish(createDomainEvent({
    name: 'realtime.table.changed',
    workspaceId,
    source: 'supabase',
    entityType: table,
    payload: { table, eventType, slice: mapping.slice, projections: mapping.projections },
  }))
}
