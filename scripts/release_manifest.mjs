import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const shortVersion = packageJson.version.replace(/\.0$/, '')
const releaseFile = `REALTALENT-CRM-V${shortVersion.replaceAll('.', '-')}.html`
const includedRoots = ['src', 'supabase', 'scripts', 'docs', '.github']
const releaseLabel = `V${shortVersion.replaceAll('.', '-')}`
const fixedFiles = ['README.md', 'INICIAR-AQUI.md', 'GUIA-PRODUCAO.md', 'SECURITY.md', '.gitignore', '.nvmrc', '.node-version', '.env.example', '.env.staging.example', '.env.production.example', 'package.json', 'package-lock.json', 'index.html', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'vercel.json', 'public/health.json', releaseFile, `BUILD-CONTINGENCY-${releaseLabel}.json`, `HOMOLOGATION-REPORT-${releaseLabel}.json`, `DATABASE-AUDIT-${releaseLabel}.json`, `SOURCE-SYNTAX-${releaseLabel}.json`, `PRE-FLIGHT-${releaseLabel}.json`, `TESTE-SMOKE-${releaseLabel}.json`, `CORE-FUNCTIONAL-${releaseLabel}.json`, `RELATORIO-HOMOLOGACAO-${releaseLabel}.md`, `CHANGELOG-${releaseLabel}.md`, `PRODUCTION-READINESS-${releaseLabel}.json`, `STAGING-VERIFICATION-${releaseLabel}.json`, `E2E-STAGING-${releaseLabel}.json`, `TENANT-ISOLATION-${releaseLabel}.json`, `BACKUP-RESTORE-DRY-RUN-${releaseLabel}.json`, `BUILD-STATUS-${releaseLabel}.json`, `VALIDACAO-${releaseLabel}.md`, `CONNECT-INTEGRATION-AUDIT-${releaseLabel}.json`, `EXTENSION-CENTER-AUDIT-${releaseLabel}.json`, `INTEGRATION-FOUNDATION-AUDIT-${releaseLabel}.json`, `PORTABLE-HOMOLOGATION-${releaseLabel}.json`, `BUILD-OFFICIAL-${releaseLabel}.json`, `TEST-REPORT-${releaseLabel}.json`, `PRODUCTION-READINESS-${releaseLabel}.json`]
const files = []
const walk = (directory) => {
  if (!fs.existsSync(directory)) return
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const value = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(value)
    else files.push(path.relative(root, value).replaceAll('\\', '/'))
  }
}
for (const directory of includedRoots) walk(path.join(root, directory))
for (const file of fixedFiles) if (fs.existsSync(path.join(root, file))) files.push(file)
const unique = [...new Set(files)].sort()
const entries = unique.map((file) => ({ file, bytes: fs.statSync(path.join(root, file)).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex') }))
const manifest = { application: 'RealTalent CRM', version: packageJson.version, sourceOfTruth: 'React + TypeScript + Vite', generatedAt: new Date().toISOString(), files: entries }
fs.writeFileSync(path.join(root, `RELEASE-MANIFEST-${releaseLabel}.json`), JSON.stringify(manifest, null, 2) + '\n')
console.log(`Manifesto de release criado com ${entries.length} arquivos.`)
