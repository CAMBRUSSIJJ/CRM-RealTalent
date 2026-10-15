import assert from 'node:assert/strict'
import { eventIdentityKey, mergeCommunicationEvent, mergeStoreSnapshots } from './communications-store-utils.mjs'

const baseEvent = (overrides = {}) => ({
  id: overrides.id || 'evt-1', workspaceId: overrides.workspaceId || 'ws-a', accountId: overrides.accountId || 'acc-a',
  channel: 'whatsapp', direction: 'outbound', status: overrides.status || 'sent', externalMessageId: overrides.externalMessageId || 'msg-1',
  leadId: overrides.leadId ?? null, contactId: overrides.contactId ?? null, bodyText: overrides.bodyText || 'oi', subject: '',
  threadId: overrides.threadId || '5511999999999@c.us', occurredAt: overrides.occurredAt || '2026-10-02T10:00:00.000Z',
  createdAt: overrides.createdAt || '2026-10-02T10:00:00.000Z', metadata: overrides.metadata || {},
})

// Same external id in different workspaces must never collide.
assert.notEqual(eventIdentityKey(baseEvent()), eventIdentityKey(baseEvent({ workspaceId: 'ws-b' })))

// Live event can arrive before the CRM send response; the response must enrich the stored event instead of duplicating it.
const live = baseEvent({ leadId: null, contactId: null, status: 'sent', metadata: { transport: 'qr', ack: 1 } })
const enriched = baseEvent({ id: 'evt-2', leadId: 'lead-1', contactId: 'contact-1', status: 'delivered', metadata: { transport: 'qr', ack: 2 } })
const merged = mergeCommunicationEvent(live, enriched)
assert.equal(merged.id, 'evt-1')
assert.equal(merged.leadId, 'lead-1')
assert.equal(merged.contactId, 'contact-1')
assert.equal(merged.status, 'delivered')
assert.equal(merged.metadata.ack, 2)

// A stale request snapshot must not erase an event that was written asynchronously while the request awaited I/O.
const stale = { version: 1, accounts: [], events: [baseEvent({ externalMessageId: 'old-msg', id: 'old' })] }
const diskNow = { version: 1, accounts: [], events: [baseEvent({ externalMessageId: 'new-live-msg', id: 'live' })] }
const afterSave = mergeStoreSnapshots(stale, diskNow)
assert.equal(afterSave.events.length, 2)
assert(afterSave.events.some(event => event.externalMessageId === 'new-live-msg'))

// ACK/read progress already persisted on disk must not be downgraded by a stale snapshot.
const staleStatus = { version: 1, accounts: [], events: [baseEvent({ status: 'sent', metadata: { ack: 1 } })] }
const diskRead = { version: 1, accounts: [], events: [baseEvent({ status: 'read', metadata: { ack: 3 } })] }
const afterStatusMerge = mergeStoreSnapshots(staleStatus, diskRead)
assert.equal(afterStatusMerge.events[0].status, 'read')
assert.equal(afterStatusMerge.events[0].metadata.ack, 3)

console.log('V101.8.4-H9 communications reliability smoke: 4/4 cenários aprovados.')
