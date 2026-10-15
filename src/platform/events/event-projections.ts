import type { SnapshotSlice } from '../../services/snapshot-refresh'
import type { DomainEvent, DomainProjection, DomainProjectionPlan } from './domain-event'

const ALL_COMMERCIAL_PROJECTIONS: DomainProjection[] = ['pipeline', 'followups', 'my-day', 'communications', 'notifications', 'metrics']
const EXECUTION_PROJECTIONS: DomainProjection[] = ['followups', 'my-day', 'notifications', 'metrics']

const plan = (slices: SnapshotSlice[], projections: DomainProjection[]): DomainProjectionPlan => ({ slices, projections })

export const projectionPlanForEvent = (event: DomainEvent): DomainProjectionPlan => {
  switch (event.name) {
    case 'commercial.record.created':
    case 'commercial.record.updated':
    case 'commercial.record.deleted':
    case 'commercial.structure.changed':
      return plan(['commercial'], ALL_COMMERCIAL_PROJECTIONS)
    case 'pipeline.opportunity.moved':
      return plan(['commercial', 'activities', 'events', 'automationRuns'], ALL_COMMERCIAL_PROJECTIONS)
    case 'pipeline.structure.changed':
      return plan(['stages', 'commercial'], ['pipeline', 'my-day', 'notifications', 'metrics'])
    case 'activity.created':
    case 'activity.updated':
    case 'activity.deleted':
      return plan(['activities', 'commercial'], EXECUTION_PROJECTIONS)
    case 'activity.completed':
      return plan(['activities', 'commercial', 'events', 'automationRuns'], EXECUTION_PROJECTIONS)
    case 'call.recorded':
      return plan(['calls', 'activities', 'events', 'commercial', 'automationRuns'], ['followups', 'my-day', 'communications', 'notifications', 'metrics'])
    case 'call.deleted':
      return plan(['calls', 'activities'], ['followups', 'my-day', 'communications', 'metrics'])
    case 'calendar.event.changed':
      return plan(['events', 'activities', 'commercial', 'automationRuns'], ['followups', 'my-day', 'notifications', 'metrics'])
    case 'communication.changed':
      return plan([], ['communications', 'my-day', 'notifications'])
    case 'proposal.changed':
      return plan(['proposals', 'buyerRooms', 'activities', 'events', 'commercial', 'automationRuns'], ['pipeline', 'my-day', 'communications', 'notifications', 'metrics'])
    case 'buyer-room.changed':
      return plan(['buyerRooms'], ['communications', 'notifications'])
    case 'revenue.changed':
      return plan(['revenue', 'commercial'], ['pipeline', 'my-day', 'notifications', 'metrics'])
    case 'goal.changed':
      return plan(['goals'], ['my-day', 'notifications', 'metrics'])
    case 'automation.changed':
      return plan(['automationRules', 'automationRuns'], ['my-day', 'notifications'])
    case 'realtime.table.changed': {
      const slice = event.payload.slice
      return typeof slice === 'string'
        ? plan([slice as SnapshotSlice], (event.payload.projections as DomainProjection[] | undefined) ?? [])
        : plan([], [])
    }
    case 'workspace.snapshot.refreshed':
    default:
      return plan([], ALL_COMMERCIAL_PROJECTIONS)
  }
}
