import type { AppRoute } from '../domain/types'

export const APP_ROUTES: readonly AppRoute[] = [
  'dashboard',
  'leads',
  'commercial-map',
  'pipeline',
  'tasks',
  'teams',
  'followups',
  'calls',
  'communications',
  'proposals',
  'agenda',
  'playbooks',
  'goals',
  'automations',
  'metrics',
  'prospecting',
  'settings',
]

const APP_ROUTE_SET = new Set<AppRoute>(APP_ROUTES)

export interface RouteContext { leadId?: string; proposalId?: string; eventId?: string; activityId?: string; action?: string; filter?: string; capture?: string }

export const routeToHash = (route: AppRoute, context: RouteContext = {}): string => {
  const params = new URLSearchParams()
  Object.entries(context).forEach(([key, value]) => { if (value) params.set(key, value) })
  const query = params.toString()
  const publicRoute = route === 'leads' ? 'contacts' : route
  return `#/${publicRoute}${query ? `?${query}` : ''}`
}

export const routeContextFromHash = (hash: string): RouteContext => {
  const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : ''
  const params = new URLSearchParams(query)
  return { leadId: params.get('leadId') ?? undefined, proposalId: params.get('proposalId') ?? undefined, eventId: params.get('eventId') ?? undefined, activityId: params.get('activityId') ?? undefined, action: params.get('action') ?? undefined, filter: params.get('filter') ?? undefined, capture: params.get('capture') ?? undefined }
}

export const routeFromHash = (hash: string): AppRoute => {
  const normalized = hash.trim().replace(/^#\/?/, '').split(/[?&]/, 1)[0]
  if (normalized === 'contacts') return 'leads'
  return APP_ROUTE_SET.has(normalized as AppRoute) ? normalized as AppRoute : 'dashboard'
}
