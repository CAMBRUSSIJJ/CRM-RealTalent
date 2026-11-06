// Only talks to localhost companion. Never put WAHA_API_KEY or Supabase service keys in frontend.
export const WAHA_BRIDGE_URL='http://127.0.0.1:4392'
const LOCAL=WAHA_BRIDGE_URL
const STORAGE='realtalent.waha.direct.token.v1'

export type WahaStatus={session:string;status:string}
export type WahaMessage={
  id:string;timestamp:number;fromMe?:boolean;body?:string;hasMedia?:boolean;
  media?:{mimetype?:string;filename?:string;url?:string};mediaUrl?:string;
  ack?:number;ackName?:string;from?:string;to?:string;
}
export type WahaChat={
  id:string;name?:string;picture?:string;lastMessage?:WahaMessage|null;
  unreadCount?:number;
}
export type WahaContact={numberExists:boolean;chatId:string|null}

export function storedWahaToken():string{
  try{return window.sessionStorage.getItem(STORAGE)||''}catch{return ''}
}
export function saveWahaToken(token:string):void{
  if(!/^[a-f0-9]{64}$/.test(token.trim()))throw new Error('Chave local inválida (64 caracteres).')
  window.sessionStorage.setItem(STORAGE,token.trim())
}
export function clearWahaToken():void{window.sessionStorage.removeItem(STORAGE)}
async function request<T>(route:string,token:string,method='GET',payload?:unknown):Promise<T>{
  let res:Response
  try{
    res=await fetch(LOCAL+route,{
      method,mode:'cors',cache:'no-store',headers:{Authorization:'Bearer '+token,...(payload?{'Content-Type':'application/json'}:{})},
      body:payload?JSON.stringify(payload):undefined,
      signal:AbortSignal.timeout(route==='/v1/ai/analyze'?120000:route==='/v1/send'?60000:16000),
    })
  }catch{throw new Error('A ponte WAHA não está acessível neste computador. Inicie o conector Linux na porta 4390.')}
  if(!res.ok){
    if(res.status===401)throw new Error('Chave local inválida. Copie a chave novamente do conector.')
    if(res.status===409)throw new Error('Esse envio já foi solicitado. Confira a conversa antes de tentar novamente.')
    throw new Error('WAHA indisponível (HTTP '+res.status+'). Confira o painel e os logs. Não reenvie automaticamente.')
  }
  return res.json() as Promise<T>
}
export const wahaStatus=(token:string)=>request<WahaStatus>('/v1/session',token)
export const wahaChats=(token:string,offset=0)=>request<WahaChat[]>('/v1/chats?limit=30&offset='+offset,token)
export const wahaMessages=(token:string,chatId:string)=>request<WahaMessage[]>('/v1/messages?chatId='+encodeURIComponent(chatId),token)
export const wahaResolve=(token:string,phone:string)=>request<WahaContact>('/v1/resolve?phone='+encodeURIComponent(phone),token)
export const wahaSend=(token:string,chatId:string,text:string,idempotencyKey:string)=>
  request<{accepted:boolean;id:string|null}>('/v1/send',token,'POST',{chatId,text,idempotencyKey})

// WAHA websocket is consumed on the Linux companion; browser uses authenticated SSE.
// Browser streaming fetch supports Authorization header (EventSource does not).
export async function watchWaha(
  token:string, onEvent:()=>void, signal:AbortSignal,
):Promise<void>{
  while(!signal.aborted){
    try{
      const response=await fetch(LOCAL+'/v1/events',{headers:{Authorization:'Bearer '+token},signal,cache:'no-store'})
      if(!response.ok||!response.body)throw new Error('event stream unavailable')
      const reader=response.body.getReader()
      const decoder=new TextDecoder()
      let pending=''
      while(!signal.aborted){
        const chunk=await reader.read()
        if(chunk.done)break
        pending+=decoder.decode(chunk.value,{stream:true})
        let end:number
        while((end=pending.indexOf('\n\n'))>=0){
          const frame=pending.slice(0,end);pending=pending.slice(end+2)
          if(frame.split('\n').some(x=>x.startsWith('data: ')))onEvent()
        }
        if(pending.length>32_000)pending=''
      }
    }catch{ /* Reconnect. Periodic polling still works if the socket is unavailable. */ }
    if(!signal.aborted)await new Promise(resolve=>setTimeout(resolve,4000))
  }
}

export interface WahaQuickReply {id:string;title:string;text:string}
export interface WahaPreferences {
  labels:Record<string,string[]>
  favorites:string[]
  quickReplies:WahaQuickReply[]
}
export const emptyWahaPreferences=():WahaPreferences=>({labels:{},favorites:[],quickReplies:[]})
export const wahaPreferences=(token:string)=>request<WahaPreferences>('/v1/preferences',token)
export const wahaUpdatePreferences=(token:string,patch:unknown)=>request<WahaPreferences>('/v1/preferences',token,'POST',patch)
export const wahaAiStatus=(token:string)=>request<{available:boolean;models:string[];description:string}>('/v1/ai/status',token)
export const wahaAnalyze=(token:string,task:'summary'|'suggest',messages:WahaMessage[])=>
  request<{model:string;text:string}>('/v1/ai/analyze',token,'POST',{task,messages:messages.slice(-35).filter(m=>typeof m.body==='string').map(m=>({body:m.body,fromMe:!!m.fromMe}))})
export async function wahaMediaBlob(token:string,src:string):Promise<Blob>{
  if(!src)throw Error('Mídia indisponível.')
  const res=await fetch(LOCAL+'/v1/media?src='+encodeURIComponent(src),{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(25000)})
  if(!res.ok)throw Error('Arquivo indisponível no WAHA (HTTP '+res.status+').')
  return res.blob()
}
export async function wahaSendFile(token:string,chatId:string,file:File,caption:string,idempotencyKey:string):Promise<{accepted:boolean;id:string|null}>{
  if(file.size>8*1024*1024)throw Error('Arquivo acima de 8 MB.')
  const data=await file.arrayBuffer()
  const bytes=new Uint8Array(data)
  let binary=''
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192))
  return request<{accepted:boolean;id:string|null}>('/v1/send',token,'POST',{chatId,idempotencyKey,file:{filename:file.name,mimetype:file.type||'application/octet-stream',data:btoa(binary)},caption:caption.slice(0,1200)})
}
