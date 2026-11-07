// Stamp static liveness information with *this* build identity.
// A 200 health.json is liveness only; it is not an Auth or Database readiness test.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFileSync} from 'node:child_process'

export function stampHealth({root=process.cwd(),environment=process.env,now=new Date(),gitCommit}={}){
  const source=JSON.parse(fs.readFileSync(path.join(root,'public','health.json'),'utf8'))
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'))
  let commit=String(environment.VERCEL_GIT_COMMIT_SHA||environment.GITHUB_SHA||
    environment.VITE_COMMIT_SHA||gitCommit||'').trim()
  if(!/^[a-f0-9]{40}$/i.test(commit)){
    try{commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',timeout:2000}).trim()}
    catch{commit='unavailable'}
  }
  if(!/^[a-f0-9]{40}$/i.test(commit))commit='unavailable'
  // VERCEL_ENV is authoritative: preview builds may inherit APP_ENV=production
  // from project-level Vite configuration. Never label preview as Production.
  const channel=environment.VERCEL_ENV==='production'?'production':
    environment.VERCEL_ENV==='preview'?'preview':
    environment.VITE_APP_ENV==='production'?'production':'local'
  const info={
    ...source,
    version:String(pkg.version||source.version),
    release:'CRM '+String(pkg.version||source.version),
    channel,
    commit,
    builtAt:now.toISOString(),
    generatedAt:now.toISOString(),
    healthType:'liveness',
    readiness:'requires-production-probe',
  }
  const dist=path.join(root,'dist')
  if(!fs.existsSync(dist))throw new Error('A pasta dist não existe; execute vite build antes do stamp.')
  fs.writeFileSync(path.join(dist,'health.json'),JSON.stringify(info,null,2)+'\n','utf8')
  return {commit:info.commit,channel:info.channel,version:info.version}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const info=stampHealth()
  console.log('RealTalent health.json atualizado:',info.channel,info.version,info.commit.slice(0,12))
}
