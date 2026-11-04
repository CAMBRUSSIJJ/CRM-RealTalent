import assert from 'node:assert/strict'
import test from 'node:test'
import { workspaceCommunicationsRevision, mayAutoRetryQueuedQrEvent } from './communications-live-revision.mjs'
import { eventIdentityKey, mergeStoreSnapshots } from './communications-store-utils.mjs'

const ws='67bd69fd-58a1-4b91-97b3-d4d054c53eb4'
const base=(overrides={})=>({
  id:'evt-1',workspaceId:ws,accountId:'qr-account',channel:'whatsapp',
  direction:'outbound',status:'queued',externalMessageId:null,bodyText:'oi',
  metadata:{transport:'qr',idempotencyKey:'crm-whatsapp:fixed-key',outbox:false,sendAttemptInProgress:true},
  occurredAt:'2026-11-04T16:50:00.000Z',...overrides,
})

test('tenant-wide revision detects status/ACK changes even on an older message',()=>{
  const older=base()
  const latest=base({id:'evt-2',externalMessageId:'last-message',status:'received',
    direction:'inbound',occurredAt:'2026-11-04T16:51:00.000Z',metadata:{transport:'qr'}})
  const first=workspaceCommunicationsRevision([latest,older],ws)
  const after=workspaceCommunicationsRevision([latest,{...older,status:'delivered',
    metadata:{...older.metadata,ack:2,sendAttemptInProgress:false}}],ws)
  assert.notEqual(first.revision,after.revision)
  assert.equal(first.count,2)
  assert.equal(after.count,2)
})

test('revision contains no message body, account IDs or contact data',()=>{
  const event=base({bodyText:'Mensagem privada de cliente'})
  const fingerprint=workspaceCommunicationsRevision([event],ws)
  assert.match(fingerprint.revision,/^[a-f0-9]{32}$/)
  assert.equal(JSON.stringify(fingerprint).includes('Mensagem privada'),false)
  assert.equal(JSON.stringify(fingerprint).includes('qr-account'),false)
})

test('revisions cannot reveal changes from another workspace',()=>{
  const own=base()
  const other=base({id:'other-event',workspaceId:'other-tenant',status:'read'})
  assert.deepEqual(workspaceCommunicationsRevision([own],ws),
    workspaceCommunicationsRevision([own,other],ws))
})

test('same send stays a single event from accepted/queued to WhatsApp ACK',()=>{
  const accepted=base()
  const confirmed=base({id:'sent-event-2',externalMessageId:'msg-from-whatsapp',status:'delivered',
    metadata:{transport:'qr',idempotencyKey:accepted.metadata.idempotencyKey,ack:2,
      sendAttemptInProgress:false,outbox:false}})
  assert.equal(eventIdentityKey(accepted),eventIdentityKey(confirmed))
  const merged=mergeStoreSnapshots({events:[confirmed],accounts:[]},{events:[accepted],accounts:[]})
  assert.equal(merged.events.length,1)
  assert.equal(merged.events[0].status,'delivered')
  assert.equal(merged.events[0].externalMessageId,'msg-from-whatsapp')
})

test('automatic QR retry only for never-attempted disconnected sends',()=>{
  assert.equal(mayAutoRetryQueuedQrEvent(base()),false)
  assert.equal(mayAutoRetryQueuedQrEvent(base({metadata:{
    transport:'qr',outbox:true,retrySafety:'confirmed_not_attempted',
  }})),true)
  assert.equal(mayAutoRetryQueuedQrEvent(base({metadata:{
    transport:'qr',outbox:true,retrySafety:'requires_review',sendUncertain:true,
  }})),false)
  assert.equal(mayAutoRetryQueuedQrEvent(base({metadata:{
    transport:'qr',outbox:true,retrySafety:'confirmed_not_attempted',sendUncertain:true,
  }})),false)
  assert.equal(mayAutoRetryQueuedQrEvent(base({metadata:{
    transport:'qr',outbox:true,
  }})),false,'Legacy queued events must not auto-resend')
})

test('Cloud API outbox policy remains unchanged',()=>{
  assert.equal(mayAutoRetryQueuedQrEvent(base({metadata:{transport:'cloud',outbox:true}})),true)
})
