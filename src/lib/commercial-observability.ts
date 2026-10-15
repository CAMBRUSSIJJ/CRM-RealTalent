import { safeStorage } from './storage'
import { recordDiagnostic } from './diagnostics'

export type CommercialSurface = 'boot' | 'dashboard' | 'leads' | 'pipeline' | 'prospecting' | 'communications' | 'proposals' | 'other'

export interface PerformanceSample {
  kind: 'navigation' | 'route' | 'long-task' | 'resource' | 'web-vital'
  name: string
  surface: CommercialSurface
  durationMs: number
  transferBytes?: number
  at: string
}

export interface ObservabilitySnapshot {
  generatedAt: string
  samples: PerformanceSample[]
  summary: {
    routeP95Ms: number
    routeAverageMs: number
    longTasks: number
    slowResources: number
    transferredBytes: number
  }
}

const STORAGE_KEY = 'realtalent-crm-commercial-observability-v101113-cr5'
const MAX_SAMPLES = 240
const routeStarts = new Map<string, number>()
const monitoredRoutes = new Set(['dashboard', 'leads', 'pipeline', 'prospecting', 'communications', 'proposals'])
let installed = false

const nowIso = () => new Date().toISOString()
const cleanName = (value: string) => value.replace(/[?#].*$/, '').split('/').filter(Boolean).slice(-2).join('/').slice(0, 120) || 'document'
const surfaceOf = (route: string): CommercialSurface => monitoredRoutes.has(route) ? route as CommercialSurface : 'other'
const read = (): PerformanceSample[] => {
  try {
    const parsed = JSON.parse(safeStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.slice(0, MAX_SAMPLES) : []
  } catch { return [] }
}
const write = (sample: PerformanceSample) => safeStorage.setItem(STORAGE_KEY, JSON.stringify([sample, ...read()].slice(0, MAX_SAMPLES)))
const percentile = (values: number[], p: number) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))]
}

export const recordPerformanceSample = (sample: Omit<PerformanceSample, 'at'>) => {
  const normalized: PerformanceSample = { ...sample, durationMs: Math.max(0, Math.round(sample.durationMs)), at: nowIso() }
  write(normalized)
  return normalized
}

export const markCommercialRouteStart = (route: string) => {
  routeStarts.set(route, performance.now())
}

export const markCommercialRouteReady = (route: string, workspaceId: string | null = null) => {
  const startedAt = routeStarts.get(route)
  if (startedAt == null) return null
  routeStarts.delete(route)
  const durationMs = performance.now() - startedAt
  const sample = recordPerformanceSample({ kind: 'route', name: route, surface: surfaceOf(route), durationMs })
  if (durationMs >= 2500) {
    recordDiagnostic({ severity: durationMs >= 5000 ? 'warning' : 'info', source: 'performance', message: `Abertura lenta do módulo ${route}: ${Math.round(durationMs)}ms`, route, workspaceId })
  }
  return sample
}

export const getCommercialObservabilitySnapshot = (): ObservabilitySnapshot => {
  const samples = read()
  const routes = samples.filter((sample) => sample.kind === 'route').map((sample) => sample.durationMs)
  return {
    generatedAt: nowIso(),
    samples,
    summary: {
      routeP95Ms: Math.round(percentile(routes, 0.95)),
      routeAverageMs: routes.length ? Math.round(routes.reduce((sum, value) => sum + value, 0) / routes.length) : 0,
      longTasks: samples.filter((sample) => sample.kind === 'long-task').length,
      slowResources: samples.filter((sample) => sample.kind === 'resource' && sample.durationMs >= 1200).length,
      transferredBytes: samples.filter((sample) => sample.kind === 'resource').reduce((sum, sample) => sum + (sample.transferBytes ?? 0), 0),
    },
  }
}

export const clearCommercialObservability = () => safeStorage.removeItem(STORAGE_KEY)

export const installCommercialObservability = () => {
  if (installed || typeof window === 'undefined' || typeof performance === 'undefined') return
  installed = true

  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  if (navigation) recordPerformanceSample({ kind: 'navigation', name: 'app-boot', surface: 'boot', durationMs: navigation.duration, transferBytes: navigation.transferSize })

  if (typeof PerformanceObserver !== 'undefined') {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'longtask' && entry.duration >= 50) {
            recordPerformanceSample({ kind: 'long-task', name: 'main-thread', surface: 'other', durationMs: entry.duration })
          }
          if (entry.entryType === 'resource') {
            const resource = entry as PerformanceResourceTiming
            if (resource.duration >= 800 || resource.transferSize >= 250_000) {
              recordPerformanceSample({ kind: 'resource', name: cleanName(resource.name), surface: 'other', durationMs: resource.duration, transferBytes: resource.transferSize })
            }
          }
        }
      })
      observer.observe({ entryTypes: ['resource', 'longtask'] })
    } catch {
      // Alguns navegadores não expõem longtask. Observabilidade segue com navigation/routes.
    }
  }

  const paintEntries = performance.getEntriesByType('paint')
  for (const entry of paintEntries) recordPerformanceSample({ kind: 'web-vital', name: entry.name, surface: 'boot', durationMs: entry.startTime })

  ;(window as Window & { __REALTALENT_OBSERVABILITY__?: unknown }).__REALTALENT_OBSERVABILITY__ = {
    snapshot: getCommercialObservabilitySnapshot,
    clear: clearCommercialObservability,
  }
}
