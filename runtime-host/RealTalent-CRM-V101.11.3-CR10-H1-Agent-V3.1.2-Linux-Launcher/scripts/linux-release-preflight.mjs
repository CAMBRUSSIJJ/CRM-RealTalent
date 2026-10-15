import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcRoot = path.join(root, 'src')
const errors = []
const files = []

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full)
  }
}
walk(srcRoot)

// Lucide intentionally does not ship brand logos. Importing these names causes
// Vite/Rolldown MISSING_EXPORT failures even though the TSX parses correctly.
const unsupportedBrandIcons = new Set([
  'Facebook', 'Instagram', 'Linkedin', 'LinkedIn', 'Twitter', 'XTwitter',
  'Github', 'GitHub', 'Youtube', 'YouTube', 'Chrome', 'Slack', 'Discord',
  'Apple', 'Twitch', 'Dribbble', 'Figma',
])

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8')
  const importRe = /import\s*\{([\s\S]*?)\}\s*from\s*['"]lucide-react['"]/g
  let match
  while ((match = importRe.exec(source))) {
    for (const raw of match[1].split(',')) {
      const specifier = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]?.trim()
      if (specifier && unsupportedBrandIcons.has(specifier)) {
        errors.push(`${path.relative(root, file)}: ícone de marca '${specifier}' não é exportado por lucide-react`)
      }
    }
  }
}

const communicationsPath = path.join(srcRoot, 'features/communications/communications-page.tsx')
const communications = fs.readFileSync(communicationsPath, 'utf8')
const globalPreferencesCount = (communications.match(/const\s*\{\s*preferences\s*\}\s*=\s*usePreferences\(\)/g) || []).length
const obsoleteStateCount = (communications.match(/const\s*\[\s*preferences\s*,\s*setPreferences\s*\]/g) || []).length
const preferredChannelsCount = (communications.match(/const\s*\[\s*preferredChannels\s*,\s*setPreferredChannels\s*\]/g) || []).length

if (globalPreferencesCount !== 1) errors.push(`communications-page.tsx: esperado 1 binding global 'preferences', encontrado ${globalPreferencesCount}`)
if (obsoleteStateCount !== 0) errors.push("communications-page.tsx: estado legado '[preferences, setPreferences]' reapareceu")
if (preferredChannelsCount !== 1) errors.push(`communications-page.tsx: esperado 1 estado 'preferredChannels', encontrado ${preferredChannelsCount}`)



// V100.95 — Workspace Personalization must be present before we spend time on npm build.
const requiredReleaseFiles = [
  'src/features/settings/page-personalization-settings.tsx',
  'src/features/experience/experience-registry.ts',
  'src/styles/workspace-personalization-v10095.css',
]
for (const relative of requiredReleaseFiles) {
  if (!fs.existsSync(path.join(root, relative))) errors.push(`V100.95: arquivo obrigatório ausente: ${relative}`)
}

const currentPackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const currentVersion = currentPackage.version
const versionSource = fs.readFileSync(path.join(srcRoot, 'lib/app-version.ts'), 'utf8')
const preferencesSource = fs.readFileSync(path.join(srcRoot, 'features/settings/preferences-context.tsx'), 'utf8')
const sidebarSource = fs.readFileSync(path.join(srcRoot, 'components/layout/sidebar.tsx'), 'utf8')
const registrySource = fs.readFileSync(path.join(srcRoot, 'features/experience/experience-registry.ts'), 'utf8')
const pageSettingsSource = fs.readFileSync(path.join(srcRoot, 'features/settings/page-personalization-settings.tsx'), 'utf8')

if (!versionSource.includes(`APP_VERSION = '${currentVersion}'`)) errors.push(`APP_VERSION não acompanha package ${currentVersion}`)
if (!versionSource.includes("BACKUP_SCHEMA_VERSION = '100.54'")) errors.push('V101.1.0: BACKUP_SCHEMA_VERSION 100.54 ausente')
if (!preferencesSource.includes('primaryRoutes: AppRoute[]')) errors.push('V100.95: primaryRoutes ausente das preferências de navegação')
if (!sidebarSource.includes('preferences.navigation.primaryRoutes.includes(item.route)')) errors.push('V100.95: Sidebar não usa primaryRoutes configurável')
if (!pageSettingsSource.includes('Central de páginas') || !pageSettingsSource.includes('hiddenSections') || !pageSettingsSource.includes('sectionOrder')) errors.push('V100.95: personalização de páginas incompleta')
for (const marker of ["id: 'forecast-kpis'", "id: 'forecast-scenarios'", "id: 'forecast-risks'", "id: 'forecast-deals'"]) {
  if (!registrySource.includes(marker)) errors.push(`V100.95: registro de Forecast ausente: ${marker}`)
}



