import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root=fs.mkdtempSync(path.join(os.tmpdir(),'rt-agent-v09-'))
const config=path.join(root,'config'),state=path.join(root,'state')
fs.mkdirSync(path.join(state,'realtalent-agent'),{recursive:true});fs.mkdirSync(path.join(config,'realtalent-agent'),{recursive:true})
const baseState=path.join(state,'realtalent-agent'),programsFile=path.join(baseState,'programs.json'),missionsFile=path.join(baseState,'missions.json'),workflowsFile=path.join(baseState,'workflows.json')
const now=new Date().toISOString()
fs.writeFileSync(workflowsFile,JSON.stringify({version:1,workflows:[]},null,2),{mode:0o600})
fs.writeFileSync(missionsFile,JSON.stringify({version:1,missions:[
 {id:'mission_done',version:1,title:'Missão concluída',objective:'feito',summary:'Marco operacional concluído',status:'completed',currentLegIndex:1,requestedProduct:null,createdAt:now,updatedAt:now,replans:0,error:'',legs:[{id:'leg_1',product:'crm',title:'CRM',objective:'feito',failure_policy:'stop',status:'completed',summary:'validado',workflowId:null,previousWorkflowIds:[],attempts:1}]}
]},null,2),{mode:0o600})
const stageBase={priority:'high',failure_policy:'stop',dependsOn:[],acceptanceCriteria:['Fluxo validado','Sem erro crítico'],summary:'',acceptanceNote:'',previousMissionIds:[],startedAt:now,completedAt:null,acceptedAt:null}
fs.writeFileSync(programsFile,JSON.stringify({version:1,programs:[
 {id:'program_accept',version:1,title:'Aceite',objective:'programa aceite',summary:'self-test',status:'running',currentStageId:'stage_1',requestedProduct:null,createdAt:now,updatedAt:now,replans:0,error:'',stages:[{...stageBase,id:'stage_1',order:1,title:'Marco 1',objective:'Concluir marco',status:'running',missionId:'mission_done',attempts:1},{...stageBase,id:'stage_2',order:2,title:'Marco dependente',objective:'Executar após aceite',dependsOn:['stage_1'],priority:'normal',status:'pending',missionId:'mission_done',attempts:0}]},
 {id:'program_retry',version:1,title:'Retry',objective:'programa retry',summary:'self-test',status:'needs_user',currentStageId:'stage_1',requestedProduct:null,createdAt:now,updatedAt:now,replans:0,error:'rejeitado',stages:[{...stageBase,id:'stage_1',order:1,title:'Marco retry',objective:'Refazer',status:'needs_user',missionId:'mission_old',attempts:1}]},
 {id:'program_pause',version:1,title:'Pause',objective:'programa pause',summary:'self-test',status:'ready',currentStageId:null,requestedProduct:null,createdAt:now,updatedAt:now,replans:0,error:'',stages:[{...stageBase,id:'stage_1',order:1,title:'Marco pause',objective:'Pausar',status:'pending',missionId:null,attempts:0}]},
 {id:'program_cancel',version:1,title:'Cancel',objective:'programa cancel',summary:'self-test',status:'ready',currentStageId:null,requestedProduct:null,createdAt:now,updatedAt:now,replans:0,error:'',stages:[{...stageBase,id:'stage_1',order:1,title:'Marco cancel',objective:'Cancelar',status:'pending',missionId:null,attempts:0}]},
 {id:'program_priority',version:1,title:'Priority',objective:'programa priority',summary:'self-test',status:'ready',currentStageId:null,requestedProduct:null,createdAt:now,updatedAt:now,replans:0,error:'',stages:[{...stageBase,id:'stage_low',order:1,title:'Baixa',objective:'Baixa prioridade',priority:'low',status:'pending',missionId:'mission_done',attempts:0},{...stageBase,id:'stage_critical',order:2,title:'Crítica',objective:'Alta prioridade',priority:'critical',status:'pending',missionId:'mission_done',attempts:0}]}
]},null,2),{mode:0o600})
const port=8797
const child=spawn(process.execPath,[new URL('./gateway.mjs',import.meta.url).pathname],{env:{...process.env,XDG_CONFIG_HOME:config,XDG_STATE_HOME:state,REALTALENT_AGENT_PORT:String(port),REALTALENT_AGENT_HOST:'127.0.0.1',OPENAI_API_KEY:'',REALTALENT_AI_PROVIDER:'openai'},stdio:['ignore','pipe','pipe']})
let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d)
const base=`http://127.0.0.1:${port}`,sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function wait(){for(let i=0;i<80;i++){try{const r=await fetch(base+'/health');if(r.ok)return}catch{}await sleep(50)}throw new Error('gateway não iniciou\n'+logs)}
async function json(url,opt={}){const r=await fetch(base+url,{headers:{'content-type':'application/json'},...opt});const x=await r.json().catch(()=>({}));return{r,x}}
let ok=0,total=0;const check=(label,pass)=>{total++;console.log(`${pass?'OK  ':'FAIL'} ${label}`);if(pass)ok++}
try{
 await wait()
 let z=await json('/health');check('health V1.6 programs',z.r.ok&&z.x.version==='3.1'&&z.x.programsOrchestrator?.enabled===true&&z.x.programsOrchestrator?.humanAcceptanceGate===true&&z.x.modes?.includes('PROGRAM'))
 z=await json('/programs');check('lista programas persistidos',z.r.ok&&z.x.programs?.length===5)
 z=await json('/programs/program_accept/reconcile',{method:'POST',body:'{}'});check('missão concluída sobe para awaiting_acceptance',z.r.ok&&z.x.program?.status==='awaiting_acceptance'&&z.x.program?.currentStage?.status==='awaiting_acceptance')
 z=await json('/programs/program_accept/stages/stage_1/accept',{method:'POST',body:JSON.stringify({note:'Critérios conferidos'})});check('aceite humano libera dependência',z.r.ok&&z.x.program?.status==='ready'&&z.x.program?.progress?.accepted===1&&z.x.program?.stages?.[1]?.status==='pending')
 z=await json('/programs/program_accept/advance',{method:'POST',body:'{}'});check('etapa dependente avança após aceite',z.r.ok&&z.x.program?.currentStage?.id==='stage_2'&&z.x.program?.status==='awaiting_acceptance')
 z=await json('/programs/program_accept/stages/stage_2/accept',{method:'POST',body:'{}'});check('último aceite conclui programa',z.r.ok&&z.x.program?.status==='completed'&&z.x.program?.progress?.accepted===2)
 z=await json('/programs/program_priority/advance',{method:'POST',body:'{}'});check('prioridade escolhe marco crítico primeiro',z.r.ok&&z.x.program?.currentStage?.id==='stage_critical'&&z.x.program?.status==='awaiting_acceptance')
 z=await json('/programs/program_retry/retry',{method:'POST',body:'{}'});check('retry limpa missão e preserva histórico',z.r.ok&&z.x.program?.status==='ready'&&z.x.program?.stages?.[0]?.missionId===null&&z.x.program?.stages?.[0]?.previousMissionIds?.includes('mission_old'))
 z=await json('/programs/program_pause/pause',{method:'POST',body:'{}'});const paused=z.x.program?.status==='paused';z=await json('/programs/program_pause/resume',{method:'POST',body:'{}'});check('pause e resume do programa',paused&&z.r.ok&&z.x.program?.status==='ready')
 z=await json('/programs/program_cancel/cancel',{method:'POST',body:'{}'});check('cancelamento programa',z.r.ok&&z.x.program?.status==='cancelled')
 z=await json('/control/state');check('Control Center expõe programas',z.r.ok&&Array.isArray(z.x.programs?.recent)&&z.x.programs.recent.length===5)
 z=await json('/programs/run',{method:'POST',body:JSON.stringify({objective:'teste sem chave'})});check('program planner falha fechado sem API key',z.r.status===503&&/OpenAI API/.test(z.x.error||''))
 const mode=fs.statSync(programsFile).mode&0o777;check('program store chmod 600',mode===0o600)
}finally{child.kill('SIGTERM');await sleep(80);fs.rmSync(root,{recursive:true,force:true})}
console.log(`\nProgram self-test V1.6: ${ok}/${total} aprovados.`);if(ok!==total)process.exit(1)
