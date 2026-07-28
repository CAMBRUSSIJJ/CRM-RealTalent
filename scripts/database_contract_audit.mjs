import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const releaseLabel = `V${packageJson.version.replace(/\.0$/, '').replaceAll('.', '-')}`
const directory = path.join(root, 'supabase/migrations')
const failures = []
const warnings = []
const names = fs.readdirSync(directory).filter((name) => name.endsWith('.sql')).sort()
const exceptions = JSON.parse(fs.readFileSync(path.join(root, 'supabase/migration-exceptions.json'), 'utf8'))
const lock = JSON.parse(fs.readFileSync(path.join(root, 'supabase/migrations.lock.json'), 'utf8'))
const lockMap = new Map(lock.migrations.map((item) => [item.name, item.sha256]))

const timestamps = new Set()
let aggregate = ''
for (const name of names) {
  if (!/^\d{12}_[a-z0-9_]+\.sql$/.test(name)) failures.push(`${name}: nome fora do padrão YYYYMMDDHHMM_descricao.sql`)
  const timestamp = name.slice(0, 12)
  if (timestamps.has(timestamp)) failures.push(`${name}: timestamp duplicado`)
  timestamps.add(timestamp)
  const text = fs.readFileSync(path.join(directory, name), 'utf8')
  aggregate += `\n${text}`
  const hash = crypto.createHash('sha256').update(text).digest('hex')
  if (!lockMap.has(name)) failures.push(`${name}: migration nova sem atualização explícita do lock`)
  else if (lockMap.get(name) !== hash) failures.push(`${name}: migration histórica alterada após o lock`)
  const hasTransaction = /^\s*begin\s*;/im.test(text) && /^\s*commit\s*;/im.test(text)
  if (!hasTransaction && !exceptions.nonTransactional[name]) failures.push(`${name}: migration sem transação e sem exceção documentada`)
  if (!hasTransaction && exceptions.nonTransactional[name]) warnings.push(`${name}: exceção não transacional — ${exceptions.nonTransactional[name]}`)
}
for (const locked of lock.migrations) if (!names.includes(locked.name)) failures.push(`${locked.name}: migration removida após o lock`)

const tables = [...aggregate.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-zA-Z0-9_]+)/gi)].map((match) => match[1])
for (const table of [...new Set(tables)]) {
  const rls = new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i')
  if (!rls.test(aggregate)) failures.push(`public.${table}: RLS não habilitado`)
}

for (const match of aggregate.matchAll(/create\s+or\s+replace\s+function\s+public\.([a-zA-Z0-9_]+)[\s\S]*?\$\$\s*language\s+plpgsql([^;]*);/gi)) {
  const [, name, tail] = match
  if (/security\s+definer/i.test(tail) && !/set\s+search_path/i.test(tail)) failures.push(`função ${name}: SECURITY DEFINER sem search_path explícito`)
}

if (/grant\s+execute[\s\S]*?service_role[\s\S]*?to\s+anon/i.test(aggregate)) failures.push('grant administrativo indevido para anon detectado')

const report = { passed: failures.length === 0, migrations: names.length, publicTables: [...new Set(tables)].length, failures, warnings }
fs.writeFileSync(path.join(root, `DATABASE-AUDIT-${releaseLabel}.json`), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
if (failures.length) process.exit(1)