// V100.96 — Guided Selling & Help.
const requiredV10096Files = [
  'src/features/assistant/guided-selling-strip.tsx',
  'src/styles/guided-selling-help-v10096.css',
]
for (const relative of requiredV10096Files) {
  if (!fs.existsSync(path.join(root, relative))) errors.push(`V100.96: arquivo obrigatório ausente: ${relative}`)
}
const appShellSource = fs.readFileSync(path.join(srcRoot, 'components/layout/app-shell.tsx'), 'utf8')
const guidedSellingSource = fs.readFileSync(path.join(srcRoot, 'features/assistant/guided-selling-strip.tsx'), 'utf8')
const quickHelpSource = fs.readFileSync(path.join(srcRoot, 'features/help/quick-help-modal.tsx'), 'utf8')
const shellStripRetiredV1017 = (() => { const parts=currentVersion.split('.').map(Number); return parts[0]>101 || (parts[0]===101 && parts[1]>=7) })()
if (!shellStripRetiredV1017 && !appShellSource.includes('<GuidedSellingStrip />')) errors.push('V100.96: GuidedSellingStrip não foi integrado ao AppShell')
if (shellStripRetiredV1017 && appShellSource.includes('<GuidedSellingStrip />')) errors.push('V101.7: GuidedSellingStrip global deveria estar removido do AppShell')
for (const marker of ['Próxima melhor ação', 'Por quê?', 'Perguntar', 'assistantPrompt']) {
  if (!guidedSellingSource.includes(marker)) errors.push(`V100.96: Guided Selling incompleto: ${marker}`)
}
for (const marker of ['Jornada do vendedor', 'Objetivo do vendedor', 'Ir para a função', 'Perguntar ao Assistant']) {
  if (!quickHelpSource.includes(marker)) errors.push(`V100.96: Central de Ajuda guiada incompleta: ${marker}`)
}



// V100.97 — Product & Revenue Workspace.
const requiredV10097Files = [
  'src/styles/product-revenue-v10097.css',
  'supabase/migrations/202609250001_v100_97_product_revenue_workspace.sql',
]
for (const relative of requiredV10097Files) {
  if (!fs.existsSync(path.join(root, relative))) errors.push(`V100.97: arquivo obrigatório ausente: ${relative}`)
}
const proposalSourceV10097 = fs.readFileSync(path.join(srcRoot, 'features/proposals/proposals-page.tsx'), 'utf8')
const revenuePanelV10097 = fs.readFileSync(path.join(srcRoot, 'features/revenue-intelligence/revenue-intelligence-panel.tsx'), 'utf8')
const productTypesV10097 = fs.readFileSync(path.join(srcRoot, 'domain/types.ts'), 'utf8')
for (const marker of ['unitCost?: number', "kind?: 'product' | 'service'", 'unitLabel?: string', 'defaultDiscountPercent?: number']) {
  if (!productTypesV10097.includes(marker)) errors.push(`V100.97: campo de catálogo ausente: ${marker}`)
}
for (const marker of ['catalog-insights-professional', 'Margem média de tabela', 'Uso do catálogo em propostas', 'productMarginPercent']) {
  if (!proposalSourceV10097.includes(marker)) errors.push(`V100.97: workspace de catálogo incompleto: ${marker}`)
}
for (const marker of ['forecastPresets', "applyForecastPreset('executive')", "applyForecastPreset('sales')", "applyForecastPreset('revenue')", "applyForecastPreset('complete')"]) {
  if (!revenuePanelV10097.includes(marker)) errors.push(`V100.97: personalização rápida do Forecast incompleta: ${marker}`)
}

