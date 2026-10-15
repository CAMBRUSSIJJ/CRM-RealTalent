#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { listCommunicationsProcesses } from './runtime-communications-recovery.mjs'

const root=process.cwd()
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))
const base=fs.mkdtempSync(path.join(os.tmpdir(),'rt-h198h1-'))
const token='h198h1-'+'x'.repeat(48)
const freePort=async()=>{const server=net.createServer();await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',resolve).once('error',reject));const port=server.address().port;await new Promise(r=>server.close(r));return port}
const port=await freePort()
const store=path.join(base,'store.json'), key=path.join(base,'key'), config=path.join(base,'config.json')
fs.writeFileSync(config,'{}')
const env={...process.env,REALTALENT_COMMUNICATIONS_PORT:String(port),REALTALENT_COMMUNICATIONS_HOST:'127.0.0.1',REALTALENT_RUNTIME_TOKEN:token,REALTALENT_COMMUNICATIONS_EXPECTED_VERSION:'101.8.4-h13',REALTALENT_COMMUNICATIONS_STORE:store,REALTALENT_COMMUNICATIONS_KEY_FILE:key,REALTALENT_COMMUNICATIONS_CONFIG:config}
const supervisor=spawn(process.execPath,['scripts/realtalent-communications-supervisor.mjs'],{cwd:root,env,stdio:'ignore'})
const health=async(auth=true)=>{try{const r=await fetch(`http://127.0.0.1:${port}/api/communications/health`,{headers:auth?{'x-realtalent-runtime-token':token}:{}});return {ok:r.ok,status:r.status,data:await r.json().catch(()=>({}))}}catch{return {ok:false,status:0,data:{}}}}
const waitHealthy=async(limit=50)=>{for(let i=0;i<limit;i++){const h=await health();if(h.ok)return h;await sleep(200)}return health()}
try{
  const first=await waitHealthy()
  if(!first.ok)throw new Error(`gateway não iniciou: HTTP ${first.status}`)
  console.log('OK  supervisor inicia Communications Gateway e health fica pronto')
  if(first.data.version!=='101.8.4-h13')throw new Error(`versão inesperada ${first.data.version}`)
  console.log('OK  health reporta versão esperada')
  const unauth=await health(false)
  if(unauth.status!==401)throw new Error(`health sem token deveria ser 401; recebeu ${unauth.status}`)
  console.log('OK  health interno permanece autenticado')
  await sleep(250)
  const before=listCommunicationsProcesses({root}).filter(x=>x.sameRoot)
  const oldGateway=before.find(x=>x.role==='gateway'&&x.pid!==supervisor.pid)
  if(!oldGateway)throw new Error('gateway filho não foi localizado')
  process.kill(oldGateway.pid,'SIGKILL')
  let newGateway=null
  for(let i=0;i<50;i++){
    await sleep(200)
    const processes=listCommunicationsProcesses({root}).filter(x=>x.sameRoot&&x.role==='gateway'&&x.pid!==oldGateway.pid)
    if(processes.length){const h=await health();if(h.ok){newGateway=processes[0];break}}
  }
  if(!newGateway)throw new Error('supervisor não recuperou gateway após queda')
  console.log('OK  supervisor reinicia gateway após queda do processo')
  const final=await health()
  if(!final.ok)throw new Error('gateway recuperado não respondeu health')
  console.log('OK  health volta a ficar pronto após recuperação')
  console.log('WhatsApp Runtime Recovery H19.8-H1 smoke: 5/5')
} finally {
  try{supervisor.kill('SIGTERM')}catch{}
  await sleep(400)
  for(const proc of listCommunicationsProcesses({root}).filter(x=>x.sameRoot)){try{process.kill(proc.pid,'SIGKILL')}catch{}}
  fs.rmSync(base,{recursive:true,force:true})
  fs.rmSync(path.join(root,'.realtalent-whatsapp-browser'),{recursive:true,force:true})
}
