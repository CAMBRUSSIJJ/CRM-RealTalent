import {spawn} from 'node:child_process';import assert from 'node:assert/strict'
const port=18999+Math.floor(Math.random()*500);const base=`http://127.0.0.1:${port}`;const child=spawn(process.execPath,['gateway.mjs'],{cwd:new URL('.',import.meta.url),env:{...process.env,REALTALENT_AGENT_PORT:String(port),REALTALENT_AI_PROVIDER:'ollama',OLLAMA_URL:'http://127.0.0.1:9'},stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d)
const sleep=x=>new Promise(r=>setTimeout(r,x));async function wait(){for(let i=0;i<80;i++){try{const r=await fetch(base+'/health');if(r.ok)return r.json()}catch{}await sleep(80)}throw Error('gateway não iniciou '+logs.slice(-2000))}async function json(path,opt){const r=await fetch(base+path,opt);return {r,x:await r.json()}}
let ok=0;const t=(n,p)=>{console.log(`${p?'OK  ':'FAIL'} ${n}`);if(p)ok++}
try{const h=await wait();t('health V3 contract on V3.1 platform',h.version==='3.1'&&h.architecture==='realtalent-intelligence-platform-v3'&&h.platformKernel?.version==='3.1')
let z=await json('/v3/platform');t('platform discovery',z.r.ok&&z.x.platform.version==='3.1'&&z.x.platform.contractVersion==='3.0')
z=await json('/v3/capabilities');t('capabilities discovery',z.r.ok&&z.x.capabilities.some(c=>c.id==='platform-kernel')&&z.x.capabilities.some(c=>c.id==='long-horizon-autonomy'))
z=await json('/v3/apps');t('app adapters discovery',z.r.ok&&z.x.apps.length===2&&z.x.apps.some(a=>a.id==='crm'))
z=await json('/v3/models');t('model roles discovery',z.r.ok&&z.x.models.some(m=>m.role==='reasoning')&&z.x.models.some(m=>m.role==='embedding'))
z=await json('/v3/profiles');t('execution profiles',z.r.ok&&z.x.profiles.length===4&&z.x.profiles.every(p=>p.maxSilentWrites===0))
z=await json('/v3/contracts');t('stable contracts',z.r.ok&&z.x.contracts.version==='3.0'&&z.x.contracts.safety.maxSilentWrites===0)
z=await json('/v3/policy/evaluate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({capability:'write',risk:'high',role:'operator',profile:'autonomous'})});t('policy blocks silent write',z.r.ok&&z.x.policy.decision==='checkpoint'&&z.x.policy.requiresConfirmation===true)
z=await json('/v3/policy/evaluate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({capability:'read',risk:'low',role:'operator',profile:'instant'})});t('policy allows read',z.r.ok&&z.x.policy.decision==='allow'&&z.x.policy.requiresConfirmation===false)
z=await json('/platform');t('legacy platform endpoint preserved',z.r.ok&&z.x.manifest.version==='3.1'&&z.x.compatibility.enabled===true)
console.log(`\nRealTalent Agent V3 compatibility gateway on V3.1: ${ok}/10 PASS`);if(ok!==10)process.exit(1)}finally{child.kill('SIGTERM')}
