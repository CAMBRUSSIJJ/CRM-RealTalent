// V101.11.3-H19.9 — WhatsApp Reliable Messaging & Groups
import { NativeSelectionSelect } from '../../components/selection'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle, BriefcaseBusiness, CalendarPlus, CheckCheck, CheckCircle2, Clock3, ExternalLink, FileText, History, Inbox, Info,
  Mail, MessageCircle, MessagesSquare, PhoneCall, RefreshCw, Search, Send, SlidersHorizontal, UserPlus, UserRound, UsersRound, Video, Wifi, WifiOff, X,
} from 'lucide-react'
import { useAppActions, useAppNavigation, useAppUi, useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import { StatusPill } from '../../components/ui/status-pill'
import { WorkspaceAdvancedFilterDrawer, WorkspaceFilterMenu, type WorkspaceFilterField } from '../../components/workspace/workspace-filter-system'
import { formatCurrency, formatDateTime } from '../../domain/formatters'
import { copyTextToClipboard, normalizeExternalUrl, openExternalUrl } from '../../lib/browser-actions'
import type { CommunicationChannel, Lead } from '../../domain/types'
import { SalesMessageModal } from '../pipeline/sales-message-modal'
import { useAuth } from '../auth/auth-context'
import { usePreferences } from '../settings/preferences-context'
import { OfficialConversationComposer } from './official-conversation-composer'
import { EmailConversationPanel } from './email-conversation-panel'
import { WhatsAppChatPanel } from './whatsapp-chat-panel'
import { WhatsAppWorkToolbar } from './whatsapp-work-toolbar'
import { useDomainProjectionRevision, useRealtimeTransportState } from '../../platform/events'
import { resolveWhatsAppContactLink, saveWhatsAppContactLink } from '../../services/whatsapp-contact-links'
import type { ConnectedAccount } from '../../services/integration-framework'
import { createGatewayWhatsAppGroup, loadGatewayWhatsAppContacts, type GatewayWhatsAppContact } from '../../services/local-communications-gateway'
import { normalizeWhatsAppPhone } from '../../services/whatsapp-workspace'
import { loadWhatsAppWorkLabels, resolveWhatsAppWorkState } from '../../services/whatsapp-work-management'
import {
  buildCommunicationConversations, buildLocalCommunicationTimeline, channelLabel, loadAssistedCommunicationTimeline, loadCommunicationChannelState,
  loadOfficialCommunicationTimeline, loadPreferredChannels, markCommunicationConversationRead, mergeCommunicationTimeline, preferredChannelEntityKey, recordAssistedCommunication,
  savePreferredChannel, syncOfficialCommunications, type CommunicationConversation, type PreferredCommunicationChannel, type SocialCommunicationChannel, type UnifiedCommunicationItem,
} from '../../services/communication-workspace'

const channelIcons: Record<string, typeof Mail> = {
  email: Mail, whatsapp: MessageCircle, instagram: MessagesSquare, facebook: UserRound, linkedin: ExternalLink,
  call: PhoneCall, meeting: Video, calendar: CalendarPlus, note: CheckCircle2, system: SlidersHorizontal,
}
const channelTone = (channel: string) => channel === 'whatsapp' ? 'success' : channel === 'email' ? 'info' : channel === 'call' ? 'warning' : ['instagram', 'facebook', 'linkedin', 'meeting'].includes(channel) ? 'purple' : 'neutral'
const statusLabel = (status: string) => ({ queued: 'Na fila', sent: 'Enviado', delivered: 'Entregue', read: 'Lido', received: 'Recebido', failed: 'Falhou', cancelled: 'Cancelado' }[status] ?? status)
const directionLabel = (direction: string) => ({ inbound: 'Recebido', outbound: 'Enviado', internal: 'Interno' }[direction] ?? direction)
const daysAgo = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000))
const socialUrlForLead = (lead: Lead | null, channel: SocialCommunicationChannel) => channel === 'instagram' ? normalizeExternalUrl(lead?.instagramUrl) : channel === 'facebook' ? normalizeExternalUrl(lead?.facebookUrl) : normalizeExternalUrl(lead?.linkedinUrl)

const linkOfficialEventsToLeads = (items: UnifiedCommunicationItem[], leads: Lead[], workspaceId: string) => items.map((item) => {
  const sender = String(item.metadata?.senderAddress || '').trim().toLowerCase()
  const recipients = Array.isArray(item.metadata?.recipientAddresses) ? item.metadata.recipientAddresses.map((value) => String(value || '').trim().toLowerCase()) : []
  const rawPeer = String(item.metadata?.peerAddress || '').trim().toLowerCase()
  const peerDigits = rawPeer.replace(/\D/g, '')
  const peer = peerDigits.length >= 8 && peerDigits.length <= 15 ? peerDigits : ''

  if (item.channel === 'whatsapp') {
    const explicit = resolveWhatsAppContactLink(workspaceId, { peerAddress: peer, threadId: item.metadata?.threadId })
    if (explicit) {
      const linkedLead = leads.find((candidate) => candidate.id === explicit.leadId)
      if (linkedLead) return { ...item, leadId: linkedLead.id, contactId: explicit.contactId ?? linkedLead.primaryContactId ?? item.contactId ?? null }
    }
    // H14 podia persistir o último contato selecionado (ex.: Carlos Almeida) em uma mensagem
    // de outra thread. Só confie nesse vínculo histórico quando o telefone do lead realmente
    // corresponde à outra ponta da conversa. Caso contrário, repare o item em memória.
    if (item.leadId) {
      const persistedLead = leads.find((candidate) => candidate.id === item.leadId)
      const persistedPhone = persistedLead?.phone.replace(/\D/g, '') ?? ''
      const samePeer = Boolean(peer && persistedPhone.length >= 8 && (persistedPhone.endsWith(peer) || peer.endsWith(persistedPhone)))
      if (!peer || samePeer) return item
    }
  } else if (item.leadId) return item

  const addresses = item.channel === 'whatsapp' && peer ? [peer] : item.channel === 'whatsapp' ? [] : [sender, ...recipients].filter(Boolean)
  const lead = leads.find((candidate) => {
    const email = candidate.email.trim().toLowerCase()
    const phone = candidate.phone.replace(/\D/g, '')
    return addresses.some((address) => {
      if (email && address === email) return true
      const digits = address.replace(/\D/g, '')
      return Boolean(digits.length >= 8 && phone.length >= 8 && (phone.endsWith(digits) || digits.endsWith(phone)))
    })
  })
  const repaired = item.channel === 'whatsapp' && item.leadId && !lead ? { ...item, leadId: null, contactId: null } : item
  return lead ? { ...repaired, leadId: lead.id, contactId: lead.primaryContactId ?? repaired.contactId ?? null } : repaired
})

function MeetingQuickModal({ lead, open, onClose }: { lead: Lead | null; open: boolean; onClose(): void }) {
  const { createCalendarEvent } = useAppActions()
  const { notify } = useAppUi()
  const initial = new Date(Date.now() + 24 * 60 * 60 * 1000)
  initial.setMinutes(0, 0, 0)
  const [title, setTitle] = useState('Reunião comercial')
  const [startsAt, setStartsAt] = useState(initial.toISOString().slice(0, 16))
  const [duration, setDuration] = useState(45)
  const [location, setLocation] = useState('Google Meet / online')
  const [description, setDescription] = useState('')
  useEffect(() => { if (open && lead) { setTitle(`Reunião · ${lead.company || lead.name}`); setDescription(`Reunião comercial com ${lead.name}.`) } }, [lead, open])
  const create = async () => {
    if (!lead || !startsAt) return
    const start = new Date(startsAt); const end = new Date(start.getTime() + duration * 60_000)
    await createCalendarEvent({ leadId: lead.id, contactId: lead.primaryContactId ?? null, title: title.trim() || 'Reunião comercial', description: description.trim(), startsAt: start.toISOString(), endsAt: end.toISOString(), allDay: false, location: location.trim(), status: 'confirmed', assignedTo: lead.ownerId })
    notify('success', 'Reunião adicionada à Agenda. A integração externa fará a publicação conforme sua configuração.')
    onClose()
  }
  return <Modal open={open} title="Agendar reunião" subtitle={lead ? `${lead.name} · ${lead.company || 'Sem empresa'}` : undefined} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><span className="modal__footer-spacer"/><Button disabled={!lead || !startsAt} onClick={() => void create()}><CalendarPlus size={16}/> Agendar</Button></>}>
    <div className="communication-meeting-form">
      <label className="field"><span>Título</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <div className="form-grid form-grid--2"><label className="field"><span>Início</span><input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label><label className="field"><span>Duração</span><NativeSelectionSelect value={duration} onChange={(event) => setDuration(Number(event.target.value))}><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>1 hora</option><option value={90}>1h30</option></NativeSelectionSelect></label></div>
      <label className="field"><span>Local / link</span><input value={location} onChange={(event) => setLocation(event.target.value)} /></label>
      <label className="field"><span>Contexto</span><textarea rows={5} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
    </div>
  </Modal>
}

