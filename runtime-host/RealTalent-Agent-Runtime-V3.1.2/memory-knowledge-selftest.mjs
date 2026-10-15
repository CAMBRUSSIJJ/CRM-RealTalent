import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rt-v24-'))
const env={...process.env,XDG_STATE_HOME:tmp,REALTALENT_EMBED_TIMEOUT_MS:'25',OLLAMA_URL:'http://127.0.0.1:9'}
const child=spawnSync(process.execPath,['--input-type=module','-'],{env,input:`
  import {indexKnowledgeText,searchKnowledge,rememberSemantic,searchSemanticMemory,retrieveMemoryKnowledge,memoryKnowledgeStatus,clearKnowledge,clearSemantic} from ${JSON.stringify(new URL('./memory-knowledge.mjs',import.meta.url).href)};
  let pass=0,fail=0;const ok=(n,c)=>{if(c){console.log('PASS',n);pass++}else{console.log('FAIL',n);fail++}};
  await indexKnowledgeText({product:'crm',title:'Regra comercial',text:'O CRM não deve responder análise comercial sem evidência. O Tool-First deve consultar dados reais antes de concluir.'});
  await indexKnowledgeText({product:'blue_ocean',title:'Blueprint',text:'Blueprint de serviço conecta frontstage, backstage, processos de suporte e evidências do serviço.'});
  const a=await searchKnowledge({product:'crm',query:'dados reais antes de análise comercial',limit:3});ok('RAG recupera documento correto',a[0]?.title==='Regra comercial');
  const b=await searchKnowledge({product:'blue_ocean',query:'frontstage backstage suporte',limit:3});ok('Busca respeita produto',b[0]?.title==='Blueprint');
  const mem=await rememberSemantic({product:'crm',kind:'decision',text:'Decisão: manter Tool-First obrigatório em análises do CRM.'});ok('Memória explícita criada',Boolean(mem.id));
  const c=await searchSemanticMemory({product:'crm',query:'regra para análise do CRM',limit:3});ok('Memória semântica recuperada',c.some(x=>x.id===mem.id));
  const pack=await retrieveMemoryKnowledge({product:'crm',query:'analise comercial com evidência'});ok('Pacote combina conhecimento e memória',pack.evidenceCount>=1&&pack.retrieval.strategy.includes('rerank'));
  const status=memoryKnowledgeStatus();ok('Status V2.4',status.version==='2.4'&&status.policy.durableMemory==='explicit-only');
  ok('Fallback local sem Ollama',a[0]?.embeddingProvider==='hash');
  clearKnowledge();clearSemantic();const empty=memoryKnowledgeStatus();ok('Reset independente',empty.knowledge.documents===0&&empty.semanticMemory.items===0);
  console.log(JSON.stringify({pass,fail}));if(fail)process.exit(1);
` ,encoding:'utf8'})
process.stdout.write(child.stdout||'');process.stderr.write(child.stderr||'');fs.rmSync(tmp,{recursive:true,force:true});process.exit(child.status??1)
