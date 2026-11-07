// Browser-to-localhost AI connector. Only read-only generation endpoints are exposed.
// No CRM writes, no Ollama port exposure and no Vercel runtime secret in the browser.
import {randomBytes,randomInt,createHash,timingSafeEqual} from 'node:crypto'
import {readFileSync,writeFileSync,mkdirSync,rmSync,renameSync} from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

const hash=value=>createHash('sha256').update(String(value)).digest('hex')
const same=(one,two)=>typeof one==='string'&&typeof two==='string'&&
  /^[a-f0-9]{64}$/.test(one)&&/^[a-f0-9]{64}$/.test(two)&&
  timingSafeEqual(Buffer.from(one,'hex'),Buffer.from(two,'hex'))
const root=()=>process.env.REALTALENT_AI_CONFIG_DIR||path.join(os.homedir(),'.config','realtalent-ai')
const pairingFile=()=>path.join(root(),'browser-pairing.json')
const sessionsFile=()=>path.join(root(),'browser-sessions.json')
const readJson=file=>{try{return JSON.parse(readFileSync(file,'utf8'))}catch{return null}}
const saveJson=(file,value)=>{
  mkdirSync(path.dirname(file),{recursive:true,mode:0o700})
  const temp=file+'.'+process.pid+'.tmp'
  writeFileSync(temp,JSON.stringify(value),{mode:0o600,flag:'wx'})
  renameSync(temp,file)
}
const allowedOrigins=()=>new Set([
  'https://crm-real-talent.vercel.app',
  'http://127.0.0.1:4188','http://localhost:4188',
  'http://127.0.0.1:4189','http://localhost:4189',
  'http://127.0.0.1:4196','http://localhost:4196',
  'http://127.0.0.1:4197','http://localhost:4197',
  // WAHA/CRM V101.11.3 preview (Vite). Keep this explicit, never use a wildcard.
  'http://127.0.0.1:5174','http://localhost:5174',
  ...String(process.env.REALTALENT_BROWSER_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim())
    .filter(x=>{try{const u=new URL(x);return u.origin===x&&u.protocol==='https:'}catch{return false}})
])
const getPaths=new Set(['/tools/health'])
const postPaths=new Set(['/tools/chat','/tools/chat-stream','/tools/research',
  '/tools/route-intent','/tools/plan-readonly','/tools/workflow-plan',
  '/tools/workflow-synthesize','/tools/prospect-investigate','/tools/company-ask',
  '/tools/garimpo-conversation','/tools/generate-script',
  '/tools/research-script','/tools/classify-work','/tools/revise-work'])
const json=(res,status,data)=>{
  res.writeHead(status,{'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'})
  res.end(JSON.stringify(data))
}

export function issuePairingCode(){
  const code=String(randomInt(0,1000000)).padStart(6,'0')
  const expiration=Date.now()+5*60_000
  saveJson(pairingFile(),{hash:hash(code),expires:expiration,attempts:0})
  return {code,expires:expiration}
}
function validBrowserToken(token,origin){
  const sessions=readJson(sessionsFile())
  if(!Array.isArray(sessions))return false
  const now=Date.now()
  return sessions.some(x=>x&&x.origin===origin&&x.expires>now&&same(x.digest,hash(token)))
}
function parseJsonBody(req,maxBytes=2048){
  return new Promise((resolve,reject)=>{
    let size=0,buffers=[]
    req.on('data',buf=>{
      size+=buf.length
      if(size>maxBytes){reject(new Error('body_too_large'));req.destroy();return}
      buffers.push(buf)
    })
    req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(buffers).toString('utf8')))}catch{reject(new Error('bad_json'))}})
    req.on('error',reject)
  })
}
async function pair(req,res,origin){
  try{
    const body=await parseJsonBody(req)
    const code=String(body?.code||'')
    if(!/^\d{6}$/.test(code))return json(res,400,{ok:false,error:'invalid_code'})
    const saved=readJson(pairingFile())
    if(!saved||saved.expires<=Date.now()||saved.attempts>=5)return json(res,403,{ok:false,error:'pair_code_expired'})
    const matched=same(saved.hash,hash(code))
    if(!matched){
      saved.attempts+=1
      saveJson(pairingFile(),saved)
      return json(res,403,{ok:false,error:'invalid_code'})
    }
    rmSync(pairingFile(),{force:true})
    const token=randomBytes(32).toString('hex')
    const now=Date.now()
    const others=readJson(sessionsFile())
    const sessions=(Array.isArray(others)?others:[])
      .filter(x=>x&&x.expires>now&&x.origin!==origin).slice(-3)
    sessions.push({origin,digest:hash(token),expires:now+90*24*60*60_000})
    saveJson(sessionsFile(),sessions)
    return json(res,200,{ok:true,token,expires:sessions[sessions.length-1].expires})
  }catch{return json(res,400,{ok:false,error:'invalid_request'})}
}

