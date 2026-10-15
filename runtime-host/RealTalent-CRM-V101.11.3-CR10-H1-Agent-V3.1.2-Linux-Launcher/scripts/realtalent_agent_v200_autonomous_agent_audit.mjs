import fs from 'node:fs'
const drawer=fs.readFileSync(new URL('../src/features/assistant/assistant-drawer.tsx',import.meta.url),'utf8')
const client=fs.readFileSync(new URL('../src/services/realtalent-agent-client.ts',import.meta.url),'utf8')
const team=fs.readFileSync(new URL('../src/services/team-access-control.ts',import.meta.url),'utf8')
const app=fs.readFileSync(new URL('../src/app/app-context.tsx',import.meta.url),'utf8')
const checks=[
 ['V2.0 visível',drawer.includes('V2.0 · Autonomous Agent')],
 ['Avaliação abre painel técnico',drawer.includes('control#evaluation')&&drawer.includes('Avaliação')],
 ['Monitoramento preservado',drawer.includes('control#continuous')&&drawer.includes('Monitoramento')],
 ['Continuous Agent preservado',drawer.includes('Continuous Agent')],
 ['Autonomous Engineering preservada',drawer.includes('Autonomous Engineering')],
 ['Project Brain preservado',drawer.includes('Project Brain')],
 ['Deep Visual QA preservado',drawer.includes('Deep Visual QA')],
 ['Identity & Governance preservada',drawer.includes('Identity & Governance')],
 ['sync de identidade preservado',drawer.includes('syncAgentWorkspaceIdentity')],
 ['workspace real preservado',drawer.includes('currentWorkspace.id')&&drawer.includes('currentWorkspace.role')],
 ['usuário real preservado',drawer.includes('currentUserId')],
 ['profile real preservado',drawer.includes('teamAccess.profile.id')&&drawer.includes('teamAccess.profile.systemKey')],
 ['teamIds preservados',drawer.includes('teamAccess.teamIds')],
 ['rules/scopes preservados',drawer.includes('rule.resource')&&drawer.includes('rule.scope')&&drawer.includes('rule.actions')],
 ['cliente identity sync preservado',client.includes('/identity/sync')&&client.includes('AgentWorkspaceIdentity')],
 ['Administrador preservado',team.includes('system-administrator')&&team.includes("systemKey:'administrator'")],
 ['Gestor preservado',team.includes('system-manager')&&team.includes("systemKey:'manager'")],
 ['Vendedor preservado',team.includes('system-seller')&&team.includes("systemKey:'seller'")],
 ['escopos own/team/all preservados',team.includes("'own'")&&team.includes("'team'")&&team.includes("'all'")],
 ['app acesso efetivo preservado',app.includes('resolveMemberAccess(workspace.id, user?.id ?? null, workspace.role')],
 ['Agent loopback preservado',client.includes('http://127.0.0.1:8791')],
 ['confirmação de escrita continua explícita',drawer.includes('Confirmação obrigatória para escrita')],
]
let ok=0;for(const [name,pass] of checks){console.log(`${pass?'OK  ':'FAIL'} ${name}`);if(pass)ok++}
console.log(`\nCRM Agent V2.0 Autonomous Agent: ${ok}/${checks.length} PASS`);if(ok!==checks.length)process.exit(1)
