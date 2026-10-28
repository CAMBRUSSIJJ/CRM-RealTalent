import {describe,expect,it,vi} from 'vitest'
import {diagnoseScriptResearchRequest,parseResearchedScript,researchCommercialScript,resumeScriptResearchPrompt} from './realtalent-agent-v52-research'
import {runAgentToolsV5} from './realtalent-agent-v5-cognitive'
import type {WorkspaceSnapshot} from '../domain/types'
import type {GeneratedCommercialScript} from './realtalent-agent-v41-scripts'
const request='faça um script voltado para autônomos de prestação de serviço mais específico para jardineiros'
const draft={title:'Script',body:'Abertura para contato inicial',kind:'call',leadId:null,grounded:false,rationale:'rascunho'} as GeneratedCommercialScript
describe('Agent V5.2 — pesquisar antes do script',()=>{
 it('detecta que a captura de tela não diz se o jardineiro é cliente ou vendedor',()=>{
   const result=diagnoseScriptResearchRequest(request)
   expect(result.targeted).toBe(true)
   expect(result.missingPerspective).toBe(true)
   expect(result.question).toContain('PARA')
 })
 it('não bloqueia um roteiro genérico sem segmento específico',()=>{
   expect(diagnoseScriptResearchRequest('crie um roteiro de ligação comercial').missingPerspective).toBe(false)
 })
 it('aceita contexto com serviço explicitamente informado',()=>{
   const d=diagnoseScriptResearchRequest('crie um roteiro para um jardineiro conseguir clientes de manutenção de jardins')
   expect(d.targeted).toBe(true)
   expect(d.missingPerspective).toBe(false)
 })
 it('distingue análise contextual de pesquisa com fontes verificáveis',()=>{
   const model={ok:true,body:'Texto com análise específica '.repeat(12),strategy:{audience:'jardineiros',approach:'Prova visual',rationale:'O serviço pode ser demonstrado com portfólio.',alternatives:['Visita técnica','Indicação'],assumptions:['Segmento a confirmar']},researchStatus:'contextual',sources:[{title:'Inventado',url:'https://example.com'}]}
   expect(parseResearchedScript(model)?.strategy.sources).toEqual([])
   expect(parseResearchedScript(model)?.strategy.evidence).toBe('contextual')
   const confirmed=parseResearchedScript({...model,researchStatus:'external',sources:[{title:'Guia',url:'https://support.google.com/business/answer/9157481'}]})
   expect(confirmed?.strategy.sources).toHaveLength(1)
 })
 it('não aceita estratégia vazia ou fonte com esquema inseguro',()=>{
   expect(parseResearchedScript({ok:true,body:'x'.repeat(300),strategy:{}})).toBeNull()
   const r=parseResearchedScript({ok:true,body:'x'.repeat(300),strategy:{approach:'A',rationale:'B'},researchStatus:'external',sources:[{title:'local',url:'http://127.0.0.1/admin'},{title:'ok',url:'https://example.com'}]})
   expect(r?.strategy.sources).toHaveLength(1)
 })
 it('retoma a solicitação após a pergunta estratégica sem exigir repetir o script',async()=>{
   const transcript=`Usuário: ${request}\nRealTalent: Antes do roteiro: precisamos definir a estratégia. Você quer vender algo para os jardineiros?`
   const completed=resumeScriptResearchPrompt('quero vender meu serviço de marketing para jardineiros autônomos',transcript)
   expect(completed).toContain('faça um script')
   expect(diagnoseScriptResearchRequest(completed).missingPerspective).toBe(false)
   const snapshot={workspace:{id:'test',role:'member'},leads:[],stages:[],contacts:[],activities:[],events:[]} as unknown as WorkspaceSnapshot
   const answer=await runAgentToolsV5('quero vender meu serviço de marketing para jardineiros autônomos',snapshot,{conversationContext:transcript},{
     researcher:async()=>({body:'Roteiro comercial especializado '.repeat(14),strategy:{
       audience:'jardineiros autônomos',approach:'valor do serviço',rationale:'oferta e público definidos',
       alternatives:['prova de serviço','diagnóstico'],assumptions:[],evidence:'contextual',sources:[],
     }}),
     refiner:async()=>null,
   })
   expect(answer?.toolOutput?.kind).toBe('script')
   expect(answer?.toolOutput?.kind==='script'?answer.toolOutput.strategy?.approach:null).toBe('valor do serviço')
 })
 it('não carrega pedido antigo quando usuário mudou de assunto',()=>{
   const transcript=`Usuário: ${request}\nRealTalent: Antes do roteiro: precisamos definir a estratégia.\nUsuário: como vai o pipeline?\nRealTalent: Resumo`
   expect(resumeScriptResearchPrompt('quero ver minhas metas',transcript)).toBe('quero ver minhas metas')
 })
 it('não faz chamada de pesquisa quando falta informação essencial',async()=>{
   const fetcher=vi.fn()
   expect(await researchCommercialScript(request,draft,[],fetcher as unknown as typeof fetch)).toBeNull()
   expect(fetcher).not.toHaveBeenCalled()
 })
})
