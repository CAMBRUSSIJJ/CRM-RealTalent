import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const root = process.cwd()
const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || ''
if (!databaseUrl) throw new Error('Defina SUPABASE_DB_URL ou DATABASE_URL.')
const parsed = new URL(databaseUrl)
const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
const user = decodeURIComponent(parsed.username)
const password = decodeURIComponent(parsed.password)
if (!parsed.hostname || !database || !user) throw new Error('URL PostgreSQL inválida.')
const port = parsed.port || '5432'
const pgpass = path.join(os.tmpdir(), `realtalent-pgpass-${process.pid}-${Date.now()}`)
const escapePgpass = (value) => value.replaceAll('\\', '\\\\').replaceAll(':', '\\:')
fs.writeFileSync(pgpass, `${escapePgpass(parsed.hostname)}:${escapePgpass(port)}:${escapePgpass(database)}:${escapePgpass(user)}:${escapePgpass(password)}\n`, { mode: 0o600 })
const backupDir = path.resolve(process.env.BACKUP_DIR || path.join(root, 'backups'))
fs.mkdirSync(backupDir, { recursive: true })
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
const mode = (process.env.BACKUP_MODE || 'safe').toLowerCase()
if (!['safe','technical'].includes(mode)) throw new Error('BACKUP_MODE deve ser safe ou technical.')
if (mode === 'technical' && process.env.ALLOW_SENSITIVE_BACKUP !== 'true') throw new Error('Backup técnico contém credenciais criptografadas. Defina ALLOW_SENSITIVE_BACKUP=true em ambiente restrito.')
const sensitiveTables = [
  'public.integration_token_vault',
  'public.integration_credentials',
  'public.integration_oauth_states',
  'public.automation_webhooks',
  'public.organization_invites',
  'public.extension_ingest_tokens',
  'public.communication_webhook_subscriptions',
]
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
const file = path.join(backupDir, `realtalent-${version}-${mode}-${timestamp}.dump`)
const env = { ...process.env, PGPASSFILE: pgpass, PGSSLMODE: parsed.searchParams.get('sslmode') || process.env.PGSSLMODE || 'require' }
try {
  const args = ['--format=custom','--no-owner','--no-privileges','--host',parsed.hostname,'--port',port,'--username',user,'--dbname',database,'--file',file]
  if (mode === 'safe') for (const table of sensitiveTables) args.push(`--exclude-table-data=${table}`)
  const result = spawnSync('pg_dump', args, { stdio: 'inherit', env })
  if (result.error?.code === 'ENOENT') throw new Error('pg_dump não foi encontrado. Instale o cliente PostgreSQL.')
  if (result.status !== 0) throw new Error(`pg_dump falhou com código ${result.status}.`)
} finally { fs.rmSync(pgpass, { force: true }) }
const sha256 = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const manifest = { application:'RealTalent CRM', version, backupMode:mode, containsSensitiveCredentials:mode === 'technical', excludedSensitiveTables:mode === 'safe' ? sensitiveTables : [], createdAt:new Date().toISOString(), file:path.basename(file), bytes:fs.statSync(file).size, sha256, databaseHost:parsed.hostname }
fs.writeFileSync(`${file}.json`, JSON.stringify(manifest,null,2)+'\n')
console.log(JSON.stringify(manifest,null,2))
