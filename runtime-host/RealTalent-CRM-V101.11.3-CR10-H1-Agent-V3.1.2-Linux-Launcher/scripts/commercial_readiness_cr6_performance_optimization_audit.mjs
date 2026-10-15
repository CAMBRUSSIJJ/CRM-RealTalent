import fs from 'node:fs'
const checks=[]
const read=(f)=>fs.readFileSync(f,'utf8')
const expect=(label,file,pattern)=>{ const ok=fs.existsSync(file)&&pattern.test(read(file)); checks.push([label,ok]) }
const main=read('src/main.tsx')
const app=read('src/app/app.tsx')
const cascadeSensitiveCss=['prospecting-core.css','prospecting-engine.css','prospecting-workspace.css','prospecting-processing.css','contacts.css','contact-record.css','contact-intelligence.css','proposals-workspace.css']
checks.push(['cascade-sensitive commercial CSS restored to canonical global order',cascadeSensitiveCss.every(name=>main.includes(`import './styles/${name}'`))])
expect('contacts JS remains route-lazy','src/app/app.tsx',/LeadsPage = lazy\(\(\) => import\('\.\.\/features\/leads\/leads-page'\)/)
expect('prospecting JS remains route-lazy','src/app/app.tsx',/ProspectingPage = lazy\(\(\) => import\('\.\.\/features\/prospecting\/prospecting-page'\)/)
expect('proposals JS remains route-lazy','src/app/app.tsx',/ProposalsPage = lazy\(\(\) => import\('\.\.\/features\/proposals\/proposals-page'\)/)
checks.push(['route lazy loaders do not duplicate cascade-sensitive CSS',!app.includes("import('../styles/contacts.css')")&&!app.includes("import('../styles/prospecting-core.css')")&&!app.includes("import('../styles/proposals-workspace.css')")])
expect('idle route prefetch registry','src/app/app.tsx',/commercialPrefetchers/)
expect('prefetch deduplicates route','src/app/app.tsx',/prefetchedCommercialRoutes = new Set/)
expect('prefetch uses browser idle time','src/app/app.tsx',/requestIdleCallback/)
expect('prefetch fallback timer','src/app/app.tsx',/setTimeout\(run, 350\)/)
expect('dashboard schedules likely route prefetch','src/app/app.tsx',/route === 'dashboard' \? \['leads', 'pipeline'\]/)
expect('contacts schedules proposal prefetch','src/app/app.tsx',/route === 'leads' \? \['pipeline', 'proposals'\]/)
expect('progressive snapshot loader retained','src/app/app-context.tsx',/loadProgressiveWorkspaceSnapshot/)
expect('route snapshot slices retained','src/app/app-context.tsx',/snapshotSlicesForRoute/)
expect('route data loading retained','src/app/app-context.tsx',/setRouteDataLoading/)
expect('CR5 observability retained','src/lib/commercial-observability.ts',/installCommercialObservability/)
expect('route p95 retained','src/lib/commercial-observability.ts',/routeP95Ms/)
expect('long task observer retained','src/lib/commercial-observability.ts',/longtask/)
expect('payload budget script','scripts/commercial_readiness_cr6_payload_budget.mjs',/CR6 Payload Budget/)
expect('CR6 QA command','package.json',/qa:commercial-readiness:cr6/)
expect('CR6 runtime command','package.json',/runtime:commercial-readiness:cr6/)
expect('CR5 lineage marker','scripts/start.mjs',/rt_cr5=101\.11\.3-cr5-performance-observability/)
expect('CR6 lineage marker','scripts/start.mjs',/rt_cr6=101\.11\.3-cr6-performance-payload-reduction/)
// Source guardrails are intentionally generous: they catch accidental monolith growth while allowing current modules.
const budgets={
  'src/features/prospecting/prospecting-page.tsx':190_000,
  'src/features/proposals/proposals-page.tsx':150_000,
  'src/features/leads/leads-page.tsx':120_000,
  'src/app/app-context.tsx':410_000,
}
for (const [file,max] of Object.entries(budgets)) checks.push([`source budget ${file} <= ${max}`,fs.existsSync(file)&&fs.statSync(file).size<=max])
let passed=0
for (const [label,ok] of checks) { console.log(`${ok?'PASS':'FAIL'} ${label}`); if(ok) passed++ }
console.log(`CR6 ${passed}/${checks.length} PASS`)
if (passed!==checks.length) process.exit(1)
