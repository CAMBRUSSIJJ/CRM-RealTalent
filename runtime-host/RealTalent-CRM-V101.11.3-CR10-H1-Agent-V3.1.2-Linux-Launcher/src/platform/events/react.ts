import { useEffect, useState } from 'react'
import type { DomainProjection } from './domain-event'
import { domainEventBus } from './event-bus'

export const useDomainProjectionRevision = (projection: DomainProjection) => {
  const [revision, setRevision] = useState(() => domainEventBus.projectionRevision(projection))
  useEffect(() => domainEventBus.subscribeProjection(projection, () => setRevision(domainEventBus.projectionRevision(projection))), [projection])
  return revision
}
