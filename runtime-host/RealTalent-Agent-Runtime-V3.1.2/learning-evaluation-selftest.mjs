import assert from 'node:assert/strict'
import fs from 'node:fs';import os from 'node:os';import path from 'node:path'
const root=fs.mkdtempSync(path.join(os.tmpdir(),'rt-learning-v26-'));process.env.XDG_STATE_HOME=path.join(root,'state')
const m=await import('./learning-evaluation.mjs?selftest='+Date.now())
let ok=0,total=0;const check=(n,fn)=>{total++;try{fn();ok++;console.log('OK  ',n)}catch(e){console.log('FAIL',n,'-',e.message)}}
try{
 check('dataset builtin existe',()=>assert.ok(m.activeRegressionCases().length>=5))
 const f=m.recordFailure({category:'routing',kind:'conversation',code:'wrong_intent',prompt:'analise',actual:'smalltalk',expected:{intent:'attachment_analysis'},attachments:[{name:'x.png',type:'image/png',size:10,data_url:'SECRET'}],severity:'high'})
 check('failure memory persiste',()=>assert.equal(m.failureList()[0].id,f.id))
 check('não persiste bytes da imagem',()=>assert.equal(JSON.stringify(m.failureList()).includes('SECRET'),false))
 const f2=m.recordFailure({category:'routing',kind:'conversation',code:'wrong_intent',prompt:'analise',actual:'greeting',expected:{intent:'attachment_analysis'},severity:'critical'})
 check('falha repetida deduplica e conta ocorrências',()=>{assert.equal(f2.id,f.id);assert.equal(f2.occurrences,2);assert.equal(f2.severity,'critical')})
 const c=m.promoteFailureToRegressionCase(f.id);check('falha vira caso de regressão',()=>assert.equal(c.expected.intent,'attachment_analysis'))
 const fb=m.recordFeedback({value:'negative',prompt:'o que é CRM?',answer:'resposta ruim',reason:'não respondeu',expected:{intent:'general_question'}});check('feedback negativo gera failure',()=>assert.ok(fb.failureId))
 check('feedback com expectativa gera regressão',()=>assert.ok(fb.regressionCaseId))
 const rep={id:'r1',datasetHash:m.datasetHash(),total:10,passed:10,failed:0,passPercent:100};m.persistRegressionReport(rep);check('regression report persiste',()=>assert.equal(m.loadRegressionLatest().id,'r1'))
 const b=m.acceptLearningBaseline();check('baseline explícita',()=>assert.equal(b.id,'r1'))
 check('falha crítica aberta bloqueia gate',()=>assert.equal(m.learningReleaseGate(rep,b).pass,false))
 m.resolveFailure(f.id,{status:'fixed',resolution:'router corrigido'});for(const x of m.failureList().filter(x=>x.severity==='critical'&&x.id!==f.id))m.resolveFailure(x.id,{status:'fixed'})
 const st=m.learningState();check('estado V2.6 expõe dataset/failure/feedback',()=>{assert.equal(st.version,'2.6');assert.ok(st.dataset.active>=5);assert.ok(st.failureMemory.total>=1);assert.ok(st.feedback.total>=1)})
}finally{fs.rmSync(root,{recursive:true,force:true})}
console.log(`\nLearning & Evaluation Intelligence V2.6: ${ok}/${total} PASS`);if(ok!==total)process.exit(1)
