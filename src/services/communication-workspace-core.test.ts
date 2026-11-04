import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cloudEvents: [] as Array<Record<string, unknown>>,
  cloudError: null as null | { message: string },
  gatewayEvents: [] as Array<Record<string, unknown>>,
  gatewayAccounts: [] as Array<Record<string, unknown>>,
  frameworkAccounts: [] as Array<Record<string, unknown>>,
  gatewayFailure: false,
  invoked: vi.fn(),
  gatewaySync: vi.fn(),
}))

vi.mock('../lib/env', () => ({ effectiveDataMode: 'supabase' }))
vi.mock('../lib/supabase', () => ({
  getSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({ data: mocks.cloudEvents, error: mocks.cloudError }),
          }),
        }),
      }),
    }),
    functions: { invoke: mocks.invoked },
  }),
}))
vi.mock('./integration-framework', () => ({
  loadIntegrationFramework: async () => ({ accounts: mocks.frameworkAccounts }),
}))
vi.mock('./local-communications-gateway', () => ({
  loadGatewayAccounts: async () => {
    if (mocks.gatewayFailure) throw new Error('Gateway offline')
    return mocks.gatewayAccounts
  },
  loadGatewayCommunicationEvents: async () => {
    if (mocks.gatewayFailure) throw new Error('Gateway offline')
    return mocks.gatewayEvents
  },
  syncGatewayCommunications: (...args: unknown[]) => mocks.gatewaySync(...args),
  sendGatewayCommunication: vi.fn(),
  markGatewayConversationRead: vi.fn(),
}))

import {
  buildCommunicationConversations, loadCommunicationChannelState,
  loadOfficialCommunicationTimeline, syncOfficialCommunications,
} from './communication-workspace-core'

const workspaceId = 'f960bcae-8a35-4df4-8995-d3968797ad24'
const qrAccount = (status: string) => ({
  id:'gateway-qr', workspaceId, provider:'whatsapp_cloud', displayName:'WhatsApp QR',
  status, connectionMode:'live', capabilities:{messages:true},
  metadata:{transport:'qr', liveState:status === 'connected' ? 'connected' : 'disconnected'},
})
const cloudAccount = {
  id:'cloud-email', workspaceId, provider:'google', displayName:'Google',
  status:'connected', connectionMode:'live', capabilities:{email_send:true,email_read:true},
  metadata:{},
}
const gatewayEvent = {
  id:'qr-event-1', workspaceId, accountId:'gateway-qr', channel:'whatsapp',
  direction:'inbound', status:'received', leadId:null, contactId:null,
  threadId:'551199998888@c.us', senderAddress:'551199998888@c.us', recipientAddresses:[],
  bodyText:'Olá do WhatsApp', subject:'', occurredAt:'2026-11-04T15:25:00Z',
  metadata:{transport:'qr', peerAddress:'551199998888', chatName:'Contato WhatsApp'},
}
const cloudEvent = {
  id:'cloud-email-1', channel:'email', direction:'inbound', status:'received',
  lead_id:null, contact_id:null, account_id:'cloud-email',
  subject:'E-mail de exemplo', body_text:'Mensagem de e-mail', occurred_at:'2026-11-04T15:20:00Z',
  metadata:{},
}

beforeEach(() => {
  mocks.cloudEvents = [cloudEvent]
  mocks.cloudError = null
  mocks.gatewayEvents = [gatewayEvent]
  mocks.gatewayAccounts = [qrAccount('connected')]
  mocks.frameworkAccounts = [cloudAccount]
  mocks.gatewayFailure = false
  mocks.invoked.mockReset().mockResolvedValue({ data:{queued:['cloud-job'], triggered:[], accounts:1}, error:null })
  mocks.gatewaySync.mockReset().mockResolvedValue({queued:[], triggered:['gateway-qr'], accounts:1, imported:2, failures:[]})
})

describe('Central de Comunicação no Vercel com WhatsApp QR do Railway', () => {
  it('combina histórico QR do gateway com mensagens oficiais do Supabase', async () => {
    const timeline = await loadOfficialCommunicationTimeline(workspaceId)
    expect(timeline.map((item) => item.channel)).toEqual(['whatsapp','email'])
    const chats = buildCommunicationConversations(timeline)
    expect(chats.some((chat) => chat.channel === 'whatsapp' && chat.preview === 'Olá do WhatsApp')).toBe(true)
    expect(chats.some((chat) => chat.channel === 'email')).toBe(true)
  })
  it('não duplica mensagens técnicas nem usa eventos de outras origens do gateway', async () => {
    mocks.gatewayEvents = [gatewayEvent, {...gatewayEvent,id:'unofficial-cloud',metadata:{transport:'cloud'}},
      {...gatewayEvent,id:'technical',metadata:{transport:'qr',messageType:'e2e_notification'}}]
    const timeline = await loadOfficialCommunicationTimeline(workspaceId)
    expect(timeline.filter((item) => item.channel === 'whatsapp')).toHaveLength(1)
  })
  it('mantém QR quando leitura do Supabase falha', async () => {
    mocks.cloudError = { message:'Supabase indisponível' }
    expect((await loadOfficialCommunicationTimeline(workspaceId)).map((item) => item.channel)).toEqual(['whatsapp'])
  })
  it('preserva E-mail do Supabase quando gateway falha', async () => {
    mocks.gatewayFailure = true
    expect((await loadOfficialCommunicationTimeline(workspaceId)).map((item) => item.channel)).toEqual(['email'])
    const state = await loadCommunicationChannelState(workspaceId)
    expect(state.emailAccounts).toHaveLength(1)
    expect(state.whatsappAccounts).toHaveLength(0)
  })
  it('não inventa conta conectada; lê estado de conexão do Railway', async () => {
    let state = await loadCommunicationChannelState(workspaceId)
    expect(state.emailAccounts).toHaveLength(1)
    expect(state.whatsappAccounts).toHaveLength(1)
    expect(state.whatsappAccounts[0].metadata.transport).toBe('qr')
    mocks.gatewayAccounts = [qrAccount('attention')]
    state = await loadCommunicationChannelState(workspaceId)
    expect(state.whatsappAccounts[0].status).toBe('attention')
    expect(state.accounts.some((account) => account.provider === 'whatsapp_cloud' && account.status === 'connected')).toBe(false)
  })
  it('sincroniza somente QR pelo gateway sem chamar Edge Function desnecessária', async () => {
    mocks.frameworkAccounts = []
    const result = await syncOfficialCommunications(workspaceId)
    expect(mocks.gatewaySync).toHaveBeenCalledWith(workspaceId,'gateway-qr')
    expect(mocks.invoked).not.toHaveBeenCalled()
    expect(result.imported).toBe(2)
    expect(result.failures).toHaveLength(0)
  })
  it('preserva sincronização oficial quando existe conta Cloud', async () => {
    const result = await syncOfficialCommunications(workspaceId)
    expect(mocks.gatewaySync).toHaveBeenCalledWith(workspaceId,'gateway-qr')
    expect(mocks.invoked).toHaveBeenCalledWith('communication-sync-now',{body:{organizationId:workspaceId}})
    expect(result.triggered).toContain('gateway-qr')
    expect(result.queued).toContain('cloud-job')
  })
  it('quando Edge Function falha, mantém resultado QR e informa falha parcial', async () => {
    mocks.invoked.mockRejectedValue(new Error('Failed to send a request to the Edge Function'))
    const result = await syncOfficialCommunications(workspaceId)
    expect(result.imported).toBe(2)
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].transport).toBe('cloud')
  })
})
