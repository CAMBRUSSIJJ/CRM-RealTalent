import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const label = `V${pkg.version.replace(/\.0$/, '').replaceAll('.', '-')}`
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const files = []
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const value = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(value)
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.')) files.push(value)
  }
}
walk(path.join(root, 'src'))
const source = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n')
const context = read('src/app/app-context.tsx')
const shell = read('src/components/layout/app-shell.tsx')
const dialog = read('src/components/ui/action-dialog-center.tsx')
const toast = read('src/components/ui/toast-region.tsx')
const styles = read('src/styles/actions-system.css')
const pipeline = read('src/features/pipeline/pipeline-page.tsx')
const leadDrawer = read('src/features/leads/lead-details-drawer.tsx')
const checks = []
const check = (name, passed, detail) => checks.push({ name, passed: Boolean(passed), detail })

check('Versão oficial', Number(pkg.version.split('.').slice(0, 2).join('.')) >= 100.48, pkg.version)
check('Diálogos nativos removidos', !source.includes('window.confirm') && !source.includes('window.prompt'), 'nenhuma confirmação ou prompt do navegador no código de produção')
check('Central de ações montada', shell.includes('<ActionDialogCenter />') && dialog.includes('<Modal'), 'componente global no AppShell')
check('Confirmação contextual', context.includes('confirmAction(options: ConfirmActionOptions)') && source.match(/confirmAction\(/g)?.length >= 15, `${source.match(/confirmAction\(/g)?.length ?? 0} usos`) 
check('Entrada contextual', context.includes('promptAction(options: PromptActionOptions)') && source.match(/promptAction\(/g)?.length >= 5, `${source.match(/promptAction\(/g)?.length ?? 0} usos`)
check('Foco seguro', dialog.includes('autoFocus') && dialog.includes("tone === 'danger'"), 'cancelamento priorizado em ações destrutivas')
check('Toast acionável', toast.includes('toast__action') && context.includes('ToastAction'), 'notificação com callback')
check('Desfazer seguro', pipeline.includes("label: 'Desfazer'") && leadDrawer.includes("label: 'Desfazer'"), 'Pipeline e ficha do lead')
check('Ações em massa padronizadas', styles.includes('.pipeline-bulk-bar') && styles.includes('.prospecting-bulkbar') && styles.includes('.leads-bulk-bar'), 'Leads, Pipeline e Garimpo')
check('Acessibilidade de movimento', styles.includes('prefers-reduced-motion'), 'barra contextual sem animação quando solicitado')
check('CSS incluído no build', read('scripts/build-registry-independent.mjs').includes("'actions-system.css'"), 'bundle oficial inclui a camada V100.48')

const report = { version: pkg.version, generatedAt: new Date().toISOString(), passed: checks.every((item) => item.passed), checks }
fs.writeFileSync(path.join(root, `ACTION-SYSTEM-AUDIT-${label}.json`), JSON.stringify(report, null, 2) + '\n')
console.log(`${checks.filter((item) => item.passed).length}/${checks.length} verificações de ações profissionais aprovadas.`)
if (!report.passed) {
  for (const item of checks.filter((entry) => !entry.passed)) console.error(`FALHA: ${item.name} — ${item.detail}`)
  process.exit(1)
}
