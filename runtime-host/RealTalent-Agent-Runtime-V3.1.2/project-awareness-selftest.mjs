import http from 'node:http'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rt-awareness-v15-'))
const config=path.join(temp,'config'),state=path.join(temp,'state'),crm=path.join(temp,'crm'),blue=path.join(temp,'blue')
for(const d of [config,state,crm,blue])fs.mkdirSync(d,{recursive:true})
const put=(root,rel,text)=>{const f=path.join(root,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,text)}
put(crm,'package.json',JSON.stringify({name:'realtalent-crm',version:'test'}))
put(crm,'src/features/communications/whatsapp-chat-panel.tsx',`import { sendMessage } from '../../services/whatsapp-service'\nexport function WhatsAppChatPanel(){ return sendMessage('hello') }`)
put(crm,'src/services/whatsapp-service.ts',`import { subscribe } from './whatsapp-subscription'\nexport function sendMessage(v:string){ subscribe(); return v }`)
put(crm,'src/services/whatsapp-subscription.ts',`export function subscribe(){ window.addEventListener('message',()=>{}); window.addEventListener('message',()=>{}) } // TODO dedupe listener`)
put(crm,'src/features/dashboard/widget.tsx',`import { WhatsAppChatPanel } from '../communications/whatsapp-chat-panel'\nexport const Widget=WhatsAppChatPanel`)
put(crm,'src/features/communications/whatsapp-service.test.ts',`export const ok=true`)
put(blue,'package.json',JSON.stringify({name:'blue-ocean-service-studio',version:'test'}))
put(blue,'src/views/BlueprintView.tsx',`import { serviceGraph } from '../domain/serviceGraph'\nexport function BlueprintView(){return serviceGraph()}`)
put(blue,'src/domain/serviceGraph.ts',`export function serviceGraph(){return {frontstage:[],backstage:[]}}`)
const cfgDir=path.join(config,'realtalent-agent');fs.mkdirSync(cfgDir,{recursive:true});fs.writeFileSync(path.join(cfgDir,'workspaces.json'),JSON.stringify({crm,blue_ocean:blue}))

