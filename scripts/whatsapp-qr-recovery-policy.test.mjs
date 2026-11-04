import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { QR_EXPIRED_MESSAGE, isQrExpiredDisconnect } from './whatsapp-qr-recovery-policy.mjs'

const read = (name) => readFileSync(name, 'utf8')
const bridge = read('scripts/whatsapp-browser-qr-bridge.mjs')
const hosted = read('runtime-host/RealTalent-CRM-V101.11.3-CR10-H1-Agent-V3.1.2-Linux-Launcher/scripts/whatsapp-browser-qr-bridge.mjs')
const settings = read('src/features/settings/whatsapp-integration-panel.tsx')
const connection = read('src/features/communications/whatsapp-connection-center.tsx')
const qa = read('deploy/whatsapp-qr-qa/qa-supervisor.mjs')

test('expired unscanned pairing is classified, not confused with network and auth errors', () => {
  assert.equal(isQrExpiredDisconnect('Max qrcode retries reached'), true)
  assert.equal(isQrExpiredDisconnect('Max QR code retries reached'), true)
  assert.equal(isQrExpiredDisconnect('QR_CODE_EXPIRED'), true)
  assert.equal(isQrExpiredDisconnect('Connection closed'), false)
  assert.equal(isQrExpiredDisconnect('Auth failure'), false)
  assert.match(QR_EXPIRED_MESSAGE, /Gerar novo QR Code/)
})

test('both WhatsApp browser bundles handle QR expiry without reconnect loop', () => {
  assert.equal(bridge, hosted)
  assert.match(bridge, /if \(!qrExpired\) scheduleReconnect\(session, detail\)/)
  assert.match(bridge, /if \(!qrExpired\) scheduleReconnect\(session, 'falha ao inicializar'\)/)
  assert.match(bridge, /session\.qrDataUrl = null/)
  assert.match(bridge, /const qrExpired = isQrExpiredDisconnect\(/)
  assert.match(bridge, /session\.manualDisconnect = true \/\/ Suppress disconnect/)
})

test('explicit QR retry resets reconnect counter and ignores stale browser events', () => {
  assert.match(bridge, /start\(session\.workspaceId, session\.displayName, \{ autoReconnect: true \}\)/)
  assert.match(bridge, /options\.autoReconnect === true \? Number\(prior\?\.reconnectAttempts \|\| 0\) : 0/)
  assert.match(bridge, /if \(get\(workspaceId\) !== session \|\| session\.manualDisconnect\) return/)
  assert.match(bridge, /const pendingStarts = new Map\(\)/)
})

test('both CRM screens explain expiry and offer a deliberate new QR', () => {
  for (const src of [settings, connection]) {
    assert.match(src, /QR Code expirado/)
    assert.match(src, /Gerar novo QR Code/)
    assert.match(src, /qrExpired/)
  }
  assert.match(settings, /setShowQr\(false\)/)
})

test('QA browser reenables retry after expiry and checks realtime revision', () => {
  assert.match(qa, /x\.state==='disconnected'/)
  assert.match(qa, /btn\.textContent='Gerar novo QR Code'/)
  assert.match(qa, /revisionHttpStatus:revision\.status/)
  assert.ok(!qa.includes("'POST /api/communications/send'"))
})
