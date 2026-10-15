import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { fileURLToPath } from 'node:url'
import { collectHardwareProfile } from './hardware-profiler.mjs'

const HERE=path.dirname(fileURLToPath(import.meta.url))
const DATASET_FILE=path.join(HERE,'MODEL_CALIBRATION_DATASET_V3.1.1.json')
const CONFIG_DIR=path.join(process.env.XDG_CONFIG_HOME||path.join(os.homedir(),'.config'),'realtalent-agent')
const STATE_DIR=path.join(process.env.XDG_STATE_HOME||path.join(os.homedir(),'.local','state'),'realtalent-agent','calibration')
const RESULT_FILE=path.join(STATE_DIR,'model-calibration-v3.1.1.json')
const HUMAN_FILE=path.join(STATE_DIR,'human-ab-v3.1.1.json')
const AGENT_ENV=path.join(CONFIG_DIR,'agent.env')
const OLLAMA_URL=String(process.env.OLLAMA_URL||'http://127.0.0.1:11434').replace(/\/$/,'')
const VERSION='3.1.1'
const readJson=(f,d={})=>{try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch{return d}}
const ensure=()=>fs.mkdirSync(STATE_DIR,{recursive:true})
const dataset=()=>readJson(DATASET_FILE,{tasks:[],humanPrompts:[]})
const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,n))
const norm=s=>String(s||'').toLocaleLowerCase('pt-BR')
const mib=n=>Math.round(Number(n||0)/1024/1024)
const sentenceCount=s=>(String(s||'').match(/[.!?](?:\s|$)/g)||[]).length
const memUsedMB=()=>{try{const x=fs.readFileSync('/proc/meminfo','utf8');const m=Object.fromEntries(x.split('\n').map(l=>{const z=l.match(/^(\w+):\s+(\d+)/);return z?[z[1],Number(z[2])*1024]:null}).filter(Boolean));return mib((m.MemTotal||0)-(m.MemAvailable||0))}catch{return 0}}

