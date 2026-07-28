import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const readArg = (name) => {
  const direct = args.find((item) => item.startsWith(`${name}=`))
  if (direct) return direct.slice(name.length + 1)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : ''
}
const projectRef = readArg('--project-ref') || process.env.SUPABASE_PROJECT_REF || ''
const dbPassword = process.env.SUPABASE_DB_PASSWORD || ''
const accessToken = process.env.SUPABASE_ACCESS_TOKEN || ''
const cronSecret = process.env.AUTOMATION_CRON_SECRET || ''
const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || ''
const webhookCronSecret = process.env.AUTOMATION_WEBHOOK_CRON_SECRET || ''

if (!/^[a-z0-9]{20}$/.test(projectRef)) {
  console.error('Informe SUPABASE_PROJECT_REF ou use --project-ref com o identificador de 20 caracteres do projeto.')
  process.exit(1)
}
if (!accessToken) {
  console.error('Defina SUPABASE_ACCESS_TOKEN no terminal antes do deploy.')
  process.exit(1)
}
if (!dbPassword) {
  console.error('Defina SUPABASE_DB_PASSWORD no terminal antes do deploy.')
  process.exit(1)
}
if (!googleMapsApiKey) {
  console.error('Defina GOOGLE_MAPS_API_KEY para ativar a geocodificação real.')
  process.exit(1)
}
if (cronSecret.length < 32) {
  console.error('Defina AUTOMATION_CRON_SECRET com pelo menos 32 caracteres. Use sempre o mesmo segredo nos redeploys e no agendador.')
  process.exit(1)
}
if (webhookCronSecret.length < 32) {
  console.error('Defina AUTOMATION_WEBHOOK_CRON_SECRET com pelo menos 32 caracteres para a fila de webhooks.')
  process.exit(1)
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const run = (commandArgs) => {
  console.log(`\n> supabase ${commandArgs.join(' ')}`)
  const result = spawnSync(npx, ['supabase', ...commandArgs], { cwd: process.cwd(), stdio: 'inherit', env: { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken } })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run(['link', '--project-ref', projectRef, '--password', dbPassword])
run(['db', 'push', '--linked', '--include-all', '--yes'])
run(['secrets', 'set', `AUTOMATION_CRON_SECRET=${cronSecret}`, `AUTOMATION_WEBHOOK_CRON_SECRET=${webhookCronSecret}`, `GOOGLE_MAPS_API_KEY=${googleMapsApiKey}`, '--project-ref', projectRef])
const functionNames = fs.readdirSync(path.join(process.cwd(), 'supabase', 'functions'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
if (!functionNames.length) { console.error('Nenhuma Edge Function versionada foi encontrada.'); process.exit(1) }
run(['functions', 'deploy', ...functionNames, '--project-ref', projectRef, '--use-api'])
console.log('\nDeploy do Supabase concluído. Configure os agendadores com os mesmos segredos AUTOMATION_CRON_SECRET e AUTOMATION_WEBHOOK_CRON_SECRET armazenados no ambiente protegido.')
