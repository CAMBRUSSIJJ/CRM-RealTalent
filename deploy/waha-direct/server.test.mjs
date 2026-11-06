import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const serverFile=fileURLToPath(new URL('./server.mjs',import.meta.url))
const WAHA_PORT=4385, BRIDGE_PORT=4391, OLLAMA_PORT=11434
const home=fs.mkdtempSync(path.join(os.tmpdir(),'realtalent-waha-qa-'))
let count=0, aiCalls=0
const fakeWaha=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost')
  let reply={}
  if(req.headers['x-api-key']!=='test-waha-key'){res.writeHead(401);res.end();return}
  if(url.pathname==='/api/sessions/realtalent')reply={status:'WORKING'}
  else if(url.pathname==='/api/realtalent/chats/overview')reply=[{id:'12345678901@lid',name:'Contato teste',lastMessage:{body:'Olá',timestamp:1793890000}}]
  else if(url.pathname==='/api/contacts/check-exists')reply={numberExists:true,chatId:'12345678901@lid'}
  else if(url.pathname==='/api/contacts'){
    const id=url.searchParams.get('contactId')
    reply={id,pushname:id==='112233445566@lid'?'Cliente do grupo':''}
  }
  else if(url.pathname==='/api/realtalent/chats/987654321%40g.us/messages')reply=[
    {id:'group-msg1',from:'987654321@g.us',participant:'112233445566@lid',fromMe:false,body:'Preciso de uma proposta',timestamp:1793890001},
    {id:'group-msg2',from:'987654321@g.us',participant:'112233445566@lid',fromMe:false,body:'Por favor',timestamp:1793890002},
  ]
  else if(url.pathname==='/api/realtalent/chats/12345678901%40lid/messages')reply=[{
    id:'msg001',body:'Precisamos de treinamento, mas orçamento é limitado.',
    fromMe:false,timestamp:1793890000,
    ...(url.searchParams.get('limit')==='50'?{hasMedia:true,media:{
      mimetype:'audio/ogg',url:'http://localhost:3000/api/files/true_12345678901@lid_voice.ogg'
    }}:{})
  }]
  else if(url.pathname==='/api/realtalent/chats/12345678901%40lid/messages/msg001'){
    reply={id:'msg001',hasMedia:true,media:{
      mimetype:'audio/ogg',url:'http://localhost:3000/api/files/true_12345678901@lid_voice.ogg'
    }}
  }
  else if(url.pathname==='/api/realtalent/chats/12345678901%40lid/messages/msg002'){
    reply={id:'msg002',hasMedia:true,media:{mimetype:'image/jpeg',url:null,error:'not downloaded'}}
  }
  else if(url.pathname==='/api/files/true_12345678901@lid_voice.ogg'){
    res.writeHead(200,{'Content-Type':'audio/ogg'})
    res.end(Buffer.from('mock-audio-bytes'))
    return
  }
  else if(url.pathname==='/api/sendText'){count++;reply={id:'test-message-id'}}
  else {res.writeHead(404);res.end();return}
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(reply))
})


const mockOllama=http.createServer((req,res)=>{
  if(req.url==='/api/tags'){
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({models:[{name:'qwen3:8b'}]}));return
  }
  if(req.url!=='/api/generate'){res.writeHead(404);res.end();return}
  let body=''
  req.on('data',chunk=>body+=chunk)
  req.on('end',()=>{
    const instruction=JSON.parse(body)
    aiCalls++
    const output=instruction.format==='json'
      ?JSON.stringify({summary:'Treinamento com orçamento restrito',confidence:'média',limitations:'Histórico curto',needs:[{description:'Treinamento',evidenceIds:['M01']}],objections:[{description:'Orçamento',evidenceIds:['M01']}],opportunities:[{description:'Negócio milionário',evidenceIds:['M99']}],nextSteps:[]})
      :'Podemos conversar sobre as prioridades do treinamento?'
    res.writeHead(200,{'Content-Type':'application/json'})
    res.end(JSON.stringify({response:output}))
  })
})

