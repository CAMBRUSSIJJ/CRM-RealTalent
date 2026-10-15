import { BadgeDollarSign, CalendarClock, Check, CopyPlus, FilePenLine, Handshake, PhoneCall, ReceiptText, Send, Star, Trash2, UserRound, XCircle } from 'lucide-react'
import { useMemo } from 'react'
import { Modal } from '../../components/ui/modal'
import { Button } from '../../components/ui/button'
import { StatusPill } from '../../components/ui/status-pill'
import { formatCurrency, formatDateTime } from '../../domain/formatters'
import type { ProposalRecord, ProposalStatus, WorkspaceSnapshot } from '../../domain/types'
import { decisionRoleLabels } from '../../services/account-intelligence'

const statusMeta: Record<ProposalStatus, { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }> = {
  draft: { label: 'Rascunho', tone: 'neutral' }, sent: { label: 'Enviada', tone: 'info' }, viewed: { label: 'Visualizada', tone: 'warning' },
  accepted: { label: 'Aceita', tone: 'success' }, rejected: { label: 'Recusada', tone: 'danger' }, expired: { label: 'Expirada', tone: 'warning' }, cancelled: { label: 'Cancelada', tone: 'neutral' },
}
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(value)) : '—'

interface Props {
  open: boolean
  proposal: ProposalRecord | null
  snapshot: WorkspaceSnapshot
  canWrite: boolean
  onClose(): void
  onEdit(proposal: ProposalRecord): void
  onStatus(proposal: ProposalRecord, status: ProposalStatus): void
  onRevision(proposal: ProposalRecord): void
  onOfficial(proposal: ProposalRecord): void
  onCloseWon(proposal: ProposalRecord): void
  onRevenue(proposal: ProposalRecord): void
  onFollowup(proposal: ProposalRecord): void
  onBuyerRoom(proposal: ProposalRecord): void
  onDelete(proposal: ProposalRecord): void
}

