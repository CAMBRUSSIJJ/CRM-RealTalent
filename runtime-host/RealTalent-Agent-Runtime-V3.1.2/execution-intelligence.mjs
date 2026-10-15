import crypto from 'node:crypto'

const now=()=>new Date().toISOString()
const clean=(v,max=500)=>String(v??'').trim().slice(0,max)
const arr=(v)=>Array.isArray(v)?v:[]
const RISK_ORDER={low:1,medium:2,high:3,critical:4}

const TOOL_RISK={
  'crm.contacts.search':'low','crm.contacts.get':'low','crm.pipeline.list':'low','crm.communications.getThread':'low',
  'blueOcean.journey.get':'low','blueOcean.blueprint.get':'low','blueOcean.persona.get':'low','blueOcean.serviceGraph.read':'low',
  'crm.contacts.update':'medium','crm.pipeline.moveOpportunity':'high','crm.prospecting.runSearch':'medium','crm.communications.sendMessage':'high'
}
const TOOL_ROLLBACK={
  'crm.contacts.update':{supported:true,mode:'delegated',strategy:'restore_previous_values'},
  'crm.pipeline.moveOpportunity':{supported:true,mode:'delegated',strategy:'move_to_previous_stage'},
  'crm.communications.sendMessage':{supported:false,mode:'none',strategy:'irreversible_external_message'},
  'crm.prospecting.runSearch':{supported:false,mode:'none',strategy:'cancel_if_provider_supports_it'}
}

