import { useEffect, useMemo, useState } from 'react'
import { useAppNavigation, useAppWorkspace } from '../../app/app-context'
import { safeStorage } from '../../lib/storage'
import { agendaReminderMinutes } from '../../services/agenda-workspace'
import { buildNotificationAlerts, isNotificationQuietTime, notificationFrequencyBucket } from '../../services/notification-engine'
import { NOTIFICATION_STATE_EVENT } from '../../services/notification-state'
import { usePreferences } from '../settings/preferences-context'
import { useExperience } from './experience-context'

const MAX_SEEN = 500

export function BrowserNotificationWatcher() {
  const { snapshot } = useAppWorkspace()
  const { navigate } = useAppNavigation()
  const { preferences: crmPreferences } = usePreferences()
  const { preferences } = useExperience()
  const [tick, setTick] = useState(Date.now())
  const [notificationRevision, setNotificationRevision] = useState(0)

  useEffect(() => {
    const onNotificationState = () => setNotificationRevision((value) => value + 1)
    window.addEventListener(NOTIFICATION_STATE_EVENT, onNotificationState)
    return () => window.removeEventListener(NOTIFICATION_STATE_EVENT, onNotificationState)
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const alerts = useMemo(() => snapshot ? buildNotificationAlerts(snapshot, preferences.notifications, {
    now: new Date(tick),
    staleLeadDays: crmPreferences.commercial.staleLeadDays,
  }) : [], [crmPreferences.commercial.staleLeadDays, notificationRevision, preferences.notifications, snapshot, tick])

  useEffect(() => {
    if (!snapshot?.workspace.id || !preferences.notifications.browserEnabled) return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const now = new Date(tick)
    if (isNotificationQuietTime(preferences.notifications, now)) return

    const storageKey = `realtalent-browser-notifications:${snapshot.workspace.id}`
    const seen = new Set<string>(JSON.parse(safeStorage.getItem(storageKey) ?? '[]') as string[])
    const notify = (title: string, body: string, tag: string, route?: Parameters<typeof navigate>[0], context?: Parameters<typeof navigate>[1]) => {
      const item = new Notification(title, { body, tag })
      item.onclick = () => {
        window.focus()
        if (route) navigate(route, context)
        item.close()
      }
    }

    if (preferences.notifications.frequency === 'realtime') {
      const nowMs = now.getTime()
      const eligible = alerts.filter((alert) => {
        if (seen.has(alert.id)) return false
        if (alert.category !== 'upcoming_event') return true
        const eventId = alert.context?.eventId
        const event = snapshot.events.find((candidate) => candidate.id === eventId)
        if (!event) return false
        const startsAt = new Date(event.startsAt).getTime()
        const reminder = agendaReminderMinutes(event)
        return startsAt > nowMs && startsAt - reminder * 60_000 <= nowMs
      }).slice(0, 4)
      eligible.forEach((alert) => {
        notify(alert.title, alert.detail, alert.id, alert.route, alert.context)
        seen.add(alert.id)
      })
    } else {
      const bucket = notificationFrequencyBucket(preferences.notifications.frequency, now)
      const summaryKey = `summary:${preferences.notifications.frequency}:${bucket}`
      if (bucket && alerts.length && !seen.has(summaryKey)) {
        const critical = alerts.filter((alert) => alert.tone === 'danger').length
        notify('RealTalent CRM · Resumo de notificações', `${alerts.length} aviso(s) ativo(s)${critical ? ` · ${critical} crítico(s)` : ''}. Abra o CRM para revisar.`, summaryKey, 'dashboard')
        seen.add(summaryKey)
      }
    }

    safeStorage.setItem(storageKey, JSON.stringify([...seen].slice(-MAX_SEEN)))
  }, [alerts, navigate, preferences.notifications, snapshot, tick])

  return null
}
