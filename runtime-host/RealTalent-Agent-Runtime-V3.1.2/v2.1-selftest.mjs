import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT=path.dirname(fileURLToPath(import.meta.url));const BUNDLE=path.dirname(ROOT)
const crm=path.join(BUNDLE,'RealTalent-CRM-V101.11.3-CR10-H1-Agent-V3.1.2-Linux-Launcher')
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rt-v21-'));const config=path.join(tmp,'config','realtalent-agent');fs.mkdirSync(config,{recursive:true});fs.writeFileSync(path.join(config,'workspaces.json'),JSON.stringify({crm},null,2),{mode:0o600})
const port=18921+Math.floor(Math.random()*300);const env={...process.env,HOME:tmp,XDG_CONFIG_HOME:path.join(tmp,'config'),XDG_STATE_HOME:path.join(tmp,'state'),XDG_CACHE_HOME:path.join(tmp,'cache'),REALTALENT_AGENT_PORT:String(port),REALTALENT_AI_PROVIDER:'ollama',OLLAMA_URL:'http://127.0.0.1:65530'}
const child=spawn(process.execPath,[path.join(ROOT,'gateway.mjs')],{env,stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d)
const base=`http://127.0.0.1:${port}`;const wait=async()=>{for(let i=0;i<100;i++){try{const r=await fetch(base+'/platform');if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,60))}throw new Error('gateway não iniciou: '+logs)}
const checks=[];const t=(n,p)=>{checks.push([n,Boolean(p)]);console.log(`${p?'OK  ':'FAIL'} ${n}`)}
try{
 await wait();
 let r=await fetch(base+'/platform');let x=await r.json();t('V2.8 preserva Intelligence Orchestration V2.1',x.manifest?.version==='3.1'&&x.manifest?.capabilities?.some(c=>c.id==='intelligence-orchestration'))
 r=await fetch(base+'/intelligence-orchestration/classify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'Analise o CRM inteiro e priorize o que impede a comercialização.',product:'auto'})});x=await r.json();t('Intent Router 3.0 -> analysis_job',x.orchestration?.kind==='analysis_job'&&x.orchestration?.protocol==='commercial_readiness'&&x.orchestration?.toolFirst)
 r=await fetch(base+'/commercial-readiness',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({product:'crm',objective:'Analise o CRM inteiro e priorize o que impede a comercialização.'})});x=await r.json();t('Commercial Readiness responde com evidência',r.ok&&x.gate&&x.commercial?.grade&&x.content?.includes('prontidão comercial')&&x.content?.includes('Bloqueadores comprovados')&&Array.isArray(x.evidence)&&x.evidence.some(e=>e.verified))
 t('Project Brain real indexado',x.evidence?.some(e=>e.id==='project_brain'&&e.verified&&Number(e.data?.index?.stats?.files||0)>500))
 t('Health Map real presente',x.evidence?.some(e=>e.id==='health_map'&&e.verified&&Array.isArray(e.data?.modules)))
 r=await fetch(base+'/chat/conversations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({productScope:'auto'})});x=await r.json();const id=x.conversation.id
 r=await fetch(base+`/chat/conversations/${id}/messages/stream`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'Analise o CRM inteiro e priorize o que impede a comercialização.',product:'auto',mode:'auto'})});const raw=await r.text();const events=raw.trim().split('\n').map(l=>{try{return JSON.parse(l)}catch{return {}}});const answer=events.find(e=>e.type==='assistant')?.content||''
 t('chat Tool-First não responde genericamente',answer.includes('prontidão comercial')&&answer.includes('Production Readiness')&&!answer.includes('Se o CRM não'))
 t('progresso inline de ferramentas',events.filter(e=>e.type==='status').length>=3&&events.some(e=>e.label==='Sincronizando Project Brain'))
 t('Markdown preservado',answer.includes('## ')&&answer.includes('**Status:**'))
 r=await fetch(base+'/chat');const html=await r.text();t('Markdown renderer no chat',html.includes('function md(raw)')&&html.includes("m.role==='assistant'?md"))
 r=await fetch(base+'/conversation-intelligence/classify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'o que é um CRM?',product:'auto'})});x=await r.json();t('pergunta conceitual continua conversa geral',x.plan?.intent==='general_question'&&x.orchestration?.kind==='chat'&&!x.orchestration?.toolFirst)
 const ok=checks.filter(c=>c[1]).length;console.log(`\nRealTalent Agent V2.8 compatibilidade V2.1: ${ok}/${checks.length} PASS`);if(ok!==checks.length)process.exitCode=1
}finally{child.kill('SIGTERM');setTimeout(()=>{try{child.kill('SIGKILL')}catch{};fs.rmSync(tmp,{recursive:true,force:true})},100).unref?.()}
