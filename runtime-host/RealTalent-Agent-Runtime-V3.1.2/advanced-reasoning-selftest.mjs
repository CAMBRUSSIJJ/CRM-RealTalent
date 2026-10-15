import assert from 'node:assert/strict'
import {buildReasoningProtocol,classifyReasoningTask,normalizeReasoningPlan,reasoningFinalizer,advancedReasoningInfo} from './advanced-reasoning.mjs'
let ok=0,total=0;const t=(n,fn)=>{total++;try{fn();ok++;console.log('OK  '+n)}catch(e){console.log('FAIL '+n+' - '+e.message)}}
t('classifica diagnóstico',()=>assert.equal(classifyReasoningTask('diagnostique a causa raiz deste erro'),'diagnose'))
t('classifica comparação',()=>assert.equal(classifyReasoningTask('compare três arquiteturas e trade-offs'),'compare'))
let p=buildReasoningProtocol({message:'compare alternativas e decida a melhor',intelligenceCore:{complexity:{tier:'deep'}},turnPlan:{intent:'general_question'},orchestration:{kind:'chat',toolFirst:false}})
t('deep ativa protocolo V2.7',()=>{assert.equal(p.enabled,true);assert.equal(p.mode,'planner-executor-critic-finalizer');assert.equal(p.version,'2.7')})
t('não armazena chain of thought',()=>{assert.equal(p.privacy.storesChainOfThought,false);assert.equal(p.privacy.exposesChainOfThought,false)})
t('tool-first exige evidence policy',()=>{const q=buildReasoningProtocol({message:'analise o CRM',intelligenceCore:{complexity:{tier:'standard'}},orchestration:{toolFirst:true}});assert.equal(q.evidencePolicy.toolFirst,true);assert.equal(q.enabled,true)})
const normalized=normalizeReasoningPlan({task_frame:'Escolher opção',assumptions:['custo igual'],unknowns:['latência'],hypotheses:[{id:'h1',label:'A é melhor',evidence_needed:['benchmark']},{id:'h2',label:'B é melhor',evidence_needed:['benchmark']}],steps:[{id:'s1',goal:'Coletar benchmark',kind:'evidence',depends_on:[],completion_signal:'dados disponíveis'},{id:'s2',goal:'Comparar',kind:'comparison',depends_on:['s1'],completion_signal:'critérios comparados'}],success_criteria:['decisão suportada'],uncertainty_level:'medium'},p)
t('normaliza hipóteses e steps',()=>{assert.equal(normalized.hypotheses.length,2);assert.equal(normalized.steps.length,2);assert.equal(normalized.steps[1].depends_on[0],'s1')})
let f=reasoningFinalizer({protocol:p,verification:{deterministic:{pass:false,issues:[{code:'low_question_coverage'}]},verdict:'repair',repaired:true},attempt:0})
t('critic pode acionar um replan',()=>{assert.equal(f.replan,true);assert.equal(f.action,'replan')})
f=reasoningFinalizer({protocol:p,verification:{deterministic:{pass:false,issues:[{code:'low_question_coverage'}]},verdict:'repair',repaired:true},attempt:1})
t('replan é limitado a uma tentativa',()=>assert.equal(f.replan,false))
t('info V2.7 expõe pipeline e privacidade',()=>{assert.equal(advancedReasoningInfo.version,'2.7');assert.equal(advancedReasoningInfo.features.plannerExecutorCriticFinalizer,true);assert.equal(advancedReasoningInfo.features.chainOfThoughtExposed,false)})
console.log(`\nAdvanced Reasoning V2.7: ${ok}/${total} PASS`);if(ok!==total)process.exit(1)
