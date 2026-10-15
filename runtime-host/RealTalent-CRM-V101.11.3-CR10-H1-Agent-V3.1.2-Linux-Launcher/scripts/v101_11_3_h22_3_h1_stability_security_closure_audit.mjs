import fs from 'node:fs'
const read=(f)=>fs.readFileSync(f,'utf8')
const has=(t,v)=>t.includes(v)
const checks=[]
const check=(name,ok)=>checks.push([name,Boolean(ok)])

const proposals=read('src/features/proposals/proposals-page.tsx')
const productStudio=proposals.split('function ProductStudioModal')[1]?.split('function ProposalModal')[0] ?? ''
const governance=read('src/services/team-governance.ts')
const experience=read('src/features/experience/experience-registry.ts')
const migration=read('supabase/migrations/202610130001_v101_11_3_h22_3_h1_stability_security_closure.sql')
const manifest=JSON.parse(read('release-manifest.json'))
const pkg=JSON.parse(read('package.json'))
const runtime=JSON.parse(read('public/runtime-version.json'))
const health=JSON.parse(read('public/health.json'))
const index=read('index.html')
const launcher=read('scripts/start.mjs')

check('Product Studio usa canWrite no save',has(productStudio,'if (!canWrite) return'))
check('Product Studio não referencia canProposalEdit internamente',!has(productStudio,'canProposalEdit'))
check('UI de margem usa grossMarginAmount',has(proposals,'policy.grossMarginAmount >= 0 ? formatCurrency(policy.grossMarginAmount)'))
check('UI não usa propriedade inexistente marginValue',!has(proposals,'policy.marginValue'))
check('Governance importa TeamApprovalStatus',has(governance,'TeamApprovalStatus'))
check('approvalStatusForEntity aceita cancelled por TeamApprovalStatus',has(governance,"Promise<'none'|TeamApprovalStatus>"))
check('Experience Registry inclui tasks',has(experience,'  tasks: ['))
check('Experience Registry inclui teams',has(experience,'  teams: ['))
check('Tasks possui seletor de conteúdo real',has(experience,"selector: '.work-task-list, .work-task-board'"))
check('Teams possui seletor de acesso real',has(experience,"selector: '.team-access-h22'"))

check('Migration H22.3-H1 existe',migration.length>500)
check('Approval policy exige membership',has(migration,"not public.is_organization_member(p_organization_id)"))
check('Policy reasons exige membership',has(migration,'create or replace function public.rt_proposal_policy_reasons')&&has(migration,"Permissão negada para visualizar propostas."))
check('Policy reasons valida existência da proposta',has(migration,"raise exception 'Proposta não encontrada.'"))
check('Proposal approval helper exige membership',has(migration,'create or replace function public.rt_proposal_has_approval')&&has(migration,"Sem acesso ao workspace."))
check('Policy reasons é revogada de authenticated',has(migration,'revoke all on function public.rt_proposal_policy_reasons(uuid,uuid) from public,anon,authenticated'))
check('Proposal has approval é revogada de authenticated',has(migration,'revoke all on function public.rt_proposal_has_approval(uuid,uuid) from public,anon,authenticated'))
check('Approval policy revoga PUBLIC/anon',has(migration,'revoke all on function public.rt_access_approval_policy(uuid) from public,anon'))
check('Approval policy mantém authenticated controlado',has(migration,'grant execute on function public.rt_access_approval_policy(uuid) to authenticated'))

check('Manifest espera 58 migrations',manifest.migrations?.expectedCount===58)
check('Manifest registra H22.3-H1',manifest.teamAccessH22_3_H1?.buildLabel==='V101.11.3-H22.3-H1')
check('Manifest inclui gate H22.3-H1',manifest.qa?.requiredGates?.includes('qa:v101.11.3:h22.3:h1'))
check('Package registra gate H22.3-H1',has(pkg.scripts?.['qa:v101.11.3:h22.3:h1']??'','v101_11_3_h22_3_h1_stability_security_closure_audit.mjs'))
check('qa:architecture inclui H22.3-H1',has(pkg.scripts?.['qa:architecture']??'','qa:v101.11.3:h22.3:h1'))
check('release:verify inclui H22.3-H1',has(pkg.scripts?.['release:verify']??'','qa:v101.11.3:h22.3:h1'))
check('Index identifica H22.3-H1',has(index,'V101.11.3-H22.3-H1'))
check('Launcher expõe marker H22.3-H1',has(launcher,'rt_closure=101.11.3-h22-3-h1-stability-security-closure'))
check('Runtime anuncia closure',runtime.stabilitySecurityClosure==='v101.11.3-h22.3-h1')
check('Health anuncia closure',health.stabilitySecurityClosure==='v101.11.3-h22.3-h1')

let failed=0
for(const [name,ok] of checks){ console.log(`${ok?'OK  ':'FAIL'} ${name}`); if(!ok) failed++ }
console.log(`\nH22.3-H1 Stability & Security Closure: ${checks.length-failed}/${checks.length} PASS`)
if(failed) process.exit(1)
