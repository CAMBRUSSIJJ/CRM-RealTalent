import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root=process.cwd(), evidenceDir=path.join(root,'ops','evidence'); fs.mkdirSync(evidenceDir,{recursive:true})
const secretValues=Object.entries(process.env).filter(([k,v])=>/(PASSWORD|SECRET|TOKEN|KEY|SERVICE_ROLE|DB_PASSWORD)/i.test(k)&&String(v||'').length>=6).map(([,v])=>String(v))
const sanitize=(x='')=>{let s=String(x);for(const v of secretValues)s=s.split(v).join('[REDACTED]');return s.replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi,'$1[REDACTED]')}
const run=(id,cmd,args=[],extraEnv={})=>{const r=spawnSync(cmd,args,{cwd:root,env:{...process.env,...extraEnv},encoding:'utf8',timeout:240000});const out=sanitize((r.stdout||'')+(r.stderr?`\n[stderr]\n${r.stderr}`:''));fs.writeFileSync(path.join(evidenceDir,`${id}.log`),out.trim()+'\n');return {id,ok:r.status===0,status:r.status,stdout:sanitize(r.stdout||''),stderr:sanitize(r.stderr||'')}}

const qa=run('cr10-qa',process.execPath,['scripts/commercial_readiness_cr10_staging_bootstrap_audit.mjs'])
const preflight=run('cr10-preflight',process.execPath,['scripts/commercial_readiness_cr10_staging_preflight.mjs'])
const migrations=preflight.ok?run('cr10-migrations','bash',['ops/staging-supabase-apply.sh']):{id:'cr10-migrations',ok:false,status:2,stdout:'',stderr:'preflight blocked'}
const accounts=(preflight.ok&&migrations.ok)?run('cr10-accounts',process.execPath,['scripts/commercial_readiness_cr10_seed_staging_accounts.mjs']):{id:'cr10-accounts',ok:false,status:2,stdout:'',stderr:'migrations blocked'}
let workspaceId=''
try{workspaceId=JSON.parse(fs.readFileSync(path.join(evidenceDir,'CR10_STAGING_CONTEXT.json'),'utf8')).workspace.id}catch{}
const probeEnv=workspaceId?{
  CR2_SUPABASE_URL:process.env.CR10_SUPABASE_URL,CR2_SUPABASE_ANON_KEY:process.env.CR10_SUPABASE_PUBLISHABLE_KEY,CR2_WORKSPACE_ID:workspaceId,
  CR2_ADMIN_EMAIL:process.env.CR10_ADMIN_EMAIL,CR2_ADMIN_PASSWORD:process.env.CR10_ADMIN_PASSWORD,CR2_MANAGER_EMAIL:process.env.CR10_MANAGER_EMAIL,CR2_MANAGER_PASSWORD:process.env.CR10_MANAGER_PASSWORD,CR2_SELLER_EMAIL:process.env.CR10_SELLER_EMAIL,CR2_SELLER_PASSWORD:process.env.CR10_SELLER_PASSWORD,
  CR3_SUPABASE_URL:process.env.CR10_SUPABASE_URL,CR3_SUPABASE_ANON_KEY:process.env.CR10_SUPABASE_PUBLISHABLE_KEY,CR3_WORKSPACE_ID:workspaceId,
  CR3_ADMIN_EMAIL:process.env.CR10_ADMIN_EMAIL,CR3_ADMIN_PASSWORD:process.env.CR10_ADMIN_PASSWORD,CR3_MANAGER_EMAIL:process.env.CR10_MANAGER_EMAIL,CR3_MANAGER_PASSWORD:process.env.CR10_MANAGER_PASSWORD,CR3_SELLER_EMAIL:process.env.CR10_SELLER_EMAIL,CR3_SELLER_PASSWORD:process.env.CR10_SELLER_PASSWORD,
}:{}
const cr2=accounts.ok?run('cr10-cr2-auth-rls',process.execPath,['scripts/commercial_readiness_cr2_staging_probe.mjs'],probeEnv):{id:'cr10-cr2-auth-rls',ok:false,status:2,stdout:'',stderr:'accounts blocked'}
const cr3=accounts.ok?run('cr10-cr3-e2e',process.execPath,['scripts/commercial_readiness_cr3_staging_e2e_probe.mjs'],probeEnv):{id:'cr10-cr3-e2e',ok:false,status:2,stdout:'',stderr:'accounts blocked'}
const checks=[['static-audit',qa.ok],['preflight',preflight.ok],['migrations',migrations.ok],['accounts',accounts.ok],['cr2-auth-rls',cr2.ok],['cr3-e2e',cr3.ok]]
const blocked=checks.filter(([,ok])=>!ok).map(([id])=>id), ready=blocked.length===0
const summary={schema:'realtalent-cr10-staging-bootstrap/v1',generatedAt:new Date().toISOString(),decision:ready?'STAGING READY':'STAGING BLOCKED',workspaceId:workspaceId||null,pass:checks.length-blocked.length,total:checks.length,blocked,checks:checks.map(([id,ok])=>({id,ok})),evidenceFiles:['cr10-qa.log','cr10-preflight.log','cr10-migrations.log','cr10-accounts.log','cr10-cr2-auth-rls.log','cr10-cr3-e2e.log','CR10_STAGING_CONTEXT.json'],security:'Known secret environment values are redacted and passwords/service_role are not persisted intentionally.'}
fs.writeFileSync(path.join(evidenceDir,'CR10_LATEST.json'),JSON.stringify(summary,null,2)+'\n')
fs.writeFileSync(path.join(evidenceDir,'CR10_LATEST.md'),['# CR10 — Staging Supabase Bootstrap',`Generated: ${summary.generatedAt}`,`Decision: **${summary.decision}**`,`Gates: **${summary.pass}/${summary.total} PASS**`,'',...summary.checks.map(c=>`- ${c.ok?'PASS':'BLOCK'} — ${c.id}`),'',blocked.length?'## Blocked\n'+blocked.map(v=>`- ${v}`).join('\n'):'## Blocked\nNone.'].join('\n')+'\n')
for(const c of summary.checks)console.log(`${c.ok?'PASS':'BLOCK'} ${c.id}`)
console.log(`\nCR10 ${summary.decision}: ${summary.pass}/${summary.total} gates PASS`)
if(workspaceId)console.log(`Workspace ID: ${workspaceId}`)
if(!ready){console.log('Evidence written to ops/evidence/CR10_LATEST.json');process.exit(2)}
console.log('Staging real está pronto. Execute CR9 com este workspace para fechar os hard stops restantes.')
