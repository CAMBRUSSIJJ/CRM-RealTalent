import http from 'node:http'
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const here=path.dirname(fileURLToPath(import.meta.url))
const bundle=path.resolve(here,'../..')
const crm=path.join(bundle,'RealTalent-CRM-V101.11.3-CR10-H1-Agent-V3.1.2-Linux-Launcher')
const agent=path.join(bundle,'RealTalent-Agent-Runtime-V3.1.2')
const PORT=Number(process.env.PORT||8080)
const DATA=process.env.REALTALENT_CLOUD_DATA_DIR||'/data'
fs.mkdirSync(DATA,{recursive:true})
for(const dir of ['agent-config','agent-state','communications','prospecting']) fs.mkdirSync(path.join(DATA,dir),{recursive:true})

const required=['REALTALENT_AGENT_RUNTIME_TOKEN','REALTALENT_RUNTIME_TOKEN','REALTALENT_PROSPECTING_RUNTIME_TOKEN']
for(const name of required){ if(String(process.env[name]||'').length<24){ console.error(`${name} é obrigatório (mín. 24 caracteres).`); process.exit(1) } }

const children=[]
const launch=(name,cmd,args,extra)=>{
  const child=spawn(cmd,args,{cwd:extra.cwd||bundle,env:{...process.env,...extra.env},stdio:'inherit'})
  child.on('exit',(code,signal)=>{ console.error(`[${name}] encerrou code=${code} signal=${signal||''}`); if(!shuttingDown) process.exit(code||1) })
  children.push(child); return child
}
let shuttingDown=false
launch('agent',process.execPath,[path.join(agent,'cloud-agent-gateway.mjs')],{cwd:agent,env:{REALTALENT_AGENT_HOST:'127.0.0.1',REALTALENT_AGENT_PORT:'8791',REALTALENT_AGENT_INNER_PORT:'8792',XDG_CONFIG_HOME:path.join(DATA,'agent-config'),XDG_STATE_HOME:path.join(DATA,'agent-state')}})
launch('communications',process.execPath,[path.join(crm,'scripts/realtalent-communications-gateway.mjs')],{cwd:crm,env:{REALTALENT_COMMUNICATIONS_HOST:'127.0.0.1',REALTALENT_COMMUNICATIONS_PORT:'3002',REALTALENT_COMMUNICATIONS_STORE:path.join(DATA,'communications','store.json'),REALTALENT_COMMUNICATIONS_KEY_FILE:path.join(DATA,'communications','key'),REALTALENT_COMMUNICATIONS_CONFIG:path.join(DATA,'communications','config.json'),REALTALENT_COMMUNICATIONS_MEDIA_DIR:path.join(DATA,'communications','media')}})
launch('prospecting',process.execPath,[path.join(crm,'scripts/realtalent-prospecting-agent.mjs')],{cwd:crm,env:{REALTALENT_PROSPECTING_AGENT_HOST:'127.0.0.1',REALTALENT_PROSPECTING_AGENT_PORT:'4319',REALTALENT_PROSPECTING_AGENT_STATE_DIR:path.join(DATA,'prospecting')}})

const services={
  agent:{name:'agent',port:8791,innerPort:8792,prefix:'/agent',header:'x-realtalent-agent-token',primaryEnv:'REALTALENT_AGENT_RUNTIME_TOKEN',previewEnv:'REALTALENT_PREVIEW_AGENT_RUNTIME_TOKEN'},
  communications:{name:'communications',port:3002,prefix:'/communications',header:'x-realtalent-runtime-token',primaryEnv:'REALTALENT_RUNTIME_TOKEN',previewEnv:'REALTALENT_PREVIEW_RUNTIME_TOKEN'},
  prospecting:{name:'prospecting',port:4319,prefix:'/prospecting',header:'x-realtalent-prospecting-token',primaryEnv:'REALTALENT_PROSPECTING_RUNTIME_TOKEN',previewEnv:'REALTALENT_PREVIEW_PROSPECTING_RUNTIME_TOKEN'}
}

const normalizePreviewCredential=(headers,service)=>{
  const supplied=String(headers[service.header]||'')
  const previewToken=String(process.env[service.previewEnv]||'')
  if(previewToken.length>=24 && supplied===previewToken){
    headers[service.header]=String(process.env[service.primaryEnv]||'')
  }
}

