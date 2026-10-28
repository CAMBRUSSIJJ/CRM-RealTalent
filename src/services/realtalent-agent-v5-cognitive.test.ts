import { describe, expect, it, vi } from 'vitest'
import { classifyV5ToolRequest, rankRelevantCRMContext, runAgentToolsV5 } from './realtalent-agent-v5-cognitive'
import type { WorkspaceSnapshot } from '../domain/types'
const snapshot={workspace:{id:'one',role:'member'},leads:[],stages:[],contacts:[],activities:[],events:[],calls:[],proposals:[],playbooks:[]} as unknown as WorkspaceSnapshot
describe('Agent V5 — tool orchestration and factual context',()=>{
  const refiner=vi.fn(async()=>({body:'ABERTURA '.repeat(80),model:'test-local'}))
  it('não usa atalho de conteúdo para executar mutações',async()=>{
    expect(classifyV5ToolRequest('crie um roteiro e envie no WhatsApp').mutation).toBe(true)
    expect(await runAgentToolsV5('crie um roteiro e envie no WhatsApp',snapshot,{}, {refiner})).toBeNull()
    expect(refiner).not.toHaveBeenCalled()
  })
  it('escolhe o caminho matemático sem chamar o modelo',async()=>{
    const answer=await runAgentToolsV5('quanto é 10% de 1500',snapshot,{}, {refiner})
    expect(answer?.toolOutput?.kind).toBe('calculation')
    expect(refiner).not.toHaveBeenCalled()
  })
  it('gera roteiro e pode refinar sem criar registros',async()=>{
    const a=await runAgentToolsV5('crie um roteiro de ligação comercial',snapshot,{}, {refiner})
    expect(a?.toolOutput?.kind).toBe('script')
    expect(a?.plan).toBeUndefined()
    expect(a?.toolOutput && 'body' in a.toolOutput && a.toolOutput.body).toContain('ABERTURA')
  })
  it('não perde o cálculo solicitado junto com um roteiro',async()=>{
    const a=await runAgentToolsV5('calcule 10% de 1500 e crie um roteiro de ligação comercial',snapshot,{}, {refiner})
    expect(a?.title).toContain('Cálculo')
    expect(a?.toolOutput&&'body' in a.toolOutput?a.toolOutput.body:'').toContain('R$')
    expect(a?.facts.length).toBeGreaterThan(0)
  })
  it('usa fallback local quando Ollama não responde',async()=>{
    const a=await runAgentToolsV5('crie um roteiro de prospecção',snapshot,{}, {refiner:async()=>null})
    expect(a?.toolOutput&&'body' in a.toolOutput?a.toolOutput.body:'').toContain('DIAGNÓSTICO')
  })
  it('limita a recuperação ao proprietário do registro',()=>{
    const restricted={...snapshot,leads:[{id:'lead-secret',name:'Restrito',ownerId:'other',notes:'dado privado',stageId:'none'}]} as WorkspaceSnapshot
    expect(rankRelevantCRMContext('notas',restricted,{currentUserId:'current',focusLeadId:'lead-secret'})).toEqual([])
  })
})