const ollamaPort=18100+Math.floor(Math.random()*300),agentPort=18500+Math.floor(Math.random()*300)
let sawAwareness=false
const mock=http.createServer(async(req,res)=>{
  if(req.url==='/api/tags'){res.setHeader('content-type','application/json');res.end(JSON.stringify({models:[{name:'local:3b'}]}));return}
  if(req.url==='/api/chat'&&req.method==='POST'){
    const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks).toString()||'{}');
    const joined=JSON.stringify(body);if(joined.includes('project_awareness')&&joined.includes('whatsapp'))sawAwareness=true
    if(body.stream){res.setHeader('content-type','application/x-ndjson');res.write(JSON.stringify({message:{content:'Encontrei contexto técnico do WhatsApp. '},done:false})+'\n');res.end(JSON.stringify({message:{content:'Vou diferenciar análise estática de runtime.'},done:true})+'\n');return}
    const props=body.format?.properties||{};let value
    if(props.primary_hypothesis)value={primary_hypothesis:'Listener duplicado é uma hipótese prioritária.',confidence:.62,rationale:'Há dois registros addEventListener no arquivo de subscription.',evidence_paths:['src/services/whatsapp-subscription.ts'],tests:['Instrumentar contagem de listeners','Reproduzir envio uma vez'],do_not_change_yet:true}
    else if(props.mode)value={mode:'ASK',target_product:'crm',message:'Resposta',summary:'ok',action:null,suggested_prompts:[]}
    else value={ok:true}
    res.setHeader('content-type','application/json');res.end(JSON.stringify({model:body.model,created_at:new Date().toISOString(),message:{role:'assistant',content:JSON.stringify(value)},done:true}));return
  }
  res.writeHead(404);res.end('{}')
})
await new Promise(r=>mock.listen(ollamaPort,'127.0.0.1',r))
const child=spawn(process.execPath,[new URL('./gateway.mjs',import.meta.url).pathname],{env:{...process.env,XDG_CONFIG_HOME:config,XDG_STATE_HOME:state,REALTALENT_AGENT_PORT:String(agentPort),REALTALENT_AGENT_HOST:'127.0.0.1',REALTALENT_AI_PROVIDER:'ollama',OLLAMA_URL:`http://127.0.0.1:${ollamaPort}`,OLLAMA_MODEL:'local:3b',OLLAMA_FAST_MODEL:'local:3b',OLLAMA_CODER_MODEL:'local:3b',OLLAMA_REASONING_MODEL:'local:3b',OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']})
let logs='';child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c)
const base=`http://127.0.0.1:${agentPort}`,sleep=ms=>new Promise(r=>setTimeout(r,ms))
for(let i=0;i<120;i++){try{const r=await fetch(base+'/health');if(r.ok)break}catch{}await sleep(40)}
const json=async(url,opt={})=>{const r=await fetch(base+url,{headers:{'content-type':'application/json'},...opt});let x={};try{x=await r.json()}catch{}return {r,x}}
let ok=0,total=0;const check=(name,pass)=>{total++;console.log(`${pass?'OK  ':'FAIL'} ${name}`);if(pass)ok++}
try{
  let z=await json('/health');check('runtime V1.6 project-aware',z.r.ok&&z.x.version==='3.1'&&z.x.projectAwareness?.enabled===true)
  z=await json('/project-awareness/index',{method:'POST',body:JSON.stringify({product:'all'})});check('indexa CRM + Blue Ocean',z.r.ok&&z.x.built?.every(x=>x.ok)&&z.x.built?.length===2)
  z=await json('/project-awareness/status');check('status expõe Code Graph',z.r.ok&&z.x.projectAwareness?.products?.crm?.stats?.edges>=3&&z.x.projectAwareness?.products?.blue_ocean?.stats?.files>=2)
  z=await json('/project-awareness/search?product=crm&q='+encodeURIComponent('WhatsApp listener duplicado')+'&limit=6');check('busca técnica encontra communications',z.r.ok&&z.x.results?.some(x=>x.path.includes('whatsapp')))
  z=await json('/project-awareness/impact',{method:'POST',body:JSON.stringify({product:'crm',target:'src/services/whatsapp-subscription.ts',depth:2})});check('impacto encontra dependentes transitivos',z.r.ok&&z.x.impact?.affectedFiles?.some(x=>x.includes('whatsapp-service.ts'))&&z.x.impact?.affectedFiles?.some(x=>x.includes('whatsapp-chat-panel.tsx')))
  z=await json('/project-awareness/root-cause',{method:'POST',body:JSON.stringify({product:'crm',symptom:'WhatsApp envia mensagens duplicadas'})});check('Root Cause Engine mantém hipótese + teste',z.r.ok&&z.x.result?.analysis?.do_not_change_yet===true&&z.x.result?.analysis?.tests?.length>=1&&z.x.result?.disclaimer)
  z=await json('/project-awareness/explain',{method:'POST',body:JSON.stringify({product:'blue_ocean',query:'Blueprint service graph'})});check('Explain Area localiza Blueprint',z.r.ok&&z.x.explanation?.summary?.files?.some(x=>x.includes('BlueprintView')))
  z=await json('/project-awareness/health?product=crm');check('Health Map é explicitamente estrutural',z.r.ok&&z.x.health?.method==='static-structural'&&/não prova funcionamento/i.test(z.x.health?.disclaimer||''))
  z=await json('/project-awareness/history?product=crm');check('histórico técnico registra investigação',z.r.ok&&z.x.history?.some(x=>x.kind==='root_cause'))
  let c=await json('/chat/conversations',{method:'POST',body:JSON.stringify({productScope:'crm'})});const id=c.x.conversation?.id
  const r=await fetch(base+`/chat/conversations/${encodeURIComponent(id)}/messages/stream`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'Onde está implementado o WhatsApp?',product:'crm',mode:'ask'})});const text=await r.text();check('chat responde com streaming',r.ok&&text.includes('Encontrei contexto técnico'))
  check('chat injeta Project Awareness no modelo',sawAwareness)
  z=await json('/control/state');check('Control Center recebe Health Map',z.r.ok&&z.x.projectAwareness?.products?.crm?.health?.length>=1)
} finally {child.kill('SIGTERM');mock.close()}
console.log(`\nProject Awareness V1.6: ${ok}/${total} testes aprovados.`)
if(ok!==total){console.error(logs.slice(-5000));process.exit(1)}
