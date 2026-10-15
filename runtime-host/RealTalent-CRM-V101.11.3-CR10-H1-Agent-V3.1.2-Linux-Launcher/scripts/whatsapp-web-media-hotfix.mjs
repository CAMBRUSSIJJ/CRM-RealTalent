import fs from 'node:fs'
import path from 'node:path'
import { resolveCommunicationsPackage } from './communications-runtime-deps.mjs'
export const REALTALENT_MEDIA_HOTFIX_MARKER = 'RealTalent H19.10-H1 — whatsapp-web.js MediaData __x_id guard'

export function patchWhatsAppWebMediaSource(source) {
  const text = String(source || '')
  if (text.includes(REALTALENT_MEDIA_HOTFIX_MARKER)) return { source: text, changed: false, state: 'already-patched' }
  // If upstream already ships the same semantic guard, do not modify vendor code.
  if (/delete\s+message\.__x_id\s*;/.test(text)) return { source: text, changed: false, state: 'upstream-fixed' }
  const anchor = "        // Bot's won't reply if canonicalUrl is set (linking)"
  const messageAnchor = '        const message = {'
  if (!text.includes(messageAnchor) || !text.includes(anchor)) {
    throw new Error('Estrutura de Utils.js não reconhecida; o hotfix de mídia não foi aplicado para evitar alterar vendor code de forma insegura.')
  }
  const guard = [
    `        // ${REALTALENT_MEDIA_HOTFIX_MARKER}`,
    "        // MediaData currently exposes a private enumerable __x_id. When spread into the outgoing",
    "        // WhatsApp Msg it can replace the MsgKey identity and crash getValidatedSender().",
    "        if (Object.prototype.hasOwnProperty.call(message, '__x_id')) delete message.__x_id;",
    '',
  ].join('\n')
  return { source: text.replace(anchor, `${guard}${anchor}`), changed: true, state: 'patched' }
}

export function applyWhatsAppWebMediaHotfix() {
  let packageFile = ''
  const entry = resolveCommunicationsPackage('whatsapp-web.js')
  let cursor = path.dirname(entry)
  for (let index = 0; index < 8; index += 1) {
    const candidate = path.join(cursor, 'package.json')
    if (fs.existsSync(candidate)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'))
        if (parsed?.name === 'whatsapp-web.js') { packageFile = candidate; break }
      } catch {}
    }
    cursor = path.dirname(cursor)
  }
  if (!packageFile) throw new Error('package.json do whatsapp-web.js não foi localizado.')
  const target = path.join(path.dirname(packageFile), 'src', 'util', 'Injected', 'Utils.js')
  if (!fs.existsSync(target)) throw new Error(`Utils.js do whatsapp-web.js não foi localizado em ${target}.`)
  const before = fs.readFileSync(target, 'utf8')
  const result = patchWhatsAppWebMediaSource(before)
  if (result.changed) {
    const temp = `${target}.realtalent.tmp`
    fs.writeFileSync(temp, result.source, 'utf8')
    fs.renameSync(temp, target)
  }
  return { ok: true, state: result.state, target }
}
