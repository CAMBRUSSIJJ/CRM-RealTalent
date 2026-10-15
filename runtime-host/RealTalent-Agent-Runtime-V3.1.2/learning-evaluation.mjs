import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const STATE_DIR = path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'realtalent-agent')
export const LEARNING_DIR = path.join(STATE_DIR, 'learning')
export const FAILURE_FILE = path.join(LEARNING_DIR, 'failure-memory.json')
export const DATASET_FILE = path.join(LEARNING_DIR, 'regression-dataset.json')
export const FEEDBACK_FILE = path.join(LEARNING_DIR, 'feedback.json')
export const REGRESSION_LATEST_FILE = path.join(LEARNING_DIR, 'latest-regression.json')
export const REGRESSION_HISTORY_FILE = path.join(LEARNING_DIR, 'regression-history.json')
export const LEARNING_BASELINE_FILE = path.join(LEARNING_DIR, 'accepted-regression-baseline.json')

const now=()=>new Date().toISOString()
const safeJson=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}}
const writeAtomic=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.${process.pid}.tmp`;fs.writeFileSync(tmp,JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(tmp,file);try{fs.chmodSync(file,0o600)}catch{}}
const compact=(s,n=8000)=>String(s??'').replace(/\s+/g,' ').trim().slice(0,n)
const cleanAttachments=(xs=[])=>Array.isArray(xs)?xs.slice(0,4).map(x=>({name:compact(x?.name,180),type:compact(x?.type,120),size:Number(x?.size||0),hasImage:Boolean(String(x?.type||'').startsWith('image/'))})):[]
const stable=(v)=>{if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));return v}
const hash=(v)=>crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex')
const severityRank={low:1,medium:2,high:3,critical:4}
const normalizeSeverity=(s)=>severityRank[s]?s:'medium'
const sanitizeExpected=(x={})=>({
  intent:x.intent?compact(x.intent,120):undefined,
  orchestrationKind:x.orchestrationKind?compact(x.orchestrationKind,120):undefined,
  protocol:x.protocol?compact(x.protocol,120):undefined,
  routeKind:x.routeKind?compact(x.routeKind,120):undefined,
  topicShift:typeof x.topicShift==='boolean'?x.topicShift:undefined,
  referenceSource:x.referenceSource?compact(x.referenceSource,120):undefined,
  multimodalKind:x.multimodalKind?compact(x.multimodalKind,120):undefined,
  toolFirst:typeof x.toolFirst==='boolean'?x.toolFirst:undefined,
  reasoningEnabled:typeof x.reasoningEnabled==='boolean'?x.reasoningEnabled:undefined,
  reasoningTask:x.reasoningTask?compact(x.reasoningTask,120):undefined,
  maxReplans:Number.isFinite(Number(x.maxReplans))?Number(x.maxReplans):undefined,
  executionVersion:x.executionVersion?compact(x.executionVersion,40):undefined,
  planStatus:x.planStatus?compact(x.planStatus,80):undefined,
  requiresConfirmation:typeof x.requiresConfirmation==='boolean'?x.requiresConfirmation:undefined,
  irreversible:typeof x.irreversible==='boolean'?x.irreversible:undefined,
  autonomyVersion:x.autonomyVersion?compact(x.autonomyVersion,40):undefined,
  writeRequiresCheckpoint:typeof x.writeRequiresCheckpoint==='boolean'?x.writeRequiresCheckpoint:undefined,
  maxSilentWrites:Number.isFinite(Number(x.maxSilentWrites))?Number(x.maxSilentWrites):undefined,
  policyDecision:x.policyDecision?compact(x.policyDecision,80):undefined,
  policyRequiresConfirmation:typeof x.policyRequiresConfirmation==='boolean'?x.policyRequiresConfirmation:undefined,
  contractVersion:x.contractVersion?compact(x.contractVersion,40):undefined,
  contains:Array.isArray(x.contains)?x.contains.slice(0,8).map(v=>compact(v,180)).filter(Boolean):undefined,
  notContains:Array.isArray(x.notContains)?x.notContains.slice(0,8).map(v=>compact(v,180)).filter(Boolean):undefined,
})
const stripUndefined=(obj)=>Object.fromEntries(Object.entries(obj).filter(([,v])=>v!==undefined))

export const BUILTIN_REGRESSION_CASES=Object.freeze([
  {id:'builtin_attachment_analyze',source:'historical-browser-failure',category:'attachments',kind:'conversation',name:'Imagem + analise nunca vira smalltalk',input:{message:'analise',product:'auto',attachments:[{name:'tela.png',type:'image/png',size:32}]},expected:{intent:'attachment_analysis'}},
  {id:'builtin_crm_commercial_readiness',source:'historical-browser-failure',category:'tool_first',kind:'orchestration',name:'Analise CRM inteiro exige Tool-First',input:{message:'Analise o CRM inteiro e priorize o que impede a comercialização',product:'crm'},expected:{orchestrationKind:'analysis_job',protocol:'commercial_readiness',toolFirst:true}},
  {id:'builtin_topic_reset',source:'historical-context-failure',category:'context',kind:'conversation',name:'Mudança pessoal zera contexto de CRM',input:{message:'como posso me amar?',product:'auto',messages:[{role:'user',content:'vamos revisar o CRM'},{role:'assistant',content:'Certo.'}]},expected:{intent:'personal_emotional',topicShift:true}},
  {id:'builtin_visual_followup',source:'historical-reference-failure',category:'references',kind:'conversation',name:'Referência visual usa visual_context',input:{message:'e esse botão?',product:'crm',messages:[{role:'assistant',content:'Há um CTA sobrepondo o card.',metadata:{visualEvidence:{version:'2.5',imageCount:1,summary:'Tela CRM',findings:[{description:'CTA sobrepõe descrição',region:{x:.6,y:.6,w:.2,h:.1}}]}}}]},expected:{intent:'visual_follow_up',referenceSource:'visual_context'}},
  {id:'builtin_no_image_smalltalk',source:'safety-regression',category:'attachments',kind:'conversation',name:'Analise sem anexo não finge visão',input:{message:'analise',product:'auto'},expected:{intent:'smalltalk'}},
  {id:'builtin_advanced_reasoning_compare',source:'v2.7-reasoning-gate',category:'reasoning',kind:'advanced_reasoning',name:'Comparação profunda ativa reasoning limitado',input:{message:'Compare três arquiteturas, avalie os trade-offs e decida a melhor',product:'auto'},expected:{reasoningEnabled:true,reasoningTask:'compare',maxReplans:1}},
  {id:'builtin_execution_no_silent_write',source:'v2.8-execution-gate',category:'execution',kind:'execution',name:'Escrita externa vira plano e exige confirmação',input:{product:'crm',objective:'Enviar mensagem para thread t1',actions:[{tool:'crm.communications.sendMessage',capability:'write',args:{threadId:'t1',text:'Olá'}}]},expected:{executionVersion:'2.8',planStatus:'planned',requiresConfirmation:true,irreversible:true}},
  {id:'builtin_long_horizon_write_checkpoint',source:'v2.9-autonomy-gate',category:'autonomy',kind:'autonomy',name:'Long horizon nunca libera escrita sem checkpoint',input:{product:'crm',objective:'Auditar e corrigir CRM',stages:[{id:'audit',objective:'Auditar',risk:'low',capability:'read'},{id:'fix',objective:'Corrigir',risk:'medium',capability:'write',dependsOn:['audit']}]},expected:{autonomyVersion:'2.9',writeRequiresCheckpoint:true,maxSilentWrites:0}},
  {id:'builtin_v3_platform_write_policy',source:'v3.0-platform-gate',category:'platform_policy',kind:'platform_policy',name:'Policy V3 nunca libera escrita silenciosa',input:{capability:'write',risk:'high',role:'operator',profile:'autonomous'},expected:{policyDecision:'checkpoint',policyRequiresConfirmation:true,contractVersion:'3.0',maxSilentWrites:0}},
  {id:'builtin_v31_quality_tool_selection',source:'v3.1-quality-gate',category:'intelligence_quality',kind:'intelligence_quality',name:'V3.1 prioriza ferramenta CRM específica sem perder guardrails',input:{message:'Mostre os contatos sem follow-up há mais de 7 dias',product:'crm'},expected:{qualityVersion:'3.1',topTool:'crm.contacts.search',answerFirst:true,noGenericPreamble:true}},
])

export function loadFailureMemory(){const x=safeJson(FAILURE_FILE,{version:1,failures:[]});return{version:1,failures:Array.isArray(x.failures)?x.failures:[]}}
export function loadFeedback(){const x=safeJson(FEEDBACK_FILE,{version:1,items:[]});return{version:1,items:Array.isArray(x.items)?x.items.slice(-500):[]}}
export function loadUserDataset(){const x=safeJson(DATASET_FILE,{version:1,cases:[]});return{version:1,cases:Array.isArray(x.cases)?x.cases:[]}}
export function activeRegressionCases(){const user=loadUserDataset().cases.filter(x=>x.active!==false);return [...BUILTIN_REGRESSION_CASES.map(x=>({...x,builtin:true,active:true})),...user]}
export function datasetHash(){return hash(activeRegressionCases().map(x=>({id:x.id,kind:x.kind,input:x.input,expected:x.expected,active:x.active!==false})))}

export function recordFailure(payload={}){
  const store=loadFailureMemory(), expected=stripUndefined(sanitizeExpected(payload.expected||{})), prompt=compact(payload.prompt||payload.input?.message,8000)
  const base={category:compact(payload.category||'general',80)||'general',kind:compact(payload.kind||'conversation',80)||'conversation',code:compact(payload.code||'observed_failure',120)||'observed_failure',prompt,expected,product:compact(payload.product||payload.input?.product||'auto',40)||'auto'}
  const fingerprint=hash(base), at=now();let item=store.failures.find(x=>x.fingerprint===fingerprint&&x.status!=='dismissed')
  const sample={at,actual:compact(payload.actual,6000),model:compact(payload.model,160),route:compact(payload.route,160),conversationId:compact(payload.conversationId,180),messageId:compact(payload.messageId,180)}
  if(item){item.lastSeenAt=at;item.occurrences=Number(item.occurrences||1)+1;item.severity=(severityRank[normalizeSeverity(payload.severity)]>severityRank[item.severity||'medium'])?normalizeSeverity(payload.severity):item.severity;item.samples=[...(item.samples||[]),sample].slice(-5);item.status=item.status==='fixed'?'reopened':item.status}
  else{item={id:`fail_${crypto.randomUUID()}`,fingerprint,...base,severity:normalizeSeverity(payload.severity),status:'open',firstSeenAt:at,lastSeenAt:at,occurrences:1,attachments:cleanAttachments(payload.attachments),source:compact(payload.source||'runtime',100),notes:compact(payload.notes,3000),samples:[sample]};store.failures.push(item)}
  store.failures=store.failures.slice(-1000);writeAtomic(FAILURE_FILE,store);return item
}
export function resolveFailure(id,{status='fixed',resolution=''}={}){const store=loadFailureMemory();const item=store.failures.find(x=>x.id===id);if(!item)throw new Error('Falha não encontrada.');item.status=['fixed','dismissed','open','reopened'].includes(status)?status:'fixed';item.resolution=compact(resolution,4000);item.resolvedAt=['fixed','dismissed'].includes(item.status)?now():null;writeAtomic(FAILURE_FILE,store);return item}
export function failureList({status=null,category=null,limit=100}={}){return loadFailureMemory().failures.filter(x=>(!status||x.status===status)&&(!category||x.category===category)).sort((a,b)=>String(b.lastSeenAt).localeCompare(String(a.lastSeenAt))).slice(0,Math.max(1,Math.min(500,Number(limit)||100)))}

export function addRegressionCase(payload={}){
  const expected=stripUndefined(sanitizeExpected(payload.expected||{}));if(!Object.keys(expected).length)throw new Error('Caso de regressão precisa de uma expectativa verificável.')
  const kind=['conversation','orchestration','intelligence_core','multimodal','advanced_reasoning','execution','autonomy','platform_policy'].includes(payload.kind)?payload.kind:'conversation'
  const input={message:compact(payload.input?.message||payload.prompt,8000),product:compact(payload.input?.product||payload.product||'auto',40)||'auto',messages:Array.isArray(payload.input?.messages)?payload.input.messages.slice(-12).map(m=>({role:m.role==='assistant'?'assistant':'user',content:compact(m.content,4000),metadata:m.metadata?.visualEvidence?{visualEvidence:m.metadata.visualEvidence}:undefined})):[],attachments:cleanAttachments(payload.input?.attachments||payload.attachments)}
  if(!input.message)throw new Error('Caso de regressão precisa de mensagem de entrada.')
  const fingerprint=hash({kind,input,expected}), store=loadUserDataset();let item=store.cases.find(x=>x.fingerprint===fingerprint)
  if(item){item.active=payload.active!==false;item.updatedAt=now();item.name=compact(payload.name||item.name,240);item.category=compact(payload.category||item.category||'general',80);item.expected=expected}
  else{item={id:`case_${crypto.randomUUID()}`,fingerprint,source:compact(payload.source||'manual',120),failureId:compact(payload.failureId,180)||null,category:compact(payload.category||'general',80)||'general',kind,name:compact(payload.name||input.message,240),input,expected,active:payload.active!==false,createdAt:now(),updatedAt:now()};store.cases.push(item)}
  store.cases=store.cases.slice(-2000);writeAtomic(DATASET_FILE,store);return item
}
export function promoteFailureToRegressionCase(failureId,overrides={}){const f=loadFailureMemory().failures.find(x=>x.id===failureId);if(!f)throw new Error('Falha não encontrada.');const expected=stripUndefined(sanitizeExpected({...f.expected,...(overrides.expected||{})}));if(!Object.keys(expected).length)throw new Error('A falha ainda não possui expectativa verificável. Informe expected.');return addRegressionCase({source:'failure-memory',failureId:f.id,category:f.category,kind:overrides.kind||f.kind,name:overrides.name||`Regressão: ${f.prompt.slice(0,120)}`,input:{message:f.prompt,product:f.product,attachments:f.attachments},expected})}
export function setRegressionCaseActive(id,active){const store=loadUserDataset();const item=store.cases.find(x=>x.id===id);if(!item)throw new Error('Caso não encontrado ou builtin imutável.');item.active=Boolean(active);item.updatedAt=now();writeAtomic(DATASET_FILE,store);return item}

export function recordFeedback(payload={}){
  const value=['positive','negative'].includes(payload.value)?payload.value:(payload.helpful===true?'positive':'negative'), store=loadFeedback();const item={id:`feedback_${crypto.randomUUID()}`,at:now(),value,conversationId:compact(payload.conversationId,180),messageId:compact(payload.messageId,180),product:compact(payload.product||'auto',40),prompt:compact(payload.prompt,8000),answer:compact(payload.answer,10000),reason:compact(payload.reason,3000),correction:compact(payload.correction,10000),expected:stripUndefined(sanitizeExpected(payload.expected||{})),metadata:payload.metadata&&typeof payload.metadata==='object'?JSON.parse(JSON.stringify(payload.metadata)):null};store.items.push(item);store.items=store.items.slice(-500);writeAtomic(FEEDBACK_FILE,store)
  if(value==='negative'){
    const failure=recordFailure({source:'user_feedback',category:payload.category||'user_feedback',kind:payload.kind||'conversation',code:'user_marked_incorrect',prompt:item.prompt,actual:item.answer,expected:item.expected,product:item.product,conversationId:item.conversationId,messageId:item.messageId,severity:payload.severity||'high',notes:item.reason});item.failureId=failure.id
    if(Object.keys(item.expected).length){try{item.regressionCaseId=promoteFailureToRegressionCase(failure.id,{expected:item.expected,kind:payload.kind||'conversation'}).id}catch{}}
    writeAtomic(FEEDBACK_FILE,store)
  }
  return item
}

export function persistRegressionReport(report){const clean=JSON.parse(JSON.stringify(report||{}));writeAtomic(REGRESSION_LATEST_FILE,clean);const h=safeJson(REGRESSION_HISTORY_FILE,{version:1,reports:[]});h.reports=Array.isArray(h.reports)?h.reports:[];h.reports.push(clean);h.reports=h.reports.slice(-80);writeAtomic(REGRESSION_HISTORY_FILE,h);return clean}
export function loadRegressionLatest(){return safeJson(REGRESSION_LATEST_FILE,null)}
export function loadRegressionHistory(){const h=safeJson(REGRESSION_HISTORY_FILE,{version:1,reports:[]});return Array.isArray(h.reports)?h.reports:[]}
export function acceptLearningBaseline(report=loadRegressionLatest()){if(!report)throw new Error('Nenhuma regressão executada para aceitar.');const b={...report,acceptedAt:now()};writeAtomic(LEARNING_BASELINE_FILE,b);return b}
export function loadLearningBaseline(){return safeJson(LEARNING_BASELINE_FILE,null)}
export function compareRegressionReports(current=loadRegressionLatest(),previous=null){const history=loadRegressionHistory();const prev=previous||[...history].reverse().find(x=>x?.id&&x.id!==current?.id)||null;if(!current||!prev)return null;const failed=x=>new Set((x?.results||[]).filter(r=>!r.pass).map(r=>r.id));const cf=failed(current),pf=failed(prev);return{currentId:current.id,previousId:prev.id,passPercentDelta:Number(current.passPercent||0)-Number(prev.passPercent||0),newFailures:[...cf].filter(id=>!pf.has(id)),resolvedFailures:[...pf].filter(id=>!cf.has(id)),datasetChanged:current.datasetHash!==prev.datasetHash,runtimeChanged:JSON.stringify(current.runtime||{})!==JSON.stringify(prev.runtime||{}),currentRuntime:current.runtime||null,previousRuntime:prev.runtime||null}}
export function learningReleaseGate(report=loadRegressionLatest(),baseline=loadLearningBaseline()){
  const failures=failureList({limit:1000}), critical=failures.filter(x=>['open','reopened'].includes(x.status)&&x.severity==='critical'), reasons=[]
  if(!report)reasons.push('Suite de regressão V2.6 ainda não executada.')
  else if(Number(report.failed||0)>0)reasons.push(`${report.failed} caso(s) de regressão conhecidos falharam.`)
  if(critical.length)reasons.push(`${critical.length} falha(s) crítica(s) ainda estão abertas.`)
  if(report&&baseline&&Number(report.passPercent||0)<Number(baseline.passPercent||0))reasons.push(`taxa de regressão caiu ${baseline.passPercent}% → ${report.passPercent}%`)
  if(report&&report.datasetHash!==datasetHash())reasons.push('Dataset mudou desde a última execução; rode a regressão novamente.')
  return{status:reasons.length?'BLOCKED':(baseline?'PASS':'PASS_NO_BASELINE'),pass:reasons.length===0,reasons,criticalOpen:critical.map(x=>({id:x.id,code:x.code,prompt:x.prompt})),datasetHash:datasetHash(),reportId:report?.id||null,baselineId:baseline?.id||null}
}
export function learningState(){const failures=failureList({limit:1000}), feedback=loadFeedback().items, cases=activeRegressionCases(), latest=loadRegressionLatest(), baseline=loadLearningBaseline(), gate=learningReleaseGate(latest,baseline);const byCategory={};for(const c of cases)byCategory[c.category]=(byCategory[c.category]||0)+1;return{enabled:true,version:'2.6',policy:{failureMemory:true,userFeedback:true,negativeFeedbackCreatesFailure:true,autoRegressionOnlyWhenExpectationIsVerifiable:true,rawImageBytesPersisted:false,knownFailuresMustNotRegress:true,criticalOpenFailuresBlockRelease:true,baselineAcceptanceExplicit:true},failureMemory:{total:failures.length,open:failures.filter(x=>['open','reopened'].includes(x.status)).length,criticalOpen:failures.filter(x=>['open','reopened'].includes(x.status)&&x.severity==='critical').length,recent:failures.slice(0,20)},dataset:{active:cases.length,builtin:BUILTIN_REGRESSION_CASES.length,user:loadUserDataset().cases.filter(x=>x.active!==false).length,hash:datasetHash(),byCategory},feedback:{total:feedback.length,positive:feedback.filter(x=>x.value==='positive').length,negative:feedback.filter(x=>x.value==='negative').length},regression:{latest,baseline,history:loadRegressionHistory().slice(-12).reverse(),comparison:compareRegressionReports(latest),gate}}}
export const learningEvaluationInfo={version:'2.6',capabilities:['failure-memory','explicit-user-feedback','versioned-regression-dataset','historical-failure-seeds','known-failure-replay','dataset-hash','learning-release-gate','model-build-comparison','privacy-safe-attachment-metadata']}
