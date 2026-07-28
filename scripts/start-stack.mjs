import { execFileSync, spawnSync } from 'node:child_process'

const run = (command, args, options = {}) => {
  const executable = process.platform === 'win32' && command === 'npx' ? 'npx.cmd' : process.platform === 'win32' && command === 'npm' ? 'npm.cmd' : command
  const result = spawnSync(executable, args, { cwd: process.cwd(), stdio: 'inherit', ...options })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

try {
  execFileSync('docker', ['info'], { stdio: 'ignore' })
} catch {
  console.error('Docker Desktop não está ativo. Abra o Docker Desktop antes de iniciar o Supabase local.')
  process.exit(1)
}

run('npx', ['supabase', 'start'])
run('node', ['scripts/write-local-supabase-env.mjs'])
console.log('Supabase local pronto. O CRM será aberto em modo online local.')
run('npm', ['run', 'dev:supabase'])
