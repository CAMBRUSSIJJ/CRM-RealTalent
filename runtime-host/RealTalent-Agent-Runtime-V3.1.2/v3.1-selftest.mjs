import {spawn} from 'node:child_process'
const port=19400+Math.floor(Math.random()*400),base=`http://127.0.0.1:${port}`
const child=spawn(process.execPath,['gateway.mjs'],{cwd:new URL('.',import.meta.url),env:{...process.env,REALTALENT_AGENT_PORT:String(port),REALTALENT_AI_PROVIDER:'ollama',OLLAMA_URL:'http://127.0.0.1:9',REALTALENT_EMBED_TIMEOUT_MS:'800'},stdio:['ignore','pipe','pipe']})
let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d)
const sleep=x=>new Promise(r=>setTimeout(r,x));async function wait(){for(let i=0;i<100;i++){try{const r=await fetch(base+'/health');if(r.ok)return r.json()}catch{}await sleep(60)}throw Error('gateway não iniciou '+logs.slice(-1600))}async function j(path,opt){const r=await fetch(base+path,opt);return {r,x:await r.json()}}
let ok=0;const t=(n,p)=>{console.log(`${p?'OK  ':'FAIL'} ${n}`);if(p)ok++}
try{
 const h=await wait();t('health V3.1',h.version==='3.1'&&h.intelligenceQuality?.version==='3.1'&&h.platformKernel?.version==='3.1')
 let z=await j('/v3.1/quality');t('quality discovery',z.r.ok&&z.x.intelligenceQuality.version==='3.1'&&z.x.memoryKnowledge.rag?.generation==='2.0')
 z=await j('/v3.1/quality/inspect',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'mostre as oportunidades do pipeline',product:'crm'})});t('tool selection 2',z.r.ok&&z.x.quality.toolSelection.rankedTools[0].name==='crm.pipeline.list')
 t('latency budget',z.x.quality.latency.totalMs>0&&z.x.quality.latency.maxOutputTokens>0)
 t('natural style',z.x.quality.style.directAnswerFirst===true&&z.x.quality.style.avoidGenericPreamble===true)
 z=await j('/v3.1/quality/inspect',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'isso',product:'auto',messages:[{role:'user',content:'pipeline CRM'}],app_context:{product:'crm',route:'/contacts'}})});t('reference confidence surfaced',z.r.ok&&z.x.quality.reference.resolverVersion==='3.1')
 z=await j('/v3/capabilities');t('V3 capability registry includes quality',z.r.ok&&z.x.capabilities.some(c=>c.id==='intelligence-quality-v3.1'))
 z=await j('/v3/platform');t('platform 3.1 with stable contract 3.0',z.r.ok&&z.x.platform.version==='3.1'&&z.x.platform.contractVersion==='3.0')
 t('memory/knowledge status upgraded',h.memory?.knowledge?.qualityLayer==='3.1'&&h.memory?.knowledge?.rag?.generation==='2.0')
 z=await j('/platform');t('legacy platform endpoint current version',z.r.ok&&z.x.manifest.version==='3.1')
 console.log(`\nRealTalent Agent V3.1 gateway: ${ok}/10 PASS`);if(ok!==10)process.exit(1)
}finally{child.kill('SIGTERM')}
