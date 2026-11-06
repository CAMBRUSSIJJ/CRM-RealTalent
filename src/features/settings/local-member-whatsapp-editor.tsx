import { useEffect, useState } from 'react'
import { BellRing, Check, Phone, Save } from 'lucide-react'
import type { WorkspaceMember } from '../../domain/types'
import { Button } from '../../components/ui/button'
import { updateLocalWorkspaceMemberWhatsApp } from '../../repositories/local-workspace-member-repository'
import { normalizeTeamWhatsAppNumber } from '../../services/team-whatsapp-directory'
import { loadGatewayLocalTaskMemberStatus, syncGatewayLocalTaskAutoMember } from '../../services/local-communications-gateway'

interface Props { member: WorkspaceMember; workspaceId: string; onSaved(): Promise<void> }

export function LocalMemberWhatsAppEditor({ member, workspaceId, onSaved }: Props) {
  const [phone, setPhone] = useState(member.whatsappPhone ?? '')
  const [consent, setConsent] = useState(Boolean(member.whatsappConsentRecordedAt))
  const [automatic, setAutomatic] = useState(Boolean(member.whatsappAutoEnabledAt))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [remoteActive, setRemoteActive] = useState<boolean | null>(null)
  useEffect(() => {
    setPhone(member.whatsappPhone ?? '')
    setConsent(Boolean(member.whatsappConsentRecordedAt))
    setAutomatic(Boolean(member.whatsappAutoEnabledAt))
    setError('')
  }, [member.userId, member.whatsappPhone, member.whatsappConsentRecordedAt, member.whatsappAutoEnabledAt])
  useEffect(() => {
    let live = true
    setRemoteActive(null)
    if (!workspaceId || !member.userId) return
    void loadGatewayLocalTaskMemberStatus(workspaceId,member.userId).then(result => {
      if(live)setRemoteActive(result.active)
    }).catch(() => { if(live)setRemoteActive(null) })
    return () => { live=false }
  }, [workspaceId,member.userId,member.whatsappAutoEnabledAt])

  const isWahaPreview = import.meta.env.VITE_WAHA_DIRECT_PREVIEW === '1'
  const transportName = isWahaPreview ? 'WAHA GOWS local' : 'WhatsApp QR conectado'
  const stored = member.whatsappPhone ?? ''
  const normalized = normalizeTeamWhatsAppNumber(phone)
  const changedPhone = normalized !== stored || Boolean(phone.trim()) && !normalized
  const needsGatewayConfirmation = automatic && remoteActive === false
  const changed = changedPhone || consent !== Boolean(member.whatsappConsentRecordedAt) ||
    automatic !== Boolean(member.whatsappAutoEnabledAt) || needsGatewayConfirmation
  const save = async () => {
    if (saving) return
    setSaving(true); setError('')
    try {
      const normalizedPhone = phone.trim() ? normalizeTeamWhatsAppNumber(phone) : null
      if (phone.trim() && !normalizedPhone) throw new Error('Informe um WhatsApp válido com DDD.')
      const recordedAt = new Date().toISOString()
      const consentAt = normalizedPhone && consent
        ? (member.whatsappPhone === normalizedPhone && member.whatsappConsentRecordedAt || recordedAt)
        : null
      const autoEnabledAt = consentAt && automatic
        ? (member.whatsappPhone === normalizedPhone && member.whatsappAutoEnabledAt || recordedAt)
        : null
      // The gateway must acknowledge opt-in AND revocation before local data
      // is changed. A disconnected gateway is not allowed to retain an
      // active schedule while the interface claims revocation succeeded.
      const remote = await syncGatewayLocalTaskAutoMember({
        workspaceId, userId:member.userId, phone:normalizedPhone || '', consentAt, autoEnabledAt,
      })
      setRemoteActive(remote.active)
      if (autoEnabledAt && !remote.active) throw new Error('O gateway não confirmou a ativação automática.')
      try {
        updateLocalWorkspaceMemberWhatsApp(workspaceId, member.userId, phone, consent, automatic)
        await onSaved()
      } catch (error) {
        // Fail closed in the server if local persistence could not commit.
        await syncGatewayLocalTaskAutoMember({
          workspaceId, userId:member.userId,phone:normalizedPhone || '',consentAt:null,autoEnabledAt:null,
        }).catch(() => {})
        setRemoteActive(false)
        throw error
      }
    } catch (err) {
      setError((err instanceof Error ? err.message : 'Erro ao salvar WhatsApp.') +
        (isWahaPreview ? ' Confirme se a ponte WAHA local está acessível. A ativação depende da confirmação do servidor.' : ' Confirme se o Communications Gateway está ativo. Alterações na automação exigem confirmação do servidor.'))
    }
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
      <span><BellRing size={13}/> Enviar avisos de tarefas automaticamente pelo {transportName} (experimental).</span>
    </label>
    <small className="local-member-wa__helper">Ativação individual e revogável. {isWahaPreview
      ? 'A ponte WAHA no computador Linux precisa permanecer ativa. O WAHA Web não comprova entrega nem substitui a integração oficial da Meta.'
      : 'O Communications Gateway precisa continuar ligado; o QR não é a API oficial e não garante recebimento.'} Teste com um contato autorizado antes de ativar.</small>
    {automatic && remoteActive === false ? <small role="status" className="local-member-wa__error">
      Automação ainda não confirmada no gateway. Clique em “Confirmar no gateway” para concluir a ativação.
    </small> : null}
    {automatic && remoteActive === true ? <small role="status" className="local-member-wa__helper">
      Gateway confirmou a ativação deste colaborador.
    </small> : null}
    <div className="local-member-wa__bottom">
      <small>{stored
        ? member.whatsappConsentRecordedAt ? member.whatsappAutoEnabledAt ? 'Contato autorizado · agendamento automático habilitado no cadastro (verifique gateway)' : 'Contato cadastrado · autorizado · automático desligado' 
          : 'Contato cadastrado · autorização pendente'
        : 'Nenhum WhatsApp cadastrado'}</small>
      {changed ? <Button variant="secondary" size="sm" disabled={saving || Boolean(phone.trim() && !normalized)}
        onClick={() => void save()}><Save size={14}/>{needsGatewayConfirmation ? 'Confirmar no gateway' : 'Salvar WhatsApp'}</Button> : null}
    </div>
    {consent && normalized ? <small className="local-member-wa__helper"><Check size={13}/>
      A autorização declarada não verifica o telefone. Para avisos automáticos, mantenha {transportName} ativo e confira o status do gateway. Para o canal oficial é necessária a integração da Meta.
    </small> : null}
    {error ? <small className="local-member-wa__error" role="alert">{error}</small> : null}
  </div>
}
