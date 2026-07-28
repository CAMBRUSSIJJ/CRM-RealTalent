import { CalendarDays, CheckCircle2, Clock3, Inbox, Mail, MessageCircle, RefreshCw, Send, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { StatusPill } from '../../components/ui/status-pill'
import { formatDateTime } from '../../domain/formatters'
import type { CommunicationChannel } from '../../domain/types'
import { buildUnifiedTimeline, communicationChannelLabel, loadCommunicationEvents, sendOfficialCommunication } from '../../services/communications'
import { loadIntegrationFramework, providerLabel, type ConnectedAccount } from '../../services/integration-framework'

const iconFor = (channel: CommunicationChannel) => channel === 'email' ? Mail : channel === 'whatsapp' ? MessageCircle : channel === 'calendar' || channel === 'meeting' ? CalendarDays : Clock3
const accountSupports = (account: ConnectedAccount, channel: 'email' | 'whatsapp') => channel === 'whatsapp' ? account.provider === 'whatsapp_cloud' : ['google', 'microsoft'].includes(account.provider)

export function CommunicationsPage() {
  const { currentWorkspace, snapshot, canWrite, notify } = useApp()
  const [events, setEvents] = useState<Awaited<ReturnType<typeof loadCommunicationEvents>>>([])
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [channel, setChannel] = useState<'all' | CommunicationChannel>('all')
  const [direction, setDirection] = useState<'all' | 'inbound' | 'outbound'>('all')
  const [search, setSearch] = useState('')
  const [leadId, setLeadId] = useState('')
  const [composeChannel, setComposeChannel] = useState<'email' | 'whatsapp'>('email')
  const [accountId, setAccountId] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    if (!currentWorkspace) return
    setLoading(true)
    try {
      const [nextEvents, framework] = await Promise.all([loadCommunicationEvents(currentWorkspace.id), loadIntegrationFramework(currentWorkspace.id)])
      setEvents(nextEvents); setAccounts(framework.accounts.filter((item) => item.status === 'connected'))
    } finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [currentWorkspace?.id])

  const timeline = useMemo(() => snapshot ? buildUnifiedTimeline(snapshot, events) : [], [snapshot, events])
  const filtered = useMemo(() => timeline.filter((item) => {
    if (channel !== 'all' && item.channel !== channel) return false
    if (direction !== 'all' && item.direction !== direction) return false
    const lead = snapshot?.leads.find((candidate) => candidate.id === item.leadId)
    const query = `${item.title} ${item.description} ${lead?.name ?? ''} ${lead?.company ?? ''}`.toLocaleLowerCase('pt-BR')
    return !search.trim() || query.includes(search.trim().toLocaleLowerCase('pt-BR'))
  }), [timeline, channel, direction, search, snapshot])
  const selectedLead = snapshot?.leads.find((item) => item.id === leadId) ?? null
  const compatibleAccounts = accounts.filter((item) => accountSupports(item, composeChannel))
  useEffect(() => { if (!compatibleAccounts.some((item) => item.id === accountId)) setAccountId(compatibleAccounts[0]?.id ?? '') }, [composeChannel, accounts])

  const send = async () => {
    if (!currentWorkspace || !selectedLead) return notify('error', 'Selecione um lead.')
    const recipient = composeChannel === 'email' ? selectedLead.email : selectedLead.phone.replace(/\D/g, '')
    if (!recipient) return notify('error', composeChannel === 'email' ? 'O lead não possui e-mail.' : 'O lead não possui telefone.')
    if (!body.trim()) return notify('error', 'Escreva a mensagem antes de enviar.')
    if (!accountId && compatibleAccounts.length) return notify('error', 'Selecione uma conta conectada.')
    setSending(true)
    try {
      const event = await sendOfficialCommunication({ workspaceId: currentWorkspace.id, leadId: selectedLead.id, accountId: accountId || null, channel: composeChannel, recipient, subject, body })
      setEvents((current) => [event, ...current.filter((item) => item.id !== event.id)])
      setBody(''); setSubject(''); notify('success', event.status === 'queued' ? 'Comunicação colocada na fila oficial.' : 'Comunicação registrada.')
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível enviar.') }
    finally { setSending(false) }
  }

  const inbound = timeline.filter((item) => item.direction === 'inbound').length
  const pending = timeline.filter((item) => ['queued', 'pending', 'failed'].includes(item.status)).length

  return <div className="page-stack communications-page">
    <section className="panel communications-hero">
      <div><span className="eyebrow"><ShieldCheck size={15} /> V100.42 · Canais oficiais</span><h2>Comunicação centralizada no contexto comercial</h2><p>Gmail, Outlook, Google Calendar e WhatsApp alimentam uma única linha do tempo por lead.</p></div>
      <div className="communications-metrics"><span><strong>{timeline.length}</strong> interações</span><span><strong>{inbound}</strong> recebidas</span><span><strong>{pending}</strong> pendentes</span><span><strong>{accounts.length}</strong> contas oficiais</span><Button size="sm" variant="secondary" loading={loading} onClick={() => void refresh()}><RefreshCw size={15} /> Atualizar</Button></div>
    </section>

    <div className="communications-layout">
      <section className="panel communications-timeline-panel">
        <div className="panel__heading"><div><span className="eyebrow">Timeline unificada</span><h3>Histórico de todos os canais</h3></div><Inbox size={21} /></div>
        <div className="communications-filters"><input aria-label="Buscar comunicações" placeholder="Buscar lead, empresa ou conteúdo" value={search} onChange={(event) => setSearch(event.target.value)} /><select value={channel} onChange={(event) => setChannel(event.target.value as typeof channel)}><option value="all">Todos os canais</option><option value="email">E-mail</option><option value="whatsapp">WhatsApp</option><option value="calendar">Calendário</option><option value="call">Ligações</option><option value="meeting">Reuniões</option><option value="note">Notas</option></select><select value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)}><option value="all">Entrada e saída</option><option value="inbound">Recebidas</option><option value="outbound">Enviadas</option></select></div>
        {filtered.length ? <div className="communications-timeline">{filtered.slice(0, 150).map((entry) => { const Icon = iconFor(entry.channel); const lead = snapshot?.leads.find((item) => item.id === entry.leadId); return <article key={entry.id}><span className={`communication-icon communication-icon--${entry.channel}`}><Icon size={16} /></span><div><div className="communication-title"><strong>{entry.title}</strong><StatusPill tone={entry.status === 'failed' ? 'danger' : entry.direction === 'inbound' ? 'info' : entry.status === 'delivered' || entry.status === 'read' || entry.status === 'completed' ? 'success' : 'neutral'}>{entry.detail}</StatusPill></div><p>{entry.description}</p><small>{lead ? `${lead.name} · ${lead.company || 'Sem empresa'} · ` : ''}{formatDateTime(entry.date)} · {communicationChannelLabel[entry.channel]}</small></div></article> })}</div> : <div className="communications-empty"><CheckCircle2 size={23} /><strong>Nenhuma comunicação encontrada</strong><span>Conecte uma conta oficial ou registre uma interação comercial.</span></div>}
      </section>

      <aside className="panel communications-composer">
        <div className="panel__heading"><div><span className="eyebrow">Nova comunicação</span><h3>Enviar pelo canal oficial</h3></div><Send size={20} /></div>
        <label className="field"><span>Lead</span><select value={leadId} onChange={(event) => setLeadId(event.target.value)}><option value="">Selecione</option>{snapshot?.leads.filter((item) => item.status === 'active' && !item.doNotContact).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.company}</option>)}</select></label>
        <div className="communication-channel-switch"><button type="button" className={composeChannel === 'email' ? 'is-active' : ''} onClick={() => setComposeChannel('email')}><Mail size={16} /> E-mail</button><button type="button" className={composeChannel === 'whatsapp' ? 'is-active' : ''} onClick={() => setComposeChannel('whatsapp')}><MessageCircle size={16} /> WhatsApp</button></div>
        <label className="field"><span>Conta conectada</span><select value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">{compatibleAccounts.length ? 'Selecione' : 'Modo local / nenhuma conta'}</option>{compatibleAccounts.map((account) => <option key={account.id} value={account.id}>{account.displayName} · {providerLabel(account.provider)}</option>)}</select></label>
        {composeChannel === 'email' ? <label className="field"><span>Assunto</span><input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Assunto do e-mail" /></label> : null}
        <label className="field"><span>Mensagem</span><textarea rows={8} value={body} onChange={(event) => setBody(event.target.value)} placeholder={selectedLead ? `Mensagem para ${selectedLead.name}` : 'Selecione um lead'} /></label>
        <div className="communication-recipient"><small>Destinatário</small><strong>{selectedLead ? composeChannel === 'email' ? selectedLead.email || 'E-mail ausente' : selectedLead.phone || 'Telefone ausente' : 'Nenhum lead selecionado'}</strong></div>
        <Button disabled={!canWrite || !selectedLead || !body.trim()} loading={sending} onClick={() => void send()}><Send size={16} /> Enviar com auditoria</Button>
        <p className="communication-disclaimer">No modo hospedado, o envio passa pela fila, respeita bloqueio de contato e registra status de entrega. No modo local, a ação é simulada.</p>
      </aside>
    </div>
  </div>
}
