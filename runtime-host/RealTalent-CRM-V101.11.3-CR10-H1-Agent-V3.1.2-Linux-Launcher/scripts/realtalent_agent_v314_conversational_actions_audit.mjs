import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')
const drawer = read('src/features/assistant/assistant-drawer.tsx')
const assistant = read('src/services/realtalent-assistant.ts')
const provider = read('src/services/realtalent-assistant-provider.ts')
const client = read('src/services/realtalent-agent-client.ts')
const fast = read('src/services/realtalent-fast-actions.ts')
const css = read('src/styles/realtalent-assistant-v10067.css')

const checks = []
const test = (name, fn) => { try { fn(); checks.push(true); console.log('PASS', name) } catch (error) { checks.push(false); console.error('FAIL', name, error.message) } }

test('natural-language create task parser exists', () => { assert.ok(fast.includes("return 'create_task'")); assert.ok(fast.includes('consegue')) })
test('natural-language follow-up parser exists', () => assert.ok(fast.includes("return 'create_followups'")))
test('natural-language complete task parser exists', () => assert.ok(fast.includes("return 'complete_task'")))
test('Fast Path runs before remote model', () => assert.ok(provider.indexOf('const localFast =') < provider.indexOf('const remote = await askRemoteRealTalentAgent')))
test('Fast Path bypasses full portfolio analysis', () => assert.ok(assistant.indexOf("if (intent === 'create_task')") < assistant.indexOf('const portfolio = buildDealPortfolio')))
test('multi-turn action state is persisted', () => { assert.ok(drawer.includes('pendingAction')); assert.ok(drawer.includes('effectivePrompt')) })
test('send is guarded against double-submit', () => { assert.ok(drawer.includes('sending) return')); assert.ok(drawer.includes('setSending(true)')) })
test('optimistic user message exists', () => assert.ok(drawer.includes('assistant-user-message')))
test('thinking feedback exists', () => assert.ok(drawer.includes('Entendendo seu pedido...')))
test('facts are deduplicated', () => { assert.ok(drawer.includes('normalizedText.includes(clean)')); assert.ok(drawer.includes('findIndex')) })
test('task creation is confirmation gated', () => { assert.ok(drawer.includes("confirmLabel: 'Confirmar tarefa'")); assert.ok(drawer.includes('saveTask')) })
test('follow-up creation is confirmation gated', () => { assert.ok(drawer.includes("confirmLabel: 'Confirmar follow-up'")); assert.ok(drawer.includes('createActivities')) })
test('task completion is confirmation gated', () => { assert.ok(drawer.includes("confirmLabel: 'Concluir tarefa'")); assert.ok(drawer.includes('updateTaskStatus')) })
test('task candidates respect team visibility', () => { assert.ok(drawer.includes("canTeamAccess('view', 'tasks')")); assert.ok(drawer.includes("canTeamAccessRecord('tasks', task.assigneeId, task.teamId)")) })
test('composer supports Enter and Shift+Enter', () => { assert.ok(drawer.includes("event.key === 'Enter' && !event.shiftKey")); assert.ok(drawer.includes('<textarea')) })
test('technical intent label is not rendered raw', () => assert.ok(!drawer.includes("answer.intent.replaceAll")))
test('remote internal tool codes are sanitized', () => { assert.ok(client.includes('sanitizeUserFacingAgentText')); assert.ok(client.includes('(?:crm|system)')) })
test('technical mode is opt-in', () => assert.ok(drawer.includes("get('agentDebug') === '1'")))
test('CRM remains visible without blur', () => { assert.ok(css.includes('background:transparent!important')); assert.ok(css.includes('backdrop-filter:none!important')) })
test('V3.1.4 modern composer exists', () => assert.ok(css.includes('.assistant-composer--v314')))
test('normal UI advertises safe confirmed actions', () => assert.ok(drawer.includes('ações seguras com confirmação')))

const ok = checks.filter(Boolean).length
console.log(`RESULT ${ok}/${checks.length}`)
if (ok !== checks.length) process.exit(1)
