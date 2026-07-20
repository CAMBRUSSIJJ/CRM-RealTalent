import { spawnSync } from 'node:child_process'

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
if (cronSecret.length < 32) {
  console.error('Defina AUTOMATION_CRON_SECRET com pelo menos 32 caracteres. Use sempre o mesmo segredo nos redeploys e no agendador.')
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
run(['secrets', 'set', `AUTOMATION_CRON_SECRET=${cronSecret}`, '--project-ref', projectRef])
run(['functions', 'deploy', 'extension-ingest', 'automation-runner', '--project-ref', projectRef, '--use-api'])
console.log('\nDeploy do Supabase concluído. Configure o agendador com o mesmo AUTOMATION_CRON_SECRET armazenado no ambiente protegido.')