function proxyToAgent(req,res,agentPort,route){
  let transferred=0,terminated=false
  const type=String(req.headers['content-type']||'application/json')
  const upstream=http.request({hostname:'127.0.0.1',port:agentPort,method:req.method,
    path:route,headers:{accept:String(req.headers.accept||'application/json'),...(req.method==='POST'?{'content-type':type}:{})}},up=>{
      if(terminated)return up.destroy()
      res.writeHead(up.statusCode||502,{
        'content-type':String(up.headers['content-type']||'application/json'),
        'cache-control':'no-store, no-transform','x-content-type-options':'nosniff'})
      up.pipe(res)
    })
  upstream.setTimeout(185000,()=>upstream.destroy(new Error('timeout')))
  upstream.on('error',()=>{if(!res.headersSent)json(res,502,{ok:false,error:'local_agent_offline'});else res.destroy()})
  req.on('data',buf=>{
    transferred+=buf.length
    if(transferred>1024*1024){terminated=true;upstream.destroy();if(!res.headersSent)json(res,413,{ok:false,error:'payload_too_large'});req.unpipe(upstream)}
  })
  req.on('aborted',()=>upstream.destroy())
  req.pipe(upstream)
}

export function createBrowserHandler({bridgePort=8798,agentPort=8792}={}){
  return function handle(req,res){
    const rawPath=String(req.url||'/')
    if(!rawPath.startsWith('/browser/'))return false
    const origin=String(req.headers.origin||'')
    const hostname=String(req.headers.host||'')
    // Strict Host + Origin protect against DNS rebinding and cross-site reads.
    if(hostname!=='127.0.0.1:'+bridgePort||!allowedOrigins().has(origin)){
      json(res,403,{ok:false,error:'browser_origin_forbidden'});return true
    }
    res.setHeader('access-control-allow-origin',origin)
    res.setHeader('vary','Origin')
    res.setHeader('access-control-allow-methods','GET,POST,OPTIONS')
    res.setHeader('access-control-allow-headers','content-type,x-realtalent-browser-token')
    if(req.headers['access-control-request-private-network']==='true')res.setHeader('access-control-allow-private-network','true')
    if(req.method==='OPTIONS'){res.statusCode=204;res.end();return true}
    const route=rawPath.slice('/browser'.length).split('?')[0]
    if(req.method==='GET'&&route==='/ping'){
      json(res,200,{ok:true,bridge:true,requiresPairing:true});return true
    }
    if(req.method==='POST'&&route==='/pair'){void pair(req,res,origin);return true}
    const token=String(req.headers['x-realtalent-browser-token']||'')
    if(!token||!validBrowserToken(token,origin)){
      json(res,401,{ok:false,error:'browser_not_paired'});return true
    }
    if(!((req.method==='GET'&&getPaths.has(route))||(req.method==='POST'&&postPaths.has(route)))){
      json(res,404,{ok:false,error:'browser_route_not_allowed'});return true
    }
    proxyToAgent(req,res,agentPort,rawPath.slice('/browser'.length));return true
  }
}
