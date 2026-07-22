import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const failures = []
const warnings = []

async function walk(directory) {
  const output = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) output.push(...await walk(path))
    else output.push(path)
  }
  return output
}

const sourceFiles = (await walk(join(root, 'src'))).filter((file) => /\.(ts|tsx|css)$/.test(file))
for (const file of sourceFiles) {
  const text = await readFile(file, 'utf8')
  const relative = file.slice(root.length + 1)
  for (const [label, pattern] of [
    ['marcador pendente', /\b(TODO|FIXME|HACK|XXX)\b/],
    ['HTML inseguro', /dangerouslySetInnerHTML|\beval\s*\(|new Function\s*\(/],
    ['versão antiga ativa', /CRM V100\.(16|17|18)|Diagnóstico V100\.(16|17|18)|compatível com a V100\.(16|17|18)/],
  ]) if (pattern.test(text)) failures.push(`${relative}: ${label}`)
}

const vercel = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8'))
const serializedHeaders = JSON.stringify(vercel.headers ?? [])
for (const header of ['Content-Security-Policy', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy']) {
  if (!serializedHeaders.includes(header)) failures.push(`vercel.json: cabeçalho ${header} ausente`)
}

const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
if (packageJson.version !== '100.29.0') failures.push(`package.json: versão ${packageJson.version} diferente de 100.29.0`)
const indexHtml = await readFile(join(root, 'index.html'), 'utf8')
if (!indexHtml.includes('RealTalent CRM V100.29')) failures.push('index.html: título da versão V100.29 ausente')

for (const required of [
  'src/features/settings/integration-center.tsx',
  'src/services/integration-workspace.ts',
  'supabase/migrations/202607190007_v100_23_integration_hub.sql',
  'supabase/migrations/202607190008_v100_24_extension_delivery.sql',
  'supabase/migrations/202607190009_v100_25_sales_automation.sql',
  'supabase/migrations/202607190010_v100_26_reliability.sql',
  'supabase/functions/extension-ingest/index.ts',
  'supabase/functions/automation-runner/index.ts',
  'src/services/automation-operations.ts',
]) {
  try { await stat(join(root, required)) } catch { failures.push(`${required}: arquivo obrigatório ausente`) }
}
const browserSource = sourceFiles.map(async (file) => ({ file, text: await readFile(file, 'utf8') }))
for (const entry of await Promise.all(browserSource)) {
  if (/SUPABASE_SERVICE_ROLE_KEY|rt_live_[a-zA-Z0-9]/.test(entry.text)) failures.push(`${entry.file.slice(root.length + 1)}: segredo de servidor exposto no frontend`)
}

const distAssets = join(root, 'dist', 'assets')
try {
  for (const name of await readdir(distAssets)) {
    const size = (await stat(join(distAssets, name))).size
    if (size > 500_000) warnings.push(`asset ${name} possui ${(size / 1024).toFixed(1)} KB`)
  }
} catch { warnings.push('dist ainda não foi gerado; auditoria de tamanho ignorada') }

if (failures.length) {
  console.error(JSON.stringify({ passed: false, failures, warnings }, null, 2))
  process.exit(1)
}
console.log(JSON.stringify({ passed: true, checks: sourceFiles.length, warnings }, null, 2))
