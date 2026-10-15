import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rt-v31-memory-'))
process.env.XDG_STATE_HOME=tmp
process.env.OLLAMA_URL='http://127.0.0.1:9'
process.env.REALTALENT_EMBED_TIMEOUT_MS='800'
const m=await import(`./memory-knowledge.mjs?test=${Date.now()}`)
const results=[];const t=async(name,fn)=>{try{await fn();results.push([name,true])}catch(e){results.push([name,false,e.message])}}
await t('RAG2 identifier threshold',async()=>{const x=m.rag2Thresholds('lead-details-drawer.tsx');assert.equal(x.identifierLike,true);assert.ok(x.knowledge<.18)})
await t('Semantic memory stores decision',async()=>{const x=await m.rememberSemantic({product:'crm',kind:'decision',text:'Manter a sidebar recolhível'});assert.ok(x.id)})
await t('Semantic memory deduplicates exact decision',async()=>{const x=await m.rememberSemantic({product:'crm',kind:'decision',text:'Manter a sidebar recolhível'});assert.equal(x.deduplicated,true)})
await t('Conflict awareness flags opposite decision',async()=>{await m.rememberSemantic({product:'crm',kind:'decision',text:'Não manter a sidebar recolhível'});const rows=m.listSemantic({product:'crm'});assert.ok(rows.some(x=>Array.isArray(x.conflictsWith)&&x.conflictsWith.length>0))})
await t('RAG source diversity',async()=>{await m.indexKnowledgeText({product:'crm',title:'Pipeline A',text:'Pipeline comercial oportunidades negociação proposta follow-up. '.repeat(40)});await m.indexKnowledgeText({product:'crm',title:'Pipeline B',text:'Oportunidades em risco e follow-up atrasado no pipeline. '.repeat(40)});const r=await m.retrieveMemoryKnowledge({query:'oportunidades pipeline follow-up',product:'crm',knowledgeLimit:6,memoryLimit:3});assert.equal(r.retrieval.generation,'RAG 2.0');assert.ok(r.sourceCoverage>=2)})
for(const [n,ok,e] of results)console.log(`${ok?'PASS':'FAIL'} ${n}${e?` — ${e}`:''}`)
const pass=results.filter(x=>x[1]).length;console.log(`\nMemory/RAG Quality V3.1: ${pass}/${results.length} PASS`);fs.rmSync(tmp,{recursive:true,force:true});if(pass!==results.length)process.exit(1)