// V100.98 — Prospecting Engine.
const requiredV10098Files = [
  'src/services/prospecting-provider-gateway.ts',
  'src/styles/prospecting-engine.css',
  'supabase/functions/prospecting-search/index.ts',
]
for (const relative of requiredV10098Files) {
  if (!fs.existsSync(path.join(root, relative))) errors.push(`V100.98: arquivo obrigatório ausente: ${relative}`)
}
const prospectingPageV10098 = fs.readFileSync(path.join(srcRoot, 'features/prospecting/prospecting-page.tsx'), 'utf8')
const providerGatewayV10098 = fs.readFileSync(path.join(srcRoot, 'services/prospecting-provider-gateway.ts'), 'utf8')
const viteConfigV10098 = fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8')
const prospectingExperienceMarkersV10098 = [
  ['entrada comercial', ['Busca comercial', 'Garimpo automático', 'Prospecção territorial', 'Buscar empresas']],
  ['ação de busca', ['Iniciar busca automática', 'Iniciar garimpo no Linux', 'Iniciar busca']],
  ['status de fontes', ['Motor de fontes', 'Fontes opcionais', 'Motor local', 'Garimpo pronto']],
  ['RT Capture', ['RT Capture']],
]
for (const [label, markers] of prospectingExperienceMarkersV10098) {
  if (!markers.some((marker) => prospectingPageV10098.includes(marker))) {
    errors.push(`V100.98: experiência do Prospecting Engine incompleta: ${label}`)
  }
}
for (const marker of ['getProspectingProviderDiagnostics', 'runProspectingProviderSearch', 'ProspectingProviderError']) {
  if (!providerGatewayV10098.includes(marker)) errors.push(`V100.98: gateway de providers incompleto: ${marker}`)
}
if (!viteConfigV10098.includes('realtalent-prospecting-local-api') || !viteConfigV10098.includes('places.googleapis.com/v1/places:searchText')) errors.push('V100.98: gateway local Google Places ausente')



// V100.98.1 — Workspace Layout Studio.
const layoutStudioCssPath = path.join(srcRoot, 'styles/workspace-layout-studio-v100981.css')
const layoutStudioCss = fs.existsSync(layoutStudioCssPath) ? fs.readFileSync(layoutStudioCssPath, 'utf8') : ''
if (!fs.existsSync(layoutStudioCssPath)) errors.push('V100.98.1: CSS do Workspace Layout Studio ausente')
for (const marker of ['sidebarWidth', 'sidebarShowBrand', 'sidebarShowGroups', 'sidebarShowProfile', 'sidebarOpenSecondary']) {
  if (!preferencesSource.includes(marker)) errors.push(`V100.98.1: preferência de Sidebar ausente: ${marker}`)
}
if (!preferencesSource.includes("'expanded' | 'compact' | 'auto'")) errors.push('V100.98.1: modo automático da Sidebar ausente')
for (const marker of ['data-sidebar-mode', 'toggleSecondary']) {
  if (!sidebarSource.includes(marker)) errors.push(`V100.98.1: Sidebar configurável incompleta: ${marker}`)
}
const experienceContextSource = fs.readFileSync(path.join(srcRoot, 'features/experience/experience-context.tsx'), 'utf8')
const experienceBoundarySource = fs.readFileSync(path.join(srcRoot, 'features/experience/page-experience-boundary.tsx'), 'utf8')
for (const marker of ['sectionSizes', 'ExperienceBlockSize']) {
  if (!experienceContextSource.includes(marker)) errors.push(`V100.98.1: Layout Studio incompleto: ${marker}`)
}
if (!experienceBoundarySource.includes('dataset.experienceSize')) errors.push('V100.98.1: boundary não aplica tamanho dos blocos')
for (const marker of ['Organizar automaticamente', 'page-personalization-section__sizes', 'Linha inteira']) {
  if (!pageSettingsSource.includes(marker)) errors.push(`V100.98.1: editor de páginas incompleto: ${marker}`)
}
for (const marker of ['grid-template-columns:repeat(12', 'data-experience-size="m"', 'data-sidebar-mode="auto"']) {
  if (!layoutStudioCss.includes(marker)) errors.push(`V100.98.1: CSS esperado ausente: ${marker}`)
}