function SocialTouchModal({ lead, channel, workspaceId, open, onClose, onRecorded }: { lead: Lead | null; channel: SocialCommunicationChannel; workspaceId: string; open: boolean; onClose(): void; onRecorded(item: UnifiedCommunicationItem): void }) {
  const { notify } = useAppUi()
  const [direction, setDirection] = useState<'outbound' | 'inbound'>('outbound')
  const [message, setMessage] = useState('')
  const url = socialUrlForLead(lead, channel)
  useEffect(() => {
    if (!open || !lead) return
    setDirection('outbound')
    setMessage(`Olá ${lead.name.split(' ')[0]}, tudo bem? Gostaria de conversar rapidamente sobre ${lead.company || 'seu negócio'}.`)
  }, [lead, open])
  const openProfile = () => {
    if (!lead || !url) return
    const opened = openExternalUrl(url)
    if (!opened.ok) { notify('error', opened.reason || 'Não foi possível abrir o perfil.'); return }
    const item = recordAssistedCommunication({ workspaceId, leadId: lead.id, contactId: lead.primaryContactId ?? null, channel, action: 'profile_opened', body: 'Perfil aberto a partir da Central de Comunicação.' })
    onRecorded(item)
  }
  const copy = async () => {
    if (!message.trim()) return
    const copied = await copyTextToClipboard(message.trim())
    notify(copied.ok ? 'success' : 'info', copied.ok ? 'Mensagem copiada.' : (copied.reason || 'Não foi possível copiar automaticamente.'))
  }
  const save = () => {
    if (!lead) return
    const item = recordAssistedCommunication({ workspaceId, leadId: lead.id, contactId: lead.primaryContactId ?? null, channel, direction, action: direction === 'inbound' ? 'message_received' : 'message_sent', body: message.trim() })
    onRecorded(item)
    notify('success', `${channelLabel(channel)} registrado no histórico do contato.`)
    onClose()
  }
  return <Modal open={open} title={`${channelLabel(channel)} assistido`} subtitle={lead ? `${lead.name} · ${lead.company || 'Sem empresa'}` : undefined} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><span className="modal__footer-spacer"/><Button disabled={!lead} onClick={save}><CheckCheck size={16}/> Registrar interação</Button></>}>
    <div className="social-touch-modal">
      <div className="social-touch-modal__notice"><AlertCircle size={17}/><span>O CRM registra a interação, mas não automatiza ações proibidas ou indisponíveis pela API da rede. Abra o perfil e confirme aqui o que realmente aconteceu.</span></div>
      <div className="social-touch-modal__actions"><Button variant="secondary" disabled={!url} onClick={openProfile}><ExternalLink size={16}/> Abrir perfil</Button><Button variant="secondary" disabled={!message.trim()} onClick={() => void copy()}><CheckCheck size={16}/> Copiar mensagem</Button></div>
      <label className="field"><span>Direção</span><NativeSelectionSelect value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)}><option value="outbound">Mensagem enviada</option><option value="inbound">Mensagem recebida</option></NativeSelectionSelect></label>
      <label className="field"><span>Mensagem / contexto</span><textarea rows={7} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Registre a mensagem ou o contexto da conversa..." /></label>
    </div>
  </Modal>
}


function WhatsAppContactsModal({ open, onClose, workspaceId, leads, onCreated }: { open: boolean; onClose(): void; workspaceId: string; leads: Lead[]; onCreated(lead: Lead): void }) {
  const { snapshot } = useAppWorkspace()
  const { createLead } = useAppActions()
  const { notify } = useAppUi()
  const { preferences: crmPreferences } = usePreferences()
  const { user } = useAuth()
  const [contacts, setContacts] = useState<GatewayWhatsAppContact[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [savingPhone, setSavingPhone] = useState('')

  const leadByPhone = useMemo(() => {
    const map = new Map<string, Lead>()
    for (const lead of leads) {
      const phone = lead.phone.replace(/\D/g, '')
      if (phone.length >= 8) map.set(phone.slice(-10), lead)
    }
    return map
  }, [leads])

  const load = async () => {
    setLoading(true)
    try { setContacts(await loadGatewayWhatsAppContacts(workspaceId)) }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível ler os contatos do WhatsApp.') }
    finally { setLoading(false) }
  }
  useEffect(() => { if (open) { setQuery(''); void load() } }, [open, workspaceId])

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR')
    if (!q) return contacts
    return contacts.filter((contact) => `${contact.name} ${contact.pushName} ${contact.phone}`.toLocaleLowerCase('pt-BR').includes(q))
  }, [contacts, query])

  const saveContact = async (contact: GatewayWhatsAppContact) => {
    const key = contact.phone.slice(-10)
    const existing = leadByPhone.get(key)
    if (existing) { onCreated(existing); return }
    const stage = [...(snapshot?.stages ?? [])].sort((a, b) => a.order - b.order).find((item) => !item.isWon && !item.isLost) ?? snapshot?.stages[0]
    if (!stage) { notify('error', 'O Pipeline não possui uma etapa válida para criar o contato.'); return }
    setSavingPhone(contact.phone)
    try {
      const lead = await createLead({
        name: contact.name || `+${contact.phone}`, company: contact.name || `+${contact.phone}`, phone: `+${contact.phone}`, email: '', city: '', source: 'WhatsApp', sourceDetail: contact.isMyContact ? 'Agenda WhatsApp sincronizada' : 'Contato conhecido pela sessão WhatsApp', sourceUrl: '', capturedAt: new Date().toISOString(),
        consentStatus: 'unknown', doNotContact: false, doNotContactReason: '', companyId: null, primaryContactId: null, opportunityId: null, cnpj: '', website: '', instagramUrl: '', linkedinUrl: '', facebookUrl: '', jobTitle: '', decisionRole: 'unknown', influenceLevel: 0,
        stageId: stage.id, status: 'active', temperature: crmPreferences.commercial.defaultLeadTemperature, priority: crmPreferences.commercial.defaultLeadPriority,
        ownerId: user?.id ?? null, ownerName: user?.displayName ?? 'Equipe', value: 0, nextActionAt: null, lastContactAt: null, expectedCloseAt: null,
        notes: `Contato vinculado a partir da sessão WhatsApp em ${new Date().toLocaleString('pt-BR')}.`, tags: ['WhatsApp'],
      })
      notify('success', `${lead.name} salvo no CRM e vinculado pelo telefone.`)
      onCreated(lead)
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível salvar o contato no CRM.') }
    finally { setSavingPhone('') }
  }

  return <Modal open={open} title="Contatos do WhatsApp" subtitle="Contatos conhecidos pela sessão QR. Salve no CRM somente quem fizer sentido comercial." onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Fechar</Button><span className="modal__footer-spacer"/><Button variant="secondary" loading={loading} onClick={() => void load()}><RefreshCw size={15}/> Sincronizar</Button></>}>
    <div className="whatsapp-contacts-modal">
      <div className="whatsapp-contacts-modal__toolbar"><label><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nome ou telefone..." /></label></div>
      <div className="whatsapp-contacts-modal__list">
        {visible.length ? visible.map((contact) => {
          const existing = leadByPhone.get(contact.phone.slice(-10))
          const displayName = contact.name || contact.pushName || `+${contact.phone}`
          return <div className={`whatsapp-contact-row ${existing ? 'is-linked' : ''}`} key={contact.phone}>
            <span className="whatsapp-contact-row__avatar">{displayName.slice(0, 2).toUpperCase()}</span>
            <span className="whatsapp-contact-row__body"><strong>{displayName}</strong><span>+{contact.phone}</span><small>{existing ? `Vinculado a ${existing.name}` : contact.isMyContact ? 'Contato salvo no WhatsApp' : 'Contato conhecido pela sessão'}</small></span>
            <span className="whatsapp-contact-row__action"><Button size="sm" variant={existing ? 'secondary' : 'primary'} loading={savingPhone === contact.phone} onClick={() => existing ? onCreated(existing) : void saveContact(contact)}>{existing ? 'Abrir no CRM' : 'Salvar no CRM'}</Button></span>
          </div>
        }) : <div className="communications-empty-feed"><UserRound size={28}/><strong>{loading ? 'Sincronizando contatos...' : 'Nenhum contato encontrado'}</strong><p>{loading ? 'Aguarde a sessão WhatsApp responder.' : 'Conecte a conta QR ou ajuste a busca.'}</p></div>}
      </div>
      <div className="whatsapp-contact-link__note"><Info size={16}/><span>A sessão do WhatsApp não dá acesso irrestrito à agenda nativa do iPhone/Android. Esta lista usa os contatos que o WhatsApp Web conhece pela sessão pareada.</span></div>
    </div>
  </Modal>
}

function WhatsAppNewContactModal({ open, onClose, onCreated }: { open: boolean; onClose(): void; onCreated(lead: Lead): void }) {
  const { snapshot } = useAppWorkspace()
  const { createLead } = useAppActions()
  const { notify } = useAppUi()
  const { preferences: crmPreferences } = usePreferences()
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) { setName(''); setCompany(''); setPhone('') } }, [open])
  const save = async () => {
    const normalized = normalizeWhatsAppPhone(phone, crmPreferences.integrations.whatsappCountryCode)
    if (!name.trim()) { notify('error', 'Informe o nome do contato.'); return }
    if (!normalized) { notify('error', 'Informe um número de WhatsApp válido.'); return }
    const duplicate = (snapshot?.leads ?? []).find((lead) => lead.phone.replace(/\D/g, '').endsWith(normalized.slice(-10)))
    if (duplicate) { notify('info', `${duplicate.name} já usa este número. Abrindo o contato existente.`); onCreated(duplicate); onClose(); return }
    const stage = [...(snapshot?.stages ?? [])].sort((a, b) => a.order - b.order).find((item) => !item.isWon && !item.isLost) ?? snapshot?.stages[0]
    if (!stage) { notify('error', 'O Pipeline não possui uma etapa válida para criar o contato.'); return }
    setSaving(true)
    try {
      const lead = await createLead({
        name: name.trim(), company: company.trim() || name.trim(), phone: `+${normalized}`, email: '', city: '', source: 'WhatsApp', sourceDetail: 'Central de Comunicação · Novo contato', sourceUrl: '', capturedAt: new Date().toISOString(),
        consentStatus: 'unknown', doNotContact: false, doNotContactReason: '', companyId: null, primaryContactId: null, opportunityId: null, cnpj: '', website: '', instagramUrl: '', linkedinUrl: '', facebookUrl: '', jobTitle: '', decisionRole: 'unknown', influenceLevel: 0,
        stageId: stage.id, status: 'active', temperature: crmPreferences.commercial.defaultLeadTemperature, priority: crmPreferences.commercial.defaultLeadPriority,
        ownerId: user?.id ?? null, ownerName: user?.displayName ?? 'Equipe', value: 0, nextActionAt: null, lastContactAt: null, expectedCloseAt: null,
        notes: `Contato criado dentro do WhatsApp em ${new Date().toLocaleString('pt-BR')}.`, tags: ['WhatsApp'],
      })
      notify('success', `${lead.name} criado. Você já pode iniciar a conversa.`)
      onCreated(lead); onClose()
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível criar o contato.') }
    finally { setSaving(false) }
  }
  return <Modal open={open} title="Novo contato do WhatsApp" subtitle="Crie o contato no CRM e abra uma conversa sem sair da Central." onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><span className="modal__footer-spacer"/><Button loading={saving} onClick={() => void save()}><UserPlus size={16}/> Criar contato</Button></>}>
    <div className="communication-meeting-form whatsapp-new-contact-form">
      <label className="field"><span>Nome</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome do contato" /></label>
      <label className="field"><span>WhatsApp</span><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(51) 99999-9999" /></label>
      <label className="field"><span>Empresa <small>(opcional)</small></span><input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Empresa / estabelecimento" /></label>
      <div className="whatsapp-contact-link__note"><MessageCircle size={16}/><span>O contato é salvo no CRM. O número será usado para iniciar a conversa pelo WhatsApp conectado.</span></div>
    </div>
  </Modal>
}

