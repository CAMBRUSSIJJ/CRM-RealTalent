import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const pkgPath = path.join(root, 'package.json')
const lockPath = path.join(root, 'package-lock.json')
const quiet = process.argv.includes('--quiet')

function fail(message, details = []) {
  if (!quiet) {
    console.error(`LOCKFILE_INVALID: ${message}`)
    for (const detail of details) console.error(` - ${detail}`)
  }
  process.exit(2)
}

if (!fs.existsSync(pkgPath)) fail('package.json não encontrado')
if (!fs.existsSync(lockPath)) fail('package-lock.json não encontrado')

let pkg, lock
try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) } catch { fail('package.json inválido') }
try { lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')) } catch { fail('package-lock.json inválido') }

if (!lock || Number(lock.lockfileVersion || 0) < 2 || !lock.packages || !lock.packages['']) {
  fail('estrutura do package-lock.json incompatível')
}

const groups = ['dependencies', 'devDependencies', 'optionalDependencies']
const missing = []
const mismatched = []
const rootEntry = lock.packages[''] || {}

for (const group of groups) {
  const declared = pkg[group] || {}
  const lockedRoot = rootEntry[group] || {}
  for (const [name, spec] of Object.entries(declared)) {
    if (lockedRoot[name] !== spec) {
      mismatched.push(`${group}.${name}: package=${spec} lock-root=${lockedRoot[name] ?? '<ausente>'}`)
    }
    const entry = lock.packages[`node_modules/${name}`]
    if (!entry || !entry.version) {
      missing.push(`${name}@${spec}`)
      continue
    }
    // Todas as dependências deste projeto são pinadas. Para protocolos especiais,
    // apenas a presença é verificada.
    if (/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(spec)) && entry.version !== spec) {
      mismatched.push(`${name}: package=${spec} lock-entry=${entry.version}`)
    }
  }
}

if (missing.length || mismatched.length) {
  fail('package.json e package-lock.json não estão sincronizados', [
    ...missing.map((x) => `missing ${x}`),
    ...mismatched.map((x) => `mismatch ${x}`),
  ])
}

if (!quiet) console.log('LOCKFILE_OK: package.json e package-lock.json sincronizados')
