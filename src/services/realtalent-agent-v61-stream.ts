import {env} from '../lib/env'
import {runtimeFetch} from './realtalent-runtime-transport'

export interface StreamReply {text:string;model:string|null}
export type StreamDelta=(content:string)=>void
/** Buffered line parser: handles arbitrary HTTP chunk boundaries and never
 * treats an incomplete JSON line as a complete event. */
export class OllamaNdjsonParser {
  private pending=''
  private complete=false
  private model:string|null=null
  private reply=''
  constructor(private readonly onDelta:StreamDelta){}
  push(chunk:string){
    this.pending+=chunk
    if(this.pending.length>100_000)throw Error('stream_buffer_limit')
    let boundary=this.pending.indexOf('\n')
    while(boundary>=0){
      const line=this.pending.slice(0,boundary).trim()
      this.pending=this.pending.slice(boundary+1)
      if(line){
        const data=JSON.parse(line) as {type?:string;text?:unknown;model?:unknown;error?:unknown}
        if(data.type==='delta' && typeof data.text==='string'){
          this.reply+=data.text
          if(this.reply.length>15000)throw Error('answer_too_large')
          this.onDelta(this.reply)
        }else if(data.type==='done'){
          this.complete=true
          this.model=typeof data.model==='string'?data.model:null
        }else if(data.type==='error'){
          throw Error(typeof data.error==='string'?data.error:'generation_failed')
        }
      }
      boundary=this.pending.indexOf('\n')
    }
  }
  result():StreamReply|null{
    return this.complete && this.reply.trim().length>=2?{text:this.reply.trim(),model:this.model}:null
  }
}
/** Streaming only for read-only conversation. Operational CRM tools continue
 * through their existing permission-gated request flow. */
export async function streamLocalConversation(prompt:string,history:string,onDelta:StreamDelta,
  fetcher:typeof runtimeFetch=runtimeFetch):Promise<StreamReply|null>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),95000)
  const parser=new OllamaNdjsonParser(onDelta)
  try{
    const response=await fetcher(env.agentGatewayUrl+'/tools/chat-stream',{
      method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
      body:JSON.stringify({prompt:prompt.slice(0,1800),history:history.slice(-4800)})
    })
    if(!response.ok||!response.body)return null
    const reader=response.body.getReader()
    const decoder=new TextDecoder()
    try{
      while(true){
        const {done,value}=await reader.read()
        if(done)break
        parser.push(decoder.decode(value,{stream:true}))
      }
      parser.push(decoder.decode())
    }finally{reader.releaseLock()}
    return parser.result()
  }catch{return null}
  finally{clearTimeout(timer)}
}
