import fs from 'node:fs'
import path from 'node:path'
import { resolveCommunicationsPackage } from './communications-runtime-deps.mjs'

export const REALTALENT_SEND_ID_HOTFIX_MARKER = 'RealTalent whatsapp-web.js MsgKey $1 / _serialized return compatibility'

/**
 * WWeb 2.3000.x can expose MsgKey.$1 without MsgKey._serialized.
 * whatsapp-web.js 1.34.7 asks Msg.get(undefined) and Client.sendMessage()
 * resolves without a Message even when the WhatsApp service accepted it.
 *
 * Patch only the exact vendor return statement. Do not retry the send,
 * fabricate a message ID, or turn an absent result into success.
 */
export function patchWhatsAppWebSendResultSource(source) {
  const input = String(source || '')
  if (input.includes(REALTALENT_SEND_ID_HOTFIX_MARKER)) {
    return { source: input, changed: false, state: 'already-patched' }
  }
  const oldReturn = '.Msg.get(newMsgKey._serialized);'
  if (!input.includes(oldReturn)) {
    // New upstream releases may already use $1 with an equivalent fallback.
    const isFixed = /\.Msg\.get\(newMsgKey\._serialized\s*\|\|\s*newMsgKey\.\$1/.test(input)
      || /\.Msg\.get\(newMsgKey\.\$1\s*\|\|\s*newMsgKey\._serialized/.test(input)
    if (isFixed) return { source: input, changed: false, state: 'upstream-fixed' }
    throw new Error('Não foi localizada a expressão Msg.get(newMsgKey._serialized) do whatsapp-web.js 1.34.7. Biblioteca inesperada: hotfix não aplicado.')
  }
  const comment = [
    `// ${REALTALENT_SEND_ID_HOTFIX_MARKER}`,
    '// WhatsApp Web stores some message keys as $1, without _serialized.',
    '// Return the actual confirmed Msg model: no synthetic IDs or second send.',
  ].join('\n            ')
  const updated = input.replace(oldReturn, `${comment}\n            .Msg.get(newMsgKey._serialized || newMsgKey.$1);`)
  if (updated === input) throw new Error('Não foi possível alterar o retorno do MsgKey.')
  return { source: updated, changed: true, state: 'patched' }
}

export function applyWhatsAppWebSendResultHotfix() {
  const entry = resolveCommunicationsPackage('whatsapp-web.js')
  let cursor = path.dirname(entry)
  let packageDir = ''
  for (let i = 0; i < 8; i += 1) {
    const candidate = path.join(cursor, 'package.json')
    if (fs.existsSync(candidate)) {
      try {
        if (JSON.parse(fs.readFileSync(candidate, 'utf8'))?.name === 'whatsapp-web.js') {
          packageDir = cursor
          break
        }
      } catch { /* Continue searching the owning package. */ }
    }
    cursor = path.dirname(cursor)
  }
  if (!packageDir) throw new Error('Não foi localizado o pacote whatsapp-web.js para validar MsgKey.')
  const target = path.join(packageDir, 'src', 'util', 'Injected', 'Utils.js')
  if (!fs.existsSync(target)) throw new Error('Utils.js ausente no pacote whatsapp-web.js.')
  const before = fs.readFileSync(target, 'utf8')
  const result = patchWhatsAppWebSendResultSource(before)
  if (result.changed) {
    const temp = `${target}.realtalent-send-result.tmp`
    fs.writeFileSync(temp, result.source, 'utf8')
    fs.renameSync(temp, target)
  }
  return { ok: true, state: result.state, target }
}
