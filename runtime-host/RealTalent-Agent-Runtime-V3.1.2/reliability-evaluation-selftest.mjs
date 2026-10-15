import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root=fs.mkdtempSync(path.join(os.tmpdir(),'rt-eval-v112-'));process.env.XDG_STATE_HOME=path.join(root,'state')
const m=await import('./reliability-evaluation.mjs?selftest='+Date.now())
let ok=0,total=0;const check=(name,fn)=>{total++;try{fn();ok++;console.log('OK  ',name)}catch(e){console.log('FAIL',name,'-',e.message)}}
try{
  const cats=Object.keys(m.CATEGORY_FLOORS).map(id=>({id,percent:100,score:100,max:100}))
  const r1={id:'r1',percent:92,categories:cats};m.persistEvaluationReport(r1)
  check('latest persistido',()=>assert.equal(m.loadEvaluationLatest().id,'r1'))
  check('histórico persistido',()=>assert.equal(m.loadEvaluationHistory().reports.length,1))
  const b=m.acceptEvaluationBaseline();check('baseline explícita',()=>assert.equal(b.id,'r1'))
  const r2={id:'r2',percent:93,categories:cats};const g2=m.evaluateReleaseGate(r2,m.loadAcceptedBaseline());check('score igual/melhor passa',()=>assert.equal(g2.pass,true));check('delta positivo',()=>assert.equal(g2.delta,1))
  const regCats=cats.map(x=>x.id==='conversation'?{...x,percent:79,score:79}:x);const r3={id:'r3',percent:94,categories:regCats};const g3=m.evaluateReleaseGate(r3,m.loadAcceptedBaseline());check('regressão de categoria bloqueia',()=>assert.equal(g3.pass,false));check('piso de categoria bloqueia',()=>assert.ok(g3.reasons.some(x=>x.includes('conversation'))))
  const r4={id:'r4',percent:90,categories:cats};const g4=m.evaluateReleaseGate(r4,m.loadAcceptedBaseline());check('score total menor bloqueia',()=>assert.equal(g4.pass,false))
  m.saveEvaluationRunState({running:true,profile:'quick',pid:123});check('run state',()=>assert.equal(m.loadEvaluationRunState().running,true))
  const st=m.evaluationState();check('estado expõe gate',()=>assert.ok(st.gate));check('política sem regressão',()=>assert.equal(st.policy.totalScoreMustNotRegress,true));check('versão V2.0',()=>assert.equal(st.version,'2.0.0'))
}finally{fs.rmSync(root,{recursive:true,force:true})}
console.log(`\nReliability & Evaluation V2.0: ${ok}/${total} PASS`);if(ok!==total)process.exit(1)