export function Proposal360Modal(props: Props) {
  const { proposal, snapshot } = props
  const lead = proposal ? snapshot.leads.find((item) => item.id === proposal.leadId) ?? null : null
  const contacts = useMemo(() => !proposal ? [] : snapshot.contacts.filter((contact) => contact.companyId === proposal.companyId).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || b.influenceLevel - a.influenceLevel), [proposal, snapshot.contacts])
  if (!proposal) return null

  const timeline = [
    { label: 'Criada', at: proposal.createdAt },
    { label: 'Enviada', at: proposal.sentAt },
    { label: 'Visualizada', at: proposal.viewedAt },
    { label: 'Aceita', at: proposal.acceptedAt },
    { label: 'Negócio ganho', at: proposal.closedWonAt },
  ].filter((item): item is { label: string; at: string } => Boolean(item.at))
  const nextAction = proposal.closedWonAt ? 'Reconhecer receita' : proposal.status === 'accepted' ? 'Fechar negócio' : proposal.status === 'draft' ? 'Revisar e enviar' : ['sent', 'viewed'].includes(proposal.status) ? 'Fazer follow-up' : 'Sem ação pendente'

  const primaryAction = () => {
    if (proposal.closedWonAt) return <Button disabled={!props.canWrite} onClick={() => props.onRevenue(proposal)}><ReceiptText size={16}/> Reconhecer receita</Button>
    if (proposal.status === 'accepted') return <Button disabled={!props.canWrite} onClick={() => props.onCloseWon(proposal)}><BadgeDollarSign size={16}/> Fechar negócio</Button>
    if (proposal.status === 'draft') return <Button disabled={!props.canWrite} onClick={() => props.onStatus(proposal, 'sent')}><Send size={16}/> Revisar e enviar</Button>
    if (proposal.status === 'sent') return <Button disabled={!props.canWrite} onClick={() => props.onStatus(proposal, 'viewed')}><Check size={16}/> Registrar visualização</Button>
    if (proposal.status === 'viewed') return <Button disabled={!props.canWrite} onClick={() => props.onFollowup(proposal)}><PhoneCall size={16}/> Criar follow-up</Button>
    return null
  }

  return <Modal open={props.open} onClose={props.onClose} size="xl" title={`${proposal.proposalNumber} · v${proposal.version}`} subtitle={`${lead?.company || lead?.name || 'Cliente'} · ${proposal.title}`} headerActions={proposal.isOfficial ? <span className="proposal360-official"><Star size={14}/> Oficial</span> : undefined} footer={<><span className="proposal360-next">Próxima ação <strong>{nextAction}</strong></span><span className="modal__footer-spacer"/>{primaryAction()}<Button variant="secondary" onClick={props.onClose}>Fechar</Button></>}>
    <div className="proposal360">
      <section className="proposal360-hero">
        <div><span className="eyebrow">Situação comercial</span><div className="proposal360-status"><StatusPill tone={statusMeta[proposal.status].tone}>{statusMeta[proposal.status].label}</StatusPill>{proposal.closedWonAt ? <StatusPill tone="success">Negócio ganho</StatusPill> : null}</div><h3>{proposal.title}</h3><p>{lead?.name || 'Lead removido'}{lead?.ownerName ? ` · responsável ${lead.ownerName}` : ''}</p></div>
        <div className="proposal360-money"><div><span>TCV</span><strong>{formatCurrency(proposal.totalContractValue)}</strong></div><div><span>MRR</span><strong>{formatCurrency(proposal.recurringMonthlyTotal)}</strong></div><div><span>ARR</span><strong>{formatCurrency(proposal.annualRecurringTotal)}</strong></div></div>
      </section>

      <div className="proposal360-grid">
        <section className="panel proposal360-section"><header><span className="eyebrow">Histórico</span><h3>Linha do tempo</h3></header><div className="proposal360-timeline">{timeline.map((item) => <div key={item.label}><span/><div><strong>{item.label}</strong><small>{formatDateTime(item.at)}</small></div></div>)}</div></section>
        <section className="panel proposal360-section"><header><span className="eyebrow">Condições</span><h3>Datas e contrato</h3></header><div className="proposal360-facts"><div><CalendarClock size={15}/><span><small>Validade</small><strong>{formatDate(proposal.validUntil)}</strong></span></div><div><CalendarClock size={15}/><span><small>Fechamento previsto</small><strong>{formatDate(proposal.expectedCloseAt)}</strong></span></div><div><CalendarClock size={15}/><span><small>Contrato</small><strong>{proposal.contractTermMonths} meses{proposal.autoRenew ? ' · renovação automática' : ''}</strong></span></div></div></section>
      </div>

      <section className="panel proposal360-section"><header><span className="eyebrow">Escopo</span><h3>Itens da proposta</h3></header><div className="proposal360-items">{proposal.items.map((item) => <div key={item.id}><span><strong>{item.name}</strong><small>{item.description || `${item.quantity} × ${formatCurrency(item.unitPrice)}`}</small></span><span><strong>{formatCurrency(item.lineTotal)}</strong>{item.recurringMonthlyTotal ? <small>{formatCurrency(item.recurringMonthlyTotal)} MRR</small> : null}</span></div>)}</div></section>

      <section className="panel proposal360-section"><header><span className="eyebrow">Buying committee</span><h3>Stakeholders relacionados</h3></header>{contacts.length ? <div className="proposal360-stakeholders">{contacts.slice(0, 6).map((contact) => <div key={contact.id}><span className="lead-cell__avatar">{contact.name.split(/\s+/).slice(0,2).map((part) => part[0]).join('').toUpperCase()}</span><span><strong>{contact.name}</strong><small>{contact.jobTitle || decisionRoleLabels[contact.decisionRole]}</small></span><em>{decisionRoleLabels[contact.decisionRole]}</em></div>)}</div> : <div className="proposal360-empty"><UserRound size={20}/> Nenhum stakeholder estruturado nesta conta.</div>}</section>

      <div className="proposal360-secondary-actions">
        <Button variant="secondary" disabled={!props.canWrite} onClick={() => props.onBuyerRoom(proposal)}><Handshake size={15}/> Buyer Room</Button>
        <Button variant="secondary" disabled={!props.canWrite || proposal.status !== 'draft'} onClick={() => props.onEdit(proposal)}><FilePenLine size={15}/> Editar</Button>
        <Button variant="secondary" disabled={!props.canWrite || Boolean(proposal.closedWonAt)} onClick={() => props.onRevision(proposal)}><CopyPlus size={15}/> Criar revisão</Button>
        {!proposal.isOfficial ? <Button variant="secondary" disabled={!props.canWrite} onClick={() => props.onOfficial(proposal)}><Star size={15}/> Tornar oficial</Button> : null}
        {['sent', 'viewed'].includes(proposal.status) ? <Button variant="secondary" disabled={!props.canWrite} onClick={() => props.onStatus(proposal, 'accepted')}><Check size={15}/> Aceitar e converter em ganho</Button> : null}
        {['sent', 'viewed'].includes(proposal.status) ? <Button variant="ghost" disabled={!props.canWrite} onClick={() => props.onStatus(proposal, 'rejected')}><XCircle size={15}/> Registrar recusa</Button> : null}
        {!proposal.isOfficial && proposal.status !== 'accepted' && !proposal.closedWonAt ? <Button variant="ghost" disabled={!props.canWrite} onClick={() => props.onDelete(proposal)}><Trash2 size={15}/> Excluir alternativa</Button> : null}
      </div>
    </div>
  </Modal>
}
