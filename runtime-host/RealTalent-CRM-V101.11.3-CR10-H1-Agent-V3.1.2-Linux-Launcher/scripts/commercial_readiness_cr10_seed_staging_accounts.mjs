import fs from 'node:fs'
import path from 'node:path'

const env = (k) => String(process.env[k] || '').trim()
const required = ['CR10_SUPABASE_URL','CR10_SUPABASE_PUBLISHABLE_KEY','CR10_SUPABASE_SERVICE_ROLE_KEY','CR10_WORKSPACE_NAME','CR10_ADMIN_EMAIL','CR10_ADMIN_PASSWORD','CR10_MANAGER_EMAIL','CR10_MANAGER_PASSWORD','CR10_SELLER_EMAIL','CR10_SELLER_PASSWORD']
const missing = required.filter((k) => !env(k))
if (missing.length) { console.error('CR10 ACCOUNTS BLOCKED: faltam variáveis: ' + missing.join(', ')); process.exit(2) }

const base = env('CR10_SUPABASE_URL').replace(/\/$/, '')
const publishable = env('CR10_SUPABASE_PUBLISHABLE_KEY')
const service = env('CR10_SUPABASE_SERVICE_ROLE_KEY')
const evidenceDir = path.join(process.cwd(), 'ops', 'evidence')
fs.mkdirSync(evidenceDir, { recursive: true })

const jsonFetch = async (url, { method='GET', key=publishable, token=key, body, prefer } = {}) => {
  const headers = { apikey:key, Authorization:`Bearer ${token}`, 'Content-Type':'application/json' }
  if (prefer) headers.Prefer = prefer
  const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await response.text()
  let data = null
  if (text) { try { data = JSON.parse(text) } catch { data = text } }
  if (!response.ok) throw new Error(`${method} ${new URL(url).pathname}: ${response.status} ${typeof data === 'string' ? data.slice(0,240) : (data?.message || data?.msg || data?.error_description || JSON.stringify(data).slice(0,240))}`)
  return data
}

const adminApi = (path, options={}) => jsonFetch(`${base}/auth/v1/admin/${path}`, { ...options, key:service, token:service })
const login = async (email,password) => jsonFetch(`${base}/auth/v1/token?grant_type=password`, { method:'POST', key:publishable, token:publishable, body:{email,password} })
const rpc = async (name, body, jwt) => jsonFetch(`${base}/rest/v1/rpc/${name}`, { method:'POST', key:publishable, token:jwt, body })
const rest = async (path, options={}) => jsonFetch(`${base}/rest/v1/${path}`, { ...options, key:publishable })

async function findUser(email) {
  for (let page=1; page<=20; page++) {
    const data = await adminApi(`users?page=${page}&per_page=100`)
    const users = Array.isArray(data) ? data : (data?.users || [])
    const match = users.find((u) => String(u.email || '').toLowerCase() === email.toLowerCase())
    if (match) return match
    if (users.length < 100) return null
  }
  return null
}
async function ensureUser(label,email,password) {
  let user = await findUser(email)
  if (!user) {
    user = await adminApi('users', { method:'POST', body:{ email, password, email_confirm:true, user_metadata:{ full_name:`CR10 ${label}`, staging:true } } })
    console.log(`PASS ${label}: usuário Auth criado`)
  } else {
    try { await login(email,password); console.log(`PASS ${label}: usuário Auth reutilizado`) }
    catch {
      user = await adminApi(`users/${user.id}`, { method:'PUT', body:{ password, email_confirm:true, user_metadata:{ ...(user.user_metadata||{}), full_name:`CR10 ${label}`, staging:true } } })
      console.log(`PASS ${label}: usuário Auth reutilizado e password de staging sincronizado`)
    }
  }
  return user
}
async function ensureMembership(adminToken, account, profileKey) {
  const invite = await rpc('create_organization_invite', { p_organization_id:workspaceId, p_email:account.email, p_role:'member' }, adminToken)
  const session = await login(account.email, account.password)
  await rpc('accept_organization_invite', { p_token: invite.token }, session.access_token)
  await rest('member_access_profiles?on_conflict=organization_id,user_id', {
    method:'POST', token:adminToken, prefer:'resolution=merge-duplicates,return=representation',
    body:[{ organization_id:workspaceId, user_id:session.user.id, profile_key:profileKey }]
  })
  console.log(`PASS ${account.label}: convite aceito e ${profileKey}`)
  return session.user.id
}

const admin = await ensureUser('Administrador', env('CR10_ADMIN_EMAIL'), env('CR10_ADMIN_PASSWORD'))
const manager = await ensureUser('Gestor', env('CR10_MANAGER_EMAIL'), env('CR10_MANAGER_PASSWORD'))
const seller = await ensureUser('Vendedor', env('CR10_SELLER_EMAIL'), env('CR10_SELLER_PASSWORD'))
const adminSession = await login(env('CR10_ADMIN_EMAIL'), env('CR10_ADMIN_PASSWORD'))

const nameFilter = encodeURIComponent(`eq.${env('CR10_WORKSPACE_NAME')}`)
const ownerFilter = encodeURIComponent(`eq.${adminSession.user.id}`)
let orgs = await rest(`organizations?select=id,name,slug&owner_id=${ownerFilter}&name=${nameFilter}`, { token:adminSession.access_token })
let workspaceId
if (Array.isArray(orgs) && orgs[0]?.id) {
  workspaceId = orgs[0].id
  console.log('PASS Workspace: existente e reutilizado')
} else {
  workspaceId = await rpc('create_organization_with_defaults', { p_name:env('CR10_WORKSPACE_NAME') }, adminSession.access_token)
  console.log('PASS Workspace: criado via create_organization_with_defaults')
}
if (!workspaceId) throw new Error('workspace id ausente')

const managerId = await ensureMembership(adminSession.access_token, {label:'Gestor',email:env('CR10_MANAGER_EMAIL'),password:env('CR10_MANAGER_PASSWORD')}, 'system-manager')
const sellerId = await ensureMembership(adminSession.access_token, {label:'Vendedor',email:env('CR10_SELLER_EMAIL'),password:env('CR10_SELLER_PASSWORD')}, 'system-seller')

const profiles = await rest(`member_access_profiles?select=user_id,profile_key&organization_id=eq.${workspaceId}`, { token:adminSession.access_token })
const managerProfile = profiles.find((p) => p.user_id === managerId)?.profile_key
const sellerProfile = profiles.find((p) => p.user_id === sellerId)?.profile_key
if (managerProfile !== 'system-manager' || sellerProfile !== 'system-seller') throw new Error(`profiles incorretos: manager=${managerProfile} seller=${sellerProfile}`)

const context = {
  schema:'realtalent-cr10-staging-context/v1', generatedAt:new Date().toISOString(),
  supabaseHost:new URL(base).hostname, projectRef:env('CR10_PROJECT_REF') || null,
  workspace:{ id:workspaceId, name:env('CR10_WORKSPACE_NAME') },
  users:{ adminId:adminSession.user.id, managerId, sellerId },
  profiles:{ manager:managerProfile, seller:sellerProfile },
  secretsPersisted:false,
}
fs.writeFileSync(path.join(evidenceDir,'CR10_STAGING_CONTEXT.json'), JSON.stringify(context,null,2)+'\n', {mode:0o600})
console.log(`CR10 ACCOUNTS PASS: workspace=${workspaceId}; Admin/Gestor/Vendedor prontos para CR2/CR3.`)
console.log(`CR10_WORKSPACE_ID=${workspaceId}`)
