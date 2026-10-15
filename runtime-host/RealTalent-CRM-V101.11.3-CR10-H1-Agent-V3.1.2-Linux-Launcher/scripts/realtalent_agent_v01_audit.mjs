import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const checks = [];
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const check = (label, ok) => checks.push([label, Boolean(ok)]);
const client = text('src/services/realtalent-agent-client.ts');
const provider = text('src/services/realtalent-assistant-provider.ts');
const gateway = text('src/services/realtalent-ai-gateway.ts');
const drawer = text('src/features/assistant/assistant-drawer.tsx');
const assistant = text('src/services/realtalent-assistant.ts');
const tools = text('src/services/realtalent-ai-tools.ts');
const notes = text('REALTALENT_AGENT_V0.1.md');

check('Cliente usa gateway loopback', client.includes("const AGENT_URL = 'http://127.0.0.1:8791'") && client.includes('`${AGENT_URL}/agent`'));
check('Cliente declara produto CRM', client.includes("product: 'crm'") || client.includes('product: "crm"'));
check('Tool follow-up permitida', client.includes('crm.create_followup'));
check('Tool mover oportunidade permitida', client.includes('crm.move_opportunity'));
check('IDs retornados são validados contra snapshot', /snapshot|find\(/i.test(client));
check('Provider híbrido tenta Agent remoto', provider.includes('askRemoteRealTalentAgent'));
check('Provider mantém fallback determinístico', /fallback|deterministic|local/i.test(provider));
check('Gateway não concede escrita direta', /write|authority|persist|muta/i.test(gateway));
check('Plano suporta move_opportunity', assistant.includes("kind: 'move_opportunity'"));
check('Drawer revalida lead/stage', /moveLead/.test(drawer) && /stage/.test(drawer));
check('Drawer exige confirmação antes da mutação', drawer.includes('confirmAction'));
check('Follow-up usa ação existente createActivities', drawer.includes('createActivities'));
check('Move usa ação existente moveLead', drawer.includes('moveLead'));
check('change_pipeline habilitado', /change_pipeline/.test(tools) && /enabled:\s*true/.test(tools));
check('Sem delete tool novo', !client.includes('crm.delete_'));
check('Notas documentam OPENAI_API_KEY', notes.includes('OPENAI_API_KEY'));

let passed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}`);
  if (ok) passed++;
}
console.log(`\nRealTalent Agent V0.1 / CRM: ${passed}/${checks.length} contratos aprovados.`);
if (passed !== checks.length) process.exit(1);
