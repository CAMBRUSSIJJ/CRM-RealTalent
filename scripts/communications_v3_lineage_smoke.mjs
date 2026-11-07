import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const root = process.cwd()
const start = fs.readFileSync(path.join(root, 'scripts/start.mjs'), 'utf8')
const page = fs.readFileSync(path.join(root, 'src/features/communications/communications-page.tsx'), 'utf8')
const chat = fs.readFileSync(path.join(root, 'src/features/communications/whatsapp-chat-panel.tsx'), 'utf8')

const begin = start.indexOf('function verifyCommunicationSourceLineage() {')
const end = start.indexOf('\nfunction previewProcessInfo(', begin)
assert.ok(begin !== -1 && end > begin, 'Guarda de Comunicação precisa continuar presente')
const source = start.slice(begin, end)

function runWith(pageSource, chatSource) {
  const context = {
    fs: { readFileSync(filename) {
      return filename.endsWith('whatsapp-chat-panel.tsx') ? chatSource : pageSource
    } },
    abs: (filename) => filename,
    fail: (message) => { throw new Error(message) },
  }
  vm.runInNewContext(source + '\nverifyCommunicationSourceLineage()', context, { timeout: 2000 })
}

runWith(page, chat)
console.log('OK — Communications Central V3 preservada no source atual')

assert.throws(
  () => runWith(page, chat.replace('whatsapp-chat__composer--pure', 'whatsapp-chat__composer--missing')),
  /composer de chat puro/,
)
console.log('OK — guarda detecta remoção do composer WhatsApp puro')

assert.throws(
  () => runWith(page.replace('setCreateWhatsAppGroupOpen(true)', 'createWhatsAppGroupUnavailable()'), chat),
  /ação novo grupo/,
)
console.log('OK — guarda detecta perda da criação de grupo')

assert.throws(
  () => runWith(page, chat + '\nRespostas rápidas'),
  /controles comerciais antigos/,
)
console.log('OK — guarda detecta regressão do WhatsApp puro')

assert.doesNotMatch(source, /V101\.11\.3-H19\.7 — WhatsApp Pure Chat/)
assert.doesNotMatch(source, /communication-channel-switch/)
console.log('OK — verificações obsoletas H19.7 removidas do guard')

console.log('RealTalent Communications V3 lineage guard: 5/5 verificações aprovadas.')
