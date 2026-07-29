import { AlertTriangle, Bell, CalendarClock, CheckCircle2, Clock3, FileText, Workflow, X } from 'lucide-react'
import { useEffect, useMemo, type ComponentType } from 'react'
import { useApp } from '../../app/app-context'
import { formatDateTime } from '../../domain/formatters'
import type { AppRoute } from '../../domain/types'
import { useExperience } from './experience-context'

interface NotificationItem {
  id: string
  title: string
  detail: string
  date: string | null
  tone: 'danger' | 'warning' | 'info'
  icon: ComponentType<{ size?: number }>
  route: AppRoute
}

export function NotificationCenter({ open, onClose }: { open: boolean; onClose(): void }) {
  const { snapshot, setRoute } = useApp()
  const { preferences } = useExperience()
  const items = useMemo(() => {
    if (!snapshot) return []
    const now = Date.now()
    const nextDay = now + 24 * 60 * 60 * 1000
    const nextThreeDays = now + 3 * 24 * 60 * 60 * 1000
    const notifications: NotificationItem[] = []
    if (preferences.notifications.overdueActivities) {
      snapshot.activities.filter((activity) => !activity.completedAt && activity.dueAt && new Date(activity.dueAt).getTime() <= now).slice(0, 12).forEach((activity) => notifications.push({ id: `activity:${activity.id}`, title: activity.title, detail: 'Follow-up vencido e aguardando ação.', date: activity.dueAt, tone: 'danger', icon: Clock3, route: 'followups' }))
    }
    if (preferences.notifications.upcomingEvents) {
      snapshot.events.filter((event) => event.status !== 'cancelled' && new Date(event.startsAt).getTime() >= now && new Date(event.startsAt).getTime() <= nextDay).slice(0, 8).forEach((event) => notifications.push({ id: `event:${event.id}`, title: event.title, detail: 'Compromisso nas próximas 24 horas.', date: event.startsAt, tone: 'info', icon: CalendarClock, route: 'agenda' }))
    }
    if (preferences.notifications.proposalFollowups) {
      snapshot.proposals.filter((proposal) => (proposal.status === 'sent' || proposal.status === 'viewed') && proposal.expectedCloseAt && new Date(proposal.expectedCloseAt).getTime() <= nextThreeDays).slice(0, 8).forEach((proposal) => notifications.push({ id: `proposal:${proposal.id}`, title: proposal.title, detail: `Proposta ${proposal.status === 'viewed' ? 'visualizada' : 'enviada'} próxima da data esperada.`, date: proposal.expectedCloseAt, tone: 'warning', icon: FileText, route: 'proposals' }))
    }
    if (preferences.notifications.automationFailures) {
      snapshot.automationRuns.filter((run) => run.status === 'failed').slice(0, 8).forEach((run) => notifications.push({ id: `automation:${run.id}`, title: 'Falha em automação', detail: run.errorMessage || 'Uma execução precisa ser revisada.', date: run.finishedAt ?? run.startedAt, tone: 'warning', icon: Workflow, route: 'automations' }))
    }
    return notifications.sort((a, b) => new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime()).slice(0, 30)
  }, [preferences.notifications, snapshot])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, open])

  if (!open) return null
  return <div className="notification-center-layer">
    <button className="notification-center-backdrop" type="button" aria-label="Fechar notificações" onClick={onClose} />
    <aside className="notification-center" role="dialog" aria-modal="true" aria-label="Central de notificações">
      <header><div><span><Bell size={16} /> Central de notificações</span><h2>O que exige atenção</h2><p>{items.length ? `${items.length} aviso(s) priorizado(s)` : 'Sua operação está em dia.'}</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><X size={19} /></button></header>
      <div className="notification-center__content">{items.length ? items.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} className={`notification-item is-${item.tone}`} onClick={() => { setRoute(item.route); onClose() }}><span><Icon size={18} /></span><div><strong>{item.title}</strong><small>{item.detail}</small><time>{formatDateTime(item.date)}</time></div></button> }) : <div className="notification-empty"><CheckCircle2 size={34} /><strong>Nenhuma pendência crítica</strong><p>Novos atrasos, reuniões, propostas e falhas aparecerão aqui.</p></div>}</div>
      <footer><AlertTriangle size={15} /><span>Os avisos utilizam dados reais do workspace e respeitam suas preferências.</span></footer>
    </aside>
  </div>
}
