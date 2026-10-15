#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rt-h10-supervisor-'))
const countFile=path.join(dir,'count.txt')
const fixture=path.join(dir,'fixture.mjs')
fs.writeFileSync(fixture,`import fs from 'node:fs';\nconst f=${JSON.stringify(countFile)};\nconst n=Number(fs.existsSync(f)?fs.readFileSync(f,'utf8'):0)+1;\nfs.writeFileSync(f,String(n));\nif(n===1) process.exit(23);\nsetInterval(()=>{},1000);\nprocess.on('SIGTERM',()=>process.exit(0));\n`)
const rel=path.relative(root,fixture)
const child=spawn(process.execPath,['scripts/realtalent-communications-supervisor.mjs'],{cwd:root,env:{...process.env,REALTALENT_COMMUNICATIONS_GATEWAY_ENTRY:rel},stdio:['ignore','pipe','pipe']})
let out='';child.stdout.on('data',c=>out+=String(c));child.stderr.on('data',c=>out+=String(c))
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
let ok=false
try{
  for(let i=0;i<30;i++){
    await sleep(150)
    const n=Number(fs.existsSync(countFile)?fs.readFileSync(countFile,'utf8'):0)
    if(n>=2){ok=true;break}
  }
  if(!ok) throw new Error(`supervisor não reiniciou o child. log=${out}`)
  if(!out.includes('reiniciando em')) throw new Error(`log não registrou restart. log=${out}`)
  console.log('OK  supervisor reiniciou gateway após falha')
  console.log('OK  restart foi registrado no log')
  console.log('V101.8.4-H10 supervisor smoke: 2/2')
} finally {
  try{child.kill('SIGTERM')}catch{}
  await sleep(200)
  fs.rmSync(dir,{recursive:true,force:true})
}
