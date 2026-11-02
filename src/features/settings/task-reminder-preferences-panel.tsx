import { useEffect, useState, type FormEvent } from 'react'
import { getSupabaseClient } from '../../lib/supabase'
import { Button } from '../../components/ui/button'

interface Props { workspaceId: string | null; userId: string | null; enabled: boolean }
interface Preferences {
  email_enabled: boolean
  whatsapp_enabled: boolean
  whatsapp_phone_e164: string
  whatsapp_consented_at: string | null
}
const defaults: Preferences = { email_enabled: false, whatsapp_enabled: false, whatsapp_phone_e164: '', whatsapp_consented_at: null }
const phoneValid = (text: string) => /^\+[1-9][0-9]{7,14}$/.test(text.trim())

/** Independent of the browser notification toggles: these settings apply to this assignee across devices. */
export function TaskReminderPreferencesPanel({ workspaceId, userId, enabled }: Props) {
  const [preferences, setPreferences] = useState<Preferences>(defaults)
  const [consent, setConsent] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

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
    void (client as any).from('task_notification_preferences').select('email_enabled,whatsapp_enabled,whatsapp_phone_e164,whatsapp_consented_at')
      .eq('organization_id', workspaceId).eq('user_id', userId).maybeSingle()
      .then(({ data, error }: { data: any; error: any }) => {
        if (!live) return
        if (error) { setMessage('Preferências de lembretes indisponíveis até aplicar a migração do módulo.'); return }
        const next: Preferences = {
          email_enabled: Boolean(data?.email_enabled),
          whatsapp_enabled: Boolean(data?.whatsapp_enabled),
          whatsapp_phone_e164: String(data?.whatsapp_phone_e164 || ''),
          whatsapp_consented_at: data?.whatsapp_consented_at ?? null,
        }
        setPreferences(next)
        setConsent(Boolean(next.whatsapp_enabled && next.whatsapp_consented_at))
        setMessage('')
      })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
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
    const { error } = await (client as any).from('task_notification_preferences').upsert({
      organization_id: workspaceId, user_id: userId,
      email_enabled: preferences.email_enabled,
      whatsapp_enabled: wantsWhatsapp,
      whatsapp_phone_e164: phone || null,
      whatsapp_consented_at: wantsWhatsapp && consent ? (preferences.whatsapp_consented_at || new Date().toISOString()) : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,user_id' })
    setMessage(error ? 'Não foi possível salvar. Verifique sua sessão e as políticas do Supabase.'
      : wantsWhatsapp ? 'Preferências salvas. O WhatsApp ficará pendente até a verificação do número e a ativação do modelo oficial.'
      : 'Preferências de lembretes salvas.')
    if (!error && !wantsWhatsapp) setConsent(false)
    setSaving(false)
  }

  if (!enabled) return <article className="panel"><div className="panel__heading"><div><h3>Lembretes de tarefas para responsáveis</h3><p>Disponíveis no CRM conectado à nuvem. O modo local não envia mensagens externas.</p></div></div></article>

  return <article className="panel" aria-label="Lembretes externos de tarefas">
    <div className="panel__heading"><div>
      <span className="eyebrow">Notificações da equipe</span>
      <h3>Receber lembretes quando me atribuírem tarefas</h3>
      <p>As tarefas atribuídas a você geram avisos no CRM. Escolha se deseja receber avisos externos adicionais.</p>
    </div></div>
    <form onSubmit={(event) => void save(event)} className="settings-form-grid">
      <label className="settings-toggle"><input type="checkbox" disabled={loading || saving}
        checked={preferences.email_enabled} onChange={(event) => setPreferences((p) => ({ ...p, email_enabled: event.target.checked }))} />
        <span>E-mail no meu endereço de acesso ao RealTalent</span>
      </label>
      <label className="settings-toggle"><input type="checkbox" disabled={loading || saving}
        checked={preferences.whatsapp_enabled} onChange={(event) => setPreferences((p) => ({ ...p, whatsapp_enabled: event.target.checked }))} />
        <span>Solicitar lembretes por WhatsApp (exige número verificado e integração oficial)</span>
      </label>
      {preferences.whatsapp_enabled ? <>
        <label className="field"><span>Meu WhatsApp com código do país</span>
          <input type="tel" inputMode="tel" autoComplete="tel" placeholder="+5551999999999"
            value={preferences.whatsapp_phone_e164} onChange={(event) => setPreferences((p) => ({ ...p, whatsapp_phone_e164: event.target.value }))} />
        </label>
        <label className="settings-toggle"><input type="checkbox" checked={consent} disabled={saving || loading}
          onChange={(event) => { setConsent(event.target.checked); setPreferences((p) => ({ ...p, whatsapp_consented_at: null })) }} />
          <span>Autorizo o RealTalent a enviar avisos operacionais de tarefas ao meu número informado.</span>
        </label>
        <p className="settings-copy">O pedido não valida o telefone nem ativa o envio. Até concluir a verificação e aprovar o modelo de mensagem, o WhatsApp permanece bloqueado.</p>
      </> : null}
      <div className="settings-actions"><Button type="submit" disabled={!workspaceId || !userId || loading || saving} loading={saving}>Salvar preferências de tarefas</Button></div>
      {message ? <p role="status" className="settings-copy">{message}</p> : null}
    </form>
  </article>
}
