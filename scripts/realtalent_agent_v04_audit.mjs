import fs from 'node:fs'
const text=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8')
const client=text('src/services/realtalent-agent-client.ts'), provider=text('src/services/realtalent-assistant-provider.ts'), drawer=text('src/features/assistant/assistant-drawer.tsx'), css=text('src/styles/realtalent-assistant-v10067.css'), notes=text('REALTALENT_AGENT_V0.5.md')
const checks=[
 ['provider v0.3',provider.includes('hybrid-realtalent-agent-v0.3')],
 ['6 tools V0.2 preservadas',['crm.create_followup','crm.move_opportunity','crm.create_task','crm.update_lead_profile','crm.create_goal','crm.create_proposal'].every(t=>client.includes(t))],
 ['cliente inicia /qa/run',client.includes("`${AGENT_URL}/qa/run`")],
 ['cliente acompanha /qa/jobs',client.includes('/qa/jobs/')],
 ['QA CRM usa produto crm',client.includes("product: 'crm'")],
 ['QA CRM é observe por padrão',client.includes("mode: 'observe' | 'sandbox' = 'observe'")],
 ['outcomes explícitos',client.includes("'PASS' | 'FAIL' | 'NEEDS_USER' | 'UNKNOWN' | 'UNAVAILABLE'")],
 ['drawer oferece verificar na interface',drawer.includes('Verificar na interface')&&drawer.includes('verifyExecutedPlan')],
 ['QA somente depois da execução',drawer.includes('executedPlanId === answer.plan.id')],
 ['objetivo proíbe alteração durante QA',drawer.includes('Não altere nenhum dado durante a verificação')],
 ['resultado Browser QA visível',drawer.includes('Browser QA: {qaResult.status}')],
 ['estado loading QA',drawer.includes('qaRunning')],
 ['CSS PASS',css.includes('.assistant-qa-result.is-pass')],
 ['CSS FAIL',css.includes('.assistant-qa-result.is-fail')],
 ['doc mesma sessão CDP 9223',notes.includes('mesma sessão')&&notes.includes('9223')],
 ['sem delete tools',!client.includes('crm.delete_')],
]
let ok=0;for(const [l,p] of checks){console.log(`${p?'OK  ':'FAIL'} ${l}`);if(p)ok++}console.log(`\nCRM Agent V0.5: ${ok}/${checks.length} contratos aprovados.`);if(ok!==checks.length)process.exit(1)
