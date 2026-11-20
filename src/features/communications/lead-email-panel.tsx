import { ArrowDownLeft, ArrowUpRight, Mail, RefreshCw, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { StatusPill } from '../../components/ui/status-pill'
import { formatDateTime } from '../../domain/formatters'
import type { Lead } from '../../domain/types'
import { createUuid } from '../../lib/id'
import {
  emailStatusLabel, listLeadEmails, loadMyEmailAccount, requestSettingsTab, sendLeadEmail, validateLeadEmail,
  type LeadEmail, type MyEmailAccount,
} from '../../services/email-account'

const statusTone = (status: string) => status === 'sent' || status === 'received' ? 'success' as const : status === 'failed' ? 'danger' as const : 'info' as const

// E-mails do contato: histórico (enviados e recebidos pelo Gmail de quem conectou) e envio pelo CRM.
export function LeadEmailPanel({ lead, readOnly = false }: { lead: Lead; readOnly?: boolean }) {
  const { currentWorkspace, repositoryMode, setRoute, notify } = useApp()
  const [account, setAccount] = useState<MyEmailAccount | null>(null)
  const [emails, setEmails] = useState<LeadEmail[]>([])
  const [loading, setLoading] = useState(false)
  const [composing, setComposing] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sendKey, setSendKey] = useState(createUuid)
  const [expanded, setExpanded] = useState<string | null>(null)
  const hosted = repositoryMode === 'supabase'

  const refresh = async () => {
    if (!currentWorkspace || !hosted) return
    setLoading(true)
    try {
      const [mine, history] = await Promise.all([loadMyEmailAccount(currentWorkspace.id), listLeadEmails(currentWorkspace.id, lead.id)])
      setAccount(mine); setEmails(history)
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível carregar os e-mails.') }
    finally { setLoading(false) }
  }
  useEffect(() => { setComposing(false); setSubject(''); setBody(''); setExpanded(null); void refresh() }, [lead.id, currentWorkspace?.id])

  // Enquanto houver e-mail na fila, confere de novo em alguns segundos para mostrar Enviado ou Falhou.
  useEffect(() => {
    if (!emails.some((item) => item.status === 'queued' || item.status === 'processing')) return
    const timer = window.setTimeout(() => { void refresh() }, 8000)
    return () => window.clearTimeout(timer)
  }, [emails])

  if (!hosted) return null
  const ready = Boolean(account && account.status === 'connected' && account.canSend)
  const blocked = lead.doNotContact

  const send = async () => {
    if (!currentWorkspace || !account) return
    const problem = validateLeadEmail({ recipient: lead.email, subject, body })
    if (problem) { notify('error', problem); return }
    setSending(true)
    try {
      await sendLeadEmail({ workspaceId: currentWorkspace.id, leadId: lead.id, accountId: account.id, recipient: lead.email, subject, body, idempotencyKey: sendKey })
      notify('success', 'E-mail na fila de envio. Ele sai pelo seu Gmail em até um minuto.')
      setComposing(false); setSubject(''); setBody(''); setSendKey(createUuid())
      await refresh()
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível enviar.') }
    finally { setSending(false) }
  }
  const goConnect = () => { requestSettingsTab('integrations'); setRoute('settings') }

  return <section className="lead-drawer__section lead-email-panel">
    <div className="lead-drawer__section-title">
      <div><span className="eyebrow">Comunicação</span><h3>E-mails</h3></div>
      <Button variant="ghost" size="sm" loading={loading} onClick={() => void refresh()} aria-label="Atualizar e-mails"><RefreshCw size={15} /></Button>
    </div>
    {!account ? <div className="lead-email-panel__connect">
      <Mail size={18} />
      <span><strong>Envie pelo seu Gmail</strong><small>Conecte sua conta para enviar daqui e ver as respostas deste contato.</small></span>
      <Button size="sm" variant="secondary" onClick={goConnect}>Conectar Gmail</Button>
    </div> : null}
    {account && !ready ? <div className="warning-box"><strong>Seu Gmail precisa de atenção</strong><span>{account.lastError || 'Abra Configurações › Integrações para conectar de novo.'}</span></div> : null}
    {ready && !readOnly && !composing ? <div className="settings-actions">
      <Button size="sm" disabled={!lead.email || blocked} onClick={() => setComposing(true)}><Send size={15} /> Escrever e-mail</Button>
      {!lead.email ? <small>Cadastre o e-mail do contato para escrever.</small> : blocked ? <small>Contato marcado para não receber contato.</small> : <small>Sai de {account?.email}</small>}
    </div> : null}
    {composing ? <div className="lead-email-panel__compose">
      <div className="lead-email-panel__to"><span>Para</span><strong>{lead.email}</strong></div>
      <label className="field"><span>Assunto</span><input value={subject} maxLength={300} onChange={(event) => setSubject(event.target.value)} autoFocus /></label>
      <label className="field"><span>Mensagem</span><textarea rows={7} value={body} onChange={(event) => setBody(event.target.value)} /></label>
      <div className="settings-actions">
        <Button size="sm" loading={sending} onClick={() => void send()}><Send size={15} /> Enviar</Button>
        <Button size="sm" variant="ghost" disabled={sending} onClick={() => setComposing(false)}>Cancelar</Button>
      </div>
    </div> : null}
    {emails.length ? <ul className="lead-email-panel__list">
      {emails.map((item) => <li key={item.id}>
        <button type="button" className="lead-email-panel__item" aria-expanded={expanded === item.id} onClick={() => setExpanded(expanded === item.id ? null : item.id)}>
          {item.direction === 'outbound' ? <ArrowUpRight size={15} aria-label="Enviado" /> : <ArrowDownLeft size={15} aria-label="Recebido" />}
          <span><strong>{item.subject}</strong><small>{item.direction === 'outbound' ? `Para ${item.recipients[0] || lead.email}` : `De ${item.sender}`} · {formatDateTime(item.occurredAt)}</small></span>
          <StatusPill tone={statusTone(item.status)}>{emailStatusLabel(item.status)}</StatusPill>
        </button>
        {expanded === item.id ? <p className="lead-email-panel__body">{item.bodyText || 'Sem texto.'}</p> : null}
      </li>)}
    </ul> : account ? <p className="lead-email-panel__empty">Nenhum e-mail com este contato ainda.</p> : null}
  </section>
}
