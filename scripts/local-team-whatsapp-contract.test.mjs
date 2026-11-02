import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url),'utf8')
const helper = read('src/services/team-whatsapp-directory.ts')
const members = read('src/repositories/local-workspace-member-repository.ts')
const settings = read('src/features/settings/settings-page.tsx')
const editor = read('src/features/settings/local-member-whatsapp-editor.tsx')
const taskModal = read('src/features/tasks/task-modal.tsx')
const taskAction = read('src/features/tasks/local-team-task-whatsapp-action.tsx')

test('phone parsing normalizes Brazilian teammates without login', () => {
  const body = helper.match(/export function normalizeTeamWhatsAppNumber[\s\S]*?\n\}/)?.[0]
  assert.ok(body)
  const normalize = Function(body.replace('export function','function').replace('(raw: string): string | null','(raw)') + ';return normalizeTeamWhatsAppNumber;')()
  assert.equal(normalize('+55 53 99999-9999'), '+5553999999999')
  assert.equal(normalize('53999999999'), '+5553999999999')
  assert.equal(normalize('5553999999999'), '+5553999999999')
  assert.equal(normalize('abc'), null)
  assert.equal(normalize('1234'), null)
  assert.equal(normalize('++5553999999999'), null)
})

test('existing local CRM team members are updated, not recreated', () => {
  assert.match(members, /db\.members\.find\(item => item\.workspaceId === workspaceId && item\.userId === userId\)/)
  assert.match(members, /member\.whatsappPhone = phone/)
  assert.match(members, /member\.whatsappConsentRecordedAt =/)
  assert.match(members, /writeDatabase\(db\)/)
  assert.match(settings, /<LocalMemberWhatsAppEditor member=\{member\}/)
  assert.match(settings, /whatsappPhone: localMemberPhone/)
})

test('consent is revocable and not treated as verified ownership', () => {
  assert.match(editor, /setConsent\(false\)/)
  assert.match(editor, /número não verificado/)
  assert.match(members, /consentDeclared/)
  assert.match(taskAction, /member\?\.whatsappConsentRecordedAt/)
  assert.match(taskAction, /!confirmed \|\| attempted/)
  assert.match(taskAction, /normalizeTaskTestPhone\(current\.senderPhone\) === to/)
})

test('task editor uses assigned local team member and requires a real manual send', () => {
  assert.match(taskModal, /<LocalTeamTaskWhatsAppAction/)
  assert.match(taskAction, /member\.userId === task\.assigneeId/)
  assert.match(taskAction, /task\.workspaceId === workspaceId/)
  assert.match(taskAction, /checkTaskWhatsAppTestConnection\(workspaceId\)/)
  assert.match(taskAction, /safeStorage\.setItem\(key/)
  assert.match(taskAction, /idempotencyKey:/)
  assert.match(taskAction, /Não ativa lembretes automáticos/)
})
