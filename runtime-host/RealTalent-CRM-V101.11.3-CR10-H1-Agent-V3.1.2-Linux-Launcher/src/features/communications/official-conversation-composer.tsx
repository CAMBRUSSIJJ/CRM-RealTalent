import { NativeSelectionSelect } from '../../components/selection'
import { Mail, MessageCircle, RefreshCw, Send } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/ui/button'
import type { CommunicationChannel, Lead } from '../../domain/types'
import { connectedAccountLabel, loadCommunicationChannelState, sendOfficialEmail } from '../../services/communication-workspace'
import type { ConnectedAccount } from '../../services/integration-framework'
import { normalizeWhatsAppPhone, sendOfficialWhatsApp } from '../../services/whatsapp-workspace'
import { classifyCommercialFailure, clearRecoveryDraft, readRecoveryDraft, writeRecoveryDraft } from '../../services/commercial-failure-recovery'

export function OfficialConversationComposer({
  lead, workspaceId, initialChannel, countryCode, preferredWhatsAppAccountId, readOnly = false, onSent, onError,
}: {
  lead: Lead
  workspaceId: string
  initialChannel?: CommunicationChannel | null
  countryCode: string
  preferredWhatsAppAccountId?: string
  readOnly?: boolean
  onSent(message: string): void
  onError(message: string): void
}) {
  const [channel, setChannel] = useState<'email' | 'whatsapp'>(() => initialChannel === 'whatsapp' ? 'whatsapp' : 'email')
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [accountId, setAccountId] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [sending, setSending] = useState(false)
  const draftKey = `communication:${workspaceId}:${lead.id}`

  const loadAccounts = async () => {
    setLoadingAccounts(true)
    try {
      const state = await loadCommunicationChannelState(workspaceId)
      const next = channel === 'email' ? state.emailAccounts : state.whatsappAccounts
      setAccounts(next)
      const preferred = channel === 'whatsapp' && preferredWhatsAppAccountId ? next.find((item) => item.id === preferredWhatsAppAccountId) : null
      setAccountId((current) => next.some((item) => item.id === current) ? current : preferred?.id ?? next[0]?.id ?? '')
    } catch (error) {
      setAccounts([]); setAccountId('')
      onError(error instanceof Error ? error.message : 'Não foi possível carregar as contas conectadas.')
    } finally { setLoadingAccounts(false) }
  }

  useEffect(() => { void loadAccounts() }, [channel, workspaceId])
  useEffect(() => {
    if (initialChannel === 'email' || initialChannel === 'whatsapp') setChannel(initialChannel)
  }, [initialChannel])
  useEffect(() => {
    const recovered = readRecoveryDraft<{ subject?: string; body?: string; channel?: 'email' | 'whatsapp' }>(draftKey)
    if (recovered?.subject) setSubject(recovered.subject)
    else setSubject((current) => current || `Contato · ${lead.company || lead.name}`)
    if (recovered?.body) setBody(recovered.body)
    if (recovered?.channel) setChannel(recovered.channel)
  }, [draftKey, lead.company, lead.name])
  useEffect(() => { if (body.trim()) writeRecoveryDraft(draftKey, { subject, body, channel }) }, [body, channel, draftKey, subject])

  const account = useMemo(() => accounts.find((item) => item.id === accountId) ?? null, [accountId, accounts])
  const recipient = channel === 'email' ? lead.email.trim() : normalizeWhatsAppPhone(lead.phone, countryCode)
  const canSend = Boolean(!readOnly && account && recipient && body.trim() && (channel !== 'email' || subject.trim()) && !lead.doNotContact)

  const send = async () => {
    if (!account || !canSend) return
    setSending(true)
    try {
      if (channel === 'email') {
        const event = await sendOfficialEmail({ workspaceId, leadId: lead.id, contactId: lead.primaryContactId ?? null, accountId: account.id, recipient, subject: subject.trim(), body: body.trim() })
        onSent(event.status === 'sent' ? 'E-mail enviado pelo CRM.' : 'E-mail registrado e colocado na fila de envio.')
      } else {
        const event = await sendOfficialWhatsApp({ workspaceId, leadId: lead.id, contactId: lead.primaryContactId ?? null, accountId: account.id, recipient, body: body.trim() })
        onSent(event.status === 'sent' ? 'WhatsApp enviado pelo CRM.' : 'WhatsApp registrado e colocado na fila de envio.')
      }
      clearRecoveryDraft(draftKey)
      setBody('')
    } catch (error) {
      const recovery = classifyCommercialFailure(error)
      writeRecoveryDraft(draftKey, { subject, body, channel })
      onError(`${recovery.title}. ${recovery.message}`)
    }
    finally { setSending(false) }
  }

  return <section className="official-composer-v10184">
    <header className="official-composer-v10184__header">
      <div><span className="eyebrow">Responder pelo CRM</span><strong>Comunicação oficial</strong></div>
      <div className="official-composer-v10184__channels">
        <button type="button" className={channel === 'email' ? 'is-active' : ''} onClick={() => setChannel('email')}><Mail size={15}/> E-mail</button>
        <button type="button" className={channel === 'whatsapp' ? 'is-active' : ''} onClick={() => setChannel('whatsapp')}><MessageCircle size={15}/> WhatsApp</button>
      </div>
    </header>
    {!accounts.length ? <div className="official-composer-v10184__empty"><span>Nenhuma conta oficial de {channel === 'email' ? 'e-mail' : 'WhatsApp'} conectada. Conecte em Configurações → Integrações.</span><Button size="sm" variant="ghost" loading={loadingAccounts} onClick={() => void loadAccounts()}><RefreshCw size={14}/> Verificar</Button></div> : <>
      <div className="official-composer-v10184__meta">
        <label className="field"><span>Enviar por</span><NativeSelectionSelect value={accountId} onChange={(event) => setAccountId(event.target.value)}>{accounts.map((item) => <option value={item.id} key={item.id}>{connectedAccountLabel(item)}</option>)}</NativeSelectionSelect></label>
        <label className="field"><span>Para</span><input value={recipient} readOnly /></label>
      </div>
      {channel === 'email' ? <label className="field"><span>Assunto</span><input value={subject} disabled={readOnly} onChange={(event) => setSubject(event.target.value)} /></label> : null}
      <label className="field"><span>Mensagem</span><textarea rows={5} value={body} disabled={readOnly} onChange={(event) => setBody(event.target.value)} placeholder={channel === 'email' ? 'Escreva o e-mail…' : 'Escreva a mensagem do WhatsApp…'} /></label>
      <footer><small>{lead.doNotContact ? 'Contato bloqueado pela política do CRM.' : account ? `Conta: ${account.displayName}` : ''}</small><Button loading={sending} disabled={!canSend || sending} onClick={() => void send()}><Send size={15}/> Enviar pelo CRM</Button></footer>
    </>}
  </section>
}
