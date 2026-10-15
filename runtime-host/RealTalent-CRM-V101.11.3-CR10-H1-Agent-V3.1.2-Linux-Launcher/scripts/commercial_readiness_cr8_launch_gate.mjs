import fs from 'node:fs'
const policy=JSON.parse(fs.readFileSync('ops/launch-gate.cr8.json','utf8'))
const results=[]
const yes=(name)=>String(process.env[name]||'').trim()==='1'
const text=(name)=>String(process.env[name]||'').trim()
const https=(name)=>{try{const u=new URL(text(name));return u.protocol==='https:'&&u.hostname&&!['example.com','localhost','127.0.0.1'].includes(u.hostname)}catch{return false}}
const email=(name)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(name))&&!/@example\.com$/i.test(text(name))
const add=(id,ok,detail)=>results.push({id,ok,detail})
add('production-probe',yes('CR8_PRODUCTION_PROBE_PASS'),'CR7 production readiness evidence')
add('staging-e2e',yes('CR8_STAGING_E2E_PASS'),'CR3 staging E2E + role isolation evidence')
add('restore-drill',yes('CR8_BACKUP_RESTORE_DRILL_PASS'),'backup/restore drill evidence')
add('terms',https('CR8_TERMS_URL'),'published HTTPS Terms URL')
add('privacy',https('CR8_PRIVACY_URL'),'published HTTPS Privacy URL')
add('support',email('CR8_SUPPORT_EMAIL'),'monitored support mailbox')
add('incident-owner',text('CR8_INCIDENT_OWNER').length>=3,'named incident owner')
add('customer-owner',text('CR8_FIRST_CUSTOMER_OWNER').length>=3,'named onboarding owner')
add('customer',text('CR8_FIRST_CUSTOMER_NAME').length>=2,'pilot customer identified')
const roleEmails=['CR8_ADMIN_EMAIL','CR8_MANAGER_EMAIL','CR8_SELLER_EMAIL'].map(text)
add('role-accounts',roleEmails.every((_,i)=>email(['CR8_ADMIN_EMAIL','CR8_MANAGER_EMAIL','CR8_SELLER_EMAIL'][i]))&&new Set(roleEmails.map(v=>v.toLowerCase())).size===3,'distinct Admin/Gestor/Vendedor launch accounts')
for(const r of results) console.log(`${r.ok?'PASS':'BLOCK'} ${r.id} — ${r.detail}`)
const blocked=results.filter(r=>!r.ok)
const decision=blocked.length===0?'GO':'NO-GO'
console.log(`\nCR8 LAUNCH DECISION: ${decision}`)
console.log(`Evidence: ${results.length-blocked.length}/${results.length} PASS`)
if(blocked.length){console.log('Hard stops: '+blocked.map(r=>r.id).join(', ')); console.log('No customer data or secrets were printed.'); process.exit(2)}
console.log('All launch evidence is present. Re-run CR7 production probe immediately after deploy and record the release snapshot before customer activation.')
