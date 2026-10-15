import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const STATE_DIR = path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'realtalent-agent')
export const EVAL_DIR = path.join(STATE_DIR, 'evaluation')
export const LATEST_FILE = path.join(EVAL_DIR, 'latest.json')
export const HISTORY_FILE = path.join(EVAL_DIR, 'history.json')
export const BASELINE_FILE = path.join(EVAL_DIR, 'accepted-baseline.json')
export const RUN_STATE_FILE = path.join(EVAL_DIR, 'run-state.json')

const safeJson=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}}
const writeAtomic=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.${process.pid}.tmp`;fs.writeFileSync(tmp,JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(tmp,file);try{fs.chmodSync(file,0o600)}catch{}}

export const CATEGORY_FLOORS = {
  conversation: 80,
  context: 80,
  project_knowledge: 80,
  grounding: 90,
  tool_selection: 85,
  coding: 85,
  visual_qa: 85,
  recovery: 85,
  governance: 95,
  continuous: 85,
}

export function loadEvaluationLatest(){return safeJson(LATEST_FILE,null)}
export function loadEvaluationHistory(){const x=safeJson(HISTORY_FILE,{version:1,reports:[]});return {version:1,reports:Array.isArray(x.reports)?x.reports.slice(-40):[]}}
export function loadAcceptedBaseline(){return safeJson(BASELINE_FILE,null)}
export function loadEvaluationRunState(){return safeJson(RUN_STATE_FILE,{running:false,profile:null,pid:null,startedAt:null,finishedAt:null,lastError:null})}
export function saveEvaluationRunState(value){writeAtomic(RUN_STATE_FILE,{...loadEvaluationRunState(),...value});return loadEvaluationRunState()}

export function persistEvaluationReport(report){
  const clean=JSON.parse(JSON.stringify(report||{}));writeAtomic(LATEST_FILE,clean)
  const history=loadEvaluationHistory();history.reports.push(clean);history.reports=history.reports.slice(-40);writeAtomic(HISTORY_FILE,history);return clean
}
export function acceptEvaluationBaseline(report=loadEvaluationLatest()){
  if(!report)throw new Error('Nenhum benchmark disponível para aceitar como baseline.')
  const baseline={...report,acceptedAt:new Date().toISOString()};writeAtomic(BASELINE_FILE,baseline);return baseline
}

const categoryMap=(report)=>Object.fromEntries((report?.categories||[]).map(x=>[x.id,x]))
export function evaluateReleaseGate(report=loadEvaluationLatest(),baseline=loadAcceptedBaseline()){
  if(!report)return {status:'NOT_RUN',pass:false,reasons:['Nenhum benchmark executado.'],delta:null,categoryRegressions:[]}
  const reasons=[], regressions=[], current=Number(report.percent||0), base=baseline?Number(baseline.percent||0):null
  for(const [id,floor] of Object.entries(CATEGORY_FLOORS)){
    const cat=categoryMap(report)[id];const pct=Number(cat?.percent||0)
    if(pct<floor)reasons.push(`${id}: ${pct}% abaixo do piso ${floor}%`)
  }
  if(baseline){
    const bmap=categoryMap(baseline), cmap=categoryMap(report)
    for(const [id,bcat] of Object.entries(bmap)){
      const now=Number(cmap[id]?.percent||0), before=Number(bcat?.percent||0)
      if(now<before)regressions.push({category:id,before,now,delta:now-before})
    }
    if(current<base)reasons.push(`score total regrediu ${base}% → ${current}%`)
    if(regressions.length)reasons.push(`${regressions.length} categoria(s) regrediram em relação à baseline aceita`)
  }
  const pass=reasons.length===0
  return {status:pass?(baseline?'PASS':'PASS_NO_BASELINE'):'BLOCKED',pass,reasons,delta:baseline?current-base:null,categoryRegressions:regressions,baselineId:baseline?.id||null,reportId:report.id||null}
}

export function evaluationState(){
  const latest=loadEvaluationLatest(),baseline=loadAcceptedBaseline(),history=loadEvaluationHistory(),run=loadEvaluationRunState(),gate=evaluateReleaseGate(latest,baseline)
  return {enabled:true,version:'2.0.0',suiteVersion:'2.0',latest,baseline,history:history.reports.slice(-12).reverse(),run,gate,categoryFloors:CATEGORY_FLOORS,policy:{releaseRequiresNoCategoryRegression:true,totalScoreMustNotRegress:true,baselineAcceptanceRequiresExplicitAction:true,deterministicGate:true,modelQualityAdvisory:true}}
}

export const reliabilityEvaluationInfo={version:'2.0.0',suiteVersion:'2.0',capabilities:['1000-point-benchmark','category-floors','accepted-baseline','release-regression-gate','history','quick-profile','full-profile','grounding-tests','deterministic-evidence']}
