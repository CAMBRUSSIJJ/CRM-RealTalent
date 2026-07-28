import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const failures = []
const warnings = []
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const shortVersion = packageJson.version.replace(/\.0$/, '')
const label = `V${shortVersion}`
const hyphenLabel = label.replaceAll('.', '-')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const exists = (file) => fs.existsSync(path.join(root, file))

const appVersion = read('src/lib/app-version.ts')
if (!appVersion.includes(`APP_VERSION = '${shortVersion}'`)) failures.push('src/lib/app-version.ts não corresponde ao package.json')
if (!appVersion.includes(`APP_VERSION_LABEL = '${label}'`)) failures.push('APP_VERSION_LABEL não corresponde ao package.json')
if (!read('index.html').includes(`RealTalent CRM ${label}`)) failures.push('index.html não identifica a versão oficial')
const health = JSON.parse(read('public/health.json'))
if (health.version !== shortVersion) failures.push('public/health.json não corresponde à versão oficial')

const forbiddenRuntimePatches = fs.readdirSync(path.join(root, 'scripts')).filter((name) => /^v\d+.*runtime-extension\.js$/i.test(name))
if (forbiddenRuntimePatches.length) failures.push(`patches compilados proibidos: ${forbiddenRuntimePatches.join(', ')}`)

for (const name of fs.readdirSync(root)) {
  if (!/^REALTALENT-CRM-V\d+-\d+(?:-standalone)?\.html$/i.test(name)) continue
  const html = read(name)
  const generated = html.includes('GENERATED_FROM_TYPESCRIPT_SOURCE')
  const contingency = html.includes('CONTINGENCY_RUNTIME_EQUIVALENCE') && exists(`BUILD-CONTINGENCY-${hyphenLabel}.json`)
  if (!generated && !contingency) failures.push(`${name} não possui origem verificável`)
  if (contingency) warnings.push(`${name}: artefato de contingência; substitua após npm run homologate`)
  if (!name.includes(hyphenLabel)) failures.push(`${name} pertence a outra versão e não deve estar no pacote atual`)
}

for (const required of [
  `docs/FONTE-OFICIAL-${hyphenLabel}.md`,
  `docs/PLANO-HOMOLOGACAO-${hyphenLabel}.md`,
  `docs/OPERACAO-PRODUCAO-${hyphenLabel}.md`,
  `docs/RECUPERACAO-DESASTRE-${hyphenLabel}.md`,
  'scripts/architecture_guard.mjs',
  'scripts/database_contract_audit.mjs',
  'scripts/release_manifest.mjs',
]) if (!exists(required)) failures.push(`${required} ausente`)

if (failures.length) {
  console.error(JSON.stringify({ passed: false, failures }, null, 2))
  process.exit(1)
}
console.log(JSON.stringify({ passed: true, sourceOfTruth: 'React + TypeScript + Vite', version: packageJson.version, warnings }, null, 2))
