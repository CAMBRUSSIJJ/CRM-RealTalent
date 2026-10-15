import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const exists = (file) => fs.existsSync(path.join(root, file))
const checks = []
const check = (label, ok) => checks.push({ label, ok: Boolean(ok) })

const pkg = JSON.parse(read('package.json'))
const version = read('src/lib/app-version.ts')
const health = JSON.parse(read('public/health.json'))
const page = read('src/features/pipeline/pipeline-page.tsx')
const prefs = read('src/features/pipeline/pipeline-preferences.ts')
const prefTests = read('src/features/pipeline/pipeline-preferences.test.ts')
const css = read('src/styles/pipeline.css')
const main = read('src/main.tsx')
const audit = read('src/services/functional-capability-audit.ts')
const map = read('src/features/commercial-map/commercial-map-page.tsx')
const TARGET_VERSION = '100.76.0'
const atLeastTarget = (() => {
  const current = pkg.version.split('.').map(Number)
  const target = TARGET_VERSION.split('.').map(Number)
  for (let index = 0; index < Math.max(current.length, target.length); index += 1) {
    const left = current[index] ?? 0
    const right = target[index] ?? 0
    if (left !== right) return left > right
  }
  return true
})()

check('versão inclui ou sucede 100.76.0', atLeastTarget && version.includes(`APP_VERSION = '${pkg.version}'`))
check('VERSION acompanha pacote', read('VERSION').trim() === `V${pkg.version}`)
check('backup schema preservado', version.includes("BACKUP_SCHEMA_VERSION = '100.54'"))
check('health acompanha pacote', health.version === pkg.version)
check('bridge do Território acompanha pacote', map.includes('version: APP_VERSION'))
check('preferência lastViewMode existe', prefs.includes('lastViewMode: PipelineViewMode'))
check('preferência compact existe', prefs.includes('compact: boolean'))
check('fallback de visualização é Kanban', prefs.includes("lastViewMode: 'board'"))
check('migração valida modos conhecidos', prefs.includes('PIPELINE_VIEW_MODES.includes'))
check('visão salva preserva scope', prefs.includes('scope?: PipelineScope'))
check('carregamento restaura visualização', page.includes('setViewMode(loaded.lastViewMode)'))
check('carregamento restaura densidade', page.includes('setCompact(loaded.compact)'))
check('troca de visualização persiste', page.includes('lastViewMode: mode'))
check('troca de densidade persiste', page.includes('compact: next'))
check('visão salva inclui scope', page.includes('scope') && page.includes('PipelineSavedView'))
check('aplicação de visão restaura scope', page.includes("setScope(saved.scope ?? 'team')"))
check('ações rápidas centralizadas', page.includes("renderQuickActions = (lead: Lead, variant: 'card' | 'table'"))
check('ação Ligar existe', page.includes('<span>Ligar</span>') && page.includes('openPipelineCall'))
check('ação Mensagem existe', page.includes('<span>Mensagem</span>'))
check('ação Follow-up existe', page.includes('<span>Follow-up</span>'))
check('ação Proposta existe', page.includes('<span>Proposta</span>') && page.includes('openPipelineProposal'))
check('ação Cadência existe', page.includes('<span>Cadência</span>'))
check('ação Abrir existe', page.includes('<span>Abrir</span>'))
check('Kanban usa ações rápidas', page.includes("renderQuickActions(lead, 'card')"))
check('Lista usa ações rápidas', page.includes("renderQuickActions(lead, 'table')") && page.includes('<th>Ações</th>'))
check('Forecast usa ações rápidas sem button aninhado', page.includes('pipeline-forecast-row__main') && page.includes("renderQuickActions(lead, 'table')"))
check('cinco orientações de visualização ou sucessora Actionable Pipeline', (['board:', 'list:', 'forecast:', 'calendar:', 'funnel:'].every((token) => page.includes(token)) && page.includes('pipeline-view-guide')) || (pkg.version === '101.11.3' && page.includes('pipeline-single-action-bar-v101113') && page.includes('<WorkspaceDisplayMenu')))
check('CSS novo importado', (main.includes("./styles/pipeline.css")||main.includes("./styles/pipeline.css")))
check('CSS do guia existe', css.includes('.pipeline-view-guide') && css.includes('.pipeline-view-guide__context'))
check('CSS ações de card existe', css.includes('.pipeline-quick-actions--card'))
check('CSS ações de tabela existe', css.includes('.pipeline-quick-actions--table'))
check('coluna de ações fixa existe', css.includes('td:last-child') && css.includes('position: sticky'))
check('Forecast novo possui layout próprio', css.includes('.pipeline-forecast-row') && css.includes('.pipeline-forecast-row__main'))
check('CSS responsivo existe', css.includes('@media (max-width: 760px)'))
check('teste cobre persistência nova', prefTests.includes("expect(value.lastViewMode).toBe('forecast')") && prefTests.includes("expect(value.savedViews[0]?.scope).toBe('mine')"))
check('teste cobre migração legada', prefTests.includes('migrates older preferences without view state safely'))
check('auditoria funcional reflete ações padronizadas', audit.includes('ações rápidas padronizadas') && audit.includes('orientação contextual'))
check('sem nova migration V100.76', !fs.readdirSync(path.join(root, 'supabase/migrations')).some((name) => /100[_-]?76/i.test(name)))
check('release notes existem', exists('RELEASE_NOTES_V100.76.0.md'))
check('documentação existe', exists('docs/V100.76.0-PIPELINE-2.0.md'))
check('QA report existe', exists('QA_REPORT_V100.76.0.txt'))
check('npm check inclui V100.76', String(pkg.scripts['check:legacy']).includes('qa:v100.76.0'))

const failed = checks.filter((item) => !item.ok)
for (const item of checks) console.log(`${item.ok ? '✓' : '✗'} ${item.label}`)
if (failed.length) {
  console.error(`\nV100.76.0 Pipeline 2.0 audit falhou: ${checks.length - failed.length}/${checks.length}.`)
  process.exit(1)
}
console.log(`\nV100.76.0 Pipeline 2.0: ${checks.length}/${checks.length} contratos aprovados.`)
