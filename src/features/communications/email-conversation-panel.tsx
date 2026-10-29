import { useEffect, useMemo, useState } from 'react'
import { Info, Mail, RefreshCw, Send, WifiOff, Cloud, ShieldCheck } from 'lucide-react'
import { NativeSelectionSelect } from '../../components/selection'
import { Button } from '../../components/ui/button'
import type { Lead } from '../../domain/types'
import { formatDateTime } from '../../domain/formatters'
import { connectedAccountLabel, sendOfficialEmail, type UnifiedCommunicationItem } from '../../services/communication-workspace'
import {beginOAuthConnection, type ConnectedAccount} from '../../services/integration-framework'
import {loadCommunicationsGatewayHealth,type CommunicationsGatewayHealth} from '../../services/local-communications-gateway'
import {emailConnectGate,localOAuthCallbacks} from './email-connection-s37'

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
  lead, events, workspaceId, accounts, loading, readOnly = false, onSync, onOpenLeadContext, onSent, onError, repositoryMode, canConnect,
}: {
  lead: Lead | null
  events: UnifiedCommunicationItem[]
  workspaceId: string
  accounts: ConnectedAccount[]
  loading: boolean
  readOnly?: boolean
  repositoryMode:'local'|'supabase'
  canConnect:boolean
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
  const [connectBusy,setConnectBusy]=useState<'google'|'microsoft'|null>(null)
  const [connectionError,setConnectionError]=useState('')
  const [gatewayHealth,setGatewayHealth]=useState<CommunicationsGatewayHealth|null>(null)
  const [gatewayLoading,setGatewayLoading]=useState(false)
  const checkGateway=async()=>{
    if(repositoryMode!=='local')return
    setGatewayLoading(true)
    try{setGatewayHealth(await loadCommunicationsGatewayHealth());setConnectionError('')}
    catch(error){setGatewayHealth(null);setConnectionError(error instanceof Error?error.message:'Gateway local não respondeu.')}
    finally{setGatewayLoading(false)}
  }
  useEffect(()=>{if(repositoryMode==='local'&&!accounts.length)void checkGateway()},[repositoryMode,accounts.length])
  const connect=async(provider:'google'|'microsoft')=>{
    if(!canConnect)return
    setConnectBusy(provider);setConnectionError('')
    try{
      const result=await beginOAuthConnection(workspaceId,provider)
      if(result.url){window.location.assign(result.url);return}
      setConnectionError(result.message||'O provedor não retornou a página de autorização.')
    }catch(error){setConnectionError(error instanceof Error?error.message:'Não foi possível iniciar o OAuth.')}
    finally{setConnectBusy(null)}
  }

  useEffect(() => {
    setAccountId((current) => accounts.some((item) => item.id === current) ? current : accounts[0]?.id ?? '')
  }, [accounts])
  useEffect(() => {
    setSubject(lastSubject ? cleanReplySubject(lastSubject) : lead ? `Contato · ${lead.company || lead.name}` : '')
    setBody('')
  }, [lead?.id, lastSubject])

  const googleGate=emailConnectGate(repositoryMode,gatewayHealth,'google',canConnect)
  const microsoftGate=emailConnectGate(repositoryMode,gatewayHealth,'microsoft',canConnect)
  const callbacks=localOAuthCallbacks()
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

  if(!accounts.length) return <section className="email-workspace-panel email-onboarding-s37" aria-label="Conectar e-mail ao RealTalent">
    <div className="email-onboarding-s37__body">
      <div className="email-onboarding-s37__icon"><Mail size={25}/></div>
      <h3>Conecte seu e-mail ao RealTalent</h3>
      <p>Leia e responda mensagens na Central de Comunicação. O envio só ficará disponível depois que o provedor confirmar a autorização da conta.</p>
      <div className="email-onboarding-s37__providers">
        <button type="button" disabled={!googleGate.ready||Boolean(connectBusy)} onClick={()=>void connect('google')}>
          <strong>Google Gmail</strong><small>{connectBusy==='google'?'Abrindo autorização…':!googleGate.ready?googleGate.reason:'Conectar com Google'}</small>
        </button>
        <button type="button" disabled={!microsoftGate.ready||Boolean(connectBusy)} onClick={()=>void connect('microsoft')}>
          <strong>Microsoft Outlook</strong><small>{connectBusy==='microsoft'?'Abrindo autorização…':!microsoftGate.ready?microsoftGate.reason:'Conectar com Microsoft'}</small>
        </button>
      </div>
      {repositoryMode==='local'?<div className="email-onboarding-s37__setup">
        <ShieldCheck size={16}/><div><strong>{gatewayHealth?.ok?'Gateway local respondendo':'Verifique o gateway local'}</strong>
        <p>{gatewayHealth?.ok?'A autorização será realizada diretamente no Google ou Microsoft; tokens ficam no gateway.':'Inicie o CRM pelo launcher do RealTalent para habilitar o gateway de comunicação.'}</p>
        {gatewayHealth?.ok&&!gatewayHealth.providers.google&&!gatewayHealth.providers.microsoft?
          <p>Para configurar o OAuth, execute <code>bash configure-communications-local.sh</code> na pasta da versão, cadastre as URLs de retorno na plataforma escolhida e reinicie o RealTalent.</p>:null}
        <details><summary>URLs de retorno do OAuth local</summary>
          <code>Google: {callbacks.google}</code><br/>
          <code>Microsoft: {callbacks.microsoft}</code>
          <p>As URLs cadastradas no Google Cloud ou Microsoft Entra precisam corresponder exatamente às do gateway.</p>
        </details></div>
      </div>:<div className="email-onboarding-s37__setup"><Cloud size={16}/><p>No workspace hospedado, o OAuth e os workers de e-mail devem estar implantados no Supabase antes de conectar.</p></div>}
      {connectionError?<p className="email-onboarding-s37__error" role="alert">{connectionError}</p>:null}
      {!canConnect?<p className="email-onboarding-s37__error">Somente quem possui permissão para administrar integrações pode conectar uma conta.</p>:null}
      <Button variant="secondary" loading={gatewayLoading||loading} onClick={()=>{void checkGateway();onSync()}}><RefreshCw size={15}/> Verificar conexão</Button>
    </div>
  </section>

  // Imported e-mails can exist before they are matched to a CRM lead.
  // Never hide these genuine provider messages just because the CRM has
  // not associated their sender/recipient with a contact yet.
  if (!lead && orderedEvents.length) return <section className="email-workspace-panel email-workspace-panel--unlinked">
    <header className="email-workspace-header"><div className="email-workspace-panel__unlinked-heading">
      <Mail size={19}/><div><strong>Conversa importada</strong><small>Conta conectada · ainda não vinculada a um contato do CRM</small></div>
    </div><Button size="sm" variant="secondary" loading={loading} onClick={onSync}><RefreshCw size={15}/> Sincronizar</Button></header>
    <div className="email-thread">{orderedEvents.map(item=><article key={item.id} className={`email-message-card is-${item.direction}`}>
      <div className="email-message-card__avatar">{item.direction==='inbound'?'IN':'RT'}</div>
      <div className="email-message-card__content">
        <header><div><strong>{String(item.metadata?.senderAddress||'Remetente')}</strong>
          <span>{item.direction==='inbound'?'recebido':'enviado'}</span></div><time>{formatDateTime(item.occurredAt)}</time></header>
        {item.subject?<h4>{item.subject}</h4>:null}<p>{item.body||'Mensagem sem conteúdo textual.'}</p>
        <footer><span>{item.status==='sent'?'Enviado':item.status==='received'?'Recebido':item.status}</span><b>Oficial</b></footer>
      </div>
    </article>)}</div>
    <div className="email-composer email-composer--unlinked"><Info size={17}/><span>Este e-mail foi recebido, mas ainda não possui um contato associado no CRM. Vincule o remetente a um contato para responder e registrar o relacionamento comercial.</span></div>
  </section>
  if (!lead) return <section className="email-workspace-panel email-workspace-panel--empty"><Mail size={34}/><strong>Selecione uma conversa de e-mail</strong><p>O histórico e a resposta por e-mail aparecem aqui ao escolher um contato. Você já pode sincronizar a caixa conectada.</p></section>

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
