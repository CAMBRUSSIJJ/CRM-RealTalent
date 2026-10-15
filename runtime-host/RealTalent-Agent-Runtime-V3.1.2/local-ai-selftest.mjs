import http from 'node:http'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rt-ai-v11-'))
const config=path.join(temp,'config'), state=path.join(temp,'state'); fs.mkdirSync(config,{recursive:true}); fs.mkdirSync(state,{recursive:true})
const ollamaPort=12500+Math.floor(Math.random()*500), agentPort=13000+Math.floor(Math.random()*500)
let chatCalls=0, imageCalls=0
const mock=http.createServer(async(req,res)=>{
  if(req.url==='/api/tags'){res.setHeader('content-type','application/json');res.end(JSON.stringify({models:[{name:'qwen2.5-coder:7b'}]}));return}
  if(req.url==='/api/chat'&&req.method==='POST'){
    const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks).toString()||'{}');chatCalls++
    if(body.messages?.some(m=>Array.isArray(m.images)&&m.images.length))imageCalls++
    const props=body.format?.properties||{}
    let value
    if(props.mode)value={mode:'ASK',target_product:'crm',message:'Resposta local OK',summary:'local',action:null,suggested_prompts:[]}
    else if(props.steps)value={title:'Workflow local',summary:'Plano local',steps:[{kind:'analyze',title:'Analisar',objective:'Verificar contexto',failure_policy:'stop'}]}
    else if(props.legs)value={title:'Missão local',summary:'Plano local',legs:[{product:'crm',title:'CRM',objective:'Analisar CRM',failure_policy:'stop'}]}
    else if(props.stages)value={title:'Programa local',summary:'Plano local',stages:[{title:'Marco',objective:'Analisar produto',priority:'normal',failure_policy:'stop',depends_on:[],acceptance_criteria:['Relatório produzido']}]}
    else if(props.status)value={status:'passed',summary:'QA textual local',evidence:'texto visível suficiente',confidence:.8,action:{type:'none',target:'',value:'',role:'',exact:false,amount:0,milliseconds:0,rationale:'concluído'}}
    else if(props.changes)value={summary:'Sem patch',risk:'low',rationale:'selftest',changes:[],qa_objective:'validar'}
    else value={ok:true}
    res.setHeader('content-type','application/json');res.end(JSON.stringify({model:body.model,created_at:new Date().toISOString(),message:{role:'assistant',content:JSON.stringify(value)},done:true}));return
  }
  res.writeHead(404);res.end('{}')
})
await new Promise(r=>mock.listen(ollamaPort,'127.0.0.1',r))
const child=spawn(process.execPath,[new URL('./gateway.mjs',import.meta.url).pathname],{env:{...process.env,XDG_CONFIG_HOME:config,XDG_STATE_HOME:state,REALTALENT_AGENT_PORT:String(agentPort),REALTALENT_AGENT_HOST:'127.0.0.1',REALTALENT_AI_PROVIDER:'ollama',OLLAMA_URL:`http://127.0.0.1:${ollamaPort}`,OLLAMA_MODEL:'qwen2.5-coder:7b',OLLAMA_VISION_MODEL:'',OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']})
let logs='';child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c)
const base=`http://127.0.0.1:${agentPort}`
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
for(let i=0;i<80;i++){try{const r=await fetch(base+'/health');if(r.ok)break}catch{}await sleep(50)}
let ok=0,total=0;const check=(name,pass)=>{total++;console.log(`${pass?'OK  ':'FAIL'} ${name}`);if(pass)ok++}
const json=async(url,opt)=>{const r=await fetch(base+url,{headers:{'content-type':'application/json'},...opt});return {r,x:await r.json()}}
try{
  let z=await json('/health');check('health V2.7 local-first',z.r.ok&&z.x.version==='3.1'&&z.x.provider==='ollama'&&z.x.ai?.costMode==='local-no-token-billing')
  z=await json('/ai/status');check('Ollama detectado online',z.r.ok&&z.x.local?.online&&z.x.local?.models?.includes('qwen2.5-coder:7b'))
  z=await json('/agent',{method:'POST',body:JSON.stringify({product:'crm',prompt:'teste local',context:{},allowed_tools:[]})});check('conversa usa provider local',z.r.ok&&z.x.provider==='ollama'&&z.x.message==='Resposta local OK')
  z=await json('/workflows/run',{method:'POST',body:JSON.stringify({product:'crm',objective:'teste workflow local',context:{},allowed_tools:[]})});check('workflow planner usa Ollama',z.r.status===202&&z.x.workflow?.title==='Workflow local')
  z=await json('/missions/run',{method:'POST',body:JSON.stringify({objective:'teste missão local',current_product:'crm',context:{}})});check('mission planner usa Ollama',z.r.status===202&&z.x.mission?.title==='Missão local')
  const tiny=Buffer.from('fake').toString('base64')
  z=await json('/browser/step',{method:'POST',body:JSON.stringify({product:'crm',objective:'qa local',url:'http://127.0.0.1:4188/',screenshot_base64:tiny,visible_text:'Página OK',console_errors:[],network_failures:[],history:[]})});check('Browser QA local funciona sem modelo de visão',z.r.ok&&z.x.provider==='ollama'&&z.x.status==='passed'&&imageCalls===0)
  check('nenhuma OPENAI_API_KEY necessária',chatCalls>=4&&!logs.includes('OPENAI_API_KEY não configurada'))
} finally {child.kill('SIGTERM');mock.close()}
console.log(`\nLocal AI V1.6: ${ok}/${total} testes aprovados.`);if(ok!==total)process.exit(1)
