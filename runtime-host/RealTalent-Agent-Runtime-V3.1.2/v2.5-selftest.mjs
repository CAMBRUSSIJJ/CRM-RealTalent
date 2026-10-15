import http from 'node:http'
import {spawn} from 'node:child_process'
import fs from 'node:fs';import os from 'node:os';import path from 'node:path'
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rt-v25-'));const config=path.join(temp,'config'),state=path.join(temp,'state');fs.mkdirSync(config,{recursive:true});fs.mkdirSync(state,{recursive:true})
const ollamaPort=15500+Math.floor(Math.random()*400),agentPort=16000+Math.floor(Math.random()*400);let visionCalls=0,synthesisCalls=0,lastVisionImageCount=0
const fakePng=()=>{const b=Buffer.alloc(32);b[0]=0x89;b.write('PNG',1,'ascii');b.writeUInt32BE(1200,16);b.writeUInt32BE(800,20);return `data:image/png;base64,${b.toString('base64')}`}
const mock=http.createServer(async(req,res)=>{
 if(req.url==='/api/tags'){res.setHeader('content-type','application/json');res.end(JSON.stringify({models:[{name:'qwen3:4b'},{name:'qwen3:1.7b'},{name:'qwen2.5-coder:3b'},{name:'gemma3:4b'},{name:'nomic-embed-text'}]}));return}
 if(req.url==='/api/embed'&&req.method==='POST'){let s='';for await(const c of req)s+=c;const b=JSON.parse(s||'{}');const arr=Array.isArray(b.input)?b.input:[b.input];res.setHeader('content-type','application/json');res.end(JSON.stringify({embeddings:arr.map((_,i)=>[1,0.1+i*.01,0.2])}));return}
 if(req.url==='/api/generate'){res.setHeader('content-type','application/json');res.end(JSON.stringify({done:true}));return}
 if(req.url==='/api/chat'&&req.method==='POST'){let s='';for await(const c of req)s+=c;const b=JSON.parse(s||'{}');const props=b.format?.properties||{};let value
   if(props.findings){visionCalls++;lastVisionImageCount=(b.messages?.at(-1)?.images||[]).length;const imgs=Array.from({length:Math.max(1,lastVisionImageCount)},(_,i)=>({image_id:`image_${i+1}`,summary:`Tela CRM ${i+1}`,scene_type:'ui_screenshot',quality:'clear'}));value={summary:lastVisionImageCount>1?'Duas telas do CRM comparadas.':'Tela do CRM com CTA sobrepondo descrição.',images:imgs,findings:[{image_id:'image_1',category:'layout',severity:'high',description:'CTA sobrepõe a descrição do card',evidence:'botão ocupa a área do texto inferior',confidence:.94,region:{x:.62,y:.62,w:.28,h:.18}}],visibleText:['Começar pesquisa'],uncertainties:[],comparison:{applicable:lastVisionImageCount>1,summary:lastVisionImageCount>1?'A segunda imagem difere da primeira.':'',differences:lastVisionImageCount>1?['posição do CTA alterada']:[]}}
   } else if(props.mode){synthesisCalls++;const raw=JSON.stringify(b.messages||[]).toLowerCase();const follow=raw.includes('visual_context')&&(raw.includes('esse botão')||raw.includes('esse botao'));const compare=raw.includes('\"comparison\":true')||raw.includes('\"mode\":\"cross-image\"');value={mode:'ANALYZE',target_product:'shared',message:follow?'Esse botão é o CTA identificado na evidência visual anterior; ele estava sobrepondo a descrição do card.':compare?'Comparando as duas imagens, há diferença na posição do CTA.':'Há uma sobreposição visual comprovada: o CTA ocupa a área da descrição do card.',summary:follow?'Referência visual resolvida':compare?'Comparação visual':'Sobreposição visual',action:null,suggested_prompts:[]}
   } else if(props.verdict){value={verdict:'pass',confidence:.95,issues:[],repaired_answer:'Há uma sobreposição visual comprovada: o CTA ocupa a área da descrição do card.'}
   } else value={ok:true}
   res.setHeader('content-type','application/json');res.end(JSON.stringify({model:b.model,created_at:new Date().toISOString(),message:{role:'assistant',content:JSON.stringify(value)},done:true}));return}
 res.writeHead(404);res.end('{}')
})
await new Promise(r=>mock.listen(ollamaPort,'127.0.0.1',r))
const child=spawn(process.execPath,[new URL('./gateway.mjs',import.meta.url).pathname],{env:{...process.env,XDG_CONFIG_HOME:config,XDG_STATE_HOME:state,REALTALENT_AGENT_PORT:String(agentPort),REALTALENT_AGENT_HOST:'127.0.0.1',REALTALENT_AI_PROVIDER:'ollama',OLLAMA_URL:`http://127.0.0.1:${ollamaPort}`,OLLAMA_MODEL:'qwen2.5-coder:3b',OLLAMA_GENERAL_MODEL:'qwen3:4b',OLLAMA_FAST_MODEL:'qwen3:1.7b',OLLAMA_CODER_MODEL:'qwen2.5-coder:3b',OLLAMA_REASONING_MODEL:'qwen3:4b',OLLAMA_VISION_MODEL:'gemma3:4b',OLLAMA_EMBED_MODEL:'nomic-embed-text',OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']})
let logs='';child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c);const base=`http://127.0.0.1:${agentPort}`;const sleep=ms=>new Promise(r=>setTimeout(r,ms));for(let i=0;i<100;i++){try{if((await fetch(base+'/health')).ok)break}catch{}await sleep(40)}
let ok=0,total=0;const check=(n,p)=>{total++;console.log(`${p?'OK  ':'FAIL'} ${n}`);if(p)ok++};const json=async(u,opt={})=>{const r=await fetch(base+u,{headers:{'content-type':'application/json'},...opt});return {r,x:await r.json()}}
try{
 let z=await json('/platform');check('manifest V2.7 preserva V2.5',z.r.ok&&z.x.manifest.version==='3.1'&&z.x.manifest.capabilities.some(c=>c.id==='multimodal-intelligence'))
 z=await json('/multimodal-intelligence');check('endpoint multimodal ativo',z.r.ok&&z.x.multimodalIntelligence.version==='2.5'&&z.x.visionConfigured===true)
 const att={name:'crm.png',type:'image/png',size:32,data_url:fakePng()}
 z=await json('/multimodal-intelligence/classify',{method:'POST',body:JSON.stringify({message:'analise essa tela e o botão',attachments:[att]})});check('classificador visual reconhece UI',z.r.ok&&z.x.plan.intent.kind==='ui_diagnosis'&&z.x.plan.images[0].width===1200)
 let c=await json('/chat/conversations',{method:'POST',body:JSON.stringify({productScope:'auto'})});const id=c.x.conversation.id
 z=await json(`/chat/conversations/${id}/messages`,{method:'POST',body:JSON.stringify({message:'analise essa tela',attachments:[att]})});const last=z.x.conversation.messages.at(-1)
 check('chat executa percepção visual + síntese',z.r.ok&&visionCalls===1&&synthesisCalls>=1&&/sobreposi/i.test(last.content))
 check('turno registrado como attachment_analysis',last.metadata?.conversationIntelligence?.intent==='attachment_analysis')
 check('plano multimodal registrado no turno',last.metadata?.multimodal?.version==='2.5'&&last.metadata?.multimodal?.perceptionFindings===1)
 z=await json(`/chat/conversations/${id}/messages`,{method:'POST',body:JSON.stringify({message:'e esse botão?'})});const follow=z.x.conversation.messages.at(-1)
 check('referência visual sobrevive sem guardar pixels',z.r.ok&&follow.metadata?.conversationIntelligence?.intent==='visual_follow_up'&&follow.metadata?.conversationIntelligence?.reference?.source==='visual_context'&&/CTA|botão/i.test(follow.content))
 const att2={...att,name:'crm-2.png'}
 z=await json(`/chat/conversations/${id}/messages`,{method:'POST',body:JSON.stringify({message:'compare essas duas telas',attachments:[att,att2]})});const compared=z.x.conversation.messages.at(-1)
 check('comparação multi-imagem envia as duas imagens ao Perception Pass',z.r.ok&&lastVisionImageCount===2&&compared.metadata?.visualEvidence?.imageCount===2&&compared.metadata?.visualEvidence?.comparison?.applicable===true)
}finally{child.kill('SIGTERM');mock.close()}
console.log(`\nRealTalent Agent V2.5: ${ok}/${total} testes aprovados.`);if(ok!==total){console.error(logs.slice(-2500));process.exit(1)}
