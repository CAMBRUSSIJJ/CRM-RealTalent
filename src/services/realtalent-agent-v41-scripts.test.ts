import { describe, expect, it } from 'vitest'
import { createCommercialScript, isCommercialScriptRequest } from './realtalent-agent-v41-scripts'
import { runAgentToolsV41 } from './realtalent-agent-v41-tools'
import type { WorkspaceSnapshot } from '../domain/types'
const snapshot={workspace:{id:'test',role:'member'},leads:[],stages:[],contacts:[],activities:[],events:[],calls:[],proposals:[],playbooks:[],companies:[],opportunities:[]} as unknown as WorkspaceSnapshot
describe('RealTalent Tools Engine V4.1 — geração segura de roteiros',()=>{
  it('gera um roteiro de ligação completo e editável',()=>{
    const script=createCommercialScript('crie um roteiro de ligação para prospecção',snapshot)
    expect(script?.kind).toBe('call')
    expect(script?.body).toContain('ABERTURA')
    expect(script?.body).toContain('DIAGNÓSTICO')
    expect(script?.body).toContain('PRÓXIMO PASSO')
    expect(script?.grounded).toBe(false)
  })
  it('distingue e-mail e WhatsApp',()=>{
    expect(createCommercialScript('monte um script de vendas por WhatsApp',snapshot)?.kind).toBe('whatsapp')
    expect(createCommercialScript('crie um roteiro de email comercial',snapshot)?.kind).toBe('email')
  })
  it('não transforma pedido de código em roteiro de venda',()=>{
    expect(isCommercialScriptRequest('escreva um script Python para analisar dados')).toBe(false)
    expect(isCommercialScriptRequest('crie um script JavaScript')).toBe(false)
  })
  it('bloqueia dados de registro de outro vendedor para personalização local',()=>{
    const withLead={...snapshot,leads:[{id:'secret',name:'Cliente Restrito',company:'EMPRESA RESTRITA',ownerId:'other'}]} as WorkspaceSnapshot
    const script=createCommercialScript('crie roteiro de prospecção',withLead,{currentUserId:'user',focusLeadId:'secret'})
    expect(script?.leadId).toBeNull()
    expect(script?.body).not.toContain('EMPRESA RESTRITA')
  })
  it('a resposta do Agent possui saída estruturada sem enviar ou salvar automaticamente',()=>{
    const answer=runAgentToolsV41('crie um roteiro de ligação comercial',snapshot)
    expect(answer?.toolOutput?.kind).toBe('script')
    expect(answer?.plan).toBeUndefined()
    const value=runAgentToolsV41('10 + 8',snapshot)
    expect(value?.toolOutput?.kind).toBe('calculation')
  })
})
