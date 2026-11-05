import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { handleTaskReminderQrBridge, taskBridgeAuthorized, taskReminderMessage, validateTaskReminder } from '../runtime-host/deploy/cloud-runtime/task-reminder-qr-bridge.mjs'

const TOKEN='test-only-strong-private-bridge-token-123456789'
const RUNTIME_TOKEN='test-only-runtime-token-123456789'
const base={ workspaceId:'839f852a-fdbc-4dd3-8f9e-020a238605f3',jobId:'8346d109-6f58-4d1a-8711-9edb960c9d7a',phone:'+5551999999999',title:'Verificar proposta',dueAt:null,eventType:'assigned' }

const execute=async ({ input=base, token=TOKEN, method='POST', headers={}, gateway }={})=>{
  const req=Readable.from([Buffer.from(JSON.stringify(input))])
  req.method=method
  req.headers={'x-realtalent-task-bridge-token':token, ...headers}
  let status,output
  const res={writeHead(code){status=code},end(str){output=JSON.parse(str)}}
  await handleTaskReminderQrBridge(req,res,{token:TOKEN,runtimeToken:RUNTIME_TOKEN,appUrl:'https://crm-real-talent.vercel.app',requestGateway:gateway|| (async()=>{throw Error('gateway must be mocked')})})
  return {status,output}
}
test('secret comparison uses timing safe exact tokens; no anonymous sends',async()=>{
  assert.equal(taskBridgeAuthorized(TOKEN,TOKEN),true)
  assert.equal(taskBridgeAuthorized(TOKEN.slice(0,-1)+'X',TOKEN),false)
  assert.equal(taskBridgeAuthorized(TOKEN,'short'),false)
  const r=await execute({token:'wrong'})
  assert.equal(r.status,401)
})
test('only valid task job, workspace, recipient and reminder event are accepted',()=>{
  assert.deepEqual(validateTaskReminder(base),base)
  for(const overrides of [{phone:'51999999999'},{phone:'@g.us'},{workspaceId:'wrong'},{jobId:'bad'},{eventType:'blast'},{title:'x'.repeat(121)}]) {
    assert.throws(()=>validateTaskReminder({...base,...overrides}),/invalid_request/)
  }
})
test('connection missing: never call send, never claim delivery',async()=>{
  const visited=[]
  const r=await execute({gateway:async(path)=>{visited.push(path);return path.includes('accounts')
    ?{status:200,payload:{accounts:[{id:'qr-1',provider:'whatsapp_cloud',status:'connected',metadata:{transport:'qr'}}]}}
    :{status:200,payload:{state:'disconnected'}}}})
  assert.equal(r.status,409)
  assert.equal(r.output.reason,'qr_session_not_connected')
  assert.equal(visited.length,2)
})
test('connected QR uses stable job-based idempotency and reports gateway acceptance only',async()=>{
  let captured
  const gateway=async(path,opts)=>{
    if(path.startsWith('/api/integrations/accounts')) return {status:200,payload:{accounts:[{id:'qr-1',provider:'whatsapp_cloud',status:'connected',metadata:{transport:'qr'}}]}}
    if(path.startsWith('/api/integrations/whatsapp/qr/status')) return {status:200,payload:{state:'connected'}}
    captured={path,opts}
    return {status:202,payload:{accepted:true,event:{id:'gateway-event',status:'queued'}}}
  }
  const r=await execute({gateway})
  assert.equal(r.status,202)
  assert.deepEqual(r.output,{ok:true,state:'accepted_by_gateway',deliveryConfirmed:false,gatewayEventId:'gateway-event',idempotent:false})
  assert.equal(captured.path,'/api/communications/send')
  assert.equal(captured.opts.body.idempotencyKey,'task-reminder-qr:'+base.jobId)
  assert.equal(captured.opts.body.recipient,base.phone)
  assert.equal(captured.opts.body.workspaceId,base.workspaceId)
  assert.equal(captured.opts.body.accountId,'qr-1')
  assert.ok(captured.opts.body.body.includes('Verificar proposta'))
})
test('gateway exceptions never return misleading successful delivery state',async()=>{
  const r=await execute({gateway:async()=>{throw new Error('server timeout')}})
  assert.equal(r.status,503)
  assert.equal(r.output.reason,'delivery_outcome_unknown_requires_review')
})
test('message includes only a safe CRM link, never a manually provided URL',()=>{
  const input=validateTaskReminder(base)
  assert.match(taskReminderMessage(input,'https://crm-real-talent.vercel.app'),/https:\/\/crm-real-talent.vercel.app\/tasks/)
  assert.doesNotMatch(taskReminderMessage(input,'http://evil.invalid'),/evil.invalid/)
})
test('supervisor route is outside general proxy and requires separate secret',async()=>{
  const fs=await import('node:fs')
  const src=fs.readFileSync('runtime-host/deploy/cloud-runtime/cloud-runtime-supervisor.mjs','utf8')
  assert.match(src,/pathname === '\/internal\/task-reminders\/qr'/)
  assert.ok(src.indexOf("pathname === '/internal/task-reminders/qr'")<src.indexOf('for(const svc of Object.values(services)) if(pathname'))
  assert.doesNotMatch(src,/REALTALENT_TASK_REMINDER_BRIDGE_TOKEN.*console\.log/)
})
