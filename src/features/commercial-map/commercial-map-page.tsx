import { useCallback, useEffect, useRef } from 'react'
import { useApp } from '../../app/app-context'
import type { Lead } from '../../domain/types'
import type { UpdateLeadInput } from '../../repositories/crm-repository'
import { getSupabaseClient } from '../../lib/supabase'
import { estimateLeadGeocode } from '../../services/geocoding'

const RUNTIME_ID = 'realtalent-commercial-map-v10033-runtime'

type GeocodeBatchResult = {
  processed: number
  exact: number
  approximate: number
  incomplete: number
  notFound: number
  errors: string[]
}

type CommercialMapBridge = {
  version: '100.33'
  mode: 'local' | 'supabase'
  getLeads(): Lead[]
  updateLead(leadId: string, input: UpdateLeadInput): Promise<Lead>
  geocodeLead(leadId: string): Promise<Lead | null>
  geocodeMany(leadIds: string[]): Promise<GeocodeBatchResult>
  refresh(): Promise<void>
}

declare global {
  interface Window {
    __REALTALENT_MAP_V10033_BRIDGE__?: CommercialMapBridge
    __REALTALENT_MAP_V10033_RUNTIME__?: boolean
  }
}

export function CommercialMapPage() {
  const { snapshot, repositoryMode, updateLead, refresh } = useApp()
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
      const { data, error } = await client.functions.invoke('geocode-lead', { body: { leadIds: [leadId] } })
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
    if (!uniqueIds.length) return { processed: 0, exact: 0, approximate: 0, incomplete: 0, notFound: 0, errors: [] }
    if (repositoryMode === 'supabase') {
      const client = getSupabaseClient()
      if (!client) throw new Error('Supabase não configurado para geocodificação.')
      const { data, error } = await client.functions.invoke('geocode-lead', { body: { leadIds: uniqueIds } })
      if (error) throw error
      await refresh()
      return {
        processed: Number(data?.processed) || 0,
        exact: Number(data?.exact) || 0,
        approximate: Number(data?.approximate) || 0,
        incomplete: Number(data?.incomplete) || 0,
        notFound: Number(data?.notFound) || 0,
        errors: Array.isArray(data?.errors) ? data.errors.map((item: unknown) => typeof item === 'string' ? item : JSON.stringify(item)) : [],
      }
    }
    const result: GeocodeBatchResult = { processed: 0, exact: 0, approximate: 0, incomplete: 0, notFound: 0, errors: [] }
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

  useEffect(() => {
    window.__REALTALENT_MAP_V10033_BRIDGE__ = {
      version: '100.33',
      mode: repositoryMode,
      getLeads: () => snapshotRef.current?.leads ?? [],
      updateLead,
      geocodeLead,
      geocodeMany,
      refresh,
    }
    return () => { delete window.__REALTALENT_MAP_V10033_BRIDGE__ }
  }, [geocodeLead, geocodeMany, refresh, repositoryMode, updateLead])

  useEffect(() => {
    if (window.__REALTALENT_MAP_V10033_RUNTIME__ || document.getElementById(RUNTIME_ID)) return
    const script = document.createElement('script')
    script.id = RUNTIME_ID
    script.src = '/commercial-map-runtime.js'
    script.defer = true
    document.body.appendChild(script)
  }, [])

  return <div id="commercial-map-root" className="commercial-map-runtime-root" aria-label="Mapa Comercial com localização real e geocodificação" />
}
