import '../../styles/commercial-map-v10079.css'
import { useCallback, useEffect, useRef } from 'react'
import { useAppActions, useAppNavigation, useAppWorkspace } from '../../app/app-context'
import type { Lead } from '../../domain/types'
import type { UpdateLeadInput } from '../../repositories/crm-repository'
import { getSupabaseClient } from '../../lib/supabase'
import { APP_VERSION } from '../../lib/app-version'
import { buildLeadAddress, estimateLeadGeocode } from '../../services/geocoding'
import { buildAccountIntelligence } from '../../services/account-intelligence'

const RUNTIME_ID = 'realtalent-lead-map-v10056-runtime'

type GeocodeBatchResult = {
  queued?: number
  processed: number
  exact: number
  approximate: number
  incomplete: number
  notFound: number
  errors: string[]
}

type MapsDiagnostic = {
  ok: boolean
  mode: 'connected' | 'demo'
  provider: string
  secretConfigured: boolean
  coverage: { total: number; mapped: number; exact: number; pending: number; failed: number; percentage: number }
  queue: Record<string, number>
  checkedAt: string
}

type AccountMapSummary = { stakeholders: number; contacted: number; coverage: number; risk: 'low' | 'medium' | 'high'; decisionMakers: number; missingRoles: string[] }

type LeadMapBridge = {
  version: string
  mode: 'local' | 'supabase'
  workspaceId: string | null
  providerLabel: string
  canWrite: boolean
  getLeads(): Lead[]
  getAccountSummary(leadId: string): AccountMapSummary | null
  openAccount(leadId: string): void
  updateLead(leadId: string, input: UpdateLeadInput): Promise<Lead>
  geocodeLead(leadId: string): Promise<Lead | null>
  geocodeMany(leadIds: string[]): Promise<GeocodeBatchResult>
  diagnoseMaps(): Promise<MapsDiagnostic>
  refresh(): Promise<void>
}

declare global {
  interface Window {
    __REALTALENT_LEAD_MAP_BRIDGE__?: LeadMapBridge
    __REALTALENT_LEAD_MAP_RUNTIME__?: boolean
  }
}

