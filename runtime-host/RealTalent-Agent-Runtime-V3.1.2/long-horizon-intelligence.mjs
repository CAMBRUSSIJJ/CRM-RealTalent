import crypto from 'node:crypto'

const nowIso=()=>new Date().toISOString()
const clean=(v,max=4000)=>String(v??'').trim().slice(0,max)
const RISK={low:1,medium:2,high:3,critical:4}
const TERMINAL=new Set(['completed','cancelled','failed'])
const ACTIVE_STAGE=new Set(['running','awaiting_checkpoint','awaiting_external','recovery_required'])

export const longHorizonInfo=Object.freeze({
  version:'2.9',
  name:'Long-Horizon Autonomous Workflows',
  features:Object.freeze({
    programBacked:true,
    dependencyDag:true,
    persistentCheckpoints:true,
    heartbeatLease:true,
    staleRecovery:true,
    resumable:true,
    autonomyBudget:true,
    humanRiskGates:true,
    maxStages:24,
    maxResumeAttempts:3,
    maxCheckpointApprovals:24,
    maxSilentWrites:0,
    defaultLeaseSeconds:300,
    defaultAutonomyMinutes:30,
  }),
  policy:Object.freeze({
    automaticRisk:['low'],
    checkpointRisk:['medium','high','critical'],
    writeAlwaysCheckpoint:true,
    irreversibleAlwaysCheckpoint:true,
    terminalRequiresVerification:true,
  }),
})

const normalizeRisk=(v)=>RISK[v]?v:'low'
const normalizeDepends=(v)=>Array.isArray(v)?[...new Set(v.map(x=>clean(x,120)).filter(Boolean))]:[]
const stageId=(i,raw)=>clean(raw?.id,120)||`stage_${i+1}`

export function buildLongHorizonRun({objective='',product=null,programId=null,stages=[],autonomyMinutes=30,leaseSeconds=300,metadata={}}={}){
  const cleanObjective=clean(objective,7000)
  if(!cleanObjective)throw new Error('Objetivo de longo horizonte vazio.')
  const rawStages=Array.isArray(stages)?stages.slice(0,longHorizonInfo.features.maxStages):[]
  if(!rawStages.length)throw new Error('Execução de longo horizonte exige pelo menos uma etapa.')
  const ids=rawStages.map((s,i)=>stageId(i,s))
  if(new Set(ids).size!==ids.length)throw new Error('IDs de etapas duplicados.')
  const normalized=rawStages.map((raw,i)=>{
    const risk=normalizeRisk(raw.risk)
    const capability=raw.capability==='write'?'write':'read'
    const irreversible=Boolean(raw.irreversible)
    const requiresCheckpoint=capability==='write'||irreversible||RISK[risk]>=RISK.medium||raw.requiresCheckpoint===true
    return {
      id:ids[i], order:i+1, title:clean(raw.title||`Etapa ${i+1}`,200), objective:clean(raw.objective||raw.title||'',3200),
      product:['crm','blue_ocean'].includes(raw.product)?raw.product:(['crm','blue_ocean'].includes(product)?product:null),
      risk, capability, irreversible, requiresCheckpoint,
      dependsOn:normalizeDepends(raw.dependsOn), acceptanceCriteria:Array.isArray(raw.acceptanceCriteria)?raw.acceptanceCriteria.map(x=>clean(x,400)).filter(Boolean).slice(0,12):[],
      status:'pending', attempts:0, resumeAttempts:0, startedAt:null, completedAt:null, lastHeartbeatAt:null, result:null, evidence:[], checkpointId:null, error:'',
    }
  })
  const idSet=new Set(ids)
  for(const s of normalized){for(const dep of s.dependsOn){if(!idSet.has(dep))throw new Error(`Dependência inexistente: ${dep}`);if(dep===s.id)throw new Error(`Etapa ${s.id} não pode depender dela mesma.`)}}
  detectCycle(normalized)
  const now=nowIso()
  return {
    id:`run_${crypto.randomUUID()}`, version:'2.9', objective:cleanObjective, product:['crm','blue_ocean'].includes(product)?product:null, programId:clean(programId,180)||null,
    status:'ready', createdAt:now, updatedAt:now, startedAt:null, completedAt:null, pausedAt:null, lastHeartbeatAt:null,
    autonomy:{minutes:Math.max(1,Math.min(Number(autonomyMinutes)||30,240)),startedAt:null,consumedSeconds:0,expiresAt:null},
    lease:{seconds:Math.max(30,Math.min(Number(leaseSeconds)||300,3600)),owner:null,acquiredAt:null,lastHeartbeatAt:null,expiresAt:null},
    currentStageId:null, stages:normalized, checkpoints:[], events:[], resumeToken:crypto.randomBytes(18).toString('hex'), resumeAttempts:0,
    error:'', metadata:metadata&&typeof metadata==='object'?metadata:{},
  }
}

function detectCycle(stages){
  const map=new Map(stages.map(s=>[s.id,s.dependsOn]));const visiting=new Set(),done=new Set()
  const visit=(id)=>{if(done.has(id))return;if(visiting.has(id))throw new Error('Grafo de dependências contém ciclo.');visiting.add(id);for(const dep of map.get(id)||[])visit(dep);visiting.delete(id);done.add(id)}
  for(const s of stages)visit(s.id)
}