const normalizedServicePath=(req,service)=>{
  const parsed=new URL(String(req.url||'/'),`http://${req.headers.host||'localhost'}`)
  parsed.searchParams.delete('__rt_path')
  let pathname=parsed.pathname||'/'

  if(pathname===service.prefix) pathname='/'
  else if(pathname.startsWith(`${service.prefix}/`)) pathname=pathname.slice(service.prefix.length)||'/'

  // Defesa contra prefixo duplicado vindo de proxies/rewrite. `/agent` isolado é
  // uma rota legítima do Agent e por isso não é removido aqui.
  if(service.name==='agent'&&pathname.startsWith('/agent/')) pathname=pathname.slice('/agent'.length)||'/'

  const search=parsed.searchParams.toString()
  return `${pathname.startsWith('/')?pathname:`/${pathname}`}${search?`?${search}`:''}`
}

const targetPortFor=(service,pathSuffix)=>{
  if(service.name!=='agent') return service.port
  const pathname=new URL(pathSuffix,'http://agent.local').pathname
  // Somente estes dois endpoints precisam passar pelo fallback determinístico
  // quando não há LLM cloud. Todo o restante vai direto ao Agent original.
  if(pathname==='/language/interpret'||pathname==='/capabilities/plan') return service.port
  return service.innerPort
}

const proxy=(req,res,service)=>{
  const pathSuffix=normalizedServicePath(req,service)
  const targetPort=targetPortFor(service,pathSuffix)
  const headers={...req.headers,host:`127.0.0.1:${targetPort}`}
  normalizePreviewCredential(headers,service)
  delete headers.origin; delete headers.referer; delete headers['x-forwarded-host']; delete headers['x-forwarded-proto']; delete headers['x-vercel-id']

  const upstream=http.request({host:'127.0.0.1',port:targetPort,path:pathSuffix,method:req.method,headers},u=>{
    if((u.statusCode||500)>=400) console.warn(`[cloud-runtime] ${req.method} ${req.url||'/'} -> ${service.name}:${targetPort}${pathSuffix} status=${u.statusCode||0}`)
    res.writeHead(u.statusCode||502,u.headers);u.pipe(res)
  })
  upstream.on('error',err=>{
    console.error(`[cloud-runtime] upstream ${service.name}:${targetPort}${pathSuffix} indisponível: ${String(err.message||err)}`)
    if(!res.headersSent){res.statusCode=502;res.setHeader('content-type','application/json')}
    res.end(JSON.stringify({ok:false,error:'upstream_unavailable',service:service.name,message:String(err.message||err)}))
  })
  req.pipe(upstream)
}

const health=async()=>{
  const probes=await Promise.all(Object.entries(services).map(async([name,s])=>{
    try{
      const port=name==='agent'?s.innerPort:s.port
      const url=name==='prospecting'?`http://127.0.0.1:${port}/api/prospecting-agent/health`:`http://127.0.0.1:${port}${name==='communications'?'/api/communications/health':'/health'}`
      const header=name==='agent'?{'x-realtalent-agent-token':process.env.REALTALENT_AGENT_RUNTIME_TOKEN}:name==='communications'?{'x-realtalent-runtime-token':process.env.REALTALENT_RUNTIME_TOKEN}:{'x-realtalent-prospecting-token':process.env.REALTALENT_PROSPECTING_RUNTIME_TOKEN}
      const r=await fetch(url,{headers:header,signal:AbortSignal.timeout(2000)})
      return [name,{ok:r.ok,status:r.status}]
    }catch(error){return [name,{ok:false,error:String(error.message||error)}]}
  }))
  return Object.fromEntries(probes)
}

const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`).pathname
  if(pathname==='/health'){
    const servicesHealth=await health();const ok=Object.values(servicesHealth).every(v=>v.ok)
    res.statusCode=ok?200:503;res.setHeader('content-type','application/json');return res.end(JSON.stringify({ok,service:'realtalent-cloud-runtime',services:servicesHealth}))
  }
  for(const svc of Object.values(services)) if(pathname===svc.prefix||pathname.startsWith(`${svc.prefix}/`)) return proxy(req,res,svc)
  res.statusCode=404;res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:false,error:'route_not_found'}))
})

server.listen(PORT,'0.0.0.0',()=>console.log(`RealTalent Cloud Runtime em :${PORT}`))
const shutdown=()=>{if(shuttingDown)return;shuttingDown=true;server.close();for(const child of children)try{child.kill('SIGTERM')}catch{};setTimeout(()=>process.exit(0),1000).unref()}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown)
