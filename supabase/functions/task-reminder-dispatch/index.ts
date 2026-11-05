import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

// Service-to-service worker. Never expose this key to a browser or use user JWTs.
const env = (name: string) => (Deno.env.get(name) || '').trim()
const reply = (payload: unknown, code = 200) => new Response(JSON.stringify(payload), { status: code, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
const isE164 = (value: string) => /^\+[1-9][0-9]{7,14}$/.test(value)
const overdueTask = (task: any) => !task || !['todo', 'in_progress', 'blocked'].includes(task.status)
const retryAfter = (attempt: number) => new Date(Date.now() + Math.min(60, 2 ** Math.min(attempt + 1, 5)) * 60_000).toISOString()
const parseEmail = (value: unknown) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null
const appUrl = () => {
  const configured = env('TASK_REMINDER_APP_URL')
  try { const url = new URL(configured); return url.protocol === 'https:' ? url.origin : null } catch { return null }
}
const dueLabel = (date: string | null) => date
  ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(date))
  : 'Sem prazo'

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405)
  const cronSecret = env('TASK_REMINDER_CRON_SECRET')
  const supplied = req.headers.get('x-task-reminder-secret') || ''
  if (cronSecret.length < 32 || !env('SUPABASE_SERVICE_ROLE_KEY')) return reply({ error: 'worker_not_configured' }, 503)
  if (supplied !== cronSecret) return reply({ error: 'unauthorized' }, 401)
  // Independent kill switches: allow internal notifications to be tested
  // before any outbound e-mail or WhatsApp messages are enabled.
  const internalEnabled = env('TASK_REMINDER_INTERNAL_ENABLED') === 'true'
  const externalEnabled = env('TASK_REMINDER_DELIVERY_ENABLED') === 'true'
  if (!internalEnabled && !externalEnabled) return reply({ ok: true, internalEnabled, externalEnabled, processed: 0 })
  const link = appUrl()
  if (!link) return reply({ error: 'verified_crm_url_required' }, 503)

  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
  let pending = db.from('task_notification_outbox')
    .select('id').eq('status', 'pending').lte('scheduled_at', new Date().toISOString())
  if (!internalEnabled) pending = pending.neq('channel', 'in_app')
  if (!externalEnabled) pending = pending.eq('channel', 'in_app')
  // The paired computer owns WhatsApp jobs in bridge mode. Never claim them in cloud.
  if (env('WHATSAPP_CONNECTION_MODE') === 'bridge') pending = pending.neq('channel', 'whatsapp')
  const { data: candidates, error } = await pending.order('scheduled_at', { ascending: true }).limit(25)
  if (error) return reply({ error: 'queue_unavailable' }, 503)

  const summary = { claimed: 0, sent: 0, skipped: 0, blocked: 0, failed: 0, retried: 0 }
  for (const candidate of candidates || []) {
    // Atomic claim: at most one concurrent worker gets this row.
    const { data: job } = await db.from('task_notification_outbox')
      .update({ status: 'processing', claimed_at: new Date().toISOString() })
      .eq('id', candidate.id).eq('status', 'pending').select('*').maybeSingle()
    if (!job) continue
    summary.claimed++
    const finish = async (status: string, updates: Record<string, unknown> = {}) => {
      await db.from('task_notification_outbox').update({
        status, processed_at: new Date().toISOString(), ...updates,
      }).eq('id', job.id).eq('status', 'processing')
      if (status in summary) summary[status as keyof typeof summary]++
    }
    try {
      const { data: task } = await db.from('work_tasks').select('id,organization_id,assignee_id,title,priority,due_at,status').eq('id', job.task_id).eq('organization_id', job.organization_id).maybeSingle()
      // Discard stale notification snapshots after downtime instead of spamming.
      if (Date.now() - Date.parse(job.scheduled_at) > (job.event_type === 'assigned' ? 60 : 180) * 60_000) {
        await finish('skipped', { last_error: 'stale_reminder_expired' })
        continue
      }
      if (overdueTask(task) || task.assignee_id !== job.assignee_id || (job.event_type === 'due_soon' && task.due_at !== job.task_due_at)) {
        await finish('skipped')
        continue
      }
      const { data: member } = await db.from('organization_members').select('user_id').eq('organization_id', job.organization_id).eq('user_id', job.assignee_id).maybeSingle()
      if (!member) { await finish('skipped'); continue }

      const { data: prefs } = await db.from('task_notification_preferences').select('*').eq('organization_id', job.organization_id).eq('user_id', job.assignee_id).maybeSingle()
      const subject = job.event_type === 'assigned' ? 'Nova tarefa atribuída no RealTalent' : 'Sua tarefa está próxima do prazo'
      const safeTitle = String(task.title || 'Tarefa').slice(0, 120)
      const message = `${subject}

Tarefa: ${safeTitle}
Prazo: ${dueLabel(task.due_at)}
Prioridade: ${String(task.priority)}
Acesse: ${link}`

      if (job.channel === 'in_app') {
        const { data: existing } = await db.from('seller_notifications').select('id').eq('organization_id', job.organization_id).eq('source_type', 'task-reminder').eq('source_id', job.id).maybeSingle()
        if (!existing) {
          const { error: insertError } = await db.from('seller_notifications').insert({
            organization_id: job.organization_id, user_id: job.assignee_id, lead_id: null,
            source_type: 'task-reminder', source_id: job.id, title: subject, body: message,
            severity: task.priority === 'urgent' ? 'warning' : 'info', status: 'unread', action_route: 'tasks',
          })
          if (insertError) throw new Error('in_app_persistence_failed')
        }
        await finish('sent')
        continue
      }

      if (job.channel === 'email') {
        if (!prefs?.email_enabled) { await finish('skipped'); continue }
        const apiKey = env('RESEND_API_KEY'), from = env('TASK_REMINDER_FROM_EMAIL')
        if (!apiKey || !parseEmail(from)) { await finish('blocked', { last_error: 'email_provider_not_configured' }); continue }
        const { data: userResult, error: userError } = await db.auth.admin.getUserById(job.assignee_id)
        const to = parseEmail(userResult?.user?.email)
        if (userError || !to || !userResult?.user?.email_confirmed_at) { await finish('blocked', { last_error: 'recipient_email_not_verified' }); continue }
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': String(job.id) },
          body: JSON.stringify({ from, to: [to], subject, text: message }),
          signal: AbortSignal.timeout(15_000),
        })
        if (response.ok) {
          const payload = await response.json().catch(() => ({}))
          await finish('sent', { provider_message_id: typeof payload.id === 'string' ? payload.id : null })
        } else if (response.status >= 500 && job.attempt_count < 3) {
          await finish('pending', { scheduled_at: retryAfter(job.attempt_count), attempt_count: job.attempt_count + 1, processed_at: null, last_error: 'transient_email_provider_failure' })
          summary.retried++
        } else await finish('failed', { last_error: `email_provider_http_${response.status}` })
        continue
      }

      if (job.channel === 'whatsapp') {
        if (!prefs?.whatsapp_enabled || !prefs.whatsapp_consented_at) { await finish('skipped'); continue }
        const { data: directory, error: directoryError } = await db.from('team_member_notification_contacts')
          .select('phone_e164').eq('organization_id', job.organization_id).eq('user_id', job.assignee_id).maybeSingle()
        if (directoryError) { await finish('blocked', { last_error: 'team_contact_directory_unavailable' }); continue }
        const recipientPhone = directory?.phone_e164 || prefs.whatsapp_phone_e164 || ''
        if (!isE164(recipientPhone)) { await finish('blocked', { last_error: 'recipient_phone_missing' }); continue }
        // Consent is tied to the exact phone authorized by the employee.
        // Updating a member's directory number must NOT silently authorize an unverified recipient.
        if (recipientPhone !== prefs.whatsapp_phone_e164) {
          await finish('blocked', { last_error: 'directory_phone_change_requires_employee_reconsent' }); continue
        }
        const { data: verified } = await db.from('task_notification_verified_phones').select('phone_e164,verified_at')
          .eq('organization_id', job.organization_id).eq('user_id', job.assignee_id).maybeSingle()
        if (!verified?.verified_at || verified.phone_e164 !== recipientPhone) { await finish('blocked', { last_error: 'phone_verification_required' }); continue }
        const token = env('TASK_REMINDER_META_TOKEN'), phoneId = env('TASK_REMINDER_META_PHONE_ID')
        const template = env('TASK_REMINDER_META_TEMPLATE_NAME'), graphVersion = env('TASK_REMINDER_META_GRAPH_VERSION')
        if (!token || !/^\d+$/.test(phoneId) || !template || !/^v\d+\.\d+$/.test(graphVersion)) { await finish('blocked', { last_error: 'approved_whatsapp_template_or_credentials_missing' }); continue }
        const to = recipientPhone.replace('+', '')
        const body = {
          messaging_product: 'whatsapp', to, type: 'template',
          template: { name: template, language: { code: 'pt_BR' }, components: [
            { type: 'body', parameters: [
              { type: 'text', text: safeTitle },
              { type: 'text', text: dueLabel(task.due_at) },
              { type: 'text', text: link },
            ] },
          ] },
        }
        const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneId}/messages`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
        })
        if (response.ok) {
          const payload = await response.json().catch(() => ({}))
          await finish('sent', { provider_message_id: payload.messages?.[0]?.id || null })
        } else {
          // Do not retry Meta requests blindly: the first attempt may have been accepted.
          await finish('failed', { last_error: `whatsapp_provider_http_${response.status}` })
        }
        continue
      }
      await finish('skipped')
    } catch {
      // Outbound outcome may be unknown on timeouts; never create duplicate WA messages.
      await finish('blocked', { last_error: 'delivery_outcome_unknown_requires_review' })
    }
  }
  return reply({ ok: true, summary })
})
