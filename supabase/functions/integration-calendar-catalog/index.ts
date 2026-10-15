import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import { adminClient, ensureFreshToken, json } from '../_shared/integration-runtime.ts'

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type' }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return json({ error: 'Método não permitido' }, 405)
  const auth = request.headers.get('authorization') || ''
  const client = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_ANON_KEY') || '', { global: { headers: { Authorization: auth } } })
  const { data: { user } } = await client.auth.getUser()
  if (!user) return json({ error: 'Sessão inválida' }, 401)
  const body = await request.json().catch(() => ({})) as { organizationId?: string; accountId?: string }
  if (!body.organizationId || !body.accountId) return json({ error: 'Conta não informada' }, 400)
  const { data: allowed } = await client.rpc('can_use_integration_account', { p_account_id: body.accountId })
  if (!allowed) return json({ error: 'Você não pode usar esta conta' }, 403)

  const admin = adminClient()
  const { data: account } = await admin.from('integration_connected_accounts').select('*').eq('id', body.accountId).eq('organization_id', body.organizationId).maybeSingle()
  if (!account || !['google', 'microsoft'].includes(account.provider)) return json({ error: 'Conta de calendário não encontrada' }, 404)
  if (account.connection_mode === 'demo' || account.status !== 'connected' || !account.has_credential) return json({ error: 'Conecte uma conta real antes de listar calendários.' }, 409)

  try {
    const token = await ensureFreshToken(admin, account)
    if (account.provider === 'google') {
      const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250&minAccessRole=reader', { headers: { authorization: `Bearer ${token}` } })
      const payload = await response.json().catch(() => ({})) as any
      if (!response.ok) throw new Error(payload?.error?.message || 'Falha ao listar agendas do Google')
      const selectedId = String(account.metadata?.calendar_id || 'primary')
      const calendars = (payload.items || []).map((item: any) => ({
        id: String(item.id), name: String(item.summaryOverride || item.summary || item.id), primary: Boolean(item.primary),
        writable: ['owner', 'writer'].includes(String(item.accessRole || '')), selected: String(item.id) === selectedId || (selectedId === 'primary' && Boolean(item.primary)),
      }))
      return json({ provider: 'google', calendars })
    }

    const response = await fetch('https://graph.microsoft.com/v1.0/me/calendars?$top=250&$select=id,name,canEdit,isDefaultCalendar', { headers: { authorization: `Bearer ${token}` } })
    const payload = await response.json().catch(() => ({})) as any
    if (!response.ok) throw new Error(payload?.error?.message || 'Falha ao listar calendários da Microsoft')
    const selectedId = String(account.metadata?.calendar_id || 'default')
    const calendars = (payload.value || []).map((item: any) => ({
      id: String(item.id), name: String(item.name || item.id), primary: Boolean(item.isDefaultCalendar), writable: item.canEdit !== false,
      selected: String(item.id) === selectedId || (selectedId === 'default' && Boolean(item.isDefaultCalendar)),
    }))
    return json({ provider: 'microsoft', calendars })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Falha ao carregar calendários' }, 502)
  }
})
