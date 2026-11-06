#!/usr/bin/env node
// Local-only diagnostic: reports media availability, never chat IDs, text, filenames, keys or URLs.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { normalizeWahaMediaUrl } from './tools.mjs'

const home=os.homedir()
const envFile=path.join(home,'.local/share/realtalent-waha-gows/.env')
const tokenFile=path.join(home,'.local/share/realtalent-waha-direct/access-token')
const readConfig=(p,key)=>{
  const data=fs.readFileSync(p,'utf8')
  return data.split(/\r?\n/).find(x=>x.startsWith(key+'='))?.slice(key.length+1).trim()||''
}
const wahaBase='http://127.0.0.1:4385', bridgeBase='http://127.0.0.1:4392'
const within=ms=>AbortSignal.timeout(ms)
async function main(){
  const key=process.env.WAHA_API_KEY||readConfig(envFile,'WAHA_API_KEY')
  const token=fs.readFileSync(tokenFile,'utf8').trim()
  if(!key||!token)throw Error('Credenciais locais indisponíveis')
  const get=async(route,auth='waha')=>fetch((auth==='waha'?wahaBase:bridgeBase)+route,{
    headers:auth==='waha'?{'X-Api-Key':key}:{Authorization:'Bearer '+token},
    redirect:'error',signal:within(20000),
  })
  const features=await get('/v1/features','bridge')
  const bridge=features.ok?await features.json():{}
  const sessionR=await get('/api/sessions/realtalent')
  const session=sessionR.ok?await sessionR.json():{}
  console.log('=== Diagnóstico WAHA/RealTalent (sem dados pessoais) ===')
  console.log('Ponte:',bridge.version||'indisponível (HTTP '+features.status+')')
  console.log('WAHA:',session.status||'indisponível (HTTP '+sessionR.status+')')
  if(!sessionR.ok||session.status!=='WORKING')return
  const chatsR=await get('/api/realtalent/chats/overview?limit=20&offset=0')
  if(!chatsR.ok)throw Error('WAHA não respondeu à lista de conversas (HTTP '+chatsR.status+')')
  const chats=await chatsR.json()
  let examined=0,media=0,available=0,missing=0,blocked=0,bridgeRejected=0,upstreamRejected=0
  const examples=[]
  for(const c of (Array.isArray(chats)?chats:[])){
    const id=String(c.id||'')
    if(!/^[A-Za-z0-9_-]{5,70}@(c\.us|lid|g\.us)$/.test(id))continue
    const res=await get('/api/realtalent/chats/'+encodeURIComponent(id)+'/messages?limit=30&downloadMedia=true')
    if(!res.ok)continue
    const messages=await res.json()
    if(!Array.isArray(messages))continue
    examined+=messages.length
    for(const m of messages){
      if(!m?.hasMedia)continue
      media++
      const src=m.media?.url||m.mediaUrl||''
      const mime=String(m.media?.mimetype||'application/octet-stream').split(';')[0].replace(/[^a-zA-Z0-9/+.-]/g,'').slice(0,50)
      if(!src){missing++;if(examples.length<6)examples.push(mime+': sem URL no WAHA');continue}
      const localPath=normalizeWahaMediaUrl(src)
      if(!localPath){blocked++;if(examples.length<6)examples.push(mime+': formato de URL não aceito');continue}
      const r=await get('/v1/media?src='+encodeURIComponent(localPath),'bridge')
      if(r.ok){available++}else{
        if(r.status===400)bridgeRejected++;else upstreamRejected++
        if(examples.length<6)examples.push(mime+': proxy HTTP '+r.status)
      }
      await r.body?.cancel().catch(()=>{})
      if(media>=20)break
    }
    if(media>=20)break
  }
  console.log('Mensagens examinadas:',examined,'| mídias testadas:',media)
  console.log('Mídias disponíveis:',available)
  console.log('Sem URL no WAHA:',missing)
  console.log('URL incompatível:',blocked)
  console.log('Rejeitadas pela ponte (HTTP 400):',bridgeRejected)
  console.log('Erros na origem (ex.: 502):',upstreamRejected)
  if(examples.length)console.log('Amostras anônimas:',examples.join(' | '))
  console.log('Nenhuma conversa, nome, chave ou URL foi exibida.')
}
main().catch(e=>{console.error('Diagnóstico:',String(e.message||e).slice(0,140));process.exitCode=1})
