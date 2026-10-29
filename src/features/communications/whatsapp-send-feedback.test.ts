import {describe,expect,it} from 'vitest'
import {acknowledgedInTimeline,statusAfterGatewayAck} from './whatsapp-send-feedback'

describe('WhatsApp: enviar sem alertas repetitivos ou mensagens piscando',()=>{
  it('retains the optimistic bubble until the server event appears',()=>{
    const pending={idempotencyKey:'crm-whatsapp:test-01',serverEventId:null}
    expect(acknowledgedInTimeline(pending,[])).toBe(false)
    expect(acknowledgedInTimeline(pending,[{id:'official:else',metadata:{idempotencyKey:'other'}}])).toBe(false)
  })
  it('reconciles the send using idempotency key when history arrives',()=>{
    const pending={idempotencyKey:'crm-whatsapp:test-01'}
    expect(acknowledgedInTimeline(pending,[{id:'official:x',metadata:{idempotencyKey:'crm-whatsapp:test-01'}}])).toBe(true)
  })
  it('also reconciles by server event ID if history lacks idempotency key',()=>{
    const pending={idempotencyKey:'crm-whatsapp:test-01',serverEventId:'server-123'}
    expect(acknowledgedInTimeline(pending,[{id:'official:server-123',metadata:{}}])).toBe(true)
    expect(acknowledgedInTimeline(pending,[{id:'official:server-456',metadata:{}}])).toBe(false)
    expect(acknowledgedInTimeline(pending,[{id:'official:ignored',metadata:{eventId:'server-123'}}])).toBe(true)
  })
  it('never interprets queued or accepted as delivered/read',()=>{
    expect(statusAfterGatewayAck('queued')).toBe('queued')
    expect(statusAfterGatewayAck('accepted')).toBe('queued')
    expect(statusAfterGatewayAck('sent')).toBe('sent')
    expect(statusAfterGatewayAck('delivered')).toBe('sent')
    expect(statusAfterGatewayAck('read')).toBe('sent')
    expect(statusAfterGatewayAck('failed')).toBe('failed')
  })
})
