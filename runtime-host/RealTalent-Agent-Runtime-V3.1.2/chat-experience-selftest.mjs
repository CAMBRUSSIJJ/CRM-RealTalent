import http from 'node:http'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rt-chat-v13-'))
const config=path.join(temp,'config'),state=path.join(temp,'state');fs.mkdirSync(config,{recursive:true});fs.mkdirSync(state,{recursive:true})
const ollamaPort=14500+Math.floor(Math.random()*300),agentPort=14900+Math.floor(Math.random()*300)
let chatCalls=0,imageCalls=0
const mock=http.createServer(async(req,res)=>{
  if(req.url==='/api/tags'){res.setHeader('content-type','application/json');res.end(JSON.stringify({models:[{name:'qwen2.5-coder:3b'}]}));return}
  if(req.url==='/api/chat'&&req.method==='POST'){
    const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks).toString()||'{}');chatCalls++
    if(body.messages?.some(m=>Array.isArray(m.images)&&m.images.length))imageCalls++
    const props=body.format?.properties||{};let value
    if(props.mode)value={mode:'ASK',target_product:'crm',message:'Resposta do chat local V1.6',summary:'chat local',action:null,suggested_prompts:['Continuar']}
    else if(props.steps)value={title:'Workflow via chat',summary:'Plano criado pelo chat',steps:[{kind:'analyze',title:'Diagnóstico',objective:'Analisar contexto',failure_policy:'stop'}]}
    else if(props.legs)value={title:'Missão chat',summary:'Plano',legs:[{product:'crm',title:'CRM',objective:'Analisar CRM',failure_policy:'stop'}]}
    else if(props.stages)value={title:'Programa chat',summary:'Plano',stages:[{title:'Marco',objective:'Analisar',priority:'normal',failure_policy:'stop',depends_on:[],acceptance_criteria:['Relatório']}]}
    else value={ok:true}
    res.setHeader('content-type','application/json');res.end(JSON.stringify({model:body.model,created_at:new Date().toISOString(),message:{role:'assistant',content:JSON.stringify(value)},done:true}));return
  }
  res.writeHead(404);res.end('{}')
})
await new Promise(r=>mock.listen(ollamaPort,'127.0.0.1',r))
const child=spawn(process.execPath,[new URL('./gateway.mjs',import.meta.url).pathname],{env:{...process.env,XDG_CONFIG_HOME:config,XDG_STATE_HOME:state,REALTALENT_AGENT_PORT:String(agentPort),REALTALENT_AGENT_HOST:'127.0.0.1',REALTALENT_AI_PROVIDER:'ollama',OLLAMA_URL:`http://127.0.0.1:${ollamaPort}`,OLLAMA_MODEL:'qwen2.5-coder:3b',OLLAMA_FAST_MODEL:'qwen2.5-coder:3b',OLLAMA_REASONING_MODEL:'qwen2.5-coder:3b',OLLAMA_CODER_MODEL:'qwen2.5-coder:3b',OLLAMA_VISION_MODEL:'',OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']})
let logs='';child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c)
const base=`http://127.0.0.1:${agentPort}`,sleep=ms=>new Promise(r=>setTimeout(r,ms))
for(let i=0;i<100;i++){try{const r=await fetch(base+'/health');if(r.ok)break}catch{}await sleep(40)}
let ok=0,total=0;const check=(name,pass)=>{total++;console.log(`${pass?'OK  ':'FAIL'} ${name}`);if(pass)ok++}
const json=async(url,opt={})=>{const r=await fetch(base+url,{headers:{'content-type':'application/json'},...opt});return {r,x:await r.json()}}
try{
  let z=await json('/health');check('health V3.1 workbench',z.r.ok&&z.x.version==='3.1'&&z.x.architecture==='realtalent-intelligence-platform-v3'&&z.x.modes?.includes('CHAT'))
  let r=await fetch(base+'/chat');const html=await r.text();check('Chat Experience HTML',r.ok&&html.includes('Como posso ajudar no seu trabalho?')&&html.includes('Modo técnico'))
  z=await json('/chat/conversations',{method:'POST',body:JSON.stringify({productScope:'auto'})});const id=z.x.conversation?.id;check('cria conversa persistente',z.r.status===201&&String(id).startsWith('chat_'))
  z=await json(`/chat/conversations/${encodeURIComponent(id)}/messages`,{method:'POST',body:JSON.stringify({message:'O que você acha do CRM?',product:'crm',mode:'auto'})});check('pergunta simples responde no chat',z.r.ok&&z.x.conversation?.messages?.at(-1)?.content==='Resposta do chat local V1.6'&&chatCalls>=1)
  z=await json(`/chat/conversations/${encodeURIComponent(id)}/messages`,{method:'POST',body:JSON.stringify({message:'Analise o CRM inteiro e priorize o que impede a comercialização.',product:'crm',mode:'auto'})});const last=z.x.conversation?.messages?.at(-1);check('pedido de análise usa Tool-First sem workflow inventado',z.r.ok&&last?.metadata?.orchestration?.kind==='analysis_job'&&last?.metadata?.evidenceGate&&last?.metadata?.evidenceGate?.policy==='tool-first-required')
  z=await json(`/chat/state?conversation_id=${encodeURIComponent(id)}`);check('estado do chat permanece íntegro após análise Tool-First',z.r.ok&&z.x.conversation?.id===id&&z.x.workbench?.intelligenceOrchestration?.features?.toolFirstPolicy===true)
  const img='data:image/png;base64,'+Buffer.from('fake').toString('base64');z=await json(`/chat/conversations/${encodeURIComponent(id)}/messages`,{method:'POST',body:JSON.stringify({message:'O que há neste anexo?',product:'crm',mode:'ask',attachments:[{name:'print.png',type:'image/png',size:4,data_url:img}]})});check('anexo de imagem sem visão usa fallback seguro',z.r.ok&&z.x.conversation?.messages?.at(-2)?.attachments?.[0]?.name==='print.png'&&imageCalls===0)
  z=await json('/chat/conversations');check('histórico lista conversa com título automático',z.r.ok&&z.x.conversations?.[0]?.id===id&&z.x.conversations?.[0]?.title!=='Novo chat')
  r=await fetch(base+'/control');const control=await r.text();check('Control Center técnico preservado',r.ok&&control.includes('Modo técnico')&&control.includes('Abrir Chat'))
  check('nenhuma chave OpenAI necessária',!logs.includes('OPENAI_API_KEY não configurada'))
}finally{child.kill('SIGTERM');mock.close()}
console.log(`\nChat Experience V2.7: ${ok}/${total} testes aprovados.`);if(ok!==total)process.exit(1)