// V100.98.2 — RealTalent Calling 3.0.
const callingWorkspaceV982 = fs.readFileSync(path.join(srcRoot, 'features/calls/call-workspace-modal.tsx'), 'utf8')
const callingPrepV982 = fs.readFileSync(path.join(srcRoot, 'features/calls/call-session-preparation-modal.tsx'), 'utf8')
const voiceDialerV982 = fs.readFileSync(path.join(srcRoot, 'services/voice-dialer.ts'), 'utf8')
const callingCssV982Path = path.join(srcRoot, 'styles/calling-workspace.css')
const callingCssV982 = fs.existsSync(callingCssV982Path) ? fs.readFileSync(callingCssV982Path, 'utf8') : ''
const connectServerV982Path = path.join(root, 'scripts/realtalent-connect-server.mjs')
const connectConfigV982Path = path.join(root, 'configure-realtalent-connect.sh')
if (!fs.existsSync(callingCssV982Path)) errors.push('V100.98.2: CSS do Calling 3.0 ausente')
if (!fs.existsSync(connectServerV982Path)) errors.push('V100.98.2: servidor RealTalent Connect ausente')
if (!fs.existsSync(connectConfigV982Path)) errors.push('V100.98.2: configurador RealTalent Connect ausente')
for (const marker of ['Modo Foco — Ligações', 'Antes de ligar', 'Somente o próximo sinal útil', 'Depois da ligação']) {
  if (!callingWorkspaceV982.includes(marker)) errors.push(`V100.98.2: Modo Foco simplificado incompleto: ${marker}`)
}
if (!callingWorkspaceV982.includes('Playbook:') && !callingWorkspaceV982.includes('Roteiro:')) errors.push('V100.98.2: cabeçalho perdeu identificação do playbook/roteiro')
if (!callingPrepV982.includes('Playbook da sessão') && !callingPrepV982.includes('Roteiro da sessão')) errors.push('V100.98.2: preparação por Playbook/Roteiro incompleta')
for (const marker of ['effectiveSessionPlaybookId', 'Roteiro padrão RealTalent']) {
  if (!callingPrepV982.includes(marker)) errors.push(`V100.98.2: preparação por Playbook incompleta: ${marker}`)
}
for (const marker of ['beginConnectCallPolling', '/api/voice/v1/calls/', 'configured ? \'available\' : \'not_configured\'']) {
  if (!voiceDialerV982.includes(marker)) errors.push(`V100.98.2: Voice Layer incompleta: ${marker}`)
}
for (const marker of ['calling-v982__conversation', 'calling-v982__script-card', 'calling-v982__wrap']) {
  if (!callingCssV982.includes(marker)) errors.push(`V100.98.2: layout de chamada incompleto: ${marker}`)
}
const connectServerV982 = fs.existsSync(connectServerV982Path) ? fs.readFileSync(connectServerV982Path, 'utf8') : ''
for (const marker of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'REALTALENT_AGENT_PHONE_NUMBER', '/api/voice/v1/capabilities', '/api/voice/v1/calls', 'Agent Bridge']) {
  if (!connectServerV982.includes(marker)) errors.push(`V100.98.2: RealTalent Connect incompleto: ${marker}`)
}


// V100.99 — Visual Intelligence.
const visualFunnelV10099Path = path.join(srcRoot, 'features/metrics/visual-funnel.tsx')
const visualCssV10099Path = path.join(srcRoot, 'styles/visual-intelligence-v10099.css')
const metricsV10099 = fs.readFileSync(path.join(srcRoot, 'features/metrics/metrics-page.tsx'), 'utf8')
const visualFunnelV10099 = fs.existsSync(visualFunnelV10099Path) ? fs.readFileSync(visualFunnelV10099Path, 'utf8') : ''
const visualCssV10099 = fs.existsSync(visualCssV10099Path) ? fs.readFileSync(visualCssV10099Path, 'utf8') : ''
if (!fs.existsSync(visualFunnelV10099Path)) errors.push('V100.99: componente VisualFunnel ausente')
if (!fs.existsSync(visualCssV10099Path)) errors.push('V100.99: CSS Visual Intelligence ausente')
for (const marker of ['<VisualFunnel', 'scrollIntoView', '<StageModal']) {
  if (!metricsV10099.includes(marker)) errors.push(`V100.99: integração de Métricas incompleta: ${marker}`)
}
if (!metricsV10099.includes('metrics-view-tabs--sticky') && !metricsV10099.includes('WorkspaceViewStrip') && !metricsV10099.includes('metrics-section-nav-v10171')) errors.push('V100.99: integração de Métricas incompleta: navegação analítica')
for (const marker of [['Funil comercial interativo', 'Funil comercial'], 'onMouseEnter', 'onFocus', 'onEditStage(active.stage)', 'Negócios nesta etapa']) {
  const present = Array.isArray(marker) ? marker.some((value) => visualFunnelV10099.includes(value)) : visualFunnelV10099.includes(marker)
  if (!present) errors.push(`V100.99: funil interativo incompleto: ${Array.isArray(marker) ? marker.join(' / ') : marker}`)
}
for (const marker of ['clip-path: polygon', '.metrics-visual-funnel__segment:hover', 'position: sticky', '@media (prefers-reduced-motion: reduce)']) {
  if (!visualCssV10099.includes(marker)) errors.push(`V100.99: experiência visual incompleta: ${marker}`)
}


