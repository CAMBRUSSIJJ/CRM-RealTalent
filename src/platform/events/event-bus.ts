import type { DomainEvent, DomainEventName, DomainProjection } from './domain-event'
import { projectionPlanForEvent } from './event-projections'

export type DomainEventMatcher = DomainEventName | `${string}.*` | '*'
export type DomainEventHandler = (event: DomainEvent) => void | Promise<void>

interface Subscription {
  id: number
  matcher: DomainEventMatcher
  handler: DomainEventHandler
}

export interface DomainEventBusInspection {
  published: number
  delivered: number
  deduplicated: number
  subscribers: number
  projectionRevisions: Record<DomainProjection, number>
  recent: DomainEvent[]
}

const matches = (matcher: DomainEventMatcher, name: DomainEventName) => {
  if (matcher === '*') return true
  if (!matcher.endsWith('.*')) return matcher === name
  return name.startsWith(matcher.slice(0, -1))
}

export class GlobalDomainEventBus {
  private subscriptions = new Map<number, Subscription>()
  private recent: DomainEvent[] = []
  private seen = new Map<string, number>()
  private subscriptionId = 0
  private published = 0
  private delivered = 0
  private deduplicated = 0
  private projectionRevisions: Record<DomainProjection, number> = {
    pipeline: 0,
    followups: 0,
    'my-day': 0,
    communications: 0,
    notifications: 0,
    metrics: 0,
  }
  private projectionListeners = new Map<DomainProjection, Set<() => void>>()
  private broadcast: BroadcastChannel | null = null

  constructor() {
    if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
      this.broadcast = new BroadcastChannel('realtalent-domain-events-v10194')
      this.broadcast.onmessage = (message) => {
        const event = message.data as DomainEvent | undefined
        if (!event?.id || !event.workspaceId || !event.name) return
        void this.publish({ ...event, source: 'broadcast' }, { broadcast: false })
      }
    }
  }

  subscribe(matcher: DomainEventMatcher, handler: DomainEventHandler) {
    const id = ++this.subscriptionId
    this.subscriptions.set(id, { id, matcher, handler })
    return () => { this.subscriptions.delete(id) }
  }

  subscribeProjection(projection: DomainProjection, listener: () => void) {
    const listeners = this.projectionListeners.get(projection) ?? new Set<() => void>()
    listeners.add(listener)
    this.projectionListeners.set(projection, listeners)
    return () => {
      listeners.delete(listener)
      if (!listeners.size) this.projectionListeners.delete(projection)
    }
  }

  projectionRevision(projection: DomainProjection) {
    return this.projectionRevisions[projection]
  }

  async publish(event: DomainEvent, options: { broadcast?: boolean } = {}) {
    const now = Date.now()
    for (const [key, at] of this.seen) if (now - at > 30_000) this.seen.delete(key)
    const dedupeKey = `${event.workspaceId}:${event.id}`
    if (this.seen.has(dedupeKey)) { this.deduplicated += 1; return event }
    this.seen.set(dedupeKey, now)
    this.published += 1
    this.recent = [event, ...this.recent].slice(0, 100)

    const plan = projectionPlanForEvent(event)
    for (const projection of plan.projections) {
      this.projectionRevisions[projection] += 1
      for (const listener of this.projectionListeners.get(projection) ?? []) listener()
    }

    const deliveries = [...this.subscriptions.values()]
      .filter((subscription) => matches(subscription.matcher, event.name))
      .map(async (subscription) => { this.delivered += 1; await subscription.handler(event) })
    await Promise.allSettled(deliveries)

    if (options.broadcast !== false && event.source !== 'broadcast') {
      try { this.broadcast?.postMessage(event) } catch { /* browser privacy mode */ }
    }
    return event
  }

  inspect(): DomainEventBusInspection {
    return {
      published: this.published,
      delivered: this.delivered,
      deduplicated: this.deduplicated,
      subscribers: this.subscriptions.size,
      projectionRevisions: { ...this.projectionRevisions },
      recent: [...this.recent],
    }
  }

  clearInspectionHistory() { this.recent = [] }
}

export const domainEventBus = new GlobalDomainEventBus()
