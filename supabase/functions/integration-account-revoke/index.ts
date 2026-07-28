import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import { adminClient, auditEvent, json, safeMessage } from '../_shared/integration-runtime.ts'

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type' }

async function revokeAtProvider(provider: string, accessToken: string) {
  if (provider === 'google') {
    const response = await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: accessToken }),
    })
    if (!response.ok) throw new Error(`Google recusou a revogação (${response.status})`)
    return { attempted: true, supported: true }
  }
  if (provider === 'meta' || provider === 'whatsapp_cloud') {
    const version = Deno.env.get('META_GRAPH_VERSION') || 'v23.0'
    const url = new URL(`https://graph.facebook.com/${version}/me/permissions`)
    url.searchParams.set('access_token', accessToken)
    const response = await fetch(url, { method: 'DELETE' })
    const payload = await response.json().catch(() => ({})) as any
    if (!response.ok || payload.success === false) throw new Error(payload?.error?.message || `Meta recusou a revogação (${response.status})`)
    return { attempted: true, supported: true }
  }
  // Microsoft não oferece revogação isolada e imediata do refresh token do aplicativo.
  // O cofre local é apagado e o consentimento pode ser removido no Entra pelo administrador.
  return { attempted: false, supported: false }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return json({ error: 'Método não permitido' }, 405)
  const auth = request.headers.get('authorization') || ''
  const client = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_ANON_KEY') || '', { global: { headers: { Authorization: auth } } })
  const { data: { user } } = await client.auth.getUser()
  if (!user) return json({ error: 'Sessão inválida' }, 401)
  const body = await request.json().catch(() => ({})) as { organizationId?: string; accountId?: string }
  if (!body.organizationId || !body.accountId) return json({ error: 'Conta não informada' }, 400)
  const { data: isAdmin } = await client.rpc('is_organization_admin', { p_organization_id: body.organizationId })
  if (!isAdmin) return json({ error: 'Somente administradores podem revogar contas' }, 403)
  const admin = adminClient()
  const { data: account } = await admin.from('integration_connected_accounts').select('*').eq('id', body.accountId).eq('organization_id', body.organizationId).maybeSingle()
  if (!account) return json({ error: 'Conta não encontrada' }, 404)
  let providerRevocation: Record<string, unknown> = { attempted: false, supported: false }
  let providerError = ''
  try {
    const encryptionKey = Deno.env.get('INTEGRATION_TOKEN_ENCRYPTION_KEY') || ''
    const { data: tokens, error: tokenError } = await admin.rpc('read_integration_oauth_token', { p_account_id: account.id, p_encryption_key: encryptionKey })
    const token = Array.isArray(tokens) ? tokens[0]?.access_token : tokens?.access_token
    if (tokenError) throw tokenError
    if (token) providerRevocation = await revokeAtProvider(account.provider, String(token))
  } catch (error) { providerError = safeMessage(error) }

  const { error: localError } = await client.rpc('update_integration_account_status', { p_account_id: account.id, p_action: 'disconnect' })
  if (localError) return json({ error: localError.message }, 500)
  await auditEvent(admin, {
    organizationId: account.organization_id, accountId: account.id, provider: account.provider,
    eventType: 'credential_revoked', severity: 'security',
    message: providerError ? 'Credencial removida do RealTalent; o provedor retornou uma falha de revogação' : 'Credencial revogada e removida do cofre',
    actorUserId: user.id, metadata: { provider_revocation: providerRevocation, provider_error: providerError || null },
  })
  return json({ revoked: true, providerRevocation, providerError: providerError || null })
})
