import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const root = process.cwd()
const directory = path.join(root, 'supabase/migrations')
const migrations = fs.readdirSync(directory).filter((name) => name.endsWith('.sql')).sort().map((name) => ({
  name,
  sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, name))).digest('hex'),
}))
fs.writeFileSync(path.join(root, 'supabase/migrations.lock.json'), JSON.stringify({ generatedAt: new Date().toISOString(), migrations }, null, 2) + '\n')
console.log(`Lock de ${migrations.length} migrations atualizado.`)
