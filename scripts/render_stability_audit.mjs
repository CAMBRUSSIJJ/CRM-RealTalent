import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const releaseLabel = `V${pkg.version.replace(/\.0$/, '').replaceAll('.', '-')}`
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const exists = (file) => fs.existsSync(path.join(root, file))
const checks = []
const check = (name, passed, detail) => checks.push({ name, passed: Boolean(passed), detail })

const app = read('src/app/app.tsx')
const navigation = read('src/components/layout/navigation.ts')
const routes = read('src/domain/types.ts')
const context = read('src/app/app-context.tsx')
const sourceText = fs.readdirSync(path.join(root, 'src'), { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name)).map((entry) => read(path.relative(root, path.join(entry.parentPath, entry.name)))).join('\n')
const safety = read('src/services/snapshot-safety.ts')
const leads = read('src/features/leads/leads-page.tsx')
const calls = read('src/features/calls/calls-page.tsx')
const callModal = read('src/features/calls/call-workspace-modal.tsx')
const styles = `${read('src/styles/index.css')}\n${read('src/styles/motion-system.css')}\n${read('src/styles/actions-system.css')}`
const leadDrawer = read('src/features/leads/lead-details-drawer.tsx')

check('Aba Comunicações removida da navegação', !navigation.includes("route: 'communications'") && !navigation.includes('MessageSquareMore'), 'menu e título removidos')
check('Rota Comunicações removida', !app.includes('CommunicationsPage') && !routes.includes("| 'communications'"), 'lazy import e AppRoute removidos')
check('Módulo de tela excluído', !exists('src/features/communications') && !exists('src/services/communications.ts'), 'arquivos operacionais excluídos')
check('Agenda isolada da aba removida', exists('src/services/calendar-integration.ts') && context.includes("from '../services/calendar-integration'"), 'sincronização de calendário preservada')
check('Snapshot normalizado antes do render', context.includes('normalizeSnapshotForRender(nextSnapshot)') && safety.includes('normalizeLeadForRender'), 'carga inicial e refresh protegidos')
check('Campos legados protegidos', safety.includes('asStringArray') && safety.includes("name: asString(raw.name, 'Lead sem nome')") && safety.includes('validNullableDate'), 'strings, arrays, números e datas tratados')
check('Teste de lead incompleto', exists('src/services/snapshot-safety.test.ts'), 'cenário de dados nulos incluído')
check('Leads continuam com ações principais', leads.includes('LeadDetailsDrawer') && leads.includes('CallWorkspaceModal') && leads.includes('bulkUpdateLeads'), 'ficha, ligação e ações em massa')
check('Timeline sem dependência de Comunicações', !leadDrawer.includes('loadCommunicationEvents') && !leadDrawer.includes('buildUnifiedTimeline'), 'histórico usa Ligações, Agenda e Atividades')
check('Página de Ligações compacta', calls.includes('calls-summary-strip') && calls.includes('moreFiltersOpen') && calls.includes('calls-operations-layout--single'), 'resumo, filtros progressivos e largura total')
check('Fluxo de ligação progressivo', callModal.includes("session === 'finished' ? <>") && callModal.includes('call-guidance-tabs__nav'), 'encerramento sob demanda e painel em abas')
check('Gravação recolhível', callModal.includes('call-recording-tools') && callModal.includes('<summary><span><Mic'), 'controles exibidos sob demanda')
check('CSS responsivo novo', styles.includes('.calls-summary-strip') && styles.includes('.call-guidance-tabs__nav') && styles.includes('@media(max-width:600px)'), 'desktop, tablet e celular')
check('Motion System global', styles.includes('--motion-standard') && styles.includes('prefers-reduced-motion') && styles.includes('.route-transition'), 'tokens, acessibilidade e páginas')
check('Toasts descartáveis', context.includes('dismissToast') && read('src/components/ui/toast-region.tsx').includes('toast__close'), 'fechamento manual e automático')
check('Modais com saída', read('src/components/ui/modal.tsx').includes('EXIT_DURATION_MS') && styles.includes('rt-modal-exit'), 'entrada, saída e restauração de foco')
check('Ações profissionais globais', exists('src/components/ui/action-dialog-center.tsx') && context.includes('confirmAction') && context.includes('promptAction'), 'confirmação e entrada contextual')
check('Sem diálogos nativos', !sourceText.includes('window.confirm') && !sourceText.includes('window.prompt'), 'ações críticas usam componentes RealTalent')
check('Toast com ação e Desfazer', read('src/components/ui/toast-region.tsx').includes('toast__action') && context.includes('ToastAction'), 'ações contextuais no feedback')
check('Build gerado', exists('dist/index.html') && fs.readdirSync(path.join(root, 'dist/assets')).some((name) => name.endsWith('.js')), 'dist e bundle presentes')

const report = { version: pkg.version, generatedAt: new Date().toISOString(), passed: checks.every((item) => item.passed), checks }
fs.writeFileSync(path.join(root, `RENDER-STABILITY-AUDIT-${releaseLabel}.json`), JSON.stringify(report, null, 2) + '\n')
console.log(`${checks.filter((item) => item.passed).length}/${checks.length} verificações de renderização aprovadas.`)
if (!report.passed) {
  checks.filter((item) => !item.passed).forEach((item) => console.error(`FALHA: ${item.name} — ${item.detail}`))
  process.exit(1)
}
