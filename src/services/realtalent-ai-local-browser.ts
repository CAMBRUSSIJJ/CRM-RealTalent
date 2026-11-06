import {env} from '../lib/env'

// This token is scoped to the browser origin + this one Linux machine, and
// allows read-only Agent requests only. It is NOT the server runtime secret.
const KEY='realtalent:ai:browser-pairing:v1'
const MODE_KEY='realtalent:ai:prefer-local-only:v1'
/** When local-only is enabled, agent requests must never fall back to a
 * cloud provider after the laptop is off, Wi-Fi fails, or a pairing expires.
 * Existing non-agent CRM endpoints are not affected.
 */
export const localAiOnlyEnabled=()=>{
  if(typeof window==='undefined')return false
  try{return window.localStorage.getItem(MODE_KEY)==='local'}catch{return false}
}
export const setLocalAiOnlyEnabled=(enabled:boolean)=>{
  if(typeof window==='undefined')return
  try{window.localStorage.setItem(MODE_KEY,enabled?'local':'cloud')}catch{/* storage disabled */}
}
const offlineLocalAiResponse=()=>new Response(JSON.stringify({
  ok:false,error:'local_ai_offline',
  message:'IA local indisponível. Ligue o Linux e execute ~/.local/bin/realtalent-ia. Nenhuma API em nuvem foi acionada.',
}),{status:503,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})

export const LOCAL_AI_BROWSER_URL='http://127.0.0.1:8798/browser'
const allowedGet=new Set(['/tools/health'])
const allowedPost=new Set(['/tools/chat','/tools/chat-stream','/tools/research','/tools/route-intent',
  '/tools/plan-readonly','/tools/workflow-plan','/tools/workflow-synthesize',
  '/tools/prospect-investigate','/tools/garimpo-conversation','/tools/company-ask','/tools/generate-script',
  '/tools/research-script','/tools/classify-work','/tools/revise-work'])

export const localAiPairingPresent=()=>{
  if(typeof window==='undefined')return false
  try{return /^[a-f0-9]{64}$/i.test(window.localStorage.getItem(KEY)||'')}catch{return false}
}
export const forgetLocalAiPairing=()=>{
  if(typeof window==='undefined')return
  try{window.localStorage.removeItem(KEY)}catch{/* Storage may be disabled */ }
}
const currentToken=()=>{
  if(typeof window==='undefined')return ''
  try{return window.localStorage.getItem(KEY)||''}catch{return ''}
}

export async function pairLocalAi(code:string):Promise<{ok:boolean;message:string}>{
  if(typeof window==='undefined')return {ok:false,message:'Pareamento disponível somente no navegador.'}
  if(!/^\d{6}$/.test(code))return {ok:false,message:'Digite os seis dígitos mostrados no terminal do Linux.'}
  try{
    const response=await fetch(LOCAL_AI_BROWSER_URL+'/pair',{
      method:'POST',mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',
      referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({code}),signal:AbortSignal.timeout(8500),
    })
    const data=await response.json() as {ok?:boolean;token?:unknown;error?:string}
    if(response.ok&&data.ok===true&&typeof data.token==='string'&&/^[a-f0-9]{64}$/i.test(data.token)){
      window.localStorage.setItem(KEY,data.token)
      setLocalAiOnlyEnabled(true)
      return {ok:true,message:'IA local conectada. Modo sem API paga ativado; a autorização será reutilizada neste navegador.'}
    }
    if(data.error==='pair_code_expired')return {ok:false,message:'Código expirou. Gere outro no terminal Linux.'}
    return {ok:false,message:'Código inválido ou não autorizado. Confira os seis dígitos.'}
  }catch{
    return {ok:false,message:'Não foi possível encontrar a ponte local. Confira os serviços e as permissões do Firefox.'}
  }
}

export type LocalAiBrowserState='not_paired'|'online'|'offline'
export async function getLocalAiBrowserState():Promise<LocalAiBrowserState>{
  const token=currentToken()
  if(!/^[a-f0-9]{64}$/i.test(token))return 'not_paired'
  try{
    const response=await fetch(LOCAL_AI_BROWSER_URL+'/tools/health',{
      mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',
      referrerPolicy:'no-referrer',
      headers:{'x-realtalent-browser-token':token},
      signal:AbortSignal.timeout(3500),
    })
    if(response.status===401){forgetLocalAiPairing();return 'not_paired'}
    if(!response.ok)return 'offline'
    const data=await response.json() as {ok?:boolean;ollamaConnected?:boolean;modelInstalled?:boolean}
    return data.ok===true&&data.ollamaConnected===true&&data.modelInstalled===true?'online':'offline'
  }catch{return 'offline'}
}

const agentSuffix=(input:string)=>{
  const base=env.agentGatewayUrl.replace(/\/$/,'')
  if(!input.startsWith(base+'/'))return null
  const suffix=input.slice(base.length)
  // Recognize every Agent route so local-only mode cannot accidentally
  // route unsupported capabilities to a cloud model.
  return suffix.startsWith('/')?suffix:null
}

/** Called transparently from runtimeFetch; never sends the cloud auth bearer to localhost. */
export async function tryLocalAiBrowserRequest(input:string,init:RequestInit={}):Promise<Response|null>{
  const suffix=agentSuffix(input)
  if(!suffix)return null
  // A Vite preview e o Agent estao no mesmo computador. A consulta somente leitura
  // pode falar diretamente com o Agent local, sem depender da ponte pareada 8798
  // (que pode apontar para um runtime antigo). Nunca aplica a URLs hospedadas.
  if(['/tools/company-ask','/tools/company-image'].includes(suffix.split('?')[0])){
    try{
      const target=new URL(env.agentGatewayUrl)
      const origin=window.location?.origin
      if(target.protocol==='http:'&&target.hostname==='127.0.0.1'&&target.port==='8791'&&
        (origin==='http://127.0.0.1:5174'||origin==='http://localhost:5174'))return null
    }catch{/* endpoint remoto segue a ponte autenticada */}
  }
  const localOnly=localAiOnlyEnabled()
  const token=currentToken()
  if(!/^[a-f0-9]{64}$/i.test(token))return localOnly?offlineLocalAiResponse():null
  const path=suffix.split('?')[0],method=(init.method||'GET').toUpperCase()
  if(!((method==='GET'&&allowedGet.has(path))||(method==='POST'&&allowedPost.has(path))))
    return localOnly?offlineLocalAiResponse():null
  try{
    const response=await fetch(LOCAL_AI_BROWSER_URL+suffix,{
      ...init,mode:'cors',credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',
      headers:{...(init.headers||{}),'x-realtalent-browser-token':token},
    })
    if(response.status===401){
      forgetLocalAiPairing() // Re-pair but preserve local-only choice.
      return localOnly?offlineLocalAiResponse():null
    }
    return response
  }catch{return localOnly?offlineLocalAiResponse():null} // Fail closed: never charge a cloud provider in local-only mode.
}
