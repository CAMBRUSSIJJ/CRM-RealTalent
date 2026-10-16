import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const statusFile = process.env.RT_LOCAL_SUPABASE_STATUS_FILE || path.join(root, '.supabase-local-status.env')
const qaPassword = process.env.RT_LOCAL_QA_PASSWORD || 'RealTalentQA2026Local'

const unquote = (value = '') => {
  const trimmed = String(value).trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

const parseEnv = (text) => Object.fromEntries(
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const idx = line.indexOf('=')
      return [line.slice(0, idx).trim(), unquote(line.slice(idx + 1))]
    }),
)

const statusText = await fs.readFile(statusFile, 'utf8').catch(() => '')
if (!statusText) {
  console.error(`LOCAL STAGING BLOCKED: arquivo de status não encontrado: ${statusFile}`)
  process.exit(2)
}

const local = parseEnv(statusText)
const apiUrl = local.API_URL || local.SUPABASE_URL
const anonKey = local.ANON_KEY || local.PUBLISHABLE_KEY || local.SUPABASE_ANON_KEY || local.SUPABASE_PUBLISHABLE_KEY
const serviceRoleKey = local.SERVICE_ROLE_KEY || local.SECRET_KEY || local.SUPABASE_SERVICE_ROLE_KEY || local.SUPABASE_SECRET_KEY

if (!apiUrl || !anonKey || !serviceRoleKey) {
  console.error('LOCAL STAGING BLOCKED: status do Supabase local não contém API_URL, ANON/PUBLISHABLE_KEY e SERVICE_ROLE/SECRET_KEY.')
  process.exit(2)
}

let parsedUrl
try {
  parsedUrl = new URL(apiUrl)
} catch {
  console.error('LOCAL STAGING BLOCKED: API_URL inválida.')
  process.exit(2)
}

if (!['127.0.0.1', 'localhost', '::1'].includes(parsedUrl.hostname)) {
  console.error(`LOCAL STAGING BLOCKED: recusando endpoint não local (${parsedUrl.hostname}).`)
  console.error('Este bootstrap nunca deve ser executado contra Supabase hospedado/produção.')
  process.exit(3)
}

const request = async (pathname, { method = 'GET', body, token = serviceRoleKey, prefer } = {}) => {
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  if (prefer) headers.Prefer = prefer
  const response = await fetch(`${apiUrl.replace(/\/$/, '')}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!response.ok) {
    const detail = data?.message || data?.msg || data?.error_description || data?.error || String(data).slice(0, 300)
    throw new Error(`${method} ${pathname}: ${response.status} ${detail}`)
  }
  return data
}

const listUsers = async () => {
  const result = await request('/auth/v1/admin/users?page=1&per_page=1000')
  return Array.isArray(result) ? result : (result?.users || [])
}

const ensureUser = async ({ email, name }) => {
  const users = await listUsers()
  const existing = users.find((user) => String(user.email || '').toLowerCase() === email.toLowerCase())
  if (existing) return existing
  return request('/auth/v1/admin/users', {
    method: 'POST',
    body: {
      email,
      password: qaPassword,
      email_confirm: true,
      user_metadata: { full_name: name },
      app_metadata: { staging: true, local_only: true },
    },
  })
}

const login = async (email) => {
  const response = await fetch(`${apiUrl.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password: qaPassword }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.access_token || !data?.user) {
    throw new Error(`login QA falhou para ${email}: ${response.status} ${data?.message || data?.error_description || ''}`)
  }
  return data
}

const rest = async (table, { method = 'GET', query = '', body, prefer = 'return=representation' } = {}) => {
  const suffix = query ? `?${query}` : ''
  return request(`/rest/v1/${table}${suffix}`, { method, body, prefer })
}

