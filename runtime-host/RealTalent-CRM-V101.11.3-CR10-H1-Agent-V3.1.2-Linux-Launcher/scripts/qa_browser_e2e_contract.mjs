import fs from 'node:fs'
import path from 'node:path'
const root=process.cwd(); const read=p=>fs.readFileSync(path.join(root,p),'utf8'); const flows=JSON.parse(read('qa/critical-browser-flows.json')).flows??[]
const shell=read('src/components/layout/app-shell.tsx'); const routeState=read('src/app/route-state.ts'); const app=read('src/app/app.tsx')
const failures=[]; const ids=new Set()
for(const flow of flows){
 if(ids.has(flow.id)) failures.push(`flow duplicado ${flow.id}`); ids.add(flow.id)
 if(!flow.route?.startsWith('#/')) failures.push(`${flow.id}: route inválida`)
 for(const marker of flow.expect?.sourceMarkers??[]){ if(!shell.includes(marker)&&!routeState.includes(marker)&&!app.includes(marker)) failures.push(`${flow.id}: marker ausente ${marker}`) }
 console.log(`OK   ${flow.id} -> ${flow.route}`)
}
if(flows.filter(f=>f.critical).length<6) failures.push('menos de 6 fluxos críticos catalogados')
console.log(`\nBrowser E2E Contract: ${flows.length} fluxos catalogados.`);if(failures.length){for(const f of failures)console.error(`FAIL ${f}`);process.exit(1)}