// V101.0 — Territory & UI System.
const territoryV101Path = path.join(srcRoot, 'styles/territory-ui-system-v101.css')
const designV101Path = path.join(srcRoot, 'styles/design-system-v101.css')
const mapsSettingsV101Path = path.join(srcRoot, 'features/settings/maps-integration-panel.tsx')
const mapPageV101 = fs.readFileSync(path.join(srcRoot, 'features/commercial-map/commercial-map-page.tsx'), 'utf8')
const mapRuntimeV101 = fs.readFileSync(path.join(root, 'public/commercial-map-runtime.js'), 'utf8')
const viteV101 = fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8')
const mainV101 = fs.readFileSync(path.join(srcRoot, 'main.tsx'), 'utf8')
if (!fs.existsSync(territoryV101Path)) errors.push('V101.0: CSS de Território ausente')
if (!fs.existsSync(designV101Path)) errors.push('V101.0: Design System ausente')
if (!fs.existsSync(mapsSettingsV101Path)) errors.push('V101.0: painel Mapa e Território ausente')
for (const marker of ['/api/maps/diagnostics', '/api/maps/geocode', 'maps.googleapis.com/maps/api/geocode/json', 'GOOGLE_MAPS_SERVER_KEY']) {
  if (!viteV101.includes(marker)) errors.push(`V101.0: gateway de mapas incompleto: ${marker}`)
}
for (const marker of ['tile.openstreetmap.org', 'OpenStreetMap contributors', 'google.com/maps/search/?api=1']) {
  if (!mapRuntimeV101.includes(marker)) errors.push(`V101.0: runtime territorial incompleto: ${marker}`)
}
if (mapRuntimeV101.includes('basemaps.cartocdn.com')) errors.push('V101.0: runtime ainda depende de tiles CARTO que podem exigir chave')
for (const marker of ['geocodeLocalItems', 'applyGeocodeOutcome', '/api/maps/diagnostics', "import { APP_VERSION } from '../../lib/app-version'", 'version: APP_VERSION']) {
  if (!mapPageV101.includes(marker)) errors.push(`V101.0: bridge territorial incompleta: ${marker}`)
}
if (!mainV101.includes("territory-ui-system-v101.css")) errors.push("V101.0: CSS não importado: territory-ui-system-v101.css")
if (!mainV101.includes("design-system-v101.css") && !mainV101.includes("ui-polish.css") && !mainV101.includes("ui-polish.css")) errors.push("V101.0: Design System runtime ausente")

// Every selector exposed to the user in Settings > Páginas must point to at least
// one class/id that exists in the current TSX. Stale selectors make the control
// appear to work while changing nothing on screen.
const tsxSource = files.filter((file) => file.endsWith('.tsx')).map((file) => fs.readFileSync(file, 'utf8')).join('\n')
for (const match of registrySource.matchAll(/selector:\s*'([^']+)'/g)) {
  for (const selector of match[1].split(',').map((item) => item.trim())) {
    if (selector.startsWith('.') && !tsxSource.includes(selector.slice(1))) errors.push(`V100.95: seletor de página sem alvo TSX: ${selector}`)
    if (selector.startsWith('#') && !tsxSource.includes(selector.slice(1))) errors.push(`V100.95: seletor de página sem alvo TSX: ${selector}`)
  }
}


