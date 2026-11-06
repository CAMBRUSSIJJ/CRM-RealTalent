// Voice notes are downloaded exclusively from loopback WAHA and transcribed on this Linux PC.
// No cloud STT, no disk persistence for transcripts, no background ingestion.
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { sanitizeMediaSrc } from './tools.mjs'

const runFile=promisify(execFile)
const MAX_AUDIO_BYTES=8_000_000
const MAX_AUDIO_PER_ANALYSIS=3
const TTL_MS=6*60*60*1000
const script=path.join(path.dirname(fileURLToPath(import.meta.url)),'transcribe-audio.py')
const python=()=>path.join(os.homedir(),'.local/share/realtalent-whisper/venv/bin/python')

export function isReceivedAudio(message){
  if(!message||typeof message!=='object'||message.fromMe===true)return false
  const mime=String(message.media?.mimetype||message.media?.mimeType||'').split(';')[0].trim().toLowerCase()
  return mime.startsWith('audio/')||
    (message.hasMedia===true&&['audio','ptt','voice'].includes(String(message.type||'').toLowerCase()))
}
function mediaUrl(message){
  return message?.media?.url||message?.mediaUrl||''
}
export async function downloadWahaVoice(src,apiKey,{fetchImpl=fetch}={}){
  const route=sanitizeMediaSrc(src)
  if(!route){const error=new Error('Endereço de mídia inválido');error.code='invalid_media';throw error}
  const response=await fetchImpl('http://127.0.0.1:4385'+route,{
    headers:{'X-Api-Key':apiKey},redirect:'error',signal:AbortSignal.timeout(25000)
  })
  if(!response.ok||!response.body){throw new Error('Mídia não disponível no WAHA')}
  const length=Number(response.headers.get('content-length')||0)
  if(length>MAX_AUDIO_BYTES){throw new Error('Áudio acima do limite de 8 MB')}
  const kind=(response.headers.get('content-type')||'').split(';')[0].toLowerCase()
  if(kind&&!kind.startsWith('audio/')&&kind!=='application/octet-stream'){
    throw new Error('Resposta do WAHA não é áudio')
  }
  let size=0
  const parts=[]
  for await (const part of response.body){
    size+=part.length
    if(size>MAX_AUDIO_BYTES)throw new Error('Áudio acima do limite de 8 MB')
    parts.push(part)
  }
  if(size===0)throw new Error('Áudio vazio')
  return Buffer.concat(parts)
}
export async function transcribeLocalVoice(bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length===0||bytes.length>MAX_AUDIO_BYTES)throw Error('Áudio inválido')
  const interpreter=python()
  await fs.access(interpreter,constants.X_OK).catch(()=>{throw new Error('Instale a transcrição local pelo script do CRM')})
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'realtalent-voice-'))
  try{
    await fs.chmod(dir,0o700)
    const clip=path.join(dir,'audio.ogg')
    await fs.writeFile(clip,bytes,{mode:0o600})
    const {stdout}=await runFile(interpreter,[script,clip],{
      timeout:90000,maxBuffer:25000,env:{...process.env,HF_HUB_OFFLINE:'1',HF_HUB_DISABLE_TELEMETRY:'1'}
    })
    const data=JSON.parse(stdout)
    return typeof data.text==='string'?data.text.trim().slice(0,4500):''
  }finally{
    await fs.rm(dir,{recursive:true,force:true})
  }
}
export function createAudioTranscriber({apiKey,download=downloadWahaVoice,transcribe=transcribeLocalVoice}={}){
  const cache=new Map()
  return async function enrichHistory(messages,chatId){
    if(!Array.isArray(messages))return {messages:[],audioDetected:0,audioTranscribed:0,audioSkipped:0}
    // WAHA's list is usually newest-first; use timestamps to select the latest received clips.
    const recent=messages.slice(0,60)
    const audio=recent.map((message,index)=>({message,index})).filter(x=>isReceivedAudio(x.message))
      .sort((a,b)=>Number(b.message.timestamp||0)-Number(a.message.timestamp||0))
    const selected=audio.slice(0,MAX_AUDIO_PER_ANALYSIS).reverse()
    const enriched=recent.slice()
    let completed=0,skipped=audio.length-selected.length
    let failed=0
    const now=Date.now()
    for(const [key,item] of cache){if(item.expires<=now)cache.delete(key)}
    for(const {message,index} of selected){
      const src=mediaUrl(message)
      if(!src||!sanitizeMediaSrc(src)){skipped++;failed++;continue}
      const identity=String(message.id||message.timestamp||index)
      const digest=createHash('sha256').update(chatId+'|'+identity+'|'+src).digest('hex')
      try{
        let text=cache.get(digest)?.text
        if(!text){
          const bytes=await download(src,apiKey)
          text=String(await transcribe(bytes)).replace(/[\\u0000-\\u001f]/g,' ').trim().slice(0,4500)
          if(!text){skipped++;continue}
          cache.set(digest,{text,expires:Date.now()+TTL_MS})
          if(cache.size>100)cache.delete(cache.keys().next().value)
        }
        enriched[index]={...message,_localTranscript:text}
        completed++
      }catch{
        // Partial analysis is explicit; do not substitute an invented transcript.
        skipped++;failed++
      }
    }
    return {messages:enriched,audioDetected:audio.length,
      audioTranscribed:completed,audioSkipped:skipped,audioFailed:failed}
  }
}
