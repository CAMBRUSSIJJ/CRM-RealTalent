import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const parseEnv = (text) => Object.fromEntries(
  text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const index = line.indexOf('=')
      let value = line.slice(index + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
      return [line.slice(0, index).trim(), value]
    }),
)

const env = parseEnv(fs.readFileSync('.env.cr2.local', 'utf8'))
const url = env.CR2_SUPABASE_URL
const key = env.CR2_SUPABASE_ANON_KEY
const workspaceId = env.CR2_WORKSPACE_ID
const email = env.CR2_ADMIN_EMAIL
const password = env.CR2_ADMIN_PASSWORD

if (!url || !key || !workspaceId || !email || !password) throw new Error('Variáveis CR2 locais incompletas.')
if (!/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/|$)/.test(url)) throw new Error(`Endpoint não local recusado: ${url}`)

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const login = await client.auth.signInWithPassword({ email, password })
if (login.error) throw login.error

const checks = [
  ['workspaces', () => client.from('organization_members').select('role, organizations!inner(id,name,slug,created_at)').order('created_at', { foreignTable: 'organizations' })],
  ['workspace-members', () => client.from('organization_members').select('organization_id,user_id,role,created_at,profiles!inner(display_name,email,avatar_url)').eq('organization_id', workspaceId).order('created_at')],
  ['pipeline-stages', () => client.from('pipeline_stages').select('*').eq('organization_id', workspaceId).order('stage_order').order('id')],
  ['leads', () => client.from('leads').select('*').eq('organization_id', workspaceId).order('updated_at', { ascending: false }).order('id')],
  ['companies', () => client.from('companies').select('*').eq('organization_id', workspaceId).order('name').order('id')],
  ['contacts', () => client.from('contacts').select('*').eq('organization_id', workspaceId).order('name').order('id')],
  ['contact-relationships', () => client.from('contact_relationships').select('*').eq('organization_id', workspaceId).order('updated_at', { ascending: false }).order('id')],
  ['opportunities', () => client.from('opportunities').select('*').eq('organization_id', workspaceId).order('updated_at', { ascending: false }).order('id')],
  ['social-profiles', () => client.from('social_profiles').select('*').eq('organization_id', workspaceId).order('network').order('id')],
]

let failed = false
for (const [name, run] of checks) {
  const result = await run()
  if (result.error) {
    failed = true
    console.error(`FAIL ${name}: ${result.error.code ?? ''} ${result.error.message ?? result.error}`)
  } else {
    console.log(`PASS ${name}: ${Array.isArray(result.data) ? result.data.length : 0} row(s)`)
  }
}

await client.auth.signOut()
if (failed) process.exit(1)
console.log('LOCAL WORKSPACE HYDRATION PASS')
