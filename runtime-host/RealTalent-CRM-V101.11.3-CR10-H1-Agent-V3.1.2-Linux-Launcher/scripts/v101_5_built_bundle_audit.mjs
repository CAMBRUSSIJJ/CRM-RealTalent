import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const dist = path.join(root, 'dist')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const pkg = JSON.parse(read('package.json'))
const expectedHealth = JSON.parse(read('public/health.json'))
const expectedRuntime = JSON.parse(read('public/runtime-version.json'))
const sourceIndex = read('index.html')
const sourceTitle = sourceIndex.match(/<title>([^<]+)<\/title>/i)?.[1] ?? `RealTalent CRM V${pkg.version}`
const label = `Bundle audit V${pkg.version}`
const fail = (message) => {
  console.error(`${label}: FALHOU — ${message}`)
  process.exit(1)
}

if (!fs.existsSync(dist)) fail('pasta dist ausente; execute npm run build primeiro')
const indexPath = path.join(dist, 'index.html')
if (!fs.existsSync(indexPath)) fail('dist/index.html ausente')
const html = fs.readFileSync(indexPath, 'utf8')
if (!html.includes(sourceTitle)) fail(`título/versão incorretos no dist; esperado: ${sourceTitle}`)
if (html.includes('Carregando RealTalent CRM')) fail('HTML legado reapareceu')
if (html.includes('esm.sh')) fail('dependência do CDN legado esm.sh detectada')
if (!html.includes('id="root"')) fail('mount #root ausente')

for (const file of ['boot-guard.js', 'health.json', 'runtime-version.json']) {
  if (!fs.existsSync(path.join(dist, file))) fail(`${file} ausente no dist`)
}

const health = JSON.parse(fs.readFileSync(path.join(dist, 'health.json'), 'utf8'))
const runtime = JSON.parse(fs.readFileSync(path.join(dist, 'runtime-version.json'), 'utf8'))
if (health.version!==pkg.version || health.release!==expectedHealth.release) {
  fail(`health.json inválido: ${health.version}/${health.release}; esperado ${pkg.version}/${expectedHealth.release}`)
}
if (runtime.version!==pkg.version || runtime.channel!==expectedRuntime.channel || runtime.default_port!==expectedRuntime.default_port || runtime.connect_port!==expectedRuntime.connect_port) {
  fail(`runtime-version.json inválido: ${runtime.version}/${runtime.channel}/${runtime.default_port}/${runtime.connect_port}`)
}

const refs = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((m) => m[1])
const localRefs = refs.filter((ref) => !ref.startsWith('http:') && !ref.startsWith('https:') && !ref.startsWith('data:') && !ref.startsWith('#'))
for (const ref of localRefs) {
  const clean = ref.split('?')[0].split('#')[0].replace(/^\.\//, '').replace(/^\//, '')
  if (clean && !fs.existsSync(path.join(dist, clean))) fail(`asset referenciado não existe: ${ref}`)
}

const assetsDir = path.join(dist, 'assets')
if (!fs.existsSync(assetsDir)) fail('diretório assets ausente')
const assets = fs.readdirSync(assetsDir)
if (!assets.some((name) => name.endsWith('.js'))) fail('bundle JavaScript ausente')
if (!assets.some((name) => name.endsWith('.css'))) fail('bundle CSS ausente')

console.log(`${label}: OK (${localRefs.length} referências locais; ${assets.length} assets).`)
