import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE=path.dirname(fileURLToPath(import.meta.url))
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rt-agent-v24-gw-'))
const port=18941
const env={...process.env,XDG_STATE_HOME:path.join(temp,'state'),XDG_CONFIG_HOME:path.join(temp,'config'),REALTALENT_AGENT_PORT:String(port),REALTALENT_AI_PROVIDER:'ollama',OLLAMA_URL:'http://127.0.0.1:9',REALTALENT_EMBED_TIMEOUT_MS:'25'}
const child=spawn(process.execPath,[path.join(HERE,'gateway.mjs')],{env,stdio:['ignore','pipe','pipe']})
let stderr='';child.stderr.on('data',(d)=>stderr+=d)
const base=`http://127.0.0.1:${port}`
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))
async function json(pathname,options={}){const r=await fetch(base+pathname,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});const x=await r.json().catch(()=>({}));return {r,x}}
async function wait(){for(let i=0;i<80;i++){try{const r=await fetch(base+'/health');if(r.ok)return}catch{}await sleep(50)}throw new Error('gateway não iniciou: '+stderr)}
let pass=0,fail=0
const t=(name,cond)=>{if(cond){console.log('PASS',name);pass++}else{console.log('FAIL',name);fail++}}
try{
  await wait()
  let z=await json('/health');t('Gateway V2.5 preserva Memory & Knowledge V2.4',z.r.ok&&z.x.version==='3.1'&&z.x.memory?.semanticMemory===true&&z.x.memory?.rag===true)
  z=await json('/platform');t('Manifesto expõe RAG e memória semântica',z.x.manifest?.capabilities?.some(c=>c.id==='semantic-memory')&&z.x.manifest?.capabilities?.some(c=>c.id==='rag-hybrid-retrieval'))
  z=await json('/knowledge/documents',{method:'POST',body:JSON.stringify({product:'crm',title:'Política Tool-First',text:'Análises comerciais do CRM precisam usar evidências reais antes de produzir conclusões. O Tool-First é obrigatório.'})});const docId=z.x.document?.id;t('Indexação via gateway',z.r.status===201&&Boolean(docId)&&z.x.document.chunkCount>=1)
  z=await json('/knowledge/search?q='+encodeURIComponent('evidências reais análise comercial')+'&product=crm');t('RAG via gateway',z.r.ok&&z.x.results?.[0]?.documentId===docId)
  z=await json('/memory/project',{method:'POST',body:JSON.stringify({product:'crm',kind:'decision',text:'Manter Tool-First obrigatório em análise comercial.'})});const sid=z.x.item?.semanticId;t('Memória de projeto ganha índice semântico',z.r.status===201&&Boolean(sid))
  z=await json('/memory/semantic/search?q='+encodeURIComponent('qual regra para análise comercial')+'&product=crm');t('Busca semântica de memória',z.r.ok&&z.x.results?.some(x=>x.id===sid))
  z=await json('/memory');t('Arquitetura de memória V2.4',z.r.ok&&z.x.architecture==='semantic-memory-knowledge-v2.4'&&z.x.conversation?.autoDurablePersistence===false)
  z=await json('/knowledge/status');t('Status explicita política de memória',z.r.ok&&z.x.policy?.durableMemory==='explicit-only'&&z.x.embedding?.fallback==='realtalent-hash-256')
  z=await json('/knowledge/reset',{method:'POST',body:'{}'});t('Reset de conhecimento',z.r.ok&&z.x.documents===0&&z.x.chunks===0)
  z=await json('/memory/semantic/reset',{method:'POST',body:'{}'});t('Reset semântico separado',z.r.ok&&z.x.items===0)
} catch(e){console.error(e);fail++} finally {child.kill('SIGTERM');await sleep(100);fs.rmSync(temp,{recursive:true,force:true})}
console.log(`\nRealTalent Agent V2.7 compatibilidade V2.4: ${pass}/${pass+fail} PASS`)
if(fail)process.exit(1)
