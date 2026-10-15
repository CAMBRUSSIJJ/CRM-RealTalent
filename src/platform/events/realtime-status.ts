import { useEffect, useState } from 'react'
import type { CommunicationsRealtimeState } from '../../services/local-communications-gateway'

export type RealtimeTransport = 'communications-sse' | 'supabase-realtime'
export type RealtimeTransportState = CommunicationsRealtimeState | 'disabled'

const states = new Map<RealtimeTransport, RealtimeTransportState>([
  ['communications-sse', 'connecting'],
  ['supabase-realtime', 'connecting'],
])
const listeners = new Map<RealtimeTransport, Set<() => void>>()

export const setRealtimeTransportState = (transport: RealtimeTransport, state: RealtimeTransportState) => {
  if (states.get(transport) === state) return
  states.set(transport, state)
  for (const listener of listeners.get(transport) ?? []) listener()
}

export const getRealtimeTransportState = (transport: RealtimeTransport) => states.get(transport) ?? 'disabled'

export const subscribeRealtimeTransportState = (transport: RealtimeTransport, listener: () => void) => {
  const bucket = listeners.get(transport) ?? new Set<() => void>()
  bucket.add(listener)
  listeners.set(transport, bucket)
  return () => {
    bucket.delete(listener)
    if (!bucket.size) listeners.delete(transport)
  }
}

export const useRealtimeTransportState = (transport: RealtimeTransport) => {
  const [state, setState] = useState(() => getRealtimeTransportState(transport))
  useEffect(() => subscribeRealtimeTransportState(transport, () => setState(getRealtimeTransportState(transport))), [transport])
  return state
}

export const inspectRealtimeTransports = () => Object.fromEntries(states)
