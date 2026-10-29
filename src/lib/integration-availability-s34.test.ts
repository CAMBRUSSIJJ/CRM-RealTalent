import {describe,expect,it} from 'vitest'
import {
  hostedCalendarConnectionAvailable,
  whatsappGatewayIsHealthy,
  describeLocalServiceError,
} from './integration-availability-s34'

describe('S3.4 — serviço real versus apresentação das integrações',()=>{
  it('blocks hosted OAuth actions in the local CRM/demo mode',()=>{
    expect(hostedCalendarConnectionAvailable('local')).toBe(false)
    expect(hostedCalendarConnectionAvailable('supabase')).toBe(true)
  })
  it('only reports WhatsApp gateway online after an actual healthy endpoint response',()=>{
    const supervisor={services:{communications:true}}
    expect(whatsappGatewayIsHealthy(null,supervisor)).toBe(false)
    expect(whatsappGatewayIsHealthy({ok:false},supervisor)).toBe(false)
    expect(whatsappGatewayIsHealthy({ok:true},null)).toBe(true)
  })
  it('translates HTTP proxy errors into actionable messages without claiming connectivity',()=>{
    expect(describeLocalServiceError(502,'supervisor')).toMatch(/502.*supervisor/i)
    expect(describeLocalServiceError(502,'gateway')).toMatch(/502.*gateway/i)
    expect(describeLocalServiceError(503,'gateway')).toMatch(/temporariamente indisponível/)
  })
})