const stable=(value)=>{
  if(Array.isArray(value))return `[${value.map(stable).join(',')}]`
  if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`
  return JSON.stringify(value)
}
export const executionHash=(value)=>crypto.createHash('sha256').update(stable(value)).digest('hex')

export function executionRiskForTool(tool='',capability='read'){
  return TOOL_RISK[tool]|| (capability==='write'?'high':'low')
}

const inferAffected=(args={})=>{
  if(Array.isArray(args.ids))return args.ids.length
  if(Array.isArray(args.items))return args.items.length
  if(args.id||args.contactId||args.opportunityId||args.threadId)return 1
  if(args.limit)return Math.max(0,Number(args.limit)||0)
  return null
}

export function normalizeExecutionAction(raw={},index=0){
  const tool=clean(raw.tool||raw.name,160)
  const capability=raw.capability==='write'||raw.write===true?'write':'read'
  const risk=['low','medium','high','critical'].includes(raw.risk)?raw.risk:executionRiskForTool(tool,capability)
  const args=raw.args&&typeof raw.args==='object'?structuredClone(raw.args):{}
  const rollback=capability==='write'?(TOOL_ROLLBACK[tool]||{supported:false,mode:'none',strategy:'unknown'}):{supported:true,mode:'not-needed',strategy:'read_only'}
  const id=clean(raw.id||`step_${index+1}`,48).replace(/[^a-zA-Z0-9_-]/g,'_')||`step_${index+1}`
  const affected=inferAffected(args)
  return {
    id,order:index+1,tool,capability,risk,args,
    description:clean(raw.description||tool,300),
    autoExecutable:capability==='read'&&risk==='low',
    requiresConfirmation:capability==='write'||RISK_ORDER[risk]>=3,
    irreversible:capability==='write'&&!rollback.supported,
    affectedEstimate:affected,
    idempotencyKey:executionHash({tool,args}).slice(0,32),
    rollback,
    postconditions:arr(raw.postconditions).map(x=>clean(x,240)).filter(Boolean).slice(0,6),
    status:'planned',confirmation:null,result:null,error:null
  }
}

export function buildExecutionPlan({objective='',product='auto',actions=[],reasoning=null,source='agent'}={}){
  const steps=arr(actions).slice(0,20).map(normalizeExecutionAction).filter(s=>s.tool)
  const maxRisk=steps.reduce((m,s)=>RISK_ORDER[s.risk]>RISK_ORDER[m]?s.risk:m,'low')
  const writes=steps.filter(s=>s.capability==='write')
  const irreversible=writes.filter(s=>s.irreversible)
  const affectedKnown=steps.map(s=>s.affectedEstimate).filter(Number.isFinite)
  const plan={
    version:'2.8',id:`exec_${crypto.randomUUID()}`,createdAt:now(),updatedAt:now(),source:clean(source,80),
    product:['crm','blue_ocean','auto'].includes(product)?product:'auto',objective:clean(objective,1600),status:steps.length?'planned':'empty',
    risk:{level:maxRisk,writeSteps:writes.length,irreversibleSteps:irreversible.length},
    blastRadius:{stepCount:steps.length,affectedEstimate:affectedKnown.length?affectedKnown.reduce((a,b)=>a+b,0):null,externalSideEffects:writes.length>0},
    policy:{readOnlyAutoExecution:true,writeRequiresExplicitConfirmation:true,criticalRequiresExplicitConfirmation:true,maxWriteStepsPerApproval:10,neverTreatMissingEvidenceAsSuccess:true},
    reasoning:reasoning?{task:reasoning.task||null,successCriteria:arr(reasoning.successCriteria||reasoning.success_criteria).slice(0,8)}:null,
    steps,
    approvals:{status:writes.length?'required':'not_required',confirmedStepIds:[],confirmedAt:null,confirmedBy:null},
    execution:{startedAt:null,finishedAt:null,attempt:0,receipts:[]},
    verification:{status:'pending',checks:[],verifiedAt:null},
    rollback:{available:writes.some(s=>s.rollback.supported),full:writes.length>0&&writes.every(s=>s.rollback.supported),steps:writes.filter(s=>s.rollback.supported).map(s=>s.id)},
    integrity:{planHash:null}
  }
  plan.integrity.planHash=executionHash({product:plan.product,objective:plan.objective,steps:plan.steps.map(s=>({tool:s.tool,args:s.args,risk:s.risk,capability:s.capability,idempotencyKey:s.idempotencyKey}))})
  return plan
}

export function publicExecutionPlan(plan={}){
  return structuredClone(plan)
}

export function confirmExecutionPlan(plan,{stepIds='all',actor={id:'local-user',role:'operator'},note=''}={}){
  if(!plan||!Array.isArray(plan.steps))throw new Error('Plano de execução inválido.')
  if(['completed','cancelled','rolled_back'].includes(plan.status))throw new Error('Plano já encerrado.')
  const eligible=plan.steps.filter(s=>s.requiresConfirmation).map(s=>s.id)
  const requested=stepIds==='all'?eligible:arr(stepIds).map(String)
  const invalid=requested.filter(id=>!eligible.includes(id));if(invalid.length)throw new Error(`Etapas não confirmáveis: ${invalid.join(', ')}`)
  const next=new Set([...(plan.approvals?.confirmedStepIds||[]),...requested])
  plan.approvals={status:eligible.every(id=>next.has(id))?'approved':'partial',confirmedStepIds:[...next],confirmedAt:now(),confirmedBy:{id:clean(actor?.id,120),role:clean(actor?.role,80)},note:clean(note,500)}
  for(const s of plan.steps)if(next.has(s.id))s.confirmation={confirmed:true,at:plan.approvals.confirmedAt,by:plan.approvals.confirmedBy}
  plan.status=plan.approvals.status==='approved'?'approved':'awaiting_confirmation';plan.updatedAt=now();return plan
}

export function executionPreview(plan={}){
  const blocked=arr(plan.steps).filter(s=>s.requiresConfirmation&&!s.confirmation?.confirmed)
  return {version:'2.8',planId:plan.id,status:plan.status,risk:plan.risk,blastRadius:plan.blastRadius,rollback:plan.rollback,
    automatic:arr(plan.steps).filter(s=>s.autoExecutable).map(s=>({id:s.id,tool:s.tool,risk:s.risk})),
    requiresConfirmation:blocked.map(s=>({id:s.id,tool:s.tool,risk:s.risk,irreversible:s.irreversible,affectedEstimate:s.affectedEstimate,rollback:s.rollback})),
    warnings:[...(plan.risk?.irreversibleSteps?['Há ação externa irreversível.']:[]),...(plan.risk?.level==='critical'?['Plano contém risco crítico.']:[])]}
}

export function markExecutionStarted(plan){plan.status='running';plan.execution.startedAt=plan.execution.startedAt||now();plan.execution.attempt=(plan.execution.attempt||0)+1;plan.updatedAt=now();return plan}

export function recordExecutionResult(plan,{stepId,ok,status='completed',result=null,error=null,receipt=null}={}){
  const step=plan.steps.find(s=>s.id===stepId);if(!step)throw new Error('Etapa não encontrada.')
  step.status=ok?(status||'completed'):'failed';step.result=ok?result:null;step.error=ok?null:clean(error||'Falha na execução',1000)
  const rec={id:`receipt_${crypto.randomUUID()}`,stepId,tool:step.tool,ok:Boolean(ok),status:step.status,at:now(),idempotencyKey:step.idempotencyKey,receipt:receipt??null,resultDigest:result==null?null:executionHash(result).slice(0,32)}
  plan.execution.receipts.push(rec);plan.updatedAt=now();return rec
}

export function verifyExecutionPlan(plan,{checks=[]}={}){
  const normalized=arr(checks).map((c,i)=>({id:clean(c.id||`check_${i+1}`,60),stepId:c.stepId||null,pass:Boolean(c.pass),evidence:clean(c.evidence||'',600)}))
  const failedSteps=plan.steps.filter(s=>s.status==='failed')
  const pendingSteps=plan.steps.filter(s=>!['completed','delegated','skipped'].includes(s.status))
  const explicitFail=normalized.some(c=>!c.pass)
  const status=failedSteps.length||explicitFail?'failed':pendingSteps.length?'pending':'passed'
  plan.verification={status,checks:normalized,verifiedAt:now()}
  if(status==='passed'){plan.status='completed';plan.execution.finishedAt=now()}
  else if(status==='failed'){plan.status='verification_failed';plan.execution.finishedAt=now()}
  plan.updatedAt=now();return plan.verification
}

export function rollbackPreview(plan={}){
  const completedWrites=arr(plan.steps).filter(s=>s.capability==='write'&&['completed','delegated'].includes(s.status))
  return {version:'2.8',planId:plan.id,possible:completedWrites.some(s=>s.rollback.supported),full:completedWrites.length>0&&completedWrites.every(s=>s.rollback.supported),
    actions:completedWrites.map(s=>({stepId:s.id,tool:s.tool,supported:s.rollback.supported,mode:s.rollback.mode,strategy:s.rollback.strategy})),
    warning:completedWrites.some(s=>!s.rollback.supported)?'Nem todos os efeitos externos podem ser revertidos.':null}
}

export function cancelExecutionPlan(plan,reason='cancelled by user'){
  if(['completed','rolled_back'].includes(plan.status))throw new Error('Plano já encerrado e não pode ser cancelado.')
  plan.status='cancelled';plan.updatedAt=now();plan.execution.finishedAt=now();plan.cancellation={at:now(),reason:clean(reason,500)};return plan
}

export const executionIntelligenceInfo=Object.freeze({version:'2.8',name:'Execution Intelligence & Controlled Autonomy',features:{riskAwarePlanning:true,blastRadiusPreview:true,readOnlyAutoExecution:true,explicitWriteConfirmation:true,stepLevelApproval:true,idempotencyKeys:true,executionReceipts:true,postconditionVerification:true,rollbackPlanning:true,irreversibleActionWarning:true,maxSilentWriteActions:0}})
