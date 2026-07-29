import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const exists = (file) => fs.existsSync(path.join(root, file))
const checks = []
const check = (name, passed, detail) => checks.push({ name, passed: Boolean(passed), detail })

const pkg = JSON.parse(read('package.json'))
const leads = read('src/features/leads/leads-page.tsx')
const page = read('src/features/calls/calls-page.tsx')
const prep = read('src/features/calls/call-session-preparation-modal.tsx')
const workspace = read('src/features/calls/call-workspace-modal.tsx')
const preferences = read('src/services/call-display-preferences.ts')
const connect = read('src/services/realtalent-connect.ts')
const migration = read('supabase/migrations/202607280005_v100_46_5_connect_call_sessions.sql')
const styles = `${read('src/styles/index.css')}\n${read('src/styles/motion-system.css')}\n${read('src/styles/actions-system.css')}`
const releaseLabel = `V${pkg.version.replace(/\.0$/, '').replaceAll('.', '-')}`
const identifierReport = JSON.parse(read(`RUNTIME-IDENTIFIER-AUDIT-${releaseLabel}.json`))

check('Versão oficial', Number(pkg.version.split('.').slice(0, 2).join('.')) >= 100.48, pkg.version)
check('Erro duplicateIds eliminado', !leads.includes('duplicateIds'), 'nenhuma referência residual na tela Leads')
check('Preparação da sessão', prep.includes('Preparar sessão de ligações') && prep.includes('RealTalent Connect') && prep.includes('Escolher o que quero ver'), 'fila, dispositivo e visualização')
check('Visualização persistida', preferences.includes('saveCallDisplayPreferences') && preferences.includes('showQueueSidebar') && preferences.includes('showRecording'), 'preferências por workspace')
check('Fila lateral real', workspace.includes('call-session-queue-list') && workspace.includes('call-macro-progress'), 'fila e macrofases')
check('Roteiro central', workspace.includes('call-guided-script--v465') && workspace.includes('showQuickResponses'), 'script e respostas rápidas')
check('Wrap-up progressivo', workspace.includes('call-wrapup-groups') && workspace.includes('Salvar e próximo'), 'resultado e avanço')
check('Integração de frontend', connect.includes('enqueueRealTalentConnectCall') && connect.includes('realtalent-connect://call') && connect.includes('getRealTalentConnectCallCommand'), 'envio, protocolo e acompanhamento')
check('Integração de banco', migration.includes('realtalent_connect_call_commands') && migration.includes('enqueue_realtalent_connect_call') && migration.includes('claim_realtalent_connect_call_commands') && migration.includes('update_realtalent_connect_call_command'), 'fila e RPCs')
check('Proteção contra chamada simultânea', migration.includes('realtalent_connect_call_commands_active_unique') && migration.includes('já possui uma chamada ativa'), 'uma chamada ativa por dispositivo')
check('Fallback telefônico', workspace.includes("window.location.href = `tel:"), 'continuidade sem Connect')
check('Personalização na página', page.includes('CallDisplayPreferencesModal') && page.includes('call-queue--${display.queueDensity}'), 'fila e sessão configuráveis')
check('CSS profissional e responsivo', styles.includes('.call-session-topbar') && styles.includes('.call-focus-grid--v465') && styles.includes('.call-preparation-grid') && styles.includes('@media(max-width:560px)') && styles.includes('rt-live-pulse'), 'desktop, tablet, mobile e feedback preservado da V100.48')
check('Auditoria de identificadores', identifierReport.passed && identifierReport.failures.length === 0, `${identifierReport.files} arquivos sem referência não declarada`)
check('Teste dedicado', exists('src/services/call-session-v100465.test.ts'), 'preferências, protocolo e fila local')
check('SDK do RealTalent Connect', exists('extension-sdk/realtalent-connect-call-client.ts') && exists('extension-sdk/realtalent-connect-call-client.js'), 'cliente para claim e atualização de estados')
check('Documentação operacional', exists('docs/CENTRAL-DE-LIGACOES-V100-46-5.md') && exists('docs/REALTALENT-CONNECT-V100-46-5.md'), 'uso e contrato')

const report = { version: pkg.version, generatedAt: new Date().toISOString(), passed: checks.every((item) => item.passed), checks }
fs.writeFileSync(path.join(root, `CALLS-CENTER-AUDIT-${releaseLabel}.json`), JSON.stringify(report, null, 2) + '\n')
console.log(`${checks.filter((item) => item.passed).length}/${checks.length} verificações da Central de Ligações aprovadas.`)
if (!report.passed) {
  for (const item of checks.filter((entry) => !entry.passed)) console.error(`FALHA: ${item.name} — ${item.detail}`)
  process.exit(1)
}
