import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-agent-v09-'))
const config = path.join(root, 'config')
const state = path.join(root, 'state')
fs.mkdirSync(path.join(state, 'realtalent-agent'), { recursive: true })
fs.mkdirSync(path.join(config, 'realtalent-agent'), { recursive: true })
const baseState = path.join(state, 'realtalent-agent')
const missionsFile = path.join(baseState, 'missions.json')
const workflowsFile = path.join(baseState, 'workflows.json')
const now = new Date().toISOString()
const workflows = {
  version: 1,
  workflows: [
    { id:'wf_done',version:1,product:'crm',title:'CRM done',objective:'feito',summary:'CRM concluído',status:'completed',currentStepIndex:1,createdAt:now,updatedAt:now,error:'',steps:[{id:'step_1',kind:'analyze',title:'Analisar',objective:'analisar',failure_policy:'stop',status:'completed',summary:'Sinais comerciais consolidados',outcome:'PASS',jobId:null,action:null}] },
    { id:'wf_checkpoint',version:1,product:'blue_ocean',title:'Blue checkpoint',objective:'ajustar',summary:'Blue',status:'awaiting_approval',currentStepIndex:0,createdAt:now,updatedAt:now,error:'',steps:[{id:'step_1',kind:'act',title:'Criar evidência',objective:'evidência',failure_policy:'stop',status:'awaiting_approval',summary:'Pronto',outcome:null,jobId:null,action:{tool:'blue.create_evidence',stage_id:'s1',title:'Teste',description:'Teste',source_type:'other',rationale:'selftest',risk:'write'}}] },
  ],
}
const missions = {
  version: 1,
  missions: [
    { id:'mission_handoff',version:1,title:'Handoff',objective:'CRM para Blue',summary:'self-test',status:'waiting_workflow',currentLegIndex:0,requestedProduct:'crm',createdAt:now,updatedAt:now,replans:0,error:'',legs:[
      {id:'leg_1',product:'crm',title:'CRM',objective:'Analisar CRM',failure_policy:'stop',status:'running',summary:'',workflowId:'wf_done',previousWorkflowIds:[],attempts:1},
      {id:'leg_2',product:'blue_ocean',title:'Blue',objective:'Aplicar no Blue',failure_policy:'stop',status:'pending',summary:'',workflowId:null,previousWorkflowIds:[],attempts:0},
    ]},
    { id:'mission_checkpoint',version:1,title:'Checkpoint',objective:'Blue checkpoint',summary:'self-test',status:'running',currentLegIndex:0,requestedProduct:'blue_ocean',createdAt:now,updatedAt:now,replans:0,error:'',legs:[
      {id:'leg_1',product:'blue_ocean',title:'Blue',objective:'Checkpoint',failure_policy:'stop',status:'running',summary:'',workflowId:'wf_checkpoint',previousWorkflowIds:[],attempts:1},
    ]},
    { id:'mission_retry',version:1,title:'Retry',objective:'retry',summary:'self-test',status:'failed',currentLegIndex:0,requestedProduct:'crm',createdAt:now,updatedAt:now,replans:0,error:'falhou',legs:[
      {id:'leg_1',product:'crm',title:'CRM',objective:'Retry',failure_policy:'stop',status:'failed',summary:'falhou',workflowId:'wf_old',previousWorkflowIds:[],attempts:1},
    ]},
    { id:'mission_cancel',version:1,title:'Cancel',objective:'cancelar',summary:'self-test',status:'needs_context',currentLegIndex:0,requestedProduct:'crm',createdAt:now,updatedAt:now,replans:0,error:'',legs:[
      {id:'leg_1',product:'crm',title:'CRM',objective:'Cancel',failure_policy:'stop',status:'pending',summary:'',workflowId:null,previousWorkflowIds:[],attempts:0},
    ]},
  ],
}
fs.writeFileSync(workflowsFile, JSON.stringify(workflows,null,2), { mode:0o600 })
fs.writeFileSync(missionsFile, JSON.stringify(missions,null,2), { mode:0o600 })
const port=8798
const child=spawn(process.execPath,[new URL('./gateway.mjs',import.meta.url).pathname],{env:{...process.env,XDG_CONFIG_HOME:config,XDG_STATE_HOME:state,REALTALENT_AGENT_PORT:String(port),REALTALENT_AGENT_HOST:'127.0.0.1',OPENAI_API_KEY:'',REALTALENT_AI_PROVIDER:'openai'},stdio:['ignore','pipe','pipe']})
let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d)
const base=`http://127.0.0.1:${port}`;const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function wait(){for(let i=0;i<80;i++){try{const r=await fetch(base+'/health');if(r.ok)return}catch{}await sleep(50)}throw new Error('gateway não iniciou\n'+logs)}
async function json(url,opt={}){const r=await fetch(base+url,{headers:{'content-type':'application/json'},...opt});const x=await r.json().catch(()=>({}));return{r,x}}
let ok=0,total=0;const check=(label,pass)=>{total++;console.log(`${pass?'OK  ':'FAIL'} ${label}`);if(pass)ok++}
try{
  await wait()
  let z=await json('/health');check('health V1.6 missions',z.r.ok&&z.x.version==='3.1'&&z.x.missionsOrchestrator?.enabled===true&&z.x.modes?.includes('MISSION'))
  z=await json('/missions');check('lista missões persistidas',z.r.ok&&z.x.missions?.length===4)
  z=await json('/missions/mission_handoff/reconcile',{method:'POST',body:'{}'});check('reconcile conclui bloco e pede outro produto',z.r.ok&&z.x.mission?.currentLegIndex===1&&z.x.mission?.status==='needs_context'&&z.x.mission?.requestedProduct==='blue_ocean')
  z=await json('/missions/mission_checkpoint/reconcile',{method:'POST',body:'{}'});check('checkpoint filho sobe para missão',z.r.ok&&z.x.mission?.status==='awaiting_checkpoint'&&z.x.mission?.currentWorkflow?.status==='awaiting_approval')
  z=await json('/missions/mission_retry/retry',{method:'POST',body:'{}'});check('retry limpa workflow e preserva histórico',z.r.ok&&z.x.mission?.status==='needs_context'&&z.x.mission?.currentLeg?.workflowId===null&&z.x.mission?.currentLeg?.previousWorkflowIds?.includes('wf_old'))
  z=await json('/missions/mission_cancel/cancel',{method:'POST',body:'{}'});check('cancelamento missão',z.r.ok&&z.x.mission?.status==='cancelled')
  z=await json('/control/state');check('Control Center expõe missões',z.r.ok&&Array.isArray(z.x.missions?.recent)&&z.x.missions.recent.length===4)
  z=await json('/missions/run',{method:'POST',body:JSON.stringify({objective:'teste sem chave'})});check('mission planner falha fechado sem API key',z.r.status===503&&/OpenAI API/.test(z.x.error||''))
  const mode=fs.statSync(missionsFile).mode&0o777;check('mission store chmod 600',mode===0o600)
}finally{child.kill('SIGTERM');await sleep(80);fs.rmSync(root,{recursive:true,force:true})}
console.log(`\nMission self-test V1.6: ${ok}/${total} aprovados.`);if(ok!==total)process.exit(1)
