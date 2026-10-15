import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const bundle = path.resolve(here, '..')
const crmDir = fs.readdirSync(bundle).find((name) => name.startsWith('RealTalent-CRM-') && fs.existsSync(path.join(bundle, name, 'src/features/assistant/assistant-drawer.tsx')))
const crm = path.join(bundle, crmDir ?? '')
const read = (rel) => crmDir ? fs.readFileSync(path.join(crm, rel), 'utf8') : ''
const fast = read('src/services/realtalent-fast-actions.ts')
const assistant = read('src/services/realtalent-assistant.ts')
const drawer = read('src/features/assistant/assistant-drawer.tsx')
const client = read('src/services/realtalent-agent-client.ts')
const app = read('src/app/app-context.tsx')
const checks=[]
const test=(name,fn)=>{try{fn();checks.push(1);console.log('PASS',name)}catch(e){checks.push(0);console.error('FAIL',name,e instanceof Error?e.message:String(e))}}

test('CRM source package found',()=>assert.ok(crmDir))
test('H2 embedded version visible',()=>assert.ok(drawer.includes('V3.1.4-H2')))
test('task word is not mandatory for natural action',()=>{assert.ok(fast.includes('Natural action bridge'));assert.ok(fast.includes('commandVerb && actionableVerb && hasDateSignal'))})
test('exact seller phrase can route to task creation',()=>{for(const token of ['crie|cria|criar','ligar|telefone|telefonar','amanha'])assert.ok(fast.includes(token.split('|')[0])||fast.includes(token))})
test('contact name extraction exists',()=>assert.ok(fast.includes('extractContactQuery')))
test('assignee resolution supports current user and named seller',()=>{assert.ok(fast.includes('assignToCurrentUser'));assert.ok(fast.includes('extractAssignee'));assert.ok(assistant.includes('resolveAssigneeForTask'))})
test('CRM contact resolver is authoritative',()=>{assert.ok(assistant.includes('resolveContactForTask'));assert.ok(assistant.includes('Contato não encontrado'))})
test('legacy lead fallback preserved',()=>assert.ok(assistant.includes('resolveLeadForTask')))
test('preview contains assignee',()=>assert.ok(assistant.includes('Responsável:')))
test('explicit time opts task into Agenda sync',()=>{assert.ok(fast.includes('explicitTime'));assert.ok(assistant.includes('syncToAgenda: parsed.explicitTime'))})
test('task is persisted through CRM work management',()=>{assert.ok(drawer.includes('await saveTask('));assert.ok(drawer.includes("tags: ['realtalent-agent']"))})
test('scheduled task is mirrored into CRM Agenda',()=>{assert.ok(drawer.includes('await createCalendarEvent({'));assert.ok(drawer.includes("type: plan.taskType === 'call' ? 'call' : 'task'"));assert.ok(drawer.includes('Tarefa criada e adicionada à Agenda.'))})
test('Agenda sync failure rolls task back',()=>assert.ok(drawer.includes('await deleteTask(')))
test('task/calendar writes remain confirmation gated',()=>{const c=drawer.indexOf("confirmLabel: 'Confirmar tarefa'");const s=drawer.indexOf('const savedTask = await saveTask');assert.ok(c>=0&&s>c)})
test('task/call calendar projection does not fire meeting automation',()=>{assert.ok(app.includes("if (!agendaType || agendaType === 'meeting')"));assert.ok(app.includes('readAgendaMetadata'))})
test('technical tool identifiers are removed, not renamed to placeholder',()=>{assert.ok(client.includes("replace(/`?(?:crm|system)"));assert.ok(!client.includes("'a ação correspondente')"))})

const ok=checks.reduce((a,b)=>a+b,0)
console.log(`RESULT ${ok}/${checks.length}`)
if(ok!==checks.length) process.exit(1)
