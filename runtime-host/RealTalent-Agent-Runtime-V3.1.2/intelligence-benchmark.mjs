import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const BASE=String(process.env.REALTALENT_AGENT_GATEWAY_URL||'http://127.0.0.1:8791').replace(/\/$/,'')
const HERE=path.dirname(fileURLToPath(import.meta.url))
const STATE_DIR=path.join(process.env.XDG_STATE_HOME||path.join(os.homedir(),'.local','state'),'realtalent-agent')
const OUT=path.join(STATE_DIR,'intelligence-benchmark.json')
const results=[]
const add=(category,name,pass,points,detail='')=>results.push({category,name,pass:Boolean(pass),points:pass?points:0,maxPoints:points,detail})
const request=async(url,opt={})=>{try{const r=await fetch(BASE+url,{headers:{'content-type':'application/json'},...opt});const x=await r.json().catch(()=>({}));return {ok:r.ok,status:r.status,x}}catch(e){return {ok:false,status:0,x:{error:String(e?.message||e)}}}}

const h=await request('/health')
if(!h.ok){console.error('RealTalent Agent não está online em '+BASE+'. Abra o runtime antes do benchmark.');process.exit(2)}
add('runtime','Runtime V1.9',h.x.version==='2.6',10,h.x.version||'sem versão')
const hw=await request('/ai/hardware');add('hardware','Hardware Profiler',hw.ok&&hw.x.hardware?.memory?.totalGB>0,8,hw.x.hardware?.profile||'')
const intel=await request('/intelligence');add('router','Model Router',intel.ok&&intel.x.intelligence?.router?.roles?.coder,8,JSON.stringify(intel.x.intelligence?.router?.roles||{}))
add('context','Context Engine',intel.ok&&intel.x.intelligence?.contextEngine?.enabled,8,intel.x.intelligence?.contextEngine?.strategy||'')
add('sandbox','Builder Sandbox',intel.ok&&intel.x.intelligence?.builderSandbox?.enabled,8,intel.x.intelligence?.builderSandbox?.strategy||'')

const cases=[
  ['Preparar todo o CRM para comercialização','crm','program'],
  ['Sincronizar CRM e Blue Ocean em um fluxo ponta a ponta','both','mission'],
  ['Corrigir layout da tela de Contatos','crm','builder'],
  ['Validar a tela do CRM sem alterar nada','crm','qa'],
  ['Revisar o funil e depois validar as etapas','crm','workflow'],
  ['Melhorar o blueprint do serviço','blue_ocean','builder'],
  ['Investigue por que o WhatsApp duplica mensagens, corrija e valide','crm','engineering'],
]
let routeOk=0
for(const [objective,product,expected] of cases){const r=await request('/intelligence/classify',{method:'POST',body:JSON.stringify({objective,product})});const pass=r.ok&&r.x.route?.kind===expected;if(pass)routeOk++;add('routing',objective,pass,5,`esperado=${expected} recebido=${r.x.route?.kind||'erro'}`)}

const py=(name,args)=>spawnSync('python3',[path.join(HERE,name),...args],{encoding:'utf8',timeout:120000})
const b=py('builder_agent.py',['--self-test']);add('builder','Builder isolation self-test',b.status===0&&/PASS/.test(b.stdout||''),10,(b.stdout||b.stderr||'').slice(-500))
const q=py('browser_qa.py',['--self-test']);add('browser','Browser QA self-test',q.status===0&&/PASS/.test(q.stdout||''),10,(q.stdout||q.stderr||'').slice(-500))

const ai=await request('/ai/probe',{method:'POST',body:'{}'})
add('local_ai','AI Provider online',ai.ok,8,ai.x.local?.online?'Ollama online':(ai.x.error||ai.x.local?.error||'offline'))

const score=results.reduce((s,x)=>s+x.points,0), total=results.reduce((s,x)=>s+x.maxPoints,0)
const report={version:1,benchmark:'RealTalent Agent Intelligence V1.9',status:score===total?'PASS':score>=Math.ceil(total*.8)?'PASS_WITH_WARNINGS':'FAIL',score,total,percent:Math.round(score/total*100),routing:`${routeOk}/${cases.length}`,updatedAt:new Date().toISOString(),results}
fs.mkdirSync(STATE_DIR,{recursive:true});fs.writeFileSync(OUT,JSON.stringify(report,null,2),{encoding:'utf8',mode:0o600});try{fs.chmodSync(OUT,0o600)}catch{}
console.log(`RealTalent Agent Intelligence Benchmark V1.9 — ${score}/${total} (${report.percent}%) ${report.status}`)
for(const x of results)console.log(`${x.pass?'PASS':'FAIL'} ${x.category.padEnd(10)} ${x.name}`)
console.log('Relatório: '+OUT)
if(report.status==='FAIL')process.exit(1)
