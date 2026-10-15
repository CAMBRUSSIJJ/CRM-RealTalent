import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { classifyConversationTurn } from './conversation-intelligence.mjs'
import { classifyOrchestration } from './intelligence-orchestration.mjs'
import { executeNativeAppTool } from './app-tools.mjs'

const ROOT=path.dirname(fileURLToPath(import.meta.url));const BUNDLE=path.dirname(ROOT)
const crm=path.join(BUNDLE,'RealTalent-CRM-V101.11.3-CR10-H1-Agent-V3.1.2-Linux-Launcher')
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rt-v22-'));const config=path.join(tmp,'config','realtalent-agent');fs.mkdirSync(config,{recursive:true});fs.writeFileSync(path.join(config,'workspaces.json'),JSON.stringify({crm},null,2),{mode:0o600})
const port=19220+Math.floor(Math.random()*500);const env={...process.env,HOME:tmp,XDG_CONFIG_HOME:path.join(tmp,'config'),XDG_STATE_HOME:path.join(tmp,'state'),XDG_CACHE_HOME:path.join(tmp,'cache'),REALTALENT_AGENT_PORT:String(port),REALTALENT_AI_PROVIDER:'ollama',OLLAMA_URL:'http://127.0.0.1:65530',OLLAMA_MODEL:'qwen2.5-coder:3b',OLLAMA_GENERAL_MODEL:'qwen2.5:3b',OLLAMA_CODER_MODEL:'qwen2.5-coder:3b',OLLAMA_REASONING_MODEL:'qwen2.5:3b',OLLAMA_VISION_MODEL:''}
const child=spawn(process.execPath,[path.join(ROOT,'gateway.mjs')],{env,stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d)
const base=`http://127.0.0.1:${port}`;const wait=async()=>{for(let i=0;i<160;i++){try{const r=await fetch(base+'/platform');if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,50))}throw new Error('gateway não iniciou: '+logs)}
const checks=[];const t=(n,p)=>{checks.push([n,Boolean(p)]);console.log(`${p?'OK  ':'FAIL'} ${n}`)}
const json=async(url,opts={})=>{const r=await fetch(base+url,{headers:{'content-type':'application/json',...(opts.headers||{})},...opts});let x={};try{x=await r.json()}catch{}return {r,x}}
try{
  // Pure routing contracts
  let p=classifyConversationTurn({message:'analise',messages:[],product:'auto',attachments:[{name:'print.png',type:'image/png'}]});let o=classifyOrchestration({message:'analise',product:'auto',conversationPlan:p});t('anexo + “analise” vira attachment_analysis',p.intent==='attachment_analysis'&&o.kind==='attachment_analysis')
  p=classifyConversationTurn({message:'Analise o CRM inteiro e priorize o que impede a comercialização',messages:[],product:'auto'});o=classifyOrchestration({message:'Analise o CRM inteiro e priorize o que impede a comercialização',product:p.requestedProduct||'auto',conversationPlan:p});t('Commercial Readiness é Tool-First obrigatório',p.intent==='analysis_job'&&o.protocol==='commercial_readiness'&&o.toolFirst===true)
  p=classifyConversationTurn({message:'melhore isso',messages:[],product:'crm',appContext:{product:'crm',route:'/contacts',selected:{contactId:'8fe'}}});o=classifyOrchestration({message:'melhore isso',product:'crm',conversationPlan:p});t('referência “isso” usa App Context Bridge',p.intent==='app_context_reference'&&p.reference?.source==='app_context'&&o.kind==='app_context_job'&&o.toolFirst)
  const blocked=executeNativeAppTool({name:'crm.contacts.update',args:{id:'1',name:'X'},context:{data:{contacts:[]}}});t('escrita nativa exige confirmação',blocked.status==='requires_confirmation'&&blocked.confirmation===true)

  await wait()
  let z=await json('/platform');t('compatibilidade V2.2 preservada na V3.1',z.r.ok&&z.x.manifest?.version==='3.1'&&z.x.manifest?.capabilities?.some(c=>c.id==='app-context-bridge')&&z.x.manifest?.capabilities?.some(c=>c.id==='browser-conversation-e2e'))
  z=await json('/health');t('gateway V3.1 preserva contratos V2.2',z.r.ok&&z.x.version==='3.1')

  // Public classifier must be attachment and app-context aware too.
  z=await json('/conversation-intelligence/classify',{method:'POST',body:JSON.stringify({message:'analise',product:'auto',attachments:[{name:'print.png',type:'image/png',dataUrl:'data:image/png;base64,iVBORw0KGgo='}]})});t('classifier HTTP respeita anexo',z.r.ok&&z.x.plan?.intent==='attachment_analysis'&&z.x.orchestration?.kind==='attachment_analysis')
  z=await json('/intelligence-orchestration/classify',{method:'POST',body:JSON.stringify({message:'analise',product:'auto',attachments:[{name:'print.png',type:'image/png',dataUrl:'data:image/png;base64,iVBORw0KGgo='}]})});t('orchestration classifier HTTP respeita anexo',z.r.ok&&z.x.turn?.intent==='attachment_analysis'&&z.x.orchestration?.kind==='attachment_analysis')

  // Server-enforced Tool-First on /agent, without needing Ollama.
  z=await json('/agent',{method:'POST',body:JSON.stringify({product:'crm',surface:'crm',prompt:'Analise o CRM inteiro e priorize o que impede a comercialização',context:{route:'/dashboard'}})});t('/agent impede bypass direto para Ollama',z.r.ok&&z.x.policy?.server_enforced===true&&z.x.policy?.tool_first===true&&z.x.model==='tool-first-v2.2'&&z.x.commercial?.method==='commercial-readiness-protocol-v2.2')
  t('Commercial Readiness tem 16 checks',Array.isArray(z.x.commercial?.protocol)&&z.x.commercial.protocol.length===16&&Array.isArray(z.x.cards)&&z.x.cards.some(c=>c.kind==='protocol'&&c.items?.length===16))

  // App Context and typed tools.
  z=await json('/app-context/sync',{method:'POST',body:JSON.stringify({product:'crm',source:'crm-ui',context:{workspace:'RealTalent',route:'/contacts',selected:{contactId:'c1'},actionsAllowed:['read'],data:{contacts:[{id:'c1',name:'Ana Lima',company:'Acme'},{id:'c2',name:'João Silva',company:'Beta'}],stages:[{id:'s1',name:'Novo'}],opportunities:[]}}})});t('App Context Bridge sincroniza snapshot',z.r.ok&&z.x.context?.product==='crm'&&z.x.context?.route==='/contacts')
  z=await json('/tools/catalog?product=crm');t('catálogo CRM expõe ferramentas tipadas',z.r.ok&&z.x.tools?.some(x=>x.name==='crm.contacts.search')&&z.x.tools?.some(x=>x.name==='crm.contacts.update'&&x.confirmation===true))
  z=await json('/tools/execute',{method:'POST',body:JSON.stringify({product:'crm',tool:'crm.contacts.search',args:{query:'ana'}})});t('ferramenta de leitura usa dados reais do App Context',z.r.ok&&z.x.result?.[0]?.id==='c1')
  z=await json('/tools/execute',{method:'POST',body:JSON.stringify({product:'crm',tool:'crm.contacts.update',args:{id:'c1',name:'Ana 2'}})});t('endpoint de escrita bloqueia sem confirmação',z.r.status===409&&z.x.status==='requires_confirmation'&&z.x.confirmation===true)
  z=await json('/conversation-intelligence/classify',{method:'POST',body:JSON.stringify({message:'melhore isso',product:'crm'})});t('classificador recupera App Context sincronizado',z.r.ok&&z.x.plan?.intent==='app_context_reference'&&z.x.plan?.reference?.source==='app_context')

  // Three-level memory separation.
  z=await json('/memory/project',{method:'POST',body:JSON.stringify({product:'crm',text:'Decisão persistente de teste',kind:'decision'})});t('memória de projeto grava separadamente',z.r.status===201&&z.x.item?.product==='crm')
  z=await json('/memory');t('memória V2.4 preserva camadas e adiciona semântica',z.r.ok&&z.x.architecture==='semantic-memory-knowledge-v2.4'&&z.x.conversation?.isolatedPerChat===true&&Array.isArray(z.x.project?.projects?.crm)&&z.x.project.projects.crm.length===1)
  await json('/memory/operational/reset',{method:'POST',body:'{}'});z=await json('/memory');t('limpar operacional preserva projeto',z.x.project?.projects?.crm?.length===1&&z.x.operational?.events?.length===0)
  await json('/memory/project/reset',{method:'POST',body:JSON.stringify({product:'crm'})});z=await json('/memory');t('limpar projeto não é o mesmo que histórico',z.x.project?.projects?.crm?.length===0)

  // Conversation lifecycle.
  z=await json('/chat/conversations',{method:'POST',body:JSON.stringify({productScope:'crm',title:'Teste V2.2'})});const id=z.x.conversation?.id;t('novo chat começa limpo',z.r.status===201&&id&&z.x.conversation.messages?.length===0&&z.x.conversation.summary==null&&z.x.conversation.activeTopic==null)
  z=await json(`/chat/conversations/${id}`,{method:'PATCH',body:JSON.stringify({title:'Renomeada'})});t('renomear conversa',z.r.ok&&z.x.conversation?.title==='Renomeada')
  z=await json(`/chat/conversations/${id}/archive`,{method:'POST',body:'{}'});t('arquivar preserva a conversa',z.r.ok&&Boolean(z.x.conversation?.archivedAt))
  let normal=await json('/chat/conversations'), all=await json('/chat/conversations?archived=1'), saved=await json(`/chat/conversations/${id}`);t('arquivada some da lista padrão mas não é excluída',normal.x.conversations?.every(c=>c.id!==id)&&all.x.conversations?.some(c=>c.id===id)&&saved.r.ok)
  await json(`/chat/conversations/${id}/unarchive`,{method:'POST',body:'{}'});z=await json(`/chat/conversations/${id}`,{method:'DELETE'});t('excluir remove só a conversa escolhida',z.r.ok)
  z=await json('/chat/conversations',{method:'POST',body:JSON.stringify({title:'A'})});const a=z.x.conversation.id;z=await json('/chat/conversations',{method:'POST',body:JSON.stringify({title:'B'})});const b=z.x.conversation.id;z=await json('/chat/conversations',{method:'DELETE'});normal=await json('/chat/conversations');t('apagar todas as conversas',z.r.ok&&z.x.deleted>=2&&normal.x.conversations?.length===0&&a!==b)

  const ok=checks.filter(c=>c[1]).length;console.log(`\nRealTalent Agent V2.2 Grounded App Intelligence: ${ok}/${checks.length} PASS`);if(ok!==checks.length)process.exitCode=1
}finally{child.kill('SIGTERM');await new Promise(r=>setTimeout(r,80));try{child.kill('SIGKILL')}catch{};fs.rmSync(tmp,{recursive:true,force:true})}
