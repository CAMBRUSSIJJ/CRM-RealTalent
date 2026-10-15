#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { listCommunicationsProcesses, inspectPort, stopStaleCommunicationsProcesses, tailFile } from './runtime-communications-recovery.mjs'

const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const base=fs.mkdtempSync(path.join(os.tmpdir(),'rt-h1-communications-'))
const release=path.join(base,'RealTalent-CRM-VTEST-Communications-Recovery')
const scripts=path.join(release,'scripts'); fs.mkdirSync(scripts,{recursive:true})
const sibling=path.join(base,'RealTalent-CRM-VOTHER-Independent'); const siblingScripts=path.join(sibling,'scripts'); fs.mkdirSync(siblingScripts,{recursive:true})
const fixture="setInterval(()=>{},1000);process.on('SIGTERM',()=>process.exit(0));"
for(const dir of [scripts,siblingScripts]){fs.writeFileSync(path.join(dir,'realtalent-communications-supervisor.mjs'),fixture);fs.writeFileSync(path.join(dir,'realtalent-communications-gateway.mjs'),fixture)}
const children=[]
const start=(name,cwd=release)=>{const child=spawn(process.execPath,[`scripts/${name}`],{cwd,stdio:'ignore'});children.push(child);return child}
const supervisor=start('realtalent-communications-supervisor.mjs')
const gateway=start('realtalent-communications-gateway.mjs')
const siblingGateway=start('realtalent-communications-gateway.mjs',sibling)
let server=null
try{
  await sleep(180)
  const found=listCommunicationsProcesses({root:release})
  if(!found.some(x=>x.pid===supervisor.pid&&x.role==='supervisor'))throw new Error('supervisor não detectado')
  if(!found.some(x=>x.pid===gateway.pid&&x.role==='gateway'))throw new Error('gateway não detectado')
  console.log('OK  processos RealTalent de Communications detectados por cwd/command')

  const stopped=await stopStaleCommunicationsProcesses({root:release,terminatePid:async pid=>{try{process.kill(pid,'SIGTERM')}catch{}},sleep,log:()=>{}})
  if(stopped.stopped.length<2)throw new Error(`esperava encerrar 2 processos, encerrou ${stopped.stopped.length}`)
  console.log('OK  stale supervisor + gateway encerrados com segurança')

  let siblingAlive=true; try{process.kill(siblingGateway.pid,0)}catch{siblingAlive=false}
  if(!siblingAlive)throw new Error('processo de outra release foi encerrado indevidamente')
  console.log('OK  Communications de outra release fora do escopo foi preservado')

  server=net.createServer(()=>{}); await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',resolve).once('error',reject))
  const port=server.address().port; await sleep(60)
  const owner=inspectPort(port)
  if(!owner.busy)throw new Error(`inspectPort não detectou listener ${port}`)
  console.log('OK  diagnóstico detecta porta local ocupada')

  const logFile=path.join(base,'sample.log'); fs.writeFileSync(logFile,'a\nb\nc\nd\n')
  if(tailFile(logFile,2)!=='c\nd')throw new Error('tailFile inválido')
  console.log('OK  tail de log retorna somente linhas recentes')
  console.log('V101.11.3-H1 Communications recovery smoke: 5/5')
} finally {
  if(server) await new Promise(r=>server.close(r))
  for(const child of children){try{child.kill('SIGKILL')}catch{}}
  fs.rmSync(base,{recursive:true,force:true})
}
