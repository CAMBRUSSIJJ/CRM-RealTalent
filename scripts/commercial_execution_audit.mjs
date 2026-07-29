import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const service = read('src/services/commercial-execution.ts')
const callsPage = read('src/features/calls/calls-page.tsx')
const workspace = read('src/features/calls/call-workspace-modal.tsx')
const preparation = read('src/features/calls/call-session-preparation-modal.tsx')
const config = read('src/features/calls/call-session-config.ts')
const css = read('src/styles/index.css')

const checks = [
  ['engine exists', service.includes('recommendCommercialAction')],
  ['wrap recommendation', service.includes('buildWrapRecommendation')],
  ['structured summary', service.includes('buildStructuredCallSummary')],
  ['queue suggestion visible', callsPage.includes('call-next-best-action')],
  ['priority CTA', callsPage.includes('suggestion?.shortLabel')],
  ['auto advance config', config.includes('autoAdvanceSeconds')],
  ['preparation controls', preparation.includes('Avanço automático visível')],
  ['smart wrap config', config.includes('smartWrap')],
  ['countdown banner', workspace.includes('call-auto-advance-banner')],
  ['pause queue', workspace.includes('pauseAutoAdvance')],
  ['advance now', workspace.includes('advanceNow')],
  ['session goal', workspace.includes('completedInSession')],
  ['smart wrap rendered', workspace.includes('call-smart-wrap')],
  ['summary assist', workspace.includes('structureSummary')],
  ['responsive execution css', css.includes('call-execution-brief') && css.includes('call-auto-advance-banner')],
]

const failed = checks.filter(([, pass]) => !pass)
const report = { version: '100.49', generatedAt: new Date().toISOString(), passed: checks.length - failed.length, total: checks.length, checks: checks.map(([name, pass]) => ({ name, pass })) }
fs.writeFileSync(path.join(root, 'COMMERCIAL-EXECUTION-AUDIT-V100-49.json'), JSON.stringify(report, null, 2) + '\n')
if (failed.length) {
  console.error(`Auditoria de execução comercial falhou: ${failed.map(([name]) => name).join(', ')}`)
  process.exit(1)
}
console.log(`Auditoria de execução comercial aprovada: ${checks.length}/${checks.length}.`)
