import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { patchWhatsAppWebSocketReadinessSource, SOCKET_READINESS_MARKER } from './whatsapp-web-socket-readiness-hotfix.mjs'
const hosted='runtime-host/RealTalent-CRM-V101.11.3-CR10-H1-Agent-V3.1.2-Linux-Launcher/scripts/'

const upstream=fs.readFileSync('scripts/whatsapp-browser-qr-bridge.mjs','utf8')
const rootHelper=fs.readFileSync('scripts/whatsapp-web-socket-readiness-hotfix.mjs','utf8')
const template=`async inject() {
  let start = Date.now()
  if (start < 0) throw new Error('fake')
        await this.pupPage.evaluate(ExposeAuthStore);

        const needAuthentication = await this.pupPage.evaluate(async () => {
            let state = window.require('WAWebSocketModel').Socket.state;
            return state === 'UNPAIRED';
        });
}`

test('vendor Client.js patch waits for Socket before injecting authentication store',()=>{
  const p=patchWhatsAppWebSocketReadinessSource(template)
  assert.equal(p.changed,true)
  assert.equal(p.state,'patched')
  assert.match(p.source,/this\.pupPage\.waitForFunction/)
  assert.match(p.source,/WAWebSocketModel/)
  assert.match(p.source,/socket\?\.state/)
  assert.match(p.source,/authTimeoutMs/)
  assert.ok(p.source.indexOf(SOCKET_READINESS_MARKER) < p.source.indexOf('await this.pupPage.evaluate(ExposeAuthStore)'))
  assert.equal(p.source.match(/await this.pupPage\.evaluate\(ExposeAuthStore\)/g)?.length,1)
  assert.equal(p.source.match(/const needAuthentication =/g)?.length,1)
})
test('patch is idempotent and does not modify unknown versions',()=>{
  const first=patchWhatsAppWebSocketReadinessSource(template)
  assert.deepEqual(patchWhatsAppWebSocketReadinessSource(first.source),{source:first.source,changed:false,state:'already-patched'})
  assert.throws(()=>patchWhatsAppWebSocketReadinessSource('old or unrelated library'),/não corresponde/)
})
test('root and Railway implementations stay exactly identical',()=>{
  assert.equal(fs.readFileSync(hosted+'whatsapp-web-socket-readiness-hotfix.mjs','utf8'),rootHelper)
  assert.equal(fs.readFileSync(hosted+'whatsapp-browser-qr-bridge.mjs','utf8'),upstream)
})
test('readiness patch is invoked before loading whatsapp-web.js',()=>{
  assert.ok(upstream.indexOf('applyWhatsAppWebSocketReadinessHotfix()') < upstream.indexOf("importCommunicationsPackage('whatsapp-web.js')"))
  assert.match(upstream,/new LocalAuth\(\{ clientId, dataPath: authRoot, rmMaxRetries: 6 \}\)/)
  assert.match(upstream,/qrMaxRetries: 8/)
  assert.match(upstream,/recoverDetachedFrame/)
  assert.match(upstream,/recoverStaleChromiumProfileLock/)
  assert.doesNotMatch(rootHelper,/logout\(\)|rmSync\(|rmdirSync\(|removeSession/)
})