export function publicLongHorizonRun(run){
  if(!run)return null
  const stages=run.stages||[];const completed=stages.filter(s=>s.status==='completed').length;const blocked=stages.filter(s=>['awaiting_checkpoint','recovery_required','failed'].includes(s.status)).length
  return {...run,progress:{total:stages.length,completed,blocked,percent:stages.length?Math.round(completed/stages.length*100):0},resumeToken:undefined}
}

export function dependenciesMet(run,stage){return (stage.dependsOn||[]).every(id=>run.stages.find(s=>s.id===id)?.status==='completed')}
export function nextRunnableStage(run){
  if(!run||TERMINAL.has(run.status)||run.status==='paused')return null
  const current=run.stages.find(s=>s.id===run.currentStageId)
  if(current&&ACTIVE_STAGE.has(current.status))return current
  return run.stages.filter(s=>s.status==='pending'&&dependenciesMet(run,s)).sort((a,b)=>RISK[b.risk]-RISK[a.risk]||a.order-b.order)[0]||null
}

export function acquireLease(run,{owner='agent'}={}){
  if(!run)throw new Error('Run ausente.');const now=Date.now();const existing=Date.parse(run.lease?.expiresAt||'')
  if(run.lease?.owner&&existing>now&&run.lease.owner!==owner)throw new Error('Run possui lease ativo por outro executor.')
  const sec=Number(run.lease?.seconds||300);run.lease={...run.lease,owner:clean(owner,160),acquiredAt:run.lease?.acquiredAt||nowIso(),lastHeartbeatAt:nowIso(),expiresAt:new Date(now+sec*1000).toISOString()};run.lastHeartbeatAt=run.lease.lastHeartbeatAt;touch(run);return run
}
export function heartbeatLongHorizonRun(run,{owner='agent'}={}){
  if(!run?.lease?.owner) return acquireLease(run,{owner})
  if(run.lease.owner!==owner)throw new Error('Heartbeat rejeitado: executor não possui o lease.')
  const now=Date.now(),sec=Number(run.lease.seconds||300);run.lease.lastHeartbeatAt=nowIso();run.lease.expiresAt=new Date(now+sec*1000).toISOString();run.lastHeartbeatAt=run.lease.lastHeartbeatAt
  const stage=run.stages.find(s=>s.id===run.currentStageId);if(stage&&stage.status==='running')stage.lastHeartbeatAt=run.lease.lastHeartbeatAt;touch(run);return run
}

export function startOrAdvanceLongHorizon(run,{owner='agent'}={}){
  if(!run)throw new Error('Run não encontrado.');if(TERMINAL.has(run.status))return {run,checkpoint:null,stage:null}
  if(run.status==='paused')throw new Error('Run está pausado.')
  acquireLease(run,{owner})
  if(!run.startedAt){run.startedAt=nowIso();run.autonomy.startedAt=run.startedAt;run.autonomy.expiresAt=new Date(Date.now()+run.autonomy.minutes*60000).toISOString()}
  if(run.autonomy?.expiresAt&&Date.parse(run.autonomy.expiresAt)<=Date.now()){run.status='paused';run.pausedAt=nowIso();run.error='Orçamento de autonomia expirou; retomada exige intervenção.';event(run,'autonomy_budget_expired');touch(run);return {run,checkpoint:null,stage:null}}
  const stage=nextRunnableStage(run)
  if(!stage){
    const remaining=run.stages.some(s=>s.status!=='completed')
    if(!remaining){run.status='completed';run.completedAt=nowIso();run.currentStageId=null;run.lease.owner=null;event(run,'completed');touch(run)}
    else {run.status='blocked';run.error='Nenhuma etapa elegível; dependências ou intervenção pendentes.';touch(run)}
    return {run,checkpoint:null,stage:null}
  }
  run.currentStageId=stage.id
  if(stage.requiresCheckpoint&&!checkpointApproved(run,stage.id)){
    const cp=ensureCheckpoint(run,stage);stage.status='awaiting_checkpoint';run.status='awaiting_checkpoint';event(run,'checkpoint_required',{stageId:stage.id,checkpointId:cp.id});touch(run);return {run,checkpoint:cp,stage}
  }
  stage.status='running';stage.startedAt=stage.startedAt||nowIso();stage.lastHeartbeatAt=nowIso();stage.attempts=Number(stage.attempts||0)+1;run.status='running';run.error='';event(run,'stage_started',{stageId:stage.id});touch(run);return {run,checkpoint:null,stage}
}

