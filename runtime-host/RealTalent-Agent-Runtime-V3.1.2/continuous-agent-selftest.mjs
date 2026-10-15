import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root=fs.mkdtempSync(path.join(os.tmpdir(),'rt-continuous-v112-'))
const state=path.join(root,'state'), config=path.join(root,'config');fs.mkdirSync(state,{recursive:true});fs.mkdirSync(config,{recursive:true})
const port=8900+Math.floor(Math.random()*300)
const env={...process.env,XDG_STATE_HOME:state,XDG_CONFIG_HOME:config,REALTALENT_AGENT_PORT:String(port),REALTALENT_AI_PROVIDER:'ollama',OLLAMA_URL:'http://127.0.0.1:59999'}
const child=spawn(process.execPath,['gateway.mjs'],{cwd:path.dirname(new URL(import.meta.url).pathname),env,stdio:['ignore','pipe','pipe']})
let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d)
const base=`http://127.0.0.1:${port}`
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))
async function json(url,opts={}){const r=await fetch(base+url,{...opts,headers:{'content-type':'application/json',...(opts.headers||{})}});let x={};try{x=await r.json()}catch{}return{r,x}}
async function wait(){for(let i=0;i<60;i++){try{const z=await json('/health');if(z.r.ok)return z.x}catch{}await sleep(100)}throw new Error('runtime não iniciou\n'+logs)}
let ok=0,total=0;const check=(name,fn)=>{total++;try{fn();ok++;console.log('OK  ',name)}catch(e){console.log('FAIL',name,'-',e.message)}}
try{
  const h=await wait();check('health V2.0',()=>assert.equal(h.version,'3.1'));check('modo CONTINUOUS',()=>assert.ok(h.modes.includes('CONTINUOUS')));check('continuous health guardrails',()=>{assert.equal(h.continuousAgent.enabled,true);assert.equal(h.continuousAgent.observeOnlyByDefault,true);assert.equal(h.continuousAgent.codeWriteApproval,true)})
  let z=await json('/continuous');const c=z.x.continuous;check('cinco monitores default',()=>assert.equal(c.monitors.length,5));check('monitores pesados opt-in',()=>{const heavy=c.monitors.filter(m=>m.heavy&&m.cadence!=='event');assert.ok(heavy.length>=2);assert.ok(heavy.every(m=>m.enabled===false))});check('production regression por evento',()=>{const m=c.monitors.find(m=>m.kind==='event_regression');assert.ok(m);assert.equal(m.cadence,'event');assert.equal(m.enabled,true)});check('scheduler ativo',()=>assert.equal(c.scheduler.paused,false))
  z=await json('/continuous/pause',{method:'POST',body:'{}'});check('pause',()=>assert.equal(z.x.state.paused,true));z=await json('/continuous/resume',{method:'POST',body:'{}'});check('resume',()=>assert.equal(z.x.state.paused,false))
  z=await json('/continuous/monitors',{method:'POST',body:JSON.stringify({title:'Teste manual',kind:'http_latency',product:'crm',cadence:'manual',enabled:false,config:{url:'http://127.0.0.1:59998/'}})});const created=z.x.monitor;check('criar monitor persistente',()=>{assert.ok(created.id.startsWith('monitor_'));assert.equal(created.enabled,false)});z=await json(`/continuous/monitors/${created.id}/toggle`,{method:'POST',body:JSON.stringify({enabled:true})});check('habilitar monitor',()=>assert.equal(z.x.monitor.enabled,true));z=await json(`/continuous/monitors/${created.id}/toggle`,{method:'POST',body:JSON.stringify({enabled:false})});check('desabilitar monitor',()=>assert.equal(z.x.monitor.enabled,false))
  z=await json('/continuous');const drift=z.x.continuous.monitors.find(m=>m.title==='Project Brain Drift');z=await json(`/continuous/monitors/${drift.id}/run`,{method:'POST',body:'{}'});check('run manual bloqueia sem workspace',()=>assert.equal(z.x.run.status,'blocked'));check('run manual não altera produto',()=>assert.match(z.x.run.summary,/nenhuma modificação/i));const finding=z.x.continuous.findings.open[0];check('finding criado',()=>assert.ok(finding?.id?.startsWith('finding_')));check('finding tem severidade',()=>assert.equal(finding.severity,'medium'))
  z=await json(`/continuous/findings/${finding.id}/ack`,{method:'POST',body:'{}'});check('ack finding',()=>assert.equal(z.x.finding.status,'acknowledged'));z=await json(`/continuous/findings/${finding.id}/resolve`,{method:'POST',body:'{}'});check('resolve finding',()=>assert.equal(z.x.finding.status,'resolved'))
  z=await json('/control/state');check('Control Center expõe Continuous',()=>{assert.equal(z.x.version,'3.1');assert.equal(z.x.continuous.enabled,true)});const html=await (await fetch(base+'/control')).text();check('UI Monitoramento',()=>{assert.ok(html.includes('data-tab="continuous"'));assert.ok(html.includes('Continuous Agent'));assert.ok(html.includes('Achados abertos'))})
  const chat=await (await fetch(base+'/chat')).text();check('Chat alerta findings',()=>assert.ok(chat.includes('alertPill')))
  const monitorsFile=path.join(state,'realtalent-agent','continuous-monitors.json');check('store persistente 0600',()=>{const mode=fs.statSync(monitorsFile).mode&0o777;assert.equal(mode,0o600)})
} finally {child.kill('SIGTERM');await sleep(150);fs.rmSync(root,{recursive:true,force:true})}
console.log(`\nContinuous Agent V2.0: ${ok}/${total} PASS`);if(ok!==total)process.exit(1)
