import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, CheckCircle2, PhoneCall, Sparkles, Target, UserRoundCheck } from 'lucide-react'
import { Modal } from '../../components/ui/modal'
import { Button } from '../../components/ui/button'
import { formatCurrency } from '../../domain/formatters'
import type { WorkspaceSnapshot } from '../../domain/types'
import { buildRoutineActivities, type RoutineActivityInput, type RoutinePlan } from '../../services/goals-workspace'

interface RoutineModalProps {
  open: boolean
  snapshot: WorkspaceSnapshot
  plan: RoutinePlan
  loading?: boolean
  onClose(): void
  onGenerate(inputs: RoutineActivityInput[]): Promise<void>
}

const percent = (value: number) => `${Math.round(value * 100)}%`

export function RoutineModal({ open, snapshot, plan, loading = false, onClose, onGenerate }: RoutineModalProps) {
  const activeLeads = snapshot.leads.filter((lead) => lead.status === 'active').length
  const [calls, setCalls] = useState(Math.min(Math.max(plan.calls, 0), activeLeads))
  const [followups, setFollowups] = useState(Math.min(Math.max(plan.followups, 0), Math.max(0, activeLeads - calls)))

  useEffect(() => {
    if (!open) return
    const suggestedCalls = Math.min(Math.max(plan.calls, 0), activeLeads)
    setCalls(suggestedCalls)
    setFollowups(Math.min(Math.max(plan.followups, 0), Math.max(0, activeLeads - suggestedCalls)))
  }, [activeLeads, open, plan.calls, plan.followups])

  const tasks = useMemo(() => buildRoutineActivities(snapshot, plan, calls, followups), [calls, followups, plan, snapshot])
  const callCount = tasks.filter((task) => task.type === 'call').length
  const followupCount = tasks.filter((task) => task.type === 'followup').length

  return (
    <Modal open={open} size="xl" title="Gerar rotina comercial do dia" subtitle="Transforme as metas em uma fila objetiva de atividades, priorizando leads quentes e atrasados." onClose={onClose}
      footer={<><span className="routine-modal__availability">{tasks.length < calls + followups ? `Há ${tasks.length} lead(s) disponível(is) sem rotina duplicada hoje.` : `${tasks.length} atividade(s) prontas para criação.`}</span><span className="modal__footer-spacer" /><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={loading} disabled={!tasks.length} onClick={() => void onGenerate(tasks)}><Sparkles size={16} /> Criar rotina</Button></>}>
      <div className="routine-modal-layout">
        <section className="routine-modal-summary">
          <div className="routine-modal-heading"><span className="goal-modal-section__icon"><Target size={19} /></span><div><strong>Necessidade diária estimada</strong><small>Calculada usando as metas ativas e as conversões dos últimos 90 dias.</small></div></div>
          <div className="routine-target-grid">
            <article><small>Ligações</small><strong>{plan.calls}</strong><span>para buscar {plan.contacts} contatos</span></article>
            <article><small>Reuniões</small><strong>{plan.meetings}</strong><span>{plan.proposals} proposta(s) esperadas</span></article>
            <article><small>Fechamentos</small><strong>{plan.wins}</strong><span>{formatCurrency(plan.revenue)} por dia</span></article>
            <article><small>Dias úteis</small><strong>{plan.workdaysRemaining}</strong><span>até {new Date(`${plan.periodEnd}T12:00:00`).toLocaleDateString('pt-BR')}</span></article>
          </div>
          <div className="routine-rate-strip"><span>Atendimento <strong>{percent(plan.rates.contactRate)}</strong></span><span>Contato → reunião <strong>{percent(plan.rates.meetingRate)}</strong></span><span>Reunião → proposta <strong>{percent(plan.rates.proposalRate)}</strong></span><span>Proposta → venda <strong>{percent(plan.rates.winRate)}</strong></span></div>
        </section>

        <section className="routine-modal-builder">
          <div className="routine-modal-controls">
            <label className="form-field"><span>Ligações para criar</span><input type="number" min="0" max="100" value={calls} onChange={(event) => setCalls(Math.max(0, Number(event.target.value) || 0))} /></label>
            <label className="form-field"><span>Follow-ups para criar</span><input type="number" min="0" max="100" value={followups} onChange={(event) => setFollowups(Math.max(0, Number(event.target.value) || 0))} /></label>
            <div className="routine-modal-count"><PhoneCall size={17} /><strong>{callCount}</strong><span>ligações</span></div>
            <div className="routine-modal-count"><UserRoundCheck size={17} /><strong>{followupCount}</strong><span>follow-ups</span></div>
          </div>

          <div className="routine-preview">
            <header><div><CalendarClock size={17} /><strong>Prévia da fila</strong></div><span>Horários distribuídos em blocos de 20 minutos</span></header>
            <div className="routine-preview-list">
              {tasks.length ? tasks.slice(0, 12).map((task) => {
                const lead = snapshot.leads.find((item) => item.id === task.leadId)
                return <article key={`${task.leadId}-${task.type}`}><span className={`routine-preview-list__type routine-preview-list__type--${task.type}`}>{task.type === 'call' ? <PhoneCall size={15} /> : <CheckCircle2 size={15} />}</span><div><strong>{lead?.name ?? 'Lead'}</strong><small>{lead?.company || 'Sem empresa'} · {lead?.temperature === 'hot' ? 'Quente' : lead?.temperature === 'warm' ? 'Morno' : 'Frio'} · {lead?.priority}</small></div><time>{task.dueAt ? new Date(task.dueAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Hoje'}</time></article>
              }) : <div className="routine-preview-empty"><CheckCircle2 size={25} /><strong>Nenhum lead elegível</strong><span>Os leads ativos já possuem rotina criada hoje ou não há contatos disponíveis.</span></div>}
              {tasks.length > 12 ? <div className="routine-preview-more">+ {tasks.length - 12} atividade(s) na fila</div> : null}
            </div>
          </div>
        </section>
      </div>
    </Modal>
  )
}
