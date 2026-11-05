import fs from 'node:fs'
import path from 'node:path'
import { resolveCommunicationsPackage } from './communications-runtime-deps.mjs'

export const SOCKET_READINESS_MARKER = 'RealTalent WAWebSocketModel readiness guard v1'

// whatsapp-web.js 1.34.7 checks only window.Debug.VERSION (the app shell),
// then immediately reads window.require('WAWebSocketModel').Socket.state.
// Newer WhatsApp builds sometimes load the Socket module later than Debug.
// Mirror upstream main's bounded wait, without overriding WA Web internals.
export function patchWhatsAppWebSocketReadinessSource(input) {
  const source = String(input || '')
  if (source.includes(SOCKET_READINESS_MARKER))
    return { source, changed: false, state: 'already-patched' }

  const anchor = [
    '        await this.pupPage.evaluate(ExposeAuthStore);',
    '',
    '        const needAuthentication = await this.pupPage.evaluate(async () => {',
  ].join('\n')

  if (!source.includes(anchor)) {
    // Abort on unknown vendor source instead of mangling or loading it.
    throw new Error('Client.js da biblioteca não corresponde à whatsapp-web.js 1.34.7; leitura de Socket não modificada.')
  }

  const guard = [
    '        // ' + SOCKET_READINESS_MARKER,
    '        // Wait for the real WhatsApp Socket before using it or injecting AuthStore.',
    '        // Never fabricate state, erase LocalAuth, or bypass account pairing.',
    '        await this.pupPage.waitForFunction(',
    '            () => {',
    '                try {',
    "                    const socket = window.require?.('WAWebSocketModel')?.Socket;",
    "                    return socket?.state && !['OPENING', 'UNLAUNCHED', 'PAIRING'].includes(socket.state);",
    '                } catch { return false; }',
    '            },',
    '            { timeout: Math.min(this.options.authTimeoutMs || 30000, 45000), polling: 250 },',
    '        );',
    '',
    '        await this.pupPage.evaluate(ExposeAuthStore);',
    '',
    '        const needAuthentication = await this.pupPage.evaluate(async () => {',
  ].join('\n')

  const changed = source.replace(anchor, guard)
  if (changed === source) throw new Error('Não foi possível aplicar a proteção de inicialização de Socket.')
  return { source: changed, changed: true, state: 'patched' }
}

export function applyWhatsAppWebSocketReadinessHotfix() {
  const entry = resolveCommunicationsPackage('whatsapp-web.js')
  let cursor = path.dirname(entry)
  let packageDir
  for (let step = 0; step < 9; step++) {
    const filename = path.join(cursor, 'package.json')
    if (fs.existsSync(filename)) {
      try {
        const info = JSON.parse(fs.readFileSync(filename, 'utf8'))
        if (info.name === 'whatsapp-web.js') {
          if (info.version !== '1.34.7')
            throw new Error('Versão de whatsapp-web.js alterada; pare para revisar a compatibilidade do Socket.')
          packageDir = cursor
          break
        }
      } catch (error) {
        if (String(error?.message || '').startsWith('Versão de whatsapp-web.js')) throw error
      }
    }
    cursor = path.dirname(cursor)
  }
  if (!packageDir) throw new Error('Pacote whatsapp-web.js não encontrado para validar o Socket.')
  const file = path.join(packageDir, 'src', 'Client.js')
  const before = fs.readFileSync(file, 'utf8')
  const result = patchWhatsAppWebSocketReadinessSource(before)
  if (result.changed) {
    const temp = file + '.realtalent-socket-ready.tmp'
    try {
      fs.writeFileSync(temp, result.source, 'utf8')
      fs.renameSync(temp, file)
    } finally { try { if (fs.existsSync(temp)) fs.unlinkSync(temp) } catch {} }
  }
  return { ok: true, state: result.state }
}
