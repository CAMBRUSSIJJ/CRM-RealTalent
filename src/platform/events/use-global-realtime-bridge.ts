import { useEffect } from 'react'
import { getSupabaseClient } from '../../lib/supabase'
import { subscribeGatewayCommunicationsRealtime } from '../../services/local-communications-gateway'
import { createDomainEvent } from './domain-event'
import { domainEventBus } from './event-bus'
import { publishRealtimeTableChange } from './realtime-event-bridge'
import { setRealtimeTransportState } from './realtime-status'

export const useGlobalRealtimeBridge = (workspaceId: string | null | undefined, repositoryMode: 'local' | 'supabase') => {
  useEffect(() => {
    if (repositoryMode !== 'supabase' || !workspaceId) { setRealtimeTransportState('supabase-realtime', 'disabled'); return }
    const client = getSupabaseClient(); if (!client) { setRealtimeTransportState('supabase-realtime', 'offline'); return }
    setRealtimeTransportState('supabase-realtime', 'connecting')
    const signal = (table: string) => () => {
      setRealtimeTransportState('supabase-realtime', 'live')
      void publishRealtimeTableChange(workspaceId, table)
    }
    const channel = client.channel(`crm-v10194-workspace-${workspaceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads', filter: `organization_id=eq.${workspaceId}` }, signal('leads'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'companies', filter: `organization_id=eq.${workspaceId}` }, signal('companies'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts', filter: `organization_id=eq.${workspaceId}` }, signal('contacts'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_relationships', filter: `organization_id=eq.${workspaceId}` }, signal('contact_relationships'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'opportunities', filter: `organization_id=eq.${workspaceId}` }, signal('opportunities'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'social_profiles', filter: `organization_id=eq.${workspaceId}` }, signal('social_profiles'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pipeline_stages', filter: `organization_id=eq.${workspaceId}` }, signal('pipeline_stages'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities', filter: `organization_id=eq.${workspaceId}` }, signal('activities'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls', filter: `organization_id=eq.${workspaceId}` }, signal('calls'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events', filter: `organization_id=eq.${workspaceId}` }, signal('calendar_events'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playbooks', filter: `organization_id=eq.${workspaceId}` }, signal('playbooks'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `organization_id=eq.${workspaceId}` }, signal('products'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_proposals', filter: `organization_id=eq.${workspaceId}` }, signal('sales_proposals'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_proposal_items', filter: `organization_id=eq.${workspaceId}` }, signal('sales_proposal_items'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'revenue_entries', filter: `organization_id=eq.${workspaceId}` }, signal('revenue_entries'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goals', filter: `organization_id=eq.${workspaceId}` }, signal('goals'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'automation_rules', filter: `organization_id=eq.${workspaceId}` }, signal('automation_rules'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'automation_runs', filter: `organization_id=eq.${workspaceId}` }, signal('automation_runs'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_executions', filter: `organization_id=eq.${workspaceId}` }, signal('workflow_executions'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_step_runs', filter: `organization_id=eq.${workspaceId}` }, signal('workflow_step_runs'))
      .subscribe((status) => setRealtimeTransportState('supabase-realtime', status === 'SUBSCRIBED' ? 'live' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'offline' : 'connecting'))
    return () => { setRealtimeTransportState('supabase-realtime', 'disabled'); void client.removeChannel(channel) }
  }, [repositoryMode, workspaceId])

  useEffect(() => {
    if (!workspaceId) { setRealtimeTransportState('communications-sse', 'disabled'); return }
    const unsubscribe = subscribeGatewayCommunicationsRealtime(workspaceId, {
      onSignal: (signal) => {
        if (signal.type !== 'communications.changed') return
        void domainEventBus.publish(createDomainEvent({
          name: 'communication.changed', workspaceId, source: 'communications-sse', revision: signal.revision ?? null,
          payload: { reason: signal.reason ?? null },
        }))
      },
      onState: (state) => setRealtimeTransportState('communications-sse', state),
    })
    return () => { unsubscribe(); setRealtimeTransportState('communications-sse', 'disabled') }
  }, [workspaceId])
}
