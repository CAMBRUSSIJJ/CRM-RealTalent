import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7'

// Verify JWT deliberately disabled for this endpoint: it supports one-time
// device redemption. Every operation authenticates either a real Supabase
// account or a 256-bit, revocable, organization-scoped device token.
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, x-rt-device-token',
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store' },
})
const env = (name: string) => (Deno.env.get(name) || '').trim()
const defaultApiKey = (name: string) => {
  try {
    const keys = JSON.parse(env(name))
    return typeof keys?.default === 'string' ? keys.default : ''
  } catch { return '' }
}
const backendKey = () => env('SUPABASE_SERVICE_ROLE_KEY') ||
  defaultApiKey('SUPABASE_SECRET_KEYS')

const uuid = (value: unknown) => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const hash = async (text: string) => [...new Uint8Array(await crypto.subtle.digest(
  'SHA-256', new TextEncoder().encode(text),
))].map(n => n.toString(16).padStart(2, '0')).join('')
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const randomCode = () => {
  const input = crypto.getRandomValues(new Uint8Array(10))
  let bits = 0, acc = 0, code = ''
  for (const byte of input) {
    acc = (acc << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      code += alphabet[(acc >>> bits) & 31]
    }
  }
  return code
}
const randomToken = () => [...crypto.getRandomValues(new Uint8Array(32))]
  .map(n => n.toString(16).padStart(2, '0')).join('')
const safeQr = (value: unknown) => {
  if (typeof value !== 'string' || value.length > 500000) return null
  const data = value.replace(/^data:image\/png;base64,/, '')
  return /^iVBORw0KGgo[A-Za-z0-9+/=\r\n]+$/.test(data)
    ? 'data:image/png;base64,' + data : null
}
const validPhone = (v: unknown): v is string => typeof v === 'string' &&
  /^\+[1-9][0-9]{7,14}$/.test(v)
