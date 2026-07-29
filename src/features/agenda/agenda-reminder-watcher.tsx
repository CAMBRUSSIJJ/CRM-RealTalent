import { useEffect, useState } from 'react'
import { useApp } from '../../app/app-context'
import { safeStorage } from '../../lib/storage'
import { agendaReminderMinutes } from '../../services/agenda-workspace'

const time = (value: string) => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))

export function AgendaReminderWatcher() {
  const { snapshot } = useApp()
  const [tick, setTick] = useState(Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !snapshot?.workspace.id) return
    const storageKey = `realtalent-agenda-notified:${snapshot.workspace.id}`
    const notified = new Set<string>(JSON.parse(safeStorage.getItem(storageKey) ?? '[]') as string[])
    snapshot.events.forEach((event) => {
      if (event.status === 'cancelled' || event.status === 'completed') return
      const reminder = agendaReminderMinutes(event); if (!reminder) return
      const startsAt = new Date(event.startsAt).getTime()
      const key = `${event.id}:${event.startsAt}:${reminder}`
      if (startsAt - reminder * 60_000 <= tick && startsAt > tick && !notified.has(key)) {
        const lead = snapshot.leads.find((item) => item.id === event.leadId)
        new Notification(event.title, { body: `${time(event.startsAt)}${lead ? ` · ${lead.name}` : ''}${event.location ? ` · ${event.location}` : ''}` })
        notified.add(key)
      }
    })
    safeStorage.setItem(storageKey, JSON.stringify([...notified].slice(-300)))
  }, [snapshot, tick])

  return null
}
