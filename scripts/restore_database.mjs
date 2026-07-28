import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const target = process.env.RESTORE_DATABASE_URL || ''
const backup = path.resolve(process.env.BACKUP_FILE || '')
if (!target) throw new Error('Defina RESTORE_DATABASE_URL para um banco vazio de homologação.')
if (!backup || !fs.existsSync(backup)) throw new Error('Defina BACKUP_FILE para um arquivo .dump existente.')
if (/prod|production/i.test(target) && process.env.ALLOW_PRODUCTION_RESTORE !== 'true') throw new Error('Restauração em destino com indicação de produção foi bloqueada.')
const parsed = new URL(target)
const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
const user = decodeURIComponent(parsed.username)
const password = decodeURIComponent(parsed.password)
if (!parsed.hostname || !database || !user) throw new Error('RESTORE_DATABASE_URL inválida.')
const port = parsed.port || '5432'
const manifestPath = `${backup}.json`
if (!fs.existsSync(manifestPath)) throw new Error('Manifesto de checksum não encontrado ao lado do backup.')
const manifest = JSON.parse(fs.readFileSync(manifestPath,'utf8'))
const actual = crypto.createHash('sha256').update(fs.readFileSync(backup)).digest('hex')
if (actual !== manifest.sha256) throw new Error('Checksum do backup não confere; restauração cancelada.')
const escapePgpass = (value) => value.replaceAll('\\', '\\').replaceAll(':', '\:')
const pgpass = path.join(os.tmpdir(), `realtalent-pgpass-${process.pid}-${Date.now()}`)
fs.writeFileSync(pgpass, `${escapePgpass(parsed.hostname)}:${escapePgpass(port)}:${escapePgpass(database)}:${escapePgpass(user)}:${escapePgpass(password)}\n`, { mode: 0o600 })
const env = { ...process.env, PGPASSFILE: pgpass, PGSSLMODE: parsed.searchParams.get('sslmode') || process.env.PGSSLMODE || 'require' }
try {
  const args=['--clean','--if-exists','--no-owner','--no-privileges','--exit-on-error','--host',parsed.hostname,'--port',port,'--username',user,'--dbname',database,backup]
  const result = spawnSync('pg_restore', args, { stdio:'inherit', env })
  if (result.error?.code === 'ENOENT') throw new Error('pg_restore não foi encontrado. Instale o cliente PostgreSQL.')
  if (result.status !== 0) throw new Error(`pg_restore falhou com código ${result.status}.`)
} finally { fs.rmSync(pgpass, { force: true }) }
console.log(JSON.stringify({ restored:true, backup:path.basename(backup), sha256:actual, targetHost:parsed.hostname, finishedAt:new Date().toISOString() },null,2))
