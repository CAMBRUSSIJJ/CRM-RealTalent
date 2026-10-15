import { CalendarClock, FileText, History, PhoneCall, Sparkles, Target, UsersRound } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/modal'
import { formatCurrency, formatDateTime } from '../../domain/formatters'
import type { WorkspaceSnapshot } from '../../domain/types'
import type { DealIntelligence } from '../../services/deal-intelligence'
import { DealHealthPanel } from './deal-health-panel'
import '../../styles/deal-intelligence-v10062.css'

interface Props {
  open: boolean
  insight: DealIntelligence | null
  snapshot: WorkspaceSnapshot | null
  readOnly?: boolean
  onClose(): void
  onExecute?(insight: DealIntelligence): void
  onOpenAccount?(insight: DealIntelligence): void
  onOpenLead?(insight: DealIntelligence): void
}

interface TimelineItem {
  id: string
  date: string
  title: string
  detail: string
  kind: 'call' | 'activity' | 'event' | 'proposal'
}

const proposalStatusLabel: Record<string, string> = {
  draft: 'Rascunho criado', sent: 'Proposta enviada', viewed: 'Proposta visualizada', accepted: 'Proposta aceita', rejected: 'Proposta rejeitada', expired: 'Proposta expirada', cancelled: 'Proposta cancelada',
}

const callOutcomeLabel: Record<string, string> = {
  answered: 'Atendeu', no_answer: 'Não atendeu', busy: 'Ocupado', voicemail: 'Caixa postal', callback_requested: 'Pediu retorno', interested: 'Demonstrou interesse', meeting_scheduled: 'Reunião marcada', proposal_requested: 'Solicitou proposta', proposal_sent: 'Proposta enviada', wrong_person: 'Pessoa errada', invalid_number: 'Número inválido', not_interested: 'Sem interesse', sale_completed: 'Venda concluída', other: 'Outro',
}

function buildTimeline(insight: DealIntelligence, snapshot: WorkspaceSnapshot): TimelineItem[] {
  const leadId = insight.lead.id
  const items: TimelineItem[] = []
  for (const call of snapshot.calls.filter((item) => item.leadId === leadId)) items.push({ id: `call-${call.id}`, kind: 'call', date: call.endedAt ?? call.startedAt, title: `Ligação · ${callOutcomeLabel[call.outcome] ?? call.outcome}`, detail: call.notes || `${Math.max(0, Math.round(call.durationSeconds / 60))} min registrados.` })
  for (const activity of snapshot.activities.filter((item) => item.leadId === leadId)) items.push({ id: `activity-${activity.id}`, kind: 'activity', date: activity.completedAt ?? activity.dueAt ?? activity.createdAt, title: activity.completedAt ? `Atividade concluída · ${activity.title}` : `Atividade · ${activity.title}`, detail: activity.description || (activity.dueAt ? `Prazo ${formatDateTime(activity.dueAt)}` : 'Atividade comercial registrada.') })
  for (const event of snapshot.events.filter((item) => item.leadId === leadId)) items.push({ id: `event-${event.id}`, kind: 'event', date: event.startsAt, title: `${event.status === 'completed' ? 'Reunião concluída' : event.status === 'cancelled' ? 'Compromisso cancelado' : 'Compromisso'} · ${event.title}`, detail: event.description || event.location || `${formatDateTime(event.startsAt)} — ${formatDateTime(event.endsAt)}` })
  for (const proposal of snapshot.proposals.filter((item) => item.leadId === leadId && item.isCurrentVersion)) {
    const statusDate = proposal.acceptedAt ?? proposal.rejectedAt ?? proposal.viewedAt ?? proposal.sentAt ?? proposal.updatedAt ?? proposal.createdAt
    items.push({ id: `proposal-${proposal.id}`, kind: 'proposal', date: statusDate, title: `${proposalStatusLabel[proposal.status] ?? 'Proposta atualizada'} · ${proposal.proposalNumber}`, detail: `${proposal.title} · ${formatCurrency(proposal.totalContractValue)}${proposal.isOfficial ? ' · oficial' : ''}` })
  }
  return items.filter((item) => Number.isFinite(new Date(item.date).getTime())).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 20)
}

const TimelineIcon = ({ kind }: { kind: TimelineItem['kind'] }) => kind === 'call' ? <PhoneCall size={15} /> : kind === 'event' ? <CalendarClock size={15} /> : kind === 'proposal' ? <FileText size={15} /> : <Target size={15} />

export function DealInspectorModal({ open, insight, snapshot, readOnly = false, onClose, onExecute, onOpenAccount, onOpenLead }: Props) {
  if (!insight || !snapshot) return null
  const timeline = buildTimeline(insight, snapshot)
  return <Modal open={open} title="Deal Inspector" subtitle={`${insight.lead.name} · ${insight.lead.company || 'Oportunidade'} · análise explicável baseada nos dados atuais do CRM`} size="xl" onClose={onClose} footer={<><Button variant="secondary" onClick={() => onOpenLead?.(insight)}>Abrir ficha</Button><Button variant="secondary" onClick={() => onOpenAccount?.(insight)}><UsersRound size={15} /> Account 360</Button>{!readOnly && onExecute ? <Button onClick={() => onExecute(insight)}><Sparkles size={15} /> {insight.nextBestAction.title}</Button> : null}</>}>
    <div className="deal-inspector">
      <DealHealthPanel insight={insight} readOnly={readOnly} onExecute={onExecute ? () => onExecute(insight) : undefined} onOpenAccount={onOpenAccount ? () => onOpenAccount(insight) : undefined} />
      <section className="deal-inspector__explain">
        <header><div><span className="eyebrow"><Sparkles size={13} /> Explainability</span><h3>Por que {insight.healthScore}?</h3></div><span className="deal-inspector__generated">Atualizado {formatDateTime(insight.generatedAt)}</span></header>
        <div className="deal-inspector__explain-grid">
          <article><span>Probabilidade do vendedor</span><strong>{insight.sellerProbability}%</strong><small>Etapa/oportunidade configurada</small></article>
          <article><span>Probabilidade RealTalent</span><strong>{insight.realTalentProbability}%</strong><small>{insight.probabilityGap >= 0 ? '+' : ''}{insight.probabilityGap} p.p. vs. vendedor</small></article>
          <article><span>Stakeholders</span><strong>{insight.stakeholderCount}</strong><small>{insight.accountCoverage}% de cobertura</small></article>
          <article><span>Fechamento</span><strong>{insight.expectedCloseAt ? formatDateTime(insight.expectedCloseAt) : 'Não definido'}</strong><small>{formatCurrency(insight.commercialValue)} em jogo</small></article>
        </div>
      </section>
      <section className="deal-inspector__timeline">
        <header><div><span className="eyebrow"><History size={13} /> Timeline inteligente</span><h3>O que está movendo este negócio</h3></div><small>Eventos reais do CRM, sem inventar histórico de score.</small></header>
        {timeline.length ? <div className="deal-inspector__timeline-list">{timeline.map((item) => <article key={item.id}><span className={`deal-inspector__timeline-icon deal-inspector__timeline-icon--${item.kind}`}><TimelineIcon kind={item.kind} /></span><div><small>{formatDateTime(item.date)}</small><strong>{item.title}</strong><p>{item.detail}</p></div></article>)}</div> : <div className="deal-inspector__empty"><History size={22} /><strong>Ainda não há histórico comercial suficiente.</strong><span>Registre ligações, atividades, reuniões ou propostas para enriquecer a leitura do negócio.</span></div>}
      </section>
    </div>
  </Modal>
}
