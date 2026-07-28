import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const failures = []
const warnings = []
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const shortVersion = packageJson.version.replace(/\.0$/, '')
const label = `V${shortVersion}`

async function walk(directory) {
  const output = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) output.push(...await walk(file))
    else output.push(file)
  }
  return output
}

const sourceFiles = (await walk(join(root, 'src'))).filter((file) => /\.(ts|tsx|css)$/.test(file))
for (const file of sourceFiles) {
  const text = await readFile(file, 'utf8')
  const relative = file.slice(root.length + 1)
  for (const [description, pattern] of [
    ['marcador pendente', /\b(TODO|FIXME|HACK|XXX)\b/],
    ['HTML inseguro', /dangerouslySetInnerHTML|\beval\s*\(|new Function\s*\(/],
    ['versão antiga ativa', /CRM V100\.(16|17|18)|Diagnóstico V100\.(16|17|18)|compatível com a V100\.(16|17|18)/],
  ]) if (pattern.test(text)) failures.push(`${relative}: ${description}`)
}

const vercel = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8'))
const serializedHeaders = JSON.stringify(vercel.headers ?? [])
for (const header of ['Content-Security-Policy', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy']) {
  if (!serializedHeaders.includes(header)) failures.push(`vercel.json: cabeçalho ${header} ausente`)
}

const indexHtml = await readFile(join(root, 'index.html'), 'utf8')
if (!indexHtml.includes(`RealTalent CRM ${label}`)) failures.push(`index.html: título ${label} ausente`)

for (const required of [
  'src/features/settings/integration-center.tsx',
  'src/services/commercial-action-engine.ts',
  'src/services/lead-scoring.ts',
  'src/services/automation-webhooks.ts',
  'src/services/commercial-structure.ts',
  'src/features/settings/integration-framework-panel.tsx',
  'src/services/integration-framework.ts',
  'src/features/settings/extension-center-panel.tsx',
  'extension-sdk/realtalent-extension-client.ts',
  'supabase/migrations/202607270001_v100_40_extension_center.sql',
  'supabase/functions/extension-register/index.ts',
  'supabase/functions/extension-ingest/index.ts',
  'supabase/functions/automation-runner/index.ts',
  'supabase/functions/geocode-lead/index.ts',
  'supabase/functions/automation-webhook-dispatch/index.ts',
  'scripts/source_of_truth_guard.mjs',
  'scripts/architecture_guard.mjs',
  'scripts/database_contract_audit.mjs',
  'supabase/migrations.lock.json',
  'supabase/migrations/202607230002_v100_38_commercial_structure_data_quality.sql',
  'supabase/migrations/202607230003_v100_39_integration_framework.sql',
  'supabase/functions/integration-oauth-start/index.ts',
  'supabase/functions/integration-oauth-callback/index.ts',
  'supabase/functions/integration-sync-worker/index.ts',
  'supabase/migrations/202607280002_v100_45_integration_foundation.sql',
  'supabase/functions/integration-google-worker/index.ts',
  'supabase/functions/integration-microsoft-worker/index.ts',
  'supabase/functions/integration-meta-worker/index.ts',
  'supabase/functions/integration-whatsapp-worker/index.ts',
  'supabase/functions/integration-token-worker/index.ts',
  'supabase/functions/integration-health-worker/index.ts',
  'supabase/functions/integration-maintenance-worker/index.ts',
  'supabase/functions/integration-account-test/index.ts',
  'supabase/functions/integration-account-revoke/index.ts',
  'supabase/functions/integration-diagnostics/index.ts',
  'supabase/functions/gmail-pubsub-webhook/index.ts',
  'supabase/functions/_shared/integration-runtime.ts',
  'scripts/integration_foundation_audit.mjs',
  'docs/FUNDACAO-INTEGRACOES-V100-45.md',
  'supabase/migrations/202607280003_v100_46_google_microsoft.sql',
  'scripts/google_microsoft_audit.mjs',
  'docs/GOOGLE-MICROSOFT-V100-46.md',
  'docs/OPERACAO-PRODUCAO-V100-46.md',
  'docs/PLANO-HOMOLOGACAO-V100-46.md',
  'src/services/communications-v10046.test.ts',
  'src/features/proposals/proposals-page.tsx',
  'src/services/revenue-forecast.ts',
  'supabase/migrations/202607270004_v100_43_proposals_forecast.sql',
  'docs/PROPOSTAS-FORECAST-V100-43.md',
  'docs/PLANO-HOMOLOGACAO-V100-43.md',
  'docs/OPERACAO-PRODUCAO-V100-43.md',
  'docs/ARQUITETURA-COMERCIAL-V100-44.md',
  'docs/BACKUP-SEGURO-V100-44.md',
  'docs/FONTE-OFICIAL-V100-44.md',
  'supabase/migrations/202607280001_v100_44_commercial_consolidation.sql',
  'src/features/communications/communications-page.tsx',
  'src/services/communications.ts',
  'supabase/migrations/202607270003_v100_42_official_communications.sql',
  'supabase/functions/official-communication-send/index.ts',
  'supabase/functions/communication-dispatch-worker/index.ts',
  'supabase/functions/communication-sync-worker/index.ts',
  'supabase/functions/google-communications-webhook/index.ts',
  'supabase/functions/microsoft-communications-webhook/index.ts',
  'supabase/functions/whatsapp-webhook/index.ts',
  'supabase/migrations/202607270002_v100_41_production_observability.sql',
  'supabase/functions/client-diagnostics/index.ts',
  'scripts/e2e_staging.py',
  'scripts/tenant_isolation_test.py',
  'scripts/backup_database.mjs',
  'scripts/restore_database.mjs',
  '.github/workflows/deploy-staging.yml',
  '.github/workflows/promote-production.yml',
  'docs/PLANO-HOMOLOGACAO-V100-42.md',
  'docs/OPERACAO-PRODUCAO-V100-42.md',
  'docs/COMUNICACOES-OFICIAIS-V100-42.md',
  'docs/PLANO-HOMOLOGACAO-V100-42.md',
  'supabase/tests/homologation_contracts.sql',
]) {
  try { await stat(join(root, required)) } catch { failures.push(`${required}: arquivo obrigatório ausente`) }
}

for (const file of sourceFiles) {
  const text = await readFile(file, 'utf8')
  if (/SUPABASE_SERVICE_ROLE_KEY|rt_live_[a-zA-Z0-9]/.test(text)) failures.push(`${file.slice(root.length + 1)}: segredo de servidor exposto no frontend`)
}

const distAssets = join(root, 'dist', 'assets')
try {
  for (const name of await readdir(distAssets)) {
    const size = (await stat(join(distAssets, name))).size
    if (size > 900_000) warnings.push(`asset ${name} possui ${(size / 1024).toFixed(1)} KB`)
  }
} catch { warnings.push('dist ainda não foi gerado; auditoria de tamanho ignorada') }

if (failures.length) {
  console.error(JSON.stringify({ passed: false, version: packageJson.version, failures, warnings }, null, 2))
  process.exit(1)
}
console.log(JSON.stringify({ passed: true, version: packageJson.version, checks: sourceFiles.length, warnings }, null, 2))
