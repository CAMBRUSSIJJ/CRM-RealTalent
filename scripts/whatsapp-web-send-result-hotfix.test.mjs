import test from 'node:test'
import assert from 'node:assert/strict'
import { Script } from 'node:vm'
import { patchWhatsAppWebSendResultSource, REALTALENT_SEND_ID_HOTFIX_MARKER } from './whatsapp-web-send-result-hotfix.mjs'

const vendorFragment = `
async function sendMsg(window, newMsgKey) {
  return window
    .require('WAWebCollections')
    .Msg.get(newMsgKey._serialized);
}`

test('patches the 1.34.7 vendor return without sending another message', () => {
  const patched = patchWhatsAppWebSendResultSource(vendorFragment)
  assert.equal(patched.state, 'patched')
  assert.equal(patched.changed, true)
  assert.ok(patched.source.includes(REALTALENT_SEND_ID_HOTFIX_MARKER))
  assert.ok(patched.source.includes('.Msg.get(newMsgKey._serialized || newMsgKey.$1);'))
  assert.ok(!patched.source.includes('sendMessage('))
  new Script(patched.source) // validates syntax after inserting comment and fallback
})

test('the returned message is looked up by the actual WhatsApp key, never a synthetic ID', async () => {
  const patched = patchWhatsAppWebSendResultSource(vendorFragment)
  const send = new Script(`(function(){${patched.source}; return sendMsg; })()`).runInNewContext()
  let readKey = ''
  const window = { require: () => ({ Msg: { get: key => { readKey = key; return { id: key } } } }) }
  assert.equal((await send(window, { _serialized: 'existing-old-key', $1: 'new-key' })).id, 'existing-old-key')
  assert.equal(readKey, 'existing-old-key')
  assert.equal((await send(window, { $1: 'new-wa-key' })).id, 'new-wa-key')
  assert.equal(readKey, 'new-wa-key')
})

test('does not pretend success when WhatsApp provides neither _serialized nor $1', async () => {
  const patched = patchWhatsAppWebSendResultSource(vendorFragment)
  const send = new Script(`(function(){${patched.source}; return sendMsg; })()`).runInNewContext()
  const window = { require: () => ({ Msg: { get: () => undefined } }) }
  assert.equal(await send(window, {}), undefined)
})

test('patch is idempotent and recognises equivalent upstream fixes', () => {
  const initial = patchWhatsAppWebSendResultSource(vendorFragment)
  const repeated = patchWhatsAppWebSendResultSource(initial.source)
  assert.equal(repeated.changed, false)
  assert.equal(repeated.state, 'already-patched')
  assert.equal(repeated.source, initial.source)
  const fixedVendor = vendorFragment.replace('newMsgKey._serialized', 'newMsgKey._serialized || newMsgKey.$1')
  const upstream = patchWhatsAppWebSendResultSource(fixedVendor)
  assert.equal(upstream.changed, false)
  assert.equal(upstream.state, 'upstream-fixed')
})

test('refuses to mutate incompatible vendor code instead of corrupting installed library', () => {
  assert.throws(() => patchWhatsAppWebSendResultSource('const wrongVendorSource = true'), /Estrutura|localizada|inesperada|biblioteca/i)
})

test('gateway applies the send-result fix before importing WhatsApp Web', async () => {
  const { readFileSync } = await import('node:fs')
  const code = readFileSync(new URL('./whatsapp-browser-qr-bridge.mjs', import.meta.url), 'utf8')
  const patchIndex = code.indexOf('const sendResultHotfix = applyWhatsAppWebSendResultHotfix()')
  const importIndex = code.indexOf("const mod = await importCommunicationsPackage('whatsapp-web.js')")
  assert.ok(patchIndex > 0 && importIndex > patchIndex)
  assert.ok(code.includes("throw new Error('WhatsApp Web não confirmou o envio com um ID de mensagem."))
  assert.ok(!code.includes('return { id: externalMessageId || uuid(), threadId: chatId }'))
})

test('Linux launcher must not silently reuse a stale gateway from before the send fix', async () => {
  const { readFileSync } = await import('node:fs')
  const start = readFileSync(new URL('./start.mjs', import.meta.url), 'utf8')
  const gateway = readFileSync(new URL('./realtalent-communications-gateway.mjs', import.meta.url), 'utf8')
  const expected = start.match(/const COMM_EXPECTED_SEND_REVISION = '([^']+)'/)?.[1]
  const actual = gateway.match(/const WHATSAPP_SEND_RETURN_REVISION = '([^']+)'/)?.[1]
  assert.ok(expected && actual, 'a versão de envio deve estar declarada em ambos os runtimes')
  assert.equal(expected, actual, 'o launcher deve exigir a mesma correção oferecida pelo gateway')
  assert.notEqual(actual, 'msgkey-dollar1-20261102', 'o novo runtime não pode reutilizar o gateway antigo')
  assert.ok(gateway.includes('whatsappSendReturnRevision:WHATSAPP_SEND_RETURN_REVISION'))
  assert.ok(start.includes('existing.data?.whatsappSendReturnRevision === COMM_EXPECTED_SEND_REVISION'))
  assert.ok(start.includes('stopStaleCommunicationsProcesses({'))
})
