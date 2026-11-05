import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const root=fs.readFileSync('scripts/whatsapp-browser-qr-bridge.mjs','utf8')
const hosted=fs.readFileSync('runtime-host/RealTalent-CRM-V101.11.3-CR10-H1-Agent-V3.1.2-Linux-Launcher/scripts/whatsapp-browser-qr-bridge.mjs','utf8')

test('root and Railway runtime must have identical WhatsApp QR bridge',()=>{
  assert.equal(root,hosted)
})

test('do not trigger optional device-label customization that requires WAWebMiscBrowserUtils.info',()=>{
  const constructor=hosted.slice(hosted.indexOf('const client = new Client({'),hosted.indexOf('session.client = client'))
  assert.ok(constructor.includes('new LocalAuth('))
  assert.ok(constructor.includes('qrMaxRetries: 8'))
  const optionsOnly = constructor.split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n')
  assert.doesNotMatch(optionsOnly, /deviceName\s*:/)
  assert.doesNotMatch(optionsOnly, /browserName\s*:/)
})

test('preserve authentication profile and recovery behavior while removing device labels',()=>{
  assert.match(hosted,/dataPath: authRoot/)
  assert.match(hosted,/recoverStaleChromiumProfileLock/)
  assert.match(hosted,/recoverDetachedFrame/)
  assert.match(hosted,/QR_EXPIRED_MESSAGE/)
  assert.doesNotMatch(hosted,/rmSync\(authRoot/)
})
