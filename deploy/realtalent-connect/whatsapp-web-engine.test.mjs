import test from 'node:test'
import assert from 'node:assert/strict'
import { createWhatsAppWebEngine } from './whatsapp-web-engine.mjs'

const organization = '00000000-0000-4000-8000-000000000001'
const qr = 'data:image/png;base64,iVBORw0KGgoAAAAA'

class FakeLocalAuth {
  constructor(options) { this.options = options }
}
class FakeClient {
  static instances = []
  constructor(options) {
    this.options = options
    this.handlers = new Map()
    this.destroyed = 0
    this.sent = null
    FakeClient.instances.push(this)
  }
  on(name, handler) {
    this.handlers.set(name, [...(this.handlers.get(name) || []), handler])
    return this
  }
  emit(name, ...args) {
    for (const handler of this.handlers.get(name) || []) void handler(...args)
  }
  async initialize() { this.emit('qr', 'secure-qr-token') }
  async getNumberId(number) { return { _serialized: number + '@c.us' } }
  async sendMessage(address, message) {
    this.sent = { address, message }
    return { id: { _serialized: 'message-123' } }
  }
  async destroy() { this.destroyed++ }
}
const waitForEvent = () => new Promise(resolve => setTimeout(resolve, 10))
const newEngine = (messages = []) => createWhatsAppWebEngine({
  packageDir: '/nonexistent/mock-runtime',
  authDir: '/tmp/realtalent-test-wa-session',
  onQr: value => messages.push(value),
  loader: () => ({ Client: FakeClient, LocalAuth: FakeLocalAuth,
    QRCode: { toDataURL: async () => qr } }),
})

test('no whatsapp-web.js dependency is loaded when using the injected mock', async () => {
  assert.ok(newEngine())
})
test('native QR event is rendered locally and visible to the connector', async () => {
  const codes = []
  const engine = newEngine(codes)
  await engine.start(organization)
  await waitForEvent()
  assert.equal(engine.status().state, 'connecting')
  assert.equal(engine.status().qr, qr)
  assert.ok(codes.includes(qr))
  await engine.stop()
})
test('ready event maps to cloud open and enables verified text routing', async () => {
  const engine = newEngine()
  await engine.start(organization)
  const client = FakeClient.instances.at(-1)
  client.emit('ready')
  assert.equal(engine.status().state, 'open')
  assert.equal(engine.status().qr, null)
  assert.equal(await engine.sendText('invalid', 'Do not send'), null)
  assert.equal(await engine.sendText('+5551999999999', 'Tarefa atribuída'), 'message-123')
  assert.equal(client.sent.address, '5551999999999@c.us')
  await engine.stop()
})
test('restart destroys browser but does not logout or delete LocalAuth session', async () => {
  const engine = newEngine()
  await engine.start(organization)
  const first = FakeClient.instances.at(-1)
  await engine.restart()
  const second = FakeClient.instances.at(-1)
  assert.notEqual(second, first)
  assert.equal(first.destroyed, 1)
  assert.equal(second.options.authStrategy.options.dataPath,
    first.options.authStrategy.options.dataPath)
  assert.equal(typeof first.logout, 'undefined')
  await engine.stop()
})
