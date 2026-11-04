import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const read=(p)=>readFileSync(p,'utf8')
const gateway=read('scripts/realtalent-communications-gateway.mjs')
const railwayGateway=read('runtime-host/RealTalent-CRM-V101.11.3-CR10-H1-Agent-V3.1.2-Linux-Launcher/scripts/realtalent-communications-gateway.mjs')
const proxy=read('api/runtime/_proxy.mjs')
const transport=read('src/services/local-communications-gateway.ts')
const panel=read('src/features/communications/whatsapp-chat-panel.tsx')
const store=read('scripts/communications-store-utils.mjs')

test('new QR send accepted before slow whatsapp-web.js execution',()=>{
  assert.match(gateway,/async function acceptQrSend\(/)
  assert.match(gateway,/saveStore\(snapshot\)[\s\S]*?void \(async \(\) =>/)
  assert.match(gateway,/return json\(res,202,\{event:accepted,accepted:true\}\)/)
  assert.match(gateway,/sendAttemptInProgress:\s*true/)
  assert.match(gateway,/idempotencyEvent\(s,b\); if\(existing\)/)
})

test('server persists completion and never performs ambiguous auto re-send',()=>{
  assert.match(gateway,/sendAttemptInProgress:false,sendUncertain:false,lastSendError:null/)
  assert.match(gateway,/if\(!mayAutoRetryQueuedQrEvent\(event\)&&event\.metadata\?\.manualRetryRequested!==true\)/)
  assert.match(gateway,/retrySafety:'requires_review',sendUncertain:true/)
  assert.match(gateway,/Legacy timed-out/i)
  assert.match(store,/request:\$\{idempotency\}/)
})

test('cloud revision endpoint is tenant protected, and sync no longer blocks QR',()=>{
  assert.match(gateway,/u\.pathname==='\/api\/communications\/revision'/)
  assert.match(gateway,/workspaceCommunicationsRevision\(s\.events,workspaceId\)/)
  assert.match(proxy,/\/api\/communications\/revision/)
  assert.match(gateway,/if\(a\.metadata\?\.transport==='qr'\)[\s\S]*?triggered\.push\(a\.id\)[\s\S]*?void \(async\(\)=>/)
})

test('hosted browser listens to all-message revision and refreshes on focus',()=>{
  assert.match(transport,/\/api\/communications\/revision\?workspaceId=/)
  assert.match(transport,/String\(payload\.revision \|\| ''\)/)
  assert.match(transport,/window\.addEventListener\('focus', onVisible\)/)
  assert.match(transport,/window\.setInterval\([\s\S]*?, 3000\)/)
  assert.ok(!transport.includes('/api/communications/events?workspaceId=${encodeURIComponent(workspaceId)}&limit=1'))
})

test('Railway runtime copy implements the same QR live protocol without modifying Agent',()=>{
  for(const key of [
    'async function acceptQrSend(','workspaceCommunicationsRevision(s.events,workspaceId)',
    'sendAttemptInProgress: true','return json(res,202,{event:accepted,accepted:true})',
    'mayAutoRetryQueuedQrEvent(event)','WHATSAPP_LIVE_FIX_VERSION',
    'syncAccount(current,account,{background:true})',
  ]) assert.ok(railwayGateway.includes(key),'Runtime Railway ausente: '+key)
  assert.match(railwayGateway,/return json\(res,202,\{event:accepted,accepted:true\}\)/)
})

test('visual status and manual protection for uncertain delivery',()=>{
  assert.match(panel,/metadata\?\.sendAttemptInProgress/)
  assert.match(panel,/metadata\?\.sendUncertain/)
  assert.match(panel,/window\.confirm\('O WhatsApp não confirmou esta mensagem/)
  for(const [name,src,kind] of [['transport.ts',transport,ts.ScriptKind.TS],['panel.tsx',panel,ts.ScriptKind.TSX]]){
    const parsed=ts.createSourceFile(name,src,ts.ScriptTarget.Latest,true,kind)
    assert.equal(parsed.parseDiagnostics.length,0,`${name} inválido`)
  }
})
