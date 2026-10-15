import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..')
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rt-comm-gateway-'))
const port=33102
const child=spawn(process.execPath,[path.join(root,'scripts/realtalent-communications-gateway.mjs')],{cwd:root,env:{...process.env,REALTALENT_COMMUNICATIONS_PORT:String(port),REALTALENT_COMMUNICATIONS_STORE:path.join(dir,'store.json'),REALTALENT_COMMUNICATIONS_KEY_FILE:path.join(dir,'key'),REALTALENT_COMMUNICATIONS_CONFIG:path.join(dir,'config.json')},stdio:['ignore','pipe','pipe']})
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))
try{
  let health=null
  for(let i=0;i<30;i++){try{const r=await fetch(`http://127.0.0.1:${port}/api/communications/health`);if(r.ok){health=await r.json();break}}catch{}await sleep(100)}
  if(!health?.ok)throw new Error('health indisponível')
  const accounts=await fetch(`http://127.0.0.1:${port}/api/integrations/accounts?workspaceId=qa`).then(r=>r.json())
  if(!Array.isArray(accounts.accounts)||accounts.accounts.length!==0)throw new Error('contrato de contas inválido')
  const events=await fetch(`http://127.0.0.1:${port}/api/communications/events?workspaceId=qa`).then(r=>r.json())
  if(!Array.isArray(events.events))throw new Error('contrato de eventos inválido')
  console.log('V101.8.4-H2 Communications Gateway smoke: OK')
}finally{child.kill('SIGTERM');fs.rmSync(dir,{recursive:true,force:true})}
