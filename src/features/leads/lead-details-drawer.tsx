import {
  AlertTriangle, Archive, Building2, CalendarClock, CalendarPlus, CheckCircle2, ChevronRight, Clock3, Edit3, ExternalLink,
  FileText, History, Mail, MapPin, MessageCircle, PhoneCall, RefreshCw, Tag, UserRound, X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useApp } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { StatusPill } from '../../components/ui/status-pill'
import { formatCurrency, formatDateTime, initials } from '../../domain/formatters'
import type { ActivityType, Lead } from '../../domain/types'
import { leadDataIssues, leadPriorityInsight, type DuplicateMatch } from '../../services/lead-intelligence'

const activityLabel: Record<ActivityType, string> = {
  call: 'Ligação programada', followup: 'Follow-up', meeting: 'Reunião', note: 'Nota', stage_change: 'Mudança de etapa',
}
const callOutcomeLabel: Record<string, string> = {
  answered: 'Atendeu', no_answer: 'Não atendeu', busy: 'Ocupado', voicemail: 'Caixa postal', callback_requested: 'Pediu retorno', interested: 'Demonstrou interesse',
  meeting_scheduled: 'Reunião marcada', proposal_requested: 'Solicitou proposta', proposal_sent: 'Proposta enviada', wrong_person: 'Pessoa errada', invalid_number: 'Número inválido',
  not_interested: 'Sem interesse', sale_completed: 'Venda concluída', other: 'Outro',
}

type HistoryFilter = 'all' | 'activities' | 'calls' | 'events'

interface Props {
  readOnly?: boolean
  lead: Lead | null
  duplicateMatches: DuplicateMatch[]
  onClose(): void
  onEdit(lead: Lead): void
  onActivity(lead: Lead, type?: ActivityType): void
  onEvent(lead: Lead): void
  onCall(lead: Lead): void
  onOpenDuplicate(lead: Lead): void
}

