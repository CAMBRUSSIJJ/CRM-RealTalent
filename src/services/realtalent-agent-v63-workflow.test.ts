import {describe,it,expect,vi} from 'vitest'
import type {WorkspaceSnapshot} from '../domain/types'
import type {AssistantAnswer,AssistantContext} from './realtalent-assistant'
import {authorizedCrmSummary,publicTopicForWorkflow,shouldRunContextualWorkflow,
  validateWorkflowPlan,runContextualWorkflow} from './realtalent-agent-v63-workflow'
const seed=(role:'owner'|'member'|'viewer'='member')=>({
  workspace:{id:'ws-a',name:'A',slug:'a',role},
  leads:[
    {id:'l1',workspaceId:'ws-a',ownerId:'u1',name:'Cliente confidencial 1',
      email:'privado@example.com',phone:'11987654321',company:'Nome de Cliente Ltda',
      notes:'Segredo comercial',status:'active',stageId:'s1',value:2500,priority:'high',
      nextActionAt:'2025-01-01T10:00:00Z'},
    {id:'l2',workspaceId:'ws-a',ownerId:'u2',name:'Cliente confidencial 2',
      email:'outro@example.com',phone:'11988888888',status:'active',stageId:'s2',value:5000,
      priority:'low',nextActionAt:null},
    {id:'l3',workspaceId:'ws-b',ownerId:'u1',name:'Outro workspace',status:'active',
      stageId:'s1',value:99999,priority:'urgent',nextActionAt:null},
  ],
  stages:[{id:'s1',workspaceId:'ws-a',order:0},{id:'s2',workspaceId:'ws-a',order:1}],
}) as unknown as WorkspaceSnapshot
const question='Analise meus leads do CRM, pesquise o mercado de jardinagem e crie um plano comercial'
const plan={tasks:['crm_summary','web_research','draft_document'] as const,confidence:0.94}
describe('Agent V6.3 bounded contextual planning',()=>{
  it('routes combined CRM + document without capturing mutating commands',()=>{
    expect(shouldRunContextualWorkflow(question)).toBe(true)
    expect(shouldRunContextualWorkflow('crie uma tarefa no CRM para amanhã e um plano de mercado')).toBe(false)
    expect(shouldRunContextualWorkflow('Pesquise o mercado de jardinagem sem meus dados')).toBe(false)
    expect(shouldRunContextualWorkflow('Quero um resumo dos meus leads do CRM e plano comercial')).toBe(true)
  })
  it('rejects hallucinated tools or research without explicit market need',()=>{
    expect(validateWorkflowPlan(plan,question)?.tasks).toHaveLength(3)
    expect(validateWorkflowPlan({...plan,tasks:['crm_summary','send_whatsapp','draft_document']},question)).toBeNull()
    expect(validateWorkflowPlan(plan,'Faça um plano para meus leads do CRM')).toBeNull()
    expect(validateWorkflowPlan({...plan,confidence:.3},question)).toBeNull()
  })
  it('enforces owner workspace scope, member ownership, no data leakage',()=>{
    const scoped=authorizedCrmSummary(seed(),{currentUserId:'u1'} as AssistantContext)
    expect(scoped).not.toBeNull()
    const data=JSON.parse(scoped!)
    expect(data.authorizedLeads).toBe(1)
    expect(data.openPipelineValue).toBe(2500)
    expect(scoped).not.toContain('Cliente confidencial')
    expect(scoped).not.toContain('privado@example.com')
    expect(scoped).not.toContain('11987654321')
    expect(authorizedCrmSummary(seed(),{})).toBeNull()
    expect(JSON.parse(authorizedCrmSummary(seed('owner'))!).authorizedLeads).toBe(2)
  })
  it('uses generic public research query, no CRM identities',()=>{
    expect(publicTopicForWorkflow(question)).toContain('mercado jardinagem')
    expect(publicTopicForWorkflow('Plano para meus leads no CRM')).toBeNull()
  })
  it('creates a versionable document without invoking CRM mutations',async()=>{
    const research=vi.fn(async (_query:string)=>({
      id:'research:test',intent:'unknown',title:'Pesquisa',text:'Abordagens consultivas [1]',
      items:[],facts:[],suggestedPrompts:[],
      researchSources:[{title:'Fonte consultiva',url:'https://example.org/public'}],
      generatedAt:new Date().toISOString()
    } as AssistantAnswer))
    const fetcher=vi.fn(async (url:string,opts:RequestInit)=>({
      ok:true,json:async()=>{
        const body=JSON.parse(String(opts.body))
        expect(url).toContain('/tools/workflow-synthesize')
        expect(body.crmSummary).not.toContain('Cliente confidencial')
        expect(body.researchAnswer).toContain('Abordagens consultivas')
        return {ok:true,answer:'O CRM apresenta 1 lead autorizado. A fonte [1] sugere diagnóstico.',
          document:'Plano comercial original: observar as oportunidades ativas, priorizar diagnóstico, validar hipóteses e acompanhar conversão com revisões quinzenais.'.repeat(2)}
      }
    } as Response))
    const answer=await runContextualWorkflow(question,seed(),{currentUserId:'u1'},{
      planner:async()=>({...plan,tasks:[...plan.tasks]}),researcher:research,
      fetcher:fetcher as unknown as typeof import('./realtalent-runtime-transport').runtimeFetch
    })
    expect(answer?.toolOutput?.kind).toBe('script')
    expect(answer?.researchSources).toHaveLength(1)
    expect(fetcher).toHaveBeenCalledOnce()
    expect(research).toHaveBeenCalledOnce()
    const args=research.mock.calls[0]
    expect(args[0]).not.toContain('Cliente confidencial')
  })
  it('leaves existing document intact if Ollama fails',async()=>{
    const answer=await runContextualWorkflow(question,seed(),{currentUserId:'u1'},{
      planner:async()=>({...plan,tasks:['crm_summary','draft_document']}), 
      fetcher:async()=>{throw new Error('offline')}
    })
    expect(answer?.id).toContain('workflow:unavailable:')
    expect(answer?.toolOutput).toBeUndefined()
  })
})
