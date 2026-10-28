import {describe,expect,it,vi} from 'vitest'
import {canConsiderModelResearch,routeResearchByModel} from './realtalent-agent-v60-router'
describe('Agent V6 semantic research routing',()=>{
  it('considers uncertain external questions beyond hardcoded search words',()=>{
    expect(canConsiderModelResearch('Quais metodologias comerciais são mais recentes e relevantes?')).toBe(true)
    expect(canConsiderModelResearch('Quais novidades sobre prospecção de serviços há no mercado?')).toBe(true)
  })
  it('does not let the model override CRM writes or direct document edits',()=>{
    expect(canConsiderModelResearch('crie uma tarefa para amanhã')).toBe(false)
    expect(canConsiderModelResearch('transforme o roteiro em tabela')).toBe(false)
    expect(canConsiderModelResearch('quantos clientes tenho no CRM')).toBe(false)
  })
  it('selects research only with safe, high confidence response',async()=>{
    const fetcher=vi.fn(async()=>({ok:true,json:async()=>({ok:true,intent:'research',confidence:0.93})} as Response))
    expect(await routeResearchByModel('Quais técnicas comerciais estão surgindo no mercado?',{},fetcher)).toBe(true)
    expect(fetcher).toHaveBeenCalledOnce()
    const low=vi.fn(async()=>({ok:true,json:async()=>({ok:true,intent:'research',confidence:0.45})} as Response))
    expect(await routeResearchByModel('Qual a novidade mais relevante do mercado?',{},low)).toBe(false)
  })
  it('preserves safe fallback if Ollama classifier is offline',async()=>{
    expect(await routeResearchByModel('Quais novidades recentes merecem atenção?',{},async()=>{throw new Error('offline')})).toBe(false)
  })
})
