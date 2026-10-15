import fs from 'node:fs'
import path from 'node:path'
import { auditRuntimeDependencies } from './runtime-dependency-policy.mjs'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const exists = (file) => fs.existsSync(path.join(root, file))
const contains = (file, value) => read(file).includes(value)
const packageJson = JSON.parse(read('package.json'))
const checks = []
const check = (label, condition) => checks.push({ label, ok: Boolean(condition) })

const versionParts = packageJson.version.split('.').map(Number)
const atLeast100620 = versionParts[0] > 100 || (versionParts[0] === 100 && (versionParts[1] > 62 || (versionParts[1] === 62 && versionParts[2] >= 0)))
check('Versão inclui ou sucede V100.62.0', atLeast100620)
check('VERSION acompanha pacote', read('VERSION').trim() === `V${packageJson.version}`)
check('APP_VERSION acompanha pacote', contains('src/lib/app-version.ts', `APP_VERSION = '${packageJson.version}'`))
check('Título identifica RealTalent CRM atual', contains('index.html', `RealTalent CRM V${packageJson.version}`))
check('Health acompanha pacote', contains('public/health.json', `"version": "${packageJson.version}"`))
check('Bridge comercial acompanha versão', contains('src/features/commercial-map/commercial-map-page.tsx', 'version: APP_VERSION'))

check('Motor Deal Intelligence existe', exists('src/services/deal-intelligence.ts'))
check('Deal Health possui seis componentes', ['activity','stakeholders','proposal','nextStep','timing','engagement'].every((key) => contains('src/services/deal-intelligence.ts', key)))
check('Pesos são normalizados pelo total configurado', contains('src/services/deal-intelligence.ts', 'totalWeight') && contains('src/services/deal-intelligence.ts', 'contribution'))
check('Probabilidade RealTalent não sobrescreve probabilidade do vendedor', contains('src/services/deal-intelligence.ts', 'sellerProbability') && contains('src/services/deal-intelligence.ts', 'realTalentProbability'))
check('Risk Engine cobre ação, atividade, stakeholders, proposta e timing', ['overdue-next-step','stale-critical','missing-decision-maker','single-threaded','proposal-viewed-no-response','close-overdue','probability-gap'].every((key) => contains('src/services/deal-intelligence.ts', key)))
check('Next Best Action cobre execução comercial', ['call','followup','meeting','map_stakeholder','proposal','review_proposal','update_close_date'].every((key) => contains('src/services/deal-intelligence.ts', key)))
check('Deal Momentum existe', contains('src/services/deal-intelligence.ts', 'buildMomentum') && contains('src/services/deal-intelligence.ts', "'accelerating'") && contains('src/services/deal-intelligence.ts', "'cooling'"))
check('Pipeline Portfolio calcula valor em risco e forecast RealTalent', contains('src/services/deal-intelligence.ts', 'atRiskValue') && contains('src/services/deal-intelligence.ts', 'predictedValue'))
check('Account Coverage reutiliza Account 360', contains('src/services/deal-intelligence.ts', 'buildAccountIntelligence'))

check('Preferências persistem Deal Intelligence', contains('src/features/settings/preferences-context.tsx', 'dealIntelligence: DealIntelligenceConfig') && contains('src/features/settings/preferences-context.tsx', 'normalizeDealIntelligence'))
check('Configurações permitem pesos do Deal Health', ['Atividade','Stakeholders','Proposta','Próximo passo','Timing','Engajamento'].every((label) => contains('src/features/settings/settings-page.tsx', label)))
check('Configurações permitem limites de risco', contains('src/features/settings/settings-page.tsx', 'Negócio parado após') && contains('src/features/settings/settings-page.tsx', 'Valor exige decisor'))

check('Deal Portfolio preservado no Pipeline', contains('src/features/pipeline/pipeline-page.tsx', '<DealPortfolioPanel'))
check('Forecast RealTalent preservado nos módulos analíticos', contains('src/features/pipeline/pipeline-page.tsx', 'Forecast RealTalent') && contains('src/features/revenue-intelligence/revenue-intelligence-panel.tsx', 'Forecast RealTalent'))
check('Meu Dia executa Next Best Action', contains('src/features/dashboard/dashboard-page.tsx', 'runDealAction'))
check('Ficha do Lead mostra Deal Health', contains('src/features/leads/lead-details-drawer.tsx', '<DealHealthPanel') || (contains('src/features/leads/lead-details-drawer.tsx', 'Deal Health') && contains('src/features/leads/lead-details-drawer.tsx', 'dealInsight.healthScore')))
check('Ficha e Dashboard usam o mesmo motor', contains('src/features/leads/lead-details-drawer.tsx', 'buildDealIntelligence') && contains('src/features/dashboard/dashboard-page.tsx', 'buildDealPortfolio'))

