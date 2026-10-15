#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { spawn } from 'node:child_process'

const root=process.cwd()
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rt-h1910-'))
const token='h1910-'+'x'.repeat(48)
const freePort=async()=>{const s=net.createServer();await new Promise((resolve,reject)=>s.listen(0,'127.0.0.1',resolve).once('error',reject));const p=s.address().port;await new Promise(r=>s.close(r));return p}
const port=await freePort()
const storeFile=path.join(temp,'store.json')
const keyFile=path.join(temp,'key')
const configFile=path.join(temp,'config.json')
const mediaDir=path.join(temp,'media')
const workspaceId='workspace-h1910'
const accountId='account-h1910'
fs.writeFileSync(configFile,'{}')
fs.writeFileSync(storeFile,JSON.stringify({version:1,accounts:[{id:accountId,workspaceId,provider:'whatsapp_cloud',externalAccountId:'qr-local',displayName:'WhatsApp QR',status:'attention',scopes:[],credential:null,metadata:{transport:'qr',displayPhoneNumber:'+5551999999999'},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}],events:[]},null,2))
const env={...process.env,REALTALENT_COMMUNICATIONS_PORT:String(port),REALTALENT_COMMUNICATIONS_HOST:'127.0.0.1',REALTALENT_RUNTIME_TOKEN:token,REALTALENT_COMMUNICATIONS_STORE:storeFile,REALTALENT_COMMUNICATIONS_KEY_FILE:keyFile,REALTALENT_COMMUNICATIONS_CONFIG:configFile,REALTALENT_COMMUNICATIONS_MEDIA_DIR:mediaDir}
const child=spawn(process.execPath,['scripts/realtalent-communications-gateway.mjs'],{cwd:root,env,stdio:'ignore'})
const request=async(pathname,options={})=>{const response=await fetch(`http://127.0.0.1:${port}${pathname}`,{...options,headers:{'x-realtalent-runtime-token':token,'content-type':'application/json',...(options.headers||{})}});return {response,data:await response.json().catch(()=>({}))}}
try{
  let healthy=false
  for(let i=0;i<50;i++){try{const {response}=await request('/api/communications/health');if(response.ok){healthy=true;break}}catch{}await sleep(100)}
  if(!healthy)throw new Error('gateway não iniciou')
  console.log('OK  gateway H19.10 inicia isolado')
  const payload={workspaceId,accountId,channel:'whatsapp',recipient:'+5551987654321',body:'Arquivo em fila',idempotencyKey:'h1910-smoke-1',replyToExternalMessageId:'quoted-message-1',replyPreview:'Mensagem anterior',attachment:{dataBase64:Buffer.from('arquivo de teste').toString('base64'),mimeType:'text/plain',fileName:'teste.txt',size:16,kind:'document'}}
  const started=Date.now();const first=await request('/api/communications/send',{method:'POST',body:JSON.stringify(payload)});const elapsed=Date.now()-started
  if(!first.response.ok||first.data.event?.status!=='queued')throw new Error(`envio offline não entrou na fila: HTTP ${first.response.status}`)
  if(elapsed>1500)throw new Error(`fila offline lenta demais: ${elapsed}ms`)
  console.log(`OK  envio offline entra na fila imediatamente (${elapsed}ms)`)
  if(!first.data.event?.hasAttachments||first.data.event?.replyToExternalMessageId!=='quoted-message-1')throw new Error('fila não preservou mídia/reply')
  console.log('OK  fila preserva mídia e resposta citada')
  const second=await request('/api/communications/send',{method:'POST',body:JSON.stringify(payload)})
  if(!second.response.ok||second.data.event?.id!==first.data.event?.id||second.data.idempotent!==true)throw new Error('idempotência não reutilizou o mesmo evento')
  console.log('OK  reenvio com mesma chave é idempotente')
  const events=await request(`/api/communications/events?workspaceId=${encodeURIComponent(workspaceId)}&limit=50`)
  const matching=(events.data.events||[]).filter(e=>e.metadata?.idempotencyKey==='h1910-smoke-1')
  if(matching.length!==1)throw new Error(`esperado 1 evento, recebido ${matching.length}`)
  console.log('OK  timeline persiste uma única mensagem')
  const attachment=first.data.event?.metadata?.attachment
  if(!attachment?.id)throw new Error('mídia não foi persistida')
  const mediaPath=String(attachment.url||'').replace('/__rt/communications','')
  const mediaResponse=await fetch(`http://127.0.0.1:${port}${mediaPath}`,{headers:{'x-realtalent-runtime-token':token}})
  const mediaBody=Buffer.from(await mediaResponse.arrayBuffer())
  if(!mediaResponse.ok||mediaBody.toString()!=='arquivo de teste')throw new Error('mídia persistida não pôde ser recuperada')
  console.log('OK  mídia privada pode ser recuperada pelo gateway')
  const retry=await request('/api/communications/retry',{method:'POST',body:JSON.stringify({workspaceId,eventId:first.data.event.id})})
  if(!retry.response.ok||retry.data.event?.status!=='queued'||retry.data.event?.metadata?.outbox!==true)throw new Error('retry não recolocou mensagem na fila')
  console.log('OK  retry mantém mensagem na outbox confiável')
  console.log('H19.10 Rich Messaging runtime smoke: 7/7')
} finally {
  try{child.kill('SIGTERM')}catch{}
  await sleep(250)
  try{child.kill('SIGKILL')}catch{}
  fs.rmSync(temp,{recursive:true,force:true})
}
