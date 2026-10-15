import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const bundle = path.resolve(here, '..')
const crmDir = fs.readdirSync(bundle).find((name) => name.startsWith('RealTalent-CRM-') && fs.existsSync(path.join(bundle, name, 'src/features/assistant/assistant-drawer.tsx')))
const checks = []
const test = (name, fn) => {
  try { fn(); checks.push(1); console.log('PASS', name) }
  catch (error) { checks.push(0); console.error('FAIL', name, error instanceof Error ? error.message : String(error)) }
}

const crm = path.join(bundle, crmDir ?? '')
const drawer = crmDir ? fs.readFileSync(path.join(crm, 'src/features/assistant/assistant-drawer.tsx'), 'utf8') : ''
const assistant = crmDir ? fs.readFileSync(path.join(crm, 'src/services/realtalent-assistant.ts'), 'utf8') : ''
const provider = crmDir ? fs.readFileSync(path.join(crm, 'src/services/realtalent-assistant-provider.ts'), 'utf8') : ''
const fast = crmDir ? fs.readFileSync(path.join(crm, 'src/services/realtalent-fast-actions.ts'), 'utf8') : ''
const client = crmDir ? fs.readFileSync(path.join(crm, 'src/services/realtalent-agent-client.ts'), 'utf8') : ''
const css = crmDir ? fs.readFileSync(path.join(crm, 'src/styles/realtalent-assistant-v10067.css'), 'utf8') : ''
const launcher = fs.readFileSync(path.join(bundle, 'abrir-crm-com-agent.sh'), 'utf8')

test('CRM source package found', () => assert.ok(crmDir))
test('embedded Agent preserved', () => { assert.ok(drawer.includes('data-embedded-agent="crm"')); assert.ok(!drawer.includes("window.open('http://127.0.0.1:8791/chat")) })
test('technical labels hidden from normal UI', () => { assert.ok(drawer.includes('technicalMode ? <details')); assert.ok(!drawer.includes('answer.intent.replaceAll')) })
test('user sees natural language composer', () => { assert.ok(drawer.includes('Pergunte ou peça uma ação...')); assert.ok(drawer.includes("event.key === 'Enter' && !event.shiftKey")) })
test('optimistic send feedback exists', () => { assert.ok(drawer.includes('assistant-user-message')); assert.ok(drawer.includes('Entendendo seu pedido...')); assert.ok(drawer.includes('setSending(true)')) })
test('duplicate facts are filtered', () => { assert.ok(drawer.includes('normalizedText.includes(clean)')); assert.ok(drawer.includes('findIndex')) })
test('Fast Path runs before remote model', () => { const fastAt = provider.indexOf('const localFast ='); const remoteAt = provider.indexOf('const remote = await askRemoteRealTalentAgent'); assert.ok(fastAt >= 0 && remoteAt >= 0 && fastAt < remoteAt); assert.ok(provider.includes('local-fast-actions-v3.1.4')) })
test('Fast Path bypasses full portfolio analysis', () => { const actionAt = assistant.indexOf("if (intent === 'create_task')"); const portfolioAt = assistant.indexOf('const portfolio = buildDealPortfolio'); assert.ok(actionAt >= 0 && portfolioAt > actionAt); assert.ok(assistant.includes('Simple commands should')) })
test('natural create task intent', () => { assert.ok(fast.includes("return 'create_task'")); assert.ok(fast.includes('crie uma tarefa')); assert.ok(assistant.includes("intent === 'create_task'")) })
test('natural follow-up intent', () => { assert.ok(fast.includes("return 'create_followups'")); assert.ok(assistant.includes("intent === 'create_followups'")) })
test('natural complete task intent', () => { assert.ok(fast.includes("return 'complete_task'")); assert.ok(assistant.includes("kind: 'complete_task'")); assert.ok(drawer.includes('updateTaskStatus')) })
test('writes remain confirmation-gated', () => { assert.ok(drawer.includes("confirmLabel: 'Confirmar tarefa'")); assert.ok(drawer.includes("confirmLabel: 'Concluir tarefa'")); assert.ok(drawer.includes("confirmLabel: 'Confirmar follow-up'")); assert.ok(drawer.includes('confirmAction')) })
test('remote technical text sanitized', () => { assert.ok(client.includes('sanitizeUserFacingAgentText')); assert.ok(client.includes("replace(/`?(?:crm|system)")); assert.ok(client.includes("replace(/\\bintent:")) })
test('normal UI states safe actions', () => { assert.ok(drawer.includes('leitura + ações seguras com confirmação')); assert.ok(drawer.includes('Ações com confirmação')) })
test('no modal blur in Agent layer', () => { assert.ok(css.includes('.assistant-layer{background:transparent!important;backdrop-filter:none!important}')) })
test('modern composer and message styles exist', () => { assert.ok(css.includes('.assistant-composer--v314')); assert.ok(css.includes('.assistant-user-message')); assert.ok(css.includes('.assistant-thinking')) })
test('normal CRM launch does not require Chromium', () => { assert.ok(launcher.includes('Chromium não é necessário para uso normal')); assert.ok(launcher.includes('xdg-open')) })

const ok = checks.reduce((a, b) => a + b, 0)
console.log(`RESULT ${ok}/${checks.length}`)
if (ok !== checks.length) process.exit(1)