function WhatsAppCreateGroupModal({ open, onClose, workspaceId, leads, countryCode, onCreated }: { open: boolean; onClose(): void; workspaceId: string; leads: Lead[]; countryCode: string; onCreated(groupId: string, title: string): void }) {
  const { notify } = useAppUi()
  const [title, setTitle] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [manualNumbers, setManualNumbers] = useState('')
  const [saving, setSaving] = useState(false)
  const candidates = useMemo(() => leads.filter((lead) => Boolean(normalizeWhatsAppPhone(lead.phone, countryCode))).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [countryCode, leads])
  useEffect(() => { if (open) { setTitle(''); setSelectedIds([]); setManualNumbers('') } }, [open])
  const toggle = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const create = async () => {
    if (!title.trim()) { notify('error', 'Informe o nome do grupo.'); return }
    const selectedNumbers = candidates.filter((lead) => selectedIds.includes(lead.id)).map((lead) => normalizeWhatsAppPhone(lead.phone, countryCode))
    const typedNumbers = manualNumbers.split(/[\n,;]+/).map((value) => normalizeWhatsAppPhone(value, countryCode)).filter(Boolean)
    const participants = [...new Set([...selectedNumbers, ...typedNumbers])]
    if (!participants.length) { notify('error', 'Selecione ou informe pelo menos um participante.'); return }
    setSaving(true)
    try {
      const result = await createGatewayWhatsAppGroup({ workspaceId, title: title.trim(), participants })
      const failures = Object.values(result.participants || {}).filter((item) => Number(item.statusCode) !== 200 && Number(item.statusCode) !== 403)
      notify(failures.length ? 'info' : 'success', failures.length ? `Grupo criado. ${failures.length} participante(s) não puderam ser adicionados.` : `Grupo “${result.title}” criado no WhatsApp.`)
      onCreated(result.groupId, result.title); onClose()
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível criar o grupo.') }
    finally { setSaving(false) }
  }
  return <Modal open={open} title="Criar grupo no WhatsApp" subtitle="O grupo será criado na conta QR local conectada." onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><span className="modal__footer-spacer"/><Button loading={saving} onClick={() => void create()}><UsersRound size={16}/> Criar grupo</Button></>}>
    <div className="whatsapp-group-create">
      <label className="field"><span>Nome do grupo</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Clientes VIP" maxLength={100}/></label>
      <div className="whatsapp-group-create__participants"><header><div><strong>Participantes do CRM</strong><small>{selectedIds.length} selecionado(s)</small></div></header><div className="whatsapp-group-create__list">
        {candidates.length ? candidates.map((lead) => <label key={lead.id}><input type="checkbox" checked={selectedIds.includes(lead.id)} onChange={() => toggle(lead.id)} /><span><strong>{lead.name}</strong><small>{lead.company || lead.phone}</small></span></label>) : <p>Nenhum contato com WhatsApp cadastrado.</p>}
      </div></div>
      <label className="field"><span>Números adicionais <small>(opcional)</small></span><textarea rows={3} value={manualNumbers} onChange={(event) => setManualNumbers(event.target.value)} placeholder="Um número por linha, vírgula ou ponto e vírgula" /></label>
      <div className="whatsapp-contact-link__note"><UsersRound size={16}/><span>Participantes precisam ter conta no WhatsApp. Restrições de privacidade podem fazer o WhatsApp enviar convite em vez de adicionar diretamente.</span></div>
    </div>
  </Modal>
}


function WhatsAppContactLinkModal({
  open, onClose, workspaceId, conversation, onLinked,
}: {
  open: boolean
  onClose(): void
  workspaceId: string
  conversation: CommunicationConversation | null
  onLinked(lead: Lead): void
}) {
  const { snapshot } = useAppWorkspace()
  const { createLead } = useAppActions()
  const { notify } = useAppUi()
  const { preferences: crmPreferences } = usePreferences()
  const { user } = useAuth()
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [existingLeadId, setExistingLeadId] = useState('')
  const [saving, setSaving] = useState(false)

  const peerPhone = conversation?.externalAddress || ''
  const threadId = conversation?.externalThreadId || ''
  const importedName = conversation?.externalDisplayName || conversation?.title || 'Contato WhatsApp'
  const activeLeads = useMemo(() => (snapshot?.leads ?? []).filter((lead) => lead.status === 'active').sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [snapshot?.leads])

  useEffect(() => {
    if (!open) return
    const cleanName = importedName && !/^\+?\d+$/.test(importedName) && !/^WhatsApp(?: · identidade pendente)?$/i.test(importedName) ? importedName : (peerPhone ? `WhatsApp +${peerPhone}` : 'Contato WhatsApp')
    setMode('new')
    setName(cleanName)
    setCompany('')
    setExistingLeadId('')
  }, [open, conversation?.key, importedName, peerPhone])

  const save = async () => {
    if (!conversation || conversation.channel !== 'whatsapp') return
    if (!peerPhone && !threadId) { notify('error', 'O WhatsApp ainda não forneceu uma identidade utilizável para esta conversa.'); return }
    setSaving(true)
    try {
      let lead: Lead
      if (mode === 'existing') {
        const existing = activeLeads.find((item) => item.id === existingLeadId)
        if (!existing) throw new Error('Selecione um contato existente para vincular.')
        lead = existing
      } else {
        if (!name.trim()) throw new Error('Informe o nome do contato.')
        if (!peerPhone) throw new Error('O número real do WhatsApp ainda não foi resolvido; sincronize a conversa antes de salvar um novo contato.')
        const stage = [...(snapshot?.stages ?? [])].sort((a, b) => a.order - b.order).find((item) => !item.isWon && !item.isLost) ?? snapshot?.stages[0]
        if (!stage) throw new Error('O Pipeline não possui uma etapa válida para criar o contato.')
        lead = await createLead({
          name: name.trim(), company: company.trim() || name.trim(), phone: `+${peerPhone}`, email: '', city: '',
          source: 'WhatsApp', sourceDetail: 'Central de Comunicação · QR Local', sourceUrl: '', capturedAt: new Date().toISOString(),
          consentStatus: 'unknown', doNotContact: false, doNotContactReason: '', companyId: null, primaryContactId: null, opportunityId: null,
          cnpj: '', website: '', instagramUrl: '', linkedinUrl: '', facebookUrl: '', jobTitle: '', decisionRole: 'unknown', influenceLevel: 0,
          stageId: stage.id, status: 'active', temperature: crmPreferences.commercial.defaultLeadTemperature, priority: crmPreferences.commercial.defaultLeadPriority,
          ownerId: user?.id ?? null, ownerName: user?.displayName ?? 'Equipe', value: 0, nextActionAt: null, lastContactAt: conversation.lastOccurredAt,
          expectedCloseAt: null, notes: `Contato salvo a partir da conversa do WhatsApp em ${new Date().toLocaleString('pt-BR')}.`, tags: ['WhatsApp'],
        })
      }
      saveWhatsAppContactLink(workspaceId, {
        leadId: lead.id,
        contactId: lead.primaryContactId ?? null,
        peerAddress: peerPhone,
        threadId,
        displayName: importedName,
      })
      notify('success', mode === 'existing' ? `Conversa vinculada a ${lead.name}.` : `${lead.name} salvo em Contatos e vinculado ao WhatsApp.`)
      onLinked(lead)
      onClose()
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Não foi possível salvar o vínculo do WhatsApp.')
    } finally { setSaving(false) }
  }

  return <Modal open={open} title="Salvar contato do WhatsApp" subtitle={peerPhone ? `+${peerPhone} · ${importedName}` : importedName} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><span className="modal__footer-spacer"/><Button loading={saving} onClick={() => void save()}>{mode === 'existing' ? 'Vincular contato' : 'Salvar contato'}</Button></>}>
    <div className="communication-meeting-form">
      <div className="whatsapp-contact-link__modes">
        <button type="button" className={mode === 'new' ? 'is-active' : ''} onClick={() => setMode('new')}>Criar novo contato</button>
        <button type="button" className={mode === 'existing' ? 'is-active' : ''} onClick={() => setMode('existing')}>Vincular existente</button>
      </div>
      {mode === 'new' ? <>
        <label className="field"><span>Nome</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="field"><span>Empresa <small>(opcional)</small></span><input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Empresa / estabelecimento" /></label>
        <label className="field"><span>WhatsApp</span><input value={peerPhone ? `+${peerPhone}` : 'Identidade pendente'} readOnly /></label>
        <div className="whatsapp-contact-link__note"><MessageCircle size={16}/><span>O contato será salvo no CRM e esta conversa continuará vinculada a ele depois de recarregar a página.</span></div>
      </> : <>
        <label className="field"><span>Contato existente</span><NativeSelectionSelect value={existingLeadId} onChange={(event) => setExistingLeadId(event.target.value)}><option value="">Selecionar...</option>{activeLeads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name} · {lead.company || lead.phone || 'Sem empresa'}</option>)}</NativeSelectionSelect></label>
        <div className="whatsapp-contact-link__note"><MessageCircle size={16}/><span>O vínculo usa a identidade da conversa do WhatsApp e não altera o telefone cadastrado do contato existente.</span></div>
      </>}
    </div>
  </Modal>
}

