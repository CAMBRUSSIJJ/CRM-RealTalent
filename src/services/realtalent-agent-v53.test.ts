import {describe,expect,it,vi} from 'vitest'
import {isWorkContinuation,workFromAnswer,restoreWorkRevision,answerFromWork} from './realtalent-agent-v53-work'
import {classifyDocumentFollowup,reviseAgentWork} from './realtalent-agent-v53-editor'
import {runAgentToolsV5} from './realtalent-agent-v5-cognitive'
import {retrieveAgentKnowledge} from './realtalent-agent-v53-knowledge'
import {evaluateAgentWork} from './realtalent-agent-v53-quality'
import type {AssistantAnswer} from './realtalent-assistant'
import type {WorkspaceSnapshot} from '../domain/types'
const answer=(body:string):AssistantAnswer=>({
  id:'a',intent:'crm_capability',title:'Roteiro',text:'Criado',facts:[],items:[],
  suggestedPrompts:[],generatedAt:new Date().toISOString(),
  toolOutput:{kind:'script',title:'Roteiro',channel:'call',leadId:null,grounded:false,body},
})
const snapshot={workspace:{id:'one',role:'member'},leads:[],stages:[],contacts:[],events:[],calls:[],activities:[],playbooks:[],proposals:[]} as unknown as WorkspaceSnapshot

describe('V5.3 — documento ativo e edição contextual',()=>{
  it('a frase exata da captura revisa o documento, não cria comando CRM',()=>{
    const work=workFromAnswer(answer('A'.repeat(260)),'crie roteiro')!
    expect(isWorkContinuation('consegue personalizar com o contexto de jardinagem?',work)).toBe(true)
    expect(isWorkContinuation('deixe mais consultivo',work)).toBe(true)
    expect(isWorkContinuation('crie uma tarefa para amanhã',work)).toBe(false)
    expect(isWorkContinuation('quais negócios estão em risco?',work)).toBe(false)
  })
  it('mantém versões separadas e permite restaurar sem perder histórico',()=>{
    const first=workFromAnswer(answer('A'.repeat(260)),'criar')!
    const next=workFromAnswer(answer('B'.repeat(260)),'personalize',first)!
    expect(next.id).toBe(first.id)
    expect(next.revisions).toHaveLength(2)
    const restored=restoreWorkRevision(next,0)!
    expect(restored.body).toBe(first.body)
    expect(restored.revisions).toHaveLength(3)
    expect(answerFromWork(restored).toolOutput?.kind).toBe('script')
  })
  it('modelo não devolveu edição: preserva exatamente o conteúdo',async()=>{
    const work=workFromAnswer(answer('ORIGINAL '.repeat(40)),'criar')!
    const fetcher=vi.fn(async()=>({ok:false} as Response))
    const result=await reviseAgentWork('personalize para jardinagem',work,snapshot,{},fetcher)
    expect(result.toolOutput?.kind==='script'&&result.toolOutput.body).toBe(work.body)
    expect(result.text).toContain('Mantive a versão anterior')
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('resposta editada vira versão nova sem falsificar pesquisa',async()=>{
    const work=workFromAnswer(answer('ORIGINAL '.repeat(40)),'criar')!
    const fetcher=vi.fn(async()=>({ok:true,json:async()=>({ok:true,body:'VERSÃO DE JARDINAGEM '.repeat(30),
      strategy:{audience:'jardineiros',approach:'prova de valor',rationale:'Demonstração visual'}})} as Response))
    const result=await reviseAgentWork('personalize para jardinagem',work,snapshot,{},fetcher)
    expect(result.toolOutput?.kind==='script'&&result.toolOutput.body).toContain('JARDINAGEM')
    expect(result.toolOutput?.kind==='script'&&result.toolOutput.strategy?.evidence).toBe('contextual')
  })
  it('classificação por modelo para continuação não explícita exige confiança',async()=>{
    const work=workFromAnswer(answer('A'.repeat(260)),'criar')!
    const fetcher=vi.fn(async()=>({ok:true,json:async()=>({ok:true,intent:'revise',confidence:.91})} as Response))
    expect(await classifyDocumentFollowup('E sobre o segundo cenário?',work,fetcher)).toBe(true)
    expect(await classifyDocumentFollowup('crie uma tarefa',work,fetcher)).toBe(false)
  })
  it('recuperação de conhecimento requer acesso',()=>{
    const s={...snapshot,playbooks:[{id:'p1',title:'Jardinagem serviço local',
      content:'Diagnóstico de necessidade de manutenção e contratação recorrente'}]} as WorkspaceSnapshot
    expect(retrieveAgentKnowledge('jardinagem manutenção',s,{canReadPlaybooks:false})).toEqual([])
    expect(retrieveAgentKnowledge('jardinagem manutenção',s,{canReadPlaybooks:true})[0]).toContain('Playbook')
  })
  it('roteia a frase da captura para edição do documento, nunca para ação CRM',async()=>{
    const work=workFromAnswer(answer('DOCUMENTO INICIAL '.repeat(20)),'crie roteiro')!
    const changed=answer('ROTEIRO PERSONALIZADO PARA JARDINAGEM '.repeat(20))
    changed.id='work-edit:test'
    const workEditor=vi.fn(async()=>changed)
    const result=await runAgentToolsV5('consegue personalizar com o contexto de jardinagem?',snapshot,
      {activeWork:work},{workEditor})
    expect(workEditor).toHaveBeenCalledOnce()
    expect(result?.toolOutput?.kind).toBe('script')
    expect(result?.id).toBe('work-edit:test')
  })
  it('pedido de tarefa não vira revisão do documento',async()=>{
    const work=workFromAnswer(answer('DOCUMENTO INICIAL '.repeat(20)),'crie roteiro')!
    const workEditor=vi.fn()
    const result=await runAgentToolsV5('crie uma tarefa para amanhã',snapshot,
      {activeWork:work},{workEditor,workClassifier:async()=>false})
    expect(workEditor).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })
  it('qualidade identifica fontes inexistentes e textos genéricos',()=>{
    const a=answer('Informe [Nome do cliente] e [tema do serviço]. '+ 'A'.repeat(240))
    expect(evaluateAgentWork(a).warnings.join(' ')).toContain('genéricos')
  })
})