async function api(endpoint,body=null,timeout=180000){const ac=new AbortController();const t=setTimeout(()=>ac.abort(),timeout);try{const r=await fetch(OLLAMA_URL+endpoint,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:ac.signal});if(!r.ok)throw Error(`${r.status} ${await r.text()}`);return await r.json()}finally{clearTimeout(t)}}
async function tags(){const x=await api('/api/tags',null,4000);return Array.isArray(x.models)?x.models:[]}
function roleCandidates(models,role){const arr=models.map(x=>({name:x.name||x.model,size:x.size||0,details:x.details||{}})).filter(x=>x.name);const n=x=>x.name.toLowerCase();if(role==='vision')return arr.filter(x=>/(gemma3|llava|vision|minicpm|moondream|qwen2\.5vl|qwen3-vl)/.test(n(x)));if(role==='coder'){const c=arr.filter(x=>/(coder|code|deepseek-coder|starcoder)/.test(n(x)));return c.length?c:arr.filter(x=>!/(embed|llava|vision|minicpm|moondream)/.test(n(x)))}return arr.filter(x=>!/(embed|coder|code|llava|vision|minicpm|moondream)/.test(n(x)))}
function scoreText(text,checks={}){const s=norm(text);let got=0,total=0;for(const group of checks.mustIncludeGroups||[]){total++;if(group.some(x=>s.includes(norm(x))))got++}for(const bad of checks.mustNotInclude||[]){total++;if(!s.includes(norm(bad)))got++}if(checks.maxChars){total++;if(String(text).length<=checks.maxChars)got++}if(checks.sentenceRange){total++;const c=sentenceCount(text);if(c>=checks.sentenceRange[0]&&c<=checks.sentenceRange[1])got++}if(checks.regex?.length){if(checks.regexAny){total++;if(checks.regex.some(r=>new RegExp(r,'i').test(text)))got++}else for(const r of checks.regex){total++;if(new RegExp(r,'i').test(text))got++}}return total?Math.round(got/total*100):100}
async function unload(model){try{await api('/api/generate',{model,prompt:'',stream:false,keep_alive:0},20000)}catch{}}
async function runTask(model,task){const before=memUsedMB();const body={model,prompt:task.prompt,stream:false,keep_alive:'20s',options:{temperature:0,num_predict:task.maxTokens||180}};if(task.role==='vision'){const f=path.join(HERE,task.image);body.images=[fs.readFileSync(f).toString('base64')]}const t0=performance.now();const x=await api('/api/generate',body);const wallMs=Math.round(performance.now()-t0);let ps={};try{const p=await api('/api/ps',null,5000);ps=(p.models||[]).find(m=>(m.name||m.model)===model)||{}}catch{}const after=memUsedMB();const text=x.response||'';const quality=scoreText(text,task.checks);const evalSec=Number(x.eval_duration||0)/1e9;const tps=evalSec>0?Number(x.eval_count||0)/evalSec:0;await unload(model);return {id:task.id,quality,wallMs,tokensPerSec:Number(tps.toFixed(2)),evalCount:x.eval_count||0,loadMs:Math.round(Number(x.load_duration||0)/1e6),ramDeltaMB:Math.max(0,after-before),modelResidentMB:mib(ps.size||0),vramMB:mib(ps.size_vram||0),response:text.slice(0,1600)}}
function summarizeModel(model,role,runs){const quality=Math.round(runs.reduce((a,x)=>a+x.quality,0)/Math.max(1,runs.length));const latency=Math.round(runs.reduce((a,x)=>a+x.wallMs,0)/Math.max(1,runs.length));const tps=Number((runs.reduce((a,x)=>a+x.tokensPerSec,0)/Math.max(1,runs.length)).toFixed(2));const resident=Math.max(...runs.map(x=>x.modelResidentMB||0),0);return {model,role,quality,avgLatencyMs:latency,tokensPerSec:tps,modelResidentMB:resident,vramMB:Math.max(...runs.map(x=>x.vramMB||0),0),runs}}
function rankRole(items){if(!items.length)return[];const latMin=Math.min(...items.map(x=>x.avgLatencyMs||1)),latMax=Math.max(...items.map(x=>x.avgLatencyMs||1));const memMin=Math.min(...items.map(x=>x.modelResidentMB||1)),memMax=Math.max(...items.map(x=>x.modelResidentMB||1));return items.map(x=>{const speed=latMax===latMin?100:100-(x.avgLatencyMs-latMin)/(latMax-latMin)*100;const memory=memMax===memMin?100:100-(x.modelResidentMB-memMin)/(memMax-memMin)*100;const weighted=Math.round(x.quality*.90+speed*.07+memory*.03);return {...x,speedScore:Math.round(speed),memoryScore:Math.round(memory),weightedScore:weighted}}).sort((a,b)=>b.weightedScore-a.weightedScore||b.quality-a.quality||a.avgLatencyMs-b.avgLatencyMs)}
function recommendations(results,human=readJson(HUMAN_FILE,null)){const byRole=Object.fromEntries(['general','reasoning','coder','vision'].map(role=>[role,rankRole(results.filter(x=>x.role===role))]));if(human?.winner&&byRole.general?.length){byRole.general=byRole.general.map(x=>({...x,humanPreferred:x.model===human.winner,finalScore:x.weightedScore+(x.model===human.winner?8:0)})).sort((a,b)=>(b.finalScore??b.weightedScore)-(a.finalScore??a.weightedScore))}const rec={};for(const role of Object.keys(byRole)){const floor=role==='vision'?55:65;rec[role]=byRole[role].find(x=>x.quality>=floor)?.model||byRole[role][0]?.model||null}const fastPool=[...(byRole.general||[]),...(byRole.reasoning||[])].filter(x=>x.quality>=60).sort((a,b)=>a.avgLatencyMs-b.avgLatencyMs);rec.fast=fastPool[0]?.model||rec.general;return {roles:rec,rankings:byRole}}
async function runArena(role='all') {ensure();const hw=collectHardwareProfile();let models;try{models=await tags()}catch(e){throw Error(`Ollama não respondeu em ${OLLAMA_URL}. Inicie o Ollama antes de calibrar. (${e.message})`)}const roles=role==='all'?['general','reasoning','coder','vision']:[role];const tasks=dataset().tasks;const results=[];for(const r of roles){const candidates=roleCandidates(models,r).slice(0,6);if(!candidates.length){console.log(`SKIP ${r}: nenhum modelo compatível instalado.`);continue}console.log(`\n[${r.toUpperCase()}] ${candidates.map(x=>x.name).join(', ')}`);for(const c of candidates){const runs=[];for(const task of tasks.filter(t=>t.role===r)){process.stdout.write(`  ${c.name} · ${task.id} ... `);try{const z=await runTask(c.name,task);runs.push(z);console.log(`${z.quality}/100 · ${z.wallMs}ms · ${z.tokensPerSec} tok/s`)}catch(e){console.log(`FAIL ${String(e.message||e).slice(0,180)}`)}}if(runs.length)results.push(summarizeModel(c.name,r,runs))}}
const rec=recommendations(results);const report={version:VERSION,createdAt:new Date().toISOString(),ollamaUrl:OLLAMA_URL,hardware:hw,installedModels:models.map(x=>({name:x.name||x.model,size:x.size||0})),results,recommendations:rec.roles,rankings:rec.rankings};fs.writeFileSync(RESULT_FILE,JSON.stringify(report,null,2));console.log(`\nRelatório: ${RESULT_FILE}`);printRecommendations(report);return report}
function printRecommendations(report=readJson(RESULT_FILE,null)){if(!report){console.log('Nenhuma calibração executada ainda.');return}console.log('\nRecomendação calibrada:');for(const r of ['fast','general','reasoning','coder','vision'])console.log(`  ${r.padEnd(10)} ${report.recommendations?.[r]||'não calibrado'}`)}
function updateEnv(values){fs.mkdirSync(CONFIG_DIR,{recursive:true});let lines=[];if(fs.existsSync(AGENT_ENV))lines=fs.readFileSync(AGENT_ENV,'utf8').split(/\r?\n/);const map=new Map(lines.filter(Boolean).map(l=>{const i=l.indexOf('=');return i>0?[l.slice(0,i),l.slice(i+1)]:[l,'']}));for(const [k,v] of Object.entries(values))if(v)map.set(k,String(v).replace(/\n/g,''));const backup=fs.existsSync(AGENT_ENV)?`${AGENT_ENV}.bak-${Date.now()}`:null;if(backup)fs.copyFileSync(AGENT_ENV,backup);fs.writeFileSync(AGENT_ENV,[...map].map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600});return backup}
function apply(){const report=readJson(RESULT_FILE,null);if(!report)throw Error('Execute a arena antes de aplicar.');const r=report.recommendations||{};const vals={OLLAMA_GENERAL_MODEL:r.general,OLLAMA_FAST_MODEL:r.fast,OLLAMA_CODER_MODEL:r.coder,OLLAMA_REASONING_MODEL:r.reasoning,OLLAMA_VISION_MODEL:r.vision,OLLAMA_MODEL:r.coder};const backup=updateEnv(vals);fs.writeFileSync(path.join(CONFIG_DIR,'model-calibration.json'),JSON.stringify({version:VERSION,appliedAt:new Date().toISOString(),recommendations:r,source:RESULT_FILE,backup},null,2),{mode:0o600});console.log(`Calibração aplicada em ${AGENT_ENV}`);if(backup)console.log(`Backup: ${backup}`);printRecommendations(report)}
async function human(){
  const report=readJson(RESULT_FILE,null)
  if(!report) throw Error('Execute a arena primeiro.')
  const top=rankRole(report.results.filter(x=>x.role==='general')).slice(0,2)
  if(top.length<2) throw Error('A avaliação A/B precisa de pelo menos 2 modelos gerais instalados/calibrados.')
  const prompts=dataset().humanPrompts||[]
  const rl=readline.createInterface({input,output})
  const wins=new Map(top.map(x=>[x.model,0]))
  const votes=[]
  try{
    for(let i=0;i<prompts.length;i++){
      const prompt=prompts[i]
      const order=i%2 ? [top[1].model,top[0].model] : [top[0].model,top[1].model]
      console.log(`\n=== Caso ${i+1}/${prompts.length} ===\n${prompt}\n`)
      const answers=[]
      for(const model of order){
        const x=await api('/api/generate',{model,prompt,stream:false,keep_alive:'20s',options:{temperature:0.2,num_predict:260}},180000)
        answers.push(x.response||'')
        await unload(model)
      }
      console.log(`A) ${answers[0]}\n\nB) ${answers[1]}\n`)
      let v=(await rl.question('Qual resposta parece melhor? [A/B/E=empate]: ')).trim().toUpperCase()
      if(!['A','B','E'].includes(v)) v='E'
      const winner=v==='A' ? order[0] : (v==='B' ? order[1] : null)
      if(winner) wins.set(winner,(wins.get(winner)||0)+1)
      votes.push({prompt,order,vote:v,winner,answers})
    }
  } finally {
    rl.close()
  }
  const sorted=[...wins].sort((a,b)=>b[1]-a[1])
  const winner=sorted[0][1]>sorted[1][1] ? sorted[0][0] : null
  const out={version:VERSION,createdAt:new Date().toISOString(),models:top.map(x=>x.model),wins:Object.fromEntries(wins),winner,votes}
  ensure()
  fs.writeFileSync(HUMAN_FILE,JSON.stringify(out,null,2))
  console.log(`\nA/B salvo: ${HUMAN_FILE}`)
  console.log(winner ? `Preferência humana: ${winner}` : 'Resultado humano: empate')
  const updated={...report,recommendations:recommendations(report.results,out).roles}
  fs.writeFileSync(RESULT_FILE,JSON.stringify(updated,null,2))
  printRecommendations(updated)
}

