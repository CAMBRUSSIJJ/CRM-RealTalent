import fs from 'node:fs'
import path from 'node:path'
const root=process.cwd()
const dist=path.join(root,'dist')
const sourceTargets=[
 ['src/features/prospecting/prospecting-page.tsx','prospecting',190000],
 ['src/features/proposals/proposals-page.tsx','proposals',150000],
 ['src/features/leads/leads-page.tsx','contacts',120000],
 ['src/app/app-context.tsx','app-context',410000],
]
console.log('RealTalent CRM — CR6 Payload Budget')
let failed=false
for (const [file,label,budget] of sourceTargets) {
 const bytes=fs.existsSync(file)?fs.statSync(file).size:0
 const ok=bytes>0&&bytes<=budget
 console.log(`${ok?'PASS':'FAIL'} ${label.padEnd(12)} ${String(bytes).padStart(8)} B / ${budget} B source budget`)
 if(!ok) failed=true
}
if (!fs.existsSync(dist)) {
 console.log('DIST BLOCKED — vite build ainda não produziu dist/. Source budgets foram avaliados; bundle budgets aguardam build real.')
 process.exit(failed?1:0)
}
const files=[]
const walk=(dir)=>fs.readdirSync(dir,{withFileTypes:true}).forEach(e=>{const f=path.join(dir,e.name);e.isDirectory()?walk(f):files.push({file:path.relative(dist,f),bytes:fs.statSync(f).size})})
walk(dist)
const js=files.filter(x=>x.file.endsWith('.js')).sort((a,b)=>b.bytes-a.bytes)
const css=files.filter(x=>x.file.endsWith('.css')).sort((a,b)=>b.bytes-a.bytes)
const maxJs=400000,maxCss=300000,totalInitialBudget=900000
const overJs=js.filter(x=>x.bytes>maxJs),overCss=css.filter(x=>x.bytes>maxCss)
console.log(`dist files: ${files.length}; JS >400KB: ${overJs.length}; CSS >300KB: ${overCss.length}`)
overJs.slice(0,10).forEach(x=>console.log(`FAIL JS ${x.bytes} B ${x.file}`))
overCss.slice(0,10).forEach(x=>console.log(`FAIL CSS ${x.bytes} B ${x.file}`))
const index=path.join(dist,'index.html')
let initialBytes=0
if(fs.existsSync(index)){
 const html=fs.readFileSync(index,'utf8')
 const refs=[...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))["']/g)].map(m=>m[1].replace(/^\//,''))
 for(const ref of refs){const hit=files.find(x=>x.file===ref||`assets/${x.file}`===ref); if(hit) initialBytes+=hit.bytes}
 console.log(`${initialBytes<=totalInitialBudget?'PASS':'FAIL'} initial referenced payload ${initialBytes} B / ${totalInitialBudget} B`)
 if(initialBytes>totalInitialBudget) failed=true
}
if(overJs.length||overCss.length) failed=true
if(failed) process.exit(1)
