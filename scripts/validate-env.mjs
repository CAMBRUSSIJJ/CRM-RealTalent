import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const parseEnv = (file) => {
  if (!fs.existsSync(file)) return {}
  const result = {}
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const index = line.indexOf('=')
    if (index < 1) continue
    const key = line.slice(0, index).trim()
    let value = line.slice(index + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    result[key] = value
  }
  return result
}

const values = {
  ...parseEnv(path.join(root, '.env')),
  ...parseEnv(path.join(root, '.env.local')),
  ...process.env,
}

const mode = String(values.VITE_DATA_MODE ?? 'auto').trim()
const url = String(values.VITE_SUPABASE_URL ?? '').trim()
const key = String(values.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()
const errors = []
const warnings = []

if (!['local', 'supabase', 'auto'].includes(mode)) errors.push('VITE_DATA_MODE deve ser local, supabase ou auto.')
const hostedBuild = String(values.VERCEL ?? '') === '1' || String(values.CI_PRODUCTION ?? '') === '1'
if (hostedBuild && mode !== 'supabase') errors.push('Build hospedado exige VITE_DATA_MODE=supabase para impedir publicação acidental em modo local.')
const intendsSupabase = mode === 'supabase' || (mode === 'auto' && Boolean(url || key))
if (intendsSupabase) {
  if (!url || /SEU-PROJETO|localhost:3000/i.test(url)) errors.push('VITE_SUPABASE_URL está ausente ou ainda contém um valor de exemplo.')
  else {
    try {
      const parsed = new URL(url)
      const local = ['127.0.0.1', 'localhost'].includes(parsed.hostname)
      if (parsed.protocol !== 'https:' && !local) errors.push('VITE_SUPABASE_URL deve usar HTTPS fora do ambiente local.')
    } catch { errors.push('VITE_SUPABASE_URL não é uma URL válida.') }
  }
  if (!key || /SUBSTITUA|SUA_CHAVE|CHAVE_ANON/i.test(key)) errors.push('VITE_SUPABASE_PUBLISHABLE_KEY está ausente ou ainda contém um valor de exemplo.')
  if (/^sb_secret_/i.test(key)) errors.push('Uma chave secreta foi colocada no frontend. Use somente a chave publicável.')
  if (key.split('.').length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'))
      if (payload?.role === 'service_role') errors.push('A chave service_role não pode ser usada no frontend.')
    } catch { warnings.push('Não foi possível inspecionar o formato da chave pública; confirme-a no painel do Supabase.') }
  }
}
if (mode === 'local') warnings.push('Modo local ativo: os dados ficam somente no navegador e não são compartilhados com a equipe.')

console.log('RealTalent CRM — validação de ambiente')
console.log(`Modo: ${mode}`)
for (const warning of warnings) console.log(`AVISO: ${warning}`)
for (const error of errors) console.error(`ERRO: ${error}`)
if (errors.length) process.exit(1)
console.log('Ambiente válido.')
