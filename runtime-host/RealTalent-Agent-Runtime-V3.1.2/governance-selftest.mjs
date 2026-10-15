import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root=fs.mkdtempSync(path.join(os.tmpdir(),'rt-agent-v10-gov-'))
const config=path.join(root,'config'),state=path.join(root,'state')
fs.mkdirSync(path.join(state,'realtalent-agent'),{recursive:true});fs.mkdirSync(path.join(config,'realtalent-agent'),{recursive:true})
const port=8796
const child=spawn(process.execPath,[new URL('./gateway.mjs',import.meta.url).pathname],{env:{...process.env,XDG_CONFIG_HOME:config,XDG_STATE_HOME:state,REALTALENT_AGENT_PORT:String(port),REALTALENT_AGENT_HOST:'127.0.0.1',OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']})
let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d)
const base=`http://127.0.0.1:${port}`,sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function wait(){for(let i=0;i<100;i++){try{const r=await fetch(base+'/health');if(r.ok)return}catch{}await sleep(50)}throw new Error('gateway não iniciou\n'+logs)}
async function json(url,opt={}){const r=await fetch(base+url,{headers:{'content-type':'application/json'},...opt});const x=await r.json().catch(()=>({}));return{r,x}}
let ok=0,total=0;const check=(label,pass)=>{total++;console.log(`${pass?'OK  ':'FAIL'} ${label}`);if(pass)ok++}
try{
  await wait()
  let z=await json('/health');check('health V1.6 governance',z.r.ok&&z.x.version==='3.1'&&z.x.governance?.enabled===true&&z.x.governance?.hashChainedAudit===true&&z.x.modes?.includes('GOVERNANCE'))
  z=await json('/control/state');check('Control Center expõe governance',z.r.ok&&z.x.governance?.actor?.role==='admin'&&z.x.governance?.budget?.limit===100&&z.x.governance?.rollbackScope==='agent-operational-state-only')
  z=await json('/governance/queue',{method:'POST',body:JSON.stringify({type:'qa',product:'crm',priority:'low',objective:'QA baixa'})});const lowId=z.x.item?.id
  z=await json('/governance/queue',{method:'POST',body:JSON.stringify({type:'program',priority:'critical',objective:'Programa crítico'})});const criticalId=z.x.item?.id
  z=await json('/governance');check('fila ordena critical antes de low',z.r.ok&&z.x.governance?.queue?.[0]?.id===criticalId&&z.x.governance?.queue?.some(i=>i.id===lowId))
  z=await json('/governance/objectives',{method:'POST',body:JSON.stringify({title:'Prontidão contínua',objective:'Manter CRM e Blue Ocean verificáveis',priority:'high',reviewCadence:'weekly',products:['crm','blue_ocean']})});const objectiveId=z.x.objective?.id;check('objetivo permanente persistido',z.r.status===201&&z.x.objective?.status==='active'&&z.x.objective?.reviewCadence==='weekly')
  z=await json(`/governance/objectives/${encodeURIComponent(objectiveId)}/queue-program`,{method:'POST',body:'{}'});check('objetivo gera item Program na fila',z.r.status===202&&z.x.item?.type==='program'&&z.x.item?.status==='queued')
  z=await json('/governance/approvals/request',{method:'POST',body:JSON.stringify({operation:'selftest.high',target:'test',risk:'high',credits:2})});const approvalId=z.x.approval?.id;check('aprovação criada',z.r.status===202&&z.x.approval?.status==='pending'&&z.x.approval?.requiredRole==='manager')
  z=await json(`/governance/approvals/${encodeURIComponent(approvalId)}/approve`,{method:'POST',body:JSON.stringify({note:'selftest'})});check('admin aprova risco high',z.r.ok&&z.x.approval?.status==='approved'&&z.x.approval?.decidedBy?.role==='admin')
  z=await json('/governance/snapshots',{method:'POST',body:JSON.stringify({reason:'baseline selftest'})});const snapshotId=z.x.snapshot?.id;check('snapshot operacional criado',z.r.status===201&&z.x.snapshot?.scope==='agent-operational-state-only'&&Array.isArray(z.x.snapshot?.files))
  z=await json('/governance/queue',{method:'POST',body:JSON.stringify({type:'mission',priority:'normal',objective:'Item depois snapshot'})});const afterId=z.x.item?.id
  z=await json(`/governance/snapshots/${encodeURIComponent(snapshotId)}/restore`,{method:'POST',body:'{}'});check('rollback bloqueia sem pause',z.r.status===400&&/Pause novas execuções/.test(z.x.error||''))
  await json('/control/pause',{method:'POST',body:'{}'})
  z=await json(`/governance/snapshots/${encodeURIComponent(snapshotId)}/restore`,{method:'POST',body:'{}'});check('rollback operacional exige pause e funciona',z.r.ok&&z.x.snapshot?.id===snapshotId)
  z=await json('/governance');check('rollback remove estado posterior ao snapshot',z.r.ok&&!z.x.governance?.queue?.some(i=>i.id===afterId))
  z=await json('/control/state');check('rollback preserva estado pausado',z.r.ok&&z.x.control?.executionsPaused===true)
  z=await json('/governance');check('custo do rollback permanece após restauração',z.r.ok&&Number(z.x.governance?.budget?.used||0)>=6)
  z=await json('/governance/audit/verify');check('audit log hash chain íntegro',z.r.ok&&z.x.verification?.ok===true&&z.x.verification?.total>=8)
  const baseState=path.join(state,'realtalent-agent')
  const auditPath=path.join(baseState,'governance-audit.jsonl')
  const auditOriginal=fs.readFileSync(auditPath,'utf8')
  const auditRows=auditOriginal.split('\n').filter(Boolean).map(line=>JSON.parse(line))
  auditRows[0].actor.id=String(auditRows[0].actor?.id||'actor')+'-tampered'
  fs.writeFileSync(auditPath,auditRows.map(row=>JSON.stringify(row)).join('\n')+'\n',{mode:0o600})
  const tampered=await json('/governance/audit/verify')
  fs.writeFileSync(auditPath,auditOriginal,{mode:0o600})
  const restoredAudit=await json('/governance/audit/verify')
  check('audit detecta adulteração em campo aninhado',tampered.r.ok&&tampered.x.verification?.ok===false&&restoredAudit.x.verification?.ok===true)
  const modes=['governance.json','execution-queue.json','standing-objectives.json','governance-audit.jsonl'].filter(f=>fs.existsSync(path.join(baseState,f))).map(f=>fs.statSync(path.join(baseState,f)).mode&0o777)
  check('stores sensíveis chmod 600',modes.length===4&&modes.every(m=>m===0o600))
}finally{child.kill('SIGTERM');await sleep(80);fs.rmSync(root,{recursive:true,force:true})}
console.log(`\nGovernance self-test V1.6: ${ok}/${total} aprovados.`);if(ok!==total)process.exit(1)
