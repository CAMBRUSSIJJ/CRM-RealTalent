#!/usr/bin/env node
/* RealTalent bridge: local loopback-only endpoint, requires a separate application secret. */
import http from 'node:http'
import {createHash,timingSafeEqual} from 'node:crypto'
import {createBrowserHandler} from './browser-connector.mjs'

const host='127.0.0.1'
const bridgePort=Number(process.env.REALTALENT_BRIDGE_PORT||8798)
const agentPort=Number(process.env.REALTALENT_AGENT_PORT||8792)
const secret=String(process.env.REALTALENT_AGENT_RUNTIME_TOKEN||'')
if(secret.length<32)throw Error('REALTALENT_AGENT_RUNTIME_TOKEN requires 32+ characters')
if(!Number.isInteger(bridgePort)||bridgePort<1024||bridgePort>65535||!Number.isInteger(agentPort)||agentPort<1024||agentPort>65535)throw Error('Invalid port')

const get=new Set(['/tools/health'])
const post=new Set(['/tools/chat','/tools/chat-stream','/tools/classify-work','/tools/revise-work','/tools/generate-script','/tools/research-script','/tools/research','/tools/route-intent','/tools/plan-readonly','/tools/workflow-plan','/tools/workflow-synthesize','/tools/prospect-investigate','/tools/garimpo-conversation','/capabilities/plan'])
const digest=v=>createHash('sha256').update(v).digest()
const expected=digest(secret)
function authorized(raw){
  if(typeof raw!=='string'||raw.length<32)return false
  return timingSafeEqual(expected,digest(raw))
}
const json=(res,status,code)=>{
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'})
  res.end(JSON.stringify({ok:false,error:code}))
}
const browserHandler=createBrowserHandler({bridgePort,agentPort})
const server=http.createServer((req,res)=>{
  if(browserHandler(req,res))return
  if(!authorized(req.headers['x-realtalent-agent-token']))return json(res,401,'unauthorized_bridge')
  let uri
  try{uri=new URL(req.url||'/',`http://${host}:${bridgePort}`)}catch{return json(res,400,'invalid_request')}
  const method=(req.method||'GET').toUpperCase()
  if(!((method==='GET'&&get.has(uri.pathname))||(method==='POST'&&post.has(uri.pathname))))return json(res,404,'not_found')
  if(Number(req.headers['content-length']||0)>1024*1024)return json(res,413,'body_too_large')
  let transferred=0
  let upstream
  const proxyHeaders={
    accept:String(req.headers.accept||'application/json'),
    ...(method==='POST'?{'content-type':String(req.headers['content-type']||'application/json')}:{}),
    'x-realtalent-user-id':String(req.headers['x-realtalent-user-id']||'').slice(0,128),
  }
  upstream=http.request({hostname:host,port:agentPort,method,path:uri.pathname+uri.search,headers:proxyHeaders},up=>{
    res.writeHead(up.statusCode||502,{'content-type':String(up.headers['content-type']||'application/json'),'cache-control':'no-store'})
    up.pipe(res)
  })
  upstream.setTimeout(180000,()=>upstream.destroy(new Error('agent_timeout')))
  upstream.on('error',()=>{if(!res.headersSent)json(res,502,'agent_offline');else res.destroy()})
  req.on('data',buffer=>{
    transferred+=buffer.length
    if(transferred>1024*1024){upstream.destroy();req.destroy()}
  })
  req.on('aborted',()=>upstream.destroy())
  req.pipe(upstream)
})
server.headersTimeout=12000
server.requestTimeout=190000
server.listen(bridgePort,host,()=>console.log('RealTalent authenticated AI bridge on localhost:'+bridgePort))
