import { setTimeout as delay } from 'node:timers/promises'

export class UpstreamError extends Error {
  constructor(service, status) {
    super(service + ' HTTP ' + status)
    this.service = service
    this.status = status
  }
}
export function safeQr(value) {
  if (typeof value !== 'string' || value.length > 500000) return null
  const payload = value.replace(/^data:image\/png;base64,/, '')
  return /^iVBORw0KGgo[A-Za-z0-9+/=\r\n]+$/.test(payload)
    ? 'data:image/png;base64,' + payload : null
}
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

export function createLocalBridge(config, { fetcher = fetch, now = Date.now } = {}) {
  const organization = String(config.ORGANIZATION_ID || '')
  if (!uuid(organization)) throw new Error('ORGANIZATION_ID inválido. Copie o workspace do CRM.')
  const supabase = new URL(config.SUPABASE_URL || 'http://invalid')
  if (supabase.protocol !== 'https:' || supabase.username || supabase.password ||
      supabase.pathname !== '/' || supabase.search || supabase.hash)
    throw new Error('SUPABASE_URL deve ser HTTPS e conter somente o domínio.')
  const evo = new URL(config.EVOLUTION_API_URL || 'http://evolution:8080')
  if (!['evolution', '127.0.0.1', 'localhost'].includes(evo.hostname) ||
      evo.protocol !== 'http:' || evo.username || evo.password || evo.pathname !== '/' ||
      evo.search || evo.hash) throw new Error('Evolution precisa ficar na rede interna Docker.')
  if (!config.SUPABASE_SERVICE_ROLE_KEY || String(config.EVOLUTION_API_KEY || '').length < 32)
    throw new Error('Configure as credenciais somente no arquivo .env local.')
  const website = new URL(config.CRM_PUBLIC_URL || 'http://invalid')
  if (website.protocol !== 'https:' || website.username || website.password || website.search || website.hash)
    throw new Error('CRM_PUBLIC_URL precisa ser uma URL HTTPS sem credenciais.')
  const instance = 'realtalent-' + organization.toLowerCase()
  const filters = values => new URLSearchParams(values).toString()
  const byOrganization = { organization_id: 'eq.' + organization }

  async function request(service, path, method = 'GET', payload, prefer = '') {
    const base = service === 'Supabase' ? supabase.origin : evo.origin
    const headers = service === 'Supabase'
      ? { apikey: config.SUPABASE_SERVICE_ROLE_KEY, authorization: 'Bearer ' + config.SUPABASE_SERVICE_ROLE_KEY }
      : { apikey: config.EVOLUTION_API_KEY }
    headers['content-type'] = 'application/json'
    if (prefer) headers.prefer = prefer
    const response = await fetcher(base + path, {
      method, headers, redirect: 'error', signal: AbortSignal.timeout(15000),
      body: payload === undefined ? undefined : JSON.stringify(payload),
    })
    if (!response.ok) throw new UpstreamError(service, response.status)
    if (response.status === 204 || prefer.includes('return=minimal')) return null
    return response.json()
  }
  const evolution = (path, method, data) => request('Evolution', path, method, data)
  const rpc = (name, data) => request('Supabase', '/rest/v1/rpc/' + name, 'POST', data)
  const patch = (table, where, data) => request('Supabase',
    '/rest/v1/' + table + '?' + filters(where), 'PATCH', data, 'return=minimal')
  const one = async (table, where, fields) => {
    const result = await request('Supabase', '/rest/v1/' + table + '?' +
      filters({ select: fields, ...where, limit: '1' }))
    return result[0] || null
  }

  async function connection() {
    try {
      const result = await evolution('/instance/connectionState/' + instance)
      return result.instance?.state || 'close'
    } catch (error) {
      if (error instanceof UpstreamError && error.service === 'Evolution' && error.status === 404)
        return 'missing'
      throw error
    }
  }
  async function pulse() {
    const state = await connection()
    const changes = { organization_id: organization, heartbeat_at: new Date(now()).toISOString(),
      connection_state: state === 'open' ? 'open' : state === 'missing' ? 'missing' :
        state === 'connecting' ? 'connecting' : 'close',
      updated_at: new Date(now()).toISOString() }
    if (state === 'open') Object.assign(changes, {
      qr_base64: null, qr_expires_at: null, last_error: null,
    })
    await request('Supabase', '/rest/v1/whatsapp_local_bridge?on_conflict=organization_id',
      'POST', changes, 'resolution=merge-duplicates,return=minimal')
    return state
  }
  async function commands() {
    const commands = await rpc('claim_whatsapp_local_action', { p_organization_id: organization })
    for (const cmd of commands || []) {
      if (cmd.organization_id !== organization) throw new Error('Comando de outro workspace recusado.')
      let changes
      try {
        if (cmd.requested_action === 'disconnect') {
          const state = await connection()
          if (state !== 'missing' && state !== 'close')
            await evolution('/instance/logout/' + instance, 'DELETE')
          changes = { connection_state: 'close', qr_base64: null, qr_expires_at: null, last_error: null }
        } else if (cmd.requested_action === 'connect') {
          let state = await connection()
          let image = null
          if (state === 'missing') {
            try {
              const created = await evolution('/instance/create', 'POST', {
                instanceName: instance, integration: 'WHATSAPP-BAILEYS', qrcode: true,
              })
              image = safeQr(created.qrcode?.base64 || created.base64)
            } catch (error) {
              if (!(error instanceof UpstreamError) ||
                  error.service !== 'Evolution' || ![403, 409].includes(error.status)) throw error
              state = await connection()
              if (state === 'missing') throw error
            }
          }
          if (state === 'open') changes = {
            connection_state: 'open', qr_base64: null, qr_expires_at: null, last_error: null,
          }
          else {
            if (!image) {
              const connected = await evolution('/instance/connect/' + instance)
              image = safeQr(connected.base64 || connected.qrcode?.base64)
            }
            changes = { connection_state: 'connecting',
              qr_base64: image, qr_expires_at: image ? new Date(now() + 40_000).toISOString() : null,
              last_error: image ? null : 'O QR ainda não está pronto. Gere novamente em alguns segundos.' }
          }
        } else throw new Error('Ação inválida.')
      } catch {
        changes = { connection_state: 'error', qr_base64: null, qr_expires_at: null,
          last_error: 'Falha no conector local. Verifique os serviços e solicite novo QR.' }
      }
      await patch('whatsapp_local_bridge', {
        ...byOrganization, request_id: 'eq.' + cmd.request_id,
      }, { ...changes, requested_action: null, completed_request_id: cmd.request_id,
        updated_at: new Date(now()).toISOString() })
    }
    return (commands || []).length
  }
  async function verifyPhones() {
    if (await connection() !== 'open') return 0
    const challenges = await rpc('claim_whatsapp_local_phone_codes', { p_organization_id: organization })
    for (const item of challenges || []) {
      if (item.organization_id !== organization) throw new Error('Código de outro workspace recusado.')
      const where = { ...byOrganization, user_id: 'eq.' + item.user_id }
      try {
        const [pref, member] = await Promise.all([
          one('task_notification_preferences', where, 'whatsapp_enabled,whatsapp_phone_e164,whatsapp_consented_at'),
          one('organization_members', where, 'user_id'),
        ])
        if (!member || !pref?.whatsapp_enabled || !pref?.whatsapp_consented_at ||
            pref.whatsapp_phone_e164 !== item.phone_e164) continue
        const result = await evolution('/message/sendText/' + instance, 'POST', {
          number: item.phone_e164.replace('+', ''),
          text: 'RealTalent: seu código de verificação é ' + item.code +
            '. Válido por 5 minutos. Não compartilhe.',
        })
        if (!result.key?.id) continue
        await patch('whatsapp_local_phone_challenges', where, { sent_at: new Date(now()).toISOString() })
      } catch {
        // Do not blindly retry an unconfirmed send. The user can request another code.
      }
    }
    return (challenges || []).length
  }
  async function reminders() {
    if (await connection() !== 'open') return 0
    const jobs = await rpc('claim_whatsapp_local_jobs', { p_organization_id: organization })
    for (const job of jobs || []) {
      if (job.organization_id !== organization || job.channel !== 'whatsapp')
        throw new Error('Job fora do workspace ou canal proibido.')
      const where = { ...byOrganization, id: 'eq.' + job.id, status: 'eq.processing' }
      const finish = (status, data = {}) => patch('task_notification_outbox', where,
        { status, processed_at: new Date(now()).toISOString(), ...data })
      let attempted = false
      try {
        const [task, pref, member, directory, verified] = await Promise.all([
          one('work_tasks', { ...byOrganization, id: 'eq.' + job.task_id },
            'assignee_id,title,due_at,status,priority,reminder_enabled,reminder_channels'),
          one('task_notification_preferences', { ...byOrganization, user_id: 'eq.' + job.assignee_id },
            'whatsapp_enabled,whatsapp_phone_e164,whatsapp_consented_at'),
          one('organization_members', { ...byOrganization, user_id: 'eq.' + job.assignee_id }, 'user_id'),
          one('team_member_notification_contacts', { ...byOrganization, user_id: 'eq.' + job.assignee_id }, 'phone_e164'),
          one('task_notification_verified_phones', { ...byOrganization, user_id: 'eq.' + job.assignee_id }, 'phone_e164,verified_at'),
        ])
        const phone = String(pref?.whatsapp_phone_e164 || '')
        const ageMinutes = (now() - Date.parse(job.scheduled_at)) / 60000
        const stale = !Number.isFinite(ageMinutes) || ageMinutes > (job.event_type === 'assigned' ? 60 : 180)
        const allowed = task && member && pref?.whatsapp_enabled && pref?.whatsapp_consented_at &&
          /^\+[1-9][0-9]{7,14}$/.test(phone) &&
          (!directory?.phone_e164 || directory.phone_e164 === phone) &&
          verified?.verified_at && verified.phone_e164 === phone &&
          task.assignee_id === job.assignee_id && ['todo', 'in_progress', 'blocked'].includes(task.status) &&
          task.reminder_enabled && Array.isArray(task.reminder_channels) &&
          task.reminder_channels.includes('whatsapp') &&
          (job.event_type !== 'due_soon' || task.due_at === job.task_due_at) && !stale
        if (!allowed) {
          await finish('skipped', { last_error: 'invalid_or_expired_local_reminder' })
          continue
        }
        const due = task.due_at
          ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo',
            dateStyle: 'short', timeStyle: 'short' }).format(new Date(task.due_at))
          : 'Sem prazo'
        const message = (job.event_type === 'assigned' ? 'Nova tarefa atribuída' : 'Tarefa próxima do prazo') +
          ' no RealTalent\nTarefa: ' + String(task.title || 'Tarefa').slice(0, 120) +
          '\nPrazo: ' + due + '\nAcesse: ' + website.origin
        attempted = true
        const sent = await evolution('/message/sendText/' + instance, 'POST', {
          number: phone.substring(1), text: message,
        })
        if (!sent.key?.id) throw new Error('Send outcome uncertain')
        await finish('sent', { provider_message_id: String(sent.key.id), last_error: null })
      } catch {
        // A timeout or lost ACK after POST can mean the phone already received it.
        // The queue is BLOCKED, not re-sent, so no duplicate reminders.
        await finish('blocked', {
          last_error: attempted ? 'local_delivery_uncertain_review_before_resend'
            : 'local_delivery_validation_failed',
        })
      }
    }
    return (jobs || []).length
  }
  return { connection, pulse, commands, verifyPhones, reminders }
}

async function main() {
  const bridge = createLocalBridge(process.env)
  const shutdown = new AbortController()
  for (const name of ['SIGTERM', 'SIGINT']) process.on(name, () => shutdown.abort())
  async function loop(name, task, delayMs) {
    while (!shutdown.signal.aborted) {
      try { await task() }
      catch { console.error('RealTalent connector: ' + name + ' temporariamente indisponível (sem expor credenciais).') }
      try { await delay(delayMs, undefined, { signal: shutdown.signal }) } catch { break }
    }
  }
  console.log('RealTalent WhatsApp local iniciado: sem portas externas e sem Railway.')
  await Promise.all([
    loop('heartbeat', bridge.pulse, 10_000),
    loop('commands', bridge.commands, 3_000),
    loop('verification', bridge.verifyPhones, 6_000),
    loop('reminders', bridge.reminders, 15_000),
  ])
}
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href)
  main().catch(() => { console.error('Revise a configuração local do conector.'); process.exitCode = 1 })
