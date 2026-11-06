#!/usr/bin/env node
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createLocalTools, proxyWahaMedia, ollamaModels, analyzeConversation, wahaAllowedMime, normalizeWahaMediaMessages, normalizeWahaMediaUrl } from './tools.mjs'
import { createGroupSenderEnricher } from './group-senders.mjs'
import { transcribeOneReceivedMessage } from './inline-voice.mjs'
import { analyzeWahaConversation } from './conversation-intelligence.mjs'
import { createAudioTranscriber } from './audio-transcription.mjs'
import { createAutoReplyController } from './auto-reply.mjs'
import {createWahaTaskNotifications} from './task-notifications.mjs'

// Local-only authenticated companion: WAHA credentials never enter the browser.
const home=os.homedir()
const configFile=path.join(home,'.local/share/realtalent-waha-gows/.env')
const config=fs.existsSync(configFile)?Object.fromEntries(fs.readFileSync(configFile,'utf8').split(/\r?\n/).filter(x=>/^[A-Z_][A-Z_0-9]*=/.test(x)).map(x=>{const n=x.indexOf('=');return [x.slice(0,n),x.slice(n+1).trim()]})):{}
const key=process.env.WAHA_API_KEY||config.WAHA_API_KEY
const session=process.env.WAHA_SESSION||'realtalent'
const port=Number(process.env.REALTALENT_WAHA_BRIDGE_PORT||4390)
if(!key||!/^[A-Za-z0-9_-]{1,64}$/.test(session)||!Number.isInteger(port)||port<1024||port>65535){
  console.error('WAHA Direct: confirme WAHA_API_KEY e a sessão realtalent no Linux.');process.exit(1)
}
const dataDir=path.join(home,'.local/share/realtalent-waha-direct')
fs.mkdirSync(dataDir,{recursive:true,mode:0o700})
const tokenFile=path.join(dataDir,'access-token')
let token=fs.existsSync(tokenFile)?fs.readFileSync(tokenFile,'utf8').trim():''
if(!/^[a-f0-9]{64}$/.test(token)){
  token=randomBytes(32).toString('hex');fs.writeFileSync(tokenFile,token+'\n',{mode:0o600})
}
const origins=new Set(['https://crm-real-talent.vercel.app','http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:5174','http://localhost:5174','http://127.0.0.1:4173','http://localhost:4173',...String(process.env.REALTALENT_WAHA_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean)])
const wahaBase='http://127.0.0.1:4385'
const watchers=new Set(), sent=new Map()
const tools=createLocalTools(dataDir)
const transcribeMessages=createAudioTranscriber({apiKey:key})
const enrichGroupSenders=createGroupSenderEnricher({lookup:async id=>{
  const response=await fetch(wahaBase+'/api/contacts?contactId='+encodeURIComponent(id)+'&session='+encodeURIComponent(session),{
    headers:{'X-Api-Key':key},redirect:'error',signal:AbortSignal.timeout(3500)
  })
  return response.ok?response.json():null
}})
const autoReply=createAutoReplyController({
  readMessages:async chatId=>normalizeWahaMediaMessages(await upstream(
    '/api/'+session+'/chats/'+encodeURIComponent(chatId)+'/messages?limit=45&downloadMedia=true')),
  buildReply:async ({chatId,trigger,messages})=>{
    let context=messages
    if(trigger.hasMedia===true){
      const voice=messages.find(m=>m.id===trigger.id)
      if(!voice)throw new Error('Áudio ainda não disponível no WAHA')
      const audio=await transcribeMessages([voice],chatId)
      const transcript=audio?.messages?.[0]?._localTranscript
      if(typeof transcript!=='string'||!transcript.trim())
        throw new Error('Áudio não pôde ser transcrito localmente')
      context=messages.map(m=>m.id===trigger.id?{...m,_localTranscript:transcript}:m)
    }
    const result=await analyzeWahaConversation({chatId,task:'autoReply'},{
      readMessages:async()=>context
    })
    return result.text
  },
  send:async(chatId,text)=>upstream('/api/sendText','POST',{session,chatId,text}),
})
const chatValid=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{5,70}@(c\.us|lid|g\.us)$/.test(v)
const authenticated=v=>{
  if(typeof v!=='string'||!v.startsWith('Bearer '))return false
  const a=Buffer.from(v.slice(7)),b=Buffer.from(token)
  return a.length===b.length&&timingSafeEqual(a,b)
}
function output(res,code,body){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body))}
async function upstream(route,method='GET',body){
  const r=await fetch(wahaBase+route,{method,headers:{'X-Api-Key':key,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(method==='POST'?50000:route.includes('/messages/')?27000:route.includes('/messages?')?35000:12000)})
  if(!r.ok){const e=new Error('WAHA HTTP '+r.status);e.status=r.status;throw e}
  return r.status===204?{}:r.json()
}
async function readBody(req,maxBytes=12000){
  const parts=[];let size=0
  for await(const part of req){size+=part.length;if(size>maxBytes){const err=new Error('too_large');err.status=413;throw err};parts.push(part)}
  return JSON.parse(Buffer.concat(parts).toString('utf8'))
}
// Separate persistent queue, same WAHA realtalent session and X-Api-Key.
const taskNotifications=createWahaTaskNotifications({dataDir,session,upstream})
const taskTick=setInterval(()=>{void taskNotifications.tick().catch(
  ()=>console.error('[WAHA tasks] Falha no ciclo de avisos; verificar WAHA local')
)},3000)
taskTick.unref()
async function handler(req,res){
  const origin=req.headers.origin
  if(origin&&!origins.has(origin)){output(res,403,{error:'origin_blocked'});return}
  if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Private-Network','true')}
  if(req.method==='OPTIONS'){
    res.writeHead(204,{'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Max-Age':'600'});res.end();return
  }
  const url=new URL(req.url||'/', 'http://127.0.0.1:'+port)
  if(url.pathname==='/health'&&req.method==='GET'){output(res,200,{ok:true});return}
  if(url.pathname==='/'&&req.method==='GET'){
    const html='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>RealTalent • WAHA</title><style>body{font:16px system-ui;max-width:650px;margin:8vh auto;background:#f2f6fd;color:#122448;padding:20px}article{background:white;padding:25px;border-radius:16px}code{display:block;word-break:break-all;padding:15px;background:#eff3fc}</style><article><h1>Ponte local WAHA</h1><p>A sessão realtalent permanece no WAHA. Não há Supabase.</p><p>Na aba Comunicações do CRM, copie a chave de acesso local:</p><code>'+token+'</code><p>Não compartilhe esta chave. Ela controla o acesso às suas conversas neste computador.</p></article></html>'
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"});res.end(html);return
  }
  if(!authenticated(req.headers.authorization)){output(res,401,{error:'invalid_bridge_token'});return}
  try{
    if(url.pathname==='/v1/features'&&req.method==='GET'){
      output(res,200,{version:'task-notifications-waha-v5',features:['waha-chat','commercial-analysis','ask-about-chat','reply-draft','local-audio-transcription','inline-voice','group-identity','media-recovery','per-chat-auto-reply','task-assignment-notifications','inline-reply-g411'],autoSend:false,autoReplyOptIn:true});return
    }
    if(url.pathname.startsWith('/v1/task-reminders/')){
      const action=url.pathname.slice('/v1/task-reminders/'.length)
      const getOnly=new Set(['status','diagnose','member-status'])
      const postOnly=new Set(['member','schedule','cancel','request','reconcile'])
      if((req.method==='GET'&&!getOnly.has(action))||
        (req.method==='POST'&&!postOnly.has(action))){
        output(res,405,{error:'method_not_allowed'});return
      }
      const input=req.method==='GET'
        ?Object.fromEntries(url.searchParams.entries()):await readBody(req,16000)
      const result=await taskNotifications.route(action,input)
      output(res,200,result);return
    }
    if(url.pathname==='/v1/session'&&req.method==='GET'){
      const v=await upstream('/api/sessions/'+session);output(res,200,{status:v.status||'UNKNOWN',session});return
    }
    if(url.pathname==='/v1/chats'&&req.method==='GET'){
      const limit=Math.min(50,Math.max(1,Number(url.searchParams.get('limit'))||30))
      const offset=Math.min(10000,Math.max(0,Number(url.searchParams.get('offset'))||0))
      const v=await upstream('/api/'+session+'/chats/overview?limit='+limit+'&offset='+offset)
      output(res,200,Array.isArray(v)?v:[]);return
    }
    if(url.pathname==='/v1/messages'&&req.method==='GET'){
      const chatId=url.searchParams.get('chatId');if(!chatValid(chatId)){output(res,400,{error:'invalid_chat'});return}
      const v=await upstream('/api/'+session+'/chats/'+encodeURIComponent(chatId)+'/messages?limit=50&downloadMedia=true')
      output(res,200,await enrichGroupSenders(normalizeWahaMediaMessages(v),chatId));return
    }
    if(url.pathname==='/v1/resolve'&&req.method==='GET'){
      const phone=url.searchParams.get('phone')||'';if(!/^\d{10,15}$/.test(phone)){output(res,400,{error:'invalid_phone'});return}
      const v=await upstream('/api/contacts/check-exists?phone='+phone+'&session='+session)
      output(res,200,{numberExists:v.numberExists===true,chatId:chatValid(v.chatId)?v.chatId:null});return
    }
    if(url.pathname==='/v1/preferences'&&req.method==='GET'){
      output(res,200,tools.read());return
    }
    if(url.pathname==='/v1/preferences'&&req.method==='POST'){
      const v=await readBody(req,15000)
      output(res,200,tools.update(v));return
    }
    if(url.pathname==='/v1/media'&&req.method==='GET'){
      let src=url.searchParams.get('src')||''
      const requestedChat=url.searchParams.get('chatId')
      const messageId=url.searchParams.get('messageId')
      // Re-fetch the specific authenticated WAHA message if the advertised file link is stale.
      // A browser cannot provide an arbitrary upstream URL or media filename by reference.
      if(requestedChat!==null||messageId!==null){
        if(!chatValid(requestedChat)||typeof messageId!=='string'||
          !/^[A-Za-z0-9@_.:-]{5,250}$/.test(messageId)){
          output(res,400,{error:'invalid_media_reference'});return
        }
        const message=await upstream('/api/'+session+'/chats/'+encodeURIComponent(requestedChat)+
          '/messages/'+encodeURIComponent(messageId)+'?downloadMedia=true')
        src=normalizeWahaMediaUrl(message?.media?.url||message?.mediaUrl||'')||''
        if(!src){
          output(res,424,{error:'media_not_available',detail:'O WAHA não disponibilizou o arquivo desta mensagem.'});return
        }
      }
      await proxyWahaMedia(src,{'X-Api-Key':key},res);return
    }
    if(url.pathname==='/v1/ai/auto-reply'&&req.method==='GET'){
      const chatId=url.searchParams.get('chatId')||''
      output(res,200,autoReply.status(chatId));return
    }
    if(url.pathname==='/v1/ai/auto-reply'&&req.method==='POST'){
      const input=await readBody(req,750)
      output(res,200,autoReply.setEnabled(input.chatId,input.enabled));return
    }
    if(url.pathname==='/v1/ai/status'&&req.method==='GET'){
      try{
        const models=await ollamaModels()
        output(res,200,{available:models.length>0,models,description:models.length?'Ollama local disponível. Uso apenas sob comando.':'Instale um modelo local no Ollama.'})
      }catch{output(res,200,{available:false,models:[],description:'Ollama local não está disponível neste computador.'})}
      return
    }
    if(url.pathname==='/v1/ai/transcribe'&&req.method==='POST'){
      const input=await readBody(req,900)
      const result=await transcribeOneReceivedMessage(input,{
        readMessages:async chatId=>normalizeWahaMediaMessages(await upstream(
          '/api/'+session+'/chats/'+encodeURIComponent(chatId)+'/messages?limit=60&downloadMedia=true')),
        transcribeMessages,
      })
      output(res,200,result);return
    }
    if(url.pathname==='/v1/ai/conversation'&&req.method==='POST'){
      const input=await readBody(req,1500)
      const result=await analyzeWahaConversation(input,{
        readMessages:async chatId=>enrichGroupSenders(normalizeWahaMediaMessages(await upstream('/api/'+session+'/chats/'+encodeURIComponent(chatId)+'/messages?limit=60&downloadMedia=true')),chatId),
        transcribeMessages
      })
      output(res,200,result);return
    }
    if(url.pathname==='/v1/ai/analyze'&&req.method==='POST'){
      const v=await readBody(req,30000)
      output(res,200,await analyzeConversation(v));return
    }
    if(url.pathname==='/v1/events'&&req.method==='GET'){
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'})
      res.write(': connected\n\n');watchers.add(res);req.on('close',()=>watchers.delete(res));return
    }
    if(url.pathname==='/v1/send'&&req.method==='POST'){
      const v=await readBody(req,12_000_000)
      if(!chatValid(v.chatId)||typeof v.idempotencyKey!=='string'||!/^[a-f0-9-]{36}$/i.test(v.idempotencyKey)){
        output(res,400,{error:'invalid_message'});return
      }
      let endpoint,payload
      if(typeof v.text==='string'&&v.text.trim()&&v.text.length<=4096&&!v.file){
        endpoint='/api/sendText'
        payload={session,chatId:v.chatId,text:v.text}
      }else if(v.file&&typeof v.file.data==='string'&&v.file.data.length<=11_200_000&&/^[A-Za-z0-9+/]+={0,2}$/.test(v.file.data)&&typeof v.file.filename==='string'&&v.file.filename.length<=150&&typeof v.file.mimetype==='string'&&wahaAllowedMime.has(v.file.mimetype)&&(!v.caption||typeof v.caption==='string'&&v.caption.length<=1200)){
        endpoint=v.file.mimetype.startsWith('image/')?'/api/sendImage':'/api/sendFile'
        payload={session,chatId:v.chatId,caption:v.caption||'',file:v.file}
      }else{
        output(res,400,{error:'invalid_message_or_attachment'});return
      }
      if(sent.has(v.idempotencyKey)){output(res,409,{error:'already_attempted'});return}
      sent.set(v.idempotencyKey,Date.now());setTimeout(()=>sent.delete(v.idempotencyKey),24*3600*1000).unref()
      // Never auto-retry; even HTTP 500/timeout may have sent the message.
      const result=await upstream(endpoint,'POST',payload)
      output(res,200,{accepted:true,id:result.id||null});return
    }
    output(res,404,{error:'not_found'})
  }catch(error){
    const status=[400,404,413,422,503].includes(error.status)?error.status:502
    const details=status===400||status===422||status===503
      ?String(error.message||'Falha na análise').slice(0,180)
      :'Confira a disponibilidade do WAHA e do Ollama locais. Nenhum envio será repetido automaticamente.'
    output(res,status,{error:'bridge_operation_failed',detail:details})
  }
}
const server=http.createServer((req,res)=>handler(req,res).catch(()=>{if(!res.headersSent)output(res,500,{error:'internal'});else res.destroy()}))
server.listen(port,'127.0.0.1',()=>console.log('RealTalent WAHA Direct ativo em http://127.0.0.1:'+port+' (sem Supabase)'))
let ws,closed=false
function startSocket(){
  if(closed||typeof WebSocket!=='function')return
  const u=new URL('ws://127.0.0.1:4385/ws')
  u.searchParams.set('session',session);u.searchParams.set('x-api-key',key)
  for(const event of ['message','message.any','message.ack','session.status'])u.searchParams.append('events',event)
  ws=new WebSocket(u)
  ws.onmessage=e=>{try{
    const data=JSON.parse(String(e.data));const p=data.payload||{}
    const msg='data: '+JSON.stringify({event:data.event,chatId:p.chatId||p.from||null})+'\n\n'
    for(const client of watchers){try{client.write(msg)}catch{watchers.delete(client)}}
    if(data.event==='message'&&data.session===session)
      void autoReply.onMessage(data).catch(()=>{})
  }catch{}}
  ws.onclose=()=>{if(!closed)setTimeout(startSocket,5000).unref()}
  ws.onerror=()=>{try{ws.close()}catch{}}
}
startSocket()
const heartbeat=setInterval(()=>{for(const client of watchers){try{client.write(': ping\n\n')}catch{watchers.delete(client)}}},20000);heartbeat.unref()
function shutdown(){closed=true;clearInterval(heartbeat);try{ws?.close()}catch{}server.close()}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown)
