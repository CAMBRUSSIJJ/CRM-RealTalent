import fs from 'node:fs'
import path from 'node:path'
import { auditRuntimeDependencies } from './runtime-dependency-policy.mjs'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const size = (file) => fs.statSync(path.join(root, file)).size
const packageJson = JSON.parse(read('package.json'))
const checks = []
const check = (label, condition) => checks.push({ label, ok: Boolean(condition) })
const contains = (file, value) => read(file).includes(value)
const sourceFiles = []
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.(ts|tsx)$/.test(entry.name)) sourceFiles.push(full)
  }
}
walk(path.join(root, 'src'))
const allSource = sourceFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n')
const legacyUseAppCalls = [...allSource.matchAll(/useApp\(\)/g)].length - [...read('src/app/app-context.tsx').matchAll(/useApp\(\)/g)].length
const dependencies = Object.keys(packageJson.dependencies ?? {}).sort()
const directCallWorkspaceImports = sourceFiles
  .filter((file) => !file.endsWith('lazy-call-workspace-modal.tsx') && !file.endsWith('call-workspace-modal.tsx'))
  .filter((file) => /from\s+['\"][^'\"]*(?:^|\/)call-workspace-modal['\"]|import\(\s*['\"][^'\"]*(?:^|\/)call-workspace-modal['\"]\s*\)/m.test(fs.readFileSync(file, 'utf8')))

const versionParts = packageJson.version.split('.').map(Number)
const atLeast100601 = versionParts[0] > 100 || (versionParts[0] === 100 && (versionParts[1] > 60 || (versionParts[1] === 60 && versionParts[2] >= 1)))
check('Versão inclui ou sucede V100.60.1', atLeast100601)
check('VERSION acompanha package.json', read('VERSION').trim() === `V${packageJson.version}`)
check('APP_VERSION acompanha package.json', contains('src/lib/app-version.ts', `APP_VERSION = '${packageJson.version}'`))
check('Título acompanha versão atual do RealTalent', contains('index.html', `RealTalent CRM V${packageJson.version}`))
check('Health acompanha versão atual', contains('public/health.json', `"version": "${packageJson.version}"`))

check('AppContext possui contextos fatiados', ['AppNavigationContext', 'AppWorkspaceContext', 'AppUiContext', 'AppActionsContext'].every((value) => contains('src/app/app-context.tsx', value)))
check('Ações usam facade estável', contains('src/app/app-context.tsx', 'actionWrapperCache') && contains('src/app/app-context.tsx', 'new Proxy'))
check('Telas principais migraram do useApp monolítico', legacyUseAppCalls <= 2)
check('Tipos do AppContext foram extraídos', fs.existsSync(path.join(root, 'src/app/app-context-types.ts')))
check('Executor de automações saiu do AppContext', fs.existsSync(path.join(root, 'src/services/automation-event-executor.ts')) && contains('src/app/app-context.tsx', 'createAutomationEventExecutor'))
check('Restauração de backup saiu do AppContext', fs.existsSync(path.join(root, 'src/services/workspace-backup-restore.ts')) && contains('src/app/app-context.tsx', 'restoreWorkspaceBackupToRepository'))
check('AppContext principal ficou abaixo de 70 KB', size('src/app/app-context.tsx') < 70 * 1024)

check('Call Workspace é lazy', contains('src/features/calls/lazy-call-workspace-modal.tsx', 'lazy(() => import('))
check('Nenhuma tela importa Call Workspace pesado diretamente', directCallWorkspaceImports.length === 0)
check('CSS do Call Workspace acompanha o chunk', contains('src/features/calls/call-workspace-modal.tsx', "../../styles/call-workspace-v10055.css"))
check('CSS de Account Intelligence saiu do bootstrap global', !contains('src/main.tsx', "account-360.css"))
check('CSS de Call Workspace saiu do bootstrap global', !contains('src/main.tsx', "call-workspace-v10055.css"))
check('CSS de Leads carrega pela rota', contains('src/features/leads/leads-page.tsx', "lead-experience-v10060.css") && (contains('src/features/leads/leads-page.tsx', "account-360.css") || contains('src/features/leads/leads-page.tsx', "account-360.css")))
check('CSS de Propostas carrega pela rota', contains('src/features/proposals/proposals-page.tsx', "proposal-experience-v10060.css"))

const modularCss = ['core-v100.css','dashboard-v100.css','leads-v100.css','pipeline.css','followups.css','calls-core.css','agenda-v100.css','goals-v100.css','metrics-v100.css','automations.css','prospecting-core.css','settings-v100.css','legacy-overrides-v100.css']
check('Monólito index.css foi substituído por stub', size('src/styles/index.css') < 512)
const modularRuntimeCss = modularCss.map((file) => file === 'pipeline.css' ? 'pipeline.css' : file === 'followups.css' ? 'followups.css' : file === 'calls-core.css' ? 'calls-core.css' : file === 'automations.css' ? 'automations.css' : file === 'prospecting-core.css' ? 'prospecting-core.css' : file)
check('CSS legado foi dividido em módulos e consolidações canônicas', modularCss.every((file) => fs.existsSync(path.join(root, 'src/styles', file))) && modularRuntimeCss.every((file) => contains('src/main.tsx', `./styles/${file}`)))
const coreCssLines = read('src/styles/core-v100.css').split(/\r?\n/).map((line) => line.trim())
check('Duplicatas exatas conhecidas da sidebar foram removidas', coreCssLines.filter((line) => line === '.sidebar--collapsed { width: 82px; }').length === 1 && coreCssLines.filter((line) => line === '.sidebar--collapsed + .app-shell__main { margin-left: 82px; }').length === 1)

check('Local repository foi dividido', fs.existsSync(path.join(root, 'src/repositories/local-repository-core.ts')) && size('src/repositories/local-crm-repository.ts') < 110 * 1024)
check('Supabase mappers foram extraídos', fs.existsSync(path.join(root, 'src/repositories/supabase-repository-mappers.ts')) && size('src/repositories/supabase-crm-repository.ts') < 90 * 1024)
check('API pública local continua reexportada', contains('src/repositories/local-crm-repository.ts', 'configureLocalExperience'))
const runtimeDependencyAudit = auditRuntimeDependencies(dependencies)
check('Dependências de runtime permaneceram enxutas', runtimeDependencyAudit.ok)
check('Refatoração preserva as 35 migrations-base', fs.readdirSync(path.join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql')).length >= 35)
check('Check completo inclui QA V100.60.1', packageJson.scripts?.['check:legacy']?.includes('qa:v100.60.1'))
check('Release notes V100.60.1 existem', fs.existsSync(path.join(root, 'RELEASE_NOTES_V100.60.1.md')))

const failed = checks.filter((item) => !item.ok)
for (const item of checks) console.log(`${item.ok ? 'OK ' : 'FAIL'} ${item.label}`)
console.log(`\nV100.60.1 Performance Audit: ${checks.length - failed.length}/${checks.length} contratos aprovados.`)
if (failed.length) {
  console.error(`Falharam: ${failed.map((item) => item.label).join('; ')}`)
  if (!runtimeDependencyAudit.ok) {
    if (runtimeDependencyAudit.missingBaseline.length) console.error(`Dependências-base ausentes: ${runtimeDependencyAudit.missingBaseline.join(', ')}`)
    if (runtimeDependencyAudit.unexpected.length) console.error(`Dependências de runtime não aprovadas: ${runtimeDependencyAudit.unexpected.join(', ')}`)
  }
  process.exit(1)
}
