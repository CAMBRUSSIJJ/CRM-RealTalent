import {spawn} from 'node:child_process';import fs from 'node:fs';import os from 'node:os';import path from 'node:path'
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rt-v29-'));const config=path.join(temp,'config'),state=path.join(temp,'state');fs.mkdirSync(config,{recursive:true});fs.mkdirSync(state,{recursive:true})
const port=19100+Math.floor(Math.random()*300);const child=spawn(process.execPath,[new URL('./gateway.mjs',import.meta.url).pathname],{env:{...process.env,XDG_CONFIG_HOME:config,XDG_STATE_HOME:state,REALTALENT_AGENT_PORT:String(port),REALTALENT_AGENT_HOST:'127.0.0.1',REALTALENT_AI_PROVIDER:'ollama',OLLAMA_URL:'http://127.0.0.1:9',OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d)
const base=`http://127.0.0.1:${port}`,sleep=ms=>new Promise(r=>setTimeout(r,ms));for(let i=0;i<120;i++){try{if((await fetch(base+'/health')).ok)break}catch{}await sleep(30)}
let ok=0,total=0;const t=(n,p)=>{total++;console.log(`${p?'OK  ':'FAIL'} ${n}`);if(p)ok++};const json=async(u,opt={})=>{const r=await fetch(base+u,{headers:{'content-type':'application/json'},...opt});let x={};try{x=await r.json()}catch{}return{r,x}}
try{
 let z=await json('/health');t('health expõe V2.9 autonomy',z.r.ok&&z.x.longHorizonIntelligence?.version==='2.9'&&z.x.modes?.includes('AUTONOMY'))
 z=await json('/autonomy/runs',{method:'POST',body:JSON.stringify({objective:'Auditar, ajustar e validar CRM',product:'crm',autonomyMinutes:15,stages:[{id:'audit',objective:'Auditar',risk:'low',capability:'read'},{id:'fix',objective:'Corrigir',risk:'medium',capability:'write',dependsOn:['audit']},{id:'verify',objective:'Verificar',risk:'low',capability:'read',dependsOn:['fix']}]})});const id=z.x.run?.id;t('cria run persistido',z.r.status===201&&id&&z.x.run.status==='ready')
 z=await json(`/autonomy/runs/${id}/advance`,{method:'POST',body:JSON.stringify({owner:'worker-test'})});t('advance inicia leitura low risk',z.r.ok&&z.x.stage?.id==='audit'&&z.x.run.status==='running')
 z=await json(`/autonomy/runs/${id}/stages/audit/complete`,{method:'POST',body:JSON.stringify({ok:true,evidence:['audit PASS']})});t('etapa concluída persiste evidência',z.r.ok&&z.x.run.stages.find(s=>s.id==='audit')?.status==='completed')
 z=await json(`/autonomy/runs/${id}/advance`,{method:'POST',body:JSON.stringify({owner:'worker-test'})});const cp=z.x.checkpoint?.id;t('write para em checkpoint',z.r.ok&&cp&&z.x.run.status==='awaiting_checkpoint')
 z=await json(`/autonomy/runs/${id}/checkpoints/${cp}/approve`,{method:'POST',body:JSON.stringify({actor:'tester',note:'preview conferido'})});t('aprovação libera run',z.r.ok&&z.x.run.status==='ready')
 z=await json(`/autonomy/runs/${id}/advance`,{method:'POST',body:JSON.stringify({owner:'worker-test'})});t('write aprovada inicia sem falso complete',z.r.ok&&z.x.stage?.id==='fix'&&z.x.run.status==='running')
 z=await json(`/autonomy/runs/${id}/pause`,{method:'POST',body:JSON.stringify({reason:'checkpoint operacional'})});t('pause persistente',z.r.ok&&z.x.run.status==='paused')
 z=await json(`/autonomy/runs/${id}/resume`,{method:'POST',body:JSON.stringify({actor:'tester'})});t('resume limitado retorna ready',z.r.ok&&z.x.run.status==='ready'&&z.x.run.resumeAttempts===1)
 z=await json('/autonomy');t('estado V2.9 contabiliza run',z.r.ok&&z.x.autonomy.version==='2.9'&&z.x.autonomy.runs===1)
 const f=path.join(state,'realtalent-agent','long-horizon-runs.json');t('store chmod 600',fs.existsSync(f)&&((fs.statSync(f).mode&0o777)===0o600))
}finally{child.kill('SIGTERM');await sleep(60);fs.rmSync(temp,{recursive:true,force:true})}
console.log(`\nRealTalent Agent V2.9 gateway: ${ok}/${total} testes aprovados.`);if(ok!==total){console.error(logs.slice(-9000));process.exit(1)}
