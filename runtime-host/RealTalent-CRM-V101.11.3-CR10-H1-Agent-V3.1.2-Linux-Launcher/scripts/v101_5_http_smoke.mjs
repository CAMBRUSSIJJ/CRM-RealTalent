import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const pkg = JSON.parse(read('package.json'))
const expectedHealth = JSON.parse(read('public/health.json'))
const expectedRuntime = JSON.parse(read('public/runtime-version.json'))
const sourceIndex = read('index.html')
const sourceTitle = sourceIndex.match(/<title>([^<]+)<\/title>/i)?.[1] ?? `RealTalent CRM V${pkg.version}`
const port = Number(process.env.REALTALENT_SMOKE_PORT || 4198)
const bin = path.join(root, 'node_modules', '.bin', 'vite')
const label = `HTTP smoke V${pkg.version}`

if (!fs.existsSync(bin)) {
  console.error(`${label}: Vite não instalado.`)
  process.exit(1)
}
if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error(`${label}: dist ausente. Execute npm run build.`)
  process.exit(1)
}

const child = spawn(bin, ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env },
})
let stderr = ''
child.stderr.on('data', (chunk) => { stderr += String(chunk) })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const stop = () => { if (!child.killed) child.kill('SIGTERM') }
process.on('exit', stop)

async function get(pathname) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { redirect: 'manual' })
  if (!response.ok) throw new Error(`${pathname} respondeu HTTP ${response.status}`)
  return { response, text: await response.text() }
}

try {
  let ready = false
  let last = null
  for (let i = 0; i < 40; i += 1) {
    if (child.exitCode !== null) throw new Error(`vite preview encerrou ${child.exitCode}: ${stderr}`)
    try {
      const { text } = await get('/')
      if (text.includes(sourceTitle)) {
        ready = true
        break
      }
    } catch (error) {
      last = error
    }
    await sleep(250)
  }
  if (!ready) throw last || new Error('servidor não ficou pronto em 10s')

  const index = (await get('/')).text
  if (index.includes('Carregando RealTalent CRM') || index.includes('esm.sh') || !index.includes(sourceTitle)) {
    throw new Error(`release incorreta/legada servida; esperado: ${sourceTitle}`)
  }

  const health = JSON.parse((await get('/health.json')).text)
  const runtime = JSON.parse((await get('/runtime-version.json')).text)
  if (health.version!==pkg.version || health.release!==expectedHealth.release) {
    throw new Error(`health ${health.version}/${health.release}`)
  }
  if (runtime.version!==pkg.version || runtime.channel!==expectedRuntime.channel || runtime.default_port!==expectedRuntime.default_port || runtime.connect_port!==expectedRuntime.connect_port) {
    throw new Error(`runtime ${runtime.version}/${runtime.channel}/${runtime.default_port}/${runtime.connect_port}`)
  }

  await get('/boot-guard.js')
  const refs = [...index.matchAll(/(?:src|href)=["']([^"']*assets\/[^"']+)["']/g)].map((match) => match[1])
  if (!refs.length) throw new Error('nenhum asset Vite referenciado')
  for (const ref of refs.slice(0, 6)) await get(ref.startsWith('/') ? ref : `/${ref.replace(/^\.\//, '')}`)

  console.log(`${label}: OK em 127.0.0.1:${port} (${refs.length} assets).`)
  stop()
} catch (error) {
  stop()
  console.error(`${label}: FALHOU — ${error instanceof Error ? error.message : String(error)}`)
  if (stderr.trim()) console.error(stderr.trim())
  process.exit(1)
}
