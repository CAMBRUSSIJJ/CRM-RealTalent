import fs from 'node:fs'
const checks=[]
const read=(f)=>fs.readFileSync(f,'utf8')
const main=read('src/main.tsx')
const app=read('src/app/app.tsx')
const ordered=[
 ['metrics-v100.css','automations.css','prospecting-core.css','settings-v100.css'],
 ['product-revenue-v10097.css','prospecting-engine.css','workspace-layout-studio-v100981.css'],
 ['ui-foundation.css','contact-record.css','app-shell.css','contacts.css','workspace-ui.css'],
 ['settings-experience-v10110.css','prospecting-workspace.css','selection-controls.css','contact-intelligence.css','prospecting-processing.css','proposals-workspace.css'],
]
const pos=(name)=>main.indexOf(`import './styles/${name}'`)
checks.push(['all cascade-sensitive styles are global',ordered.flat().every(n=>pos(n)>=0)])
for (const seq of ordered) checks.push([`canonical order ${seq.join(' -> ')}`,seq.every((n,i)=>i===0||pos(seq[i-1])<pos(n))])
checks.push(['route loaders keep JS lazy',/LeadsPage = lazy\(\(\) => import\('\.\.\/features\/leads\/leads-page'\)/.test(app)&&/ProspectingPage = lazy\(\(\) => import\('\.\.\/features\/prospecting\/prospecting-page'\)/.test(app)&&/ProposalsPage = lazy\(\(\) => import\('\.\.\/features\/proposals\/proposals-page'\)/.test(app)])
checks.push(['route loaders do not re-import canonical CSS',!app.includes("import('../styles/contacts.css')")&&!app.includes("import('../styles/contact-record.css')")&&!app.includes("import('../styles/contact-intelligence.css')")&&!app.includes("import('../styles/prospecting-core.css')")&&!app.includes("import('../styles/prospecting-engine.css')")&&!app.includes("import('../styles/prospecting-workspace.css')")&&!app.includes("import('../styles/prospecting-processing.css')")&&!app.includes("import('../styles/proposals-workspace.css')")])
checks.push(['CR10 staging marker preserved',read('scripts/start.mjs').includes('rt_readiness=101.11.3-cr10-supabase-staging-bootstrap')])
checks.push(['CR10-H1 marker present',read('scripts/start.mjs').includes('rt_cr10_h1=101.11.3-cr10-h1-css-cascade-governance')])
let pass=0
for (const [label,ok] of checks){ console.log(`${ok?'PASS':'FAIL'} ${label}`); if(ok) pass++ }
console.log(`CR10-H1 ${pass}/${checks.length} PASS`)
if(pass!==checks.length) process.exit(1)
