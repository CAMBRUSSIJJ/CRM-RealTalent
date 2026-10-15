const base=String(process.env.CR7_BASE_URL||'').replace(/\/$/,'')
const supabase=String(process.env.CR7_SUPABASE_URL||'').replace(/\/$/,'')
const anon=String(process.env.CR7_SUPABASE_ANON_KEY||'')
if(!base || !supabase || !anon){
  console.log('CR7 PRODUCTION PROBE BLOCKED')
  console.log('Defina CR7_BASE_URL, CR7_SUPABASE_URL e CR7_SUPABASE_ANON_KEY.')
  process.exit(2)
}
const checks=[]
const add=(label,ok,detail='')=>checks.push({label,ok,detail})
try { const u=new URL(base); add('app HTTPS',u.protocol==='https:',u.origin) } catch { add('app HTTPS',false,'URL inválida') }
try { const u=new URL(supabase); add('supabase HTTPS',u.protocol==='https:',u.origin) } catch { add('supabase HTTPS',false,'URL inválida') }
try {
  const r=await fetch(`${base}/health.json`,{headers:{'cache-control':'no-cache'}})
  const body=await r.json().catch(()=>null)
  add('frontend liveness',r.ok && body?.status==='ok',`HTTP ${r.status}`)
  add('CR7 health marker',body?.commercialReadiness==='v101.11.3-cr7-production-operational-readiness',body?.commercialReadiness||'ausente')
  add('health distinguishes readiness',body?.healthType==='liveness' && body?.readiness==='requires-production-probe')
  const h=r.headers
  add('health no-store',/no-store/i.test(h.get('cache-control')||''),h.get('cache-control')||'ausente')
} catch(error){ add('frontend liveness',false,error.message) }
try {
  const r=await fetch(base,{redirect:'manual'})
  add('root reachable',r.status>=200 && r.status<400,`HTTP ${r.status}`)
  add('HSTS enabled',/max-age=/i.test(r.headers.get('strict-transport-security')||''),r.headers.get('strict-transport-security')||'ausente')
  add('nosniff enabled',(r.headers.get('x-content-type-options')||'').toLowerCase()==='nosniff')
  add('frame protection',(r.headers.get('x-frame-options')||'').toUpperCase()==='DENY')
  add('CSP enabled',Boolean(r.headers.get('content-security-policy')))
} catch(error){ add('root reachable',false,error.message) }
try {
  const r=await fetch(`${supabase}/auth/v1/settings`,{headers:{apikey:anon,Authorization:`Bearer ${anon}`}})
  add('Supabase Auth reachable',r.ok,`HTTP ${r.status}`)
} catch(error){ add('Supabase Auth reachable',false,error.message) }
let pass=0
for(const c of checks){ console.log(`${c.ok?'PASS':'FAIL'} ${c.label}${c.detail?` — ${c.detail}`:''}`); if(c.ok) pass++ }
console.log(`CR7 production probe ${pass}/${checks.length}`)
if(pass!==checks.length) process.exit(1)
