import { useEffect, useState, type FormEvent } from 'react'
import { getSupabaseClient } from '../../lib/supabase'
import { Button } from '../../components/ui/button'
import { TaskReminderTestLauncher } from './task-reminder-test-launcher'

interface Props { workspaceId: string | null; userId: string | null; enabled: boolean }
interface ReminderReadiness {
  databaseReady: boolean
  deliveryEnabled: boolean
  internalEnabled: boolean
  appUrlConfigured: boolean
  schedulerAuthenticated: boolean
  emailCredentialsPresent: boolean
  whatsappCredentialsPresent: boolean
}
interface Preferences {
  email_enabled: boolean
  whatsapp_enabled: boolean
  whatsapp_phone_e164: string
  whatsapp_consented_at: string | null
}
const localWhatsAppBridge = import.meta.env.VITE_WHATSAPP_CONNECTION_MODE === 'bridge'
const defaults: Preferences = { email_enabled: false, whatsapp_enabled: false, whatsapp_phone_e164: '', whatsapp_consented_at: null }
const phoneValid = (text: string) => /^\+[1-9][0-9]{7,14}$/.test(text.trim())

/** Independent of the browser notification toggles: these settings apply to this assignee across devices. */
export function TaskReminderPreferencesPanel({ workspaceId, userId, enabled }: Props) {
  const [preferences, setPreferences] = useState<Preferences>(defaults)
  const [consent, setConsent] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [readiness, setReadiness] = useState<ReminderReadiness | null>(null)
  const [readinessError, setReadinessError] = useState(false)

  useEffect(() => {
    if (!enabled || !workspaceId || !userId) { setLoading(false); return }
    let live = true
    setLoading(true)
    const client = getSupabaseClient()
    if (!client) {
      setMessage('Não foi possível acessar o Supabase para carregar os lembretes.')
      setLoading(false)
      return
    }
    void Promise.all([
      (client as any).from('task_notification_preferences')
        .select('email_enabled,whatsapp_enabled,whatsapp_phone_e164,whatsapp_consented_at')
        .eq('organization_id',workspaceId).eq('user_id',userId).maybeSingle(),
      (client as any).from('team_member_notification_contacts')
        .select('phone_e164').eq('organization_id',workspaceId).eq('user_id',userId).maybeSingle(),
    ]).then(([result, directory]: [any, any]) => {
      if (!live) return
      if (result.error) { setMessage('Preferências de lembretes indisponíveis até aplicar a migração do módulo.'); return }
      const data = result.data
      const directoryPhone = !directory.error && typeof directory.data?.phone_e164 === 'string'
        ? directory.data.phone_e164.trim() : ''
      const previousPhone = String(data?.whatsapp_phone_e164 || '')
      const phoneChanged = Boolean(directoryPhone && directoryPhone !== previousPhone)
      const next: Preferences = {
        email_enabled: Boolean(data?.email_enabled),
        whatsapp_enabled: Boolean(data?.whatsapp_enabled),
        whatsapp_phone_e164: directoryPhone || previousPhone,
        // A manager's change in the directory cannot silently transfer the employee's consent.
        whatsapp_consented_at: phoneChanged ? null : data?.whatsapp_consented_at ?? null,
      }
      setPreferences(next)
      setConsent(Boolean(next.whatsapp_enabled && next.whatsapp_consented_at))
      setMessage(phoneChanged
        ? 'Seu telefone foi alterado em Equipes. Confirme o número e autorize novamente o envio de avisos. A verificação do número continua obrigatória.'
        : directory.error
          ? 'Diretório de Equipes indisponível; utilizando o telefone salvo nas suas preferências.'
          : '')
    }).catch(() => { if (live) setMessage('Não foi possível consultar seus contatos e preferências.') })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [enabled, workspaceId, userId])

  useEffect(() => {
    if (!enabled || !workspaceId || !userId) return
    let mounted = true
    const client = getSupabaseClient()
    if (!client) return
    void client.functions.invoke('task-reminder-readiness', {
      body: { organizationId: workspaceId },
    }).then(({ data, error }) => {
      if (!mounted) return
      if (error || !data?.ok) { setReadinessError(true); return }
      setReadiness(data as ReminderReadiness)
      setReadinessError(false)
    }).catch(() => { if (mounted) setReadinessError(true) })
    return () => { mounted = false }
  }, [enabled, workspaceId, userId])

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!workspaceId || !userId || !enabled) return
    const wantsWhatsapp = preferences.whatsapp_enabled
    const phone = preferences.whatsapp_phone_e164.trim()
    if (wantsWhatsapp && (!phoneValid(phone) || !consent)) {
      setMessage('Informe um número internacional válido e autorize expressamente os avisos por WhatsApp.')
      return
    }
    const client = getSupabaseClient()
    if (!client) { setMessage('Conecte o CRM ao Supabase para salvar preferências.'); return }
    setSaving(true)
    setMessage('')
    // Persist the employee's number in the shared Teams directory first.
    // This is contact data only; it must never create a verified phone or permission to send.
    if (wantsWhatsapp && phone) {
      const { error: directoryError } = await (client as any).from('team_member_notification_contacts').upsert({
        organization_id: workspaceId, user_id: userId,
        phone_e164: phone, updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,user_id' })
      if (directoryError) {
        setMessage('Não foi possível sincronizar o número com Equipes. Verifique sua sessão e as permissões.')
        setSaving(false)
        return
      }
    }
    const { error } = await (client as any).from('task_notification_preferences').upsert({
      organization_id: workspaceId, user_id: userId,
      email_enabled: preferences.email_enabled,
      whatsapp_enabled: wantsWhatsapp,
      whatsapp_phone_e164: phone || null,
      whatsapp_consented_at: wantsWhatsapp && consent ? (preferences.whatsapp_consented_at || new Date().toISOString()) : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,user_id' })
    setMessage(error ? 'Não foi possível salvar. Verifique sua sessão e as políticas do Supabase.'
      : wantsWhatsapp ? (localWhatsAppBridge ? 'Preferências salvas. Conecte o WhatsApp e confirme o número na aba WhatsApp.' : 'Preferências salvas. O WhatsApp ficará pendente até a verificação do número e a ativação do modelo oficial.')
      : 'Preferências de lembretes salvas.')
    if (!error && !wantsWhatsapp) setConsent(false)
    setSaving(false)
  }

  if (!enabled) return <article className="panel"><div className="panel__heading"><div><h3>Lembretes de tarefas</h3><p>Modo local: regras salvas neste dispositivo, sem agendamento externo.</p></div></div><TaskReminderTestLauncher workspaceId={workspaceId} userId={userId} /></article>

  return <article className="panel" aria-label="Lembretes externos de tarefas">
    <div className="panel__heading"><div>
      <span className="eyebrow">Notificações da equipe</span>
      <h3>Receber lembretes quando me atribuírem tarefas</h3>
      <p>As tarefas atribuídas a você geram avisos no CRM. Escolha se deseja receber avisos externos adicionais.</p>
    </div></div>
    <div className="settings-copy" role="status">
      <strong>Estado do envio:</strong>{' '}
      {readiness ? [
        readiness.databaseReady ? 'Banco preparado' : 'Banco não migrado',
        readiness.schedulerAuthenticated ? 'Autenticação do agendador HTTP presente' : 'Agendador HTTP externo não configurado',
        readiness.emailCredentialsPresent ? 'Credenciais de e-mail presentes (entrega não verificada)' : 'E-mail não configurado',
        localWhatsAppBridge ? 'Conector local: consulte a aba WhatsApp' : readiness.whatsappCredentialsPresent ? 'Credenciais de WhatsApp presentes (modelo não verificado)' : 'WhatsApp oficial não configurado',
        readiness.internalEnabled ? 'Worker de avisos internos habilitado' : 'Worker de avisos internos pela Edge desativado (o CRM usa agendamento próprio no banco)',
        readiness.deliveryEnabled ? 'Envios externos liberados pelo servidor' : 'Envios externos desativados',
      ].join(' · ') : readinessError
        ? 'Diagnóstico indisponível. Os lembretes externos ainda não estão confirmados.'
        : 'Consultando configurações do serviço…'}
    </div>
    <form onSubmit={(event) => void save(event)} className="settings-form-grid">
      <label className="settings-toggle"><input type="checkbox" disabled={loading || saving}
        checked={preferences.email_enabled} onChange={(event) => setPreferences((p) => ({ ...p, email_enabled: event.target.checked }))} />
        <span>E-mail no meu endereço de acesso ao RealTalent</span>
      </label>
      <label className="settings-toggle"><input type="checkbox" disabled={loading || saving}
        checked={preferences.whatsapp_enabled} onChange={(event) => setPreferences((p) => ({ ...p, whatsapp_enabled: event.target.checked }))} />
        <span>{localWhatsAppBridge ? 'Receber lembretes pelo conector WhatsApp local (exige consentimento e código)' : 'Solicitar lembretes por WhatsApp (exige número verificado e integração oficial)'}</span>
      </label>
      {preferences.whatsapp_enabled ? <>
        <label className="field"><span>Meu WhatsApp com código do país (sincronizado com Equipes)</span>
          <input type="tel" inputMode="tel" autoComplete="tel" placeholder="+5551999999999"
            value={preferences.whatsapp_phone_e164} onChange={(event) => setPreferences((p) => ({ ...p, whatsapp_phone_e164: event.target.value }))} />
        </label>
        <label className="settings-toggle"><input type="checkbox" checked={consent} disabled={saving || loading}
          onChange={(event) => { setConsent(event.target.checked); setPreferences((p) => ({ ...p, whatsapp_consented_at: null })) }} />
          <span>Autorizo o RealTalent a enviar avisos operacionais de tarefas ao meu número informado.</span>
        </label>
        <p className="settings-copy">Você pode cadastrar o número uma única vez em Equipes → Pessoas. Se o gestor alterá-lo, confirme novamente aqui. O cadastro não valida o telefone: WhatsApp automático exige consentimento e número verificado. {localWhatsAppBridge ? 'A confirmação por código está na aba WhatsApp.' : 'O envio oficial também exige um modelo aprovado.'}</p>
      </> : null}
      <div className="settings-actions"><Button type="submit" disabled={!workspaceId || !userId || loading || saving} loading={saving}>Salvar preferências de tarefas</Button></div>
      {message ? <p role="status" className="settings-copy">{message}</p> : null}
    </form>
    <TaskReminderTestLauncher workspaceId={workspaceId} userId={userId} />
  </article>
}