function ensureCheckpoint(run,stage){
  let cp=run.checkpoints.find(c=>c.stageId===stage.id&&['pending','approved'].includes(c.status));if(cp)return cp
  cp={id:`checkpoint_${crypto.randomUUID()}`,stageId:stage.id,type:stage.capability==='write'?'write_confirmation':'risk_checkpoint',risk:stage.risk,irreversible:stage.irreversible,status:'pending',createdAt:nowIso(),approvedAt:null,approvedBy:null,note:'',evidenceRequired:stage.acceptanceCriteria||[]};run.checkpoints.push(cp);stage.checkpointId=cp.id;return cp
}
const checkpointApproved=(run,stageId)=>run.checkpoints.some(c=>c.stageId===stageId&&c.status==='approved')
export function approveLongHorizonCheckpoint(run,checkpointId,{actor='user',note=''}={}){
  const cp=run?.checkpoints?.find(c=>c.id===checkpointId);if(!cp)throw new Error('Checkpoint não encontrado.');if(cp.status==='approved')return run
  if(cp.status!=='pending')throw new Error('Checkpoint não está pendente.');cp.status='approved';cp.approvedAt=nowIso();cp.approvedBy=clean(actor,180);cp.note=clean(note,1200);const stage=run.stages.find(s=>s.id===cp.stageId);if(stage?.status==='awaiting_checkpoint')stage.status='pending';run.status='ready';run.error='';event(run,'checkpoint_approved',{checkpointId:cp.id,stageId:cp.stageId});touch(run);return run
}

export function completeLongHorizonStage(run,stageId,{ok=true,result=null,evidence=[],error=''}={}){
  const stage=run?.stages?.find(s=>s.id===stageId);if(!stage)throw new Error('Etapa não encontrada.');if(!['running','awaiting_external','recovery_required'].includes(stage.status))throw new Error('Etapa não está em estado concluível.')
  if(ok){stage.status='completed';stage.completedAt=nowIso();stage.result=result??null;stage.evidence=Array.isArray(evidence)?evidence.slice(0,30):[];stage.error='';run.currentStageId=null;run.status='ready';run.error='';event(run,'stage_completed',{stageId})}
  else {stage.status='failed';stage.error=clean(error||'Etapa falhou.',2400);run.status='failed';run.error=stage.error;event(run,'stage_failed',{stageId,error:stage.error})}
  touch(run);return run
}

export function pauseLongHorizonRun(run,{reason='pausado'}={}){if(TERMINAL.has(run.status))return run;run.status='paused';run.pausedAt=nowIso();run.error=clean(reason,1800);event(run,'paused',{reason:run.error});touch(run);return run}
export function resumeLongHorizonRun(run,{resumeToken,actor='user'}={}){
  if(run.status!=='paused'&&run.status!=='recovery_required'&&run.status!=='blocked')throw new Error('Run não está em estado retomável.')
  if(resumeToken&&resumeToken!==run.resumeToken)throw new Error('Resume token inválido.')
  if(Number(run.resumeAttempts||0)>=longHorizonInfo.features.maxResumeAttempts)throw new Error('Limite de retomadas excedido.')
  run.resumeAttempts=Number(run.resumeAttempts||0)+1;run.status='ready';run.pausedAt=null;run.error='';run.lease.owner=null;run.autonomy.startedAt=nowIso();run.autonomy.expiresAt=new Date(Date.now()+run.autonomy.minutes*60000).toISOString();event(run,'resumed',{actor:clean(actor,180),attempt:run.resumeAttempts});touch(run);return run
}
export function cancelLongHorizonRun(run,{reason='cancelado'}={}){if(run.status==='completed')throw new Error('Run concluído não pode ser cancelado.');run.status='cancelled';run.error=clean(reason,1800);run.completedAt=nowIso();run.lease.owner=null;event(run,'cancelled',{reason:run.error});touch(run);return run}

export function recoverStaleLongHorizonRun(run,{now=Date.now()}={}){
  if(!run||TERMINAL.has(run.status)||!['running','awaiting_external'].includes(run.status))return {run,recovered:false}
  const expires=Date.parse(run.lease?.expiresAt||'');if(!Number.isFinite(expires)||expires>now)return {run,recovered:false}
  const stage=run.stages.find(s=>s.id===run.currentStageId);if(stage&&stage.status==='running'){stage.status='recovery_required';stage.resumeAttempts=Number(stage.resumeAttempts||0)+1;stage.error='Lease expirou durante execução; verificar efeitos antes de retomar.'}
  run.status='recovery_required';run.error='Execução interrompida detectada por lease expirado. Verifique a etapa antes de retomar.';run.lease.owner=null;event(run,'stale_recovery',{stageId:stage?.id||null});touch(run);return {run,recovered:true,stage}
}

export function autonomyBudget(run){
  const start=Date.parse(run?.autonomy?.startedAt||'');const end=Date.parse(run?.autonomy?.expiresAt||'');const now=Date.now();return {minutes:Number(run?.autonomy?.minutes||0),remainingSeconds:Number.isFinite(end)?Math.max(0,Math.floor((end-now)/1000)):null,expired:Number.isFinite(end)&&end<=now,started:Boolean(Number.isFinite(start))}
}
function event(run,type,data={}){run.events=Array.isArray(run.events)?run.events:[];run.events.push({id:`event_${crypto.randomUUID()}`,type,at:nowIso(),...data});run.events=run.events.slice(-200)}
function touch(run){run.updatedAt=nowIso();return run}
