import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { buildIntelligencePlan, selectRelevantMessages } from './intelligence-core.mjs'
import { classifyConversationTurn } from './conversation-intelligence.mjs'
import { classifyOrchestration } from './intelligence-orchestration.mjs'

const ROOT=path.dirname(fileURLToPath(import.meta.url))
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rt-v23-'))
const cfg=path.join(tmp,'config'),state=path.join(tmp,'state');fs.mkdirSync(cfg,{recursive:true});fs.mkdirSync(state,{recursive:true})
const ollamaPort=21400+Math.floor(Math.random()*400), agentPort=21900+Math.floor(Math.random()*400)
const modelCalls=[]
const mock=http.createServer(async(req,res)=>{
  if(req.url==='/api/tags'){res.setHeader('content-type','application/json');res.end(JSON.stringify({models:[{name:'fast-test:1b'},{name:'general-test:3b'},{name:'reason-test:4b'},{name:'coder-test:3b'}]}));return}
  if(req.url==='/api/generate'){res.setHeader('content-type','application/json');res.end(JSON.stringify({done:true}));return}
  if(req.url==='/api/chat'&&req.method==='POST'){
    const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks).toString()||'{}');modelCalls.push(body.model)
    const props=body.format?.properties||{};let value
    if(props.verdict){
      let candidate='';try{const u=JSON.parse(body.messages?.[1]?.content||'{}');candidate=String(u.candidate_answer||'')}catch{}
      value={verdict:'pass',confidence:.96,issues:[],repaired_answer:candidate||'Resposta verificada'}
    }else if(props.mode){
      value={mode:'ASK',target_product:'crm',message:`Resposta pelo ${body.model}`,summary:'selftest V2.3',action:null,suggested_prompts:[]}
    }else value={ok:true}
    res.setHeader('content-type','application/json');res.end(JSON.stringify({model:body.model,created_at:new Date().toISOString(),message:{role:'assistant',content:JSON.stringify(value)},done:true}));return
  }
  res.writeHead(404);res.end('{}')
})
await new Promise(r=>mock.listen(ollamaPort,'127.0.0.1',r))
const env={...process.env,HOME:tmp,XDG_CONFIG_HOME:cfg,XDG_STATE_HOME:state,REALTALENT_AGENT_PORT:String(agentPort),REALTALENT_AGENT_HOST:'127.0.0.1',REALTALENT_AI_PROVIDER:'ollama',OLLAMA_URL:`http://127.0.0.1:${ollamaPort}`,OLLAMA_MODEL:'coder-test:3b',OLLAMA_FAST_MODEL:'fast-test:1b',OLLAMA_GENERAL_MODEL:'general-test:3b',OLLAMA_REASONING_MODEL:'reason-test:4b',OLLAMA_CODER_MODEL:'coder-test:3b',OLLAMA_VISION_MODEL:'',OPENAI_API_KEY:''}
const child=spawn(process.execPath,[path.join(ROOT,'gateway.mjs')],{env,stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d)
const base=`http://127.0.0.1:${agentPort}`;const sleep=ms=>new Promise(r=>setTimeout(r,ms));for(let i=0;i<160;i++){try{const r=await fetch(base+'/health');if(r.ok)break}catch{}await sleep(50)}
const checks=[];const t=(name,pass)=>{checks.push([name,Boolean(pass)]);console.log(`${pass?'OK  ':'FAIL'} ${name}`)}
const json=async(url,opts={})=>{const r=await fetch(base+url,{headers:{'content-type':'application/json',...(opts.headers||{})},...opts});let x={};try{x=await r.json()}catch{}return {r,x}}
try{
  let z=await json('/health');t('health V2.7 preserva Intelligence Core V2.3',z.r.ok&&z.x.version==='3.1'&&z.x.intelligenceCore?.version==='2.7')
  z=await json('/intelligence-core');t('endpoint descreve capacidades cognitivas',z.r.ok&&z.x.intelligenceCore?.features?.complexityClassifier&&z.x.intelligenceCore?.features?.responseVerifier)
  z=await json('/intelligence-core/classify',{method:'POST',body:JSON.stringify({message:'oi',product:'crm'})});t('mensagem simples usa Instant/Fast',z.r.ok&&z.x.intelligenceCore?.complexity?.tier==='instant'&&z.x.intelligenceCore?.model?.role==='fast')
  z=await json('/intelligence-core/classify',{method:'POST',body:JSON.stringify({message:'Compare três arquiteturas, avalie trade-offs, riscos e priorize a melhor decisão com evidências',product:'crm'})});t('problema complexo usa Deep/Reasoning',z.r.ok&&z.x.intelligenceCore?.complexity?.tier==='deep'&&z.x.intelligenceCore?.model?.role==='reasoning'&&z.x.intelligenceCore?.verification?.required===true)
  z=await json('/intelligence-core/classify',{method:'POST',body:JSON.stringify({message:'Corrija este código TypeScript e prepare o patch do bug',product:'crm'})});t('pedido de código usa Coder',z.r.ok&&z.x.intelligenceCore?.model?.role==='coder')
  z=await json('/intelligence-core/classify',{method:'POST',body:JSON.stringify({message:'analise',product:'crm',attachments:[{name:'print.png',type:'image/png',dataUrl:'data:image/png;base64,iVBORw0KGgo='}]})});t('imagem sem Vision local não é fingida como visão',z.r.ok&&z.x.turn?.intent==='attachment_analysis'&&z.x.intelligenceCore?.model?.role!=='vision')

  const hist=[{role:'user',content:'meu gato está miando à noite'},{role:'assistant',content:'entendi'},{role:'user',content:'o pipeline comercial tem oportunidades paradas'},{role:'assistant',content:'podemos priorizar o pipeline'}]
  const rel=selectRelevantMessages({messages:hist,query:'como melhorar o pipeline e as oportunidades?',limit:2});t('Context Engine prioriza relevância e não só posição',rel.some(x=>x.content.includes('pipeline'))&&!rel.some(x=>x.content.includes('gato')))
  const shifted=selectRelevantMessages({messages:hist,query:'outro assunto',limit:6,topicShift:true});t('mudança de assunto faz hard reset do contexto',shifted.length===0)
  const turn=classifyConversationTurn({message:'isso',messages:[],product:'crm'});const orch=classifyOrchestration({message:'isso',product:'crm',conversationPlan:turn});const core=buildIntelligencePlan({message:'isso',turnPlan:turn,orchestration:orch});t('referência vaga sem evidência fica não resolvida',turn.reference?.source==='unresolved'&&core.verification?.required===true)

  modelCalls.length=0;z=await json('/agent',{method:'POST',body:JSON.stringify({product:'crm',surface:'crm',prompt:'oi',context:{}})});t('/agent simples usa modelo Fast',z.r.ok&&z.x.intelligenceCore?.model?.role==='fast'&&z.x.model==='fast-test:1b'&&modelCalls.includes('fast-test:1b'))
  modelCalls.length=0;z=await json('/agent',{method:'POST',body:JSON.stringify({product:'crm',surface:'crm',prompt:'Por que uma empresa pode perder eficiência quando centraliza todas as decisões em uma pessoa? Primeiro considere a causa organizacional e as consequências para velocidade e autonomia; depois considere o impacto sobre aprendizado e responsabilidade; por fim explique de forma coerente como esses fatores se relacionam sem assumir dados que não foram fornecidos.',context:{}})});t('/agent complexo usa Reasoning + Verifier',z.r.ok&&z.x.intelligenceCore?.model?.role==='reasoning'&&z.x.model==='reason-test:4b'&&z.x.verification?.mode==='critic'&&modelCalls.filter(x=>x==='reason-test:4b').length>=2)

  const ok=checks.filter(x=>x[1]).length;console.log(`\nRealTalent Agent V2.7 compatibilidade Intelligence Core V2.3: ${ok}/${checks.length} PASS`);if(ok!==checks.length)process.exitCode=1
}finally{child.kill('SIGTERM');await sleep(100);try{child.kill('SIGKILL')}catch{};mock.close();fs.rmSync(tmp,{recursive:true,force:true})}
