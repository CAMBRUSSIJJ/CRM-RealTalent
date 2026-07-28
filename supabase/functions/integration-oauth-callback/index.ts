import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const appUrl = () => Deno.env.get('APP_PUBLIC_URL') || 'http://localhost:5173'
const redirect = (status: 'success' | 'error', provider = '', detail = '') => {
  const url = new URL(appUrl())
  url.searchParams.set('route', 'settings')
  url.searchParams.set('tab', 'integrations')
  url.searchParams.set('oauth', status)
  if (provider) url.searchParams.set('provider', provider)
  if (detail) url.searchParams.set('detail', detail.slice(0, 160))
  return Response.redirect(url.toString(), 302)
}
const fromBase64Url = (value: string) => {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4)
  return atob(normalized)
}
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes)).map((value) => value.toString(16).padStart(2, '0')).join('')
const hmac = async (payload: string, secret: string) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)))
}
const constantTimeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false
  let result = 0
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return result === 0
}

type Provider = 'google' | 'microsoft' | 'meta' | 'whatsapp_cloud'
interface StatePayload { o: string; p: Provider; u: string; n: string; e: number }

const configs = {
  google: {
    clientId: 'GOOGLE_OAUTH_CLIENT_ID', clientSecret: 'GOOGLE_OAUTH_CLIENT_SECRET',
    tokenUrl: 'https://oauth2.googleapis.com/token', profileUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
  },
  microsoft: {
    clientId: 'MICROSOFT_OAUTH_CLIENT_ID', clientSecret: 'MICROSOFT_OAUTH_CLIENT_SECRET',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token', profileUrl: 'https://graph.microsoft.com/v1.0/me',
  },
  meta: {
    clientId: 'META_OAUTH_CLIENT_ID', clientSecret: 'META_OAUTH_CLIENT_SECRET',
    tokenUrl: `https://graph.facebook.com/${Deno.env.get('META_GRAPH_VERSION') || 'v23.0'}/oauth/access_token`,
    profileUrl: `https://graph.facebook.com/me?fields=id,name`,
  },
  whatsapp_cloud: {
    clientId: 'META_OAUTH_CLIENT_ID', clientSecret: 'META_OAUTH_CLIENT_SECRET',
    tokenUrl: `https://graph.facebook.com/${Deno.env.get('META_GRAPH_VERSION') || 'v23.0'}/oauth/access_token`,
    profileUrl: `https://graph.facebook.com/me?fields=id,name`,
  },
} as const

Deno.serve(async (request) => {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const providerError = url.searchParams.get('error_description') || url.searchParams.get('error')
  if (providerError) return redirect('error', '', providerError)
  if (!code || !state) return redirect('error', '', 'Código ou estado OAuth ausente')

  try {
    const stateSecret = Deno.env.get('OAUTH_STATE_SECRET') || ''
    const encryptionKey = Deno.env.get('INTEGRATION_TOKEN_ENCRYPTION_KEY') || ''
    if (stateSecret.length < 32 || encryptionKey.length < 32) throw new Error('Secrets OAuth não configurados')
    const separator = state.lastIndexOf('.')
    if (separator < 1) throw new Error('Estado inválido')
    const payloadPart = state.slice(0, separator)
    const signature = state.slice(separator + 1)
    const expected = await hmac(payloadPart, stateSecret)
    if (!constantTimeEqual(signature, expected)) throw new Error('Assinatura do estado inválida')
    const payload = JSON.parse(fromBase64Url(payloadPart)) as StatePayload
    if (!payload.o || !payload.u || !configs[payload.p] || payload.e < Math.floor(Date.now() / 1000)) throw new Error('Estado expirado ou inválido')

    const config = configs[payload.p]
    const clientId = Deno.env.get(config.clientId)
    const clientSecret = Deno.env.get(config.clientSecret)
    if (!clientId || !clientSecret) throw new Error(`Credenciais ${payload.p} não configuradas`)
    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/integration-oauth-callback`
    const body = new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' })
    const tokenResponse = await fetch(config.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body })
    const token = await tokenResponse.json().catch(() => ({})) as Record<string, unknown>
    if (!tokenResponse.ok || typeof token.access_token !== 'string') throw new Error(typeof token.error_description === 'string' ? token.error_description : 'Falha na troca do código OAuth')

    const profileResponse = await fetch(config.profileUrl, { headers: { authorization: `Bearer ${token.access_token}` } })
    const profile = await profileResponse.json().catch(() => ({})) as Record<string, unknown>
    if (!profileResponse.ok) throw new Error('Não foi possível identificar a conta conectada')
    const externalId = String(profile.id || profile.sub || profile.userPrincipalName || profile.email || crypto.randomUUID())
    const displayName = String(profile.name || profile.displayName || profile.email || profile.userPrincipalName || `${payload.p} ${externalId}`)
    const scopes = typeof token.scope === 'string' ? token.scope.split(/[ ,]+/).filter(Boolean) : []
    const expiresIn = Number(token.expires_in || 0)
    const expiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: membership } = await admin.from('organization_members').select('role').eq('organization_id', payload.o).eq('user_id', payload.u).maybeSingle()
    if (!membership || !['owner', 'admin'].includes(membership.role)) throw new Error('Usuário sem permissão para esta organização')
    const { data: account, error: accountError } = await admin.from('integration_connected_accounts').upsert({
      organization_id: payload.o, provider: payload.p, external_account_id: externalId, display_name: displayName,
      status: 'connected', scopes, has_credential: true, token_expires_at: expiresAt, last_error: null, connected_by_user_id: payload.u, metadata: { email: String(profile.email || profile.userPrincipalName || ''), provider_profile: profile },
    }, { onConflict: 'organization_id,provider,external_account_id' }).select('id').single()
    if (accountError || !account) throw new Error(accountError?.message || 'Falha ao salvar a conta')
    const { error: vaultError } = await admin.rpc('store_integration_oauth_token', {
      p_account_id: account.id,
      p_access_token: token.access_token,
      p_refresh_token: typeof token.refresh_token === 'string' ? token.refresh_token : '',
      p_token_type: typeof token.token_type === 'string' ? token.token_type : 'Bearer',
      p_expires_at: expiresAt,
      p_encryption_key: encryptionKey,
    })
    if (vaultError) throw new Error(vaultError.message)
    await admin.from('audit_logs').insert({ organization_id: payload.o, user_id: payload.u, action: 'integration_oauth_connected', entity_type: 'integration_connected_account', entity_id: account.id, after_data: { provider: payload.p, external_account_id: externalId } })
    return redirect('success', payload.p)
  } catch (error) {
    return redirect('error', '', error instanceof Error ? error.message : 'Falha inesperada no OAuth')
  }
})
