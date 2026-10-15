import crypto from 'node:crypto'
import {activeRegressionCases,persistRegressionReport,datasetHash,learningReleaseGate,loadLearningBaseline} from './learning-evaluation.mjs'
const BASE=String(process.env.REALTALENT_AGENT_GATEWAY_URL||'http://127.0.0.1:8791').replace(/\/$/,'')
const noPersist=process.argv.includes('--no-persist')
const request=async(url,body)=>{try{const r=await fetch(BASE+url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const x=await r.json().catch(()=>({}));return{ok:r.ok,status:r.status,x}}catch(e){return{ok:false,status:0,x:{error:String(e?.message||e)}}}}
const get=(o,p)=>String(p).split('.').reduce((a,k)=>a==null?undefined:a[k],o)
const serialize=(x)=>JSON.stringify(x||{}).toLowerCase()
const evaluate=(c,x)=>{const e=c.expected||{}, checks=[];const eq=(label,actual,expected)=>checks.push({label,pass:actual===expected,actual,expected})
 if(e.intent!==undefined)eq('intent',get(x,'plan.intent')??get(x,'turn.intent'),e.intent)
 if(e.orchestrationKind!==undefined)eq('orchestrationKind',get(x,'orchestration.kind'),e.orchestrationKind)
 if(e.protocol!==undefined)eq('protocol',get(x,'orchestration.protocol'),e.protocol)
 if(e.routeKind!==undefined)eq('routeKind',get(x,'route.kind'),e.routeKind)
 if(e.topicShift!==undefined)eq('topicShift',get(x,'plan.topicShift')??get(x,'turn.topicShift'),e.topicShift)
 if(e.referenceSource!==undefined)eq('referenceSource',get(x,'plan.reference.source')??get(x,'turn.reference.source'),e.referenceSource)
 if(e.multimodalKind!==undefined)eq('multimodalKind',get(x,'plan.intent.kind')??get(x,'intelligenceCore.multimodal.intent.kind'),e.multimodalKind)
 if(e.toolFirst!==undefined)eq('toolFirst',Boolean(get(x,'orchestration.toolFirst')),e.toolFirst)
 if(e.reasoningEnabled!==undefined)eq('reasoningEnabled',Boolean(get(x,'protocol.enabled')??get(x,'intelligenceCore.advancedReasoning.enabled')),e.reasoningEnabled)
 if(e.reasoningTask!==undefined)eq('reasoningTask',get(x,'protocol.task')??get(x,'intelligenceCore.advancedReasoning.task'),e.reasoningTask)
 if(e.maxReplans!==undefined)eq('maxReplans',Number(get(x,'protocol.adaptive.maxReplans')??get(x,'intelligenceCore.advancedReasoning.adaptive.maxReplans')),Number(e.maxReplans))
 if(e.executionVersion!==undefined)eq('executionVersion',get(x,'plan.version')??get(x,'executionPlan.version'),e.executionVersion)
 if(e.planStatus!==undefined)eq('planStatus',get(x,'plan.status')??get(x,'executionPlan.status'),e.planStatus)
 if(e.requiresConfirmation!==undefined)eq('requiresConfirmation',Boolean((get(x,'preview.requiresConfirmation')||get(x,'executionPreview.requiresConfirmation')||[]).length),e.requiresConfirmation)
 if(e.irreversible!==undefined)eq('irreversible',Boolean((get(x,'preview.requiresConfirmation')||get(x,'executionPreview.requiresConfirmation')||[]).some?.(z=>z?.irreversible)),e.irreversible)
 if(e.autonomyVersion!==undefined)eq('autonomyVersion',get(x,'info.version')??get(x,'run.version'),e.autonomyVersion)
 if(e.writeRequiresCheckpoint!==undefined)eq('writeRequiresCheckpoint',Boolean((get(x,'run.stages')||[]).filter?.(z=>z?.capability==='write').every?.(z=>z?.requiresCheckpoint===true)),e.writeRequiresCheckpoint)
 if(e.maxSilentWrites!==undefined)eq('maxSilentWrites',Number(get(x,'info.features.maxSilentWrites')??get(x,'policy.maxSilentWrites')),Number(e.maxSilentWrites))
 if(e.policyDecision!==undefined)eq('policyDecision',get(x,'policy.decision'),e.policyDecision)
 if(e.policyRequiresConfirmation!==undefined)eq('policyRequiresConfirmation',Boolean(get(x,'policy.requiresConfirmation')),e.policyRequiresConfirmation)
 if(e.contractVersion!==undefined)eq('contractVersion',get(x,'policy.contractVersion')??get(x,'contractVersion'),e.contractVersion)
 if(e.qualityVersion!==undefined)eq('qualityVersion',get(x,'quality.version'),e.qualityVersion)
 if(e.topTool!==undefined)eq('topTool',get(x,'quality.toolSelection.rankedTools.0.name')??get(x,'quality.toolSelection.ranked.0.name')??get(x,'quality.toolSelection.ranked.0.id'),e.topTool)
 if(e.answerFirst!==undefined)eq('answerFirst',Boolean(get(x,'quality.qualityGates.answerFirst')),e.answerFirst)
 if(e.noGenericPreamble!==undefined)eq('noGenericPreamble',Boolean(get(x,'quality.qualityGates.noGenericPreamble')),e.noGenericPreamble)
 const text=serialize(x);for(const s of e.contains||[])checks.push({label:`contains:${s}`,pass:text.includes(String(s).toLowerCase())});for(const s of e.notContains||[])checks.push({label:`notContains:${s}`,pass:!text.includes(String(s).toLowerCase())})
 return{pass:checks.length>0&&checks.every(z=>z.pass),checks}}
const endpoint={conversation:'/conversation-intelligence/classify',orchestration:'/intelligence-orchestration/classify',intelligence_core:'/intelligence-core/classify',multimodal:'/multimodal-intelligence/classify',advanced_reasoning:'/advanced-reasoning/classify',execution:'/execution/plan',autonomy:'/autonomy/runs',platform_policy:'/v3/policy/evaluate',intelligence_quality:'/v3.1/quality/inspect'}
let runtime={};try{const r=await fetch(BASE+'/health');const h=await r.json();runtime={agentVersion:h.version||null,architecture:h.architecture||null,provider:h.provider||h.ai?.provider||null,models:h.ai?.local?.roles||null,primaryModel:h.model||null}}catch{}
const results=[]
for(const c of activeRegressionCases()){
 const ep=endpoint[c.kind]||endpoint.conversation;const r=await request(ep,c.input||{});const ev=r.ok?evaluate(c,r.x):{pass:false,checks:[{label:'http',pass:false,actual:r.status,expected:200}]};results.push({id:c.id,name:c.name,category:c.category,kind:c.kind,builtin:Boolean(c.builtin),pass:r.ok&&ev.pass,checks:ev.checks,httpStatus:r.status,detail:r.ok?undefined:String(r.x?.error||'request failed').slice(0,1000)})
}
const passed=results.filter(x=>x.pass).length,failed=results.length-passed,byCategory={};for(const r of results){const b=byCategory[r.category]||(byCategory[r.category]={total:0,passed:0,failed:0});b.total++;r.pass?b.passed++:b.failed++}
const report={id:`learn_eval_${crypto.randomUUID()}`,suiteVersion:'2.6',generatedAt:new Date().toISOString(),datasetHash:datasetHash(),runtime,total:results.length,passed,failed,passPercent:results.length?Math.round(passed/results.length*100):0,byCategory,results,status:failed?'BLOCKED':'PASS'};report.gate=learningReleaseGate(report,loadLearningBaseline());report.status=report.gate.pass?'PASS':'BLOCKED';if(!noPersist)persistRegressionReport(report)
console.log(`RealTalent Learning Regression V2.6: ${passed}/${results.length} PASS · ${report.passPercent}% · gate ${report.gate.status}`);for(const r of results.filter(x=>!x.pass))console.log(`FAIL ${r.id} ${r.name}: ${JSON.stringify(r.checks)}`);if(failed)process.exit(1)
