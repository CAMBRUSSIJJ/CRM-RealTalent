import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ui=fs.readFileSync(path.join(root,'src/features/assistant/assistant-drawer.tsx'),'utf8');
const client=fs.readFileSync(path.join(root,'src/services/realtalent-agent-client.ts'),'utf8');
const marker=fs.readFileSync(path.join(root,'REALTALENT_AGENT_V3.1.2.md'),'utf8');
const checks=[
 ['V3.1.2 visível',ui.includes('V3.1.2 · CRM Native Tools Read Only V1')],
 ['native tools descritas',ui.includes('CRM Native Tools V1 consulta dados autorizados')],
 ['team access records',ui.includes("canTeamAccessRecord('contacts'")&&ui.includes("canTeamAccessRecord('pipeline'")&&ui.includes("canTeamAccessRecord('tasks'")],
 ['field access sensível',ui.includes('contactPhone:')&&ui.includes('contactEmail:')&&ui.includes('dealValue:')],
 ['App Context recebe permissions',client.includes('permissions: { resources:')&&client.includes('data:{ asOf:raw.now, permissions:raw.permissions')],
 ['agent request minimizado',client.includes('focusLeadId: context.focusLeadId')&&client.includes('focusProposalId: context.focusProposalId')],
 ['read only documentado',marker.includes('mode = read-only')&&marker.includes('zeroMutation = true')],
 ['dupla validação',marker.includes('gateway valida novamente')],
 ['Meu Dia compound scope',marker.includes('Contatos + Pipeline + Tarefas')],
 ['writes continuam confirmadas',marker.includes('Execution Intelligence V2.8')&&marker.includes('maxSilentWrites = 0')],
];let ok=0;for(const[n,p]of checks){console.log(`${p?'OK  ':'FAIL'} ${n}`);if(p)ok++}console.log(`\nCRM Native Tools Read Only V1: ${ok}/${checks.length} PASS`);if(ok!==checks.length)process.exit(1)
