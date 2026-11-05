import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createLocalBridge, safeQr } from './connector.mjs'

const organization = '00000000-0000-4000-8000-000000000001'
const assignee = '00000000-0000-4000-8000-000000000002'
const taskId = '00000000-0000-4000-8000-000000000003'
const conf = {
  ORGANIZATION_ID: organization, SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-not-a-real-secret',
  EVOLUTION_API_URL: 'http://evolution:8080',
  EVOLUTION_API_KEY: 'not-a-real-key-for-evolution-1234567890',
  CRM_PUBLIC_URL: 'https://crm-real-talent.vercel.app',
}
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
const response = value => new Response(JSON.stringify(value), { status: 200 })
function fixture({ verified = true, linked = true, state = 'open', challenge = null, jobs = true } = {}) {
  const calls = []
  const fetcher = async (address, options) => {
    const url = new URL(address)
    const data = options.body ? JSON.parse(options.body) : undefined
    calls.push({ url, method: options.method, data, headers: options.headers })
    if (url.hostname === 'evolution') {
      if (url.pathname.startsWith('/instance/connectionState'))
        return response({ instance: { state } })
      if (url.pathname.startsWith('/message/sendText'))
        return response({ key: { id: 'message-123' } })
      throw new Error('Unexpected Evolution endpoint: ' + url.pathname)
    }
    if (url.pathname.endsWith('/rpc/claim_whatsapp_local_jobs')) return response(jobs ? [{
      id: '00000000-0000-4000-8000-000000000004', organization_id: organization, channel: 'whatsapp',
      assignee_id: assignee, task_id: taskId, event_type: 'assigned',
      scheduled_at: new Date().toISOString(),
    }] : [])
    if (url.pathname.endsWith('/rpc/claim_whatsapp_local_phone_codes'))
      return response(challenge ? [challenge] : [])
    if (url.pathname.includes('/whatsapp_local_bridge'))
      return new Response(null, { status: 204 })
    if (url.pathname.includes('/task_notification_outbox'))
      return new Response(null, { status: 204 })
    if (url.pathname.includes('/whatsapp_local_phone_challenges'))
      return new Response(null, { status: 204 })
    if (url.pathname.includes('/work_tasks')) return response([{
      assignee_id: assignee, title: 'Conferir proposta', due_at: null,
      status: 'todo', priority: 'normal', reminder_enabled: true,
      reminder_channels: ['whatsapp'],
    }])
    if (url.pathname.includes('/task_notification_preferences'))
      return response([{ whatsapp_enabled: true, whatsapp_phone_e164: '+5551999999999',
        whatsapp_consented_at: new Date().toISOString() }])
    if (url.pathname.includes('/organization_members')) return response(linked ? [{ user_id: assignee }] : [])
    if (url.pathname.includes('/team_member_notification_contacts'))
      return response([{ phone_e164: '+5551999999999' }])
    if (url.pathname.includes('/task_notification_verified_phones'))
      return response(verified ? [{ phone_e164: '+5551999999999',
        verified_at: new Date().toISOString() }] : [])
    throw new Error('Unexpected Supabase endpoint: ' + url.pathname)
  }
  return { calls, fetcher }
}

test('rejects invalid tenant, insecure URLs and missing server credentials', () => {
  assert.throws(() => createLocalBridge({ ...conf, ORGANIZATION_ID: 'incorrect' }))
  assert.throws(() => createLocalBridge({ ...conf, SUPABASE_URL: 'http://example.supabase.co' }))
  assert.throws(() => createLocalBridge({ ...conf, EVOLUTION_API_URL: 'http://public.example:8080' }))
  assert.throws(() => createLocalBridge({ ...conf, CRM_PUBLIC_URL: 'http://localhost:4188' }))
})
test('accepts inline PNG QR only, never sends a pairing token to an external QR service', () => {
  assert.equal(safeQr(image), image)
  assert.equal(safeQr('https://qr-service.invalid/read-me'), null)
  assert.equal(safeQr('data:text/html;base64,Zm9v'), null)
})
test('pulse writes workspace-scoped heartbeat and reads only internal Evolution', async () => {
  const { fetcher, calls } = fixture()
  const bridge = createLocalBridge(conf, { fetcher })
  assert.equal(await bridge.pulse(), 'open')
  assert.equal(calls[0].url.hostname, 'evolution')
  assert.equal(calls[1].url.pathname, '/rest/v1/whatsapp_local_bridge')
  assert.equal(calls[1].data.organization_id, organization)
  assert.equal(calls[1].data.connection_state, 'open')
})
test('unverified phone is skipped and no WhatsApp message is sent', async () => {
  const { fetcher, calls } = fixture({ verified: false })
  await createLocalBridge(conf, { fetcher }).reminders()
  assert.equal(calls.some(item => item.url.pathname.startsWith('/message/sendText')), false)
  const finished = calls.find(item => item.url.pathname.includes('/task_notification_outbox'))
  assert.equal(finished.data.status, 'skipped')
})
test('verified consented task produces exactly one send and an ACK in the existing queue', async () => {
  const { fetcher, calls } = fixture()
  await createLocalBridge(conf, { fetcher }).reminders()
  const outbound = calls.filter(item => item.url.pathname.startsWith('/message/sendText'))
  assert.equal(outbound.length, 1)
  assert.equal(outbound[0].data.number, '5551999999999')
  assert.match(outbound[0].data.text, /Conferir proposta/)
  const finished = calls.find(item => item.url.pathname.includes('/task_notification_outbox'))
  assert.equal(finished.data.status, 'sent')
  assert.equal(finished.data.provider_message_id, 'message-123')
})
test('phone confirmation is sent via local Evolution and never returned in public response', async () => {
  const { fetcher, calls } = fixture({ challenge: {
    organization_id: organization, user_id: assignee, phone_e164: '+5551999999999', code: '654321',
  } })
  await createLocalBridge(conf, { fetcher }).verifyPhones()
  assert.equal(calls.filter(item => item.url.pathname.startsWith('/message/sendText')).length, 1)
  const patch = calls.find(item => item.url.pathname.includes('/whatsapp_local_phone_challenges'))
  assert.ok(patch?.data?.sent_at)
})
