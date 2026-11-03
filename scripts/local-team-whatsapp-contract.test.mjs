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

test('consent revocation remains controlled by the team editor', () => {
  assert.match(editor, /setConsent\\(false\\)/)
  assert.match(editor, /não verifica o telefone/)
  assert.match(members, /consentDeclared/)
  assert.match(taskAction, /diagnoseGatewayLocalTaskNotification/)
  assert.match(taskAction, /requestGatewayLocalTaskNotice/)
  assert.match(taskAction, /confirmAction/)
})

test('task editor publishes through the shared queue instead of a second QR sender', () => {
  assert.match(taskModal, /<LocalTeamTaskWhatsAppAction/)
  assert.match(taskAction, /workspaceId,task.id/)
  assert.match(taskAction, /confirmAction/)
  assert.doesNotMatch(taskAction, /sendGatewayCommunication/)
  assert.match(taskAction, /teste manual de conexão continua disponível/i)
})

test('automatic QR requires an explicit independent member switch',()=>{
  assert.match(editor,/setAutomatic\(/)
  assert.match(editor,/syncGatewayLocalTaskAutoMember/)
  assert.match(members,/member\.whatsappAutoEnabledAt =/)
  assert.match(taskAction,/diagnostic\\?\\.canRequest/)
})
