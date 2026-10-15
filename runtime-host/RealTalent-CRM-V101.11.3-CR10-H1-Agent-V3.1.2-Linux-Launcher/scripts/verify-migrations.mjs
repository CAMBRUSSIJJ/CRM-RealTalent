import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const migrationsDir = path.join(root, 'supabase', 'migrations')
const lockPath = path.join(root, 'supabase', 'migrations.lock.json')

const fail = (message) => {
  console.error(`ERRO: ${message}`)
  process.exitCode = 1
}

if (!fs.existsSync(lockPath)) {
  fail('supabase/migrations.lock.json não foi encontrado.')
} else if (!fs.existsSync(migrationsDir)) {
  fail('supabase/migrations não foi encontrado.')
} else {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'))
  const entries = Array.isArray(lock.migrations) ? lock.migrations : []
  const lockedNames = new Set(entries.map((entry) => entry.name))
  const files = fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()

  for (const entry of entries) {
    if (!entry?.name || !entry?.sha256) {
      fail('O lock contém uma entrada inválida.')
      continue
    }
    const file = path.join(migrationsDir, entry.name)
    if (!fs.existsSync(file)) {
      fail(`Migration registrada no lock não existe: ${entry.name}`)
      continue
    }
    const actual = createHash('sha256').update(fs.readFileSync(file)).digest('hex')
    if (actual !== entry.sha256) fail(`Checksum divergente em ${entry.name}.`)
  }

  for (const name of files) {
    if (!lockedNames.has(name)) fail(`Migration sem checksum no lock: ${name}`)
  }

  if (!process.exitCode) console.log(`Migrations verificadas: ${files.length} arquivo(s), todos com checksum íntegro.`)
}
