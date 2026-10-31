import {env} from '../lib/env'

// This token is scoped to the browser origin + this one Linux machine, and
// allows read-only Agent requests only. It is NOT the server runtime secret.
const KEY='realtalent:ai:browser-pairing:v1'
export const LOCAL_AI_BROWSER_URL='http://127.0.0.1:8798/browser'
const allowedGet=new Set(['/tools/health'])
const allowedPost=new Set(['/tools/chat','/tools/chat-stream','/tools/research','/tools/route-intent',
  '/tools/plan-readonly','/tools/workflow-plan','/tools/workflow-synthesize',
  '/tools/prospect-investigate','/tools/garimpo-conversation','/tools/generate-script',
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
      return {ok:true,message:'IA local conectada. A autorização será reutilizada neste navegador.'}
    }
    if(data.error==='pair_code_expired')return {ok:false,message:'Código expirou. Gere outro no terminal Linux.'}
    return {ok:false,message:'Código inválido ou não autorizado. Confira os seis dígitos.'}
  }catch{
    return {ok:false,message:'Não foi possível encontrar a ponte local. Confira os serviços e as permissões do Firefox.'}
  }
}

const agentSuffix=(input:string)=>{
  const base=env.agentGatewayUrl.replace(/\/$/,'')
  if(!input.startsWith(base+'/'))return null
  const suffix=input.slice(base.length)
  return suffix.startsWith('/tools/')?suffix:null
}

/** Called transparently from runtimeFetch; never sends the cloud auth bearer to localhost. */
export async function tryLocalAiBrowserRequest(input:string,init:RequestInit={}):Promise<Response|null>{
  const token=currentToken()
  if(!/^[a-f0-9]{64}$/i.test(token))return null
  const suffix=agentSuffix(input)
  if(!suffix)return null
  const path=suffix.split('?')[0],method=(init.method||'GET').toUpperCase()
  if(!((method==='GET'&&allowedGet.has(path))||(method==='POST'&&allowedPost.has(path))))return null
  try{
    const response=await fetch(LOCAL_AI_BROWSER_URL+suffix,{
      ...init,mode:'cors',credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',
      headers:{...(init.headers||{}),'x-realtalent-browser-token':token},
    })
    if(response.status===401){
      forgetLocalAiPairing() // re-pair after revoked/expired credentials; do not leak old token.
      return null
    }
    return response
  }catch{return null} // disconnected PC or browser restriction: keep cloud fallback working.
}
