import {describe,it,expect,vi} from 'vitest'
import {shouldPlanReadOnlyTools,validReadOnlyPlan,runPlannedReadOnlyTools} from './realtalent-agent-v62-orchestrator'
import type {AssistantAnswer} from './realtalent-assistant'
const plan={confidence:.96,tools:[
  {name:'web_research' as const,input:'jardinagem condomínios mercado brasileiro'},
  {name:'calculator' as const,input:'custo 100 margem 30%'}]}
describe('Agent V6.2 bounded read-only orchestration',()=>{
  it('plans only compound tool requests and protects CRM mutations',()=>{
    expect(shouldPlanReadOnlyTools('Pesquise o mercado de jardinagem e calcule preço com custo R$ 100 e margem 30%')).toBe(true)
    expect(shouldPlanReadOnlyTools('crie uma tarefa para o cliente sobre custo R$ 100 e margem 30% no mercado')).toBe(false)
    expect(shouldPlanReadOnlyTools('Quanto custa uma venda com custo R$ 100 e margem 30%?')).toBe(false)
  })
  it('does not accept hallucinated tools, duplicates or unconfident plan',()=>{
    expect(validReadOnlyPlan({...plan,tools:[...plan.tools,{name:'send_whatsapp',input:'enviar'}]})).toBeNull()
    expect(validReadOnlyPlan({...plan,confidence:.2})).toBeNull()
    expect(validReadOnlyPlan(plan)?.tools).toHaveLength(2)
  })
  it('combines real research with deterministic arithmetic and clickable source data',async()=>{
    const researcher=vi.fn(async()=>({id:'research:test',intent:'unknown',title:'Pesquisa',text:'Mercado consultivo [1].',
      items:[],facts:[],suggestedPrompts:[],generatedAt:new Date().toISOString(),
      researchSources:[{title:'Fonte',url:'https://example.org/guia'}]}) as AssistantAnswer)
    const answer=await runPlannedReadOnlyTools('Pesquise jardinagem no mercado e calcule preço com custo R$ 100 e margem 30%',
      {},{planner:async()=>plan,researcher})
    expect(answer?.researchSources).toHaveLength(1)
    expect(answer?.toolOutput?.kind).toBe('calculation')
    expect(answer?.text).toContain('Cálculo verificado')
  })
  it('does not call research when the generated plan contains private data',async()=>{
    const researcher=vi.fn()
    const answer=await runPlannedReadOnlyTools('Pesquise jardinagem no mercado e calcule preço com custo R$ 100 e margem 30%',
      {},{planner:async()=>({...plan,tools:[{name:'web_research',input:'contato@empresa.com'},{name:'calculator',input:'conta'}]}),researcher})
    expect(answer).toBeNull()
    expect(researcher).not.toHaveBeenCalled()
  })
})
