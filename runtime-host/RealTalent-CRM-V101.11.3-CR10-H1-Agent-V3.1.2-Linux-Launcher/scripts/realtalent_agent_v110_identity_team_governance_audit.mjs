import fs from 'node:fs'
const drawer=fs.readFileSync(new URL('../src/features/assistant/assistant-drawer.tsx',import.meta.url),'utf8')
const client=fs.readFileSync(new URL('../src/services/realtalent-agent-client.ts',import.meta.url),'utf8')
const team=fs.readFileSync(new URL('../src/services/team-access-control.ts',import.meta.url),'utf8')
const app=fs.readFileSync(new URL('../src/app/app-context.tsx',import.meta.url),'utf8')
const checks=[
 ['V1.10 visível no drawer',drawer.includes('V1.10 Identity & Team Governance')],
 ['sync de identidade no drawer',drawer.includes('syncAgentWorkspaceIdentity')],
 ['sync ocorre apenas com workspace+user+access',drawer.includes('!currentWorkspace || !currentUserId || !teamAccess')],
 ['heartbeat de identidade 5min',drawer.includes('5 * 60 * 1000')],
 ['workspace real enviado',drawer.includes('currentWorkspace.id')&&drawer.includes('currentWorkspace.role')],
 ['usuário real enviado',drawer.includes('currentUserId')],
 ['profile real enviado',drawer.includes('teamAccess.profile.id')&&drawer.includes('teamAccess.profile.systemKey')],
 ['teamIds reais enviados',drawer.includes('teamAccess.teamIds')],
 ['rules/scopes reais enviados',drawer.includes('rule.resource')&&drawer.includes('rule.scope')&&drawer.includes('rule.actions')],
 ['cliente endpoint identity/sync',client.includes('/identity/sync')&&client.includes('AgentWorkspaceIdentity')],
 ['cliente consulta identity state',client.includes('/identity')&&client.includes('getAgentWorkspaceIdentity')],
 ['perfil Administrador preservado',team.includes("system-administrator")&&team.includes("systemKey:'administrator'")],
 ['perfil Gestor preservado',team.includes("system-manager")&&team.includes("systemKey:'manager'")],
 ['perfil Vendedor preservado',team.includes("system-seller")&&team.includes("systemKey:'seller'")],
 ['escopos own/team/all preservados',team.includes("'own'")&&team.includes("'team'")&&team.includes("'all'")],
 ['app resolve acesso efetivo',app.includes('resolveMemberAccess(workspace.id, user?.id ?? null, workspace.role')],
 ['team access exposto ao drawer',app.includes('currentUserId: user?.id ?? null, teamAccess')],
 ['Agent local loopback preservado',client.includes('http://127.0.0.1:8791')],
]
let ok=0;for(const [name,pass] of checks){console.log(`${pass?'OK  ':'FAIL'} ${name}`);if(pass)ok++}
console.log(`\nCRM Agent V1.10 Identity & Team Governance: ${ok}/${checks.length} PASS`);if(ok!==checks.length)process.exit(1)