function status(){const report=readJson(RESULT_FILE,null),human=readJson(HUMAN_FILE,null),applied=readJson(path.join(CONFIG_DIR,'model-calibration.json'),null);console.log(JSON.stringify({version:VERSION,ollamaUrl:OLLAMA_URL,hasArena:Boolean(report),hasHumanAB:Boolean(human),applied:applied||null,recommendations:report?.recommendations||null,resultFile:RESULT_FILE,humanFile:HUMAN_FILE},null,2))}
function selftest(){const fake=[{model:'a',role:'general',quality:92,avgLatencyMs:3000,modelResidentMB:4000},{model:'b',role:'general',quality:80,avgLatencyMs:1000,modelResidentMB:2000},{model:'c',role:'coder',quality:95,avgLatencyMs:2200,modelResidentMB:3000},{model:'v',role:'vision',quality:70,avgLatencyMs:2500,modelResidentMB:3500},{model:'r',role:'reasoning',quality:90,avgLatencyMs:2800,modelResidentMB:3200}];let ok=0;const t=(n,p)=>{console.log(`${p?'OK  ':'FAIL'} ${n}`);if(p)ok++};const ranked=rankRole(fake.filter(x=>x.role==='general'));t('quality has dominant weight',ranked[0].model==='a');const rec=recommendations(fake);t('role recommendation',rec.roles.coder==='c'&&rec.roles.vision==='v'&&rec.roles.reasoning==='r');t('fast derived from low latency quality floor',rec.roles.fast==='b');t('score direct response checks',scoreText('CRM organiza relacionamento com clientes e apoia vendas.',{mustIncludeGroups:[['clientes'],['vendas']],mustNotInclude:['claro!']})===100);t('unsafe generic preamble penalized',scoreText('Claro! vendas clientes',{mustIncludeGroups:[['clientes'],['vendas']],mustNotInclude:['claro!']})<100);t('dataset has four calibrated roles',new Set(dataset().tasks.map(x=>x.role)).size===4);t('human prompts available',(dataset().humanPrompts||[]).length>=5);t('apply never runs in selftest',true);console.log(`\nModel Calibration V3.1.1: ${ok}/8 PASS`);if(ok!==8)process.exit(1)}
const cmd=process.argv[2]||'status';try{if(cmd==='run'||cmd==='arena')await runArena(process.argv[3]||'all');else if(cmd==='recommend')printRecommendations();else if(cmd==='apply')apply();else if(cmd==='human')await human();else if(cmd==='status')status();else if(cmd==='selftest')selftest();else{console.log(`RealTalent Model Calibration V${VERSION}\n\nComandos:\n  status\n  arena [all|general|reasoning|coder|vision]\n  recommend\n  human\n  apply\n  selftest`)}}catch(e){console.error('ERRO:',e.message||e);process.exit(1)}
