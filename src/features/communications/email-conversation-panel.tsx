import { useEffect, useMemo, useState } from 'react'
import { Info, Mail, RefreshCw, Send, WifiOff } from 'lucide-react'
import { NativeSelectionSelect } from '../../components/selection'
import { Button } from '../../components/ui/button'
import type { Lead } from '../../domain/types'
import { formatDateTime } from '../../domain/formatters'
import { connectedAccountLabel, sendOfficialEmail, type UnifiedCommunicationItem } from '../../services/communication-workspace'
import type { ConnectedAccount } from '../../services/integration-framework'

const eventSender = (item: UnifiedCommunicationItem, lead: Lead) => {
  if (item.direction === 'inbound') return String(item.metadata?.senderAddress || lead.email || lead.name)
  return 'Você'
}
const cleanReplySubject = (value: string) => {
  const subject = value.trim()
  if (!subject) return ''
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`
}

export function EmailConversationPanel({
  lead, events, workspaceId, accounts, loading, readOnly = false, onSync, onOpenLeadContext, onSent, onError,
}: {
  lead: Lead | null
  events: UnifiedCommunicationItem[]
  workspaceId: string
  accounts: ConnectedAccount[]
  loading: boolean
  readOnly?: boolean
  onSync(): void
  onOpenLeadContext?(): void
  onSent(message: string): void
  onError(message: string): void
}) {
  const orderedEvents = useMemo(() => [...events].filter((item) => item.channel === 'email').sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt)), [events])
  const lastSubject = [...orderedEvents].reverse().find((item) => item.subject.trim())?.subject ?? ''
  const [accountId, setAccountId] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    setAccountId((current) => accounts.some((item) => item.id === current) ? current : accounts[0]?.id ?? '')
  }, [accounts])
  useEffect(() => {
    setSubject(lastSubject ? cleanReplySubject(lastSubject) : lead ? `Contato · ${lead.company || lead.name}` : '')
    setBody('')
  }, [lead?.id, lastSubject])

  const account = accounts.find((item) => item.id === accountId) ?? null
  const recipient = lead?.email.trim() ?? ''
  const canSend = Boolean(!readOnly && lead && account && recipient && subject.trim() && body.trim() && !lead.doNotContact)

  const send = async () => {
    if (!lead || !account || !canSend) return
    setSending(true)
    try {
      const event = await sendOfficialEmail({ workspaceId, leadId: lead.id, contactId: lead.primaryContactId ?? null, accountId: account.id, recipient, subject: subject.trim(), body: body.trim() })
      setBody('')
      onSent(event.status === 'sent' ? 'E-mail enviado pelo CRM.' : 'E-mail registrado e colocado na fila de envio.')
    } catch (error) { onError(error instanceof Error ? error.message : 'Não foi possível enviar o e-mail.') }
    finally { setSending(false) }
  }

  if (!lead) return <section className="email-workspace-panel email-workspace-panel--empty"><Mail size={34}/><strong>Selecione uma conversa de e-mail</strong><p>O histórico da thread e o composer oficial aparecerão aqui.</p></section>

  return <section className="email-workspace-panel">
    <header className="email-workspace-header">
      <button type="button" className="email-workspace-identity" onClick={onOpenLeadContext} disabled={!onOpenLeadContext}>
        <span className="email-workspace-avatar">{lead.name.slice(0, 2).toUpperCase()}</span>
        <span><small>Conversa por e-mail</small><strong>{lead.name}</strong><em>{lead.email || 'E-mail não informado'}{lead.company ? ` · ${lead.company}` : ''}</em></span>
        {onOpenLeadContext ? <Info size={16}/> : null}
      </button>
      <div className="email-workspace-header__actions"><span className={`email-account-health ${accounts.length ? 'is-connected' : ''}`}><i/><span><strong>{accounts.length ? `${accounts.length} conta(s) conectada(s)` : 'E-mail desconectado'}</strong><small>{accounts.length ? 'Gmail / Outlook oficial' : 'Conecte uma conta para responder'}</small></span></span><Button size="sm" variant="secondary" loading={loading} onClick={onSync}><RefreshCw size={15}/> Sincronizar</Button>{onOpenLeadContext ? <Button size="sm" variant="ghost" onClick={onOpenLeadContext}><Info size={15}/> Lead</Button> : null}</div>
    </header>

    <div className="email-thread">
      {orderedEvents.length ? orderedEvents.map((item) => <article key={item.id} className={`email-message-card is-${item.direction}`}>
        <div className="email-message-card__avatar">{item.direction === 'inbound' ? lead.name.slice(0,2).toUpperCase() : 'RT'}</div>
        <div className="email-message-card__content">
          <header><div><strong>{eventSender(item, lead)}</strong><span>{item.direction === 'inbound' ? 'para você' : `para ${lead.email}`}</span></div><time>{formatDateTime(item.occurredAt)}</time></header>
          {item.subject ? <h4>{item.subject}</h4> : null}
          <p>{item.body || 'Mensagem sem conteúdo textual.'}</p>
          <footer><span>{item.direction === 'inbound' ? 'Recebido' : item.status === 'sent' ? 'Enviado' : item.status === 'delivered' ? 'Entregue' : item.status}</span>{item.official ? <b>Oficial</b> : <b>CRM</b>}</footer>
        </div>
      </article>) : <div className="email-thread__empty"><Mail size={28}/><strong>Nenhum e-mail nesta conversa</strong><p>Escreva a primeira mensagem abaixo para iniciar a thread.</p></div>}
    </div>

    <div className="email-composer">
      {!accounts.length ? <div className="email-composer__connection"><WifiOff size={17}/><span><strong>Conecte Gmail ou Outlook para enviar pelo CRM.</strong><small>O histórico continua disponível; o envio oficial exige uma conta conectada em Integrações.</small></span><Button size="sm" variant="secondary" loading={loading} onClick={onSync}>Verificar</Button></div> : <>
        <div className="email-composer__meta"><label><span>De</span><NativeSelectionSelect value={accountId} onChange={(event) => setAccountId(event.target.value)}>{accounts.map((item) => <option key={item.id} value={item.id}>{connectedAccountLabel(item)}</option>)}</NativeSelectionSelect></label><label><span>Para</span><input value={recipient} readOnly /></label></div>
        <label className="email-composer__subject"><span>Assunto</span><input value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
        <div className="email-composer__body"><textarea rows={4} value={body} disabled={readOnly} onChange={(event) => setBody(event.target.value)} placeholder="Escreva uma resposta..."/><div className="email-composer__footer"><small>{lead.doNotContact ? 'Contato bloqueado pela política do CRM.' : account ? `Enviando por ${account.displayName}` : ''}</small><Button loading={sending} disabled={!canSend || sending} onClick={() => void send()}><Send size={15}/> Enviar e-mail</Button></div></div>
      </>}
    </div>
  </section>
}
