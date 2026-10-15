import { domainEventBus } from './event-bus'
import { inspectRealtimeTransports } from './realtime-status'

export interface RealTalentEventInspector {
  version: '101.9.4'
  inspect(): ReturnType<typeof domainEventBus.inspect> & { transports: ReturnType<typeof inspectRealtimeTransports> }
  clear(): void
}

export const eventInspector: RealTalentEventInspector = {
  version: '101.9.4',
  inspect: () => ({ ...domainEventBus.inspect(), transports: inspectRealtimeTransports() }),
  clear: () => domainEventBus.clearInspectionHistory(),
}

export const installEventInspector = () => {
  if (typeof window === 'undefined') return
  ;(window as typeof window & { __REALTALENT_EVENTS__?: RealTalentEventInspector }).__REALTALENT_EVENTS__ = eventInspector
}