export function CommercialMapPage() {
  const { snapshot, repositoryMode, currentWorkspace, can } = useAppWorkspace()
  const { navigate } = useAppNavigation()
  const { updateLead, refresh } = useAppActions()
  const snapshotRef = useRef(snapshot)
  useEffect(() => {
    snapshotRef.current = snapshot
    window.dispatchEvent(new CustomEvent('realtalent-map-data-updated'))
  }, [snapshot])

  const geocodeLocalItems = useCallback(async (items: Array<{ id: string; address: string }>) => {
    if (!items.length) return [] as Array<Record<string, unknown>>
    const response = await fetch('/api/maps/geocode', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items }),
    })
    const payload = await response.json().catch(() => ({})) as { outcomes?: Array<Record<string, unknown>>; message?: string }
    if (!response.ok) throw new Error(payload.message || 'Google Geocoding indisponível no gateway local.')
    return Array.isArray(payload.outcomes) ? payload.outcomes : []
  }, [])

  const applyGeocodeOutcome = useCallback(async (leadId: string, outcome: Record<string, unknown>) => {
    const latitude = Number(outcome.latitude)
    const longitude = Number(outcome.longitude)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
    return updateLead(leadId, {
      latitude, longitude,
      formattedAddress: typeof outcome.formattedAddress === 'string' ? outcome.formattedAddress : undefined,
      geocodeStatus: outcome.status === 'exact' ? 'exact' : 'approximate',
      geocodePrecision: ['rooftop', 'range_interpolated', 'street', 'district', 'city'].includes(String(outcome.precision)) ? outcome.precision as UpdateLeadInput['geocodePrecision'] : 'city',
      geocodeProvider: 'google',
      geocodePlaceId: typeof outcome.placeId === 'string' ? outcome.placeId : null,
      geocodedAt: new Date().toISOString(),
      geocodeError: null,
    })
  }, [updateLead])

  const geocodeLead = useCallback(async (leadId: string) => {
    const lead = snapshotRef.current?.leads.find((item) => item.id === leadId)
    if (!lead) throw new Error('Contato não encontrado para geocodificação.')
    if (repositoryMode === 'supabase') {
      const client = getSupabaseClient()
      if (!client) throw new Error('Supabase não configurado para geocodificação.')
      const { data, error } = await client.functions.invoke('geocode-lead', { body: { leadIds: [leadId], source: 'map' } })
      if (!error) {
        const failure = Array.isArray(data?.errors) ? data.errors[0] : null
        if (!failure) { await refresh(); return null }
      }
      // V100.54: o mapa nunca fica bloqueado por ausência de chave de geocodificação.
      // Persistimos uma estimativa transparente por cidade/bairro; o usuário pode corrigir manualmente depois.
      return updateLead(leadId, estimateLeadGeocode(lead))
    }
    const address = buildLeadAddress(lead)
    if (address) {
      try {
        const outcomes = await geocodeLocalItems([{ id: leadId, address }])
        const outcome = outcomes.find((item) => item.id === leadId && item.ok !== false)
        if (outcome) {
          const updated = await applyGeocodeOutcome(leadId, outcome)
          if (updated) return updated
        }
      } catch { /* fallback local transparente abaixo */ }
    }
    const input = estimateLeadGeocode(lead)
    if (!Object.keys(input).length) return lead
    return updateLead(leadId, input)
  }, [applyGeocodeOutcome, geocodeLocalItems, refresh, repositoryMode, updateLead])

  const geocodeMany = useCallback(async (leadIds: string[]): Promise<GeocodeBatchResult> => {
    const uniqueIds = [...new Set(leadIds)].slice(0, 100)
    if (!uniqueIds.length) return { queued: 0, processed: 0, exact: 0, approximate: 0, incomplete: 0, notFound: 0, errors: [] }
    if (repositoryMode === 'supabase') {
      const client = getSupabaseClient()
      if (!client) throw new Error('Supabase não configurado para geocodificação.')
      const { data, error } = await client.functions.invoke('geocode-lead', { body: { leadIds: uniqueIds, source: 'map' } })
      if (!error) {
        await refresh()
        return {
          queued: Number(data?.queued) || 0,
          processed: Number(data?.processed) || 0,
          exact: Number(data?.exact) || 0,
          approximate: Number(data?.approximate) || 0,
          incomplete: Number(data?.incomplete) || 0,
          notFound: Number(data?.notFound) || 0,
          errors: Array.isArray(data?.errors) ? data.errors.map((item: unknown) => typeof item === 'string' ? item : JSON.stringify(item)) : [],
        }
      }
      const result: GeocodeBatchResult = { queued: uniqueIds.length, processed: 0, exact: 0, approximate: 0, incomplete: 0, notFound: 0, errors: [] }
      for (const leadId of uniqueIds) {
        try {
          const lead = snapshotRef.current?.leads.find((item) => item.id === leadId)
          if (!lead) continue
          const updated = await updateLead(leadId, estimateLeadGeocode(lead))
          result.processed += 1
          if (updated.geocodeStatus === 'exact' || updated.geocodeStatus === 'manual') result.exact += 1
          else if (updated.geocodeStatus === 'approximate') result.approximate += 1
          else if (updated.geocodeStatus === 'incomplete') result.incomplete += 1
          else if (updated.geocodeStatus === 'not_found') result.notFound += 1
        } catch (fallbackError) { result.errors.push(fallbackError instanceof Error ? fallbackError.message : 'Falha ao estimar localização.') }
      }
      return result
    }
    const result: GeocodeBatchResult = { queued: uniqueIds.length, processed: 0, exact: 0, approximate: 0, incomplete: 0, notFound: 0, errors: [] }
    const candidates = uniqueIds.map((leadId) => {
      const lead = snapshotRef.current?.leads.find((item) => item.id === leadId)
      return lead ? { lead, address: buildLeadAddress(lead) } : null
    }).filter((item): item is { lead: Lead; address: string } => Boolean(item?.address))
    let providerOutcomes: Array<Record<string, unknown>> = []
    if (candidates.length) {
      try { providerOutcomes = await geocodeLocalItems(candidates.map(({ lead, address }) => ({ id: lead.id, address }))) }
      catch { providerOutcomes = [] }
    }
    for (const leadId of uniqueIds) {
      try {
        const lead = snapshotRef.current?.leads.find((item) => item.id === leadId)
        if (!lead) continue
        const outcome = providerOutcomes.find((item) => item.id === leadId && item.ok !== false)
        const updated = outcome ? await applyGeocodeOutcome(leadId, outcome) : await updateLead(leadId, estimateLeadGeocode(lead))
        if (!updated) continue
        result.processed += 1
        if (updated.geocodeStatus === 'exact' || updated.geocodeStatus === 'manual') result.exact += 1
        else if (updated.geocodeStatus === 'approximate') result.approximate += 1
        else if (updated.geocodeStatus === 'incomplete') result.incomplete += 1
        else if (updated.geocodeStatus === 'not_found') result.notFound += 1
      } catch (error) {
        result.errors.push(error instanceof Error ? error.message : 'Falha ao processar um lead.')
      }
    }
    return result
  }, [applyGeocodeOutcome, geocodeLocalItems, refresh, repositoryMode, updateLead])

  const diagnoseMaps = useCallback(async (): Promise<MapsDiagnostic> => {
    const leads = snapshotRef.current?.leads ?? []
    const mapped = leads.filter((lead) => Number.isFinite(Number(lead.latitude)) && Number.isFinite(Number(lead.longitude))).length
    const exact = leads.filter((lead) => lead.geocodeStatus === 'exact' || lead.geocodeStatus === 'manual').length
    const pending = leads.filter((lead) => ['pending', 'approximate', 'incomplete'].includes(String(lead.geocodeStatus || ''))).length
    const failed = leads.filter((lead) => lead.geocodeStatus === 'not_found').length
    if (repositoryMode !== 'supabase') {
      try {
        const response = await fetch('/api/maps/diagnostics', { cache: 'no-store' })
        const data = await response.json() as { configured?: boolean; provider?: string; checkedAt?: string }
        return { ok: true, mode: 'demo', provider: data.provider || 'OpenStreetMap + estimativa local', secretConfigured: Boolean(data.configured), coverage: { total: leads.length, mapped, exact, pending, failed, percentage: leads.length ? Math.round(mapped / leads.length * 100) : 0 }, queue: {}, checkedAt: data.checkedAt || new Date().toISOString() }
      } catch {
        return { ok: true, mode: 'demo', provider: 'OpenStreetMap + estimativa local', secretConfigured: false, coverage: { total: leads.length, mapped, exact, pending, failed, percentage: leads.length ? Math.round(mapped / leads.length * 100) : 0 }, queue: {}, checkedAt: new Date().toISOString() }
      }
    }
    const client = getSupabaseClient()
    if (!client || !currentWorkspace?.id) {
      return { ok: true, mode: 'connected', provider: 'crm-coordinates', secretConfigured: false, coverage: { total: leads.length, mapped, exact, pending, failed, percentage: leads.length ? Math.round(mapped / leads.length * 100) : 0 }, queue: {}, checkedAt: new Date().toISOString() }
    }
    const { data, error } = await client.functions.invoke('maps-diagnostics', { body: { organizationId: currentWorkspace.id } })
    if (error || !data) {
      return { ok: true, mode: 'connected', provider: 'crm-coordinates', secretConfigured: false, coverage: { total: leads.length, mapped, exact, pending, failed, percentage: leads.length ? Math.round(mapped / leads.length * 100) : 0 }, queue: {}, checkedAt: new Date().toISOString() }
    }
    return data as MapsDiagnostic
  }, [currentWorkspace?.id, repositoryMode])

  useEffect(() => {
    window.__REALTALENT_LEAD_MAP_BRIDGE__ = {
      version: APP_VERSION,
      mode: repositoryMode,
      workspaceId: currentWorkspace?.id ?? null,
      providerLabel: repositoryMode === 'supabase' ? 'OpenStreetMap + Google Geocoding opcional via Supabase' : 'OpenStreetMap + Google Geocoding opcional via gateway local',
      canWrite: can('update', 'lead'),
      getLeads: () => snapshotRef.current?.leads ?? [],
      getAccountSummary: (leadId: string) => {
        const activeSnapshot = snapshotRef.current
        const lead = activeSnapshot?.leads.find((item) => item.id === leadId)
        if (!activeSnapshot || !lead?.companyId) return null
        const contacts = activeSnapshot.contacts.filter((item) => item.companyId === lead.companyId)
        const relationships = activeSnapshot.contactRelationships.filter((item) => item.companyId === lead.companyId)
        const insight = buildAccountIntelligence(lead, contacts, relationships, activeSnapshot)
        return {
          stakeholders: contacts.length,
          contacted: insight.contactedCount,
          coverage: insight.coverageScore,
          risk: insight.risk,
          decisionMakers: contacts.filter((item) => item.decisionRole === 'decision_maker' || item.decisionRole === 'economic_buyer').length,
          missingRoles: insight.missingRoleGroups,
        }
      },
      openAccount: (leadId: string) => navigate('leads', { leadId, action: 'account360' }),
      updateLead,
      geocodeLead,
      geocodeMany,
      diagnoseMaps,
      refresh,
    }
    return () => { delete window.__REALTALENT_LEAD_MAP_BRIDGE__ }
  }, [currentWorkspace?.id, diagnoseMaps, geocodeLead, geocodeMany, navigate, refresh, repositoryMode, updateLead])

  useEffect(() => {
    if (window.__REALTALENT_LEAD_MAP_RUNTIME__ || document.getElementById(RUNTIME_ID)) return
    const script = document.createElement('script')
    script.id = RUNTIME_ID
    script.src = new URL('commercial-map-runtime.js', document.baseURI).toString()
    script.defer = true
    document.body.appendChild(script)
    return () => { script.remove() }
  }, [])

  return <div id="commercial-map-root" className="commercial-map-runtime-root" aria-label="Território comercial com carteira geográfica, filtros e cobertura regional" />
}