export function LeadDetailsDrawer({ readOnly = false, lead, duplicateMatches, onClose, onEdit, onActivity, onEvent, onCall, onOpenDuplicate }: Props) {
  const { snapshot, moveLead, updateLead, setRoute, notify } = useApp()
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all')
  const [busy, setBusy] = useState(false)

  const timeline = useMemo(() => {
    if (!lead || !snapshot) return []
    const activityEntries = snapshot.activities.filter((item) => item.leadId === lead.id).map((item) => ({
      id: `activity-${item.id}`, kind: 'activities' as const, date: item.completedAt ?? item.dueAt ?? item.createdAt,
      title: activityLabel[item.type], description: item.title, detail: item.description || (item.completedAt ? 'Concluída' : 'Pendente'),
      tone: item.completedAt ? 'success' : item.dueAt && new Date(item.dueAt).getTime() < Date.now() ? 'danger' : 'info',
    }))
    const callEntries = snapshot.calls.filter((item) => item.leadId === lead.id).map((item) => ({
      id: `call-${item.id}`, kind: 'calls' as const, date: item.endedAt ?? item.startedAt,
      title: `Ligação — ${callOutcomeLabel[item.outcome] ?? item.outcome}`, description: item.notes || 'Ligação registrada sem anotações.',
      detail: item.durationSeconds ? `${Math.floor(item.durationSeconds / 60)}m ${String(item.durationSeconds % 60).padStart(2, '0')}s` : 'Sem duração',
      tone: ['not_interested', 'invalid_number'].includes(item.outcome) ? 'danger' : ['no_answer', 'busy', 'voicemail', 'wrong_person'].includes(item.outcome) ? 'warning' : 'success',
    }))
    const eventEntries = snapshot.events.filter((item) => item.leadId === lead.id).map((item) => ({
      id: `event-${item.id}`, kind: 'events' as const, date: item.startsAt, title: item.title,
      description: item.description || item.location || 'Compromisso da agenda', detail: item.status === 'completed' ? 'Concluído' : item.status === 'cancelled' ? 'Cancelado' : 'Agenda',
      tone: item.status === 'completed' ? 'success' : item.status === 'cancelled' ? 'danger' : 'info',
    }))
    return [...activityEntries, ...callEntries, ...eventEntries]
      .filter((entry) => historyFilter === 'all' || entry.kind === historyFilter)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [historyFilter, lead, snapshot])

  if (!lead) return null
  const stage = snapshot?.stages.find((item) => item.id === lead.stageId)
  const issues = leadDataIssues(lead)
  const priority = leadPriorityInsight(lead)
  const duplicates = duplicateMatches.filter((item) => item.leadId === lead.id).map((item) => ({ ...item, lead: snapshot?.leads.find((candidate) => candidate.id === item.matchId) })).filter((item) => item.lead)
  const phoneDigits = lead.phone.replace(/\D/g, '')
  const whatsappPhone = phoneDigits.startsWith('55') ? phoneDigits : `55${phoneDigits}`

  const changeStage = async (stageId: string) => {
    if (!stageId || stageId === lead.stageId) return
    setBusy(true)
    try { await moveLead(lead.id, stageId) }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível mover o lead.') }
    finally { setBusy(false) }
  }

  const archive = async () => {
    if (!window.confirm(`Arquivar ${lead.name}? O histórico será preservado.`)) return
    setBusy(true)
    try { await updateLead(lead.id, { status: 'archived' }); onClose() }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível arquivar.') }
    finally { setBusy(false) }
  }

  return <div className="lead-drawer-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <aside className="lead-drawer" role="dialog" aria-modal="true" aria-label={`Detalhes de ${lead.name}`}>
      <header className="lead-drawer__header">
        <div className="lead-drawer__identity">
          <span className="lead-avatar">{initials(lead.name)}</span>
          <div><span className="eyebrow">Ficha comercial</span><h2>{lead.name}</h2><p>{lead.company || 'Empresa não informada'} · {lead.city || 'Cidade não informada'}</p></div>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar ficha"><X size={19} /></button>
      </header>

      {!readOnly ? <div className="lead-drawer__quick-actions">
        <Button size="sm" disabled={!lead.phone} onClick={() => onCall(lead)}><PhoneCall size={16} /> Ligar</Button>
        <Button size="sm" variant="secondary" disabled={!lead.phone} onClick={() => window.open(`https://wa.me/${whatsappPhone}?text=${encodeURIComponent(`Olá, ${lead.name}! Tudo bem?`)}`, '_blank', 'noopener,noreferrer')}><MessageCircle size={16} /> WhatsApp</Button>
        <Button size="sm" variant="secondary" onClick={() => onActivity(lead, 'followup')}><RefreshCw size={16} /> Follow-up</Button>
        <Button size="sm" variant="secondary" onClick={() => onEvent(lead)}><CalendarPlus size={16} /> Reunião</Button>
        <Button size="sm" variant="ghost" onClick={() => onEdit(lead)}><Edit3 size={16} /> Editar</Button>
      </div> : null}

      <div className="lead-drawer__body">
        <section className={`lead-priority-card lead-priority-card--${priority.level}`}>
          <div><span>Prioridade comercial</span><strong>{priority.label}</strong><p>{priority.reasons.length ? priority.reasons.join(' · ') : 'Sem sinais de urgência no momento.'}</p></div>
          <span className="lead-priority-card__score">{priority.score}<small>/100</small></span>
        </section>

        <section className="lead-drawer__section">
          <div className="lead-drawer__section-title"><div><span className="eyebrow">Resumo</span><h3>Informações comerciais</h3></div><StatusPill tone={lead.status === 'won' ? 'success' : lead.status === 'lost' ? 'danger' : lead.status === 'archived' ? 'neutral' : 'info'}>{lead.status === 'active' ? 'Ativo' : lead.status === 'won' ? 'Ganho' : lead.status === 'lost' ? 'Perdido' : 'Arquivado'}</StatusPill></div>
          <div className="lead-detail-grid">
            <div><UserRound size={16} /><span>Responsável</span><strong>{lead.ownerName || 'Não atribuído'}</strong></div>
            <div><Building2 size={16} /><span>Empresa</span><strong>{lead.company || 'Não informada'}</strong></div>
            <div><MapPin size={16} /><span>Cidade</span><strong>{lead.city || 'Não informada'}</strong></div>
            <div><CalendarClock size={16} /><span>Próxima ação</span><strong>{formatDateTime(lead.nextActionAt)}</strong></div>
            <div><FileText size={16} /><span>Valor</span><strong>{formatCurrency(lead.value)}</strong></div>
            <div><Tag size={16} /><span>Origem</span><strong>{lead.source || 'Não informada'}</strong></div>
          </div>
          <label className="field lead-stage-field"><span>Etapa do Pipeline</span><select value={lead.stageId} disabled={busy || readOnly} onChange={(event) => void changeStage(event.target.value)}>{snapshot?.stages.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.probability}%</option>)}</select><small>{stage ? `Etapa atual: ${stage.name}` : 'Etapa não encontrada'}</small></label>
          <div className="lead-contact-list">
            <a href={lead.phone ? `tel:${phoneDigits}` : undefined} className={!lead.phone ? 'is-disabled' : ''}><PhoneCall size={16} /><span><small>Telefone</small><strong>{lead.phone || 'Não informado'}</strong></span><ExternalLink size={14} /></a>
            <a href={lead.email ? `mailto:${lead.email}` : undefined} className={!lead.email ? 'is-disabled' : ''}><Mail size={16} /><span><small>E-mail</small><strong>{lead.email || 'Não informado'}</strong></span><ExternalLink size={14} /></a>
          </div>
          {lead.tags.length ? <div className="lead-tag-list">{lead.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
          {lead.notes ? <div className="lead-notes"><strong>Observações</strong><p>{lead.notes}</p></div> : null}
        </section>

        {issues.length || duplicates.length ? <section className="lead-drawer__section">
          <div className="lead-drawer__section-title"><div><span className="eyebrow">Qualidade</span><h3>Dados que precisam de atenção</h3></div><AlertTriangle size={20} /></div>
          {issues.length ? <div className="lead-issue-list">{issues.map((issue) => <span key={issue.key}><AlertTriangle size={14} /> {issue.label}</span>)}</div> : <div className="lead-quality-ok"><CheckCircle2 size={16} /> Cadastro com os principais dados preenchidos.</div>}
          {duplicates.length ? <div className="duplicate-list"><strong>Possíveis duplicados</strong>{duplicates.map((duplicate) => <button key={duplicate.matchId} type="button" onClick={() => onOpenDuplicate(duplicate.lead!)}><span><b>{duplicate.lead!.name}</b><small>{duplicate.reasons.join(' e ')}</small></span><ChevronRight size={16} /></button>)}</div> : null}
        </section> : null}

        <section className="lead-drawer__section">
          <div className="lead-drawer__section-title"><div><span className="eyebrow">Histórico</span><h3>Linha do tempo</h3></div><History size={20} /></div>
          <div className="lead-history-filters">
            {([['all', 'Tudo'], ['activities', 'Atividades'], ['calls', 'Ligações'], ['events', 'Agenda']] as const).map(([value, label]) => <button key={value} type="button" className={historyFilter === value ? 'is-active' : ''} onClick={() => setHistoryFilter(value)}>{label}</button>)}
          </div>
          {timeline.length ? <div className="lead-timeline">{timeline.slice(0, 30).map((entry) => <article key={entry.id}>
            <span className={`lead-timeline__dot lead-timeline__dot--${entry.tone}`} />
            <div><span>{formatDateTime(entry.date)}</span><strong>{entry.title}</strong><p>{entry.description}</p><small>{entry.detail}</small></div>
          </article>)}</div> : <div className="lead-history-empty"><Clock3 size={20} /><strong>Nenhuma interação encontrada</strong><span>Crie um follow-up, ligação, nota ou reunião para iniciar o histórico.</span></div>}
        </section>
      </div>

      <footer className="lead-drawer__footer">
        <Button variant="ghost" onClick={() => { setRoute('pipeline'); onClose() }}><ExternalLink size={16} /> Ver no Pipeline</Button>
        {!readOnly ? <Button variant="danger" disabled={busy || lead.status === 'archived'} onClick={() => void archive()}><Archive size={16} /> Arquivar</Button> : null}
      </footer>
    </aside>
  </div>
}