const safeError = (v: unknown) => typeof v === 'string' ? v.slice(0, 200) : null
const expired = (date: string, minutes: number) => {
  const age = Date.now() - Date.parse(date)
  return !Number.isFinite(age) || age < 0 || age > minutes * 60_000
}
const link = () => {
  try {
    const url = new URL(env('TASK_REMINDER_APP_URL') || 'https://crm-real-talent.vercel.app')
    return url.protocol === 'https:' ? url.origin : null
  } catch { return null }
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  // This function only exists for the local pairing bridge. It does not
  // depend on an additional manually installed secret to create pair codes.
  // Explicitly setting a different connection mode remains a kill switch.
  const mode = env('WHATSAPP_CONNECTION_MODE')
  if (mode && mode !== 'bridge') return json({ error: 'bridge_mode_not_enabled' }, 503)
  const supabaseUrl = env('SUPABASE_URL'), secret = backendKey()
  if (!supabaseUrl || !secret) return json({ error: 'backend_not_configured' }, 503)
  const db = createClient(supabaseUrl, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return json({ error: 'invalid_json' }, 400) }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return json({ error: 'invalid_request' }, 400)
  const action = body.action

  // User-only actions: creating and revoking a code always require a current
  // authenticated workspace owner/admin (not a user-editable JWT claim).
  if (['create-code', 'device-info', 'revoke'].includes(String(action))) {
    const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
    if (!bearer) return json({ error: 'sign_in_required' }, 401)
    const { data: auth, error: userError } = await db.auth.getUser(bearer)
    if (userError || !auth.user) return json({ error: 'invalid_session' }, 401)
    const org = body.organizationId
    if (!uuid(org)) return json({ error: 'invalid_organization' }, 400)
    const { data: member, error } = await db.from('organization_members').select('role')
      .eq('organization_id', org).eq('user_id', auth.user.id).maybeSingle()
    if (error || !['owner', 'admin'].includes(member?.role || ''))
      return json({ error: 'admin_required' }, 403)

    if (action === 'device-info') {
      const { data: device } = await db.from('whatsapp_connect_devices')
        .select('id,last_seen_at,revoked_at').eq('organization_id', org).maybeSingle()
      return json({ ok: true, paired: !!device && !device.revoked_at, lastSeenAt: device?.last_seen_at || null })
    }
    if (action === 'revoke') {
      const { error: revokeError } = await db.from('whatsapp_connect_devices')
        .update({ revoked_at: new Date().toISOString() }).eq('organization_id', org).is('revoked_at', null)
      if (revokeError) return json({ error: 'could_not_revoke' }, 503)
      await db.from('whatsapp_local_bridge').update({
        heartbeat_at: null, connection_state: 'close', qr_base64: null, qr_expires_at: null,
      }).eq('organization_id', org)
      return json({ ok: true, revoked: true })
    }

    const code = randomCode()
    const { error: insertError } = await db.from('whatsapp_connect_pairings').upsert({
      organization_id: org,
      code_sha256: await hash(code),
      created_by: auth.user.id,
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      redeemed_at: null,
      created_at: new Date().toISOString(),
    }, { onConflict: 'organization_id' })
    if (insertError) return json({ error: 'pairing_storage_unavailable' }, 503)
    return json({
      ok: true,
      pairingCode: code.replace(/(.{4})(?=.)/g, '$1-'),
      expiresInSeconds: 300,
    })
  }

  // Device enrolment: one-time random 80-bit code, never published in URLs,
  // atomically consumed and exchanged for a 256-bit revocable device secret.
  if (action === 'claim') {
    const code = typeof body.code === 'string'
      ? body.code.toUpperCase().replace(/[\s-]/g, '') : ''
    if (!/^[A-HJ-NP-Z2-9]{16}$/.test(code))
      return json({ error: 'invalid_pairing_code' }, 400)
    const digest = await hash(code)
    const now = new Date().toISOString()
    const { data: pairing, error: pairError } = await db.from('whatsapp_connect_pairings')
      .update({ redeemed_at: now }).eq('code_sha256', digest).is('redeemed_at', null)
      .gt('expires_at', now).select('organization_id,created_by').maybeSingle()
    if (pairError || !pairing) return json({ error: 'pairing_code_expired_or_used' }, 403)
    const token = randomToken()
    const { error: deviceError } = await db.from('whatsapp_connect_devices').upsert({
      organization_id: pairing.organization_id,
      id: crypto.randomUUID(),
      token_sha256: await hash(token),
      paired_by: pairing.created_by,
      label: 'RealTalent Connect Linux',
      paired_at: now,
      last_seen_at: null,
      revoked_at: null,
    }, { onConflict: 'organization_id' })
    if (deviceError) return json({ error: 'could_not_link_computer' }, 503)
    return json({
      ok: true, organizationId: pairing.organization_id,
      deviceToken: token, crmUrl: link(),
    })
  }

  const provided = request.headers.get('x-rt-device-token') || ''
  if (!/^[0-9a-f]{64}$/.test(provided)) return json({ error: 'device_not_linked' }, 401)
  const { data: device, error: deviceError } = await db.from('whatsapp_connect_devices')
    .select('id,organization_id').eq('token_sha256', await hash(provided))
    .is('revoked_at', null).maybeSingle()
  if (deviceError || !device) return json({ error: 'device_revoked_or_unavailable' }, 401)
  const org = device.organization_id

  if (action === 'heartbeat') {
    const state = body.state
    if (!['missing','close','connecting','open','error'].includes(String(state)))
      return json({ error: 'invalid_state' }, 400)
    const qr = state === 'open' ? null : safeQr(body.qr)
    const expiry = qr ? new Date(Date.now() + 40_000).toISOString() : null
    const update: Record<string, unknown> = {
      organization_id: org, heartbeat_at: new Date().toISOString(),
      connection_state: state, qr_base64: qr, qr_expires_at: expiry,
      updated_at: new Date().toISOString(),
    }
    // Do not erase the command failure every six seconds.
    // A new connection request or a successful QR clears it explicitly.
    if (typeof body.error === 'string') update.last_error = safeError(body.error)
    else if (state === 'open' || qr) update.last_error = null
    const { error: heartbeatError } = await db.from('whatsapp_local_bridge')
      .upsert(update, { onConflict: 'organization_id' })
    if (heartbeatError) return json({ error: 'could_not_record_heartbeat' }, 503)
    await db.from('whatsapp_connect_devices')
      .update({ last_seen_at: new Date().toISOString() }).eq('id', device.id)
    return json({ ok: true })
  }

  if (action === 'poll') {
    const { data: commands, error: commandError } = await db.rpc('claim_whatsapp_local_action', {
      p_organization_id: org,
    })
    if (commandError) return json({ error: 'command_queue_unavailable' }, 503)
    const { data: status } = await db.from('whatsapp_local_bridge')
      .select('connection_state,heartbeat_at').eq('organization_id', org).maybeSingle()
    const online = status?.connection_state === 'open' &&
      !!status?.heartbeat_at && !expired(status.heartbeat_at, 1)
    const result: { commands: unknown[]; verifications: unknown[]; reminders: unknown[] } = {
      commands: (commands || []).map((row: any) =>
        ({ requestId: row.request_id, action: row.requested_action })),
      verifications: [], reminders: [],
    }
    if (!online) return json({ ok: true, ...result })
    const { data: challenges } = await db.rpc('claim_whatsapp_local_phone_codes', {
      p_organization_id: org,
    })
    for (const row of (challenges || []).slice(0, 2)) {
      const [pref, member] = await Promise.all([
        db.from('task_notification_preferences')
          .select('whatsapp_enabled,whatsapp_consented_at,whatsapp_phone_e164')
          .eq('organization_id', org).eq('user_id', row.user_id).maybeSingle(),
        db.from('organization_members').select('user_id')
          .eq('organization_id', org).eq('user_id', row.user_id).maybeSingle(),
      ])
      if (!member.data || !pref.data?.whatsapp_enabled || !pref.data?.whatsapp_consented_at ||
          pref.data.whatsapp_phone_e164 !== row.phone_e164) continue
      result.verifications.push({
        userId: row.user_id, phone: row.phone_e164,
        text: 'RealTalent: seu código de verificação é ' + row.code +
          '. Válido por 5 minutos. Não compartilhe.',
      })
    }

    const { data: jobs, error: jobsError } = await db.rpc('claim_whatsapp_local_jobs', {
      p_organization_id: org,
    })
    if (jobsError) return json({ error: 'reminder_queue_unavailable' }, 503)
    for (const job of (jobs || []).slice(0, 3)) {
      const [task, pref, member, directory, verified] = await Promise.all([
        db.from('work_tasks').select('title,priority,due_at,status,assignee_id,reminder_enabled,reminder_channels')
          .eq('organization_id', org).eq('id', job.task_id).maybeSingle(),
        db.from('task_notification_preferences')
          .select('whatsapp_enabled,whatsapp_consented_at,whatsapp_phone_e164')
          .eq('organization_id', org).eq('user_id', job.assignee_id).maybeSingle(),
        db.from('organization_members').select('user_id')
          .eq('organization_id', org).eq('user_id', job.assignee_id).maybeSingle(),
        db.from('team_member_notification_contacts').select('phone_e164')
          .eq('organization_id', org).eq('user_id', job.assignee_id).maybeSingle(),
        db.from('task_notification_verified_phones').select('phone_e164,verified_at')
          .eq('organization_id', org).eq('user_id', job.assignee_id).maybeSingle(),
      ])
      const taskRow = task.data, userPref = pref.data
      const phone = userPref?.whatsapp_phone_e164
      const allowed = !!taskRow && !!member.data && !!userPref?.whatsapp_enabled &&
        !!userPref.whatsapp_consented_at && validPhone(phone) &&
        (!directory.data?.phone_e164 || directory.data.phone_e164 === phone) &&
        !!verified.data?.verified_at && verified.data.phone_e164 === phone &&
        taskRow.assignee_id === job.assignee_id &&
        ['todo','in_progress','blocked'].includes(taskRow.status) &&
        !!taskRow.reminder_enabled && Array.isArray(taskRow.reminder_channels) &&
        taskRow.reminder_channels.includes('whatsapp') &&
        (job.event_type !== 'due_soon' || taskRow.due_at === job.task_due_at) &&
        !expired(job.scheduled_at, job.event_type === 'assigned' ? 60 : 180)
      if (!allowed) {
        await db.from('task_notification_outbox').update({
          status: 'skipped', processed_at: new Date().toISOString(),
          last_error: 'invalid_or_expired_local_reminder',
        }).eq('id', job.id).eq('organization_id', org).eq('status', 'processing')
        continue
      }
      const due = taskRow.due_at
        ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo',
          dateStyle: 'short', timeStyle: 'short' }).format(new Date(taskRow.due_at))
        : 'Sem prazo'
      result.reminders.push({
        jobId: job.id, phone,
        text: (job.event_type === 'assigned' ? 'Nova tarefa atribuída' : 'Tarefa próxima do prazo') +
          ' no RealTalent\nTarefa: ' + String(taskRow.title || 'Tarefa').slice(0, 120) +
          '\nPrazo: ' + due + '\nAcesse: ' + (link() || 'https://crm-real-talent.vercel.app'),
      })
    }
    return json({ ok: true, ...result })
  }

  if (action === 'ack') {
    if (body.kind === 'command') {
      if (!uuid(body.requestId)) return json({ error: 'invalid_command_id' }, 400)
      const { error: updateError } = await db.from('whatsapp_local_bridge').update({
        requested_action: null, completed_request_id: body.requestId,
        last_error: safeError(body.error), updated_at: new Date().toISOString(),
      }).eq('organization_id', org).eq('request_id', body.requestId)
      if (updateError) return json({ error: 'ack_unavailable' }, 503)
      return json({ ok: true })
    }
    if (body.kind === 'verification') {
      if (!uuid(body.userId)) return json({ error: 'invalid_user' }, 400)
      if (typeof body.providerMessageId === 'string' && body.providerMessageId.length > 0) {
        const { error: ackError } = await db.from('whatsapp_local_phone_challenges')
          .update({ sent_at: new Date().toISOString() })
          .eq('organization_id', org).eq('user_id', body.userId).is('sent_at', null)
        if (ackError) return json({ error: 'ack_unavailable' }, 503)
      }
      return json({ ok: true })
    }
    if (body.kind === 'reminder') {
      if (!uuid(body.jobId)) return json({ error: 'invalid_job_id' }, 400)
      const accepted = typeof body.providerMessageId === 'string' &&
        body.providerMessageId.length >= 2 && body.providerMessageId.length < 300
      const { error: updateError } = await db.from('task_notification_outbox').update({
        status: accepted ? 'sent' : 'blocked',
        processed_at: new Date().toISOString(),
        provider_message_id: accepted ? body.providerMessageId : null,
        last_error: accepted ? null : 'local_delivery_outcome_unknown_no_automatic_retry',
      }).eq('organization_id', org).eq('id', body.jobId).eq('status','processing').eq('channel','whatsapp')
      if (updateError) return json({ error: 'ack_unavailable' }, 503)
      return json({ ok: true })
    }
    return json({ error: 'invalid_ack' }, 400)
  }
  return json({ error: 'unknown_action' }, 400)
})