// V101.1 — Consolidation & Runtime QA.
const packageV1011 = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const readmeV1011 = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
const bootV1011 = fs.readFileSync(path.join(root, 'public/boot-guard.js'), 'utf8')
const mapRuntimeV1011 = fs.readFileSync(path.join(root, 'public/commercial-map-runtime.js'), 'utf8')
if (!(Number(packageV1011.version.split('.')[0]) > 101 || (Number(packageV1011.version.split('.')[0]) === 101 && Number(packageV1011.version.split('.')[1]) >= 1))) errors.push(`V101.1 baseline não preservada: ${packageV1011.version}`)
if (!readmeV1011.includes('V100.92.0') || !readmeV1011.includes('V100.93.0')) errors.push('V101.1: README perdeu marcos V100.92/V100.93')
if (!bootV1011.includes("unhandledrejection") || !bootV1011.includes('Tempo limite de inicialização excedido')) errors.push('V101.1: boot guard incompleto')
if (mapRuntimeV1011.includes('basemaps.cartocdn.com') || mapRuntimeV1011.includes('API KEY REQUIRED')) errors.push('V101.1: runtime do mapa regrediu para CARTO/API KEY REQUIRED')
for (const relative of ['scripts/v101_1_consolidation_runtime_audit.mjs','scripts/v101_1_built_bundle_audit.mjs','scripts/v101_1_http_smoke.mjs']) {
  if (!fs.existsSync(path.join(root, relative))) errors.push(`V101.1: gate ausente: ${relative}`)
}


// V101.2 — Calling Workflow & Strategy.
const requiredV1012 = [
  'src/services/calling-strategy.ts',
  'src/styles/calling-workspace.css',
  'scripts/v101_2_calling_workflow_strategy_audit.mjs',
  'scripts/v101_2_built_bundle_audit.mjs',
  'scripts/v101_2_http_smoke.mjs',
  'scripts/v101_2_connect_smoke.mjs',
]
for (const relative of requiredV1012) if (!fs.existsSync(path.join(root, relative))) errors.push(`V101.2: arquivo obrigatório ausente: ${relative}`)
const connectV1012 = fs.readFileSync(path.join(root, 'scripts/realtalent-connect-server.mjs'), 'utf8')
const phoneV1012Path = path.join(root, 'scripts/realtalent-phone-v10183.html')
const phoneV1012 = fs.existsSync(phoneV1012Path) ? fs.readFileSync(phoneV1012Path, 'utf8') : connectV1012
const callsV1012 = fs.readFileSync(path.join(srcRoot, 'features/calls/call-workspace-modal.tsx'), 'utf8')
const strategyV1012 = fs.readFileSync(path.join(srcRoot, 'services/calling-strategy.ts'), 'utf8')
if (!connectV1012.includes('/api/phone/v1/pairing') || !(connectV1012.includes("location.href='tel:'") || phoneV1012.includes("location.href='tel:'"))) errors.push('V101.2: RealTalent Phone incompleto')
if (!callsV1012.includes('Contexto, histórico e anotações') || !callsV1012.includes('saveCallNoteDraft')) errors.push('V101.2: Context Workspace incompleto')
if (!strategyV1012.includes('autoSelectPlaybook') || !strategyV1012.includes('autosaveNotes')) errors.push('V101.2: Strategy preferences incompletas')


// V101.3 — Unified Sales Workspace.
const requiredV1013 = [
  'src/services/unified-sales-workspace.ts',
  'src/styles/unified-sales-workspace-v1013.css',
  'scripts/v101_3_unified_sales_workspace_audit.mjs',
  'scripts/v101_3_built_bundle_audit.mjs',
  'scripts/v101_3_http_smoke.mjs',
]
for (const relative of requiredV1013) if (!fs.existsSync(path.join(root, relative))) errors.push(`V101.3: arquivo obrigatório ausente: ${relative}`)
const leadWorkspaceV1013 = fs.readFileSync(path.join(srcRoot, 'features/leads/lead-details-drawer.tsx'), 'utf8')
const unifiedServiceV1013 = fs.readFileSync(path.join(srcRoot, 'services/unified-sales-workspace.ts'), 'utf8')
const callConfigV1013 = fs.readFileSync(path.join(srcRoot, 'features/calls/call-session-config.ts'), 'utf8')
if (!(leadWorkspaceV1013.includes('Unified Sales Workspace · V101.3') || leadWorkspaceV1013.includes('Lead Workspace 3.') || (leadWorkspaceV1013.includes('Contato Workspace · V101.6.0') || leadWorkspaceV1013.includes('Contato Workspace · V101.6.1') || leadWorkspaceV1013.includes('Contato Workspace · V101.6.2')||leadWorkspaceV1013.includes('Contato Workspace · V101.6.3')||leadWorkspaceV1013.includes('Contato Workspace · V101.6.4')||leadWorkspaceV1013.includes('Contato Workspace · V101.6.5'))) || !leadWorkspaceV1013.includes("WorkspaceTab = 'context' | 'history' | 'notes'")) errors.push('V101.3: Lead Workspace incompleto')
if (!unifiedServiceV1013.includes('UNIFIED_SALES_WORKSPACE_SCHEMA') || !unifiedServiceV1013.includes('recommendPlaybooks')) errors.push('V101.3: serviço unificado incompleto')
if (!callConfigV1013.includes('playbookId?: string') || !callConfigV1013.includes('sessionObjective?: CallSessionObjective')) errors.push('V101.3: handoff Lead → Calling incompleto')

