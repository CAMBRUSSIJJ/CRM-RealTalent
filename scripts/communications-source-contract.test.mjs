import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assertCommunicationSourceLineage, COMMUNICATIONS_PAGE_REQUIREMENTS, WHATSAPP_CHAT_REQUIREMENTS, DEPRECATED_CHAT_ACTIONS } from './communications-source-contract.mjs'

const read = (p) => fs.readFileSync(p, 'utf8')
const page = read('src/features/communications/communications-page.tsx')
const chat = read('src/features/communications/whatsapp-chat-panel.tsx')
const start = read('scripts/start.mjs')

test('real communication workspace and Pure Chat pass the launcher source gate', () => {
  assert.equal(assertCommunicationSourceLineage({ page, chat }), true)
  assert.match(start, /assertCommunicationSourceLineage\(\{ page, chat \}\)/)
})

test('source guard protects every real navigation, inbox and chat feature', () => {
  for (const [feature, token] of COMMUNICATIONS_PAGE_REQUIREMENTS) {
    assert.throws(() => assertCommunicationSourceLineage({ page: page.replace(token, '__MISSING__'), chat }), { message: new RegExp(feature, 'i') })
  }
  for (const [feature, token] of WHATSAPP_CHAT_REQUIREMENTS) {
    assert.throws(() => assertCommunicationSourceLineage({ page, chat: chat.replace(token, '__MISSING__') }), { message: new RegExp(feature, 'i') })
  }
})

test('old commercial controls are forbidden in WhatsApp Pure Chat body', () => {
  for (const control of DEPRECATED_CHAT_ACTIONS) {
    assert.throws(() => assertCommunicationSourceLineage({ page, chat: chat + '\n' + control }), /ação comercial antiga voltou ao chat/)
  }
})

test('historical labels and unused CSS names are not required to open a valid CRM', () => {
  assert.equal(page.includes('V101.11.3-H19.7 — WhatsApp Pure Chat'), false)
  assert.equal(page.includes('communication-channel-switch'), false)
  assert.equal(assertCommunicationSourceLineage({ page, chat }), true)
})
