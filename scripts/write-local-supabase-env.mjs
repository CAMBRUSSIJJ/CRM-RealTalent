import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
let output = ''
try {
  output = execFileSync(npx, ['supabase', 'status', '-o', 'env'], { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
} catch (error) {
  const detail = error?.stderr?.toString?.().trim() || error?.message || 'Supabase local indisponível.'
  console.error('Não foi possível ler o Supabase local. Inicie o Docker Desktop e execute npm run supabase:start.')
  console.error(detail)
  process.exit(1)
}

const readValue = (name) => {
  const match = output.match(new RegExp(`^${name}=(?:"([^"]*)"|'([^']*)'|(.*))$`, 'm'))
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim()
}
const apiUrl = readValue('API_URL')
const anonKey = readValue('ANON_KEY')
if (!apiUrl || !anonKey) {
  console.error('O Supabase iniciou, mas API_URL ou ANON_KEY não foram encontrados no status.')
  process.exit(1)
}
const content = [
  '# Gerado automaticamente por npm run env:supabase-local',
  'VITE_DATA_MODE=supabase',
  `VITE_SUPABASE_URL=${apiUrl}`,
  `VITE_SUPABASE_PUBLISHABLE_KEY=${anonKey}`,
  'VITE_APP_NAME=RealTalent CRM Local',
  '',
].join('\n')
fs.writeFileSync(path.join(process.cwd(), '.env.supabase-local'), content)
console.log('Arquivo .env.supabase-local criado com a URL e a chave pública do Supabase local.')