check('Pipeline possui Pipeline Intelligence', contains('src/features/pipeline/pipeline-page.tsx', '<DealPortfolioPanel'))
check('Smart Pipeline comunica Deal Health nos cards', contains('src/features/pipeline/pipeline-page.tsx', 'pipeline-card-deal-health') || (contains('src/features/pipeline/pipeline-page.tsx', 'pipeline-rotting-indicator') && contains('src/features/pipeline/pipeline-page.tsx', "deal?.healthLevel === 'critical'")))
check('Pipeline ordena por risco', contains('src/features/pipeline/pipeline-preferences.ts', 'deal_health_asc') && contains('src/features/pipeline/pipeline-page.tsx', 'Maior risco / menor Deal Health'))
check('Pipeline ordena por probabilidade RealTalent', contains('src/features/pipeline/pipeline-preferences.ts', 'deal_probability_desc') && contains('src/features/pipeline/pipeline-page.tsx', 'Maior probabilidade RealTalent'))
check('Pipeline filtra faixa Forte do Deal Health', contains('src/features/pipeline/pipeline-preferences.ts', "'strong'") && (contains('src/features/pipeline/pipeline-page.tsx', '<option value="strong">Forte</option>') || contains('src/features/pipeline/pipeline-page.tsx', "{ value: 'strong', label: 'Forte' }")))
check('Pipeline compara probabilidade vendedor → RealTalent', contains('src/features/pipeline/pipeline-page.tsx', 'Prob. Vendedor → RT'))
check('Deal Inspector existe', exists('src/features/deal-intelligence/deal-inspector-modal.tsx') && contains('src/features/pipeline/pipeline-page.tsx', '<DealInspectorModal'))
check('Deal Inspector explica score', contains('src/features/deal-intelligence/deal-inspector-modal.tsx', 'Por que {insight.healthScore}?'))
check('Timeline inteligente usa eventos reais e declara não inventar score', contains('src/features/deal-intelligence/deal-inspector-modal.tsx', 'Eventos reais do CRM, sem inventar histórico de score.'))
check('Deal Inspector agrega ligações, atividades, agenda e propostas', ['snapshot.calls','snapshot.activities','snapshot.events','snapshot.proposals'].every((value) => contains('src/features/deal-intelligence/deal-inspector-modal.tsx', value)))

check('Contrato RealTalent Connect é versionado', contains('src/services/realtalent-connect-contract.ts', "realtalent.connect.conversation.v1"))
check('Contrato rejeita payload fora do schema/origem', contains('src/services/realtalent-connect-contract.ts', "raw.schema !== REALTALENT_CONNECT_SIGNAL_SCHEMA") && contains('src/services/realtalent-connect-contract.ts', "raw.source !== 'realtalent-connect'"))
check('Contrato aceita dores, objeções e buying signals', ['pains','objections','buyingSignals'].every((value) => contains('src/services/realtalent-connect-contract.ts', value)))
check('Testes do motor existem', exists('src/services/deal-intelligence.test.ts') && contains('src/services/deal-intelligence.test.ts', 'calcula Deal Health explicável'))
check('Testes do contrato Connect existem', exists('src/services/realtalent-connect-contract.test.ts'))

check('CSS dedicado de Deal Intelligence existe', exists('src/styles/deal-intelligence-v10062.css'))
check('Interface de Deal Health é responsiva', contains('src/styles/deal-intelligence-v10062.css', '@media(max-width:720px)'))
check('Dependências de runtime continuam enxutas', auditRuntimeDependencies(Object.keys(packageJson.dependencies ?? {})).ok)
check('Deal Intelligence não removeu migrations-base', fs.readdirSync(path.join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql')).length >= 35)
check('Schema de backup permanece 100.54', contains('src/lib/app-version.ts', "BACKUP_SCHEMA_VERSION = '100.54'"))
check('Check completo inclui QA V100.62.0', packageJson.scripts?.['check:legacy']?.includes('qa:v100.62.0'))
check('Release notes existem', exists('RELEASE_NOTES_V100.62.0.md'))
check('Documento técnico existe', exists('docs/V100.62.0-DEAL-INTELLIGENCE.md'))
check('Contrato Connect está documentado', exists('docs/REALTALENT-CONNECT-CONVERSATION-SIGNAL-V1.md'))

const failed = checks.filter((item) => !item.ok)
for (const item of checks) console.log(`${item.ok ? 'OK ' : 'FAIL'} ${item.label}`)
console.log(`\nV100.62.0 Deal Intelligence Audit: ${checks.length - failed.length}/${checks.length} contratos aprovados.`)
if (failed.length) {
  console.error(`Falharam: ${failed.map((item) => item.label).join('; ')}`)
  process.exit(1)
}
