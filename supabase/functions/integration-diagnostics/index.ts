import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import { adminClient, json, recordDiagnostic, safeMessage } from '../_shared/integration-runtime.ts'
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type' }
const providerSecrets: Record<string, string[]> = {
  google: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET'],
  microsoft: ['MICROSOFT_OAUTH_CLIENT_ID', 'MICROSOFT_OAUTH_CLIENT_SECRET'],
  meta: ['META_OAUTH_CLIENT_ID', 'META_OAUTH_CLIENT_SECRET', 'META_APP_SECRET'],
  whatsapp_cloud: ['META_OAUTH_CLIENT_ID', 'META_OAUTH_CLIENT_SECRET', 'META_APP_SECRET', 'WHATSAPP_WEBHOOK_VERIFY_TOKEN'],
}
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return json({ error: 'Método não permitido' }, 405)
  const auth = request.headers.get('authorization') || ''
  const client = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_ANON_KEY') || '', { global: { headers: { Authorization: auth } } })
  const { data: { user } } = await client.auth.getUser()
  if (!user) return json({ error: 'Sessão inválida' }, 401)
  const body = await request.json().catch(() => ({})) as { organizationId?: string }
  if (!body.organizationId) return json({ error: 'Organização não informada' }, 400)
  const { data: isAdmin } = await client.rpc('is_organization_admin', { p_organization_id: body.organizationId })
  if (!isAdmin) return json({ error: 'Somente administradores podem executar o diagnóstico' }, 403)
  const admin = adminClient(); const runId = crypto.randomUUID(); const checks: Array<Record<string, unknown>> = []
  const add = async (provider: any, key: string, status: 'pass'|'warn'|'fail', message: string, accountId: string|null = null, details: Record<string, unknown> = {}) => {
    const item = { provider, checkKey: key, status, message, accountId, details }; checks.push(item)
    await recordDiagnostic(admin, { organizationId: body.organizationId!, accountId, provider, runId, checkKey: key, status, message, details })
  }
  try {
    for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'APP_PUBLIC_URL', 'INTEGRATION_TOKEN_ENCRYPTION_KEY', 'INTEGRATION_WORKER_SECRET']) {
      const value = Deno.env.get(key) || ''; await add('framework', `secret:${key}`, value.length >= (key.includes('SECRET') || key.includes('KEY') ? 32 : 4) ? 'pass' : 'fail', value ? `${key} configurado` : `${key} ausente`)
    }
    const { data: health, error: healthError } = await client.rpc('integration_foundation_health', { p_organization_id: body.organizationId })
    await add('framework', 'database_contract', healthError ? 'fail' : 'pass', healthError ? healthError.message : 'Contrato do banco disponível', null, health || {})
    const { data: accounts, error: accountError } = await admin.from('integration_connected_accounts').select('*').eq('organization_id', body.organizationId)
    if (accountError) throw accountError
    for (const account of accounts || []) {
      for (const key of providerSecrets[account.provider] || []) {
        const present = Boolean(Deno.env.get(key)); await add(account.provider, `secret:${key}`, present ? 'pass' : 'fail', present ? `${key} configurado` : `${key} ausente`, account.id)
      }
      await add(account.provider, 'credential', account.connection_mode === 'demo' ? 'warn' : account.has_credential ? 'pass' : 'fail', account.connection_mode === 'demo' ? 'Conta em demonstração; sem chamada externa' : account.has_credential ? 'Credencial protegida no cofre' : 'Credencial ausente', account.id)
      const expires = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0
      await add(account.provider, 'token_expiry', account.connection_mode === 'demo' ? 'warn' : !expires ? 'warn' : expires > Date.now() + 10 * 60_000 ? 'pass' : 'fail', !expires ? 'Validade não informada' : expires > Date.now() + 10 * 60_000 ? 'Token dentro da validade' : 'Token vencido ou próximo do vencimento', account.id)
      await add(account.provider, 'access_policy', ['personal','shared','organization','restricted'].includes(account.access_mode) ? 'pass' : 'fail', `Modo de acesso: ${account.access_mode}`, account.id)
      if (account.provider === 'whatsapp_cloud') {
        const waba = String(account.metadata?.whatsapp_business_account_id || '')
        const phone = String(account.metadata?.phone_number_id || '')
        await add(account.provider, 'whatsapp_resource', waba && phone ? 'pass' : 'warn', waba && phone ? 'WABA e número configurados' : 'OAuth concluído, mas WABA ou número ainda não foram selecionados', account.id, { wabaConfigured: Boolean(waba), phoneConfigured: Boolean(phone) })
      }
      if (account.provider === 'meta') {
        const page = String(account.metadata?.page_id || '')
        await add(account.provider, 'meta_resource', page ? 'pass' : 'warn', page ? 'Página Meta configurada' : 'Conta autorizada, mas nenhuma Página foi selecionada', account.id)
      }
    }
    const { count: stale } = await admin.from('integration_sync_jobs').select('id', { count: 'exact', head: true }).eq('status', 'processing').lt('lease_expires_at', new Date().toISOString()).eq('organization_id', body.organizationId)
    await add('framework', 'stale_leases', Number(stale || 0) ? 'warn' : 'pass', Number(stale || 0) ? `${stale} trabalho(s) com lease vencido` : 'Nenhum trabalho travado')
    return json({ runId, checks })
  } catch (error) { return json({ error: safeMessage(error), runId, checks }, 500) }
})
