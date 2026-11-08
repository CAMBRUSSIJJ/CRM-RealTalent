import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const load = (path) => readFileSync(join(root, path), 'utf8')
const queue = load('src/features/calls/calls-page.tsx')
const preparation = load('src/features/calls/call-session-preparation-modal.tsx')
const focus = load('src/features/calls/call-workspace-modal.tsx')
const css = load('src/styles/calling-workspace-operational.css')
const history = load('src/features/calls/calling-history-preview.ts')

const checks = [
  ['fila alimentada pelo CRM, não por dados fictícios', queue.includes('buildCallQueue(') && queue.includes('filteredQueue.map(') && queue.includes('requestSession(')],
  ['assistente de quatro etapas preservado', preparation.includes("['queue', 'settings', 'strategy', 'review']") && ['Quem ligar', 'Como ligar', 'Roteiro e objetivo', 'Revisar'].every((v) => preparation.includes(v))],
  ['revisão verifica dispositivo em tempo real', preparation.includes('probeVoiceProviders(voiceSettings)') && preparation.includes('discoverVoiceDevices(providers, voiceSettings, workspaceId)')],
  ['revisão não confunde elegibilidade da fila com conectividade SIP/celular', preparation.includes('A conexão do telefone é verificada separadamente.') && preparation.includes('voiceReadiness')],
  ['Modo Foco mantém ações de ligação reais', focus.includes('onClick={() => void openDialer()}') && focus.includes('startOutboundVoiceCall(')],
  ['Modo Foco destaca contato/objetivo/informações/histórico', ['calling-flow__hero', 'calling-flow__brief', 'calling-h5__essential-card--objective', 'calling-h5__essential-card--important', 'calling-h5__essential-card--history'].every((v) => focus.includes(v))],
  ['layout responsivo do Modo Foco', css.includes('.calling-flow__hero{') && css.includes('@media(max-width:720px)')],
  ['IDs e metadados técnicos ocultos apenas em prévias', focus.includes('callingHistoryPreview(') && history.includes('CRM_[A-Z_]*META') && history.includes('Never mutate persisted')],
  ['Fast Dial não inicia automaticamente offline', focus.includes("if (voiceProviderId !== 'realtalent_connect' || !voiceCanStart)")],
  ['CRM continua sem contatos fictícios de mockup', !focus.includes('Carlos Almeida') && !queue.includes('Carlos Almeida') && !preparation.includes('Carlos Almeida')],
]
for (const [label, ok] of checks) {
  console.log(`${ok ? 'OK' : 'FAIL'} — ${label}`)
  assert.ok(ok, label)
}
console.log(`RealTalent CRM flow reference: ${checks.length}/${checks.length} contratos estáticos aprovados.`)
