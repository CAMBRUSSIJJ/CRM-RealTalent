import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  gatewaySend: vi.fn(),
  gatewayAccounts: [] as Array<Record<string, unknown>>,
  frameworkAccounts: [] as Array<Record<string, unknown>>,
  gatewayDown: false,
}))

vi.mock('../lib/env', () => ({ effectiveDataMode:'supabase' }))
vi.mock('../lib/supabase', () => ({
  getSupabaseClient: () => ({ functions: { invoke: mocks.invoke } }),
}))
vi.mock('./integration-framework', () => ({
  loadIntegrationFramework: async () => ({ accounts: mocks.frameworkAccounts }),
}))
vi.mock('./local-communications-gateway', () => ({
  loadGatewayAccounts: async () => {
    if (mocks.gatewayDown) throw new Error('Gateway temporariamente indisponível')
    return mocks.gatewayAccounts
  },
  sendGatewayCommunication: (...args: unknown[]) => mocks.gatewaySend(...args),
}))

import { connectedWhatsAppAccounts, sendOfficialWhatsApp } from './whatsapp-workspace-core'

const workspaceId='f960bcae-8a35-4df4-8995-d3968797ad24'
const qrAccount={id:'qr-account',provider:'whatsapp_cloud',status:'connected',connectionMode:'live',metadata:{transport:'qr'},workspaceId}
const cloudAccount={id:'cloud-account',provider:'whatsapp_cloud',status:'connected',connectionMode:'live',metadata:{transport:'cloud'},workspaceId}

beforeEach(() => {
  mocks.invoke.mockReset().mockResolvedValue({data:{event:{id:'cloud-event',status:'sent'}},error:null})
  mocks.gatewaySend.mockReset().mockResolvedValue({id:'qr-event',status:'sent'})
  mocks.gatewayAccounts=[qrAccount]
  mocks.frameworkAccounts=[cloudAccount]
  mocks.gatewayDown=false
})
describe('WhatsApp no CRM hospedado: seleção do transporte real', () => {
  it('envia pelo gateway Railway quando a conta selecionada é QR', async () => {
    const result=await sendOfficialWhatsApp({workspaceId,accountId:'qr-account',transport:'qr',
      recipient:'5511999999999',body:'Mensagem de teste',idempotencyKey:'manual:qr-1',
      replyToExternalMessageId:'wa-msg-1'})
    expect(result.id).toBe('qr-event')
    expect(mocks.gatewaySend).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId, accountId:'qr-account', channel:'whatsapp',idempotencyKey:'manual:qr-1',
      replyToExternalMessageId:'wa-msg-1',
    }))
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
  it('mantém Cloud API e sua Edge Function para a conta oficial', async () => {
    const result=await sendOfficialWhatsApp({workspaceId,accountId:'cloud-account',transport:'cloud',
      recipient:'5511999999999',body:'Mensagem oficial'})
    expect(result.id).toBe('cloud-event')
    expect(mocks.invoke).toHaveBeenCalledWith('official-communication-send', expect.objectContaining({
      body:expect.objectContaining({accountId:'cloud-account',channel:'whatsapp'}),
    }))
    expect(mocks.gatewaySend).not.toHaveBeenCalled()
  })
  it('permite envio para grupos @g.us no WhatsApp QR', async () => {
    await sendOfficialWhatsApp({workspaceId,accountId:'qr-account',transport:'qr',
      threadId:'12345@g.us',body:'Mensagem para grupo'})
    expect(mocks.gatewaySend).toHaveBeenCalledWith(expect.objectContaining({threadId:'12345@g.us'}))
  })
  it('não roteia grupos para Cloud API, que não oferece essa funcionalidade', async () => {
    await expect(sendOfficialWhatsApp({workspaceId,accountId:'cloud-account',transport:'cloud',
      threadId:'12345@g.us',body:'Mensagem para grupo'})).rejects.toThrow('apenas no WhatsApp por QR')
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
  it('identifica conta QR para outros módulos que ainda não informam transport', async () => {
    const result=await sendOfficialWhatsApp({workspaceId,accountId:'qr-account',
      recipient:'5511999999999',body:'Sem campo transport'})
    expect(result.id).toBe('qr-event')
    expect(mocks.gatewaySend).toHaveBeenCalledTimes(1)
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
  it('um erro do gateway QR não deve enviar a mesma mensagem pela Edge Function', async () => {
    mocks.gatewaySend.mockRejectedValueOnce(new Error('WhatsApp QR desconectado'))
    await expect(sendOfficialWhatsApp({workspaceId,accountId:'qr-account',transport:'qr',
      recipient:'5511999999999',body:'Não duplicar'})).rejects.toThrow('WhatsApp QR desconectado')
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
  it('lista contas QR do Railway e contas Cloud sem confiar em QR Supabase obsoleto', async () => {
    mocks.frameworkAccounts=[cloudAccount,{...qrAccount,id:'qr-obsoleto',metadata:{transport:'qr'}}]
    const accounts=await connectedWhatsAppAccounts(workspaceId)
    expect(accounts.map((account) => account.id)).toEqual(['cloud-account','qr-account'])
  })
})
