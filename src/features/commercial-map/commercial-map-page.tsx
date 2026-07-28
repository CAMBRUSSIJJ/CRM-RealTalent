import { useCallback, useEffect, useRef } from 'react'
import { useApp } from '../../app/app-context'
import type { Lead } from '../../domain/types'
import type { UpdateLeadInput } from '../../repositories/crm-repository'
import { getSupabaseClient } from '../../lib/supabase'
import { estimateLeadGeocode } from '../../services/geocoding'

const RUNTIME_ID = 'realtalent-lead-map-v100462-runtime'

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

type LeadMapBridge = {
  version: '100.46.2'
  mode: 'local' | 'supabase'
  workspaceId: string | null
  providerLabel: string
  canWrite: boolean
  getLeads(): Lead[]
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
  const { snapshot, repositoryMode, currentWorkspace, updateLead, refresh } = useApp()
  const snapshotRef = useRef(snapshot)
  useEffect(() => {
    snapshotRef.current = snapshot
    window.dispatchEvent(new CustomEvent('realtalent-map-data-updated'))
  }, [snapshot])

  const geocodeLead = useCallback(async (leadId: string) => {
    const lead = snapshotRef.current?.leads.find((item) => item.id === leadId)
    if (!lead) throw new Error('Lead não encontrado para geocodificação.')
    if (repositoryMode === 'supabase') {
      const client = getSupabaseClient()
      if (!client) throw new Error('Supabase não configurado para geocodificação.')
      const { data, error } = await client.functions.invoke('geocode-lead', { body: { leadIds: [leadId], source: 'map' } })
      if (error) throw error
      const failure = Array.isArray(data?.errors) ? data.errors[0] : null
      if (failure) throw new Error(String(failure.message ?? failure))
      await refresh()
      return null
    }
    const input = estimateLeadGeocode(lead)
    if (!Object.keys(input).length) return lead
    return updateLead(leadId, input)
  }, [refresh, repositoryMode, updateLead])

  const geocodeMany = useCallback(async (leadIds: string[]): Promise<GeocodeBatchResult> => {
    const uniqueIds = [...new Set(leadIds)].slice(0, 100)
    if (!uniqueIds.length) return { queued: 0, processed: 0, exact: 0, approximate: 0, incomplete: 0, notFound: 0, errors: [] }
    if (repositoryMode === 'supabase') {
      const client = getSupabaseClient()
      if (!client) throw new Error('Supabase não configurado para geocodificação.')
      const { data, error } = await client.functions.invoke('geocode-lead', { body: { leadIds: uniqueIds, source: 'map' } })
      if (error) throw error
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
      } catch (error) {
        result.errors.push(error instanceof Error ? error.message : 'Falha ao processar um lead.')
      }
    }
    return result
  }, [refresh, repositoryMode, updateLead])

  const diagnoseMaps = useCallback(async (): Promise<MapsDiagnostic> => {
    const leads = snapshotRef.current?.leads ?? []
    const mapped = leads.filter((lead) => Number.isFinite(Number(lead.latitude)) && Number.isFinite(Number(lead.longitude))).length
    const exact = leads.filter((lead) => lead.geocodeStatus === 'exact' || lead.geocodeStatus === 'manual').length
    const pending = leads.filter((lead) => ['pending', 'approximate', 'incomplete'].includes(String(lead.geocodeStatus || ''))).length
    const failed = leads.filter((lead) => lead.geocodeStatus === 'not_found').length
    if (repositoryMode !== 'supabase') {
      return { ok: true, mode: 'demo', provider: 'estimativa-local', secretConfigured: false, coverage: { total: leads.length, mapped, exact, pending, failed, percentage: leads.length ? Math.round(mapped / leads.length * 100) : 0 }, queue: {}, checkedAt: new Date().toISOString() }
    }
    const client = getSupabaseClient()
    if (!client || !currentWorkspace?.id) throw new Error('Workspace conectado não disponível para diagnóstico.')
    const { data, error } = await client.functions.invoke('maps-diagnostics', { body: { organizationId: currentWorkspace.id } })
    if (error) throw error
    return data as MapsDiagnostic
  }, [currentWorkspace?.id, repositoryMode])

  useEffect(() => {
    window.__REALTALENT_LEAD_MAP_BRIDGE__ = {
      version: '100.46.2',
      mode: repositoryMode,
      workspaceId: currentWorkspace?.id ?? null,
      providerLabel: repositoryMode === 'supabase' ? 'Google Geocoding + mapa interativo' : 'Mapa demonstrativo com estimativas locais',
      canWrite: currentWorkspace?.role !== 'viewer',
      getLeads: () => snapshotRef.current?.leads ?? [],
      updateLead,
      geocodeLead,
      geocodeMany,
      diagnoseMaps,
      refresh,
    }
    return () => { delete window.__REALTALENT_LEAD_MAP_BRIDGE__ }
  }, [currentWorkspace?.id, diagnoseMaps, geocodeLead, geocodeMany, refresh, repositoryMode, updateLead])

  useEffect(() => {
    if (window.__REALTALENT_LEAD_MAP_RUNTIME__ || document.getElementById(RUNTIME_ID)) return
    const script = document.createElement('script')
    script.id = RUNTIME_ID
    script.src = new URL('commercial-map-runtime.js', document.baseURI).toString()
    script.defer = true
    document.body.appendChild(script)
    return () => { script.remove() }
  }, [])

  return <div id="commercial-map-root" className="commercial-map-runtime-root" aria-label="Mapa de Leads com localização, filtros e geocodificação" />
}
