import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const root=process.cwd()
const sha256=(file)=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const migrationsDir=path.join(root,'supabase','migrations')
const migrations=fs.existsSync(migrationsDir)
  ? fs.readdirSync(migrationsDir).filter(n=>n.endsWith('.sql')).sort().map(name=>({name,sha256:sha256(path.join(migrationsDir,name))}))
  : []
const distDir=path.join(root,'dist')
const dist=[]
if(fs.existsSync(distDir)){
  const walk=(dir)=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory()) walk(full); else dist.push({file:path.relative(distDir,full),bytes:fs.statSync(full).size,sha256:sha256(full)})}}
  walk(distDir)
}
const snapshot={
  schema:'realtalent-release-snapshot/v1',
  createdAt:new Date().toISOString(),
  version:JSON.parse(fs.readFileSync('package.json','utf8')).version,
  readiness:'101.11.3-cr7-production-operational-readiness',
  packageLock:fs.existsSync('package-lock.json')?sha256('package-lock.json'):null,
  migrations,
  dist,
}
const out=path.join(root,`release-snapshot-${new Date().toISOString().replace(/[:.]/g,'-')}.json`)
fs.writeFileSync(out,JSON.stringify(snapshot,null,2)+'\n')
console.log(`PASS release snapshot: ${out}`)
console.log(`migrations=${migrations.length} distFiles=${dist.length}`)
