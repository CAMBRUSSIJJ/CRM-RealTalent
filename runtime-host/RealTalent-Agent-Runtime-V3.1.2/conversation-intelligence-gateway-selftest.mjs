import http from 'node:http'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rt-conversation-v16-'))
const config=path.join(temp,'config'),state=path.join(temp,'state'),crm=path.join(temp,'crm')
fs.mkdirSync(path.join(config,'realtalent-agent'),{recursive:true});fs.mkdirSync(state,{recursive:true});fs.mkdirSync(path.join(crm,'src','features','communications'),{recursive:true})
fs.writeFileSync(path.join(crm,'package.json'),JSON.stringify({name:'realtalent-crm',version:'test'}))
fs.writeFileSync(path.join(crm,'src','features','communications','whatsapp.ts'),`export function sendWhatsApp(){ return 'ok' }`)
fs.writeFileSync(path.join(config,'realtalent-agent','workspaces.json'),JSON.stringify({crm}))
const ollamaPort=19000+Math.floor(Math.random()*250),agentPort=19400+Math.floor(Math.random()*250)
let chatCalls=0,bodies=[]
const generationBodies=()=>bodies.filter(b=>b.stream===true)
const lastGenerationBody=()=>[...bodies].reverse().find(b=>b.stream===true)
const mock=http.createServer(async(req,res)=>{
  if(req.url==='/api/tags'){res.setHeader('content-type','application/json');res.end(JSON.stringify({models:[{name:'local:3b'}]}));return}
  if(req.url==='/api/chat'&&req.method==='POST'){
    const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks).toString()||'{}');chatCalls++;bodies.push(body)
    if(body.stream){
      let prompt=''
      try{prompt=JSON.parse(body.messages?.at(-1)?.content||'{}').prompt||''}catch{}
      let answer=prompt.includes('como posso me amar')?'Você pode começar praticando mais gentileza consigo mesma.':'Resposta local. Resposta local. Informação complementar.'
      res.setHeader('content-type','application/x-ndjson');
      const mid=Math.ceil(answer.length/2);res.write(JSON.stringify({message:{content:answer.slice(0,mid)},done:false})+'\n');res.end(JSON.stringify({message:{content:answer.slice(mid)},done:true})+'\n');return
    }
    res.setHeader('content-type','application/json');res.end(JSON.stringify({message:{role:'assistant',content:JSON.stringify({mode:'ASK',target_product:'crm',message:'Resposta',summary:'ok',action:null,suggested_prompts:[]})},done:true}));return
  }
  res.writeHead(404);res.end('{}')
})
await new Promise(r=>mock.listen(ollamaPort,'127.0.0.1',r))
const child=spawn(process.execPath,[new URL('./gateway.mjs',import.meta.url).pathname],{env:{...process.env,XDG_CONFIG_HOME:config,XDG_STATE_HOME:state,REALTALENT_AGENT_PORT:String(agentPort),REALTALENT_AGENT_HOST:'127.0.0.1',REALTALENT_AI_PROVIDER:'ollama',OLLAMA_URL:`http://127.0.0.1:${ollamaPort}`,OLLAMA_MODEL:'local:3b',OLLAMA_FAST_MODEL:'local:3b',OLLAMA_CODER_MODEL:'local:3b',OLLAMA_REASONING_MODEL:'local:3b',OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']})
let logs='';child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c)
const base=`http://127.0.0.1:${agentPort}`,sleep=ms=>new Promise(r=>setTimeout(r,ms));for(let i=0;i<120;i++){try{if((await fetch(base+'/health')).ok)break}catch{}await sleep(40)}
const json=async(url,opt={})=>{const r=await fetch(base+url,{headers:{'content-type':'application/json'},...opt});return {r,x:await r.json()}}
const stream=async(id,message)=>{const r=await fetch(base+`/chat/conversations/${encodeURIComponent(id)}/messages/stream`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message,product:'auto',mode:'ask'})});return {r,text:await r.text()}}
let ok=0,total=0;const check=(name,pass)=>{total++;console.log(`${pass?'OK  ':'FAIL'} ${name}`);if(pass)ok++}
try{
  let z=await json('/health');check('runtime expõe Conversation Intelligence V1.6',z.r.ok&&z.x.version==='3.1'&&z.x.conversationIntelligence?.features?.contextRelevanceGate===true)
  z=await json('/conversation-intelligence/classify',{method:'POST',body:JSON.stringify({message:'oi',messages:[{role:'user',content:'o que é CRM'},{role:'assistant',content:'CRM organiza clientes.'}]})});check('endpoint detecta topic shift em oi',z.r.ok&&z.x.plan?.intent==='greeting'&&z.x.plan?.topicShift===true&&z.x.plan?.contextMessages===0)
  let c=await json('/chat/conversations',{method:'POST',body:JSON.stringify({productScope:'auto'})});const id=c.x.conversation.id
  let st=await stream(id,'o que é um CRM?');check('pergunta conceitual usa modelo',st.r.ok&&generationBodies().length===1);let lastBody=lastGenerationBody();let last=JSON.stringify(lastBody);let userPayload=JSON.parse(lastBody.messages.at(-1).content);check('pergunta conceitual não injeta Project Awareness',!('project_awareness' in (userPayload.context||{}))&&last.includes('general_question'))
  const before=generationBodies().length;st=await stream(id,'oi');const greetingEvents=st.text.trim().split('\n').map(x=>JSON.parse(x));check('oi recebe resposta determinística sem chamar modelo',st.r.ok&&generationBodies().length===before&&greetingEvents.some(x=>x.type==='delta'&&x.delta==='Oi! Como posso ajudar?'))
  st=await stream(id,'como posso me amar?');lastBody=lastGenerationBody();last=JSON.stringify(lastBody);check('pergunta pessoal limpa contexto CRM',st.r.ok&&!last.includes('CRM organiza clientes')&&last.includes('personal_emotional'))
  check('Perspective Guard é enviado ao modelo',/primeira pessoa|usuário|USUÁRIO/i.test(last)&&last.includes('perspective_note'))
  check('resposta pessoal mantém perspectiva do usuário',st.text.includes('gentileza consigo mesma'))
  st=await stream(id,'onde está implementado o WhatsApp?');lastBody=lastGenerationBody();last=JSON.stringify(lastBody);check('pergunta técnica ativa Project Awareness',st.r.ok&&last.includes('project_awareness')&&last.includes('whatsapp.ts'))
  check('Response Quality emite replace quando remove repetição',st.text.includes('"type":"replace"'))
  z=await json(`/chat/conversations/${encodeURIComponent(id)}`);const final=z.x.conversation.messages.at(-1);check('histórico persiste resposta sem repetição exata',final.content==='Resposta local. Informação complementar.')
  check('metadata persiste intenção do turno',final.metadata?.conversationIntelligence?.intent==='project_question')
}finally{child.kill('SIGTERM');mock.close()}
console.log(`\nConversation Intelligence Gateway V1.6: ${ok}/${total} PASS`);if(ok!==total){console.error(logs.slice(-5000));process.exit(1)}
