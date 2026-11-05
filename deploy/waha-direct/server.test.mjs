import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const serverFile=fileURLToPath(new URL('./server.mjs',import.meta.url))
const WAHA_PORT=4385, BRIDGE_PORT=4391
const home=fs.mkdtempSync(path.join(os.tmpdir(),'realtalent-waha-qa-'))
let count=0
const fakeWaha=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost')
  let reply={}
  if(req.headers['x-api-key']!=='test-waha-key'){res.writeHead(401);res.end();return}
  if(url.pathname==='/api/sessions/realtalent')reply={status:'WORKING'}
  else if(url.pathname==='/api/realtalent/chats/overview')reply=[{id:'12345678901@lid',name:'Contato teste',lastMessage:{body:'Olá',timestamp:1793890000}}]
  else if(url.pathname==='/api/contacts/check-exists')reply={numberExists:true,chatId:'12345678901@lid'}
  else if(url.pathname==='/api/realtalent/chats/12345678901%40lid/messages')reply=[{id:'msg1',body:'Olá',timestamp:1793890000}]
  else if(url.pathname==='/api/sendText'){count++;reply={id:'test-message-id'}}
  else {res.writeHead(404);res.end();return}
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(reply))
})

test('WAHA local bridge: authentication, conversations, resolve, send without duplication', {timeout:20000}, async ()=>{
  await new Promise(resolve=>fakeWaha.listen(WAHA_PORT,'127.0.0.1',resolve))
  const child=spawn(process.execPath,[serverFile],{env:{...process.env,HOME:home,WAHA_API_KEY:'test-waha-key',WAHA_SESSION:'realtalent',REALTALENT_WAHA_BRIDGE_PORT:String(BRIDGE_PORT)},stdio:'ignore'})
  try{
    const base='http://127.0.0.1:'+BRIDGE_PORT
    let ready=false
    for(let i=0;i<60;i++){
      try{const r=await fetch(base+'/health');if(r.ok){ready=true;break}}catch{}
      await new Promise(resolve=>setTimeout(resolve,100))
    }
    assert.equal(ready,true,'bridge started')
    const token=fs.readFileSync(path.join(home,'.local/share/realtalent-waha-direct/access-token'),'utf8').trim()
    const headers={Authorization:'Bearer '+token}
    assert.equal((await fetch(base+'/v1/session')).status,401)
    assert.equal((await fetch(base+'/v1/session',{headers:{...headers,Origin:'https://malicious.invalid'}})).status,403)
    const pre=await fetch(base+'/v1/session',{headers:{...headers,Origin:'https://crm-real-talent.vercel.app'}})
    assert.equal(pre.status,200)
    assert.equal(pre.headers.get('access-control-allow-origin'),'https://crm-real-talent.vercel.app')
    assert.equal((await pre.json()).status,'WORKING')
    const chats=await (await fetch(base+'/v1/chats',{headers})).json()
    assert.equal(chats[0].id,'12345678901@lid')
    const checked=await (await fetch(base+'/v1/resolve?phone=5551999999999',{headers})).json()
    assert.equal(checked.chatId,'12345678901@lid')
    const id='00000000-0000-4000-a000-000000000001'
    const payload={chatId:checked.chatId,text:'Mensagem autorizada de teste',idempotencyKey:id}
    const opts={method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(payload)}
    const sent=await fetch(base+'/v1/send',opts)
    assert.equal(sent.status,200)
    assert.equal((await sent.json()).accepted,true)
    assert.equal((await fetch(base+'/v1/send',opts)).status,409)
    assert.equal(count,1)
    assert.equal((await fetch(base+'/v1/send',{...opts,body:JSON.stringify({...payload,chatId:'evil@localhost',idempotencyKey:'00000000-0000-4000-a000-000000000002'})})).status,400)
  }finally{
    child.kill('SIGTERM')
    await new Promise(resolve=>fakeWaha.close(resolve))
    fs.rmSync(home,{recursive:true,force:true})
  }
})
