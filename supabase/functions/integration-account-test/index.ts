import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import { adminClient, ensureFreshToken, json, recordDiagnostic, safeMessage } from '../_shared/integration-runtime.ts'
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type' }

const endpointFor = (account: any) => {
  if (account.provider === 'google') return 'https://openidconnect.googleapis.com/v1/userinfo'
  if (account.provider === 'microsoft') return 'https://graph.microsoft.com/v1.0/me?$select=id,displayName,userPrincipalName'
  const version = Deno.env.get('META_GRAPH_VERSION') || 'v23.0'
  if (account.provider === 'whatsapp_cloud') {
    const wabaId = String(account.metadata?.whatsapp_business_account_id || '')
    if (!wabaId) throw new Error('Conta Meta autorizada, mas a WhatsApp Business Account ainda não foi selecionada')
    return `https://graph.facebook.com/${version}/${encodeURIComponent(wabaId)}?fields=id,name,currency,timezone_id`
  }
  return `https://graph.facebook.com/${version}/me?fields=id,name`
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
  const [{ data: allowed }, { data: isAdmin }] = await Promise.all([
    client.rpc('can_use_integration_account', { p_account_id: body.accountId }),
    client.rpc('is_organization_admin', { p_organization_id: body.organizationId }),
  ])
  if (!allowed && !isAdmin) return json({ error: 'Você não pode testar esta conta' }, 403)
  const admin = adminClient(); const started = Date.now(); const runId = crypto.randomUUID()
  const { data: account } = await admin.from('integration_connected_accounts').select('*').eq('id', body.accountId).eq('organization_id', body.organizationId).maybeSingle()
  if (!account) return json({ error: 'Conta não encontrada' }, 404)
  if (account.connection_mode === 'demo') return json({ status: 'warn', message: 'Conta de demonstração: nenhuma credencial externa foi testada.', latencyMs: 0 })
  if (account.status !== 'connected' || !account.has_credential) return json({ status: 'warn', message: 'A conta está pausada, revogada ou sem credencial ativa.', latencyMs: 0 }, 409)
  try {
    const token = await ensureFreshToken(admin, account)
    const response = await fetch(endpointFor(account), { headers: { authorization: `Bearer ${token}` } })
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) throw new Error(String((payload.error as any)?.message || 'O provedor recusou a credencial'))
    const latency = Date.now() - started
    await admin.from('integration_connected_accounts').update({ last_tested_at: new Date().toISOString(), last_test_status: 'pass', last_test_latency_ms: latency, last_error: null }).eq('id', account.id)
    await recordDiagnostic(admin, { organizationId: account.organization_id, accountId: account.id, provider: account.provider, runId, checkKey: 'manual_connection_test', status: 'pass', message: 'Conexão e recurso configurado validados diretamente no provedor', latencyMs: latency })
    return json({ status: 'pass', message: 'Conexão e recurso configurado validados diretamente no provedor.', latencyMs: latency })
  } catch (error) {
    const latency = Date.now() - started; const message = safeMessage(error)
    await admin.from('integration_connected_accounts').update({ last_tested_at: new Date().toISOString(), last_test_status: 'fail', last_test_latency_ms: latency, last_error: message, status: 'attention' }).eq('id', account.id).eq('status', 'connected')
    await recordDiagnostic(admin, { organizationId: account.organization_id, accountId: account.id, provider: account.provider, runId, checkKey: 'manual_connection_test', status: 'fail', message, latencyMs: latency })
    return json({ status: 'fail', message, latencyMs: latency }, 502)
  }
})
