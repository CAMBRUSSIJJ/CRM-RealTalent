import crypto from 'node:crypto'

// A server-side fingerprint covers the entire tenant inbox, including ACK
// changes on an older message. It exposes no message content to the browser.
export function workspaceCommunicationsRevision(events, workspaceId) {
  const hash = crypto.createHash('sha256')
  let count = 0
  for (const item of events || []) {
    if (item.workspaceId !== workspaceId) continue
    count += 1
    const metadata = item.metadata || {}
    hash.update(JSON.stringify([
      item.id, item.externalMessageId || '', item.channel, item.direction,
      item.status, item.updatedAt || '', item.bodyText || '', item.threadId || '',
      metadata.ack ?? '', metadata.crmReadAt || '', metadata.idempotencyKey || '',
      metadata.outbox === true, metadata.sendUncertain === true,
      metadata.sendAttemptInProgress === true, metadata.lastSendError || '',
    ]))
    hash.update('\n')
  }
  return { revision: hash.digest('hex').slice(0, 32), count }
}

// Never retry a WhatsApp QR send whose outcome is ambiguous. An automatic
// retry is safe only if no send was attempted (account was disconnected).
export function mayAutoRetryQueuedQrEvent(event) {
  if (event?.metadata?.transport !== 'qr') return true
  return event.status === 'queued' && event.metadata?.outbox === true
    && event.metadata?.retrySafety === 'confirmed_not_attempted'
    && event.metadata?.sendUncertain !== true
}
