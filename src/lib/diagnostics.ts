import { safeStorage } from './storage'

export interface DiagnosticEvent {
  id: string
  severity: 'error' | 'warning' | 'info'
  source: string
  message: string
  reference: string
  route: string
  workspaceId: string | null
  createdAt: string
}

const KEY = 'realtalent-crm-v10021-diagnostics'
const MAX_EVENTS = 100
const clean = (value: unknown, maximum = 500) => String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, maximum)

export const listDiagnostics = (): DiagnosticEvent[] => {
  try {
    const value = JSON.parse(safeStorage.getItem(KEY) ?? '[]')
    return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object').slice(0, MAX_EVENTS) as DiagnosticEvent[] : []
  } catch { return [] }
}

export const recordDiagnostic = (event: Omit<DiagnosticEvent, 'id' | 'reference' | 'createdAt'> & { reference?: string }) => {
  const createdAt = new Date().toISOString()
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  const reference = event.reference ?? `RT-${id.toUpperCase()}`
  const next: DiagnosticEvent = { ...event, id, reference, createdAt, source: clean(event.source, 80), message: clean(event.message), route: clean(event.route, 80) }
  safeStorage.setItem(KEY, JSON.stringify([next, ...listDiagnostics()].slice(0, MAX_EVENTS)))
  return next
}

export const clearDiagnostics = () => safeStorage.removeItem(KEY)
