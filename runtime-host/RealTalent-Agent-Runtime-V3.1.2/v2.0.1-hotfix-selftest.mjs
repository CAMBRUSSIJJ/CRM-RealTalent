import http from 'node:http'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { classifyConversationTurn, contextWindowForTurn } from './conversation-intelligence.mjs'

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rt-v201-hotfix-'))
const config=path.join(temp,'config'),state=path.join(temp,'state')
fs.mkdirSync(config,{recursive:true});fs.mkdirSync(state,{recursive:true})
const ollamaPort=21000+Math.floor(Math.random()*300),agentPort=21400+Math.floor(Math.random()*300)
let calls=[]
const mock=http.createServer(async(req,res)=>{
  if(req.url==='/api/tags'){res.setHeader('content-type','application/json');res.end(JSON.stringify({models:[{name:'local:3b'}]}));return}
  if(req.url==='/api/chat'&&req.method==='POST'){
    const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks).toString()||'{}')
    let payload={};try{payload=JSON.parse(body.messages?.at(-1)?.content||'{}')}catch{}
    calls.push({...payload,__stream:Boolean(body.stream)})
    const prompt=String(payload.prompt||'').toLowerCase(),repair=String(payload.generation_note||'').includes('REPARO OBRIGATÓRIO')
    let answer='Resposta local normal.'
    if(prompt.includes('como posso me amar'))answer=repair?'Você pode desenvolver amor próprio praticando mais gentileza consigo, reconhecendo suas necessidades e reduzindo a autocrítica.':'Desculpe, mas não posso me amar.'
    if(prompt.includes('o que é amar')||prompt.includes('o que e amar'))answer=repair?'Amar é cuidar, respeitar e considerar o bem-estar de alguém ou de si, combinando afeto, presença e compromisso.':'Como IA, não posso amar.'
    res.setHeader('content-type','application/x-ndjson');const mid=Math.ceil(answer.length/2);res.write(JSON.stringify({message:{content:answer.slice(0,mid)},done:false})+'\n');res.end(JSON.stringify({message:{content:answer.slice(mid)},done:true})+'\n');return
  }
  res.writeHead(404);res.end('{}')
})
await new Promise(r=>mock.listen(ollamaPort,'127.0.0.1',r))
const child=spawn(process.execPath,[new URL('./gateway.mjs',import.meta.url).pathname],{env:{...process.env,XDG_CONFIG_HOME:config,XDG_STATE_HOME:state,REALTALENT_AGENT_PORT:String(agentPort),REALTALENT_AGENT_HOST:'127.0.0.1',REALTALENT_AI_PROVIDER:'ollama',OLLAMA_URL:`http://127.0.0.1:${ollamaPort}`,OLLAMA_MODEL:'local:3b',OLLAMA_FAST_MODEL:'local:3b',OLLAMA_CODER_MODEL:'local:3b',OLLAMA_REASONING_MODEL:'local:3b',OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']})
let logs='';child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c)
const base=`http://127.0.0.1:${agentPort}`,sleep=ms=>new Promise(r=>setTimeout(r,ms));for(let i=0;i<120;i++){try{if((await fetch(base+'/health')).ok)break}catch{}await sleep(40)}
let ok=0,total=0;const check=(name,pass)=>{total++;console.log(`${pass?'OK  ':'FAIL'} ${name}`);if(pass)ok++}
const json=async(url,opt={})=>{const r=await fetch(base+url,{headers:{'content-type':'application/json'},...opt});return {r,x:await r.json()}}
const stream=async(id,message)=>{const r=await fetch(base+`/chat/conversations/${encodeURIComponent(id)}/messages/stream`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message,product:'auto',mode:'ask'})});return {r,text:await r.text()}}
try{
  const history=[{role:'user',content:'o que é um CRM'},{role:'assistant',content:'CRM organiza clientes.'},{role:'user',content:'como posso me amar'},{role:'assistant',content:'Desculpe, mas não posso me amar.'}]
  const love=classifyConversationTurn({message:'o que é amar',messages:history});check('definição nova zera contexto contaminado',love.intent==='general_question'&&love.contextMessages===0&&love.topicShift===true&&love.freshDefinition===true)
  const self=classifyConversationTurn({message:'como posso me amar?',messages:history});check('perspectiva do usuário é resolvida explicitamente',self.intent==='personal_emotional'&&self.contextMessages===0&&self.guardPerspective===true&&/pessoa usuária|amor próprio/i.test(self.resolvedUserRequest||''))
  const ctx=contextWindowForTurn({conversation:{messages:history,memory:{summary:'CRM antigo'}},turnPlan:love});check('janela não herda memória antiga na definição',ctx.recent_messages.length===0&&ctx.conversation_memory===null)
  let r=await fetch(base+'/chat');const html=await r.text();check('composer fica em fluxo de grid e não absoluto',r.ok&&html.includes('.chat-shell{min-height:0;height:100%;position:relative;display:grid;grid-template-rows:minmax(0,1fr) auto;overflow:hidden}')&&html.includes('.composer-wrap{position:relative;')&&!html.includes('.composer-wrap{position:absolute;')&&!html.includes('.composer-wrap{position:fixed;'))
  check('composer permanece no HTML',html.includes('id="prompt"')&&html.includes('id="sendBtn"'))
  const h=await json('/health');check('hotfix Chat Reliability preservado na plataforma V2.8',h.r.ok&&h.x.version==='3.1')
  const c=await json('/chat/conversations',{method:'POST',body:JSON.stringify({productScope:'auto'})});const id=c.x.conversation.id
  let s=await stream(id,'como posso me amar?');check('guard rejeita resposta autocentrada da IA',s.r.ok&&!s.text.includes('não posso me amar')&&!s.text.includes('nao posso me amar')&&s.text.includes('gentileza consigo'))
  check('perspective guard faz retry',calls.filter(x=>x.__stream&&String(x.prompt||'').includes('como posso me amar')).length===2&&calls.some(x=>x.__stream&&String(x.generation_note||'').includes('REPARO OBRIGATÓRIO')))
  s=await stream(id,'o que é amar');check('definição responde conceito e não limitação da IA',s.r.ok&&!/não posso amar|nao posso amar|como IA, não posso/i.test(s.text)&&/Amar é cuidar|Amar é/.test(s.text))
  const relevant=calls.filter(x=>x.__stream&&String(x.prompt||'').includes('o que é amar')).at(-1);check('definição enviada sem contexto anterior',relevant&&relevant.context?.recent_messages?.length===0&&relevant.context?.conversation_memory==null)
  const conv=await json(`/chat/conversations/${encodeURIComponent(id)}`);check('histórico final persiste respostas reparadas',conv.r.ok&&conv.x.conversation.messages.some(m=>m.role==='assistant'&&String(m.content).includes('gentileza consigo'))&&String(conv.x.conversation.messages.at(-1).content).startsWith('Amar é'))
}finally{child.kill('SIGTERM');mock.close()}
console.log(`\nV2.0.1 Chat Reliability Hotfix: ${ok}/${total} PASS`);if(ok!==total){console.error(logs.slice(-5000));process.exit(1)}
