import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const html = fs.readFileSync(path.join(root, 'public/sip-phone.html'), 'utf8')
const settings = fs.readFileSync(path.join(root, 'src/features/calls/voice-dialer-settings-modal.tsx'), 'utf8')
const voice = fs.readFileSync(path.join(root, 'src/services/voice-dialer.ts'), 'utf8')
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]

assert.ok(script, 'O piloto precisa de um módulo JavaScript inline.')
new Function(script) // verifica sintaxe; não executa e não cria chamadas

const checks = [
  ['SIP.js 0.21.2 é carregado sob demanda', /await import\('https:\/\/cdn\.jsdelivr\.net\/npm\/sip\.js@0\.21\.2\/\+esm'\)/.test(script)],
  ['ramal SIP só conecta após clique', html.includes('id="connect"') && script.includes("el('connect').addEventListener('click'")],
  ['nenhuma senha persistida no browser storage', !/localStorage|sessionStorage|indexedDB|document\.cookie/.test(script)],
  ['microfone requer origem segura', script.includes('window.isSecureContext')],
  ['WSS por padrão, WS somente localhost', script.includes("parsed.protocol !== 'wss:'") && script.includes("parsed.protocol === 'ws:'")],
  ['credenciais não vão em URL de servidor', script.includes('parsed.username || parsed.password')],
  ['SIP suporta autenticação explícita', script.includes('authorizationUsername, authorizationPassword')],
  ['recebimento de chamada não é atendido automaticamente', script.includes("onCallReceived: () =>") && script.includes("el('answer').addEventListener")],
  ['chamada precisa de gesto do usuário', script.includes("el('call').addEventListener('click'")],
  ['controles base incluem hangup, mute, hold e DTMF', ['phone?.hangup()', 'phone.mute()', 'phone.hold()', 'phone.sendDTMF(digit)'].every((needle) => script.includes(needle))],
  ['credenciais limpadas do campo ao registrar e desconectar', script.split("el('password').value = '';").length >= 3],
  ['integração abre o piloto a partir do CRM local', settings.includes('Abrir piloto VoIP') && settings.includes("window.open('/sip-phone.html'") && settings.includes('localSipPilotAvailable')],
  ['SIP e WebRTC não viram padrão prematuramente', settings.includes("disabled={id === 'sip' || id === 'browser_webrtc'}")],
  ['provider RealTalent Connect permanece ativo', voice.includes("providerId === 'realtalent_connect'") && voice.includes("connectTransportBase(input.settings.connectBaseUrl)")],
  ['default mantém discador existente', voice.includes("defaultProviderId: 'external_tel'")],
]

for (const [label, ok] of checks) {
  console.log(`${ok ? 'OK' : 'FAIL'} — ${label}`)
  assert.ok(ok, label)
}
console.log(`RealTalent Connect SIP pilot: ${checks.length}/${checks.length} auditorias estáticas aprovadas.`)
