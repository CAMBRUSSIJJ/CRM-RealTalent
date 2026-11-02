import { AlertTriangle, Bell, Bot, CalendarClock, CheckCircle2, Clock3, FileText, Flag, Settings2, Target, UserRoundSearch, Workflow, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { useAppNavigation, useAppWorkspace } from '../../app/app-context'
import { formatDateTime } from '../../domain/formatters'
import { buildNotificationAlerts, type NotificationCategory } from '../../services/notification-engine'
import { usePreferences } from '../settings/preferences-context'
import { useExperience } from './experience-context'
import { useOverlayDialog } from '../../app/use-overlay-dialog'
import { getSupabaseClient } from '../../lib/supabase'
import { useAuth } from '../auth/auth-context'
import { NOTIFICATION_STATE_EVENT } from '../../services/notification-state'

const notificationIcons: Record<NotificationCategory, ComponentType<{ size?: number }>> = {
  overdue_activity: Clock3,
  upcoming_activity: Flag,
  upcoming_event: CalendarClock,
  proposal_silence: FileText,
  stale_lead: UserRoundSearch,
  goal_at_risk: Target,
  automation_failure: Workflow,
}

export function NotificationCenter({ open, onClose }: { open: boolean; onClose(): void }) {
  const { snapshot } = useAppWorkspace()
  const { user } = useAuth()
  const [assignedTaskAlerts, setAssignedTaskAlerts] = useState<Array<{ id: string; title: string; body: string; severity: string; created_at: string }>>([])
  const { navigate } = useAppNavigation()
  const { preferences } = useExperience()
  const { preferences: crmPreferences } = usePreferences()
  const [notificationRevision, setNotificationRevision] = useState(0)
  const items = useMemo(() => {
    if (!snapshot || !preferences.notifications.inAppEnabled) return []
    const regular = buildNotificationAlerts(snapshot, preferences.notifications, { staleLeadDays: crmPreferences.commercial.staleLeadDays })
    const delegated = assignedTaskAlerts.map((row) => ({
      id: `task-assignee:${row.id}`, category: 'upcoming_activity' as const,
      title: row.title, detail: row.body, date: row.created_at,
      tone: row.severity === 'warning' ? 'warning' as const : 'info' as const,
      route: 'tasks' as const, context: undefined,
    }))
    return [...delegated, ...regular].slice(0, 40)
  }, [assignedTaskAlerts, crmPreferences.commercial.staleLeadDays, notificationRevision, preferences.notifications, snapshot])

  useEffect(() => {
    const onNotificationState = () => setNotificationRevision((value) => value + 1)
    window.addEventListener(NOTIFICATION_STATE_EVENT, onNotificationState)
    return () => window.removeEventListener(NOTIFICATION_STATE_EVENT, onNotificationState)
  }, [])

  useEffect(() => {
    if (!open || !snapshot?.workspace.id || !user?.id || !preferences.notifications.inAppEnabled) {
      setAssignedTaskAlerts([])
      return
    }
    const client = getSupabaseClient()
    if (!client) return
    let active = true
    const refreshTasks = async () => {
      const { data, error } = await client.from('seller_notifications')
        .select('id,title,body,severity,created_at')
        .eq('organization_id', snapshot.workspace.id)
        .eq('user_id', user.id)
        .eq('source_type', 'task-reminder')
        .eq('status', 'unread')
        .order('created_at', { ascending: false })
        .limit(30)
      if (active && !error) setAssignedTaskAlerts(data ?? [])
    }
    void refreshTasks()
    const interval = window.setInterval(() => void refreshTasks(), 45_000)
    return () => { active = false; window.clearInterval(interval) }
  }, [open, snapshot?.workspace.id, user?.id, preferences.notifications.inAppEnabled])

  const openAlert = (item: (typeof items)[number]) => {
    if (item.id.startsWith('task-assignee:') && snapshot?.workspace.id && user?.id) {
      const rawId = item.id.slice('task-assignee:'.length)
      const client = getSupabaseClient()
      if (client) void client.from('seller_notifications').update({ status: 'read', read_at: new Date().toISOString() })
        .eq('organization_id', snapshot.workspace.id).eq('user_id', user.id).eq('id', rawId)
      setAssignedTaskAlerts((current) => current.filter((alert) => alert.id !== rawId))
    }
    navigate(item.route, item.context)
    onClose()
  }

  const critical = items.filter((item) => item.tone === 'danger').length
  const warning = items.filter((item) => item.tone === 'warning').length
  useOverlayDialog(open, 'notification-center', onClose)

  if (!open) return null
  return <div className="notification-center-layer">
    <button className="notification-center-backdrop" type="button" aria-label="Fechar notificações" onClick={onClose} />
    <aside className="notification-center" data-overlay-id="notification-center" role="dialog" aria-modal="true" aria-label="Central de notificações">
      <header><div><span><Bell size={16} /> Central de notificações</span><h2>O que exige atenção</h2><p>{items.length ? `${items.length} aviso(s) · ${critical} crítico(s) · ${warning} atenção` : preferences.notifications.inAppEnabled ? 'Sua operação está em dia.' : 'Avisos internos estão desativados.'}</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><X size={19} /></button></header>
      <div className="notification-center__content">{items.length ? items.map((item) => { const Icon = notificationIcons[item.category] ?? Bot; return <button type="button" key={item.id} className={`notification-item is-${item.tone}`} onClick={() => openAlert(item)}><span><Icon size={18} /></span><div><strong>{item.title}</strong><small>{item.detail}</small><time>{formatDateTime(item.date)}</time></div></button> }) : <div className="notification-empty"><CheckCircle2 size={34} /><strong>{preferences.notifications.inAppEnabled ? 'Nenhuma pendência crítica' : 'Central interna desativada'}</strong><p>{preferences.notifications.inAppEnabled ? 'Novos atrasos, reuniões, propostas, contatos parados, metas e falhas aparecerão aqui.' : 'Ative o canal “No CRM” em Configurações → Notificações para voltar a ver os avisos na campainha.'}</p></div>}</div>
      <footer><div><AlertTriangle size={15} /><span>Os avisos usam dados reais do workspace e as regras definidas nas Configurações.</span></div><button type="button" onClick={() => { navigate('settings', { filter: 'notifications' }); onClose() }}><Settings2 size={14} /> Configurar</button></footer>
    </aside>
  </div>
}
