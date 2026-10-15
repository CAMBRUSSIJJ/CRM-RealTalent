import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root=fs.mkdtempSync(path.join(os.tmpdir(),'rt-grounding-v112-'))
const state=path.join(root,'state'),project=path.join(root,'project');fs.mkdirSync(state,{recursive:true});fs.mkdirSync(path.join(project,'src','features','communications'),{recursive:true});process.env.XDG_STATE_HOME=state
fs.writeFileSync(path.join(project,'package.json'),JSON.stringify({name:'realtalent-crm'}))
fs.writeFileSync(path.join(project,'src','features','communications','gateway.ts'),`export interface Message { id:string; text:string }\nexport function subscribeMessage(cb:(m:Message)=>void){ return window.addEventListener('message', cb as any) }\n`)
fs.writeFileSync(path.join(project,'src','features','communications','panel.tsx'),`import { subscribeMessage } from './gateway'\nexport function WhatsAppPanel(){ return null }\n`)
const mod=await import('./project-awareness.mjs?grounding='+Date.now())
let ok=0,total=0;const check=(name,fn)=>{total++;try{fn();ok++;console.log('OK  ',name)}catch(e){console.log('FAIL',name,'-',e.message)}}
try{
  const idx=mod.buildProjectIndex({product:'crm',workspace:project});check('indexa fixture real',()=>assert.ok(idx.stats.files>=2))
  const hit=mod.searchProject({product:'crm',workspace:project,query:'WhatsApp listener',limit:5});check('busca retorna somente arquivos existentes',()=>assert.ok(hit.results.every(r=>fs.existsSync(path.join(project,r.path)))))
  const miss=mod.searchProject({product:'crm',workspace:project,query:'ComponenteTotalmenteInventadoXYZ',limit:5});check('busca desconhecida não inventa arquivo',()=>assert.equal(miss.results.length,0))
  const impact=mod.impactAnalysis({product:'crm',workspace:project,target:'ArquivoQueNaoExisteXYZ',depth:2});check('impacto desconhecido sem seeds inventados',()=>assert.equal(impact.seeds.length,0));check('impacto declara análise estática',()=>assert.match(impact.disclaimer,/estática/i))
  const rc=mod.rootCauseEvidence({product:'crm',workspace:project,symptom:'WhatsApp envia mensagem duplicada'});check('root cause produz hipótese',()=>assert.ok(rc.hypotheses.length>=1));check('root cause não declara causa confirmada',()=>assert.match(rc.disclaimer,/não causas confirmadas/i));check('root cause exige validação',()=>assert.match(rc.hypotheses[0].nextTest,/validar|logs|Browser QA/i))
  const graph=mod.projectBrainGraph({product:'crm',workspace:project,type:'architecture'});check('grafo deriva somente workspace',()=>assert.match(graph.disclaimer,/workspace registrado/i))
}finally{fs.rmSync(root,{recursive:true,force:true})}
console.log(`\nGrounding & Hallucination Guard V2.0: ${ok}/${total} PASS`);if(ok!==total)process.exit(1)
