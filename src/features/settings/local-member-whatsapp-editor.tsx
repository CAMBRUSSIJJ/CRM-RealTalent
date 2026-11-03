import { useEffect, useState } from 'react'
import { BellRing, Check, Phone, Save } from 'lucide-react'
import type { WorkspaceMember } from '../../domain/types'
import { Button } from '../../components/ui/button'
import { updateLocalWorkspaceMemberWhatsApp } from '../../repositories/local-workspace-member-repository'
import { normalizeTeamWhatsAppNumber } from '../../services/team-whatsapp-directory'
import { syncGatewayLocalTaskAutoMember } from '../../services/local-communications-gateway'

interface Props { member: WorkspaceMember; workspaceId: string; onSaved(): Promise<void> }

export function LocalMemberWhatsAppEditor({ member, workspaceId, onSaved }: Props) {
  const [phone, setPhone] = useState(member.whatsappPhone ?? '')
  const [consent, setConsent] = useState(Boolean(member.whatsappConsentRecordedAt))
  const [automatic, setAutomatic] = useState(Boolean(member.whatsappAutoEnabledAt))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    setPhone(member.whatsappPhone ?? '')
    setConsent(Boolean(member.whatsappConsentRecordedAt))
    setAutomatic(Boolean(member.whatsappAutoEnabledAt))
    setError('')
  }, [member.userId, member.whatsappPhone, member.whatsappConsentRecordedAt, member.whatsappAutoEnabledAt])
  const stored = member.whatsappPhone ?? ''
  const normalized = normalizeTeamWhatsAppNumber(phone)
  const changedPhone = normalized !== stored || Boolean(phone.trim()) && !normalized
  const changed = changedPhone || consent !== Boolean(member.whatsappConsentRecordedAt) || automatic !== Boolean(member.whatsappAutoEnabledAt)
  const save = async () => {
    if (saving) return
    setSaving(true); setError('')
    try {
      const updated = updateLocalWorkspaceMemberWhatsApp(workspaceId, member.userId, phone, consent, automatic)
      await onSaved()
      try {
        await syncGatewayLocalTaskAutoMember({ workspaceId,userId:updated.userId,phone:updated.whatsappPhone||'',
          consentAt:updated.whatsappConsentRecordedAt||null,autoEnabledAt:updated.whatsappAutoEnabledAt||null })
      } catch {
        setError('Contato salvo no CRM, mas o agendador local está indisponível. Abra o Communications Gateway para ativar ou cancelar os avisos automáticos.')
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Erro ao salvar WhatsApp.') }
    finally { setSaving(false) }
  }
  return <div className="local-member-wa" aria-label={`Notificações de ${member.displayName}`}>
    <label className="local-member-wa__phone"><Phone size={15}/><span>WhatsApp</span>
      <input type="tel" inputMode="tel" placeholder="+55 DDD número" value={phone} disabled={saving}
        onChange={event => { setPhone(event.target.value); if (event.target.value.trim() !== stored) { setConsent(false); setAutomatic(false) } }} />
    </label>
    <label className="local-member-wa__consent">
      <input type="checkbox" checked={consent} disabled={saving || !normalized}
        onChange={event => { setConsent(event.target.checked); if(!event.target.checked) setAutomatic(false) }}/>
      <span>Confirmo que o colaborador autorizou avisos de tarefas neste número.</span>
    </label>
    <label className="local-member-wa__consent local-member-wa__automation">
      <input type="checkbox" checked={automatic} disabled={saving || !consent || !normalized}
        onChange={event => setAutomatic(event.target.checked)}/>
      <span><BellRing size={13}/> Enviar avisos de tarefas automaticamente pelo WhatsApp QR conectado (experimental).</span>
    </label>
    <small className="local-member-wa__helper">Ativação individual e revogável. O gateway local precisa continuar ligado; o QR é uma integração não oficial e o recebimento não é garantido. Recomendamos um teste manual antes de ativar.</small>
    <div className="local-member-wa__bottom">
      <small>{stored
        ? member.whatsappConsentRecordedAt ? member.whatsappAutoEnabledAt ? 'Contato autorizado · agendamento automático habilitado no cadastro (verifique gateway)' : 'Contato cadastrado · autorizado · automático desligado' 
          : 'Contato cadastrado · autorização pendente'
        : 'Nenhum WhatsApp cadastrado'}</small>
      {changed ? <Button variant="secondary" size="sm" disabled={saving || Boolean(phone.trim() && !normalized)}
        onClick={() => void save()}><Save size={14}/> Salvar WhatsApp</Button> : null}
    </div>
    {consent && normalized ? <small className="local-member-wa__helper"><Check size={13}/>
      A autorização declarada não verifica o telefone. Para avisos automáticos, ative a opção experimental acima e mantenha o Communications Gateway conectado. Para o canal oficial é necessária a integração da Meta.
    </small> : null}
    {error ? <small className="local-member-wa__error" role="alert">{error}</small> : null}
  </div>
}
