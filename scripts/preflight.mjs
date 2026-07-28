import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const root = process.cwd()
const checks = []
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail })
const exists = (value) => fs.existsSync(path.join(root, value))
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const shortVersion = packageJson.version.replace(/\.0$/, '')
const releaseLabel = `V${shortVersion.replaceAll('.', '-')}`
const migrationsDir = path.join(root, 'supabase', 'migrations')
const migrations = exists('supabase/migrations') ? fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort() : []

check('Node definido', exists('.nvmrc') && fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim() === '22', 'Node 22')
check('Lockfile presente', exists('package-lock.json'), 'npm ci reproduzível')
check('Fonte oficial documentada', exists(`docs/FONTE-OFICIAL-${releaseLabel}.md`), 'React + TypeScript + Vite')
check('Guard de fonte oficial', exists('scripts/source_of_truth_guard.mjs'), 'HTML não pode virar fonte')
check('Guard de arquitetura', exists('scripts/architecture_guard.mjs'), 'limites entre camadas')
check('Lock de migrations', exists('supabase/migrations.lock.json'), 'checksums históricos')
check('Auditoria do banco', exists(`DATABASE-AUDIT-${releaseLabel}.json`), 'RLS, migrations e SECURITY DEFINER')
check('Contratos SQL', exists('supabase/tests/homologation_contracts.sql'), 'smoke do schema local')
check('Configuração Supabase', exists('supabase/config.toml'), 'config.toml versionado')
check('Seed local', exists('supabase/seed.sql'), 'seed.sql presente')
check('Migrations', migrations.length >= 18, `${migrations.length} migration(s) encontrada(s)`)
check('Motor comercial transacional', exists('supabase/migrations/202607220002_v100_34_commercial_engine.sql') && exists('src/services/commercial-action-engine.ts'), 'RPCs e serviço central')
check('Webhooks profissionais', exists('supabase/migrations/202607230001_v100_36_automation_webhooks.sql') && exists('supabase/functions/automation-webhook-dispatch/index.ts'), 'fila e auditoria')
check('Configuração Vercel', exists('vercel.json'), 'SPA e headers de segurança')
check('Ambientes separados', exists('.env.staging.example') && exists('.env.production.example') && exists('.env.demo'), 'demo, staging e production')
check('CI GitHub', exists('.github/workflows/ci.yml'), 'validação em push e pull request')
check('Release candidate', exists('.github/workflows/release-candidate.yml'), 'homologação manual protegida')
check('Deploy Supabase manual', exists('.github/workflows/deploy-supabase.yml'), 'workflow protegido por environment')
check('Health check', exists('public/health.json') && fs.readFileSync(path.join(root, 'public/health.json'), 'utf8').includes(shortVersion), `/health.json ${shortVersion}`)
check('Prontidão de produção', exists(`PRODUCTION-READINESS-${releaseLabel}.json`), `gate operacional ${releaseLabel}`)
check('Testes E2E de staging', exists('scripts/e2e_staging.py') && exists('scripts/tenant_isolation_test.py'), 'navegador e isolamento multiempresa')
check('Backup e restauração', exists('scripts/backup_database.mjs') && exists('scripts/restore_database.mjs'), 'checksum e proteção de destino')
check('Propostas e Forecast', exists('supabase/migrations/202607270004_v100_43_proposals_forecast.sql') && exists('src/features/proposals/proposals-page.tsx') && exists('src/services/revenue-forecast.ts'), 'produtos, propostas, receita e previsão')
check('Comunicações removidas da interface', !exists('src/features/communications/communications-page.tsx') && !exists('src/services/communications.ts') && !fs.readFileSync(path.join(root, 'src/components/layout/navigation.ts'), 'utf8').includes("route: 'communications'"), 'aba, rota e serviço de tela removidos')
check('Observabilidade por organização', exists('supabase/migrations/202607270002_v100_41_production_observability.sql') && exists('supabase/functions/client-diagnostics/index.ts'), 'eventos autenticados com RLS')
check('Workflow de staging', exists('.github/workflows/deploy-staging.yml'), 'deploy + E2E + RLS')
check('Promoção protegida', exists('.github/workflows/promote-production.yml'), 'backup e health antes/depois')
const standalonePath = `REALTALENT-CRM-${releaseLabel}.html`
const standaloneText = exists(standalonePath) ? fs.readFileSync(path.join(root, standalonePath), 'utf8') : ''
const generatedStandalone = standaloneText.includes('GENERATED_FROM_TYPESCRIPT_SOURCE')
const contingencyStandalone = standaloneText.includes('CONTINGENCY_RUNTIME_EQUIVALENCE') && exists(`BUILD-CONTINGENCY-${releaseLabel}.json`)
check('Standalone com origem verificável', generatedStandalone || contingencyStandalone, generatedStandalone ? 'gerado do TypeScript' : contingencyStandalone ? 'contingência documentada' : 'origem ausente')
check('Build oficial atualizado', generatedStandalone, generatedStandalone ? releaseLabel : 'pendente: npm ci && npm run homologate')
check('Inicializador Windows', exists('INICIAR-CRM-LOCAL.bat') && exists('INICIAR-CRM-COM-SUPABASE.bat'), 'atalhos de inicialização')

const suspicious = []
for (const file of ['.env.example', '.env.production.example', '.env.staging.example', '.env.local.example', 'vercel.json']) {
  if (!exists(file)) continue
  const text = fs.readFileSync(path.join(root, file), 'utf8')
  if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(text)) suspicious.push(`${file}: chave sb_secret_`)
  if (/service_role/i.test(text) && /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(text)) suspicious.push(`${file}: JWT administrativo`)
}
check('Nenhum segredo conhecido', suspicious.length === 0, suspicious.join('; ') || 'nenhum segredo detectado')

const failed = checks.filter((item) => !item.ok)
const manifest = {
  version: packageJson.version,
  generatedAt: new Date().toISOString(),
  passed: failed.length === 0,
  checks,
  migrations,
  files: ['package.json', 'package-lock.json', 'vercel.json', 'supabase/config.toml', 'supabase/migrations.lock.json', ...migrations.map((name) => `supabase/migrations/${name}`)]
    .filter(exists)
    .map((file) => ({ file, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex') })),
}
fs.writeFileSync(path.join(root, `PRE-FLIGHT-${releaseLabel}.json`), JSON.stringify(manifest, null, 2) + '\n')

for (const item of checks) console.log(`${item.ok ? 'OK' : 'FALHA'} — ${item.name}: ${item.detail}`)
console.log(`\n${checks.length - failed.length}/${checks.length} verificações aprovadas.`)
if (failed.length) process.exit(1)