// V101.4 — Calling Production Ready.
const requiredV1014 = [
  'src/services/call-runtime-v1014.ts',
  'src/styles/calls-v1014.css',
  'scripts/v101_4_calling_production_ready_audit.mjs',
  'scripts/v101_4_connect_resilience_smoke.mjs',
  'scripts/v101_4_built_bundle_audit.mjs',
  'scripts/v101_4_http_smoke.mjs',
]
for (const relative of requiredV1014) if (!fs.existsSync(path.join(root, relative))) errors.push(`V101.4: arquivo obrigatório ausente: ${relative}`)
const callRuntimeV1014 = fs.readFileSync(path.join(srcRoot, 'services/call-runtime-v1014.ts'), 'utf8')
const dialerV1014 = fs.readFileSync(path.join(srcRoot, 'services/voice-dialer.ts'), 'utf8')
const connectV1014 = fs.readFileSync(path.join(root, 'scripts/realtalent-connect-server.mjs'), 'utf8')
if (!callRuntimeV1014.includes('CALL_RUNTIME_SCHEMA') || !callRuntimeV1014.includes('markCallRuntimeSaved')) errors.push('V101.4: journal de runtime incompleto')
if (!dialerV1014.includes('resumeVoiceCallMonitoring') || !dialerV1014.includes("transport: 'degraded'")) errors.push('V101.4: monitoramento resiliente incompleto')
if (!connectV1014.includes('REALTALENT_CONNECT_RUNTIME_STORE') || !connectV1014.includes('reused: true')) errors.push('V101.4: persistência/idempotência do Connect incompleta')

// V101.5 — Lead Workspace 3.0.
const requiredV1015 = [
  'src/services/lead-workspace-preferences-v1015.ts',
  'src/styles/lead-workspace-v1015.css',
  'scripts/v101_5_lead_workspace_3_audit.mjs',
  'scripts/v101_5_built_bundle_audit.mjs',
  'scripts/v101_5_http_smoke.mjs',
]
for (const relative of requiredV1015) if (!fs.existsSync(path.join(root, relative))) errors.push(`V101.5: arquivo obrigatório ausente: ${relative}`)
const leadWorkspaceV1015 = fs.readFileSync(path.join(srcRoot, 'features/leads/lead-details-drawer.tsx'), 'utf8')
const leadPrefsV1015 = fs.readFileSync(path.join(srcRoot, 'services/lead-workspace-preferences-v1015.ts'), 'utf8')
if (!(leadWorkspaceV1015.includes('Lead Workspace 3.') || (leadWorkspaceV1015.includes('Contato Workspace · V101.6.0') || leadWorkspaceV1015.includes('Contato Workspace · V101.6.1') || leadWorkspaceV1015.includes('Contato Workspace · V101.6.2')||leadWorkspaceV1015.includes('Contato Workspace · V101.6.3')||leadWorkspaceV1015.includes('Contato Workspace · V101.6.4')||leadWorkspaceV1015.includes('Contato Workspace · V101.6.5'))) || !leadWorkspaceV1015.includes("setWorkspacePresentation('focus')") || !leadWorkspaceV1015.includes("setWorkspacePresentation('complete')")) errors.push('V101.5: modos Foco/Completo incompletos')
if (!leadWorkspaceV1015.includes('sales-workspace-v1015__attention') || !leadWorkspaceV1015.includes('detailsExpanded') || !leadWorkspaceV1015.includes('strategyExpanded')) errors.push('V101.5: progressive disclosure incompleto')
if (!leadPrefsV1015.includes('LEAD_WORKSPACE_PREFERENCES_SCHEMA') || !leadPrefsV1015.includes("mode: 'focus'")) errors.push('V101.5: preferências persistentes incompletas')

if (errors.length) {
  console.error('Linux release preflight: FALHOU')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(`Linux release preflight: OK (${files.length} arquivos TS/TSX; sem imports de marcas incompatíveis; bindings da Comunicação íntegros).`)
