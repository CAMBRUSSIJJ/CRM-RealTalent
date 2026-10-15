import fs from 'node:fs'
import path from 'node:path'
const root=process.cwd(); const read=p=>fs.readFileSync(path.join(root,p),'utf8'); const exists=p=>fs.existsSync(path.join(root,p))
const matrix=JSON.parse(read('qa/capability-matrix.json')); const pkg=JSON.parse(read('package.json'))
const failures=[]; const ids=new Set(); let evidenceCount=0; let executableCount=0
const executableTypes=new Set(['test','smoke','repository','integration','browser-flow','migration'])
for(const capability of matrix.capabilities??[]){
  if(!capability.id||ids.has(capability.id)) failures.push(`capability id inválido/duplicado: ${capability.id}`); ids.add(capability.id)
  const policy=matrix.policy?.tiers?.[capability.tier]; if(!policy) failures.push(`${capability.id}: tier desconhecido ${capability.tier}`)
  const evidence=capability.evidence??[]; evidenceCount+=evidence.length
  if(policy && evidence.length<policy.minimumEvidence) failures.push(`${capability.id}: evidência insuficiente`)
  let executable=false
  for(const item of evidence){
    if(!matrix.policy.evidenceTypes.includes(item.type)) failures.push(`${capability.id}: evidence type desconhecido ${item.type}`)
    if(item.path&&!exists(item.path)) failures.push(`${capability.id}: arquivo de evidência ausente ${item.path}`)
    if(item.command&&!pkg.scripts?.[item.command]) failures.push(`${capability.id}: comando ausente ${item.command}`)
    if(item.flow){const flows=JSON.parse(read('qa/critical-browser-flows.json')).flows??[];if(!flows.some(flow=>flow.id===item.flow)) failures.push(`${capability.id}: browser flow ausente ${item.flow}`)}
    if(executableTypes.has(item.type)&&item.command){executable=true; executableCount++}
  }
  if(policy?.requiresExecutableEvidence&&!executable) failures.push(`${capability.id}: sem evidência executável`)
}
if((matrix.capabilities??[]).length<12) failures.push('matriz deve cobrir ao menos 12 capacidades principais')
console.log(`Capability Matrix: ${matrix.capabilities.length} capacidades · ${evidenceCount} evidências · ${executableCount} executáveis`)
for(const cap of matrix.capabilities) console.log(`OK   ${cap.id} [${cap.tier}]`)
if(failures.length){for(const f of failures) console.error(`FAIL ${f}`);process.exit(1)}
