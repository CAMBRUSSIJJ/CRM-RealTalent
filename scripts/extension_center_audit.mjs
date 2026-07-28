import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const checks = []
const failures = []
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const verify = (label, ok, detail) => {
  checks.push({ label, ok, detail: ok ? 'aprovado' : detail })
  if (!ok) failures.push(`${label}: ${detail}`)
}

const migration = read('supabase/migrations/202607270001_v100_40_extension_center.sql')
for (const table of ['extension_installations','extension_product_settings','extension_capture_jobs','extension_events']) {
  verify(`Tabela ${table}`, new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}`, 'i').test(migration), 'definição ausente')
  verify(`RLS ${table}`, new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i').test(migration), 'RLS ausente')
}
for (const fn of ['register_extension_installation','heartbeat_extension_installation','update_extension_installation_status','save_extension_product_settings','retry_extension_capture_job']) {
  verify(`RPC ${fn}`, migration.includes(`function public.${fn}`), 'RPC ausente')
}
const panel = read('src/features/settings/extension-center-panel.tsx')
verify('Central na interface', panel.includes('Central de Extensões') && panel.includes('Fila central de capturas'), 'painel incompleto')
verify('Controle de instalações', panel.includes('Pausar') && panel.includes('Revogar'), 'ações administrativas ausentes')
verify('Configuração remota', panel.includes('Versão mínima') && panel.includes('Destino padrão'), 'configuração remota incompleta')
const framework = read('src/features/settings/integration-framework-panel.tsx')
verify('Aba Extensões', framework.includes("['extensions','Extensões']") && framework.includes('<ExtensionCenterPanel'), 'aba não conectada ao framework')
const service = read('src/services/integration-framework.ts')
verify('Serviço de extensões', ['loadIntegrationFramework','updateExtensionInstallation','saveExtensionProductSettings','retryExtensionCaptureJob'].every((token) => service.includes(token)), 'contrato frontend incompleto')
const ingest = read('supabase/functions/extension-ingest/index.ts')
verify('Identidade da instalação', ingest.includes('x-rt-installation-id') && ingest.includes('extension_installations'), 'ingestão sem identidade')
verify('Fila idempotente', ingest.includes('extension_capture_jobs') && ingest.includes('captureJobKey'), 'fila de captura ausente')
verify('Compatibilidade de versão', ingest.includes('extension_version_outdated') && ingest.includes('minimumVersion'), 'controle de versão ausente')
const register = read('supabase/functions/extension-register/index.ts')
verify('Registro autenticado', register.includes("action === 'heartbeat'") && register.includes('register_extension_installation'), 'Edge Function incompleta')
verify('SDK TypeScript', fs.existsSync(path.join(root, 'extension-sdk/realtalent-extension-client.ts')), 'SDK ausente')
verify('SDK JavaScript', fs.existsSync(path.join(root, 'extension-sdk/realtalent-extension-client.js')), 'adaptador JavaScript ausente')
const sourceFiles = ['src/features/settings/extension-center-panel.tsx','src/services/integration-framework.ts','extension-sdk/realtalent-extension-client.ts']
for (const file of sourceFiles) {
  const text = read(file)
  verify(`Sem segredo em ${file}`, !/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|rt_live_[A-Za-z0-9_-]{12,}/.test(text), 'segredo encontrado')
}
const packageJson = JSON.parse(read('package.json'))
const releaseLabel = `V${packageJson.version.replace(/\.0$/, '').replaceAll('.', '-')}`
const report = { passed: failures.length === 0, version: packageJson.version, checks, failures }
fs.writeFileSync(path.join(root, `EXTENSION-CENTER-AUDIT-${releaseLabel}.json`), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
if (failures.length) process.exit(1)
