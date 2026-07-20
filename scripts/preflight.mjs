import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const root = process.cwd()
const checks = []
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail })
const exists = (value) => fs.existsSync(path.join(root, value))
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const migrationsDir = path.join(root, 'supabase', 'migrations')
const migrations = exists('supabase/migrations') ? fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort() : []

check('Node definido', exists('.nvmrc') && fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim() === '22', 'Node 22')
check('Lockfile presente', exists('package-lock.json'), 'npm ci reproduzível')
check('Configuração Supabase', exists('supabase/config.toml'), 'config.toml versionado')
check('Seed local', exists('supabase/seed.sql'), 'seed.sql presente')
check('Migrations', migrations.length >= 10, `${migrations.length} migration(s) encontrada(s)`)
check('Edge Function de ingestão', exists('supabase/functions/extension-ingest/index.ts'), 'extension-ingest')
check('Edge Function de automação', exists('supabase/functions/automation-runner/index.ts'), 'automation-runner')
check('Configuração Vercel', exists('vercel.json'), 'SPA e headers de segurança')
check('Exemplo de produção', exists('.env.production.example'), 'variáveis sem segredos')
check('CI GitHub', exists('.github/workflows/ci.yml'), 'validação em push e pull request')
check('Deploy Supabase manual', exists('.github/workflows/deploy-supabase.yml'), 'workflow protegido por secrets')
check('Agendador de automações', exists('supabase/cron/CONFIGURAR-AUTOMATION-RUNNER.sql'), 'pg_cron + Vault')
check('Validador de ambiente', exists('scripts/validate-env.mjs'), 'bloqueio de deploy local na hospedagem')
const deployScript = exists('scripts/deploy-supabase.mjs') ? fs.readFileSync(path.join(root, 'scripts/deploy-supabase.mjs'), 'utf8') : ''
check('Segredo estável do runner', /cronSecret\.length < 32/.test(deployScript), 'redeploy exige o mesmo segredo protegido')
check('Health check', exists('public/health.json') && fs.readFileSync(path.join(root, 'public/health.json'), 'utf8').includes('100.27'), '/health.json versionado')
check('Inicializador Windows', exists('INICIAR-CRM-LOCAL.bat') && exists('INICIAR-CRM-COM-SUPABASE.bat'), 'atalhos de inicialização')

const suspicious = []
const scanFiles = ['.env.example', '.env.production.example', '.env.local.example', 'vercel.json']
for (const file of scanFiles) {
  if (!exists(file)) continue
  const text = fs.readFileSync(path.join(root, file), 'utf8')
  if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(text)) suspicious.push(`${file}: chave sb_secret_`)
  if (/service_role/i.test(text) && /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(text)) suspicious.push(`${file}: JWT administrativo`)
}
check('Nenhum segredo conhecido', suspicious.length === 0, suspicious.join('; ') || 'nenhum segredo detectado')

const manifest = {
  version: packageJson.version,
  generatedAt: new Date().toISOString(),
  migrations,
  files: ['package.json', 'package-lock.json', 'vercel.json', 'supabase/config.toml', ...migrations.map((name) => `supabase/migrations/${name}`)]
    .filter(exists)
    .map((file) => ({ file, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex') })),
}
fs.writeFileSync(path.join(root, 'PRE-FLIGHT-V100-27.json'), JSON.stringify(manifest, null, 2) + '\n')

for (const item of checks) console.log(`${item.ok ? 'OK' : 'FALHA'} — ${item.name}: ${item.detail}`)
const failed = checks.filter((item) => !item.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} verificações aprovadas.`)
if (failed.length) process.exit(1)
