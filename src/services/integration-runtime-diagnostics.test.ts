import { describe, expect, it, vi } from 'vitest'
vi.mock('./local-communications-gateway',()=>({loadCommunicationsGatewayHealth:vi.fn(async()=>({ok:true,mode:'local-gateway',version:'test',providers:{google:false,microsoft:false,whatsapp:false},syncIntervalMs:30000}))}))
import { checkIntegrationEdgeFunction, describeIntegrationBackendError, requiredIntegrationFunctions } from './integration-runtime-diagnostics'
const endpoint='https://example.supabase.co'
const response=(status:number)=>vi.fn(async (_url:string, options:RequestInit)=>{expect(options.method).toBe('HEAD');expect(options.body).toBeUndefined();expect(options.redirect).toBe('manual');return {status} as Response}) as unknown as typeof fetch
describe('Functional Recovery: sem ações destrutivas no diagnóstico',()=>{
  it.each([[404,'missing'],[401,'protected'],[403,'protected'],[405,'online'],[204,'online'],[500,'unavailable'],[502,'unavailable']] as const)('HTTP %i -> %s',async(status,expected)=>{
    expect((await checkIntegrationEdgeFunction('integration-oauth-start','OAuth',endpoint,response(status))).status).toBe(expected)
  })
  it('não consulta rede sem URL do Supabase',async()=>{const fetcher=vi.fn();expect((await checkIntegrationEdgeFunction('oauth','OAuth','',fetcher)).status).toBe('missing');expect(fetcher).not.toHaveBeenCalled()})
  it('relata falha de rede',async()=>{const fetcher=vi.fn(async()=>{throw new Error('offline')}) as unknown as typeof fetch;expect((await checkIntegrationEdgeFunction('oauth','OAuth',endpoint,fetcher)).status).toBe('unavailable')})
  it('não envia body, dados nem tokens',async()=>{const fetcher=vi.fn(async()=>({status:404})) as unknown as typeof fetch;await checkIntegrationEdgeFunction('integration-calendar-catalog','Calendar',endpoint,fetcher);const [url,opts]=vi.mocked(fetcher).mock.calls[0];expect(String(url)).toBe(endpoint+'/functions/v1/integration-calendar-catalog');expect(opts).not.toHaveProperty('body');expect(opts).not.toHaveProperty('headers')})
  it('explica a função ausente',()=>expect(describeIntegrationBackendError('integration-oauth-start',{},404)).toContain('não está implantada'))
  it('explica autorização e indisponibilidade',()=>{expect(describeIntegrationBackendError('oauth',{context:{status:403}})).toContain('autorização');expect(describeIntegrationBackendError('oauth',{context:{status:503}})).toContain('503')})
  it('cobre as funções críticas',()=>expect(requiredIntegrationFunctions.map(([s])=>s)).toHaveLength(5))
})
