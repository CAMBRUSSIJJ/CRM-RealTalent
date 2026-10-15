import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const port=Number(process.env.REALTALENT_RUNTIME_CONTROL_PORT||3003)
const tokenFile=path.join(root,'.realtalent-runtime-token')
const token=fs.existsSync(tokenFile)?fs.readFileSync(tokenFile,'utf8').trim():''
try {
  const health=await fetch(`http://127.0.0.1:${port}/health`).then(r=>r.json())
  const readiness=await fetch(`http://127.0.0.1:${port}/readiness`).then(async r=>({status:r.status,...await r.json()}))
  let status=null
  if(token) status=await fetch(`http://127.0.0.1:${port}/status`,{headers:{'x-realtalent-runtime-token':token}}).then(r=>r.json())
  console.log(JSON.stringify({health,readiness,status},null,2))
  if(readiness.status!==200) process.exitCode=2
} catch(error) {
  console.error(`Runtime Control indisponível em 127.0.0.1:${port}: ${error.message}`)
  process.exitCode=1
}
