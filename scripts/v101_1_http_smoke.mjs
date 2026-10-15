import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root=process.cwd()
const port=Number(process.env.REALTALENT_SMOKE_PORT||4196)
const bin=path.join(root,'node_modules','.bin','vite')
if(!fs.existsSync(bin)){
  console.error('HTTP smoke V101.1: Vite não instalado.')
  process.exit(1)
}
if(!fs.existsSync(path.join(root,'dist','index.html'))){
  console.error('HTTP smoke V101.1: dist ausente. Execute npm run build.')
  process.exit(1)
}

const child=spawn(bin,['preview','--host','127.0.0.1','--port',String(port),'--strictPort'],{
  cwd:root,
  stdio:['ignore','pipe','pipe'],
  env:{...process.env}
})
let stderr=''
child.stderr.on('data',(chunk)=>{stderr+=String(chunk)})

const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms))
const stop=()=>{
  if(!child.killed) child.kill('SIGTERM')
}
process.on('exit',stop)
process.on('SIGINT',()=>{stop();process.exit(130)})

async function get(pathname){
  const response=await fetch(`http://127.0.0.1:${port}${pathname}`,{redirect:'manual'})
  if(!response.ok) throw new Error(`${pathname} respondeu HTTP ${response.status}`)
  return {response,text:await response.text()}
}

try{
  let ready=false
  let lastError=null
  for(let i=0;i<40;i+=1){
    if(child.exitCode!==null) throw new Error(`vite preview encerrou com código ${child.exitCode}: ${stderr}`)
    try{
      const {text}=await get('/')
      if(text.includes('RealTalent CRM V101.1.0')){ ready=true; break }
    }catch(error){ lastError=error }
    await sleep(250)
  }
  if(!ready) throw lastError||new Error('servidor não ficou pronto em 10s')

  const index=(await get('/')).text
  if(index.includes('Carregando RealTalent CRM')) throw new Error('HTML legado servido')
  if(index.includes('esm.sh')) throw new Error('CDN legado servido')
  if(!index.includes('Consolidation & Runtime QA')) throw new Error('release incorreta servida')

  const health=JSON.parse((await get('/health.json')).text)
  if(health.version!=='101.1.0') throw new Error(`health version ${health.version}`)
  const runtime=JSON.parse((await get('/runtime-version.json')).text)
  if(runtime.version!=='101.1.0') throw new Error(`runtime version ${runtime.version}`)
  await get('/boot-guard.js')

  const assetRefs=[...index.matchAll(/(?:src|href)=["']([^"']*assets\/[^"']+)["']/g)].map((m)=>m[1])
  if(assetRefs.length===0) throw new Error('nenhum asset Vite referenciado')
  for(const ref of assetRefs.slice(0,6)) await get(ref.startsWith('/')?ref:`/${ref.replace(/^\.\//,'')}`)

  console.log(`HTTP smoke V101.1: OK em 127.0.0.1:${port} (${assetRefs.length} assets referenciados).`)
  stop()
}catch(error){
  stop()
  console.error(`HTTP smoke V101.1: FALHOU — ${error instanceof Error?error.message:String(error)}`)
  if(stderr.trim()) console.error(stderr.trim())
  process.exit(1)
}