const conversationLabel = (conversation: CommunicationConversation, lead: Lead | undefined) => lead?.name || lead?.company || conversation.title || 'Conversa sem lead'
const conversationStatusText = (conversation: CommunicationConversation) => conversation.channel === 'whatsapp'
  ? ''
  : conversation.status === 'needs_reply' ? 'Responder' : conversation.status === 'waiting_reply' ? 'Aguardando' : conversation.status === 'internal' ? 'Interno' : 'Histórico'

export function CommunicationsPage() {
  const { snapshot, currentWorkspace, repositoryMode, can, canTeamAccess, canTeamAccessRecord, teamAccessScope } = useAppWorkspace()
  const { routeContext, navigate } = useAppNavigation()
  const { notify } = useAppUi()
  const { preferences } = usePreferences()
  const [selectedLeadId, setSelectedLeadId] = useState(() => routeContext.leadId ?? '')
  const [selectedConversationKey, setSelectedConversationKey] = useState('')
  const [query, setQuery] = useState('')
  const [channel, setChannel] = useState<'all' | CommunicationChannel>('all')
  const [workspaceView, setWorkspaceView] = useState<'inbox' | 'whatsapp' | 'email' | 'call' | 'activity'>(() => routeContext.action === 'email' ? 'email' : 'whatsapp')
  const [inboxView, setInboxView] = useState<string>('all')
  const [direction, setDirection] = useState<'all' | 'inbound' | 'outbound' | 'internal'>('all')
  const [period, setPeriod] = useState<'7' | '30' | '90' | 'all'>('30')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [official, setOfficial] = useState<UnifiedCommunicationItem[]>([])
  const [assisted, setAssisted] = useState<UnifiedCommunicationItem[]>([])
  const [officialLoading, setOfficialLoading] = useState(false)
  const [officialError, setOfficialError] = useState('')
  const [channelState, setChannelState] = useState<{ emailAccounts: ConnectedAccount[]; mailSyncAccounts: ConnectedAccount[]; whatsappAccounts: ConnectedAccount[]; calendarAccounts: ConnectedAccount[]; metaAccounts: ConnectedAccount[]; instagramAccounts: ConnectedAccount[]; facebookAccounts: ConnectedAccount[]; leadAdsAccounts: ConnectedAccount[] } | null>(null)
  const [messageOpen, setMessageOpen] = useState(false)
  const [messagePurpose, setMessagePurpose] = useState<'first_contact' | 'followup' | 'proposal' | 'meeting'>('followup')
  const [messageChannel, setMessageChannel] = useState<'whatsapp' | 'email' | 'call'>('whatsapp')
  const [officialComposeChannel, setOfficialComposeChannel] = useState<'email' | 'whatsapp' | null>(null)
  const [socialOpen, setSocialOpen] = useState(false)
  const [socialChannel, setSocialChannel] = useState<SocialCommunicationChannel>('instagram')
  const [meetingOpen, setMeetingOpen] = useState(false)
  const [contactLinkOpen, setContactLinkOpen] = useState(false)
  const [newWhatsAppContactOpen, setNewWhatsAppContactOpen] = useState(false)
  const [createWhatsAppGroupOpen, setCreateWhatsAppGroupOpen] = useState(false)
  const [whatsAppContactsOpen, setWhatsAppContactsOpen] = useState(false)
  const [pendingGroupThreadId, setPendingGroupThreadId] = useState('')
  const [leadContextOpen, setLeadContextOpen] = useState(false)
  const [leadContextTab, setLeadContextTab] = useState<'summary' | 'deal' | 'history'>('summary')
  const [salesStateRevision, setSalesStateRevision] = useState(0)
  const [workRevision, setWorkRevision] = useState(0)
  const [preferredChannels, setPreferredChannels] = useState<Record<string, PreferredCommunicationChannel>>({})
  const realtimeState = useRealtimeTransportState('communications-sse')
  const communicationsRevision = useDomainProjectionRevision('communications')
  const realtimeRefreshTimerRef = useRef<number | null>(null)
  const communicationShellRef=useRef<HTMLElement|null>(null)
  const realtimeReloadingRef = useRef(false)
  const realtimeReloadQueuedRef = useRef(false)

  // The route lives below the global app bar and variable-height header.
  // A static `100vh - Npx` made the composer stop above the viewport,
  // leaving an empty strip at the bottom (Firefox 1280x720/desktop).
  useEffect(()=>{
    const shell=communicationShellRef.current
    if(!shell)return
    let raf=0
    const measure=()=>{
      window.cancelAnimationFrame(raf)
      raf=window.requestAnimationFrame(()=>{
        const top=shell.getBoundingClientRect().top
        const available=Math.max(440,Math.round(window.innerHeight-top-10))
        shell.style.setProperty('--rt-communication-area-height',available+'px')
      })
    }
    measure()
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(measure):null
    const header=shell.previousElementSibling
    if(header)observer?.observe(header)
    window.addEventListener('resize',measure)
    return ()=>{window.cancelAnimationFrame(raf);observer?.disconnect();window.removeEventListener('resize',measure)}
  },[])
  const workspaceId = currentWorkspace?.id ?? 'default'
  const localTimeline = useMemo(() => snapshot ? buildLocalCommunicationTimeline(snapshot) : [], [snapshot])
  const timeline = useMemo(() => mergeCommunicationTimeline(localTimeline, official, assisted), [assisted, localTimeline, official])
  const allConversations = useMemo(() => buildCommunicationConversations(timeline), [timeline])
  const leadsById = useMemo(() => new Map((snapshot?.leads ?? []).map((lead) => [lead.id, lead])), [snapshot?.leads])
  const communicationScope = teamAccessScope('communications')
  const canCommunicationCreate = canTeamAccess('create','communications')
  const canCommunicationEdit = canTeamAccess('edit','communications')
  const conversations = useMemo(() => allConversations.filter((conversation) => {
    const lead = conversation.leadId ? leadsById.get(conversation.leadId) : undefined
    const workState = conversation.channel === 'whatsapp' ? resolveWhatsAppWorkState(workspaceId, conversation.key, conversation.status) : null
    const ownerId = lead?.ownerId ?? workState?.ownerId ?? null
    return ownerId ? canTeamAccessRecord('communications', ownerId) : communicationScope === 'all'
  }), [allConversations, canTeamAccessRecord, communicationScope, leadsById, workspaceId, workRevision])
  const whatsappWorkLabels = useMemo(() => loadWhatsAppWorkLabels(workspaceId), [workspaceId, workRevision])

  const visibleConversations = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR')
    const cutoff = period === 'all' ? 0 : Date.now() - Number(period) * 86_400_000
    return conversations.filter((conversation) => {
      if (workspaceView === 'whatsapp' && conversation.channel !== 'whatsapp') return false
      if (workspaceView === 'email' && conversation.channel !== 'email') return false
      if (workspaceView === 'call' && conversation.channel !== 'call') return false
      if (workspaceView === 'activity' && !['meeting', 'calendar', 'note', 'system'].includes(conversation.channel)) return false
      if (channel !== 'all' && conversation.channel !== channel) return false
      if (direction !== 'all' && !conversation.events.some((event) => event.direction === direction)) return false
      if (cutoff && Date.parse(conversation.lastOccurredAt) < cutoff) return false
      const lead = conversation.leadId ? leadsById.get(conversation.leadId) : undefined
      if (inboxView === 'people' && conversation.channel === 'whatsapp' && conversation.isGroup) return false
      if (inboxView === 'groups' && conversation.channel === 'whatsapp' && !conversation.isGroup) return false
      if (inboxView === 'unread' && conversation.unreadCount < 1) return false
      if (inboxView === 'needs_reply' && conversation.channel !== 'whatsapp' && conversation.status !== 'needs_reply') return false
      if (!normalized) return true
      const eventText = conversation.events.map((event) => `${event.title} ${event.subject} ${event.body}`).join(' ')
      return `${lead?.name ?? ''} ${lead?.company ?? ''} ${conversation.preview} ${conversation.title} ${eventText} ${channelLabel(conversation.channel)}`.toLocaleLowerCase('pt-BR').includes(normalized)
    })
  }, [channel, conversations, direction, inboxView, leadsById, period, query, salesStateRevision, workspaceView])

  const selectedConversation = conversations.find((item) => item.key === selectedConversationKey) ?? null
  const selectedLead = selectedConversation
    ? (selectedConversation.leadId ? snapshot?.leads.find((item) => item.id === selectedConversation.leadId) ?? null : null)
    : snapshot?.leads.find((item) => item.id === selectedLeadId && canTeamAccessRecord('communications', item.ownerId)) ?? null
  const selectedStage = selectedLead ? snapshot?.stages.find((item) => item.id === selectedLead.stageId)?.name ?? 'Relacionamento' : 'Relacionamento'
  const selectedWhatsAppExternalIdentity = selectedConversation?.channel === 'whatsapp' ? {
    name: selectedConversation.externalDisplayName || selectedConversation.title || 'WhatsApp',
    phone: selectedConversation.externalAddress || '',
    company: selectedConversation.leadId ? null : 'Não vinculado ao CRM',
    isGroup: Boolean(selectedConversation.isGroup),
    threadId: selectedConversation.externalThreadId || String(selectedConversation.events[0]?.metadata?.threadId || '') || null,
  } : undefined
  const selectedEvents = selectedConversation?.events ?? (selectedLead ? timeline.filter((item) => item.leadId === selectedLead.id) : [])
  const lastContact = selectedEvents[0] ?? null
  const displayedSelectedEvents = useMemo(() => {
    const cutoff = period === 'all' ? 0 : Date.now() - Number(period) * 86_400_000
    return selectedEvents.filter((item) => (direction === 'all' || item.direction === direction) && (!cutoff || Date.parse(item.occurredAt) >= cutoff))
  }, [direction, period, selectedEvents])

  const reloadOfficial = async (silent = false) => {
    setAssisted(loadAssistedCommunicationTimeline(workspaceId))
    if (!currentWorkspace?.id) return
    if (realtimeReloadingRef.current) { realtimeReloadQueuedRef.current = true; return }
    realtimeReloadingRef.current = true
    if (!silent) setOfficialLoading(true)
    if (!silent) setOfficialError('')
    try {
      const [events, state] = await Promise.all([loadOfficialCommunicationTimeline(currentWorkspace.id), loadCommunicationChannelState(currentWorkspace.id)])
      setOfficial(linkOfficialEventsToLeads(events, snapshot?.leads ?? [], workspaceId)); setChannelState(state)
    } catch (error) {
      if (!silent) setOfficialError(error instanceof Error ? error.message : 'Não foi possível carregar as comunicações oficiais.')
    } finally {
      realtimeReloadingRef.current = false
      if (!silent) setOfficialLoading(false)
      if (realtimeReloadQueuedRef.current) {
        realtimeReloadQueuedRef.current = false
        window.setTimeout(() => { void reloadOfficial(true) }, 40)
      }
    }
  }
  const syncNow = async () => {
    if (!currentWorkspace?.id) { await reloadOfficial(); return }
    setOfficialLoading(true); setOfficialError('')
    try {
      const syncResult = await syncOfficialCommunications(currentWorkspace.id)
      const [events, state] = await Promise.all([loadOfficialCommunicationTimeline(currentWorkspace.id), loadCommunicationChannelState(currentWorkspace.id)])
      setOfficial(linkOfficialEventsToLeads(events, snapshot?.leads ?? [], workspaceId)); setChannelState(state); setAssisted(loadAssistedCommunicationTimeline(workspaceId))
      if (syncResult.failures.length) {
        const qrFailures = syncResult.failures.filter((item) => item.transport === 'qr')
        const details = syncResult.failures.slice(0, 2).map((item) => item.message).join(' · ')
        const message = qrFailures.length === syncResult.failures.length
          ? `WhatsApp QR em recuperação: ${syncResult.imported} nova(s) mensagem(ns). ${details}`
          : `Sincronização parcial: ${syncResult.imported} nova(s) mensagem(ns). ${syncResult.failures.length} conta(s) falharam. ${details}`
        setOfficialError(message); notify('info', message)
      }
      // The updated conversation list already confirms sync. No success toast;
      // actual errors and partial synchronization remain visible.
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível sincronizar as comunicações.'
      setOfficialError(message); notify('error', message)
    } finally { setOfficialLoading(false) }
  }
  useEffect(() => { setPreferredChannels(loadPreferredChannels(workspaceId)); setAssisted(loadAssistedCommunicationTimeline(workspaceId)); void reloadOfficial() }, [workspaceId])
  useEffect(() => {
    if (!currentWorkspace?.id || communicationsRevision < 1) return
    if (realtimeRefreshTimerRef.current !== null) window.clearTimeout(realtimeRefreshTimerRef.current)
    realtimeRefreshTimerRef.current = window.setTimeout(() => {
      realtimeRefreshTimerRef.current = null
      void reloadOfficial(true)
    }, 90)
    return () => {
      if (realtimeRefreshTimerRef.current !== null) window.clearTimeout(realtimeRefreshTimerRef.current)
      realtimeRefreshTimerRef.current = null
    }
  }, [workspaceId, currentWorkspace?.id, communicationsRevision])
  useEffect(() => {
    if (!currentWorkspace?.id) return
    const fallback = window.setInterval(() => { void reloadOfficial(true) }, 60_000)
    return () => window.clearInterval(fallback)
  }, [workspaceId, currentWorkspace?.id])
  useEffect(() => { if (routeContext.leadId) setSelectedLeadId(routeContext.leadId) }, [routeContext.leadId])
  useEffect(() => { if (routeContext.action === 'email') setWorkspaceView('email'); else if (routeContext.action === 'whatsapp') setWorkspaceView('whatsapp') }, [routeContext.action])
  useEffect(() => {
    if (selectedConversationKey && conversations.some((item) => item.key === selectedConversationKey)) return
    if (workspaceView === 'whatsapp' && selectedLeadId && !selectedConversationKey && !conversations.some((item) => item.channel === 'whatsapp' && item.leadId === selectedLeadId)) return
    const preferredConversation = routeContext.leadId ? conversations.find((item) => item.leadId === routeContext.leadId) : conversations[0]
    if (preferredConversation) { setSelectedConversationKey(preferredConversation.key); setSelectedLeadId(preferredConversation.leadId ?? '') }
  }, [conversations, routeContext.leadId, selectedConversationKey, selectedLeadId, workspaceView])
  useEffect(() => {
    if (channel === 'all') return
    const current = conversations.find((item) => item.key === selectedConversationKey)
    if (current?.channel === channel) return
    const next = conversations.find((item) => item.channel === channel && item.leadId === selectedLeadId) ?? conversations.find((item) => item.channel === channel)
    if (!next) return
    setSelectedConversationKey(next.key)
    setSelectedLeadId(next.leadId ?? '')
  }, [channel, conversations, selectedConversationKey, selectedLeadId])
  useEffect(() => {
    if (workspaceView === 'inbox') return
    const allowed = (item: CommunicationConversation) => workspaceView === 'whatsapp' ? item.channel === 'whatsapp' : workspaceView === 'email' ? item.channel === 'email' : workspaceView === 'call' ? item.channel === 'call' : ['meeting', 'calendar', 'note', 'system'].includes(item.channel)
    const current = conversations.find((item) => item.key === selectedConversationKey)
    if (current && allowed(current)) return
    if (workspaceView === 'whatsapp' && selectedLeadId && !conversations.some((item) => item.channel === 'whatsapp' && item.leadId === selectedLeadId)) return
    const next = conversations.find((item) => allowed(item) && item.leadId === selectedLeadId) ?? conversations.find(allowed)
    setSelectedConversationKey(next?.key ?? '')
    if (next) setSelectedLeadId(next.leadId ?? '')
  }, [workspaceView, conversations, selectedConversationKey, selectedLeadId])
  useEffect(() => {
    const conversation = conversations.find((item) => item.key === selectedConversationKey)
    if (!conversation || conversation.channel !== 'whatsapp' || conversation.unreadCount < 1) return
    void markCommunicationConversationRead(workspaceId, conversation).then((updated) => { if (updated > 0) void reloadOfficial() }).catch(() => {})
  }, [selectedConversationKey, selectedConversation?.unreadCount, workspaceId])
  useEffect(() => {
    if (!pendingGroupThreadId) return
    const group = conversations.find((item) => item.channel === 'whatsapp' && item.externalThreadId === pendingGroupThreadId)
    if (!group) return
    setSelectedConversationKey(group.key); setSelectedLeadId(group.leadId ?? ''); setPendingGroupThreadId('')
  }, [conversations, pendingGroupThreadId])

  const selectConversation = (conversation: CommunicationConversation) => {
    setSelectedConversationKey(conversation.key)
    setSelectedLeadId(conversation.leadId ?? '')
  }
  const selectLead = (leadId: string) => {
    setSelectedLeadId(leadId)
    const first = conversations.find((item) => item.leadId === leadId && (channel === 'all' || item.channel === channel)) ?? conversations.find((item) => item.leadId === leadId)
    setSelectedConversationKey(first?.key ?? '')
  }

  const prefKey = selectedLead ? preferredChannelEntityKey(selectedLead) : ''
  const preferred = prefKey ? preferredChannels[prefKey] ?? 'auto' : 'auto'
  const setPreferred = (value: PreferredCommunicationChannel) => {
    if (!selectedLead) return
    savePreferredChannel(workspaceId, prefKey, value); setPreferredChannels(loadPreferredChannels(workspaceId)); notify('success', value === 'auto' ? 'Canal preferido voltou para automático.' : `${channelLabel(value)} definido como canal preferido.`)
  }
  const openMessage = (nextChannel: typeof messageChannel, purpose: typeof messagePurpose = 'followup') => {
    if (!selectedLead) { notify('info', 'Selecione um contato antes de iniciar uma abordagem.'); return }
    const officialAvailable = nextChannel === 'email' ? Boolean(channelState?.emailAccounts.length) : nextChannel === 'whatsapp' ? Boolean(channelState?.whatsappAccounts.length) : false
    if (officialAvailable && (nextChannel === 'email' || nextChannel === 'whatsapp')) {
      setOfficialComposeChannel(nextChannel)
      if (nextChannel === 'whatsapp') {
        setWorkspaceView('whatsapp')
        setChannel('all')
        const whatsappConversation = conversations.find((item) => item.leadId === selectedLead.id && item.channel === 'whatsapp')
        if (whatsappConversation) setSelectedConversationKey(whatsappConversation.key)
        window.setTimeout(() => document.getElementById('whatsapp-chat-composer')?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 0)
      } else {
        window.setTimeout(() => document.getElementById('official-communication-composer')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0)
      }
      return
    }
    setMessageChannel(nextChannel); setMessagePurpose(purpose); setMessageOpen(true)
  }
  const openSocial = (nextChannel: SocialCommunicationChannel) => {
    if (!selectedLead) { notify('info', 'Selecione um contato antes de abrir uma rede social.'); return }
    setSocialChannel(nextChannel); setSocialOpen(true)
  }
  const handleWhatsAppLinked = (lead: Lead) => {
    setSelectedLeadId(lead.id)
    setOfficial((current) => linkOfficialEventsToLeads(current, [...(snapshot?.leads ?? []).filter((item) => item.id !== lead.id), lead], workspaceId))
    window.setTimeout(() => { void reloadOfficial(true) }, 120)
  }

  const refreshAssisted = (item?: UnifiedCommunicationItem) => {
    const next = loadAssistedCommunicationTimeline(workspaceId)
    setAssisted(next)
    if (item) {
      const key = `${item.leadId ?? item.contactId ?? 'unlinked'}:${item.channel}`
      setSelectedConversationKey(key)
      if (item.leadId) setSelectedLeadId(item.leadId)
    }
  }

  const whatsappQrConnected = Boolean(channelState?.whatsappAccounts.some((item: any) => item?.metadata?.transport === 'qr' && item?.status === 'connected'))
  const whatsappQrReconnecting = Boolean(channelState?.whatsappAccounts.some((item: any) => item?.metadata?.transport === 'qr' && item?.status !== 'connected'))
  const whatsappCloudConnected = Boolean(channelState?.whatsappAccounts.some((item: any) => item?.metadata?.transport !== 'qr' && item?.status === 'connected'))
  const connectedWhatsAppCount = channelState?.whatsappAccounts.filter((item: any) => item?.status === 'connected').length ?? 0
  const whatsappConnectionText = whatsappQrConnected && whatsappCloudConnected ? '✓ WhatsApp QR + Cloud' : whatsappQrConnected ? '✓ WhatsApp QR Local' : whatsappQrReconnecting ? '↻ WhatsApp QR reconectando' : whatsappCloudConnected ? '✓ WhatsApp Cloud oficial' : '• WhatsApp assistido'
  const activeOpportunity = selectedLead ? (snapshot?.opportunities.find((item) => item.id === selectedLead.opportunityId) ?? snapshot?.opportunities.find((item) => item.leadId === selectedLead.id && item.status === 'active') ?? null) : null
  const activeProposal = selectedLead ? (snapshot?.proposals.find((item) => item.id === activeOpportunity?.officialProposalId) ?? snapshot?.proposals.find((item) => item.leadId === selectedLead.id && item.isCurrentVersion && item.isOfficial) ?? null) : null
  const contextStage = activeOpportunity ? snapshot?.stages.find((item) => item.id === activeOpportunity.stageId)?.name ?? selectedStage : selectedStage
  const contextValue = activeProposal?.totalContractValue || activeOpportunity?.value || selectedLead?.value || 0
  const communicationAreaLabel = workspaceView === 'whatsapp' ? 'WhatsApp' : workspaceView === 'email' ? 'E-mail' : workspaceView === 'call' ? 'Ligações' : workspaceView === 'activity' ? 'Atividades' : 'Caixa de entrada'
  const channelCount = (value: CommunicationChannel) => conversations.filter((item) => item.channel === value).length
  const communicationAreas = [
    { id: 'whatsapp' as const, label: 'WhatsApp', description: whatsappQrConnected || whatsappCloudConnected ? 'Conectado' : 'Assistido', icon: MessageCircle, count: channelCount('whatsapp') },
    { id: 'email' as const, label: 'E-mail', description: channelState?.emailAccounts.length ? 'Conectado' : 'Conectar conta', icon: Mail, count: channelCount('email') },
  ]
  const channelConversations = conversations.filter((item) => workspaceView === 'email' ? item.channel === 'email' : item.channel === 'whatsapp')
  const channelUnreadCount = channelConversations.reduce((sum, item) => sum + item.unreadCount, 0)
  const channelPeopleCount = channelConversations.filter((item) => item.channel === 'whatsapp' && !item.isGroup).length
  const channelGroupCount = channelConversations.filter((item) => item.channel === 'whatsapp' && item.isGroup).length
  const channelNeedsReplyCount = channelConversations.filter((item) => item.status === 'needs_reply').length

  const communicationFilterCount = (direction !== 'all' ? 1 : 0) + (period !== '30' ? 1 : 0)
  const clearCommunicationFilters = () => { setDirection('all'); setPeriod('30') }
  const universalCommunicationFilters: WorkspaceFilterField[] = [
    { key: 'direction', label: 'Direção', value: direction, allValue: 'all', allLabel: 'Todas as direções', group: 'Conversa', options: [{ value: 'inbound', label: 'Recebidas' }, { value: 'outbound', label: 'Enviadas' }, { value: 'internal', label: 'Internas' }] },
    { key: 'period', label: 'Período', value: period, allValue: '30', allLabel: '30 dias', group: 'Tempo', options: [{ value: '7', label: '7 dias' }, { value: '90', label: '90 dias' }, { value: 'all', label: 'Todo histórico' }] },
  ]
  const changeCommunicationQuickFilter = (key: string, value: string) => { if (key === 'direction') setDirection(value as typeof direction); else if (key === 'period') setPeriod(value as typeof period) }

  return <div className="communications-v10094 communication-focus-experience">
    {/* Legacy lineage: Central de Comunicação 2.0 · Omnichannel Inbox · V100.94 */}
    {/* V101.11.3-H19.4 — Communication Focus Experience */}
    {/* V101.11.3-H19.5 — Dedicated WhatsApp + Email Workspaces */}
    {/* V101.11.3-H19.6 — WhatsApp Native UX + Follow-up Focus */}
    {/* V101.11.3-H19.7 — WhatsApp Pure Chat */}
    {/* V101.11.3-H19.8 — WhatsApp Continuous Chat & Settings Control Center */}
    {/* V101.11.3-H19.13 — Work Management over H19.12 lineage; Pure Chat body remains clean */}
    {/* V101.11.3-H19.13 — WhatsApp Work Management: labels, status, owner, follow-up and Tasks outside message body */}
    {/* V101.11.3-H20.7-H2 — WhatsApp Conversation-Only Inbox: left rail is conversation navigation only */}
    <section className="panel omnichannel-hero communication-focus-header communication-channel-workspace-header">
      <div className="communication-focus-header__title"><span className="eyebrow">{workspaceView === 'email' ? <Mail size={15}/> : <MessageCircle size={15}/>} Canal de comunicação</span><h2>{communicationAreaLabel}</h2></div>
      <nav className="communication-channel-switch" aria-label="Alternar canal">
        {communicationAreas.map((item) => { const Icon = item.icon; const active = workspaceView === item.id; return <button type="button" key={item.id} className={active ? 'is-active' : ''} onClick={() => { setWorkspaceView(item.id); setChannel('all'); setInboxView('all') }}><Icon size={16}/><span>{item.label}</span>{item.count ? <b>{item.count}</b> : null}</button> })}
      </nav>
      <div className="communication-focus-header__actions"><span className={`communication-focus-health ${(workspaceView === 'email' ? channelState?.emailAccounts.length : connectedWhatsAppCount) ? 'is-live' : ''}`}><i/><strong>{workspaceView === 'email' ? (channelState?.emailAccounts.length ? 'E-mail conectado' : 'E-mail desconectado') : (connectedWhatsAppCount ? 'WhatsApp conectado' : 'WhatsApp desconectado')}</strong><small>{workspaceView === 'email' ? `${channelState?.emailAccounts.length ?? 0} conta(s) oficial(is)` : (connectedWhatsAppCount ? 'Pronto para conversar' : 'Conectar para enviar')}</small></span><Button size="sm" variant="secondary" loading={officialLoading} onClick={() => void syncNow()}><RefreshCw size={15}/> Sincronizar</Button></div>
    </section>

    {filtersOpen ? <WorkspaceAdvancedFilterDrawer title="Filtros da comunicação" eyebrow="Central de Comunicação" description="Combine canal, direção e período. Os mesmos filtros alimentam a caixa, a conversa e a timeline." onClose={() => setFiltersOpen(false)} onClear={clearCommunicationFilters}>
      <label className="field"><span>Direção</span><NativeSelectionSelect value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)}><option value="all">Todas</option><option value="inbound">Recebidas</option><option value="outbound">Enviadas</option><option value="internal">Internas</option></NativeSelectionSelect></label>
      <label className="field"><span>Período</span><NativeSelectionSelect value={period} onChange={(event) => setPeriod(event.target.value as typeof period)}><option value="7">7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option><option value="all">Todo histórico</option></NativeSelectionSelect></label>
    </WorkspaceAdvancedFilterDrawer> : null}

    {officialError ? <div className="communications-warning"><WifiOff size={17}/><span><strong>{officialError.startsWith('WhatsApp QR') ? (realtimeState === 'live' ? 'Histórico do WhatsApp precisa de atenção; tempo real está ativo.' : 'WhatsApp QR precisa de atenção.') : 'Histórico oficial indisponível.'}</strong> {officialError} A timeline local continua funcionando; ações assistidas também permanecem disponíveis.</span></div> : null}

    <section className="omnichannel-shell" ref={communicationShellRef}>
      <aside className={`panel omnichannel-conversations communication-focus-inbox ${workspaceView === 'whatsapp' ? 'communication-focus-inbox--conversations-only' : ''}`}>
        <header><div><span className="eyebrow">Conversas</span><h3>{communicationAreaLabel}</h3></div><StatusPill tone="neutral">{visibleConversations.length}</StatusPill></header>
        <div className="communication-focus-inbox__tools">
          <label className="communication-focus-search"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={workspaceView === 'whatsapp' ? 'Buscar conversas...' : 'Buscar mensagem, contato, grupo ou empresa...'} /></label>{workspaceView === 'whatsapp' ? <div className="whatsapp-inbox-create-actions is-h207h2" aria-label="Ações de conversa">{canCommunicationCreate ? <><Button size="sm" variant="secondary" title="Novo contato" onClick={() => setNewWhatsAppContactOpen(true)}><UserPlus size={14}/> Contato</Button><Button size="sm" variant="secondary" title="Novo grupo" onClick={() => setCreateWhatsAppGroupOpen(true)}><UsersRound size={14}/> Grupo</Button></> : null}<Button size="sm" variant="secondary" title="Contatos do WhatsApp" onClick={() => setWhatsAppContactsOpen(true)}><UserRound size={14}/> Contatos</Button></div> : null}
          <div className={`communication-focus-inbox__views ${workspaceView === 'whatsapp' ? 'is-whatsapp-normalized' : ''}`} aria-label="Visualização das conversas">
            <button type="button" className={inboxView === 'all' ? 'is-active' : ''} onClick={() => setInboxView('all')}>Todas <span>{channelConversations.length}</span></button>
            {workspaceView === 'whatsapp' ? <><button type="button" className={inboxView === 'people' ? 'is-active' : ''} onClick={() => setInboxView('people')}>Pessoas <span>{channelPeopleCount}</span></button><button type="button" className={inboxView === 'groups' ? 'is-active' : ''} onClick={() => setInboxView('groups')}>Grupos <span>{channelGroupCount}</span></button></> : null}
            <button type="button" className={inboxView === 'unread' ? 'is-active' : ''} onClick={() => setInboxView('unread')}>Não lidas <span>{channelUnreadCount}</span></button>
            {workspaceView !== 'whatsapp' ? <button type="button" className={inboxView === 'needs_reply' ? 'is-active is-priority' : ''} onClick={() => setInboxView('needs_reply')}>Responder <span>{channelNeedsReplyCount}</span></button> : null}
          </div>
          {workspaceView !== 'whatsapp' ? <div className="communication-focus-inbox__filter-row">
            <WorkspaceFilterMenu workspaceKey={`communications:${workspaceId}`} fields={universalCommunicationFilters} activeCount={communicationFilterCount} onOpenAdvanced={() => setFiltersOpen(true)} onClearAll={clearCommunicationFilters} onChange={changeCommunicationQuickFilter} />
            <label className="communication-focus-contact-jump"><UserRound size={14}/><NativeSelectionSelect aria-label="Ir para contato" value={selectedLead?.id ?? ''} onChange={(event) => selectLead(event.target.value)}><option value="">Ir para contato...</option>{snapshot?.leads.filter((lead) => lead.status === 'active').sort((a,b) => a.name.localeCompare(b.name)).map((lead) => <option key={lead.id} value={lead.id}>{lead.name} · {lead.company || 'Sem empresa'}</option>)}</NativeSelectionSelect></label>
          </div> : null}
        </div>
        <div className="omnichannel-conversation-list">{visibleConversations.length ? visibleConversations.map((conversation) => {
          const lead = conversation.leadId ? leadsById.get(conversation.leadId) : undefined
          const Icon = channelIcons[conversation.channel] ?? SlidersHorizontal
          const qrLocal = conversation.events.some((event) => event.metadata?.transport === 'qr')
          return <button type="button" className={`omnichannel-conversation ${conversation.isGroup ? 'is-group' : 'is-person'} ${selectedConversationKey === conversation.key ? 'is-active' : ''}`} key={conversation.key} onClick={() => selectConversation(conversation)}>
            <span className={`omnichannel-conversation__icon omnichannel-conversation__icon--${conversation.channel}`}><Icon size={17}/></span>
            <span className="omnichannel-conversation__content"><span className="omnichannel-conversation__top"><strong>{conversationLabel(conversation, lead)}</strong><time>{daysAgo(conversation.lastOccurredAt) === 0 ? 'Hoje' : `${daysAgo(conversation.lastOccurredAt)}d`}</time></span><small>{lead?.company || channelLabel(conversation.channel)}</small><span className="omnichannel-conversation__preview">{conversation.preview}</span><span className="omnichannel-conversation__meta">{conversationStatusText(conversation) ? <em>{conversationStatusText(conversation)}</em> : null}{conversation.channel === 'whatsapp' ? null : (qrLocal ? <b>QR Local</b> : conversation.official ? <b>Oficial</b> : null)}{conversation.unreadCount ? <i>{conversation.unreadCount}</i> : null}</span></span>
          </button>
        }) : <div className="communications-empty-feed"><Inbox size={30}/><strong>Nenhuma conversa</strong><p>Nenhuma conversa neste canal. Sincronize a conta ou escolha um contato para iniciar uma conversa.</p></div>}</div>
      </aside>

      <main className={`panel omnichannel-thread ${selectedConversation?.channel === 'whatsapp' ? 'is-whatsapp-chat' : ''}`}>
        {workspaceView === 'whatsapp' && (selectedConversation?.channel === 'whatsapp' || selectedLead) ? <WhatsAppChatPanel
          lead={selectedLead}
          externalIdentity={selectedConversation?.channel === 'whatsapp' ? selectedWhatsAppExternalIdentity : undefined}
          workspaceId={workspaceId}
          conversationKey={selectedConversation?.key ?? `lead:${selectedLead?.id ?? 'new'}:whatsapp`}
          conversationStatus={selectedConversation?.status ?? 'idle'}
          lastOccurredAt={selectedConversation?.lastOccurredAt ?? null}
          events={displayedSelectedEvents.filter((item) => item.channel === 'whatsapp')}
          countryCode={preferences.integrations.whatsappCountryCode}
          preferredAccountId={preferences.integrations.whatsappOfficialAccountId}
          workToolbar={<WhatsAppWorkToolbar
            workspaceId={workspaceId}
            conversationKey={selectedConversation?.key ?? `lead:${selectedLead?.id ?? 'new'}:whatsapp`}
            conversationStatus={selectedConversation?.status ?? 'idle'}
            lead={selectedLead}
            displayName={selectedConversation ? conversationLabel(selectedConversation, selectedLead ?? undefined) : selectedLead?.name ?? 'Contato WhatsApp'}
            state={resolveWhatsAppWorkState(workspaceId, selectedConversation?.key ?? `lead:${selectedLead?.id ?? 'new'}:whatsapp`, selectedConversation?.status ?? 'idle')}
            labels={whatsappWorkLabels}
            onChanged={() => setWorkRevision((current) => current + 1)}
          />}
          syncing={officialLoading}
          realtimeState={realtimeState}
          readOnly={!canCommunicationEdit || (selectedLead ? !canTeamAccessRecord('communications', selectedLead.ownerId) : false)}
          onSync={() => void syncNow()}
          onManageContact={() => setContactLinkOpen(true)}
          onOpenLeadContext={selectedLead ? () => { setLeadContextTab('summary'); setLeadContextOpen(true) } : undefined}
          onSalesStateChanged={() => setSalesStateRevision((current) => current + 1)}
          onSent={() => { void reloadOfficial(true) }}
          onError={(message) => notify('error', message)}
        /> : workspaceView === 'email' ? <EmailConversationPanel
          lead={selectedLead}
          events={displayedSelectedEvents.filter((item) => item.channel === 'email')}
          workspaceId={workspaceId}
          accounts={channelState?.emailAccounts ?? []}
          repositoryMode={repositoryMode}
          canConnect={can('manage','integration')}
          loading={officialLoading}
          readOnly={!canCommunicationEdit || (selectedLead ? !canTeamAccessRecord('communications', selectedLead.ownerId) : true)}
          onSync={() => void syncNow()}
          onOpenLeadContext={selectedLead ? () => { setLeadContextTab('summary'); setLeadContextOpen(true) } : undefined}
          onSent={(message) => { notify('success', message); void reloadOfficial(true) }}
          onError={(message) => notify('error', message)}
        /> : selectedLead ? <>
          <header className="omnichannel-thread__header">
            <button type="button" className="omnichannel-thread__identity communication-focus-contact-trigger" onClick={() => { setLeadContextTab('summary'); setLeadContextOpen(true) }} aria-label={`Abrir contexto de ${selectedLead.name}`}><div className="communications-contact-card__avatar">{selectedLead.name.slice(0,2).toUpperCase()}</div><div><span className="eyebrow">Contato em foco</span><h3>{selectedLead.name}</h3><p>{selectedLead.company || 'Sem empresa'} · {selectedStage}</p></div><Info size={16}/></button>
            <div className="omnichannel-thread__health"><span><Clock3 size={14}/> Último contato</span><strong>{lastContact ? formatDateTime(lastContact.occurredAt) : 'Sem histórico'}</strong><small>{lastContact ? `${channelLabel(lastContact.channel)} · ${directionLabel(lastContact.direction)}` : 'Inicie a primeira interação.'}</small></div>
          </header>

          <div className="omnichannel-contact-context">
            <div><span>Telefone</span><strong>{selectedLead.phone || 'Não informado'}</strong></div><div><span>E-mail</span><strong>{selectedLead.email || 'Não informado'}</strong></div><div><span>Responsável</span><strong>{selectedLead.ownerName || 'Equipe'}</strong></div><div><span>Canal preferido</span><strong>{channelLabel(preferred)}</strong></div>
          </div>

          <div className="omnichannel-actions" aria-label="Iniciar contato">
            <button type="button" onClick={() => openMessage('whatsapp')} disabled={!canCommunicationEdit || !selectedLead.phone || selectedLead.doNotContact}><MessageCircle size={18}/><span>WhatsApp</span></button>
            <button type="button" onClick={() => openMessage('email')} disabled={!canCommunicationEdit || !selectedLead.email || selectedLead.doNotContact}><Mail size={18}/><span>E-mail</span></button>
            <button type="button" onClick={() => openSocial('instagram')} disabled={!canCommunicationEdit || !preferences.integrations.assistedInstagram || !selectedLead.instagramUrl || selectedLead.doNotContact}><MessagesSquare size={18}/><span>Instagram</span></button>
            <button type="button" onClick={() => openSocial('facebook')} disabled={!canCommunicationEdit || !preferences.integrations.assistedFacebook || !selectedLead.facebookUrl || selectedLead.doNotContact}><UserRound size={18}/><span>Facebook</span></button>
            <button type="button" onClick={() => openSocial('linkedin')} disabled={!canCommunicationEdit || !preferences.integrations.assistedLinkedin || !selectedLead.linkedinUrl || selectedLead.doNotContact}><ExternalLink size={18}/><span>LinkedIn</span></button>
            <button type="button" onClick={() => openMessage('call')} disabled={!canCommunicationEdit || !selectedLead.phone || selectedLead.doNotContact}><PhoneCall size={18}/><span>Ligação</span></button>
            <button type="button" disabled={!canCommunicationEdit} onClick={() => setMeetingOpen(true)}><CalendarPlus size={18}/><span>Reunião</span></button>
          </div>

          <div className="omnichannel-preferred"><span>Canal preferido</span><div>{(['auto','whatsapp','email','instagram','facebook','linkedin','call','meeting'] as PreferredCommunicationChannel[]).map((item) => <button type="button" className={preferred === item ? 'is-active' : ''} key={item} onClick={() => setPreferred(item)}>{channelLabel(item)}</button>)}</div></div>

          <section className="omnichannel-timeline">
            <header><div><span className="eyebrow">Histórico unificado · conversa</span><h3>{selectedConversation ? channelLabel(selectedConversation.channel) : 'Todos os canais do contato'}</h3></div><StatusPill tone="info">{displayedSelectedEvents.length} evento(s)</StatusPill></header>
            <div className="communications-timeline">{displayedSelectedEvents.length ? displayedSelectedEvents.map((item) => {
              const Icon = channelIcons[item.channel] ?? SlidersHorizontal
              return <article key={item.id} className={`communications-event communications-event--${item.channel}`}><div className="communications-event__icon"><Icon size={17}/></div><div className="communications-event__body"><div className="communications-event__top"><div><strong>{item.title || channelLabel(item.channel)}</strong><span>{directionLabel(item.direction)} · {statusLabel(item.status)}</span></div><time>{formatDateTime(item.occurredAt)}</time></div>{item.body ? <p>{item.body}</p> : null}<footer><StatusPill tone={channelTone(item.channel) as any}>{channelLabel(item.channel)}</StatusPill><span className={item.official ? 'is-official' : ''}>{item.source === 'official' && item.metadata?.transport === 'qr' ? 'QR Local / sincronizado' : item.official ? 'Oficial / sincronizado' : item.source === 'assisted' ? 'Assistido / confirmado pelo vendedor' : item.source === 'call' ? 'Workspace de ligações' : item.source === 'calendar' ? 'Agenda CRM' : 'Atividade CRM'}</span></footer></div></article>
            }) : <div className="communications-empty-feed"><Send size={30}/><strong>Sem histórico ainda</strong><p>Use uma das ações acima para iniciar o relacionamento.</p></div>}</div>
          </section>

          <div id="official-communication-composer">
            <OfficialConversationComposer
              lead={selectedLead}
              workspaceId={workspaceId}
              initialChannel={officialComposeChannel ?? selectedConversation?.channel ?? null}
              countryCode={preferences.integrations.whatsappCountryCode}
              preferredWhatsAppAccountId={preferences.integrations.whatsappOfficialAccountId}
              readOnly={!canCommunicationEdit || !canTeamAccessRecord('communications', selectedLead.ownerId)}
              onSent={(message, channel) => { if (channel === 'email') notify('success', message); void reloadOfficial(true) }}
              onError={(message) => notify('error', message)}
            />
          </div>
        </> : <div className="omnichannel-thread__empty"><UserRound size={38}/><strong>Selecione uma conversa ou contato</strong><p>O histórico multicanal, ações rápidas, perfis sociais e próxima resposta aparecerão aqui.</p></div>}
      </main>

    </section>

    {leadContextOpen && selectedLead ? <div className="communication-lead-drawer-layer" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setLeadContextOpen(false) }}>
      <aside className="communication-lead-drawer" role="dialog" aria-modal="true" aria-label={`Contexto comercial de ${selectedLead.name}`}>
        <header className="communication-lead-drawer__header">
          <button type="button" className="communication-lead-drawer__identity" onClick={() => navigate('leads', { leadId: selectedLead.id, action: 'contact-record' })}>
            <span className="communication-lead-drawer__avatar">{selectedLead.name.slice(0,2).toUpperCase()}</span>
            <span><small>Contexto CRM</small><strong>{selectedLead.name}</strong><em>{selectedLead.company || 'Sem empresa'}</em></span>
          </button>
          <button type="button" className="communication-lead-drawer__close" aria-label="Fechar contexto do lead" onClick={() => setLeadContextOpen(false)}><X size={18}/></button>
        </header>

        <nav className="communication-lead-drawer__tabs" aria-label="Seções do contexto comercial">
          <button type="button" className={leadContextTab === 'summary' ? 'is-active' : ''} onClick={() => setLeadContextTab('summary')}><Info size={15}/> Resumo</button>
          <button type="button" className={leadContextTab === 'deal' ? 'is-active' : ''} onClick={() => setLeadContextTab('deal')}><BriefcaseBusiness size={15}/> Negócio</button>
          <button type="button" className={leadContextTab === 'history' ? 'is-active' : ''} onClick={() => setLeadContextTab('history')}><History size={15}/> Histórico</button>
        </nav>

        <div className="communication-lead-drawer__body">
          {leadContextTab === 'summary' ? <>
            <section className="communication-lead-section">
              <span className="communication-lead-section__label">Contato</span>
              <div className="communication-lead-facts"><div><span>Telefone</span><strong>{selectedLead.phone || 'Não informado'}</strong></div><div><span>E-mail</span><strong>{selectedLead.email || 'Não informado'}</strong></div><div><span>Responsável</span><strong>{selectedLead.ownerName || 'Sem responsável'}</strong></div><div><span>Temperatura</span><strong>{selectedLead.temperature === 'hot' ? 'Quente' : selectedLead.temperature === 'warm' ? 'Morno' : 'Frio'}</strong></div></div>
            </section>
            <section className="communication-lead-section is-highlight">
              <span className="communication-lead-section__label">Próxima ação</span>
              <strong className="communication-lead-section__headline">{selectedLead.nextActionAt ? formatDateTime(selectedLead.nextActionAt) : 'Sem próxima ação definida'}</strong>
              <p>{selectedLead.nextActionAt ? 'Próximo passo já registrado no CRM.' : 'Crie um próximo passo sem sair da conversa.'}</p>
              <div className="communication-lead-actions"><button type="button" onClick={() => navigate('followups', { leadId: selectedLead.id })}><CheckCircle2 size={15}/> Follow-up</button><button type="button" disabled={!canCommunicationEdit} onClick={() => setMeetingOpen(true)}><CalendarPlus size={15}/> Reunião</button></div>
            </section>
            <section className="communication-lead-section">
              <span className="communication-lead-section__label">Relacionamento</span>
              <div className="communication-lead-facts"><div><span>Última interação</span><strong>{lastContact ? formatDateTime(lastContact.occurredAt) : 'Sem histórico'}</strong></div><div><span>Canal atual</span><strong>{lastContact ? channelLabel(lastContact.channel) : '—'}</strong></div></div>
            </section>
          </> : null}

          {leadContextTab === 'deal' ? <>
            <section className="communication-lead-section is-deal">
              <div className="communication-lead-section__top"><span className="communication-lead-section__label">Negócio em foco</span>{activeProposal ? <StatusPill tone={activeProposal.status === 'accepted' ? 'success' : 'info'}>{activeProposal.status === 'accepted' ? 'Aceita' : activeProposal.status === 'sent' ? 'Enviada' : activeProposal.status === 'viewed' ? 'Visualizada' : 'Proposta'}</StatusPill> : null}</div>
              <strong className="communication-lead-section__headline">{activeOpportunity?.title || selectedLead.company || selectedLead.name}</strong>
              <div className="communication-lead-deal-metrics"><div><span>Valor</span><strong>{contextValue ? formatCurrency(contextValue) : 'Não informado'}</strong></div><div><span>Etapa</span><strong>{contextStage}</strong></div></div>
              {activeProposal ? <div className="communication-lead-proposal"><FileText size={16}/><span><small>Proposta atual</small><strong>{activeProposal.proposalNumber}</strong><em>{formatCurrency(activeProposal.totalContractValue)}</em></span></div> : <p>Nenhuma proposta oficial ativa para este lead.</p>}
              <div className="communication-lead-actions"><button type="button" onClick={() => navigate('pipeline', { leadId: selectedLead.id })}><BriefcaseBusiness size={15}/> Pipeline</button><button type="button" onClick={() => navigate('proposals', activeProposal ? { leadId: selectedLead.id, proposalId: activeProposal.id } : { leadId: selectedLead.id })}><FileText size={15}/> {activeProposal ? 'Abrir proposta' : 'Criar proposta'}</button></div>
            </section>
          </> : null}

          {leadContextTab === 'history' ? <section className="communication-lead-section communication-lead-history">
            <div className="communication-lead-section__top"><span className="communication-lead-section__label">Últimas interações</span><StatusPill tone="neutral">{selectedEvents.length}</StatusPill></div>
            {selectedEvents.length ? selectedEvents.slice(0, 8).map((item) => { const Icon = channelIcons[item.channel] ?? SlidersHorizontal; return <article key={item.id}><span className={`communication-lead-history__icon is-${item.channel}`}><Icon size={14}/></span><div><strong>{item.title || channelLabel(item.channel)}</strong><p>{item.body || item.subject || directionLabel(item.direction)}</p><small>{formatDateTime(item.occurredAt)} · {channelLabel(item.channel)}</small></div></article> }) : <div className="communication-lead-history__empty"><History size={24}/><span>Nenhuma interação registrada.</span></div>}
          </section> : null}
        </div>

        <footer className="communication-lead-drawer__footer">
          <Button variant="secondary" onClick={() => navigate('leads', { leadId: selectedLead.id, action: 'contact-record' })}><UserRound size={15}/> Abrir contato completo</Button>
        </footer>
      </aside>
    </div> : null}

    <WhatsAppContactsModal open={whatsAppContactsOpen} onClose={() => setWhatsAppContactsOpen(false)} workspaceId={workspaceId} leads={snapshot?.leads ?? []} onCreated={(lead) => { setWorkspaceView('whatsapp'); setSelectedLeadId(lead.id); setSelectedConversationKey(''); setWhatsAppContactsOpen(false); void reloadOfficial(true) }} />
    <WhatsAppNewContactModal open={canCommunicationCreate && newWhatsAppContactOpen} onClose={() => setNewWhatsAppContactOpen(false)} onCreated={(lead) => { setWorkspaceView('whatsapp'); setSelectedLeadId(lead.id); setSelectedConversationKey('') }} />
    <WhatsAppCreateGroupModal open={canCommunicationCreate && createWhatsAppGroupOpen} onClose={() => setCreateWhatsAppGroupOpen(false)} workspaceId={workspaceId} leads={(snapshot?.leads ?? []).filter((lead) => lead.status === 'active')} countryCode={preferences.integrations.whatsappCountryCode} onCreated={(groupId) => { setPendingGroupThreadId(groupId); void reloadOfficial(true) }} />
    <WhatsAppContactLinkModal open={contactLinkOpen} onClose={() => setContactLinkOpen(false)} workspaceId={workspaceId} conversation={selectedConversation?.channel === 'whatsapp' ? selectedConversation : null} onLinked={handleWhatsAppLinked} />
    <SalesMessageModal lead={selectedLead} stageName={selectedStage} templatePurpose={messagePurpose} initialChannel={messageChannel} open={messageOpen} onClose={() => setMessageOpen(false)} />
    <SocialTouchModal lead={selectedLead} channel={socialChannel} workspaceId={workspaceId} open={socialOpen} onClose={() => setSocialOpen(false)} onRecorded={refreshAssisted} />
    <MeetingQuickModal lead={selectedLead} open={meetingOpen} onClose={() => setMeetingOpen(false)} />
  </div>
}