test('WAHA local bridge: authentication, conversations, resolve, send without duplication', {timeout:20000}, async ()=>{
  await new Promise(resolve=>fakeWaha.listen(WAHA_PORT,'127.0.0.1',resolve))
  await new Promise(resolve=>mockOllama.listen(OLLAMA_PORT,'127.0.0.1',resolve))
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
    const features=await(await fetch(base+'/v1/features',{headers})).json()
    assert.equal(features.autoSend,false,'automatic sending stays off on startup')
    assert.equal(features.autoReplyOptIn,true)
    const initial=await(await fetch(base+'/v1/ai/auto-reply?chatId=12345678901%40lid',{headers})).json()
    assert.equal(initial.enabled,false,'new contact is never automatically enabled')
    const autoHeaders={...headers,'Content-Type':'application/json'}
    const groupAttempt=await fetch(base+'/v1/ai/auto-reply',{
      method:'POST',headers:autoHeaders,
      body:JSON.stringify({chatId:'987654321@g.us',enabled:true})
    })
    assert.equal(groupAttempt.status,400,'groups cannot activate autonomous AI')
    const activation=await fetch(base+'/v1/ai/auto-reply',{
      method:'POST',headers:autoHeaders,
      body:JSON.stringify({chatId:'12345678901@lid',enabled:true})
    })
    assert.equal((await activation.json()).enabled,true)
    const deactivation=await fetch(base+'/v1/ai/auto-reply',{
      method:'POST',headers:autoHeaders,
      body:JSON.stringify({chatId:'12345678901@lid',enabled:false})
    })
    assert.equal((await deactivation.json()).enabled,false)
    assert.equal(count,0,'enabling and disabling never sends a WAHA message')
    const chats=await (await fetch(base+'/v1/chats',{headers})).json()
    assert.equal(chats[0].id,'12345678901@lid')
    const inbound=await (await fetch(base+'/v1/messages?chatId=12345678901%40lid',{headers})).json()
    assert.equal(inbound[0].media.url,'/api/files/true_12345678901@lid_voice.ogg')
    const clip=await fetch(base+'/v1/media?src='+encodeURIComponent(inbound[0].media.url),{headers})
    assert.equal(clip.status,200,'WAHA media is served by loopback proxy, not Docker hostname')
    assert.equal(await clip.text(),'mock-audio-bytes')
    const byMessage=await fetch(base+'/v1/media?chatId=12345678901%40lid&messageId=msg001',{headers})
    assert.equal(byMessage.status,200,'media ID lookup should recover a Docker-origin file')
    assert.equal(await byMessage.text(),'mock-audio-bytes')
    const missing=await fetch(base+'/v1/media?chatId=12345678901%40lid&messageId=msg002',{headers})
    assert.equal(missing.status,424,'missing WAHA media must be explicit, not a generic 400')
    const invalidRef=await fetch(base+'/v1/media?chatId=bad&messageId=msg001',{headers})
    assert.equal(invalidRef.status,400,'invalid message reference must not reach WAHA')
    const groupMessages=await(await fetch(base+'/v1/messages?chatId=987654321%40g.us',{headers})).json()
    assert.deepEqual(groupMessages.map(m=>m.senderName),['Cliente do grupo','Cliente do grupo'])
    assert.equal(groupMessages[0].senderId,'112233445566@lid')
    const originalDockerUrl='http://localhost:3000/api/files/true_12345678901@lid_voice.ogg'
    assert.equal((await fetch(base+'/v1/media?src='+encodeURIComponent(originalDockerUrl),{headers})).status,400,
      'the browser cannot submit arbitrary non-loopback origins')
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

    const aiHeaders={...headers,'Content-Type':'application/json'}
    const reply=await fetch(base+'/v1/ai/conversation',{method:'POST',headers:aiHeaders,body:JSON.stringify({chatId:'12345678901@lid',task:'reply'})})
    assert.equal(reply.status,200)
    const replyData=await reply.json()
    assert.equal(replyData.source,'waha-local')
    assert.equal(replyData.messagesRead,1)
    assert.equal(replyData.sent,false)
    assert.match(replyData.text,/prioridades do treinamento/)
    const commercial=await fetch(base+'/v1/ai/conversation',{method:'POST',headers:aiHeaders,body:JSON.stringify({chatId:'12345678901@lid',task:'commercial'})})
    assert.equal(commercial.status,200)
    const commercialData=await commercial.json()
    assert.equal(commercialData.analysis.needs.length,1)
    assert.equal(commercialData.analysis.opportunities.length,0,'AI invented message references must be discarded')
    assert.equal(aiCalls,2)
    assert.equal(count,1,'AI must never send WhatsApp messages')
    const invalid=await fetch(base+'/v1/ai/conversation',{method:'POST',headers:aiHeaders,body:JSON.stringify({chatId:'invalid@fake',task:'reply'})})
    assert.equal(invalid.status,400)
    assert.equal((await fetch(base+'/v1/send',{...opts,body:JSON.stringify({...payload,chatId:'evil@localhost',idempotencyKey:'00000000-0000-4000-a000-000000000002'})})).status,400)
  }finally{
    child.kill('SIGTERM')
    await new Promise(resolve=>fakeWaha.close(resolve))
    await new Promise(resolve=>mockOllama.close(resolve))
    fs.rmSync(home,{recursive:true,force:true})
  }
})