const rpc = async (name, body, token) => {
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  const response = await fetch(`${apiUrl.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const text = await response.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!response.ok) throw new Error(`RPC ${name}: ${response.status} ${data?.message || String(data).slice(0, 250)}`)
  return data
}

const users = {
  admin: await ensureUser({ email: 'qa-admin@realtalent.local', name: 'QA Administrador' }),
  manager: await ensureUser({ email: 'qa-manager@realtalent.local', name: 'QA Gestor' }),
  seller: await ensureUser({ email: 'qa-seller@realtalent.local', name: 'QA Vendedor' }),
}

const adminSession = await login(users.admin.email)
const orgSlug = 'realtalent-local-qa'
let organizations = await rest('organizations', {
  query: new URLSearchParams({ select: 'id,name,slug', slug: `eq.${orgSlug}`, limit: '1' }).toString(),
})
let workspaceId = organizations?.[0]?.id

if (!workspaceId) {
  workspaceId = await rpc('create_organization_with_defaults', { p_name: 'RealTalent Local QA' }, adminSession.access_token)
  if (Array.isArray(workspaceId)) workspaceId = workspaceId[0]
}

if (!workspaceId) throw new Error('Não foi possível resolver o workspace local QA.')

await rest('organization_members', {
  method: 'POST',
  query: 'on_conflict=organization_id,user_id',
  body: [
    { organization_id: workspaceId, user_id: users.admin.id, role: 'owner' },
    { organization_id: workspaceId, user_id: users.manager.id, role: 'member' },
    { organization_id: workspaceId, user_id: users.seller.id, role: 'member' },
  ],
  prefer: 'resolution=merge-duplicates,return=minimal',
})

await rest('member_access_profiles', {
  method: 'POST',
  query: 'on_conflict=organization_id,user_id',
  body: [
    { organization_id: workspaceId, user_id: users.admin.id, profile_key: 'system-administrator' },
    { organization_id: workspaceId, user_id: users.manager.id, profile_key: 'system-manager' },
    { organization_id: workspaceId, user_id: users.seller.id, profile_key: 'system-seller' },
  ],
  prefer: 'resolution=merge-duplicates,return=minimal',
})

let teams = await rest('teams', {
  query: new URLSearchParams({ select: 'id', organization_id: `eq.${workspaceId}`, name: 'eq.QA Comercial', limit: '1' }).toString(),
})
let teamId = teams?.[0]?.id
if (!teamId) {
  const created = await rest('teams', {
    method: 'POST',
    body: {
      organization_id: workspaceId,
      name: 'QA Comercial',
      description: 'Equipe descartável para testes locais do CRM.',
      leader_id: users.manager.id,
      created_by: users.admin.id,
    },
  })
  teamId = Array.isArray(created) ? created[0]?.id : created?.id
}

if (teamId) {
  await rest('team_members', {
    method: 'POST',
    query: 'on_conflict=team_id,user_id',
    body: [
      { organization_id: workspaceId, team_id: teamId, user_id: users.manager.id, role: 'leader', allocation_percent: 100 },
      { organization_id: workspaceId, team_id: teamId, user_id: users.seller.id, role: 'member', allocation_percent: 100 },
    ],
    prefer: 'resolution=merge-duplicates,return=minimal',
  })
}

const quoteEnv = (value) => JSON.stringify(String(value))
const cr2 = [
  '# Gerado automaticamente por scripts/local-staging-bootstrap.mjs. SOMENTE localhost.',
  `CR2_SUPABASE_URL=${quoteEnv(apiUrl)}`,
  `CR2_SUPABASE_ANON_KEY=${quoteEnv(anonKey)}`,
  `CR2_WORKSPACE_ID=${quoteEnv(workspaceId)}`,
  `CR2_ADMIN_EMAIL=${quoteEnv(users.admin.email)}`,
  `CR2_ADMIN_PASSWORD=${quoteEnv(qaPassword)}`,
  `CR2_MANAGER_EMAIL=${quoteEnv(users.manager.email)}`,
  `CR2_MANAGER_PASSWORD=${quoteEnv(qaPassword)}`,
  `CR2_SELLER_EMAIL=${quoteEnv(users.seller.email)}`,
  `CR2_SELLER_PASSWORD=${quoteEnv(qaPassword)}`,
  '',
].join('\n')

const cr3 = cr2
  .replaceAll('CR2_', 'CR3_')
  .replace('Gerado automaticamente por scripts/local-staging-bootstrap.mjs. SOMENTE localhost.', 'Gerado automaticamente para CR3. SOMENTE localhost.')

const appEnv = [
  '# Gerado automaticamente. Não versionar. Banco estritamente local.',
  'NODE_ENV=development',
  'VITE_APP_ENV=staging',
  'VITE_DATA_MODE=supabase',
  'VITE_PUBLIC_APP_URL=http://127.0.0.1:4173',
  `VITE_SUPABASE_URL=${quoteEnv(apiUrl)}`,
  `VITE_SUPABASE_PUBLISHABLE_KEY=${quoteEnv(anonKey)}`,
  `SUPABASE_URL=${quoteEnv(apiUrl)}`,
  `SUPABASE_PUBLISHABLE_KEY=${quoteEnv(anonKey)}`,
  `RT_LOCAL_QA_WORKSPACE_ID=${quoteEnv(workspaceId)}`,
  '',
].join('\n')

await Promise.all([
  fs.writeFile(path.join(root, '.env.cr2.local'), cr2, { mode: 0o600 }),
  fs.writeFile(path.join(root, '.env.cr3.local'), cr3, { mode: 0o600 }),
  fs.writeFile(path.join(root, '.env.staging.local'), appEnv, { mode: 0o600 }),
])

console.log('LOCAL STAGING BOOTSTRAP PASS')
console.log(`Supabase: ${apiUrl}`)
console.log(`Workspace QA: ${workspaceId}`)
console.log('Contas QA: Administrador, Gestor e Vendedor criadas/atualizadas somente no Supabase local.')
console.log('Arquivos locais gerados: .env.cr2.local, .env.cr3.local, .env.staging.local')
