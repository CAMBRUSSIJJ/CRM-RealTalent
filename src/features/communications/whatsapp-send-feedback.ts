/** WhatsApp UI feedback is expressed in the message bubble, not a toast.
 * The gateway acknowledging a request is NOT confirmation of delivery/read.
 * Retain optimistic messages until the official timeline reconciles them.
 */
export type PendingSendState = 'queued' | 'sent' | 'failed'

export function statusAfterGatewayAck(status: string): PendingSendState {
  if (status === 'failed') return 'failed'
  if (status === 'sent' || status === 'delivered' || status === 'read') return 'sent'
  return 'queued'
}

export interface PendingSendIdentity {
  idempotencyKey: string
  serverEventId?: string | null
}

export interface OfficialSendIdentity {
  id: string
  metadata?: Record<string, unknown>
}

export function acknowledgedInTimeline(pending: PendingSendIdentity, official: OfficialSendIdentity[]): boolean {
  return official.some(item => {
    const idempotencyKey = String(item.metadata?.idempotencyKey ?? '')
    const eventId = String(item.metadata?.eventId ?? item.id.replace(/^official:/, ''))
    return Boolean(idempotencyKey && idempotencyKey === pending.idempotencyKey) ||
      Boolean(pending.serverEventId && eventId === pending.serverEventId)
  })
}
