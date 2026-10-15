import fs from 'node:fs'
import path from 'node:path'
const root=process.cwd(); const read=p=>fs.readFileSync(path.join(root,p),'utf8')
const contract=read('src/repositories/crm-repository.ts'); const local=read('src/repositories/local-crm-repository.ts'); const supabase=read('src/repositories/supabase-crm-repository.ts')
const block=contract.match(/export interface CrmRepository \{([\s\S]*?)\n\}/)?.[1]??''
const methods=[...block.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9_]*)\s*\(/gm)].map(m=>m[1])
const unique=[...new Set(methods)]; const missingLocal=[]; const missingSupabase=[]
for(const method of unique){
  const pattern=new RegExp(`\\b(?:async\\s+)?${method}\\s*\\(`)
  if(!pattern.test(local)) missingLocal.push(method)
  if(!pattern.test(supabase)) missingSupabase.push(method)
}
const requiredTests=['src/repositories/local-crm-repository.test.ts','src/repositories/repository-performance-v10153.test.ts']
const missingTests=requiredTests.filter(p=>!fs.existsSync(path.join(root,p)))
console.log(`Repository Contract: ${unique.length} métodos no contrato`)
console.log(`OK   Local parity: ${unique.length-missingLocal.length}/${unique.length}`)
console.log(`OK   Supabase parity: ${unique.length-missingSupabase.length}/${unique.length}`)
if(missingTests.length) console.error(`FAIL testes ausentes: ${missingTests.join(', ')}`)
if(missingLocal.length) console.error(`FAIL Local ausentes: ${missingLocal.join(', ')}`)
if(missingSupabase.length) console.error(`FAIL Supabase ausentes: ${missingSupabase.join(', ')}`)
if(missingTests.length||missingLocal.length||missingSupabase.length)process.exit(1)
