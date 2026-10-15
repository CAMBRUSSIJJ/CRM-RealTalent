import http from 'node:http'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rt-intel-v12-'))
const config=path.join(temp,'config'), state=path.join(temp,'state'); fs.mkdirSync(config,{recursive:true}); fs.mkdirSync(state,{recursive:true})
const ollamaPort=13500+Math.floor(Math.random()*400), agentPort=14000+Math.floor(Math.random()*400)
const seenModels=[]
const mock=http.createServer(async(req,res)=>{
  if(req.url==='/api/tags'){res.setHeader('content-type','application/json');res.end(JSON.stringify({models:[{name:'fast:1b'},{name:'coder:3b'},{name:'reason:7b'},{name:'main:3b'}]}));return}
  if(req.url==='/api/chat'&&req.method==='POST'){
    const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks).toString()||'{}');seenModels.push(body.model)
    const props=body.format?.properties||{}; let value
    if(props.mode)value={mode:'ASK',target_product:'crm',message:'Resposta V1.6',summary:'ok',action:null,suggested_prompts:[]}
    else if(props.steps)value={title:'Workflow V1.6',summary:'router reasoning',steps:[{kind:'analyze',title:'Analisar',objective:'Verificar',failure_policy:'stop'}]}
    else if(props.changes)value={summary:'Sem patch',risk:'low',rationale:'teste',changes:[],qa_objective:'validar'}
    else if(props.status)value={status:'passed',summary:'QA local',evidence:'DOM suficiente',confidence:.9,action:{type:'none',target:'',value:'',role:'',exact:false,amount:0,milliseconds:0,rationale:'fim'}}
    else value={ok:true}
    res.setHeader('content-type','application/json');res.end(JSON.stringify({model:body.model,created_at:new Date().toISOString(),message:{role:'assistant',content:JSON.stringify(value)},done:true}));return
  }
  res.writeHead(404);res.end('{}')
})
await new Promise(r=>mock.listen(ollamaPort,'127.0.0.1',r))
const child=spawn(process.execPath,[new URL('./gateway.mjs',import.meta.url).pathname],{env:{...process.env,XDG_CONFIG_HOME:config,XDG_STATE_HOME:state,REALTALENT_AGENT_PORT:String(agentPort),REALTALENT_AGENT_HOST:'127.0.0.1',REALTALENT_AI_PROVIDER:'ollama',OLLAMA_URL:`http://127.0.0.1:${ollamaPort}`,OLLAMA_MODEL:'main:3b',OLLAMA_FAST_MODEL:'fast:1b',OLLAMA_CODER_MODEL:'coder:3b',OLLAMA_REASONING_MODEL:'reason:7b',OLLAMA_VISION_MODEL:'',OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']})
let logs='';child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c)
const base=`http://127.0.0.1:${agentPort}`;const sleep=ms=>new Promise(r=>setTimeout(r,ms))
for(let i=0;i<100;i++){try{const r=await fetch(base+'/health');if(r.ok)break}catch{}await sleep(40)}
let ok=0,total=0;const check=(name,pass)=>{total++;console.log(`${pass?'OK  ':'FAIL'} ${name}`);if(pass)ok++}
const json=async(url,opt={})=>{const r=await fetch(base+url,{headers:{'content-type':'application/json'},...opt});let x={};try{x=await r.json()}catch{}return {r,x}}
try{
  let z=await json('/health');check('health V1.6',z.r.ok&&z.x.version==='3.1'&&z.x.architecture==='realtalent-intelligence-platform-v3')
  z=await json('/ai/hardware');check('hardware profiler',z.r.ok&&z.x.hardware?.memory?.totalGB>0&&['light','balanced','performance'].includes(z.x.hardware?.profile))
  z=await json('/ai/status');check('model router expõe papéis',z.r.ok&&z.x.local?.roles?.fast==='fast:1b'&&z.x.local?.roles?.coder==='coder:3b'&&z.x.local?.roles?.reasoning==='reason:7b')
  const huge='x'.repeat(120000)
  z=await json('/agent',{method:'POST',body:JSON.stringify({product:'crm',prompt:'responda',context:{id:'lead_1',status:'open',huge},allowed_tools:[]})});check('chat usa modelo fast',z.r.ok&&z.x.model==='fast:1b'&&z.x.message==='Resposta V1.6')
  z=await json('/workflows/run',{method:'POST',body:JSON.stringify({product:'crm',objective:'analisar fluxo',context:{},allowed_tools:[]})});check('planner usa modelo reasoning',z.r.status===202&&seenModels.includes('reason:7b'))
  z=await json('/builder/patch',{method:'POST',body:JSON.stringify({product:'crm',objective:'ajustar texto',files:[{path:'src/a.tsx',content:'export const A = () => <div>Texto original seguro</div>;',matched_terms:['texto']}],attempt:1})});check('builder usa modelo coder',z.r.ok&&z.x.model==='coder:3b')
  z=await json('/ai/telemetry');const last=z.x.telemetry?.calls||[];check('telemetria e contexto limitado',z.r.ok&&last.some(x=>x.taskType==='fast'&&x.inputChars<70000)&&last.some(x=>x.taskType==='builder'&&x.model==='coder:3b'))
  z=await json('/intelligence/classify',{method:'POST',body:JSON.stringify({objective:'Preparar todo o CRM para comercialização',product:'crm'})});check('classificador estratégico -> program',z.r.ok&&z.x.route?.kind==='program')
  z=await json('/intelligence/classify',{method:'POST',body:JSON.stringify({objective:'Sincronizar CRM e Blue Ocean em um fluxo completo',product:'both'})});check('classificador transversal -> mission',z.r.ok&&z.x.route?.kind==='mission')
  z=await json('/intelligence/classify',{method:'POST',body:JSON.stringify({objective:'Corrigir layout da tela de Contatos',product:'crm'})});check('classificador específico -> builder',z.r.ok&&z.x.route?.kind==='builder')
  z=await json('/intelligence/classify',{method:'POST',body:JSON.stringify({objective:'Validar a tela do CRM sem alterar nada',product:'crm'})});check('classificador verificação -> qa',z.r.ok&&z.x.route?.kind==='qa')
  z=await json('/intelligence');check('intelligence summary',z.r.ok&&z.x.intelligence?.builderSandbox?.enabled&&z.x.intelligence?.contextEngine?.enabled)
  check('OpenAI não foi necessária',!logs.includes('OPENAI_API_KEY não configurada'))
} finally {child.kill('SIGTERM');mock.close()}
console.log(`\nIntelligence V1.6: ${ok}/${total} testes aprovados.`);if(ok!==total)process.exit(1)
