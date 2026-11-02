import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveWhatsAppSendAddress, recognizedWhatsAppSendAddress } from './whatsapp-lid-addressing.mjs'

test('reads only WhatsApp user WIDs, not arbitrary strings or objects', () => {
  assert.equal(recognizedWhatsAppSendAddress({ _serialized: '123456789@lid' }), '123456789@lid')
  assert.equal(recognizedWhatsAppSendAddress({ _serialized: '5553999999999@c.us' }), '5553999999999@c.us')
  assert.equal(recognizedWhatsAppSendAddress({ id: { _serialized: '123456789@lid' } }), '123456789@lid')
  assert.equal(recognizedWhatsAppSendAddress({ _serialized: 'someone@lid' }), null)
  assert.equal(recognizedWhatsAppSendAddress({ _serialized: '123@g.us' }), null)
  assert.equal(recognizedWhatsAppSendAddress({ id: 'garbage' }), null)
})

test('resolves a privacy-migrated recipient BEFORE its first send', async () => {
  let calls = 0
  const cache = new Map()
  const client = { getNumberId: async id => { calls++; assert.equal(id, '5553999999999@c.us'); return { _serialized: '123456789012345@lid' } } }
  const result = await resolveWhatsAppSendAddress(client, '5553999999999@c.us', { cache })
  assert.deepEqual(result, { chatId: '123456789012345@lid', resolution: 'lid_or_server_id' })
  assert.equal(cache.get('5553999999999@c.us'), '123456789012345@lid')
  await resolveWhatsAppSendAddress(client, '5553999999999@c.us', { cache })
  assert.equal(calls, 1, 'should use the already confirmed mapping, without probing again')
})

test('uses confirmed LID mapping only if its PN matches the exact recipient', async () => {
  const client = {
    getNumberId: async () => ({ _serialized: '5553999999999@c.us' }),
    getContactLidAndPhone: async () => [
      { lid: '7777777777777@lid', pn: '5553888888888@c.us' },
      { lid: '2222222222222@lid', pn: '5553999999999@c.us' },
    ],
  }
  const result = await resolveWhatsAppSendAddress(client, '5553999999999@c.us')
  assert.equal(result.chatId, '2222222222222@lid')
})

test('never guesses a LID from phone digit count or from another contact', async () => {
  const client = {
    getNumberId: async () => null,
    getContactLidAndPhone: async () => [{ lid: '77777777@lid', pn: '5553888888888@c.us' }],
  }
  const result = await resolveWhatsAppSendAddress(client, '5553999999999@c.us')
  assert.equal(result.chatId, '5553999999999@c.us')
  assert.equal(result.resolution, 'phone_fallback')
})

test('falls back to phone on transient lookup failures, without sending or retrying', async () => {
  let queries = 0
  const client = {
    getNumberId: async () => { queries++; throw new Error('rate limit') },
    getContactLidAndPhone: async () => { queries++; throw new Error('lookup not ready') },
    sendMessage: () => { throw new Error('resolver must not send') },
  }
  const result = await resolveWhatsAppSendAddress(client, '5553999999999@c.us')
  assert.equal(result.chatId, '5553999999999@c.us')
  assert.equal(queries, 2)
})

test('preserves group, already-LID and channel IDs without lookup', async () => {
  const client = { getNumberId: () => { throw new Error('unexpected lookup') } }
  for (const id of ['7777@g.us', '222222222@lid', '42@newsletter']) {
    assert.equal((await resolveWhatsAppSendAddress(client, id)).chatId, id)
  }
})

test('does not cache unavailable phone lookup, allowing later server mapping', async () => {
  const cache = new Map()
  let tries = 0
  const client = { getNumberId: async () => ++tries === 1 ? null : { _serialized: '22222222@lid' } }
  assert.equal((await resolveWhatsAppSendAddress(client, '5553999999999@c.us', { cache })).chatId, '5553999999999@c.us')
  assert.equal(cache.size, 0)
  assert.equal((await resolveWhatsAppSendAddress(client, '5553999999999@c.us', { cache })).chatId, '22222222@lid')
  assert.equal(cache.size, 1)
})

test('WebJS gateway resolves recipient before creating outbound send context', async () => {
  const { readFileSync } = await import('node:fs')
  const gateway = readFileSync(new URL('./whatsapp-browser-qr-bridge.mjs', import.meta.url), 'utf8')
  const first = gateway.indexOf('const resolved = await resolveWhatsAppSendAddress(session.client, chatId')
  const second = gateway.indexOf('const context = registerOutboundSendContext(session, {', first)
  const third = gateway.indexOf('session.client.sendMessage(chatId', second)
  assert.ok(first > 0 && second > first && third > second)
  assert.ok(gateway.includes("session.resolvedSendIds?.delete(requestedChatId)"))
  assert.ok(gateway.includes("human.code = 'WHATSAPP_LID_UNRESOLVED'"))
  assert.ok(!gateway.includes('await session.client.sendMessage(chatId, String(body), sendOptions)\n      } catch'))
})
