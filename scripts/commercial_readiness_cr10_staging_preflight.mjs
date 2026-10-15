const required = [
  'SUPABASE_ACCESS_TOKEN','SUPABASE_DB_PASSWORD','CR10_PROJECT_REF',
  'CR10_SUPABASE_URL','CR10_SUPABASE_PUBLISHABLE_KEY','CR10_SUPABASE_SERVICE_ROLE_KEY',
  'CR10_WORKSPACE_NAME','CR10_ADMIN_EMAIL','CR10_ADMIN_PASSWORD',
  'CR10_MANAGER_EMAIL','CR10_MANAGER_PASSWORD','CR10_SELLER_EMAIL','CR10_SELLER_PASSWORD',
]
const missing = required.filter((k) => !String(process.env[k] || '').trim())
const fail = (m) => { console.error(`CR10 PREFLIGHT BLOCKED: ${m}`); process.exit(2) }
if (missing.length) fail(`faltam variáveis: ${missing.join(', ')}`)
const url = new URL(process.env.CR10_SUPABASE_URL)
if (url.protocol !== 'https:') fail('CR10_SUPABASE_URL precisa usar HTTPS.')
if (!/\.supabase\.(co|net)$/i.test(url.hostname) && process.env.CR10_ALLOW_CUSTOM_SUPABASE_HOST !== '1') fail('host Supabase inesperado; defina CR10_ALLOW_CUSTOM_SUPABASE_HOST=1 somente para self-hosted controlado.')
if (process.env.CR10_SUPABASE_SERVICE_ROLE_KEY === process.env.CR10_SUPABASE_PUBLISHABLE_KEY) fail('service_role e publishable key não podem ser iguais.')
for (const k of ['CR10_ADMIN_PASSWORD','CR10_MANAGER_PASSWORD','CR10_SELLER_PASSWORD']) if (String(process.env[k]).length < 12) fail(`${k} deve ter pelo menos 12 caracteres.`)
const emails = ['CR10_ADMIN_EMAIL','CR10_MANAGER_EMAIL','CR10_SELLER_EMAIL'].map((k) => String(process.env[k]).toLowerCase())
if (new Set(emails).size !== 3 || emails.some((v) => !v.includes('@'))) fail('Admin/Gestor/Vendedor precisam de e-mails válidos e distintos.')
if (!/^[a-z0-9]{8,40}$/i.test(process.env.CR10_PROJECT_REF)) fail('CR10_PROJECT_REF inválido.')
console.log('CR10 PREFLIGHT PASS: configuração de staging presente, HTTPS, perfis distintos e segredos separados.')
