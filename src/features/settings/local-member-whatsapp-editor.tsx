import { useEffect, useState } from 'react'
import { Check, Phone, Save } from 'lucide-react'
import type { WorkspaceMember } from '../../domain/types'
import { Button } from '../../components/ui/button'
import { updateLocalWorkspaceMemberWhatsApp } from '../../repositories/local-workspace-member-repository'
import { normalizeTeamWhatsAppNumber } from '../../services/team-whatsapp-directory'

interface Props { member: WorkspaceMember; workspaceId: string; onSaved(): Promise<void> }

export function LocalMemberWhatsAppEditor({ member, workspaceId, onSaved }: Props) {
  const [phone, setPhone] = useState(member.whatsappPhone ?? '')
  const [consent, setConsent] = useState(Boolean(member.whatsappConsentRecordedAt))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    setPhone(member.whatsappPhone ?? '')
    setConsent(Boolean(member.whatsappConsentRecordedAt))
    setError('')
  }, [member.userId, member.whatsappPhone, member.whatsappConsentRecordedAt])
  const stored = member.whatsappPhone ?? ''
  const normalized = normalizeTeamWhatsAppNumber(phone)
  const changedPhone = normalized !== stored || Boolean(phone.trim()) && !normalized
  const changed = changedPhone || consent !== Boolean(member.whatsappConsentRecordedAt)
  const save = async () => {
    if (saving) return
    setSaving(true); setError('')
    try {
      updateLocalWorkspaceMemberWhatsApp(workspaceId, member.userId, phone, consent)
      await onSaved()
    } catch (err) { setError(err instanceof Error ? err.message : 'Erro ao salvar WhatsApp.') }
    finally { setSaving(false) }
  }
  return <div className="local-member-wa" aria-label={`Notificações de ${member.displayName}`}>
    <label className="local-member-wa__phone"><Phone size={15}/><span>WhatsApp</span>
      <input type="tel" inputMode="tel" placeholder="+55 DDD número" value={phone} disabled={saving}
        onChange={event => { setPhone(event.target.value); if (event.target.value.trim() !== stored) setConsent(false) }} />
    </label>
    <label className="local-member-wa__consent">
      <input type="checkbox" checked={consent} disabled={saving || !normalized}
        onChange={event => setConsent(event.target.checked)}/>
      <span>Confirmo que o colaborador autorizou avisos de tarefas neste número.</span>
    </label>
    <div className="local-member-wa__bottom">
      <small>{stored
        ? member.whatsappConsentRecordedAt ? 'Contato cadastrado · autorização registrada · número não verificado'
          : 'Contato cadastrado · autorização pendente'
        : 'Nenhum WhatsApp cadastrado'}</small>
      {changed ? <Button variant="secondary" size="sm" disabled={saving || Boolean(phone.trim() && !normalized)}
        onClick={() => void save()}><Save size={14}/> Salvar WhatsApp</Button> : null}
    </div>
    {consent && normalized ? <small className="local-member-wa__helper"><Check size={13}/>
      A autorização declarada não verifica o telefone nem ativa envios automáticos. O canal externo precisa estar configurado no servidor.
    </small> : null}
    {error ? <small className="local-member-wa__error" role="alert">{error}</small> : null}
  </div>
}
