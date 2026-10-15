import http from 'node:http'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const runtimeDir = path.dirname(new URL(import.meta.url).pathname)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'rt-v15-workbench-'))
const state = path.join(tmp,'state'), config=path.join(tmp,'config'), cache=path.join(tmp,'cache')
fs.mkdirSync(state,{recursive:true});fs.mkdirSync(config,{recursive:true});fs.mkdirSync(cache,{recursive:true})
const ollamaPort=18914, gatewayPort=18891
const model='rt-v15-test-model'
const mock=http.createServer(async(req,res)=>{
  if(req.url==='/api/tags'){res.setHeader('content-type','application/json');res.end(JSON.stringify({models:[{name:model,model}]}));return}
  if(req.url==='/api/chat'&&req.method==='POST'){
    let body='';for await(const c of req)body+=c;const payload=JSON.parse(body||'{}')
    res.setHeader('content-type','application/x-ndjson')
    if(payload.stream){for(const part of ['REALTALENT ','STREAMING ','LOCAL ','OK'])res.write(JSON.stringify({message:{content:part},done:false})+'\n');res.end(JSON.stringify({message:{content:''},done:true})+'\n');return}
    res.end(JSON.stringify({message:{content:JSON.stringify({mode:'ASK',message:'REALTALENT BUFFERED OK',summary:'ok',action:null,suggested_prompts:[]})}}));return
  }
  res.statusCode=404;res.end('{}')
})
await new Promise(r=>mock.listen(ollamaPort,'127.0.0.1',r))
const env={...process.env,REALTALENT_AGENT_PORT:String(gatewayPort),REALTALENT_AGENT_HOST:'127.0.0.1',REALTALENT_AI_PROVIDER:'ollama',OLLAMA_URL:`http://127.0.0.1:${ollamaPort}`,OLLAMA_MODEL:model,OLLAMA_FAST_MODEL:model,OLLAMA_CODER_MODEL:model,OLLAMA_REASONING_MODEL:model,XDG_STATE_HOME:state,XDG_CONFIG_HOME:config,XDG_CACHE_HOME:cache,HOME:tmp}
const child=spawn(process.execPath,['gateway.mjs'],{cwd:runtimeDir,env,stdio:['ignore','pipe','pipe']})
let logs='';child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c)
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function wait(){for(let i=0;i<80;i++){try{const r=await fetch(`http://127.0.0.1:${gatewayPort}/health`);if(r.ok)return await r.json()}catch{}await sleep(80)}throw new Error('gateway não iniciou\n'+logs)}
let checks=0
try{
  const health=await wait();assert.equal(health.version,'3.1');assert.equal(health.architecture,'realtalent-intelligence-platform-v3');assert.equal(health.conversationalWorkbench.streaming,true);checks++
  const html=await (await fetch(`http://127.0.0.1:${gatewayPort}/chat`)).text();assert.match(html,/IA local · V3\.1/);assert.match(html,/Trabalhe nisso/);assert.match(html,/Capturar tela/);checks++
  const created=await (await fetch(`http://127.0.0.1:${gatewayPort}/chat/conversations`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({productScope:'crm'})})).json();assert.ok(created.conversation.id);checks++
  const r=await fetch(`http://127.0.0.1:${gatewayPort}/chat/conversations/${encodeURIComponent(created.conversation.id)}/messages/stream`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'Diga uma frase curta sobre organização de clientes.',product:'crm',mode:'ask'})});assert.equal(r.status,200);const text=await r.text();const events=text.trim().split('\n').map(x=>JSON.parse(x));const deltas=events.filter(x=>x.type==='delta');assert.ok(deltas.length>=3);assert.equal(deltas.map(x=>x.delta).join('').trim(),'REALTALENT STREAMING LOCAL OK');assert.ok(events.some(x=>x.type==='done'&&x.streamMode==='native'));checks++
  const statePayload=await (await fetch(`http://127.0.0.1:${gatewayPort}/chat/state?conversation_id=${encodeURIComponent(created.conversation.id)}`)).json();assert.equal(statePayload.workbench.streaming,true);assert.ok(statePayload.memory?.summary?.includes('Diga uma frase curta'));checks++
  const store=JSON.parse(fs.readFileSync(path.join(state,'realtalent-agent','conversations.json'),'utf8'));assert.equal(store.conversations.length,1);assert.ok(store.conversations[0].memory?.goals?.length);checks++
  console.log(`RealTalent Agent V1.6 Conversational Workbench self-test: ${checks}/6 PASS`)
} finally {child.kill('SIGTERM');mock.close();await sleep(80);fs.rmSync(tmp,{recursive:true,force:true})}
