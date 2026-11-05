import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const root = fs.readFileSync('scripts/whatsapp-browser-qr-bridge.mjs','utf8')
const hostedPath='runtime-host/RealTalent-CRM-V101.11.3-CR10-H1-Agent-V3.1.2-Linux-Launcher/scripts/'
const hosted=fs.readFileSync(hostedPath+'whatsapp-browser-qr-bridge.mjs','utf8')
const gateway=fs.readFileSync(hostedPath+'realtalent-communications-gateway.mjs','utf8')
const gatewayRoot=fs.readFileSync('scripts/realtalent-communications-gateway.mjs','utf8')
const supervisor=fs.readFileSync('runtime-host/deploy/cloud-runtime/cloud-runtime-supervisor.mjs','utf8')
const adapter=fs.readFileSync('runtime-host/deploy/cloud-runtime/task-reminder-qr-bridge.mjs','utf8')

test('Puppeteer detached frame handled only for a single live WhatsApp session',()=>{
  assert.equal(hosted,root)
  assert.equal(gateway,gatewayRoot)
  assert.match(hosted,/function recoverDetachedFrame\(error\)/)
  assert.match(hosted,/candidates\.length !== 1/)
  assert.match(hosted,/session\.reconnectTimer\) return true/)
  assert.match(hosted,/scheduleReconnect\(session, 'página Chromium reiniciada'\)/)
  assert.match(hosted,/recoverDetachedFrame, shutdown/)
  assert.match(hosted,/async function destroySession\(session, \{ logout = false \} = \{\}/)
  assert.doesNotMatch(hosted,/recoverDetachedFrame[\s\S]{0,1800}client\.logout\(\)/)
})

test('Known asynchronous Puppeteer rejection is recovered without hiding other errors',()=>{
  assert.match(gateway,/process\.on\('unhandledRejection', error => \{/)
  assert.match(gateway,/if \(recoverDetachedFrame\(error\)\)/)
  assert.match(gateway,/fatal\('Promise rejeitada sem tratamento', error\)/)
  assert.match(gateway,/process\.on\('uncaughtException', error => fatal/)
  assert.doesNotMatch(gateway,/process\.on\('uncaughtException', error => console\.warn/)
})

test('Railway restarts Communications alone with backoff; does not cycle Agent or Garimpo',()=>{
  assert.match(supervisor,/if\(name==='communications'\)\{/)
  assert.match(supervisor,/Math\.min\(60_000,Math\.pow\(2,Math\.min\(consecutive,5\)\)\*1_000\)/)
  assert.match(supervisor,/if\(!shuttingDown\)launch\(name,cmd,args,extra\)/)
  assert.match(supervisor,/for\(const timer of restartTimers\)clearTimeout\(timer\)/)
  assert.match(supervisor,/launch\('agent'/)
  assert.match(supervisor,/launch\('prospecting'/)
  assert.match(supervisor,/launch\('communications'/)
  assert.match(supervisor,/pathname === '\/internal\/task-reminders\/qr'/)
  assert.match(adapter,/taskBridgeAuthorized/)
})

test('Supervisor does not remove persistent WhatsApp credentials, session or store',()=>{
  assert.match(supervisor,/REALTALENT_COMMUNICATIONS_STORE:path\.join\(DATA,'communications','store\.json'\)/)
  assert.match(supervisor,/REALTALENT_COMMUNICATIONS_MEDIA_DIR:path\.join\(DATA,'communications','media'\)/)
  assert.doesNotMatch(supervisor,/rmSync|rm -rf|unlinkSync/)
  assert.doesNotMatch(hosted,/recoverDetachedFrame[\s\S]{0,1400}rmSync/)
})
